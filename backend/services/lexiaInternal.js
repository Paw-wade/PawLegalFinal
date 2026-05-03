const fs = require('fs').promises;
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, '../data/lexia');

const STOPWORDS = new Set(
  `le la les un une des du de et ou en au aux à a pour par dans sur est son sa ses ce ces cet cette qui que dont pas plus très tout toute
  avec sans sous chez comme lors dès lorsque mais donc ainsi même aussi bien`.split(/\s+/)
);

let chunkCache = { loadedAt: 0, chunks: [], fileMtimes: {} };
const CACHE_MS = 45_000;

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokenize(s) {
  return normalizeText(s)
    .split(/\W+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Découpe un texte en blocs (~800 car.) pour indexation.
 */
function chunkText(fullText, sourceTitle) {
  const parts = fullText.split(/\n{2,}/);
  const chunks = [];
  let buf = '';
  for (const p of parts) {
    const piece = p.trim();
    if (!piece) continue;
    if (buf.length + piece.length > 900) {
      if (buf) chunks.push({ text: buf.trim(), sourceTitle });
      buf = piece;
    } else {
      buf = buf ? `${buf}\n\n${piece}` : piece;
    }
  }
  if (buf.trim()) chunks.push({ text: buf.trim(), sourceTitle });
  return chunks;
}

async function collectMarkdownFiles(dir) {
  const out = [];
  async function walk(d) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        await walk(p);
      } else if (/\.(md|txt)$/i.test(e.name)) {
        out.push(p);
      }
    }
  }
  await walk(dir);
  return out;
}

async function loadAllChunks(knowledgeDir) {
  const files = await collectMarkdownFiles(knowledgeDir);
  const all = [];
  for (const filePath of files) {
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    const rel = path.relative(knowledgeDir, filePath);
    const title = rel.replace(/\\/g, '/');
    const sub = chunkText(raw, title);
    for (const c of sub) {
      all.push({
        file: title,
        text: c.text,
        tokens: tokenize(c.text),
      });
    }
  }
  return all;
}

async function getChunks(knowledgeDir) {
  const now = Date.now();
  if (chunkCache.chunks.length && now - chunkCache.loadedAt < CACHE_MS) {
    return chunkCache.chunks;
  }
  const chunks = await loadAllChunks(knowledgeDir);
  chunkCache = { loadedAt: now, chunks, fileMtimes: {} };
  return chunks;
}

/**
 * Score simple (recouvrement mots requête / chunk).
 */
function scoreChunk(queryTokens, chunk) {
  if (!queryTokens.length) return 0;
  const set = new Set(chunk.tokens);
  let s = 0;
  for (const t of queryTokens) {
    if (set.has(t)) s += 1;
  }
  const density = s / Math.sqrt(chunk.tokens.length + 1);
  return s * 2 + density;
}

function buildQueryFromMessages(trimmedMessages) {
  const tail = trimmedMessages.slice(-8);
  return tail.map((m) => m.content).join('\n').slice(0, 12000);
}

/**
 * Recherche + réponse markdown sans appel LLM externe.
 */
async function searchAndCompose(trimmedMessages, knowledgeDir) {
  const queryText = buildQueryFromMessages(trimmedMessages);
  const queryTokens = tokenize(queryText);
  const chunks = await getChunks(knowledgeDir);

  if (!chunks.length) {
    return {
      text:
        '## Base interne LEXIA\n\nAucun document indexé pour le moment.\n\n' +
        `Ajoutez des fichiers **.md** ou **.txt** dans le dossier :\n\n\`${knowledgeDir}\`\n\n` +
        'Puis relancez une question : les extraits pertinents seront proposés ici (sans clé API).',
      sources: [],
    };
  }

  const scored = chunks
    .map((c) => ({ ...c, score: scoreChunk(queryTokens, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  if (!scored.length) {
    const preview = chunks.slice(0, 3).map((c) => `- **${c.file}** (extrait) : ${c.text.slice(0, 160)}…`);
    return {
      text:
        '## Base interne LEXIA\n\nAucun extrait ne correspond clairement aux termes de votre question.\n\n' +
        '**Suggestions :** reformulez avec des mots présents dans vos documents, ou enrichissez la base.\n\n' +
        '### Aperçu des premiers documents indexés\n' +
        preview.join('\n'),
      sources: chunks.slice(0, 5).map((c) => ({ file: c.file, score: 0 })),
    };
  }

  const lines = [];
  lines.push('## Recherche — base documentaire interne');
  lines.push('');
  lines.push(
    '_Réponse produite **sans modèle cloud** : extraits classés par pertinence à partir de vos fichiers `.md` / `.txt`._'
  );
  lines.push('');
  lines.push('### Extraits');
  lines.push('');
  scored.forEach((c, i) => {
    lines.push(`**${i + 1}. ${c.file}** _(score ${c.score.toFixed(1)})_`);
    lines.push('');
    lines.push(c.text.length > 1200 ? `${c.text.slice(0, 1200)}…` : c.text);
    lines.push('');
    lines.push('---');
    lines.push('');
  });
  lines.push('### Note');
  lines.push('');
  lines.push(
    'Vérifiez les sources sur le serveur. Pour une synthèse rédigée par un grand modèle (avec citations web), configurez **ANTHROPIC_API_KEY** et le mode **auto** ou **anthropic**.'
  );

  return {
    text: lines.join('\n'),
    sources: scored.map((c) => ({ file: c.file, score: Number(c.score.toFixed(2)) })),
  };
}

function getKnowledgeDir() {
  return process.env.LEXIA_KNOWLEDGE_DIR
    ? path.resolve(process.env.LEXIA_KNOWLEDGE_DIR)
    : DEFAULT_DIR;
}

module.exports = {
  searchAndCompose,
  getKnowledgeDir,
  invalidateCache: () => {
    chunkCache = { loadedAt: 0, chunks: [], fileMtimes: {} };
  },
};

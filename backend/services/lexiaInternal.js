const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DEFAULT_DIR = '/root/adapapers/backend/lexia/CAA';

const STOPWORDS = new Set(
  `le la les un une des du de et ou en au aux à a pour par dans sur est son sa ses ce ces cet cette qui que dont pas plus très tout toute
  avec sans sous chez comme lors dès lorsque mais donc ainsi même aussi bien`.split(/\s+/)
);

let chunkCache = { loadedAt: 0, chunks: [], fileMtimes: {} };
const CACHE_MS = 45_000;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

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

function extractDateFromText(input) {
  const s = String(input || '');
  const numeric = s.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (numeric) {
    const d = Number(numeric[1]);
    const m = Number(numeric[2]);
    const y = Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

function inferJuridiction(file, text) {
  const f = normalizeText(file);
  const t = normalizeText(text).slice(0, 4000);
  if (f.includes('conseil-etat') || f.includes('/ce/') || /\bconseil d.?etat\b/.test(t)) return 'CE';
  if (f.includes('/caa/') || /\bcour administrative d.?appel\b/.test(t) || /\bcaa\b/.test(t)) return 'CAA';
  if (f.includes('/ta/') || /\btribunal administratif\b/.test(t) || /\bta\b/.test(t)) return 'TA';
  if (f.includes('cass') || /\bcour de cassation\b/.test(t)) return 'Cassation';
  return 'Autre';
}

function inferContentType(file, text) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.xml') return 'xml';
  if (ext === '.md') return 'md';
  if (ext === '.txt') return 'txt';
  const t = normalizeText(text);
  if (t.includes('oqtf')) return 'jurisprudence';
  return 'document';
}

function extractDecisionNumber(text) {
  const s = String(text || '');
  const m = s.match(/n[°o]\s*[:\-]?\s*([a-z0-9\-./]{4,})/i);
  return m ? m[1].toUpperCase() : null;
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

function collectMarkdownFiles(dir) {
  const files = [];

  function scan(d) {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of entries) {
      const full = path.join(d, item.name);

      if (item.isDirectory()) {
        scan(full);
        continue;
      }

      const ext = path.extname(item.name).toLowerCase();
      if (['.xml', '.md', '.txt'].includes(ext)) {
        files.push(full);
      }
    }
  }

  scan(dir);
  return files;
}

async function loadAllChunks(knowledgeDir) {
  const files = await collectMarkdownFiles(knowledgeDir);
  const all = [];
  for (const filePath of files) {
    let raw;
    try {
      raw = await fsp.readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    const rel = path.relative(knowledgeDir, filePath);
    const title = rel.replace(/\\/g, '/');
    const isXml = /\.xml$/i.test(filePath);
    const normalized = isXml
      ? raw
          .replace(/<\?xml[\s\S]*?\?>/gi, ' ')
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, ' $1 ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
      : raw;
    const sub = chunkText(normalized, title);
    for (const c of sub) {
      const dateIso = extractDateFromText(c.text);
      all.push({
        file: title,
        text: c.text,
        tokens: tokenize(c.text),
        metadata: {
          juridiction: inferJuridiction(title, c.text),
          decisionNumber: extractDecisionNumber(c.text),
          dateIso,
          contentType: inferContentType(title, c.text),
          ext: path.extname(title).replace('.', '').toLowerCase() || 'txt',
        },
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

function legalBoost(queryText, chunk) {
  const q = normalizeText(queryText);
  let boost = 0;
  if (q.includes('jurisprudence') || q.includes('decision') || q.includes('arret')) boost += 0.8;
  if (q.includes('oqtf') && normalizeText(chunk.text).includes('oqtf')) boost += 1.2;
  if (q.includes('ce') && chunk.metadata?.juridiction === 'CE') boost += 0.8;
  if (q.includes('caa') && chunk.metadata?.juridiction === 'CAA') boost += 0.8;
  if (q.includes('ta') && chunk.metadata?.juridiction === 'TA') boost += 0.8;
  if (chunk.metadata?.decisionNumber) boost += 0.4;
  if (chunk.metadata?.dateIso) boost += 0.2;
  return boost;
}

function buildQueryFromMessages(trimmedMessages) {
  const tail = trimmedMessages.slice(-8);
  return tail.map((m) => m.content).join('\n').slice(0, 12000);
}

function buildSnippet(text, queryTokens) {
  const src = String(text || '');
  if (!src) return '';
  if (!queryTokens.length) return src.slice(0, 260);
  const normalized = normalizeText(src);
  let best = 0;
  for (const t of queryTokens) {
    const idx = normalized.indexOf(t);
    if (idx >= 0) {
      best = idx;
      break;
    }
  }
  const start = Math.max(0, best - 100);
  const end = Math.min(src.length, start + 360);
  const snippet = src.slice(start, end).trim();
  return start > 0 ? `...${snippet}` : snippet;
}

function toIntOrDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function isWithinDateRange(dateIso, from, to) {
  if (!dateIso) return false;
  if (from && dateIso < from) return false;
  if (to && dateIso > to) return false;
  return true;
}

async function searchKnowledge({
  queryText = '',
  messages = [],
  knowledgeDir,
  filters = {},
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
} = {}) {
  const startedAt = Date.now();
  const dir = knowledgeDir || getKnowledgeDir();
  const effectiveQuery = queryText || buildQueryFromMessages(Array.isArray(messages) ? messages : []);
  const queryTokens = tokenize(effectiveQuery);
  const chunks = await getChunks(dir);

  if (!chunks.length) {
    return {
      query: effectiveQuery,
      knowledgeDir: dir,
      total: 0,
      page: 1,
      totalPages: 1,
      tookMs: Date.now() - startedAt,
      hits: [],
    };
  }

  const normalizedLimit = Math.min(MAX_PAGE_SIZE, toIntOrDefault(limit, DEFAULT_PAGE_SIZE));
  const normalizedPage = toIntOrDefault(page, 1);
  const filterJuridiction = String(filters.juridiction || '').trim();
  const filterContentType = String(filters.contentType || '').trim().toLowerCase();
  const filterDateFrom = String(filters.dateFrom || '').trim();
  const filterDateTo = String(filters.dateTo || '').trim();

  const filtered = chunks.filter((chunk) => {
    const md = chunk.metadata || {};
    if (filterJuridiction && md.juridiction !== filterJuridiction) return false;
    if (filterContentType && String(md.contentType || '').toLowerCase() !== filterContentType) return false;
    if (filterDateFrom || filterDateTo) {
      if (!isWithinDateRange(md.dateIso, filterDateFrom || null, filterDateTo || null)) return false;
    }
    return true;
  });

  const scored = filtered
    .map((chunk) => {
      const lexical = scoreChunk(queryTokens, chunk);
      const legal = legalBoost(effectiveQuery, chunk);
      return {
        ...chunk,
        score: lexical + legal,
        lexicalScore: lexical,
        legalBoost: legal,
      };
    })
    .filter((item) => queryTokens.length === 0 || item.score > 0)
    .sort((a, b) => b.score - a.score);

  const total = scored.length;
  const totalPages = Math.max(1, Math.ceil(total / normalizedLimit));
  const safePage = Math.min(Math.max(1, normalizedPage), totalPages);
  const offset = (safePage - 1) * normalizedLimit;

  const hits = scored.slice(offset, offset + normalizedLimit).map((item) => ({
    file: item.file,
    score: Number(item.score.toFixed(3)),
    lexicalScore: Number(item.lexicalScore.toFixed(3)),
    legalBoost: Number(item.legalBoost.toFixed(3)),
    snippet: buildSnippet(item.text, queryTokens),
    metadata: item.metadata,
  }));

  return {
    query: effectiveQuery,
    knowledgeDir: dir,
    total,
    page: safePage,
    totalPages,
    tookMs: Date.now() - startedAt,
    hits,
  };
}

/**
 * Recherche + réponse markdown sans appel LLM externe.
 */
async function searchAndCompose(trimmedMessages, knowledgeDir) {
  const queryText = buildQueryFromMessages(trimmedMessages);
  const chunks = await getChunks(knowledgeDir);

  if (!chunks.length) {
    return {
      text:
        '## Base interne LEXIA\n\nAucun document indexé pour le moment.\n\n' +
        `Ajoutez des fichiers **.md**, **.txt** ou **.xml** dans le dossier :\n\n\`${knowledgeDir}\`\n\n` +
        'Puis relancez une question : les extraits pertinents seront proposés ici (sans clé API).',
      sources: [],
    };
  }

  const searchResult = await searchKnowledge({
    queryText,
    knowledgeDir,
    page: 1,
    limit: 15,
  });
  const scored = (searchResult.hits || []).map((h) => ({
    file: h.file,
    score: h.score,
    text: h.snippet || '',
    metadata: h.metadata || {},
  }));

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
    '_Réponse produite **sans modèle cloud** : extraits classés par pertinence à partir de vos fichiers `.md` / `.txt` / `.xml`._'
  );
  lines.push('');
  lines.push('### Extraits');
  lines.push('');
  scored.forEach((c, i) => {
    const md = c.metadata || {};
    const tags = [md.juridiction, md.dateIso, md.decisionNumber ? `n° ${md.decisionNumber}` : null].filter(Boolean);
    lines.push(`**${i + 1}. ${c.file}** _(score ${Number(c.score || 0).toFixed(1)})${tags.length ? ` · ${tags.join(' · ')}` : ''}_`);
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
    sources: scored.map((c) => ({
      file: c.file,
      score: Number(Number(c.score || 0).toFixed(2)),
      metadata: c.metadata || {},
    })),
  };
}

function getKnowledgeDir() {
  const raw = (process.env.LEXIA_KNOWLEDGE_DIR || '').trim();
  if (!raw) return DEFAULT_DIR;

  if (path.isAbsolute(raw)) return path.resolve(raw);

  // Tolère les chemins relatifs lancés depuis des cwd différents (backend/, racine projet, etc.).
  const candidates = [
    path.resolve(raw),
    path.resolve(process.cwd(), raw),
    path.resolve(__dirname, '..', raw),
    path.resolve(__dirname, '..', '..', raw),
    path.resolve(path.sep, raw),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    } catch {
      // ignore et tente le candidat suivant
    }
  }

  // Fallback explicite pour visibilité dans /config si le dossier n'existe pas encore.
  return path.resolve(raw);
}

module.exports = {
  searchKnowledge,
  searchAndCompose,
  getKnowledgeDir,
  getKnowledgeStats: async () => {
    const knowledgeDir = getKnowledgeDir();
    const files = await collectMarkdownFiles(knowledgeDir);
    const byExt = { md: 0, txt: 0, xml: 0 };
    for (const f of files) {
      const ext = path.extname(f).toLowerCase().replace('.', '');
      if (ext === 'md' || ext === 'txt' || ext === 'xml') byExt[ext] += 1;
    }
    return { knowledgeDir, total: files.length, byExt };
  },
  invalidateCache: () => {
    chunkCache = { loadedAt: 0, chunks: [], fileMtimes: {} };
  },
};

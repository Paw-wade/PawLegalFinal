const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

/** VPS Linux — sans résolution win32 pour éviter `/root/…` → `C:\\root\\…`. */
const DEFAULT_DIR_POSIX = '/root/adapapers/backend/lexia/CAA';

/** Windows : corpus local du dépôt (pas le chemin du serveur). */
const DEFAULT_DIR_WINDOWS = path.join(__dirname, '..', 'data', 'lexia');

/** Extensions indexées récursivement (texte brut, XML aplati, PDF / Word extraits). */
const KNOWLEDGE_FILE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.xml',
  '.pdf',
  '.doc',
  '.docx',
]);

const STOPWORDS = new Set(
  `le la les un une des du de et ou en au aux à a pour par dans sur est son sa ses ce ces cet cette qui que dont pas plus très tout toute
  avec sans sous chez comme lors dès lorsque mais donc ainsi même aussi bien`.split(/\s+/)
);

let chunkCache = { loadedAt: 0, chunks: [], fileMtimes: {} };
const CACHE_MS = 45_000;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

/** Nombre max de fichiers chargés pour l’index mémoire (évite OOM sur corpus massif, ex. centaines de milliers de XML). */
function getLexiaIndexMaxFiles() {
  const n = Number(process.env.LEXIA_INDEX_MAX_FILES ?? '12000');
  if (!Number.isFinite(n) || n < 50) return 12000;
  return Math.min(Math.floor(n), 999999);
}

/** Plafond de blocs indexés en RAM pour une requête / invalidation du cache. */
function getLexiaMaxTotalChunks() {
  const n = Number(process.env.LEXIA_MAX_TOTAL_CHUNKS ?? '70000');
  if (!Number.isFinite(n) || n < 2000) return 70000;
  return Math.min(Math.floor(n), 2_000_000);
}

/** Tronque le texte extrait par fichier (PDF/XML énormes). */
function getLexiaMaxExtractCharsPerFile() {
  const n = Number(process.env.LEXIA_MAX_EXTRACT_CHARS ?? '380000');
  if (!Number.isFinite(n) || n < 8000) return 380000;
  return Math.min(Math.floor(n), 5_000_000);
}

let truncationFilesWarned = false;
let truncationChunksWarned = false;

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
  if (ext === '.pdf') return 'pdf';
  if (ext === '.doc') return 'doc';
  if (ext === '.docx') return 'docx';
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

function stripXmlToText(xmlRaw) {
  return String(xmlRaw || '')
    .replace(/<\?xml[\s\S]*?\?>/gi, ' ')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\u0000/g, ' ')
    .trim();
}

/**
 * Compte tous les fichiers indexables sur disque sans allouer la liste des chemins (évite OOM sur très gros corpus).
 */
function walkCountKnowledgeFiles(dir) {
  const byExt = { md: 0, txt: 0, xml: 0, pdf: 0, doc: 0, docx: 0, other: 0 };
  let total = 0;

  function scan(d) {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));

    for (const item of entries) {
      const full = path.join(d, item.name);

      if (item.isDirectory()) {
        scan(full);
        continue;
      }

      const ext = path.extname(item.name).toLowerCase();
      if (!KNOWLEDGE_FILE_EXTENSIONS.has(ext)) continue;
      total++;
      const key = ext.slice(1) || 'other';
      if (Object.prototype.hasOwnProperty.call(byExt, key)) byExt[key] += 1;
      else byExt.other += 1;
    }
  }

  scan(dir);
  return { total, byExt };
}

/**
 * Liste jusqu’à LEXIA_INDEX_MAX_FILES chemins (parcours profondeur d’abord, noms triés par dossier).
 * Ne matérialise jamais tout le corpus.
 */
function collectKnowledgeFilesForIndex(dir) {
  const cap = getLexiaIndexMaxFiles();
  const out = [];

  function scan(d) {
    if (out.length >= cap) return;

    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));

    for (const item of entries) {
      if (out.length >= cap) return;
      const full = path.join(d, item.name);

      if (item.isDirectory()) {
        scan(full);
        continue;
      }

      const ext = path.extname(item.name).toLowerCase();
      if (KNOWLEDGE_FILE_EXTENSIONS.has(ext)) out.push(full);
    }
  }

  scan(dir);

  if (out.length >= cap && !truncationFilesWarned) {
    truncationFilesWarned = true;
    console.warn(
      `[lexia] Index plafonné à LEXIA_INDEX_MAX_FILES=${cap}. ` +
        `Le disque peut contenir davantage de fichiers ; seuls les ${cap} premiers (ordre de parcours) sont chargés en mémoire.`
    );
  }

  return out;
}

/**
 * Extrait le texte utile selon le type de fichier (UTF-8, XML aplati, PDF, Word).
 */
async function extractPlainTextFromKnowledgeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    switch (ext) {
      case '.pdf': {
        const pdfParse = require('pdf-parse');
        const buf = await fsp.readFile(filePath);
        const res = await pdfParse(buf);
        return String(res.text || '')
          .replace(/\u0000/g, ' ')
          .trim();
      }
      case '.docx': {
        const mammoth = require('mammoth');
        const r = await mammoth.extractRawText({ path: filePath });
        return String(r.value || '').trim();
      }
      case '.doc': {
        const WordExtractor = require('word-extractor');
        const extractor = new WordExtractor();
        const doc = await extractor.extract(filePath);
        return String(doc.getBody() || '').trim();
      }
      case '.xml': {
        const raw = await fsp.readFile(filePath, 'utf8');
        return stripXmlToText(raw);
      }
      case '.md':
      case '.txt': {
        const raw = await fsp.readFile(filePath, 'utf8');
        return String(raw || '').trim();
      }
      default:
        return '';
    }
  } catch (err) {
    console.warn(`[lexia] Fichier ignoré (${path.basename(filePath)}): ${err.message}`);
    return '';
  }
}

async function loadAllChunks(knowledgeDir) {
  const files = collectKnowledgeFilesForIndex(knowledgeDir);
  const maxChunks = getLexiaMaxTotalChunks();
  const maxChars = getLexiaMaxExtractCharsPerFile();
  const all = [];

  for (const filePath of files) {
    if (all.length >= maxChunks) break;

    let normalized = await extractPlainTextFromKnowledgeFile(filePath);
    if (!normalized.trim()) continue;
    if (normalized.length > maxChars) normalized = normalized.slice(0, maxChars);

    const rel = path.relative(knowledgeDir, filePath);
    const title = rel.replace(/\\/g, '/');
    const sub = chunkText(normalized, title);
    for (const c of sub) {
      if (all.length >= maxChunks) break;
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

  if (all.length >= maxChunks && files.length && !truncationChunksWarned) {
    truncationChunksWarned = true;
    console.warn(
      `[lexia] LEXIA_MAX_TOTAL_CHUNKS=${maxChunks} atteint ; des fichiers ou parties du corpus ne sont pas chargés dans cette passe.`
    );
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

  const filterJuridiction = String(filters.juridiction || '').trim();
  const filterContentType = String(filters.contentType || '').trim().toLowerCase();
  const filterDateFrom = String(filters.dateFrom || '').trim();
  const filterDateTo = String(filters.dateTo || '').trim();
  const hasFilters = Boolean(filterJuridiction || filterContentType || filterDateFrom || filterDateTo);

  if (!queryTokens.length && !hasFilters) {
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
  const dir = knowledgeDir || getKnowledgeDir();
  const queryText = buildQueryFromMessages(trimmedMessages);

  const indexedPaths = collectKnowledgeFilesForIndex(dir);
  if (!indexedPaths.length) {
    return {
      text:
        '## Base interne LEXIA\n\nAucun document indexé pour le moment.\n\n' +
        `Ajoutez des fichiers **.md**, **.txt**, **.xml**, **.pdf**, **.doc** ou **.docx** dans le dossier :\n\n\`${dir}\`\n\n` +
        'Puis relancez une question : les extraits pertinents seront proposés ici (sans clé API).',
      sources: [],
    };
  }

  const searchResult = await searchKnowledge({
    queryText,
    knowledgeDir: dir,
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
    const preview = indexedPaths.slice(0, 3).map((fp) => {
      const rel = path.relative(dir, fp).replace(/\\/g, '/');
      return `- **${rel}**`;
    });
    return {
      text:
        '## Base interne LEXIA\n\nAucun extrait ne correspond clairement aux termes de votre question.\n\n' +
        '**Suggestions :** reformulez avec des mots présents dans vos documents, ou enrichissez la base.\n\n' +
        '### Fichiers pris en compte (aperçu)\n' +
        preview.join('\n'),
      sources: indexedPaths.slice(0, 5).map((fp) => ({
        file: path.relative(dir, fp).replace(/\\/g, '/'),
        score: 0,
      })),
    };
  }

  const lines = [];
  lines.push('## Recherche — base documentaire interne');
  lines.push('');
  lines.push(
    '_Réponse produite **sans modèle cloud** : extraits classés par pertinence à partir de vos fichiers `.md` / `.txt` / `.xml` / `.pdf` / `.doc` / `.docx`._'
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

/** Chemin POSIX absolu (/…) sans lettre de lecteur Windows. */
function isPosixStyleAbsolute(p) {
  return typeof p === 'string' && p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p);
}

function defaultKnowledgeDirForPlatform() {
  return process.platform === 'win32' ? DEFAULT_DIR_WINDOWS : DEFAULT_DIR_POSIX;
}

let posixOnWindowsWarned = false;

function getKnowledgeDir() {
  const raw = (process.env.LEXIA_KNOWLEDGE_DIR || '').trim();
  if (!raw) return defaultKnowledgeDirForPlatform();

  /* Sous Windows, LEXIA=/root/… (copié du VPS) deviendrait C:\\root\\… via path.resolve — on l’évite. */
  if (process.platform === 'win32' && isPosixStyleAbsolute(raw)) {
    if (!posixOnWindowsWarned) {
      posixOnWindowsWarned = true;
      console.warn(
        `[lexia] LEXIA_KNOWLEDGE_DIR="${raw}" est un chemin Linux ; sous Windows il serait résolu sur le disque système ` +
          `(ex. C:\\root\\…). Utilisation de : "${DEFAULT_DIR_WINDOWS}". ` +
          `Définissez LEXIA_KNOWLEDGE_DIR sur un chemin Windows absolu pour un autre corpus.`
      );
    }
    return DEFAULT_DIR_WINDOWS;
  }

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
    const walk = walkCountKnowledgeFiles(knowledgeDir);
    const indexedFilesCap = getLexiaIndexMaxFiles();
    return {
      knowledgeDir,
      total: walk.total,
      byExt: walk.byExt,
      indexedFilesCap,
      indexTruncated: walk.total > indexedFilesCap,
      maxTotalChunks: getLexiaMaxTotalChunks(),
      maxExtractCharsPerFile: getLexiaMaxExtractCharsPerFile(),
    };
  },
  invalidateCache: () => {
    chunkCache = { loadedAt: 0, chunks: [], fileMtimes: {} };
    truncationFilesWarned = false;
    truncationChunksWarned = false;
  },
};

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { getInternalModeLegalFooter } = require('./lexiaLegalCharter');

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

/**
 * Nombre max de fichiers chargés pour l’index mémoire (évite OOM sur corpus massif).
 * Variable vide ou `unlimited|max|-1|0` = pas de plafond effectif (`Infinity` en interne).
 * À partir d’un nombre : plafond explicite (min 50 si une petite valeur est donnée pour éviter les typos).
 */
function getLexiaIndexMaxFiles() {
  const raw = process.env.LEXIA_INDEX_MAX_FILES;
  if (raw === undefined) return 12000;
  const trimmed = String(raw).trim();
  if (trimmed === '') return Number.POSITIVE_INFINITY;
  const lower = trimmed.toLowerCase();
  if (
    lower === 'unlimited' ||
    lower === 'max' ||
    lower === 'all' ||
    lower === 'infinity' ||
    trimmed === '-1'
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY;
  if (n === 0) return Number.POSITIVE_INFINITY;
  if (n < 50) return 12000;
  return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
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

/** Fichiers source plus gros ne sont pas lus en entier (évite OOM / 500). défaut 15 Mo. */
function getLexiaMaxRawBytesPerFile() {
  const n = Number(process.env.LEXIA_MAX_RAW_FILE_BYTES ?? String(15 * 1024 * 1024));
  if (!Number.isFinite(n) || n < 256 * 1024) return 15 * 1024 * 1024;
  return Math.min(Math.floor(n), 80 * 1024 * 1024);
}

/**
 * Si > 0 et que la liste indexée dépasse ce nombre, on renvoie une réponse texte au lieu de charger
 * tout en RAM (évite crash / `POST /api/lexia - -` dans Morgan). Désactivé par défaut.
 * Ex. : LEXIA_ENFORCE_SOFT_CAP=12000
 */
function getLexiaEnforceSoftCap() {
  const n = Number(process.env.LEXIA_ENFORCE_SOFT_CAP);
  if (!Number.isFinite(n) || n < 500) return 0;
  return Math.min(Math.floor(n), 500_000);
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
  if (f.includes('conseil-etat') || f.startsWith('ce/') || f.includes('/ce/') || /\bconseil d.?etat\b/.test(t)) {
    return 'CE';
  }
  if (f.startsWith('caa/') || f.includes('/caa/') || /\bcour administrative d.?appel\b/.test(t) || /\bcaa\b/.test(t)) {
    return 'CAA';
  }
  if (f.startsWith('ta/') || f.includes('/ta/') || /\btribunal administratif\b/.test(t) || /\bta\b/.test(t)) return 'TA';
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

/** N° plausible (évite « NOUVELLE-AQUITAINE » capté après « n° » dans le corps). */
function looksLikeDecisionNumber(s) {
  const t = String(s || '').trim();
  if (t.length < 4 || t.length > 48) return false;
  if (!/\d/.test(t)) return false;
  if (/^(nouvelle|nvelle|hauts|bas|grand|petit|ile|pays|provence|bourgogne|aquitaine|occitanie|normandie|bretagne|alsace|lorraine|franche|centre|auvergne|rhone|languedoc|corse|guadeloupe|martinique|reunion|mayotte|guyane)/i.test(t) && !/\d{2}[A-Z]\d/i.test(t)) {
    return false;
  }
  return true;
}

function extractDecisionNumber(text) {
  const s = String(text || '').slice(0, 12000);
  const p1 = s.match(/\bn[°o]\s*[:\-]?\s*(\d{2}[A-Z]{1,4}\d{4,})\b/i);
  if (p1 && looksLikeDecisionNumber(p1[1])) return String(p1[1]).replace(/\s+/g, ' ').trim().toUpperCase();
  const p2 = s.match(/\bpourvoi\s+n[°o]\s*([A-Z]?\d[\d.\s-]{3,40})\b/i);
  if (p2 && looksLikeDecisionNumber(p2[1])) return p2[1].replace(/\s+/g, ' ').trim().toUpperCase();
  const p3 = s.match(/\breq[uêe]te\s+n[°o]\s*([A-Z]?\d[\d.\s-]{3,40})\b/i);
  if (p3 && looksLikeDecisionNumber(p3[1])) return p3[1].replace(/\s+/g, ' ').trim().toUpperCase();
  const loose = s.match(/n[°o]\s*[:\-]?\s*([A-Z0-9][A-Z0-9.\-/]{3,40})\b/i);
  if (loose && looksLikeDecisionNumber(loose[1])) return loose[1].toUpperCase();
  return null;
}

/**
 * Complète n° / date depuis les noms du type DCA_21NC01540_20220428.xml (courants dans le corpus CAA).
 * Quand le nom de fichier suit ce schéma, il fait foi (priorité sur l’extraction plein texte, souvent bruitée).
 */
function enrichMetadataFromXmlBasename(relTitle, meta) {
  const base = path.basename(String(relTitle || ''));
  const m = base.match(/^([A-Za-z]{2,8})_(\d{2}[A-Z0-9]+)_(\d{8})\.xml$/i);
  if (!m) {
    const dn = meta.decisionNumber && looksLikeDecisionNumber(meta.decisionNumber) ? meta.decisionNumber : null;
    return { ...meta, decisionNumber: dn };
  }
  const y = m[3].slice(0, 4);
  const mo = m[3].slice(4, 6);
  const d = m[3].slice(6, 8);
  const iso = `${y}-${mo}-${d}`;
  const num = m[2].toUpperCase();
  return {
    ...meta,
    decisionNumber: num,
    dateIso: iso,
  };
}

/** Libellé de référence stable à partir du chemin (pour API lecture fichier). */
function buildKnowledgeReferenceLabelFromPath(relFile) {
  const rel = String(relFile || '').replace(/\\/g, '/');
  const base = path.basename(rel);
  const m = base.match(/^([A-Za-z]{2,8})_(\d{2}[A-Z0-9]+)_(\d{8})\.xml$/i);
  const jur = inferJuridiction(rel, '');
  if (m) {
    const num = m[2].toUpperCase();
    const y = m[3].slice(0, 4);
    const mo = m[3].slice(4, 6);
    const day = m[3].slice(6, 8);
    const dateStr = `${day}/${mo}/${y}`;
    const j = jur && jur !== 'Autre' ? jur : '';
    const parts = [];
    if (j) parts.push(j);
    parts.push(`n° ${num}`);
    parts.push(dateStr);
    return parts.join(' · ');
  }
  return base
    .replace(/\.(xml|md|txt)$/i, '')
    .replace(/_/g, ' ')
    .trim();
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
 * Liste les chemins (parcours profondeur d’abord, noms triés par dossier), jusqu’au plafond
 * LEXIA_INDEX_MAX_FILES s’il est défini ou numérique.
 * Ne matérialise jamais tout l’arborescence en mémoire par effet du parcours.
 */
function collectKnowledgeFilesForIndex(dir) {
  const cap = getLexiaIndexMaxFiles();
  const out = [];

  function scan(d) {
    if (Number.isFinite(cap) && out.length >= cap) return;

    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));

    for (const item of entries) {
      if (Number.isFinite(cap) && out.length >= cap) return;
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

  if (Number.isFinite(cap) && out.length >= cap && !truncationFilesWarned) {
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
async function extractPlainTextFromKnowledgeBuffer(buf, extRaw) {
  const ext = String(extRaw || '').toLowerCase();
  if (!Buffer.isBuffer(buf) || !buf.length) return '';
  try {
    switch (ext) {
      case '.pdf': {
        const pdfParse = require('pdf-parse');
        const res = await pdfParse(buf);
        return String(res.text || '')
          .replace(/\u0000/g, ' ')
          .trim();
      }
      case '.docx': {
        const mammoth = require('mammoth');
        const r = await mammoth.extractRawText({ buffer: buf });
        return String(r.value || '').trim();
      }
      case '.doc': {
        const WordExtractor = require('word-extractor');
        const extractor = new WordExtractor();
        const tmp = path.join(os.tmpdir(), `lexia-${Date.now()}-${Math.random().toString(36).slice(2)}.doc`);
        await fsp.writeFile(tmp, buf);
        try {
          const doc = await extractor.extract(tmp);
          return String(doc.getBody() || '').trim();
        } finally {
          await fsp.unlink(tmp).catch(() => {});
        }
      }
      case '.xml': {
        const raw = buf.toString('utf8');
        return stripXmlToText(raw);
      }
      case '.md':
      case '.txt': {
        const raw = buf.toString('utf8');
        return String(raw || '').trim();
      }
      default:
        return '';
    }
  } catch (err) {
    console.warn(`[lexia] Extraction impossible (${ext || 'sans extension'}): ${err.message}`);
    return '';
  }
}

async function extractPlainTextFromKnowledgeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let statSize = 0;
  try {
    statSize = (await fsp.stat(filePath)).size;
  } catch {
    return '';
  }
  const maxRaw = getLexiaMaxRawBytesPerFile();
  if (statSize > maxRaw) {
    console.warn(`[lexia] Fichier ignoré (>${maxRaw} octets): ${path.basename(filePath)}`);
    return '';
  }
  try {
    const buf = await fsp.readFile(filePath);
    return extractPlainTextFromKnowledgeBuffer(buf, ext);
  } catch (err) {
    console.warn(`[lexia] Fichier ignoré (${path.basename(filePath)}): ${err.message}`);
    return '';
  }
}

async function loadAllChunks(knowledgeDir) {
  try {
    const files = collectKnowledgeFilesForIndex(knowledgeDir);
    const maxChunks = getLexiaMaxTotalChunks();
    const maxChars = getLexiaMaxExtractCharsPerFile();
    const all = [];

    for (const filePath of files) {
      if (all.length >= maxChunks) break;

      try {
        let normalized = await extractPlainTextFromKnowledgeFile(filePath);
        if (!normalized.trim()) continue;
        if (normalized.length > maxChars) normalized = normalized.slice(0, maxChars);

        const rel = path.relative(knowledgeDir, filePath);
        const title = rel.replace(/\\/g, '/');
        const sub = chunkText(normalized, title);
        for (const c of sub) {
          if (all.length >= maxChunks) break;
          const dateIso = extractDateFromText(c.text);
          let decisionNumber = extractDecisionNumber(c.text);
          if (!looksLikeDecisionNumber(decisionNumber)) decisionNumber = null;
          const baseMeta = {
            juridiction: inferJuridiction(title, c.text),
            decisionNumber,
            dateIso,
            contentType: inferContentType(title, c.text),
            ext: path.extname(title).replace('.', '').toLowerCase() || 'txt',
          };
          const metadata =
            path.extname(title).toLowerCase() === '.xml'
              ? enrichMetadataFromXmlBasename(title, baseMeta)
              : baseMeta;
          all.push({
            file: title,
            text: c.text,
            tokens: tokenize(c.text),
            metadata,
          });
        }
      } catch (perFileErr) {
        console.warn(`[lexia] Index ignoré pour ${path.basename(filePath)}: ${perFileErr.message}`);
      }
    }

    if (all.length >= maxChunks && files.length && !truncationChunksWarned) {
      truncationChunksWarned = true;
      console.warn(
        `[lexia] LEXIA_MAX_TOTAL_CHUNKS=${maxChunks} atteint ; des fichiers ou parties du corpus ne sont pas chargés dans cette passe.`
      );
    }

    return all;
  } catch (err) {
    console.error('[lexia] loadAllChunks:', err.stack || err.message);
    return [];
  }
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
  const ct = Array.isArray(chunk?.tokens) ? chunk.tokens : tokenize(String(chunk?.text || ''));
  const set = new Set(ct);
  let s = 0;
  for (const t of queryTokens) {
    if (set.has(t)) s += 1;
  }
  const density = s / Math.sqrt(ct.length + 1);
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
  if (!Array.isArray(trimmedMessages)) return '';
  const tail = trimmedMessages.slice(-8);
  return tail
    .map((m) => {
      if (m == null || typeof m !== 'object') return '';
      const c = m.content;
      return typeof c === 'string' ? c : c == null ? '' : String(c);
    })
    .join('\n')
    .slice(0, 12000);
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

  const hits = scored.slice(offset, offset + normalizedLimit).map((item) => {
    const sc = Number(item.score);
    const lx = Number(item.lexicalScore);
    const lb = Number(item.legalBoost);
    return {
      file: item.file,
      score: Number((Number.isFinite(sc) ? sc : 0).toFixed(3)),
      lexicalScore: Number((Number.isFinite(lx) ? lx : 0).toFixed(3)),
      legalBoost: Number((Number.isFinite(lb) ? lb : 0).toFixed(3)),
      snippet: buildSnippet(item.text, queryTokens),
      metadata: item.metadata,
    };
  });

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
  try {
  const dir = knowledgeDir || getKnowledgeDir();
  const queryText = buildQueryFromMessages(trimmedMessages);

  const indexedPaths = collectKnowledgeFilesForIndex(dir);
  const softCap = getLexiaEnforceSoftCap();
  if (softCap > 0 && indexedPaths.length > softCap) {
    const cap = getLexiaIndexMaxFiles();
    const capLabel = Number.isFinite(cap) ? String(cap) : 'illimité';
    return {
      text:
        `## Index Lexia trop lourd pour cette requête\n\n` +
        `**${indexedPaths.length}** fichiers sont pris en compte (plafond d’index : **${capLabel}**), ` +
        `ce qui dépasse la limite de sécurité **LEXIA_ENFORCE_SOFT_CAP=${softCap}**.\n\n` +
        `Sans cette limite, le premier chargement peut faire **planter le process Node** (mémoire) ou couper la connexion — ` +
        `d’où une ligne de log du type \`POST /api/lexia - - ms - -\`.\n\n` +
        `**Actions possibles :**\n` +
        `- Baisser **LEXIA_INDEX_MAX_FILES** (ex. 8000–15000 en dev).\n` +
        `- Augmenter **LEXIA_ENFORCE_SOFT_CAP** ou le retirer seulement si la machine a assez de RAM.\n` +
        `- Augmenter **--max-old-space-size** au démarrage du backend.\n` + getInternalModeLegalFooter(),
      sources: [],
    };
  }
  if (indexedPaths.length > 12_000) {
    console.warn(
      `[lexia] ${indexedPaths.length} fichiers listés pour l’index — charge RAM/CPU très élevée au premier POST. ` +
        `En cas de crash ou de requête interrompue, baissez LEXIA_INDEX_MAX_FILES ou définissez LEXIA_ENFORCE_SOFT_CAP=12000.`
    );
  }

  if (!indexedPaths.length) {
    return {
      text:
        '## Base interne LEXIA\n\nAucun document indexé pour le moment.\n\n' +
        `Ajoutez des fichiers **.md**, **.txt**, **.xml**, **.pdf**, **.doc** ou **.docx** dans le dossier :\n\n\`${dir}\`\n\n` +
        'Puis relancez une question : les extraits pertinents seront proposés ici (sans clé API).' +
        getInternalModeLegalFooter(),
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
        preview.join('\n') +
        getInternalModeLegalFooter(),
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
    '_Réponse **Paw AI** issue uniquement de la base documentaire indexée : extraits classés par pertinence à partir de vos fichiers `.md` / `.txt` / `.xml` / `.pdf` / `.doc` / `.docx`._'
  );
  lines.push('');
  lines.push('### Extraits');
  lines.push('');
  scored.forEach((c, i) => {
    const md = c.metadata || {};
    const tags = [md.juridiction, md.dateIso, md.decisionNumber ? `n° ${md.decisionNumber}` : null].filter(Boolean);
    const fname = c.file != null ? String(c.file) : '(sans nom)';
    lines.push(`**${i + 1}. ${fname}** _(score ${Number(c.score || 0).toFixed(1)})${tags.length ? ` · ${tags.join(' · ')}` : ''}_`);
    lines.push('');
    const excerpt = String(c.text ?? '');
    lines.push(excerpt.length > 1200 ? `${excerpt.slice(0, 1200)}…` : excerpt);
    lines.push('');
    lines.push('---');
    lines.push('');
  });
  lines.push('### Note');
  lines.push('');
  lines.push(
    'Vérifiez les sources sur le serveur. Pour une synthèse rédigée au-delà de ces extraits, l’administrateur peut activer l’analyse Paw AI étendue sur le serveur.'
  );
  lines.push(getInternalModeLegalFooter());

  return {
    text: lines.join('\n'),
    sources: scored.map((c) => ({
      file: c.file,
      score: Number(Number(c.score || 0).toFixed(2)),
      metadata: c.metadata || {},
    })),
  };
  } catch (err) {
    console.error('[lexia] searchAndCompose:', err.stack || err.message);
    return {
      text:
        '## Erreur Lexia\n\nUne erreur technique est survenue pendant la recherche dans la base documentaire.\n\n' +
        `**Détail :** ${String(err.message || err)}\n\n` +
        'Consultez la console du serveur backend pour la pile complète.' + getInternalModeLegalFooter(),
      sources: [],
    };
  }
}

/** Chemin POSIX absolu (/…) sans lettre de lecteur Windows. */
function isPosixStyleAbsolute(p) {
  return typeof p === 'string' && p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p);
}

function defaultKnowledgeDirForPlatform() {
  return process.platform === 'win32' ? DEFAULT_DIR_WINDOWS : DEFAULT_DIR_POSIX;
}

let posixOnWindowsWarned = false;

/**
 * Résout un chemin relatif sûr sous le dossier corpus (pas de .., pas de chemin absolu).
 * @returns {string|null} chemin absolu du fichier
 */
function resolveSafeKnowledgeFilePath(knowledgeDir, relInput) {
  const knowledgeRoot = path.resolve(knowledgeDir);
  const raw = String(relInput || '').trim().replace(/\\/g, '/');
  if (!raw || raw.includes('\0')) return null;
  const segments = raw.split('/').filter((s) => s.length > 0);
  if (segments.some((s) => s === '..')) return null;
  const joined = segments.join(path.sep);
  const full = path.resolve(knowledgeRoot, joined);
  const relOut = path.relative(knowledgeRoot, full);
  if (relOut.startsWith('..') || path.isAbsolute(relOut)) return null;
  return full;
}

/**
 * Texte intégral d’un fichier du corpus (même extraction que l’index), pour affichage Paw AI.
 */
async function readKnowledgeFileContent(relFile) {
  const dir = getKnowledgeDir();
  const full = resolveSafeKnowledgeFilePath(dir, relFile);
  if (!full) {
    const e = new Error('Chemin fichier invalide');
    e.code = 'INVALID_FILE_PATH';
    throw e;
  }
  let st;
  try {
    st = await fsp.stat(full);
  } catch {
    const e = new Error('Fichier introuvable');
    e.code = 'FILE_NOT_FOUND';
    throw e;
  }
  if (!st.isFile()) {
    const e = new Error('Chemin invalide');
    e.code = 'INVALID_FILE_PATH';
    throw e;
  }
  const ext = path.extname(full).toLowerCase();
  if (!KNOWLEDGE_FILE_EXTENSIONS.has(ext)) {
    const e = new Error('Extension non prise en charge pour la lecture');
    e.code = 'UNSUPPORTED_EXT';
    throw e;
  }
  const maxRaw = getLexiaMaxRawBytesPerFile();
  if (st.size > maxRaw) {
    const e = new Error(`Fichier trop volumineux pour être affiché (>${maxRaw} octets).`);
    e.code = 'FILE_TOO_LARGE';
    throw e;
  }
  const text = await extractPlainTextFromKnowledgeFile(full);
  const maxChars = Math.max(50_000, Number(process.env.LEXIA_FULL_FILE_MAX_CHARS) || 1_000_000);
  let truncated = false;
  let content = text;
  if (content.length > maxChars) {
    content = content.slice(0, maxChars);
    truncated = true;
  }
  const referenceLabel = buildKnowledgeReferenceLabelFromPath(relFile);
  return {
    file: String(relFile).trim().replace(/\\/g, '/'),
    content,
    truncated,
    ext,
    empty: !String(text || '').trim(),
    referenceLabel,
  };
}

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
  buildQueryFromMessages,
  getKnowledgeDir,
  readKnowledgeFileContent,
  getKnowledgeStats: async () => {
    const knowledgeDir = getKnowledgeDir();
    const walk = walkCountKnowledgeFiles(knowledgeDir);
    const indexedFilesCap = getLexiaIndexMaxFiles();
    const indexTruncated =
      Number.isFinite(indexedFilesCap) && walk.total > indexedFilesCap;
    return {
      knowledgeDir,
      total: walk.total,
      byExt: walk.byExt,
      indexedFilesCap: Number.isFinite(indexedFilesCap) ? indexedFilesCap : null,
      indexTruncated,
      maxTotalChunks: getLexiaMaxTotalChunks(),
      maxExtractCharsPerFile: getLexiaMaxExtractCharsPerFile(),
    };
  },
  invalidateCache: () => {
    chunkCache = { loadedAt: 0, chunks: [], fileMtimes: {} };
    truncationFilesWarned = false;
    truncationChunksWarned = false;
  },
  extractPlainTextFromKnowledgeBuffer,
};

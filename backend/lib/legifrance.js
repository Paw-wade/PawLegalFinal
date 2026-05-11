const fetch = require('node-fetch');
const { getPisteToken } = require('./auth');

const BASE = process.env.LEGIFRANCE_API_URL;

async function parseJsonSafe(res) {
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { _raw: raw };
  }
}

function hasSearchResults(payload) {
  if (!payload || typeof payload !== 'object') return false;
  // Les réponses de recherche Legifrance contiennent généralement des collections de résultats.
  // On évite de considérer comme "OK" un simple miroir de la requête { recherche, fond }.
  const keys = Object.keys(payload);
  const hasOnlyRequestEcho =
    keys.length <= 3 &&
    'recherche' in payload &&
    'fond' in payload &&
    !('results' in payload) &&
    !('resultats' in payload) &&
    !('documents' in payload);
  return !hasOnlyRequestEcho;
}

async function rechercher(query, fond = 'CODE_DATE') {
  if (!BASE) {
    throw new Error("LEGIFRANCE_API_URL manquant dans l'environnement.");
  }
  const token = await getPisteToken();

  const body = {
    recherche: {
      champs: [{ typeChamp: 'ALL', criteres: [{ typeRecherche: 'EXACTE', valeur: query }] }],
      pageNumber: 1,
      pageSize: 10,
      sort: 'PERTINENCE',
      typePagination: 'DEFAUT',
    },
    fond,
  };

  const res = await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      `Legifrance /search a échoué (${res.status} ${res.statusText}) : ${JSON.stringify(data)}`
    );
  }
  if (!hasSearchResults(data)) {
    throw new Error(
      `Réponse Legifrance invalide (aucun résultat exploitable). Payload: ${JSON.stringify(data)}`
    );
  }
  return data;
}

async function getArticle(id) {
  if (!BASE) {
    throw new Error("LEGIFRANCE_API_URL manquant dans l'environnement.");
  }
  const token = await getPisteToken();

  const res = await fetch(`${BASE}/consult/getArticle`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id }),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      `Legifrance /consult/getArticle a échoué (${res.status} ${res.statusText}) : ${JSON.stringify(data)}`
    );
  }
  return data;
}

const LEGIARTI_RE = /LEGIARTI[0-9A-Z]+/i;

function findLegiartiIdDeep(value, depth = 0) {
  if (depth > 30) return null;
  if (typeof value === 'string') {
    const m = value.match(LEGIARTI_RE);
    return m ? m[0] : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = findLegiartiIdDeep(item, depth + 1);
      if (id) return id;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (k === 'id' && typeof value[k] === 'string' && LEGIARTI_RE.test(value[k])) {
        return value[k].match(LEGIARTI_RE)[0];
      }
      const id = findLegiartiIdDeep(value[k], depth + 1);
      if (id) return id;
    }
  }
  return null;
}

function extractLegiartiIdFromSearch(searchData) {
  return findLegiartiIdDeep(searchData);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitleFromArticlePayload(data) {
  if (!data || typeof data !== 'object') return '';
  const cand =
    data.titre ||
    data.title ||
    data.article?.titre ||
    data.article?.title ||
    data.article?.libelle ||
    data.listArticle?.[0]?.titre;
  return typeof cand === 'string' ? cand.trim() : '';
}

function extractTextFromArticlePayload(data) {
  if (!data || typeof data !== 'object') return '';
  const art = data.article || data;
  const direct =
    (typeof art.text === 'string' && art.text) ||
    (typeof art.texte === 'string' && art.texte) ||
    (typeof art.content === 'string' && art.content) ||
    (typeof data.text === 'string' && data.text);
  if (direct) return stripHtml(direct);

  const list = art.listeAlinea || art.alineas || art.alinéas;
  if (Array.isArray(list)) {
    const joined = list
      .map((a) => (typeof a === 'string' ? a : a?.texte || a?.text || ''))
      .filter(Boolean)
      .join('\n\n');
    if (joined) return stripHtml(joined);
  }
  const json = JSON.stringify(data);
  if (json.length > 12000) return `${json.slice(0, 12000)}…`;
  return stripHtml(json);
}

/**
 * Recherche Légifrance puis récupère le corps du premier article identifié (id LEGIARTI…).
 */
async function searchThenGetArticlePreview(query, fond = 'CODE_DATE') {
  const search = await rechercher(query, fond);
  const id = extractLegiartiIdFromSearch(search);
  if (!id) {
    const err = new Error('Aucun article Légifrance identifié dans les résultats de recherche.');
    err.code = 'NO_ARTICLE_ID';
    throw err;
  }
  return getArticlePreviewById(id, query);
}

async function getArticlePreviewById(id, titleFallback = '') {
  const raw = await getArticle(id);
  const title = extractTitleFromArticlePayload(raw) || titleFallback || id;
  const text = extractTextFromArticlePayload(raw);
  const legifranceUrl = `https://www.legifrance.gouv.fr/codes/article_lc/${encodeURIComponent(id)}`;
  return {
    id,
    title,
    text: text || '(Texte non disponible dans la réponse API.)',
    legifranceUrl,
  };
}

module.exports = {
  rechercher,
  getArticle,
  extractLegiartiIdFromSearch,
  searchThenGetArticlePreview,
  getArticlePreviewById,
};
const fetch = require('node-fetch');
const { getPisteToken, clearPisteTokenCache } = require('./auth');

const BASE = process.env.LEGIFRANCE_API_URL;

function legifranceBaseUrl() {
  return String(BASE || '').replace(/\/+$/, '');
}

/** Message d’aide si Légifrance renvoie 401 (corps souvent vide `{}`). */
function legifranceUnauthorizedHint() {
  const base = String(BASE || '');
  const sandbox = /sandbox/i.test(base);
  const oauthHint = sandbox
    ? 'PISTE_TOKEN_URL doit être https://sandbox-oauth.piste.gouv.fr/api/oauth/token avec LEGIFRANCE_API_URL sandbox.'
    : 'PISTE_TOKEN_URL doit être https://oauth.piste.gouv.fr/api/oauth/token avec LEGIFRANCE_API_URL production.';
  return (
    'Légifrance a refusé l’accès (401). Contrôlez sur piste.gouv.fr : l’application est abonnée et validée pour l’API Légifrance ; ' +
    oauthHint +
    ' PISTE_CLIENT_ID / SECRET sans espace en trop ; clés issues du bon espace (sandbox vs production).'
  );
}

/**
 * Appel API Légifrance avec jeton PISTE ; en cas de 401, invalide le cache et retente une fois
 * (jeton révoqué / décalage d’horloge). Si 401 persiste, erreur avec code LEGIFRANCE_UNAUTHORIZED.
 */
async function legifrancePostJson(path, jsonBody) {
  const base = legifranceBaseUrl();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const doFetch = async () => {
    const token = await getPisteToken();
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(jsonBody),
    });
  };

  let res = await doFetch();
  if (res.status === 401) {
    clearPisteTokenCache();
    res = await doFetch();
  }
  return res;
}

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

function buildSearchBody(query, fond, pageSize) {
  // Même forme que l’API documentée / clients officiels : pagination au niveau racine (pas dans `recherche`).
  return {
    recherche: {
      champs: [{ typeChamp: 'ALL', criteres: [{ typeRecherche: 'EXACTE', valeur: query }] }],
      sort: 'PERTINENCE',
      typePagination: 'DEFAUT',
    },
    fond,
    pageNumber: 1,
    pageSize,
  };
}

async function rechercher(query, fond = 'CODE_DATE') {
  if (!BASE) {
    throw new Error("LEGIFRANCE_API_URL manquant dans l'environnement.");
  }

  const body = buildSearchBody(query, fond, 10);

  const res = await legifrancePostJson('/search', body);

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    if (res.status === 401) {
      const err = new Error(
        `Legifrance /search a échoué (401 Unauthorized) : ${JSON.stringify(data)} — ${legifranceUnauthorizedHint()}`
      );
      err.code = 'LEGIFRANCE_UNAUTHORIZED';
      err.httpStatus = 401;
      throw err;
    }
    const err = new Error(
      `Legifrance /search a échoué (${res.status} ${res.statusText}) : ${JSON.stringify(data)}`
    );
    err.code = 'LEGIFRANCE_SEARCH_ERROR';
    err.httpStatus = res.status;
    throw err;
  }
  if (!hasSearchResults(data)) {
    throw new Error(
      `Réponse Legifrance invalide (aucun résultat exploitable). Payload: ${JSON.stringify(data)}`
    );
  }
  return data;
}

/**
 * Recherche Légifrance sans lever d’erreur si aucun résultat structuré (pour citations croisées).
 */
async function rechercherOptional(query, fond = 'CODE_DATE', pageSize = 25) {
  if (!BASE) return null;
  const body = buildSearchBody(query, fond, pageSize);
  const res = await legifrancePostJson('/search', body);
  const data = await parseJsonSafe(res);
  if (!res.ok) return null;
  if (!hasSearchResults(data)) return null;
  return data;
}

async function getArticle(id) {
  if (!BASE) {
    throw new Error("LEGIFRANCE_API_URL manquant dans l'environnement.");
  }

  const res = await legifrancePostJson('/consult/getArticle', { id });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    if (res.status === 401) {
      const err = new Error(
        `Legifrance /consult/getArticle a échoué (401 Unauthorized) : ${JSON.stringify(data)} — ${legifranceUnauthorizedHint()}`
      );
      err.httpStatus = 401;
      err.code = 'LEGIFRANCE_UNAUTHORIZED';
      throw err;
    }
    const err = new Error(
      `Legifrance /consult/getArticle a échoué (${res.status} ${res.statusText}) : ${JSON.stringify(data)}`
    );
    err.httpStatus = res.status;
    err.code = res.status === 404 ? 'ARTICLE_NOT_FOUND' : 'LEGIFRANCE_CONSULT_ERROR';
    throw err;
  }
  return data;
}

function normalizeLegiartiId(id) {
  const m = String(id || '').match(/LEGIARTI[0-9A-Z]+/i);
  return m ? m[0].toUpperCase() : '';
}

function collectLegiartiIdsFromValue(value, out, depth = 0) {
  if (depth > 40 || !out) return;
  if (typeof value === 'string') {
    let m;
    const re = /LEGIARTI[0-9A-Z]+/gi;
    while ((m = re.exec(value)) !== null) {
      out.add(m[0].toUpperCase());
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLegiartiIdsFromValue(item, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      collectLegiartiIdsFromValue(value[k], out, depth + 1);
    }
  }
}

/**
 * Tous les ids LEGIARTI présents dans la charge utile (réponse search ou getArticle).
 */
function collectAllLegiartiIds(payload) {
  const out = new Set();
  collectLegiartiIdsFromValue(payload, out);
  return [...out];
}

function findLegiartiIdDeep(value, depth = 0) {
  if (depth > 30) return null;
  if (typeof value === 'string') {
    const m = value.match(/LEGIARTI[0-9A-Z]+/i);
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
      if (k === 'id' && typeof value[k] === 'string' && /LEGIARTI[0-9A-Z]+/i.test(value[k])) {
        return value[k].match(/LEGIARTI[0-9A-Z]+/i)[0];
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

function legifranceArticleUrl(legiartiId) {
  const id = normalizeLegiartiId(legiartiId);
  if (!id) return '';
  return `https://www.legifrance.gouv.fr/codes/article_lc/${encodeURIComponent(id)}`;
}

function extractVigueurHint(data) {
  if (!data || typeof data !== 'object') return null;
  const art = data.article || data;
  const parts = [];
  if (typeof art.dateDebut === 'string' && art.dateDebut.trim()) {
    parts.push(`Mention de date : ${art.dateDebut.trim()}`);
  }
  if (typeof art.etat === 'string' && art.etat.trim()) {
    parts.push(`État : ${art.etat.trim()}`);
  }
  if (typeof data.etat === 'string' && data.etat.trim()) {
    parts.push(`État : ${data.etat.trim()}`);
  }
  if (typeof art.version === 'string' && art.version.trim()) {
    parts.push(`Version : ${art.version.trim()}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

async function enrichLegiartiIdsWithTitles(ids, maxResolve) {
  const slice = [...new Set(ids.map(normalizeLegiartiId).filter(Boolean))].slice(0, maxResolve);
  const results = await Promise.all(
    slice.map(async (lid) => {
      try {
        const r = await getArticle(lid);
        return {
          id: lid,
          title: extractTitleFromArticlePayload(r) || lid,
          legifranceUrl: legifranceArticleUrl(lid),
        };
      } catch {
        return {
          id: lid,
          title: null,
          legifranceUrl: legifranceArticleUrl(lid),
        };
      }
    })
  );
  return results;
}

/**
 * Aperçu article + références sortantes (ids dans la réponse API) + piste d’« autres articles »
 * via recherche sur l’id LEGIARTI (non exhaustif, dépend des fonds PISTE).
 */
async function getArticlePreviewEnriched(id, titleFallback = '') {
  const selfId = normalizeLegiartiId(id);
  if (!selfId) {
    const err = new Error('Identifiant LEGIARTI invalide.');
    err.code = 'INVALID_LEGIARTI';
    throw err;
  }
  const raw = await getArticle(selfId);
  const title = extractTitleFromArticlePayload(raw) || titleFallback || selfId;
  const text = extractTextFromArticlePayload(raw);
  const legifranceUrl = legifranceArticleUrl(selfId);
  const vigueurHint = extractVigueurHint(raw);

  const inPayload = collectAllLegiartiIds(raw).filter((x) => x !== selfId);
  const outgoingIds = [...new Set(inPayload)];

  const maxTitles = Math.min(Math.max(Number(process.env.LEGIFRANCE_CROSSREF_MAX_TITLES) || 10, 4), 20);
  const maxOutgoingList = Math.min(Math.max(Number(process.env.LEGIFRANCE_CROSSREF_MAX_OUT) || 24, 8), 40);

  const outgoingTrim = outgoingIds.slice(0, maxOutgoingList);
  const sortantesResolved = await enrichLegiartiIdsWithTitles(outgoingTrim, maxTitles);
  const sortantesRest = outgoingTrim.slice(maxTitles).map((lid) => ({
    id: lid,
    title: null,
    legifranceUrl: legifranceArticleUrl(lid),
  }));

  const citingSet = new Set();
  const fonds = (process.env.LEGIFRANCE_CITATION_FONDS || 'CODE_DATE')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const fond of fonds) {
    try {
      const res = await rechercherOptional(selfId, fond, 25);
      if (!res) continue;
      for (const lid of collectAllLegiartiIds(res)) {
        if (lid !== selfId) citingSet.add(lid);
      }
    } catch {
      /* ignore */
    }
  }
  const citingIds = [...citingSet].filter((lid) => !outgoingTrim.includes(lid)).slice(0, maxOutgoingList);
  const citantsResolved = await enrichLegiartiIdsWithTitles(citingIds, maxTitles);
  const citantsRest = citingIds.slice(maxTitles).map((lid) => ({
    id: lid,
    title: null,
    legifranceUrl: legifranceArticleUrl(lid),
  }));

  return {
    id: selfId,
    title,
    text: text || '(Texte non disponible dans la réponse API.)',
    legifranceUrl,
    vigueurHint,
    referencesSortantes: [...sortantesResolved, ...sortantesRest],
    articlesQuiCitent: [...citantsResolved, ...citantsRest],
    crossRefNote:
      'Références sortantes : identifiants LEGIARTI présents dans la réponse API. Autres textes repérés : ids extraits des résultats de recherche Légifrance sur cet identifiant (fonds : variable LEGIFRANCE_CITATION_FONDS, défaut CODE_DATE). Liste non exhaustive — contrôler sur Légifrance.',
  };
}

module.exports = {
  buildSearchBody,
  rechercher,
  rechercherOptional,
  getArticle,
  extractLegiartiIdFromSearch,
  searchThenGetArticlePreview,
  getArticlePreviewById,
  getArticlePreviewEnriched,
  collectAllLegiartiIds,
  normalizeLegiartiId,
};
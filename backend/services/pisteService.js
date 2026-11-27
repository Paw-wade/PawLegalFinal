'use strict';

const axios = require('axios');

const TOKEN_URL = process.env.PISTE_TOKEN_URL || 'https://oauth.piste.gouv.fr/api/oauth/token';
const CLIENT_ID = process.env.PISTE_CLIENT_ID;
const CLIENT_SECRET = process.env.PISTE_CLIENT_SECRET;

const LEGIFRANCE_BASE = process.env.LEGIFRANCE_API_URL || 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';
const JUDILIBRE_BASE = process.env.JUDILIBRE_API_URL || 'https://api.piste.gouv.fr/cassation/judilibre/v1.0';

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry - 30_000) return _token;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('PISTE_CLIENT_ID / PISTE_CLIENT_SECRET manquants dans .env');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'openid',
  });

  const res = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10_000,
  });

  _token = res.data.access_token;
  _tokenExpiry = Date.now() + (res.data.expires_in || 3600) * 1000;
  return _token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ---------------------------------------------------------------------------
// Légifrance
// ---------------------------------------------------------------------------

async function legifranceSearch({ query, nature, fond, pageNumber = 1, pageSize = 10 } = {}) {
  const token = await getToken();
  const body = {
    recherche: {
      champs: [{ typeChamp: 'ALL', criteres: [{ typeRecherche: 'EXACTE', valeur: query }] }],
      pageNumber,
      pageSize,
    },
  };
  if (nature) body.recherche.nature = nature;
  if (fond) body.fond = fond;

  const res = await axios.post(`${LEGIFRANCE_BASE}/search`, body, {
    headers: authHeaders(token),
    timeout: 15_000,
  });
  return res.data;
}

async function legifranceGetArticle(textId) {
  const token = await getToken();
  const res = await axios.post(
    `${LEGIFRANCE_BASE}/consult/getArticle`,
    { textId },
    { headers: authHeaders(token), timeout: 10_000 }
  );
  return res.data;
}

async function legifranceGetCode(textId) {
  const token = await getToken();
  const res = await axios.post(
    `${LEGIFRANCE_BASE}/consult/code`,
    { textId },
    { headers: authHeaders(token), timeout: 10_000 }
  );
  return res.data;
}

async function legifranceGetLoi(textId) {
  const token = await getToken();
  const res = await axios.post(
    `${LEGIFRANCE_BASE}/consult/lawDecree`,
    { textId },
    { headers: authHeaders(token), timeout: 10_000 }
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// JUDILIBRE (Cour de Cassation)
// ---------------------------------------------------------------------------

async function judiLibreSearch({ query, chamber, theme, type, date_start, date_end, page = 0, page_size = 10 } = {}) {
  const token = await getToken();
  const params = { query, page, page_size };
  if (chamber) params.chamber = chamber;
  if (theme) params.theme = theme;
  if (type) params.type = type;
  if (date_start) params.date_start = date_start;
  if (date_end) params.date_end = date_end;

  const res = await axios.get(`${JUDILIBRE_BASE}/search`, {
    params,
    headers: authHeaders(token),
    timeout: 15_000,
  });
  return res.data;
}

async function judiLibreGetDecision(id) {
  const token = await getToken();
  const res = await axios.get(`${JUDILIBRE_BASE}/decision`, {
    params: { id },
    headers: authHeaders(token),
    timeout: 10_000,
  });
  return res.data;
}

async function judiLibreTaxonomy(target) {
  const token = await getToken();
  const res = await axios.get(`${JUDILIBRE_BASE}/taxonomy`, {
    params: { target },
    headers: authHeaders(token),
    timeout: 10_000,
  });
  return res.data;
}

// ---------------------------------------------------------------------------
// Ping (vérification du token)
// ---------------------------------------------------------------------------

async function ping() {
  const token = await getToken();
  const res = await axios.get(`${JUDILIBRE_BASE}/healthcheck`, {
    headers: authHeaders(token),
    timeout: 8_000,
  });
  return res.data;
}

module.exports = {
  getToken,
  legifrance: { search: legifranceSearch, getArticle: legifranceGetArticle, getCode: legifranceGetCode, getLoi: legifranceGetLoi },
  judilibre: { search: judiLibreSearch, getDecision: judiLibreGetDecision, taxonomy: judiLibreTaxonomy },
  ping,
};

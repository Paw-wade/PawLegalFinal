const fetch = require('node-fetch');

const BASE = 'https://sandbox-api.piste.gouv.fr/cassation/judilibre/v1.0';
const TOKEN_URL = 'https://sandbox-oauth.piste.gouv.fr/api/oauth/token';

let cachedToken = null;
let tokenExpiry = 0;

async function getJudilibreToken() {
  if (cachedToken && Date.now() < tokenExpiry - 10000) return cachedToken;

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.PISTE_CLIENT_ID,
    client_secret: process.env.PISTE_CLIENT_SECRET,
    scope: 'openid',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('Échec auth Judilibre : ' + JSON.stringify(data));

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

// Recherche de décisions
async function searchDecisions(query, options = {}) {
  const token = await getJudilibreToken();

  const params = new URLSearchParams({
    query,
    page_size: options.pageSize || 10,
    page_number: options.page || 0,
    ...( options.chamber && { chamber: options.chamber }),
    ...( options.formation && { formation: options.formation }),
  });

  const res = await fetch(`${BASE}/search?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  return res.json();
}

// Récupérer une décision complète par ID
async function getDecision(id) {
  const token = await getJudilibreToken();

  const res = await fetch(`${BASE}/decision?id=${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  return res.json();
}

// Export par lot (scan)
async function scanDecisions(options = {}) {
  const token = await getJudilibreToken();

  const params = new URLSearchParams({
    page_size: options.pageSize || 10,
    page_number: options.page || 0,
    ...( options.date_start && { date_start: options.date_start }),
    ...( options.date_end && { date_end: options.date_end }),
  });

  const res = await fetch(`${BASE}/scan?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  return res.json();
}

module.exports = { searchDecisions, getDecision, scanDecisions };
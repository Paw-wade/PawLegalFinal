const fetch = require('node-fetch');
const { getPisteToken } = require('./auth');

const BASE =
  process.env.JUDILIBRE_API_URL ||
  'https://api.piste.gouv.fr/cassation/judilibre/v1.0';

async function getJudilibreToken() {
  return getPisteToken();
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
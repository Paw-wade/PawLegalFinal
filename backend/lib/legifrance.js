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

module.exports = { rechercher, getArticle };
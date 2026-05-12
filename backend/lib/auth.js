// auth.js
const fetch = require('node-fetch');

let cachedToken = null;
let tokenExpiry = 0;

function clearPisteTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
}

async function getPisteToken(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  if (forceRefresh) clearPisteTokenCache();

  // Réutilise le token s'il est encore valide
  if (cachedToken && Date.now() < tokenExpiry - 10000) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.PISTE_CLIENT_ID,
    client_secret: process.env.PISTE_CLIENT_SECRET,
    scope: 'openid',
  });

  const res = await fetch(process.env.PISTE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await res.json();

  if (!data.access_token) {
    throw new Error('Échec auth PISTE : ' + JSON.stringify(data));
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;

  return cachedToken;
}

module.exports = { getPisteToken, clearPisteTokenCache };
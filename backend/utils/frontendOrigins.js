/**
 * Origines frontend autorisées (CORS).
 * FRONTEND_URL peut être une liste séparée par des virgules, ex. :
 *   https://www.adapapers.fr,https://adapapers.fr,https://adapapers.vercel.app
 *
 * PUBLIC_APP_URL (optionnel) : URL canonique pour les liens dans les e-mails
 * (reset password, etc.). Sinon, la première entrée de FRONTEND_URL est utilisée.
 */
function getFrontendOriginsList() {
  const raw =
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGINS ||
    'http://localhost:3000,http://localhost:3004';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Évite une liste vide si FRONTEND_URL est mal formée
  return list.length > 0 ? list : ['http://localhost:3000', 'http://localhost:3004'];
}

function getPrimaryFrontendUrl() {
  if (process.env.PUBLIC_APP_URL) {
    return process.env.PUBLIC_APP_URL.replace(/\/+$/, '');
  }
  const list = getFrontendOriginsList();
  return list[0] || 'http://localhost:3004';
}

module.exports = {
  getFrontendOriginsList,
  getPrimaryFrontendUrl,
};

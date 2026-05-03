/**
 * Origines frontend autorisées (CORS).
 * FRONTEND_URL peut être une liste séparée par des virgules, ex. :
 *   https://www.adapapers.fr,https://adapapers.fr,https://adapapers.vercel.app
 *
 * Les origines HTTPS du site Ada Papers sont toujours ajoutées (dédoublonnées),
 * pour que l’API sur api.adapapers.fr accepte le navigateur sur www.adapapers.fr
 * même si FRONTEND_URL n’a pas été mis à jour sur le serveur.
 *
 * PUBLIC_APP_URL (optionnel) : URL canonique pour les liens dans les e-mails
 * (reset password, etc.). Sinon, la première entrée de FRONTEND_URL est utilisée.
 *
 * CORS_ALLOW_LOCALHOST : si `false`, n’ajoute pas localhost / 127.0.0.1 (3000, 3004).
 * Par défaut ils sont toujours autorisés pour développer le front en local contre l’API déployée.
 */
const ADAPAPERS_SITE_ORIGINS = ['https://www.adapapers.fr', 'https://adapapers.fr'];

/** Next.js local courant : permet d’appeler l’API distante (VPS) depuis le navigateur sans erreur CORS. */
const LOCAL_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3004',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3004',
];

function getFrontendOriginsList() {
  const raw =
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGINS ||
    'http://localhost:3000,http://localhost:3004';
  const fromEnv = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const base =
    fromEnv.length > 0 ? fromEnv : ['http://localhost:3000', 'http://localhost:3004'];
  const merged = [...new Set([...base, ...ADAPAPERS_SITE_ORIGINS])];
  if (process.env.CORS_ALLOW_LOCALHOST === 'false') {
    return merged;
  }
  return [...new Set([...merged, ...LOCAL_DEV_ORIGINS])];
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

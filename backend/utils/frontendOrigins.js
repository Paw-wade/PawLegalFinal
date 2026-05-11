/**
 * Origines frontend autorisées (CORS).
 * FRONTEND_URL peut être une liste séparée par des virgules, ex. :
 *   https://www.adapapers.fr,https://adapapers.fr,https://adapapers.vercel.app
 *
 * Les origines HTTPS du site Ada Papers sont toujours ajoutées (dédoublonnées),
 * pour que l’API sur api.adapapers.fr accepte le navigateur sur www.adapapers.fr
 * même si FRONTEND_URL n’a pas été mis à jour sur le serveur.
 *
 * PUBLIC_APP_URL (recommandé en prod) : URL canonique pour les liens dans les e-mails
 * (activation, reset mot de passe, notifications). Ex. https://www.adapapers.fr
 * Sans PUBLIC_APP_URL : on prend la première URL HTTPS hors localhost dans la liste
 * CORS (FRONTEND_URL + origines Ada Papers), puis http distant, puis localhost.
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

function stripTrailingSlashes(s) {
  return String(s || '').trim().replace(/\/+$/, '');
}

function isLocalhostOrigin(urlStr) {
  try {
    const u = new URL(urlStr);
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Base URL pour les liens dans les e-mails (Brevo / SMTP).
 * Ne doit pas être confondue avec l’URL de l’API (api.adapapers.fr).
 */
function getPrimaryFrontendUrl() {
  const explicit = stripTrailingSlashes(process.env.PUBLIC_APP_URL || '');
  if (explicit) {
    return explicit;
  }

  const list = getFrontendOriginsList();
  const normalized = list.map((u) => stripTrailingSlashes(u)).filter(Boolean);

  const remoteHttps = normalized.filter((u) => {
    const low = u.toLowerCase();
    return low.startsWith('https://') && !isLocalhostOrigin(u);
  });
  if (remoteHttps.length > 0) {
    const preferred = remoteHttps.find(
      (u) => stripTrailingSlashes(u).toLowerCase() === 'https://www.adapapers.fr'
    );
    return preferred || remoteHttps[0];
  }

  const remoteHttp = normalized.filter((u) => {
    const low = u.toLowerCase();
    return low.startsWith('http://') && !isLocalhostOrigin(u);
  });
  if (remoteHttp.length > 0) {
    return remoteHttp[0];
  }

  return normalized[0] || 'http://localhost:3004';
}

module.exports = {
  getFrontendOriginsList,
  getPrimaryFrontendUrl,
};

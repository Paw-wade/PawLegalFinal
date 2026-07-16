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

/** Hôte type sous-domaine API (souvent en première position dans FRONTEND_URL) — à ne pas utiliser pour les liens e-mail. */
function isApiSubdomainHostname(hostname) {
  return String(hostname || '')
    .toLowerCase()
    .startsWith('api.');
}

/**
 * Si l’URL pointe vers un hôte `api.*`, tente l’équivalent `www.*` (convention courante).
 * Évite les liens e-mail qui mènent au serveur Express (404 sur les pages Next).
 */
function publicSiteUrlFromPossiblyApiUrl(urlStr) {
  const s = stripTrailingSlashes(String(urlStr || '').trim());
  if (!s) return s;
  try {
    const u = new URL(s);
    if (isApiSubdomainHostname(u.hostname)) {
      const rest = u.hostname.slice(4);
      return stripTrailingSlashes(`${u.protocol}//www.${rest}`);
    }
  } catch {
    /* ignore */
  }
  return s;
}

function pickHttpsEmailBase(remoteHttps) {
  if (!remoteHttps.length) return null;
  const nonApi = remoteHttps.filter((u) => {
    try {
      return !isApiSubdomainHostname(new URL(u).hostname);
    } catch {
      return true;
    }
  });
  const pool = nonApi.length > 0 ? nonApi : remoteHttps;
  const preferred = pool.find(
    (u) => stripTrailingSlashes(u).toLowerCase() === 'https://www.adapapers.fr'
  );
  if (preferred) return preferred;
  if (nonApi.length > 0) return nonApi[0];
  return publicSiteUrlFromPossiblyApiUrl(remoteHttps[0]) || remoteHttps[0];
}

/**
 * Base URL pour les liens dans les e-mails (Brevo / SMTP).
 * Ne doit pas être confondue avec l’URL de l’API (api.adapapers.fr).
 *
 * Ordre : PUBLIC_APP_URL / CLIENT_URL (HTTPS distant), puis FRONTEND_URL.
 * Un PUBLIC_APP_URL en localhost ne doit pas écraser un CLIENT_URL de prod
 * (sinon les e-mails de reset pointent vers localhost et le parcours casse).
 */
function getPrimaryFrontendUrl() {
  const envCandidates = [
    process.env.PUBLIC_APP_URL,
    process.env.CLIENT_URL,
  ]
    .map((u) => publicSiteUrlFromPossiblyApiUrl(stripTrailingSlashes(u || '')))
    .filter(Boolean);

  const remoteHttpsEnv = envCandidates.find(
    (u) => u.toLowerCase().startsWith('https://') && !isLocalhostOrigin(u)
  );
  if (remoteHttpsEnv) return remoteHttpsEnv;

  const remoteAnyEnv = envCandidates.find((u) => !isLocalhostOrigin(u));
  if (remoteAnyEnv) return remoteAnyEnv;

  const list = getFrontendOriginsList();
  const normalized = list.map((u) => stripTrailingSlashes(u)).filter(Boolean);

  const remoteHttps = normalized.filter((u) => {
    const low = u.toLowerCase();
    return low.startsWith('https://') && !isLocalhostOrigin(u);
  });
  if (remoteHttps.length > 0) {
    return pickHttpsEmailBase(remoteHttps);
  }

  const remoteHttp = normalized.filter((u) => {
    const low = u.toLowerCase();
    return low.startsWith('http://') && !isLocalhostOrigin(u);
  });
  if (remoteHttp.length > 0) {
    return remoteHttp[0];
  }

  if (envCandidates.length > 0) return envCandidates[0];

  return normalized[0] || 'http://localhost:3004';
}

module.exports = {
  getFrontendOriginsList,
  getPrimaryFrontendUrl,
};

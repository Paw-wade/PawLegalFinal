const DEFAULT_ORIGIN = 'http://localhost:3005';

function normalizeApiOrigin(raw: string | undefined): string {
  let base = (raw || DEFAULT_ORIGIN)
    .replace(/[\s\u200B-\u200D\uFEFF\xA0]+/g, '')
    .trim()
    .replace(/\/+$/, '');
  base = base.replace(/(?:\/api)+$/i, '');
  return base || DEFAULT_ORIGIN;
}

/** Origine backend (NEXT_PUBLIC_API_URL), sans suffixe `/api`. */
export function getNextPublicApiOrigin(): string {
  return normalizeApiOrigin(process.env.NEXT_PUBLIC_API_URL);
}

/**
 * Origine pour les appels **serveur** vers l’API d’auth (NextAuth `authorize`, Google, etc.).
 * Utilise `AUTH_BACKEND_ORIGIN` ou `INTERNAL_API_URL` si défini, sinon `NEXT_PUBLIC_API_URL`.
 * Ex. : front en dev avec `NEXT_PUBLIC_API_URL` = prod, mais backend local → `AUTH_BACKEND_ORIGIN=http://127.0.0.1:3005`
 */
export function getAuthBackendOrigin(): string {
  const raw =
    process.env.AUTH_BACKEND_ORIGIN ||
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL;
  return normalizeApiOrigin(raw);
}

/** Comme `publicApiPath` mais basé sur `getAuthBackendOrigin()` (Route Handlers Next). */
export function authApiPath(relativePath: string): string {
  const p = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${getAuthBackendOrigin()}/api${p}`;
}

/**
 * Base `/api` pour axios / fetch.
 * En `next dev`, le navigateur utilise **toujours** `/api` (réécriture vers le backend) même si
 * `NEXT_PUBLIC_API_URL` pointe vers `:3005` — sinon les appels doublent l’origine et on voit souvent
 * `ERR_CONNECTION_RESET` sur `/api/lexia`.
 * Côté serveur Next (SSR), on garde une URL absolue (`NEXT_PUBLIC_*` ou localhost:3005).
 */
export function getPublicApiBaseUrl(): string {
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    return '/api';
  }
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env != null && env !== '') {
    return `${normalizeApiOrigin(env)}/api`;
  }
  if (process.env.NODE_ENV === 'development') {
    return `${DEFAULT_ORIGIN}/api`;
  }
  return `${DEFAULT_ORIGIN}/api`;
}

/** Uploads multipart : en dev, contourne le proxy Next qui coupe souvent les gros POST. */
export function getDirectBackendApiBaseUrl(): string {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    return 'http://127.0.0.1:3005/api';
  }
  return getPublicApiBaseUrl();
}

/**
 * Chemin sous `/api`, ex. `publicApiPath('/auth/login')` → même URL que
 * `` `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login` ``.
 */
export function publicApiPath(relativePath: string): string {
  const p = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${getNextPublicApiOrigin()}/api${p}`;
}

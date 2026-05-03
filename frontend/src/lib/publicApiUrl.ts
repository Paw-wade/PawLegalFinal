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

/** Base `.../api` pour axios / fetch (équivalent à `${getNextPublicApiOrigin()}/api`). */
export function getPublicApiBaseUrl(): string {
  return `${getNextPublicApiOrigin()}/api`;
}

/**
 * Chemin sous `/api`, ex. `publicApiPath('/auth/login')` → même URL que
 * `` `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login` ``.
 */
export function publicApiPath(relativePath: string): string {
  const p = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${getNextPublicApiOrigin()}/api${p}`;
}

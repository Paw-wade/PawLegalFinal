import { getNextPublicApiOrigin } from '@/lib/publicApiUrl';

export function resolveBrandingAssetUrl(url?: string | null): string {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:')) {
    return u;
  }
  const origin = getNextPublicApiOrigin().replace(/\/+$/, '');
  return `${origin}${u.startsWith('/') ? u : `/${u}`}`;
}

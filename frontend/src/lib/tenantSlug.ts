/**
 * Résolution du slug cabinet depuis le Host (aligné sur backend resolveOrganization).
 */
export function tenantSlugFromHost(host: string | null | undefined): string | undefined {
  if (!host) {
    return process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG?.trim() || undefined;
  }
  const h = host.split(':')[0].toLowerCase();
  if (h.includes('dupont')) return 'cabinet-dupont';
  if (h.includes('martin')) return 'cabinet-martin';
  if (h.includes('wadepaw')) return 'cabinet-wadepaw';
  return process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG?.trim() || undefined;
}

export function tenantAuthHeaders(tenantSlug?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (tenantSlug) {
    headers['X-Tenant-Slug'] = tenantSlug;
  }
  return headers;
}

const TENANT_SLUG_STORAGE_KEY = 'tenantSlug';

export function persistTenantSlug(slug: string | null | undefined): void {
  if (typeof window === 'undefined' || !slug) return;
  try {
    window.localStorage.setItem(TENANT_SLUG_STORAGE_KEY, slug);
  } catch {
    /* ignore */
  }
}

export function getStoredTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TENANT_SLUG_STORAGE_KEY);
  } catch {
    return null;
  }
}

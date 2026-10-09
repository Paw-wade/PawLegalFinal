import { getPublicApiBaseUrl } from '@/lib/publicApiUrl';
import { resolveTenantSlugForRequest, tenantSlugFromHost } from '@/lib/tenantSlug';
import type { TenantConfigResponse } from '@/lib/tenant/types';

export async function fetchTenantConfig(host?: string | null): Promise<TenantConfigResponse> {
  const base = getPublicApiBaseUrl();
  const slug =
    typeof window !== 'undefined'
      ? resolveTenantSlugForRequest()
      : tenantSlugFromHost(host ?? null);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (slug) {
    headers['X-Tenant-Slug'] = slug;
  }

  const res = await fetch(`${base}/tenant/config`, {
    credentials: 'include',
    headers,
    cache: 'no-store',
  });

  const data = (await res.json().catch(() => ({}))) as TenantConfigResponse;
  if (!res.ok) {
    return {
      success: false,
      message: data.message || `HTTP ${res.status}`,
      organization: null,
    };
  }
  return data;
}

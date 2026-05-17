'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { applyTenantBrandingCss } from '@/lib/tenant/brandingCss';
import { fetchTenantConfig } from '@/lib/tenant/fetchTenantConfig';
import { persistTenantSlug } from '@/lib/tenantSlug';
import type { TenantOrganization } from '@/lib/tenant/types';

type TenantContextValue = {
  loading: boolean;
  multiTenant: boolean;
  organization: TenantOrganization | null;
  branding: TenantOrganization['branding'];
  landingPage: TenantOrganization['landingPage'];
  slug: string | null;
  refresh: () => Promise<void>;
};

const TenantContext = createContext<TenantContextValue>({
  loading: true,
  multiTenant: false,
  organization: null,
  branding: undefined,
  landingPage: undefined,
  slug: null,
  refresh: async () => {},
});

export function useTenant() {
  return useContext(TenantContext);
}

export default function TenantProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [multiTenant, setMultiTenant] = useState(false);
  const [organization, setOrganization] = useState<TenantOrganization | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTenantConfig();
      setMultiTenant(Boolean(data.multiTenant));
      setOrganization(data.organization ?? null);
      if (data.organization?.slug) {
        persistTenantSlug(data.organization.slug);
      }
      applyTenantBrandingCss(data.organization?.branding);
      const name = data.organization?.branding?.name;
      if (name && typeof document !== 'undefined') {
        document.title = name;
      }
      const favicon = data.organization?.branding?.favicon;
      if (favicon && typeof document !== 'undefined') {
        let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = favicon;
      }
    } catch {
      setMultiTenant(false);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<TenantContextValue>(
    () => ({
      loading,
      multiTenant,
      organization,
      branding: organization?.branding,
      landingPage: organization?.landingPage,
      slug: organization?.slug ?? null,
      refresh: load,
    }),
    [loading, multiTenant, organization, load]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

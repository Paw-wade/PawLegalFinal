'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { persistTenantSlug } from '@/lib/tenantSlug';

/** Conserve le slug cabinet après login Google / email pour les appels API (X-Tenant-Slug). */
export default function TenantSlugSync() {
  const { data: session } = useSession();
  const slug = (session as { tenantSlug?: string } | null)?.tenantSlug;

  useEffect(() => {
    if (slug) persistTenantSlug(slug);
  }, [slug]);

  return null;
}

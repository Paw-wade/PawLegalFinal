'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { persistTenantSlug, resolveTenantSlugForRequest } from '@/lib/tenantSlug';

/** Aligne le slug cabinet sur le domaine courant ; session uniquement si cohérente. */
export default function TenantSlugSync() {
  const { data: session } = useSession();
  const sessionSlug = (session as { tenantSlug?: string } | null)?.tenantSlug;

  useEffect(() => {
    const fromHost = resolveTenantSlugForRequest();
    if (fromHost) return;
    if (sessionSlug) persistTenantSlug(sessionSlug);
  }, [sessionSlug]);

  return null;
}

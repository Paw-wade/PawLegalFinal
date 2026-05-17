'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTenant } from '@/components/TenantProvider';
import {
  DEV_CABINETS,
  devCabinetLabel,
  devCabinetSignInUrl,
  isPlainLocalhostHost,
} from '@/lib/tenant/devCabinetHosts';
import { tenantSlugFromHost } from '@/lib/tenantSlug';

const showBanner =
  process.env.NODE_ENV === 'development' ||
  process.env.NEXT_PUBLIC_SHOW_TENANT_BANNER === 'true';

/**
 * Bandeau dev : cabinet actif + liens pour changer de sous-domaine.
 * Évite la confusion localhost → DEFAULT_ORG_SLUG.
 */
export function TenantDevBanner() {
  const { loading, multiTenant, organization, slug } = useTenant();
  const [port, setPort] = useState('3004');
  const [hostSlug, setHostSlug] = useState<string | undefined>();
  const [plainLocalhost, setPlainLocalhost] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPort(window.location.port || '3004');
    setHostSlug(tenantSlugFromHost(window.location.host));
    setPlainLocalhost(isPlainLocalhostHost(window.location.hostname));
  }, []);

  const visible = showBanner && multiTenant;

  useEffect(() => {
    if (!visible || typeof document === 'undefined') return;
    document.body.classList.add('tenant-dev-banner-pad');
    return () => document.body.classList.remove('tenant-dev-banner-pad');
  }, [visible]);

  if (!visible) return null;

  const activeSlug = slug ?? hostSlug;
  const displayName = organization?.branding?.name?.trim() || devCabinetLabel(activeSlug);
  const defaultSlug = process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG?.trim() || 'cabinet-wadepaw';
  const hostMismatch =
    !loading &&
    hostSlug &&
    slug &&
    hostSlug !== slug;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[9999] border-t border-amber-500/40 bg-amber-50/95 text-amber-950 shadow-lg backdrop-blur-sm dark:bg-amber-950/95 dark:text-amber-50 dark:border-amber-400/30"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-6xl mx-auto px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm">
        <div className="min-w-0">
          <span className="font-semibold">Cabinet actif :</span>{' '}
          <span className="font-medium">{displayName}</span>
          {activeSlug ? (
            <span className="text-amber-800/80 dark:text-amber-200/80"> ({activeSlug})</span>
          ) : null}
          {loading ? <span className="ml-2 opacity-70">— chargement…</span> : null}
          {plainLocalhost ? (
            <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
              <code className="rounded bg-amber-200/60 dark:bg-amber-900/50 px-1">localhost</code>{' '}
              utilise le défaut <strong>{defaultSlug}</strong>. Pour un autre cabinet, ouvrez un
              sous-domaine ci-dessous.
            </p>
          ) : null}
          {hostMismatch ? (
            <p className="mt-1 text-red-700 dark:text-red-300 font-medium">
              Attention : le domaine pointe vers {hostSlug} mais l’API renvoie {slug}.
            </p>
          ) : null}
        </div>

        <nav className="flex flex-wrap items-center gap-1.5 shrink-0" aria-label="Changer de cabinet (dev)">
          <span className="text-amber-800/70 dark:text-amber-200/70 mr-1 hidden sm:inline">Basculer :</span>
          {DEV_CABINETS.map((cabinet) => {
            const href = devCabinetSignInUrl(cabinet.slug, port);
            const isActive = activeSlug === cabinet.slug;
            return (
              <Link
                key={cabinet.slug}
                href={href}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-white/80 text-amber-950 hover:bg-white dark:bg-amber-900/60 dark:text-amber-50 dark:hover:bg-amber-800/80'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {cabinet.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { platformAPI } from '@/lib/platform/platformApi';
import type { OrgStatus, PlatformOrganization } from '@/lib/platform/types';
import { PlatformStatusBadge } from './PlatformStatusBadge';
import { getOrganizationTypeLabel } from '@/lib/platform/organizationTypes';
import { Building2, Plus, RefreshCw, Search } from 'lucide-react';

function HealthDot({
  ok,
  latencyMs,
  error,
}: {
  ok?: boolean;
  latencyMs?: number;
  error?: string | null;
}) {
  if (ok === undefined) return <span className="text-gray-400 text-xs">—</span>;
  const label = ok ? `${latencyMs ?? 0} ms` : 'KO';
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={!ok && error ? error : undefined}>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {label}
    </span>
  );
}

export function PlatformCabinetsList() {
  const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | OrgStatus>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await platformAPI.organizations.list(true);
      if (res.data?.success) {
        setOrgs(res.data.organizations || []);
      } else {
        setError('Chargement impossible');
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err?.response?.data?.message || err.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orgs.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (!q) return true;
      const name = (o.branding?.name || '').toLowerCase();
      return o.slug.includes(q) || name.includes(q) || (o.domains || []).some((d) => d.includes(q));
    });
  }, [orgs, search, statusFilter]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            Organisations
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Cabinets d&apos;avocats, conseil, associations et autres structures hébergées.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </button>
          <Link
            href="/platform/cabinets/new"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nouvelle organisation
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Rechercher slug, nom, domaine…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | OrgStatus)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="">Tous les statuts</option>
          <option value="active">active</option>
          <option value="trial">trial</option>
          <option value="suspended">suspended</option>
        </select>
        <span className="text-xs text-gray-500">
          {filtered.length} / {orgs.length}
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Organisation</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Type</th>
              <th className="text-left px-4 py-3 font-medium">Statut</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Mongo</th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Checklist</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Domaines</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Chargement…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Aucune organisation trouvée.
                </td>
              </tr>
            ) : (
              filtered.map((org) => (
                <tr key={org.id} className="border-t hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <div className="font-medium">{org.branding?.name || org.slug}</div>
                    <div className="text-xs text-gray-500 font-mono">{org.slug}</div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-xs text-gray-600">
                    {getOrganizationTypeLabel(org.organizationType, org.organizationTypeOther)}
                  </td>
                  <td className="px-4 py-3">
                    <PlatformStatusBadge status={org.status} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <HealthDot
                      ok={org.health?.mongoOk}
                      latencyMs={org.health?.latencyMs}
                      error={org.health?.error}
                    />
                    {!org.health?.mongoOk && org.health?.error && (
                      <p className="text-xs text-red-600 mt-1 max-w-[200px] leading-snug">{org.health.error}</p>
                    )}
                    {org.health && org.health.adminCount >= 0 && (
                      <div className="text-xs text-gray-500 mt-0.5">{org.health.adminCount} admin(s)</div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs">
                    {org.checklistProgress
                      ? `${org.checklistProgress.done}/${org.checklistProgress.total}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-600 max-w-[180px] truncate">
                    {(org.domains || []).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/platform/cabinets/${org.slug}`}
                      className="text-primary hover:underline text-xs font-medium"
                    >
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { platformAPI } from '@/lib/platform/platformApi';
import type { PlatformDashboard } from '@/lib/platform/types';
import { AUDIT_ACTION_LABELS } from '@/lib/platform/types';
import { PlatformStatusBadge } from './PlatformStatusBadge';
import { Building2, Plus, RefreshCw } from 'lucide-react';

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

export function PlatformDashboardView() {
  const [data, setData] = useState<PlatformDashboard | null>(null);
  const [platformHealth, setPlatformHealth] = useState<{ masterDbOk?: boolean; cacheTtlMs?: number } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dash, health] = await Promise.all([platformAPI.dashboard(), platformAPI.health()]);
      if (dash.data?.success) setData(dash.data);
      if (health.data?.success) {
        setPlatformHealth({ masterDbOk: health.data.masterDbOk, cacheTtlMs: health.data.cacheTtlMs });
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err?.response?.data?.message || err.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-10 w-10 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            Tableau de bord plateforme
          </h1>
          <p className="text-sm text-gray-600 mt-1">Vue d&apos;ensemble des cabinets SaaS Ada Papers.</p>
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
            Nouveau cabinet
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total cabinets" value={summary?.total ?? 0} />
        <StatCard label="Actifs" value={summary?.byStatus?.active ?? 0} accent="text-green-700" />
        <StatCard label="Essai (trial)" value={summary?.byStatus?.trial ?? 0} accent="text-amber-700" />
        <StatCard label="Suspendus" value={summary?.byStatus?.suspended ?? 0} accent="text-red-700" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">Santé plateforme</h2>
          <ul className="text-sm space-y-1 text-gray-600">
            <li>
              Base maître :{' '}
              <span className={platformHealth?.masterDbOk ? 'text-green-700 font-medium' : 'text-red-700'}>
                {platformHealth?.masterDbOk ? 'OK' : 'KO'}
              </span>
            </li>
            <li>Cache tenant : {platformHealth?.cacheTtlMs ?? '—'} ms</li>
            <li>
              Essais &gt; 30 jours : <strong>{summary?.trialOlderThan30Days ?? 0}</strong>
            </li>
          </ul>
          <Link href="/platform/cabinets" className="text-sm text-primary hover:underline">
            Voir tous les cabinets →
          </Link>
        </div>

        <div className="bg-white border rounded-lg p-4 space-y-3 max-h-80 overflow-y-auto">
          <h2 className="font-semibold">Journal récent</h2>
          {(data?.recentAudit || []).length === 0 ? (
            <p className="text-sm text-gray-500">Aucune action enregistrée.</p>
          ) : (
            <ul className="text-sm space-y-2">
              {data!.recentAudit.map((a) => (
                <li key={a.id} className="border-b border-gray-100 pb-2">
                  <span className="font-medium">{AUDIT_ACTION_LABELS[a.action] || a.action}</span>
                  {a.orgSlug ? (
                    <Link href={`/platform/cabinets/${a.orgSlug}`} className="text-primary ml-1 hover:underline">
                      {a.orgSlug}
                    </Link>
                  ) : null}
                  <div className="text-xs text-gray-500">
                    {a.actorEmail} — {new Date(a.createdAt).toLocaleString('fr-FR')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">Cabinet</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-left px-4 py-3">Checklist</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(data?.organizations || []).map(({ organization: org, checklistProgress }) => (
              <tr key={org.id} className="border-t hover:bg-gray-50/80">
                <td className="px-4 py-3">
                  <div className="font-medium">{org.branding?.name || org.slug}</div>
                  <div className="text-xs text-gray-500 font-mono">{org.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <PlatformStatusBadge status={org.status} />
                </td>
                <td className="px-4 py-3 text-xs">
                  {checklistProgress.done}/{checklistProgress.total}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/platform/cabinets/${org.slug}`} className="text-primary hover:underline text-xs">
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

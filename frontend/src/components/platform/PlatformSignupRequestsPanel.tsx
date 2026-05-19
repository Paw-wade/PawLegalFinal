'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { platformAPI } from '@/lib/platform/platformApi';
import type { OrganizationSignupRequest } from '@/lib/platform/types';
import { PlatformStatusBadge } from './PlatformStatusBadge';
import { RefreshCw } from 'lucide-react';

const STATUS_FILTERS = [
  { value: '', label: 'Toutes' },
  { value: 'pending', label: 'En attente' },
  { value: 'in_review', label: 'En cours' },
  { value: 'approved', label: 'Acceptées' },
  { value: 'rejected', label: 'Refusées' },
];

function statusBadgeVariant(
  status: OrganizationSignupRequest['status']
): 'trial' | 'active' | 'suspended' {
  if (status === 'approved') return 'active';
  if (status === 'rejected') return 'suspended';
  return 'trial';
}

export function PlatformSignupRequestsPanel() {
  const [filter, setFilter] = useState('');
  const [requests, setRequests] = useState<OrganizationSignupRequest[]>([]);
  const [selected, setSelected] = useState<OrganizationSignupRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await platformAPI.signupRequests.list(filter || undefined);
      if (res.data?.success) {
        setRequests(res.data.requests || []);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectRequest = async (id: string) => {
    setMsg('');
    try {
      const res = await platformAPI.signupRequests.get(id);
      if (res.data?.success) {
        const r = res.data.request;
        setSelected(r);
        setRejectReason(r.rejectReason || '');
        setInternalNotes(r.internalNotes || '');
      }
    } catch {
      setSelected(null);
    }
  };

  const patch = async (data: Parameters<typeof platformAPI.signupRequests.update>[1]) => {
    if (!selected) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await platformAPI.signupRequests.update(selected.id, data);
      if (res.data?.success) {
        setSelected(res.data.request);
        setMsg('Enregistré');
        await load();
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Échec');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Demandes d&apos;espace organisation</h1>
          <p className="text-sm text-gray-600">Avocats, conseil, associations — validation manuelle.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md bg-white hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {error}
        </div>
      )}
      {msg && (
        <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-md px-4 py-3">
          {msg}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-xs rounded-full border ${
              filter === f.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white border rounded-lg overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-gray-500">Chargement…</p>
          ) : requests.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Aucune demande.</p>
          ) : (
            <ul className="divide-y max-h-[70vh] overflow-y-auto">
              {requests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void selectRequest(r.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                      selected?.id === r.id ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{r.structureName}</div>
                        <div className="text-xs text-gray-500">{r.organizationTypeLabel}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{r.contactEmail}</div>
                      </div>
                      <PlatformStatusBadge status={statusBadgeVariant(r.status)} label={r.statusLabel} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border rounded-lg p-6 space-y-4 lg:sticky lg:top-20">
          {!selected ? (
            <p className="text-sm text-gray-500">Sélectionnez une demande.</p>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold">{selected.structureName}</h2>
                <p className="text-sm text-gray-600">{selected.organizationTypeLabel}</p>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500">Contact</dt>
                  <dd>{selected.contactName}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd>{selected.contactEmail}</dd>
                </div>
                {selected.phone && (
                  <div>
                    <dt className="text-gray-500">Téléphone</dt>
                    <dd>{selected.phone}</dd>
                  </div>
                )}
                {selected.city && (
                  <div>
                    <dt className="text-gray-500">Ville</dt>
                    <dd>{selected.city}</dd>
                  </div>
                )}
                {selected.barreau && (
                  <div>
                    <dt className="text-gray-500">Barreau</dt>
                    <dd>{selected.barreau}</dd>
                  </div>
                )}
                {selected.siret && (
                  <div>
                    <dt className="text-gray-500">SIRET</dt>
                    <dd>{selected.siret}</dd>
                  </div>
                )}
                {selected.desiredSlug && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Slug souhaité</dt>
                    <dd className="font-mono text-xs">{selected.desiredSlug}</dd>
                  </div>
                )}
                {selected.desiredDomains && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Domaines souhaités</dt>
                    <dd className="whitespace-pre-wrap text-xs">{selected.desiredDomains}</dd>
                  </div>
                )}
                {selected.message && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Message</dt>
                    <dd className="whitespace-pre-wrap">{selected.message}</dd>
                  </div>
                )}
              </dl>

              <label className="block text-sm">
                <span className="font-medium">Notes internes</span>
                <textarea
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm min-h-[72px]"
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Motif de refus</span>
                <input
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void patch({ status: 'in_review', internalNotes, rejectReason })}
                  className="px-3 py-2 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Prendre en charge
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void patch({ status: 'approved', internalNotes, rejectReason })}
                  className="px-3 py-2 text-sm border rounded-md bg-green-50 hover:bg-green-100 disabled:opacity-50"
                >
                  Marquer acceptée
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void patch({ status: 'rejected', internalNotes, rejectReason })}
                  className="px-3 py-2 text-sm border rounded-md bg-red-50 hover:bg-red-100 disabled:opacity-50"
                >
                  Refuser
                </button>
                <Link
                  href={`/platform/cabinets/new?fromRequest=${selected.id}`}
                  className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  Créer l&apos;espace
                </Link>
              </div>
              <p className="text-xs text-gray-500">
                Créé le {new Date(selected.createdAt).toLocaleString('fr-FR')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { platformOrganizationsAPI, type PlatformOrganization } from '@/lib/api';
import { Building2, CheckCircle2, Circle, ExternalLink, Plus, RefreshCw } from 'lucide-react';

type DnsStep = {
  id: string;
  title: string;
  description: string;
  done?: boolean;
  link?: string;
};

type DnsChecklist = {
  slug: string;
  primaryDomain: string;
  steps: DnsStep[];
};

/** Slugs non supprimables (miroir backend PLATFORM_PROTECTED_ORG_SLUGS). */
const PROTECTED_DELETE_SLUGS = new Set(['cabinet-wadepaw']);

const emptyForm = {
  slug: '',
  mongoUri: '',
  status: 'trial' as 'trial' | 'active' | 'suspended',
  brandingName: '',
  primaryColor: '#2A4DD0',
  domains: '',
  emailFrom: '',
  brevoApiKey: '',
};

export function PlatformCabinetsConsole() {
  const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<DnsChecklist | null>(null);
  const [provision, setProvision] = useState({
    email: '',
    password: '',
    firstName: 'Admin',
    lastName: 'Cabinet',
  });
  const [provisionMsg, setProvisionMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await platformOrganizationsAPI.list();
      if (res.data?.success) {
        setOrgs(res.data.organizations || []);
      } else {
        setError(res.data?.message || 'Chargement impossible');
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

  const loadChecklist = async (slug: string) => {
    setSelectedSlug(slug);
    setChecklist(null);
    setProvisionMsg('');
    try {
      const res = await platformOrganizationsAPI.dnsChecklist(slug);
      if (res.data?.success) {
        setChecklist(res.data.checklist);
      }
    } catch {
      setChecklist(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const slug = form.slug.trim().toLowerCase();
    try {
      const domains = form.domains
        .split(/[\n,]/)
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const res = await platformOrganizationsAPI.create({
        slug,
        mongoUri: form.mongoUri.trim(),
        status: form.status,
        domains,
        branding: {
          name: form.brandingName.trim(),
          primaryColor: form.primaryColor,
        },
        email: {
          from: form.emailFrom,
          brevoApiKey: form.brevoApiKey,
          replyTo: form.emailFrom,
        },
      });
      if (res.data?.success) {
        setShowForm(false);
        setForm(emptyForm);
        await load();
        if (res.data.checklist) {
          setSelectedSlug(slug);
          setChecklist(res.data.checklist);
        }
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Création impossible');
    } finally {
      setSaving(false);
    }
  };

  const handleSuspend = async (slug: string) => {
    if (!confirm(`Suspendre le cabinet « ${slug} » ?`)) return;
    try {
      await platformOrganizationsAPI.suspend(slug);
      if (selectedSlug === slug) {
        setSelectedSlug(null);
        setChecklist(null);
      }
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Suspension impossible');
    }
  };

  const handleReactivate = async (slug: string) => {
    if (!confirm(`Réactiver le cabinet « ${slug} » ?`)) return;
    try {
      await platformOrganizationsAPI.reactivate(slug);
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Réactivation impossible');
    }
  };

  const handleDeletePermanent = async (slug: string) => {
    const typed = window.prompt(
      `Suppression définitive de « ${slug} ».\n\n` +
        `• La fiche organization (base maître) sera supprimée.\n` +
        `• La base MongoDB du cabinet n’est PAS effacée automatiquement.\n\n` +
        `Tapez exactement le slug pour confirmer :`
    );
    if (typed?.trim().toLowerCase() !== slug) {
      if (typed !== null) {
        setError('Confirmation annulée : le slug saisi ne correspond pas.');
      }
      return;
    }
    try {
      const res = await platformOrganizationsAPI.deletePermanent(slug);
      if (selectedSlug === slug) {
        setSelectedSlug(null);
        setChecklist(null);
      }
      await load();
      setError('');
      window.alert(res.data?.message || 'Cabinet supprimé de la plateforme.');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Suppression impossible');
    }
  };

  const handleProvision = async () => {
    if (!selectedSlug) return;
    setProvisionMsg('');
    try {
      const res = await platformOrganizationsAPI.provisionAdmin(selectedSlug, provision);
      setProvisionMsg(res.data?.message || 'OK');
      await loadChecklist(selectedSlug);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setProvisionMsg(err?.response?.data?.message || 'Échec');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            Organisations — gestion multi-tenant
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Cabinets d&apos;avocats, conseil, associations… provisioning et checklist DNS.
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
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nouvelle organisation
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 shadow-sm"
        >
          <h2 className="font-semibold text-lg">Créer une organisation</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium">Slug</span>
              <input
                required
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                placeholder="cabinet-nouveau"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Statut</span>
              <select
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as typeof form.status })
                }
              >
                <option value="trial">trial</option>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium">MongoDB URI</span>
              <input
                required
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono"
                placeholder="mongodb+srv://..."
                value={form.mongoUri}
                onChange={(e) => setForm({ ...form, mongoUri: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Nom affiché</span>
              <input
                required
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={form.brandingName}
                onChange={(e) => setForm({ ...form, brandingName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Couleur primaire</span>
              <input
                type="color"
                className="mt-1 h-10 w-full border rounded-md"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium">Domaines (un par ligne ou virgule)</span>
              <textarea
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono h-20"
                placeholder={'nouveau.localhost\nnouveau.adapapers.fr'}
                value={form.domains}
                onChange={(e) => setForm({ ...form, domains: e.target.value })}
              />
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="px-4 py-2 text-sm border rounded-md"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-primary text-white rounded-md disabled:opacity-50"
            >
              {saving ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Cabinet</th>
                <th className="text-left px-4 py-3 font-medium">Statut</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Domaines</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    Chargement…
                  </td>
                </tr>
              ) : orgs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    Aucun cabinet — lancez{' '}
                    <code className="text-xs bg-gray-100 px-1">npm run seed:master-orgs</code>
                  </td>
                </tr>
              ) : (
                orgs.map((org) => (
                  <tr key={org.id} className="border-t hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium">{org.branding?.name || org.slug}</div>
                      <div className="text-xs text-gray-500 font-mono">{org.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          org.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : org.status === 'suspended'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {org.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-600 max-w-[200px] truncate">
                      {(org.domains || []).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                        <button
                          type="button"
                          className="text-primary hover:underline text-xs"
                          onClick={() => loadChecklist(org.slug)}
                        >
                          Checklist
                        </button>
                        {org.status === 'suspended' ? (
                          <>
                            <button
                              type="button"
                              className="text-green-700 hover:underline text-xs font-medium"
                              onClick={() => handleReactivate(org.slug)}
                            >
                              Réactiver
                            </button>
                            {!PROTECTED_DELETE_SLUGS.has(org.slug) && (
                              <button
                                type="button"
                                className="text-red-700 hover:underline text-xs font-medium"
                                onClick={() => handleDeletePermanent(org.slug)}
                              >
                                Supprimer définitivement
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            className="text-red-600 hover:underline text-xs"
                            onClick={() => handleSuspend(org.slug)}
                          >
                            Suspendre
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4 h-fit">
          <h2 className="font-semibold">Checklist & provisioning</h2>
          {!selectedSlug ? (
            <p className="text-sm text-gray-500">Sélectionnez un cabinet via « Checklist ».</p>
          ) : (
            <>
              <p className="text-xs font-mono text-gray-600">{selectedSlug}</p>
              {checklist?.steps.map((step) => (
                <div key={step.id} className="flex gap-2 text-sm">
                  {step.done ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300 shrink-0" />
                  )}
                  <div>
                    <div className="font-medium">{step.title}</div>
                    <p className="text-gray-600 text-xs mt-0.5">{step.description}</p>
                    {step.link && (
                      <a
                        href={step.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary text-xs mt-1"
                      >
                        Doc <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}

              <hr className="border-gray-200" />
              <h3 className="text-sm font-medium">Premier admin cabinet</h3>
              <input
                className="w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder="admin@cabinet.fr"
                value={provision.email}
                onChange={(e) => setProvision({ ...provision, email: e.target.value })}
              />
              <input
                type="password"
                className="w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder="Mot de passe"
                value={provision.password}
                onChange={(e) => setProvision({ ...provision, password: e.target.value })}
              />
              <button
                type="button"
                onClick={handleProvision}
                className="w-full py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
              >
                Provisionner l&apos;admin
              </button>
              {provisionMsg && (
                <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded">{provisionMsg}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

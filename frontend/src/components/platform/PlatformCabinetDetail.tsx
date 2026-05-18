'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { platformAPI } from '@/lib/platform/platformApi';
import {
  AUDIT_ACTION_LABELS,
  PLATFORM_MODULE_OPTIONS,
  type OrgChecklist,
  type PlatformAuditEntry,
  type PlatformOrganization,
  type TenantHealth,
} from '@/lib/platform/types';
import { cabinetAdminUrl, cabinetDevUrl, cabinetSignInUrl } from '@/lib/platform/cabinetUrls';
import { PlatformStatusBadge } from './PlatformStatusBadge';
import { PlatformCabinetUsersPanel } from './PlatformCabinetUsersPanel';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
} from 'lucide-react';

const PROTECTED_DELETE_SLUGS = new Set(['cabinet-wadepaw']);

const TABS = [
  { id: 'general', label: 'Général' },
  { id: 'domains', label: 'Domaines' },
  { id: 'technique', label: 'Technique' },
  { id: 'branding', label: 'Branding' },
  { id: 'email', label: 'Email' },
  { id: 'limits', label: 'Limites' },
  { id: 'users', label: 'Utilisateurs' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'audit', label: 'Audit' },
] as const;

type TabId = (typeof TABS)[number]['id'];

type Props = { slug: string };

export function PlatformCabinetDetail({ slug }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('general');
  const [org, setOrg] = useState<PlatformOrganization | null>(null);
  const [health, setHealth] = useState<TenantHealth | null>(null);
  const [checklist, setChecklist] = useState<OrgChecklist | null>(null);
  const [audit, setAudit] = useState<PlatformAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [revealSecrets, setRevealSecrets] = useState(false);

  const [form, setForm] = useState({
    status: 'trial' as PlatformOrganization['status'],
    mongoUri: '',
    brandingName: '',
    primaryColor: '#2A4DD0',
    logo: '',
    favicon: '',
    domains: '',
    emailFrom: '',
    replyTo: '',
    brevoApiKey: '',
    maxUsers: 50,
    maxStorageGb: 20,
    modules: [] as string[],
  });

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
      const res = await platformAPI.organizations.get(slug, revealSecrets);
      if (!res.data?.success) {
        setError('Cabinet introuvable');
        return;
      }
      const o = res.data.organization;
      setOrg(o);
      setHealth(res.data.health);
      setChecklist(res.data.checklist);
      setForm({
        status: o.status,
        mongoUri: o.mongoUri || '',
        brandingName: o.branding?.name || '',
        primaryColor: o.branding?.primaryColor || '#2A4DD0',
        logo: o.branding?.logo || '',
        favicon: o.branding?.favicon || '',
        domains: (o.domains || []).join('\n'),
        emailFrom: o.email?.from || '',
        replyTo: o.email?.replyTo || '',
        brevoApiKey: o.email?.brevoApiKey || '',
        maxUsers: o.limits?.maxUsers ?? 50,
        maxStorageGb: o.limits?.maxStorageGb ?? 20,
        modules: o.limits?.modules || [],
      });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err?.response?.data?.message || err.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [slug, revealSecrets]);

  const loadAudit = useCallback(async () => {
    try {
      const res = await platformAPI.organizations.auditLogs(slug);
      if (res.data?.success) setAudit(res.data.logs || []);
    } catch {
      setAudit([]);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === 'audit') void loadAudit();
  }, [tab, loadAudit]);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const domains = form.domains
        .split(/[\n,]/)
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const payload: Record<string, unknown> = {
        status: form.status,
        branding: {
          name: form.brandingName.trim(),
          primaryColor: form.primaryColor,
          logo: form.logo,
          favicon: form.favicon,
        },
        domains,
        email: {
          from: form.emailFrom,
          replyTo: form.replyTo || form.emailFrom,
        },
        limits: {
          maxUsers: form.maxUsers,
          maxStorageGb: form.maxStorageGb,
          modules: form.modules,
        },
      };
      if (form.mongoUri.trim()) payload.mongoUri = form.mongoUri.trim();
      if (form.brevoApiKey.trim()) {
        (payload.email as Record<string, string>).brevoApiKey = form.brevoApiKey.trim();
      }
      const res = await platformAPI.organizations.update(slug, payload);
      if (res.data?.success) {
        setMsg('Enregistré');
        await load();
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Échec enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleSuspend = async () => {
    if (!confirm(`Suspendre « ${slug} » ?`)) return;
    try {
      await platformAPI.organizations.suspend(slug);
      await load();
      setMsg('Cabinet suspendu');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Échec');
    }
  };

  const handleReactivate = async () => {
    if (!confirm(`Réactiver « ${slug} » ?`)) return;
    try {
      await platformAPI.organizations.reactivate(slug);
      await load();
      setMsg('Cabinet réactivé');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Échec');
    }
  };

  const handleDeletePermanent = async () => {
    const typed = window.prompt(`Tapez exactement le slug pour supprimer définitivement : ${slug}`);
    if (typed?.trim().toLowerCase() !== slug) return;
    try {
      await platformAPI.organizations.deletePermanent(slug);
      router.push('/platform/cabinets');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Échec');
    }
  };

  const handleProvision = async () => {
    setProvisionMsg('');
    try {
      const res = await platformAPI.organizations.provisionAdmin(slug, provision);
      setProvisionMsg(res.data?.message || 'OK');
      const checklistRes = await platformAPI.organizations.checklist(slug);
      if (checklistRes.data?.success) setChecklist(checklistRes.data.checklist);
      const healthRes = await platformAPI.organizations.health(slug);
      if (healthRes.data?.success) setHealth(healthRes.data.health);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setProvisionMsg(err?.response?.data?.message || 'Échec');
    }
  };

  const toggleModule = (mod: string) => {
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(mod) ? f.modules.filter((m) => m !== mod) : [...f.modules, mod],
    }));
  };

  if (loading && !org) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-10 w-10 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <p className="text-red-600">{error || 'Cabinet introuvable'}</p>
        <Link href="/platform/cabinets" className="text-primary hover:underline">
          Retour
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/platform/cabinets" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Cabinets
          </Link>
          <h1 className="text-2xl font-bold mt-2 flex items-center gap-2 flex-wrap">
            {org.branding?.name || org.slug}
            <PlatformStatusBadge status={org.status} />
          </h1>
          <p className="text-xs font-mono text-gray-500">{org.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRevealSecrets((v) => !v)}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-md hover:bg-gray-50"
          >
            {revealSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            Secrets
          </button>
          {org.status === 'suspended' ? (
            <>
              <button
                type="button"
                onClick={() => void handleReactivate()}
                className="px-3 py-2 text-sm bg-green-700 text-white rounded-md"
              >
                Réactiver
              </button>
              {!PROTECTED_DELETE_SLUGS.has(slug) && (
                <button
                  type="button"
                  onClick={() => void handleDeletePermanent()}
                  className="px-3 py-2 text-sm bg-red-700 text-white rounded-md"
                >
                  Supprimer définitivement
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => void handleSuspend()}
              className="px-3 py-2 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50"
            >
              Suspendre
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-primary text-white rounded-md disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Enregistrer
          </button>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</div>}
      {msg && <div className="rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3">{msg}</div>}

      <div className="flex flex-wrap gap-4 text-sm">
        <a href={cabinetDevUrl(org)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Site dev <ExternalLink className="inline h-3 w-3" />
        </a>
        <a href={cabinetAdminUrl(org)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Admin <ExternalLink className="inline h-3 w-3" />
        </a>
        <a href={cabinetSignInUrl(org)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Connexion <ExternalLink className="inline h-3 w-3" />
        </a>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === t.id ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        {tab === 'general' && (
          <>
            <label className="block text-sm">
              <span className="font-medium">Statut</span>
              <select
                className="mt-1 w-full max-w-xs border rounded-md px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as PlatformOrganization['status'] })
                }
              >
                <option value="trial">trial</option>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
            </label>
            <p className="text-xs text-gray-500">
              Créé : {org.createdAt ? new Date(org.createdAt).toLocaleString('fr-FR') : '—'}
            </p>
          </>
        )}

        {tab === 'domains' && (
          <label className="block text-sm">
            <span className="font-medium">Domaines (un par ligne)</span>
            <textarea
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono h-32"
              value={form.domains}
              onChange={(e) => setForm({ ...form, domains: e.target.value })}
            />
          </label>
        )}

        {tab === 'technique' && (
          <>
            <label className="block text-sm">
              <span className="font-medium">MongoDB URI</span>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono"
                value={form.mongoUri}
                onChange={(e) => setForm({ ...form, mongoUri: e.target.value })}
              />
            </label>
            {health && (
              <dl className="text-sm grid sm:grid-cols-2 gap-2 bg-gray-50 p-4 rounded-md">
                <div>
                  <dt className="text-gray-500">Mongo</dt>
                  <dd className={health.mongoOk ? 'text-green-700' : 'text-red-700'}>
                    {health.mongoOk ? 'OK' : 'KO'} ({health.latencyMs} ms)
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Base</dt>
                  <dd className="font-mono text-xs">{health.dbName || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Admins</dt>
                  <dd>{health.adminCount}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Utilisateurs</dt>
                  <dd>{health.userCount}</dd>
                </div>
                {health.error && (
                  <div className="sm:col-span-2 text-red-600 text-xs">{health.error}</div>
                )}
              </dl>
            )}
          </>
        )}

        {tab === 'branding' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">Nom</span>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={form.brandingName}
                onChange={(e) => setForm({ ...form, brandingName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Couleur</span>
              <input
                type="color"
                className="mt-1 h-10 w-full border rounded-md"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Logo URL</span>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={form.logo}
                onChange={(e) => setForm({ ...form, logo: e.target.value })}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">Favicon URL</span>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={form.favicon}
                onChange={(e) => setForm({ ...form, favicon: e.target.value })}
              />
            </label>
          </div>
        )}

        {tab === 'email' && (
          <>
            <label className="block text-sm">
              <span className="font-medium">From</span>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={form.emailFrom}
                onChange={(e) => setForm({ ...form, emailFrom: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Reply-To</span>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={form.replyTo}
                onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Clé Brevo</span>
              <input
                type="password"
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                placeholder={org.email?.hasBrevoApiKey ? '•••• (laisser vide pour conserver)' : ''}
                value={form.brevoApiKey}
                onChange={(e) => setForm({ ...form, brevoApiKey: e.target.value })}
              />
            </label>
          </>
        )}

        {tab === 'limits' && (
          <>
            <label className="block text-sm">
              <span className="font-medium">Max utilisateurs</span>
              <input
                type="number"
                min={1}
                className="mt-1 w-full max-w-xs border rounded-md px-3 py-2 text-sm"
                value={form.maxUsers}
                onChange={(e) => setForm({ ...form, maxUsers: Number(e.target.value) })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Stockage max (Go)</span>
              <input
                type="number"
                min={1}
                className="mt-1 w-full max-w-xs border rounded-md px-3 py-2 text-sm"
                value={form.maxStorageGb}
                onChange={(e) => setForm({ ...form, maxStorageGb: Number(e.target.value) })}
              />
            </label>
            <fieldset>
              <legend className="text-sm font-medium">Modules</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {PLATFORM_MODULE_OPTIONS.map((mod) => (
                  <label key={mod} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.modules.includes(mod)}
                      onChange={() => toggleModule(mod)}
                    />
                    {mod}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {tab === 'users' && <PlatformCabinetUsersPanel slug={slug} active={tab === 'users'} />}

        {tab === 'checklist' && (
          <div className="space-y-4">
            {checklist?.steps.map((step) => (
              <div key={step.id} className="flex gap-2 text-sm">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300 shrink-0" />
                )}
                <div>
                  <div className="font-medium">{step.title}</div>
                  <p className="text-gray-600 text-xs">{step.description}</p>
                  {step.records?.map((r, i) => (
                    <p key={i} className="text-xs font-mono mt-1 bg-gray-50 p-1 rounded">
                      {r.type} {r.name} → {r.value}
                    </p>
                  ))}
                </div>
              </div>
            ))}
            <hr />
            <h3 className="font-medium text-sm">Premier admin</h3>
            <input
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              placeholder="admin@cabinet.fr"
              value={provision.email}
              onChange={(e) => setProvision({ ...provision, email: e.target.value })}
            />
            <input
              type="password"
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              value={provision.password}
              onChange={(e) => setProvision({ ...provision, password: e.target.value })}
            />
            <button
              type="button"
              onClick={() => void handleProvision()}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md"
            >
              Provisionner
            </button>
            {provisionMsg && <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded">{provisionMsg}</p>}
          </div>
        )}

        {tab === 'audit' && (
          <ul className="text-sm space-y-2 max-h-96 overflow-y-auto">
            {audit.length === 0 ? (
              <li className="text-gray-500">Aucun événement.</li>
            ) : (
              audit.map((a) => (
                <li key={a.id} className="border-b pb-2">
                  <span className="font-medium">{AUDIT_ACTION_LABELS[a.action] || a.action}</span>
                  <span className="text-xs text-gray-500 block">
                    {a.actorEmail} — {new Date(a.createdAt).toLocaleString('fr-FR')}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

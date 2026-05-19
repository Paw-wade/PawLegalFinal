'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { platformAPI } from '@/lib/platform/platformApi';
import { suggestedDomainsForSlug } from '@/lib/platform/cabinetUrls';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

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

export function PlatformCabinetWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromRequest = searchParams.get('fromRequest');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [prefillNote, setPrefillNote] = useState('');

  useEffect(() => {
    if (!fromRequest) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await platformAPI.signupRequests.get(fromRequest);
        if (cancelled || !res.data?.success) return;
        const r = res.data.request;
        const slug =
          r.desiredSlug ||
          `cabinet-${r.structureName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40)}`;
        setForm((f) => ({
          ...f,
          slug,
          brandingName: r.structureName,
          domains: r.desiredDomains || f.domains,
        }));
        setPrefillNote(`Pré-rempli depuis la demande de ${r.contactName} (${r.contactEmail}).`);
        await platformAPI.signupRequests.update(fromRequest, {
          status: 'in_review',
          organizationSlug: slug,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromRequest]);

  const applySuggestedDomains = () => {
    const slug = form.slug.trim().toLowerCase();
    if (!slug) return;
    setForm({ ...form, domains: suggestedDomainsForSlug(slug).join('\n') });
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    const slug = form.slug.trim().toLowerCase();
    try {
      const domains = form.domains
        .split(/[\n,]/)
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const res = await platformAPI.organizations.create({
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
        if (fromRequest) {
          await platformAPI.signupRequests.update(fromRequest, {
            status: 'approved',
            organizationSlug: slug,
          });
        }
        router.push(`/platform/cabinets/${slug}`);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Création impossible');
    } finally {
      setSaving(false);
    }
  };

  const steps = ['Identité', 'Technique', 'Domaines & email', 'Confirmation'];

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
      <div>
        <Link href="/platform/cabinets" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Retour aux cabinets
        </Link>
        <h1 className="text-2xl font-bold mt-2">Nouveau cabinet</h1>
        <p className="text-sm text-gray-600">Étape {step + 1} / {steps.length} — {steps[step]}</p>
        {prefillNote && <p className="text-xs text-primary mt-1">{prefillNote}</p>}
      </div>

      <div className="flex gap-1">
        {steps.map((label, i) => (
          <div
            key={label}
            className={`flex-1 h-1 rounded ${i <= step ? 'bg-primary' : 'bg-gray-200'}`}
            title={label}
          />
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</div>
      )}

      <div className="bg-white border rounded-lg p-6 space-y-4">
        {step === 0 && (
          <>
            <label className="block text-sm">
              <span className="font-medium">Slug</span>
              <input
                required
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono"
                placeholder="cabinet-nouveau"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
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
              <span className="font-medium">Statut initial</span>
              <select
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as typeof form.status })
                }
              >
                <option value="trial">trial</option>
                <option value="active">active</option>
              </select>
            </label>
          </>
        )}

        {step === 1 && (
          <label className="block text-sm">
            <span className="font-medium">MongoDB URI</span>
            <input
              required
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono"
              placeholder="mongodb+srv://..."
              value={form.mongoUri}
              onChange={(e) => setForm({ ...form, mongoUri: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">Base dédiée au tenant (non effacée si suppression plateforme).</p>
          </label>
        )}

        {step === 2 && (
          <>
            <label className="block text-sm">
              <span className="font-medium">Domaines</span>
              <textarea
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono h-28"
                value={form.domains}
                onChange={(e) => setForm({ ...form, domains: e.target.value })}
              />
              <button
                type="button"
                className="mt-2 text-xs text-primary hover:underline"
                onClick={applySuggestedDomains}
              >
                Suggérer domaines pour ce slug
              </button>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Email expéditeur</span>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                placeholder="contact@cabinet.fr"
                value={form.emailFrom}
                onChange={(e) => setForm({ ...form, emailFrom: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Clé Brevo (optionnel)</span>
              <input
                type="password"
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={form.brevoApiKey}
                onChange={(e) => setForm({ ...form, brevoApiKey: e.target.value })}
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
          </>
        )}

        {step === 3 && (
          <dl className="text-sm space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Slug</dt>
              <dd className="font-mono">{form.slug}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Nom</dt>
              <dd>{form.brandingName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Statut</dt>
              <dd>{form.status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Mongo</dt>
              <dd className="font-mono text-xs truncate max-w-[240px]">{form.mongoUri ? '••• configuré' : '—'}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
          className="inline-flex items-center gap-1 px-4 py-2 text-sm border rounded-md disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
          Précédent
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => {
              if (step === 0 && !form.slug.trim()) {
                setError('Slug requis');
                return;
              }
              if (step === 1 && !form.mongoUri.trim()) {
                setError('Mongo URI requis');
                return;
              }
              setError('');
              setStep((s) => s + 1);
            }}
            className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-primary text-white rounded-md"
          >
            Suivant
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleCreate()}
            className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-primary text-white rounded-md disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {saving ? 'Création…' : 'Créer le cabinet'}
          </button>
        )}
      </div>
    </div>
  );
}

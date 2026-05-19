'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import {
  ORGANIZATION_TYPE_OPTIONS,
  TEAM_SIZE_OPTIONS,
  submitOrganizationSignup,
  type OrganizationType,
} from '@/lib/organizationSignup';
import { tenantPrimaryButtonClass } from '@/lib/tenant/tenantPrimaryClasses';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

const inputClass =
  'mt-1 w-full border-2 border-input rounded-lg px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

export default function DevenirCabinetPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    organizationType: 'consulting' as OrganizationType,
    organizationTypeOther: '',
    structureName: '',
    contactName: '',
    contactEmail: '',
    phone: '',
    city: '',
    barreau: '',
    siret: '',
    teamSize: '',
    practiceArea: '',
    desiredSlug: '',
    desiredDomains: '',
    message: '',
    gdprConsent: false,
    website: '',
  });

  const isLawFirm = form.organizationType === 'law_firm';
  const isOther = form.organizationType === 'other';

  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!form.organizationType) return 'Choisissez un type de structure';
      if (isOther && !form.organizationTypeOther.trim()) return 'Précisez le type de structure';
      if (!form.structureName.trim()) return 'Indiquez le nom de la structure';
    }
    if (s === 1) {
      if (!form.contactName.trim()) return 'Indiquez le nom du contact';
      if (!form.contactEmail.trim()) return 'Indiquez un email valide';
    }
    if (s === 2) {
      if (!form.gdprConsent) return 'Vous devez accepter le traitement des données';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validateStep(2);
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await submitOrganizationSignup({
        organizationType: form.organizationType,
        organizationTypeOther: isOther ? form.organizationTypeOther.trim() : undefined,
        structureName: form.structureName.trim(),
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim(),
        phone: form.phone.trim() || undefined,
        city: form.city.trim() || undefined,
        barreau: isLawFirm ? form.barreau.trim() || undefined : undefined,
        siret: form.siret.trim() || undefined,
        teamSize: form.teamSize || undefined,
        practiceArea: form.practiceArea.trim() || undefined,
        desiredSlug: form.desiredSlug.trim() || undefined,
        desiredDomains: form.desiredDomains.trim() || undefined,
        message: form.message.trim() || undefined,
        gdprConsent: 'true',
        website: form.website,
      });
      if (res.data?.success) {
        setDone(true);
      } else {
        setError(res.data?.message || 'Envoi impossible');
      }
    } catch (e: unknown) {
      const errRes = e as { response?: { data?: { message?: string } }; message?: string };
      setError(errRes?.response?.data?.message || errRes.message || 'Envoi impossible');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header variant="home" showNav={false} />
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="max-w-md text-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-primary mx-auto" />
            <h1 className="text-2xl font-bold">Demande envoyée</h1>
            <p className="text-muted-foreground text-sm">
              Nous avons bien reçu votre demande pour <strong>{form.structureName}</strong>. Notre
              équipe vous recontactera à <strong>{form.contactEmail}</strong>.
            </p>
            <Link href="/" className={`inline-flex px-6 py-2.5 rounded-md text-sm ${tenantPrimaryButtonClass}`}>
              Retour à l&apos;accueil
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const steps = ['Structure', 'Contact', 'Projet'];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header variant="home" showNav={false} />
      <main className="flex-1 py-10 px-4">
        <div className="max-w-xl mx-auto space-y-6">
          <div>
            <Link href="/" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" />
              Accueil
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold mt-3">Demander un espace dédié</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Cabinets d&apos;avocats, cabinets de conseil, associations ou structures
              d&apos;accompagnement : décrivez votre organisation pour obtenir un environnement Ada
              Papers.
            </p>
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
          <p className="text-xs text-gray-500">
            Étape {step + 1} / {steps.length} — {steps[step]}
          </p>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
            {step === 0 && (
              <>
                <label className="block text-sm">
                  <span className="font-medium">Type de structure</span>
                  <select
                    className={inputClass}
                    value={form.organizationType}
                    onChange={(e) =>
                      setForm({ ...form, organizationType: e.target.value as OrganizationType })
                    }
                  >
                    {ORGANIZATION_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {isOther && (
                  <label className="block text-sm">
                    <span className="font-medium">Précisez</span>
                    <input
                      className={inputClass}
                      value={form.organizationTypeOther}
                      onChange={(e) => setForm({ ...form, organizationTypeOther: e.target.value })}
                    />
                  </label>
                )}
                <label className="block text-sm">
                  <span className="font-medium">Nom de la structure</span>
                  <input
                    required
                    className={inputClass}
                    value={form.structureName}
                    onChange={(e) => setForm({ ...form, structureName: e.target.value })}
                    placeholder="Ex. Cabinet Dupont, Conseil Horizon…"
                  />
                </label>
                {isLawFirm && (
                  <label className="block text-sm">
                    <span className="font-medium">Barreau (optionnel)</span>
                    <input
                      className={inputClass}
                      value={form.barreau}
                      onChange={(e) => setForm({ ...form, barreau: e.target.value })}
                    />
                  </label>
                )}
                {!isLawFirm && (
                  <label className="block text-sm">
                    <span className="font-medium">SIRET (optionnel)</span>
                    <input
                      className={inputClass}
                      value={form.siret}
                      onChange={(e) => setForm({ ...form, siret: e.target.value })}
                    />
                  </label>
                )}
              </>
            )}

            {step === 1 && (
              <>
                <label className="block text-sm">
                  <span className="font-medium">Personne de contact</span>
                  <input
                    required
                    className={inputClass}
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Email professionnel</span>
                  <input
                    type="email"
                    required
                    className={inputClass}
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Téléphone (optionnel)</span>
                  <input
                    className={inputClass}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Ville (optionnel)</span>
                  <input
                    className={inputClass}
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </label>
              </>
            )}

            {step === 2 && (
              <>
                <label className="block text-sm">
                  <span className="font-medium">Effectif estimé</span>
                  <select
                    className={inputClass}
                    value={form.teamSize}
                    onChange={(e) => setForm({ ...form, teamSize: e.target.value })}
                  >
                    <option value="">—</option>
                    {TEAM_SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Domaine d&apos;activité principal (optionnel)</span>
                  <input
                    className={inputClass}
                    value={form.practiceArea}
                    onChange={(e) => setForm({ ...form, practiceArea: e.target.value })}
                    placeholder="Ex. droit des étrangers, conseil RH…"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Identifiant souhaité (slug, optionnel)</span>
                  <input
                    className={`${inputClass} font-mono`}
                    value={form.desiredSlug}
                    onChange={(e) => setForm({ ...form, desiredSlug: e.target.value })}
                    placeholder="cabinet-exemple"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Domaines web souhaités (optionnel)</span>
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={form.desiredDomains}
                    onChange={(e) => setForm({ ...form, desiredDomains: e.target.value })}
                    placeholder="exemple.adapapers.fr&#10;exemple.localhost"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Message (optionnel)</span>
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                  />
                </label>
                <input
                  type="text"
                  name="website"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                />
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-primary"
                    checked={form.gdprConsent}
                    onChange={(e) => setForm({ ...form, gdprConsent: e.target.checked })}
                  />
                  <span>
                    J&apos;accepte que mes données soient traitées par Ada Papers pour étudier cette
                    demande, conformément à la{' '}
                    <Link href="/politique-confidentialite" className="text-primary underline">
                      politique de confidentialité
                    </Link>
                    .
                  </span>
                </label>
              </>
            )}
          </div>

          <div className="flex justify-between gap-3">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => {
                setError('');
                setStep((s) => s - 1);
              }}
              className="px-4 py-2 text-sm border rounded-md disabled:opacity-40"
            >
              Précédent
            </button>
            {step < 2 ? (
              <button
                type="button"
                className={`inline-flex items-center gap-1 px-4 py-2 text-sm rounded-md ${tenantPrimaryButtonClass}`}
                onClick={() => {
                  const v = validateStep(step);
                  if (v) {
                    setError(v);
                    return;
                  }
                  setError('');
                  setStep((s) => s + 1);
                }}
              >
                Suivant
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleSubmit()}
                className={`inline-flex items-center gap-1 px-4 py-2 text-sm rounded-md disabled:opacity-50 ${tenantPrimaryButtonClass}`}
              >
                {loading ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

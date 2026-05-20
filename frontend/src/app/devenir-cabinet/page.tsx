'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SaasMarketingShell } from '@/components/saas/SaasMarketingShell';
import { saasInputClass, saasPrimaryButtonClass } from '@/components/saas/saasMarketingStyles';
import {
  ORGANIZATION_TYPE_OPTIONS,
  TEAM_SIZE_OPTIONS,
  submitOrganizationSignup,
  type OrganizationType,
} from '@/lib/organizationSignup';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

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
      <SaasMarketingShell>
        <div className="flex items-center justify-center px-4 py-16 md:py-24">
          <div className="max-w-md text-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-orange-500 mx-auto" />
            <h1 className="text-2xl font-bold text-slate-900">Demande envoyée</h1>
            <p className="text-slate-600 text-sm">
              Nous avons bien reçu votre demande pour <strong>{form.structureName}</strong>. Notre
              équipe vous recontactera à <strong>{form.contactEmail}</strong>.
            </p>
            <Link href="/saas" className={saasPrimaryButtonClass}>
              Retour à la plateforme Ada Papers
            </Link>
          </div>
        </div>
      </SaasMarketingShell>
    );
  }

  const steps = ['Structure', 'Contact', 'Projet'];

  return (
    <SaasMarketingShell>
      <div className="py-10 px-4 md:py-14">
        <div className="max-w-xl mx-auto space-y-6">
          <div>
            <Link
              href="/saas"
              className="text-sm text-orange-600 hover:text-orange-700 hover:underline inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Plateforme Ada Papers
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold mt-3 text-slate-900">
              Demander un espace organisation
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              Décrivez votre structure pour obtenir un environnement Ada Papers dédié (cabinet
              d&apos;avocats, conseil, association ou organisme institutionnel).
            </p>
          </div>

          <div className="flex gap-1">
            {steps.map((label, i) => (
              <div
                key={label}
                className={`flex-1 h-1 rounded ${i <= step ? 'bg-orange-500' : 'bg-slate-200'}`}
                title={label}
              />
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Étape {step + 1} / {steps.length} : {steps[step]}
          </p>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            {step === 0 && (
              <>
                <label className="block text-sm">
                  <span className="font-medium text-slate-800">Type de structure</span>
                  <select
                    className={saasInputClass}
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
                    <span className="font-medium text-slate-800">Précisez</span>
                    <input
                      className={saasInputClass}
                      value={form.organizationTypeOther}
                      onChange={(e) => setForm({ ...form, organizationTypeOther: e.target.value })}
                    />
                  </label>
                )}
                <label className="block text-sm">
                  <span className="font-medium text-slate-800">Nom de la structure</span>
                  <input
                    required
                    className={saasInputClass}
                    value={form.structureName}
                    onChange={(e) => setForm({ ...form, structureName: e.target.value })}
                    placeholder="Ex. Cabinet Dupont, Conseil Horizon…"
                  />
                </label>
                {isLawFirm && (
                  <label className="block text-sm">
                    <span className="font-medium text-slate-800">Barreau (optionnel)</span>
                    <input
                      className={saasInputClass}
                      value={form.barreau}
                      onChange={(e) => setForm({ ...form, barreau: e.target.value })}
                    />
                  </label>
                )}
                {!isLawFirm && (
                  <label className="block text-sm">
                    <span className="font-medium text-slate-800">SIRET (optionnel)</span>
                    <input
                      className={saasInputClass}
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
                  <span className="font-medium text-slate-800">Personne de contact</span>
                  <input
                    required
                    className={saasInputClass}
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-800">Email professionnel</span>
                  <input
                    type="email"
                    required
                    className={saasInputClass}
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-800">Téléphone (optionnel)</span>
                  <input
                    className={saasInputClass}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-800">Ville (optionnel)</span>
                  <input
                    className={saasInputClass}
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </label>
              </>
            )}

            {step === 2 && (
              <>
                <label className="block text-sm">
                  <span className="font-medium text-slate-800">Effectif estimé</span>
                  <select
                    className={saasInputClass}
                    value={form.teamSize}
                    onChange={(e) => setForm({ ...form, teamSize: e.target.value })}
                  >
                    <option value="">Sélectionner</option>
                    {TEAM_SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-800">
                    Domaine d&apos;activité principal (optionnel)
                  </span>
                  <input
                    className={saasInputClass}
                    value={form.practiceArea}
                    onChange={(e) => setForm({ ...form, practiceArea: e.target.value })}
                    placeholder="Ex. droit des affaires, droit social, conseil RH…"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-800">Identifiant souhaité (slug, optionnel)</span>
                  <input
                    className={`${saasInputClass} font-mono`}
                    value={form.desiredSlug}
                    onChange={(e) => setForm({ ...form, desiredSlug: e.target.value })}
                    placeholder="org-exemple"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-800">Domaines web souhaités (optionnel)</span>
                  <textarea
                    className={saasInputClass}
                    rows={2}
                    value={form.desiredDomains}
                    onChange={(e) => setForm({ ...form, desiredDomains: e.target.value })}
                    placeholder="exemple.adapapers.fr"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-800">Message (optionnel)</span>
                  <textarea
                    className={saasInputClass}
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
                <label className="flex items-start gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-orange-500"
                    checked={form.gdprConsent}
                    onChange={(e) => setForm({ ...form, gdprConsent: e.target.checked })}
                  />
                  <span>
                    J&apos;accepte que mes données soient traitées par Ada Papers pour étudier cette
                    demande, conformément à la{' '}
                    <Link href="/politique-confidentialite" className="text-orange-600 underline">
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
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40"
            >
              Précédent
            </button>
            {step < 2 ? (
              <button
                type="button"
                className={saasPrimaryButtonClass}
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
                className={saasPrimaryButtonClass}
              >
                {loading ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            )}
          </div>
        </div>
      </div>
    </SaasMarketingShell>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SaasMarketingShell } from '@/components/saas/SaasMarketingShell';
import { saasInputClass, saasPrimaryButtonClass } from '@/components/saas/saasMarketingStyles';
import {
  COMMERCIAL_SUBJECT_OPTIONS,
  submitCommercialContact,
  type CommercialSubject,
} from '@/lib/commercialContact';
import { ArrowLeft, CheckCircle2, Mail, Phone } from 'lucide-react';

export default function ContactCommercialPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    organization: '',
    subject: 'demo' as CommercialSubject,
    message: '',
    gdprConsent: false,
    website: '',
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('Indiquez votre nom');
      return;
    }
    if (!form.email.trim()) {
      setError('Indiquez votre email');
      return;
    }
    if (!form.message.trim()) {
      setError('Décrivez votre demande');
      return;
    }
    if (!form.gdprConsent) {
      setError('Vous devez accepter le traitement des données');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await submitCommercialContact({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        organization: form.organization.trim() || undefined,
        subject: form.subject,
        message: form.message.trim(),
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
          <div className="max-w-md space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-orange-500" />
            <h1 className="text-2xl font-bold text-slate-900">Message envoyé</h1>
            <p className="text-sm text-slate-600">
              Merci <strong>{form.name}</strong>. Notre service commercial vous recontactera à{' '}
              <strong>{form.email}</strong> sous quelques jours ouvrés.
            </p>
            <Link href="/saas" className={saasPrimaryButtonClass}>
              Retour à la plateforme Ada Papers
            </Link>
          </div>
        </div>
      </SaasMarketingShell>
    );
  }

  return (
    <SaasMarketingShell>
      <div className="px-4 py-10 md:py-14">
        <div className="mx-auto grid max-w-4xl gap-10 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link
              href="/saas"
              className="inline-flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Plateforme Ada Papers
            </Link>
            <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
              Contacter le service commercial
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Démo, tarifs, partenariat ou question sur Ada Papers : décrivez votre besoin et
              notre équipe vous répond sous quelques jours ouvrés.
            </p>
            <ul className="mt-8 space-y-4 text-sm text-slate-600">
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                <span>
                  <span className="font-medium text-slate-800">Email</span>
                  <br />
                  <a
                    href="mailto:contact@adapapers.fr"
                    className="text-orange-600 hover:underline"
                  >
                    contact@adapapers.fr
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                <span>
                  <span className="font-medium text-slate-800">Délai de réponse</span>
                  <br />
                  Sous 2 à 5 jours ouvrés selon la charge de l&apos;équipe.
                </span>
              </li>
            </ul>
          </div>

          <div className="space-y-4 lg:col-span-3">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Nom et prénom</span>
                <input
                  required
                  className={saasInputClass}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Email professionnel</span>
                <input
                  required
                  type="email"
                  className={saasInputClass}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Téléphone (optionnel)</span>
                <input
                  type="tel"
                  className={saasInputClass}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Organisation (optionnel)</span>
                <input
                  className={saasInputClass}
                  value={form.organization}
                  onChange={(e) => setForm({ ...form, organization: e.target.value })}
                  placeholder="Cabinet, association, structure…"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Objet de votre demande</span>
                <select
                  className={saasInputClass}
                  value={form.subject}
                  onChange={(e) =>
                    setForm({ ...form, subject: e.target.value as CommercialSubject })
                  }
                >
                  {COMMERCIAL_SUBJECT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Message</span>
                <textarea
                  required
                  className={saasInputClass}
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Décrivez votre projet, le nombre d'utilisateurs prévus, vos questions…"
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
                  J&apos;accepte que mes données soient traitées par Ada Papers pour répondre à
                  cette demande, conformément à la{' '}
                  <Link href="/politique-confidentialite" className="text-orange-600 underline">
                    politique de confidentialité
                  </Link>
                  .
                </span>
              </label>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleSubmit()}
              className={saasPrimaryButtonClass}
            >
              {loading ? 'Envoi…' : 'Envoyer le message'}
            </button>
          </div>
        </div>
      </div>
    </SaasMarketingShell>
  );
}

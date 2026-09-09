'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { guidesAPI, parrainageAPI } from '@/lib/api';

type GuideLink = { label: string; url: string };
type BanqueOption = {
  nom: string;
  type: 'formulaire' | 'lien';
  url?: string;
  label?: string;
};
type GuideStep = {
  order: number;
  titre: string;
  description: string;
  deadline?: string;
  cost?: string;
  links?: GuideLink[];
  warningNote?: string;
  promoNote?: string;
  special?: string;
  banqueOptions?: BanqueOption[];
};
type Guide = {
  titre: string;
  intro: string;
  steps: GuideStep[];
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function BnpForm() {
  const [form, setForm] = useState({ prenom: '', nom: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await parrainageAPI.submitBnp(form);
      setSuccess(true);
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
        Demande enregistrée. Ada Papers vous contactera pour finaliser le parrainage.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input required type="text" placeholder="Prénom" value={form.prenom}
        onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))}
        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
      <input required type="text" placeholder="Nom" value={form.nom}
        onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
      <input required type="email" placeholder="Adresse email" value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={submitting}
        className="w-full text-xs font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition-colors">
        {submitting ? 'Envoi en cours...' : 'Demander le parrainage'}
      </button>
    </form>
  );
}

function BnpFormGated({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (!isAuthenticated) {
    return (
      <a href="/auth/signup?redirect=/guides/nouvel-arrivant"
        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg transition-colors">
        Créer un compte pour accéder au parrainage
      </a>
    );
  }
  return <BnpForm />;
}

function BanqueCards({ options, isAuthenticated }: { options: BanqueOption[]; isAuthenticated: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 pt-1">
      {options.map((opt) => (
        <div key={opt.nom} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
          <p className="font-semibold text-gray-900 text-sm">{opt.nom}</p>
          {opt.type === 'lien' ? (
            <a href={opt.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg transition-colors">
              {opt.label || 'Ouvrir via parrainage'}
              <ExternalLinkIcon />
            </a>
          ) : (
            <BnpFormGated isAuthenticated={isAuthenticated} />
          )}
        </div>
      ))}
    </div>
  );
}

function StepBody({ step, isAuthenticated }: { step: GuideStep; isAuthenticated: boolean }) {
  return (
    <div className="px-4 pb-5 pt-3 border-t border-gray-100 space-y-4">
      {step.description && (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{step.description}</p>
      )}

      {(step.deadline || step.cost) && (
        <div className="flex flex-wrap gap-2">
          {step.deadline && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {step.deadline}
            </span>
          )}
          {step.cost && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-50 text-green-700 px-3 py-1.5 rounded-full">
              {step.cost}
            </span>
          )}
        </div>
      )}

      {step.promoNote && (
        <div className="flex items-center gap-3 bg-gradient-to-r from-orange-500 to-orange-400 rounded-xl px-4 py-3 shadow-sm">
          <span className="text-white text-lg flex-shrink-0">🎁</span>
          <p className="text-xs font-semibold text-white leading-relaxed">{step.promoNote}</p>
        </div>
      )}

      {step.warningNote && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <WarningIcon />
          <p className="text-xs text-amber-800 leading-relaxed">{step.warningNote}</p>
        </div>
      )}

      {step.links && step.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {step.links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-full transition-colors">
              {link.label}
              <ExternalLinkIcon />
            </a>
          ))}
        </div>
      )}

      {step.special === 'banque' && step.banqueOptions && step.banqueOptions.length > 0 && (
        <BanqueCards options={step.banqueOptions} isAuthenticated={isAuthenticated} />
      )}
    </div>
  );
}

function CtaBanner() {
  return (
    <div className="sticky bottom-4 z-10 mx-auto max-w-3xl px-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-400 px-5 py-4 shadow-xl">
        <p className="text-sm font-semibold text-white text-center sm:text-left">
          Besoin d&apos;aide pour vos démarches ? Ada Papers vous accompagne.
        </p>
        <a href="/auth/signup?redirect=/guides/nouvel-arrivant"
          className="shrink-0 rounded-xl bg-white px-5 py-2 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors">
          Créer mon dossier →
        </a>
      </div>
    </div>
  );
}

export default function GuideNouvelArrivantPublicPage() {
  const { status } = useSession();
  const router = useRouter();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number>(-1);

  const isAuthenticated = status === 'authenticated';

  useEffect(() => {
    // Si l'utilisateur est connecté, rediriger vers la version espace client
    if (status === 'authenticated') {
      router.replace('/client/guides/nouvel-arrivant');
      return;
    }
    if (status === 'loading') return;

    guidesAPI
      .getNouvelArrivant()
      .then((res) => {
        if (res.data?.success) setGuide(res.data.guide);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="py-16 text-center text-gray-500 text-sm">
        Le guide n&apos;est pas disponible pour le moment.
      </div>
    );
  }

  return (
    <>
      {/* Header minimal */}
      <header className="border-b bg-white px-4 py-3">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <a href="/" className="text-lg font-bold text-orange-500">Ada Papers</a>
          <div className="flex gap-2">
            <a href="/auth/signin" className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              Se connecter
            </a>
            <a href="/auth/signup" className="text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
              Créer un compte
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-24">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{guide.titre}</h1>
          {guide.intro && (
            <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{guide.intro}</p>
          )}
        </div>

        <div className="space-y-2">
          {guide.steps.map((step, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div key={step.order} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? -1 : idx)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isOpen ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {step.order}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-gray-900">{step.titre}</span>
                  <ChevronIcon open={isOpen} />
                </button>
                {isOpen && <StepBody step={step} isAuthenticated={isAuthenticated} />}
              </div>
            );
          })}
        </div>

        <div className="border border-gray-200 rounded-xl bg-gray-50 px-5 py-4 flex flex-col sm:flex-row items-center gap-3 justify-between">
          <p className="text-xs text-gray-500 text-center sm:text-left">
            Pour plus d&apos;informations, notre équipe est disponible pour vous accompagner.
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <a href="/auth/signup?redirect=/depot-dossier"
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg transition-colors">
              Déposer mon dossier
            </a>
            <a href="/forum"
              className="inline-flex items-center gap-1.5 text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-lg transition-colors">
              Accéder au forum
            </a>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center pb-2">Guide fourni par Ada Papers.</p>
      </main>

      <CtaBanner />
    </>
  );
}

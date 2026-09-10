'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
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
type BonPlan = {
  id: string;
  titre: string;
  categorie: string;
  description: string;
  lien: string | null;
  portee_geographique: string;
  date_verification: string;
};
type Guide = {
  titre: string;
  intro: string;
  steps: GuideStep[];
  bonsPlans?: BonPlan[];
};

function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

const INLINE_LINK_RE = /(\[[^\]]+\]\([^)]+\))/g;

function renderDescription(text: string) {
  const parts = text.split(INLINE_LINK_RE);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (m) {
      const [, label, url] = m;
      const external = !url.startsWith('/');
      return (
        <a
          key={i}
          href={url}
          target={external ? '_blank' : '_self'}
          rel={external ? 'noopener noreferrer' : undefined}
          className="inline-flex items-center gap-0.5 text-orange-600 hover:text-orange-700 underline underline-offset-2 font-medium"
        >
          {label}
          {external && <ExternalLinkIcon />}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
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
        className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
      <input required type="text" placeholder="Nom" value={form.nom}
        onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
        className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
      <input required type="email" placeholder="Adresse email" value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={submitting}
        className="w-full text-xs font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition-colors">
        {submitting ? 'Envoi en cours...' : 'Envoyer ma demande'}
      </button>
    </form>
  );
}

function BnpFormGated({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (!isAuthenticated) {
    return (
      <a href="/auth/signup?redirect=/guides/nouvel-arrivant"
        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg transition-colors">
        Créer un compte pour continuer
      </a>
    );
  }
  return <BnpForm />;
}

function BanqueCards({ options, isAuthenticated }: { options: BanqueOption[]; isAuthenticated: boolean }) {
  const [bnpOpen, setBnpOpen] = useState(false);
  return (
    <div className="grid gap-3 sm:grid-cols-3 pt-1">
      {options.map((opt) => (
        <div key={opt.nom} className="border border-stone-200 rounded-xl p-4 bg-stone-50 space-y-3">
          <p className="font-semibold text-stone-900 text-sm">{opt.nom}</p>
          {opt.type === 'lien' ? (
            <a href={opt.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg transition-colors">
              Ouvrir un compte
              <ExternalLinkIcon />
            </a>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setBnpOpen((v) => !v)}
                className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg transition-colors"
              >
                Ouvrir un compte
                <svg className={`w-3 h-3 transition-transform duration-200 ${bnpOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {bnpOpen && <BnpFormGated isAuthenticated={isAuthenticated} />}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function StepBody({ step, isAuthenticated }: { step: GuideStep; isAuthenticated: boolean }) {
  return (
    <div className="space-y-4 pb-2">
      {step.description && (
        <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">
          {renderDescription(step.description)}
        </p>
      )}

      {(step.deadline || step.cost) && (
        <div className="flex flex-wrap gap-2">
          {step.deadline && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-orange-50 text-orange-700 px-3 py-1.5 rounded-md border border-orange-100">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {step.deadline}
            </span>
          )}
          {step.cost && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-stone-100 text-stone-600 px-3 py-1.5 rounded-md">
              {step.cost}
            </span>
          )}
        </div>
      )}

      {step.promoNote && (
        <div className="flex items-center gap-3 bg-orange-500 rounded-xl px-4 py-3">
          <span className="text-white text-lg flex-shrink-0">🎁</span>
          <p className="text-xs font-semibold text-white leading-relaxed">{step.promoNote}</p>
        </div>
      )}

      {step.warningNote && (
        <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-xs text-amber-800 leading-relaxed">{step.warningNote}</p>
        </div>
      )}

      {step.special === 'banque' && step.banqueOptions && step.banqueOptions.length > 0 && (
        <div id="bank-cards">
          <BanqueCards options={step.banqueOptions} isAuthenticated={isAuthenticated} />
        </div>
      )}
    </div>
  );
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'alimentation', label: 'Alimentation' },
  { key: 'habillement', label: 'Habillement' },
  { key: 'telephonie', label: 'Téléphonie' },
  { key: 'transport', label: 'Transport' },
  { key: 'culture', label: 'Culture' },
];

const CAT_COLORS: Record<string, { badge: string; border: string; dot: string }> = {
  alimentation: { badge: 'bg-green-50 text-green-700 border-green-200', border: 'border-l-green-400', dot: 'bg-green-400' },
  habillement:  { badge: 'bg-purple-50 text-purple-700 border-purple-200', border: 'border-l-purple-400', dot: 'bg-purple-400' },
  telephonie:   { badge: 'bg-blue-50 text-blue-700 border-blue-200', border: 'border-l-blue-400', dot: 'bg-blue-400' },
  transport:    { badge: 'bg-orange-50 text-orange-700 border-orange-200', border: 'border-l-orange-400', dot: 'bg-orange-400' },
  culture:      { badge: 'bg-pink-50 text-pink-700 border-pink-200', border: 'border-l-pink-400', dot: 'bg-pink-400' },
};


function BonPlanCard({ plan }: { plan: BonPlan }) {
  const colors = CAT_COLORS[plan.categorie] || { badge: 'bg-stone-50 text-stone-600 border-stone-200', border: 'border-l-stone-300', dot: 'bg-stone-300' };
  return (
    <div className={`border-l-2 ${colors.border} bg-white border border-stone-100 rounded-r-xl pl-4 pr-4 py-4 flex flex-col gap-2.5`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-stone-900 leading-snug">{plan.titre}</p>
        <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${colors.badge}`}>
          {plan.categorie === 'telephonie' ? 'Téléphonie' : plan.categorie}
        </span>
      </div>
      <p className="text-xs text-stone-500 leading-relaxed whitespace-pre-line">
        {renderDescription(plan.description)}
      </p>
      {plan.portee_geographique && plan.portee_geographique !== 'national' && (
        <p className="text-xs text-stone-400 italic">{plan.portee_geographique}</p>
      )}
      {plan.lien && (
        <a
          href={plan.lien}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 mt-auto"
        >
          Accéder au site
          <ExternalLinkIcon />
        </a>
      )}
    </div>
  );
}

function BankCtaSidebar({ onCtaClick }: { onCtaClick: () => void }) {
  return (
    <aside className="hidden xl:block xl:w-80 flex-shrink-0">
      <div className="sticky top-6 pl-8 pr-2 pt-6">
        <button
          type="button"
          onClick={onCtaClick}
          className="w-full text-left bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 group"
          aria-label="Voir les options pour ouvrir un compte bancaire"
        >
          {/* Photo */}
          <div className="relative h-64 overflow-hidden">
            <img
              src="/image creation compte bancaire.avif"
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
            <div className="absolute bottom-2 left-3 right-3 drop-shadow">
              <p className="text-white text-[11px] font-bold leading-tight">
                Ouvre ton compte bancaire en France
              </p>
              <p className="text-orange-300 text-[10px] font-semibold leading-tight mt-0.5">
                Gagnez jusqu&apos;à 160 euros de prime de bienvenue
              </p>
            </div>
          </div>
          {/* Bouton */}
          <div className="p-3">
            <div className="w-full text-center text-[11px] font-semibold bg-orange-500 group-hover:bg-orange-600 text-white py-1.5 rounded-xl transition-colors">
              Voir les options
            </div>
          </div>
        </button>
      </div>
    </aside>
  );
}

function BonsPlansSection({ plans }: { plans: BonPlan[] }) {
  const [activeTab, setActiveTab] = useState('tous');
  const visibleCats = CATEGORIES.filter(
    (c) => c.key === 'tous' || plans.some((p) => p.categorie === c.key)
  );
  const filtered = activeTab === 'tous' ? plans : plans.filter((p) => p.categorie === activeTab);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {visibleCats.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActiveTab(c.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              activeTab === c.key
                ? 'bg-orange-500 border-orange-500 text-white'
                : 'bg-white border-stone-200 text-stone-600 hover:border-orange-300 hover:text-orange-600'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((plan) => (
          <BonPlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </section>
  );
}

export default function GuideNouvelArrivantPublicPage() {
  const { status } = useSession();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number>(-1);
  const [mainTab, setMainTab] = useState<'guide' | 'bons-plans'>('guide');

  const isAuthenticated = status === 'authenticated';

  const handleBankCtaClick = () => {
    if (!guide) return;
    const bankIdx = guide.steps.findIndex((s) => s.special === 'banque');
    if (bankIdx !== -1) {
      setOpenIdx(bankIdx);
      setTimeout(() => {
        document.getElementById('bank-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    }
  };

  useEffect(() => {
    if (status === 'loading') return;
    guidesAPI
      .getNouvelArrivant()
      .then((res) => {
        if (res.data?.success) setGuide(res.data.guide);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="py-16 text-center text-stone-500 text-sm">
        Le guide n&apos;est pas disponible pour le moment.
      </div>
    );
  }

  const hasBonsPlans = guide.bonsPlans && guide.bonsPlans.length > 0;

  return (
    <>
      {/* Barre de navigation */}
      <header className="border-b border-stone-100 bg-white px-4 py-3">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <a href="/" className="text-lg font-bold text-orange-500">Ada Papers</a>
          {!isAuthenticated && (
            <div className="flex gap-2">
              <a href="/auth/signin" className="text-xs font-medium text-stone-500 hover:text-stone-700 px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors">
                Se connecter
              </a>
              <a href="/auth/signup" className="text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                Créer un compte
              </a>
            </div>
          )}
        </div>
      </header>

      {/* Hero éditorial */}
      <div className="bg-orange-50 border-b border-orange-100">
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-6">
          <p className="text-xs font-semibold tracking-widest text-orange-700 uppercase mb-3">
            Ada Papers · Accompagnement
          </p>
          <h1 className="text-3xl font-medium text-stone-900 leading-tight mb-3">
            {guide.titre || "Guide du nouvel arrivant"}
          </h1>
          {guide.intro && (
            <p className="text-sm text-stone-500 leading-relaxed max-w-lg mb-6">{guide.intro}</p>
          )}
          {/* Onglets dans le hero */}
          {hasBonsPlans && (
            <div className="flex justify-center">
              <div className="inline-flex bg-orange-100 rounded-xl p-1.5 gap-1.5">
                <button
                  type="button"
                  onClick={() => setMainTab('guide')}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    mainTab === 'guide'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  Guide
                </button>
                <button
                  type="button"
                  onClick={() => setMainTab('bons-plans')}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    mainTab === 'bons-plans'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  Bons plans
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="xl:flex">
        {mainTab === 'guide' && (
          <BankCtaSidebar onCtaClick={handleBankCtaClick} />
        )}

        <main className="flex-1 min-w-0 pb-16 xl:pb-16 pb-28">
          <div className="max-w-3xl mx-auto px-4">

        {/* Onglet Guide */}
        {mainTab === 'guide' && (
          <div className="pt-6">
            {/* Timeline des étapes */}
            <div>
              {guide.steps.map((step, idx) => {
                const isOpen = openIdx === idx;
                const isLast = idx === guide.steps.length - 1;
                return (
                  <div key={step.order} id={step.special === 'banque' ? 'bank-step' : undefined} className="flex">
                    {/* Colonne gauche : numéro + ligne verticale */}
                    <div className="flex flex-col items-center" style={{ width: '52px', flexShrink: 0, paddingRight: '16px' }}>
                      <button
                        type="button"
                        onClick={() => setOpenIdx(isOpen ? -1 : idx)}
                        className="mt-5 w-8 h-8 flex items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                        aria-label={`${isOpen ? 'Fermer' : 'Ouvrir'} l'étape ${step.order}`}
                      >
                        <span className={`text-xl font-medium leading-none transition-colors ${
                          isOpen ? 'text-orange-500' : 'text-stone-300 hover:text-orange-400'
                        }`}>
                          {step.order}
                        </span>
                      </button>
                      {!isLast && (
                        <div className="flex-1 w-px mt-1 mb-0" style={{ background: 'linear-gradient(to bottom, #e7e5e4, #e7e5e4)', minHeight: '16px' }} />
                      )}
                    </div>

                    {/* Colonne droite : contenu */}
                    <div className={`flex-1 pb-6 ${!isLast ? 'border-b border-stone-100' : ''} min-w-0`}>
                      <button
                        type="button"
                        onClick={() => setOpenIdx(isOpen ? -1 : idx)}
                        className="w-full text-left pt-4 group flex items-start justify-between gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold leading-snug mb-2 text-stone-900">
                            {step.titre}
                          </h3>
                          {(step.deadline || step.cost) && !isOpen && (
                            <div className="flex flex-wrap gap-1.5 mb-1">
                              {step.deadline && (
                                <span className="text-xs text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-md">
                                  {step.deadline}
                                </span>
                              )}
                              {step.cost && (
                                <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                                  {step.cost}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <svg
                          className={`w-4 h-4 flex-shrink-0 mt-1 text-stone-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="mt-2">
                          <StepBody step={step} isAuthenticated={isAuthenticated} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bloc de contact */}
            <div className="mt-4 bg-stone-50 border border-stone-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row items-center gap-3 justify-between">
              <p className="text-xs text-stone-500 text-center sm:text-left">
                Pour plus d&apos;informations, notre équipe est disponible pour vous accompagner.
              </p>
              <div className="flex gap-2 flex-shrink-0">
                <a href="/client/messages"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg transition-colors">
                  Nous contacter
                </a>
                <a href="/forum"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 px-3 py-2 rounded-lg transition-colors">
                  Accéder au forum
                </a>
              </div>
            </div>

            <p className="text-xs text-stone-400 text-center mt-6 pb-2">Guide fourni par Ada Papers.</p>
          </div>
        )}

        {/* Onglet Bons plans */}
        {mainTab === 'bons-plans' && hasBonsPlans && (
          <div className="pt-6">
            <BonsPlansSection plans={guide.bonsPlans!} />
          </div>
        )}
          </div>
        </main>

        {mainTab === 'guide' && (
          <div className="hidden xl:block xl:w-80 flex-shrink-0" aria-hidden="true" />
        )}
      </div>

      {/* Mobile : bandeau sticky en bas */}
      {mainTab === 'guide' && guide && (
        <div className="xl:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-200 shadow-lg">
          <button
            type="button"
            onClick={handleBankCtaClick}
            className="w-full flex items-center gap-3 px-4 py-3"
          >
            <img
              src="/image creation compte bancaire.avif"
              alt=""
              aria-hidden="true"
              className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-bold text-stone-900 leading-tight">Compte bancaire en France</p>
              <p className="text-[11px] text-orange-600 font-semibold leading-tight mt-0.5">Jusqu&apos;à 160€ de prime de bienvenue</p>
            </div>
            <div className="flex-shrink-0 text-xs font-semibold bg-orange-500 text-white px-3 py-2 rounded-xl">
              Voir
            </div>
          </button>
        </div>
      )}
    </>
  );
}

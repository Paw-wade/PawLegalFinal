'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ORGANIZATION_TYPE_OPTIONS } from '@/lib/organizationSignup';
import { ArrowRight, Shield } from 'lucide-react';

const FEATURES = [
  {
    title: 'Dossiers structurés',
    description:
      'Créez, classez et suivez chaque dossier : statut, échéances, responsables et historique au même endroit.',
  },
  {
    title: 'Documents & pièces',
    description:
      'Collecte, préparation et validation des pièces. Vos clients déposent en ligne ; vous pilotez la complétude.',
  },
  {
    title: 'Messagerie intégrée',
    description:
      'Échanges traçables avec les clients et l\'équipe, sans disperser les informations sur des boîtes mail personnelles.',
  },
  {
    title: 'Rendez-vous',
    description:
      'Prise de créneaux, rappels et visibilité sur l\'agenda pour fluidifier l\'accueil et le suivi des clients.',
  },
  {
    title: 'Pilotage & productivité',
    description:
      'Tableaux de bord, tâches, modèles et paramètres pour accompagner le travail quotidien de votre organisation.',
  },
  {
    title: 'Équipe & rôles',
    description:
      'Assignation des dossiers, tâches internes et droits par profil (juriste, secrétariat, direction).',
  },
] as const;

const STEPS = [
  {
    step: '1',
    title: 'Décrivez votre structure',
    text: 'Cabinet d\'avocats, conseil, association ou autre : indiquez votre organisation et vos besoins.',
  },
  {
    step: '2',
    title: 'Validation Ada Papers',
    text: 'Notre équipe étudie votre demande et prépare votre environnement dédié (domaine, base, branding).',
  },
  {
    step: '3',
    title: 'Mise en service',
    text: 'Vous accédez à votre espace, formez l\'équipe et accompagnez vos clients sur la plateforme.',
  },
] as const;

const FAQ = [
  {
    q: 'À qui s\'adresse Ada Papers ?',
    a: 'Aux cabinets d\'avocats, structures de conseil, associations et organismes qui gèrent des dossiers clients, une équipe et des échanges documentés au quotidien.',
  },
  {
    q: 'Chaque organisation a-t-elle son propre espace ?',
    a: 'Oui. Chaque structure dispose d\'un tenant isolé : données, branding, domaine et paramètres qui lui sont propres.',
  },
  {
    q: 'Comment démarrer ?',
    a: 'Remplissez le formulaire de demande d\'espace. Après validation, nous vous accompagnons pour la mise en route technique.',
  },
] as const;

function CtaButton({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href="/devenir-cabinet"
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${className}`}
    >
      {children}
    </Link>
  );
}

export function SaasLandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
          <Link href="/saas" className="flex items-center gap-2 shrink-0">
            <Image
              src="/ada-papers-logo.png"
              alt="Ada Papers"
              width={36}
              height={36}
              className="h-9 w-9"
            />
            <span className="font-semibold text-slate-900">Ada Papers</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm text-slate-600">
            <a href="#fonctionnalites" className="hover:text-orange-600 transition-colors">
              Fonctionnalités
            </a>
            <a href="#organisations" className="hover:text-orange-600 transition-colors">
              Organisations
            </a>
            <a href="#faq" className="hover:text-orange-600 transition-colors">
              FAQ
            </a>
          </nav>
          <CtaButton className="!px-4 !py-2 text-xs sm:text-sm">
            Créer mon organisation
            <ArrowRight className="h-4 w-4" />
          </CtaButton>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-white via-orange-50/40 to-slate-50">
          <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-10 text-center md:px-8 md:py-14">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-[2.75rem] md:leading-tight">
                Le pilotage de vos dossiers,{' '}
                <span className="text-orange-600">dans un espace dédié à votre organisation</span>
              </h1>
              <p className="mt-4 text-base text-slate-600 leading-relaxed md:text-lg">
                Ada Papers centralise dossiers clients, pièces, messagerie, rendez-vous et suivi
                d&apos;équipe pour les cabinets d&apos;avocats et les structures de conseil qui
                pilotent leur activité au quotidien.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                <CtaButton>
                  Commencer l&apos;essai sans frais
                  <ArrowRight className="h-4 w-4" />
                </CtaButton>
                <Link
                  href="/contact-commercial"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Contacter le service commercial
                </Link>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Demande sans engagement. Réponse sous quelques jours ouvrés après étude de votre
                projet.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="fonctionnalites" className="py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-2xl font-bold sm:text-3xl">
                Pourquoi gérer votre structure juridique avec la solution Ada Papers ?
              </h2>
              <p className="mt-3 text-slate-600">
                Un outil de gestion qui respecte la confidentialité des dossiers : suivi,
                collaboration et traçabilité pour toute votre organisation.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURES.map(({ title, description }) => (
                <article
                  key={title}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-orange-200 hover:shadow-md transition-shadow"
                >
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Org types */}
        <section id="organisations" className="py-16 md:py-20 bg-white border-y border-slate-200">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-2xl font-bold sm:text-3xl">
                  Une plateforme pour chaque type de structure
                </h2>
                <p className="mt-4 text-slate-600 leading-relaxed">
                  Que vous exerciez en cabinet réglementé, en conseil ou au sein d&apos;une association
                  ou d&apos;un organisme institutionnel, vous obtenez un environnement nommé, isolé et
                  configurable (branding, domaine, équipe).
                </p>
                <ul className="mt-6 space-y-3">
                  {ORGANIZATION_TYPE_OPTIONS.map((opt) => (
                    <li key={opt.value} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                      <span className="text-slate-700">{opt.label}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <CtaButton>Commencer l&apos;essai</CtaButton>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 space-y-6">
                <h3 className="font-semibold text-lg">Sécurité & isolation</h3>
                <ul className="space-y-4 text-sm text-slate-600">
                  <li className="flex gap-3">
                    <Shield className="h-5 w-5 text-orange-600 shrink-0" />
                    Base de données dédiée par organisation (multi-tenant).
                  </li>
                  <li className="flex gap-3">
                    <Shield className="h-5 w-5 text-orange-600 shrink-0" />
                    Hébergement et accès contrôlés ; données hébergées pour votre activité
                    professionnelle.
                  </li>
                  <li className="flex gap-3">
                    <Shield className="h-5 w-5 text-orange-600 shrink-0" />
                    Parcours client séparé de l&apos;espace équipe (administration interne).
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <h2 className="text-2xl font-bold text-center sm:text-3xl">Comment obtenir votre espace</h2>
            <div className="mt-12 grid md:grid-cols-3 gap-8">
              {STEPS.map(({ step, title, text }) => (
                <div key={step} className="relative text-center md:text-left">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
                    {step}
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-16 md:py-20 bg-white border-t border-slate-200">
          <div className="mx-auto max-w-3xl px-4 md:px-8">
            <h2 className="text-2xl font-bold text-center sm:text-3xl">Questions fréquentes</h2>
            <dl className="mt-10 space-y-6">
              {FAQ.map(({ q, a }) => (
                <div key={q} className="border-b border-slate-100 pb-6 last:border-0">
                  <dt className="font-semibold text-slate-900">{q}</dt>
                  <dd className="mt-2 text-sm text-slate-600 leading-relaxed">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 md:py-20 bg-slate-900 text-white">
          <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Prêt à équiper votre organisation ?
            </h2>
            <p className="mt-4 text-slate-300">
              Décrivez votre structure en quelques minutes. Nous vous recontactons pour valider la
              création de votre environnement Ada Papers.
            </p>
            <div className="mt-8">
              <Link
                href="/devenir-cabinet"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-8 py-3.5 text-base font-semibold text-white hover:bg-orange-600 transition-colors"
              >
                Lancer ma demande d&apos;organisation
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center text-sm text-slate-500 sm:flex-row md:px-8">
          <p>© {new Date().getFullYear()} Ada Papers · Plateforme de gestion juridique</p>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-orange-600 transition-colors">
              Site public
            </Link>
            <Link href="/devenir-cabinet" className="hover:text-orange-600 transition-colors">
              Demander un espace
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

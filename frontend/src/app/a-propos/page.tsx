'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import Link from 'next/link';

const ABOUT_SECTIONS = [
  { id: 'mission', title: 'Notre mission' },
  { id: 'vision', title: 'Notre vision' },
  { id: 'publics', title: 'À qui nous nous adressons' },
  { id: 'method', title: 'Notre manière de travailler' },
  { id: 'commitments', title: 'Nos engagements' },
  { id: 'team', title: 'Notre équipe' },
];

export default function AProposPage() {
  const [selectedId, setSelectedId] = useState<string>('mission');

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10 flex flex-col">
      <Header variant="home" />

      {/* Hero, même style que Services mais optimisé mobile (sans motif en grille) */}
      <section className="relative py-10 md:py-16 bg-gradient-to-br from-primary/5 via-primary/10 to-background overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-block mb-3 px-4 py-1 bg-primary/10 rounded-full border border-primary/20">
              <span className="text-xs md:text-sm font-medium text-primary tracking-wide uppercase">
                À propos d&apos;Ada Papers
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold mb-4 text-foreground leading-tight px-4">
              Une plateforme pour sécuriser et simplifier vos démarches
            </h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed px-4">
              Ada Papers accompagne particuliers, professionnels et partenaires dans
              la préparation, le suivi et la réussite de leurs démarches liées au
              séjour en France, avec une approche claire, structurée et collaborative.
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-10 md:py-16 flex-1">
        <div className="max-w-6xl mx-auto">
          {/* Vue mobile : présentation verticale de toutes les sections */}
          <div className="md:hidden space-y-8">
            {/* Mission */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700">
                🎯 Notre mission
              </span>
              <h2 className="text-lg font-semibold text-foreground">Rendre vos démarches plus simples</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Notre objectif est de rendre les démarches administratives liées au titre de séjour
                plus simples, plus rapides et moins contraignantes. Face à la complexité et à
                l&apos;exigence des procédures, nous souhaitons offrir une approche plus claire
                et plus efficace. Nous nous engageons à rendre ces démarches plus accessibles
                et plus compréhensibles.
              </p>
            </section>

            {/* Vision */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700">
                🌍 Notre vision
              </span>
              <h2 className="text-lg font-semibold text-foreground">Une plateforme claire et accessible</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Offrir un espace unique où chaque dossier est compréhensible, bien
                documenté et suivi en temps réel, grâce à une collaboration fluide
                entre clients, administrateurs et partenaires. Cet espace permet
                également d&apos;anticiper les démarches à venir, de déléguer en
                toute confiance les procédures liées au titre de séjour pour plus de
                sérénité, et de mieux se préparer aux actions à entreprendre en cas
                de non-respect ou de silence de l&apos;administration.
              </p>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Nos valeurs</h3>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li>• Transparence et pédagogie</li>
                  <li>• Rigueur dans le traitement des dossiers</li>
                  <li>• Confidentialité et protection des données</li>
                  <li>• Accessibilité et écoute</li>
                </ul>
              </div>
            </section>

            {/* Publics */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700">
                👥 À qui nous nous adressons
              </span>
              <h2 className="text-lg font-semibold text-foreground">Les personnes que nous accompagnons</h2>
              <div className="grid gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold mb-1">Particuliers et familles</h3>
                  <p className="text-xs text-muted-foreground">
                    Demandes et renouvellements de titres de séjour, regroupements
                    familiaux, visas, régularisations, recours.
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold mb-1">Professionnels</h3>
                  <p className="text-xs text-muted-foreground">
                    Entreprises et associations qui accompagnent leurs collaborateurs
                    ou bénéficiaires dans leurs démarches administratives.
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold mb-1">Partenaires</h3>
                  <p className="text-xs text-muted-foreground">
                    Avocats, associations et consulats qui interviennent sur certains
                    dossiers via l&apos;espace dédié.
                  </p>
                </div>
              </div>
            </section>

            {/* Méthode de travail */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700">
                📋 Notre manière de travailler
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                Les grandes étapes de votre dossier
              </h2>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <span className="font-semibold text-foreground">1. Analyse de la situation</span>
                  <span className="block text-xs">
                    Un premier échange permet de comprendre votre situation et de
                    déterminer, avec un langage clair et des explications pédagogiques,
                    le type de dossier et la stratégie les plus adaptés pour une
                    prise en charge rapide et une satisfaction complète.
                  </span>
                </li>
                <li>
                  <span className="font-semibold text-foreground">2. Création du dossier</span>
                  <span className="block text-xs">
                    Nous créons un dossier structuré dans la plateforme, avec une
                    référence unique et des informations claires. Cet espace en ligne
                    vous permet de suivre, en temps réel, l&apos;ensemble des actions
                    réalisées dans le cadre de la procédure.
                  </span>
                </li>
                <li>
                  <span className="font-semibold text-foreground">3. Documents à préparer</span>
                  <span className="block text-xs">
                    Vous visualisez la liste complète des documents à transmettre, ainsi
                    que des modèles prêts à l&apos;emploi pour chaque type de document
                    demandé (recours, attestations, déclarations, etc.), avec l&apos;état
                    de complétude de votre dossier mis à jour en temps réel.
                  </span>
                </li>
                <li>
                  <span className="font-semibold text-foreground">4. Suivi et échanges</span>
                  <span className="block text-xs">
                    Vous pouvez suivre l&apos;avancement, échanger des messages sécurisés
                    et être notifié des actions importantes.
                  </span>
                </li>
                <li>
                  <span className="font-semibold text-foreground">5. Clôture et suppression</span>
                  <span className="block text-xs">
                    Une fois la procédure terminée, le dossier est clôturé et les documents
                    sont supprimés de la plateforme, conformément à notre politique de
                    conservation des données.
                  </span>
                </li>
              </ol>
            </section>

            {/* Engagements */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700">
                🤝 Nos engagements
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                Ce que nous vous garantissons
              </h2>
              <div className="grid gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold mb-1">Confidentialité</h3>
                  <p className="text-xs text-muted-foreground">
                    Vos données et documents sont traités avec un haut niveau de
                    confidentialité et de sécurité.
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold mb-1">Clarté</h3>
                  <p className="text-xs text-muted-foreground">
                    Nous expliquons chaque étape et chaque demande de document dans un
                    langage clair, compréhensible par tous.
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold mb-1">Disponibilité</h3>
                  <p className="text-xs text-muted-foreground">
                    Vous pouvez nous contacter facilement via la plateforme ou la page
                    de contact pour toute question liée à votre dossier.
                  </p>
                </div>
              </div>
            </section>

            {/* Équipe */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700">
                👤 Notre équipe
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                Une équipe dédiée à vos démarches
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                L&apos;équipe Ada Papers est composée de professionnels spécialisés dans le
                droit des étrangers, qui travaillent en étroite collaboration avec des avocats,
                des associations et le Consulat du Sénégal. Cette synergie permet de traiter
                chaque situation avec sérieux, précision et sens pratique.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                L&apos;équipe est dirigée par Papa Abdoulaye WADE, chargé d&apos;enseignement
                et consultant en droit des étrangers, qui met son expérience académique et
                pratique au service de l&apos;accompagnement des personnes étrangères dans
                leurs démarches et éventuels contentieux liés au séjour.
              </p>
            </section>

            {/* CTA final mobile */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                En savoir plus ou démarrer un dossier
              </h3>
              <p className="text-xs text-muted-foreground">
                Vous avez un projet, une question ou un dossier à lancer ? Parlons-en.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/contact"
                  className="px-4 py-2.5 rounded-md bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors"
                >
                  Contactez-nous
                </Link>
                <Link
                  href="/auth/signup"
                  className="px-4 py-2.5 rounded-md border border-gray-300 text-xs font-semibold text-foreground hover:bg-gray-50 transition-colors"
                >
                  Créer un compte
                </Link>
              </div>
            </section>
          </div>

          {/* Vue bureau : navigation à gauche, contenu à droite */}
          <div className="hidden md:grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]">
            {/* Colonne gauche : navigation des thèmes À propos */}
            <aside className="space-y-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-1.5 shadow-sm">
                {ABOUT_SECTIONS.map((section) => {
                  const isActive = section.id === selectedId;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setSelectedId(section.id)}
                      onMouseEnter={() => setSelectedId(section.id)}
                      className={`w-full text-left rounded-xl px-3.5 py-3 flex items-start gap-3 transition-all duration-200 ${
                        isActive
                          ? 'bg-primary/5 border border-primary/60 shadow-sm'
                          : 'border border-transparent hover:bg-muted/40'
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-2 h-8 rounded-full ${
                          isActive ? 'bg-primary' : 'bg-muted'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {section.title}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Colonne droite : contenu détaillé selon le thème sélectionné */}
            <section>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-7 space-y-8">
                {selectedId === 'mission' && (
                <div>
                  <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-2">
                    Notre mission
                  </h2>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                    Notre objectif est de rendre les démarches administratives liées au titre de séjour
                    plus simples, plus rapides et moins contraignantes. Face à la complexité et à
                    l&apos;exigence des procédures, nous souhaitons offrir une approche plus claire
                    et plus efficace. Nous nous engageons à rendre ces démarches plus accessibles
                    et plus compréhensibles.
                  </p>
                </div>
                )}

                {selectedId === 'vision' && (
                <div>
                  <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-2">
                    Notre vision
                  </h2>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                    Offrir un espace unique où chaque dossier est compréhensible, bien
                    documenté et suivi en temps réel, grâce à une collaboration fluide
                    entre clients, administrateurs et partenaires. Cet espace permet
                    également d&apos;anticiper les démarches à venir, de déléguer en
                    toute confiance les procédures liées au titre de séjour pour plus de
                    sérénité, et de mieux se préparer aux actions à entreprendre en cas
                    de non-respect ou de silence de l&apos;administration.
                  </p>
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-foreground mb-1">Nos valeurs</h3>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      <li>• Transparence et pédagogie</li>
                      <li>• Rigueur dans le traitement des dossiers</li>
                      <li>• Confidentialité et protection des données</li>
                      <li>• Accessibilité et écoute</li>
                    </ul>
                  </div>
                </div>
                )}

                {selectedId === 'publics' && (
                <div>
                  <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-3">
                    À qui nous nous adressons
                  </h2>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold mb-1">Particuliers et familles</h3>
                      <p className="text-xs text-muted-foreground">
                        Demandes et renouvellements de titres de séjour, regroupements
                        familiaux, visas, régularisations, recours.
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold mb-1">Professionnels</h3>
                      <p className="text-xs text-muted-foreground">
                        Entreprises et associations qui accompagnent leurs collaborateurs
                        ou bénéficiaires dans leurs démarches administratives.
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold mb-1">Partenaires</h3>
                      <p className="text-xs text-muted-foreground">
                        Avocats, associations et consulats qui interviennent sur certains
                        dossiers via l&apos;espace dédié.
                      </p>
                    </div>
                  </div>
                </div>
                )}

                {selectedId === 'method' && (
                <div>
                  <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-3">
                    Notre manière de travailler
                  </h2>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    <li>
                      <span className="font-semibold text-foreground">1. Analyse de la situation</span>
                      <span className="block text-xs sm:text-sm">
                        Un premier échange permet de comprendre votre situation et de
                        déterminer, avec un langage clair et des explications pédagogiques,
                        le type de dossier et la stratégie les plus adaptés pour une
                        prise en charge rapide et une satisfaction complète.
                      </span>
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">2. Création du dossier</span>
                      <span className="block text-xs sm:text-sm">
                        Nous créons un dossier structuré dans la plateforme, avec une
                        référence unique et des informations claires. Cet espace en ligne
                        vous permet de suivre, en temps réel, l&apos;ensemble des actions
                        réalisées dans le cadre de la procédure.
                      </span>
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">3. Documents à préparer</span>
                      <span className="block text-xs sm:text-sm">
                        Vous visualisez la liste complète des documents à transmettre, ainsi
                        que des modèles prêts à l&apos;emploi pour chaque type de document
                        demandé (recours, attestations, déclarations, etc.), avec l&apos;état
                        de complétude de votre dossier mis à jour en temps réel.
                      </span>
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">4. Suivi et échanges</span>
                      <span className="block text-xs sm:text-sm">
                        Vous pouvez suivre l&apos;avancement, échanger des messages sécurisés
                        et être notifié des actions importantes.
                      </span>
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">5. Clôture et suppression</span>
                      <span className="block text-xs sm:text-sm">
                        Une fois la procédure terminée, le dossier est clôturé et les documents
                        sont supprimés de la plateforme, conformément à notre politique de
                        conservation des données.
                      </span>
                    </li>
                  </ol>
                </div>
                )}

                {selectedId === 'commitments' && (
                <div>
                  <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-3">
                    Nos engagements
                  </h2>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold mb-1">Confidentialité</h3>
                      <p className="text-xs text-muted-foreground">
                        Vos données et documents sont traités avec un haut niveau de
                        confidentialité et de sécurité.
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold mb-1">Clarté</h3>
                      <p className="text-xs text-muted-foreground">
                        Nous expliquons chaque étape et chaque demande de document dans un
                        langage clair, compréhensible par tous.
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold mb-1">Disponibilité</h3>
                      <p className="text-xs text-muted-foreground">
                        Vous pouvez nous contacter facilement via la plateforme ou la page
                        de contact pour toute question liée à votre dossier.
                      </p>
                    </div>
                  </div>
                </div>
                )}

                {selectedId === 'team' && (
                <div>
                  <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-3">
                    Notre équipe
                  </h2>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-3">
                    L&apos;équipe Ada Papers est composée de professionnels spécialisés dans le
                    droit des étrangers, qui travaillent en étroite collaboration avec des avocats,
                    des associations et le Consulat du Sénégal. Cette synergie permet de traiter
                    chaque situation avec sérieux, précision et sens pratique.
                  </p>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                    L&apos;équipe est dirigée par Papa Abdoulaye WADE, chargé d&apos;enseignement
                    et consultant en droit des étrangers, qui met son expérience académique et
                    pratique au service de l&apos;accompagnement des personnes étrangères dans
                    leurs démarches et éventuels contentieux liés au séjour.
                  </p>
                </div>
                )}

                {/* Bloc CTA final, toujours visible */}
                <div className="pt-4 border-t border-border/60">
                  <h3 className="text-sm sm:text-base font-semibold text-foreground mb-2">
                    En savoir plus ou démarrer un dossier
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                    Vous avez un projet, une question ou un dossier à lancer ? Parlons-en.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/contact"
                      className="px-4 py-2.5 rounded-md bg-orange-500 text-white text-xs sm:text-sm font-semibold hover:bg-orange-600 transition-colors"
                    >
                      Contactez-nous
                    </Link>
                    <Link
                      href="/auth/signup"
                      className="px-4 py-2.5 rounded-md border border-gray-300 text-xs sm:text-sm font-semibold text-foreground hover:bg-gray-50 transition-colors"
                    >
                      Créer un compte
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}


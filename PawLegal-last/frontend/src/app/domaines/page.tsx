'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

export default function DomainesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10">
      <Header variant="home" />

      {/* Hero Section compacte */}
      <section className="relative py-8 bg-gradient-to-br from-primary/10 via-primary/5 to-background overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-block mb-3 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/20">
              <span className="text-xs font-medium text-primary">Nos Domaines d'Expertise</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3 text-foreground leading-tight">
              Domaines d'Intervention
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              Expertise juridique spécialisée pour vous accompagner dans vos démarches
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-8 md:py-12">
        {/* Section Droit des étrangers */}
        <section className="mb-8 md:mb-12">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border-2 border-primary/20">
              {/* En-tête compacte */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">
                  🌍
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl md:text-3xl font-bold mb-2 text-primary">Droit des étrangers</h2>
                  <p className="text-sm md:text-base text-muted-foreground">
                    Accompagnement des particuliers et entreprises dans les démarches liées au séjour, au travail et à la nationalité
                  </p>
                </div>
              </div>

              {/* Contenu structuré compact */}
              <div className="grid md:grid-cols-2 gap-4 md:gap-6">
                {/* Colonne gauche */}
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-4 border border-primary/20">
                    <h3 className="text-lg font-bold mb-3 text-primary flex items-center gap-2">
                      <span>📋</span> Titres de séjour
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Premières demandes</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Renouvellements</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Changement de statut</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Carte de séjour talent</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Étudiants / salariés / vie privée et familiale / visiteur</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Cartes pluriannuelles et carte de résident</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                    <h3 className="text-lg font-bold mb-3 text-blue-600 flex items-center gap-2">
                      <span>⚖️</span> Procédures de recours
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Recours administratifs (Refus de renouvellement, OQTF, IRTF, Retrait de titre)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Recours contentieux</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Colonne droite */}
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-green-500/5 to-green-500/10 rounded-lg p-4 border border-green-500/20">
                    <h3 className="text-lg font-bold mb-3 text-green-600 flex items-center gap-2">
                      <span>👨‍👩‍👧‍👦</span> Regroupement familial et famille
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Regroupement familial</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Vie privée et familiale</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Conjoints de Français</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Parents d'enfant français</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gradient-to-br from-purple-500/5 to-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                    <h3 className="text-lg font-bold mb-3 text-purple-600 flex items-center gap-2">
                      <span>🇫🇷</span> Nationalité française
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-purple-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Naturalisation par décret</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* CTA compacte */}
              <div className="mt-6 pt-6 border-t border-border">
                <Link href="/contact">
                  <Button className="w-full sm:w-auto text-sm">
                    Demander un devis
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Section Formalités de création d'entreprise */}
        <section className="mb-8 md:mb-12">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border-2 border-primary/20">
              {/* En-tête compacte */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">
                  🏢
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl md:text-3xl font-bold mb-2 text-primary">Formalités de création d'entreprise</h2>
                  <p className="text-sm md:text-base text-muted-foreground">
                    Accompagnement des entrepreneurs, investisseurs, startups et PME de l'idée à la création légale
                  </p>
                </div>
              </div>

              {/* Contenu structuré compact */}
              <div className="grid md:grid-cols-2 gap-4 md:gap-6">
                {/* Colonne gauche */}
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-4 border border-primary/20">
                    <h3 className="text-lg font-bold mb-3 text-primary flex items-center gap-2">
                      <span>📊</span> Choix de la structure juridique
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">SAS / SASU</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">SARL / EURL</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Micro-entreprise</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Association</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Holding</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                    <h3 className="text-lg font-bold mb-3 text-blue-600 flex items-center gap-2">
                      <span>📝</span> Formalités de création
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Rédaction des statuts</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Enregistrement au registre national des entreprises (RNE)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Publication d'annonce légale</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Dépôt de capital</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Obtention du Kbis</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gradient-to-br from-green-500/5 to-green-500/10 rounded-lg p-4 border border-green-500/20">
                    <h3 className="text-lg font-bold mb-3 text-green-600 flex items-center gap-2">
                      <span>💼</span> Suivi post-création
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Modifications statutaires</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Assemblées générales</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Contrats commerciaux</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Colonne droite */}
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-purple-500/5 to-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                    <h3 className="text-lg font-bold mb-3 text-purple-600 flex items-center gap-2">
                      <span>💰</span> Accompagnement fiscal & social
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-purple-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Choix du régime fiscal</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-purple-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Régime social du dirigeant</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-purple-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Optimisation fiscale de départ</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gradient-to-br from-orange-500/5 to-orange-500/10 rounded-lg p-4 border border-orange-500/20">
                    <h3 className="text-lg font-bold mb-3 text-orange-600 flex items-center gap-2">
                      <span>🌍</span> Accompagnement des entrepreneurs étrangers
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-orange-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Visa entrepreneur / passeport talent entreprise innovante</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-orange-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Création d'une société en France en tant qu'étranger</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-orange-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Domiciliation, représentant légal, etc.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* CTA compacte */}
              <div className="mt-6 pt-6 border-t border-border">
                <Link href="/contact">
                  <Button className="w-full sm:w-auto text-sm">
                    Demander un devis
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Section Droit des contrats */}
        <section className="mb-8 md:mb-12">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border-2 border-primary/20">
              {/* En-tête compacte */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">
                  📄
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl md:text-3xl font-bold mb-2 text-primary">Droit des contrats</h2>
                  <p className="text-sm md:text-base text-muted-foreground">
                    Rédaction, analyse et audit de contrats pour entreprises, particuliers et professionnels indépendants
                  </p>
                </div>
              </div>

              {/* Contenu structuré compact */}
              <div className="grid md:grid-cols-2 gap-4 md:gap-6">
                {/* Colonne gauche */}
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-4 border border-primary/20">
                    <h3 className="text-lg font-bold mb-3 text-primary flex items-center gap-2">
                      <span>✍️</span> Rédaction et analyse de contrats
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Contrats entre particuliers</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Contrats commerciaux (prestations de services, vente, partenariat)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Conditions générales (CGV / CGU)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Contrats de distribution</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Contrats de sous-traitance</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Contrats informatiques (SaaS, maintenance, développement)</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gradient-to-br from-green-500/5 to-green-500/10 rounded-lg p-4 border border-green-500/20">
                    <h3 className="text-lg font-bold mb-3 text-green-600 flex items-center gap-2">
                      <span>👥</span> Contrats pour particuliers
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Bail d'habitation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Contrat de location</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Reconnaissance de dettes</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Transactions amiables</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Colonne droite */}
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                    <h3 className="text-lg font-bold mb-3 text-blue-600 flex items-center gap-2">
                      <span>💼</span> Contrats de travail et ressources humaines
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Rédaction de CDI / CDD</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Clauses sensibles (non-concurrence, mobilité, confidentialité)</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gradient-to-br from-purple-500/5 to-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                    <h3 className="text-lg font-bold mb-3 text-purple-600 flex items-center gap-2">
                      <span>🔍</span> Audit et conformité contractuelle
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-purple-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Vérification des risques juridiques</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-purple-600 mt-0.5 text-xs">•</span>
                        <span className="text-foreground">Mise en conformité avec le RGPD</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* CTA compacte */}
              <div className="mt-6 pt-6 border-t border-border">
                <Link href="/contact">
                  <Button className="w-full sm:w-auto text-sm">
                    Demander un devis
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}

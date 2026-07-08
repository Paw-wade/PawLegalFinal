'use client';

import Link from 'next/link';
import { Footer } from '@/components/layout/Footer';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    ghost: 'hover:bg-accent',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

export default function PolitiqueConfidentialitePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-primary">Ada Papers</Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="hover:text-primary">Accueil</Link>
              <Link href="/services" className="hover:text-primary">Services</Link>
              <Link href="/calculateur" className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors shadow-md">Calculateur</Link>
              <Link href="/faq" className="hover:text-primary">FAQ</Link>
              <Link href="/contact" className="hover:text-primary">Contact</Link>
            </nav>
            <div className="flex items-center gap-4">
              <Link href="/auth/signin"><Button variant="ghost">Connexion</Button></Link>
              <Link href="/auth/signup"><Button>Créer un compte</Button></Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 sm:py-16 flex-1">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8">
            Politique de confidentialité
          </h1>
          
          <div className="bg-white rounded-lg shadow-lg p-6 sm:p-8 space-y-6 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">1. Objet de la Politique</h2>
              <p>
                La présente Politique de confidentialité décrit comment Ada Papers collecte, utilise, conserve et
                protège les données personnelles des utilisateurs de la Plateforme, conformément au Règlement (UE)
                2016/679 (RGPD) et à la loi Informatique et Libertés modifiée.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">2. Responsable de traitement</h2>
              <p>
                Le responsable de traitement est :
              </p>
              <p className="mt-1">
                <strong>Papa Abdoulaye WADE / Ada Papers</strong><br />
                28 Rue Patou, 59800 Lille<br />
                E‑mail :{' '}
                <a href="mailto:contact@adapapers.fr" className="text-primary hover:underline">
                  contact@adapapers.fr
                </a><br />
                Téléphone :{' '}
                <a href="tel:+33768033358" className="text-primary hover:underline">
                  +33 7 68 03 33 58
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">3. Données collectées</h2>
              <p>
                Ada Papers peut collecter les catégories de données suivantes :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>Données d'identification</strong> : prénom, nom, adresse e‑mail, numéro de téléphone.</li>
                <li><strong>Données relatives au dossier</strong> : informations sur votre situation administrative, type de titre de séjour, dates importantes, documents transmis ou à transmettre, catégorie de démarches, historique des actions.</li>
                <li><strong>Données de connexion et d'usage</strong> : identifiants de connexion, logs, adresse IP, type de navigateur, pages consultées, date et heure d'accès.</li>
                <li><strong>Échanges</strong> : messages envoyés via la Plateforme, réponses aux formulaires, commentaires éventuels.</li>
              </ul>
              <p className="mt-2">
                Certaines données peuvent être sensibles au sens large (informations sur la situation administrative,
                contentieux…), mais elles sont collectées uniquement dans la mesure nécessaire à l'accompagnement
                des démarches confiées.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">4. Finalités du traitement</h2>
              <p>
                Les données sont traitées pour les finalités suivantes :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>création et gestion du compte utilisateur ;</li>
                <li>constitution, suivi et mise à jour du dossier sur la Plateforme ;</li>
                <li>mise à disposition de modèles de documents et personnalisation de ces modèles ;</li>
                <li>accompagnement dans les démarches administratives (préparation des dossiers, rappels, suivi) ;</li>
                <li>gestion de la relation avec les utilisateurs (support, réponses aux demandes, notifications) ;</li>
                <li>amélioration de la Plateforme (statistiques anonymisées, ergonomie, sécurité).</li>
              </ul>
              <p className="mt-2">
                Les bases légales sont :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>l'exécution de mesures précontractuelles et contractuelles (gestion du compte et du dossier) ;</li>
                <li>le respect d'obligations légales le cas échéant ;</li>
                <li>l'intérêt légitime d'Ada Papers (amélioration du service, sécurisation) ;</li>
                <li>votre consentement, lorsque requis (par exemple, pour certaines communications).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">5. Destinataires des données</h2>
              <p>
                Vos données peuvent être transmises, dans la limite de ce qui est strictement nécessaire :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>aux membres autorisés de l'équipe Ada Papers ;</li>
                <li>à des partenaires intervenant sur le dossier (avocats, associations, etc.), uniquement si vous y consentez ou si cela est indispensable à l'exécution de la mission ;</li>
                <li>aux prestataires techniques (hébergement, maintenance, envoi d'e‑mails/SMS), agissant en qualité de sous-traitants, liés par des obligations contractuelles de confidentialité et de sécurité.</li>
              </ul>
              <p className="mt-2">
                Aucune donnée n'est cédée à des fins de prospection commerciale à des tiers sans votre accord explicite.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">6. Durée de conservation</h2>
              <p>
                Les données sont conservées pour la durée strictement nécessaire aux finalités poursuivies :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>données de compte : pendant la durée d'utilisation de la Plateforme, puis pendant une durée limitée nécessaire au respect des obligations légales ou à la défense des droits d'Ada Papers ;</li>
                <li>données de dossier : pendant la durée de la procédure, puis archivage ou suppression selon la nature des démarches, les délais de prescription applicables et la politique interne de conservation ;</li>
                <li>logs techniques : pour une durée limitée, généralement quelques mois, à des fins de sécurité et de traçabilité.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">7. Sécurité des données</h2>
              <p>
                Ada Papers met en œuvre des mesures techniques et organisationnelles raisonnables pour protéger les
                données :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>contrôle des accès (comptes, mots de passe, rôles) ;</li>
                <li>chiffrement des communications (HTTPS) ;</li>
                <li>sauvegardes régulières ;</li>
                <li>journalisation des accès et actions sensibles ;</li>
                <li>sensibilisation de l'équipe à la confidentialité.</li>
              </ul>
              <p className="mt-2">
                En cas de violation de données susceptible d'engendrer un risque pour vos droits et libertés,
                vous serez informé conformément aux textes applicables.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">8. Vos droits</h2>
              <p>
                Conformément au RGPD, vous disposez des droits suivants sur vos données :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>Droit d'accès</strong> : obtenir la confirmation que des données vous concernant sont traitées et en recevoir une copie ;</li>
                <li><strong>Droit de rectification</strong> : corriger des données inexactes ou incomplètes ;</li>
                <li><strong>Droit d'effacement</strong> (droit à l'oubli) : demander la suppression de vos données, dans les limites des obligations légales ;</li>
                <li><strong>Droit à la limitation</strong> : demander la suspension temporaire d'un traitement dans certaines conditions ;</li>
                <li><strong>Droit d'opposition</strong> : vous opposer, pour des raisons tenant à votre situation particulière, à certains traitements fondés sur l'intérêt légitime ;</li>
                <li><strong>Droit à la portabilité</strong> : recevoir les données que vous avez fournies dans un format structuré, ou demander leur transmission à un autre responsable lorsque cela est techniquement possible.</li>
              </ul>
              <p className="mt-2">
                Pour exercer vos droits, vous pouvez contacter :{' '}
                <a href="mailto:contact@adapapers.fr" className="text-primary hover:underline">
                  contact@adapapers.fr
                </a>
                .
              </p>
              <p className="mt-2">
                Vous disposez également du droit d'introduire une réclamation auprès de la CNIL (www.cnil.fr).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">9. Cookies et traceurs</h2>
              <p>
                La Plateforme peut utiliser des cookies ou traceurs techniques (nécessaires au fonctionnement :
                session, sécurité, préférences de langue, etc.) et, le cas échéant, des outils de mesure d'audience.
              </p>
              <p className="mt-2">
                Lorsque la loi l'exige, votre consentement est recueilli pour les cookies non strictement
                nécessaires. Vous pouvez paramétrer vos choix via votre navigateur ou, si disponible, via le
                bandeau de gestion des cookies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">10. Transferts hors UE</h2>
              <p>
                En principe, les données sont hébergées au sein de l'Union européenne. Si un transfert hors UE
                devait intervenir (par exemple via un prestataire), Ada Papers s'engage à mettre en place les
                garanties appropriées (clauses contractuelles types, encadrement juridique adéquat) afin d'assurer
                un niveau de protection suffisant.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2 text-primary">11. Évolutions de la Politique</h2>
              <p>
                La présente Politique peut être mise à jour pour tenir compte des évolutions légales ou techniques.
                En cas de changement significatif, une information pourra être communiquée via la Plateforme.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}


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

export default function CGUPage() {
  return (
    <div className="min-h-screen bg-background">
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

      <main className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8">
            Conditions Générales d&apos;Utilisation
          </h1>
          
          <div className="bg-white rounded-lg shadow-lg p-6 sm:p-8 space-y-6 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">1. Objet</h2>
              <p>
                Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU ») ont pour objet de définir
                les modalités et conditions d&apos;accès et d&apos;utilisation de la plateforme Ada Papers (ci-après
                « la Plateforme »), éditée par Ada Papers, ainsi que les droits et obligations des utilisateurs
                et de l&apos;éditeur.
              </p>
              <p className="mt-2">
                En accédant à la Plateforme et en créant un compte, vous reconnaissez avoir pris connaissance
                des présentes CGU, les comprendre et les accepter sans réserve.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">2. Acceptation des CGU</h2>
              <p>
                L&apos;utilisation de la Plateforme implique l&apos;acceptation pleine et entière des présentes CGU.
                Si vous n&apos;acceptez pas ces conditions, vous devez cesser d&apos;utiliser la Plateforme.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">3. Services</h2>
              <p>
                Ada Papers est une plateforme numérique d&apos;accompagnement aux démarches administratives liées
                au séjour en France (titres de séjour, renouvellements, regroupement familial, recours, etc.).
              </p>
              <p className="mt-2">
                La Plateforme permet notamment :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>la création et le suivi d&apos;un dossier personnel ;</li>
                <li>la mise à disposition de modèles de documents (recours, attestations, déclarations…) ;</li>
                <li>le suivi des documents à transmettre et de l&apos;état d&apos;avancement du dossier ;</li>
                <li>l&apos;échange d&apos;informations et de pièces avec l&apos;équipe d&apos;Ada Papers et, le cas échéant, avec des partenaires (avocats, associations, etc.) ;</li>
                <li>l&apos;accès à des contenus d&apos;information (FAQ, articles, forum, calculateur de délais…).</li>
              </ul>
              <p className="mt-2">
                Sauf mention contraire expresse, Ada Papers n&apos;est pas un cabinet d&apos;avocats et ne se substitue
                pas aux actes réservés aux avocats ni à un accompagnement personnalisé par un avocat ou un professionnel
                du droit lorsque la situation l&apos;exige.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">4. Utilisation du compte</h2>
              <p>
                Lors de la création de compte, vous vous engagez à fournir des informations exactes, complètes et à jour,
                à ne pas usurper l&apos;identité d&apos;un tiers et à conserver vos identifiants de connexion strictement
                confidentiels.
              </p>
              <p className="mt-2">
                Vous êtes seul responsable de toute activité réalisée via votre compte. Ada Papers se réserve le droit de
                suspendre ou de supprimer tout compte en cas de non-respect des CGU, d&apos;information manifestement
                fausse ou trompeuse, ou de comportement frauduleux, abusif ou contraire à l&apos;ordre public ou aux
                bonnes mœurs.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">5. Protection des données</h2>
              <p>
                Le traitement de vos données personnelles dans le cadre de la Plateforme est régi par la{' '}
                <Link href="/politique-confidentialite" className="text-primary hover:underline font-semibold">
                  Politique de confidentialité
                </Link>{' '}
                d&apos;Ada Papers, qui fait partie intégrante des présentes CGU.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">6. Utilisation conforme du service</h2>
              <p>
                Vous vous engagez à utiliser la Plateforme dans le strict respect des lois et règlements en vigueur, pour
                vos propres besoins et/ou ceux de la structure que vous représentez, sans porter atteinte aux droits de
                tiers (données personnelles, droits d&apos;auteur, secret professionnel, etc.).
              </p>
              <p className="mt-2">
                Vous vous interdisez notamment de :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>transmettre via la Plateforme des contenus illicites, injurieux, diffamatoires, discriminatoires, haineux ou violents ;</li>
                <li>transmettre des virus, malwares ou tout code visant à endommager ou perturber le service ;</li>
                <li>tenter d&apos;accéder de manière non autorisée à des données ou espaces réservés ;</li>
                <li>détourner la Plateforme de sa finalité, notamment à des fins de prospection non autorisée ou de spamming.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">7. Nature des informations fournies</h2>
              <p>
                Les informations, modèles de documents, guides, FAQ, simulateurs et autres contenus mis à disposition
                sur la Plateforme ont une vocation pédagogique et pratique. Ils ne constituent ni un accompagnement
                personnalisé suffisant lorsque la situation l&apos;exige, ni un guide exhaustif, et ne sauraient se
                substituer à la consultation d&apos;un avocat ou d&apos;un professionnel du droit lorsque la situation
                l&apos;exige.
              </p>
              <p className="mt-2">
                Ada Papers met tout en œuvre pour fournir des informations à jour, mais ne garantit pas l&apos;exhaustivité
                ni l&apos;absence totale d&apos;erreur, et ne peut être tenu responsable des conséquences d&apos;une
                utilisation inadaptée, incomplète ou non mise à jour des informations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">8. Responsabilité</h2>
              <p>
                Ada Papers ne saurait être tenu responsable :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>des conséquences liées à des informations incomplètes, inexactes ou omises fournies par l&apos;utilisateur ;</li>
                <li>de l&apos;utilisation que vous faites des modèles et documents générés via la Plateforme ;</li>
                <li>des décisions et pratiques des administrations (préfectures, consulats, etc.) ou des juridictions ;</li>
                <li>des dommages indirects (perte de chance, préjudice commercial, perte de données, etc.) résultant de l&apos;utilisation de la Plateforme.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">9. Disponibilité et maintenance</h2>
              <p>
                Ada Papers se réserve le droit, à tout moment, de modifier, suspendre ou interrompre tout ou partie de
                la Plateforme, notamment pour des opérations de maintenance programmée ou d&apos;urgence.
              </p>
              <p className="mt-2">
                Ada Papers fera ses meilleurs efforts pour limiter la durée et l&apos;impact des interruptions, sans que
                cela ne constitue une obligation de résultat.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">10. Propriété intellectuelle</h2>
              <p>
                L&apos;ensemble des éléments de la Plateforme (textes, logos, graphismes, interfaces, bases de données,
                modèles de documents, etc.) est protégé par le droit de la propriété intellectuelle.
              </p>
              <p className="mt-2">
                Sauf autorisation écrite préalable, vous vous interdisez de reproduire, copier, modifier, diffuser tout
                ou partie de la Plateforme et de ses contenus pour un usage autre que strictement personnel. Les modèles
                de documents sont concédés pour votre usage direct dans le cadre de vos démarches et ne peuvent être
                revendus ou diffusés à des tiers sans accord préalable d&apos;Ada Papers.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">11. Liens externes</h2>
              <p>
                La Plateforme peut contenir des liens hypertexte vers des sites tiers. Ada Papers n&apos;exerce aucun
                contrôle sur ces sites et décline toute responsabilité quant à leur contenu ou à tout dommage qui
                pourrait résulter de leur consultation.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">12. Modification des CGU</h2>
              <p>
                Ada Papers se réserve le droit de modifier les présentes CGU à tout moment. En cas de modification
                substantielle, une information pourra être communiquée via la Plateforme ou par e-mail. L&apos;utilisation
                continue de la Plateforme après modification vaut acceptation des nouvelles CGU.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">13. Droit applicable et juridiction compétente</h2>
              <p>
                Les présentes CGU sont soumises au droit français. En cas de litige et à défaut de résolution amiable,
                les tribunaux français seront seuls compétents.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}


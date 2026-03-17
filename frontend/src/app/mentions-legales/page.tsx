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

export default function MentionsLegalesPage() {
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
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8">
            Mentions légales
          </h1>

          <section className="space-y-6 text-sm text-muted-foreground leading-relaxed bg-white rounded-lg shadow-lg p-6 sm:p-8">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Site</h2>
              <p>
                Site créé par <strong>Papa Abdoulaye WADE</strong>.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Éditeur du site</h2>
              <p>
                <strong>Ada Papers</strong><br />
                (Représenté par Papa Abdoulaye WADE)
              </p>
              <p className="mt-1">
                Adresse : 28 Rue Patou, 59800 Lille<br />
                E‑mail :{' '}
                <a href="mailto:contact@adapapers.fr" className="text-primary hover:underline">
                  contact@adapapers.fr
                </a><br />
                Téléphone :{' '}
                <a href="tel:+33768033358" className="text-primary hover:underline">
                  +33 7 68 03 33 58
                </a>
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Responsable de traitement</h2>
              <p>
                Le responsable de traitement des données collectées via la Plateforme est :
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
              <p className="mt-2 text-xs">
                Pour plus de détails sur le traitement des données, veuillez consulter notre{' '}
                <Link href="/politique-confidentialite" className="text-primary hover:underline font-semibold">
                  Politique de confidentialité
                </Link>
                .
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Propriété intellectuelle</h2>
              <p>
                Sauf mention contraire, l&apos;ensemble des éléments présents sur cette Plateforme (textes, logos,
                visuels, modèles de documents, etc.) est la propriété d&apos;Ada Papers et ne peut être reproduit
                ou réutilisé sans autorisation préalable écrite.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Données personnelles</h2>
              <p>
                Les modalités de collecte et de traitement des données personnelles des utilisateurs sont décrites
                dans la{' '}
                <Link href="/politique-confidentialite" className="text-primary hover:underline font-semibold">
                  Politique de confidentialité
                </Link>
                .
              </p>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}


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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-primary">Paw Legal</Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="hover:text-primary">Accueil</Link>
              <Link href="/domaines" className="hover:text-primary">Domaines</Link>
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

      <main className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Politique de Confidentialité</h1>
          
          <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">1. Collecte des données</h2>
              <p className="text-muted-foreground">
                Nous collectons les données personnelles nécessaires à la fourniture de nos services : nom, prénom, email, téléphone, et informations relatives à vos dossiers.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">2. Utilisation des données</h2>
              <p className="text-muted-foreground">
                Vos données sont utilisées exclusivement pour la gestion de vos dossiers, la communication avec vous, et l'amélioration de nos services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">3. Conservation des données</h2>
              <p className="text-muted-foreground">
                Les données sont conservées pendant la durée nécessaire aux finalités pour lesquelles elles ont été collectées, conformément aux obligations légales.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">4. Vos droits</h2>
              <p className="text-muted-foreground">
                Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, de suppression et de portabilité de vos données personnelles.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">5. Sécurité</h2>
              <p className="text-muted-foreground">
                Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données contre tout accès non autorisé.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">6. Contact</h2>
              <p className="text-muted-foreground">
                Pour toute question concernant vos données personnelles, contactez-nous à : contact@pawlegal.fr
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}


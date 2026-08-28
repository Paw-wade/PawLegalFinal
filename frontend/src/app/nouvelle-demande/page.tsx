'use client';

import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import DemandeWizard from '@/components/demande/DemandeWizard';

export default function NouvelleDemandePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
      <Header variant="home" />

      {/* Hero */}
      <section className="relative py-12 bg-gradient-to-br from-primary/10 via-primary/5 to-background overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-block mb-3 px-4 py-1.5 bg-primary/10 rounded-full border border-primary/20">
              <span className="text-sm font-medium text-primary">Sans créer de compte</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4 text-foreground leading-tight">
              Démarrer ma <span className="text-primary">demande</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Accompagnement, recours ou constitution de société : choisissez votre situation, décrivez votre besoin
              et laissez-nous vos coordonnées. Notre équipe vous recontacte.
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 pb-12 pt-6">
        <div className="max-w-5xl mx-auto">
          <DemandeWizard showBackLink={false} heading={null} className="w-full" />
        </div>
      </main>

      <Footer />
    </div>
  );
}

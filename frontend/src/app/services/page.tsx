'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { servicesConfig } from '@/data/servicesConfig';

function Button({ children, variant = 'default', className = '', size = 'default', ...props }: any) {
  const baseClasses =
    'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  const sizeClasses = {
    default: 'h-10 py-2 px-4 text-sm',
    sm: 'h-9 px-3 text-sm',
    lg: 'h-11 px-8 text-base',
  };
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default function ServicesPage() {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectedService =
    servicesConfig[selectedIndex] ?? (servicesConfig.length > 0 ? servicesConfig[0] : null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
      <Header variant="home" />

      {/* Hero Section */}
      <section className="relative py-12 md:py-16 bg-gradient-to-br from-primary/5 via-primary/10 to-background overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-block mb-3 px-4 py-1 bg-primary/10 rounded-full border border-primary/20">
              <span className="text-xs md:text-sm font-medium text-primary tracking-wide uppercase">
                Nos principaux services
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold mb-4 text-foreground leading-tight px-4">
              Des solutions claires, structurées et opérationnelles
            </h1>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-12 md:py-16">
        {/* Navigation thématique + contenu détaillé */}
        <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]">
          {/* Colonne gauche : thèmes de services */}
          <aside className="space-y-3">
            <div className="md:hidden mb-2">
              <p className="text-xs text-muted-foreground mb-2">
                Faites défiler les cartes puis touchez un service pour afficher le détail.
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {servicesConfig.map((service, index) => {
                  const Icon = service.icon;
                  const isActive = index === selectedIndex;
                  return (
                    <button
                      key={service.title + index}
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex-shrink-0 min-w-[220px] rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                        isActive
                          ? 'border-primary bg-primary/5 shadow-md'
                          : 'border-gray-200 bg-white hover:border-primary/40 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-primary bg-primary/5`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground line-clamp-2">
                            {service.title}
                          </p>
                          {service.duree && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              {service.duree}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hidden md:block">
              <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-1.5 shadow-sm">
                {servicesConfig.map((service, index) => {
                  const Icon = service.icon;
                  const isActive = index === selectedIndex;
                  return (
                    <button
                      key={service.title + index}
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full text-left rounded-xl px-3.5 py-3 flex items-start gap-3 transition-all duration-200 ${
                        isActive
                          ? 'bg-primary/5 border border-primary/60 shadow-sm'
                          : 'border border-transparent hover:bg-muted/40'
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center ${
                          isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {service.title}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Colonne droite : contenu détaillé du service sélectionné */}
          <section>
            {selectedService ? (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-7">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-1">
                      {selectedService.title}
                    </h2>
                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                      {selectedService.description}
                    </p>
                  </div>
                </div>

                {/* Infos clés */}
                {(selectedService.duree || selectedService.prix) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 pb-4 border-b border-border/60">
                    {selectedService.duree && (
                      <div className="text-xs md:text-sm">
                        <p className="font-semibold text-foreground">Durée indicative</p>
                        <p className="text-muted-foreground mt-0.5">
                          {selectedService.duree}
                        </p>
                      </div>
                    )}
                    {selectedService.prix && (
                      <div className="text-xs md:text-sm">
                        <p className="font-semibold text-foreground">Tarification</p>
                        <p className="text-muted-foreground mt-0.5">
                          {selectedService.prix}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Points détaillés */}
                {selectedService.points?.length ? (
                  <div className="mb-6">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                      Ce que comprend cet accompagnement
                    </p>
                    <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">
                      {selectedService.points.map((point: string, i: number) => (
                        <li key={i} className="leading-relaxed">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Appel à l'action */}
                <div className="pt-4 border-t border-border/60 mt-4 flex flex-wrap gap-3 justify-between items-center">
                  <div className="text-xs text-muted-foreground max-w-xs">
                    Un doute sur le service le plus adapté ? Nous pouvons vous orienter lors d&apos;un
                    premier échange.
                  </div>
                  <div className="flex gap-3">
                    {selectedService.isPortal === true ? (
                      <Link href="/calculateur">
                        <Button
                          className="bg-primary text-white hover:bg-primary/90 transition-colors"
                          size="lg"
                        >
                          Accéder au calculateur
                        </Button>
                      </Link>
                    ) : selectedService.ctaHref ? (
                      <Link href={selectedService.ctaHref}>
                        <Button
                          className="bg-primary text-white hover:bg-primary/90 transition-colors"
                          size="lg"
                        >
                          {selectedService.ctaLabel ?? 'Continuer'}
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/contact">
                        <Button
                          variant="outline"
                          className="border border-border text-foreground hover:bg-primary hover:text-white hover:border-primary transition-colors"
                          size="lg"
                        >
                          Parler de mon dossier
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-sm text-muted-foreground">
                Aucun service n&apos;est configuré pour le moment.
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

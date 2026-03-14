'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { servicesConfig } from '@/data/servicesConfig';

function Button({ children, variant = 'default', className = '', size = 'default', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  const sizeClasses = {
    default: 'h-10 py-2 px-4 text-sm',
    sm: 'h-9 px-3 text-sm',
    lg: 'h-11 px-8 text-base',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>{children}</button>;
}

export default function ServicesPage() {
  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; text: string; border: string; hover: string }> = {
      primary: {
        bg: 'bg-primary/5',
        text: 'text-primary',
        border: 'border-primary/20',
        hover: 'hover:border-primary',
      },
      blue: {
        bg: 'bg-blue-500/5',
        text: 'text-blue-600',
        border: 'border-blue-500/20',
        hover: 'hover:border-blue-500',
      },
      green: {
        bg: 'bg-green-500/5',
        text: 'text-green-600',
        border: 'border-green-500/20',
        hover: 'hover:border-green-500',
      },
      purple: {
        bg: 'bg-purple-500/5',
        text: 'text-purple-600',
        border: 'border-purple-500/20',
        hover: 'hover:border-purple-500',
      },
    };
    return colors[color] || colors.primary;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
      <Header variant="home" />

      {/* Hero Section */}
      <section className="relative py-10 md:py-14 bg-gradient-to-br from-primary/5 via-primary/3 to-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-block mb-3 px-4 py-1 bg-primary/10 rounded-full border border-primary/20">
              <span className="text-xs md:text-sm font-medium text-primary tracking-wide uppercase">
                Nos principaux services
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold mb-4 text-foreground leading-tight px-4">
              Des solutions juridiques claires et structurées
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed px-4">
              Nous vous accompagnons à chaque étape&nbsp;: première analyse, suivi de dossier
              et gestion complète de votre titre de séjour.
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-20">

        {/* Cartes de services */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
          {servicesConfig.map((service, index) => {
            const Icon = service.icon;
            const colors = getColorClasses(service.color);
            const isCalculator = index === 2; // Portail titre de séjour -> calculateur
            return (
              <div
                key={index}
                className={`group relative bg-white rounded-2xl shadow-sm p-6 border ${colors.border} transition-all duration-200 hover:shadow-md hover:-translate-y-1 hover:border-primary/70 flex flex-col`}
              >
                <div className={`mb-4 w-14 h-14 rounded-xl ${colors.bg} ${colors.text} flex items-center justify-center border ${colors.border}`}>
                  <Icon className="w-8 h-8" />
                </div>
                <div className="mb-4">
                  <h3 className="text-lg md:text-xl font-semibold text-foreground mb-1 break-words hyphens-auto">
                    {service.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed break-words">
                    {service.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-border/60 mt-auto">
                  {isCalculator ? (
                    <Link href="/calculateur" className="block">
                      <Button
                        className="w-full bg-primary text-white hover:bg-primary/90 transition-colors"
                        size="lg"
                      >
                        Accéder au Calculateur
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/contact" className="block">
                      <Button
                        variant="outline"
                        className="w-full border border-border text-foreground hover:bg-primary hover:text-white hover:border-primary transition-colors"
                        size="lg"
                      >
                        Nous contacter
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </main>
      <Footer />
    </div>
  );
}

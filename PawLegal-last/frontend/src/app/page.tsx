'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { temoignagesAPI } from '@/lib/api';
import { ReservationWidget } from '@/components/ReservationWidget';
import { ReservationBadge } from '@/components/ReservationBadge';
import { useCmsText } from '@/lib/contentClient';

// Composant Button simplifié temporairement
function Button({ 
  children, 
  variant = 'default', 
  size = 'default', 
  className = '', 
  ...props 
}: {
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  [key: string]: any;
}) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
  };
  
  const sizeClasses = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
    icon: 'h-10 w-10',
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

export default function HomePage() {
  const { data: session } = useSession();
  const [temoignages, setTemoignages] = useState<any[]>([]);
  const [loadingTemoignages, setLoadingTemoignages] = useState(true);
  const [isWidgetOpen, setIsWidgetOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reservationWidgetOpen');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  // Textes pilotés par le CMS (avec fallback actuels)
  const heroBadge = useCmsText('home.hero.badge', 'Expertise juridique reconnue');
  const heroTitle = useCmsText(
    'home.hero.title',
    'Votre partenaire juridique de confiance'
  );
  const heroTitleHighlight = useCmsText(
    'home.hero.title_highlight',
    'juridique de confiance'
  );
  const heroSubtitle = useCmsText(
    'home.hero.subtitle',
    "Spécialisés en droit des étrangers et droit du travail, nous vous accompagnons dans toutes vos démarches administratives avec expertise et professionnalisme."
  );
  const heroCtaPrimary = useCmsText(
    'home.hero.cta_primary',
    'Créer mon compte gratuit'
  );
  const heroCtaSecondary = useCmsText(
    'home.hero.cta_secondary',
    'Consultation rapide'
  );
  const heroSmallText = useCmsText(
    'home.hero.small_text',
    "Suivez en temps réel l'évolution de votre dossier"
  );

  const domainsTitle = useCmsText(
    'home.domains.title',
    "Nos Domaines d'Intervention"
  );
  const domainsSubtitle = useCmsText(
    'home.domains.subtitle',
    'Une expertise reconnue dans trois domaines essentiels du droit'
  );

  useEffect(() => {
    const loadTemoignages = async () => {
      try {
        const response = await temoignagesAPI.getTemoignages();
        if (response.data.success) {
          setTemoignages(response.data.data || []);
        }
      } catch (error) {
        console.error('Erreur lors du chargement des témoignages:', error);
        // En cas d'erreur, utiliser des témoignages par défaut
        setTemoignages([
          {
            nom: 'Marie Dubois',
            role: 'Cliente',
            texte: 'Excellent accompagnement pour mon dossier de naturalisation. L\'équipe est très professionnelle et réactive. Je recommande vivement !',
            note: 5,
          },
          {
            nom: 'Ahmed Benali',
            role: 'Client',
            texte: 'Grâce à Paw Legal, j\'ai pu obtenir mon titre de séjour sans difficulté. Un suivi personnalisé et des conseils précieux à chaque étape.',
            note: 5,
          },
          {
            nom: 'Sophie Martin',
            role: 'Cliente',
            texte: 'Service exceptionnel pour mon dossier de regroupement familial. Tout s\'est déroulé parfaitement grâce à leur expertise.',
            note: 5,
          },
        ]);
      } finally {
        setLoadingTemoignages(false);
      }
    };

    loadTemoignages();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header Professionnel */}
      <Header variant="home" />

      {/* Hero Section avec Widget de Réservation Flottant */}
      <section className="relative py-8 bg-gradient-to-br from-primary/10 via-primary/5 to-background overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="relative">
            {/* Contenu à gauche */}
            <div className="max-w-2xl pr-4 lg:pr-80">
              <div className="inline-block mb-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                <span className="text-xs font-medium text-primary">{heroBadge}</span>
              </div>
              <h1 className="text-4xl font-bold mb-3 text-foreground leading-tight text-left">
                {heroTitle.replace(heroTitleHighlight, '').trim() || heroTitle}{' '}
                <span className="text-primary">{heroTitleHighlight}</span>
              </h1>
              <p className="text-base text-muted-foreground mb-4 text-left">
                {heroSubtitle}
              </p>
              <div className="flex items-center gap-4 mt-6">
                <Link href="/auth/signup">
                  <Button size="default" className="shadow-md whitespace-nowrap">
                    {heroCtaPrimary}
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="default" variant="outline" className="shadow-md whitespace-nowrap">
                    {heroCtaSecondary}
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-left">
                {heroSmallText}
              </p>
              <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">✓</span>
                  <span>Accompagnement personnalisé</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base">✓</span>
                  <span>Suivi 24/7</span>
                </div>
              </div>
            </div>

            {/* Widget de réservation flottant tout à droite */}
            <div className="hidden lg:block absolute top-0 right-0">
              <ReservationWidget 
                isOpen={isWidgetOpen} 
                onClose={() => {
                  setIsWidgetOpen(false);
                  localStorage.setItem('reservationWidgetOpen', 'false');
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Domaines d'intervention Améliorés */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 text-primary">{domainsTitle}</h2>
            <p className="text-lg text-primary max-w-2xl mx-auto">
              {domainsSubtitle}
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="group relative bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-8 border-2 border-transparent hover:border-primary transition-all hover:shadow-xl">
              <h3 className="text-2xl font-bold mb-4 text-primary">Droit des Étrangers</h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Accompagnement complet pour toutes vos démarches administratives liées à votre séjour en France.
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-1">✓</span>
                  <span className="text-foreground">Titres de séjour (travailleur, étudiant, famille)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-1">✓</span>
                  <span className="text-foreground">Naturalisation française</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-1">✓</span>
                  <span className="text-foreground">Regroupement familial</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-1">✓</span>
                  <span className="text-foreground">Recours contre les refus</span>
                </li>
              </ul>
              <Link href="/contact">
                <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  En savoir plus →
                </Button>
              </Link>
            </div>

            <div className="group relative bg-gradient-to-br from-blue-500/5 to-blue-500/10 rounded-2xl p-8 border-2 border-transparent hover:border-blue-500 transition-all hover:shadow-xl">
              <h3 className="text-2xl font-bold mb-4 text-blue-600">Droit du Travail</h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Protection de vos droits en tant que salarié et accompagnement dans vos démarches professionnelles.
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 mt-1">✓</span>
                  <span className="text-foreground">Contrats de travail et négociations</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 mt-1">✓</span>
                  <span className="text-foreground">Licenciements et ruptures</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 mt-1">✓</span>
                  <span className="text-foreground">Discrimination au travail</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 mt-1">✓</span>
                  <span className="text-foreground">Accidents du travail</span>
                </li>
              </ul>
              <Link href="/contact">
                <Button variant="outline" className="w-full group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  En savoir plus →
                </Button>
              </Link>
            </div>

            <div className="group relative bg-gradient-to-br from-green-500/5 to-green-500/10 rounded-2xl p-8 border-2 border-transparent hover:border-green-500 transition-all hover:shadow-xl">
              <h3 className="text-2xl font-bold mb-4 text-green-600">Rédaction de contrats</h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Rédaction et révision de contrats professionnels
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-3">
                  <span className="text-green-600 mt-1">✓</span>
                  <span className="text-foreground">Contrats commerciaux</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-600 mt-1">✓</span>
                  <span className="text-foreground">Contrats de prestation</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-600 mt-1">✓</span>
                  <span className="text-foreground">CGV / CGU</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-600 mt-1">✓</span>
                  <span className="text-foreground">Accords de confidentialité</span>
                </li>
              </ul>
              <Link href="/contact">
                <Button variant="outline" className="w-full group-hover:bg-green-500 group-hover:text-white transition-colors">
                  En savoir plus →
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Section Témoignages */}
      <section className="py-12 bg-gradient-to-br from-secondary/50 to-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold mb-4 text-foreground">Ils nous ont fait confiance</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Plus de 1000 clients nous font confiance pour leurs démarches juridiques
            </p>
          </div>
          {loadingTemoignages ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Chargement des témoignages...</p>
            </div>
          ) : temoignages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Aucun témoignage disponible pour le moment.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {temoignages.slice(0, 3).map((temoignage, index) => (
                <div 
                  key={temoignage._id || index} 
                  className="group relative bg-gradient-to-br from-white to-primary/5 rounded-2xl p-6 shadow-md hover:shadow-2xl transition-all duration-300 border border-primary/10 hover:border-primary/30 transform hover:-translate-y-1"
                >
                  {/* Icône de guillemets décorative */}
                  <div className="absolute top-4 right-4 text-primary/20 text-6xl font-serif leading-none">"</div>
                  
                  {/* Note avec étoiles améliorée */}
                  <div className="flex items-center gap-1 mb-4 relative z-10">
                    {[...Array(5)].map((_, i) => (
                      <span 
                        key={i} 
                        className={`text-lg transition-all duration-200 ${i < temoignage.note ? 'text-yellow-400 drop-shadow-sm' : 'text-gray-300'}`}
                      >
                        ★
                      </span>
                    ))}
                    <span className="ml-2 text-xs font-medium text-primary/70">{temoignage.note}/5</span>
                  </div>
                  
                  {/* Texte du témoignage */}
                  <p className="text-foreground mb-6 leading-relaxed relative z-10 font-medium text-sm">
                    {temoignage.texte}
                  </p>
                  
                  {/* Informations client améliorées */}
                  <div className="flex items-center gap-3 pt-4 border-t border-primary/20 relative z-10">
                    <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                      <span className="text-white font-bold text-lg">
                        {temoignage.nom?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'C'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-foreground text-sm font-semibold">{temoignage.nom || 'Client'}</p>
                      <p className="text-xs text-primary/70 font-medium">{temoignage.role || 'Client'}</p>
                    </div>
                  </div>
                  
                  {/* Effet de brillance au hover */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Pourquoi nous choisir Amélioré */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 text-foreground">Pourquoi Choisir Paw Legal ?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Des avantages qui font la différence
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <div className="text-center group">
              <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:bg-primary/20 transition-colors">
                <span className="text-4xl">🎓</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">Expertise Reconnue</h3>
              <p className="text-muted-foreground leading-relaxed">
                Plus de 10 ans d'expérience dans le droit des étrangers et du travail
              </p>
            </div>
            <div className="text-center group">
              <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:bg-primary/20 transition-colors">
                <span className="text-4xl">🤝</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">Accompagnement Personnalisé</h3>
              <p className="text-muted-foreground leading-relaxed">
                Un avocat dédié pour suivre votre dossier du début à la fin
              </p>
            </div>
            <div className="text-center group">
              <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:bg-primary/20 transition-colors">
                <span className="text-4xl">📋</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">Transparence Totale</h3>
              <p className="text-muted-foreground leading-relaxed">
                Accès à vos documents et dossiers en ligne 24/7, suivi en temps réel
              </p>
            </div>
            <div className="text-center group">
              <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:bg-primary/20 transition-colors">
                <span className="text-4xl">✅</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">Taux de Réussite</h3>
              <p className="text-muted-foreground leading-relaxed">
                95% de réussite dans nos démarches administratives
              </p>
            </div>
          </div>
        </div>
      </section>


      <div className="mt-auto">
        <Footer />
      </div>
      
      {/* Badge flottant pour rouvrir le widget - toujours visible quand fermé, ou au scroll */}
      <ReservationBadge 
        onOpen={() => {
          setIsWidgetOpen(true);
          localStorage.setItem('reservationWidgetOpen', 'true');
        }}
        alwaysVisible={!isWidgetOpen}
      />
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { temoignagesAPI, cmsAPI } from '@/lib/api';
import { ReservationWidget } from '@/components/ReservationWidget';
import { ReservationBadge } from '@/components/ReservationBadge';
import { useCmsText } from '@/lib/contentClient';
import { servicesConfig } from '@/data/servicesConfig';

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
    lg: 'h-12 px-8 text-base',
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

type HeroSlide = {
  type: 'image' | 'video';
  src: string;
  alt?: string;
};

// Composant pour les points expansibles amélioré
function ExpandableItem({ 
  title, 
  details, 
  icon, 
  iconColor = 'text-primary',
  borderColor = 'border-primary/20'
}: {
  title: string;
  details: string;
  icon: string;
  iconColor?: string;
  borderColor?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`bg-white rounded-lg border-2 ${borderColor} transition-all duration-300 hover:shadow-lg ${isOpen ? 'shadow-xl border-primary/40' : ''}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-start justify-between p-5 text-left hover:bg-muted/30 transition-all duration-300 rounded-lg group"
      >
        <span className="text-foreground leading-relaxed font-medium group-hover:text-primary transition-colors flex-1 pr-4">
          {title}
        </span>
        <span className={`${iconColor} text-xl flex-shrink-0 transform transition-all duration-300 ${isOpen ? 'rotate-180 scale-110' : 'rotate-0'}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div 
          className="px-5 pb-5 pt-0 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-300"
        >
          <div className="pl-4 border-l-2 border-primary/20">
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
              {details}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const { data: session } = useSession();
  const [temoignages, setTemoignages] = useState<any[]>([]);
  const [loadingTemoignages, setLoadingTemoignages] = useState(true);
  const [isVisible, setIsVisible] = useState<{ [key: string]: boolean }>({});
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [hoveredLimiteIndex, setHoveredLimiteIndex] = useState<number | null>(0);
  const [hoveredPlateformeIndex, setHoveredPlateformeIndex] = useState<number | null>(0);
  const [showMobileTopBar, setShowMobileTopBar] = useState(true);
  const [isWidgetOpen, setIsWidgetOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reservationWidgetOpen');
      return saved !== null ? saved === 'true' : false;
    }
    return false;
  });

  // Textes pilotés par le CMS (avec fallback actuels)
  const heroTitle = useCmsText(
    'home.hero.title',
    'Votre partenaire de confiance'
  );
  const heroTitleHighlight = useCmsText(
    'home.hero.title_highlight',
    'de confiance'
  );
  const heroSubtitle = useCmsText(
    'home.hero.subtitle',
    "Nous vous accompagnons dans toutes vos démarches administratives liées au séjour en France : première demande et renouvellement de titre de séjour, regroupement familial et demande de visa. Bénéficiez d’un accompagnement personnalisé pour constituer un dossier complet. Suivez l'évolution de votre dossier en temps réel sur la plateforme."
  );
  const heroCtaPrimary = useCmsText(
    'home.hero.cta_primary',
    'Créer mon compte gratuit'
  );
  const heroCtaSecondary = useCmsText(
    'home.hero.cta_secondary',
    'Contactez-nous'
  );
  const heroCtaSecondaryLabel =
    heroCtaSecondary === 'Consultation rapide' ? 'Contactez-nous' : heroCtaSecondary;
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
    'Une expertise reconnue en droit des étrangers'
  );

  // Barre de menu mobile sous le header qui disparaît au scroll
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleScroll = () => {
      setShowMobileTopBar(window.scrollY < 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const loadTemoignages = async () => {
      try {
        const response = await temoignagesAPI.getTemoignages();
        if (response.data.success) {
          setTemoignages(response.data.data || []);
        }
      } catch (error) {
        console.error('Erreur lors du chargement des témoignages:', error);
        // Ne pas afficher de témoignages fictifs : garder la liste vide pour un affichage cohérent (mobile = ordinateur)
        setTemoignages([]);
      } finally {
        setLoadingTemoignages(false);
      }
    };

    loadTemoignages();
  }, []);

  // Animation au scroll améliorée pour tous les éléments
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const elementId = entry.target.id || entry.target.getAttribute('data-animate-id') || '';
            setIsVisible((prev) => ({
              ...prev,
              [elementId]: true,
            }));
            // Ne plus observer une fois visible pour améliorer les performances
            observer.unobserve(entry.target);
          }
        });
      },
      { 
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px' // Déclencher un peu avant que l'élément soit visible
      }
    );

    // Observer tous les éléments avec data-animate
    const elements = document.querySelectorAll('[data-animate]');
    elements.forEach((el) => observer.observe(el));
    
    // Observer aussi les éléments individuels
    const itemElements = document.querySelectorAll('[data-animate-item]');
    itemElements.forEach((el) => observer.observe(el));
    
    return () => observer.disconnect();
  }, []);

  // Charger la configuration du carrousel depuis le CMS (si disponible)
  useEffect(() => {
    let isMounted = true;

    const loadCarouselFromCms = async () => {
      try {
        const raw = await cmsAPI.getText('home.hero.carousel', 'fr-FR');
        if (!raw || !isMounted) return;

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;

        const normalized: HeroSlide[] = parsed
          .map((item: any): HeroSlide | null => {
            if (!item || typeof item.src !== 'string' || !item.src.trim()) return null;
            const type: HeroSlide['type'] = item.type === 'video' ? 'video' : 'image';
            return {
              type,
              src: item.src,
              alt: item.alt || '',
            };
          })
          .filter((s): s is HeroSlide => s !== null);

        if (normalized.length > 0) {
          setHeroSlides(normalized);
          setCurrentSlide(0);
        }
      } catch (error) {
        console.error('Erreur lors du chargement du carrousel CMS:', error);
      }
    };

    loadCarouselFromCms();

    return () => {
      isMounted = false;
    };
  }, []);

  // Carrousel automatique pour les slides du hero
  useEffect(() => {
    if (heroSlides.length === 0) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [heroSlides.length]);

  // Données structurées pour la section "Solutions" (thèmes à gauche / détail à droite)
  const solutions = [...servicesConfig].sort((a, b) => {
    if (a.title === 'Consultation juridique') return 1;
    if (b.title === 'Consultation juridique') return -1;
    return 0;
  });
  const [selectedSolutionIndex, setSelectedSolutionIndex] = useState(0);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const lexiaHref = role === 'admin' || role === 'superadmin' ? '/admin/lexia' : '/lexia';

  return (
    <div className="min-h-screen bg-background flex flex-col scroll-smooth overflow-x-hidden max-w-[100vw]">
      {/* Header Professionnel */}
      <Header variant="home" />

      {/* Barre de menu mobile sous le header (disparaît au scroll) */}
      {showMobileTopBar && (
        <div className="md:hidden sticky top-[56px] z-40 bg-white/95 border-b border-gray-200">
          <div className="w-full max-w-[100vw] mx-auto px-2">
            <div className="w-full flex items-center justify-center overflow-x-auto no-scrollbar py-2">
              <div className="flex items-center gap-1 min-w-max">
                <Link
                  href="/a-propos"
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 whitespace-nowrap"
                >
                  À propos
                </Link>
                <Link
                  href="/faq"
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 whitespace-nowrap"
                >
                  FAQ
                </Link>
                <Link
                  href="/forum"
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 whitespace-nowrap"
                >
                  Forum
                </Link>
                <Link
                  href="/contact"
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 whitespace-nowrap"
                >
                  Contact
                </Link>
                <Link
                  href="/calculateur"
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium text-white bg-orange-500 hover:bg-orange-600 whitespace-nowrap"
                >
                  Calculateur
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section — design renforcé, padding mobile */}
      <section className="relative min-h-[80vh] sm:min-h-[85vh] flex items-center py-12 sm:py-20 lg:py-28 overflow-hidden">
        {/* Fond : dégradé doux + formes organiques */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,rgba(249,115,22,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_20%_80%,rgba(251,146,60,0.08),transparent)]" />
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] rounded-full bg-orange-200/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-amber-100/30 blur-[80px] pointer-events-none" />
        
        <div className="w-full max-w-[100vw] container mx-auto px-3 sm:px-4 relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-10 items-center">
            <div className="relative max-w-2xl min-w-0">
              {/* Titre */}
              <h1 className="text-3xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 leading-[1.15] tracking-tight mb-4 sm:mb-6">
                {heroTitle.replace(heroTitleHighlight, '').trim() || heroTitle}{' '}
                <span className="text-orange-500">
                  {heroTitleHighlight}
                </span>
              </h1>
              
              {/* Sous-titre */}
              <p
                className="text-lg lg:text-xl max-w-2xl leading-relaxed mb-10"
                style={{
                  display: 'grid',
                  flexWrap: 'wrap',
                  textAlign: 'left',
                  verticalAlign: 'top',
                  color: 'rgba(0, 0, 0, 1)',
                }}
              >
                {heroSubtitle}
              </p>
              
              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <Link href="/auth/signup">
                  <Button 
                    size="lg" 
                    className="min-w-[200px] shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200 group"
                  >
                    {heroCtaPrimary}
                    <span className="ml-2 group-hover:translate-x-0.5 inline-block">→</span>
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button 
                    variant="outline" 
                    size="lg"
                    className="min-w-[180px] border-2 border-gray-300 text-gray-700 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50/50 transition-all duration-200"
                  >
                    {heroCtaSecondaryLabel}
                  </Button>
                </Link>
              </div>
              
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <span className="inline-block w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </span>
                {heroSmallText}
              </p>
            </div>

            {/* Carrousel du hero (images ou vidéo) */}
            <div className="relative w-full max-w-2xl mx-auto h-[300px] sm:h-[380px] lg:h-[440px] rounded-3xl overflow-hidden shadow-2xl border border-white/60 bg-white/40 backdrop-blur">
              {heroSlides.map((slide, index) => {
                const isYouTube =
                  slide.type === 'video' &&
                  typeof slide.src === 'string' &&
                  (slide.src.includes('youtube.com/watch') || slide.src.includes('youtu.be/'));

                let embedUrl = slide.src;
                if (isYouTube) {
                  try {
                    // Extraire l'ID de la vidéo pour construire l'URL embed
                    const url = new URL(slide.src);
                    if (url.hostname.includes('youtube.com')) {
                      const v = url.searchParams.get('v');
                      if (v) {
                        embedUrl = `https://www.youtube.com/embed/${v}?autoplay=1&mute=1&loop=1&playlist=${v}`;
                      }
                    } else if (url.hostname.includes('youtu.be')) {
                      const id = url.pathname.replace('/', '');
                      if (id) {
                        embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`;
                      }
                    }
                  } catch {
                    // Si l'URL est invalide, on laisse embedUrl tel quel
                  }
                }

                return (
                <div
                  key={`${slide.src}-${index}`}
                  className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                    index === currentSlide ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {isYouTube ? (
                    <iframe
                      src={embedUrl}
                      title={slide.alt || 'Vidéo du carrousel'}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  ) : slide.type === 'video' ? (
                    <video
                      src={slide.src}
                      className="w-full h-full object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  ) : (
                    <Image
                      src={slide.src}
                      alt={slide.alt || ''}
                      fill
                      priority={index === 0}
                      className="object-cover"
                    />
                  )}
                </div>
              );
              })}

              {/* Dégradé et cadre décoratif */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/5 via-transparent to-orange-500/10" />
              <div className="pointer-events-none absolute -inset-1 rounded-[2rem] border border-orange-500/20" />

              {/* Indicateurs de slide */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {heroSlides.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setCurrentSlide(index)}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      index === currentSlide
                        ? 'w-6 bg-orange-500'
                        : 'w-2.5 bg-white/70 hover:bg-white'
                    }`}
                    aria-label={`Afficher l'image ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Services (cartes) – thèmes à gauche / détail à droite */}
      <section 
        id="services-section"
        data-animate
        onMouseEnter={() =>
          setIsVisible((prev) => ({ ...prev, ['services-section']: true }))
        }
        className={`py-20 transition-all duration-1000 transform ${
          isVisible['services-section']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div 
            className="max-w-6xl mx-auto"
            data-animate-item
            data-animate-id="services-section-title"
          >
            <div className={`mb-8 transition-all duration-700 ${
              isVisible['services-section-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <span className="inline-block text-xs font-semibold uppercase tracking-wider text-orange-500 mb-3">
                Solutions
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 text-gray-900 leading-tight">
                Des solutions administratives structurées pour vos démarches
              </h2>
              <p className="text-base md:text-lg text-gray-600 max-w-3xl leading-relaxed">
                Les thèmes sont listés à gauche, le détail de la solution sélectionnée apparaît à droite pour une
                lecture confortable.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] items-start">
              {/* Thèmes (gauche) */}
              <div className="space-y-2 border border-gray-200 rounded-xl bg-gray-50/60 p-2">
                {solutions.map((solution, index) => (
                  <button
                    key={solution.title}
                    type="button"
                    onClick={() => setSelectedSolutionIndex(index)}
                    onMouseEnter={() => setSelectedSolutionIndex(index)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedSolutionIndex === index
                        ? 'bg-white border border-orange-400 text-orange-700 font-semibold shadow-sm'
                        : 'bg-transparent border border-transparent text-gray-700 hover:bg-white hover:border-gray-200'
                    }`}
                  >
                    {solution.title}
                  </button>
                ))}
              </div>

              {/* Détail (droite) */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 md:p-8">
                {(() => {
                  const current = solutions[selectedSolutionIndex] || solutions[0];
                  return (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-2xl font-semibold text-gray-900 mb-1">
                          {current.title}
                        </h3>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {current.description}
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 text-sm text-gray-700">
                        {current.duree && (
                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                              Durée
                            </p>
                            <p className="font-medium text-gray-900">
                              {current.duree}
                            </p>
                          </div>
                        )}
                        {current.prix && (
                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                              Tarif
                            </p>
                            <p className="font-medium text-gray-900">
                              {current.prix}
                            </p>
                          </div>
                        )}
                      </div>

                      {current.points?.length ? (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                            En pratique
                          </p>
                          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
                            {current.points.map((point) => (
                              <li key={point} className="leading-relaxed">
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="pt-4 border-t border-gray-200 flex flex-wrap gap-3">
                        {current.isPortal ? (
                          <Link href="/calculateur">
                            <Button size="lg" className="min-w-[200px]">
                              Accéder au calculateur
                            </Button>
                          </Link>
                        ) : current.title === 'Consultation juridique' ? (
                          <Link href="/auth/signup">
                            <Button size="lg" className="min-w-[180px]">
                              Créer mon compte
                            </Button>
                          </Link>
                        ) : (
                          <Link href="/contact">
                            <Button
                              variant="outline"
                              size="lg"
                              className="min-w-[200px]"
                            >
                              Échanger sur mon dossier
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Section : CE QUE NOUS NE FAISONS PAS */}
      <section 
        id="limites"
        data-animate
        onMouseEnter={() =>
          setIsVisible((prev) => ({ ...prev, limites: true }))
        }
        className={`py-20 transition-all duration-1000 transform ${
          isVisible['limites']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div 
            className="max-w-6xl mx-auto"
            data-animate-item
            data-animate-id="limites-title"
          >
            <div className={`mb-6 text-center transition-all duration-700 ${
              isVisible['limites-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <span className="inline-block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
                Périmètre
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900">
                CE QUE NOUS NE FAISONS PAS
              </h2>
              <p className="text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
                Nos limites et le périmètre de nos services
              </p>
            </div>

            {/* Modèle interactif : thèmes à gauche / détail au survol à droite (deux colonnes égales) */}
            <div className="grid gap-6 md:grid-cols-2 items-start">
              {/* Thèmes (gauche) */}
              <div className="space-y-2.5">
                {[
                  "Pas de représentation en qualité d'avocat",
                  "Pas de représentation devant les juridictions",
                  "Pas de représentation légale devant l'administration",
                  "Pas d'intervention dans les procédures contentieuses",
                ].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onMouseEnter={() => setHoveredLimiteIndex(index)}
                    onFocus={() => setHoveredLimiteIndex(index)}
                    className={`w-full flex items-start gap-2.5 rounded-lg px-3 py-1.5 text-sm text-left transition-colors ${
                      hoveredLimiteIndex === index
                        ? 'bg-white border border-red-200 shadow-sm'
                        : 'bg-transparent border border-transparent hover:bg-white/60'
                    }`}
                  >
                    <span className="mt-0.5 h-6 w-6 flex items-center justify-center rounded-full bg-red-50 text-red-500 text-xs font-semibold">
                      {index + 1}
                    </span>
                    <p className="font-medium text-gray-800">{label}</p>
                  </button>
                ))}
              </div>

              {/* Détail (droite) – ne s'affiche que lorsque l'on survole un thème */}
              <div className="text-sm text-gray-700">
                {(() => {
                  const items = [
                    {
                      title: "Nous ne nous représentons pas les utilisateurs en qualité d'avocats",
                      details:
                        "Notre plateforme fournit des services d'assistance administrative et de facilitation, mais nous ne sommes pas un cabinet d'avocats. Nous ne pouvons pas vous représenter en tant qu'avocat, ni exercer les prérogatives réservées aux avocats. Pour toute représentation juridique, nous vous mettons en relation avec un avocat spécialisé qui collabore avec nous.",
                    },
                    {
                      title: "Nous ne représentons pas directement les utilisateurs devant les juridictions",
                      details:
                        "Nous n'intervenons pas dans les procédures judiciaires. Si votre dossier nécessite une représentation devant un tribunal administratif, un tribunal judiciaire, ou toute autre juridiction, nous vous mettons en relation avec un avocat spécialisé.",
                    },
                    {
                      title: "Nous ne fournissons pas de conseil juridique personnalisé",
                      details:
                        "Les informations que nous mettons à disposition sont de nature générale et ne constituent pas un conseil juridique personnalisé adapté à votre situation spécifique. Pour obtenir un conseil juridique personnalisé, vous devez consulter un avocat qui pourra analyser votre situation particulière et vous donner des conseils adaptés à votre cas.",
                    },
                    {
                      title: "Nous n'assurons aucune représentation légale",
                      details:
                        "Nous n'assurons pas de représentation légale devant les administrations ou les juridictions. Notre rôle se limite à l'assistance administrative, à la préparation des dossiers, et à la facilitation des démarches. Pour toute représentation légale, vous devez faire appel à un professionnel habilité (avocat, huissier de justice, etc.).",
                    },
                    {
                      title: "Nous n'intervenons pas dans les procédures contentieuses",
                      details:
                        "Nous n'intervenons pas dans les procédures contentieuses, c'est-à-dire les procédures qui opposent l'administration à l'étranger devant une juridiction. Si votre demande a été refusée et que vous souhaitez contester cette décision, vous devez faire appel à un avocat spécialisé qui pourra vous représenter et défendre vos intérêts devant la juridiction compétente.",
                    },
                  ] as const;

                  const index =
                    hoveredLimiteIndex !== null && hoveredLimiteIndex >= 0 && hoveredLimiteIndex < items.length
                      ? hoveredLimiteIndex
                      : null;

                  if (index === null) {
                    return (
                      <div className="rounded-lg border border-dashed border-gray-200 bg-white/60 p-4 text-gray-500 text-sm">
                        Survolez un thème à gauche pour afficher le détail.
                      </div>
                    );
                  }

                  const item = items[index];

                  return (
                    <div className="rounded-lg border border-gray-200 bg-white/80 p-4">
                      <h3 className="font-semibold text-gray-900 mb-2 text-sm md:text-base">
                        {item.title}
                      </h3>
                      <p className="text-gray-700 leading-relaxed text-sm">
                        {item.details}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section : À quoi sert la plateforme */}
      <section 
        id="plateforme"
        data-animate
        onMouseEnter={() =>
          setIsVisible((prev) => ({ ...prev, plateforme: true }))
        }
        className={`py-20 transition-all duration-1000 transform ${
          isVisible['plateforme']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div 
            className="max-w-6xl mx-auto"
            data-animate-item
            data-animate-id="plateforme-title"
          >
            <div className={`mb-6 text-center transition-all duration-700 ${
              isVisible['plateforme-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <span className="inline-block text-xs font-semibold uppercase tracking-wider text-orange-500 mb-4">
                La plateforme
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900">
                À quoi sert la plateforme
              </h2>
              <p className="text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
                Des outils et services adaptés à vos besoins, que vous soyez professionnel ou particulier
              </p>
            </div>

            {/* Modèle interactif : types d'utilisateurs à gauche / détail au survol à droite (deux colonnes égales) */}
            <div className="grid gap-6 md:grid-cols-2 items-start">
              {/* Thèmes (gauche) */}
              <div className="space-y-2.5">
                {[
                  "Pour les professionnels et organismes",
                  "Pour les particuliers",
                ].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onMouseEnter={() => setHoveredPlateformeIndex(index)}
                    onFocus={() => setHoveredPlateformeIndex(index)}
                    className={`w-full flex items-start gap-2.5 rounded-lg px-3 py-1.5 text-sm text-left transition-colors ${
                      hoveredPlateformeIndex === index
                        ? 'bg-white border border-orange-200 shadow-sm'
                        : 'bg-transparent border border-transparent hover:bg-white/60'
                    }`}
                  >
                    <span className="mt-0.5 h-6 w-6 flex items-center justify-center rounded-full bg-orange-50 text-orange-500 text-xs font-semibold">
                      {index + 1}
                    </span>
                    <p className="font-medium text-gray-800">{label}</p>
                  </button>
                ))}
              </div>

              {/* Détail (droite) – ne s'affiche que lorsque l'on survole un thème */}
              <div className="text-sm text-gray-700 space-y-3">
                {(() => {
                  const blocks = [
                    {
                      title: "Pour les professionnels et organismes",
                      points: [
                        "Mise à disposition d'un espace de suivi administratif des dossiers transmis à un consulat, une association ou un avocat, à la demande de l'étranger.",
                        "Mise à disposition d'un canal de communication sécurisé entre l'étranger et les acteurs concernés (consulat, avocat, association) pour échanger des documents et des informations en toute confidentialité.",
                      ],
                    },
                    {
                      title: "Pour les particuliers",
                      points: [
                        "Déléguer les formalités de demande et de renouvellement de titres de séjour et de visas, avec préparation et dépôt complet du dossier.",
                        "Accéder à des informations générales sur les différentes catégories de titres de séjour et leurs conditions.",
                        "Suivre l'avancement de tous vos dossiers dans un espace personnel sécurisé.",
                        "Utiliser un outil de calcul des délais de recours applicables aux titres de séjour et aux visas.",
                        "Accéder à un répertoire de professionnels du droit (avocats) spécialisés en droit des étrangers pour être orienté en cas de situation complexe ou contentieuse.",
                      ],
                    },
                  ] as const;

                  const index =
                    hoveredPlateformeIndex !== null &&
                    hoveredPlateformeIndex >= 0 &&
                    hoveredPlateformeIndex < blocks.length
                      ? hoveredPlateformeIndex
                      : null;

                  if (index === null) {
                    return (
                      <div className="rounded-lg border border-dashed border-gray-200 bg-white/60 p-4 text-gray-500 text-sm">
                        Survolez un thème à gauche pour afficher le détail.
                      </div>
                    );
                  }

                  const block = blocks[index];

                  return (
                    <>
                      <div className="rounded-lg border border-gray-200 bg-white/80 p-4">
                        <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-3">
                          {block.title}
                        </h3>
                        <ul className="list-disc pl-5 space-y-2">
                          {block.points.map((pt) => (
                            <li key={pt}>{pt}</li>
                          ))}
                        </ul>
                      </div>

                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Témoignages */}
      <section 
        id="temoignages"
        data-animate
        onMouseEnter={() =>
          setIsVisible((prev) => ({ ...prev, temoignages: true }))
        }
        className={`py-20 relative overflow-hidden transition-all duration-1000 transform ${
          isVisible['temoignages']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div 
            className="text-center mb-10"
            data-animate-item
            data-animate-id="temoignages-title"
          >
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-orange-500 mb-4">
              Témoignages
            </span>
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 transition-all duration-700 ${
              isVisible['temoignages-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              Ils nous ont fait confiance
            </h2>
            <p className={`text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed transition-all duration-700 delay-200 ${
              isVisible['temoignages-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              Ils nous font confiance...
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
            <>
              {/* Desktop: 3 colonnes */}
              <div className="hidden md:grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
                {temoignages.slice(0, 3).map((temoignage, index) => (
                  <div
                    key={temoignage._id || index}
                    className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200"
                    style={{
                      animation: isVisible['temoignages'] ? `fadeIn 0.6s ease-out ${index * 150}ms both` : 'none',
                    }}
                  >
                    {/* Note avec étoiles */}
                    <div className="flex items-center gap-1 mb-4">
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={i}
                          className={`text-lg ${i < temoignage.note ? 'text-orange-500' : 'text-gray-300'}`}
                        >
                          ★
                        </span>
                      ))}
                      <span className="ml-2 text-xs font-semibold text-primary/80">{temoignage.note}/5</span>
                    </div>

                    {/* Texte du témoignage */}
                    <p className="text-gray-800 leading-relaxed font-medium text-sm">
                      {temoignage.texte}
                    </p>
                  </div>
                ))}
              </div>

              {/* Mobile: défilement horizontal 2 par 2 */}
              <div className="md:hidden max-w-6xl mx-auto -mx-4 px-4 overflow-x-auto snap-x snap-mandatory pb-2">
                <div className="flex gap-4">
                  {temoignages.slice(0, 3).map((temoignage, index) => (
                    <div
                      key={temoignage._id || index}
                      className="snap-start min-w-[calc(50%-0.5rem)] bg-white rounded-2xl p-6 shadow-sm border border-gray-200"
                      style={{
                        animation: isVisible['temoignages'] ? `fadeIn 0.6s ease-out ${index * 150}ms both` : 'none',
                      }}
                    >
                      <div className="flex items-center gap-1 mb-4">
                        {[...Array(5)].map((_, i) => (
                          <span
                            key={i}
                            className={`text-lg ${i < temoignage.note ? 'text-orange-500' : 'text-gray-300'}`}
                          >
                            ★
                          </span>
                        ))}
                        <span className="ml-2 text-xs font-semibold text-primary/80">{temoignage.note}/5</span>
                      </div>

                      <p className="text-gray-800 leading-relaxed font-medium text-sm">
                        {temoignage.texte}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="mt-auto">
        <Footer />
      </div>
      
      {/* Prise de rendez-vous : ouverture en overlay (détaché du hero) */}
      {isWidgetOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setIsWidgetOpen(false);
            localStorage.setItem('reservationWidgetOpen', 'false');
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="relative max-h-[90vh] overflow-auto">
            <ReservationWidget 
              isOpen={isWidgetOpen} 
              onClose={() => {
                setIsWidgetOpen(false);
                localStorage.setItem('reservationWidgetOpen', 'false');
              }}
            />
          </div>
        </div>
      )}
      
      {/* Badge flottant pour ouvrir l'outil de prise de rendez-vous */}
      <Link
        href={lexiaHref}
        className="fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:bg-orange-600 hover:shadow-xl md:bottom-6 md:right-6"
        aria-label="Accéder à Paw AI"
      >
        <span className="text-base leading-none">⚖️</span>
        <span>Paw AI</span>
      </Link>

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

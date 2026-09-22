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
import { Check, FileText } from 'lucide-react';

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
  const baseClasses = 'inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  
  const variantClasses = {
    default: 'bg-ds-primary text-white hover:bg-ds-primary-hover shadow-md font-semibold',
    outline: 'border-2 border-ds-primary-hover bg-transparent text-ds-strong font-semibold hover:bg-ds-primary-tint',
    ghost: 'text-ds-strong font-semibold hover:bg-ds-primary-tint',
    link: 'text-primary underline-offset-4 hover:underline',
  };
  
  const sizeClasses = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-12 px-6 text-base',
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

// Étiquette de section : pastille orange + texte gris (l'orange n'est pas utilisé pour du texte sur fond clair)
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ds-subtle">
      <span aria-hidden className="h-3 w-3 rounded-sm bg-ds-primary" />
      {children}
    </span>
  );
}

// Section « À quoi sert la plateforme »
const PLATEFORME_BLOCKS = [
  {
    title: 'Pour les particuliers',
    points: [
      "Déléguer les formalités de demande et de renouvellement de titres de séjour et de visas, avec préparation et dépôt complet du dossier.",
      "Accéder à des informations générales sur les différentes catégories de titres de séjour et leurs conditions.",
      "Suivre l'avancement de tous vos dossiers dans un espace personnel sécurisé.",
      "Utiliser un outil de calcul des délais de recours applicables aux titres de séjour et aux visas.",
      "Accéder à un répertoire de professionnels du droit (avocats) spécialisés en droit des étrangers pour être orienté en cas de situation complexe ou contentieuse.",
    ],
  },
  {
    title: 'Pour les professionnels et organismes',
    points: [
      "Mise à disposition d'un espace de suivi administratif des dossiers transmis à un consulat, une association ou un avocat, à la demande de l'étranger.",
      "Mise à disposition d'un canal de communication sécurisé entre l'étranger et les acteurs concernés (consulat, avocat, association) pour échanger des documents et des informations en toute confidentialité.",
    ],
  },
] as const;

// Section « Ce que nous ne faisons pas » : chaque libellé est associé à son propre détail
const LIMITES = [
  {
    label: "Pas de représentation en qualité d'avocat",
    title: "Nous ne nous représentons pas les utilisateurs en qualité d'avocats",
    details:
      "Notre plateforme fournit des services d'assistance administrative et de facilitation, mais nous ne sommes pas un cabinet d'avocats. Nous ne pouvons pas vous représenter en tant qu'avocat, ni exercer les prérogatives réservées aux avocats. Pour toute représentation juridique, nous vous mettons en relation avec un avocat spécialisé qui collabore avec nous.",
  },
  {
    label: "Pas de représentation devant les juridictions",
    title: "Nous ne représentons pas directement les utilisateurs devant les juridictions",
    details:
      "Nous n'intervenons pas dans les procédures judiciaires. Si votre dossier nécessite une représentation devant un tribunal administratif, un tribunal judiciaire, ou toute autre juridiction, nous vous mettons en relation avec un avocat spécialisé.",
  },
  {
    label: "Les contenus généraux ne remplacent pas un accompagnement personnalisé",
    title: "Les contenus généraux ne remplacent pas un accompagnement personnalisé",
    details:
      "Les informations que nous mettons à disposition sont de nature générale et ne constituent pas un accompagnement personnalisé adapté à votre situation. Pour un accompagnement personnalisé par Ada Papers sur vos démarches, contactez notre équipe depuis votre espace. Lorsque la situation impose un acte réservé aux avocats ou une représentation en justice, vous devez consulter un avocat qui pourra analyser votre situation et vous orienter.",
  },
  {
    label: "Pas de représentation légale devant l'administration",
    title: "Nous n'assurons aucune représentation légale",
    details:
      "Nous n'assurons pas de représentation légale devant les administrations ou les juridictions. Notre rôle se limite à l'assistance administrative, à la préparation des dossiers, et à la facilitation des démarches. Pour toute représentation légale, vous devez faire appel à un professionnel habilité (avocat, huissier de justice, etc.).",
  },
  {
    label: "Pas d'intervention dans les procédures contentieuses",
    title: "Nous n'intervenons pas dans les procédures contentieuses",
    details:
      "Nous n'intervenons pas dans les procédures contentieuses, c'est-à-dire les procédures qui opposent l'administration à l'étranger devant une juridiction. Si votre demande a été refusée et que vous souhaitez contester cette décision, vous devez faire appel à un avocat spécialisé qui pourra vous représenter et défendre vos intérêts devant la juridiction compétente.",
  },
] as const;

const SOLUTIONS_ENTREPRISE = [
  {
    title: 'SARL / EURL',
    description:
      "Nous vous accompagnons dans la creation d'une Societe a Responsabilite Limitee (SARL) ou d'une EURL : redaction des statuts, depot du capital, publication legale et immatriculation au Registre du Commerce et des Societes.",
    duree: '2 a 4 semaines',
    prix: 'Sur devis',
    points: [
      'Redaction des statuts sur mesure',
      'Depot du capital social',
      "Publication d'annonce legale au JAL",
      'Immatriculation au RCS (extrait Kbis)',
      'Ouverture de compte bancaire professionnel',
      'Nomination et pouvoirs du gerant',
    ],
    ctaHref: '/dossiers/create?rubrique=constitution_societe',
    ctaLabel: 'Demarrer la constitution',
  },
  {
    title: 'SAS / SASU',
    description:
      "La Societe par Actions Simplifiee offre une grande souplesse de gouvernance, ideale pour les startups et les projets qui envisagent une levee de fonds ou une entree d'associes.",
    duree: '2 a 4 semaines',
    prix: 'Sur devis',
    points: [
      'Redaction des statuts SAS / SASU',
      'Nomination du president',
      "Publication d'annonce legale",
      'Immatriculation au RCS',
      'Pacte d\'actionnaires (optionnel)',
      'Delegation de pouvoirs',
    ],
    ctaHref: '/dossiers/create?rubrique=constitution_societe',
    ctaLabel: 'Demarrer la constitution',
  },
  {
    title: 'Micro-entreprise',
    description:
      "Le regime de la micro-entreprise est la solution la plus rapide pour demarrer une activite independante, sans apport en capital ni depot de statuts.",
    duree: '1 a 3 jours',
    prix: 'Demarches gratuites (URSSAF)',
    points: [
      'Inscription sur guichet-entreprises.fr',
      "Choix du code APE et de l'activite",
      'Regime fiscal et social simplifie',
      'Compte bancaire dedie recommande',
      'Premiere declaration de chiffre d\'affaires',
    ],
    ctaHref: '/nouvelle-demande',
    ctaLabel: 'Demarrer une demande',
  },
  {
    title: 'SCI',
    description:
      "La Societe Civile Immobiliere est la structure de reference pour l'acquisition, la gestion et la transmission d'un patrimoine immobilier en famille ou entre associes.",
    duree: '3 a 6 semaines',
    prix: 'Sur devis',
    points: [
      'Redaction des statuts SCI',
      'Objet social et siege social',
      'Apports et repartition des parts',
      'Nomination du gerant',
      'Immatriculation au greffe',
      'Gestion locative et fiscalite (IR / IS)',
    ],
    ctaHref: '/dossiers/create?rubrique=constitution_societe',
    ctaLabel: 'Demarrer la constitution',
  },
] as const;

const LIMITES_ENTREPRISE = [
  {
    label: "Pas de conseil fiscal ou comptable",
    title: "Nous ne sommes pas experts-comptables",
    details:
      "Nos services couvrent les aspects juridiques et administratifs de la creation d'entreprise. Nous ne delivrons pas de conseils fiscaux ou comptables personnalises. Pour optimiser votre regime d'imposition, declarer votre TVA ou etablir vos bilans, vous devez faire appel a un expert-comptable habilite.",
  },
  {
    label: "Pas d'actes notaries",
    title: "Nous ne remplaceons pas le notaire",
    details:
      "Certaines operations immobilieres ou societales exigent l'intervention d'un notaire (apport d'immeuble en societe, certaines cessions de parts, pactes de preference). Nos modeles de statuts ne remplacent pas un acte notarie lorsque celui-ci est obligatoire par la loi.",
  },
  {
    label: "Pas de representation au Tribunal de Commerce",
    title: "Nous n'intervenons pas dans les contentieux commerciaux",
    details:
      "Si vous etes confronte a un litige avec un associe, un creancier ou votre gerant, nous ne pouvons pas vous representer devant le Tribunal de Commerce ni devant toute autre juridiction. Nous vous orientons vers un avocat specialise en droit des societes.",
  },
  {
    label: "Les statuts types ne remplacent pas un conseil sur mesure",
    title: "Nos modeles sont des bases, pas des conseils personnalises",
    details:
      "Les statuts que nous proposons sont adaptes aux cas courants. Toute situation particuliere (entree d'investisseurs, clause d'inaliabilite, pacte d'actionnaires complexe, minorite de blocage) necessite l'intervention d'un avocat specialise en droit des societes pour adapter la documentation a vos besoins specifiques.",
  },
  {
    label: "Pas de depot de marque ou de propriete intellectuelle",
    title: "Nous ne gerons pas la propriete intellectuelle",
    details:
      "La protection de votre marque, de votre logo ou de vos creations aupres de l'INPI sort de notre perimetre. Nous vous recommandons de confier cette demarche a un conseil en propriete industrielle (CPI) ou a un avocat specialise en propriete intellectuelle.",
  },
] as const;

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
  const [scrollPastHero, setScrollPastHero] = useState(false);
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

  useEffect(() => {
    const onScroll = () => setScrollPastHero(window.scrollY > 220);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
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
  const [selectedEntrepriseSolutionIndex, setSelectedEntrepriseSolutionIndex] = useState(0);
  const [hoveredEntrepriseLimiteIndex, setHoveredEntrepriseLimiteIndex] = useState<number | null>(0);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const lexiaHref = role === 'admin' || role === 'superadmin' ? '/admin/lexia' : '/lexia';

  return (
    <div className="min-h-screen bg-ds-primary-tint flex flex-col scroll-smooth overflow-x-hidden max-w-[100vw]">
      {/* Header sticky revelé apres defilement du hero */}
      <div className={`fixed top-0 left-0 right-0 z-[80] transition-transform duration-300 ${scrollPastHero ? 'translate-y-0' : '-translate-y-full'}`}>
        <Header variant="home" />
      </div>

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
                <Link
                  href="/nouvelle-demande"
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 whitespace-nowrap"
                >
                  Nouvelle demande
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section - carte flottante, formes décoratives et cadre incliné */}
      <section className="relative overflow-hidden py-6 sm:py-10">
        {/* Formes décoratives (tokens du design system) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-[8%] top-6 h-10 w-10 rounded-full bg-ds-primary" />
          <div className="absolute left-[52%] top-3 h-5 w-5 rounded-full bg-ds-primary-light" />
          <div className="absolute right-[8%] top-4 h-16 w-16 rounded-full border-[3px] border-ds-primary-hover" />
          <div className="absolute -left-8 top-32 h-32 w-32 rounded-full border-[3px] border-ds-primary-light" />
          <div className="absolute bottom-4 left-[10%] h-5 w-5 rounded-full bg-ds-primary-hover" />
          <div className="absolute bottom-2 right-[18%] h-8 w-8 rounded-full bg-ds-strong" />
        </div>

        <div className="container relative mx-auto px-3 sm:px-4">
          <div className="relative rounded-3xl border border-transparent bg-ds-elevated px-6 pt-5 pb-12 shadow-xl dark:border-ds-border sm:px-10 lg:px-14 lg:pb-20">
            {/* Nav integree dans la carte hero */}
            <nav className="flex items-center justify-between mb-10 lg:mb-12">
              <Link href="/" className="font-bold text-ds-primary text-xl tracking-tight hover:opacity-80 transition-opacity">
                Ada Papers
              </Link>
              <div className="hidden md:flex items-center gap-0.5">
                {[
                  { href: '/a-propos', label: 'A propos' },
                  { href: '/faq', label: 'FAQ' },
                  { href: '/calculateur', label: 'Calculateur' },
                  { href: '/contact', label: 'Contact' },
                ].map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="px-3 py-1.5 rounded-md text-sm font-medium text-ds-body hover:bg-ds-primary-tint hover:text-ds-strong transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </div>
              <Link href={session ? (role === 'admin' || role === 'superadmin' ? '/admin' : '/client') : '/auth/signin'}>
                <button className="rounded-full bg-ds-primary px-5 py-2 text-sm font-semibold text-white hover:bg-ds-primary-hover transition-colors shadow-sm">
                  {session ? 'Mon espace' : 'Creer mon compte'}
                </button>
              </Link>
            </nav>
            <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_0.88fr] lg:gap-6">
              <div className="relative min-w-0">
                {/* Titre */}
                <h1 className="mb-8 text-4xl font-bold leading-[1.15] tracking-tight text-ds-strong sm:text-5xl lg:text-[56px]">
                  {heroTitle.replace(heroTitleHighlight, '').trim() || heroTitle}{' '}
                  <span className="relative inline-block">
                    {heroTitleHighlight}
                    <svg
                      aria-hidden
                      className="absolute -bottom-1.5 left-0 h-3 w-full overflow-visible"
                      viewBox="0 0 100 12"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <pattern id="hero-wave" width="16" height="12" patternUnits="userSpaceOnUse">
                          <path
                            d="M0 6 Q4 0 8 6 T16 6"
                            fill="none"
                            stroke="var(--color-primary)"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </pattern>
                      </defs>
                      <rect width="100" height="12" fill="url(#hero-wave)" />
                    </svg>
                  </span>
                </h1>

                {/* Sous-titre */}
                <p className="mb-10 max-w-[46ch] text-lg leading-7 text-ds-body">{heroSubtitle}</p>

                {/* CTAs */}
                <div className="flex flex-wrap items-center gap-4">
                  <Link href="/auth/signup">
                    <Button size="lg" className="shadow-md">
                      {heroCtaPrimary}
                    </Button>
                  </Link>
                  <Link href="/nouvelle-demande">
                    <Button variant="outline" size="lg">
                      Démarrer une demande
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Cadre incliné : carrousel du hero (images ou vidéo), sinon composition de tuiles */}
              <div className="relative mx-auto w-full max-w-[460px] lg:mb-20 lg:max-w-none">
                <div className="relative mx-auto h-[360px] w-[300px] sm:h-[420px] sm:w-[360px] lg:h-[440px] lg:w-[380px]">
                  <div aria-hidden className="absolute left-4 top-4 h-full w-full rotate-[4deg] rounded-3xl bg-ds-primary-light" />
                  <div className="absolute inset-0 -rotate-[3deg] overflow-hidden rounded-3xl bg-ds-secondary shadow-lg">
                    {heroSlides.length === 0 && (
                      <svg className="h-full w-full" viewBox="0 0 380 440" aria-hidden>
                        <rect className="fill-ds-primary" x="24" y="24" width="200" height="200" rx="24" />
                        <rect className="fill-ds-strong" x="240" y="24" width="116" height="96" rx="16" />
                        <rect className="fill-ds-primary-light" x="240" y="136" width="116" height="88" rx="16" />
                        <rect className="fill-ds-primary-hover" x="24" y="240" width="96" height="176" rx="16" />
                        <rect className="fill-ds-primary-light" x="136" y="240" width="88" height="80" rx="12" />
                        <rect className="fill-ds-primary" x="136" y="336" width="88" height="80" rx="12" />
                        <rect className="fill-ds-primary" x="240" y="240" width="116" height="176" rx="16" />
                      </svg>
                    )}
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
                              className="h-full w-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                            />
                          ) : slide.type === 'video' ? (
                            <video
                              src={slide.src}
                              className="h-full w-full object-cover"
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

                    {/* Indicateurs de slide */}
                    {heroSlides.length > 1 && (
                      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                        {heroSlides.map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => setCurrentSlide(index)}
                            className={`h-2.5 rounded-full transition-all duration-300 ${
                              index === currentSlide ? 'w-6 bg-ds-primary' : 'w-2.5 bg-white/70 hover:bg-white'
                            }`}
                            aria-label={`Afficher l'image ${index + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pastilles rondes */}
                  <div className="absolute -right-9 top-[42%] hidden h-[72px] w-[72px] place-items-center rounded-full bg-ds-primary-hover shadow-md lg:grid">
                    <FileText className="h-8 w-8 text-white" aria-hidden />
                  </div>
                  <div className="absolute -left-3 bottom-28 hidden h-11 w-11 place-items-center rounded-full bg-ds-primary-light shadow-md lg:grid">
                    <Check className="h-5 w-5 text-ds-strong" aria-hidden />
                  </div>

                  {/* Annotations (textes issus du site, pas de chiffres inventés) */}
                  <p className="absolute -top-10 right-0 hidden max-w-[210px] -rotate-[4deg] text-right text-[15px] font-semibold leading-5 text-ds-strong lg:block">
                    Titre de séjour, visa, regroupement familial
                  </p>
                  <svg
                    aria-hidden
                    className="absolute right-[190px] -top-4 hidden h-10 w-14 fill-none stroke-ds-primary-hover lg:block"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 56 40"
                  >
                    <path d="M50 4C34 6 18 14 8 32M8 32l2-12M8 32l12-3" />
                  </svg>
                  <p className="absolute left-2 top-full mt-4 hidden max-w-[200px] -rotate-[3deg] text-[15px] font-semibold leading-5 text-ds-strong lg:block">
                    {heroSmallText}
                  </p>
                  <svg
                    aria-hidden
                    className="absolute left-[150px] top-full -mt-1 hidden h-9 w-11 fill-none stroke-ds-primary-hover lg:block"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 44 36"
                  >
                    <path d="M4 30C10 14 24 8 40 6M40 6l-11-2M40 6l-6 10" />
                  </svg>
                  <p className="absolute -right-8 top-full mt-4 hidden max-w-[170px] -rotate-[4deg] text-[15px] font-semibold leading-5 text-ds-strong lg:block">
                    Portail titre de séjour : accès gratuit
                  </p>
                </div>
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
        className={`py-16 transition-all duration-1000 transform sm:py-20 ${
          isVisible['services-section']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div
            className="mx-auto max-w-6xl"
            data-animate-item
            data-animate-id="services-section-title"
          >
            <div className={`mb-10 transition-all duration-700 ${
              isVisible['services-section-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <Eyebrow>Solutions</Eyebrow>
              <h2 className="mb-3 max-w-[22ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                Des solutions administratives structurées pour vos démarches
              </h2>
              <p className="max-w-[60ch] text-lg leading-7 text-ds-subtle">
                Choisissez un thème : le détail de la solution s'affiche à côté.
              </p>
            </div>

            <div className="grid items-start gap-8 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
              {/* Thèmes (gauche) */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 md:grid md:overflow-visible md:pb-0 md:rounded-2xl md:border md:border-ds-border md:bg-ds-secondary md:p-2" role="tablist" aria-label="Solutions">
                {solutions.map((solution, index) => (
                  <button
                    key={solution.title}
                    type="button"
                    role="tab"
                    aria-selected={selectedSolutionIndex === index}
                    onClick={() => setSelectedSolutionIndex(index)}
                    onMouseEnter={() => setSelectedSolutionIndex(index)}
                    className={`shrink-0 md:shrink rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      selectedSolutionIndex === index
                        ? 'border-ds-primary bg-ds-bg font-semibold text-ds-strong shadow-sm'
                        : 'border-transparent bg-ds-secondary font-medium text-ds-body hover:border-ds-border hover:bg-ds-bg md:bg-transparent'
                    }`}
                  >
                    {solution.title}
                  </button>
                ))}
              </div>

              {/* Détail (droite) */}
              <div className="rounded-2xl border border-ds-border bg-ds-elevated p-6 shadow-sm md:p-8">
                {(() => {
                  const current = solutions[selectedSolutionIndex] || solutions[0];
                  return (
                    <div className="space-y-6">
                      <div>
                        <h3 className="mb-2 text-2xl font-bold text-ds-strong">
                          {current.title}
                        </h3>
                        <p className="text-base leading-6 text-ds-body">
                          {current.description}
                        </p>
                      </div>

                      {(current.duree || current.prix) && (
                        <div className="grid gap-4 rounded-xl bg-ds-secondary p-4 text-sm sm:grid-cols-2">
                          {current.duree && (
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ds-subtle">
                                Durée
                              </p>
                              <p className="text-base font-semibold text-ds-strong">
                                {current.duree}
                              </p>
                            </div>
                          )}
                          {current.prix && (
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ds-subtle">
                                Tarif
                              </p>
                              <p className="text-base font-semibold text-ds-strong">
                                {current.prix}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {current.points?.length ? (
                        <div>
                          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ds-subtle">
                            En pratique
                          </p>
                          <ul className="grid gap-x-6 gap-y-3 text-sm text-ds-body sm:grid-cols-2">
                            {current.points.map((point) => (
                              <li key={point} className="flex gap-3 leading-5">
                                <Check className="mt-0.5 h-4 w-4 flex-none text-ds-primary" aria-hidden />
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-3 border-t border-ds-border pt-6">
                        {current.isPortal ? (
                          <Link href="/calculateur">
                            <Button size="lg" className="min-w-[200px]">
                              Accéder au calculateur
                            </Button>
                          </Link>
                        ) : current.ctaHref ? (
                          <Link href={current.ctaHref}>
                            <Button size="lg" className="min-w-[200px]">
                              {current.ctaLabel ?? 'Continuer'}
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

      {/* Section : À quoi sert la plateforme */}
      <section
        id="plateforme"
        data-animate
        onMouseEnter={() =>
          setIsVisible((prev) => ({ ...prev, plateforme: true }))
        }
        className={`border-y border-ds-border py-16 transition-all duration-1000 transform sm:py-20 ${
          isVisible['plateforme']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div
            className="mx-auto max-w-6xl"
            data-animate-item
            data-animate-id="plateforme-title"
          >
            <div className={`mb-8 transition-all duration-700 ${
              isVisible['plateforme-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <Eyebrow>La plateforme</Eyebrow>
              <h2 className="mb-3 max-w-[22ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                À quoi sert la plateforme
              </h2>
              <p className="max-w-[60ch] text-lg leading-7 text-ds-subtle">
                Des outils et services adaptés à vos besoins, que vous soyez professionnel ou particulier.
              </p>
            </div>

            {/* Sélecteur de public */}
            <div
              className="mb-8 inline-flex flex-wrap gap-1 rounded-full border border-ds-border bg-ds-bg p-1"
              role="tablist"
              aria-label="Public concerné"
            >
              {PLATEFORME_BLOCKS.map((block, index) => (
                <button
                  key={block.title}
                  type="button"
                  role="tab"
                  aria-selected={hoveredPlateformeIndex === index}
                  onClick={() => setHoveredPlateformeIndex(index)}
                  onMouseEnter={() => setHoveredPlateformeIndex(index)}
                  onFocus={() => setHoveredPlateformeIndex(index)}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    hoveredPlateformeIndex === index
                      ? 'bg-ds-primary text-white'
                      : 'text-ds-body hover:bg-ds-secondary'
                  }`}
                >
                  {block.title}
                </button>
              ))}
            </div>

            {(() => {
              const block = PLATEFORME_BLOCKS[hoveredPlateformeIndex ?? 0] ?? PLATEFORME_BLOCKS[0];
              return (
                <div className={`grid gap-4 ${block.points.length < 3 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
                  {block.points.map((pt) => (
                    <div
                      key={pt}
                      className="flex items-start gap-4 rounded-xl border border-ds-border bg-ds-elevated p-6 text-base leading-6 text-ds-body shadow-sm"
                    >
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-full border border-ds-primary-light bg-ds-primary-tint">
                        <Check className="h-5 w-5 text-ds-strong" aria-hidden />
                      </span>
                      <span>{pt}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
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
        className={`py-16 transition-all duration-1000 transform sm:py-20 ${
          isVisible['limites']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div
            className="mx-auto max-w-6xl"
            data-animate-item
            data-animate-id="limites-title"
          >
            <div className={`mb-10 transition-all duration-700 ${
              isVisible['limites-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <Eyebrow>Périmètre</Eyebrow>
              <h2 className="mb-3 max-w-[22ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                Ce que nous ne faisons pas
              </h2>
              <p className="max-w-[60ch] text-lg leading-7 text-ds-subtle">
                Nos limites et le périmètre de nos services.
              </p>
            </div>

            {/* Modèle interactif : thèmes à gauche / détail à droite */}
            <div className="grid items-start gap-8 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
              {/* Thèmes (gauche) */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 md:grid md:overflow-visible md:pb-0 md:rounded-2xl md:border md:border-ds-border md:bg-ds-secondary md:p-2" role="tablist" aria-label="Limites">
                {LIMITES.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    role="tab"
                    aria-selected={hoveredLimiteIndex === index}
                    onClick={() => setHoveredLimiteIndex(index)}
                    onMouseEnter={() => setHoveredLimiteIndex(index)}
                    onFocus={() => setHoveredLimiteIndex(index)}
                    className={`shrink-0 md:shrink flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      hoveredLimiteIndex === index
                        ? 'border-ds-primary bg-ds-bg font-semibold text-ds-strong shadow-sm'
                        : 'border-transparent bg-ds-secondary font-medium text-ds-body hover:border-ds-border hover:bg-ds-bg md:bg-transparent'
                    }`}
                  >
                    <svg
                      aria-hidden
                      className="mt-0.5 h-4 w-4 flex-none fill-none stroke-ds-subtle"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12h8" />
                    </svg>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Détail (droite) */}
              <div className="rounded-2xl border border-ds-border bg-ds-bg p-6 shadow-sm md:p-8">
                {(() => {
                  const item = LIMITES[hoveredLimiteIndex ?? 0] ?? LIMITES[0];
                  return (
                    <>
                      <h3 className="mb-2 text-2xl font-bold text-ds-strong">{item.title}</h3>
                      <p className="text-base leading-6 text-ds-body">{item.details}</p>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Solutions - Creation d'entreprise */}
      <section
        id="entreprise-solutions"
        data-animate
        onMouseEnter={() =>
          setIsVisible((prev) => ({ ...prev, ['entreprise-solutions']: true }))
        }
        className={`border-t border-ds-border py-16 transition-all duration-1000 transform sm:py-20 ${
          isVisible['entreprise-solutions']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div
            className="mx-auto max-w-6xl"
            data-animate-item
            data-animate-id="entreprise-solutions-title"
          >
            <div className={`mb-10 transition-all duration-700 ${
              isVisible['entreprise-solutions'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <Eyebrow>Creation d'entreprise</Eyebrow>
              <h2 className="mb-3 max-w-[22ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                Choisissez votre structure juridique
              </h2>
              <p className="max-w-[60ch] text-lg leading-7 text-ds-subtle">
                Selectionnez la forme societale qui correspond a votre projet pour en decouvrir les details.
              </p>
            </div>

            <div className="grid items-start gap-8 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
              {/* Themes (gauche) */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 md:grid md:overflow-visible md:pb-0 md:rounded-2xl md:border md:border-ds-border md:bg-ds-secondary md:p-2" role="tablist" aria-label="Formes juridiques">
                {SOLUTIONS_ENTREPRISE.map((sol, index) => (
                  <button
                    key={sol.title}
                    type="button"
                    role="tab"
                    aria-selected={selectedEntrepriseSolutionIndex === index}
                    onClick={() => setSelectedEntrepriseSolutionIndex(index)}
                    onMouseEnter={() => setSelectedEntrepriseSolutionIndex(index)}
                    className={`shrink-0 md:shrink rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      selectedEntrepriseSolutionIndex === index
                        ? 'border-ds-primary bg-ds-bg font-semibold text-ds-strong shadow-sm'
                        : 'border-transparent bg-ds-secondary font-medium text-ds-body hover:border-ds-border hover:bg-ds-bg md:bg-transparent'
                    }`}
                  >
                    {sol.title}
                  </button>
                ))}
              </div>

              {/* Detail (droite) */}
              <div className="rounded-2xl border border-ds-border bg-ds-elevated p-6 shadow-sm md:p-8">
                {(() => {
                  const current = SOLUTIONS_ENTREPRISE[selectedEntrepriseSolutionIndex] ?? SOLUTIONS_ENTREPRISE[0];
                  return (
                    <div className="space-y-6">
                      <div>
                        <h3 className="mb-2 text-2xl font-bold text-ds-strong">{current.title}</h3>
                        <p className="text-base leading-6 text-ds-body">{current.description}</p>
                      </div>

                      {(current.duree || current.prix) && (
                        <div className="grid gap-4 rounded-xl bg-ds-secondary p-4 text-sm sm:grid-cols-2">
                          {current.duree && (
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ds-subtle">Duree</p>
                              <p className="text-base font-semibold text-ds-strong">{current.duree}</p>
                            </div>
                          )}
                          {current.prix && (
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ds-subtle">Tarif</p>
                              <p className="text-base font-semibold text-ds-strong">{current.prix}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {current.points?.length ? (
                        <div>
                          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ds-subtle">En pratique</p>
                          <ul className="grid gap-x-6 gap-y-3 text-sm text-ds-body sm:grid-cols-2">
                            {current.points.map((point) => (
                              <li key={point} className="flex gap-3 leading-5">
                                <Check className="mt-0.5 h-4 w-4 flex-none text-ds-primary" aria-hidden />
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-3 border-t border-ds-border pt-6">
                        <Link href={current.ctaHref}>
                          <Button size="lg" className="min-w-[200px]">{current.ctaLabel}</Button>
                        </Link>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Limites - Creation d'entreprise */}
      <section
        id="entreprise-limites"
        data-animate
        onMouseEnter={() =>
          setIsVisible((prev) => ({ ...prev, ['entreprise-limites']: true }))
        }
        className={`border-t border-ds-border py-16 transition-all duration-1000 transform sm:py-20 ${
          isVisible['entreprise-limites']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div
            className="mx-auto max-w-6xl"
            data-animate-item
            data-animate-id="entreprise-limites-title"
          >
            <div className={`mb-10 transition-all duration-700 ${
              isVisible['entreprise-limites'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <Eyebrow>Perimetre</Eyebrow>
              <h2 className="mb-3 max-w-[22ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                Ce que nous ne faisons pas
              </h2>
              <p className="max-w-[60ch] text-lg leading-7 text-ds-subtle">
                Nos limites en matiere de creation d'entreprise.
              </p>
            </div>

            <div className="grid items-start gap-8 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
              {/* Themes (gauche) */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 md:grid md:overflow-visible md:pb-0 md:rounded-2xl md:border md:border-ds-border md:bg-ds-secondary md:p-2" role="tablist" aria-label="Limites entreprise">
                {LIMITES_ENTREPRISE.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    role="tab"
                    aria-selected={hoveredEntrepriseLimiteIndex === index}
                    onClick={() => setHoveredEntrepriseLimiteIndex(index)}
                    onMouseEnter={() => setHoveredEntrepriseLimiteIndex(index)}
                    onFocus={() => setHoveredEntrepriseLimiteIndex(index)}
                    className={`shrink-0 md:shrink flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      hoveredEntrepriseLimiteIndex === index
                        ? 'border-ds-primary bg-ds-bg font-semibold text-ds-strong shadow-sm'
                        : 'border-transparent bg-ds-secondary font-medium text-ds-body hover:border-ds-border hover:bg-ds-bg md:bg-transparent'
                    }`}
                  >
                    <svg
                      aria-hidden
                      className="mt-0.5 h-4 w-4 flex-none fill-none stroke-ds-subtle"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12h8" />
                    </svg>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Detail (droite) */}
              <div className="rounded-2xl border border-ds-border bg-ds-bg p-6 shadow-sm md:p-8">
                {(() => {
                  const item = LIMITES_ENTREPRISE[hoveredEntrepriseLimiteIndex ?? 0] ?? LIMITES_ENTREPRISE[0];
                  return (
                    <>
                      <h3 className="mb-2 text-2xl font-bold text-ds-strong">{item.title}</h3>
                      <p className="text-base leading-6 text-ds-body">{item.details}</p>
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
        className={`relative overflow-hidden border-y border-ds-border py-16 transition-all duration-1000 transform sm:py-20 ${
          isVisible['temoignages']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div
            className="mx-auto mb-10 max-w-6xl"
            data-animate-item
            data-animate-id="temoignages-title"
          >
            <div className={`transition-all duration-700 ${
              isVisible['temoignages-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <Eyebrow>Témoignages</Eyebrow>
              <h2 className="mb-3 max-w-[22ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                Ils nous ont fait confiance
              </h2>
              <p className="max-w-[60ch] text-lg leading-7 text-ds-subtle">
                Ils nous font confiance...
              </p>
            </div>
          </div>

          {loadingTemoignages ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-ds-primary"></div>
              <p className="text-ds-subtle">Chargement des témoignages...</p>
            </div>
          ) : temoignages.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-ds-subtle">Aucun témoignage disponible pour le moment.</p>
            </div>
          ) : (
            <>
              {/* Desktop: 3 colonnes */}
              <div className="mx-auto hidden max-w-6xl gap-4 md:grid md:grid-cols-3">
                {temoignages.slice(0, 3).map((temoignage, index) => (
                  <div
                    key={temoignage._id || index}
                    className="rounded-2xl border border-ds-border bg-ds-elevated p-6 shadow-sm"
                    style={{
                      animation: isVisible['temoignages'] ? `fadeIn 0.6s ease-out ${index * 150}ms both` : 'none',
                    }}
                  >
                    {/* Note avec étoiles */}
                    <div className="mb-4 flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={i}
                          className={`text-lg ${i < temoignage.note ? 'text-ds-primary' : 'text-ds-border'}`}
                        >
                          ★
                        </span>
                      ))}
                      <span className="ml-2 text-xs font-semibold text-ds-subtle">{temoignage.note}/5</span>
                    </div>

                    {/* Texte du témoignage */}
                    <p className="text-sm font-medium leading-relaxed text-ds-body">
                      {temoignage.texte}
                    </p>
                  </div>
                ))}
              </div>

              {/* Mobile: défilement horizontal 2 par 2 */}
              <div className="-mx-4 max-w-6xl snap-x snap-mandatory overflow-x-auto px-4 pb-2 md:hidden">
                <div className="flex gap-4">
                  {temoignages.slice(0, 3).map((temoignage, index) => (
                    <div
                      key={temoignage._id || index}
                      className="min-w-[calc(50%-0.5rem)] snap-start rounded-2xl border border-ds-border bg-ds-elevated p-6 shadow-sm"
                      style={{
                        animation: isVisible['temoignages'] ? `fadeIn 0.6s ease-out ${index * 150}ms both` : 'none',
                      }}
                    >
                      <div className="mb-4 flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <span
                            key={i}
                            className={`text-lg ${i < temoignage.note ? 'text-ds-primary' : 'text-ds-border'}`}
                          >
                            ★
                          </span>
                        ))}
                        <span className="ml-2 text-xs font-semibold text-ds-subtle">{temoignage.note}/5</span>
                      </div>

                      <p className="text-sm font-medium leading-relaxed text-ds-body">
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

      {/* Appel à l'action final */}
      <section id="cta-final" className="py-16 sm:py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-6xl items-center gap-8 rounded-3xl border border-transparent bg-ds-primary-tint px-6 py-12 dark:border-ds-border sm:px-12 sm:py-16 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="mb-3 max-w-[18ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                Prêt à démarrer votre dossier ?
              </h2>
              <p className="max-w-[44ch] text-lg leading-7 text-ds-body">
                Créez votre compte gratuit et suivez en temps réel l'évolution de votre dossier.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/auth/signup">
                  <Button size="lg">{heroCtaPrimary}</Button>
                </Link>
                <Link href="/contact">
                  <Button variant="outline" size="lg">
                    {heroCtaSecondaryLabel}
                  </Button>
                </Link>
              </div>
            </div>
            <svg className="hidden h-[180px] w-[220px] md:block" viewBox="0 0 220 180" aria-hidden>
              <rect className="fill-ds-primary" x="0" y="0" width="120" height="120" rx="24" />
              <rect className="fill-ds-strong" x="132" y="0" width="88" height="56" rx="16" />
              <rect className="fill-ds-primary-light" x="132" y="68" width="88" height="52" rx="16" />
              <rect className="fill-ds-primary-hover" x="0" y="132" width="56" height="48" rx="12" />
              <rect className="fill-ds-primary-light" x="68" y="132" width="52" height="48" rx="12" />
              <rect className="fill-ds-primary" x="132" y="132" width="88" height="48" rx="12" />
            </svg>
          </div>
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

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
    "Nous vous accompagnons dans toutes vos démarches administratives liées au séjour en France : première demande et renouvellement de titre de séjour, regroupement familial et demande de visa. Bénéficiez d’un accompagnement personnalisé pour constituer un dossier complet, conforme et sécurisé. Suivez l'évolution de votre dossier en temps réel sur la plateforme."
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
            texte: 'Grâce à ADA Pappers, j\'ai pu obtenir mon titre de séjour sans difficulté. Un suivi personnalisé et des conseils précieux à chaque étape.',
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header Professionnel */}
      <Header variant="home" />

      {/* Hero Section — design renforcé */}
      <section className="relative min-h-[85vh] flex items-center py-20 lg:py-28 overflow-hidden">
        {/* Fond : dégradé doux + formes organiques */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,rgba(249,115,22,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_20%_80%,rgba(251,146,60,0.08),transparent)]" />
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] rounded-full bg-orange-200/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-amber-100/30 blur-[80px] pointer-events-none" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="relative max-w-4xl">
            {/* Titre */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 leading-[1.1] tracking-tight mb-6">
              {heroTitle.replace(heroTitleHighlight, '').trim() || heroTitle}{' '}
              <span className="text-orange-500">
                {heroTitleHighlight}
              </span>
            </h1>
            
            {/* Sous-titre */}
            <p className="text-lg lg:text-xl text-gray-600 max-w-2xl leading-relaxed mb-10">
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
        </div>
      </section>

      {/* Séparateur visuel hero / contenu */}
      <div className="h-px bg-gradient-to-r from-transparent via-orange-200/50 to-transparent" />

      {/* Section : CE QUE NOUS FAISONS */}
      <section 
        id="services"
        data-animate
        className={`py-24 bg-white transition-all duration-1000 ${
          isVisible['services'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <div 
            className="text-center mb-20"
            data-animate-item
            data-animate-id="services-title"
          >
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-orange-500 mb-4">
              Nos services
            </span>
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 transition-all duration-700 ${
              isVisible['services-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              CE QUE NOUS FAISONS
            </h2>
            <p className={`text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed transition-all duration-700 delay-200 ${
              isVisible['services-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              Nos services d&apos;accompagnement administratif pour vos démarches de titres de séjour et visas
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="space-y-4">
              {[
                {
                  title: "Accompagnement administratif pour le dépôt et le renouvellement de titres de séjour",
                  details: "Nous vous accompagnons dans toutes les étapes de votre demande de titre de séjour, qu'il s'agisse d'une première demande ou d'un renouvellement. Notre équipe vérifie la complétude de votre dossier, vous guide dans la préparation des documents nécessaires et vous assiste lors du dépôt de votre demande auprès de la préfecture compétente. Nous assurons également le suivi de votre dossier jusqu'à l'obtention de votre titre de séjour."
                },
                {
                  title: "Assistance administrative pour le dépôt de demandes de visa",
                  details: "Notre service d'assistance vous aide à préparer et déposer votre demande de visa. Nous vous informons sur les différents types de visas disponibles selon votre situation, vérifions que vous réunissez toutes les conditions requises, et vous accompagnons dans la constitution de votre dossier. Nous pouvons également vous assister lors du dépôt de votre demande au consulat ou à l'ambassade compétente."
                },
                {
                  title: "Mise à disposition d'informations générales et publiques sur les démarches administratives liées aux titres de séjour et aux visas",
                  details: "Notre plateforme met à votre disposition un ensemble d'informations actualisées sur les différentes démarches administratives liées aux titres de séjour et aux visas. Vous trouverez des guides détaillés, des fiches pratiques, et des réponses aux questions fréquentes. Ces informations sont régulièrement mises à jour pour refléter les dernières évolutions réglementaires."
                },
                {
                  title: "Vérification de la liste des pièces exigées par l'administration",
                  details: "Avant de constituer votre dossier, nous vérifions avec vous la liste complète des pièces exigées par l'administration selon votre situation. Cette vérification permet d'éviter les oublis et les retards dans le traitement de votre demande. Nous vous indiquons également les documents qui doivent être traduits, légalisés ou certifiés conformes."
                },
                {
                  title: "Organisation et vérification de la complétude administrative du dossier",
                  details: "Nous organisons et vérifions méthodiquement votre dossier pour nous assurer qu'il est complet et conforme aux exigences de l'administration. Cette vérification comprend l'ordre des documents, leur format, leur validité, et leur conformité aux normes requises. Un dossier bien organisé et complet facilite le traitement de votre demande par l'administration."
                },
                {
                  title: "Dépôt du dossier administratif auprès de l'administration, sur la base d'un mandat écrit",
                  details: "Sur la base d'un mandat écrit que vous nous confiez, nous pouvons déposer votre dossier administratif auprès de l'administration compétente (préfecture, consulat, etc.). Ce service vous permet de gagner du temps et de vous assurer que votre dossier est déposé dans les délais requis. Le mandat écrit précise l'étendue de notre mission et vos droits."
                },
                {
                  title: "Suivi administratif de la demande",
                  details: "Une fois votre dossier déposé, nous assurons un suivi régulier de votre demande auprès de l'administration. Nous vous tenons informé de l'avancement de votre dossier, des éventuelles demandes de compléments, et des décisions prises. Ce suivi vous permet de rester informé à chaque étape de la procédure administrative."
                },
                {
                  title: "Aide matérielle à la constitution d'un dossier de demande d'aide juridictionnelle, le cas échéant",
                  details: "Si vous êtes éligible à l'aide juridictionnelle, nous vous assistons dans la constitution de votre dossier de demande. Nous vous aidons à remplir les formulaires nécessaires, à rassembler les justificatifs de vos ressources, et à constituer un dossier complet. Cette aide vous permet de bénéficier d'une prise en charge partielle ou totale de vos frais juridiques."
                },
                {
                  title: "Aide à la rédaction formelle de courriers",
                  details: "Nous vous assistons dans la rédaction de vos courriers administratifs (lettres de motivation, recours gracieux, demandes de régularisation, etc.). Nous vous aidons à structurer vos courriers, à utiliser le vocabulaire administratif approprié, et à mettre en avant les éléments pertinents de votre situation. Cette assistance vous permet de communiquer efficacement avec l'administration."
                }
              ].map((item, index) => (
                <div
                  key={index}
                  data-animate-item
                  data-animate-id={`service-${index}`}
                  className={`transition-all duration-700 ${
                    isVisible[`service-${index}`] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                  }`}
                  style={{ transitionDelay: `${index * 50}ms` }}
                >
                  <ExpandableItem
                    title={item.title}
                    details={item.details}
                    icon="✓"
                    iconColor="text-primary"
                    borderColor="border-primary/20"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section : CE QUE NOUS NE FAISONS PAS */}
      <section 
        id="limites"
        data-animate
        className={`py-24 bg-gray-50/80 transition-all duration-1000 ${
          isVisible['limites'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <div 
            className="text-center mb-20"
            data-animate-item
            data-animate-id="limites-title"
          >
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
              Périmètre
            </span>
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 transition-all duration-700 ${
              isVisible['limites-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              CE QUE NOUS NE FAISONS PAS
            </h2>
            <p className={`text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed transition-all duration-700 delay-200 ${
              isVisible['limites-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              Nos limites et le périmètre de nos services
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="space-y-4">
              {[
                {
                  title: "Nous ne nous représentons pas les utilisateurs en qualité d'avocats",
                  details: "Notre plateforme fournit des services d'assistance administrative et de facilitation, mais nous ne sommes pas un cabinet d'avocats. Nous ne pouvons pas vous représenter en tant qu'avocat, ni exercer les prérogatives réservées aux avocats. Pour toute représentation juridique, vous devez faire appel à un avocat inscrit au barreau."
                },
                {
                  title: "Nous ne représentons pas les utilisateurs devant les juridictions",
                  details: "Nous n'intervenons pas dans les procédures judiciaires. Si votre dossier nécessite une représentation devant un tribunal administratif, un tribunal judiciaire, ou toute autre juridiction, vous devez obligatoirement faire appel à un avocat. Nous pouvons cependant vous aider à trouver un avocat compétent dans votre région."
                },
                {
                  title: "Nous ne fournissons pas de conseil juridique personnalisé",
                  details: "Les informations que nous mettons à disposition sont de nature générale et ne constituent pas un conseil juridique personnalisé adapté à votre situation spécifique. Pour obtenir un conseil juridique personnalisé, vous devez consulter un avocat qui pourra analyser votre situation particulière et vous donner des conseils adaptés à votre cas."
                },
                {
                  title: "Nous n'assurons aucune représentation légale",
                  details: "Nous n'assurons pas de représentation légale devant les administrations ou les juridictions. Notre rôle se limite à l'assistance administrative, à la préparation des dossiers, et à la facilitation des démarches. Pour toute représentation légale, vous devez faire appel à un professionnel habilité (avocat, huissier de justice, etc.)."
                },
                {
                  title: "Nous n'intervenons pas dans les procédures contentieuses",
                  details: "Nous n'intervenons pas dans les procédures contentieuses, c'est-à-dire les procédures qui opposent l'administration à l'étranger devant une juridiction. Si votre demande a été refusée et que vous souhaitez contester cette décision, vous devez faire appel à un avocat spécialisé qui pourra vous représenter et défendre vos intérêts devant la juridiction compétente."
                }
              ].map((item, index) => (
                <div
                  key={index}
                  data-animate-item
                  data-animate-id={`limite-${index}`}
                  className={`transition-all duration-700 ${
                    isVisible[`limite-${index}`] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                  }`}
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <ExpandableItem
                    title={item.title}
                    details={item.details}
                    icon="✗"
                    iconColor="text-red-500"
                    borderColor="border-red-200"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section : À quoi sert la plateforme */}
      <section 
        id="plateforme"
        data-animate
        className={`py-24 bg-white transition-all duration-1000 ${
          isVisible['plateforme'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <div 
            className="text-center mb-20"
            data-animate-item
            data-animate-id="plateforme-title"
          >
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-orange-500 mb-4">
              La plateforme
            </span>
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 transition-all duration-700 ${
              isVisible['plateforme-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              À quoi sert la plateforme
            </h2>
            <p className={`text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed transition-all duration-700 delay-200 ${
              isVisible['plateforme-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              Des outils et services adaptés à vos besoins, que vous soyez professionnel ou particulier
            </p>
          </div>
          
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-primary/10">
              <div className="space-y-8">
                {/* Pour les professionnels et organismes */}
                <div
                  data-animate-item
                  data-animate-id="plateforme-pro"
                  className={`transition-all duration-700 ${
                    isVisible['plateforme-pro'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                  }`}
                >
                  <h3 className="text-2xl font-bold mb-6 text-foreground">
                    Pour les professionnels et organismes
                  </h3>
                  <div className="space-y-4">
                    {[
                      {
                        title: "Mise à disposition d'un espace de suivi administratif des dossiers, transmis à un consulat, une association ou un avocat, à la demande de l'étranger",
                        details: "Notre plateforme offre un espace dédié permettant aux professionnels (consulats, associations, avocats) de suivre l'état d'avancement des dossiers qui leur sont transmis par les étrangers. Cet espace sécurisé permet un suivi en temps réel, l'accès aux documents nécessaires, et une meilleure coordination entre tous les acteurs impliqués dans le processus administratif."
                      },
                      {
                        title: "Mise à disposition d'un canal de communication sécurisé entre l'étranger et les acteurs concernés (consulat, avocat, association)",
                        details: "Nous mettons à disposition un système de messagerie sécurisé permettant une communication fluide et confidentielle entre l'étranger et les professionnels qui l'accompagnent. Ce canal de communication permet d'échanger des documents, de poser des questions, de recevoir des mises à jour sur le dossier, tout en garantissant la confidentialité et la sécurité des données échangées."
                      }
                    ].map((item, index) => (
                      <div
                        key={index}
                        data-animate-item
                        data-animate-id={`plateforme-pro-item-${index}`}
                        className={`transition-all duration-700 ${
                          isVisible[`plateforme-pro-item-${index}`] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                        }`}
                        style={{ transitionDelay: `${index * 100}ms` }}
                      >
                        <ExpandableItem
                          title={item.title}
                          details={item.details}
                          icon="✓"
                          iconColor="text-primary"
                          borderColor="border-primary/20"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Séparateur */}
                <div className="border-t border-primary/20"></div>

                {/* Pour les particuliers */}
                <div
                  data-animate-item
                  data-animate-id="plateforme-part"
                  className={`transition-all duration-700 ${
                    isVisible['plateforme-part'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                  }`}
                >
                  <h3 className="text-2xl font-bold mb-6 text-foreground">
                    Pour les particuliers
                  </h3>
                  <div className="space-y-4">
                    {[
                      {
                        title: "Déléguer les formalités de demande et de renouvellement de titre de séjours et de demande de visa",
                        details: "Vous pouvez nous confier la gestion complète de vos démarches administratives. Nous nous chargeons de préparer votre dossier, de vérifier sa complétude, et de le déposer auprès de l'administration compétente. Ce service vous permet de gagner du temps et de vous assurer que votre dossier est correctement constitué et déposé dans les délais."
                      },
                      {
                        title: "Accéder à des informations générales sur les différentes catégories de titres de séjour",
                        details: "Notre plateforme vous donne accès à une base d'informations complète sur les différents types de titres de séjour (travailleur, étudiant, famille, visiteur, etc.). Vous trouverez des explications détaillées sur les conditions d'obtention, les documents requis, les délais de traitement, et les droits associés à chaque type de titre de séjour."
                      },
                      {
                        title: "Espace de suivi administratif complet des dossiers transmis",
                        details: "Votre espace personnel vous permet de suivre en temps réel l'état d'avancement de tous vos dossiers. Vous pouvez consulter l'historique de vos démarches, télécharger vos documents, recevoir des notifications sur les évolutions de votre dossier, et accéder à toutes les informations relatives à vos demandes en cours."
                      },
                      {
                        title: "Mise à disposition d'un outil de calcul des délais applicables aux titres de séjour et aux visas",
                        details: "Notre calculateur de délais vous permet de connaître précisément les délais légaux applicables à votre situation. Il calcule automatiquement les délais de traitement, les dates limites de dépôt, les délais de recours, et vous alerte sur les échéances importantes. Cet outil vous aide à mieux planifier vos démarches et à respecter les délais légaux."
                      },
                      {
                        title: "Mise à disposition d'un répertoire de professionnels du droit (avocats) spécialisé en droit des étrangers",
                        details: "Notre répertoire vous permet de trouver facilement un avocat spécialisé en droit des étrangers près de chez vous. Chaque professionnel est présenté avec ses spécialités, son expérience, et ses coordonnées. En cas de situation complexe, de refus, ou de procédure contentieuse, nous vous recommandons de consulter un avocat. La plateforme facilite la mise en relation mais n'intervient pas juridiquement."
                      }
                    ].map((item, index) => (
                      <div
                        key={index}
                        data-animate-item
                        data-animate-id={`plateforme-part-item-${index}`}
                        className={`transition-all duration-700 ${
                          isVisible[`plateforme-part-item-${index}`] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                        }`}
                        style={{ transitionDelay: `${index * 100}ms` }}
                      >
                        <ExpandableItem
                          title={item.title}
                          details={item.details}
                          icon="✓"
                          iconColor="text-primary"
                          borderColor="border-primary/20"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Note importante */}
                <div
                  data-animate-item
                  data-animate-id="plateforme-note"
                  className={`mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20 transition-all duration-700 ${
                    isVisible['plateforme-note'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                  }`}
                >
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Note importante :</strong> La Plateforme facilite la mise en relation, elle n'intervient pas juridiquement. En cas de situation complexe, de refus, ou de procédure contentieuse, l'utilisateur est invité à consulter un avocat. La plateforme peut faciliter la mise en relation avec un professionnel du droit.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Témoignages */}
      <section 
        id="temoignages"
        data-animate
        className={`py-24 bg-gray-50/80 relative overflow-hidden transition-all duration-1000 ${
          isVisible['temoignages'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <div 
            className="text-center mb-16"
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
                  className="group relative bg-gradient-to-br from-white to-primary/5 rounded-2xl p-6 shadow-md hover:shadow-2xl transition-all duration-500 border border-primary/10 hover:border-primary/30 transform hover:-translate-y-2"
                  style={{ 
                    animation: isVisible['temoignages'] ? `fadeIn 0.6s ease-out ${index * 150}ms both` : 'none'
                  }}
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
                    <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center shadow-md group-hover:shadow-lg transition-all duration-300 group-hover:scale-110">
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
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Section Services (cartes) */}
      <section 
        id="services-section"
        data-animate
        className={`py-24 bg-white transition-all duration-1000 ${
          isVisible['services-section'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <div 
            className="text-center mb-20"
            data-animate-item
            data-animate-id="services-section-title"
          >
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-orange-500 mb-4">
              Solutions
            </span>
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 leading-tight transition-all duration-700 ${
              isVisible['services-section-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              Des solutions <span className="text-orange-500">administratives sur mesure</span> pour vos démarches
            </h2>
            <p className={`text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed transition-all duration-700 delay-200 ${
              isVisible['services-section-title'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              Accompagnement aux démarches administratives, outils de suivi et alertes intelligentes pour sécuriser vos titres de séjour et visas.
            </p>
          </div>

          {/* Services côte à côte : ce que fait la plateforme */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto mb-16">
            {[
              {
                titre: 'Assistant démarches titres de séjour',
                description: 'Un accompagnement pas-à-pas pour préparer vos demandes de titres de séjour et de visas.',
                duree: 'Selon votre dossier',
                prix: 'Inclus dans la plateforme',
                features: [
                  'Checklist personnalisée des pièces à fournir',
                  'Rappels d’échéances de dépôt',
                  'Suivi de l’état de vos démarches',
                  'Modèles de courriers administratifs',
                ],
                icon: '💼',
                color: 'primary',
                isPopular: true,
              },
              {
                titre: 'Préparation et dépôt administratif (sur mandat)',
                description: 'Nous préparons et déposons votre dossier administratif auprès de l’autorité compétente, sur la base d’un mandat écrit.',
                duree: 'Selon le dossier',
                prix: 'Sur devis',
                features: [
                  'Organisation et vérification de la complétude du dossier',
                  'Dépôt administratif sur mandat (préfecture, consulat, etc.)',
                  'Suivi administratif de la demande',
                  'Retours structurés sur les demandes de compléments',
                ],
                icon: '🤝',
                color: 'primary',
              },
              {
                titre: 'Outils et informations administratives',
                description: 'Une base d’informations claire et à jour sur les démarches administratives liées au séjour.',
                duree: 'Accès en continu',
                prix: 'Inclus dans la plateforme',
                features: [
                  'Guides pratiques sur les catégories de titres et visas',
                  'Fiches explicatives sur les délais et procédures',
                  'Foire aux questions administratives',
                  'Référentiels publics toujours accessibles',
                ],
                icon: '📝',
                color: 'primary',
              },
              {
                titre: 'Portail de gestion du cycle de vie du titre de séjour',
                description: 'Un espace dédié pour suivre, anticiper et renouveler vos titres de séjour.',
                duree: 'Jusqu\'au terme de renouvellement',
                prix: 'À partir de 25€',
                features: [
                  'Tableau de bord du titre de séjour',
                  'Assistant de renouvellement de titre de séjour',
                  'Tracker de titre de séjour',
                  'Système d\'alertes et de rappel pour titres de séjour',
                ],
                icon: '🌐',
                color: 'primary',
                isPortal: true,
              },
            ].map((service, index) => {
              const colors = {
                bg: 'bg-primary/5',
                text: 'text-primary',
                border: 'border-primary/20',
                hover: 'hover:border-primary',
              };
              return (
                <div
                  key={index}
                  data-animate-item
                  data-animate-id={`service-card-${index}`}
                  className={`group relative bg-white rounded-3xl shadow-xl p-6 border-2 ${colors.border} ${colors.hover} transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 flex flex-col ${
                    isVisible[`service-card-${index}`] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                  }`}
                  style={{
                    transitionDelay: `${index * 100}ms`,
                    background: `linear-gradient(135deg, ${colors.bg} 0%, white 50%, white 100%)`,
                  }}
                >
                  {/* Badge de popularité */}
                  {service.isPopular && (
                    <div className="absolute -top-4 right-6 bg-primary text-white px-4 py-1 rounded-full text-xs font-bold shadow-lg z-10">
                      Le plus populaire
                    </div>
                  )}

                  {/* En-tête de la carte */}
                  <div className="mb-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`w-14 h-14 ${colors.bg} rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-all duration-300 shadow-md flex-shrink-0`}>
                        {service.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`text-lg md:text-xl font-bold mb-2 ${colors.text} break-words`}>
                          {service.titre}
                        </h3>
                      </div>
              </div>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-4 break-words">
                      {service.description}
              </p>
            </div>

                  {/* Informations prix et durée */}
                  <div className="flex flex-col gap-3 mb-6 pb-6 border-b-2 border-border/50">
                    <div className="flex items-center justify-between bg-muted/50 px-3 py-2 rounded-lg">
                      <span className="text-muted-foreground text-xs font-medium">⏱️ Durée:</span>
                      <span className="font-bold text-foreground text-sm">{service.duree}</span>
              </div>
                    <div className="flex items-center justify-between bg-primary/10 px-3 py-2 rounded-lg">
                      <span className="text-muted-foreground text-xs font-medium">Tarif:</span>
                      <span className={`text-2xl font-bold ${colors.text}`}>{service.prix}</span>
            </div>
              </div>

                  {/* Liste des fonctionnalités */}
                  <ul className="space-y-3 mb-6 flex-1">
                    {service.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3 group/item">
                        <div className={`w-5 h-5 ${colors.bg} rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 group-hover/item:scale-110 transition-transform`}>
                          <span className={`${colors.text} text-xs font-bold`}>✓</span>
            </div>
                        <span className="text-foreground text-sm leading-relaxed font-medium break-words">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Bouton d'action */}
                  <div className="pt-6 border-t-2 border-border/50 mt-auto">
                    {service.isPortal ? (
                      <Link href="/calculateur" className="block">
                        <Button 
                          className="w-full bg-gradient-to-r from-primary to-primary/80 text-white hover:shadow-xl hover:scale-105 transition-all duration-300" 
                          size="lg"
                        >
                          <span className="mr-2">🚀</span>
                          Accéder au Calculateur
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/contact" className="block">
                        <Button 
                          variant="outline" 
                          className={`w-full border-2 transition-all duration-300 hover:scale-105 ${colors.border} ${colors.text} group-hover:bg-primary group-hover:text-white group-hover:border-primary`} 
                          size="lg"
                        >
                          <span className="mr-2">📧</span>
                          Soumettre un dossier
                        </Button>
                      </Link>
                    )}
              </div>
            </div>
              );
            })}
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
      
      {/* Badge flottant pour ouvrir l'outil de prise de rendez-vous */}
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

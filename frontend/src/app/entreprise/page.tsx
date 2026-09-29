'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { Check, Building2, FileText } from 'lucide-react';

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
  const baseClasses =
    'inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ds-subtle">
      <span aria-hidden className="h-3 w-3 rounded-sm bg-ds-primary" />
      {children}
    </span>
  );
}

const FORMES_JURIDIQUES = [
  {
    title: 'SARL',
    label: 'SARL',
    fullName: 'Societe a Responsabilite Limitee',
    description:
      'La forme la plus courante pour les PME. Capital variable, responsabilite limitee aux apports, gerance simple. Adaptee pour 2 associes ou plus.',
    duree: '2 a 4 semaines',
    prix: 'Sur devis',
    points: [
      'Capital minimum libre (symbolique possible)',
      'Responsabilite limitee aux apports',
      'Gerance par un ou plusieurs gerants',
      'Transmission de parts encadree',
      'Regime social : gerant majoritaire = TNS',
      'Ideal pour projets a plusieurs associes',
    ],
    ctaHref: '/dossiers/create?rubrique=constitution_societe&type=sarl',
  },
  {
    title: 'SUARL',
    label: 'SUARL',
    fullName: 'Societe Unipersonnelle a Responsabilite Limitee',
    description:
      'La version unipersonnelle de la SARL. Un seul associe, structure protegee, separee du patrimoine personnel. Ideal pour demarrer seul.',
    duree: '2 a 3 semaines',
    prix: 'Sur devis',
    points: [
      'Associe unique : personne physique uniquement',
      'Patrimoine personnel protege',
      'Gestion simplifiee (1 gerant = associe)',
      'Comptabilite obligatoire',
      'Passage en SARL facilite si nouveaux associes',
      'Forme tres repandue au Senegal',
    ],
    ctaHref: '/dossiers/create?rubrique=constitution_societe&type=suarl',
  },
  {
    title: 'SAS',
    label: 'SAS',
    fullName: 'Societe par Actions Simplifiee',
    description:
      'Grande liberte statutaire, adaptee aux projets ambitieux et aux levees de fonds. Organisation interne personnalisable. Dirigeant assimile-salarie.',
    duree: '3 a 5 semaines',
    prix: 'Sur devis',
    points: [
      'Statuts tres libres et modulables',
      'President assimile-salarie (regime general)',
      'Entree et sortie d\'actionnaires facilitees',
      'Ideal pour projets innovants et startups',
      'Possibilite de preference d\'actions',
      'Capital librement fixe',
    ],
    ctaHref: '/dossiers/create?rubrique=constitution_societe&type=sas',
  },
  {
    title: 'SASU',
    label: 'SASU',
    fullName: 'Societe par Actions Simplifiee Unipersonnelle',
    description:
      'SAS a associe unique. Beneficie de la flexibilite de la SAS avec une gestion simplifiee. Statut de President assimile-salarie.',
    duree: '2 a 4 semaines',
    prix: 'Sur devis',
    points: [
      'Associe unique (personne physique ou morale)',
      'President : regime general de securite sociale',
      'Statuts libres et evolutifs',
      'Transformation en SAS aisee',
      'Capital minimum libre',
      'Protection patrimoine personnel',
    ],
    ctaHref: '/dossiers/create?rubrique=constitution_societe&type=sas',
  },
  {
    title: 'SCI',
    label: 'SCI',
    fullName: 'Societe Civile Immobiliere',
    description:
      'Outil de gestion et de transmission du patrimoine immobilier. Permet d\'eviter l\'indivision et de faciliter les successions.',
    duree: '2 a 4 semaines',
    prix: 'Sur devis',
    points: [
      'Gestion et transmission de biens immobiliers',
      'Evite l\'indivision successorale',
      'Parts sociales transmissibles facilement',
      'Objet civil uniquement (pas commercial)',
      'Gerant associe ou tiers',
      'Regime fiscal IR ou IS au choix',
    ],
    ctaHref: '/dossiers/create?rubrique=constitution_societe&type=sci',
  },
  {
    title: 'SA',
    label: 'SA',
    fullName: 'Societe Anonyme',
    description:
      'Structure pour les grandes entreprises. Capital minimum eleve, gouvernance avec CA ou Directoire. Adaptee aux projets necessitant des apports importants.',
    duree: '4 a 8 semaines',
    prix: 'Sur devis',
    points: [
      'Capital minimum : 10 000 000 FCFA (Senegal)',
      'Gouvernance : PDG ou Directoire + CS',
      '7 actionnaires minimum',
      'Actions librement negociables',
      'Acces aux marches financiers possible',
      'Commissaire aux comptes obligatoire',
    ],
    ctaHref: '/dossiers/create?rubrique=constitution_societe&type=sa',
  },
] as const;

const PLATEFORME_BLOCKS = [
  {
    title: 'Pour les createurs',
    points: [
      'Choisir la forme juridique adaptee a votre projet grace a un outil de comparaison interactif.',
      'Remplir les fiches de constitution en ligne, guidees rubrique par rubrique.',
      'Telecharger les statuts pre-remplis et les actes constitutifs au format PDF.',
      'Suivre l\'avancement de votre dossier de creation en temps reel.',
      'Deposer et centraliser toutes les pieces justificatives requises (identite, casier judiciaire, etc.).',
    ],
  },
  {
    title: 'Pour les professionnels',
    points: [
      'Acceder a un espace de pilotage des dossiers de constitution transmis par vos clients.',
      'Demander des fiches complementaires (etat civil, declaration sur l\'honneur, procuration) directement depuis le dossier.',
      'Envoyer des liens d\'invitation ciblés a chaque associe pour qu\'il remplisse uniquement sa partie.',
      'Generer les PDF definitifs avec en-tete et signature au moment voulu.',
    ],
  },
] as const;

const LIMITES = [
  {
    label: 'Pas de conseils juridiques personnalises',
    title: 'Nous n\'assurons pas de conseil juridique personnalise',
    details:
      'Notre plateforme fournit des outils d\'assistance administrative et des informations generales sur les formes juridiques. Nous ne sommes pas un cabinet d\'avocats. Pour toute question juridique complexe ou choix strategique engage, nous vous mettons en relation avec un avocat specialise en droit des affaires.',
  },
  {
    label: 'Pas d\'immatriculation directe au registre',
    title: 'Nous n\'immatriculons pas votre societe',
    details:
      'Nous preparons et organisons vos documents constitutifs, mais le depot au greffe ou au RCCM (Registre du Commerce et du Credit Mobilier) reste a votre charge ou a celle de votre conseil. Nous pouvons vous accompagner dans les demarches mais n\'agissons pas comme mandataire.',
  },
  {
    label: 'Pas de domiciliation commerciale',
    title: 'Nous ne fournissons pas de domiciliation',
    details:
      'Ada Papers ne propose pas de service de domiciliation d\'entreprise. Vous devez disposer d\'une adresse de siege social valide. Nous pouvons vous orienter vers des partenaires de domiciliation si besoin.',
  },
  {
    label: 'Pas de conseils fiscaux ou comptables',
    title: 'Nous n\'assurons pas de conseil fiscal ou comptable',
    details:
      'Le choix du regime fiscal (IR / IS), les implications TVA, la tenue de la comptabilite et les declarations fiscales relevent de la competence d\'un expert-comptable. Nous pouvons vous mettre en relation avec des professionnels du chiffre partenaires.',
  },
  {
    label: 'Pas d\'ouverture de compte bancaire',
    title: 'Nous n\'ouvrons pas de compte bancaire professionnel',
    details:
      'L\'ouverture d\'un compte bancaire et le depot du capital social sont des etapes que vous effectuez directement aupres de la banque de votre choix. Nos fiches de constitution mentionnent les pieces habituellement requises, mais l\'instruction reste propre a chaque etablissement.',
  },
] as const;

export default function EntreprisePage() {
  const { data: session } = useSession();
  const [isVisible, setIsVisible] = useState<{ [key: string]: boolean }>({});
  const [scrollPastHero, setScrollPastHero] = useState(false);
  const [showMobileTopBar, setShowMobileTopBar] = useState(true);
  const [selectedFormeIndex, setSelectedFormeIndex] = useState(0);
  const [hoveredLimiteIndex, setHoveredLimiteIndex] = useState<number | null>(0);
  const [hoveredPlateformeIndex, setHoveredPlateformeIndex] = useState<number | null>(0);

  const role = (session?.user as { role?: string } | undefined)?.role;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleScroll = () => {
      setShowMobileTopBar(window.scrollY < 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrollPastHero(window.scrollY > 220);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const elementId =
              entry.target.id || entry.target.getAttribute('data-animate-id') || '';
            setIsVisible((prev) => ({ ...prev, [elementId]: true }));
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));
    document.querySelectorAll('[data-animate-item]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-ds-primary-tint flex flex-col scroll-smooth overflow-x-hidden max-w-[100vw]">
      {/* Header sticky revele apres defilement */}
      <div
        className={`fixed top-0 left-0 right-0 z-[80] transition-transform duration-300 ${
          scrollPastHero ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <Header variant="home" />
      </div>

      {/* Barre mobile */}
      {showMobileTopBar && (
        <div className="md:hidden sticky top-[56px] z-40 bg-white/95 border-b border-gray-200">
          <div className="w-full max-w-[100vw] mx-auto px-2">
            <div className="w-full flex items-center justify-center overflow-x-auto no-scrollbar py-2">
              <div className="flex items-center gap-1 min-w-max">
                <Link
                  href="/a-propos"
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 whitespace-nowrap"
                >
                  A propos
                </Link>
                <Link
                  href="/faq"
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 whitespace-nowrap"
                >
                  FAQ
                </Link>
                <Link
                  href="/contact"
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 whitespace-nowrap"
                >
                  Contact
                </Link>
                <Link
                  href="/dossiers/create?rubrique=constitution_societe"
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium text-white bg-orange-500 hover:bg-orange-600 whitespace-nowrap"
                >
                  Creer ma societe
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden py-6 sm:py-10">
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
              <Link
                href="/"
                className="font-bold text-ds-primary text-xl tracking-tight hover:opacity-80 transition-opacity"
              >
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
              <Link
                href={
                  session
                    ? role === 'admin' || role === 'superadmin'
                      ? '/admin'
                      : '/client'
                    : '/auth/signin'
                }
              >
                <button className="rounded-full bg-ds-primary px-5 py-2 text-sm font-semibold text-white hover:bg-ds-primary-hover transition-colors shadow-sm">
                  {session ? 'Mon espace' : 'Creer mon compte'}
                </button>
              </Link>
            </nav>

            <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_0.88fr] lg:gap-6">
              <div className="relative min-w-0">
                <h1 className="mb-8 text-4xl font-bold leading-[1.15] tracking-tight text-ds-strong sm:text-5xl lg:text-[56px]">
                  Creez votre societe{' '}
                  <span className="relative inline-block">
                    en toute simplicite
                    <svg
                      aria-hidden
                      className="absolute -bottom-1.5 left-0 h-3 w-full overflow-visible"
                      viewBox="0 0 100 12"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <pattern
                          id="hero-wave-ent"
                          width="16"
                          height="12"
                          patternUnits="userSpaceOnUse"
                        >
                          <path
                            d="M0 6 Q4 0 8 6 T16 6"
                            fill="none"
                            stroke="var(--color-primary)"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </pattern>
                      </defs>
                      <rect width="100" height="12" fill="url(#hero-wave-ent)" />
                    </svg>
                  </span>
                </h1>

                <p className="mb-10 max-w-[46ch] text-lg leading-7 text-ds-body">
                  Ada Papers vous guide pas a pas dans la constitution de votre societe : choix
                  de la forme juridique, redaction des statuts, fiches constitutives et depot des
                  pieces. SARL, SAS, SCI, SA au Senegal ou en France.
                </p>

                <div className="flex flex-wrap items-center gap-4">
                  <Link href="/dossiers/create?rubrique=constitution_societe">
                    <Button size="lg" className="shadow-md">
                      Demarrer ma constitution
                    </Button>
                  </Link>
                  <Link href="/auth/signup">
                    <Button variant="outline" size="lg">
                      Creer mon compte gratuit
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Visuel hero : composition de tuiles */}
              <div className="relative mx-auto w-full max-w-[460px] lg:mb-20 lg:max-w-none">
                <div className="relative mx-auto h-[360px] w-[300px] sm:h-[420px] sm:w-[360px] lg:h-[440px] lg:w-[380px]">
                  <div
                    aria-hidden
                    className="absolute left-4 top-4 h-full w-full rotate-[4deg] rounded-3xl bg-ds-primary-light"
                  />
                  <div className="absolute inset-0 -rotate-[3deg] overflow-hidden rounded-3xl bg-ds-secondary shadow-lg">
                    <svg className="h-full w-full" viewBox="0 0 380 440" aria-hidden>
                      {/* Grande tuile principale */}
                      <rect className="fill-ds-primary" x="24" y="24" width="200" height="200" rx="24" />
                      {/* Icone document */}
                      <text x="124" y="134" textAnchor="middle" fontSize="48" fill="white">
                        {'\u{1F4C4}'}
                      </text>
                      {/* Tuile haute droite */}
                      <rect className="fill-ds-strong" x="240" y="24" width="116" height="96" rx="16" />
                      {/* Tuile milieu droite */}
                      <rect className="fill-ds-primary-light" x="240" y="136" width="116" height="88" rx="16" />
                      {/* Tuile bas gauche */}
                      <rect className="fill-ds-primary-hover" x="24" y="240" width="96" height="176" rx="16" />
                      {/* Tuile bas centre */}
                      <rect className="fill-ds-primary-light" x="136" y="240" width="88" height="80" rx="12" />
                      {/* Tuile bas centre bas */}
                      <rect className="fill-ds-primary" x="136" y="336" width="88" height="80" rx="12" />
                      {/* Tuile bas droite */}
                      <rect className="fill-ds-primary" x="240" y="240" width="116" height="176" rx="16" />
                    </svg>
                  </div>

                  {/* Pastilles */}
                  <div className="absolute -right-9 top-[42%] hidden h-[72px] w-[72px] place-items-center rounded-full bg-ds-primary-hover shadow-md lg:grid">
                    <Building2 className="h-8 w-8 text-white" aria-hidden />
                  </div>
                  <div className="absolute -left-3 bottom-28 hidden h-11 w-11 place-items-center rounded-full bg-ds-primary-light shadow-md lg:grid">
                    <Check className="h-5 w-5 text-ds-strong" aria-hidden />
                  </div>

                  {/* Annotations */}
                  <p className="absolute -top-10 right-0 hidden max-w-[210px] -rotate-[4deg] text-right text-[15px] font-semibold leading-5 text-ds-strong lg:block">
                    SARL, SAS, SCI, SA au Senegal ou en France
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
                    Statuts prets en quelques jours
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
                    Parcours guide et personnalise
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section : Formes juridiques */}
      <section
        id="formes-section"
        data-animate
        onMouseEnter={() => setIsVisible((prev) => ({ ...prev, 'formes-section': true }))}
        className={`py-16 transition-all duration-1000 transform sm:py-20 ${
          isVisible['formes-section']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div
            className="mx-auto max-w-6xl"
            data-animate-item
            data-animate-id="formes-section-title"
          >
            <div
              className={`mb-10 transition-all duration-700 ${
                isVisible['formes-section-title']
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8'
              }`}
            >
              <Eyebrow>Formes juridiques</Eyebrow>
              <h2 className="mb-3 max-w-[22ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                Quelle forme pour votre projet ?
              </h2>
              <p className="max-w-[60ch] text-lg leading-7 text-ds-subtle">
                Choisissez une structure : les caracteristiques et le parcours s'affichent.
              </p>
            </div>

            <div className="grid items-start gap-8 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
              {/* Liste gauche */}
              <div
                className="grid gap-2 rounded-2xl border border-ds-border bg-ds-secondary p-2"
                role="tablist"
                aria-label="Formes juridiques"
              >
                {FORMES_JURIDIQUES.map((forme, index) => (
                  <button
                    key={forme.title}
                    type="button"
                    role="tab"
                    aria-selected={selectedFormeIndex === index}
                    onClick={() => setSelectedFormeIndex(index)}
                    onMouseEnter={() => setSelectedFormeIndex(index)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      selectedFormeIndex === index
                        ? 'border-ds-primary bg-ds-bg font-semibold text-ds-strong shadow-sm'
                        : 'border-transparent font-medium text-ds-body hover:border-ds-border hover:bg-ds-bg'
                    }`}
                  >
                    <span className="block text-sm font-bold">{forme.label}</span>
                    <span className="block text-xs text-ds-subtle">{forme.fullName}</span>
                  </button>
                ))}
              </div>

              {/* Detail droite */}
              <div className="rounded-2xl border border-ds-border bg-ds-elevated p-6 shadow-sm md:p-8">
                {(() => {
                  const current = FORMES_JURIDIQUES[selectedFormeIndex] || FORMES_JURIDIQUES[0];
                  return (
                    <div className="space-y-6">
                      <div>
                        <h3 className="mb-1 text-2xl font-bold text-ds-strong">
                          {current.fullName}
                        </h3>
                        <p className="text-sm font-semibold text-ds-primary mb-3">
                          {current.label}
                        </p>
                        <p className="text-base leading-6 text-ds-body">{current.description}</p>
                      </div>

                      <div className="grid gap-4 rounded-xl bg-ds-secondary p-4 text-sm sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ds-subtle">
                            Duree estimee
                          </p>
                          <p className="text-base font-semibold text-ds-strong">{current.duree}</p>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ds-subtle">
                            Tarif
                          </p>
                          <p className="text-base font-semibold text-ds-strong">{current.prix}</p>
                        </div>
                      </div>

                      <div>
                        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ds-subtle">
                          Caracteristiques cles
                        </p>
                        <ul className="grid gap-x-6 gap-y-3 text-sm text-ds-body sm:grid-cols-2">
                          {current.points.map((point) => (
                            <li key={point} className="flex gap-3 leading-5">
                              <Check
                                className="mt-0.5 h-4 w-4 flex-none text-ds-primary"
                                aria-hidden
                              />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex flex-wrap gap-3 border-t border-ds-border pt-6">
                        <Link href={current.ctaHref}>
                          <Button size="lg" className="min-w-[200px]">
                            Constituer une {current.label}
                          </Button>
                        </Link>
                        <Link href="/contact">
                          <Button variant="outline" size="lg">
                            Echanger sur mon projet
                          </Button>
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

      {/* Section : La plateforme */}
      <section
        id="plateforme-ent"
        data-animate
        onMouseEnter={() => setIsVisible((prev) => ({ ...prev, 'plateforme-ent': true }))}
        className={`border-y border-ds-border py-16 transition-all duration-1000 transform sm:py-20 ${
          isVisible['plateforme-ent']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div
            className="mx-auto max-w-6xl"
            data-animate-item
            data-animate-id="plateforme-ent-title"
          >
            <div
              className={`mb-8 transition-all duration-700 ${
                isVisible['plateforme-ent-title']
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8'
              }`}
            >
              <Eyebrow>La plateforme</Eyebrow>
              <h2 className="mb-3 max-w-[22ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                A quoi sert la plateforme
              </h2>
              <p className="max-w-[60ch] text-lg leading-7 text-ds-subtle">
                Des outils adaptes, que vous soyez createur ou professionnel accompagnant.
              </p>
            </div>

            <div
              className="mb-8 inline-flex flex-wrap gap-1 rounded-full border border-ds-border bg-ds-bg p-1"
              role="tablist"
              aria-label="Public concerne"
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
              const block =
                PLATEFORME_BLOCKS[hoveredPlateformeIndex ?? 0] ?? PLATEFORME_BLOCKS[0];
              return (
                <div
                  className={`grid gap-4 ${
                    block.points.length < 3 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'
                  }`}
                >
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

      {/* Section : Ce que nous ne faisons pas */}
      <section
        id="limites-ent"
        data-animate
        onMouseEnter={() => setIsVisible((prev) => ({ ...prev, 'limites-ent': true }))}
        className={`py-16 transition-all duration-1000 transform sm:py-20 ${
          isVisible['limites-ent']
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        <div className="container mx-auto px-4">
          <div
            className="mx-auto max-w-6xl"
            data-animate-item
            data-animate-id="limites-ent-title"
          >
            <div
              className={`mb-10 transition-all duration-700 ${
                isVisible['limites-ent-title']
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8'
              }`}
            >
              <Eyebrow>Perimetre</Eyebrow>
              <h2 className="mb-3 max-w-[22ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                Ce que nous ne faisons pas
              </h2>
              <p className="max-w-[60ch] text-lg leading-7 text-ds-subtle">
                Nos limites et le perimetre de nos services en creation d'entreprise.
              </p>
            </div>

            <div className="grid items-start gap-8 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
              <div
                className="grid gap-2 rounded-2xl border border-ds-border bg-ds-secondary p-2"
                role="tablist"
                aria-label="Limites"
              >
                {LIMITES.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    role="tab"
                    aria-selected={hoveredLimiteIndex === index}
                    onClick={() => setHoveredLimiteIndex(index)}
                    onMouseEnter={() => setHoveredLimiteIndex(index)}
                    onFocus={() => setHoveredLimiteIndex(index)}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      hoveredLimiteIndex === index
                        ? 'border-ds-primary bg-ds-bg font-semibold text-ds-strong shadow-sm'
                        : 'border-transparent font-medium text-ds-body hover:border-ds-border hover:bg-ds-bg'
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

      {/* Appel a l'action final */}
      <section id="cta-final-ent" className="py-16 sm:py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-6xl items-center gap-8 rounded-3xl border border-transparent bg-ds-primary-tint px-6 py-12 dark:border-ds-border sm:px-12 sm:py-16 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="mb-3 max-w-[18ch] text-3xl font-bold leading-tight tracking-tight text-ds-strong sm:text-4xl lg:text-[40px] lg:leading-[46px]">
                Pret a constituer votre societe ?
              </h2>
              <p className="max-w-[44ch] text-lg leading-7 text-ds-body">
                Creez votre compte et demarrez votre dossier de constitution en quelques minutes.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/dossiers/create?rubrique=constitution_societe">
                  <Button size="lg">Demarrer ma constitution</Button>
                </Link>
                <Link href="/contact">
                  <Button variant="outline" size="lg">
                    Contactez-nous
                  </Button>
                </Link>
              </div>
            </div>
            <svg
              className="hidden h-[180px] w-[220px] md:block"
              viewBox="0 0 220 180"
              aria-hidden
            >
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
    </div>
  );
}

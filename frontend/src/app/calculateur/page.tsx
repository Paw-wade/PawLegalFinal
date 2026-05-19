'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { userAPI } from '@/lib/api';
import { getProfilePhotoAbsoluteUrl } from '@/lib/profilePhoto';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';
import jsPDF from 'jspdf';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

function Input({ className = '', type, value, onChange, ...props }: any) {
  // Pour les champs de date, utiliser le composant DateInput qui garantit le format jour/mois/année
  if (type === 'date') {
    return (
      <DateInputComponent
        value={value || ''}
        onChange={(newValue) => {
          if (onChange) {
            // Créer un événement synthétique pour maintenir la compatibilité
            const syntheticEvent = {
              target: { value: newValue },
              currentTarget: { value: newValue }
            } as React.ChangeEvent<HTMLInputElement>;
            onChange(syntheticEvent);
          }
        }}
        className={`flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
    );
  }
  
  return (
    <input
      type={type}
      className={`flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function Label({ className = '', children, ...props }: any) {
  return (
    <label className={`text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block ${className}`} {...props}>
      {children}
    </label>
  );
}

function Select({ className = '', children, ...props }: any) {
  return (
    <select
      className={`flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

// Types de titres de séjour
const typesTitres = [
  { value: 'etudiant', label: 'Étudiant' },
  { value: 'salarie', label: 'Salarié' },
  { value: 'vie_privee_familiale', label: 'Vie privée et familiale' },
  { value: 'visiteur', label: 'Visiteur' },
  { value: 'talent', label: 'Passeport Talent' },
  { value: 'commercant', label: 'Commerçant / Artisan' },
  { value: 'retraite', label: 'Retraité' },
  { value: 'resident', label: 'Carte de résident (10 ans)' },
  { value: 'autre', label: 'Autre' },
];

// Structure hiérarchisée des titres de séjour selon le CESEDA
interface TypeTitrePrecis {
  value: string;
  label: string;
}

interface SousCategorie {
  value: string;
  label: string;
  types: TypeTitrePrecis[];
}

interface MotifTitre {
  value: string;
  label: string;
  sousCategories: SousCategorie[];
}

const titresSejourHierarchiques: MotifTitre[] = [
  {
    value: 'professionnel',
    label: 'Titres de séjour pour motif professionnel',
    sousCategories: [
      {
        value: 'activite_salariee_standard',
        label: 'Activité salariée standard',
        types: [
          { value: 'salarie', label: 'Salarié' },
          { value: 'travailleur_temporaire', label: 'Travailleur temporaire' }
        ]
      },
      {
        value: 'activite_non_salariee',
        label: 'Activité non salariée',
        types: [
          { value: 'entrepreneur_profession_liberale', label: 'Entrepreneur / Profession libérale' }
        ]
      },
      {
        value: 'beneficiaires_mention_talent',
        label: 'Bénéficiaires de la mention « Talent »',
        types: [
          { value: 'talent_salarie_qualifie', label: 'Talent-salarié qualifié' },
          { value: 'talent_carte_bleue_europeenne', label: 'Talent-carte bleue européenne' },
          { value: 'talent_profession_medicale_pharmacie', label: 'Talent-profession médicale et de la pharmacie' },
          { value: 'talent_chercheur', label: 'Talent-chercheur' },
          { value: 'talent_porteur_projet', label: 'Talent-porteur de projet' },
          { value: 'talent_categories_diverses', label: 'Talent (catégories diverses)' },
          { value: 'talent_famille', label: 'Talent (famille)' }
        ]
      },
      {
        value: 'detachement_temporaire_ict',
        label: 'Détachement temporaire intragroupe (ICT)',
        types: [
          { value: 'salarie_detache_ict', label: 'Salarié détaché ICT' },
          { value: 'salarie_mobile_ict', label: 'Salarié mobile ICT' },
          { value: 'stagiaire_ict', label: 'Stagiaire ICT' },
          { value: 'stagiaire_mobile_ict', label: 'Stagiaire mobile ICT' },
          { value: 'ict_famille', label: 'ICT (famille)' }
        ]
      },
      {
        value: 'travailleur_saisonnier',
        label: 'Travailleur saisonnier',
        types: [
          { value: 'travailleur_saisonnier', label: 'Travailleur saisonnier' }
        ]
      }
    ]
  },
  {
    value: 'etudes',
    label: 'Titres de séjour pour motif d\'études',
    sousCategories: [
      {
        value: 'etudiant',
        label: 'Étudiant',
        types: [
          { value: 'etudiant', label: 'Étudiant' }
        ]
      },
      {
        value: 'etudiant_programme_mobilite',
        label: 'Étudiant-programme de mobilité',
        types: [
          { value: 'etudiant_programme_mobilite', label: 'Étudiant-programme de mobilité' }
        ]
      },
      {
        value: 'post_etudes',
        label: 'Post-études',
        types: [
          { value: 'recherche_emploi_creation_entreprise_rec', label: 'Recherche d\'emploi ou création d\'entreprise (REC)' }
        ]
      }
    ]
  },
  {
    value: 'familial',
    label: 'Titres de séjour pour motif familial (« Vie privée et familiale »)',
    sousCategories: [
      {
        value: 'liens_ressortissant_francais',
        label: 'Liens avec un ressortissant français',
        types: [
          { value: 'conjoint_francais', label: 'Conjoint de Français' },
          { value: 'parent_enfant_francais_mineur', label: 'Parent d\'enfant français mineur résidant en France' },
          { value: 'enfant_etranger_francais_18_21_charge', label: 'Enfant étranger d\'un Français (18 à 21 ans ou à charge)' }
        ]
      },
      {
        value: 'regroupement_familial',
        label: 'Regroupement familial',
        types: [
          { value: 'conjoint_etranger_titulaire_titre', label: 'Conjoint d\'un étranger titulaire d\'un titre de séjour' },
          { value: 'enfant_etranger_titulaire_titre', label: 'Enfant d\'un étranger titulaire d\'un titre de séjour' }
        ]
      },
      {
        value: 'parcours_personnel_france',
        label: 'Parcours personnel en France',
        types: [
          { value: 'etranger_ne_france', label: 'Étranger né en France' },
          { value: 'etranger_residant_france_depuis_13_ans', label: 'Étranger résidant en France depuis l\'âge de 13 ans' },
          { value: 'etranger_confie_ase_avant_16_ans', label: 'Étranger confié à l\'aide sociale à l\'enfance (ASE) avant ses 16 ans' },
          { value: 'liens_personnels_familiaux_intenses', label: 'Liens personnels et familiaux intenses' }
        ]
      }
    ]
  },
  {
    value: 'protection_internationale',
    label: 'Titres liés à la protection internationale',
    sousCategories: [
      {
        value: 'refugies',
        label: 'Réfugiés',
        types: [
          { value: 'refugie', label: 'Réfugié' }
        ]
      },
      {
        value: 'beneficiaires_protection_subsidiaire',
        label: 'Bénéficiaires de la protection subsidiaire',
        types: [
          { value: 'beneficiaire_protection_subsidiaire', label: 'Bénéficiaire de la protection subsidiaire' }
        ]
      },
      {
        value: 'apatrides',
        label: 'Apatrides',
        types: [
          { value: 'apatride', label: 'Apatride' }
        ]
      }
    ]
  },
  {
    value: 'humanitaire',
    label: 'Titres de séjour pour motif humanitaire',
    sousCategories: [
      {
        value: 'victimes_protection_personnes',
        label: 'Victimes et protection des personnes',
        types: [
          { value: 'victime_traite_proxenetisme', label: 'Victime de traite des êtres humains ou de proxénétisme' },
          { value: 'personne_parcours_sortie_prostitution_aps', label: 'Personne engagée dans un parcours de sortie de la prostitution (APS)' },
          { value: 'beneficiaire_ordonnance_protection', label: 'Bénéficiaire d\'une ordonnance de protection' },
          { value: 'victime_hebergement_incompatible_dignite', label: 'Victime d\'hébergement incompatible avec la dignité humaine' }
        ]
      },
      {
        value: 'sante',
        label: 'Santé',
        types: [
          { value: 'etranger_malade', label: 'Étranger malade' },
          { value: 'parent_enfant_mineur_malade_aps', label: 'Parent d\'enfant mineur malade (APS)' }
        ]
      }
    ]
  },
  {
    value: 'autres_motifs',
    label: 'Titres délivrés pour d\'autres motifs',
    sousCategories: [
      {
        value: 'installation_durable',
        label: 'Installation durable',
        types: [
          { value: 'resident_longue_duree_ue', label: 'Résident de longue durée-UE' },
          { value: 'resident_permanent', label: 'Résident permanent' }
        ]
      },
      {
        value: 'situation_specifique',
        label: 'Situation spécifique',
        types: [
          { value: 'visiteur', label: 'Visiteur' },
          { value: 'retraite', label: 'Retraité' },
          { value: 'jeune_au_pair', label: 'Jeune au pair' },
          { value: 'volontariat', label: 'Volontariat' },
          { value: 'stagiaire', label: 'Stagiaire' },
          { value: 'anciens_combattants', label: 'Anciens combattants' },
          { value: 'titulaire_rente', label: 'Titulaire d\'une rente' }
        ]
      }
    ]
  }
];

// Types de décisions défavorables (hors visa)
// Types de décisions défavorables (hors visa) – utilisé pour la logique "Demande de titre"
const typesDecisions = [
  {
    value: 'absence_reponse',
    label: 'Je n’ai pas reçu de réponse à ma demande',
  },
  {
    value: 'refus_titre',
    label: 'J’ai reçu un refus de titre de séjour',
  },
  {
    value: 'refus_enregistrement',
    label: 'J’ai un refus d’enregistrement de ma demande',
  },
  {
    value: 'oqtf',
    label: 'J’ai reçu une OQTF (Obligation de quitter le territoire)',
  },
];

// Types de titres pour la logique "Demande de titre de séjour et recours"
const titresSejourDemande = [
  {
    value: 'talent_carte_bleue',
    label: 'Talent carte bleue européenne',
    delaiDirJours: 90,
    article: 'R.421-23',
  },
  {
    value: 'salarie_detache_ict',
    label: 'Salarié détaché ICT',
    delaiDirJours: 90,
    article: 'R.421-43',
  },
  {
    value: 'salarie_detache_mobile_ict',
    label: 'Salarié détaché mobile ICT',
    delaiDirJours: 90,
    article: 'R.421-47',
  },
  {
    value: 'stagiaire_mobile_ict',
    label: 'Stagiaire mobile ICT',
    delaiDirJours: 90,
    article: 'R.421-54',
  },
  {
    value: 'travailleur_saisonnier',
    label: 'Travailleur saisonnier',
    delaiDirJours: 90,
    article: 'R.421-60',
  },
  {
    value: 'etudiant',
    label: 'Étudiant / étudiant mobilité',
    delaiDirJours: 90,
    article: 'R.422-5',
  },
  {
    value: 'recherche_emploi',
    label: 'Recherche d’emploi ou création d’entreprise',
    delaiDirJours: 90,
    article: 'R.422-12',
  },
  {
    value: 'jeune_au_pair',
    label: 'Jeune au pair',
    delaiDirJours: 90,
    article: 'R.426-14',
  },
  {
    value: 'stagiaire_classique',
    label: 'Stagiaire',
    delaiDirJours: 90,
    article: 'R.426-17',
  },
  {
    value: 'talent_chercheur',
    label: 'Talent-chercheur',
    delaiDirJours: 60,
    article: 'R.421-26',
  },
  {
    value: 'talent_chercheur_mobilite',
    label: 'Talent-chercheur-programme de mobilité',
    delaiDirJours: 60,
    article: 'R.421-26',
  },
  {
    value: 'autres',
    label: 'Autres titres de séjour',
    delaiDirJours: 120, // 4 mois
    article: 'R.432-2',
  },
];

// Types de visas
const typesVisas = [
  { value: 'visa_court_sejour', label: 'Visa de court séjour (Schengen)' },
  { value: 'visa_long_sejour', label: 'Visa de long séjour' },
  { value: 'visa_transit', label: 'Visa de transit' },
  { value: 'visa_etudiant', label: 'Visa étudiant' },
  { value: 'visa_travailleur', label: 'Visa travailleur' },
  { value: 'visa_familial', label: 'Visa vie privée et familiale' },
  { value: 'visa_talent', label: 'Visa Passeport Talent' },
  { value: 'autre', label: 'Autre type de visa' },
];

// Informations sur les titres
const infosTitres: Record<string, any> = {
  etudiant: {
    description: 'Titre de séjour pour les étudiants étrangers inscrits dans un établissement d\'enseignement supérieur en France.',
    duree: [1, 2],
    conditions: [
      'Inscription dans un établissement d\'enseignement supérieur reconnu',
      'Justificatifs de ressources suffisantes',
      'Assurance maladie',
      'Justificatif de logement'
    ],
    documents: [
      'Passeport en cours de validité',
      'Justificatif d\'inscription',
      'Justificatifs de ressources',
      'Assurance maladie',
      'Justificatif de logement'
    ],
    delaiRenouvellement: { min: 2, max: 4 },
    delaiPremiereDemande: 2
  },
  salarie: {
    description: 'Titre de séjour pour les salariés étrangers ayant un contrat de travail en France.',
    duree: [1, 4],
    conditions: [
      'Contrat de travail d\'au moins 12 mois',
      'Salaire au moins égal au SMIC',
      'Autorisation de travail (si nécessaire)'
    ],
    documents: [
      'Passeport en cours de validité',
      'Contrat de travail',
      'Fiches de paie',
      'Justificatif de logement'
    ],
    delaiRenouvellement: { min: 2, max: 4 },
    delaiPremiereDemande: 2
  },
  vie_privee_familiale: {
    description: 'Titre de séjour pour les personnes ayant des liens familiaux en France (conjoint, parent d\'enfant français, etc.).',
    duree: [1, 10],
    conditions: [
      'Lien familial avec un Français ou un résident',
      'Justificatifs de vie commune',
      'Ressources suffisantes'
    ],
    documents: [
      'Passeport en cours de validité',
      'Acte de mariage / livret de famille',
      'Justificatifs de vie commune',
      'Justificatifs de ressources'
    ],
    delaiRenouvellement: { min: 2, max: 4 },
    delaiPremiereDemande: 2
  },
  visiteur: {
    description: 'Titre de séjour pour les personnes qui souhaitent séjourner en France sans exercer d\'activité professionnelle.',
    duree: [1],
    conditions: [
      'Ressources suffisantes et stables',
      'Assurance maladie',
      'Justificatif de logement'
    ],
    documents: [
      'Passeport en cours de validité',
      'Justificatifs de ressources',
      'Assurance maladie',
      'Justificatif de logement'
    ],
    delaiRenouvellement: { min: 2, max: 4 },
    delaiPremiereDemande: 2
  },
  talent: {
    description: 'Passeport Talent pour les personnes hautement qualifiées, investisseurs, artistes, chercheurs, etc.',
    duree: [1, 4],
    conditions: [
      'Compétences reconnues dans un domaine spécifique',
      'Projet professionnel validé',
      'Ressources suffisantes'
    ],
    documents: [
      'Passeport en cours de validité',
      'Diplômes et qualifications',
      'Contrat de travail ou projet professionnel',
      'Justificatifs de ressources'
    ],
    delaiRenouvellement: { min: 2, max: 4 },
    delaiPremiereDemande: 2
  },
  resident: {
    description: 'Carte de résident de 10 ans, titre de séjour permanent pour les personnes ayant résidé légalement en France pendant plusieurs années.',
    duree: [10],
    conditions: [
      'Résidence légale et continue en France',
      'Intégration républicaine',
      'Ressources suffisantes'
    ],
    documents: [
      'Passeport en cours de validité',
      'Titres de séjour précédents',
      'Justificatifs de résidence',
      'Justificatifs de ressources'
    ],
    delaiRenouvellement: { min: 2, max: 4 },
    delaiPremiereDemande: 2
  }
};

export default function CalculateurPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [joursRestants, setJoursRestants] = useState<number | null>(null);
  const [heuresRestantes, setHeuresRestantes] = useState<number>(0);
  const [minutesRestantes, setMinutesRestantes] = useState<number>(0);
  const [secondesRestantes, setSecondesRestantes] = useState<number>(0);
  const isAuthenticated = status === 'authenticated' && !!session;
  
  // États pour gérer l'ouverture/fermeture des sections (accordéon)
  const [isPersonalInfoOpen, setIsPersonalInfoOpen] = useState<boolean>(true);
  const [isAdminInfoOpen, setIsAdminInfoOpen] = useState<boolean>(true);
  
  // Vérifier le rôle de l'utilisateur
  const userRole = (session?.user as any)?.role || userProfile?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const isPartenaire = userRole === 'partenaire';
  const isClient = userRole === 'client';

  // Pour les comptes client : on ne redirige plus automatiquement si le profil n'est pas complété,
  // pour laisser la page du calculateur visible même sans connexion ou profil complet.

  // Fonction de déconnexion
  const handleSignOut = async () => {
    if (typeof window === 'undefined') return;
    
    // Nettoyer complètement l'état de l'utilisateur
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    setUserProfile(null);
    
    // Si on a une session NextAuth, la déconnecter
    if (session) {
      try {
        await signOut({ redirect: false });
      } catch (error) {
        console.warn('Erreur lors de la déconnexion NextAuth:', error);
      }
    }
    
    // Rediriger immédiatement vers la page d'accueil
    window.location.href = '/';
  };
  
  // Fonction pour obtenir la date du jour au format YYYY-MM-DD
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    typeTitre: '',
    typeTitreAutre: '', // Valeur personnalisée si "Autre" est sélectionné
    // Champs hiérarchisés pour le type de titre de séjour selon CESEDA
    motifTitreSejour: '', // Motif de délivrance (niveau 1)
    sousCategorieTitreSejour: '', // Sous-catégorie (niveau 2)
    typePrecisTitreSejour: '', // Type précis (niveau 3)
    typeDemande: 'premiere', // 'premiere' ou 'renouvellement'
    prefecture: '',
    dateDelivrance: getTodayDate(),
    dateExpiration: getTodayDate(),
    dateDecision: getTodayDate(),
    natureDecision: '',
    dureeTitre: '',
    situation: 'demande',
    dateAttributionTitre: '', // Date d'attribution du titre ou du visa
    dateExpirationTitre: '', // Date d'expiration du titre ou du visa
    dateFinValiditeTitreActuel: '', // Date de fin de validité du titre actuel ou du visa
    // Champs pour renouvellement détaillé
    renouvellementDepose: null as boolean | null, // null = pas encore demandé, true = oui, false = non
    confirmationDepotRenouvellement: null as boolean | null, // null = pas encore demandé, true = oui, false = non
    dateConfirmationDepotRenouvellement: '', // Date de confirmation du dépôt de renouvellement
    // Champs pour recours visa
    natureVisa: '', // Nature du visa
    consulatDepot: '', // Consulat du dépôt
    dateConfirmationDepot: '', // Date de confirmation du dépôt
    typeRefusVisa: '', // 'explicite' ou 'implicite'
    dateNotificationRefus: '', // Date de notification du refus (si explicite)
    dateDepotRapo: '', // Date de dépôt du RAPO
    reponseRapoRecue: false, // Case à cocher "J'ai reçu une réponse à mon RAPO"
    dateReponseRapo: '', // Date de réponse RAPO
    demandeCommunicationMotifs: false, // Case à cocher pour demande de communication des motifs
    dateDemandeMotifs: '', // Date de demande de communication des motifs
    dateReceptionMotifs: '', // Date de réception des motifs
    actionApresRapo: '', // 'saisir_tribunal' ou 'demander_motifs'
    rapoDepose: null as boolean | null, // null = pas encore demandé, true = oui, false = non
    // Champs pour "Demande de titre de séjour et recours"
    typeTitreDemande: '',
    dateFinValiditeTitreDemande: '',
    natureDecisionDemande: '',
    dateConfirmationDepotDemande: '',
    dateNotificationRefusDemande: ''
  });

  const [dateErrors, setDateErrors] = useState<{ [key: string]: string }>({});

  const [calculs, setCalculs] = useState<any>(null);
  /** Bloc bleu « Situation de votre titre de séjour » : replié quand saisie complète + résultats (R.431-5) visibles */
  const [isSituationTitreBlocExpanded, setIsSituationTitreBlocExpanded] = useState(true);
  const situationTitreBothPrevRef = useRef(false);

  // Référence pour suivre la valeur précédente de dateFinValiditeTitreActuel
  const prevDateFinValiditeRef = useRef<string>('');
  // Référence pour scroll vers la timeline "absence de réponse" quand elle s'affiche
  const timelineAbsenceReponseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    calculerDelais();
    validateDates();
  }, [formData]);

  // Replier automatiquement le formulaire « titre de séjour » dès que type + date sont saisis (résultats affichés en dessous)
  useEffect(() => {
    if (formData.situation !== 'demande') {
      situationTitreBothPrevRef.current = false;
      return;
    }
    const d = formData.dateFinValiditeTitreDemande;
    const t = formData.typeTitreDemande;
    const dateOk = !!(d && !isNaN(new Date(d).getTime()));
    const both = !!(t && dateOk);

    if (!both) {
      setIsSituationTitreBlocExpanded(true);
      situationTitreBothPrevRef.current = false;
      return;
    }

    if (!situationTitreBothPrevRef.current) {
      setIsSituationTitreBlocExpanded(false);
    }
    situationTitreBothPrevRef.current = true;
  }, [formData.situation, formData.dateFinValiditeTitreDemande, formData.typeTitreDemande]);

  // Réinitialiser les champs de renouvellement quand la date de fin de validité change
  useEffect(() => {
    if (formData.dateFinValiditeTitreActuel && formData.dateFinValiditeTitreActuel !== prevDateFinValiditeRef.current) {
      prevDateFinValiditeRef.current = formData.dateFinValiditeTitreActuel;
      setFormData(prev => ({
        ...prev,
        renouvellementDepose: null,
        confirmationDepotRenouvellement: null,
        dateConfirmationDepotRenouvellement: ''
      }));
    }
  }, [formData.dateFinValiditeTitreActuel]);

  // Scroll vers la timeline "absence de réponse" quand l'utilisateur sélectionne cette option
  useEffect(() => {
    if (formData.natureDecisionDemande === 'absence_reponse' && formData.dateConfirmationDepotDemande && timelineAbsenceReponseRef.current) {
      timelineAbsenceReponseRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [formData.natureDecisionDemande, formData.dateConfirmationDepotDemande]);

  const validateDates = () => {
    const errors: { [key: string]: string } = {};
    
    // Valider que date d'expiration >= date d'attribution
    if (formData.dateAttributionTitre && formData.dateExpirationTitre) {
      const dateAttribution = new Date(formData.dateAttributionTitre);
      const dateExpiration = new Date(formData.dateExpirationTitre);
      
      if (dateExpiration < dateAttribution) {
        errors.dateExpirationTitre = 'La date d\'expiration doit être postérieure à la date d\'attribution';
      }
    }
    
    // Valider que date d'expiration du titre actuel >= date de délivrance (pour renouvellement)
    if (formData.dateDelivrance && formData.dateExpiration && formData.typeDemande === 'renouvellement') {
      const dateDelivrance = new Date(formData.dateDelivrance);
      const dateExpiration = new Date(formData.dateExpiration);
      
      if (dateExpiration < dateDelivrance) {
        errors.dateExpiration = 'La date d\'expiration doit être postérieure à la date de délivrance';
      }
    }

    // Date d'introduction de la demande complète : ne peut pas être au-delà du jour
    if (formData.dateConfirmationDepotDemande) {
      const dateIntro = new Date(formData.dateConfirmationDepotDemande);
      const aujourdhui = new Date();
      aujourdhui.setHours(0, 0, 0, 0);
      dateIntro.setHours(0, 0, 0, 0);
      if (!isNaN(dateIntro.getTime()) && dateIntro.getTime() > aujourdhui.getTime()) {
        errors.dateConfirmationDepotDemande = 'Cette date ne peut pas être postérieure à la date du jour';
      }
    }

    setDateErrors(errors);
  };

  useEffect(() => {
    if (status === 'authenticated' && session) {
      loadUserProfile();
    }
  }, [session, status]);

  // Recharger le profil lorsque l'utilisateur revient sur la page (après modification)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocus = () => {
      if (status === 'authenticated' && session) {
        loadUserProfile();
      }
    };

    // Recharger quand la fenêtre reprend le focus (utilisateur revient de la page de modification)
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [session, status]);

  // Minuteur dynamique pour le temps restant avant expiration
  useEffect(() => {
    if (!userProfile?.dateExpiration) {
      setJoursRestants(null);
      return;
    }

    const updateTimer = () => {
      const expiration = new Date(userProfile.dateExpiration);
      const maintenant = new Date();
      const difference = expiration.getTime() - maintenant.getTime();

      if (difference <= 0) {
        setJoursRestants(0);
        setHeuresRestantes(0);
        setMinutesRestantes(0);
        setSecondesRestantes(0);
        return;
      }

      const jours = Math.floor(difference / (1000 * 60 * 60 * 24));
      const heures = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const secondes = Math.floor((difference % (1000 * 60)) / 1000);

      setJoursRestants(jours);
      setHeuresRestantes(heures);
      setMinutesRestantes(minutes);
      setSecondesRestantes(secondes);
    };

    // Mettre à jour immédiatement
    updateTimer();

    // Mettre à jour toutes les secondes
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [userProfile?.dateExpiration]);

  // Préremplir les champs lorsque la situation change, si les champs sont vides
  useEffect(() => {
    if (userProfile && formData.situation) {
      const formatDate = (date: any) => {
        if (!date) return '';
        try {
          return new Date(date).toISOString().split('T')[0];
        } catch {
          return '';
        }
      };

      const dateDelivranceFormatted = formatDate(userProfile.dateDelivrance);
      const dateExpirationFormatted = formatDate(userProfile.dateExpiration);

      // Préremplir seulement si les champs sont vides ou contiennent la date par défaut
      setFormData(prev => {
        const updates: any = {};
        
        // Type de titre (préremplir seulement si vide)
        if (!prev.typeTitre && userProfile.typeTitre) {
          updates.typeTitre = userProfile.typeTitre;
        }
        
        // Dates d'attribution et d'expiration (préremplir seulement si vides)
        if (!prev.dateAttributionTitre && dateDelivranceFormatted) {
          updates.dateAttributionTitre = dateDelivranceFormatted;
        }
        if (!prev.dateExpirationTitre && dateExpirationFormatted) {
          updates.dateExpirationTitre = dateExpirationFormatted;
        }
        
        // Dates de délivrance et d'expiration (préremplir seulement si vides ou contiennent la date par défaut)
        if ((!prev.dateDelivrance || prev.dateDelivrance === getTodayDate()) && dateDelivranceFormatted) {
          updates.dateDelivrance = dateDelivranceFormatted;
        }
        if ((!prev.dateExpiration || prev.dateExpiration === getTodayDate()) && dateExpirationFormatted) {
          updates.dateExpiration = dateExpirationFormatted;
        }
        
        // Préfecture (préremplir seulement si vide)
        if (!prev.prefecture && userProfile.prefecture) {
          updates.prefecture = userProfile.prefecture;
        }
        
        // Retourner les mises à jour seulement s'il y en a
        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
      });
    }
  }, [formData.situation, userProfile]);

  const loadUserProfile = async () => {
    setIsLoadingProfile(true);
    try {
      // S'assurer que le token est disponible
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token && session && (session.user as any)?.accessToken) {
          localStorage.setItem('token', (session.user as any).accessToken);
        }
      }

      const response = await userAPI.getProfile();
      if (response.data.success) {
          const user = response.data.user;
        setUserProfile(user);
        
        // Préremplir tous les formulaires avec les informations du profil pour tous les utilisateurs connectés
        if (user) {
          // Convertir les dates au format YYYY-MM-DD
          const formatDate = (date: any) => {
            if (!date) return '';
            try {
              return new Date(date).toISOString().split('T')[0];
            } catch {
              return '';
            }
          };

          const dateDelivranceFormatted = formatDate(user.dateDelivrance);
          const dateExpirationFormatted = formatDate(user.dateExpiration);

          // Pour les clients uniquement, préremplir automatiquement avec leurs informations de titre de séjour
          const isClientUser = (user.role === 'client' || !user.role);

          setFormData(prev => ({
            ...prev,
            // Informations générales (préremplir seulement si vide)
            prefecture: prev.prefecture || user.prefecture || '',
            // Type de titre de séjour (préremplir seulement si vide)
            typeTitre: prev.typeTitre || user.typeTitre || '',
            // Dates pour tous les formulaires (dépôt, recours titre, recours visa)
            // Préremplir seulement si le champ est vide ou contient la date par défaut (aujourd'hui)
            dateDelivrance: (prev.dateDelivrance && prev.dateDelivrance !== getTodayDate()) ? prev.dateDelivrance : (dateDelivranceFormatted || prev.dateDelivrance),
            dateExpiration: (prev.dateExpiration && prev.dateExpiration !== getTodayDate()) ? prev.dateExpiration : (dateExpirationFormatted || prev.dateExpiration),
            // Dates d'attribution et d'expiration du titre (utilisées dans tous les formulaires)
            dateAttributionTitre: prev.dateAttributionTitre || dateDelivranceFormatted || prev.dateAttributionTitre,
            dateExpirationTitre: prev.dateExpirationTitre || dateExpirationFormatted || prev.dateExpirationTitre,
            // Pour les clients uniquement, préremplir dateFinValiditeTitreActuel et dateFinValiditeTitreDemande depuis leur profil
            dateFinValiditeTitreActuel: isClientUser && !prev.dateFinValiditeTitreActuel 
              ? (dateExpirationFormatted || prev.dateFinValiditeTitreActuel)
              : prev.dateFinValiditeTitreActuel,
            dateFinValiditeTitreDemande: isClientUser && !prev.dateFinValiditeTitreDemande
              ? (dateExpirationFormatted || prev.dateFinValiditeTitreDemande)
              : prev.dateFinValiditeTitreDemande,
          }));
        }
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement du profil:', err);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const calculerDelais = () => {
    // Calcul spécifique pour recours contre refus de visa
    if (formData.situation === 'contentieux_visa' && formData.dateConfirmationDepot) {
      const aujourdhui = new Date();
      const dateConfirmationDepot = new Date(formData.dateConfirmationDepot);
      
      // Calculer la date limite (4 mois après le dépôt)
      const dateLimite4Mois = new Date(dateConfirmationDepot);
      dateLimite4Mois.setMonth(dateLimite4Mois.getMonth() + 4);
      
      // Vérifier si plus de 4 mois se sont écoulés
      const plusDe4Mois = aujourdhui > dateLimite4Mois;
      const joursDepuis4Mois = Math.ceil((aujourdhui.getTime() - dateLimite4Mois.getTime()) / (1000 * 60 * 60 * 24));
      
      // Si plus de 4 mois se sont écoulés
      if (plusDe4Mois) {
        // Si un RAPO a été déposé (dateDepotRapo remplie), on continue avec le calcul normal
        if (formData.dateDepotRapo) {
          // Continuer avec le calcul normal ci-dessous
        }
        // Si aucun RAPO n'a été déposé, afficher le message d'information
        else if (!formData.typeRefusVisa) {
          setCalculs({
            type: 'contentieux_visa',
            demandeRapo: true,
            message: `Plus de 4 mois se sont écoulés depuis la date de confirmation du dépôt (${joursDepuis4Mois} jour(s) de retard). En principe, aucun recours n'est plus possible après ce délai.`,
            dateConfirmationDepot: dateConfirmationDepot,
            dateLimite4Mois: dateLimite4Mois,
            joursDepuis4Mois: joursDepuis4Mois
          });
          return;
        }
      }
      
      // Si pas de type de refus sélectionné, ne pas calculer
      if (!formData.typeRefusVisa) {
        setCalculs(null);
        return;
      }
      
      let dateRefus: Date;
      let dateRejetImplicite: Date | null = null;
      
      // Calculer la date de refus selon le type
      if (formData.typeRefusVisa === 'explicite' && formData.dateNotificationRefus) {
        dateRefus = new Date(formData.dateNotificationRefus);
      } else if (formData.typeRefusVisa === 'implicite') {
        // Refus implicite = date_confirmation_depot + 4 mois
        dateRejetImplicite = new Date(dateConfirmationDepot);
        dateRejetImplicite.setMonth(dateRejetImplicite.getMonth() + 4);
        dateRefus = dateRejetImplicite;
      } else {
        setCalculs(null);
        return;
      }
      
      // Calcul RAPO (seulement si aucun RAPO n'a été déposé)
      let dateDebutRapo: Date | null = null;
      let dateLimiteRapo: Date | null = null;
      let joursRestantsRapo: number | null = null;
      let rapoDansDelais: boolean | null = null;
      
      // Ne calculer le délai RAPO que si aucun RAPO n'a été déposé
      if (!formData.dateDepotRapo) {
        dateDebutRapo = new Date(dateRefus);
        dateDebutRapo.setDate(dateDebutRapo.getDate() + 1);
        
        dateLimiteRapo = new Date(dateRefus);
        dateLimiteRapo.setDate(dateLimiteRapo.getDate() + 30);
        
        joursRestantsRapo = Math.ceil((dateLimiteRapo.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
        rapoDansDelais = joursRestantsRapo > 0;
      }
      
      // Timeline
      const timeline: any[] = [
        { label: 'Date de confirmation du dépôt', date: dateConfirmationDepot, type: 'depot' },
        { label: formData.typeRefusVisa === 'implicite' ? 'Naissance du refus implicite' : 'Date de notification du refus', date: dateRefus, type: 'refus' },
      ];
      
      // Ajouter les dates RAPO seulement si aucun RAPO n'a été déposé
      if (dateDebutRapo && dateLimiteRapo) {
        timeline.push({ label: 'Début possible du RAPO', date: dateDebutRapo, type: 'rapo_debut' });
        timeline.push({ label: 'Date limite du RAPO', date: dateLimiteRapo, type: 'rapo_limite', urgent: joursRestantsRapo !== null && joursRestantsRapo <= 7 });
      }
      
      let dateLimiteReponseCommission: Date | null = null;
      let dateDebutTribunal: Date | null = null;
      let dateFinTribunal: Date | null = null;
      let dateLimiteMotifs: Date | null = null;
      let joursRestantsCommission: number | undefined = undefined;
      
      // Si RAPO déposé
      if (formData.dateDepotRapo) {
        const dateDepotRapo = new Date(formData.dateDepotRapo);
        dateLimiteReponseCommission = new Date(dateDepotRapo);
        dateLimiteReponseCommission.setMonth(dateLimiteReponseCommission.getMonth() + 2);
        
        joursRestantsCommission = Math.ceil((dateLimiteReponseCommission.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
        
        timeline.push({ label: 'Date de dépôt du RAPO', date: dateDepotRapo, type: 'rapo_depot' });
        timeline.push({ label: 'Date limite de réponse de la commission', date: dateLimiteReponseCommission, type: 'commission_limite' });
        
        // Si réponse reçue
        if (formData.dateReponseRapo) {
          const dateReponseRapo = new Date(formData.dateReponseRapo);
          dateDebutTribunal = new Date(dateReponseRapo);
          dateDebutTribunal.setDate(dateDebutTribunal.getDate() + 1);
          
          dateFinTribunal = new Date(dateReponseRapo);
          dateFinTribunal.setMonth(dateFinTribunal.getMonth() + 2);
          
          timeline.push({ label: 'Date de réponse du RAPO', date: dateReponseRapo, type: 'rapo_reponse' });
          timeline.push({ label: 'Début possible du recours tribunal', date: dateDebutTribunal, type: 'tribunal_debut' });
          timeline.push({ label: 'Date limite du recours tribunal', date: dateFinTribunal, type: 'tribunal_limite', urgent: true });
        } else if (formData.actionApresRapo === 'saisir_tribunal' && dateLimiteReponseCommission) {
          // Pas de réponse, saisir tribunal
          dateDebutTribunal = new Date(dateLimiteReponseCommission);
          dateDebutTribunal.setDate(dateDebutTribunal.getDate() + 1);
          
          dateFinTribunal = new Date(dateLimiteReponseCommission);
          dateFinTribunal.setMonth(dateFinTribunal.getMonth() + 2);
          
          timeline.push({ label: 'Début possible du recours tribunal (pas de réponse)', date: dateDebutTribunal, type: 'tribunal_debut' });
          timeline.push({ label: 'Date limite du recours tribunal', date: dateFinTribunal, type: 'tribunal_limite', urgent: true });
        }
      }
      
      // Communication des motifs
      if (formData.demandeCommunicationMotifs || formData.actionApresRapo === 'demander_motifs') {
        if (formData.dateDemandeMotifs) {
          const dateDemandeMotifs = new Date(formData.dateDemandeMotifs);
          dateLimiteMotifs = new Date(dateDemandeMotifs);
          dateLimiteMotifs.setMonth(dateLimiteMotifs.getMonth() + 1);
          
          timeline.push({ label: 'Date de demande de communication des motifs', date: dateDemandeMotifs, type: 'demande_motifs' });
          timeline.push({ label: 'Date limite de réponse (motifs)', date: dateLimiteMotifs, type: 'motifs_limite' });
          
          if (formData.dateReceptionMotifs) {
            // Motifs reçus
            const dateReceptionMotifs = new Date(formData.dateReceptionMotifs);
            dateDebutTribunal = new Date(dateReceptionMotifs);
            dateDebutTribunal.setDate(dateDebutTribunal.getDate() + 1);
            
            dateFinTribunal = new Date(dateReceptionMotifs);
            dateFinTribunal.setMonth(dateFinTribunal.getMonth() + 2);
            
            timeline.push({ label: 'Date de réception des motifs', date: dateReceptionMotifs, type: 'reception_motifs' });
            timeline.push({ label: 'Début possible du recours tribunal', date: dateDebutTribunal, type: 'tribunal_debut' });
            timeline.push({ label: 'Date limite du recours tribunal', date: dateFinTribunal, type: 'tribunal_limite', urgent: true });
          } else {
            // Motifs non reçus
            dateDebutTribunal = new Date(dateDemandeMotifs);
            dateDebutTribunal.setDate(dateDebutTribunal.getDate() + 30);
            
            dateFinTribunal = new Date(dateDemandeMotifs);
            dateFinTribunal.setMonth(dateFinTribunal.getMonth() + 2);
            
            timeline.push({ label: 'Début possible du recours tribunal (motifs non reçus)', date: dateDebutTribunal, type: 'tribunal_debut' });
            timeline.push({ label: 'Date limite du recours tribunal', date: dateFinTribunal, type: 'tribunal_limite', urgent: true });
          }
        }
      }
      
      // Calculer les jours restants pour le tribunal
      let joursRestantsTribunal: number | null = null;
      if (dateFinTribunal) {
        joursRestantsTribunal = Math.ceil((dateFinTribunal.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      // Message personnalisé
      let messagePersonnalise = '';
      
      // Ne mentionner le RAPO que si aucun RAPO n'a été déposé
      if (!formData.dateDepotRapo && joursRestantsRapo !== null && rapoDansDelais !== null) {
        if (!rapoDansDelais && dateLimiteRapo) {
          messagePersonnalise = `⚠️ Le délai du RAPO est dépassé de ${Math.abs(joursRestantsRapo)} jour(s). La date limite était le ${formatDateCourte(dateLimiteRapo)}.`;
        } else if (joursRestantsRapo <= 7) {
          messagePersonnalise = `⚠️ URGENT : Il reste ${joursRestantsRapo} jour(s) pour déposer le RAPO.`;
        } else {
          messagePersonnalise = `✅ Vous avez ${joursRestantsRapo} jour(s) pour déposer le RAPO.`;
        }
      } else if (formData.dateDepotRapo) {
        // Si un RAPO a été déposé, commencer par un message positif
        const dateDepotRapo = new Date(formData.dateDepotRapo);
        messagePersonnalise = `✅ RAPO déposé le ${formatDateCourte(dateDepotRapo)}. `;
        
        // Calculer la date limite de réponse de la commission (2 mois après dépôt)
        const dateLimiteCommission = new Date(dateDepotRapo);
        dateLimiteCommission.setMonth(dateLimiteCommission.getMonth() + 2);
        const joursRestantsCommissionCalc = Math.ceil((dateLimiteCommission.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
        
        // Si réponse reçue, calculer les délais tribunal
        if (formData.dateReponseRapo) {
          const dateReponseRapo = new Date(formData.dateReponseRapo);
          const dateFinTribunalCalc = new Date(dateReponseRapo);
          dateFinTribunalCalc.setMonth(dateFinTribunalCalc.getMonth() + 2);
          const joursRestantsTribunalCalc = Math.ceil((dateFinTribunalCalc.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
          
          if (joursRestantsTribunalCalc < 0) {
            messagePersonnalise += `⚠️ Le délai du recours tribunal est dépassé de ${Math.abs(joursRestantsTribunalCalc)} jour(s).`;
          } else if (joursRestantsTribunalCalc <= 7) {
            messagePersonnalise += `⚠️ URGENT : Il reste ${joursRestantsTribunalCalc} jour(s) pour saisir le tribunal.`;
          } else {
            messagePersonnalise += `✅ Délai tribunal : ${joursRestantsTribunalCalc} jour(s) restants.`;
          }
        } 
        // Si pas de réponse mais action choisie (saisir tribunal)
        else if (formData.actionApresRapo === 'saisir_tribunal' && dateLimiteReponseCommission) {
          const dateFinTribunalCalc = new Date(dateLimiteReponseCommission);
          dateFinTribunalCalc.setMonth(dateFinTribunalCalc.getMonth() + 2);
          const joursRestantsTribunalCalc = Math.ceil((dateFinTribunalCalc.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
          
          if (joursRestantsTribunalCalc < 0) {
            messagePersonnalise += `⚠️ Le délai du recours tribunal est dépassé de ${Math.abs(joursRestantsTribunalCalc)} jour(s).`;
          } else if (joursRestantsTribunalCalc <= 7) {
            messagePersonnalise += `⚠️ URGENT : Il reste ${joursRestantsTribunalCalc} jour(s) pour saisir le tribunal.`;
          } else {
            messagePersonnalise += `✅ Délai tribunal : ${joursRestantsTribunalCalc} jour(s) restants.`;
          }
        }
        // Si pas de réponse et pas d'action choisie, indiquer l'attente de la commission
        else if (!formData.dateReponseRapo && dateLimiteReponseCommission && joursRestantsCommission !== undefined) {
          if (joursRestantsCommission < 0) {
            messagePersonnalise += `⏳ En attente de réponse de la commission (délai dépassé de ${Math.abs(joursRestantsCommission)} jour(s)). Vous pouvez saisir le tribunal ou demander communication des motifs.`;
          } else {
            messagePersonnalise += `⏳ En attente de réponse de la commission (${joursRestantsCommission} jour(s) restants).`;
          }
        }
      }
      
      // Ajouter les informations sur le tribunal (pour les cas de communication des motifs)
      if (joursRestantsTribunal !== null && !formData.dateDepotRapo) {
        if (joursRestantsTribunal < 0) {
          messagePersonnalise += ` ⚠️ Le délai du recours tribunal est dépassé de ${Math.abs(joursRestantsTribunal)} jour(s).`;
        } else if (joursRestantsTribunal <= 7) {
          messagePersonnalise += ` ⚠️ URGENT : Il reste ${joursRestantsTribunal} jour(s) pour saisir le tribunal.`;
        } else {
          messagePersonnalise += ` ✅ Délai tribunal : ${joursRestantsTribunal} jour(s) restants.`;
        }
      }
      
      setCalculs({
        type: 'contentieux_visa',
        dateConfirmationDepot: dateConfirmationDepot,
        dateRefus: dateRefus,
        dateRejetImplicite: dateRejetImplicite,
        typeRefus: formData.typeRefusVisa,
        dateDebutRapo: dateDebutRapo,
        dateLimiteRapo: dateLimiteRapo,
        joursRestantsRapo: joursRestantsRapo,
        rapoDansDelais: rapoDansDelais,
        dateLimiteReponseCommission: dateLimiteReponseCommission,
        dateDebutTribunal: dateDebutTribunal,
        dateFinTribunal: dateFinTribunal,
        joursRestantsTribunal: joursRestantsTribunal,
        joursRestantsCommission: joursRestantsCommission,
        dateLimiteMotifs: dateLimiteMotifs,
        timeline: timeline.sort((a, b) => a.date.getTime() - b.date.getTime()),
        messagePersonnalise: messagePersonnalise,
        natureVisa: formData.natureVisa,
      });
      return;
    }
    
    if (formData.situation === 'demande') {
      // Calcul à partir des champs du formulaire "Demande" (visible avec ou sans connexion)
      if (formData.typeTitreDemande && formData.dateFinValiditeTitreDemande) {
        const dateFin = new Date(formData.dateFinValiditeTitreDemande);
        if (!isNaN(dateFin.getTime())) {
          dateFin.setHours(0, 0, 0, 0);
          const debutPeriode = new Date(dateFin.getTime() - 120 * 24 * 60 * 60 * 1000);
          const finPeriode = new Date(dateFin.getTime() - 60 * 24 * 60 * 60 * 1000);
          const aujourdhui = new Date();
          aujourdhui.setHours(0, 0, 0, 0);
          const dansPeriode = aujourdhui >= debutPeriode && aujourdhui <= finPeriode;
          const avantPeriode = aujourdhui < debutPeriode;
          const apresPeriode = aujourdhui > finPeriode;
          const joursRestantsAvantZone2Mois = dansPeriode
            ? Math.ceil((finPeriode.getTime() - aujourdhui.getTime()) / (24 * 60 * 60 * 1000))
            : 0;
          const config = titresSejourDemande.find((t) => t.value === formData.typeTitreDemande);
          setCalculs({
            type: 'demande_periode',
            dateFinValidite: dateFin,
            debutPeriode,
            finPeriode,
            dansPeriode,
            avantPeriode,
            apresPeriode,
            joursRestantsAvantZone2Mois,
            typeTitreDemande: formData.typeTitreDemande,
            labelTitre: config?.label || formData.typeTitreDemande
          });
          return;
        }
      }

      // Calcul détaillé pour renouvellement avec dateFinValiditeTitreActuel
      if (formData.typeDemande === 'renouvellement' && formData.dateFinValiditeTitreActuel && formData.typePrecisTitreSejour) {
        const resultatRenouvellement = calculerDelaisRenouvellement();
        if (resultatRenouvellement) {
          setCalculs({
            type: 'renouvellement_detaille',
            ...resultatRenouvellement
          });
          return;
        }
      }
      
      // Calcul détaillé pour première demande avec dateFinValiditeTitreActuel
      if (formData.typeDemande === 'premiere' && formData.dateFinValiditeTitreActuel && formData.typePrecisTitreSejour) {
        const resultatPremiereDemande = calculerDelaisPremiereDemande();
        if (resultatPremiereDemande) {
          setCalculs({
            type: 'premiere_demande_detaille',
            ...resultatPremiereDemande
          });
          return;
        }
      }
      
      // Calcul classique pour première demande ou renouvellement sans dateFinValiditeTitreActuel
      if (formData.typeTitre) {
        const infoTitre = infosTitres[formData.typeTitre];
        if (infoTitre) {
          let calculsResult: any = {
            type: 'demande',
            infoTitre: infoTitre
          };

          if (formData.typeDemande === 'premiere') {
            // Pour une première demande, on indique qu'elle peut être déposée dès maintenant
            calculsResult.premiereDemande = {
              peutDeposer: true,
              message: 'Vous pouvez déposer votre première demande dès maintenant.',
              delaiRecommandé: infoTitre.delaiPremiereDemande
            };
          } else if (formData.typeDemande === 'renouvellement' && !formData.dateFinValiditeTitreActuel) {
            // Utiliser dateExpirationTitre si disponible, sinon dateExpiration
            const dateExpiration = formData.dateExpirationTitre 
              ? new Date(formData.dateExpirationTitre) 
              : formData.dateExpiration 
              ? new Date(formData.dateExpiration) 
              : null;
            
            if (dateExpiration) {
              const aujourdhui = new Date();
              
              // Date recommandée pour déposer (2 à 4 mois avant expiration)
              const dateRecommandeeMin = new Date(dateExpiration);
              dateRecommandeeMin.setMonth(dateRecommandeeMin.getMonth() - infoTitre.delaiRenouvellement.max);
              
              const dateRecommandeeMax = new Date(dateExpiration);
              dateRecommandeeMax.setMonth(dateRecommandeeMax.getMonth() - infoTitre.delaiRenouvellement.min);
              
              // Date limite (jour d'expiration)
              const dateLimite = new Date(dateExpiration);
              
              const joursAvantExpiration = Math.ceil((dateExpiration.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
              
              // Déterminer l'urgence selon le type de document
              const isUrgent = joursAvantExpiration < 60;
              const isTardif = joursAvantExpiration < 0;
              
              calculsResult.renouvellement = {
                dateExpiration: dateExpiration,
                dateRecommandeeMin: dateRecommandeeMin,
                dateRecommandeeMax: dateRecommandeeMax,
                dateLimite: dateLimite,
                joursAvantExpiration: joursAvantExpiration,
                periodeRecommandee: `${infoTitre.delaiRenouvellement.min} à ${infoTitre.delaiRenouvellement.max} mois avant expiration`,
                risqueRupture: isUrgent,
                enRetard: isTardif,
                messagePersonnalise: isTardif 
                  ? `⚠️ Votre titre a expiré il y a ${Math.abs(joursAvantExpiration)} jour(s). Déposez immédiatement votre demande de renouvellement.`
                  : isUrgent
                  ? `⚠️ Votre titre expire dans ${joursAvantExpiration} jour(s). Déposez votre demande de renouvellement dès maintenant.`
                  : `✅ Votre titre expire dans ${joursAvantExpiration} jour(s). Période recommandée pour déposer : ${formatDateCourte(dateRecommandeeMin)} au ${formatDateCourte(dateRecommandeeMax)}.`
              };
            }
          }

          setCalculs(calculsResult);
        }
      }
    } else {
      setCalculs(null);
    }
  };

  const getTypeRecours = (natureDecision: string): string => {
    const recoursMap: Record<string, string> = {
      absence_reponse:
        'Analyse personnalisée à envisager en l’absence de réponse : contactez un avocat ou la plateforme pour déterminer la stratégie (mise en demeure, recours, etc.).',
      refus_titre: 'Recours contentieux devant le tribunal administratif',
      refus_enregistrement: 'Recours contentieux devant le tribunal administratif',
      oqtf:
        'Recours contentieux devant le tribunal administratif, avec la possibilité d’un référé suspension en cas d’urgence.',
    };
    return recoursMap[natureDecision] || 'Recours contentieux devant le tribunal administratif';
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatDateCourte = (date?: Date | null): string => {
    // Sécuriser : si la date est nulle ou invalide, on renvoie une chaîne vide
    if (!date || isNaN(date.getTime())) {
      return '';
    }

    // Format jour/mois/année (ex: 15/03/2024)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Fonction de calcul détaillé des délais de renouvellement selon article R.431-5 du CESEDA
  const calculerDelaisRenouvellement = () => {
    if (!formData.dateFinValiditeTitreActuel || !formData.typePrecisTitreSejour) {
      return null;
    }

    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    
    const dateFinValidite = new Date(formData.dateFinValiditeTitreActuel);
    dateFinValidite.setHours(0, 0, 0, 0);
    
    // Calculer les dates limites (1 mois = 30 jours)
    // Date de début de période : 120 jours avant la date de fin de validité
    const dateDebutPeriode = new Date(dateFinValidite);
    dateDebutPeriode.setDate(dateDebutPeriode.getDate() - 120); // 4 mois = 120 jours
    
    // Date de fin de période : 60 jours avant la date de fin de validité
    const dateFinPeriode = new Date(dateFinValidite);
    dateFinPeriode.setDate(dateFinPeriode.getDate() - 60); // 2 mois = 60 jours
    
    // Calculer les jours avant expiration (en partant d'aujourd'hui)
    const joursAvantExpiration = Math.ceil((dateFinValidite.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
    const joursAvantDebutPeriode = Math.ceil((dateDebutPeriode.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
    const joursAvantFinPeriode = Math.ceil((dateFinPeriode.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
    const joursDepuisFinPeriode = joursAvantExpiration < 60 ? Math.abs(joursAvantExpiration - 60) : 0;
    
    // Cas 1 : Avant la période (plus de 120 jours avant expiration)
    if (joursAvantExpiration > 120) {
      return {
        cas: 'avant_periode',
        couleur: 'green',
        dateDebutPeriode,
        dateFinPeriode,
        dateFinValidite,
        joursAvantExpiration,
        joursAvantDebutPeriode,
        message: {
          titre: 'Renouvellement pas encore ouvert',
          corps: `La date du jour n'est pas comprise dans la période des quatre mois avant la date d'expiration du titre de séjour.`,
          details: `Le renouvellement ${formData.typeDemande === 'premiere' ? 'ou la demande' : ''} du titre de séjour n'est pas encore ouvert.`,
          periode: `Le renouvellement pourra être effectué entre quatre mois et deux mois avant la date de fin de validité, soit du ${formatDateCourte(dateDebutPeriode)} au ${formatDateCourte(dateFinPeriode)}.`,
          dateOuverture: `Le renouvellement sera possible à partir du ${formatDateCourte(dateDebutPeriode)}.`,
          avertissement: 'Le renouvellement d\'un titre de séjour demandé après l\'expiration du délai requis pour le dépôt de la demande donne lieu, sauf cas de force majeure ou présentation d\'un visa en cours de validité, à l\'acquittement d\'un droit de visa de régularisation de 180 euros.'
        }
      };
    }
    
    // Cas 2a : Dans la période légale (entre 120 et 60 jours avant expiration)
    if (joursAvantExpiration >= 60 && joursAvantExpiration <= 120) {
      return {
        cas: 'dans_periode',
        couleur: 'blue',
        dateDebutPeriode,
        dateFinPeriode,
        dateFinValidite,
        joursAvantExpiration,
        joursAvantFinPeriode,
        message: {
          titre: 'Renouvellement ouvert',
          corps: `Le renouvellement du titre de séjour est ouvert.`,
          details: `Le titre de séjour est renouvelable entre quatre mois et deux mois avant la date de fin de validité. Cette période correspond au cadre légal prévu par l'article R.431-5 du CESEDA.`,
          periode: `Le renouvellement peut être effectué entre quatre mois et deux mois avant la date de fin de validité, soit du ${formatDateCourte(dateDebutPeriode)} au ${formatDateCourte(dateFinPeriode)}.`,
          delaiRestant: `Il vous reste ${joursAvantFinPeriode} jour(s) avant d'entrer dans le délai de 2 mois avant la fin de validité qui conduit à l'acquittement d'un droit de visa de régularisation de 180 euros.`,
          avertissement: 'Le renouvellement d\'un titre de séjour demandé après l\'expiration du délai requis pour le dépôt de la demande donne lieu, sauf cas de force majeure ou présentation d\'un visa en cours de validité, à l\'acquittement d\'un droit de visa de régularisation de 180 euros.'
        }
      };
    }
    
    // Cas 2b : Après la période légale (moins de 60 jours avant expiration)
    return {
      cas: 'apres_periode',
      couleur: 'red',
      dateDebutPeriode,
      dateFinPeriode,
      dateFinValidite,
      joursAvantExpiration,
      joursDepuisFinPeriode,
      message: {
        titre: 'Délai légal dépassé',
        corps: `Le délai légal de renouvellement est dépassé. Le renouvellement peut toujours être effectué mais risque d'entraîner le paiement d'un droit de visa de régularisation de 180 euros.`,
        details: `Le renouvellement du titre de séjour doit être effectué immédiatement pour éviter des lenteurs dans la gestion du dossier. Les recours éventuels sont voués à l'échec quand les délais légaux de renouvellement sont dépassés.`,
        periodeLegale: `Le renouvellement ${formData.typeDemande === 'premiere' ? 'ou la demande' : ''} aurait dû être introduit entre quatre mois et deux mois avant la date de fin de validité, soit du ${formatDateCourte(dateDebutPeriode)} au ${formatDateCourte(dateFinPeriode)}.`,
        delaiRestant: joursAvantExpiration > 0 
          ? `Il vous reste ${joursAvantExpiration} jour(s) avant l'expiration du titre.`
          : `Votre titre a expiré il y a ${Math.abs(joursAvantExpiration)} jour(s).`,
        avertissement: 'Le renouvellement d\'un titre de séjour demandé après l\'expiration du délai requis pour le dépôt de la demande donne lieu, sauf cas de force majeure ou présentation d\'un visa en cours de validité, à l\'acquittement d\'un droit de visa de régularisation de 180 euros.'
      }
    };
  };

  // Fonction de calcul détaillé des délais de première demande selon article R.431-5 du CESEDA
  const calculerDelaisPremiereDemande = () => {
    if (!formData.dateFinValiditeTitreActuel || !formData.typePrecisTitreSejour) {
      return null;
    }

    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    
    const dateFinValidite = new Date(formData.dateFinValiditeTitreActuel);
    dateFinValidite.setHours(0, 0, 0, 0);
    
    // Calculer les dates limites (1 mois = 30 jours)
    // Date de début de période : 120 jours avant la date de fin de validité
    const dateDebutPeriode = new Date(dateFinValidite);
    dateDebutPeriode.setDate(dateDebutPeriode.getDate() - 120); // 4 mois = 120 jours
    
    // Date de fin de période : 60 jours avant la date de fin de validité
    const dateFinPeriode = new Date(dateFinValidite);
    dateFinPeriode.setDate(dateFinPeriode.getDate() - 60); // 2 mois = 60 jours
    
    // Calculer les jours avant expiration (en partant d'aujourd'hui)
    const joursAvantExpiration = Math.ceil((dateFinValidite.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
    const joursAvantDebutPeriode = Math.ceil((dateDebutPeriode.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
    const joursAvantFinPeriode = Math.ceil((dateFinPeriode.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
    const joursDepuisFinPeriode = joursAvantExpiration < 60 ? Math.abs(joursAvantExpiration - 60) : 0;
    const joursDepuisExpiration = joursAvantExpiration < 0 ? Math.abs(joursAvantExpiration) : 0;
    
    // Cas 1 : Avant la période (plus de 120 jours avant expiration)
    if (joursAvantExpiration > 120) {
      return {
        cas: 'avant_periode',
        couleur: 'green',
        dateDebutPeriode,
        dateFinPeriode,
        dateFinValidite,
        joursAvantExpiration,
        joursAvantDebutPeriode,
        message: {
          titre: 'Première demande pas encore ouverte',
          corps: `La date du jour n'est pas comprise dans la période des quatre mois avant la date d'expiration du visa.`,
          details: `La première demande du titre de séjour n'est pas encore ouverte.`,
          periode: `La première demande pourra être effectuée entre quatre mois et deux mois avant la date de fin de validité, soit du ${formatDateCourte(dateDebutPeriode)} au ${formatDateCourte(dateFinPeriode)}.`,
          dateOuverture: `La première demande sera possible à partir du ${formatDateCourte(dateDebutPeriode)}.`,
          avertissement: 'La première demande d\'un titre de séjour demandée après l\'expiration totale du délai (après la date de fin de validité du visa) donne lieu, sauf cas de force majeure ou présentation d\'un visa en cours de validité, à l\'acquittement d\'un droit de visa de régularisation de 180 euros.'
        }
      };
    }
    
    // Cas 2a : Dans la période légale (entre 120 et 60 jours avant expiration)
    if (joursAvantExpiration >= 60 && joursAvantExpiration <= 120) {
      return {
        cas: 'dans_periode',
        couleur: 'blue',
        dateDebutPeriode,
        dateFinPeriode,
        dateFinValidite,
        joursAvantExpiration,
        joursAvantFinPeriode,
        message: {
          titre: 'Première demande ouverte',
          corps: `La première demande du titre de séjour est ouverte.`,
          details: `Le titre de séjour est demandable entre quatre mois et deux mois avant la date de fin de validité. Cette période correspond au cadre légal prévu par l'article R.431-5 du CESEDA.`,
          periode: `La première demande peut être effectuée entre quatre mois et deux mois avant la date de fin de validité, soit du ${formatDateCourte(dateDebutPeriode)} au ${formatDateCourte(dateFinPeriode)}.`,
          delaiRestant: `Il vous reste ${joursAvantFinPeriode} jour(s) avant d'entrer dans le délai de 2 mois avant la fin de validité.`,
          avertissement: 'La première demande d\'un titre de séjour demandée après l\'expiration totale du délai (après la date de fin de validité du visa) donne lieu, sauf cas de force majeure ou présentation d\'un visa en cours de validité, à l\'acquittement d\'un droit de visa de régularisation de 180 euros.'
        }
      };
    }
    
    // Cas 2b : Après la période légale mais avant expiration (moins de 60 jours avant expiration, mais pas encore expiré)
    if (joursAvantExpiration > 0 && joursAvantExpiration < 60) {
      return {
        cas: 'apres_periode_avant_expiration',
        couleur: 'orange',
        dateDebutPeriode,
        dateFinPeriode,
        dateFinValidite,
        joursAvantExpiration,
        joursDepuisFinPeriode,
        message: {
          titre: 'Délai légal dépassé - Action urgente requise',
          corps: `Le délai légal de première demande est dépassé, mais votre visa n'a pas encore expiré. La première demande peut toujours être effectuée sans pénalité avant l'expiration du visa.`,
          details: `La première demande du titre de séjour doit être effectuée immédiatement pour éviter des lenteurs dans la gestion du dossier et éviter la pénalité de 180 euros qui sera due après l'expiration du visa.`,
          periodeLegale: `La première demande aurait dû être introduite entre quatre mois et deux mois avant la date de fin de validité, soit du ${formatDateCourte(dateDebutPeriode)} au ${formatDateCourte(dateFinPeriode)}.`,
          delaiRestant: `Il vous reste ${joursAvantExpiration} jour(s) avant l'expiration du visa. Agissez rapidement pour éviter la pénalité.`,
          avertissement: '⚠️ ATTENTION : La première demande d\'un titre de séjour demandée après l\'expiration totale du délai (après la date de fin de validité du visa) donne lieu, sauf cas de force majeure ou présentation d\'un visa en cours de validité, à l\'acquittement d\'un droit de visa de régularisation de 180 euros.'
        }
      };
    }
    
    // Cas 2c : Après expiration complète du visa
    return {
      cas: 'apres_expiration',
      couleur: 'red',
      dateDebutPeriode,
      dateFinPeriode,
      dateFinValidite,
      joursDepuisExpiration,
      message: {
        titre: 'Délai légal dépassé - Pénalité due',
        corps: `Le délai légal de première demande est dépassé et votre visa a expiré. La première demande peut toujours être effectuée mais entraîne le paiement d'un droit de visa de régularisation de 180 euros.`,
        details: `La première demande du titre de séjour doit être effectuée immédiatement. Les recours éventuels sont voués à l'échec quand les délais légaux sont dépassés.`,
        periodeLegale: `La première demande aurait dû être introduite entre quatre mois et deux mois avant la date de fin de validité, soit du ${formatDateCourte(dateDebutPeriode)} au ${formatDateCourte(dateFinPeriode)}.`,
        delaiRestant: `Votre visa a expiré il y a ${joursDepuisExpiration} jour(s). La pénalité de 180 euros est maintenant due.`,
        avertissement: '⚠️ PÉNALITÉ DUE : La première demande d\'un titre de séjour demandée après l\'expiration totale du délai (après la date de fin de validité du visa) donne lieu, sauf cas de force majeure ou présentation d\'un visa en cours de validité, à l\'acquittement d\'un droit de visa de régularisation de 180 euros.'
      }
    };
  };

  // Fonction de génération PDF pour le rapport de renouvellement
  const genererPDFRenouvellement = () => {
    if (!calculs || calculs.type !== 'renouvellement_detaille') {
      return;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = margin;

    // En-tête
    doc.setFontSize(20);
    doc.setTextColor(249, 115, 22); // Orange
    doc.setFont('helvetica', 'bold');
    doc.text('PAW LEGAL', margin, yPosition);
    
    yPosition += 8;
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('Rapport de calcul des délais de renouvellement', margin, yPosition);
    
    yPosition += 10;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Informations générales
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Informations générales', margin, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const infos = [
      `Type de demande : ${formData.typeDemande === 'premiere' ? 'Première demande' : 'Renouvellement'}`,
      `Date de fin de validité : ${formatDateCourte(calculs.dateFinValidite)}`,
      `Date de calcul : ${formatDateCourte(new Date())}`,
    ];
    infos.forEach(info => {
      doc.text(info, margin, yPosition);
      yPosition += 6;
    });

    yPosition += 5;

    // Résultat du calcul
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Résultat du calcul', margin, yPosition);
    yPosition += 8;

    // Couleur selon le cas
    const couleur = calculs.couleur === 'green' ? [34, 197, 94] : calculs.couleur === 'red' ? [239, 68, 68] : [59, 130, 246];
    doc.setFillColor(couleur[0], couleur[1], couleur[2]);
    doc.roundedRect(margin, yPosition - 5, pageWidth - 2 * margin, 15, 3, 3, 'F');
    
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(calculs.message.titre, margin + 5, yPosition + 3);
    yPosition += 10;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    const messages = [
      calculs.message.corps,
      calculs.message.details,
      calculs.message.periode,
      calculs.message.periodeLegale,
      calculs.message.dateOuverture,
      calculs.message.delaiRestant
    ].filter(Boolean);

    messages.forEach(msg => {
      const lines = doc.splitTextToSize(msg, pageWidth - 2 * margin - 10);
      lines.forEach((line: string) => {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin + 5, yPosition);
        yPosition += 5;
      });
      yPosition += 2;
    });

    yPosition += 5;

    // Avertissement
    doc.setFillColor(255, 243, 205);
    doc.roundedRect(margin, yPosition, pageWidth - 2 * margin, 12, 3, 3, 'F');
    doc.setFontSize(9);
    doc.setTextColor(120, 53, 15);
    doc.setFont('helvetica', 'bold');
    doc.text('⚠️ Avertissement important', margin + 5, yPosition + 5);
    yPosition += 6;
    doc.setFont('helvetica', 'normal');
    const avertissementLines = doc.splitTextToSize(calculs.message.avertissement, pageWidth - 2 * margin - 10);
    avertissementLines.forEach((line: string) => {
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin + 5, yPosition);
      yPosition += 4;
    });

    yPosition += 10;

    // Période légale
    if (calculs.dateDebutPeriode && calculs.dateFinPeriode) {
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text('Période légale de renouvellement', margin, yPosition);
      yPosition += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Début : ${formatDateCourte(calculs.dateDebutPeriode)}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Fin : ${formatDateCourte(calculs.dateFinPeriode)}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Date d'expiration : ${formatDateCourte(calculs.dateFinValidite)}`, margin, yPosition);
      yPosition += 10;
    }

    // Recommandations
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Recommandations', margin, yPosition);
    yPosition += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const recommandations = [
      '• Déposez votre demande dans les délais légaux pour éviter toute pénalité',
      '• Conservez tous les justificatifs de votre demande',
      '• En cas de retard, contactez immédiatement un avocat spécialisé',
      '• Suivez l\'évolution de votre dossier sur la plateforme',
      '• En fonction de la réponse de la préfecture, vous pouvez introduire des recours'
    ];

    recommandations.forEach(rec => {
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = margin;
      }
      const lines = doc.splitTextToSize(rec, pageWidth - 2 * margin - 10);
      lines.forEach((line: string) => {
        doc.text(line, margin, yPosition);
        yPosition += 4;
      });
      yPosition += 2;
    });

    // Pied de page
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Page ${i} / ${totalPages} - Généré le ${formatDateCourte(new Date())}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }

    // Télécharger le PDF
    const fileName = `Rapport_Renouvellement_${formatDateCourte(new Date()).replace(/\//g, '_')}.pdf`;
    doc.save(fileName);
  };

  // Fonction de génération PDF pour le rapport de première demande
  const genererPDFPremiereDemande = () => {
    if (!calculs || calculs.type !== 'premiere_demande_detaille') {
      return;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = margin;

    // En-tête
    doc.setFontSize(20);
    doc.setTextColor(249, 115, 22); // Orange
    doc.setFont('helvetica', 'bold');
    doc.text('PAW LEGAL', margin, yPosition);
    
    yPosition += 8;
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('Rapport de calcul des délais de première demande', margin, yPosition);
    
    yPosition += 10;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Informations générales
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Informations générales', margin, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const infos = [
      `Type de demande : Première demande`,
      `Date de fin de validité du visa : ${formatDateCourte(calculs.dateFinValidite)}`,
      `Date de calcul : ${formatDateCourte(new Date())}`,
    ];
    infos.forEach(info => {
      doc.text(info, margin, yPosition);
      yPosition += 6;
    });

    yPosition += 5;

    // Résultat du calcul
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Résultat du calcul', margin, yPosition);
    yPosition += 8;

    // Couleur selon le cas
    const couleur = calculs.couleur === 'green' ? [34, 197, 94] : calculs.couleur === 'red' ? [239, 68, 68] : calculs.couleur === 'orange' ? [249, 115, 22] : [59, 130, 246];
    doc.setFillColor(couleur[0], couleur[1], couleur[2]);
    doc.roundedRect(margin, yPosition - 5, pageWidth - 2 * margin, 15, 3, 3, 'F');
    
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(calculs.message.titre, margin + 5, yPosition + 3);
    yPosition += 10;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    const messages = [
      calculs.message.corps,
      calculs.message.details,
      calculs.message.periode,
      calculs.message.periodeLegale,
      calculs.message.dateOuverture,
      calculs.message.delaiRestant
    ].filter(Boolean);

    messages.forEach(msg => {
      const lines = doc.splitTextToSize(msg, pageWidth - 2 * margin - 10);
      lines.forEach((line: string) => {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin + 5, yPosition);
        yPosition += 5;
      });
      yPosition += 2;
    });

    yPosition += 5;

    // Avertissement
    doc.setFillColor(255, 243, 205);
    doc.roundedRect(margin, yPosition, pageWidth - 2 * margin, 12, 3, 3, 'F');
    doc.setFontSize(9);
    doc.setTextColor(120, 53, 15);
    doc.setFont('helvetica', 'bold');
    doc.text('⚠️ Avertissement important', margin + 5, yPosition + 5);
    yPosition += 6;
    doc.setFont('helvetica', 'normal');
    const avertissementLines = doc.splitTextToSize(calculs.message.avertissement, pageWidth - 2 * margin - 10);
    avertissementLines.forEach((line: string) => {
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin + 5, yPosition);
      yPosition += 4;
    });

    yPosition += 10;

    // Période légale
    if (calculs.dateDebutPeriode && calculs.dateFinPeriode) {
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text('Période légale de première demande', margin, yPosition);
      yPosition += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Début : ${formatDateCourte(calculs.dateDebutPeriode)}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Fin : ${formatDateCourte(calculs.dateFinPeriode)}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Date d'expiration du visa : ${formatDateCourte(calculs.dateFinValidite)}`, margin, yPosition);
      yPosition += 10;
    }

    // Recommandations
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Recommandations', margin, yPosition);
    yPosition += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const recommandations = [
      '• Déposez votre demande dans les délais légaux pour éviter toute pénalité',
      '• La pénalité de 180 euros n\'est due qu\'après l\'expiration complète du visa',
      '• Conservez tous les justificatifs de votre demande',
      '• En cas de retard, contactez immédiatement un avocat spécialisé',
      '• Suivez l\'évolution de votre dossier sur la plateforme',
      '• En fonction de la réponse de la préfecture, vous pouvez introduire des recours'
    ];

    recommandations.forEach(rec => {
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = margin;
      }
      const lines = doc.splitTextToSize(rec, pageWidth - 2 * margin - 10);
      lines.forEach((line: string) => {
        doc.text(line, margin, yPosition);
        yPosition += 4;
      });
      yPosition += 2;
    });

    // Pied de page
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Page ${i} / ${totalPages} - Généré le ${formatDateCourte(new Date())}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }

    // Télécharger le PDF
    const fileName = `Rapport_Premiere_Demande_${formatDateCourte(new Date()).replace(/\//g, '_')}.pdf`;
    doc.save(fileName);
  };

  const getAlertColor = (jours: number): string => {
    if (jours < 0) return 'text-red-600 bg-red-50 border-red-500';
    if (jours <= 7) return 'text-orange-600 bg-orange-50 border-orange-500';
    if (jours <= 30) return 'text-yellow-600 bg-yellow-50 border-yellow-500';
    return 'text-green-600 bg-green-50 border-green-500';
  };

  // Compte client avec profil incomplet : afficher un message pendant la redirection
  const sessionRole = (session?.user as any)?.role ?? 'client';
  const isClientIncomplete = status === 'authenticated' && session && sessionRole === 'client' && !(session.user as any)?.profilComplete;
  if (isClientIncomplete) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header variant="home" />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Accès au calculateur réservé aux comptes avec profil complété. Redirection...</p>
          </div>
        </main>
      </div>
    );
  }

  const calculateurAvatarUrl = getProfilePhotoAbsoluteUrl(userProfile?.profilePhoto);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header variant="home" />

      <main className="container mx-auto px-4 py-8 flex-1">
        <div id="calculateur-top" className="mb-6 scroll-mt-20">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Calculateur</p>
          <h1 className="text-2xl font-bold text-foreground mb-1">Délais et titres de séjour</h1>
          <p className="text-sm text-gray-700">Estimez les délais légaux et les échéances pour vos démarches</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Colonne 1 : Informations du profil utilisateur (à l'extrémité gauche) */}
          <div className="w-full lg:w-auto lg:flex-shrink-0 lg:self-start">
            <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all lg:sticky lg:top-24 lg:w-72">
              {/* En-tête avec avatar et nom */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center overflow-hidden shrink-0">
                    {calculateurAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={calculateurAvatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                    <span className="text-white font-bold text-lg">
                      {userProfile?.firstName?.[0]?.toUpperCase() || session?.user?.name?.[0]?.toUpperCase() || 'U'}
                      {userProfile?.lastName?.[0]?.toUpperCase() || ''}
                    </span>
                    )}
                </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-foreground">Mon Profil</h2>
                    {session && (session.user || userProfile) && (
                      <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary/20 text-primary mt-1">
                        {(userProfile?.role || (session.user as any)?.role || 'client').charAt(0).toUpperCase() + (userProfile?.role || (session.user as any)?.role || 'client').slice(1)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Nom et email en en-tête */}
                {session && (session.user || userProfile) && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mb-4">
                    <p className="text-sm font-bold text-foreground mb-1">
                      {userProfile?.firstName && userProfile?.lastName
                        ? `${userProfile.firstName} ${userProfile.lastName}`
                        : session.user?.name || 'Utilisateur'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {userProfile?.email || session.user?.email || ''}
                    </p>
                  </div>
                )}
              </div>

              {!session ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-4">🔒</div>
                  <p className="text-muted-foreground mb-4 text-sm">
                    Connectez-vous pour voir vos informations préremplies
                  </p>
                  <Link href="/auth/signin">
                    <Button className="w-full">Se connecter</Button>
                  </Link>
                  <p className="text-xs text-muted-foreground mt-3">
                    Ou{' '}
                    <Link href="/auth/signup" className="text-primary hover:underline">
                      créez un compte
                    </Link>
                  </p>
                </div>
              ) : isLoadingProfile ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground text-sm">Chargement du profil...</p>
                </div>
              ) : userProfile ? (
                <div className="space-y-5">
                  {/* 🟦 1. Informations personnelles */}
                  <div className="space-y-2.5">
                    <button
                      onClick={() => setIsPersonalInfoOpen(!isPersonalInfoOpen)}
                      className="flex items-center justify-between w-full gap-2 mb-3 hover:opacity-80 transition-opacity cursor-pointer group"
                      type="button"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-5 bg-blue-500 rounded-full"></div>
                        <h3 className="text-sm font-bold text-foreground group-hover:text-blue-600 transition-colors">Informations personnelles</h3>
                      </div>
                      <span className={`text-blue-600 transition-transform duration-300 text-xs ${isPersonalInfoOpen ? 'rotate-180' : 'rotate-0'}`}>
                        ▼
                        </span>
                    </button>
                    
                    {isPersonalInfoOpen && (
                      <div className="space-y-2.5">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Nom complet</p>
                        <p className="text-xs font-medium text-foreground break-words">
                          {userProfile.firstName && userProfile.lastName
                            ? `${userProfile.firstName} ${userProfile.lastName}`
                            : <span className="text-muted-foreground italic">Information non fournie</span>}
                        </p>
                      </div>
                      </div>

                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Email</p>
                        <p className="text-xs font-medium text-foreground break-all">
                          {userProfile.email || <span className="text-muted-foreground italic">Information non fournie</span>}
                        </p>
                    </div>
                  </div>

                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Téléphone</p>
                        <p className="text-xs font-medium text-foreground">
                          {userProfile.phone || <span className="text-muted-foreground italic">Information non fournie</span>}
                        </p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Adresse</p>
                        <p className="text-xs font-medium text-foreground break-words">
                          {(userProfile.adressePostale || userProfile.ville || userProfile.codePostal) ? (
                            <>
                              {userProfile.adressePostale || ''}
                              {userProfile.adressePostale && (userProfile.ville || userProfile.codePostal) ? ', ' : ''}
                              {userProfile.codePostal || ''}
                              {userProfile.codePostal && userProfile.ville ? ' ' : ''}
                              {userProfile.ville || ''}
                              {userProfile.pays && (userProfile.ville || userProfile.codePostal || userProfile.adressePostale) ? `, ${userProfile.pays}` : ''}
                            </>
                          ) : (
                            <span className="text-muted-foreground italic">Information non fournie</span>
                          )}
                        </p>
                        </div>
                    </div>
                      </div>
                    )}
                  </div>

                  {/* 🟩 2. Informations administratives liées au séjour */}
                  <div className="space-y-2.5 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => setIsAdminInfoOpen(!isAdminInfoOpen)}
                      className="flex items-center justify-between w-full gap-2 mb-3 hover:opacity-80 transition-opacity cursor-pointer group"
                      type="button"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-5 bg-green-500 rounded-full"></div>
                        <h3 className="text-sm font-bold text-foreground group-hover:text-green-600 transition-colors">Informations administratives</h3>
                        </div>
                      <span className={`text-green-600 transition-transform duration-300 text-xs ${isAdminInfoOpen ? 'rotate-180' : 'rotate-0'}`}>
                        ▼
                      </span>
                    </button>
                    
                    {isAdminInfoOpen && (
                      <div className="space-y-2.5">
                    {/* Catégorie du titre de séjour */}
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Catégorie du titre</p>
                        <p className="text-xs font-medium text-foreground break-words">
                          {userProfile.typeTitre 
                            ? (typesTitres.find(t => t.value === userProfile.typeTitre)?.label || userProfile.typeTitre)
                            : <span className="text-muted-foreground italic">Information non fournie</span>}
                        </p>
                      </div>
                    </div>

                    {/* Nature du document */}
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Nature du document</p>
                        <p className="text-xs font-medium text-foreground break-words">
                          {userProfile.typeTitre 
                            ? (userProfile.typeTitre.includes('visa') || userProfile.typeTitre.includes('VLS') 
                                ? 'Visa long séjour (VLS-TS ou visa autre nature)' 
                                : 'Titre de séjour')
                            : <span className="text-muted-foreground italic">Information non fournie</span>}
                        </p>
                      </div>
                    </div>

                    {/* Dates de délivrance et d'expiration côte à côte */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Date de délivrance */}
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Date de délivrance</p>
                          <p className="text-xs font-medium text-foreground">
                            {userProfile.dateDelivrance 
                              ? formatDateCourte(new Date(userProfile.dateDelivrance))
                              : <span className="text-muted-foreground italic">Information non fournie</span>}
                          </p>
                        </div>
                      </div>

                      {/* Date d'expiration */}
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Date d'expiration</p>
                          <p className="text-xs font-medium text-foreground">
                            {userProfile.dateExpiration 
                              ? formatDateCourte(new Date(userProfile.dateExpiration))
                              : <span className="text-muted-foreground italic">Information non fournie</span>}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Statut du titre de séjour avec minuteur dynamique */}
                    {userProfile.dateExpiration && (
                      <div className={`rounded-lg p-4 border ${
                        joursRestants !== null && joursRestants <= 0
                          ? 'bg-red-50 border-red-200'
                          : joursRestants !== null && joursRestants < 30
                          ? 'bg-orange-50 border-orange-200'
                          : 'bg-green-50 border-green-200'
                      }`}>
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <p className={`text-xs font-bold mb-2 uppercase tracking-wide ${
                              joursRestants !== null && joursRestants <= 0
                                ? 'text-red-900'
                                : joursRestants !== null && joursRestants < 30
                                ? 'text-orange-900'
                                : 'text-green-900'
                            }`}>
                              {joursRestants !== null && joursRestants <= 0
                                ? 'Titre de séjour expiré'
                                : 'Titre de séjour en cours de validité'}
                            </p>
                            
                            {joursRestants !== null && joursRestants <= 0 ? (
                              <div className="space-y-1">
                                <p className="text-[11px] font-semibold text-red-800">
                                  Votre titre de séjour a expiré
                                </p>
                                <p className="text-[10px] text-red-700">
                                  Il est recommandé de déposer immédiatement une demande de renouvellement.
                                </p>
                        </div>
                            ) : joursRestants !== null ? (
                              <div className="space-y-2">
                                <p className={`text-[11px] font-semibold ${
                                  joursRestants < 30 ? 'text-orange-800' : 'text-green-800'
                                }`}>
                                  Temps restant avant expiration :
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {joursRestants > 0 && (
                                    <div className={`bg-white/80 rounded-lg px-3 py-2 border-2 shadow-sm ${
                                      joursRestants < 30 ? 'border-orange-400 text-orange-900' : 'border-green-400 text-green-900'
                                    }`}>
                                      <p className={`text-[9px] font-semibold uppercase tracking-wider opacity-70 ${
                                        joursRestants < 30 ? 'text-orange-700' : 'text-green-700'
                                      }`}>Jours</p>
                                      <p className="text-lg font-bold">{joursRestants}</p>
                      </div>
                    )}
                                  <div className={`bg-white/80 rounded-lg px-3 py-2 border-2 shadow-sm ${
                                    joursRestants < 30 ? 'border-orange-400 text-orange-900' : 'border-green-400 text-green-900'
                                  }`}>
                                    <p className={`text-[9px] font-semibold uppercase tracking-wider opacity-70 ${
                                      joursRestants < 30 ? 'text-orange-700' : 'text-green-700'
                                    }`}>Heures</p>
                                    <p className="text-lg font-bold">{String(heuresRestantes).padStart(2, '0')}</p>
                        </div>
                                  <div className={`bg-white/80 rounded-lg px-3 py-2 border-2 shadow-sm ${
                                    joursRestants < 30 ? 'border-orange-400 text-orange-900' : 'border-green-400 text-green-900'
                                  }`}>
                                    <p className={`text-[9px] font-semibold uppercase tracking-wider opacity-70 ${
                                      joursRestants < 30 ? 'text-orange-700' : 'text-green-700'
                                    }`}>Minutes</p>
                                    <p className="text-lg font-bold">{String(minutesRestantes).padStart(2, '0')}</p>
                                  </div>
                                  <div className={`bg-white/80 rounded-lg px-3 py-2 border-2 shadow-sm ${
                                    joursRestants < 30 ? 'border-orange-400 text-orange-900' : 'border-green-400 text-green-900'
                                  }`}>
                                    <p className={`text-[9px] font-semibold uppercase tracking-wider opacity-70 ${
                                      joursRestants < 30 ? 'text-orange-700' : 'text-green-700'
                                    }`}>Secondes</p>
                                    <p className={`text-lg font-bold animate-pulse ${
                                      joursRestants < 30 ? 'text-orange-900' : 'text-green-900'
                                    }`}>{String(secondesRestantes).padStart(2, '0')}</p>
                                  </div>
                                </div>
                                {joursRestants < 30 && (
                                  <p className="text-[10px] text-orange-700 mt-2">
                                    ⚠️ Votre titre expire bientôt. Pensez à déposer votre demande de renouvellement.
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Numéro du titre de séjour */}
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Numéro de titre</p>
                        <p className="text-xs font-medium text-foreground break-all">
                          {userProfile.numeroTitre || <span className="text-muted-foreground italic">Information non fournie</span>}
                        </p>
                        </div>
                    </div>
                      </div>
                    )}
                  </div>

                  {/* 🟥 3. Avertissements automatiques globaux */}
                  {userProfile.dateExpiration && (() => {
                    const expiration = new Date(userProfile.dateExpiration);
                    const aujourdhui = new Date();
                    const joursRestants = Math.ceil((expiration.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
                    const moisRestants = Math.floor(joursRestants / 30);
                    
                    // Section "Titre de séjour expiré" supprimée (redondance)
                    if (joursRestants < 0) {
                      return null;
                    } else if (moisRestants < 5) {
                      return (
                        <div className="mt-4 p-3.5 bg-orange-50 border border-primary/30 rounded-xl">
                          <div className="flex-1">
                            <p className="text-xs font-bold text-orange-900 mb-1.5">Expiration proche</p>
                            <p className="text-[11px] text-orange-800 leading-relaxed">
                              Votre titre de séjour arrive bientôt à expiration. Pensez au renouvellement.
                            </p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* 🟨 4. Bouton de modification (pour tous les utilisateurs) */}
                  <div className="pt-4 border-t border-gray-200">
                    <Link href={(session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin' ? '/admin/compte' : '/client/compte'}>
                      <Button variant="outline" className="w-full text-xs h-9 font-semibold border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all">
                        ✏️ Modifier mon profil
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-5xl mb-4">❌</div>
                  <p className="text-muted-foreground text-sm mb-4">
                    Impossible de charger votre profil
                  </p>
                  <Button variant="outline" onClick={loadUserProfile} className="w-full text-xs">
                    Réessayer
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Colonne 2 : Informations sur le titre de séjour (centré, largeur augmentée) */}
          <div className="flex-1 w-full lg:max-w-4xl mx-auto lg:self-start">
            <div className="relative bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all lg:sticky lg:top-24">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">📋</span>
                </div>
                <h2 className="text-xl font-bold text-foreground">Nature du calcul</h2>
              </div>

              {!isAuthenticated && (
                <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
                  <p className="font-semibold mb-1">Connexion requise pour utiliser le calculateur</p>
                  <p className="mb-2">
                    Vous pouvez consulter les explications ci-dessous, mais il est nécessaire de vous connecter pour saisir vos informations et générer les délais.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push('/auth/signin')}
                    className="inline-flex items-center justify-center rounded-md border border-yellow-400 bg-yellow-100 px-3 py-1.5 text-xs font-semibold text-yellow-900 hover:bg-yellow-200 transition-colors"
                  >
                    Se connecter pour utiliser le calculateur
                  </button>
                </div>
              )}

              <form
                className={`space-y-4 ${!isAuthenticated ? 'pointer-events-none opacity-60 select-none' : ''}`}
                aria-disabled={!isAuthenticated}
              >
                {/* Badges de choix */}
                <div className="space-y-2">
                  <Label className="text-base font-bold">Sélectionnez le type de calcul :</Label>
                  <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2">
                    {/* Badge Demande de titre de séjour et recours */}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          situation: 'demande',
                          natureDecision: '',
                          dateDecision: ''
                        });
                        setCalculs(null);
                        setIsSituationTitreBlocExpanded(true);
                        situationTitreBothPrevRef.current = false;
                      }}
                      className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                        formData.situation === 'demande'
                          ? 'bg-blue-600 text-white border-2 border-blue-600'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                      }`}
                    >
                      <span className="text-lg">📄</span>
                      <span>Demande de titre de séjour et recours</span>
                    </button>

                    {/* Badge Recours contre refus de visa */}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ 
                        ...formData, 
                          situation: 'contentieux_visa',
                        typeDemande: '',
                          typeTitre: '',
                          typeTitreAutre: '',
                          motifTitreSejour: '',
                          sousCategorieTitreSejour: '',
                          typePrecisTitreSejour: '',
                          natureVisa: '',
                          dateConfirmationDepot: '',
                          typeRefusVisa: '',
                          dateNotificationRefus: '',
                          dateDepotRapo: '',
                          reponseRapoRecue: false,
                          dateReponseRapo: '',
                          demandeCommunicationMotifs: false,
                          dateDemandeMotifs: '',
                          dateReceptionMotifs: '',
                          actionApresRapo: ''
                        });
                        setCalculs(null);
                        setIsSituationTitreBlocExpanded(true);
                        situationTitreBothPrevRef.current = false;
                      }}
                      className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                        formData.situation === 'contentieux_visa'
                          ? 'bg-orange-600 text-white border-2 border-orange-600'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                      }`}
                    >
                      <span className="text-lg">✈️</span>
                      <span>Recours contre un refus de visa</span>
                    </button>
                  </div>
                </div>

                {/* Champs pour Demande de titre de séjour et recours (doc calculateur-delais-titres-sejour.md) */}
                {formData.situation === 'demande' && (
                  <div className="space-y-4 pt-3 border-t">
                    {!isSituationTitreBlocExpanded &&
                    formData.typeTitreDemande &&
                    formData.dateFinValiditeTitreDemande &&
                    !isNaN(new Date(formData.dateFinValiditeTitreDemande).getTime()) ? (
                      <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/80 via-white to-blue-50/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <h3 className="text-sm font-semibold text-blue-900">Situation de votre titre de séjour</h3>
                          <p className="text-sm text-blue-800/95">
                            <span className="font-medium">
                              {titresSejourDemande.find((x) => x.value === formData.typeTitreDemande)?.label ||
                                formData.typeTitreDemande}
                            </span>
                            <span className="text-blue-700">
                              {' · '}
                              Fin de validité :{' '}
                              <strong>{formatDateCourte(new Date(formData.dateFinValiditeTitreDemande))}</strong>
                            </span>
                          </p>
                          <p className="text-[11px] text-blue-700/90">
                            Les analyses (période R.431-5, etc.) sont affichées ci-dessous. Déplier pour modifier.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsSituationTitreBlocExpanded(true)}
                          className="text-xs shrink-0 border-blue-300 text-blue-900 hover:bg-blue-100"
                        >
                          Modifier la saisie
                        </Button>
                      </div>
                    ) : (
                    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/80 via-white to-blue-50/40 p-4 space-y-4">
                      <h3 className="text-sm font-semibold text-blue-900">
                        Situation de votre titre de séjour
                      </h3>

                      {/* 1. Type de titre de séjour */}
                      <div className="space-y-2">
                        <Label htmlFor="typeTitreDemande">Type de titre de séjour *</Label>
                        <Select
                          id="typeTitreDemande"
                          value={formData.typeTitreDemande}
                          onChange={(e) => setFormData({ ...formData, typeTitreDemande: e.target.value })}
                          required
                          className="bg-white"
                        >
                          <option value="">-- Sélectionner --</option>
                          {titresSejourDemande.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </Select>
                      </div>

                      {/* 2. Date de fin de validité du titre (ou du visa) - format JJ/MM/AAAA, icône calendrier */}
                      <div className="space-y-2">
                        <Label htmlFor="dateFinValiditeTitreDemande">Date de fin de validité du titre (ou du visa) *</Label>
                        <div className="relative">
                          <Input
                            id="dateFinValiditeTitreDemande"
                            type="date"
                            value={formData.dateFinValiditeTitreDemande}
                            onChange={(e) => setFormData({ ...formData, dateFinValiditeTitreDemande: e.target.value })}
                            required
                            readOnly={isClient && !!userProfile?.dateExpiration}
                            disabled={isClient && !!userProfile?.dateExpiration}
                            className="pr-10 bg-white"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 text-lg" aria-hidden>📅</span>
                        </div>
                        {isClient && userProfile?.dateExpiration ? (
                          <p className="text-[11px] text-muted-foreground">Renseignée automatiquement depuis votre profil (Date d'expiration).</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Format jour/mois/année (JJ/MM/AAAA). Utilisez l'icône calendrier pour un choix rapide.</p>
                        )}
                      </div>

                      {/* 3. Date d'introduction de la demande complète (optionnel) */}
                      <div className="space-y-2">
                        <Label htmlFor="dateConfirmationDepotDemande">
                          Date d’introduction de la demande complète <span className="text-muted-foreground font-normal">(ce champ n’est pas obligatoire)</span>
                        </Label>
                        <div className="relative">
                          <Input
                            id="dateConfirmationDepotDemande"
                            type="date"
                            value={formData.dateConfirmationDepotDemande}
                            onChange={(e) => setFormData({ ...formData, dateConfirmationDepotDemande: e.target.value })}
                            max={(() => {
                              const d = new Date();
                              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                            })()}
                            className={`pr-10 bg-white ${dateErrors.dateConfirmationDepotDemande ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 text-lg" aria-hidden>📅</span>
                        </div>
                        {dateErrors.dateConfirmationDepotDemande ? (
                          <p className="text-[11px] text-red-600 font-medium">{dateErrors.dateConfirmationDepotDemande}</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Date de notification de la confirmation de dépôt de la demande (récepissé / accusé de réception).</p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-blue-200/60">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              typeTitreDemande: '',
                              dateFinValiditeTitreDemande: '',
                              natureDecisionDemande: '',
                              dateConfirmationDepotDemande: '',
                              dateNotificationRefusDemande: '',
                            });
                            setCalculs(null);
                            setIsSituationTitreBlocExpanded(true);
                            situationTitreBothPrevRef.current = false;
                          }}
                          className="text-xs text-blue-800 border-blue-300 hover:bg-blue-100 hover:border-blue-400"
                        >
                          Réinitialiser ce formulaire
                        </Button>
                      </div>
                    </div>
                    )}

                    {/* 1. Période d'introduction de la demande (R.431-5 CESEDA) — doc §29-45 */}
                    {formData.dateFinValiditeTitreDemande && (() => {
                      const dateFin = new Date(formData.dateFinValiditeTitreDemande);
                      if (isNaN(dateFin.getTime())) return null;
                      dateFin.setHours(0, 0, 0, 0);
                      const debutPeriode = new Date(dateFin.getTime() - 120 * 24 * 60 * 60 * 1000);
                      const finPeriode = new Date(dateFin.getTime() - 60 * 24 * 60 * 60 * 1000);
                      const aujourdhui = new Date();
                      aujourdhui.setHours(0, 0, 0, 0);

                      const dansPeriode = aujourdhui >= debutPeriode && aujourdhui <= finPeriode;
                      const avantPeriode = aujourdhui < debutPeriode;
                      const apresPeriode = aujourdhui > finPeriode;

                      const joursRestantsAvantZone2Mois = dansPeriode
                        ? Math.ceil((finPeriode.getTime() - aujourdhui.getTime()) / (24 * 60 * 60 * 1000))
                        : 0;

                      return (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <span className="h-px flex-1 bg-gray-200" />
                            <span>Période d’introduction de la demande (art. R.431-5 CESEDA)</span>
                            <span className="h-px flex-1 bg-gray-200" />
                          </div>

                          {avantPeriode && (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex gap-3 items-start">
                              <span className="text-lg">ℹ️</span>
                              <div className="space-y-1 text-sm">
                                <p className="font-semibold text-blue-900">La période de renouvellement n’est pas encore ouverte.</p>
                                <p className="text-blue-800">
                                  Période d’ouverture : du <strong>{formatDateCourte(debutPeriode)}</strong> au <strong>{formatDateCourte(finPeriode)}</strong> (entre quatre mois et deux mois avant la date de fin de validité du titre ou du visa).
                                </p>
                                <p className="text-xs text-blue-700">Référence : article R.431-5 du CESEDA.</p>
                              </div>
                            </div>
                          )}

                          {dansPeriode && (
                            <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex gap-3 items-start">
                              <span className="text-lg">✅</span>
                              <div className="space-y-1 text-sm">
                                <p className="font-semibold text-green-900">La période de renouvellement est ouverte.</p>
                                <p className="text-green-800">
                                  Le renouvellement (ou la première demande) doit être effectué entre quatre mois et deux mois avant la date de fin de validité, soit du{' '}
                                  <strong>{formatDateCourte(debutPeriode)}</strong> au <strong>{formatDateCourte(finPeriode)}</strong>.
                                </p>
                                <p className="text-green-800">
                                  Il reste <strong>{joursRestantsAvantZone2Mois} jour{joursRestantsAvantZone2Mois > 1 ? 's' : ''}</strong> avant d’entrer dans la zone des 2 mois (fin de la période légale de dépôt).
                                </p>
                                <p className="text-xs text-green-700">Référence : article R.431-5 du CESEDA.</p>
                              </div>
                            </div>
                          )}

                          {apresPeriode && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex gap-3 items-start">
                              <span className="text-lg">⚠️</span>
                              <div className="space-y-1 text-sm">
                                <p className="font-semibold text-red-900">La période légale de dépôt est dépassée.</p>
                                <p className="text-red-800">
                                  L’étranger devra payer un visa de régularisation de 180 euros qui doit être acquitté, sauf cas de force majeure ou présentation d’un visa en cours de validité.
                                </p>
                                <p className="text-red-800">
                                  L’administration n’a plus l’obligation de respecter les délais car l’étranger n’a pas été diligent.
                                </p>
                                <p className="text-xs text-red-700">Référence : article R.431-5 du CESEDA.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Si "Date d'introduction de la demande complète" est renseignée : choix unique (doc §56-64) */}
                    {formData.dateConfirmationDepotDemande && (
                      <div className="space-y-3 pt-2 border-t">
                        <h3 className="text-sm font-semibold text-foreground">Situation de votre demande</h3>
                        {!formData.natureDecisionDemande ? (
                          <>
                            <p className="text-xs text-muted-foreground">
                              Sélectionnez la situation qui correspond à votre cas. Une seule situation peut être retenue ; une fois choisie, les autres options disparaîtront jusqu’à réinitialisation.
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {typesDecisions.map((decision) => (
                                <label
                                  key={decision.value}
                                  htmlFor={`natureDecisionDemande-${decision.value}`}
                                  className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 px-3 py-2.5 text-sm cursor-pointer transition-colors"
                                >
                                  <input
                                    id={`natureDecisionDemande-${decision.value}`}
                                    type="radio"
                                    name="natureDecisionDemande"
                                    value={decision.value}
                                    checked={false}
                                    onChange={(e) =>
                                      setFormData({ ...formData, natureDecisionDemande: e.target.value })
                                    }
                                    className="mt-1 h-4 w-4 shrink-0 text-primary border-gray-300"
                                  />
                                  <span>{decision.label}</span>
                                </label>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="rounded-lg border border-primary bg-primary/5 text-foreground px-3 py-2.5 text-sm font-medium">
                              {typesDecisions.find((d) => d.value === formData.natureDecisionDemande)?.label}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  natureDecisionDemande: '',
                                  dateNotificationRefusDemande: '',
                                })
                              }
                              className="text-xs"
                            >
                              Changer de situation
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Timeline "Je n'ai pas reçu de réponse" : DIR, référé MU, demande motifs, référé suspension (doc §65-212) */}
                    {formData.dateConfirmationDepotDemande &&
                      formData.natureDecisionDemande === 'absence_reponse' &&
                      (() => {
                        const baseDate = new Date(formData.dateConfirmationDepotDemande);
                        if (isNaN(baseDate.getTime())) {
                          return (
                            <div ref={timelineAbsenceReponseRef} className="space-y-4 pt-4 border-t">
                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                Veuillez vérifier le format de la date d’introduction de la demande complète (format jour/mois/année).
                              </div>
                            </div>
                          );
                        }
                        baseDate.setHours(0, 0, 0, 0);
                        const typeTitre = formData.typeTitreDemande || 'autres';
                        const config = titresSejourDemande.find((t) => t.value === typeTitre) || titresSejourDemande.find((t) => t.value === 'autres')!;
                        const dateDIR = new Date(baseDate.getTime() + config.delaiDirJours * 24 * 60 * 60 * 1000);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dateLimiteMotifs = new Date(dateDIR.getTime() + 30 * 24 * 60 * 60 * 1000);
                        const dateFinRefereSuspension = new Date(dateDIR);
                        dateFinRefereSuspension.setMonth(dateFinRefereSuspension.getMonth() + 2);
                        const dateLimiteMuRecommandee = new Date(dateDIR.getTime() - 15 * 24 * 60 * 60 * 1000);

                        const statut = (dansDelai: boolean, pasEncore: boolean) => (pasEncore ? 'bleu' : dansDelai ? 'vert' : 'rouge');

                        return (
                          <div ref={timelineAbsenceReponseRef} className="space-y-4 pt-4 border-t" id="timeline-absence-reponse">
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              <span className="h-px flex-1 bg-gray-200" />
                              <span>Timeline — Absence de réponse (art. R.432-1 et R.432-2 CESEDA)</span>
                              <span className="h-px flex-1 bg-gray-200" />
                            </div>

                            {/* 1. Date de naissance de la décision implicite de rejet */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                              <div className="flex gap-3 items-start">
                                <span className="flex h-8 w-8 shrink-0 rounded-full bg-slate-200 text-slate-700 text-sm font-bold items-center justify-center">1</span>
                                <div className="space-y-2 text-sm">
                                  <h4 className="font-semibold text-slate-900">Date de naissance de la décision implicite de rejet</h4>
                                  <p className="text-slate-700">
                                    Selon les articles R.432-1 et R.432-2 du CESEDA, le silence de l’administration vaut décision implicite de rejet. Cette décision naît à l’expiration d’un délai qui dépend du type de titre sélectionné. Point de départ : la date d’introduction de la demande complète (notification de la confirmation de dépôt).
                                  </p>
                                  <p className="text-slate-800 font-medium">
                                    Pour <strong>{config.label}</strong> (art. {config.article}) : délai de <strong>{config.delaiDirJours} jours</strong> → date de naissance de la DIR : <strong>{formatDateCourte(dateDIR)}</strong>.
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    La décision implicite est une fiction juridique : elle ouvre les voies de recours sans signifier que la préfecture a refusé au fond. Il est possible qu’une réponse positive arrive plus tard.
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* 2. Référé mesures utiles */}
                            {(() => {
                              const pasEncore = today < baseDate;
                              const dansDelai = today >= baseDate && today <= dateDIR;
                              const depasse = today > dateDIR;
                              const couleur = statut(dansDelai, pasEncore);
                              const borderBg = couleur === 'bleu' ? 'border-blue-200 bg-blue-50' : couleur === 'vert' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50';
                              const textC = couleur === 'bleu' ? 'text-blue-800' : couleur === 'vert' ? 'text-green-800' : 'text-red-800';
                              const msg =
                                pasEncore
                                  ? 'La fenêtre ne sera ouverte qu’après la date de dépôt de votre demande.'
                                  : dansDelai
                                    ? `Déposez le référé au plus tard le ${formatDateCourte(dateLimiteMuRecommandee)} (15 jours avant la DIR) pour maximiser la recevabilité.`
                                    : 'Le référé mesures utiles n’est plus possible après la naissance de la DIR. Privilégiez une demande de communication des motifs puis, si besoin, un référé suspension.';
                              return (
                                <div className={`rounded-xl border p-4 ${borderBg}`}>
                                  <div className="flex gap-3 items-start">
                                    <span className="flex h-8 w-8 shrink-0 rounded-full bg-slate-700 text-white text-sm font-bold items-center justify-center">2</span>
                                    <div className="space-y-2 text-sm">
                                      <h4 className="font-semibold text-slate-900">Référé mesures utiles</h4>
                                      <p className="text-slate-700">
                                        À déposer avant la naissance de la DIR. Pour la recevabilité, de préférence au plus tard 15 jours avant la DIR ({formatDateCourte(dateLimiteMuRecommandee)}). Après la DIR, ce recours n’est plus possible → référé suspension (il est recommandé de demander d’abord la communication des motifs).
                                      </p>
                                      <p className={`font-medium ${textC}`}>{msg}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* 3. Demande de communication des motifs */}
                            {(() => {
                              const pasEncore = today < dateDIR;
                              const dansDelai = today >= dateDIR && today <= dateLimiteMotifs;
                              const depasse = today > dateLimiteMotifs;
                              const couleur = statut(dansDelai, pasEncore);
                              const borderBg = couleur === 'bleu' ? 'border-blue-200 bg-blue-50' : couleur === 'vert' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50';
                              const textC = couleur === 'bleu' ? 'text-blue-800' : couleur === 'vert' ? 'text-green-800' : 'text-red-800';
                              const msg =
                                pasEncore
                                  ? `Possible à partir du ${formatDateCourte(dateDIR)} (naissance de la DIR).`
                                  : dansDelai
                                    ? `Introduisez la demande dans les 30 jours suivant la DIR, soit avant le ${formatDateCourte(dateLimiteMotifs)}. L’administration dispose d’un mois pour répondre.`
                                    : 'Le délai de 30 jours pour demander les motifs est dépassé. Une demande de communication des motifs peut encore être utile avant un référé suspension ; faites-vous accompagner.';
                              return (
                                <div className={`rounded-xl border p-4 ${borderBg}`}>
                                  <div className="flex gap-3 items-start">
                                    <span className="flex h-8 w-8 shrink-0 rounded-full bg-slate-700 text-white text-sm font-bold items-center justify-center">3</span>
                                    <div className="space-y-2 text-sm">
                                      <h4 className="font-semibold text-slate-900">Demande de communication des motifs</h4>
                                      <p className="text-slate-700">
                                        À introduire dans les 30 jours après la naissance de la DIR (art. L232-4 CRPA). L’administration a 1 mois pour communiquer les motifs. En cas de réponse, le délai du recours contentieux est prorogé jusqu’à 2 mois après notification des motifs. Avant un référé suspension, il est fortement conseillé de demander les motifs (l’absence de réponse sous 30 jours peut entraîner l’illégalité de la DIR).
                                      </p>
                                      <p className={`font-medium ${textC}`}>{msg}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* 4. Référé suspension et recours en annulation */}
                            {(() => {
                              const pasEncore = today < dateDIR;
                              const dansDelai = today >= dateDIR && today <= dateFinRefereSuspension;
                              const couleur = statut(dansDelai, pasEncore);
                              const borderBg = couleur === 'bleu' ? 'border-blue-200 bg-blue-50' : couleur === 'vert' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50';
                              const textC = couleur === 'bleu' ? 'text-blue-800' : couleur === 'vert' ? 'text-green-800' : 'text-red-800';
                              const msg =
                                pasEncore
                                  ? `Le référé suspension n’est possible qu’à partir du ${formatDateCourte(dateDIR)}.`
                                  : dansDelai
                                    ? `Vous disposez d’un délai de 2 mois à compter de la DIR pour introduire le recours en annulation et, le cas échéant, le référé suspension (avant le ${formatDateCourte(dateFinRefereSuspension)}).`
                                    : 'Le délai de 2 mois est en principe écoulé. Une analyse personnalisée (information sur les délais, circonstances particulières) peut permettre d’identifier des voies de droit ; faites-vous accompagner.';
                              return (
                                <div className={`rounded-xl border p-4 ${borderBg}`}>
                                  <div className="flex gap-3 items-start">
                                    <span className="flex h-8 w-8 shrink-0 rounded-full bg-slate-700 text-white text-sm font-bold items-center justify-center">4</span>
                                    <div className="space-y-2 text-sm">
                                      <h4 className="font-semibold text-slate-900">Référé suspension et recours en annulation</h4>
                                      <p className="text-slate-700">
                                        Fondement : art. L.521-1 du code de justice administrative. Le référé suspension est possible à partir de la naissance de la DIR jusqu’à l’expiration d’un délai de 2 mois. Pour la recevabilité du référé suspension, un recours en annulation (recours au fond) doit être introduit ; les délais se calculent de la même façon. Si une demande de communication des motifs a été faite, les délais peuvent être décalés (2 mois à compter de la notification des motifs ou, à défaut de réponse, 2 mois à compter de l’expiration du délai de 30 jours).
                                      </p>
                                      <p className={`font-medium ${textC}`}>{msg}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                              Nous vous invitons à vous faire accompagner par la plateforme pour analyser votre situation et préparer vos démarches, en lien avec un avocat lorsque cela est nécessaire.
                            </div>
                          </div>
                        );
                      })()}

                    {/* Refus de titre ou refus d'enregistrement (doc §215-221) */}
                    {(formData.natureDecisionDemande === 'refus_titre' || formData.natureDecisionDemande === 'refus_enregistrement') && (
                        <div className="space-y-4 pt-4 border-t">
                          <div className="space-y-2">
                            <Label htmlFor="dateNotificationRefusDemande">Date de notification du refus *</Label>
                            <div className="relative">
                              <Input
                                id="dateNotificationRefusDemande"
                                type="date"
                                value={formData.dateNotificationRefusDemande}
                                onChange={(e) => setFormData({ ...formData, dateNotificationRefusDemande: e.target.value })}
                                className="pr-10 bg-white"
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 text-lg" aria-hidden>📅</span>
                            </div>
                          </div>

                          {formData.dateNotificationRefusDemande && (() => {
                            const dateNotif = new Date(formData.dateNotificationRefusDemande);
                            if (isNaN(dateNotif.getTime())) return null;
                            dateNotif.setHours(0, 0, 0, 0);
                            const dateFin2Mois = new Date(dateNotif);
                            dateFin2Mois.setMonth(dateFin2Mois.getMonth() + 2);
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const pasEncore = today < dateNotif;
                            const dansDelai = today >= dateNotif && today <= dateFin2Mois;
                            const depasse = today > dateFin2Mois;
                            const couleur = pasEncore ? 'bleu' : dansDelai ? 'vert' : 'rouge';
                            const borderBg = couleur === 'bleu' ? 'border-blue-200 bg-blue-50' : couleur === 'vert' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50';
                            const textC = couleur === 'bleu' ? 'text-blue-800' : couleur === 'vert' ? 'text-green-800' : 'text-red-800';
                            const msg = pasEncore
                              ? `Le délai ne court qu’à compter du ${formatDateCourte(dateNotif)}.`
                              : dansDelai
                                ? `Vous disposez d’un délai de 2 mois à compter de la notification du refus pour introduire le recours en annulation et, le cas échéant, le référé suspension (avant le ${formatDateCourte(dateFin2Mois)}).`
                                : 'Le délai de 2 mois est dépassé. Une analyse personnalisée peut permettre d’identifier des voies de droit ; faites-vous accompagner.';
                            return (
                              <>
                                <div className={`rounded-xl border p-4 ${borderBg}`}>
                                  <h4 className="font-semibold text-slate-900 mb-2">Référé suspension et recours en annulation (recours au fond)</h4>
                                  <p className="text-sm text-slate-700 mb-2">
                                    Le point de départ est la date de notification du refus. Le délai pour introduire le recours en annulation et le référé suspension est de 2 mois à compter de cette date.
                                  </p>
                                  <p className={`text-sm font-medium ${textC}`}>{msg}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                  En cas de refus explicite (titre de séjour ou enregistrement), il n’est pas possible de faire ni le référé mesures utiles ni la demande de communication des motifs : seuls le recours en annulation et le référé suspension sont concernés, à partir de la date de notification du refus.
                                </div>
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                  Nous vous invitons à vous faire accompagner par la plateforme pour préparer votre recours, en lien avec un avocat lorsque cela est nécessaire.
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                    {/* OQTF (doc §222-223) */}
                    {formData.natureDecisionDemande === 'oqtf' && (
                      <div className="space-y-3 pt-4 border-t">
                        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
                          <div className="flex gap-3 items-start">
                            <span className="text-2xl">⚠️</span>
                            <div className="space-y-2 text-sm">
                              <h4 className="font-semibold text-red-900">OQTF (obligation de quitter le territoire français)</h4>
                              <p className="text-red-800">
                                Nous vous invitons à vous faire accompagner sans attendre par la plateforme pour analyser votre situation et vos délais de recours.
                              </p>
                              <p className="text-red-800 font-medium">
                                L’accompagnement par un avocat peut être nécessaire pour contester une OQTF ou régulariser votre situation.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Recours contre refus de visa - en cours de conception */}
                {formData.situation === 'contentieux_visa' && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-6 text-center">
                      <p className="text-amber-800 font-semibold mb-2">✈️ Recours contre un refus de visa</p>
                      <p className="text-sm text-amber-700">
                        Cette page est en cours de conception et sera disponible prochainement.
                      </p>
                    </div>
                  </div>
                )}

              </form>

              {/* Résultats sous le formulaire : pas de doublon R.431-5 (déjà affiché dans le bloc « Situation de votre titre de séjour ») */}
              {calculs && calculs.type !== 'demande_periode' && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  {/* Résultats pour recours contre refus de visa */}
                  {calculs.type === 'contentieux_visa' && (
                    <div className="space-y-4">
                      {/* Message d'erreur si aucun recours n'est plus possible */}
                      {calculs.erreur && (
                        <div className="rounded-lg p-4 border-2 bg-red-50 border-red-500">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">🚫</span>
                            <div className="flex-1">
                              <h3 className="font-bold text-lg mb-2 text-red-800">Aucun recours possible</h3>
                              <p className="text-sm mb-3 text-red-700 font-semibold">{calculs.messageErreur}</p>
                              {calculs.dateConfirmationDepot && (
                                <div className="text-xs text-red-600 space-y-1">
                                  <p><strong>Date de confirmation du dépôt :</strong> {formatDateCourte(calculs.dateConfirmationDepot)}</p>
                                  <p><strong>Date limite (4 mois après dépôt) :</strong> {formatDateCourte(calculs.dateLimite4Mois)}</p>
                                  {calculs.joursDepuis4Mois && (
                                    <p><strong>Délai dépassé depuis :</strong> {calculs.joursDepuis4Mois} jour(s)</p>
                                  )}
            </div>
                              )}
          </div>
                          </div>
                        </div>
                      )}

                      {/* Message d'information si plus de 4 mois */}
                      {calculs.demandeRapo && !calculs.erreur && (
                        <div className="rounded-lg p-4 border-2 bg-orange-50 border-orange-400">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">⚠️</span>
                            <div className="flex-1">
                              <h3 className="font-bold text-lg mb-2 text-orange-800">Attention</h3>
                              <p className="text-sm mb-3 text-orange-700">{calculs.message}</p>
                              <p className="text-xs text-orange-600 mb-3">
                                Si vous avez déposé un Recours Administratif Préalable Obligatoire (RAPO) avant l'expiration du délai de 4 mois, vous pouvez continuer en renseignant la date de dépôt du RAPO dans le champ ci-dessous.
                              </p>
                              {calculs.dateConfirmationDepot && (
                                <div className="text-xs text-orange-600 space-y-1">
                                  <p><strong>Date de confirmation du dépôt :</strong> {formatDateCourte(calculs.dateConfirmationDepot)}</p>
                                  <p><strong>Date limite (4 mois après dépôt) :</strong> {formatDateCourte(calculs.dateLimite4Mois)}</p>
                                  {calculs.joursDepuis4Mois && (
                                    <p><strong>Délai dépassé depuis :</strong> {calculs.joursDepuis4Mois} jour(s)</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Message de demande de date de dépôt RAPO */}
                      {calculs.demandeDateRapo && !calculs.erreur && (
                        <div className="rounded-lg p-4 border-2 bg-blue-50 border-blue-400">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">📅</span>
                            <div className="flex-1">
                              <h3 className="font-bold text-lg mb-2 text-blue-800">Date de dépôt requise</h3>
                              <p className="text-sm mb-3 text-blue-700">{calculs.message}</p>
                              
                              {/* Champ de date directement dans le message */}
                              <div className="bg-white rounded-lg p-3 border border-blue-200 mb-3">
                                <Label htmlFor="dateDepotRapoMessage" className="text-blue-800 mb-2">Date de dépôt du RAPO *</Label>
                                <Input
                                  id="dateDepotRapoMessage"
                                  type="date"
                                  value={formData.dateDepotRapo}
                                  onChange={(e) => setFormData({ ...formData, dateDepotRapo: e.target.value })}
                                  required
                                  className="w-full"
                                />
                                <p className="text-xs text-blue-600 mt-2">
                                  Indiquez la date à laquelle vous avez déposé votre RAPO pour calculer les délais qui suivent (réponse de la commission, recours tribunal, etc.).
                                </p>
                              </div>
                              
                              {calculs.dateConfirmationDepot && (
                                <div className="text-xs text-blue-600 space-y-1">
                                  <p><strong>Date de confirmation du dépôt :</strong> {formatDateCourte(calculs.dateConfirmationDepot)}</p>
                                  <p><strong>Date limite (4 mois après dépôt) :</strong> {formatDateCourte(calculs.dateLimite4Mois)}</p>
                                  {calculs.joursDepuis4Mois && (
                                    <p><strong>Délai dépassé depuis :</strong> {calculs.joursDepuis4Mois} jour(s)</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Message principal (si pas d'erreur) */}
                      {!calculs.erreur && !calculs.demandeRapo && calculs.messagePersonnalise && (
                      <div className={`rounded-lg p-4 border-2 ${
                        calculs.joursRestantsRapo && calculs.joursRestantsRapo <= 7
                          ? 'bg-red-50 border-red-300' 
                          : calculs.rapoDansDelais
                          ? 'bg-orange-50 border-orange-300' 
                          : 'bg-green-50 border-green-300'
                      }`}>
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">
                            {calculs.joursRestantsRapo && calculs.joursRestantsRapo <= 7 ? '⚠️' : calculs.rapoDansDelais ? '⏰' : '✅'}
                          </span>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg mb-2">
                              {calculs.joursRestantsRapo && calculs.joursRestantsRapo <= 7 
                                ? `URGENT - RAPO (${calculs.joursRestantsRapo} jour(s) restant${calculs.joursRestantsRapo > 1 ? 's' : ''} pour déposer)` 
                                : calculs.joursRestantsRapo !== null && calculs.joursRestantsRapo !== undefined && !formData.dateDepotRapo
                                ? `RAPO - Délai pour déposer : ${calculs.joursRestantsRapo} jour(s) restant${calculs.joursRestantsRapo > 1 ? 's' : ''}`
                                : 'Recours contre refus de visa'}
                            </h3>
                            <p className="text-sm mb-3">{calculs.messagePersonnalise}</p>
                          </div>
                        </div>
                      </div>
                      )}

                      {/* Timeline */}
                      {calculs.timeline && calculs.timeline.length > 0 && (
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <span>📅</span>
                            <span>Timeline des délais</span>
                          </h3>
                          <div className="space-y-3">
                            {calculs.timeline.map((item: any, index: number) => {
                              const isPast = item.date < new Date();
                              const isUrgent = item.urgent || false;
                              
                              return (
                                <div key={index} className={`flex items-start gap-3 p-3 rounded-lg border ${
                                  isUrgent && !isPast
                                    ? 'bg-red-50 border-red-300'
                                    : isPast
                                    ? 'bg-gray-50 border-gray-200'
                                    : 'bg-blue-50 border-blue-200'
                                }`}>
                                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                                    isUrgent && !isPast
                                      ? 'bg-red-500'
                                      : isPast
                                      ? 'bg-gray-400'
                                      : 'bg-blue-500'
                                  }`}></div>
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                      <p className={`text-sm font-semibold ${
                                        isUrgent && !isPast ? 'text-red-800' : isPast ? 'text-gray-600' : 'text-blue-800'
                                      }`}>
                                        {item.label}
                                      </p>
                                      <span className={`text-xs px-2 py-1 rounded ${
                                        isUrgent && !isPast
                                          ? 'bg-red-200 text-red-800'
                                          : isPast
                                          ? 'bg-gray-200 text-gray-600'
                                          : 'bg-blue-200 text-blue-800'
                                      }`}>
                                        {formatDateCourte(item.date)}
                                      </span>
                                    </div>
                                    {isUrgent && !isPast && (
                                      <p className="text-xs text-red-600 font-medium">⚠️ Date limite urgente</p>
                                    )}
                                    {isPast && (
                                      <p className="text-xs text-gray-500">✓ Date passée</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Détails RAPO - seulement si aucun RAPO n'a été déposé */}
                      {!calculs.erreur && !calculs.demandeRapo && calculs.dateDebutRapo && calculs.dateLimiteRapo && !formData.dateDepotRapo && (
                        <div className="bg-orange-50 rounded-lg p-4 border border-primary/30">
                          <h4 className="font-semibold text-sm text-orange-800 mb-2">Détails RAPO</h4>
                          <div className="text-xs space-y-1">
                            <p><strong>Début possible :</strong> {formatDateCourte(calculs.dateDebutRapo)}</p>
                            <p><strong>Date limite :</strong> {formatDateCourte(calculs.dateLimiteRapo)}</p>
                            {calculs.joursRestantsRapo !== null && (
                              <p>
                                <strong>Jours restants :</strong> 
                                <span className={`ml-2 px-2 py-0.5 rounded ${
                                  calculs.joursRestantsRapo <= 7
                                    ? 'bg-red-200 text-red-800 font-bold'
                                    : calculs.rapoDansDelais
                                    ? 'bg-orange-200 text-orange-800'
                                    : 'bg-green-200 text-green-800'
                                }`}>
                                  {calculs.joursRestantsRapo} jour(s)
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Détails Commission (si RAPO déposé) */}
                      {!calculs.erreur && !calculs.demandeRapo && !calculs.demandeDateRapo && formData.dateDepotRapo && calculs.dateLimiteReponseCommission && (
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                          <h4 className="font-semibold text-sm text-blue-800 mb-2">Détails Commission</h4>
                          <div className="text-xs space-y-1">
                            <p><strong>Date de dépôt du RAPO :</strong> {formatDateCourte(new Date(formData.dateDepotRapo))}</p>
                            <p><strong>Date limite de réponse :</strong> {formatDateCourte(calculs.dateLimiteReponseCommission)}</p>
                            {calculs.joursRestantsCommission !== undefined && (
                              <p>
                                <strong>Jours restants :</strong> 
                                <span className={`ml-2 px-2 py-0.5 rounded ${
                                  calculs.joursRestantsCommission <= 7
                                    ? 'bg-red-200 text-red-800 font-bold'
                                    : calculs.joursRestantsCommission <= 30
                                    ? 'bg-orange-200 text-orange-800'
                                    : 'bg-green-200 text-green-800'
                                }`}>
                                  {calculs.joursRestantsCommission} jour(s)
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Détails Tribunal */}
                      {!calculs.erreur && !calculs.demandeRapo && !calculs.demandeDateRapo && calculs.dateDebutTribunal && calculs.dateFinTribunal && (
                        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                          <h4 className="font-semibold text-sm text-purple-800 mb-2">Détails Recours Tribunal</h4>
                          <div className="text-xs space-y-1">
                            <p><strong>Début possible :</strong> {formatDateCourte(calculs.dateDebutTribunal)}</p>
                            <p><strong>Date limite :</strong> {formatDateCourte(calculs.dateFinTribunal)}</p>
                            {calculs.joursRestantsTribunal !== null && (
                              <p>
                                <strong>Jours restants :</strong> 
                                <span className={`ml-2 px-2 py-0.5 rounded ${
                                  calculs.joursRestantsTribunal <= 7
                                    ? 'bg-red-200 text-red-800 font-bold'
                                    : calculs.joursRestantsTribunal <= 30
                                    ? 'bg-orange-200 text-orange-800'
                                    : 'bg-green-200 text-green-800'
                                }`}>
                                  {calculs.joursRestantsTribunal} jour(s)
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Rappel légal motifs */}
                      {!calculs.erreur && !calculs.demandeRapo && !calculs.demandeDateRapo && (
                        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                          <h4 className="font-semibold text-sm text-yellow-800 mb-2">📋 Rappel légal</h4>
                          <ul className="text-xs text-yellow-700 space-y-1">
                            <li>• <strong>Refus explicite :</strong> Délai de 30 jours après la notification pour demander communication des motifs</li>
                            <li>• <strong>Refus implicite :</strong> Délai de 30 jours après la naissance du rejet implicite (4 mois après dépôt)</li>
                            <li>• <strong>RAPO :</strong> Délai de 30 jours à compter du refus (explicite ou implicite)</li>
                            <li>• <strong>Recours tribunal :</strong> Délai de 2 mois après réception de la réponse RAPO ou après demande de motifs</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {calculs.type === 'demande' && calculs.renouvellement && calculs.renouvellement.messagePersonnalise && (
                    <div className={`rounded-lg p-4 border-2 ${
                      calculs.renouvellement.enRetard 
                        ? 'bg-red-50 border-red-300' 
                        : calculs.renouvellement.risqueRupture 
                        ? 'bg-orange-50 border-orange-300' 
                        : 'bg-green-50 border-green-300'
                    }`}>
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{calculs.renouvellement.enRetard ? '⚠️' : calculs.renouvellement.risqueRupture ? '⏰' : '✅'}</span>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg mb-2">
                            {calculs.renouvellement.enRetard ? 'RENOUVELLEMENT URGENT' : calculs.renouvellement.risqueRupture ? 'RENOUVELLEMENT RECOMMANDÉ' : 'RENOUVELLEMENT'}
                          </h3>
                          <p className="text-sm mb-2">{calculs.renouvellement.messagePersonnalise}</p>
                          <div className="text-xs space-y-1">
                            <p><strong>Date d'expiration :</strong> {formatDateCourte(calculs.renouvellement.dateExpiration)}</p>
                            <p><strong>Jours avant expiration :</strong> <span className={getAlertColor(calculs.renouvellement.joursAvantExpiration).split(' ')[0]}>{calculs.renouvellement.joursAvantExpiration} jour(s)</span></p>
                            <p><strong>Période recommandée :</strong> {calculs.renouvellement.periodeRecommandee}</p>
                            <p><strong>Date recommandée min :</strong> {formatDateCourte(calculs.renouvellement.dateRecommandeeMin)}</p>
                            <p><strong>Date recommandée max :</strong> {formatDateCourte(calculs.renouvellement.dateRecommandeeMax)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {calculs.type === 'demande' && calculs.premiereDemande && (
                    <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-300">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">✅</span>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg mb-2">Première demande</h3>
                          <p className="text-sm">{calculs.premiereDemande.message}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Délai recommandé : {calculs.premiereDemande.delaiRecommandé} mois avant le début
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Affichage du calcul détaillé de renouvellement */}
                  {calculs.type === 'renouvellement_detaille' && (
                    <div className={`rounded-lg p-6 border-2 ${
                      calculs.couleur === 'green' 
                        ? 'bg-green-50 border-green-300' 
                        : calculs.couleur === 'red'
                        ? 'bg-red-50 border-red-300'
                        : 'bg-blue-50 border-blue-300'
                    }`}>
                      <div className="flex items-start gap-3 mb-4">
                        <span className="text-3xl">
                          {calculs.couleur === 'green' ? '✅' : calculs.couleur === 'red' ? '⚠️' : 'ℹ️'}
                        </span>
                        <div className="flex-1">
                          <h3 className={`font-bold text-xl mb-2 ${
                            calculs.couleur === 'green' 
                              ? 'text-green-800' 
                              : calculs.couleur === 'red'
                              ? 'text-red-800'
                              : 'text-blue-800'
                          }`}>
                            {calculs.message.titre}
                          </h3>
                          <p className={`text-sm mb-3 ${
                            calculs.couleur === 'green' 
                              ? 'text-green-700' 
                              : calculs.couleur === 'red'
                              ? 'text-red-700'
                              : 'text-blue-700'
                          }`}>
                            {calculs.message.corps}
                          </p>
                          {calculs.message.details && (
                            <p className={`text-sm mb-3 ${
                              calculs.couleur === 'green' 
                                ? 'text-green-700' 
                                : calculs.couleur === 'red'
                                ? 'text-red-700'
                                : 'text-blue-700'
                            }`}>
                              {calculs.message.details}
                            </p>
                          )}
                          {calculs.message.periode && (
                            <p className={`text-sm mb-2 ${
                              calculs.couleur === 'green' 
                                ? 'text-green-700' 
                                : calculs.couleur === 'red'
                                ? 'text-red-700'
                                : 'text-blue-700'
                            }`}>
                              {calculs.message.periode}
                            </p>
                          )}
                          {calculs.message.periodeLegale && (
                            <p className={`text-sm mb-2 font-semibold ${
                              calculs.couleur === 'red' ? 'text-red-800' : 'text-gray-700'
                            }`}>
                              {calculs.message.periodeLegale}
                            </p>
                          )}
                          {calculs.message.dateOuverture && (
                            <p className={`text-sm mb-2 font-semibold text-green-700`}>
                              {calculs.message.dateOuverture}
                            </p>
                          )}
                          {calculs.message.delaiRestant && (
                            <p className={`text-sm mb-2 font-semibold ${
                              calculs.couleur === 'red' ? 'text-red-800' : 'text-blue-800'
                            }`}>
                              {calculs.message.delaiRestant}
                            </p>
                          )}
                          <div className={`mt-4 p-3 rounded-lg border ${
                            calculs.couleur === 'green' 
                              ? 'bg-green-100 border-green-300' 
                              : calculs.couleur === 'red'
                              ? 'bg-red-100 border-red-300'
                              : 'bg-yellow-100 border-yellow-300'
                          }`}>
                            <p className={`text-xs font-semibold ${
                              calculs.couleur === 'green' 
                                ? 'text-green-800' 
                                : calculs.couleur === 'red'
                                ? 'text-red-800'
                                : 'text-yellow-800'
                            }`}>
                              ⚠️ Avertissement important :
                            </p>
                            <p className={`text-xs mt-1 ${
                              calculs.couleur === 'green' 
                                ? 'text-green-700' 
                                : calculs.couleur === 'red'
                                ? 'text-red-700'
                                : 'text-yellow-700'
                            }`}>
                              {calculs.message.avertissement}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Questions conditionnelles */}
                      <div className="mt-6 space-y-4 border-t pt-4">
                        <div className="space-y-2">
                          <Label className="font-semibold">Avez-vous déposé le renouvellement de votre titre de séjour ? *</Label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="renouvellementDepose"
                                value="oui"
                                checked={formData.renouvellementDepose === true}
                                onChange={() => setFormData({ ...formData, renouvellementDepose: true })}
                                className="w-4 h-4 text-primary"
                              />
                              <span className="text-sm">Oui</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="renouvellementDepose"
                                value="non"
                                checked={formData.renouvellementDepose === false}
                                onChange={() => setFormData({ 
                                  ...formData, 
                                  renouvellementDepose: false,
                                  confirmationDepotRenouvellement: null,
                                  dateConfirmationDepotRenouvellement: ''
                                })}
                                className="w-4 h-4 text-primary"
                              />
                              <span className="text-sm">Non</span>
                            </label>
                          </div>
                        </div>

                        {/* Si Non : Message d'invitation */}
                        {formData.renouvellementDepose === false && (
                          <div className="bg-orange-50 rounded-lg p-4 border border-primary/30">
                            <p className="text-sm text-orange-800 font-semibold mb-2">📋 Action requise</p>
                            <p className="text-sm text-orange-700 mb-2">
                              Nous vous invitons à déposer immédiatement votre demande de renouvellement. 
                              Notre plateforme peut vous accompagner dans cette démarche.
                            </p>
                            <p className="text-sm text-orange-700 mb-3">
                              N'hésitez pas à nous contacter pour obtenir de l'aide dans le dépôt de votre demande.
                            </p>
                            <div className="flex gap-2">
                              <Link href="/contact">
                                <Button variant="default" size="sm" className="text-xs">
                                  Nous contacter
                                </Button>
                              </Link>
                            </div>
                          </div>
                        )}

                        {/* Si Oui : Question sur la confirmation */}
                        {formData.renouvellementDepose === true && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="font-semibold">Avez-vous obtenu la confirmation de dépôt de la demande ? *</Label>
                              <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="confirmationDepotRenouvellement"
                                    value="oui"
                                    checked={formData.confirmationDepotRenouvellement === true}
                                    onChange={() => setFormData({ ...formData, confirmationDepotRenouvellement: true })}
                                    className="w-4 h-4 text-primary"
                                  />
                                  <span className="text-sm">Oui</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="confirmationDepotRenouvellement"
                                    value="non"
                                    checked={formData.confirmationDepotRenouvellement === false}
                                    onChange={() => setFormData({ 
                                      ...formData, 
                                      confirmationDepotRenouvellement: false,
                                      dateConfirmationDepotRenouvellement: ''
                                    })}
                                    className="w-4 h-4 text-primary"
                                  />
                                  <span className="text-sm">Non</span>
                                </label>
                              </div>
                            </div>

                            {/* Si Oui : Champ date de confirmation */}
                            {formData.confirmationDepotRenouvellement === true && (
                              <div className="space-y-2">
                                <Label htmlFor="dateConfirmationDepotRenouvellement">Date de confirmation du dépôt de la demande de titre de séjour *</Label>
                                <Input
                                  id="dateConfirmationDepotRenouvellement"
                                  type="date"
                                  value={formData.dateConfirmationDepotRenouvellement}
                                  onChange={(e) => setFormData({ ...formData, dateConfirmationDepotRenouvellement: e.target.value })}
                                  required
                                />
                                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 mt-2">
                                  <p className="text-xs text-blue-800 mb-2">
                                    💡 En fonction de la réponse de la préfecture ou de l'absence de réponse, vous avez la possibilité d'introduire des recours en fonction de la situation.
                                  </p>
                                  <p className="text-xs text-blue-800 mb-2">
                                    Consultez la page qui permet le calcul des délais de recours pour plus d'informations.
                                  </p>
                                  <Link href="/calculateur">
                                    <Button variant="outline" size="sm" className="text-xs mt-2">
                                      Calculer les délais de recours
                                    </Button>
                                  </Link>
                                </div>
                              </div>
                            )}

                            {/* Si Non : Message d'alerte */}
                            {formData.confirmationDepotRenouvellement === false && (
                              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                                <p className="text-sm text-yellow-800 font-semibold mb-2">⚠️ Alerte</p>
                                <p className="text-sm text-yellow-700 mb-2">
                                  Veuillez renseigner la date de confirmation de la demande dès que vous l'obtiendrez.
                                </p>
                                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 mt-2">
                                  <p className="text-xs text-blue-800 mb-2">
                                    💡 En fonction de la réponse de la préfecture ou de l'absence de réponse, vous avez la possibilité d'introduire des recours en fonction de la situation.
                                  </p>
                                  <p className="text-xs text-blue-800 mb-2">
                                    Consultez la page qui permet le calcul des délais de recours pour plus d'informations.
                                  </p>
                                  <Link href="/calculateur">
                                    <Button variant="outline" size="sm" className="text-xs mt-2">
                                      Calculer les délais de recours
                                    </Button>
                                  </Link>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bouton de téléchargement PDF */}
                      <div className="mt-6 flex justify-center">
                        <Button
                          variant="default"
                          onClick={isAuthenticated ? genererPDFRenouvellement : () => router.push('/auth/signin')}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          {isAuthenticated ? '📄 Télécharger le rapport PDF' : 'Se connecter pour télécharger le rapport PDF'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Affichage du calcul détaillé de première demande */}
                  {calculs.type === 'premiere_demande_detaille' && (
                    <div className={`rounded-lg p-6 border-2 ${
                      calculs.couleur === 'green' 
                        ? 'bg-green-50 border-green-300' 
                        : calculs.couleur === 'red'
                        ? 'bg-red-50 border-red-300'
                        : calculs.couleur === 'orange'
                        ? 'bg-orange-50 border-orange-300'
                        : 'bg-blue-50 border-blue-300'
                    }`}>
                      <div className="flex items-start gap-3 mb-4">
                        <span className="text-3xl">
                          {calculs.couleur === 'green' ? '✅' : calculs.couleur === 'red' ? '⚠️' : calculs.couleur === 'orange' ? '🔴' : 'ℹ️'}
                        </span>
                        <div className="flex-1">
                          <h3 className={`font-bold text-xl mb-2 ${
                            calculs.couleur === 'green' 
                              ? 'text-green-800' 
                              : calculs.couleur === 'red'
                              ? 'text-red-800'
                              : calculs.couleur === 'orange'
                              ? 'text-orange-800'
                              : 'text-blue-800'
                          }`}>
                            {calculs.message.titre}
                          </h3>
                          <p className={`text-sm mb-3 ${
                            calculs.couleur === 'green' 
                              ? 'text-green-700' 
                              : calculs.couleur === 'red'
                              ? 'text-red-700'
                              : calculs.couleur === 'orange'
                              ? 'text-orange-700'
                              : 'text-blue-700'
                          }`}>
                            {calculs.message.corps}
                          </p>
                          {calculs.message.details && (
                            <p className={`text-sm mb-3 ${
                              calculs.couleur === 'green' 
                                ? 'text-green-700' 
                                : calculs.couleur === 'red'
                                ? 'text-red-700'
                                : calculs.couleur === 'orange'
                                ? 'text-orange-700'
                                : 'text-blue-700'
                            }`}>
                              {calculs.message.details}
                            </p>
                          )}
                          {calculs.message.periode && (
                            <p className={`text-sm mb-2 ${
                              calculs.couleur === 'green' 
                                ? 'text-green-700' 
                                : calculs.couleur === 'red'
                                ? 'text-red-700'
                                : calculs.couleur === 'orange'
                                ? 'text-orange-700'
                                : 'text-blue-700'
                            }`}>
                              {calculs.message.periode}
                            </p>
                          )}
                          {calculs.message.periodeLegale && (
                            <p className={`text-sm mb-2 font-semibold ${
                              calculs.couleur === 'red' || calculs.couleur === 'orange' ? 'text-red-800' : 'text-gray-700'
                            }`}>
                              {calculs.message.periodeLegale}
                            </p>
                          )}
                          {calculs.message.dateOuverture && (
                            <p className={`text-sm mb-2 font-semibold text-green-700`}>
                              {calculs.message.dateOuverture}
                            </p>
                          )}
                          {calculs.message.delaiRestant && (
                            <p className={`text-sm mb-2 font-semibold ${
                              calculs.couleur === 'red' ? 'text-red-800' : calculs.couleur === 'orange' ? 'text-orange-800' : 'text-blue-800'
                            }`}>
                              {calculs.message.delaiRestant}
                            </p>
                          )}
                          <div className={`mt-4 p-3 rounded-lg border ${
                            calculs.couleur === 'green' 
                              ? 'bg-green-100 border-green-300' 
                              : calculs.couleur === 'red'
                              ? 'bg-red-100 border-red-300'
                              : calculs.couleur === 'orange'
                              ? 'bg-orange-100 border-orange-300'
                              : 'bg-yellow-100 border-yellow-300'
                          }`}>
                            <p className={`text-xs font-semibold ${
                              calculs.couleur === 'green' 
                                ? 'text-green-800' 
                                : calculs.couleur === 'red'
                                ? 'text-red-800'
                                : calculs.couleur === 'orange'
                                ? 'text-orange-800'
                                : 'text-yellow-800'
                            }`}>
                              ⚠️ Avertissement important :
                            </p>
                            <p className={`text-xs mt-1 ${
                              calculs.couleur === 'green' 
                                ? 'text-green-700' 
                                : calculs.couleur === 'red'
                                ? 'text-red-700'
                                : calculs.couleur === 'orange'
                                ? 'text-orange-700'
                                : 'text-yellow-700'
                            }`}>
                              {calculs.message.avertissement}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Questions conditionnelles */}
                      <div className="mt-6 space-y-4 border-t pt-4">
                        <div className="space-y-2">
                          <Label className="font-semibold">Avez-vous déposé la première demande de votre titre de séjour ? *</Label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="renouvellementDepose"
                                value="oui"
                                checked={formData.renouvellementDepose === true}
                                onChange={() => setFormData({ ...formData, renouvellementDepose: true })}
                                className="w-4 h-4 text-primary"
                              />
                              <span className="text-sm">Oui</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="renouvellementDepose"
                                value="non"
                                checked={formData.renouvellementDepose === false}
                                onChange={() => setFormData({ 
                                  ...formData, 
                                  renouvellementDepose: false,
                                  confirmationDepotRenouvellement: null,
                                  dateConfirmationDepotRenouvellement: ''
                                })}
                                className="w-4 h-4 text-primary"
                              />
                              <span className="text-sm">Non</span>
                            </label>
                          </div>
                        </div>

                        {/* Si Non : Message d'invitation */}
                        {formData.renouvellementDepose === false && (
                          <div className="bg-orange-50 rounded-lg p-4 border border-primary/30">
                            <p className="text-sm text-orange-800 font-semibold mb-2">📋 Action requise</p>
                            <p className="text-sm text-orange-700 mb-2">
                              Nous vous invitons à déposer immédiatement votre première demande de titre de séjour. 
                              Notre plateforme peut vous accompagner dans cette démarche.
                            </p>
                            <p className="text-sm text-orange-700 mb-3">
                              N'hésitez pas à nous contacter pour obtenir de l'aide dans le dépôt de votre demande.
                            </p>
                            <div className="flex gap-2">
                              <Link href="/contact">
                                <Button variant="default" size="sm" className="text-xs">
                                  Nous contacter
                                </Button>
                              </Link>
                            </div>
                          </div>
                        )}

                        {/* Si Oui : Question sur la confirmation */}
                        {formData.renouvellementDepose === true && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="font-semibold">Avez-vous obtenu la confirmation de dépôt de la demande ? *</Label>
                              <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="confirmationDepotRenouvellement"
                                    value="oui"
                                    checked={formData.confirmationDepotRenouvellement === true}
                                    onChange={() => setFormData({ ...formData, confirmationDepotRenouvellement: true })}
                                    className="w-4 h-4 text-primary"
                                  />
                                  <span className="text-sm">Oui</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="confirmationDepotRenouvellement"
                                    value="non"
                                    checked={formData.confirmationDepotRenouvellement === false}
                                    onChange={() => setFormData({ 
                                      ...formData, 
                                      confirmationDepotRenouvellement: false,
                                      dateConfirmationDepotRenouvellement: ''
                                    })}
                                    className="w-4 h-4 text-primary"
                                  />
                                  <span className="text-sm">Non</span>
                                </label>
                              </div>
                            </div>

                            {/* Si Oui : Champ date de confirmation */}
                            {formData.confirmationDepotRenouvellement === true && (
                              <div className="space-y-2">
                                <Label htmlFor="dateConfirmationDepotRenouvellement">Date de confirmation du dépôt de la demande de titre de séjour *</Label>
                                <Input
                                  id="dateConfirmationDepotRenouvellement"
                                  type="date"
                                  value={formData.dateConfirmationDepotRenouvellement}
                                  onChange={(e) => setFormData({ ...formData, dateConfirmationDepotRenouvellement: e.target.value })}
                                  required
                                />
                                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 mt-2">
                                  <p className="text-xs text-blue-800 mb-2">
                                    💡 En fonction de la réponse de la préfecture ou de l'absence de réponse, vous avez la possibilité d'introduire des recours en fonction de la situation.
                                  </p>
                                  <p className="text-xs text-blue-800 mb-2">
                                    Consultez la page qui permet le calcul des délais de recours pour plus d'informations.
                                  </p>
                                  <Link href="/calculateur">
                                    <Button variant="outline" size="sm" className="text-xs mt-2">
                                      Calculer les délais de recours
                                    </Button>
                                  </Link>
                                </div>
                              </div>
                            )}

                            {/* Si Non : Message d'alerte */}
                            {formData.confirmationDepotRenouvellement === false && (
                              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                                <p className="text-sm text-yellow-800 font-semibold mb-2">⚠️ Alerte</p>
                                <p className="text-sm text-yellow-700 mb-2">
                                  Veuillez renseigner la date de confirmation de la demande dès que vous l'obtiendrez.
                                </p>
                                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 mt-2">
                                  <p className="text-xs text-blue-800 mb-2">
                                    💡 En fonction de la réponse de la préfecture ou de l'absence de réponse, vous avez la possibilité d'introduire des recours en fonction de la situation.
                                  </p>
                                  <p className="text-xs text-blue-800 mb-2">
                                    Consultez la page qui permet le calcul des délais de recours pour plus d'informations.
                                  </p>
                                  <Link href="/calculateur">
                                    <Button variant="outline" size="sm" className="text-xs mt-2">
                                      Calculer les délais de recours
                                    </Button>
                                  </Link>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bouton de téléchargement PDF */}
                      <div className="mt-6 flex justify-center">
                        <Button
                          variant="default"
                          onClick={genererPDFPremiereDemande}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          📄 Télécharger le rapport PDF
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Colonne 3 : Explications (à l'extrémité droite) */}
          <div className="w-full lg:w-auto lg:flex-shrink-0 lg:self-start">
            <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all lg:sticky lg:top-24 lg:w-80">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">ℹ️</span>
                </div>
                <h2 className="text-xl font-bold text-foreground">Explications</h2>
              </div>

              {formData.situation === 'demande' && !formData.typeTitreDemande && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📚</div>
                  <p className="text-muted-foreground">
                    Sélectionnez un type de titre pour voir les informations détaillées
                  </p>
                </div>
              )}

              {formData.situation === 'demande' && formData.typeTitreDemande && (() => {
                const config = titresSejourDemande.find((t) => t.value === formData.typeTitreDemande);
                if (!config) return null;
                const delaiTexte = config.delaiDirJours === 120 ? '4 mois' : config.delaiDirJours === 90 ? '90 jours (3 mois)' : '60 jours (2 mois)';
                return (
                  <div className="space-y-4">
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <h3 className="font-semibold mb-2 text-slate-900">Titre sélectionné</h3>
                      <p className="text-sm font-medium text-slate-800">{config.label}</p>
                      <p className="text-xs text-slate-600 mt-1">Article CESEDA : {config.article}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                      <h3 className="font-semibold mb-2 text-amber-900">Décision implicite de rejet (DIR)</h3>
                      <p className="text-sm text-amber-800 mb-2">
                        En l’absence de réponse de la préfecture, le silence vaut refus implicite après <strong>{delaiTexte}</strong> à compter de la date de notification de la confirmation de dépôt (art. R.432-1 et R.432-2 CESEDA).
                      </p>
                      <p className="text-xs text-amber-700">
                        La DIR ouvre les voies de recours ; elle ne signifie pas que la préfecture a refusé au fond.
                      </p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <h3 className="font-semibold mb-2 text-blue-800">Recours possibles</h3>
                      <ul className="space-y-2 text-sm text-blue-800">
                        <li className="flex items-start gap-2">
                          <span>•</span>
                          <span><strong>Référé mesures utiles</strong> : avant la naissance de la DIR (idéalement au plus tard 15 jours avant).</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span>•</span>
                          <span><strong>Demande de communication des motifs</strong> : dans les 30 jours suivant la DIR ; l’administration a 1 mois pour répondre.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span>•</span>
                          <span><strong>Référé suspension et recours en annulation</strong> : à partir de la DIR jusqu’à 2 mois après (art. L.521-1 CJA).</span>
                        </li>
                      </ul>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                      <h3 className="font-semibold mb-2 text-green-800">Délais clés</h3>
                      <ul className="space-y-1 text-sm text-green-800">
                        <li>• Période de dépôt : 4 à 2 mois avant la fin de validité du titre (R.431-5)</li>
                        <li>• Naissance de la DIR : {config.delaiDirJours} jours après confirmation de dépôt</li>
                        <li>• Demande de motifs : 30 jours après la DIR</li>
                        <li>• Référé suspension / recours au fond : 2 mois après la DIR</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-xs text-gray-700">
                        Faites-vous accompagner par la plateforme pour préparer vos démarches et, le cas échéant, un recours.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {formData.situation === 'contentieux_visa' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h3 className="font-semibold mb-2 text-blue-800">Délai de recours pour refus de visa</h3>
                    <p className="text-sm text-blue-700 mb-3">
                      Le délai de recours contre un refus de visa est de <strong>2 mois</strong> à compter de la notification de la décision.
                    </p>
                    <ul className="space-y-2 text-sm text-blue-700">
                      <li className="flex items-start gap-2">
                        <span>•</span>
                        <span>Recours gracieux ou hiérarchique auprès du consulat</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span>•</span>
                        <span>Recours contentieux devant le tribunal administratif</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <h3 className="font-semibold mb-2 text-purple-800">Conseils pratiques</h3>
                    <ul className="space-y-2 text-sm text-purple-700">
                      <li>• Déposez votre recours le plus tôt possible</li>
                      <li>• Conservez tous les justificatifs de votre demande</li>
                      <li>• Consultez un avocat spécialisé si le délai est court</li>
                      <li>• Le recours gracieux peut être une première étape avant le recours contentieux</li>
                    </ul>
                  </div>
                </div>
              )}

              {formData.typeTitre && infosTitres[formData.typeTitre] && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h3 className="font-semibold mb-2 text-primary">Description</h3>
                    <p className="text-sm text-foreground">
                      {infosTitres[formData.typeTitre].description}
                    </p>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h3 className="font-semibold mb-2 text-blue-800">Durées possibles</h3>
                    <p className="text-sm text-blue-700">
                      {infosTitres[formData.typeTitre].duree.join(', ')} an{infosTitres[formData.typeTitre].duree.length > 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h3 className="font-semibold mb-2 text-green-800">Conditions légales</h3>
                    <ul className="space-y-1 text-sm text-green-700">
                      {infosTitres[formData.typeTitre].conditions.map((condition: string, index: number) => (
                        <li key={index} className="flex items-start gap-2">
                          <span>•</span>
                          <span>{condition}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <h3 className="font-semibold mb-2 text-purple-800">Documents nécessaires</h3>
                    <ul className="space-y-1 text-sm text-purple-700">
                      {infosTitres[formData.typeTitre].documents.map((doc: string, index: number) => (
                        <li key={index} className="flex items-start gap-2">
                          <span>•</span>
                          <span>{doc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-orange-50 rounded-lg p-4 border border-primary/30">
                    <h3 className="font-semibold mb-2 text-orange-800">Délais légaux</h3>
                    <ul className="space-y-2 text-sm text-orange-700">
                      <li>
                        <strong>Première demande :</strong> {infosTitres[formData.typeTitre].delaiPremiereDemande} mois avant le début
                      </li>
                      <li>
                        <strong>Renouvellement :</strong> {infosTitres[formData.typeTitre].delaiRenouvellement.min} à {infosTitres[formData.typeTitre].delaiRenouvellement.max} mois avant expiration
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h3 className="font-semibold mb-2 text-gray-800">Conseils pratiques</h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li>• Anticipez votre renouvellement pour éviter la perte de droits</li>
                      <li>• Préparez vos documents à l'avance</li>
                      <li>• Vérifiez les délais de traitement de votre préfecture</li>
                      <li>• En cas de retard, déposez immédiatement même si le délai est dépassé</li>
                    </ul>
                  </div>

                  <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
                    <h3 className="font-semibold mb-2 text-indigo-800">Textes officiels</h3>
                    <ul className="space-y-1 text-sm text-indigo-700">
                      <li>
                        <a href="https://www.service-public.fr/particuliers/vosdroits/F1205" target="_blank" rel="noopener noreferrer" className="underline hover:text-indigo-900">
                          • Service-public.fr - Titres de séjour
                        </a>
                      </li>
                      <li>
                        <a href="https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070158" target="_blank" rel="noopener noreferrer" className="underline hover:text-indigo-900">
                          • Code de l'entrée et du séjour
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}


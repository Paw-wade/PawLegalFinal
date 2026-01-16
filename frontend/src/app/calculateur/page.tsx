'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { Footer } from '@/components/layout/Footer';
import { userAPI } from '@/lib/api';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
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

// Types de décisions défavorables
const typesDecisions = [
  { value: 'refus_titre', label: 'Refus de titre de séjour', delai: 30 },
  { value: 'oqtf', label: 'OQTF (Obligation de quitter le territoire)', delai: 30 },
  { value: 'irt', label: 'IRT (Interdiction de retour)', delai: 30 },
  { value: 'refus_visa', label: 'Refus de visa', delai: 2 },
  { value: 'refus_cnda', label: 'Rejet CNDA (Asile)', delai: 1 },
  { value: 'retrait_titre', label: 'Retrait de titre', delai: 30 },
  { value: 'refus_renouvellement', label: 'Refus de renouvellement', delai: 30 },
  { value: 'refus_enregistrement', label: 'Refus d\'enregistrement de demande', delai: 15 },
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
  const { data: session, status } = useSession();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [joursRestants, setJoursRestants] = useState<number | null>(null);
  const [heuresRestantes, setHeuresRestantes] = useState<number>(0);
  const [minutesRestantes, setMinutesRestantes] = useState<number>(0);
  const [secondesRestantes, setSecondesRestantes] = useState<number>(0);
  
  // États pour gérer l'ouverture/fermeture des sections (accordéon)
  const [isPersonalInfoOpen, setIsPersonalInfoOpen] = useState<boolean>(true);
  const [isAdminInfoOpen, setIsAdminInfoOpen] = useState<boolean>(true);
  
  // Vérifier si l'utilisateur est un administrateur
  const isAdmin = (session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin' || userProfile?.role === 'admin' || userProfile?.role === 'superadmin';
  
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
    situation: 'demande', // 'demande', 'contentieux_visa', 'contentieux_titre' - Par défaut, afficher le formulaire de dépôt
    dateAttributionTitre: '', // Date d'attribution du titre ou du visa
    dateExpirationTitre: '', // Date d'expiration du titre ou du visa
    dateFinValiditeTitreActuel: '', // Date de fin de validité du titre actuel ou du visa
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
    rapoDepose: null as boolean | null // null = pas encore demandé, true = oui, false = non
  });

  const [dateErrors, setDateErrors] = useState<{ [key: string]: string }>({});

  const [calculs, setCalculs] = useState<any>(null);

  useEffect(() => {
    calculerDelais();
    validateDates();
  }, [formData]);

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
    
    // Calcul pour recours concernant le titre de séjour
    if (formData.situation === 'contentieux_titre' && formData.dateDecision && formData.natureDecision) {
      const decision = typesDecisions.find(d => d.value === formData.natureDecision);
      if (decision) {
        const dateDecision = new Date(formData.dateDecision);
        const dateLimite = new Date(dateDecision);
        dateLimite.setDate(dateLimite.getDate() + decision.delai);
        
        const aujourdhui = new Date();
        const joursRestants = Math.ceil((dateLimite.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
        
        // Vérifier si le recours est introduit dans les délais
        const recoursDansDelais = joursRestants > 0;
        
        setCalculs({
          type: 'contentieux',
          delai: decision.delai,
          dateDecision: dateDecision,
          dateLimite: dateLimite,
          joursRestants: joursRestants,
          typeRecours: getTypeRecours(formData.natureDecision),
          urgence: joursRestants <= 7,
          recoursDansDelais: recoursDansDelais,
          messagePersonnalise: recoursDansDelais 
            ? `✅ Vous avez encore ${joursRestants} jour(s) pour introduire votre recours.`
            : `⚠️ Le délai de recours est dépassé de ${Math.abs(joursRestants)} jour(s). Consultez un avocat rapidement.`
        });
      }
    } else if (formData.situation === 'demande' && formData.typeTitre) {
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
        } else if (formData.typeDemande === 'renouvellement') {
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
            const isRecoursTardif = formData.dateAttributionTitre && formData.dateExpirationTitre 
              ? new Date(formData.dateExpirationTitre) < aujourdhui 
              : false;
          
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
    } else {
      setCalculs(null);
    }
  };

  const getTypeRecours = (natureDecision: string): string => {
    const recoursMap: Record<string, string> = {
      'refus_titre': 'Recours contentieux devant le tribunal administratif',
      'oqtf': 'Recours contentieux devant le tribunal administratif + Référé suspension si urgence',
      'irt': 'Recours contentieux devant le tribunal administratif',
      'refus_visa': 'Recours gracieux ou hiérarchique auprès du consulat',
      'refus_cnda': 'Recours en cassation devant le Conseil d\'État',
      'retrait_titre': 'Recours contentieux devant le tribunal administratif',
      'refus_renouvellement': 'Recours contentieux devant le tribunal administratif',
      'refus_enregistrement': 'Recours contentieux devant le tribunal administratif'
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

  const formatDateCourte = (date: Date): string => {
    // Format jour/mois/année (ex: 15/03/2024)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getAlertColor = (jours: number): string => {
    if (jours < 0) return 'text-red-600 bg-red-50 border-red-500';
    if (jours <= 7) return 'text-orange-600 bg-orange-50 border-orange-500';
    if (jours <= 30) return 'text-yellow-600 bg-yellow-50 border-yellow-500';
    return 'text-green-600 bg-green-50 border-green-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10">
      {/* Header */}
      <header className="border-b bg-white/95 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-primary">Paw Legal</Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="hover:text-primary transition-colors">Accueil</Link>
              <Link href="/domaines" className="hover:text-primary transition-colors">Domaines</Link>
              <Link href="/services" className="hover:text-primary transition-colors">Services</Link>
              <Link href="/calculateur" className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors shadow-md">Calculateur</Link>
              <Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link>
              <Link href="/contact" className="hover:text-primary transition-colors">Contact</Link>
            </nav>
            <div className="flex items-center gap-4">
              {session && (session.user || userProfile) ? (
                <div className="flex items-center gap-3">
                  <Link 
                    href={(session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin' ? '/admin' : '/client'}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {userProfile?.firstName?.[0]?.toUpperCase() || session?.user?.name?.[0]?.toUpperCase() || 'U'}
                        {userProfile?.lastName?.[0]?.toUpperCase() || ''}
                      </span>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-sm font-semibold text-foreground">
                        {userProfile?.firstName && userProfile?.lastName
                          ? `${userProfile.firstName} ${userProfile.lastName}`
                          : session.user?.name || 'Utilisateur'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(userProfile?.role || (session.user as any)?.role || 'client').charAt(0).toUpperCase() + (userProfile?.role || (session.user as any)?.role || 'client').slice(1)}
                      </p>
                    </div>
                  </Link>
                  <Button 
                    variant="outline" 
                    className="text-xs"
                    onClick={handleSignOut}
                  >
                    Déconnexion
                  </Button>
                </div>
              ) : (
                <>
              <Link href="/auth/signin"><Button variant="ghost">Connexion</Button></Link>
              <Link href="/auth/signup"><Button>Créer un compte</Button></Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Colonne 1 : Informations du profil utilisateur (à l'extrémité gauche) */}
          <div className="w-full lg:w-auto lg:flex-shrink-0 lg:self-start">
            <div className="bg-gradient-to-br from-white to-primary/5 rounded-xl shadow-xl p-6 border-2 border-primary/20 lg:sticky lg:top-24 lg:w-72">
              {/* En-tête avec avatar et nom */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-lg">
                      {userProfile?.firstName?.[0]?.toUpperCase() || session?.user?.name?.[0]?.toUpperCase() || 'U'}
                      {userProfile?.lastName?.[0]?.toUpperCase() || ''}
                    </span>
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
                  <div className="bg-white/60 backdrop-blur-sm rounded-lg p-3 border border-primary/10 mb-4">
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
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3 border border-blue-200/50 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-blue-800 mb-1 uppercase tracking-wide">Nom complet</p>
                        <p className="text-xs font-medium text-blue-900 break-words">
                          {userProfile.firstName && userProfile.lastName
                            ? `${userProfile.firstName} ${userProfile.lastName}`
                            : <span className="text-blue-600/70 italic">Information non fournie</span>}
                        </p>
                      </div>
                      </div>

                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3 border border-blue-200/50 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-blue-800 mb-1 uppercase tracking-wide">Email</p>
                        <p className="text-xs font-medium text-blue-900 break-all">
                          {userProfile.email || <span className="text-blue-600/70 italic">Information non fournie</span>}
                        </p>
                    </div>
                  </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg p-3 border border-green-200/50 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-green-800 mb-1 uppercase tracking-wide">Téléphone</p>
                        <p className="text-xs font-medium text-green-900">
                          {userProfile.phone || <span className="text-green-600/70 italic">Information non fournie</span>}
                        </p>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg p-3 border border-gray-200/50 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-gray-800 mb-1 uppercase tracking-wide">Adresse</p>
                        <p className="text-xs font-medium text-gray-900 break-words">
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
                            <span className="text-gray-600/70 italic">Information non fournie</span>
                          )}
                        </p>
                        </div>
                    </div>
                      </div>
                    )}
                  </div>

                  {/* 🟩 2. Informations administratives liées au séjour */}
                  <div className="space-y-2.5 pt-4 border-t border-primary/20">
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
                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-lg p-3 border border-indigo-200/50 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-indigo-800 mb-1 uppercase tracking-wide">Catégorie du titre</p>
                        <p className="text-xs font-medium text-indigo-900 break-words">
                          {userProfile.typeTitre 
                            ? (typesTitres.find(t => t.value === userProfile.typeTitre)?.label || userProfile.typeTitre)
                            : <span className="text-indigo-600/70 italic">Information non fournie</span>}
                        </p>
                      </div>
                    </div>

                    {/* Nature du document */}
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg p-3 border border-purple-200/50 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-purple-800 mb-1 uppercase tracking-wide">Nature du document</p>
                        <p className="text-xs font-medium text-purple-900 break-words">
                          {userProfile.typeTitre 
                            ? (userProfile.typeTitre.includes('visa') || userProfile.typeTitre.includes('VLS') 
                                ? 'Visa long séjour (VLS-TS ou visa autre nature)' 
                                : 'Titre de séjour')
                            : <span className="text-purple-600/70 italic">Information non fournie</span>}
                        </p>
                      </div>
                    </div>

                    {/* Dates de délivrance et d'expiration côte à côte */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Date de délivrance */}
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg p-3 border border-purple-200/50 shadow-sm">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-purple-800 mb-1 uppercase tracking-wide">Date de délivrance</p>
                          <p className="text-xs font-medium text-purple-900">
                            {userProfile.dateDelivrance 
                              ? formatDateCourte(new Date(userProfile.dateDelivrance))
                              : <span className="text-purple-600/70 italic">Information non fournie</span>}
                          </p>
                        </div>
                      </div>

                      {/* Date d'expiration */}
                      <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-lg p-3 border border-orange-200/50 shadow-sm">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-orange-800 mb-1 uppercase tracking-wide">Date d'expiration</p>
                          <p className="text-xs font-medium text-orange-900">
                            {userProfile.dateExpiration 
                              ? formatDateCourte(new Date(userProfile.dateExpiration))
                              : <span className="text-orange-600/70 italic">Information non fournie</span>}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Statut du titre de séjour avec minuteur dynamique */}
                    {userProfile.dateExpiration && (
                      <div className={`rounded-lg p-4 border-2 shadow-lg ${
                        joursRestants !== null && joursRestants <= 0
                          ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-400'
                          : joursRestants !== null && joursRestants < 30
                          ? 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-400'
                          : 'bg-gradient-to-br from-green-50 to-green-100 border-green-400'
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
                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 rounded-lg p-3 border border-yellow-200/50 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-yellow-800 mb-1 uppercase tracking-wide">Numéro de titre</p>
                        <p className="text-xs font-medium text-yellow-900 break-all">
                          {userProfile.numeroTitre || <span className="text-yellow-600/70 italic">Information non fournie</span>}
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
                        <div className="mt-4 p-3.5 bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-400 rounded-xl shadow-lg">
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
                  <div className="pt-4 border-t border-primary/20">
                    <Link href={(session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin' ? '/admin/compte' : '/client/compte'}>
                      <Button variant="outline" className="w-full text-xs h-9 font-semibold border-2 hover:bg-primary/10 hover:border-primary transition-all shadow-sm">
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
            <div className="bg-white rounded-xl shadow-lg p-4 border-2 border-primary/20 lg:sticky lg:top-24">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <span className="text-xl">📋</span>
                </div>
                <h2 className="text-xl font-bold text-foreground">Nature du calcul</h2>
              </div>

              <form className="space-y-4">
                {/* Badges de choix */}
                <div className="space-y-2">
                  <Label className="text-base font-bold">Sélectionnez le type de calcul :</Label>
                  <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2">
                    {/* Badge Dépôt de titre de séjour */}
                    <button
                      type="button"
                      onClick={() => setFormData({ 
                        ...formData, 
                        situation: 'demande',
                        natureDecision: '',
                        dateDecision: ''
                      })}
                      className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center gap-2 ${
                        formData.situation === 'demande'
                          ? 'bg-blue-500 text-white shadow-lg scale-105'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-2 border-blue-300'
                      }`}
                    >
                      <span className="text-lg">📄</span>
                      <span>Dépôt de titre de séjour</span>
                    </button>

                    {/* Badge Recours concernant le titre de séjour */}
                    <button
                      type="button"
                      onClick={() => setFormData({ 
                        ...formData, 
                        situation: 'contentieux_titre',
                        typeDemande: '',
                        typeTitre: '',
                        typeTitreAutre: '',
                        motifTitreSejour: '',
                        sousCategorieTitreSejour: '',
                        typePrecisTitreSejour: ''
                      })}
                      className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center gap-2 ${
                        formData.situation === 'contentieux_titre'
                          ? 'bg-red-500 text-white shadow-lg scale-105'
                          : 'bg-red-100 text-red-700 hover:bg-red-200 border-2 border-red-300'
                      }`}
                    >
                      <span className="text-lg">⚖️</span>
                      <span>Recours concernant le titre de séjour</span>
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
                      }}
                      className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center gap-2 ${
                        formData.situation === 'contentieux_visa'
                          ? 'bg-orange-500 text-white shadow-lg scale-105'
                          : 'bg-orange-100 text-orange-700 hover:bg-orange-200 border-2 border-orange-300'
                      }`}
                    >
                      <span className="text-lg">✈️</span>
                      <span>Recours contre un refus de visa</span>
                    </button>
                  </div>
                </div>

                {/* Champs pour Dépôt de titre de séjour */}
                {formData.situation === 'demande' && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="typeDemande">Type de demande *</Label>
                      <Select
                        id="typeDemande"
                        value={formData.typeDemande}
                        onChange={(e) => setFormData({ ...formData, typeDemande: e.target.value })}
                        required
                      >
                        <option value="">-- Sélectionner --</option>
                        <option value="premiere">Première demande</option>
                        <option value="renouvellement">Renouvellement</option>
                      </Select>
                    </div>

                    {/* Nouveau champ hiérarchisé pour le type de titre de séjour selon CESEDA */}
                    <div className="space-y-4 bg-blue-50/50 rounded-lg p-4 border-2 border-blue-200">
                      <Label htmlFor="motifTitreSejour">Type de titre de séjour demandé *</Label>
                      
                      {/* Si la sélection est complète, afficher uniquement le résumé */}
                      {formData.typePrecisTitreSejour ? (
                        <div className="p-3 bg-white rounded-md border border-blue-300">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-blue-800 mb-1">Sélection complète :</p>
                              <p className="text-sm text-gray-700">
                                {titresSejourHierarchiques
                                  .find(m => m.value === formData.motifTitreSejour)?.label} → {' '}
                                {titresSejourHierarchiques
                                  .find(m => m.value === formData.motifTitreSejour)
                                  ?.sousCategories.find(sc => sc.value === formData.sousCategorieTitreSejour)?.label} → {' '}
                                {titresSejourHierarchiques
                                  .find(m => m.value === formData.motifTitreSejour)
                                  ?.sousCategories.find(sc => sc.value === formData.sousCategorieTitreSejour)
                                  ?.types.find(t => t.value === formData.typePrecisTitreSejour)?.label}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({ 
                                  ...formData, 
                                  motifTitreSejour: '',
                                  sousCategorieTitreSejour: '',
                                  typePrecisTitreSejour: ''
                                });
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                            >
                              Modifier
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground mb-3">
                            Sélectionnez le motif de délivrance, puis la catégorie du titre de séjour, puis le type précis de titre de séjour.
                          </p>
                          
                          {/* Niveau 1: Motif de délivrance */}
                          <div className="space-y-2">
                            <Label htmlFor="motifTitreSejour" className="text-sm font-semibold text-gray-700">
                              1. Motif de délivrance du titre de séjour *
                            </Label>
                            <Select
                              id="motifTitreSejour"
                              value={formData.motifTitreSejour}
                              onChange={(e) => {
                                const value = e.target.value;
                                setFormData({ 
                                  ...formData, 
                                  motifTitreSejour: value,
                                  sousCategorieTitreSejour: '', // Réinitialiser les niveaux inférieurs
                                  typePrecisTitreSejour: ''
                                });
                              }}
                              required
                              className="bg-white"
                            >
                              <option value="">-- Sélectionner un motif --</option>
                              {titresSejourHierarchiques.map((motif) => (
                                <option key={motif.value} value={motif.value}>
                                  {motif.label}
                                </option>
                              ))}
                            </Select>
                          </div>

                          {/* Niveau 2: Catégorie du titre de séjour */}
                          {formData.motifTitreSejour && (
                            <div className="space-y-2">
                              <Label htmlFor="sousCategorieTitreSejour" className="text-sm font-semibold text-gray-700">
                                2. Catégorie du titre de séjour *
                              </Label>
                              <Select
                                id="sousCategorieTitreSejour"
                                value={formData.sousCategorieTitreSejour}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setFormData({ 
                                    ...formData, 
                                    sousCategorieTitreSejour: value,
                                    typePrecisTitreSejour: '' // Réinitialiser le niveau inférieur
                                  });
                                }}
                                required
                                className="bg-white"
                              >
                                <option value="">-- Sélectionner une sous-catégorie --</option>
                                {titresSejourHierarchiques
                                  .find(m => m.value === formData.motifTitreSejour)
                                  ?.sousCategories.map((sousCat) => (
                                    <option key={sousCat.value} value={sousCat.value}>
                                      {sousCat.label}
                                    </option>
                                  ))}
                              </Select>
                            </div>
                          )}

                          {/* Niveau 3: Type précis */}
                          {formData.sousCategorieTitreSejour && (
                            <div className="space-y-2">
                              <Label htmlFor="typePrecisTitreSejour" className="text-sm font-semibold text-gray-700">
                                3. Type précis de titre *
                              </Label>
                              <Select
                                id="typePrecisTitreSejour"
                                value={formData.typePrecisTitreSejour}
                                onChange={(e) => {
                                  setFormData({ 
                                    ...formData, 
                                    typePrecisTitreSejour: e.target.value
                                  });
                                }}
                                required
                                className="bg-white"
                              >
                                <option value="">-- Sélectionner un type précis --</option>
                                {titresSejourHierarchiques
                                  .find(m => m.value === formData.motifTitreSejour)
                                  ?.sousCategories.find(sc => sc.value === formData.sousCategorieTitreSejour)
                                  ?.types.map((type) => (
                                    <option key={type.value} value={type.value}>
                                      {type.label}
                                    </option>
                                  ))}
                              </Select>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Champ conditionnel : Date de fin de validité du titre actuel ou du visa */}
                    {formData.typePrecisTitreSejour && (
                      <div className="space-y-2">
                        <Label htmlFor="dateFinValiditeTitreActuel">
                          {formData.typeDemande === 'premiere' 
                            ? 'Date de fin de validité du visa *' 
                            : 'Date de fin de validité du titre actuel *'}
                        </Label>
                        <Input
                          id="dateFinValiditeTitreActuel"
                          type="date"
                          value={formData.dateFinValiditeTitreActuel}
                          onChange={(e) => setFormData({ ...formData, dateFinValiditeTitreActuel: e.target.value })}
                          required
                          className={dateErrors.dateFinValiditeTitreActuel ? 'border-red-500' : ''}
                        />
                        {dateErrors.dateFinValiditeTitreActuel && (
                          <p className="text-xs text-red-600 mt-1">{dateErrors.dateFinValiditeTitreActuel}</p>
                        )}
                      </div>
                    )}

                    {formData.typeDemande === 'renouvellement' && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="dateExpiration">Date d'expiration du titre actuel *</Label>
                          <Input
                            id="dateExpiration"
                            type="date"
                            value={formData.dateExpiration}
                            onChange={(e) => setFormData({ ...formData, dateExpiration: e.target.value })}
                            required
                            className={dateErrors.dateExpiration ? 'border-red-500' : ''}
                          />
                          {dateErrors.dateExpiration && (
                            <p className="text-xs text-red-600 mt-1">{dateErrors.dateExpiration}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Champs pour Recours contre refus de visa */}
                {formData.situation === 'contentieux_visa' && (
                  <div className="space-y-3 pt-3 border-t">
                    {/* Champs de base */}
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-4">
                      <h3 className="font-semibold text-sm text-blue-800 mb-3">Informations de base</h3>
                      
                      <div className="space-y-3">
                    <div className="space-y-2">
                          <Label htmlFor="natureVisa">Nature du visa *</Label>
                      <Select
                            id="natureVisa"
                            value={formData.natureVisa}
                            onChange={(e) => setFormData({ ...formData, natureVisa: e.target.value })}
                        required
                      >
                        <option value="">-- Sélectionner --</option>
                            {typesVisas.map((visa) => (
                              <option key={visa.value} value={visa.value}>{visa.label}</option>
                            ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                          <Label htmlFor="dateConfirmationDepot">Date de confirmation du dépôt *</Label>
                      <Input
                            id="dateConfirmationDepot"
                        type="date"
                            value={formData.dateConfirmationDepot}
                            onChange={(e) => {
                              setFormData({ ...formData, dateConfirmationDepot: e.target.value, rapoDepose: null });
                            }}
                        required
                      />
                        </div>
                      </div>
                    </div>

                    {/* Message d'information si plus de 4 mois */}
                    {formData.dateConfirmationDepot && (() => {
                      const aujourdhui = new Date();
                      const dateConfirmationDepot = new Date(formData.dateConfirmationDepot);
                      const dateLimite4Mois = new Date(dateConfirmationDepot);
                      dateLimite4Mois.setMonth(dateLimite4Mois.getMonth() + 4);
                      const plusDe4Mois = aujourdhui > dateLimite4Mois;
                      const joursDepuis4Mois = plusDe4Mois ? Math.ceil((aujourdhui.getTime() - dateLimite4Mois.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                      
                      if (plusDe4Mois && formData.rapoDepose === null && !formData.dateDepotRapo) {
                        return (
                          <div className="bg-orange-50 rounded-lg p-4 border-2 border-orange-400 mb-4">
                            <h3 className="font-semibold text-sm text-orange-800 mb-3">⚠️ Attention</h3>
                            <p className="text-sm text-orange-700 mb-3">
                              Plus de 4 mois se sont écoulés depuis la date de confirmation du dépôt ({joursDepuis4Mois} jour(s) de retard). En principe, aucun recours n'est plus possible après ce délai.
                            </p>
                            <p className="text-xs text-orange-600 mb-3">
                              Si vous avez déposé un Recours Administratif Préalable Obligatoire (RAPO) avant l'expiration du délai, vous pouvez continuer en renseignant la date de dépôt du RAPO ci-dessous.
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Type de refus */}
                    <div className="space-y-2">
                      <Label>Type de refus *</Label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="typeRefusVisa"
                            value="explicite"
                            checked={formData.typeRefusVisa === 'explicite'}
                            onChange={(e) => setFormData({ ...formData, typeRefusVisa: e.target.value, dateNotificationRefus: '' })}
                            className="w-4 h-4 text-primary"
                            required
                          />
                          <span className="text-sm">J'ai reçu une notification de refus (refus explicite)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="typeRefusVisa"
                            value="implicite"
                            checked={formData.typeRefusVisa === 'implicite'}
                            onChange={(e) => setFormData({ ...formData, typeRefusVisa: e.target.value, dateNotificationRefus: '' })}
                            className="w-4 h-4 text-primary"
                            required
                          />
                          <span className="text-sm">Je n'ai pas reçu de réponse après 4 mois (refus implicite)</span>
                        </label>
                    </div>
                    </div>

                    {/* Date de notification (si refus explicite) */}
                    {formData.typeRefusVisa === 'explicite' && (
                      <div className="space-y-2">
                        <Label htmlFor="dateNotificationRefus">Date de notification du refus *</Label>
                        <Input
                          id="dateNotificationRefus"
                          type="date"
                          value={formData.dateNotificationRefus}
                          onChange={(e) => setFormData({ ...formData, dateNotificationRefus: e.target.value })}
                          required
                        />
                      </div>
                    )}

                    {/* Section RAPO */}
                    {(formData.typeRefusVisa === 'explicite' || formData.typeRefusVisa === 'implicite') && (
                      <div className="bg-orange-50 rounded-lg p-4 border border-orange-200 space-y-3">
                        <h3 className="font-semibold text-sm text-orange-800 mb-2">Recours Administratif Préalable Obligatoire (RAPO)</h3>
                        
                        {/* Afficher le champ date - toujours disponible si type de refus sélectionné */}
                        <div className="space-y-2">
                          <Label htmlFor="dateDepotRapo">Date de dépôt du RAPO (si applicable)</Label>
                          <Input
                            id="dateDepotRapo"
                            type="date"
                            value={formData.dateDepotRapo}
                            onChange={(e) => setFormData({ ...formData, dateDepotRapo: e.target.value, rapoDepose: e.target.value ? true : null })}
                          />
                          <p className="text-xs text-muted-foreground">
                            Si vous avez déposé un RAPO, indiquez la date de dépôt pour calculer les délais qui suivent (réponse de la commission, recours tribunal, etc.).
                          </p>
                        </div>

                        {formData.dateDepotRapo && (() => {
                          const dateDepotRapo = new Date(formData.dateDepotRapo);
                          const dateLimiteReponse = new Date(dateDepotRapo);
                          dateLimiteReponse.setMonth(dateLimiteReponse.getMonth() + 2);
                          const aujourdhui = new Date();
                          const joursRestantsCommission = Math.ceil((dateLimiteReponse.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
                          const delaiDepasse = joursRestantsCommission < 0;
                          
                          return (
                            <>
                              {/* Affichage de la date limite de réponse de la commission */}
                              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 mb-3">
                                <p className="text-xs font-semibold text-blue-800 mb-1">📅 Date limite de réponse de la commission</p>
                                <p className="text-sm text-blue-700 font-medium">{formatDateCourte(dateLimiteReponse)}</p>
                                {delaiDepasse ? (
                                  <p className="text-xs text-red-600 font-medium mt-1">
                                    ⚠️ Délai dépassé de {Math.abs(joursRestantsCommission)} jour(s)
                                  </p>
                                ) : (
                                  <p className="text-xs text-blue-600 mt-1">
                                    {joursRestantsCommission} jour(s) restant{joursRestantsCommission > 1 ? 's' : ''}
                                  </p>
                                )}
                              </div>

                              {/* Case à cocher pour indiquer qu'une réponse a été reçue */}
                              <div className="space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    id="reponseRapoRecue"
                                    checked={formData.reponseRapoRecue}
                                    onChange={(e) => setFormData({ 
                                      ...formData, 
                                      reponseRapoRecue: e.target.checked,
                                      dateReponseRapo: e.target.checked ? formData.dateReponseRapo : '' // Réinitialiser la date si la case est décochée
                                    })}
                                    className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                                  />
                                  <span className="text-sm font-medium">J'ai reçu une réponse à mon RAPO</span>
                                </label>
                                <p className="text-xs text-muted-foreground ml-6">
                                  Cochez cette case si vous avez reçu une réponse de la commission.
                                </p>
                              </div>

                              {/* Champ de date conditionnel */}
                              {formData.reponseRapoRecue && (
                                <div className="space-y-2">
                                  <Label htmlFor="dateReponseRapo">Date de réponse du RAPO *</Label>
                                  <Input
                                    id="dateReponseRapo"
                                    type="date"
                                    value={formData.dateReponseRapo}
                                    onChange={(e) => setFormData({ ...formData, dateReponseRapo: e.target.value })}
                                    required
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Indiquez la date de réception de la réponse pour calculer les délais de recours tribunal.
                                  </p>
                                </div>
                              )}

                              {!formData.dateReponseRapo && (
                                <div className="space-y-2">
                                  <Label>Action après 2 mois sans réponse *</Label>
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Si vous n'avez pas reçu de réponse après {formatDateCourte(dateLimiteReponse)}, choisissez votre action :
                                  </p>
                                  <div className="space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name="actionApresRapo"
                                        value="saisir_tribunal"
                                        checked={formData.actionApresRapo === 'saisir_tribunal'}
                                        onChange={(e) => setFormData({ ...formData, actionApresRapo: e.target.value, demandeCommunicationMotifs: false })}
                                        className="w-4 h-4 text-primary"
                                      />
                                      <span className="text-sm">Saisir le tribunal</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name="actionApresRapo"
                                        value="demander_motifs"
                                        checked={formData.actionApresRapo === 'demander_motifs'}
                                        onChange={(e) => setFormData({ ...formData, actionApresRapo: e.target.value, demandeCommunicationMotifs: true })}
                                        className="w-4 h-4 text-primary"
                                      />
                                      <span className="text-sm">Demander communication des motifs</span>
                                    </label>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Communication des motifs */}
                    {(formData.demandeCommunicationMotifs || formData.actionApresRapo === 'demander_motifs') && (
                      <div className="bg-purple-50 rounded-lg p-4 border border-purple-200 space-y-3">
                        <h3 className="font-semibold text-sm text-purple-800 mb-2">Communication des motifs</h3>
                        
                        <div className="space-y-2">
                          <Label htmlFor="dateDemandeMotifs">Date de demande de communication des motifs *</Label>
                          <Input
                            id="dateDemandeMotifs"
                            type="date"
                            value={formData.dateDemandeMotifs}
                            onChange={(e) => setFormData({ ...formData, dateDemandeMotifs: e.target.value })}
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="dateReceptionMotifs">Date de réception des motifs (optionnel)</Label>
                          <Input
                            id="dateReceptionMotifs"
                            type="date"
                            value={formData.dateReceptionMotifs}
                            onChange={(e) => setFormData({ ...formData, dateReceptionMotifs: e.target.value })}
                          />
                          <p className="text-xs text-muted-foreground">Si vous avez reçu les motifs</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Champs pour Recours concernant le titre de séjour */}
                {formData.situation === 'contentieux_titre' && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="natureDecision_titre">Nature de la décision *</Label>
                      <Select
                        id="natureDecision_titre"
                        value={formData.natureDecision}
                        onChange={(e) => setFormData({ ...formData, natureDecision: e.target.value })}
                        required
                      >
                        <option value="">-- Sélectionner --</option>
                        {typesDecisions.filter(d => d.value !== 'refus_visa').map((decision) => (
                          <option key={decision.value} value={decision.value}>{decision.label}</option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dateDecision_titre">Date de la décision *</Label>
                      <Input
                        id="dateDecision_titre"
                        type="date"
                        value={formData.dateDecision}
                        onChange={(e) => setFormData({ ...formData, dateDecision: e.target.value })}
                        required
                      />
                    </div>

                  </div>
                )}
              </form>

              {/* Affichage des résultats du calcul */}
              {calculs && (
                <div className="mt-6 pt-6 border-t border-primary/20">
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
                        <div className="bg-white rounded-lg p-4 border-2 border-primary/20">
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
                        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
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

                  {calculs.type === 'contentieux' && calculs.messagePersonnalise && (
                    <div className={`rounded-lg p-4 border-2 ${
                      calculs.urgence 
                        ? 'bg-red-50 border-red-300' 
                        : calculs.recoursDansDelais 
                        ? 'bg-orange-50 border-orange-300' 
                        : 'bg-green-50 border-green-300'
                    }`}>
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{calculs.urgence ? '⚠️' : calculs.recoursDansDelais ? '⏰' : '✅'}</span>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg mb-2">
                            {calculs.urgence ? 'URGENT' : 'Délai de recours'}
                          </h3>
                          <p className="text-sm mb-2">{calculs.messagePersonnalise}</p>
                          <div className="text-xs space-y-1">
                            <p><strong>Date de décision :</strong> {formatDateCourte(calculs.dateDecision)}</p>
                            <p><strong>Date limite de recours :</strong> {formatDateCourte(calculs.dateLimite)}</p>
                            <p><strong>Jours restants :</strong> <span className={getAlertColor(calculs.joursRestants).split(' ')[0]}>{calculs.joursRestants} jour(s)</span></p>
                            <p><strong>Type de recours :</strong> {calculs.typeRecours}</p>
                          </div>
                        </div>
                      </div>
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
                </div>
              )}
            </div>
          </div>

          {/* Colonne 3 : Explications (à l'extrémité droite) */}
          <div className="w-full lg:w-auto lg:flex-shrink-0 lg:self-start">
            <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-primary/20 lg:sticky lg:top-24 lg:w-80">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">ℹ️</span>
                </div>
                <h2 className="text-xl font-bold text-foreground">Explications</h2>
              </div>

              {!formData.typeTitre && formData.situation === 'demande' && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📚</div>
                  <p className="text-muted-foreground">
                    Sélectionnez un type de titre pour voir les informations détaillées
                  </p>
                </div>
              )}

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

              {formData.situation === 'contentieux_titre' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h3 className="font-semibold mb-2 text-blue-800">Délais de recours</h3>
                    <p className="text-sm text-blue-700 mb-3">
                      Les délais de recours varient selon le type de décision :
                    </p>
                    <ul className="space-y-2 text-sm text-blue-700">
                      <li className="flex items-start gap-2">
                        <span>•</span>
                        <span><strong>Rejet CNDA :</strong> 1 mois</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span>•</span>
                        <span><strong>Refus d'enregistrement :</strong> 15 jours</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span>•</span>
                        <span><strong>Autres décisions :</strong> 30 jours</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <h3 className="font-semibold mb-2 text-purple-800">Procédures d'urgence</h3>
                    <p className="text-sm text-purple-700 mb-2">
                      En cas d'urgence, vous pouvez engager :
                    </p>
                    <ul className="space-y-1 text-sm text-purple-700">
                      <li>• Référé suspension</li>
                      <li>• Référé liberté</li>
                      <li>• Référé mesures utiles</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h3 className="font-semibold mb-2 text-green-800">Conseils pratiques</h3>
                    <ul className="space-y-2 text-sm text-green-700">
                      <li>• Déposez votre recours le plus tôt possible</li>
                      <li>• Conservez tous les justificatifs</li>
                      <li>• Consultez un avocat spécialisé si le délai est court</li>
                      <li>• En cas de délai dépassé, un recours en annulation peut encore être possible</li>
                    </ul>
                  </div>
                </div>
              )}

              {formData.typeTitre && infosTitres[formData.typeTitre] && (
                <div className="space-y-4">
                  <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
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

                  <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
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


'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { dossiersAPI, userAPI, documentRequestsAPI, notificationsAPI, messagesAPI, documentsAPI, tasksAPI, collaborativeDraftsAPI } from '@/lib/api';
import { getStatutColor, getStatutLabel, getPrioriteColor, getDossierProgress, calculateDaysSince, calculateDaysUntil, isDeadlineApproaching, formatRelativeTime, getNextAction, getTimelineStepsWithCustom } from '@/lib/dossierUtils';
import { getStatutColor as getTaskStatutColor, getStatutLabel as getTaskStatutLabel, getPrioriteColor as getTaskPrioriteColor, getPrioriteLabel as getTaskPrioriteLabel } from '@/lib/taskUtils';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';
import { DocumentPreview } from '@/components/DocumentPreview';

function Button({ children, variant = 'default', size = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-primary text-white hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
  };
  const sizeClasses = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>{children}</button>;
}

function Input({ className = '', type, value, onChange, ...props }: any) {
  // Pour les champs de date, utiliser le composant DateInput qui garantit le format jour/mois/année
  if (type === 'date') {
    return (
      <DateInputComponent
        value={value || ''}
        onChange={(newValue) => {
          if (onChange) {
            const syntheticEvent = {
              target: { value: newValue },
              currentTarget: { value: newValue }
            } as React.ChangeEvent<HTMLInputElement>;
            onChange(syntheticEvent);
          }
        }}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
    );
  }
  
  return (
    <input
      type={type}
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function Label({ htmlFor, children, className = '' }: any) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>
      {children}
    </label>
  );
}

function Textarea({ className = '', ...props }: any) {
  return (
    <textarea
      className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

const categories = {
  sejour_titres: {
    label: 'Séjour et titres de séjour',
    types: [
      { value: 'premier_titre_etudiant', label: 'Demande de premier titre de séjour (étudiant)' },
      { value: 'premier_titre_salarie', label: 'Demande de premier titre de séjour (salarié)' },
      { value: 'premier_titre_vie_privée', label: 'Demande de premier titre de séjour (vie privée et familiale)' },
      { value: 'premier_titre_malade', label: 'Demande de premier titre de séjour (étranger malade)' },
      { value: 'premier_titre_retraite', label: 'Demande de premier titre de séjour (retraité)' },
      { value: 'premier_titre_visiteur', label: 'Demande de premier titre de séjour (visiteur)' },
      { value: 'renouvellement_titre', label: 'Renouvellement d\'un titre de séjour' },
      { value: 'changement_statut', label: 'Changement de statut' },
      { value: 'carte_talent', label: 'Carte Talent' },
      { value: 'carte_resident', label: 'Demande de carte de résident ou de carte de 10 ans' },
      { value: 'regularisation_travail', label: 'Régularisation par le travail' },
      { value: 'regularisation_humanitaire', label: 'Régularisation pour motifs humanitaires' },
    ]
  },
  contentieux_administratif: {
    label: 'Contentieux administratif',
    types: [
      { value: 'recours_gracieux', label: 'Recours gracieux contre un refus de titre' },
      { value: 'recours_hierarchique', label: 'Recours hiérarchique contre un refus de titre' },
      { value: 'recours_absence_reponse', label: 'Recours contentieux - Absence de réponse à une demande de titre' },
      { value: 'recours_refus_sejour', label: 'Recours contentieux - Refus de séjour' },
      { value: 'recours_refus_enregistrement', label: 'Recours contentieux - Refus d\'enregistrement de la demande' },
      { value: 'recours_oqtf', label: 'Recours contentieux - Obligation de quitter le territoire français (OQTF)' },
      { value: 'recours_irt', label: 'Recours contentieux - Interdiction de retour sur le territoire (IRT)' },
      { value: 'recours_assignation_residence', label: 'Recours contentieux - Assignation à résidence' },
      { value: 'recours_retention', label: 'Recours contentieux - Placement en rétention administrative' },
      { value: 'refere_mesures_utiles', label: 'Recours en référé - Référé mesures utiles' },
      { value: 'refere_suspension', label: 'Recours en référé - Référé Suspension et Recours au fond' },
    ]
  },
  asile: {
    label: 'Asile',
    types: [
      { value: 'demande_asile_ofpra', label: 'Demande d\'asile auprès de l\'OFPRA' },
      { value: 'preparation_entretien_ofpra', label: 'Préparation de l\'entretien OFPRA' },
      { value: 'recours_cnda', label: 'Recours devant la CNDA en cas de rejet' },
      { value: 'reouverture_reexamen', label: 'Dossiers de réouverture, réexamen' },
    ]
  },
  regroupement_familial: {
    label: 'Regroupement familial',
    types: [
      { value: 'preparation_dossier_regroupement', label: 'Préparation du dossier de regroupement familial' },
      { value: 'recours_refus_prefecture', label: 'Recours en cas de refus (préfecture)' },
      { value: 'recours_refus_consulat', label: 'Recours en cas de refus (consulat)' },
      { value: 'recours_refus_ofii', label: 'Recours en cas de refus (OFII)' },
    ]
  },
  nationalite_francaise: {
    label: 'Nationalité française',
    types: [
      { value: 'acquisition_nationalite', label: 'Demande d\'acquisition de la nationalité française' },
      { value: 'recours_refus_nationalite', label: 'Recours contre refus ou ajournement' },
      { value: 'contestation_opposition', label: 'Contestation d\'une décision d\'opposition' },
    ]
  },
  eloignement_urgence: {
    label: 'Éloignement et urgence',
    types: [
      { value: 'contestation_oqtf', label: 'Contestation d\'une OQTF' },
      { value: 'contestation_irt', label: 'Contestation d\'une interdiction de retour (IRT)' },
      { value: 'contestation_arrete_expulsion', label: 'Contestation d\'un arrêté d\'expulsion' },
      { value: 'assistance_retention', label: 'Assistance en rétention administrative' },
      { value: 'audience_jld', label: 'Audience devant le juge des libertés et de la détention (JLD)' },
    ]
  },
  autre: {
    label: 'Autre',
    types: [
      { value: 'autre', label: 'Autre type de dossier' },
    ]
  }
};

// Liste complète des types de documents pour les titres de séjour et visas
const documentTypesList = [
  // Documents d'identité
  { value: 'passeport', label: 'Passeport', category: 'identite' },
  { value: 'carte_identite', label: 'Carte d\'identité', category: 'identite' },
  { value: 'acte_naissance', label: 'Acte de naissance', category: 'identite' },
  { value: 'acte_mariage', label: 'Acte de mariage', category: 'identite' },
  { value: 'acte_divorce', label: 'Acte de divorce', category: 'identite' },
  { value: 'livret_familial', label: 'Livret de famille', category: 'identite' },
  
  // Titres de séjour
  { value: 'titre_sejour_valide', label: 'Titre de séjour en cours de validité', category: 'titre_sejour' },
  { value: 'titre_sejour_expire', label: 'Titre de séjour expiré', category: 'titre_sejour' },
  { value: 'recepisse_demande_titre', label: 'Récépissé de demande de titre de séjour', category: 'titre_sejour' },
  { value: 'carte_sejour_temporaire', label: 'Carte de séjour temporaire', category: 'titre_sejour' },
  { value: 'carte_resident', label: 'Carte de résident', category: 'titre_sejour' },
  { value: 'carte_resident_permanent', label: 'Carte de résident permanent (10 ans)', category: 'titre_sejour' },
  
  // Visas
  { value: 'visa_court_sejour', label: 'Visa de court séjour (Schengen)', category: 'visa' },
  { value: 'visa_long_sejour', label: 'Visa de long séjour', category: 'visa' },
  { value: 'visa_etudiant', label: 'Visa étudiant', category: 'visa' },
  { value: 'visa_travailleur', label: 'Visa travailleur', category: 'visa' },
  { value: 'visa_familial', label: 'Visa familial', category: 'visa' },
  { value: 'visa_transit', label: 'Visa de transit', category: 'visa' },
  
  // Documents professionnels
  { value: 'contrat_travail', label: 'Contrat de travail', category: 'professionnel' },
  { value: 'attestation_emploi', label: 'Attestation d\'emploi', category: 'professionnel' },
  { value: 'fiche_paie', label: 'Fiches de paie (3 derniers mois)', category: 'professionnel' },
  { value: 'avis_imposition', label: 'Avis d\'imposition', category: 'professionnel' },
  { value: 'declaration_revenus', label: 'Déclaration de revenus', category: 'professionnel' },
  { value: 'justificatif_ca', label: 'Justificatif de chiffre d\'affaires (auto-entrepreneur)', category: 'professionnel' },
  
  // Documents de logement
  { value: 'justificatif_domicile', label: 'Justificatif de domicile (moins de 3 mois)', category: 'logement' },
  { value: 'quittance_loyer', label: 'Quittance de loyer', category: 'logement' },
  { value: 'facture_electricite', label: 'Facture d\'électricité', category: 'logement' },
  { value: 'facture_gaz', label: 'Facture de gaz', category: 'logement' },
  { value: 'facture_eau', label: 'Facture d\'eau', category: 'logement' },
  { value: 'attestation_hebergement', label: 'Attestation d\'hébergement', category: 'logement' },
  
  // Documents de ressources
  { value: 'releve_bancaire', label: 'Relevés bancaires (3 derniers mois)', category: 'ressources' },
  { value: 'attestation_bancaire', label: 'Attestation bancaire', category: 'ressources' },
  { value: 'justificatif_ressources', label: 'Justificatif de ressources', category: 'ressources' },
  { value: 'pension_retraite', label: 'Pension de retraite', category: 'ressources' },
  { value: 'allocation_chomage', label: 'Allocation chômage', category: 'ressources' },
  { value: 'allocation_familiale', label: 'Allocations familiales', category: 'ressources' },
  
  // Documents de santé
  { value: 'certificat_medical', label: 'Certificat médical', category: 'sante' },
  { value: 'attestation_cmu', label: 'Attestation CMU/AME', category: 'sante' },
  { value: 'carte_vitale', label: 'Carte Vitale', category: 'sante' },
  
  // Documents d'études
  { value: 'diplome', label: 'Diplôme', category: 'etudes' },
  { value: 'attestation_scolarite', label: 'Attestation de scolarité', category: 'etudes' },
  { value: 'releve_notes', label: 'Relevé de notes', category: 'etudes' },
  { value: 'inscription_universite', label: 'Inscription universitaire', category: 'etudes' },
  
  // Documents familiaux
  { value: 'acte_mariage_fr', label: 'Acte de mariage (traduit et légalisé)', category: 'familial' },
  { value: 'acte_naissance_enfant', label: 'Acte de naissance des enfants', category: 'familial' },
  { value: 'livret_familial_fr', label: 'Livret de famille français', category: 'familial' },
  { value: 'justificatif_ressources_famille', label: 'Justificatif de ressources familiales', category: 'familial' },
  
  // Autres documents
  { value: 'casier_judiciaire', label: 'Casier judiciaire', category: 'autre' },
  { value: 'traduction_assermentee', label: 'Traduction assermentée', category: 'autre' },
  { value: 'legalisation', label: 'Légalisation/Apostille', category: 'autre' },
  { value: 'autre', label: 'Autre document', category: 'autre' }
];

// Grouper par catégorie pour l'affichage
const documentTypesByCategory = documentTypesList.reduce((acc, doc) => {
  if (!acc[doc.category]) {
    acc[doc.category] = [];
  }
  acc[doc.category].push(doc);
  return acc;
}, {} as Record<string, typeof documentTypesList>);

const categoryLabels: Record<string, string> = {
  identite: '📄 Documents d\'identité',
  titre_sejour: '🪪 Titres de séjour',
  visa: '✈️ Visas',
  professionnel: '💼 Documents professionnels',
  logement: '🏠 Documents de logement',
  ressources: '💰 Documents de ressources',
  sante: '🏥 Documents de santé',
  etudes: '📚 Documents d\'études',
  familial: '👨‍👩‍👧‍👦 Documents familiaux',
  autre: '📋 Autres documents'
};

export default function AdminDossiersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [utilisateurs, setUtilisateurs] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]); // Membres de l'équipe (admins/superadmins)
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [clientType, setClientType] = useState<'existing' | 'new'>('existing');
  // Fonction pour obtenir la date du jour au format YYYY-MM-DD
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    userId: '',
    clientNom: '',
    clientPrenom: '',
    clientEmail: '',
    clientTelephone: '',
    titre: '',
    description: '',
    categorie: '',
    type: '',
    statut: 'en_attente',
    priorite: 'normale',
    dateEcheance: getTodayDate(),
    notes: '',
    assignedTo: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [editingDossier, setEditingDossier] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showRefuseModal, setShowRefuseModal] = useState<{ dossierId: string; dossierTitre: string } | null>(null);
  const [motifRefus, setMotifRefus] = useState('');
  const [showStatutModal, setShowStatutModal] = useState<{ dossierId: string; dossierTitre: string; currentStatut: string; newStatut: string } | null>(null);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'in_progress' | 'favorable' | 'unfavorable' | 'closed' | 'archived'
  >('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [showDocumentRequestModal, setShowDocumentRequestModal] = useState<any>(null);
  const [documentRequestData, setDocumentRequestData] = useState({
    selectedDocumentTypes: [] as string[],
    message: '',
    isUrgent: false
  });
  const [documentRequests, setDocumentRequests] = useState<Record<string, any[]>>({});
  const [expandedDocumentDropdowns, setExpandedDocumentDropdowns] = useState<Set<string>>(new Set());
  const [expandedDocumentSections, setExpandedDocumentSections] = useState<Set<string>>(new Set());
  const [selectedDocumentForPreview, setSelectedDocumentForPreview] = useState<any>(null);
  const [showDocumentPreviewModal, setShowDocumentPreviewModal] = useState(false);
  const [dossierDocuments, setDossierDocuments] = useState<Record<string, any[]>>({});
  const [expandedDossiers, setExpandedDossiers] = useState<Set<string>>(new Set());
  const [expandedDossierDocumentDropdowns, setExpandedDossierDocumentDropdowns] = useState<Set<string>>(new Set());
  const [dossierTasks, setDossierTasks] = useState<Record<string, any[]>>({});
  const [dossierDrafts, setDossierDrafts] = useState<Record<string, any[]>>({});
  const [expandedTaskSections, setExpandedTaskSections] = useState<Set<string>>(new Set());
  const [showTaskFormForDossier, setShowTaskFormForDossier] = useState<string | null>(null);
  const [taskFormData, setTaskFormData] = useState<{ titre: string; description: string; priorite: string; assignedTo: string[] }>({
    titre: '',
    description: '',
    priorite: 'normale',
    assignedTo: []
  });
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskSuccessMessage, setTaskSuccessMessage] = useState<string | null>(null);
  const [addEtapeDossier, setAddEtapeDossier] = useState<any>(null);
  const [newEtapeLabel, setNewEtapeLabel] = useState('');
  const [newEtapeDate, setNewEtapeDate] = useState('');
  const [isAddingEtape, setIsAddingEtape] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session) {
      const userRole = (session.user as any)?.role;
      const isAuthorized = userRole === 'admin' || userRole === 'superadmin';
      if (!isAuthorized) {
        router.push('/client');
      }
    }
  }, [session, status, router]);

  useEffect(() => {
    if (status === 'authenticated' && ((session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin')) {
      loadDossiers();
      loadUsers();
      loadTeamMembers();
      loadNotifications();
      loadDossierDocuments();
      loadDossierTasks();
      loadDossierDrafts();
    }
  }, [session, status, dossiers.length]);

  // Ouvrir automatiquement le badge du dossier passé en paramètre (depuis la vue détail)
  useEffect(() => {
    const dossierIdToOpen = searchParams?.get('dossierId');
    if (dossierIdToOpen && dossiers.length > 0) {
      setExpandedDossiers((prev) => {
        const next = new Set(prev);
        next.add(dossierIdToOpen);
        return next;
      });
    }
  }, [searchParams, dossiers]);

  const loadNotifications = async () => {
    try {
      const response = await notificationsAPI.getNotifications({
        limit: 200
      });
      if (response.data.success) {
        setNotifications(response.data.notifications || []);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des notifications:', err);
    }
  };

  const getLastNotificationForDossier = (dossierId: string) => {
    const dossierNotifications = notifications.filter((notif) => {
      const notifDossierId = notif.data?.dossierId || notif.dossierId;
      return notifDossierId && (
        notifDossierId.toString() === dossierId.toString() ||
        (typeof notifDossierId === 'object' && notifDossierId._id?.toString() === dossierId.toString())
      );
    });
    
    if (dossierNotifications.length === 0) return null;
    
    dossierNotifications.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    
    return dossierNotifications[0];
  };

  const getUnreadNotificationsCountForDossier = (dossierId: string) => {
    const dossierNotifications = notifications.filter((notif) => {
      const notifDossierId = notif.data?.dossierId || notif.dossierId;
      return notifDossierId && (
        notifDossierId.toString() === dossierId.toString() ||
        (typeof notifDossierId === 'object' && notifDossierId._id?.toString() === dossierId.toString())
      ) && !notif.lu;
    });
    
    return dossierNotifications.length;
  };

  const loadDossiers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await dossiersAPI.getAllDossiers({ search: searchTerm || undefined });
      if (response.data.success) {
        const dossiersList = response.data.dossiers || [];
        setDossiers(dossiersList);
        
        // Charger les demandes de documents pour chaque dossier
        // Ignorer silencieusement les erreurs 404 (route peut ne pas être disponible si le serveur n'est pas redémarré)
        const requestsMap: Record<string, any[]> = {};
        await Promise.all(
          dossiersList.map(async (dossier: any) => {
            try {
              const requestsResponse = await documentRequestsAPI.getRequests({
                dossierId: dossier._id || dossier.id
              });
              if (requestsResponse.data.success) {
                requestsMap[dossier._id || dossier.id] = requestsResponse.data.documentRequests || [];
              }
            } catch (err: any) {
              // Ignorer silencieusement les erreurs 404 pour cette route
              // (la route sera disponible après redémarrage du serveur backend)
              if (err.response?.status !== 404) {
                console.error(`Erreur lors du chargement des demandes pour le dossier ${dossier._id}:`, err);
              }
            }
          })
        );
        setDocumentRequests(requestsMap);
      } else {
        setError('Erreur lors du chargement des dossiers');
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des dossiers:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement des dossiers');
    } finally {
      setIsLoading(false);
    }
    // Recharger les notifications après le chargement des dossiers
    loadNotifications();
  };

  const loadUsers = async () => {
    try {
      const response = await userAPI.getAllUsers();
      if (response.data.success) {
        setUtilisateurs(response.data.users || []);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des utilisateurs:', err);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const response = await userAPI.getAllUsers();
      if (response.data.success) {
        // Filtrer pour ne garder que les admins et superadmins
        const members = (response.data.users || []).filter(
          (user: any) => user.role === 'admin' || user.role === 'superadmin'
        );
        setTeamMembers(members);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des membres de l\'équipe:', err);
    }
  };

  const loadDossierDocuments = async () => {
    try {
      const response = await documentsAPI.getAllDocuments();
      if (response.data.success) {
        const allDocuments = response.data.documents || response.data.data || [];
        const documentsMap: Record<string, any[]> = {};
        
        // Grouper les documents par dossier
        allDocuments.forEach((doc: any) => {
          const dossierId = doc.dossierId?._id || doc.dossierId || doc.dossier?._id || doc.dossier;
          if (dossierId) {
            const dossierIdStr = dossierId.toString();
            if (!documentsMap[dossierIdStr]) {
              documentsMap[dossierIdStr] = [];
            }
            documentsMap[dossierIdStr].push(doc);
          }
        });
        
        setDossierDocuments(documentsMap);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des documents des dossiers:', err);
    }
  };

  const loadDossierTasks = async () => {
    try {
      const response = await tasksAPI.getAllTasks();
      if (response.data.success) {
        const allTasks = response.data.tasks || [];
        const tasksMap: Record<string, any[]> = {};
        
        // Grouper les tâches par dossier
        allTasks.forEach((task: any) => {
          const dossierId = task.dossier?._id || task.dossier || task.dossierId?._id || task.dossierId;
          if (dossierId) {
            const dossierIdStr = dossierId.toString();
            if (!tasksMap[dossierIdStr]) {
              tasksMap[dossierIdStr] = [];
            }
            tasksMap[dossierIdStr].push(task);
          }
        });
        
        setDossierTasks(tasksMap);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des tâches des dossiers:', err);
    }
  };

  const loadDossierDrafts = async () => {
    try {
      const draftsMap: Record<string, any[]> = {};
      await Promise.all(
        dossiers.map(async (dossier: any) => {
          const dossierId = dossier._id || dossier.id;
          if (!dossierId) return;
          try {
            const draftRes = await collaborativeDraftsAPI.getDossierDrafts(dossierId);
            if (draftRes.data.success && Array.isArray(draftRes.data.drafts)) {
              draftsMap[dossierId] = draftRes.data.drafts;
            }
          } catch (err) {
            // On ignore les erreurs pour un dossier donné pour ne pas bloquer l'affichage global
            console.warn(`⚠️ Impossible de charger les documents en préparation pour le dossier ${dossierId}`, err);
          }
        })
      );
      setDossierDrafts(draftsMap);
    } catch (err: any) {
      console.error('Erreur lors du chargement des documents en préparation des dossiers:', err);
    }
  };

  const handleCreateTask = async (dossierId: string) => {
    // Validation simple
    if (!taskFormData.assignedTo || taskFormData.assignedTo.length === 0) {
      setError('Veuillez assigner la tâche à au moins un membre');
      return;
    }

    setIsCreatingTask(true);
    setError(null);
    
    try {
      const taskData: any = {
        description: taskFormData.description?.trim() || '',
        statut: 'a_faire',
        priorite: taskFormData.priorite || 'normale',
        assignedTo: taskFormData.assignedTo,
        dossier: dossierId
      };
      
      // Ajouter le titre seulement s'il est fourni (optionnel)
      if (taskFormData.titre && taskFormData.titre.trim()) {
        taskData.titre = taskFormData.titre.trim();
      }
      
      const response = await tasksAPI.createTask(taskData);

      if (response.data.success) {
        // Réinitialiser le formulaire
        setTaskFormData({
          titre: '',
          description: '',
          priorite: 'normale',
          assignedTo: []
        });
        setShowTaskFormForDossier(null);
        // Recharger les tâches
        await loadDossierTasks();
        setError(null);
        setTaskSuccessMessage('Tâche créée avec succès !');
        setTimeout(() => setTaskSuccessMessage(null), 3000);
      } else {
        setError(response.data.message || 'Erreur lors de la création de la tâche');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors de la création de la tâche:', err);
      setError(err.response?.data?.message || 'Erreur lors de la création de la tâche');
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleMarkTaskAsDone = async (taskId: string, dossierId: string) => {
    try {
      const response = await tasksAPI.updateTask(taskId, {
        effectue: true,
        statut: 'termine'
      });
      
      if (response.data.success) {
        // Recharger les tâches
        await loadDossierTasks();
      } else {
        setError(response.data.message || 'Erreur lors de la mise à jour de la tâche');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors de la mise à jour de la tâche:', err);
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour de la tâche');
    }
  };

  const handleCancelTask = async (taskId: string, dossierId: string) => {
    try {
      const response = await tasksAPI.updateTask(taskId, {
        statut: 'annule'
      });
      
      if (response.data.success) {
        // Recharger les tâches
        await loadDossierTasks();
      } else {
        setError(response.data.message || 'Erreur lors de l\'annulation de la tâche');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors de l\'annulation de la tâche:', err);
      setError(err.response?.data?.message || 'Erreur lors de l\'annulation de la tâche');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const dossierData: any = {
        // Tous les champs sont optionnels côté backend.
        // On n'envoie que les valeurs réellement renseignées.
      };

      if (formData.titre) dossierData.titre = formData.titre;
      if (formData.description) dossierData.description = formData.description;
      if (formData.categorie) dossierData.categorie = formData.categorie;
      if (formData.type) dossierData.type = formData.type;
      if (formData.statut) dossierData.statut = formData.statut;
      if (formData.priorite) dossierData.priorite = formData.priorite;
      if (formData.notes) dossierData.notes = formData.notes;

      if (clientType === 'existing') {
        if (formData.userId) {
          dossierData.userId = formData.userId;
        }
      } else {
        if (formData.clientNom) dossierData.clientNom = formData.clientNom;
        if (formData.clientPrenom) dossierData.clientPrenom = formData.clientPrenom;
        if (formData.clientEmail) dossierData.clientEmail = formData.clientEmail;
        if (formData.clientTelephone) dossierData.clientTelephone = formData.clientTelephone;
      }

      if (formData.dateEcheance) {
        dossierData.dateEcheance = formData.dateEcheance;
      }

      if (formData.assignedTo) {
        dossierData.assignedTo = formData.assignedTo;
      }

      const response = await dossiersAPI.createDossier(dossierData);
      if (response.data.success) {
        setDossiers([response.data.dossier, ...dossiers]);
        setIsCreating(false);
        setFormData({
          userId: '',
          clientNom: '',
          clientPrenom: '',
          clientEmail: '',
          clientTelephone: '',
          titre: '',
          description: '',
          categorie: '',
          type: '',
          statut: 'recu',
          priorite: 'normale',
          dateEcheance: '',
          notes: '',
          assignedTo: '',
        });
        setClientType('existing');
      }
    } catch (err: any) {
      console.error('Erreur lors de la création du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors de la création du dossier');
    } finally {
      setIsLoading(false);
    }
  };


  const getCategorieLabel = (categorie: string) => {
    return categories[categorie as keyof typeof categories]?.label || categorie;
  };

  const getTypeLabel = (categorie: string, type: string) => {
    const categorieTypes = categories[categorie as keyof typeof categories]?.types || [];
    const typeObj = categorieTypes.find(t => t.value === type);
    return typeObj?.label || type;
  };

  const handleEditDossier = (dossier: any) => {
    setEditingDossier(dossier);
    setFormData({
      userId: dossier.user?._id || dossier.user || '',
      clientNom: dossier.clientNom || '',
      clientPrenom: dossier.clientPrenom || '',
      clientEmail: dossier.clientEmail || '',
      clientTelephone: dossier.clientTelephone || '',
      titre: dossier.titre || '',
      description: dossier.description || '',
      categorie: dossier.categorie || '',
      type: dossier.type || '',
      statut: dossier.statut || 'en_attente',
      priorite: dossier.priorite || 'normale',
      dateEcheance: dossier.dateEcheance ? new Date(dossier.dateEcheance).toISOString().split('T')[0] : '',
      notes: dossier.notes || '',
      assignedTo: dossier.assignedTo?._id || dossier.assignedTo || '',
    });
    setClientType(dossier.user ? 'existing' : 'new');
    setIsCreating(true);
  };

  const handleUpdateDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDossier) return;

    setIsLoading(true);
    setError(null);

    try {
      const updateData: any = {
        titre: formData.titre,
        description: formData.description,
        categorie: formData.categorie,
        type: formData.type,
        statut: formData.statut,
        priorite: formData.priorite,
        notes: formData.notes,
      };

      if (formData.dateEcheance) {
        updateData.dateEcheance = formData.dateEcheance;
      }

      if (formData.assignedTo) {
        updateData.assignedTo = formData.assignedTo;
      } else {
        updateData.assignedTo = null;
      }

      const response = await dossiersAPI.updateDossier(editingDossier._id || editingDossier.id, updateData);
      if (response.data.success) {
        await loadDossiers();
        setEditingDossier(null);
        setIsCreating(false);
        setFormData({
          userId: '',
          clientNom: '',
          clientPrenom: '',
          clientEmail: '',
          clientTelephone: '',
          titre: '',
          description: '',
          categorie: '',
          type: '',
          statut: 'recu',
          priorite: 'normale',
          dateEcheance: '',
          notes: '',
          assignedTo: '',
        });
        setClientType('existing');
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour du dossier');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDossier = async (dossierId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await dossiersAPI.deleteDossier(dossierId);
      if (response.data.success) {
        await loadDossiers();
        setShowDeleteConfirm(null);
      }
    } catch (err: any) {
      console.error('Erreur lors de la suppression du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors de la suppression du dossier');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeStatut = async (dossierId: string, newStatut: string) => {
    // Trouver le dossier pour obtenir son titre et statut actuel
    const dossier = dossiers.find(d => (d._id || d.id) === dossierId);
    if (dossier && dossier.statut !== newStatut) {
      setShowStatutModal({
        dossierId,
        dossierTitre: dossier.titre,
        currentStatut: dossier.statut,
        newStatut
      });
      setNotificationMessage(''); // Réinitialiser le message
    }
  };

  const confirmChangeStatut = async () => {
    if (!showStatutModal) return;
    
    setIsLoading(true);
    setError(null);
    try {
      // Construire l'objet de mise à jour en excluant les valeurs undefined
      const updateData: any = { 
        statut: showStatutModal.newStatut
      };
      
      // Ajouter notificationMessage seulement s'il n'est pas vide
      if (notificationMessage && notificationMessage.trim()) {
        updateData.notificationMessage = notificationMessage.trim();
      }
      
      console.log('📤 Envoi de la mise à jour:', JSON.stringify(updateData, null, 2));
      console.log('📤 Statut:', showStatutModal.newStatut);
      console.log('📤 Notification message:', notificationMessage);
      
      const response = await dossiersAPI.updateDossier(showStatutModal.dossierId, updateData);
      if (response.data.success) {
        await loadDossiers();
        setShowStatutModal(null);
        setNotificationMessage('');
      }
    } catch (err: any) {
      console.error('Erreur lors du changement de statut:', err);
      console.error('Détails de l\'erreur:', {
        status: err.response?.status,
        data: err.response?.data,
        errors: err.response?.data?.errors
      });
      
      // Afficher les erreurs de validation de manière plus détaillée
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        const errorMessages = err.response.data.errors.map((e: any) => `${e.param}: ${e.msg}`).join(', ');
        setError(`Erreurs de validation: ${errorMessages}`);
      } else {
        setError(err.response?.data?.message || 'Erreur lors du changement de statut');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignDossier = async (dossierId: string, assignedTo: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await dossiersAPI.updateDossier(dossierId, { assignedTo: assignedTo || null });
      if (response.data.success) {
        await loadDossiers();
      }
    } catch (err: any) {
      console.error('Erreur lors de l\'assignation du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors de l\'assignation du dossier');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptDossier = async (dossierId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await dossiersAPI.updateDossier(dossierId, { statut: 'en_cours' });
      if (response.data.success) {
        await loadDossiers();
      }
    } catch (err: any) {
      console.error('Erreur lors de l\'acceptation du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors de l\'acceptation du dossier');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefuseDossier = async () => {
    if (!showRefuseModal) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const response = await dossiersAPI.updateDossier(showRefuseModal.dossierId, { 
        statut: 'refuse',
        motifRefus: motifRefus.trim() || 'Dossier refusé par l\'administrateur',
        notificationMessage: motifRefus.trim() || `Votre dossier "${showRefuseModal.dossierTitre}" a été refusé par l'administrateur.`
      });
      if (response.data.success) {
        await loadDossiers();
        setShowRefuseModal(null);
        setMotifRefus('');
      }
    } catch (err: any) {
      console.error('Erreur lors du refus du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors du refus du dossier');
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!session || ((session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scroll-text {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        .animate-scroll-text {
          animation: scroll-text 15s linear infinite;
          display: inline-block;
          padding-left: 100%;
        }
        .animate-scroll-text:hover {
          animation-play-state: paused;
        }
      `}} />
      <main className="w-full px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">Gestion des Dossiers</h1>
            <p className="text-muted-foreground text-sm">
              Gérez tous les dossiers des clients
              {dossiers.filter((d: any) => d.statut === 'recu' || d.statut === 'en_attente_onboarding').length > 0 && (
                <span className="ml-2 text-primary font-semibold">
                  ({dossiers.filter((d: any) => d.statut === 'recu' || d.statut === 'en_attente_onboarding').length} en attente)
                </span>
              )}
            </p>
          </div>
          <Button onClick={() => setIsCreating(true)} className="shadow-md hover:shadow-lg transition-shadow">
            + Créer un dossier
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Formulaire de création - Modal */}
        {isCreating && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
                <h2 className="text-2xl font-bold text-foreground">
                  {editingDossier ? 'Modifier le dossier' : 'Créer un nouveau dossier'}
                </h2>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setEditingDossier(null);
                    setFormData({
                      userId: '',
                      clientNom: '',
                      clientPrenom: '',
                      clientEmail: '',
                      clientTelephone: '',
                      titre: '',
                      description: '',
                      categorie: '',
                      type: '',
                      statut: 'recu',
                      priorite: 'normale',
                      dateEcheance: '',
                      notes: '',
                      assignedTo: '',
                    });
                    setClientType('existing');
                  }}
                  className="text-muted-foreground hover:text-foreground text-2xl leading-none transition-colors"
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={editingDossier ? handleUpdateDossier : handleSubmit} className="p-6 space-y-5">
              {/* Type de client */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <Label className="mb-3 block text-sm font-semibold">Type de client</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-md border-2 transition-colors hover:bg-gray-100" style={{ borderColor: clientType === 'existing' ? '#FF6600' : '#e5e7eb' }}>
                    <input
                      type="radio"
                      name="clientType"
                      value="existing"
                      checked={clientType === 'existing'}
                      onChange={(e) => setClientType(e.target.value as 'existing' | 'new')}
                      className="h-4 w-4 text-primary"
                    />
                    <span className="text-sm font-medium">Utilisateur inscrit</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-md border-2 transition-colors hover:bg-gray-100" style={{ borderColor: clientType === 'new' ? '#FF6600' : '#e5e7eb' }}>
                    <input
                      type="radio"
                      name="clientType"
                      value="new"
                      checked={clientType === 'new'}
                      onChange={(e) => setClientType(e.target.value as 'existing' | 'new')}
                      className="h-4 w-4 text-primary"
                    />
                    <span className="text-sm font-medium">Utilisateur non inscrit</span>
                  </label>
                </div>
              </div>

              {/* Sélection utilisateur existant */}
              {clientType === 'existing' && !editingDossier && (
                <div>
                  <Label htmlFor="userId">Sélectionner un utilisateur</Label>
                  <select
                    id="userId"
                    value={formData.userId}
                    onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                  >
                    <option value="">-- Sélectionner un utilisateur --</option>
                    {utilisateurs.map((user) => (
                      <option key={user._id || user.id} value={user._id || user.id}>
                        {user.firstName} {user.lastName} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Formulaire utilisateur non inscrit */}
              {clientType === 'new' && !editingDossier && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="clientNom">Nom</Label>
                    <Input
                      id="clientNom"
                      value={formData.clientNom}
                      onChange={(e) => setFormData({ ...formData, clientNom: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientPrenom">Prénom</Label>
                    <Input
                      id="clientPrenom"
                      value={formData.clientPrenom}
                      onChange={(e) => setFormData({ ...formData, clientPrenom: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientEmail">Email</Label>
                    <Input
                      id="clientEmail"
                      type="email"
                      value={formData.clientEmail}
                      onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientTelephone">Téléphone</Label>
                    <Input
                      id="clientTelephone"
                      type="tel"
                      value={formData.clientTelephone}
                      onChange={(e) => setFormData({ ...formData, clientTelephone: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              {/* Informations du dossier */}
              <div className="border-t pt-5">
                <h3 className="text-lg font-semibold mb-4 text-foreground">Informations du dossier</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="titre">Titre du dossier</Label>
                    <Input
                      id="titre"
                      value={formData.titre}
                      onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                      className="mt-1"
                      placeholder="Ex: Demande de titre de séjour"
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="mt-1"
                      rows={3}
                      placeholder="Description détaillée du dossier..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="categorie">Catégorie de dossier</Label>
                      <select
                        id="categorie"
                        value={formData.categorie}
                        onChange={(e) => setFormData({ ...formData, categorie: e.target.value, type: '' })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                      >
                        <option value="">-- Sélectionner une catégorie --</option>
                        {Object.entries(categories).map(([key, cat]) => (
                          <option key={key} value={key}>{cat.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="type">Type de dossier</Label>
                      <select
                        id="type"
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                        disabled={!formData.categorie}
                      >
                        <option value="">-- Sélectionner un type --</option>
                        {formData.categorie && categories[formData.categorie as keyof typeof categories]?.types.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">

                    <div>
                      <Label>
                        Étapes et statut du dossier
                      </Label>
                      <div className="mt-1 flex flex-col gap-1.5">
                        <button
                          type="button"
                          disabled
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 text-xs font-medium bg-gray-50 text-gray-400 cursor-not-allowed"
                          title="Après la création du dossier, utilisez ce bouton dans la fiche du dossier pour définir les étapes et le statut."
                        >
                          ✏️ Éditer les étapes (disponible après création)
                        </button>
                        <p className="text-xs text-muted-foreground">
                          Le dossier sera créé avec le statut initial <strong>« Reçu »</strong>. 
                          Après la création, ouvrez la fiche du dossier pour définir les étapes personnalisées et le statut via le bouton <strong>« ✏️ Éditer les étapes »</strong>.
                        </p>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="priorite">Priorité</Label>
                      <select
                        id="priorite"
                        value={formData.priorite}
                        onChange={(e) => setFormData({ ...formData, priorite: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                      >
                        <option value="basse">Basse</option>
                        <option value="normale">Normale</option>
                        <option value="haute">Haute</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="dateEcheance">Date d'échéance</Label>
                    <Input
                      id="dateEcheance"
                      type="date"
                      value={formData.dateEcheance}
                      onChange={(e) => setFormData({ ...formData, dateEcheance: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes internes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="mt-1"
                      rows={2}
                      placeholder="Notes internes pour l'équipe..."
                    />
                  </div>

                  <div>
                    <Label htmlFor="assignedTo">Attribué à (assignation rapide)</Label>
                    <select
                      id="assignedTo"
                      value={formData.assignedTo}
                      onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                    >
                      <option value="">-- Non assigné --</option>
                      {teamMembers.map((member) => (
                        <option key={member._id || member.id} value={member._id || member.id}>
                          {member.firstName} {member.lastName} ({member.email}) - {member.role === 'superadmin' ? 'Superadmin' : 'Admin'}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      👨‍💼 <strong>Fonction :</strong> Assignation rapide d'un membre de l'équipe pour le suivi initial du dossier. 
                      Pour une gestion complète de l'équipe (plusieurs membres, chef d'équipe), utilisez la section "Gestion d'équipe" dans les détails du dossier.
                    </p>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3 justify-end mt-6">
                <Button type="button" variant="outline" onClick={() => {
                  setIsCreating(false);
                  setEditingDossier(null);
                  setFormData({
                    userId: '',
                    clientNom: '',
                    clientPrenom: '',
                    clientEmail: '',
                    clientTelephone: '',
                    titre: '',
                    description: '',
                    categorie: '',
                    type: '',
                    statut: 'recu',
                    priorite: 'normale',
                    dateEcheance: '',
                    notes: '',
                    assignedTo: '',
                  });
                  setClientType('existing');
                }} disabled={isLoading}>
                  Annuler
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (editingDossier ? 'Mise à jour...' : 'Création...') : (editingDossier ? 'Mettre à jour' : 'Créer le dossier')}
                </Button>
              </div>
            </form>
            </div>
          </div>
        )}

        {/* Liste des dossiers */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          {/* Barre de recherche et filtres */}
          <div className="mb-5 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex-1 w-full sm:max-w-md">
                <input
                  type="text"
                  placeholder="🔍 Rechercher un dossier..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setTimeout(() => loadDossiers(), 500);
                  }}
                  className="flex h-10 w-full rounded-lg border border-gray-300 bg-background px-4 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                />
              </div>
              <div className="w-full sm:w-64">
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-gray-300 bg-background px-4 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                >
                  <option value="all">👤 Tous les utilisateurs</option>
                  <option value="no_user">👤 Sans utilisateur</option>
                  {utilisateurs.map((user: any) => (
                    <option key={user._id || user.id} value={(user._id || user.id)?.toString()}>
                      {`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={loadDossiers} variant="outline" size="sm" className="whitespace-nowrap">
                🔄 Actualiser
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Chargement des dossiers...</p>
            </div>
          ) : dossiers.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📁</span>
              </div>
              <p className="text-muted-foreground text-lg font-medium mb-2">
                {searchTerm ? 'Aucun dossier ne correspond à votre recherche' : 'Aucun dossier trouvé'}
              </p>
              {!searchTerm && (
                <p className="text-sm text-muted-foreground">Commencez par créer votre premier dossier</p>
              )}
            </div>
          ) : (
            <>
              {/* Statistiques rapides (badges cliquables) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                {/* En attente : dossiers créés par un utilisateur dont le statut n'a pas encore été édité par l'admin */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`text-left bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-300/70 rounded-lg p-4 shadow-sm transition-all duration-300 ${
                    statusFilter === 'pending'
                      ? 'ring-2 ring-yellow-500/60 shadow-md'
                      : 'hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <p className="text-xs text-yellow-700 font-semibold mb-1 uppercase tracking-wide">En attente</p>
                  <p className="text-2xl font-bold text-yellow-900">
                    {dossiers.filter((d: any) => {
                      const hasClient = !!d.user; // dossier créé par un utilisateur
                      const rawStatut = d.statut || '';
                      const initialStatut =
                        !rawStatut ||
                        rawStatut === 'recu' ||
                        rawStatut === 'en_attente_onboarding';
                      return (
                        hasClient &&
                        initialStatut &&
                        !d.estCloture &&
                        !d.estArchive
                      );
                    }).length}
                  </p>
                </button>
                {/* En cours : tous les autres dossiers non clôturés / non archivés */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('in_progress')}
                  className={`text-left bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-300/70 rounded-lg p-4 shadow-sm transition-all duration-300 ${
                    statusFilter === 'in_progress'
                      ? 'ring-2 ring-blue-500/60 shadow-md'
                      : 'hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <p className="text-xs text-blue-700 font-semibold mb-1 uppercase tracking-wide">En cours</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {dossiers.filter((d: any) => {
                      const hasClient = !!d.user;
                      const rawStatut = d.statut || '';
                      const initialStatut =
                        hasClient &&
                        (!rawStatut ||
                          rawStatut === 'recu' ||
                          rawStatut === 'en_attente_onboarding');
                      return (
                        !d.estCloture &&
                        !d.estArchive &&
                        !initialStatut
                      );
                    }).length}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('closed')}
                  className={`text-left bg-gradient-to-br from-green-50 to-green-100 border border-green-300/70 rounded-lg p-4 shadow-sm transition-all duration-300 ${
                    statusFilter === 'closed'
                      ? 'ring-2 ring-green-500/60 shadow-md'
                      : 'hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <p className="text-xs text-green-700 font-semibold mb-1 uppercase tracking-wide">Clôturés</p>
                  <p className="text-2xl font-bold text-green-900">
                    {dossiers.filter((d: any) => d.estCloture).length}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('archived')}
                  className={`text-left bg-gradient-to-br from-red-50 to-red-100 border border-red-300/70 rounded-lg p-4 shadow-sm transition-all duration-300 ${
                    statusFilter === 'archived'
                      ? 'ring-2 ring-red-500/60 shadow-md'
                      : 'hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <p className="text-xs text-red-700 font-semibold mb-1 uppercase tracking-wide">Archivés</p>
                  <p className="text-2xl font-bold text-red-900">
                    {dossiers.filter((d: any) => d.estArchive).length}
                  </p>
                </button>
              </div>

              {/* Indicateur de filtre actif et réinitialisation */}
              <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
                <div>
                  {statusFilter === 'all' && userFilter === 'all' ? (
                    <span>Tous les dossiers sont affichés.</span>
                  ) : (
                    <span>
                      Filtre appliqué :{' '}
                      <span className="font-semibold text-primary">
                        {statusFilter !== 'all' && (
                          <>
                            {statusFilter === 'pending' && 'En attente'}
                            {statusFilter === 'in_progress' && 'En cours'}
                            {statusFilter === 'closed' && 'Clôturés'}
                            {statusFilter === 'archived' && 'Archivés'}
                          </>
                        )}
                        {statusFilter !== 'all' && userFilter !== 'all' && ' • '}
                        {userFilter !== 'all' && (
                          <>
                            {userFilter === 'no_user' ? 'Sans utilisateur' : (
                              (() => {
                                const selectedUser = utilisateurs.find((u: any) => (u._id || u.id)?.toString() === userFilter);
                                return selectedUser ? `${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`.trim() || selectedUser.email : 'Utilisateur';
                              })()
                            )}
                          </>
                        )}
                      </span>
                    </span>
                  )}
                </div>
                {(statusFilter !== 'all' || userFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setUserFilter('all');
                    }}
                    className="px-2 py-1 rounded-md border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Réinitialiser les filtres
                  </button>
                )}
              </div>

              {/* Liste des dossiers en cartes */}
              {(() => {
                const filteredDossiers = dossiers.filter((d: any) => {
                  // Filtre par statut (logique simplifiée admin)
                  if (statusFilter === 'pending') {
                    // Dossiers créés par un utilisateur dont le statut n'a pas encore été édité par l'admin
                    const hasClient = !!d.user;
                    const rawStatut = d.statut || '';
                    const initialStatut =
                      !rawStatut ||
                      rawStatut === 'recu' ||
                      rawStatut === 'en_attente_onboarding';
                    if (
                      !hasClient ||
                      !initialStatut ||
                      d.estCloture ||
                      d.estArchive
                    ) {
                      return false;
                    }
                  } else if (statusFilter === 'in_progress') {
                    // Tous les autres dossiers non clôturés / non archivés
                    const hasClient = !!d.user;
                    const rawStatut = d.statut || '';
                    const initialStatut =
                      hasClient &&
                      (!rawStatut ||
                        rawStatut === 'recu' ||
                        rawStatut === 'en_attente_onboarding');
                    if (
                      initialStatut ||
                      d.estCloture ||
                      d.estArchive
                    ) {
                      return false;
                    }
                  } else if (statusFilter === 'closed') {
                    if (!d.estCloture) return false;
                  } else if (statusFilter === 'archived') {
                    if (!d.estArchive) return false;
                  }

                  // Filtre par utilisateur
                  if (userFilter !== 'all') {
                    const dossierUserId = d.user?._id?.toString() || d.user?.toString() || d.userId?.toString();
                    if (userFilter === 'no_user') {
                      // Filtrer les dossiers sans utilisateur connecté
                      if (dossierUserId) return false;
                    } else {
                      // Filtrer par utilisateur spécifique
                      if (dossierUserId !== userFilter) return false;
                    }
                  }

                  return true;
                });

                if (filteredDossiers.length === 0) {
                  return (
                    <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
                      <p className="text-sm text-muted-foreground mb-3">
                        Aucun dossier ne correspond aux filtres sélectionnés.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter('all');
                          setUserFilter('all');
                        }}
                        className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary/90"
                      >
                        Réinitialiser les filtres
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {filteredDossiers.map((dossier) => (
                  <div
                    key={dossier._id || dossier.id}
                    className={`relative group overflow-hidden rounded-xl p-4 sm:p-5 transition-all duration-300 bg-gradient-to-r shadow-sm hover:-translate-y-0.5 w-full min-w-0 ${
                      dossier.statut === 'recu' || dossier.statut === 'en_attente_onboarding'
                        ? 'from-yellow-200/70 via-amber-200/70 to-yellow-200/70 group-hover:from-yellow-400/70 group-hover:via-amber-400/70 group-hover:to-yellow-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(234,179,8,0.5)]'
                        : dossier.statut === 'decision_favorable' || dossier.statut === 'gain_cause'
                        ? 'from-green-200/70 via-emerald-200/70 to-green-200/70 group-hover:from-green-400/70 group-hover:via-emerald-400/70 group-hover:to-green-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(34,197,94,0.5)]'
                        : dossier.statut === 'decision_defavorable' || dossier.statut === 'refuse' || dossier.statut === 'rejet'
                        ? 'from-red-200/70 via-rose-200/70 to-red-200/70 group-hover:from-red-400/70 group-hover:via-rose-400/70 group-hover:to-red-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(239,68,68,0.5)]'
                        : 'from-blue-200/70 via-indigo-200/70 to-blue-200/70 group-hover:from-blue-400/70 group-hover:via-indigo-400/70 group-hover:to-blue-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(59,130,246,0.5)]'
                    } after:content-[''] after:absolute after:inset-[1px] after:rounded-xl after:bg-white after:border after:border-white/70 after:-z-10 after:transition-transform after:duration-300 group-hover:after:shadow-md`}
                  >
                    {/* En-tête de la carte : vue admin très compacte, infos essentielles sur toute la largeur */}
                    <div className="flex flex-col gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <button
                            onClick={() => {
                              const dossierId = dossier._id || dossier.id;
                              const newExpanded = new Set(expandedDossiers);
                              if (newExpanded.has(dossierId)) {
                                newExpanded.delete(dossierId);
                              } else {
                                newExpanded.add(dossierId);
                              }
                              setExpandedDossiers(newExpanded);
                            }}
                            className="p-2 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors text-gray-600 hover:text-primary flex-shrink-0"
                            title={expandedDossiers.has(dossier._id || dossier.id) ? 'Plier le dossier' : 'Déplier le dossier'}
                            aria-label={expandedDossiers.has(dossier._id || dossier.id) ? 'Plier le dossier' : 'Déplier le dossier'}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={expandedDossiers.has(dossier._id || dossier.id) ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                            </svg>
                          </button>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base text-foreground line-clamp-1 leading-snug truncate">
                              {typeof dossier.titre === 'string' && dossier.titre ? dossier.titre : 'Sans titre'}
                            </h3>
                            {(dossier.numero || dossier.numeroDossier) && (
                              <p className="text-xs text-primary font-mono font-semibold">
                                Réf. {dossier.numero || dossier.numeroDossier}
                              </p>
                            )}
                            {/* Client / créateur du dossier — toujours visible, même plié */}
                            <p className="text-xs text-primary font-medium">
                              Client : {dossier.user && typeof dossier.user === 'object'
                                ? [dossier.user.firstName, dossier.user.lastName].filter(Boolean).join(' ') || dossier.user.email || '—'
                                : [dossier.clientPrenom, dossier.clientNom].filter(Boolean).join(' ') || dossier.clientEmail || 'Non renseigné'}
                            </p>
                            {/* Résumé compact des infos clés du dossier (plié) */}
                            {!expandedDossiers.has(dossier._id || dossier.id) && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                                {(() => {
                                  const dossierId = dossier._id || dossier.id;
                                  const totalDocuments = dossierDocuments[dossierId]?.length || dossier.documents?.length || 0;
                                  const tasks = dossierTasks[dossierId] || [];
                                  const draftsCount = dossierDrafts[dossierId]?.length ?? 0;
                                  const transmissions = (dossier.transmittedTo && dossier.transmittedTo.length) || 0;
                                  const mainTransmission =
                                    Array.isArray(dossier.transmittedTo) && dossier.transmittedTo.length > 0
                                      ? dossier.transmittedTo[0]
                                      : null;
                                  const hasDeadline = !!dossier.dateEcheance;
                                  const deadlineDays = hasDeadline ? calculateDaysUntil(dossier.dateEcheance) : null;

                                  return (
                                    <>
                                      <span>📄 Documents : <span className="font-semibold text-foreground">{totalDocuments}</span></span>
                                      <span>
                                        📝 En préparation :{' '}
                                        <span className="font-semibold text-foreground">
                                          {draftsCount} document{draftsCount > 1 ? 's' : ''}
                                        </span>
                                      </span>
                                      {tasks.length > 0 && (
                                        <span>✅ Tâches : <span className="font-semibold text-foreground">{tasks.length}</span></span>
                                      )}
                                      {transmissions > 0 && (
                                        <span>
                                          📤 Transmissions :{' '}
                                          <span className="font-semibold text-foreground">
                                            {transmissions}
                                          </span>
                                        </span>
                                      )}
                                      {hasDeadline && (
                                        <span>
                                          ⏰ Échéance :{' '}
                                          <span className={deadlineDays !== null && deadlineDays < 0 ? 'text-red-600 font-semibold' : 'text-foreground font-semibold'}>
                                            {deadlineDays !== null && deadlineDays < 0
                                              ? `dépassée (${Math.abs(deadlineDays)} j)`
                                              : `${deadlineDays} j`}
                                          </span>
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Bloc statut / priorité / action aligné en haut à droite */}
                      <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0 w-full">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${getStatutColor(dossier.statut)}`}>
                            {getStatutLabel(dossier.statut)}
                          </span>
                          {dossier.priorite && (
                            <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${getPrioriteColor(dossier.priorite)}`}>
                              {dossier.priorite}
                            </span>
                          )}
                        </div>
                        <Link
                          href={`/admin/dossiers/${dossier._id || dossier.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center px-3 py-2 h-9 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                        >
                          Voir les détails
                        </Link>
                      </div>
                    </div>

                    {/* Contenu détaillé (affiché uniquement si le dossier est déplié) */}
                    {expandedDossiers.has(dossier._id || dossier.id) && (
                      <>
                    {/* Client */}
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Client</p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-100">
                          {dossier.user && (dossier.user.avatarUrl || dossier.user.photoUrl) ? (
                            // Photo du client si disponible
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={String(dossier.user.avatarUrl || dossier.user.photoUrl)}
                              alt={`${dossier.user.firstName || ''} ${dossier.user.lastName || ''}`.trim() || 'Photo client'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-base text-gray-600">👤</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {dossier.user ? (
                            <>
                              <p className="font-semibold text-sm text-foreground truncate">
                                {dossier.user.firstName} {dossier.user.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{dossier.user.email}</p>
                            </>
                          ) : (
                            <>
                              <p className="font-semibold text-sm text-foreground truncate">
                                {dossier.clientPrenom} {dossier.clientNom}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{dossier.clientEmail}</p>
                              <span className="text-xs text-amber-600">(Non inscrit)</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Avancement du dossier */}
                    {(() => {
                      const progress = getDossierProgress(dossier.statut);
                      return (
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground font-medium">Avancement du dossier</span>
                            <span className="font-semibold text-foreground">{progress} %</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all duration-300 ${
                                progress >= 80 ? 'bg-green-500' : 
                                progress >= 50 ? 'bg-blue-500' : 
                                progress >= 25 ? 'bg-yellow-500' : 
                                'bg-gray-400'
                              }`}
                              style={{width: `${progress}%`}}
                            />
                          </div>
                          {Array.isArray(dossier.etapesSupplementaires) && dossier.etapesSupplementaires.length > 0 && (
                            <div className="mt-1">
                              <div className="flex items-center gap-1 justify-between">
                                {dossier.etapesSupplementaires.map((step: any, index: number) => {
                                  const isCurrent =
                                    dossier.statut &&
                                    (dossier.statut === step.label || dossier.statut === step.id);
                                  return (
                                    <div
                                      key={step.id || index}
                                      className="flex-1 flex flex-col items-center"
                                    >
                                      <div
                                        className={`w-full h-1 rounded-full ${
                                          isCurrent ? 'bg-blue-500' : 'bg-transparent'
                                        }`}
                                      />
                                      <span
                                        className={`mt-0.5 text-[9px] text-center truncate max-w-[80px] ${
                                          isCurrent ? 'text-blue-700 font-semibold' : 'text-gray-400'
                                        }`}
                                        title={step.label}
                                      >
                                        {step.label}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Alerte d'échéance */}
                    {isDeadlineApproaching(dossier.dateEcheance) && (
                      <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-3 rounded-r">
                        <p className="text-xs font-semibold text-red-900">
                          Échéance dans {calculateDaysUntil(dossier.dateEcheance)} jour{calculateDaysUntil(dossier.dateEcheance) > 1 ? 's' : ''}
                        </p>
                      </div>
                    )}

                    {/* Prochaine action */}
                    {(() => {
                      const nextAction = getNextAction(dossier.statut);
                      if (nextAction) {
                        return (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-blue-900 mb-0.5">Prochaine action</p>
                            <p className="text-xs text-blue-800">{nextAction}</p>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Documents en préparation — même affichage que l'espace partenaire */}
                    {(dossierDrafts[dossier._id || dossier.id]?.length || 0) > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Documents en préparation
                        </p>
                        <Link
                          href={`/admin/dossiers/${dossier._id || dossier.id}/documents-en-preparation`}
                          onClick={(e) => e.stopPropagation()}
                          className="block rounded-lg border border-gray-200 bg-gray-50/50 p-3 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                        >
                          <div className="space-y-2">
                            {(dossierDrafts[dossier._id || dossier.id] || []).map((d: any) => (
                              <div key={d._id} className="rounded border border-gray-100 bg-white px-3 py-2">
                                <p className="font-medium text-sm text-foreground">
                                  {d.title || 'Sans titre'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Créé par :{' '}
                                  {d.createdBy
                                    ? `${d.createdBy.firstName || ''} ${d.createdBy.lastName || ''}`.trim() ||
                                      d.createdBy.role ||
                                      '—'
                                    : '—'}
                                </p>
                                {d.partnerAccess?.length > 0 && (
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    Accès :{' '}
                                    {(
                                      d.partnerAccess
                                        .map((pa: any) =>
                                          pa.partner &&
                                          typeof pa.partner === 'object' &&
                                          (pa.partner.firstName || pa.partner.lastName)
                                            ? `${(pa.partner.firstName || '').trim()} ${(pa.partner.lastName || '').trim()}`.trim()
                                            : null
                                        )
                                        .filter(Boolean)
                                        .join(', ')
                                    ) || '—'}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-primary font-medium mt-2">
                            Ouvrir la page Documents en préparation →
                          </p>
                        </Link>
                      </div>
                    )}

                    {/* Informations du dossier — version compacte */}
                    <div className="mb-3 pb-3 border-b border-gray-200">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {(dossier.numero || dossier.numeroDossier) && (
                          <span>
                            Réf.{" "}
                            <span className="font-mono font-semibold text-foreground">
                              {dossier.numero || dossier.numeroDossier}
                            </span>
                          </span>
                        )}
                        <span>
                          Catégorie :{" "}
                          <span className="font-medium text-foreground">
                            {getCategorieLabel(dossier.categorie || "autre")}
                          </span>
                        </span>
                        {dossier.type && (
                          <span>
                            Type :{" "}
                            <span className="text-foreground">
                              {getTypeLabel(dossier.categorie || "autre", dossier.type)}
                            </span>
                          </span>
                        )}
                        <span>
                          Assigné à :{" "}
                          <span className="text-foreground">
                            {dossier.assignedTo
                              ? `${dossier.assignedTo.firstName || ""} ${dossier.assignedTo.lastName || ""}`.trim() ||
                                (dossier.assignedTo.email ?? "—")
                              : "Non assigné"}
                          </span>
                        </span>
                        {dossier.createdAt && (
                          <span>
                            Créé le :{" "}
                            <span className="text-foreground">
                              {new Date(dossier.createdAt).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </span>
                        )}
                        {dossier.updatedAt && (
                          <span>
                            Dernière activité :{" "}
                            <span className="text-foreground">
                              {formatRelativeTime(dossier.updatedAt)}
                            </span>
                          </span>
                        )}
                        {dossier.dateEcheance && (
                          <span>
                            Échéance :{" "}
                            <span className="font-medium text-foreground">
                              {new Date(dossier.dateEcheance).toLocaleDateString("fr-FR")}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Synthèse supprimée pour alléger la vue détaillée */}

                    {/* Section Tâches */}
                    {(() => {
                      const dossierId = dossier._id || dossier.id;
                      const tasks = dossierTasks[dossierId] || [];
                      const isTaskSectionExpanded = expandedTaskSections.has(dossierId);
                      const showForm = showTaskFormForDossier === dossierId;

                      return (
                        <div className="mb-3 pb-2 border-b border-gray-100">
                          <div 
                            className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-md p-1.5 -m-1.5 transition-colors"
                            onClick={() => {
                              const newExpanded = new Set(expandedTaskSections);
                              if (isTaskSectionExpanded) {
                                newExpanded.delete(dossierId);
                              } else {
                                newExpanded.add(dossierId);
                              }
                              setExpandedTaskSections(newExpanded);
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">✅</span>
                              <span className="text-xs font-semibold text-foreground">Tâches</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                tasks.length > 0 ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {tasks.length}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {isTaskSectionExpanded ? '▼' : '▶'}
                            </span>
                          </div>

                          {isTaskSectionExpanded && (
                            <div className="mt-2 space-y-2">
                              {/* Liste des tâches */}
                              {tasks.length > 0 ? (
                                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                  {tasks.map((task: any) => {
                                    const taskId = task._id || task.id;
                                    const dossierId = task.dossier?._id || task.dossier || task.dossierId?._id || task.dossierId;
                                    const isDone = task.statut === 'termine' || task.effectue;
                                    const isCancelled = task.statut === 'annule';
                                    
                                    return (
                                      <div key={taskId} className="bg-gray-50 rounded-md p-2 border border-gray-200">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-foreground truncate">{task.titre || 'Sans titre'}</p>
                                            {task.description && (
                                              <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{task.description}</p>
                                            )}
                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${getTaskStatutColor(task.statut)}`}>
                                                {getTaskStatutLabel(task.statut)}
                                              </span>
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${getTaskPrioriteColor(task.priorite)}`}>
                                                {getTaskPrioriteLabel(task.priorite)}
                                              </span>
                                              {task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0 && (
                                                <span className="text-[10px] text-muted-foreground">
                                                  👤 {task.assignedTo.length} assigné{task.assignedTo.length > 1 ? 's' : ''}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          {!isDone && !isCancelled && dossierId && (
                                            <div className="flex gap-1">
                                              <button
                                                onClick={() => handleMarkTaskAsDone(taskId, dossierId.toString())}
                                                className="text-[10px] px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                                                title="Marquer comme effectuée"
                                              >
                                                ✓
                                              </button>
                                              <button
                                                onClick={() => handleCancelTask(taskId, dossierId.toString())}
                                                className="text-[10px] px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                                                title="Annuler"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground text-center py-2">Aucune tâche</p>
                              )}

                              {/* Formulaire de création de tâche */}
                              {showForm ? (
                                <div 
                                  className="bg-blue-50 border border-blue-200 rounded-md p-2 space-y-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div>
                                    <Label htmlFor={`task-titre-${dossierId}`} className="text-[10px]">Titre (optionnel)</Label>
                                    <Input
                                      id={`task-titre-${dossierId}`}
                                      value={taskFormData.titre || ''}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        setTaskFormData(prev => ({ ...prev, titre: e.target.value }));
                                      }}
                                      placeholder="Titre de la tâche (optionnel)"
                                      className="h-8 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`task-description-${dossierId}`} className="text-[10px]">Description</Label>
                                    <textarea
                                      id={`task-description-${dossierId}`}
                                      value={taskFormData.description || ''}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        setTaskFormData(prev => ({ ...prev, description: e.target.value }));
                                      }}
                                      placeholder="Description (optionnelle)"
                                      className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-2 py-1.5 text-[10px]"
                                      rows={2}
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <Label htmlFor={`task-priorite-${dossierId}`} className="text-[10px]">Priorité</Label>
                                      <select
                                        id={`task-priorite-${dossierId}`}
                                        value={taskFormData.priorite || 'normale'}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          setTaskFormData(prev => ({ ...prev, priorite: e.target.value }));
                                        }}
                                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-[10px]"
                                      >
                                        <option value="basse">Basse</option>
                                        <option value="normale">Normale</option>
                                        <option value="haute">Haute</option>
                                        <option value="urgente">Urgente</option>
                                      </select>
                                    </div>
                                    <div>
                                      <Label className="text-[10px] mb-1 block">Assigner à *</Label>
                                      <div className="max-h-[80px] overflow-y-auto border border-input rounded-md p-1.5 space-y-1">
                                        {teamMembers.length === 0 ? (
                                          <p className="text-[10px] text-muted-foreground text-center py-1">Aucun membre disponible</p>
                                        ) : (
                                          teamMembers.map((member: any) => {
                                            const memberId = member._id || member.id;
                                            return (
                                              <label key={memberId} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                                                <input
                                                  type="checkbox"
                                                  checked={taskFormData.assignedTo.includes(memberId)}
                                                  onChange={(e) => {
                                                    e.stopPropagation();
                                                    setTaskFormData(prev => {
                                                      const currentAssigned = prev.assignedTo || [];
                                                      const newAssigned = e.target.checked
                                                        ? [...currentAssigned, memberId]
                                                        : currentAssigned.filter((id: string) => id !== memberId);
                                                      return { ...prev, assignedTo: newAssigned };
                                                    });
                                                  }}
                                                  className="h-3 w-3 rounded border-gray-300"
                                                />
                                                <span className="text-[10px] text-foreground">
                                                  {member.firstName} {member.lastName}
                                                </span>
                                              </label>
                                            );
                                          })
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleCreateTask(dossierId);
                                      }}
                                      disabled={isCreatingTask}
                                      className="h-7 text-[10px] px-2 flex-1"
                                    >
                                      {isCreatingTask ? 'Création...' : 'Créer'}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowTaskFormForDossier(null);
                                        setTaskFormData({
                                          titre: '',
                                          description: '',
                                          priorite: 'normale',
                                          assignedTo: []
                                        });
                                      }}
                                      className="h-7 text-[10px] px-2"
                                      disabled={isCreatingTask}
                                    >
                                      Annuler
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowTaskFormForDossier(dossierId);
                                    setTaskFormData({
                                      titre: '',
                                      description: '',
                                      priorite: 'normale',
                                      assignedTo: []
                                    });
                                  }}
                                  className="w-full h-7 text-[10px]"
                                >
                                  + Créer une tâche
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Section Documents demandés - Style identique au client */}
                    {(() => {
                      const dossierRequests = documentRequests[dossier._id || dossier.id] || [];
                      const pendingRequests = dossierRequests.filter((r: any) => r.status === 'pending');
                      const receivedRequests = dossierRequests.filter((r: any) => r.status === 'received' || r.status === 'sent');
                      const isExpanded = expandedDocumentSections.has(dossier._id || dossier.id);
                      
                      if (dossierRequests.length === 0) {
                        return null; // Ne rien afficher s'il n'y a pas de demandes
                      }
                      
                      return (
                        <div className="pt-3 border-t border-gray-200 mb-3">
                          <div 
                            className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-md p-2 -m-2 transition-colors"
                            onClick={() => {
                              const dossierId = dossier._id || dossier.id;
                              const newExpanded = new Set(expandedDocumentSections);
                              if (isExpanded) {
                                newExpanded.delete(dossierId);
                              } else {
                                newExpanded.add(dossierId);
                              }
                              setExpandedDocumentSections(newExpanded);
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-lg">📄</span>
                              <div>
                                <h4 className="text-sm font-semibold text-foreground">Documents demandés</h4>
                                <p className="text-xs text-muted-foreground">
                                  {pendingRequests.length > 0 && (
                                    <span className="text-orange-600 font-medium">
                                      {pendingRequests.length} en attente
                                    </span>
                                  )}
                                  {pendingRequests.length > 0 && receivedRequests.length > 0 && ' • '}
                                  {receivedRequests.length > 0 && (
                                    <span className="text-green-600 font-medium">
                                      {receivedRequests.length} reçu{receivedRequests.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <span className="text-muted-foreground text-sm">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                          
                          {isExpanded && (
                            <div className="mt-3 space-y-3">
                              {dossierRequests.map((request: any) => {
                                const isPending = request.status === 'pending';
                                const isUrgent = request.isUrgent;
                                
                                return (
                                  <div
                                    key={request._id || request.id}
                                    className={`border rounded-lg p-3 ${
                                      isPending
                                        ? isUrgent
                                          ? 'bg-red-50/50 border-red-200'
                                          : 'bg-orange-50/50 border-orange-200'
                                        : 'bg-green-50/50 border-green-200'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="text-lg flex-shrink-0">
                                            {isPending ? (isUrgent ? '🔴' : '📄') : '✅'}
                                          </span>
                                          <div className="flex-1 min-w-0">
                                            <h5 className={`font-semibold text-sm truncate ${
                                              isUrgent ? 'text-red-600' : 'text-foreground'
                                            }`}>
                                              {request.documentTypeLabel || request.documentType || 'Document'}
                                            </h5>
                                          </div>
                                          {isUrgent && (
                                            <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-bold flex-shrink-0">
                                              URGENT
                                            </span>
                                          )}
                                          <span className={`px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0 ${
                                            isPending
                                              ? 'bg-yellow-100 text-yellow-800'
                                              : 'bg-green-100 text-green-800'
                                          }`}>
                                            {isPending ? 'En attente' : 'Reçu'}
                                          </span>
                                        </div>
                                        
                                        {request.message && (
                                          <p className="text-xs text-muted-foreground mb-2 ml-7">
                                            {request.message}
                                          </p>
                                        )}
                                        
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground ml-7">
                                          <span>
                                            📅 Demandé le {new Date(request.createdAt).toLocaleDateString('fr-FR')}
                                          </span>
                                          {request.receivedAt && (
                                            <span>
                                              ✅ Reçu le {new Date(request.receivedAt).toLocaleDateString('fr-FR')}
                                            </span>
                                          )}
                                        </div>
                                        
                                        {/* Actions pour les documents reçus */}
                                        {!isPending && request.document && (
                                          <div className="flex items-center gap-2 mt-3 ml-7">
                                            <button
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                  const docResponse = await documentsAPI.getAllDocuments();
                                                  if (docResponse.data.success) {
                                                    const allDocs = docResponse.data.documents || docResponse.data.data || [];
                                                    const doc = allDocs.find((d: any) => 
                                                      (d._id || d.id).toString() === (request.document._id || request.document).toString()
                                                    );
                                                    if (doc) {
                                                      setSelectedDocumentForPreview(doc);
                                                      setShowDocumentPreviewModal(true);
                                                    }
                                                  }
                                                } catch (err) {
                                                  console.error('Erreur:', err);
                                                }
                                              }}
                                              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-medium transition-colors"
                                            >
                                              👁️ Voir
                                            </button>
                                            <button
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                  const docResponse = await documentsAPI.getAllDocuments();
                                                  if (docResponse.data.success) {
                                                    const allDocs = docResponse.data.documents || docResponse.data.data || [];
                                                    const doc = allDocs.find((d: any) => 
                                                      (d._id || d.id).toString() === (request.document._id || request.document).toString()
                                                    );
                                                    if (doc) {
                                                      const response = await documentsAPI.downloadDocument(doc._id || doc.id);
                                                      const blob = new Blob([response.data]);
                                                      const url = window.URL.createObjectURL(blob);
                                                      const link = document.createElement('a');
                                                      link.href = url;
                                                      link.download = doc.nom;
                                                      document.body.appendChild(link);
                                                      link.click();
                                                      document.body.removeChild(link);
                                                      window.URL.revokeObjectURL(url);
                                                    }
                                                  }
                                                } catch (err) {
                                                  console.error('Erreur lors du téléchargement:', err);
                                                  alert('Erreur lors du téléchargement du document');
                                                }
                                              }}
                                              className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded text-xs font-medium transition-colors"
                                            >
                                              ⬇️ Télécharger
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Actions */}
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          {/* Dernière notification défilante */}
                          {(() => {
                            const lastNotification = getLastNotificationForDossier(dossier._id || dossier.id);
                            if (lastNotification) {
                              return (
                                <div className="relative overflow-hidden bg-blue-50/50 rounded-md px-3 py-2 border border-blue-200/50 group">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs">🔔</span>
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                      <div className="animate-scroll-text whitespace-nowrap group-hover:animation-pause">
                                        <span className="text-xs text-blue-900 font-medium">
                                          {lastNotification.titre || lastNotification.message || 'Nouvelle notification'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            const dossierDocs = dossierDocuments[dossier._id || dossier.id] || [];
                            const hasDocuments = dossierDocs.length > 0;
                            const isDocDropdownExpanded = expandedDossierDocumentDropdowns.has(dossier._id || dossier.id);
                            
                            return (
                              <div className="relative">
                                <div className="flex gap-3 text-xs text-muted-foreground">
                                  {hasDocuments && isDocDropdownExpanded && (
                                    <>
                                    <div className="relative">
                                      {/* Dropdown des documents (affiché sans bouton redondant) */}
                                      <div 
                                          className="absolute left-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <div className="p-2">
                                            <div className="flex items-center justify-between mb-2 px-2 py-1 bg-gray-50 rounded">
                                              <span className="text-xs font-semibold text-gray-700">Documents du dossier</span>
                                              <span className="text-xs text-gray-500">{dossierDocs.length} total</span>
                                            </div>
                                            <div className="space-y-1">
                                              {dossierDocs.map((doc: any) => (
                                                <div
                                                  key={doc._id || doc.id}
                                                  className="p-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                                                >
                                                  <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className="flex-1 min-w-0">
                                                      <p className="text-xs font-medium text-gray-900 truncate">{doc.nom}</p>
                                                      {doc.description && (
                                                        <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{doc.description}</p>
                                                      )}
                                                      <p className="text-[10px] text-gray-400 mt-1">
                                                        {doc.typeMime} • {doc.taille ? `${(doc.taille / 1024).toFixed(1)} KB` : ''}
                                                      </p>
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center gap-1 pt-2 border-t border-gray-100">
                                                    <button
                                                      onClick={async (e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedDocumentForPreview(doc);
                                                        setShowDocumentPreviewModal(true);
                                                      }}
                                                      className="flex-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[10px] font-medium transition-colors"
                                                    >
                                                      👁️ Voir
                                                    </button>
                                                    <button
                                                      onClick={async (e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        try {
                                                          const response = await documentsAPI.downloadDocument(doc._id || doc.id);
                                                          const blob = new Blob([response.data]);
                                                          const url = window.URL.createObjectURL(blob);
                                                          const link = document.createElement('a');
                                                          link.href = url;
                                                          link.download = doc.nom;
                                                          document.body.appendChild(link);
                                                          link.click();
                                                          document.body.removeChild(link);
                                                          window.URL.revokeObjectURL(url);
                                                        } catch (err) {
                                                          console.error('Erreur lors du téléchargement:', err);
                                                          alert('Erreur lors du téléchargement du document');
                                                        }
                                                      }}
                                                      className="flex-1 px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded text-[10px] font-medium transition-colors"
                                                    >
                                                      ⬇️ Télécharger
                                                    </button>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                    </div>
                                    </>
                                  )}
                                  {dossier.messages && dossier.messages.length > 0 && (
                                    <span>💬 {dossier.messages.length}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                          {(() => {
                            const unreadCount = getUnreadNotificationsCountForDossier(dossier._id || dossier.id);
                            return (
                              <Link href={`/admin/notifications?dossierId=${dossier._id || dossier.id}&filter=unread`}>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className={`text-xs h-8 relative ${unreadCount > 0 ? 'bg-orange-50 border-orange-300 hover:bg-orange-100' : ''}`}
                                  title="Voir les notifications non lues"
                                >
                                  🔔 Notifications
                                  {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                      {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                  )}
                                </Button>
                              </Link>
                            );
                          })()}
                          <Link href={`/admin/messages?dossierId=${dossier._id || dossier.id}&action=view`}>
                            <Button variant="outline" size="sm" className="text-xs h-8" title="Voir les discussions">
                              💬 Discussions
                            </Button>
                          </Link>
                          <Link href={`/admin/messages?dossierId=${dossier._id || dossier.id}&action=send`}>
                            <Button size="sm" className="text-xs h-8" title="Envoyer un message">
                              ✉️ Message
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditDossier(dossier)}
                            className="text-xs h-8"
                          >
                            ✏️ Modifier
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setShowDeleteConfirm(dossier._id || dossier.id)}
                            className="text-xs h-8 px-3"
                          >
                            🗑️
                          </Button>
                        </div>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setShowDocumentRequestModal(dossier);
                          setDocumentRequestData({
                            selectedDocumentTypes: [],
                            message: '',
                            isUrgent: false
                          });
                        }}
                        className="w-full text-xs h-8 bg-blue-500 hover:bg-blue-600 text-white"
                      >
                        📄 Demander un document
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            📋 Statut du dossier
                          </label>
                          {/* Synthèse acceptation partenaire (toujours visible) */}
                          {Array.isArray(dossier.transmittedTo) && dossier.transmittedTo.length > 0 && (() => {
                            const transmissions = dossier.transmittedTo;
                            const hasAccepted = transmissions.some((t: any) => t.status === 'accepted');
                            const hasRefused = transmissions.some((t: any) => t.status === 'refused');
                            let label = 'En attente';
                            let badgeClass = 'bg-yellow-50 text-yellow-800 border-yellow-200';
                            if (hasAccepted) {
                              label = 'Accepté';
                              badgeClass = 'bg-green-50 text-green-800 border-green-200';
                            } else if (hasRefused && !hasAccepted) {
                              label = 'Refusé';
                              badgeClass = 'bg-red-50 text-red-800 border-red-200';
                            }
                            return (
                              <div className="mb-1.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClass}`}>
                                  <span>Statut partenaire :</span>
                                  <span>{label}</span>
                                </span>
                              </div>
                            );
                          })()}
                          <select
                            value={dossier.statut || ''}
                            onChange={(e) => handleChangeStatut(dossier._id || dossier.id, e.target.value)}
                            className="text-xs px-2 py-1.5 rounded-md border border-gray-300 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors w-full"
                            disabled={isLoading}
                            title="Étape actuelle du dossier, choisie parmi les étapes définies dans l'édition des étapes."
                          >
                            {Array.isArray(dossier.etapesSupplementaires) && dossier.etapesSupplementaires.length > 0 ? (
                              <>
                                {!dossier.statut && (
                                  <option value="">Sélectionner une étape</option>
                                )}
                                {dossier.etapesSupplementaires.map((etape: any, idx: number) => {
                                  const value = etape.id || etape.label || String(idx);
                                  return (
                                    <option
                                      key={value}
                                      value={value}
                                    >
                                      {etape.label || etape.id || `Étape ${idx + 1}`}
                                    </option>
                                  );
                                })}
                              </>
                            ) : (
                              <option value="">Aucune étape définie (ouvrir "Éditer les étapes")</option>
                            )}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            👨‍💼 Attribué à
                          </label>
                          <select
                            value={dossier.assignedTo?._id || dossier.assignedTo || ''}
                            onChange={(e) => handleAssignDossier(dossier._id || dossier.id, e.target.value)}
                            className="text-xs px-2 py-1.5 rounded-md border border-gray-300 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors w-full"
                            disabled={isLoading}
                            title="Assignation rapide d'un membre pour le suivi. Pour une équipe complète, utilisez la gestion d'équipe dans les détails."
                          >
                            <option value="">Non assigné</option>
                            {teamMembers.map((member) => (
                              <option key={member._id || member.id} value={member._id || member.id}>
                                {member.firstName} {member.lastName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    </>
                    )}
                  </div>
                ))}
                  </div>
                );
              })()}
            </>
          )}

          {!isLoading && dossiers.length > 0 && (
            <div className="mt-6 pt-4 border-t flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{dossiers.length}</span> dossier{dossiers.length > 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Modal de confirmation de suppression */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirmer la suppression</h3>
            <p className="text-muted-foreground mb-6">
              Êtes-vous sûr de vouloir supprimer ce dossier ? Cette action est irréversible et une notification sera envoyée au client.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} disabled={isLoading}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={() => handleDeleteDossier(showDeleteConfirm)} disabled={isLoading}>
                {isLoading ? 'Suppression...' : 'Supprimer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de refus de dossier */}
      {showRefuseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Refuser le dossier</h3>
            <p className="text-muted-foreground mb-4">
              Vous êtes sur le point de refuser le dossier : <strong>{showRefuseModal.dossierTitre}</strong>
            </p>
            <div className="mb-4">
              <Label htmlFor="motifRefus" className="mb-2 block">
                Motif du refus (optionnel)
              </Label>
              <Textarea
                id="motifRefus"
                value={motifRefus}
                onChange={(e) => setMotifRefus(e.target.value)}
                placeholder="Expliquez la raison du refus..."
                rows={4}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Une notification sera envoyée au client avec ce motif (ou un message par défaut si vide).
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => {
                setShowRefuseModal(null);
                setMotifRefus('');
              }} disabled={isLoading}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={handleRefuseDossier} disabled={isLoading}>
                {isLoading ? 'Refus en cours...' : 'Refuser le dossier'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de changement de statut avec message */}
      {showStatutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Changer le statut du dossier</h3>
            <p className="text-muted-foreground mb-4">
              Dossier : <strong>{showStatutModal.dossierTitre}</strong>
            </p>
            <div className="mb-4">
              <p className="text-sm mb-2">
                <span className="font-medium">Statut actuel :</span> {getStatutLabel(showStatutModal.currentStatut)}
              </p>
              <p className="text-sm mb-4">
                <span className="font-medium">Nouveau statut :</span> <span className="text-primary font-semibold">{getStatutLabel(showStatutModal.newStatut)}</span>
              </p>
            </div>
            <div className="mb-4">
              <Label htmlFor="notificationMessage" className="mb-2 block">
                Message de notification (optionnel)
              </Label>
              <Textarea
                id="notificationMessage"
                value={notificationMessage}
                onChange={(e) => setNotificationMessage(e.target.value)}
                placeholder={`Ex: Votre dossier "${showStatutModal.dossierTitre}" a été mis à jour. Le statut est maintenant "${getStatutLabel(showStatutModal.newStatut)}".`}
                rows={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Message optionnel qui sera envoyé à l'utilisateur et à tous les administrateurs dans leurs notifications. Si vide, un message par défaut sera utilisé.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => {
                setShowStatutModal(null);
                setNotificationMessage('');
              }} disabled={isLoading}>
                Annuler
              </Button>
              <Button onClick={confirmChangeStatut} disabled={isLoading}>
                {isLoading ? 'Mise à jour...' : 'Confirmer le changement'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de demande de document */}
      {showDocumentRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Demander un document</h3>
            <p className="text-muted-foreground mb-4">
              Dossier : <strong>{showDocumentRequestModal.titre}</strong> {showDocumentRequestModal.numero && `(${showDocumentRequestModal.numero})`}
            </p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (documentRequestData.selectedDocumentTypes.length === 0) {
                setError('Veuillez sélectionner au moins un type de document');
                return;
              }
              setIsLoading(true);
              setError(null);
              try {
                // Créer une demande pour chaque type de document sélectionné
                const requests = documentRequestData.selectedDocumentTypes.map(async (docType) => {
                  const docInfo = documentTypesList.find(d => d.value === docType);
                  const documentTypeLabel = docInfo?.label || docType;
                  
                  // Utiliser le type de base pour l'enum backend (mapping)
                  const baseTypeMap: Record<string, string> = {
                    passeport: 'passeport',
                    carte_identite: 'identite',
                    acte_naissance: 'identite',
                    acte_mariage: 'identite',
                    acte_divorce: 'identite',
                    livret_familial: 'identite',
                    titre_sejour_valide: 'titre_sejour',
                    titre_sejour_expire: 'titre_sejour',
                    recepisse_demande_titre: 'titre_sejour',
                    carte_sejour_temporaire: 'titre_sejour',
                    carte_resident: 'titre_sejour',
                    carte_resident_permanent: 'titre_sejour',
                    visa_court_sejour: 'autre',
                    visa_long_sejour: 'autre',
                    visa_etudiant: 'autre',
                    visa_travailleur: 'autre',
                    visa_familial: 'autre',
                    visa_transit: 'autre',
                    contrat_travail: 'contrat',
                    attestation_emploi: 'contrat',
                    fiche_paie: 'autre',
                    avis_imposition: 'avis_imposition',
                    declaration_revenus: 'avis_imposition',
                    justificatif_ca: 'autre',
                    justificatif_domicile: 'justificatif_domicile',
                    quittance_loyer: 'justificatif_domicile',
                    facture_electricite: 'facture',
                    facture_gaz: 'facture',
                    facture_eau: 'facture',
                    attestation_hebergement: 'justificatif_domicile',
                    releve_bancaire: 'autre',
                    attestation_bancaire: 'autre',
                    justificatif_ressources: 'autre',
                    pension_retraite: 'autre',
                    allocation_chomage: 'autre',
                    allocation_familiale: 'autre',
                    certificat_medical: 'autre',
                    attestation_cmu: 'autre',
                    carte_vitale: 'autre',
                    diplome: 'autre',
                    attestation_scolarite: 'autre',
                    releve_notes: 'autre',
                    inscription_universite: 'autre',
                    acte_mariage_fr: 'identite',
                    acte_naissance_enfant: 'identite',
                    livret_familial_fr: 'identite',
                    justificatif_ressources_famille: 'autre',
                    casier_judiciaire: 'autre',
                    traduction_assermentee: 'autre',
                    legalisation: 'autre',
                    autre: 'autre'
                  };
                  
                  const baseType = baseTypeMap[docType] || 'autre';
                  
                  console.log('📄 Création de demande de document:', {
                    dossierId: showDocumentRequestModal._id || showDocumentRequestModal.id,
                    documentType: baseType,
                    documentTypeLabel: documentTypeLabel,
                    message: documentRequestData.message,
                    isUrgent: documentRequestData.isUrgent
                  });
                  
                  return await documentRequestsAPI.createRequest({
                    dossierId: showDocumentRequestModal._id || showDocumentRequestModal.id,
                    documentType: baseType,
                    documentTypeLabel: documentTypeLabel,
                    message: documentRequestData.message,
                    isUrgent: documentRequestData.isUrgent
                  });
                });
                
                const responses = await Promise.all(requests);
                const allSuccess = responses.every(r => r.data.success);
                
                console.log('✅ Réponses de l\'API:', responses);
                
                if (allSuccess) {
                  // Afficher un message de succès temporaire
                  setError(null);
                  const count = documentRequestData.selectedDocumentTypes.length;
                  alert(`✅ ${count} demande(s) de document(s) créée(s) avec succès ! Le client a été notifié.`);
                  
                  setShowDocumentRequestModal(null);
                  setDocumentRequestData({
                    selectedDocumentTypes: [],
                    message: '',
                    isUrgent: false
                  });
                  // Recharger les dossiers pour afficher les nouvelles demandes
                  await loadDossiers();
                } else {
                  const failedCount = responses.filter(r => !r.data.success).length;
                  setError(`${failedCount} demande(s) n'a(ont) pas pu être créée(s). Veuillez réessayer.`);
                }
              } catch (err: any) {
                console.error('❌ Erreur lors de la création de la demande:', err);
                console.error('❌ Détails de l\'erreur:', {
                  message: err.message,
                  response: err.response?.data,
                  status: err.response?.status
                });
                
                const errorMessage = err.response?.data?.message 
                  || err.response?.data?.error 
                  || err.message 
                  || 'Erreur lors de la création de la demande. Veuillez réessayer.';
                
                setError(errorMessage);
                
                // Afficher aussi dans la console pour le débogage
                alert(`❌ Erreur: ${errorMessage}`);
              } finally {
                setIsLoading(false);
              }
            }}>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">
                    Types de documents à demander *
                  </Label>
                  <div className="border border-input rounded-md p-3 max-h-96 overflow-y-auto bg-background">
                    {Object.entries(documentTypesByCategory).map(([category, docs]) => (
                      <div key={category} className="mb-4 last:mb-0">
                        <div className="font-semibold text-sm mb-2 text-primary">
                          {categoryLabels[category] || category}
                        </div>
                        <div className="space-y-2 pl-2">
                          {docs.map((doc) => (
                            <label
                              key={doc.value}
                              className="flex items-center space-x-2 cursor-pointer hover:bg-accent/50 p-1 rounded"
                            >
                              <input
                                type="checkbox"
                                checked={documentRequestData.selectedDocumentTypes.includes(doc.value)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setDocumentRequestData({
                                      ...documentRequestData,
                                      selectedDocumentTypes: [...documentRequestData.selectedDocumentTypes, doc.value]
                                    });
                                  } else {
                                    setDocumentRequestData({
                                      ...documentRequestData,
                                      selectedDocumentTypes: documentRequestData.selectedDocumentTypes.filter(t => t !== doc.value)
                                    });
                                  }
                                }}
                                className="rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span className="text-sm">{doc.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {documentRequestData.selectedDocumentTypes.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {documentRequestData.selectedDocumentTypes.length} document(s) sélectionné(s)
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="message" className="mb-2 block">
                    Message ou précisions (optionnel)
                  </Label>
                  <Textarea
                    id="message"
                    value={documentRequestData.message}
                    onChange={(e) => setDocumentRequestData({ ...documentRequestData, message: e.target.value })}
                    placeholder="Ajoutez des précisions sur le document demandé..."
                    rows={4}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isUrgent"
                    checked={documentRequestData.isUrgent}
                    onChange={(e) => setDocumentRequestData({ ...documentRequestData, isUrgent: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="isUrgent" className="cursor-pointer">
                    🔴 Marquer comme urgent
                  </Label>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600 font-semibold">❌ Erreur</p>
                    <p className="text-sm text-red-600 mt-1">{error}</p>
                    {error.includes('utilisateur connecté') && (
                      <p className="text-xs text-red-500 mt-2">
                        💡 Astuce: Assurez-vous que le dossier a un utilisateur associé ou créez un compte pour le client.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowDocumentRequestModal(null);
                      setDocumentRequestData({
                        selectedDocumentTypes: [],
                        message: '',
                        isUrgent: false
                      });
                      setError(null);
                    }}
                    disabled={isLoading}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Envoi...' : 'Envoyer la demande'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ajouter une étape du dossier */}
      {addEtapeDossier && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => { setAddEtapeDossier(null); setNewEtapeLabel(''); setNewEtapeDate(''); setError(null); }}
        >
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Ajouter une étape (non prévue)</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Dossier : <strong>{addEtapeDossier.titre || addEtapeDossier.numero || addEtapeDossier._id}</strong>
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const label = newEtapeLabel.trim();
                if (!label) return;
                const dossierId = addEtapeDossier._id || addEtapeDossier.id;
                if (!dossierId) {
                  setError('Identifiant du dossier manquant');
                  return;
                }
                setIsAddingEtape(true);
                setError(null);
                try {
                  const current = addEtapeDossier.etapesSupplementaires || [];
                  const next = [...current, { label, date: newEtapeDate || undefined, ordre: current.length }];
                  const response = await dossiersAPI.updateDossier(dossierId, { etapesSupplementaires: next });
                  if (response.data.success) {
                    setDossiers(prev => prev.map(d => (d._id || d.id) === dossierId ? { ...d, etapesSupplementaires: next } : d));
                    setAddEtapeDossier(null);
                    setNewEtapeLabel('');
                    setNewEtapeDate('');
                  } else {
                    setError(response.data.message || 'Erreur lors de l\'ajout');
                  }
                } catch (err: any) {
                  setError(err.response?.data?.message || 'Erreur lors de l\'ajout de l\'étape');
                } finally {
                  setIsAddingEtape(false);
                }
              }}
            >
              <div className="space-y-3 mb-4">
                <div>
                  <Label htmlFor="newEtapeLabel">Libellé de l&apos;étape *</Label>
                  <Input
                    id="newEtapeLabel"
                    value={newEtapeLabel}
                    onChange={(e) => setNewEtapeLabel(e.target.value)}
                    placeholder="Ex: Convocation préfecture reçue"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="newEtapeDate">Date (optionnel)</Label>
                  <Input
                    id="newEtapeDate"
                    type="date"
                    value={newEtapeDate}
                    onChange={(e) => setNewEtapeDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              {error && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
              )}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => { setAddEtapeDossier(null); setNewEtapeLabel(''); setNewEtapeDate(''); setError(null); }} disabled={isAddingEtape}>
                  Annuler
                </Button>
                <Button type="submit" disabled={isAddingEtape || !newEtapeLabel.trim()}>
                  {isAddingEtape ? 'Ajout...' : 'Ajouter l\'étape'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Modal de prévisualisation de document */}
      {selectedDocumentForPreview && (
        <DocumentPreview
          document={selectedDocumentForPreview}
          isOpen={showDocumentPreviewModal}
          onClose={() => {
            setShowDocumentPreviewModal(false);
            setSelectedDocumentForPreview(null);
          }}
        />
      )}
    </div>
  );
}

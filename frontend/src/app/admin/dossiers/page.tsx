'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { dossiersAPI, userAPI, documentRequestsAPI, notificationsAPI, messagesAPI, documentsAPI, tasksAPI } from '@/lib/api';
import { getStatutColor, getStatutLabel, getPrioriteColor, getDossierProgress, calculateDaysSince, calculateDaysUntil, isDeadlineApproaching, formatRelativeTime, getNextAction, getTimelineSteps } from '@/lib/dossierUtils';
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'favorable' | 'unfavorable'>('all');
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
    }
  }, [session, status]);

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
      if (!formData.categorie) {
        setError('Veuillez sélectionner une catégorie de dossier');
        setIsLoading(false);
        return;
      }

      if (!formData.type) {
        setError('Veuillez sélectionner un type de dossier');
        setIsLoading(false);
        return;
      }

      const dossierData: any = {
        titre: formData.titre,
        description: formData.description,
        categorie: formData.categorie,
        type: formData.type,
        statut: formData.statut,
        priorite: formData.priorite,
        notes: formData.notes,
      };

      if (clientType === 'existing') {
        if (!formData.userId) {
          setError('Veuillez sélectionner un utilisateur');
          setIsLoading(false);
          return;
        }
        dossierData.userId = formData.userId;
      } else {
        if (!formData.clientNom || !formData.clientPrenom || !formData.clientEmail) {
          setError('Veuillez remplir tous les champs obligatoires du client');
          setIsLoading(false);
          return;
        }
        dossierData.clientNom = formData.clientNom;
        dossierData.clientPrenom = formData.clientPrenom;
        dossierData.clientEmail = formData.clientEmail;
        dossierData.clientTelephone = formData.clientTelephone;
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
                  <Label htmlFor="userId">Sélectionner un utilisateur *</Label>
                  <select
                    id="userId"
                    value={formData.userId}
                    onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                    required
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
                    <Label htmlFor="clientNom">Nom *</Label>
                    <Input
                      id="clientNom"
                      value={formData.clientNom}
                      onChange={(e) => setFormData({ ...formData, clientNom: e.target.value })}
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientPrenom">Prénom *</Label>
                    <Input
                      id="clientPrenom"
                      value={formData.clientPrenom}
                      onChange={(e) => setFormData({ ...formData, clientPrenom: e.target.value })}
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientEmail">Email *</Label>
                    <Input
                      id="clientEmail"
                      type="email"
                      value={formData.clientEmail}
                      onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                      required
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
                    <Label htmlFor="titre">Titre du dossier {!editingDossier && '*'}</Label>
                    <Input
                      id="titre"
                      value={formData.titre}
                      onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                      required={!editingDossier}
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
                      <Label htmlFor="categorie">Catégorie de dossier {!editingDossier && '*'}</Label>
                      <select
                        id="categorie"
                        value={formData.categorie}
                        onChange={(e) => setFormData({ ...formData, categorie: e.target.value, type: '' })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                        required={!editingDossier}
                      >
                        <option value="">-- Sélectionner une catégorie --</option>
                        {Object.entries(categories).map(([key, cat]) => (
                          <option key={key} value={key}>{cat.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="type">Type de dossier {!editingDossier && '*'}</Label>
                      <select
                        id="type"
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                        required={!editingDossier}
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
                      <Label htmlFor="statut">
                        Statut du dossier <span className="text-primary">*</span>
                      </Label>
                      <select
                        id="statut"
                        value={formData.statut}
                        onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                      >
                        <option value="recu">Reçu</option>
                        <option value="accepte">Accepté</option>
                        <option value="refuse">Refusé</option>
                        <option value="en_attente_onboarding">En attente d'onboarding (RDV)</option>
                        <option value="en_cours_instruction">En cours d'instruction (constitution dossier)</option>
                        <option value="pieces_manquantes">Pièces manquantes (relance client)</option>
                        <option value="dossier_complet">Dossier Complet</option>
                        <option value="depose">Déposé</option>
                        <option value="reception_confirmee">Réception confirmée</option>
                        <option value="complement_demande">Complément demandé (avec date limite)</option>
                        <option value="decision_defavorable">Décision défavorable</option>
                        <option value="communication_motifs">Communication des Motifs</option>
                        <option value="recours_preparation">Recours en préparation</option>
                        <option value="refere_mesures_utiles">Référé Mesures Utiles</option>
                        <option value="refere_suspension_rep">Référé suspension et REP</option>
                        <option value="gain_cause">Gain de cause</option>
                        <option value="rejet">Rejet</option>
                        <option value="decision_favorable">Décision favorable</option>
                        <option value="autre">Autre (statut non prévu)</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        📋 <strong>Fonction :</strong> Indique l'état d'avancement du dossier dans le processus administratif. 
                        Seul le <strong>chef d'équipe</strong> ou un <strong>super administrateur</strong> peut modifier ce statut.
                      </p>
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
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`text-left bg-gradient-to-br from-yellow-50 to-yellow-100 border-l-4 border-yellow-500 rounded-lg p-4 shadow-sm transition-all ${
                    statusFilter === 'pending'
                      ? 'ring-2 ring-yellow-500/60 shadow-md'
                      : 'hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <p className="text-xs text-yellow-700 font-semibold mb-1 uppercase tracking-wide">En attente</p>
                  <p className="text-2xl font-bold text-yellow-900">
                    {dossiers.filter((d: any) => d.statut === 'recu' || d.statut === 'en_attente_onboarding').length}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('in_progress')}
                  className={`text-left bg-gradient-to-br from-blue-50 to-blue-100 border-l-4 border-blue-500 rounded-lg p-4 shadow-sm transition-all ${
                    statusFilter === 'in_progress'
                      ? 'ring-2 ring-blue-500/60 shadow-md'
                      : 'hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <p className="text-xs text-blue-700 font-semibold mb-1 uppercase tracking-wide">En cours</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {dossiers.filter((d: any) => d.statut === 'en_cours_instruction' || d.statut === 'dossier_complet').length}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('favorable')}
                  className={`text-left bg-gradient-to-br from-green-50 to-green-100 border-l-4 border-green-500 rounded-lg p-4 shadow-sm transition-all ${
                    statusFilter === 'favorable'
                      ? 'ring-2 ring-green-500/60 shadow-md'
                      : 'hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <p className="text-xs text-green-700 font-semibold mb-1 uppercase tracking-wide">Favorables</p>
                  <p className="text-2xl font-bold text-green-900">
                    {dossiers.filter((d: any) => d.statut === 'decision_favorable' || d.statut === 'gain_cause').length}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('unfavorable')}
                  className={`text-left bg-gradient-to-br from-red-50 to-red-100 border-l-4 border-red-500 rounded-lg p-4 shadow-sm transition-all ${
                    statusFilter === 'unfavorable'
                      ? 'ring-2 ring-red-500/60 shadow-md'
                      : 'hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <p className="text-xs text-red-700 font-semibold mb-1 uppercase tracking-wide">Défavorables</p>
                  <p className="text-2xl font-bold text-red-900">
                    {dossiers.filter((d: any) => d.statut === 'decision_defavorable' || d.statut === 'refuse' || d.statut === 'rejet').length}
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
                            {statusFilter === 'favorable' && 'Favorables'}
                            {statusFilter === 'unfavorable' && 'Défavorables'}
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
                  // Filtre par statut
                  if (statusFilter === 'pending') {
                    if (!(d.statut === 'recu' || d.statut === 'en_attente_onboarding')) return false;
                  } else if (statusFilter === 'in_progress') {
                    if (!(d.statut === 'en_cours_instruction' || d.statut === 'dossier_complet')) return false;
                  } else if (statusFilter === 'favorable') {
                    if (!(d.statut === 'decision_favorable' || d.statut === 'gain_cause')) return false;
                  } else if (statusFilter === 'unfavorable') {
                    if (!(d.statut === 'decision_defavorable' || d.statut === 'refuse' || d.statut === 'rejet')) return false;
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
                    className={`border rounded-xl p-5 hover:shadow-xl transition-all duration-200 bg-white w-full ${
                      dossier.statut === 'recu' || dossier.statut === 'en_attente_onboarding'
                        ? 'border-l-4 border-l-yellow-500 border-t border-r border-b border-gray-200'
                        : dossier.statut === 'decision_favorable' || dossier.statut === 'gain_cause'
                        ? 'border-l-4 border-l-green-500 border-t border-r border-b border-gray-200'
                        : dossier.statut === 'decision_defavorable' || dossier.statut === 'refuse' || dossier.statut === 'rejet'
                        ? 'border-l-4 border-l-red-500 border-t border-r border-b border-gray-200'
                        : 'border-l-4 border-l-blue-500 border-t border-r border-b border-gray-200'
                    }`}
                  >
                    <div>
                    {/* En-tête de la carte avec bouton de pliage/dépliage */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2 mb-1">
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
                            className="p-1 rounded-md hover:bg-gray-100 transition-colors text-gray-600 hover:text-primary flex-shrink-0"
                            title={expandedDossiers.has(dossier._id || dossier.id) ? 'Plier le dossier' : 'Déplier le dossier'}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={expandedDossiers.has(dossier._id || dossier.id) ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                            </svg>
                          </button>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-base text-foreground line-clamp-2 leading-tight">
                              {dossier.titre}
                            </h3>
                            {(dossier.numero || dossier.numeroDossier) && (
                              <p className="text-xs text-primary font-semibold mt-0.5">
                                N° {dossier.numero || dossier.numeroDossier}
                              </p>
                            )}
                            {/* Indication de transmission (visible quand plié) */}
                            {!expandedDossiers.has(dossier._id || dossier.id) && dossier.transmittedTo && dossier.transmittedTo.length > 0 && (
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-300">
                                  📤 Transmis
                                </span>
                                {dossier.transmittedTo.map((trans: any, idx: number) => {
                                  const partenaire = trans.partenaire;
                                  const partenaireName = partenaire 
                                    ? `${partenaire.firstName || ''} ${partenaire.lastName || ''}`.trim() || partenaire.email
                                    : 'Partenaire inconnu';
                                  const organismeName = partenaire?.partenaireInfo?.nomOrganisme;
                                  const status = trans.status || 'pending';
                                  const statusLabel = status === 'accepted' ? 'Accepté' : status === 'refused' ? 'Refusé' : 'En attente';
                                  return (
                                    <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                                      {partenaireName}
                                      {organismeName && typeof organismeName === 'string' && ` (${organismeName})`}
                                      <span className="ml-1 text-[9px]">• {statusLabel}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            {/* Compteurs et informations sur dossier plié */}
                            {!expandedDossiers.has(dossier._id || dossier.id) && (
                              <div className="mt-1.5 space-y-1">
                                {(() => {
                                  const dossierRequests = documentRequests[dossier._id || dossier.id] || [];
                                  const pendingRequests = dossierRequests.filter((r: any) => r.status === 'pending');
                                  const receivedRequests = dossierRequests.filter((r: any) => r.status === 'received' || r.status === 'sent');
                                  const totalDocuments = dossierDocuments[dossier._id || dossier.id]?.length || dossier.documents?.length || 0;
                                  const progress = getDossierProgress(dossier.statut);
                                  const unreadCount = getUnreadNotificationsCountForDossier(dossier._id || dossier.id);
                                  
                                  // Calculer les tâches
                                  const dossierId = dossier._id || dossier.id;
                                  const tasks = dossierTasks[dossierId] || [];
                                  const pendingTasks = tasks.filter((task: any) => {
                                    return task.statut !== 'termine' && task.statut !== 'annule' && !task.effectue;
                                  });
                                  const completedTasks = tasks.filter((task: any) => {
                                    return task.statut === 'termine' || task.effectue === true;
                                  });
                                  
                                  return (
                                    <>
                                      {/* Ligne 1: Documents */}
                                      <div className="flex items-center gap-2.5 flex-wrap text-[10px] text-muted-foreground">
                                        <span className="flex items-center gap-0.5">
                                          <span className="text-xs">📄</span>
                                          <span className="font-semibold text-foreground">{totalDocuments}</span>
                                        </span>
                                        {dossierRequests.length > 0 && (
                                          <>
                                            <span className="flex items-center gap-0.5">
                                              <span className="text-xs">📋</span>
                                              <span className="font-semibold text-orange-600">{pendingRequests.length}</span>
                                            </span>
                                            <span className="flex items-center gap-0.5">
                                              <span className="text-xs">✅</span>
                                              <span className="font-semibold text-green-600">{receivedRequests.length}</span>
                                            </span>
                                          </>
                                        )}
                                        {tasks.length > 0 && (
                                          <>
                                            <span className="flex items-center gap-0.5">
                                              <span className="text-xs">⏳</span>
                                              <span className="font-semibold text-orange-600">{pendingTasks.length}</span>
                                            </span>
                                            {completedTasks.length > 0 && (
                                              <span className="flex items-center gap-0.5">
                                                <span className="text-xs">✅</span>
                                                <span className="font-semibold text-green-600">{completedTasks.length}</span>
                                              </span>
                                            )}
                                          </>
                                        )}
                                        {dossier.messages?.length > 0 && (
                                          <span className="flex items-center gap-0.5">
                                            <span className="text-xs">💬</span>
                                            <span className="font-semibold">{dossier.messages.length}</span>
                                          </span>
                                        )}
                                        {unreadCount > 0 && (
                                          <span className="flex items-center gap-0.5">
                                            <span className="text-xs">🔔</span>
                                            <span className="font-semibold text-red-600">{unreadCount}</span>
                                          </span>
                                        )}
                                      </div>
                                      
                                      {/* Ligne 2: Progression, Échéance, Assigné */}
                                      <div className="flex items-center gap-2.5 flex-wrap text-[10px] text-muted-foreground">
                                        <span className="flex items-center gap-0.5">
                                          <span className="text-xs">📊</span>
                                          <span className="font-semibold">{progress}%</span>
                                        </span>
                                        {dossier.dateEcheance && isDeadlineApproaching(dossier.dateEcheance) && (
                                          <span className="flex items-center gap-0.5 text-red-600">
                                            <span className="text-xs">⏰</span>
                                            <span className="font-semibold">{calculateDaysUntil(dossier.dateEcheance)}j</span>
                                          </span>
                                        )}
                                        {dossier.assignedTo && typeof dossier.assignedTo === 'object' && dossier.assignedTo.firstName && (
                                          <span className="flex items-center gap-0.5">
                                            <span className="text-xs">👤</span>
                                            <span className="truncate max-w-[80px]">{dossier.assignedTo.firstName}</span>
                                          </span>
                                        )}
                                      </div>
                                      
                                      {/* Ligne 3: Date (sur une ligne avec caractères plus grands) */}
                                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                        {dossier.createdAt && (
                                          <span className="flex items-center gap-1">
                                            <span>📅</span>
                                            <span>Créé: {new Date(dossier.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                          </span>
                                        )}
                                        {dossier.updatedAt && (
                                          <span className="flex items-center gap-1">
                                            <span>🔄</span>
                                            <span>Modifié: {new Date(dossier.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                          </span>
                                        )}
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                        {expandedDossiers.has(dossier._id || dossier.id) && dossier.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1 ml-7">
                            {dossier.description}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/dossiers/${dossier._id || dossier.id}`}
                            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-600 hover:text-primary"
                            title="Voir les détails du dossier"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </Link>
                        </div>
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getStatutColor(dossier.statut)}`}>
                          {getStatutLabel(dossier.statut)}
                        </span>
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getPrioriteColor(dossier.priorite)}`}>
                          {dossier.priorite}
                        </span>
                      </div>
                    </div>

                    {/* Contenu détaillé (affiché uniquement si le dossier est déplié) */}
                    {expandedDossiers.has(dossier._id || dossier.id) && (
                      <>
                    {/* Informations du client */}
                    <div className="mb-3 pb-3 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-sm">👤</span>
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
                              <span className="text-xs text-orange-600 font-medium">(Non inscrit)</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Barre de progression */}
                    {(() => {
                      const progress = getDossierProgress(dossier.statut);
                      return (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Progression</span>
                            <span className="font-semibold text-foreground">{progress}%</span>
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
                            ></div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Alerte d'échéance */}
                    {isDeadlineApproaching(dossier.dateEcheance) && (
                      <div className="bg-red-50 border-l-4 border-red-500 p-2 mb-3 rounded-r">
                        <div className="flex items-center gap-2">
                          <span className="text-red-600">⚠️</span>
                          <p className="text-xs font-semibold text-red-900">
                            Échéance dans {calculateDaysUntil(dossier.dateEcheance)} jour{calculateDaysUntil(dossier.dateEcheance) > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Prochaine action */}
                    {(() => {
                      const nextAction = getNextAction(dossier.statut);
                      if (nextAction) {
                        return (
                          <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-blue-600">📋</span>
                              <div>
                                <p className="text-xs font-semibold text-blue-900">Prochaine action</p>
                                <p className="text-xs text-blue-700">{nextAction}</p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Timeline complète avec toutes les étapes */}
                    {(() => {
                      const steps = getTimelineSteps(dossier.statut);
                      return (
                        <div className="mb-3 pb-2 border-b border-gray-100">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Étapes du dossier :</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {steps.map((step) => (
                              <div key={step.key} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded ${
                                step.isCurrent ? 'bg-blue-50 border border-blue-200' : ''
                              }`}>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  step.completed && !step.isCurrent ? 'bg-green-500' : 
                                  step.isCurrent ? 'bg-blue-500 ring-2 ring-blue-300' : 
                                  'bg-gray-300'
                                }`}></span>
                                <span className={`text-[10px] leading-tight ${
                                  step.completed && !step.isCurrent ? 'text-green-700 font-medium' : 
                                  step.isCurrent ? 'text-blue-700 font-bold' : 
                                  'text-gray-400'
                                }`}>
                                  {step.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Informations du dossier */}
                    <div className="space-y-2 mb-3">
                      {(dossier.numero || dossier.numeroDossier) && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-primary font-semibold">🔢</span>
                          <span className="text-primary font-semibold">
                            N° {dossier.numero || dossier.numeroDossier}
                          </span>
                        </div>
                      )}
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground mt-0.5">📋</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-xs">{getCategorieLabel(dossier.categorie || 'autre')}</p>
                          {dossier.type && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {getTypeLabel(dossier.categorie || 'autre', dossier.type)}
                            </p>
                          )}
                        </div>
                      </div>

                      {dossier.assignedTo ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">👨‍💼</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground text-xs truncate">
                              {dossier.assignedTo.firstName} {dossier.assignedTo.lastName}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                              dossier.assignedTo.role === 'superadmin'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {dossier.assignedTo.role === 'superadmin' ? 'Superadmin' : 'Admin'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>👨‍💼</span>
                          <span className="italic">Non assigné</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>📅</span>
                        <span>
                          Créé le {dossier.createdAt ? new Date(dossier.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          }) : '-'}
                        </span>
                      </div>

                      {/* Temps écoulé */}
                      {dossier.createdAt && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>⏱️</span>
                          <span>Ouvert il y a {calculateDaysSince(dossier.createdAt)} jour{calculateDaysSince(dossier.createdAt) > 1 ? 's' : ''}</span>
                        </div>
                      )}

                      {/* Dernière activité */}
                      {dossier.updatedAt && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>🔄</span>
                          <span>Dernière activité: {formatRelativeTime(dossier.updatedAt)}</span>
                        </div>
                      )}

                      {dossier.dateEcheance && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-orange-600">⏰</span>
                          <span className="text-orange-600 font-medium">
                            Échéance: {new Date(dossier.dateEcheance).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Statistiques rapides */}
                    <div className="grid grid-cols-4 gap-2 mb-3 pb-2 border-b border-gray-100">
                      <div className="bg-gray-50 p-2 rounded text-center">
                        <p className="text-xs text-muted-foreground">Documents</p>
                        <p className="text-sm font-semibold text-foreground">
                          {dossierDocuments[dossier._id || dossier.id]?.length || dossier.documents?.length || 0}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded text-center">
                        <p className="text-xs text-muted-foreground">Messages</p>
                        <p className="text-sm font-semibold text-foreground">
                          {dossier.messages?.length || 0}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded text-center">
                        <p className="text-xs text-muted-foreground">Demandes</p>
                        <p className="text-sm font-semibold text-foreground">
                          {documentRequests[dossier._id || dossier.id]?.length || 0}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded text-center">
                        <p className="text-xs text-muted-foreground">Tâches</p>
                        {(() => {
                          const dossierId = dossier._id || dossier.id;
                          const tasks = dossierTasks[dossierId] || [];
                          const pendingTasks = tasks.filter((task: any) => {
                            return task.statut !== 'termine' && task.statut !== 'annule' && !task.effectue;
                          });
                          const completedTasks = tasks.filter((task: any) => {
                            return task.statut === 'termine' || task.effectue === true;
                          });
                          return (
                            <div className="flex items-center justify-center gap-1.5">
                              {pendingTasks.length > 0 && (
                                <span className="text-sm font-semibold text-orange-600">
                                  ⏳ {pendingTasks.length}
                                </span>
                              )}
                              {completedTasks.length > 0 && (
                                <span className="text-sm font-semibold text-green-600">
                                  ✅ {completedTasks.length}
                                </span>
                              )}
                              {tasks.length === 0 && (
                                <span className="text-sm font-semibold text-foreground">0</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

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
                                  {hasDocuments && (
                                    <div className="relative">
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const newExpanded = new Set(expandedDossierDocumentDropdowns);
                                          if (isDocDropdownExpanded) {
                                            newExpanded.delete(dossier._id || dossier.id);
                                          } else {
                                            newExpanded.add(dossier._id || dossier.id);
                                          }
                                          setExpandedDossierDocumentDropdowns(newExpanded);
                                        }}
                                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                                        title="Voir les documents"
                                      >
                                        <span>📄 {dossierDocs.length}</span>
                                        <span className="text-[10px]">{isDocDropdownExpanded ? '▲' : '▼'}</span>
                                      </button>
                                      
                                      {/* Dropdown des documents */}
                                      {isDocDropdownExpanded && (
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
                                      )}
                                    </div>
                                  )}
                                  {dossier.messages && dossier.messages.length > 0 && (
                                    <span>💬 {dossier.messages.length}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
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
                          <select
                            value={dossier.statut}
                            onChange={(e) => handleChangeStatut(dossier._id || dossier.id, e.target.value)}
                            className="text-xs px-2 py-1.5 rounded-md border border-gray-300 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors w-full"
                            disabled={isLoading}
                            title="État d'avancement du dossier dans le processus. Modifiable par le chef d'équipe ou superadmin uniquement."
                          >
                            <option value="recu">Reçu</option>
                            <option value="accepte">Accepté</option>
                            <option value="refuse">Refusé</option>
                            <option value="en_attente_onboarding">En attente d'onboarding</option>
                            <option value="en_cours_instruction">En cours d'instruction</option>
                            <option value="pieces_manquantes">Pièces manquantes</option>
                            <option value="dossier_complet">Dossier Complet</option>
                            <option value="depose">Déposé</option>
                            <option value="reception_confirmee">Réception confirmée</option>
                            <option value="complement_demande">Complément demandé</option>
                            <option value="decision_defavorable">Décision défavorable</option>
                            <option value="communication_motifs">Communication des Motifs</option>
                            <option value="recours_preparation">Recours en préparation</option>
                            <option value="refere_mesures_utiles">Référé Mesures Utiles</option>
                            <option value="refere_suspension_rep">Référé suspension et REP</option>
                            <option value="gain_cause">Gain de cause</option>
                            <option value="rejet">Rejet</option>
                            <option value="decision_favorable">Décision favorable</option>
                            <option value="autre">Autre (statut non prévu)</option>
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
                        documentType: '',
                        documentTypeLabel: '',
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

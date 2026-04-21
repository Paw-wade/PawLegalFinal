'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  dossiersAPI,
  userAPI,
  documentRequestsAPI,
  notificationsAPI,
  messagesAPI,
  documentsAPI,
  tasksAPI,
  collaborativeDraftsAPI,
  dossierDocumentDraftsAPI,
} from '@/lib/api';
import { UserAvatarDisplay } from '@/components/UserAvatarDisplay';
import { getStatutColor, getStatutLabel, getPrioriteColor, getEditedEtapesOnly, getDossierProgressFromEditedEtapes, customEtapeMatchesStatut, calculateDaysSince, calculateDaysUntil, isDeadlineApproaching, formatRelativeTime, getNextAction, getTimelineStepsWithCustom, getDossierMinEtapeDateMs } from '@/lib/dossierUtils';
import {
  collectAdminDossierAgendaItems,
  downloadAdminDossierAgendaPdf,
  DEFAULT_AGENDA_HORIZON_DAYS,
} from '@/lib/adminDossierAgenda';
import { getStatutColor as getTaskStatutColor, getStatutLabel as getTaskStatutLabel, getPrioriteColor as getTaskPrioriteColor, getPrioriteLabel as getTaskPrioriteLabel } from '@/lib/taskUtils';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';
import { DocumentPreview } from '@/components/DocumentPreview';
import { Toast } from '@/components/Toast';

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
  const [exonererFraisTarification, setExonererFraisTarification] = useState(false);
  const [fraisExoneresMotifInput, setFraisExoneresMotifInput] = useState('');
  /** Modal superadmin : montant fixe vs notification tarification (séparés). */
  const [showTarifModal, setShowTarifModal] = useState<any>(null);
  const [tarifMontantInput, setTarifMontantInput] = useState('');
  const [tarifNotifyMessage, setTarifNotifyMessage] = useState('');
  const [tarifExonerer, setTarifExonerer] = useState(false);
  const [tarifExoMotif, setTarifExoMotif] = useState('');
  const [tarifSavingMontant, setTarifSavingMontant] = useState(false);
  const [tarifSendingNotify, setTarifSendingNotify] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'in_progress' | 'standby' | 'favorable' | 'unfavorable' | 'closed' | 'archived'
  >('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  /** Tri liste : jalons datés dans `etapesSupplementaires` (front uniquement). */
  const [dossierSortEtapes, setDossierSortEtapes] = useState<'default' | 'etape_date_asc' | 'etape_date_desc'>('default');
  const isSuperadmin = (session?.user as any)?.role === 'superadmin';

  // Toujours proposer un minimum de 3 actions avant toute "édition des étapes".
  const DEFAULT_ADMIN_ETAPES = [
    { id: 'en_cours', label: 'Accepté', ordre: 0 },
    { id: 'refuse', label: 'Refusé', ordre: 1 },
    { id: 'annule', label: 'Archivé', ordre: 2 },
  ];

  /** Aligne la valeur affichée du select sur les ids des étapes (ex. accepte → en_cours). */
  const normalizeStatutForAdminSelect = (statut: string | undefined) => {
    if (!statut) return '';
    if (statut === 'accepte') return 'en_cours';
    return statut;
  };

  const adminSelectStatutMatchesEtape = (currentStatut: string, etape: { id?: string }) => {
    const id = String(etape.id ?? '');
    if (id === currentStatut) return true;
    if (id === 'en_cours' && (currentStatut === 'en_cours' || currentStatut === 'accepte')) return true;
    return false;
  };

  const getEffectiveEtapes = (dossier: any) => {
    const customSteps = Array.isArray(dossier?.etapesSupplementaires) ? dossier.etapesSupplementaires : [];
    const defaultIds = new Set(DEFAULT_ADMIN_ETAPES.map((s) => s.id));

    const normalizedCustom = customSteps.map((s: any, idx: number) => ({
      id: s?.id || s?.label || String(idx),
      label: s?.label || s?.id || `Étape ${idx + 1}`,
      ordre: typeof s?.ordre === 'number' ? s.ordre : idx,
      date: s?.date,
      addedAt: s?.addedAt,
      addedBy: s?.addedBy,
    }));

    // Conserver l'ordre des étapes custom (mais toujours avec les 3 étapes par défaut en tête).
    const customExtra = normalizedCustom
      .filter((s: any) => !defaultIds.has(String(s.id)))
      .sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0));

    return [...DEFAULT_ADMIN_ETAPES, ...customExtra];
  };

  const getDossierStatutDisplayLabel = (dossier: any) => {
    const statut = String(dossier?.statut || '').trim();
    if (!statut) return '—';
    const effectiveEtapes = getEffectiveEtapes(dossier);
    const matched = effectiveEtapes.find((etape: any) => adminSelectStatutMatchesEtape(statut, etape));
    if (matched?.label) return String(matched.label);
    return getStatutLabel(statut);
  };

  const maskStrict = (value: string, fallback: string = '—') => {
    if (!strictPrivacyMode) return value || fallback;
    return value ? '••••••' : fallback;
  };

  const getDossierDisplayTitle = (dossier: any) => {
    const raw = typeof dossier?.titre === 'string' && dossier.titre ? dossier.titre : 'Sans titre';
    return strictPrivacyMode ? 'Dossier masqué' : raw;
  };

  const getDossierClientDisplayName = (dossier: any) => {
    const raw = dossier.user && typeof dossier.user === 'object'
      ? [dossier.user.firstName, dossier.user.lastName].filter(Boolean).join(' ') || dossier.user.email || '—'
      : [dossier.clientPrenom, dossier.clientNom].filter(Boolean).join(' ') || dossier.clientEmail || 'Non renseigné';
    return strictPrivacyMode ? 'Titulaire masqué' : raw;
  };

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
  const [agendaPdfLoading, setAgendaPdfLoading] = useState(false);
  const [isAgendaCollapsed, setIsAgendaCollapsed] = useState(true);

  const agendaItems = useMemo(
    () =>
      collectAdminDossierAgendaItems(
        dossiers,
        dossierTasks,
        dossierDrafts,
        DEFAULT_AGENDA_HORIZON_DAYS
      ),
    [dossiers, dossierTasks, dossierDrafts]
  );
  const [activeDirectUploadDossierId, setActiveDirectUploadDossierId] = useState<string | null>(null);
  const [directUploadData, setDirectUploadData] = useState({
    nom: '',
    description: '',
    categorie: 'autre'
  });
  const [directUploadError, setDirectUploadError] = useState<string | null>(null);
  const [directUploading, setDirectUploading] = useState(false);
  const [activeQuickComplementDossierId, setActiveQuickComplementDossierId] = useState<string | null>(null);
  const [quickComplementId, setQuickComplementId] = useState<string | null>(null);
  const [quickComplementText, setQuickComplementText] = useState('');
  const [quickComplementSaving, setQuickComplementSaving] = useState(false);
  const [quickComplementError, setQuickComplementError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const directFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickComplementTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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

  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [clientPopover, setClientPopover] = useState<{ dossierId: string; x: number; y: number } | null>(null);
  const clientPopoverRef = useRef<HTMLDivElement | null>(null);
  const [strictPrivacyMode, setStrictPrivacyMode] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentUserId = (session?.user as any)?.id || 'admin';
    const stored = localStorage.getItem(`adminDossiersStrictPrivacy:${currentUserId}`);
    setStrictPrivacyMode(stored === 'true');
  }, [session]);

  const getProfileCompletionInfo = (dossier: any) => {
    const isRegisteredUser = dossier?.user && typeof dossier.user === 'object';
    if (!isRegisteredUser) {
      const missing: string[] = [];
      if (!String(dossier?.clientPrenom || '').trim()) missing.push('Prénom');
      if (!String(dossier?.clientNom || '').trim()) missing.push('Nom');
      if (!String(dossier?.clientEmail || '').trim()) missing.push('Email');
      if (!String(dossier?.clientTelephone || '').trim()) missing.push('Téléphone');
      return {
        isRegisteredUser,
        profileCompleteFlag: false,
        computedComplete: missing.length === 0,
        missingFields: missing,
      };
    }

    const u = dossier.user || {};
    const missing: string[] = [];
    if (!String(u.firstName || '').trim()) missing.push('Prénom');
    if (!String(u.lastName || '').trim()) missing.push('Nom');
    if (!String(u.email || '').trim()) missing.push('Email');
    if (!String(u.phone || u.telephone || '').trim()) missing.push('Téléphone');
    if (!String(u.dateNaissance || '').trim()) missing.push('Date de naissance');
    if (!String(u.nationalite || '').trim()) missing.push('Nationalité');
    if (!String(u.adressePostale || '').trim()) missing.push('Adresse postale');
    if (!String(u.ville || '').trim()) missing.push('Ville');
    if (!String(u.codePostal || '').trim()) missing.push('Code postal');
    if (!String(u.pays || '').trim()) missing.push('Pays');

    const profileCompleteFlag = u.profilComplete === true;
    return {
      isRegisteredUser,
      profileCompleteFlag,
      computedComplete: missing.length === 0,
      missingFields: missing,
    };
  };

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

  useEffect(() => {
    const refreshPreparation = () => {
      void loadDossierDrafts();
    };
    if (typeof window === 'undefined') return;
    window.addEventListener('dossierDocumentDraftsUpdated', refreshPreparation);
    window.addEventListener('collaborativeDraftsUpdated', refreshPreparation);
    return () => {
      window.removeEventListener('dossierDocumentDraftsUpdated', refreshPreparation);
      window.removeEventListener('collaborativeDraftsUpdated', refreshPreparation);
    };
  }, [session, status, dossiers.length]);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (!clientPopoverRef.current) return;
      if (!clientPopoverRef.current.contains(event.target as Node)) {
        setClientPopover(null);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

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

  const handleDirectUploadFromList = async (e: React.FormEvent, dossierId: string) => {
    e.preventDefault();
    setDirectUploadError(null);

    if (!/^[a-f0-9]{24}$/i.test(dossierId)) {
      setDirectUploadError('Impossible d\'associer le document au dossier (identifiant invalide).');
      return;
    }

    if (!directFileInputRef.current?.files?.[0]) {
      setDirectUploadError('Veuillez sélectionner un fichier');
      return;
    }
    if (!directUploadData.nom.trim()) {
      setDirectUploadError('Veuillez saisir un nom de document');
      return;
    }

    setDirectUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', directFileInputRef.current.files[0]);
      formData.append('nom', directUploadData.nom.trim());
      formData.append('description', directUploadData.description.trim());
      formData.append('categorie', directUploadData.categorie);
      formData.append('dossierId', dossierId);

      const response = await documentsAPI.uploadDocument(formData);
      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'Erreur lors du téléversement du document');
      }

      const createdDoc = response.data.document;
      if (createdDoc) {
        setDossierDocuments((prev) => {
          const current = prev[dossierId] || [];
          return {
            ...prev,
            [dossierId]: [createdDoc, ...current]
          };
        });
      }

      setDirectUploadData({ nom: '', description: '', categorie: 'autre' });
      if (directFileInputRef.current) {
        directFileInputRef.current.value = '';
      }
      setActiveDirectUploadDossierId(null);
      await loadDossierDocuments();
      setExpandedDocumentSections((prev) => new Set(prev).add(dossierId));
      setToast({ message: '✅ Document ajouté avec succès au dossier.', type: 'success' });
    } catch (err: any) {
      console.error('Erreur upload direct depuis la liste (admin):', err);
      setDirectUploadError(err.response?.data?.message || err.message || 'Erreur lors du téléversement du document');
      setToast({ message: err.response?.data?.message || err.message || 'Erreur lors du téléversement du document', type: 'error' });
    } finally {
      setDirectUploading(false);
    }
  };

  const getLastComplementTimestamp = (dossier: any): number => {
    const complements = Array.isArray(dossier?.complementsRecit) ? dossier.complementsRecit : [];
    if (complements.length === 0) return 0;
    const lastComplement = complements[complements.length - 1];
    const rawDate = lastComplement?.updatedAt || lastComplement?.createdAt;
    const ts = rawDate ? new Date(rawDate).getTime() : 0;
    return Number.isFinite(ts) ? ts : 0;
  };

  const getComplementSeenStorageKey = (dossierId: string) => `dossierComplementSeen:admin:${dossierId}`;

  const hasUnseenComplement = (dossier: any): boolean => {
    if (typeof window === 'undefined') return false;
    const dossierId = (dossier?._id || dossier?.id || '').toString();
    if (!dossierId) return false;
    const lastTs = getLastComplementTimestamp(dossier);
    if (!lastTs) return false;
    const seenTs = Number(localStorage.getItem(getComplementSeenStorageKey(dossierId)) || '0');
    return lastTs > seenTs;
  };

  const markComplementAsSeen = (dossier: any) => {
    if (typeof window === 'undefined') return;
    const dossierId = (dossier?._id || dossier?.id || '').toString();
    if (!dossierId) return;
    const lastTs = getLastComplementTimestamp(dossier);
    if (!lastTs) return;
    localStorage.setItem(getComplementSeenStorageKey(dossierId), String(lastTs));
  };

  const openQuickComplementEditor = (dossier: any) => {
    const dossierId = (dossier?._id || dossier?.id || '').toString();
    if (!/^[a-f0-9]{24}$/i.test(dossierId)) {
      alert('Identifiant dossier invalide.');
      return;
    }

    if (activeQuickComplementDossierId === dossierId) {
      setActiveQuickComplementDossierId(null);
      setQuickComplementId(null);
      setQuickComplementText('');
      setQuickComplementError(null);
      return;
    }

    markComplementAsSeen(dossier);
    const complements = Array.isArray(dossier?.complementsRecit) ? dossier.complementsRecit : [];
    const lastComplement = complements.length > 0 ? complements[complements.length - 1] : null;
    setActiveQuickComplementDossierId(dossierId);
    setQuickComplementId(lastComplement?._id || lastComplement?.id || null);
    setQuickComplementText(lastComplement?.text || '');
    setQuickComplementError(null);
  };

  useEffect(() => {
    if (!activeQuickComplementDossierId) return;
    const timer = window.setTimeout(() => {
      quickComplementTextareaRef.current?.focus();
      quickComplementTextareaRef.current?.setSelectionRange(
        quickComplementTextareaRef.current.value.length,
        quickComplementTextareaRef.current.value.length
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeQuickComplementDossierId]);

  const saveQuickComplement = async (e: React.FormEvent, dossierId: string) => {
    e.preventDefault();
    const text = quickComplementText.trim();
    if (!text) {
      setQuickComplementError('Le complément ne peut pas être vide.');
      return;
    }

    setQuickComplementSaving(true);
    setQuickComplementError(null);
    try {
      if (quickComplementId) {
        await dossiersAPI.updateRecapComplement(dossierId, quickComplementId, text);
      } else {
        await dossiersAPI.addRecapComplement(dossierId, text);
      }
      await loadDossiers();
      setActiveQuickComplementDossierId(null);
      setQuickComplementId(null);
      setQuickComplementText('');
      setToast({ message: '✅ Information importante enregistrée avec succès.', type: 'success' });
    } catch (err: any) {
      console.error('Erreur édition rapide du complément (admin):', err);
      setQuickComplementError(err.response?.data?.message || 'Erreur lors de l’enregistrement du complément.');
      setToast({ message: err.response?.data?.message || 'Erreur lors de l’enregistrement du complément.', type: 'error' });
    } finally {
      setQuickComplementSaving(false);
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

  const handleDownloadAgendaPdf = async () => {
    setAgendaPdfLoading(true);
    try {
      await downloadAdminDossierAgendaPdf(agendaItems, DEFAULT_AGENDA_HORIZON_DAYS);
    } catch (e) {
      console.error(e);
      alert('Impossible de générer le PDF. Réessayez ou vérifiez la console.');
    } finally {
      setAgendaPdfLoading(false);
    }
  };

  const loadDossierDrafts = async () => {
    try {
      const draftsMap: Record<string, any[]> = {};
      let wordDrafts: any[] = [];
      try {
        const wordRes = await dossierDocumentDraftsAPI.list();
        if (wordRes.data?.success && Array.isArray(wordRes.data.drafts)) {
          wordDrafts = wordRes.data.drafts;
        }
      } catch (err) {
        console.warn('⚠️ Impossible de charger les brouillons Word (préparation):', err);
      }
      const wordByDossierId: Record<string, any[]> = {};
      for (const w of wordDrafts) {
        const did = w.dossier?._id?.toString() || (typeof w.dossier === 'string' ? w.dossier : null);
        if (!did) continue;
        if (!wordByDossierId[did]) wordByDossierId[did] = [];
        wordByDossierId[did].push({ ...w, prepKind: 'word' as const });
      }

      await Promise.all(
        dossiers.map(async (dossier: any) => {
          const dossierId = dossier._id || dossier.id;
          if (!dossierId) return;
          const idStr = String(dossierId);
          try {
            const draftRes = await collaborativeDraftsAPI.getDossierDrafts(dossierId);
            const collabList =
              draftRes.data.success && Array.isArray(draftRes.data.drafts) ? draftRes.data.drafts : [];
            const collabs = collabList.map((c: any) => ({ ...c, prepKind: 'collab' as const }));
            const words = wordByDossierId[idStr] || [];
            const merged = [...collabs, ...words].sort((a, b) => {
              const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
              const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
              return tb - ta;
            });
            draftsMap[idStr] = merged;
          } catch (err) {
            console.warn(`⚠️ Impossible de charger les documents en préparation pour le dossier ${dossierId}`, err);
            draftsMap[idStr] = wordByDossierId[idStr] || [];
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
      const nativeForm = new FormData(e.currentTarget as HTMLFormElement);
      const nativeTitre = String(nativeForm.get('titre') || '').trim();
      const titreTrim = (formData.titre || '').trim() || nativeTitre;
      if (!titreTrim) {
        setError('Veuillez indiquer le nom du dossier.');
        setIsLoading(false);
        return;
      }

      const dossierData: any = {
        // Nom du dossier (obligatoire à la création)
        titre: titreTrim,
        // Alias défensifs (compat route / rétro-compat)
        title: titreTrim,
        nomDossier: titreTrim,
      };
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
      const nativeForm = new FormData(e.currentTarget as HTMLFormElement);
      const nativeTitre = String(nativeForm.get('titre') || '').trim();
      const titreTrim = (formData.titre || '').trim() || nativeTitre;
      if (!titreTrim) {
        setError('Veuillez indiquer le nom du dossier.');
        setIsLoading(false);
        return;
      }

      const updateData: any = {
        titre: titreTrim,
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

  const handleDeleteDocument = async (documentId: string) => {
    const docId = String(documentId || '');
    if (!docId) return;
    if (!confirm('Supprimer ce document ?')) return;

    setDeletingDocumentId(docId);
    setError(null);
    try {
      const response = await documentsAPI.deleteDocument(docId);
      if (response?.data?.success) {
        setToast({ message: 'Document supprimé avec succès', type: 'success' });
        await loadDossiers();
        await loadDossierDocuments();
      } else {
        setToast({
          message: response?.data?.message || 'Erreur lors de la suppression du document',
          type: 'error'
        });
      }
    } catch (err: any) {
      console.error('Erreur lors de la suppression du document:', err);
      const message = err.response?.data?.message || 'Erreur lors de la suppression du document';
      setError(message);
      setToast({ message, type: 'error' });
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const handleQuickUserUpdateFromPopover = async (dossier: any, patch: any, successMessage: string) => {
    try {
      const userId = dossier?.user?._id || dossier?.user?.id;
      if (!userId) return;
      await userAPI.updateUser(String(userId), patch);
      setDossiers((prev) =>
        prev.map((d: any) => {
          const dUserId = d?.user?._id || d?.user?.id;
          if (String(dUserId || '') !== String(userId)) return d;
          return {
            ...d,
            user: {
              ...(d.user || {}),
              ...patch,
            },
          };
        })
      );
      setToast({ message: successMessage, type: 'success' });
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Action utilisateur impossible';
      setToast({ message, type: 'error' });
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
      setExonererFraisTarification(false);
      setFraisExoneresMotifInput('');
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

      if (exonererFraisTarification && showStatutModal.newStatut === 'en_cours') {
        updateData.fraisExoneres = true;
        if (fraisExoneresMotifInput.trim()) {
          updateData.fraisExoneresMotif = fraisExoneresMotifInput.trim();
        }
      }
      
      console.log('📤 Envoi de la mise à jour:', JSON.stringify(updateData, null, 2));
      console.log('📤 Statut:', showStatutModal.newStatut);
      console.log('📤 Notification message:', notificationMessage);
      
      const response = await dossiersAPI.updateDossier(showStatutModal.dossierId, updateData);
      if (response.data.success) {
        await loadDossiers();
        setShowStatutModal(null);
        setNotificationMessage('');
        setExonererFraisTarification(false);
        setFraisExoneresMotifInput('');
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

  const handleToggleStandby = async (dossier: any, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const dossierId = String(dossier?._id || dossier?.id || '');
    if (!dossierId) return;
    const willEnable = !dossier?.isStandby;
    const reason = willEnable ? window.prompt('Motif du stand-by (optionnel) :', String(dossier?.standbyReason || '')) : '';

    setIsLoading(true);
    setError(null);
    try {
      const payload: any = { isStandby: willEnable };
      if (willEnable) {
        if (typeof reason === 'string' && reason.trim()) payload.standbyReason = reason.trim();
      }
      const response = await dossiersAPI.updateDossier(dossierId, payload);
      if (response.data.success) {
        await loadDossiers();
        setToast({
          message: willEnable ? 'Dossier mis en stand-by.' : 'Dossier retiré du stand-by.',
          type: 'success'
        });
      }
    } catch (err: any) {
      console.error('Erreur lors du changement de stand-by:', err);
      setError(err.response?.data?.message || 'Erreur lors du changement de stand-by');
      setToast({ message: err.response?.data?.message || 'Erreur lors du changement de stand-by', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const parseTarifMontantInput = (s: string): number | null => {
    const normalized = String(s || '')
      .replace(/\s/g, '')
      .replace(',', '.')
      .trim();
    const parsed = Number(normalized || '0');
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  };

  const openTarifModal = (dossier: any, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cur = Number(dossier?.montantTarificationFixe || 0);
    setShowTarifModal(dossier);
    setTarifMontantInput(cur > 0 ? String(cur) : '');
    setTarifNotifyMessage('');
    setTarifExonerer(!!dossier?.fraisExoneres);
    setTarifExoMotif(dossier?.fraisExoneresMotif ? String(dossier.fraisExoneresMotif) : '');
  };

  const closeTarifModal = () => {
    setShowTarifModal(null);
    setTarifMontantInput('');
    setTarifNotifyMessage('');
    setTarifExonerer(false);
    setTarifExoMotif('');
  };

  const tarifMontantDirty = () => {
    if (!showTarifModal) return false;
    const p = parseTarifMontantInput(tarifMontantInput);
    if (p === null) return true;
    const base = Number(showTarifModal.montantTarificationFixe || 0);
    return Math.abs(p - base) > 0.0001;
  };

  const handleTarifSaveMontantOnly = async () => {
    if (!showTarifModal) return;
    const dossierId = String(showTarifModal._id || showTarifModal.id || '');
    if (!dossierId) return;
    const parsed = parseTarifMontantInput(tarifMontantInput);
    if (parsed === null) {
      setToast({ message: 'Montant invalide.', type: 'error' });
      return;
    }
    setTarifSavingMontant(true);
    setError(null);
    try {
      await dossiersAPI.updateDossier(dossierId, {
        montantTarificationFixe: parsed,
        skipDossierModificationNotify: true,
      });
      await loadDossiers();
      setToast({
        message: parsed > 0 ? 'Montant enregistré (aucune notification envoyée).' : 'Montant fixe retiré.',
        type: 'success',
      });
      if (parsed > 0) {
        setTarifExonerer(false);
        setTarifExoMotif('');
      } else {
        setTarifMontantInput('');
      }
      setShowTarifModal((prev: any) => {
        if (!prev || String(prev._id || prev.id) !== dossierId) return prev;
        if (parsed > 0) {
          return {
            ...prev,
            montantTarificationFixe: parsed,
            fraisExoneres: false,
            fraisExoneresMotif: undefined,
          };
        }
        const {
          montantTarificationFixe: _rm,
          montantTarificationFixeAt: _ra,
          montantTarificationFixeBy: _rb,
          ...rest
        } = prev;
        return rest;
      });
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Enregistrement du montant impossible';
      setToast({ message, type: 'error' });
    } finally {
      setTarifSavingMontant(false);
    }
  };

  const handleTarifSendNotification = async () => {
    if (!showTarifModal) return;
    const dossierId = String(showTarifModal._id || showTarifModal.id || '');
    if (!dossierId) return;
    setTarifSendingNotify(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { notifyTarificationClient: true };
      const msg = tarifNotifyMessage.trim();
      if (msg) payload.tarificationClientMessage = msg;
      if (tarifExonerer) {
        payload.fraisExoneres = true;
        const m = tarifExoMotif.trim();
        if (m) payload.fraisExoneresMotif = m;
      }
      await dossiersAPI.updateDossier(dossierId, payload);
      await loadDossiers();
      setToast({ message: 'Notification tarification envoyée au client.', type: 'success' });
      closeTarifModal();
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Envoi de la notification impossible';
      setToast({ message, type: 'error' });
    } finally {
      setTarifSendingNotify(false);
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
          <Button
            onClick={() => {
              setEditingDossier(null);
              setClientType('existing');
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
                statut: 'en_attente',
                priorite: 'normale',
                dateEcheance: getTodayDate(),
                notes: '',
                assignedTo: '',
              });
              setIsCreating(true);
            }}
            className="shadow-md hover:shadow-lg transition-shadow"
          >
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
                    <Label htmlFor="titre">Nom du dossier {!editingDossier && '*'}</Label>
                    <Input
                      id="titre"
                      name="titre"
                      value={formData.titre}
                      onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                      className="mt-1"
                      required={!editingDossier}
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
              <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-center justify-between">
                <div className="flex-1 w-full sm:max-w-md min-w-0">
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
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:min-w-0 sm:flex-shrink-0">
                  <select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="flex h-10 w-full sm:w-64 min-w-0 rounded-lg border border-gray-300 bg-background px-3 sm:px-4 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  >
                    <option value="all">👤 Tous les utilisateurs</option>
                    <option value="no_user">👤 Sans utilisateur</option>
                    {utilisateurs.map((user: any) => (
                      <option key={user._id || user.id} value={(user._id || user.id)?.toString()}>
                        {`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}
                      </option>
                    ))}
                  </select>
                  <select
                    value={dossierSortEtapes}
                    onChange={(e) =>
                      setDossierSortEtapes(e.target.value as 'default' | 'etape_date_asc' | 'etape_date_desc')
                    }
                    title="Tri selon la date la plus proche parmi les étapes du dossier qui ont une date"
                    className="flex h-10 w-full sm:w-[13.5rem] min-w-0 rounded-lg border border-gray-300 bg-background px-3 sm:px-4 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  >
                    <option value="default">📅 Tri : ordre chargé</option>
                    <option value="etape_date_asc">📅 Jalons : date la plus proche</option>
                    <option value="etape_date_desc">📅 Jalons : date la plus lointaine</option>
                  </select>
                </div>
                <Button onClick={loadDossiers} variant="outline" size="sm" className="whitespace-nowrap w-full sm:w-auto shrink-0">
                  🔄 Actualiser
                </Button>
              </div>
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
              {/* Agenda : échéances, jalons datés, tâches — 15 jours + retards */}
              <div className="mb-4 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/5 to-background p-3 sm:p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-foreground">
                        Actions à prévoir (15 jours + retards)
                      </h2>
                      <button
                        type="button"
                        onClick={() => setIsAgendaCollapsed((v) => !v)}
                        className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        aria-expanded={!isAgendaCollapsed}
                        aria-label={isAgendaCollapsed ? 'Déplier la section des actions à prévoir' : 'Replier la section des actions à prévoir'}
                      >
                        {isAgendaCollapsed ? '▾ Déplier' : '▴ Replier'}
                      </button>
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 break-words leading-snug">
                      Synthèse des dates connues : échéance du dossier, jalons avec date dans les étapes, et
                      tâches ouvertes avec échéance, ainsi que les documents en préparation (non terminés) avec
                      date d’échéance. Les dossiers clôturés, archivés, refusés ou annulés sont exclus.
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {agendaItems.length === 0
                        ? 'Aucune action dans la fenêtre.'
                        : `${agendaItems.length} action${agendaItems.length > 1 ? 's' : ''} (${agendaItems.filter((i) => i.bucket === 'overdue').length} retard${agendaItems.filter((i) => i.bucket === 'overdue').length > 1 ? 's' : ''}, ${agendaItems.filter((i) => i.bucket === 'upcoming').length} à venir)`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 w-full sm:w-auto text-xs h-9"
                    disabled={agendaPdfLoading}
                    onClick={handleDownloadAgendaPdf}
                  >
                    {agendaPdfLoading ? 'PDF…' : '📄 Télécharger PDF'}
                  </Button>
                </div>
                {!isAgendaCollapsed && agendaItems.length > 0 && (
                  <div className="mt-3 max-h-52 sm:max-h-64 overflow-y-auto rounded-lg border border-border/70 bg-background/90 text-left">
                    {(['overdue', 'upcoming'] as const).map((bucket) => {
                      const rows = agendaItems.filter((i) => i.bucket === bucket);
                      if (rows.length === 0) return null;
                      return (
                        <div key={bucket}>
                          <div
                            className={`sticky top-0 z-[1] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide border-b ${
                              bucket === 'overdue'
                                ? 'bg-red-50 text-red-800 border-red-100'
                                : 'bg-blue-50 text-blue-800 border-blue-100'
                            }`}
                          >
                            {bucket === 'overdue' ? 'Retards' : `Dans les ${DEFAULT_AGENDA_HORIZON_DAYS} prochains jours`}
                          </div>
                          <ul className="divide-y divide-border/40">
                            {rows.map((it, idx) => (
                              <li key={`${bucket}-${it.dossierId}-${it.kind}-${it.eventDayMs}-${idx}`}>
                                <Link
                                  href={`/admin/dossiers/${it.dossierId}`}
                                  className="flex flex-col gap-0.5 px-3 py-2 hover:bg-muted/50 transition-colors min-w-0"
                                >
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] min-w-0">
                                    <span className="font-semibold text-foreground tabular-nums shrink-0">
                                      {new Date(it.eventDayMs).toLocaleDateString('fr-FR')}
                                    </span>
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                                        it.kind === 'dossier_echeance'
                                          ? 'bg-amber-100 text-amber-900'
                                          : it.kind === 'etape'
                                            ? 'bg-violet-100 text-violet-900'
                                            : it.kind === 'doc_preparation'
                                              ? 'bg-cyan-100 text-cyan-900'
                                            : 'bg-slate-100 text-slate-800'
                                      }`}
                                    >
                                      {it.kindLabel}
                                    </span>
                                    <span className="text-muted-foreground shrink-0">{it.dossierRef}</span>
                                  </div>
                                  <p className="text-[11px] text-foreground font-medium truncate" title={it.dossierTitle}>
                                    {it.dossierTitle}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground line-clamp-2 break-words">
                                    {it.actionLabel}
                                  </p>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Statistiques rapides (badges cliquables) */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
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
                        !d.isStandby &&
                        !d.estCloture &&
                        !d.estArchive &&
                        rawStatut !== 'annule'
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
                      const isRefused = rawStatut === 'refuse';
                      const isArchived = rawStatut === 'annule';
                      return (
                        !d.isStandby &&
                        !d.estCloture &&
                        !d.estArchive &&
                        !isArchived &&
                        !isRefused &&
                        !initialStatut
                      );
                    }).length}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('standby')}
                  className={`text-left bg-gradient-to-br from-violet-50 to-fuchsia-100 border border-violet-300/70 rounded-lg p-4 shadow-sm transition-all duration-300 ${
                    statusFilter === 'standby'
                      ? 'ring-2 ring-violet-500/60 shadow-md'
                      : 'hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <p className="text-xs text-violet-700 font-semibold mb-1 uppercase tracking-wide">Stand-by</p>
                  <p className="text-2xl font-bold text-violet-900">
                    {dossiers.filter((d: any) => !!d.isStandby && !d.estCloture && !d.estArchive).length}
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
                    {dossiers.filter((d: any) => d.estArchive || d.statut === 'annule' || d.statut === 'refuse').length}
                  </p>
                </button>
              </div>

              {/* Indicateur de filtre actif et réinitialisation */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4 text-xs text-muted-foreground">
                <div className="min-w-0">
                  {statusFilter === 'all' && userFilter === 'all' && dossierSortEtapes === 'default' ? (
                    <span>Tous les dossiers sont affichés.</span>
                  ) : (
                    <span className="break-words">
                      {statusFilter !== 'all' || userFilter !== 'all' ? (
                        <>
                          Filtre :{' '}
                          <span className="font-semibold text-primary">
                            {statusFilter !== 'all' && (
                              <>
                                {statusFilter === 'pending' && 'En attente'}
                                {statusFilter === 'in_progress' && 'En cours'}
                                {statusFilter === 'standby' && 'Stand-by'}
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
                        </>
                      ) : null}
                      {dossierSortEtapes !== 'default' && (
                        <span className={statusFilter !== 'all' || userFilter !== 'all' ? ' block sm:inline sm:mt-0 mt-1' : ''}>
                          {(statusFilter !== 'all' || userFilter !== 'all') && <span className="hidden sm:inline"> • </span>}
                          {(statusFilter !== 'all' || userFilter !== 'all') && <span className="block sm:hidden" />}
                          Tri jalons :{' '}
                          <span className="font-semibold text-primary">
                            {dossierSortEtapes === 'etape_date_asc' && 'date la plus proche d’abord'}
                            {dossierSortEtapes === 'etape_date_desc' && 'date la plus lointaine d’abord'}
                          </span>
                          <span className="text-muted-foreground font-normal"> (sans étape datée en bas)</span>
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !strictPrivacyMode;
                      setStrictPrivacyMode(next);
                      if (next) setClientPopover(null);
                      if (typeof window !== 'undefined') {
                        const currentUserId = (session?.user as any)?.id || 'admin';
                        localStorage.setItem(`adminDossiersStrictPrivacy:${currentUserId}`, String(next));
                      }
                    }}
                    className={`px-2 py-1 rounded-md border transition-colors shrink-0 self-start sm:self-auto ${
                      strictPrivacyMode
                        ? 'border-gray-300 bg-gray-900 text-white hover:bg-gray-800'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                    title="Masquer strictement les titulaires et noms de dossier dans la liste"
                  >
                    {strictPrivacyMode ? 'Confidentialité stricte: ON' : 'Confidentialité stricte: OFF'}
                  </button>
                  {(statusFilter !== 'all' || userFilter !== 'all' || dossierSortEtapes !== 'default') && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('all');
                        setUserFilter('all');
                        setDossierSortEtapes('default');
                      }}
                      className="px-2 py-1 rounded-md border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors shrink-0 self-start sm:self-auto"
                    >
                      Réinitialiser filtres & tri
                    </button>
                  )}
                </div>
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
                      d.isStandby ||
                      d.estCloture ||
                      d.estArchive ||
                      rawStatut === 'annule'
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
                    const isRefused = rawStatut === 'refuse';
                    const isArchived = rawStatut === 'annule';
                    if (
                      initialStatut ||
                      d.isStandby ||
                      isRefused ||
                      isArchived ||
                      d.estCloture ||
                      d.estArchive
                    ) {
                      return false;
                    }
                  } else if (statusFilter === 'standby') {
                    if (!d.isStandby || d.estCloture || d.estArchive) return false;
                  } else if (statusFilter === 'closed') {
                    if (!d.estCloture) return false;
                  } else if (statusFilter === 'archived') {
                    if (
                      !(
                        d.estArchive ||
                        (d.statut || '') === 'annule' ||
                        (d.statut || '') === 'refuse'
                      )
                    ) return false;
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

                const dossierIdStr = (d: any) => String(d._id || d.id || '');
                const sortedDossiers =
                  dossierSortEtapes === 'default'
                    ? filteredDossiers
                    : (() => {
                        const list = filteredDossiers.slice();
                        if (dossierSortEtapes === 'etape_date_asc') {
                          list.sort((a, b) => {
                            const ma = getDossierMinEtapeDateMs(a);
                            const mb = getDossierMinEtapeDateMs(b);
                            const va = ma == null ? Number.POSITIVE_INFINITY : ma;
                            const vb = mb == null ? Number.POSITIVE_INFINITY : mb;
                            if (va !== vb) return va - vb;
                            return dossierIdStr(a).localeCompare(dossierIdStr(b));
                          });
                        } else if (dossierSortEtapes === 'etape_date_desc') {
                          list.sort((a, b) => {
                            const ma = getDossierMinEtapeDateMs(a);
                            const mb = getDossierMinEtapeDateMs(b);
                            const va = ma == null ? Number.NEGATIVE_INFINITY : ma;
                            const vb = mb == null ? Number.NEGATIVE_INFINITY : mb;
                            if (vb !== va) return vb - va;
                            return dossierIdStr(a).localeCompare(dossierIdStr(b));
                          });
                        }
                        return list;
                      })();

                if (sortedDossiers.length === 0) {
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
                          setDossierSortEtapes('default');
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
                    {sortedDossiers.map((dossier) => (
                  <div
                    key={dossier._id || dossier.id}
                    className={`relative group overflow-hidden rounded-xl p-[1px] transition-all duration-300 bg-gradient-to-r shadow-sm w-full min-w-0 ${
                      dossier.isStandby
                        ? 'from-violet-200/70 via-fuchsia-200/70 to-violet-200/70 group-hover:from-violet-400/70 group-hover:via-fuchsia-400/70 group-hover:to-violet-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(168,85,247,0.5)]'
                        : dossier.statut === 'recu' || dossier.statut === 'en_attente_onboarding'
                        ? 'from-yellow-200/70 via-amber-200/70 to-yellow-200/70 group-hover:from-yellow-400/70 group-hover:via-amber-400/70 group-hover:to-yellow-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(234,179,8,0.5)]'
                        : dossier.statut === 'decision_favorable' || dossier.statut === 'gain_cause'
                        ? 'from-green-200/70 via-emerald-200/70 to-green-200/70 group-hover:from-green-400/70 group-hover:via-emerald-400/70 group-hover:to-green-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(34,197,94,0.5)]'
                        : dossier.statut === 'decision_defavorable' || dossier.statut === 'refuse' || dossier.statut === 'rejet' || dossier.statut === 'annule'
                        ? 'from-red-200/70 via-rose-200/70 to-red-200/70 group-hover:from-red-400/70 group-hover:via-rose-400/70 group-hover:to-red-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(239,68,68,0.5)]'
                        : 'from-blue-200/70 via-indigo-200/70 to-blue-200/70 group-hover:from-blue-400/70 group-hover:via-indigo-400/70 group-hover:to-blue-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(59,130,246,0.5)]'
                    }`}
                  >
                    <div className="bg-white rounded-xl border border-white/70 p-4 sm:p-5 group-hover:shadow-md group-hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
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
                              {getDossierDisplayTitle(dossier)}
                            </h3>
                            {(dossier.numero || dossier.numeroDossier) && (
                              <p className="text-xs text-primary font-mono font-semibold">
                                Réf. {dossier.numero || dossier.numeroDossier}
                              </p>
                            )}
                            {/* Client / créateur du dossier — toujours visible, même plié (photo profil si inscrit) */}
                            <button
                              type="button"
                              className="flex items-center gap-2 mt-1 min-w-0 rounded-md px-1 py-0.5 -ml-1 hover:bg-blue-50 transition-colors text-left"
                              title={strictPrivacyMode ? 'Mode confidentialité actif' : 'Voir le profil utilisateur'}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (strictPrivacyMode) return;
                                const dossierId = String(dossier._id || dossier.id || '');
                                if (!dossierId) return;
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const desiredX = Math.max(12, Math.min(rect.left, window.innerWidth - 360));
                                const desiredY = Math.min(rect.bottom + 8, window.innerHeight - 220);
                                setClientPopover((prev) => {
                                  if (prev?.dossierId === dossierId) return null;
                                  return { dossierId, x: desiredX, y: desiredY };
                                });
                              }}
                            >
                              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-primary/10 border border-primary/20">
                                <UserAvatarDisplay
                                  user={dossier.user && typeof dossier.user === 'object' ? dossier.user : null}
                                  alt=""
                                  fallback={
                                    <span className="text-[10px] font-bold text-primary leading-none">
                                      {strictPrivacyMode
                                        ? '••'
                                        : dossier.user && typeof dossier.user === 'object'
                                        ? `${dossier.user.firstName?.[0] || ''}${dossier.user.lastName?.[0] || ''}`.trim() || '👤'
                                        : `${dossier.clientPrenom?.[0] || ''}${dossier.clientNom?.[0] || ''}`.trim() || '👤'}
                                    </span>
                                  }
                                />
                              </div>
                              <p className="text-xs text-primary font-medium min-w-0 flex-1">
                                Client : {getDossierClientDisplayName(dossier)}
                              </p>
                            </button>
                            {/* Résumé compact des infos clés du dossier (plié) */}
                            {!expandedDossiers.has(dossier._id || dossier.id) && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                                {(() => {
                                  const dossierId = dossier._id || dossier.id;
                                  const totalDocuments = dossierDocuments[dossierId]?.length || dossier.documents?.length || 0;
                                  const tasks = dossierTasks[dossierId] || [];
                                  const draftsCount = dossierDrafts[dossierId]?.length ?? 0;
                                  const transmissions = (dossier.transmittedTo && dossier.transmittedTo.length) || 0;
                                  const transmittedPartners =
                                    Array.isArray(dossier.transmittedTo) && dossier.transmittedTo.length > 0
                                      ? dossier.transmittedTo.map((t: any) => {
                                          const partenaire = t.partenaire || t.user;
                                          const typeOrganisme = partenaire?.partenaireInfo?.typeOrganisme;
                                          const typeLabel =
                                            typeOrganisme === 'consulat'
                                              ? 'Consulat'
                                              : typeOrganisme === 'association'
                                              ? 'Association'
                                              : 'Avocat';

                                          const fullName = [partenaire?.firstName, partenaire?.lastName]
                                            .filter(Boolean)
                                            .join(' ')
                                            .trim() || partenaire?.email || '—';

                                          const nomOrganisme = partenaire?.partenaireInfo?.nomOrganisme || partenaire?.organisationName;

                                          return { typeLabel, fullName, nomOrganisme };
                                        })
                                      : [];
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
                                      <span>
                                        {transmissions > 0 ? (
                                          <>
                                            📤 Transmis à :{' '}
                                            <span className="font-semibold text-foreground">
                                              {transmittedPartners
                                                .slice(0, 2)
                                                .map((p: any, idx: number) => (
                                                  <span key={idx} className="inline-flex items-center gap-1">
                                                    {p.typeLabel} - {p.fullName}
                                                    {p.nomOrganisme ? ` (${p.nomOrganisme})` : ''}
                                                    {idx < Math.min(2, transmittedPartners.length) - 1 ? ', ' : null}
                                                  </span>
                                                ))}
                                              {transmissions > 2 ? ` +${transmissions - 2} autre(s)` : ''}
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            📤 Transmis à : <span className="font-semibold">Personne</span>
                                          </>
                                        )}
                                      </span>
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
                      {/* Bloc statut / priorité / partenaires transmis / action */}
                      <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0 w-full">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${getStatutColor(dossier.statut)}`}>
                            {getDossierStatutDisplayLabel(dossier)}
                          </span>
                          {dossier.priorite && (
                            <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${getPrioriteColor(dossier.priorite)}`}>
                              {dossier.priorite}
                            </span>
                          )}
                          {dossier.isStandby && (
                            <span
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-100 text-violet-900 border border-violet-200"
                              title={dossier.standbyReason ? String(dossier.standbyReason) : 'Dossier temporairement en attente de traitement'}
                            >
                              ⏸ Stand-by
                            </span>
                          )}
                          {dossier.fraisExoneres ? (
                            <span
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200"
                              title={dossier.fraisExoneresMotif ? String(dossier.fraisExoneresMotif) : 'Aucune formule requise — frais exonérés'}
                            >
                              Frais exonérés
                            </span>
                          ) : Number(dossier.montantTarificationFixe || 0) > 0 ? (
                            <span
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-100 text-blue-900 border border-blue-200"
                              title="Montant fixé manuellement par superadmin. Le client n'a pas à choisir Standard/Premium."
                            >
                              Montant fixe : {Number(dossier.montantTarificationFixe).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                            </span>
                          ) : dossier.formuleTarifaire ? (
                            <span
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                                dossier.formuleTarifaire === 'premium'
                                  ? 'bg-orange-100 text-orange-900 border border-orange-200'
                                  : 'bg-slate-100 text-slate-800 border border-slate-200'
                              }`}
                              title={
                                dossier.formuleTarifaireChoisieAt
                                  ? `Choix enregistré le ${new Date(dossier.formuleTarifaireChoisieAt).toLocaleString('fr-FR')}`
                                  : undefined
                              }
                            >
                              Formule : {dossier.formuleTarifaire === 'premium' ? 'Premium' : 'Standard'}
                            </span>
                          ) : dossier.tarificationNotificationSentAt ? (
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200">
                              Tarif : non choisi
                            </span>
                          ) : null}
                          {Array.isArray(dossier.transmittedTo) && dossier.transmittedTo.length > 0 && (
                            (() => {
                              const transmittedPartners = dossier.transmittedTo.map((t: any) => {
                                const partenaire = t.partenaire || t.user;
                                const typeOrganisme = partenaire?.partenaireInfo?.typeOrganisme;
                                const typeLabel =
                                  typeOrganisme === 'consulat'
                                    ? 'Consulat'
                                    : typeOrganisme === 'association'
                                    ? 'Association'
                                    : 'Avocat';

                                const fullName = [partenaire?.firstName, partenaire?.lastName]
                                  .filter(Boolean)
                                  .join(' ')
                                  .trim() || partenaire?.email || '—';

                                const nomOrganisme = partenaire?.partenaireInfo?.nomOrganisme || partenaire?.organisationName;

                                return { typeLabel, fullName, nomOrganisme };
                              });

                              return (
                                <>
                                  {transmittedPartners.slice(0, 2).map((p: any, idx: number) => (
                                    <span
                                      key={`${p.typeLabel}-${p.fullName}-${idx}`}
                                      className="px-2 py-1 rounded-md text-[11px] font-semibold bg-indigo-50 border border-indigo-200 text-indigo-800"
                                      title={`${p.typeLabel} - ${p.fullName}${p.nomOrganisme ? ` (${p.nomOrganisme})` : ''}`}
                                    >
                                      {p.typeLabel}: {p.fullName}
                                    </span>
                                  ))}
                                  {transmittedPartners.length > 2 && (
                                    <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-indigo-50 border border-indigo-200 text-indigo-800">
                                      +{transmittedPartners.length - 2} autres
                                    </span>
                                  )}
                                </>
                              );
                            })()
                          )}
                        </div>
                        <Link
                          href={`/admin/dossiers/${dossier._id || dossier.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center px-3 py-2 h-9 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                        >
                          Voir les détails
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => handleToggleStandby(dossier, e)}
                          className={`inline-flex items-center justify-center px-3 py-2 h-9 rounded-md text-xs font-semibold transition-colors border ${
                            dossier.isStandby
                              ? 'bg-violet-100 border-violet-300 text-violet-900 hover:bg-violet-200'
                              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                          title={dossier.isStandby ? 'Retirer ce dossier du stand-by' : 'Mettre ce dossier en stand-by'}
                        >
                          {dossier.isStandby ? '▶ Reprendre' : '⏸ Stand-by'}
                        </button>
                        {isSuperadmin && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => openTarifModal(dossier, e)}
                              className="inline-flex items-center justify-center px-3 py-2 h-9 rounded-md text-xs font-semibold transition-colors border bg-white border-blue-300 text-blue-700 hover:bg-blue-50"
                              title="Montant fixe, notification client (tarification / exonération) et message in-app."
                            >
                              Tarif
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Contenu détaillé (affiché uniquement si le dossier est déplié) */}
                    {expandedDossiers.has(dossier._id || dossier.id) && (
                      <>
                    {/* Client — informations affichées dans la vue simplifiée (sans redirection vers Utilisateurs) */}
                    <div className="mb-4 pb-4 border-b border-gray-200 rounded-md">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Client</p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-100 border border-gray-200">
                          {!dossier.user ? (
                            <span className="text-sm font-semibold text-gray-600">
                              {`${dossier.clientPrenom?.[0] || ''}${dossier.clientNom?.[0] || ''}`.trim() || '👤'}
                            </span>
                          ) : (
                            <UserAvatarDisplay
                              user={dossier.user}
                              alt={`${dossier.user.firstName || ''} ${dossier.user.lastName || ''}`.trim() || 'Photo client'}
                              fallback={
                                <span className="text-sm font-semibold text-gray-600">
                                  {`${dossier.user.firstName?.[0] || ''}${dossier.user.lastName?.[0] || ''}`.trim() || '👤'}
                                </span>
                              }
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {dossier.user ? (
                            <>
                              <p className="font-semibold text-sm text-foreground truncate">
                                {strictPrivacyMode ? 'Titulaire masqué' : `${dossier.user.firstName} ${dossier.user.lastName}`}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{maskStrict(dossier.user.email || '', '—')}</p>
                            </>
                          ) : (
                            <>
                              <p className="font-semibold text-sm text-foreground truncate">
                                {strictPrivacyMode ? 'Titulaire masqué' : `${dossier.clientPrenom} ${dossier.clientNom}`}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{maskStrict(dossier.clientEmail || '', '—')}</p>
                              <span className="text-xs text-amber-600">(Non inscrit)</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Avancement : uniquement les étapes définies dans « Éditer les étapes » (pas Accepté / Refusé / Archivé) */}
                    {(() => {
                      const editedEtapes = getEditedEtapesOnly(dossier?.etapesSupplementaires);
                      const progress = getDossierProgressFromEditedEtapes(dossier.statut, editedEtapes);
                      const currentEtapeIdx = editedEtapes.findIndex((step) =>
                        customEtapeMatchesStatut(step, dossier.statut || '')
                      );
                      return (
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground font-medium">Avancement (étapes éditées)</span>
                            <span className="font-semibold text-foreground">{progress} %</span>
                          </div>
                          {editedEtapes.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground leading-snug">
                              Aucune étape personnalisée. Définissez-les dans la fiche dossier via{' '}
                              <span className="font-medium text-foreground">Éditer les étapes</span> pour suivre la progression ici.
                            </p>
                          ) : (
                            <>
                              {/* Mobile : défilement horizontal pour éviter le chevauchement des titres d’étapes ; sm+ : barre partagée comme avant */}
                              <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] pb-0.5 -mx-0.5 px-0.5 sm:overflow-visible sm:mx-0 sm:px-0">
                                <div className="w-max min-w-full sm:w-full sm:min-w-0 space-y-1.5">
                                  <div className="flex h-2 rounded-full overflow-hidden ring-1 ring-gray-200 bg-gray-100">
                                    {editedEtapes.map((step, index) => {
                                      const isCurrent = currentEtapeIdx >= 0 && index === currentEtapeIdx;
                                      const isCompleted = currentEtapeIdx >= 0 && index < currentEtapeIdx;
                                      const fillClass = isCompleted
                                        ? 'bg-green-500'
                                        : isCurrent
                                          ? 'bg-blue-500'
                                          : 'bg-gray-300';
                                      return (
                                        <div
                                          key={step.id + String(index)}
                                          className="h-2 w-[4.75rem] flex-shrink-0 border-r border-white/60 last:border-r-0 sm:w-auto sm:flex-1 sm:min-w-0"
                                          title={step.label}
                                        >
                                          <div className={`h-full w-full ${fillClass}`} />
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className="flex items-start gap-0 sm:gap-0.5 sm:justify-between">
                                    {editedEtapes.map((step, index) => {
                                      const isCurrent = currentEtapeIdx >= 0 && index === currentEtapeIdx;
                                      const isCompleted = currentEtapeIdx >= 0 && index < currentEtapeIdx;
                                      return (
                                        <div
                                          key={`lbl-${step.id}-${index}`}
                                          className="w-[4.75rem] flex-shrink-0 flex flex-col items-center px-1 box-border sm:w-auto sm:flex-1 sm:min-w-0"
                                        >
                                          <span
                                            className={`text-[9px] text-center leading-tight line-clamp-3 break-words w-full ${
                                              isCurrent
                                                ? 'text-blue-700 font-semibold'
                                                : isCompleted
                                                  ? 'text-green-700 font-medium'
                                                  : 'text-gray-400'
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
                              </div>
                            </>
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

                    {/* Documents en préparation — brouillons collaboratifs + brouillons cabinet (éditeur riche, export .docx) */}
                    {(dossierDrafts[dossier._id || dossier.id]?.length || 0) > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Documents en préparation
                        </p>
                        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                          {(dossierDrafts[dossier._id || dossier.id] || []).map((d: any) => {
                            const isWord = d.prepKind === 'word';
                            const dossierIdStr = String(dossier._id || dossier.id);
                            const href = isWord
                              ? `/admin/documents/preparation/${d._id}`
                              : `/admin/dossiers/${dossierIdStr}/documents-en-preparation?draft=${encodeURIComponent(d._id)}`;
                            const dueLabel =
                              d.dueDate &&
                              new Date(d.dueDate).toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              });
                            const prepCompleted = !!d.completedAt;
                            const dueD = d.dueDate ? new Date(d.dueDate) : null;
                            let prepOverdue = false;
                            if (dueD && !Number.isNaN(dueD.getTime()) && !prepCompleted) {
                              const t0 = new Date();
                              t0.setHours(0, 0, 0, 0);
                              dueD.setHours(0, 0, 0, 0);
                              prepOverdue = dueD < t0;
                            }
                            return (
                              <Link
                                key={`${isWord ? 'w' : 'c'}-${d._id}`}
                                href={href}
                                onClick={(e) => e.stopPropagation()}
                                className="block rounded border border-gray-100 bg-white px-3 py-2 hover:border-orange-200 hover:bg-orange-50/30 transition-colors"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-orange-50 text-orange-800 border border-orange-200">
                                    Éditeur riche
                                  </span>
                                  {isWord ? (
                                    <span className="text-[10px] text-muted-foreground">· export .docx</span>
                                  ) : null}
                                  {prepCompleted ? (
                                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      Terminé
                                    </span>
                                  ) : null}
                                  {prepOverdue ? (
                                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-800 border border-red-200">
                                      Échéance dépassée
                                    </span>
                                  ) : null}
                                  <p className="font-medium text-sm text-foreground flex-1 min-w-0 truncate">
                                    {d.title || 'Sans titre'}
                                  </p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Créé par :{' '}
                                  {d.createdBy
                                    ? `${d.createdBy.firstName || ''} ${d.createdBy.lastName || ''}`.trim() ||
                                      d.createdBy.role ||
                                      '—'
                                    : '—'}
                                  {dueLabel ? (
                                    <>
                                      {' '}
                                      · Échéance : <span className="font-medium text-foreground">{dueLabel}</span>
                                    </>
                                  ) : null}
                                </p>
                                {!isWord && d.partnerAccess?.length > 0 && (
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
                              </Link>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                          <Link
                            href={`/admin/dossiers/${dossier._id || dossier.id}/documents-en-preparation`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-primary font-medium hover:underline"
                          >
                            Éditeur riche (page dossier) →
                          </Link>
                          <Link
                            href="/admin/documents/preparation"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-primary font-medium hover:underline"
                          >
                            Tous les documents en préparation →
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* Informations du dossier — version compacte */}
                    <div className="mb-3 pb-3 border-b border-gray-200">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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

                    {/* Section Documents demandés + pièces envoyées spontanément par le client (sans demande préalable) */}
                    {(() => {
                      const dossierId = dossier._id || dossier.id;
                      const dossierRequests = documentRequests[dossierId] || [];
                      const dossierDocsList = dossierDocuments[dossierId] || [];
                      const linkedDocIds = new Set(
                        dossierRequests
                          .filter((r: any) => r.document)
                          .map((r: any) => String(r.document._id || r.document))
                      );
                      const spontaneousDocs = dossierDocsList.filter(
                        (doc: any) => !linkedDocIds.has(String(doc._id || doc.id))
                      );
                      const pendingRequests = dossierRequests.filter((r: any) => r.status === 'pending');
                      const receivedRequests = dossierRequests.filter((r: any) => r.status === 'received' || r.status === 'sent');
                      const isExpanded = expandedDocumentSections.has(dossierId);
                      const receivedPiecesCount = receivedRequests.length + spontaneousDocs.length;
                      const importantInfoCount = Array.isArray(dossier?.complementsRecit) ? dossier.complementsRecit.length : 0;

                      const toggleDirectUpload = (e?: { stopPropagation?: () => void }) => {
                        e?.stopPropagation?.();
                        setDirectUploadError(null);
                        if (activeDirectUploadDossierId === dossierId) {
                          setActiveDirectUploadDossierId(null);
                        } else {
                          setActiveDirectUploadDossierId(dossierId);
                        }
                      };

                      return (
                        <div className="pt-3 border-t border-gray-200 mb-3">
                          <div 
                            className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-md p-2 -m-2 transition-colors"
                            onClick={() => {
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
                                  {pendingRequests.length > 0 && receivedPiecesCount > 0 && ' • '}
                                  {receivedPiecesCount > 0 && (
                                    <span className="text-green-600 font-medium">
                                      {receivedPiecesCount} reçu{receivedPiecesCount > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                title="Ajouter un document"
                                aria-label="Ajouter un document"
                                className="h-7 w-7 p-0 text-sm leading-none shadow-none shrink-0"
                                onClick={toggleDirectUpload}
                              >
                                +
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                title="Ajouter une info importante"
                                aria-label="Ajouter une info importante"
                                className="relative h-7 w-7 p-0 text-sm leading-none shadow-none shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openQuickComplementEditor(dossier);
                                }}
                              >
                                ℹ️
                                {importantInfoCount > 0 && (
                                  <span
                                    className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] leading-4 text-white text-center font-bold ring-2 ring-white ${
                                      hasUnseenComplement(dossier) ? 'bg-red-500' : 'bg-blue-500'
                                    }`}
                                    title={`${importantInfoCount} information(s) importante(s)`}
                                  >
                                    {importantInfoCount > 99 ? '99+' : importantInfoCount}
                                  </span>
                                )}
                              </Button>
                              <span className="text-muted-foreground text-sm">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </div>

                          {activeDirectUploadDossierId === dossierId && (
                            <form
                              onSubmit={(e) => handleDirectUploadFromList(e, dossierId)}
                              className="mt-3 p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {directUploadError && <p className="text-xs text-red-600">{directUploadError}</p>}
                              <div>
                                <label className="text-[11px] md:text-sm font-medium">Fichier *</label>
                                <input
                                  ref={directFileInputRef}
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                                  className="mt-1 w-full text-xs md:text-sm"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file && !directUploadData.nom.trim()) {
                                      setDirectUploadData((prev) => ({ ...prev, nom: file.name }));
                                    }
                                  }}
                                  required
                                />
                              </div>
                              <div>
                                <label className="text-[11px] md:text-sm font-medium">Nom du document *</label>
                                <input
                                  type="text"
                                  value={directUploadData.nom}
                                  onChange={(e) => setDirectUploadData((prev) => ({ ...prev, nom: e.target.value }))}
                                  className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs md:text-sm"
                                  required
                                />
                              </div>
                              <div>
                                <label className="text-[11px] md:text-sm font-medium">Catégorie</label>
                                <select
                                  value={directUploadData.categorie}
                                  onChange={(e) => setDirectUploadData((prev) => ({ ...prev, categorie: e.target.value }))}
                                  className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs md:text-sm"
                                >
                                  <option value="identite">Identité</option>
                                  <option value="titre_sejour">Titre de séjour</option>
                                  <option value="contrat">Contrat</option>
                                  <option value="facture">Facture</option>
                                  <option value="autre">Autre</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[11px] md:text-sm font-medium">Description</label>
                                <textarea
                                  value={directUploadData.description}
                                  onChange={(e) => setDirectUploadData((prev) => ({ ...prev, description: e.target.value }))}
                                  className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs md:text-sm min-h-[56px]"
                                />
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-7 md:h-8 px-2 md:px-3 text-[10px] md:text-xs"
                                  onClick={() => {
                                    setActiveDirectUploadDossierId(null);
                                    setDirectUploadError(null);
                                  }}
                                  disabled={directUploading}
                                >
                                  Annuler
                                </Button>
                                <Button
                                  type="submit"
                                  className="h-7 md:h-8 px-2 md:px-3 text-[10px] md:text-xs"
                                  disabled={directUploading}
                                >
                                  {directUploading ? 'Envoi...' : 'Envoyer'}
                                </Button>
                              </div>
                            </form>
                          )}

                          {activeQuickComplementDossierId === dossierId && (
                            <form
                              onSubmit={(e) => saveQuickComplement(e, dossierId)}
                              className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50/60 space-y-2.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <label className="text-[11px] md:text-sm font-medium">Complément d&apos;information</label>
                              <textarea
                                ref={quickComplementTextareaRef}
                                value={quickComplementText}
                                onChange={(e) => setQuickComplementText(e.target.value)}
                                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs md:text-sm min-h-[72px]"
                                placeholder="Ajouter un complément utile au dossier..."
                              />
                              {quickComplementError && <p className="text-xs text-red-600">{quickComplementError}</p>}
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-7 md:h-8 px-2 md:px-3 text-[10px] md:text-xs"
                                  onClick={() => {
                                    setActiveQuickComplementDossierId(null);
                                    setQuickComplementId(null);
                                    setQuickComplementText('');
                                    setQuickComplementError(null);
                                  }}
                                  disabled={quickComplementSaving}
                                >
                                  Annuler
                                </Button>
                                <Button
                                  type="submit"
                                  className="h-7 md:h-8 px-2 md:px-3 text-[10px] md:text-xs"
                                  disabled={quickComplementSaving}
                                >
                                  {quickComplementSaving ? 'Enregistrement...' : 'Enregistrer'}
                                </Button>
                              </div>
                            </form>
                          )}
                          
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
                                          <div className="flex flex-wrap items-center gap-2 mt-3 ml-7">
                                            <button
                                              type="button"
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
                                              type="button"
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
                                            <button
                                              type="button"
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                const docId = String(request.document._id || request.document.id || request.document);
                                                await handleDeleteDocument(docId);
                                              }}
                                              disabled={
                                                deletingDocumentId === String(request.document._id || request.document.id || request.document)
                                              }
                                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                              🗑️ Supprimer
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {spontaneousDocs.map((doc: any) => (
                                <div
                                  key={`spontaneous-${doc._id || doc.id}`}
                                  className="border rounded-lg p-3 bg-green-50/50 border-green-200"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className="text-lg flex-shrink-0">✅</span>
                                        <div className="flex-1 min-w-0">
                                          <h5 className="font-semibold text-sm truncate text-foreground">
                                            {doc.nom || 'Document'}
                                          </h5>
                                        </div>
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold flex-shrink-0">
                                          Sans demande préalable
                                        </span>
                                        <span className="px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0 bg-green-100 text-green-800">
                                          Reçu
                                        </span>
                                      </div>
                                      {doc.description && (
                                        <p className="text-xs text-muted-foreground mb-2 ml-7 line-clamp-2">
                                          {doc.description}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground ml-7">
                                        <span>
                                          📅 Envoyé le{' '}
                                          {new Date(doc.createdAt || doc.updatedAt).toLocaleDateString('fr-FR')}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 mt-3 ml-7">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedDocumentForPreview(doc);
                                            setShowDocumentPreviewModal(true);
                                          }}
                                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-medium transition-colors"
                                        >
                                          👁️ Voir
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async (e) => {
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
                                          className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded text-xs font-medium transition-colors"
                                        >
                                          ⬇️ Télécharger
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const docId = String(doc._id || doc.id);
                                            await handleDeleteDocument(docId);
                                          }}
                                          disabled={deletingDocumentId === String(doc._id || doc.id)}
                                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                          🗑️ Supprimer
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
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
                                                      {doc.typeMime && (
                                                        <p className="text-[10px] text-gray-400 mt-1">{doc.typeMime}</p>
                                                      )}
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
                          {/* Le badge partenaire est déjà résumé via les badges "Transmis à" en vue simplifiée */}
                          <select
                            value={normalizeStatutForAdminSelect(dossier.statut)}
                            onChange={(e) => handleChangeStatut(dossier._id || dossier.id, e.target.value)}
                            className="text-xs px-2 py-1.5 rounded-md border border-gray-300 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors w-full"
                            disabled={isLoading}
                            title="Étape actuelle du dossier (y compris Accepté, Refusé, Archivé). La barre « étapes éditées » utilise uniquement les étapes définies dans la fiche dossier."
                          >
                            {(() => {
                              const effectiveEtapes = getEffectiveEtapes(dossier);
                              const currentStatut = dossier.statut || '';
                              const hasCurrentOption =
                                !!currentStatut &&
                                effectiveEtapes.some((s: any) => adminSelectStatutMatchesEtape(currentStatut, s));

                              return (
                                <>
                                  {/* Si le statut actuel n'est pas dans les étapes (ex: "Reçu"), afficher une option dédiée */}
                                  {currentStatut && !hasCurrentOption && (
                                    <option value={currentStatut}>{getStatutLabel(currentStatut)}</option>
                                  )}

                                  {!currentStatut && <option value="">Sélectionner une étape</option>}

                                  {effectiveEtapes.map((etape: any, idx: number) => {
                                    const value = String(etape.id ?? etape.label ?? idx);
                                    return (
                                      <option key={value} value={value}>
                                        {etape.label || etape.id || `Étape ${idx + 1}`}
                                      </option>
                                    );
                                  })}
                                </>
                              );
                            })()}
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

      {clientPopover && (() => {
        const dossier = dossiers.find((d: any) => String(d._id || d.id) === clientPopover.dossierId);
        if (!dossier) return null;

        const isRegisteredUser = dossier.user && typeof dossier.user === 'object';
        const completion = getProfileCompletionInfo(dossier);
        const userId = dossier?.user?._id || dossier?.user?.id;
        const dossierId = dossier._id || dossier.id;
        const fullName = isRegisteredUser
          ? [dossier.user.firstName, dossier.user.lastName].filter(Boolean).join(' ').trim()
          : [dossier.clientPrenom, dossier.clientNom].filter(Boolean).join(' ').trim();
        const email = isRegisteredUser ? dossier.user.email : dossier.clientEmail;
        const phone = isRegisteredUser ? (dossier.user.phone || dossier.user.telephone) : dossier.clientTelephone;
        const role = isRegisteredUser ? dossier.user.role : 'prospect';
        const createdAt = isRegisteredUser ? dossier.user.createdAt : dossier.createdAt;
        const dateNaissance = isRegisteredUser ? dossier.user.dateNaissance : null;
        const nationalite = isRegisteredUser ? dossier.user.nationalite : null;
        const adressePostale = isRegisteredUser ? dossier.user.adressePostale : null;
        const ville = isRegisteredUser ? dossier.user.ville : null;
        const codePostal = isRegisteredUser ? dossier.user.codePostal : null;
        const pays = isRegisteredUser ? dossier.user.pays : null;
        const isActive = isRegisteredUser ? dossier.user.isActive !== false : true;
        const displayedComplete = completion.profileCompleteFlag || completion.computedComplete;

        return (
          <div
            ref={clientPopoverRef}
            className="fixed z-[70] w-[420px] max-w-[calc(100vw-24px)] rounded-xl border border-blue-200 bg-white shadow-2xl"
            style={{ left: clientPopover.x, top: clientPopover.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/70 rounded-t-xl">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-blue-900">Profil utilisateur</p>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                    displayedComplete
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {displayedComplete ? 'Profil complet' : 'Profil incomplet'}
                </span>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-sm"><span className="font-medium text-muted-foreground">Nom :</span> <span className="text-foreground">{fullName || 'Non renseigné'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Email :</span> <span className="text-foreground break-all">{email || 'Non renseigné'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Téléphone :</span> <span className="text-foreground">{phone || 'Non renseigné'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Type :</span> <span className="text-foreground">{isRegisteredUser ? 'Compte inscrit' : 'Client non inscrit'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Rôle :</span> <span className="text-foreground">{role || '—'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Compte :</span> <span className="text-foreground">{isActive ? 'Actif' : 'Inactif'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Créé le :</span> <span className="text-foreground">{createdAt ? new Date(createdAt).toLocaleDateString('fr-FR') : '—'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Date de naissance :</span> <span className="text-foreground">{dateNaissance ? new Date(dateNaissance).toLocaleDateString('fr-FR') : 'Non renseigné'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Nationalité :</span> <span className="text-foreground">{nationalite || 'Non renseigné'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Adresse :</span> <span className="text-foreground">{adressePostale || 'Non renseignée'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Ville / CP / Pays :</span> <span className="text-foreground">{[ville, codePostal, pays].filter(Boolean).join(' - ') || 'Non renseigné'}</span></p>
              <p className="text-sm"><span className="font-medium text-muted-foreground">Statut saisi :</span> <span className="text-foreground">{completion.profileCompleteFlag ? 'Profil complet coché' : 'Profil complet non coché'}</span></p>
              {completion.missingFields.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-900">Champs manquants</p>
                  <p className="text-xs text-amber-800">{completion.missingFields.join(', ')}</p>
                </div>
              )}
            </div>
            <div className="px-4 pb-2 flex flex-wrap items-center gap-2">
              {userId && (
                <Link href={`/admin/utilisateurs?userId=${userId}`} onClick={() => setClientPopover(null)}>
                  <Button type="button" variant="outline" size="sm" className="text-xs">Voir fiche utilisateur</Button>
                </Link>
              )}
              <Link href={`/admin/messages?dossierId=${dossierId}&action=send`} onClick={() => setClientPopover(null)}>
                <Button type="button" variant="outline" size="sm" className="text-xs">Envoyer message</Button>
              </Link>
              <Link href={`/admin/notifications?dossierId=${dossierId}&filter=all`} onClick={() => setClientPopover(null)}>
                <Button type="button" variant="outline" size="sm" className="text-xs">Voir notifications</Button>
              </Link>
              <Link href={`/admin/dossiers/${dossierId}`} onClick={() => setClientPopover(null)}>
                <Button type="button" variant="outline" size="sm" className="text-xs">Ouvrir dossier complet</Button>
              </Link>
            </div>
            {isRegisteredUser && userId && (
              <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickUserUpdateFromPopover(
                      dossier,
                      { profilComplete: !completion.profileCompleteFlag },
                      !completion.profileCompleteFlag ? 'Profil marqué complet' : 'Profil marqué incomplet'
                    );
                  }}
                >
                  {completion.profileCompleteFlag ? 'Marquer incomplet' : 'Marquer complet'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickUserUpdateFromPopover(
                      dossier,
                      { isActive: !isActive },
                      !isActive ? 'Compte activé' : 'Compte désactivé'
                    );
                  }}
                >
                  {isActive ? 'Désactiver compte' : 'Activer compte'}
                </Button>
              </div>
            )}
            <div className="px-4 pb-3 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setClientPopover(null);
                }}
              >
                Fermer
              </Button>
            </div>
          </div>
        );
      })()}

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

      {/* Modal superadmin : tarification (montant séparé de la notification) */}
      {showTarifModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Tarification — {showTarifModal.titre || showTarifModal.numero || 'Dossier'}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                L&apos;enregistrement du montant et l&apos;envoi de la notification au client sont deux actions distinctes.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">1. Montant fixe (sans notification)</p>
              <Label htmlFor="tarif-montant" className="text-sm">
                Montant en EUR (0 pour retirer le montant fixe)
              </Label>
              <Input
                id="tarif-montant"
                value={tarifMontantInput}
                onChange={(e) => setTarifMontantInput(e.target.value)}
                placeholder="Ex. 1500 ou 0"
                className="w-full"
              />
              <Button type="button" variant="outline" onClick={() => void handleTarifSaveMontantOnly()} disabled={tarifSavingMontant}>
                {tarifSavingMontant ? 'Enregistrement…' : 'Enregistrer le montant uniquement'}
              </Button>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">2. Notifier le client (in-app)</p>
              <p className="text-xs text-blue-900/90">
                Le message envoyé dépend de l&apos;état du dossier après enregistrement : choix de formule sur le site, montant fixe déjà enregistré, ou frais exonérés si vous cochez l&apos;exonération ci-dessous.
              </p>
              {tarifMontantDirty() ? (
                <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  Le montant saisi diffère de celui en base : la notification utilisera le montant <strong>déjà enregistré</strong> tant que vous n&apos;avez pas cliqué sur « Enregistrer le montant uniquement ».
                </p>
              ) : null}
              <div>
                <Label htmlFor="tarif-notify-msg" className="text-sm mb-1 block">
                  Message complémentaire pour le client (optionnel)
                </Label>
                <Textarea
                  id="tarif-notify-msg"
                  value={tarifNotifyMessage}
                  onChange={(e) => setTarifNotifyMessage(e.target.value)}
                  placeholder="Consignes de paiement, délais, modalités… (affiché dans la notification in-app)"
                  rows={4}
                  className="w-full text-sm"
                  maxLength={2000}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Ajouté sous le texte automatique de la notification (max. 2000 caractères).</p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={tarifExonerer}
                  onChange={(e) => setTarifExonerer(e.target.checked)}
                  disabled={
                    Number(showTarifModal.montantTarificationFixe || 0) > 0 ||
                    (parseTarifMontantInput(tarifMontantInput) ?? 0) > 0
                  }
                />
                <span className="text-sm">
                  <span className="font-semibold text-gray-900 block">Exonérer les frais de tarification</span>
                  <span className="text-muted-foreground text-xs">
                    Appliquée à l&apos;envoi de la notification. Incompatible avec un montant fixe {'>'} 0 (en base ou saisi).
                  </span>
                </span>
              </label>
              {tarifExonerer && (
                <div>
                  <Label htmlFor="tarif-exo-motif" className="text-sm mb-1 block">
                    Motif d&apos;exonération (optionnel)
                  </Label>
                  <Textarea
                    id="tarif-exo-motif"
                    value={tarifExoMotif}
                    onChange={(e) => setTarifExoMotif(e.target.value)}
                    rows={2}
                    className="w-full text-sm"
                    maxLength={500}
                  />
                </div>
              )}
              <Button type="button" onClick={() => void handleTarifSendNotification()} disabled={tarifSendingNotify} className="w-full sm:w-auto">
                {tarifSendingNotify ? 'Envoi…' : 'Envoyer la notification tarification'}
              </Button>
            </div>

            <div className="flex justify-end pt-1">
              <Button type="button" variant="outline" onClick={closeTarifModal} disabled={tarifSavingMontant || tarifSendingNotify}>
                Fermer
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
            {showStatutModal.newStatut === 'en_cours' && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/80 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    checked={exonererFraisTarification}
                    onChange={(e) => setExonererFraisTarification(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold text-emerald-900 block">Exonérer les frais de tarification</span>
                    <span className="text-sm text-emerald-800/90">
                      Le client recevra une notification (et un SMS si configuré) l’informant de l’exonération. Il ne sera pas invité à choisir une formule.
                    </span>
                  </span>
                </label>
                {exonererFraisTarification && (
                  <div className="mt-3 pl-7">
                    <Label htmlFor="fraisExoneresMotif" className="mb-1 block text-sm text-emerald-900">
                      Motif (optionnel, repris dans la notification client)
                    </Label>
                    <Textarea
                      id="fraisExoneresMotif"
                      value={fraisExoneresMotifInput}
                      onChange={(e) => setFraisExoneresMotifInput(e.target.value)}
                      placeholder="Ex. gracieuseté, dossier pro bono, accord particulier…"
                      rows={2}
                      className="w-full text-sm"
                      maxLength={500}
                    />
                  </div>
                )}
              </div>
            )}
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
                setExonererFraisTarification(false);
                setFraisExoneresMotifInput('');
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
                // Créer une demande pour chaque type de document sélectionné.
                // Important: on exécute séquentiellement pour éviter un throttling SMS/Twilio
                // quand plusieurs appels API sont lancés en même temps.
                let successCount = 0;
                let failedCount = 0;
                for (let index = 0; index < documentRequestData.selectedDocumentTypes.length; index += 1) {
                  const docType = documentRequestData.selectedDocumentTypes[index];
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
                  
                  try {
                    const resp = await documentRequestsAPI.createRequest({
                      dossierId: showDocumentRequestModal._id || showDocumentRequestModal.id,
                      documentType: baseType,
                      documentTypeLabel: documentTypeLabel,
                      message: documentRequestData.message,
                      isUrgent: documentRequestData.isUrgent,
                      // Une demande multiple = un seul SMS, avec le nombre total de pièces demandées.
                      skipSms: index > 0,
                      batchDocumentCount:
                        index === 0 ? documentRequestData.selectedDocumentTypes.length : undefined
                    });
                    if (resp?.data?.success) {
                      successCount += 1;
                    } else {
                      failedCount += 1;
                    }
                  } catch (err) {
                    failedCount += 1;
                    console.error('❌ Erreur création demande docType:', docType, err);
                  }
                }

                console.log('✅ Résultat créations demandes documents:', {
                  successCount,
                  failedCount
                });

                if (failedCount === 0 && successCount > 0) {
                  // Afficher un message de succès temporaire
                  setError(null);
                  const totalCount = documentRequestData.selectedDocumentTypes.length;
                  alert(`✅ ${totalCount} demande(s) de document(s) créée(s) avec succès ! Le client a été notifié.`);
                  
                  setShowDocumentRequestModal(null);
                  setDocumentRequestData({
                    selectedDocumentTypes: [],
                    message: '',
                    isUrgent: false
                  });
                  // Recharger les dossiers pour afficher les nouvelles demandes
                  await loadDossiers();
                } else {
                  const totalCount = documentRequestData.selectedDocumentTypes.length;
                  setError(`${failedCount} demande(s) sur ${totalCount} n'a(ont) pas pu être créée(s). Veuillez réessayer.`);
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
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

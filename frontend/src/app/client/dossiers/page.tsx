'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { dossiersAPI, notificationsAPI, documentRequestsAPI, documentsAPI } from '@/lib/api';
import { DocumentRequestNotificationModal } from '@/components/DocumentRequestNotificationModal';
import { DocumentPreview } from '@/components/DocumentPreview';
import { Toast } from '@/components/Toast';
import { QuickComplementTabsForm } from '@/components/dossiers/QuickComplementTabsForm';
import { Eye, Download } from 'lucide-react';
import { getStatutColor, getStatutLabel, getPrioriteColor, getDossierProgress, calculateDaysSince, calculateDaysUntil, isDeadlineApproaching, formatRelativeTime, getNextAction, getTimelineStepsWithCustom, getEditedEtapesOnly, customEtapeMatchesStatut, getDossierProgressFromEditedEtapes } from '@/lib/dossierUtils';

// Mapping des catégories pour l'affichage
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
    ]
  },
  asile: {
    label: 'Asile',
    types: [
      { value: 'demande_asile', label: 'Demande d\'asile' },
      { value: 'recours_cnda', label: 'Recours CNDA' },
    ]
  },
  regroupement_familial: {
    label: 'Regroupement familial',
    types: [
      { value: 'preparation_dossier_regroupement', label: 'Préparation du dossier de regroupement familial' },
    ]
  },
  nationalite_francaise: {
    label: 'Nationalité française',
    types: [
      { value: 'acquisition_nationalite', label: 'Acquisition de la nationalité française' },
    ]
  },
  eloignement_urgence: {
    label: 'Éloignement et urgence',
    types: [
      { value: 'contestation_oqtf', label: 'Contestation d\'une OQTF' },
    ]
  },
  constitution_societe: {
    label: 'Constitution de société',
    types: [
      { value: 'constitution_societe_senegal', label: 'Constitution — entreprise / société au Sénégal' },
      { value: 'constitution_societe_france', label: 'Constitution — entreprise / société en France' },
    ]
  },
  autre: {
    label: 'Autre',
    types: [
      { value: 'autre', label: 'Autre demande' },
    ]
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

function Button({ children, variant = 'default', size = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  const sizeClasses = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>{children}</button>;
}

export default function DossiersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentRequests, setDocumentRequests] = useState<Record<string, any[]>>({});
  const [selectedDocumentRequest, setSelectedDocumentRequest] = useState<any>(null);
  const [showDocumentRequestModal, setShowDocumentRequestModal] = useState(false);
  const [expandedDocumentSections, setExpandedDocumentSections] = useState<Set<string>>(new Set());
  const [expandedDocumentDropdowns, setExpandedDocumentDropdowns] = useState<Set<string>>(new Set());
  const [dossierDocuments, setDossierDocuments] = useState<Record<string, any[]>>({});
  const [selectedDocumentForPreview, setSelectedDocumentForPreview] = useState<any>(null);
  const [expandedDossiers, setExpandedDossiers] = useState<Set<string>>(() => new Set());
  const [activeDirectUploadDossierId, setActiveDirectUploadDossierId] = useState<string | null>(null);
  const [directUploadData, setDirectUploadData] = useState({
    nom: '',
    description: '',
    categorie: 'autre'
  });
  const [directUploadError, setDirectUploadError] = useState<string | null>(null);
  const [directUploading, setDirectUploading] = useState(false);
  const [activeQuickComplementDossierId, setActiveQuickComplementDossierId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const directFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Vérifier si l'utilisateur a un token même sans session
    const token = localStorage.getItem('token');
    
    if (status === 'loading') {
      return; // Attendre que NextAuth termine le chargement
    }

    // Si pas de session et pas de token, rediriger vers la connexion
    if (status === 'unauthenticated' && !token) {
      router.push('/auth/signin');
      return;
    }

    // Si on a une session, charger les dossiers
    if (status === 'authenticated' && session) {
      // S'assurer que le token est stocké dans localStorage
      if ((session.user as any)?.accessToken && typeof window !== 'undefined') {
        const token = (session.user as any).accessToken;
        if (!localStorage.getItem('token')) {
          localStorage.setItem('token', token);
          console.log('🔑 Token stocké dans localStorage depuis la session');
        }
      }
      loadDossiers();
      loadNotifications();
      loadDocumentRequests();
    } else if (token) {
      // Si on a un token mais pas de session, charger quand même les dossiers
      loadDossiers();
      loadNotifications();
      loadDocumentRequests();
    }
  }, [session, status, router]);

  // (Rafraîchissement automatique supprimé pour éviter les sursauts de page)

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
    
    // Trier par date de création (plus récente en premier)
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

  const loadDocumentRequests = async () => {
    try {
      // Charger TOUTES les demandes de documents (pas seulement pending) pour afficher l'historique complet
      const response = await documentRequestsAPI.getRequests({});
      if (response.data.success) {
        const requests = response.data.documentRequests || [];
        const requestsMap: Record<string, any[]> = {};
        requests.forEach((request: any) => {
          const dossierId = request.dossier?._id || request.dossier || request.dossierId;
          if (dossierId) {
            const dossierIdStr = dossierId.toString();
            if (!requestsMap[dossierIdStr]) {
              requestsMap[dossierIdStr] = [];
            }
            requestsMap[dossierIdStr].push(request);
          }
        });
        setDocumentRequests(requestsMap);
      }
    } catch (err: any) {
      // Ignorer silencieusement les erreurs 404 (route peut ne pas être disponible si le serveur n'est pas redémarré)
      if (err.response?.status !== 404) {
        console.error('Erreur lors du chargement des demandes de documents:', err);
      }
    }
  };

  /** Toutes les pièces du dossier (client, admin, partenaire), comme GET /user/documents/dossier/:id */
  const loadDossierDocumentsForList = async (dossiersList: any[]) => {
    if (!dossiersList?.length) {
      setDossierDocuments({});
      return;
    }
    try {
      const entries = await Promise.all(
        dossiersList.map(async (d: any) => {
          const id = (d._id || d.id)?.toString();
          if (!id || !/^[a-f0-9]{24}$/i.test(id)) return null;
          try {
            const res = await dossiersAPI.getDossierDocuments(id);
            if (res.data.success) {
              return [id, res.data.documents || []] as [string, any[]];
            }
          } catch (e: any) {
            if (e?.response?.status !== 403) {
              console.error(`Erreur documents dossier ${id}:`, e);
            }
          }
          return [id, []] as [string, any[]];
        })
      );
      const documentsMap: Record<string, any[]> = {};
      for (const row of entries) {
        if (row) {
          const [id, docs] = row;
          documentsMap[id] = docs;
        }
      }
      setDossierDocuments(documentsMap);
    } catch (err: any) {
      console.error('Erreur lors du chargement des documents des dossiers:', err);
    }
  };

  const loadDossierDocuments = async () => {
    await loadDossierDocumentsForList(dossiers);
  };

  const handleDirectUploadFromList = async (e: React.FormEvent, dossierId: string) => {
    e.preventDefault();
    setDirectUploadError(null);

    // Sécuriser le dossierId pour éviter un upload "sans dossier"
    if (!/^[a-f0-9]{24}$/i.test(dossierId)) {
      setDirectUploadError('Impossible d\'associer le document au dossier (identifiant invalide).');
      return;
    }

    const selectedFiles = Array.from(directFileInputRef.current?.files || []);
    if (selectedFiles.length === 0) {
      setDirectUploadError('Veuillez sélectionner un fichier');
      return;
    }
    if (selectedFiles.length === 1 && !directUploadData.nom.trim()) {
      setDirectUploadError('Veuillez saisir un nom de document');
      return;
    }

    setDirectUploading(true);
    try {
      const createdDocs: any[] = [];
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('document', file);
        formData.append('nom', selectedFiles.length === 1 ? directUploadData.nom.trim() : file.name);
        formData.append('description', directUploadData.description.trim());
        formData.append('categorie', directUploadData.categorie);
        formData.append('dossierId', dossierId);

        const response = await documentsAPI.uploadDocument(formData);
        if (!response?.data?.success) {
          throw new Error(response?.data?.message || 'Erreur lors du téléversement du document');
        }
        if (response.data.document) {
          createdDocs.push(response.data.document);
        }
      }

      // Mise à jour immédiate de la carte dossier (sans attendre le prochain refresh global)
      if (createdDocs.length > 0) {
        setDossierDocuments((prev) => {
          const current = prev[dossierId] || [];
          return {
            ...prev,
            [dossierId]: [...createdDocs.reverse(), ...current]
          };
        });
      }

      setDirectUploadData({ nom: '', description: '', categorie: 'autre' });
      if (directFileInputRef.current) {
        directFileInputRef.current.value = '';
      }
      setActiveDirectUploadDossierId(null);
      await loadDossierDocuments();
      // Ouvrir la liste des pièces pour que l’envoi spontané soit visible tout de suite
      setExpandedDocumentDropdowns((prev) => new Set(prev).add(dossierId));
      setToast({
        message:
          selectedFiles.length > 1
            ? `✅ ${selectedFiles.length} documents ajoutés avec succès au dossier.`
            : '✅ Document ajouté avec succès au dossier.',
        type: 'success',
      });
    } catch (err: any) {
      console.error('Erreur upload direct depuis la liste:', err);
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
    const rawDate = lastComplement?.updatedAt || lastComplement?.addedAt || lastComplement?.createdAt;
    const ts = rawDate ? new Date(rawDate).getTime() : 0;
    return Number.isFinite(ts) ? ts : 0;
  };

  const getComplementSeenStorageKey = (dossierId: string) => `dossierComplementSeen:client:${dossierId}`;

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
      return;
    }

    markComplementAsSeen(dossier);
    setActiveQuickComplementDossierId(dossierId);
  };

  const loadDossiers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('📁 Chargement des dossiers pour l\'utilisateur:', session?.user?.email);
      
      // Vérifier que le token est disponible
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token && session && (session.user as any)?.accessToken) {
          localStorage.setItem('token', (session.user as any).accessToken);
          console.log('🔑 Token stocké dans localStorage depuis la session');
        }
        if (!token) {
          console.warn('⚠️ Aucun token trouvé pour charger les dossiers');
        }
      }
      
      const response = await dossiersAPI.getMyDossiers();
      console.log('📁 Réponse API dossiers complète:', response);
      console.log('📁 Réponse API dossiers data:', response.data);
      
      if (response.data.success) {
        const dossiersList = response.data.dossiers || [];
        console.log('✅ Dossiers chargés:', dossiersList.length);
        console.log('✅ Liste des dossiers:', dossiersList);
        setDossiers(dossiersList);
        await loadDossierDocumentsForList(dossiersList);
        // Toujours déplier tous les badges pour l'espace client
        const allIds = new Set<string>();
        dossiersList.forEach((d: any) => {
          const id = (d._id || d.id || d.numero || '').toString();
          if (id) allIds.add(id);
        });
        setExpandedDossiers(allIds);
      } else {
        console.error('❌ Réponse API indique un échec:', response.data);
        setError(response.data.message || 'Erreur lors du chargement des dossiers');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des dossiers:', err);
      console.error('❌ Détails de l\'erreur:', {
        status: err.response?.status,
        message: err.response?.data?.message,
        data: err.response?.data
      });
      setError(err.response?.data?.message || 'Erreur lors du chargement des dossiers');
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement de votre session...</p>
        </div>
      </div>
    );
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
      <main className="w-full max-w-[100vw] px-0 py-4 sm:py-6 lg:py-8">
        <div className="mb-6 sm:mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-1 sm:mb-2 truncate">Mes Dossiers</h1>
            <p className="text-sm md:text-base text-muted-foreground">Gérez tous vos dossiers en un seul endroit</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadDossiers} disabled={isLoading} className="min-h-[44px] sm:min-h-0">
              Actualiser
            </Button>
            <Link href="/dossiers/create" className="min-h-[44px] sm:min-h-0 flex items-center">
              <Button className="w-full sm:w-auto min-h-[44px] sm:min-h-0">Nouveau dossier</Button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement des dossiers...</p>
          </div>
        ) : dossiers.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">📁</div>
            <p className="text-muted-foreground mb-4">Vous n'avez pas encore de dossier</p>
            <Link href="/dossiers/create">
              <Button>Créer mon premier dossier</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Liste des dossiers en pleine largeur */}
            <div className="space-y-4">
              {dossiers.map((dossier) => (
                <div
                  key={dossier._id || dossier.id}
                  className={`relative group overflow-hidden rounded-xl p-[1px] transition-all duration-300 bg-gradient-to-r shadow-sm w-full min-w-0 ${
                    dossier.statut === 'recu' || dossier.statut === 'en_attente_onboarding'
                      ? 'from-yellow-200/70 via-amber-200/70 to-yellow-200/70 group-hover:from-yellow-400/70 group-hover:via-amber-400/70 group-hover:to-yellow-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(234,179,8,0.5)]'
                      : dossier.statut === 'decision_favorable' || dossier.statut === 'gain_cause'
                      ? 'from-green-200/70 via-emerald-200/70 to-green-200/70 group-hover:from-green-400/70 group-hover:via-emerald-400/70 group-hover:to-green-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(34,197,94,0.5)]'
                      : dossier.statut === 'decision_defavorable' || dossier.statut === 'refuse' || dossier.statut === 'rejet'
                      ? 'from-red-200/70 via-rose-200/70 to-red-200/70 group-hover:from-red-400/70 group-hover:via-rose-400/70 group-hover:to-red-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(239,68,68,0.5)]'
                      : 'from-blue-200/70 via-indigo-200/70 to-blue-200/70 group-hover:from-blue-400/70 group-hover:via-indigo-400/70 group-hover:to-blue-400/70 group-hover:shadow-[0_10px_30px_-18px_rgba(59,130,246,0.5)]'
                  }`}
                >
                  <div className="bg-white rounded-xl border border-white/70 p-3 sm:p-4 md:p-5 group-hover:shadow-md group-hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
                    {/* En-tête de la carte : sur mobile en colonne (titre puis badges + lien) */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0 pr-0 sm:pr-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-baseline gap-2">
                            <h3 className="font-semibold text-sm sm:text-base md:text-lg text-foreground line-clamp-1 leading-snug truncate">
                              {typeof dossier.titre === 'string' && dossier.titre ? dossier.titre : 'Sans titre'}
                            </h3>
                            {(typeof dossier.numero === 'string' || typeof dossier.numeroDossier === 'string') && (
                              <span className="text-xs md:text-sm text-primary font-mono font-semibold">
                                Réf. {typeof dossier.numero === 'string' ? dossier.numero : dossier.numeroDossier}
                              </span>
                            )}
                          </div>
                          {/* Créateur du dossier et transmissions masqués pour le client */}
                          {/* Bloc métriques (dossier plié) */}
                          {!expandedDossiers.has(dossier._id || dossier.id) && (
                            <div className="mt-1.5 space-y-1.5">
                              {(() => {
                                const dossierRequests = documentRequests[dossier._id || dossier.id] || [];
                                const pendingRequests = dossierRequests.filter((r: any) => r.status === 'pending');
                                const totalDocuments = dossierDocuments[dossier._id || dossier.id]?.length || dossier.documents?.length || 0;
                                const rawSteps = dossier.etapesSupplementaires;
                                const editedEtapes = getEditedEtapesOnly(rawSteps);
                                const progress = getDossierProgressFromEditedEtapes(dossier.statut, editedEtapes);
                                const currentEtapeIdx = editedEtapes.findIndex((step) =>
                                  customEtapeMatchesStatut(step, dossier.statut || '')
                                );

                                return (
                                  <>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs md:text-sm text-muted-foreground">
                                      <span>Documents : <span className="font-semibold text-foreground">{totalDocuments}</span></span>
                                      {dossierRequests.length > 0 && (
                                        <span>Demandes : <span className="font-semibold text-orange-600">{pendingRequests.length}</span> en attente</span>
                                      )}
                                      <div className="w-full mt-1">
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
                                        )}
                                      </div>
                                      {dossier.updatedAt && (
                                        <span>Dernière activité : {formatRelativeTime(dossier.updatedAt)}</span>
                                      )}
                                      {dossier.dateEcheance && isDeadlineApproaching(dossier.dateEcheance) && (
                                        <span className="text-red-600 font-medium">Échéance : {calculateDaysUntil(dossier.dateEcheance)} j</span>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:items-end gap-1.5 flex-shrink-0 w-full sm:w-auto sm:max-w-none">
                      <div className="flex flex-wrap items-center gap-2 justify-end sm:justify-end">
                        <span className={`px-2.5 py-1 rounded-md text-[11px] md:text-sm font-semibold ${getStatutColor(dossier.statut)}`}>
                          {getStatutLabel(dossier.statut)}
                        </span>
                        {dossier.priorite && (
                          <span className={`px-2.5 py-1 rounded-md text-[11px] md:text-sm font-semibold ${getPrioriteColor(dossier.priorite)}`}>
                            {dossier.priorite}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/client/dossiers/${dossier._id || dossier.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center px-3 py-2 min-h-[40px] sm:min-h-[36px] rounded-md bg-primary text-white text-sm md:text-base font-medium hover:bg-primary/90 transition-colors text-center w-full sm:w-auto"
                      >
                        Voir les détails
                      </Link>
                    </div>
                  </div>

                  {/* Contenu détaillé (affiché uniquement si le dossier est déplié) — affichage compact */}
                  {expandedDossiers.has(dossier._id || dossier.id) && (
                    <div className="pt-2 mt-1 border-t border-gray-100">

                  {/* Ligne compacte : avancement + échéance + prochaine action (avancement masqué sur mobile) */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2 pb-2 border-b border-gray-100">
                    {(() => {
                      const rawSteps = dossier.etapesSupplementaires;
                      const editedEtapes = getEditedEtapesOnly(rawSteps);
                      const progress = getDossierProgressFromEditedEtapes(dossier.statut, editedEtapes);
                      const currentEtapeIdx = editedEtapes.findIndex((step) =>
                        customEtapeMatchesStatut(step, dossier.statut || '')
                      );
                      return (
                        <div className="w-full">
                          {editedEtapes.length === 0 ? (
                            <span className="text-[11px] md:text-sm text-muted-foreground">
                              Avancement : <span className="font-semibold text-foreground">{getDossierProgress(dossier.statut)} %</span>
                            </span>
                          ) : (
                            <>
                              <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-muted-foreground font-medium">Avancement (étapes éditées)</span>
                                <span className="font-semibold text-foreground">{progress} %</span>
                              </div>
                              <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] pb-0.5 -mx-0.5 px-0.5">
                                <div className="w-max min-w-full space-y-1.5">
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
                                          className="h-2 w-[4.75rem] flex-shrink-0 border-r border-white/60 last:border-r-0"
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
                                          className="w-[4.75rem] flex-shrink-0 flex flex-col items-center px-1 box-border"
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
                    {isDeadlineApproaching(dossier.dateEcheance) && (
                      <span className="text-[11px] md:text-sm font-semibold text-red-600 shrink-0">
                        Échéance {calculateDaysUntil(dossier.dateEcheance)} j
                      </span>
                    )}
                    {(() => {
                      const nextAction = getNextAction(dossier.statut);
                      return nextAction ? (
                        <span className="text-[11px] md:text-sm text-blue-800 truncate max-w-[200px] md:max-w-md" title={nextAction}>{nextAction}</span>
                      ) : null;
                    })()}
                  </div>

                  {/* Dossier transmis — une ligne par transmission */}
                  {dossier.transmittedTo && dossier.transmittedTo.length > 0 && (
                    <div className="mb-2 pb-2 border-b border-gray-100">
                      <p className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Transmis</p>
                      <div className="flex flex-wrap gap-1.5">
                        {dossier.transmittedTo.map((trans: any, idx: number) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 border border-purple-200 rounded text-[11px] md:text-sm text-purple-800">
                            {(() => {
                              // Backend: transmittedTo stocke l'utilisateur partenaire dans `partenaire`
                              // et le type (consulat/association/avocat) dans `partenaireInfo.typeOrganisme`.
                              const partenaire = trans.partenaire || trans.user;
                              const typeOrganisme = partenaire?.partenaireInfo?.typeOrganisme;

                              const label =
                                trans.quality ||
                                (typeOrganisme === 'consulat'
                                  ? 'Consulat'
                                  : typeOrganisme === 'association'
                                  ? 'Association'
                                  : 'Avocat');

                              const fullName = [partenaire?.firstName, partenaire?.lastName].filter(Boolean).join(' ');
                              const nomOrganisme = partenaire?.partenaireInfo?.nomOrganisme || partenaire?.organisationName;

                              return (
                                <>
                                  {label}: {fullName || '—'}
                                  {nomOrganisme ? ` (${nomOrganisme})` : null}
                                </>
                              );
                            })()}
                            <span className="text-purple-600">· {new Date(trans.transmittedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Informations du dossier — grille compacte */}
                  <div className="mb-2 pb-2 border-b border-gray-100">
                    <p className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Infos</p>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 text-[11px] md:text-sm">
                      <dt className="text-muted-foreground">Catégorie</dt>
                      <dd className="text-foreground">{getCategorieLabel(dossier.categorie || 'autre')}</dd>
                      {dossier.type && (
                        <>
                          <dt className="text-muted-foreground">Type</dt>
                          <dd className="text-foreground">{getTypeLabel(dossier.categorie || 'autre', dossier.type)}</dd>
                        </>
                      )}
                      <dt className="text-muted-foreground">Créé</dt>
                      <dd className="text-foreground">
                        {dossier.createdAt ? new Date(dossier.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                      </dd>
                      {dossier.updatedAt && (
                        <>
                          <dt className="text-muted-foreground">Activité</dt>
                          <dd className="text-foreground">{formatRelativeTime(dossier.updatedAt)}</dd>
                        </>
                      )}
                      {dossier.dateEcheance && (
                        <>
                          <dt className="text-muted-foreground">Échéance</dt>
                          <dd className="text-foreground">{new Date(dossier.dateEcheance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</dd>
                        </>
                      )}
                      {dossier.description && (
                        <>
                          <dt className="text-muted-foreground col-span-1">Description</dt>
                          <dd className="text-foreground break-all line-clamp-2 col-span-2 sm:col-span-3">{dossier.description}</dd>
                        </>
                      )}
                    </dl>
                  </div>

                  {/* Synthèse — une ligne : Documents · Messages · Demandes */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 pb-2 border-b border-gray-100 text-[11px] md:text-sm text-muted-foreground">
                    <span><span className="font-semibold text-foreground">{dossierDocuments[dossier._id || dossier.id]?.length || dossier.documents?.length || 0}</span> doc.</span>
                    <span><span className="font-semibold text-foreground">{dossier.messages?.length || 0}</span> msg.</span>
                    <span><span className="font-semibold text-foreground">{documentRequests[dossier._id || dossier.id]?.length || 0}</span> demandes</span>
                  </div>

                  {/* Documents : demandes admin/partenaire + pièces du dossier + ajout libre (toujours visible) */}
                  {(() => {
                    const dossierIdKey = dossier._id || dossier.id;
                    const dossierIdStr = dossierIdKey.toString();
                    const dossierRequests = documentRequests[dossierIdKey] || [];
                    const pendingRequests = dossierRequests.filter((r: any) => r.status === 'pending');
                    const receivedRequests = dossierRequests.filter((r: any) => r.status === 'received' || r.status === 'sent');
                    const isExpanded = expandedDocumentSections.has(dossierIdKey);
                    const hasRequests = dossierRequests.length > 0;
                    const docs = dossierDocuments[dossierIdStr] || [];
                    const importantInfoCount = Array.isArray(dossier?.complementsRecit) ? dossier.complementsRecit.length : 0;

                    const toggleDirectUpload = (e?: { stopPropagation?: () => void }) => {
                      e?.stopPropagation?.();
                      setDirectUploadError(null);
                      if (activeDirectUploadDossierId === dossierIdStr) {
                        setActiveDirectUploadDossierId(null);
                      } else {
                        setActiveDirectUploadDossierId(dossierIdStr);
                      }
                    };

                    return (
                      <div className="pt-2 border-t border-gray-100 mb-2">
                        {hasRequests ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="flex-1 min-w-0 flex items-center justify-between gap-2 py-1.5 px-1 rounded hover:bg-gray-50 transition-colors text-left"
                              onClick={() => {
                                const newExpanded = new Set(expandedDocumentSections);
                                if (isExpanded) newExpanded.delete(dossierIdKey);
                                else newExpanded.add(dossierIdKey);
                                setExpandedDocumentSections(newExpanded);
                              }}
                            >
                              <span className="text-[11px] md:text-sm font-semibold text-foreground">📄 Documents demandés</span>
                              <span className="text-[11px] md:text-sm text-muted-foreground">
                                {pendingRequests.length > 0 && <span className="text-orange-600">{pendingRequests.length} attente</span>}
                                {pendingRequests.length > 0 && receivedRequests.length > 0 && ' · '}
                                {receivedRequests.length > 0 && <span className="text-green-600">{receivedRequests.length} reçu(s)</span>}
                              </span>
                              <span className="text-muted-foreground text-xs">{isExpanded ? '▲' : '▼'}</span>
                            </button>
                            <Button
                              type="button"
                              variant="outline"
                              title="Ajouter un document"
                              aria-label="Ajouter un document"
                              className="h-7 w-7 p-0 text-sm leading-none shadow-none"
                              onClick={toggleDirectUpload}
                            >
                              +
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              title="Ajouter une info importante"
                              aria-label="Ajouter une info importante"
                              className="relative h-7 w-7 p-0 text-sm leading-none shadow-none"
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
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0 py-1.5 px-1">
                              <span className="text-[11px] md:text-sm font-semibold text-foreground">📁 Documents du dossier</span>
                              <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">
                                Pièces jointes et envois spontanés (sans demande préalable)
                              </p>
                            </div>
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
                          </div>
                        )}

                        {activeDirectUploadDossierId === dossierIdStr && (
                          <form
                            onSubmit={(e) => handleDirectUploadFromList(e, dossierIdStr)}
                            className="mt-2 p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2.5"
                          >
                            {directUploadError && <p className="text-xs text-red-600">{directUploadError}</p>}
                            <div>
                              <label className="text-[11px] md:text-sm font-medium">Fichier(s) *</label>
                              <input
                                ref={directFileInputRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                                multiple
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

                        {activeQuickComplementDossierId === dossierIdStr && (
                          <QuickComplementTabsForm
                            key={`${dossierIdStr}-${(dossier.complementsRecit || [])
                              .map((c: any) => c._id || c.id)
                              .join('-')}`}
                            dossierId={dossierIdStr}
                            complements={dossier.complementsRecit || []}
                            onSaved={async () => {
                              await loadDossiers();
                              setActiveQuickComplementDossierId(null);
                            }}
                            onCancel={() => setActiveQuickComplementDossierId(null)}
                            onSuccessToast={(msg) => setToast({ message: msg, type: 'success' })}
                            onErrorToast={(msg) => setToast({ message: msg, type: 'error' })}
                          />
                        )}
                        
                        {hasRequests && isExpanded && (
                          <div className="mt-1.5 space-y-1.5">
                            {dossierRequests.map((request: any) => {
                              const isPending = request.status === 'pending';
                              const isUrgent = request.isUrgent;
                              return (
                                <div
                                  key={request._id || request.id}
                                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 border text-[11px] md:text-sm ${
                                    isPending
                                      ? isUrgent ? 'bg-red-50/50 border-red-200' : 'bg-orange-50/50 border-orange-200'
                                      : 'bg-green-50/50 border-green-200'
                                  }`}
                                >
                                  <span className="shrink-0">{isPending ? (isUrgent ? '🔴' : '📄') : '✅'}</span>
                                  <div className="flex-1 min-w-0 truncate font-medium">
                                    {request.documentTypeLabel || request.documentType || 'Document'}
                                    {request.message && <span className="text-muted-foreground font-normal"> — {request.message}</span>}
                                  </div>
                                  <span className="text-[10px] md:text-xs text-muted-foreground shrink-0">
                                    {request.receivedAt
                                      ? `Reçu ${new Date(request.receivedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                                      : `Demandé ${new Date(request.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
                                  </span>
                                  {isUrgent && <span className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded text-[10px] md:text-xs font-bold shrink-0">URGENT</span>}
                                  {isPending && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDocumentRequest({
                                          _id: request._id,
                                          id: request.id,
                                          type: 'document_request',
                                          titre: isUrgent ? `🔴 Demande urgente - Dossier ${dossier.numero || dossier._id}` : `📄 Demande - Dossier ${dossier.numero || dossier._id}`,
                                          message: `Document "${request.documentTypeLabel}" requis.`,
                                          data: {
                                            documentRequestId: request._id || request.id,
                                            dossierId: dossier._id || dossier.id,
                                            dossierNumero: dossier.numero,
                                            documentType: request.documentType,
                                            documentTypeLabel: request.documentTypeLabel,
                                            isUrgent: request.isUrgent || false,
                                            message: request.message
                                          }
                                        });
                                        setShowDocumentRequestModal(true);
                                      }}
                                      className={`shrink-0 px-2 py-1 rounded text-[10px] md:text-xs font-medium ${
                                        isUrgent ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-orange-500 text-white hover:bg-orange-600'
                                      }`}
                                    >
                                      Envoyer
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {docs.length > 0 && (() => {
                          const docsExpanded = expandedDocumentDropdowns.has(dossierIdStr);

                          return (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 py-2 px-2 sm:py-2.5 sm:px-3 rounded-lg border-2 border-green-600/80 bg-green-50 hover:bg-green-100/90 transition-colors text-left mb-1 shadow-sm"
                                onClick={() => {
                                  const newExpanded = new Set(expandedDocumentDropdowns);
                                  if (docsExpanded) newExpanded.delete(dossierIdStr);
                                  else newExpanded.add(dossierIdStr);
                                  setExpandedDocumentDropdowns(newExpanded);
                                }}
                              >
                                <span className="text-xs sm:text-sm font-bold text-green-800 uppercase tracking-wide">
                                  Documents du dossier
                                </span>
                                <span className="text-xs sm:text-sm font-bold text-green-700 tabular-nums shrink-0">
                                  {docs.length} doc{docs.length > 1 ? 's' : ''} {docsExpanded ? '▲' : '▼'}
                                </span>
                              </button>

                              {docsExpanded && (
                                <div className="space-y-1">
                                  {docs.map((doc: any) => {
                                    const isConfidentialForClient = !!doc?.isConfidentialForClient || doc?.visibleToClient === false;
                                    return (
                                      <div
                                        key={doc._id || doc.id}
                                        className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[11px] md:text-sm shadow-sm"
                                      >
                                        <div className="min-w-0 flex-1 truncate font-medium text-foreground pr-1">
                                          <span className="mr-1.5 inline-block text-muted-foreground" aria-hidden>
                                            📄
                                          </span>
                                          {doc.nom || doc.filename || 'Document'}
                                        </div>
                                        {isConfidentialForClient ? (
                                          <div className="w-full sm:w-auto text-xs font-semibold text-red-700">
                                            Accès non autorisé à ce document
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-end gap-2 shrink-0 w-full sm:w-auto">
                                            <button
                                              type="button"
                                              title="Prévisualiser le document"
                                              className="inline-flex flex-1 sm:flex-none min-h-[40px] items-center justify-center gap-1.5 rounded-md border border-green-700/35 bg-green-50 px-3 py-2 text-xs font-semibold text-green-900 hover:bg-green-100 active:bg-green-100/80 transition-colors"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedDocumentForPreview(doc);
                                              }}
                                            >
                                              <Eye className="h-4 w-4 shrink-0" aria-hidden />
                                              Voir
                                            </button>
                                            <button
                                              type="button"
                                              title="Télécharger le document"
                                              aria-label="Télécharger le document"
                                              className="inline-flex flex-1 sm:flex-none min-h-[40px] items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-foreground hover:bg-gray-50 active:bg-gray-100 transition-colors"
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                  const response = await documentsAPI.downloadDocument(doc._id || doc.id);
                                                  const url = window.URL.createObjectURL(new Blob([response.data]));
                                                  const link = document.createElement('a');
                                                  link.href = url;
                                                  link.setAttribute('download', doc.nom || 'document');
                                                  document.body.appendChild(link);
                                                  link.click();
                                                  link.remove();
                                                  window.URL.revokeObjectURL(url);
                                                } catch (err) {
                                                  console.error('Erreur téléchargement document dossier:', err);
                                                }
                                              }}
                                            >
                                              <Download className="h-4 w-4 shrink-0" aria-hidden />
                                              <span className="hidden min-[380px]:inline">Télécharger</span>
                                              <span className="min-[380px]:hidden">Tél.</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0">
                        {(() => {
                          // Afficher la dernière notification défilante si pas de demandes de documents
                          const dossierRequests = documentRequests[dossier._id || dossier.id] || [];
                          const pendingRequests = dossierRequests.filter((r: any) => r.status === 'pending');
                          
                          if (pendingRequests.length === 0) {
                            const lastNotification = getLastNotificationForDossier(dossier._id || dossier.id);
                            if (lastNotification) {
                              return (
                                <div className="relative overflow-hidden bg-blue-50/50 rounded px-2 py-1 border border-blue-200/50">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] md:text-sm">🔔</span>
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                      <div className="animate-scroll-text whitespace-nowrap">
                                        <span className="text-[11px] md:text-sm text-blue-900 font-medium">
                                          {lastNotification.title || lastNotification.message || 'Nouvelle notification'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            
                            // Fonctionnalité dropdown documents supprimée pour simplifier la vue client
                          }
                          
                          return null;
                        })()}
                      </div>
                      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                        {(() => {
                          const unreadCount = getUnreadNotificationsCountForDossier(dossier._id || dossier.id);
                          return (
                            <Link href={`/client/notifications?dossierId=${dossier._id || dossier.id}&filter=unread`}>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className={`text-[11px] md:text-sm h-7 md:h-8 relative px-2 md:px-3 ${unreadCount > 0 ? 'bg-orange-50 border-orange-300 hover:bg-orange-100' : ''}`}
                                title="Voir les notifications non lues"
                              >
                                🔔
                                {unreadCount > 0 && (
                                  <span className="ml-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-3.5 px-1 flex items-center justify-center">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                  </span>
                                )}
                              </Button>
                            </Link>
                          );
                        })()}
                        <Link href={`/client/messages?dossierId=${dossier._id || dossier.id}&action=view`}>
                          <Button variant="outline" size="sm" className="text-[11px] md:text-sm h-7 md:h-8 px-2 md:px-3" title="Voir les discussions">
                            💬
                          </Button>
                        </Link>
                        <Link href={`/client/messages?dossierId=${dossier._id || dossier.id}&action=send`}>
                          <Button size="sm" className="text-[11px] md:text-sm h-7 md:h-8 px-2 md:px-3" title="Envoyer un message">
                            ✉️
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                    </div>
                  )}
                  </div>
                </div>
              ))}
            </div>

            {dossiers.length > 0 && (
              <div className="mt-6 pt-4 border-t flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm md:text-base text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{dossiers.length}</span> dossier{dossiers.length > 1 ? 's' : ''}
                </p>
              </div>
            )}
          </>
        )}
      </main>
      
      {/* Modal de demande de document depuis les badges de dossiers */}
      <DocumentRequestNotificationModal
        isOpen={showDocumentRequestModal}
        onClose={() => {
          setShowDocumentRequestModal(false);
          setSelectedDocumentRequest(null);
          // Recharger les demandes après fermeture
          loadDocumentRequests();
          loadNotifications();
        }}
        notification={selectedDocumentRequest}
        onDocumentSent={async () => {
          // Recharger les données après l'envoi du document
          await loadDocumentRequests();
          await loadNotifications();
          await loadDossierDocuments();
        }}
      />
      
      {/* Modal de prévisualisation de document */}
      {selectedDocumentForPreview && (
        <DocumentPreview
          document={selectedDocumentForPreview}
          isOpen={!!selectedDocumentForPreview}
          onClose={() => setSelectedDocumentForPreview(null)}
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


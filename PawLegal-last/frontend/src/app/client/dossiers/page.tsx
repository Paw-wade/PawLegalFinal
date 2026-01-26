'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { dossiersAPI, notificationsAPI, documentRequestsAPI, documentsAPI } from '@/lib/api';
import { DocumentRequestNotificationModal } from '@/components/DocumentRequestNotificationModal';
import { DocumentPreview } from '@/components/DocumentPreview';
import { getStatutColor, getStatutLabel, getPrioriteColor, getDossierProgress, calculateDaysSince, calculateDaysUntil, isDeadlineApproaching, formatRelativeTime, getNextAction, getTimelineSteps } from '@/lib/dossierUtils';

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
  const [expandedDossiers, setExpandedDossiers] = useState<Set<string>>(new Set());

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
      loadDossierDocuments();
    } else if (token) {
      // Si on a un token mais pas de session, charger quand même les dossiers
      loadDossiers();
      loadNotifications();
      loadDocumentRequests();
      loadDossierDocuments();
    }
  }, [session, status, router]);

  // Rafraîchissement automatique toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      if (session || localStorage.getItem('token')) {
        loadDossiers();
        loadNotifications();
        loadDocumentRequests();
        loadDossierDocuments();
      }
    }, 30000); // Rafraîchir toutes les 30 secondes

    return () => clearInterval(interval);
  }, [session]);

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

  const loadDossierDocuments = async () => {
    try {
      const response = await documentsAPI.getMyDocuments();
      if (response.data.success) {
        const allDocuments = response.data.documents || [];
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
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') return null;

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
      <main className="w-full px-4 py-16">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Mes Dossiers</h1>
            <p className="text-muted-foreground">Gérez tous vos dossiers en un seul endroit</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadDossiers} disabled={isLoading}>
              Actualiser
            </Button>
            <Link href="/dossiers/create">
              <Button>Nouveau dossier</Button>
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
                            {dossier.titre || 'Sans titre'}
                          </h3>
                          {(dossier.numero || dossier.numeroDossier) && (
                            <p className="text-xs text-primary font-semibold mt-0.5">
                              N° {dossier.numero || dossier.numeroDossier}
                            </p>
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
                                    
                                    {/* Ligne 2: Progression, Échéance, Activité */}
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
                                      {dossier.updatedAt && (
                                        <span className="flex items-center gap-0.5">
                                          <span className="text-xs">🔄</span>
                                          <span>{formatRelativeTime(dossier.updatedAt)}</span>
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
                      <Link
                        href={`/client/dossiers/${dossier._id || dossier.id}`}
                        className="p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-600 hover:text-primary"
                        title="Voir les détails du dossier"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </Link>
                      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getStatutColor(dossier.statut)}`}>
                        {getStatutLabel(dossier.statut)}
                      </span>
                      {dossier.priorite && (
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getPrioriteColor(dossier.priorite)}`}>
                          {dossier.priorite}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contenu détaillé (affiché uniquement si le dossier est déplié) */}
                  {expandedDossiers.has(dossier._id || dossier.id) && (
                    <>

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
                  <div className="grid grid-cols-3 gap-2 mb-3 pb-2 border-b border-gray-100">
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
                  </div>

                  {/* Section Documents demandés */}
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
                                    </div>
                                    
                                    {isPending && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const notification = {
                                            _id: request._id,
                                            id: request.id,
                                            type: 'document_request',
                                            titre: isUrgent
                                              ? `🔴 Demande urgente de document - Dossier ${dossier.numero || dossier._id}`
                                              : `📄 Demande de document - Dossier ${dossier.numero || dossier._id}`,
                                            message: `Un document de type "${request.documentTypeLabel}" est requis pour votre dossier.`,
                                            data: {
                                              documentRequestId: request._id || request.id,
                                              dossierId: dossier._id || dossier.id,
                                              dossierNumero: dossier.numero,
                                              documentType: request.documentType,
                                              documentTypeLabel: request.documentTypeLabel,
                                              isUrgent: request.isUrgent || false,
                                              message: request.message
                                            }
                                          };
                                          setSelectedDocumentRequest(notification);
                                          setShowDocumentRequestModal(true);
                                        }}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex-shrink-0 ${
                                          isUrgent
                                            ? 'bg-red-500 text-white hover:bg-red-600'
                                            : 'bg-orange-500 text-white hover:bg-orange-600'
                                        }`}
                                      >
                                        📤 Envoyer
                                      </button>
                                    )}
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
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {(() => {
                          // Afficher la dernière notification défilante si pas de demandes de documents
                          const dossierRequests = documentRequests[dossier._id || dossier.id] || [];
                          const pendingRequests = dossierRequests.filter((r: any) => r.status === 'pending');
                          
                          if (pendingRequests.length === 0) {
                            const lastNotification = getLastNotificationForDossier(dossier._id || dossier.id);
                            if (lastNotification) {
                              return (
                                <div className="relative overflow-hidden bg-blue-50/50 rounded-md px-3 py-2 border border-blue-200/50">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs">🔔</span>
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                      <div className="animate-scroll-text whitespace-nowrap">
                                        <span className="text-xs text-blue-900 font-medium">
                                          {lastNotification.title || lastNotification.message || 'Nouvelle notification'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            
                            const dossierDocs = dossierDocuments[dossier._id || dossier.id] || [];
                            const hasDocuments = dossierDocs.length > 0;
                            const isDocDropdownExpanded = expandedDocumentDropdowns.has(dossier._id || dossier.id);
                            
                            return (
                              <div className="relative">
                                <div className="flex gap-3 text-xs text-muted-foreground">
                                  {hasDocuments && (
                                    <div className="relative">
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const newExpanded = new Set(expandedDocumentDropdowns);
                                          if (isDocDropdownExpanded) {
                                            newExpanded.delete(dossier._id || dossier.id);
                                          } else {
                                            newExpanded.add(dossier._id || dossier.id);
                                          }
                                          setExpandedDocumentDropdowns(newExpanded);
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
                          }
                          
                          return null; // Les demandes sont affichées dans la section dédiée ci-dessus
                        })()}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(() => {
                          const unreadCount = getUnreadNotificationsCountForDossier(dossier._id || dossier.id);
                          return (
                            <Link href={`/client/notifications?dossierId=${dossier._id || dossier.id}&filter=unread`}>
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
                        <Link href={`/client/messages?dossierId=${dossier._id || dossier.id}&action=view`}>
                          <Button variant="outline" size="sm" className="text-xs h-8" title="Voir les discussions">
                            💬 Discussions
                          </Button>
                        </Link>
                        <Link href={`/client/messages?dossierId=${dossier._id || dossier.id}&action=send`}>
                          <Button size="sm" className="text-xs h-8" title="Envoyer un message">
                            ✉️ Message
                          </Button>
                        </Link>
                        <Link href={`/client/dossiers/${dossier._id || dossier.id}`}>
                          <Button variant="outline" size="sm" className="text-xs h-8">
                            Détails
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {dossiers.length > 0 && (
              <div className="mt-6 pt-4 border-t flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
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
    </div>
  );
}


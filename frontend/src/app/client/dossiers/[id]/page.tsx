'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DossierDetailView } from '@/components/DossierDetailView';
import { dossiersAPI, notificationsAPI, messagesAPI, documentRequestsAPI, documentsAPI } from '@/lib/api';
import { DocumentRequestNotificationModal } from '@/components/DocumentRequestNotificationModal';
import { DocumentPreview } from '@/components/DocumentPreview';
import { getStatutColor, getStatutLabelWithEtapes, getPrioriteColor, calculateDaysSince, calculateDaysUntil, isDeadlineApproaching, formatRelativeTime, getNextAction, getTimelineStepsWithCustom } from '@/lib/dossierUtils';
import {
  getDossierCustomStatutLabel,
  getDossierDisplayTitle,
  getDossierTransmittedPartners,
  getDossierTransmissionSummary,
} from '@/lib/dossierListPresentation';
import { rememberDossierListFocus, dossierListFocusHref } from '@/lib/dossierListFocus';
import { History, Clock } from 'lucide-react';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent',
    ghost: 'hover:bg-accent',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

export default function DossierDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const dossierId = params?.id as string;
  
  const [dossier, setDossier] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [documentRequests, setDocumentRequests] = useState<any[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [selectedDocumentRequestNotification, setSelectedDocumentRequestNotification] = useState<any>(null);
  const [showDocumentRequestModal, setShowDocumentRequestModal] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [selectedDocumentForPreview, setSelectedDocumentForPreview] = useState<any>(null);
  const [showDocumentPreviewModal, setShowDocumentPreviewModal] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDirectUploadForm, setShowDirectUploadForm] = useState(false);
  const [directUploadData, setDirectUploadData] = useState({
    nom: '',
    description: '',
    categorie: 'autre'
  });
  const [directUploading, setDirectUploading] = useState(false);
  const [directUploadError, setDirectUploadError] = useState<string | null>(null);
  const directFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dossierId) rememberDossierListFocus('client', dossierId);
  }, [dossierId]);

  useEffect(() => {
    const shouldOpenUpload = searchParams?.get('openUpload') === '1';
    if (!shouldOpenUpload) return;

    setShowDirectUploadForm(true);
    // Laisser le temps au rendu puis scroller sur la zone upload
    setTimeout(() => {
      const el = document.getElementById('documents-upload');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  }, [searchParams]);

  // Redirection exacte depuis une notification : ?doc=<id> scrolle sur le document ciblé.
  const targetDocId = searchParams?.get('doc') || null;
  useEffect(() => {
    if (!targetDocId || documents.length === 0) return;
    const t = window.setTimeout(() => {
      document.getElementById(`doc-${targetDocId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    return () => window.clearTimeout(t);
  }, [targetDocId, documents]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (status === 'loading') {
      return;
    }

    if (status === 'unauthenticated' && !token) {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated' && session) {
      if ((session.user as any)?.accessToken && typeof window !== 'undefined') {
        const token = (session.user as any).accessToken;
        if (!localStorage.getItem('token')) {
          localStorage.setItem('token', token);
        }
      }
      loadDossier();
      loadNotifications();
      loadMessagesForDossier();
      loadDocumentRequests();
      loadDocuments();
      // Charger l'historique si déjà ouvert
      if (showHistory) {
        loadHistory();
      }
      if (showHistory) {
        loadHistory();
      }
    } else if (token) {
      loadDossier();
      loadNotifications();
      loadDocumentRequests();
      loadDocuments();
      if (showHistory) {
        loadHistory();
      }
    }
  }, [session, status, router, dossierId]);

  // (Rafraîchissement automatique supprimé pour éviter les sursauts de page)

  const loadDocuments = async () => {
    if (!dossierId) return;
    setIsLoadingDocuments(true);
    try {
      const response = await dossiersAPI.getDossierDocuments(dossierId);
      if (response.data.success) {
        setDocuments(response.data.documents || []);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des documents:', err);
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  const loadDocumentRequests = async () => {
    if (!dossierId) return;
    setIsLoadingRequests(true);
    try {
      const response = await documentRequestsAPI.getRequests({
        dossierId: dossierId,
        status: 'pending'
      });
      if (response.data.success) {
        setDocumentRequests(response.data.documentRequests || []);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des demandes de documents:', err);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const loadDossier = async () => {
    if (!dossierId) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token && session && (session.user as any)?.accessToken) {
        localStorage.setItem('token', (session.user as any).accessToken);
      }
      
      const response = await dossiersAPI.getDossierById(dossierId);
      
      if (response.data.success) {
        setDossier(response.data.dossier);
      } else {
        setError('Erreur lors du chargement du dossier');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement du dossier');
    } finally {
      setIsLoading(false);
    }
  };

  const loadNotifications = async () => {
    if (!dossierId) return;
    
    try {
      const response = await notificationsAPI.getNotifications({
        limit: 50
      });
      
      if (response.data.success) {
        // Filtrer les notifications liées à ce dossier
        const dossierNotifications = (response.data.notifications || []).filter((notif: any) => 
          notif.metadata?.dossierId === dossierId
        );
        setNotifications(dossierNotifications);
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des notifications:', err);
    }
  };

  const loadMessagesForDossier = async () => {
    if (!dossierId) return;

    setIsLoadingMessages(true);
    setMessagesError(null);
    try {
      const response = await messagesAPI.getMessages({ type: 'all', dossierId });
      if (response.data.success) {
        setMessages(response.data.messages || []);
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des messages du dossier:', err);
      setMessagesError(err.response?.data?.message || 'Erreur lors du chargement des messages du dossier');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const loadHistory = async () => {
    if (!dossierId) return;
    
    setLoadingHistory(true);
    try {
      const response = await dossiersAPI.getDossierHistory(dossierId);
      if (response.data.success) {
        setHistory(response.data.history || []);
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement de l\'historique:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getHistoryTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      creation: '📝',
      status_change: '🔄',
      document_added: '📄',
      message_sent: '💬',
      transmission: '📤',
      acknowledgment: '✅',
      update: '✏️',
      cancellation: '❌'
    };
    return icons[type] || '📋';
  };

  const getHistoryTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      creation: 'Création du dossier',
      status_change: 'Changement de statut',
      document_added: 'Document ajouté',
      message_sent: 'Message envoyé',
      transmission: 'Transmission',
      acknowledgment: 'Accusé de réception',
      update: 'Mise à jour',
      cancellation: 'Annulation'
    };
    return labels[type] || type;
  };

  const handleCancelDossier = async () => {
    if (!dossier) return;
    
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir annuler le dossier "${dossier.titre}" ?\n\nCette action est irréversible et les administrateurs seront notifiés.`
    );
    
    if (!confirmed) return;

    setIsCancelling(true);
    try {
      const response = await dossiersAPI.cancelDossier(dossierId);
      if (response.data.success) {
        alert('Dossier annulé avec succès. Les administrateurs ont été notifiés.');
        // Recharger le dossier pour afficher le nouveau statut
        await loadDossier();
        // Recharger l'historique si ouvert
        if (showHistory) {
          await loadHistory();
        }
        // Rediriger vers la liste des dossiers après 2 secondes
        setTimeout(() => {
          router.push('/client/dossiers');
        }, 2000);
      } else {
        alert(response.data.message || 'Erreur lors de l\'annulation du dossier');
      }
    } catch (error: any) {
      console.error('Erreur lors de l\'annulation du dossier:', error);
      alert(error.response?.data?.message || 'Erreur lors de l\'annulation du dossier');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDirectUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setDirectUploadError(null);

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
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('document', file);
        formData.append('nom', selectedFiles.length === 1 ? directUploadData.nom.trim() : file.name);
        formData.append('description', directUploadData.description.trim());
        formData.append('categorie', directUploadData.categorie);
        formData.append('dossierId', dossierId);

        const response = await documentsAPI.uploadDocument(formData);
        if (!response?.data?.success) {
          throw new Error(response?.data?.message || 'Erreur lors du téléversement');
        }
      }

      setDirectUploadData({ nom: '', description: '', categorie: 'autre' });
      if (directFileInputRef.current) {
        directFileInputRef.current.value = '';
      }
      setShowDirectUploadForm(false);
      await loadDocuments();
    } catch (err: any) {
      console.error('Erreur upload direct dossier:', err);
      setDirectUploadError(err.response?.data?.message || err.message || 'Erreur lors du téléversement du document');
    } finally {
      setDirectUploading(false);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <main className="w-full px-4 py-16">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement du dossier...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="min-h-screen bg-background">
        <main className="w-full px-4 py-16">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold mb-4">Dossier non trouvé</h2>
            <p className="text-muted-foreground mb-6">{error || 'Le dossier demandé n\'existe pas ou vous n\'avez pas l\'autorisation d\'y accéder.'}</p>
            <Link href="/client/dossiers">
              <Button>Retour aux dossiers</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const displayStatutLabel = getDossierCustomStatutLabel(dossier);
  const pendingDocumentRequestsCount = documentRequests.filter((request) => request.status === 'pending').length;
  const unreadNotificationsCount = notifications.filter((notification) => !notification.lu).length;
  const transmittedPartners = getDossierTransmittedPartners(dossier);
  const transmissionSummary = getDossierTransmissionSummary(transmittedPartners);
  const hasDeadline = !!dossier.dateEcheance;
  const deadlineDays = hasDeadline ? calculateDaysUntil(dossier.dateEcheance) : null;
  const nextAction = getNextAction(dossier.statut);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10 max-w-[100vw]">
      <div className="w-full max-w-[100vw] min-w-0 px-3 sm:px-4 py-4 sm:py-8 overflow-x-hidden">
        {/* En-tête - sur mobile: colonne, boutons en bas */}
        <div className="mb-4 sm:mb-6">
          <Link href={dossierListFocusHref('client', dossierId)} className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-3 sm:mb-4 transition-colors min-h-[44px] items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour aux dossiers
          </Link>
          
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6 overflow-hidden">
            {deadlineDays !== null && deadlineDays < 0 ? (
              <div className="-mx-4 -mt-4 mb-4 rounded-t-xl border-b border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 sm:-mx-6 sm:-mt-6 sm:px-6">
                Échéance dépassée depuis {Math.abs(deadlineDays)} jour{Math.abs(deadlineDays) > 1 ? 's' : ''}
              </div>
            ) : deadlineDays !== null && isDeadlineApproaching(dossier.dateEcheance) ? (
              <div className="-mx-4 -mt-4 mb-4 rounded-t-xl border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 sm:-mx-6 sm:-mt-6 sm:px-6">
                Échéance dans {deadlineDays} jour{deadlineDays > 1 ? 's' : ''}
              </div>
            ) : null}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <h1 className="text-xl sm:text-3xl font-bold text-foreground break-words">{getDossierDisplayTitle(dossier)}</h1>
                  {(dossier.numero || dossier.numeroDossier) && (
                    <span className="px-2.5 sm:px-3 py-1 bg-primary/10 text-primary rounded-lg text-xs sm:text-sm font-semibold">
                      N° {dossier.numero || dossier.numeroDossier}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm mb-3 break-words">
                  {dossier.description?.trim() || 'Aucune description pour ce dossier.'}
                </p>
                
                {/* Barre de progression basée uniquement sur les étapes choisies par l'équipe */}
                {Array.isArray(dossier.etapesSupplementaires) && dossier.etapesSupplementaires.length > 0 && (() => {
                  const rawSteps = dossier.etapesSupplementaires;
                  const currentIndex = rawSteps.findIndex(
                    (s: any) =>
                      dossier.statut &&
                      (dossier.statut === s.id || dossier.statut === s.label)
                  );
                  return (
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      <ul className="sm:hidden space-y-2">
                        {rawSteps.map((step: any, index: number) => {
                          const isCurrent =
                            currentIndex === -1
                              ? index === rawSteps.length - 1
                              : index === currentIndex;
                          const completed = currentIndex === -1 ? false : index <= currentIndex;
                          const dateLabel =
                            step.date
                              ? typeof step.date === 'string'
                                ? step.date
                                : new Date(step.date).toLocaleDateString('fr-FR')
                              : undefined;
                          return (
                            <li
                              key={step._id || step.id || index}
                              className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50/90 px-3 py-2.5 text-sm"
                            >
                              <span
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                  isCurrent
                                    ? 'bg-blue-500 ring-2 ring-blue-300'
                                    : completed
                                    ? 'bg-green-500'
                                    : 'bg-gray-300'
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <span
                                  className={`font-medium leading-snug ${
                                    isCurrent ? 'text-blue-800' : completed ? 'text-green-800' : 'text-gray-600'
                                  }`}
                                >
                                  {step.label}
                                </span>
                                {dateLabel ? (
                                  <span className="mt-1 block text-[11px] text-gray-500">({dateLabel})</span>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="hidden sm:block overflow-x-auto -mx-1 px-1">
                        <div className="flex flex-nowrap items-center gap-2 min-w-max pb-1">
                          {rawSteps.map((step: any, index: number) => {
                            const isCurrent =
                              currentIndex === -1
                                ? index === rawSteps.length - 1
                                : index === currentIndex;
                            const completed = currentIndex === -1 ? false : index <= currentIndex;
                            const dateLabel =
                              step.date
                                ? typeof step.date === 'string'
                                  ? step.date
                                  : new Date(step.date).toLocaleDateString('fr-FR')
                                : undefined;
                            return (
                              <div key={step._id || step.id || index} className="flex shrink-0 items-center gap-2">
                                <div className="flex max-w-[9rem] flex-col items-center gap-1">
                                  <span
                                    className={`h-3 w-3 shrink-0 rounded-full ${
                                      isCurrent
                                        ? 'bg-blue-500 ring-2 ring-blue-300'
                                        : completed
                                        ? 'bg-green-500'
                                        : 'bg-gray-300'
                                    }`}
                                  ></span>
                                  <span
                                    className={`text-center text-[10px] font-medium leading-tight text-balance ${
                                      isCurrent
                                        ? 'text-blue-700'
                                        : completed
                                        ? 'text-green-700'
                                        : 'text-gray-400'
                                    }`}
                                  >
                                    {step.label}
                                    {dateLabel ? <span className="hidden md:inline"> ({dateLabel})</span> : null}
                                  </span>
                                </div>
                                {index < rawSteps.length - 1 && (
                                  <div
                                    className={`h-0.5 w-4 shrink-0 sm:w-6 ${
                                      completed ? 'bg-green-500' : 'bg-gray-300'
                                    }`}
                                  ></div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Statuts et informations rapides */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${getStatutColor(dossier.statut)}`}>
                    {displayStatutLabel}
                  </span>
                  {dossier.priorite && (
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${getPrioriteColor(dossier.priorite)}`}>
                      {dossier.priorite}
                    </span>
                  )}
                  {dossier.createdAt && (
                    <span className="text-xs text-muted-foreground">
                      ⏱️ Ouvert il y a {calculateDaysSince(dossier.createdAt)} jour{calculateDaysSince(dossier.createdAt) > 1 ? 's' : ''}
                    </span>
                  )}
                  {dossier.updatedAt && (
                    <span className="text-xs text-muted-foreground">
                      🔄 {formatRelativeTime(dossier.updatedAt)}
                    </span>
                  )}
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
                    <p className="text-sm font-semibold text-foreground">{documents.length}</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Demandes</p>
                    <p className="text-sm font-semibold text-foreground">{pendingDocumentRequestsCount}</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Notifications</p>
                    <p className="text-sm font-semibold text-foreground">{unreadNotificationsCount > 0 ? unreadNotificationsCount : '-'}</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Intervenants</p>
                    <p className="truncate text-sm font-semibold text-foreground" title={transmissionSummary}>
                      {transmissionSummary}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-row flex-wrap gap-2 sm:flex-col sm:flex-nowrap w-full sm:w-auto">
                <Button variant="outline" onClick={() => { loadDossier(); loadNotifications(); }} className="min-h-[44px] flex-1 sm:flex-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualiser
                </Button>
                <Link href={`/client/dossiers/${dossierId}/documents-en-preparation`} className="min-h-[44px] flex-1 sm:flex-none">
                  <Button variant="outline" className="w-full min-h-[44px]">
                    Documents en préparation
                  </Button>
                </Link>
                {dossier && !['annule', 'decision_favorable', 'decision_defavorable', 'rejet', 'gain_cause'].includes(dossier.statut) && (
                  <Button variant="outline" className="min-h-[44px] flex-1 sm:flex-none border-red-500 text-red-600 hover:bg-red-50" onClick={handleCancelDossier}>
                    Annuler le dossier
                  </Button>
                )}
              </div>
            </div>
            
            {nextAction ? (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                <div className="flex items-start gap-3">
                  <span className="text-blue-600 text-xl">📋</span>
                  <div>
                    <p className="text-sm font-semibold text-blue-900 mb-1">Prochaine action requise</p>
                    <p className="text-sm text-blue-700">{nextAction}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Vue détaillée avec téléchargement et impression */}
        <DossierDetailView dossier={dossier} variant="client" dossierFiles={documents} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mt-6 sm:mt-8">
          {/* Informations principales */}
          <div className="md:col-span-2 space-y-4 sm:space-y-6 min-w-0">
            {/* Statut actuel */}
            <div id="documents-upload" className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Statut actuel</h2>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatutColor(dossier.statut)}`}>
                  {displayStatutLabel}
                </span>
                {dossier.priorite && (
                  <span className={`px-4 py-2 rounded-full text-sm font-medium ${getPrioriteColor(dossier.priorite)}`}>
                    Priorité: {dossier.priorite}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Dernière mise à jour : {new Date(dossier.updatedAt || dossier.createdAt).toLocaleDateString('fr-FR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>

            {/* Description */}
            {dossier.description && (
              <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Description</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">{dossier.description}</p>
              </div>
            )}

            {/* Informations complètes du dossier */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">📋 Informations Complètes du Dossier</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Numéro de dossier</p>
                  <p className="font-bold text-lg text-primary break-all sm:break-normal">{dossier.numero || dossier._id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Titre</p>
                  <p className="font-medium">{dossier.titre || 'Sans titre'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Catégorie</p>
                  <p className="font-medium">{dossier.categorie?.replace(/_/g, ' ') || 'Non spécifiée'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Type de demande</p>
                  <p className="font-medium">{dossier.type || 'Non spécifié'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Date de création</p>
                  <p className="font-medium">
                    {new Date(dossier.createdAt).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Dernière mise à jour</p>
                  <p className="font-medium">
                    {new Date(dossier.updatedAt || dossier.createdAt).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                {dossier.dateEcheance && (
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">Date d'échéance</p>
                    <p className="font-medium text-orange-600">
                      {new Date(dossier.dateEcheance).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                )}
                {dossier.createdBy && (
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">Créé par</p>
                    <p className="font-medium">
                      {dossier.createdBy.firstName} {dossier.createdBy.lastName}
                      {dossier.createdBy.email && ` (${dossier.createdBy.email})`}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Coordonnées client complètes */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">👤 Mes Coordonnées</h2>
              {dossier.user ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">Prénom</p>
                    <p className="font-medium">{dossier.user.firstName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">Nom</p>
                    <p className="font-medium">{dossier.user.lastName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">Email</p>
                    <p className="font-medium">{dossier.user.email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">Téléphone</p>
                    <p className="font-medium">{dossier.user.phone || 'N/A'}</p>
                  </div>
                  {dossier.user.dateNaissance && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Date de naissance</p>
                      <p className="font-medium">
                        {new Date(dossier.user.dateNaissance).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                  {dossier.user.lieuNaissance && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Lieu de naissance</p>
                      <p className="font-medium">{dossier.user.lieuNaissance}</p>
                    </div>
                  )}
                  {dossier.user.nationalite && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Nationalité</p>
                      <p className="font-medium">{dossier.user.nationalite}</p>
                    </div>
                  )}
                  {dossier.user.sexe && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Sexe</p>
                      <p className="font-medium">
                        {dossier.user.sexe === 'M' ? 'Masculin' : dossier.user.sexe === 'F' ? 'Féminin' : 'Autre'}
                      </p>
                    </div>
                  )}
                  {dossier.user.numeroEtranger && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Numéro d'étranger</p>
                      <p className="font-medium">{dossier.user.numeroEtranger}</p>
                    </div>
                  )}
                  {dossier.user.numeroTitre && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Numéro de titre</p>
                      <p className="font-medium">{dossier.user.numeroTitre}</p>
                    </div>
                  )}
                  {dossier.user.typeTitre && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Type de titre</p>
                      <p className="font-medium">{dossier.user.typeTitre}</p>
                    </div>
                  )}
                  {dossier.user.dateDelivrance && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Date de délivrance</p>
                      <p className="font-medium">
                        {new Date(dossier.user.dateDelivrance).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                  {dossier.user.dateExpiration && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Date d'expiration</p>
                      <p className="font-medium">
                        {new Date(dossier.user.dateExpiration).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                  {dossier.user.adressePostale && (
                    <div className="col-span-1 sm:col-span-2 min-w-0">
                      <p className="text-sm text-muted-foreground font-semibold">Adresse postale</p>
                      <p className="font-medium break-words">{dossier.user.adressePostale}</p>
                    </div>
                  )}
                  {dossier.user.ville && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Ville</p>
                      <p className="font-medium">{dossier.user.ville}</p>
                    </div>
                  )}
                  {dossier.user.codePostal && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Code postal</p>
                      <p className="font-medium">{dossier.user.codePostal}</p>
                    </div>
                  )}
                  {dossier.user.pays && (
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Pays</p>
                      <p className="font-medium">{dossier.user.pays}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">Prénom</p>
                    <p className="font-medium">{dossier.clientPrenom || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">Nom</p>
                    <p className="font-medium">{dossier.clientNom || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">Email</p>
                    <p className="font-medium">{dossier.clientEmail || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">Téléphone</p>
                    <p className="font-medium">{dossier.clientTelephone || 'N/A'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Motif et catégorie */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">📑 Motif et Nature du Dossier</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground font-semibold">Catégorie principale</p>
                  <p className="font-medium text-base sm:text-lg break-words hyphens-auto">{dossier.categorie?.replace(/_/g, ' ') || 'Non spécifiée'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground font-semibold">Type de demande</p>
                  <p className="font-medium text-base sm:text-lg break-words hyphens-auto">{dossier.type || 'Non spécifié'}</p>
                </div>
                {dossier.categorie && (
                  <div className="col-span-1 sm:col-span-2 min-w-0">
                    <p className="text-sm text-muted-foreground font-semibold">Code catégorie</p>
                    <p className="font-medium text-sm text-muted-foreground break-all">{dossier.categorie}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Demandes de documents en attente */}
            {documentRequests.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">📄 Documents demandés</h2>
                <div className="space-y-3">
                  {documentRequests.map((request: any) => (
                    <div
                      key={request._id || request.id}
                      className={`border-l-4 rounded-lg p-4 ${
                        request.isUrgent
                          ? 'bg-red-50 border-red-500'
                          : 'bg-blue-50 border-blue-500'
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{request.isUrgent ? '🔴' : '📄'}</span>
                            <h3 className="font-semibold text-base">
                              {request.documentTypeLabel}
                            </h3>
                            {request.isUrgent && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                                URGENT
                              </span>
                            )}
                          </div>
                          {request.message && (
                            <p className="text-sm text-muted-foreground mt-1">{request.message}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            Demandé le {new Date(request.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          // Créer une notification factice pour le modal
                          const notification = {
                            _id: request._id,
                            id: request.id,
                            type: 'document_request',
                            titre: request.isUrgent
                              ? `🔴 Demande urgente de document - Dossier ${dossier?.numero || dossierId}`
                              : `📄 Demande de document - Dossier ${dossier?.numero || dossierId}`,
                            message: `Un document de type "${request.documentTypeLabel}" est requis pour votre dossier.`,
                            data: {
                              documentRequestId: request._id || request.id,
                              dossierId: dossierId,
                              dossierNumero: dossier?.numero,
                              documentType: request.documentType,
                              documentTypeLabel: request.documentTypeLabel,
                              isUrgent: request.isUrgent
                            }
                          };
                          setSelectedDocumentRequestNotification(notification);
                          setShowDocumentRequestModal(true);
                        }}
                        className="mt-3 w-full"
                      >
                        📤 Envoyer le document
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historique et Timeline du dossier */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <History className="w-6 h-6" />
                  Historique et Timeline du dossier
                </h2>
                <button
                  onClick={() => {
                    setShowHistory(!showHistory);
                    if (!showHistory && history.length === 0) {
                      loadHistory();
                    }
                  }}
                  className="text-primary hover:text-primary/80 text-sm font-medium"
                >
                  {showHistory ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              
              {showHistory && (
                <>
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : history.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Aucun historique disponible</p>
                  ) : (
                    <div className="space-y-4">
                      {history.map((item: any, index: number) => (
                        <div key={index} className="border-l-4 border-primary pl-4 py-3 bg-gray-50/50 rounded-r-lg">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-2xl">{getHistoryTypeIcon(item.type)}</span>
                                <span className="font-semibold text-foreground">{getHistoryTypeLabel(item.type)}</span>
                              </div>
                              <p className="text-gray-700 mb-2">{item.description}</p>
                              {item.details && Object.keys(item.details).length > 0 && (
                                <div className="mt-2 text-sm text-gray-600 space-y-1">
                                  {item.details.newStatut && item.details.oldStatut && (
                                    <p>
                                      <span className="font-medium">Ancien statut:</span> {getStatutLabelWithEtapes(item.details.oldStatut, dossier?.etapesSupplementaires)} →
                                      <span className="font-medium"> Nouveau statut:</span> {getStatutLabelWithEtapes(item.details.newStatut, dossier?.etapesSupplementaires)}
                                    </p>
                                  )}
                                  {item.details.partenaire && (
                                    <p>
                                      <span className="font-medium">Partenaire:</span> {
                                        item.details.partenaire?.partenaireInfo?.nomOrganisme || 
                                        item.details.partenaire?.email || 
                                        'Partenaire'
                                      }
                                    </p>
                                  )}
                                  {item.details.status && (
                                    <p>
                                      <span className="font-medium">Statut:</span> {item.details.status}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-left sm:text-right text-sm text-gray-500 sm:ml-4 flex-shrink-0">
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {new Date(item.date).toLocaleDateString('fr-FR', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              {item.user && typeof item.user === 'object' && (
                                <p className="text-xs mt-1">
                                  {item.user.firstName} {item.user.lastName}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Historique des notifications */}
            {notifications.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Notifications récentes</h2>
                <div className="space-y-3">
                  {notifications.map((notif) => (
                    <div key={notif._id || notif.id} className="border-l-4 border-primary pl-4 py-2">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold">{notif.titre}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{notif.message}</p>
                        </div>
                        <span className="text-xs text-muted-foreground sm:ml-4 flex-shrink-0">
                          {new Date(notif.createdAt).toLocaleDateString('fr-FR', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - même largeur que le contenu sur mobile */}
          <div className="space-y-4 sm:space-y-6 min-w-0">
            {/* Actions rapides */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Actions</h2>
              <div className="space-y-2">
                <Link href="/client/documents" className="block">
                  <Button variant="outline" className="w-full min-h-[44px]">Voir les documents</Button>
                </Link>
                <Link href="/client/notifications" className="block">
                  <Button variant="outline" className="w-full min-h-[44px]">Voir les notifications</Button>
                </Link>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={async () => {
                    try {
                      // Export PDF du dossier
                      const pdfUrl = `/dossiers/${dossierId}/pdf`;
                      window.open(pdfUrl, '_blank');
                    } catch (error) {
                      console.error('Erreur lors de l\'export PDF:', error);
                      alert('Erreur lors de l\'export PDF');
                    }
                  }}
                >
                  📄 Exporter en PDF
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={async () => {
                    try {
                      // Export ZIP de tous les documents
                      if (documents.length === 0) {
                        alert('Aucun document à exporter');
                        return;
                      }
                      
                      // Créer un ZIP avec JSZip côté client
                      const JSZip = (await import('jszip')).default;
                      const zip = new JSZip();
                      
                      // Télécharger chaque document et l'ajouter au ZIP
                      for (const doc of documents) {
                        try {
                          const response = await documentsAPI.downloadDocument(doc._id || doc.id);
                          const { blobFromDownloadResponse, resolveFileNameFromDownloadResponse } = await import('@/lib/downloadFile');
                          const blob = blobFromDownloadResponse(response);
                          const fileName = resolveFileNameFromDownloadResponse(
                            response,
                            doc.originalName || doc.nom || doc.nomFichier || 'document'
                          );
                          zip.file(fileName, blob);
                        } catch (err) {
                          console.error(`Erreur lors du téléchargement de ${doc.nom}:`, err);
                        }
                      }
                      
                      // Générer le ZIP et le télécharger
                      const zipBlob = await zip.generateAsync({ type: 'blob' });
                      const url = window.URL.createObjectURL(zipBlob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `dossier-${dossier?.numero || dossierId}-documents.zip`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(url);
                    } catch (error) {
                      console.error('Erreur lors de l\'export ZIP:', error);
                      alert('Erreur lors de l\'export ZIP. Assurez-vous que tous les documents sont accessibles.');
                    }
                  }}
                >
                  📦 Exporter documents (ZIP)
                </Button>
              </div>
            </div>

            {/* Assigné à */}
            {dossier.assignedTo && (
              <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Assigné à</h2>
                <p className="text-muted-foreground">
                  {dossier.assignedTo.firstName} {dossier.assignedTo.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{dossier.assignedTo.email}</p>
              </div>
            )}

            {/* Documents du dossier */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
                <h2 className="text-lg sm:text-xl font-bold">📁 Documents du dossier</h2>
                <Button
                  variant={showDirectUploadForm ? 'outline' : 'default'}
                  className="min-h-[44px] w-full sm:w-auto"
                  onClick={() => {
                    setShowDirectUploadForm(!showDirectUploadForm);
                    setDirectUploadError(null);
                  }}
                >
                  {showDirectUploadForm ? 'Fermer' : 'Ajouter un document'}
                </Button>
              </div>

              {showDirectUploadForm && (
                <form onSubmit={handleDirectUpload} className="mb-4 p-3 sm:p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
                  {directUploadError && (
                    <p className="text-sm text-red-600">{directUploadError}</p>
                  )}
                  <div>
                    <label className="text-sm font-medium">Fichier(s) *</label>
                    <input
                      ref={directFileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      multiple
                      className="mt-1 w-full text-sm"
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
                    <label className="text-sm font-medium">Nom du document *</label>
                    <input
                      type="text"
                      value={directUploadData.nom}
                      onChange={(e) => setDirectUploadData((prev) => ({ ...prev, nom: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Ex: Contrat signé"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Catégorie</label>
                    <select
                      value={directUploadData.categorie}
                      onChange={(e) => setDirectUploadData((prev) => ({ ...prev, categorie: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="identite">Identité</option>
                      <option value="titre_sejour">Titre de séjour</option>
                      <option value="contrat">Contrat</option>
                      <option value="facture">Facture</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <textarea
                      value={directUploadData.description}
                      onChange={(e) => setDirectUploadData((prev) => ({ ...prev, description: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[72px]"
                      placeholder="Description (optionnelle)"
                    />
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px] w-full sm:w-auto"
                      onClick={() => {
                        setShowDirectUploadForm(false);
                        setDirectUploadError(null);
                      }}
                      disabled={directUploading}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="submit"
                      className="min-h-[44px] w-full sm:w-auto"
                      disabled={directUploading}
                    >
                      {directUploading ? 'Envoi...' : 'Envoyer le document'}
                    </Button>
                  </div>
                </form>
              )}

              {isLoadingDocuments ? (
                <p className="text-sm text-muted-foreground">Chargement...</p>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun document</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc: any) => {
                    const isConfidentialForClient = !!doc?.isConfidentialForClient || doc?.visibleToClient === false;
                    return (
                      <div
                        key={doc._id || doc.id}
                        id={`doc-${doc._id || doc.id}`}
                        className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border transition-colors ${
                          targetDocId === String(doc._id || doc.id)
                            ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-lg flex-shrink-0">📄</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{doc.nom}</p>
                          </div>
                        </div>
                        {isConfidentialForClient ? (
                          <div className="text-xs font-semibold text-red-700">
                            Accès non autorisé à ce document
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              className="text-xs min-h-[40px] flex-1 sm:flex-none min-w-0"
                              onClick={() => {
                                setSelectedDocumentForPreview(doc);
                                setShowDocumentPreviewModal(true);
                              }}
                            >
                              👁️ Voir
                            </Button>
                            <Button
                              variant="outline"
                              className="text-xs min-h-[40px] flex-1 sm:flex-none min-w-0"
                              onClick={async () => {
                                try {
                                  await documentsAPI.downloadAndSave(doc._id || doc.id, doc.nom);
                                } catch (error) {
                                  console.error('Erreur lors du téléchargement:', error);
                                  alert('Erreur lors du téléchargement du document');
                                }
                              }}
                            >
                              ⬇️ Télécharger
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Statistiques */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Statistiques</h2>
              <div className="space-y-2">
                {documents.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Documents</span>
                    <span className="font-medium">{documents.length}</span>
                  </div>
                )}
                {dossier.messages && dossier.messages.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Messages</span>
                    <span className="font-medium">{dossier.messages.length}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Notifications</span>
                  <span className="font-medium">{notifications.length}</span>
                </div>
              </div>
            </div>

            {/* Messagerie liée au dossier */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Messagerie du dossier</h2>
              {isLoadingMessages ? (
                <p className="text-sm text-muted-foreground">Chargement des messages...</p>
              ) : messagesError ? (
                <p className="text-sm text-red-600">{messagesError}</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun message pour ce dossier pour le moment. Vous pouvez écrire à l'équipe juridique depuis la page Messagerie.
                </p>
              ) : (
                <div className="space-y-3">
                  {messages.slice(0, 5).map((msg: any) => (
                    <div
                      key={msg._id || msg.id}
                      className="border border-gray-100 rounded-lg px-3 py-2 text-sm"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2 mb-1">
                        <p className="font-semibold break-words min-w-0">{msg.sujet}</p>
                        <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap sm:whitespace-normal sm:text-right">
                          {new Date(msg.createdAt).toLocaleDateString('fr-FR', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {msg.contenu}
                      </p>
                    </div>
                  ))}
                  <Link href="/client/messages" className="block mt-2">
                    <Button variant="outline" className="w-full text-xs min-h-[44px]">
                      Voir tous les messages
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de demande de document */}
      <DocumentRequestNotificationModal
        isOpen={showDocumentRequestModal}
        onClose={() => {
          setShowDocumentRequestModal(false);
          setSelectedDocumentRequestNotification(null);
          loadDocumentRequests();
          loadNotifications();
        }}
        notification={selectedDocumentRequestNotification}
        onDocumentSent={async () => {
          // Recharger les demandes de documents (seules les demandes en attente seront affichées)
          await loadDocumentRequests();
          // Recharger les notifications (la notification de demande sera marquée comme lue)
          await loadNotifications();
          // Recharger les documents pour afficher les nouveaux documents envoyés
          await loadDocuments();
        }}
      />

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


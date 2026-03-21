'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { DossierDetailView } from '@/components/DossierDetailView';
import { DossierDraftsPanel } from '@/components/DossierDraftsPanel';
import { dossiersAPI, notificationsAPI, messagesAPI, documentRequestsAPI, documentsAPI, tasksAPI } from '@/lib/api';
import { DocumentRequestNotificationModal } from '@/components/DocumentRequestNotificationModal';
import { DocumentPreview } from '@/components/DocumentPreview';
import { getStatutColor, getStatutLabel, getPrioriteColor, calculateDaysSince, formatRelativeTime, getNextAction } from '@/lib/dossierUtils';
import { getStatutColor as getTaskStatutColor, getStatutLabel as getTaskStatutLabel, getPrioriteColor as getTaskPrioriteColor, getPrioriteLabel as getTaskPrioriteLabel } from '@/lib/taskUtils';
import { History, Clock, CheckCircle, XCircle } from 'lucide-react';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent',
    ghost: 'hover:bg-accent',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

export default function PartenaireDossierDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const dossierId = params?.id as string;
  
  const [dossier, setDossier] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [documentRequests, setDocumentRequests] = useState<any[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [selectedDocumentRequestNotification, setSelectedDocumentRequestNotification] = useState<any>(null);
  const [showDocumentRequestModal, setShowDocumentRequestModal] = useState(false);
  const [selectedDocumentForPreview, setSelectedDocumentForPreview] = useState<any>(null);
  const [showDocumentPreviewModal, setShowDocumentPreviewModal] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [showAcknowledgeModal, setShowAcknowledgeModal] = useState(false);
  const [acknowledgeAction, setAcknowledgeAction] = useState<'accept' | 'refuse' | null>(null);
  const [acknowledgeNotes, setAcknowledgeNotes] = useState('');
  const [discharging, setDischarging] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  
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
      loadTasks();
      if (showHistory) {
        loadHistory();
      }
    } else if (token) {
      loadDossier();
      loadNotifications();
      loadDocumentRequests();
      loadDocuments();
      loadTasks();
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
      const response = await documentsAPI.getAllDocuments();
      if (response.data.success) {
        const allDocuments = response.data.documents || response.data.data || [];
        const dossierDocuments = allDocuments.filter((doc: any) => 
          doc.dossierId && (doc.dossierId._id || doc.dossierId).toString() === dossierId.toString()
        );
        setDocuments(dossierDocuments);
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

  const loadTasks = async () => {
    if (!dossierId) return;
    
    setIsLoadingTasks(true);
    try {
      const response = await tasksAPI.getDossierTasks(dossierId);
      if (response.data.success) {
        setTasks(response.data.tasks || []);
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des tâches:', err);
      // Ne pas bloquer l'affichage si les tâches ne peuvent pas être chargées
      setTasks([]);
    } finally {
      setIsLoadingTasks(false);
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
  
  const getTransmission = () => {
    if (!dossier || !dossier.transmittedTo) return null;
    const userId = (session?.user as any)?._id || (session?.user as any)?.id;
    return dossier.transmittedTo.find((t: any) => 
      (t.partenaire?._id?.toString() || t.partenaire?.toString()) === userId
    );
  };
  
  const handleAcknowledge = async () => {
    if (!acknowledgeAction) return;
    
    try {
      setAcknowledging(true);
      await dossiersAPI.acknowledgeDossier(dossierId, acknowledgeAction, acknowledgeNotes);
      setShowAcknowledgeModal(false);
      setAcknowledgeAction(null);
      setAcknowledgeNotes('');
      loadDossier();
    } catch (error: any) {
      console.error('Erreur lors de l\'accusé de réception:', error);
      alert(error.response?.data?.message || 'Erreur lors de l\'accusé de réception');
    } finally {
      setAcknowledging(false);
    }
  };
  
  const handleDischarge = async () => {
    try {
      setDischarging(true);
      await dossiersAPI.dischargeDossier(dossierId, dischargeNotes);
      setShowDischargeModal(false);
      setDischargeNotes('');
      alert('Vous vous êtes déchargé du dossier avec succès. Le dossier reste disponible pour les administrateurs.');
      // Rediriger vers la liste des dossiers
      router.push('/partenaire/dossiers');
    } catch (error: any) {
      console.error('Erreur lors de la décharge:', error);
      alert(error.response?.data?.message || 'Erreur lors de la décharge du dossier');
    } finally {
      setDischarging(false);
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
            <Link href="/partenaire/dossiers">
              <Button>Retour aux dossiers</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }
  
  const transmission = getTransmission();
  const statusTransmission = transmission?.status || 'pending';
  // Le partenaire peut accuser réception lorsqu'un dossier est en attente,
  // mais aussi lorsqu'il l'a précédemment refusé (pour pouvoir l'accepter à nouveau)
  const canAcknowledge = statusTransmission === 'pending' || statusTransmission === 'refused';
  
  const draftAccessNotifs = (notifications || []).filter((n: any) => n.type === 'draft_access_granted' && !n.lu);
  const handleMarkDraftAccessAsRead = async () => {
    for (const notif of draftAccessNotifs) {
      try {
        await notificationsAPI.markAsRead(notif._id);
      } catch (_) {}
    }
    loadNotifications();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10 max-w-[100vw]">
      <main className="w-full max-w-[100vw] px-3 sm:px-4 py-4 sm:py-8 overflow-x-hidden">
        {/* Bannière visible : accès document en préparation accordé */}
        {draftAccessNotifs.length > 0 && (
          <div className="mb-6 rounded-xl border-2 border-orange-400 bg-gradient-to-r from-orange-50 to-amber-50 shadow-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white text-lg">
                ✓
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-orange-900 text-base mb-1">Accès accordé à un document en préparation</h3>
                <p className="text-sm text-orange-800 mb-2">
                  {draftAccessNotifs.length === 1
                    ? draftAccessNotifs[0].message
                    : `Vous avez reçu des accès à ${draftAccessNotifs.length} document(s) en préparation sur ce dossier. Consultez la section « Documents en préparation » ci-dessous.`}
                </p>
                <button
                  type="button"
                  onClick={handleMarkDraftAccessAsRead}
                  className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
                >
                  J'ai compris
                </button>
              </div>
            </div>
          </div>
        )}

        {/* En-tête amélioré */}
        <div className="mb-6">
          <Link href="/partenaire/dossiers" className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-4 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
        Retour aux dossiers
      </Link>
      
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6 overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <h1 className="text-xl sm:text-3xl font-bold text-foreground break-words">{dossier.titre || 'Sans titre'}</h1>
                  {(dossier.numero || dossier.numeroDossier) && (
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-sm font-semibold">
                      N° {dossier.numero || dossier.numeroDossier}
                    </span>
            )}
          {transmission && (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      statusTransmission === 'accepted' ? 'bg-green-100 text-green-800' :
                      statusTransmission === 'refused' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
                      {statusTransmission === 'accepted' ? 'Accepté' :
                       statusTransmission === 'refused' ? 'Refusé' :
               'En attente'}
            </span>
          )}
        </div>
                {dossier.description && (
                  <p className="text-muted-foreground text-sm mb-3">{dossier.description}</p>
                )}
        
                {/* Barre de progression basée uniquement sur les étapes choisies pour ce dossier */}
                {Array.isArray(dossier.etapesSupplementaires) && dossier.etapesSupplementaires.length > 0 && (() => {
                  const rawSteps = dossier.etapesSupplementaires;
                  const currentIndex = rawSteps.findIndex(
                    (s: any) =>
                      dossier.statut &&
                      (dossier.statut === s.id || dossier.statut === s.label)
                  );
                  return (
                    <div className="mb-4 pb-4 border-b border-gray-200 overflow-x-auto">
                      <div className="flex items-center gap-2 min-w-max">
                        {rawSteps.map((step: any, index: number) => {
                          const isCurrent =
                            currentIndex === -1
                              ? index === rawSteps.length - 1
                              : index === currentIndex;
                          const completed = currentIndex === -1 ? false : index <= currentIndex;
                          const dateLabel =
                            step.date
                              ? (typeof step.date === 'string'
                                  ? step.date
                                  : new Date(step.date).toLocaleDateString('fr-FR'))
                              : undefined;
                          return (
                            <div key={step._id || step.id || index} className="flex items-center gap-2 flex-shrink-0">
                              <div className="flex flex-col items-center gap-1">
                                <span
                                  className={`w-3 h-3 rounded-full flex-shrink-0 ${
                                    isCurrent
                                      ? 'bg-blue-500 ring-2 ring-blue-300'
                                      : completed
                                      ? 'bg-green-500'
                                      : 'bg-gray-300'
                                  }`}
                                ></span>
                                <span
                                  className={`text-[10px] font-medium whitespace-nowrap ${
                                    isCurrent
                                      ? 'text-blue-700'
                                      : completed
                                      ? 'text-green-700'
                                      : 'text-gray-400'
                                  }`}
                                >
                                  {step.label}
                                  {dateLabel ? ` (${dateLabel})` : ''}
                                </span>
                              </div>
                              {index < rawSteps.length - 1 && (
                                <div
                                  className={`h-0.5 w-6 flex-shrink-0 ${
                                    completed ? 'bg-green-500' : 'bg-gray-300'
                                  }`}
                                ></div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                
                {/* Statuts et informations rapides */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${getStatutColor(dossier.statut)}`}>
                    {getStatutLabel(dossier.statut)}
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
          </div>
              
              <div className="flex flex-row flex-wrap gap-2 w-full sm:w-auto sm:flex-col">
                <Button variant="outline" onClick={() => { loadDossier(); loadNotifications(); }} className="min-h-[44px] flex-1 sm:flex-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualiser
                </Button>
                {transmission && (
                  <Button variant="outline" className="min-h-[44px] flex-1 sm:flex-none border-orange-500 text-orange-600 hover:bg-orange-50" onClick={() => setShowDischargeModal(true)}>
                    Se décharger
                  </Button>
                )}
              </div>
            </div>
            
            {/* Informations de transmission */}
        {transmission && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="font-semibold mb-2 text-foreground">Informations de transmission</h3>
                <p className="text-sm text-muted-foreground">
              Transmis le {new Date(transmission.transmittedAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
            {transmission.notes && (
                  <p className="text-sm text-foreground mt-2">
                    <strong>Notes:</strong> {transmission.notes}
              </p>
            )}
          </div>
        )}
        
            {/* Boutons d'accusé de réception */}
        {canAcknowledge && (
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4 sm:mt-6">
            <button
              onClick={() => { setAcknowledgeAction('accept'); setShowAcknowledgeModal(true); }}
              className="flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors w-full sm:w-auto"
            >
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              Accepter le dossier
            </button>
            <button
              onClick={() => { setAcknowledgeAction('refuse'); setShowAcknowledgeModal(true); }}
              className="flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors w-full sm:w-auto"
            >
              <XCircle className="w-5 h-5 flex-shrink-0" />
              Refuser le dossier
            </button>
          </div>
        )}
            
            {/* Prochaine action */}
            {(() => {
              const nextAction = getNextAction(dossier.statut);
              if (nextAction) {
                return (
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg mt-4">
                    <div className="flex items-start gap-3">
                      <span className="text-blue-600 text-xl">📋</span>
                      <div>
                        <p className="text-sm font-semibold text-blue-900 mb-1">Prochaine action requise</p>
                        <p className="text-sm text-blue-700">{nextAction}</p>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Vue détaillée avec téléchargement et impression */}
        <DossierDetailView dossier={dossier} variant="partenaire" />

        <div className="grid grid-cols-1 gap-4 sm:gap-6 mt-6 sm:mt-8">
          {/* Informations principales */}
          <div className="space-y-4 sm:space-y-6 min-w-0">
            {/* Statut actuel */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Statut actuel</h2>
              <div className="flex items-center gap-4">
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatutColor(dossier.statut)}`}>
                  {getStatutLabel(dossier.statut)}
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
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold mb-4">Description</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">{dossier.description}</p>
              </div>
            )}

            {/* Informations complètes du dossier */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">📋 Informations Complètes du Dossier</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Numéro de dossier</p>
                  <p className="font-bold text-lg text-primary">{dossier.numero || dossier._id}</p>
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
      
            {/* Coordonnées client */}
            {dossier.user && typeof dossier.user === 'object' && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold mb-4">👤 Informations Client</h2>
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
                </div>
              </div>
            )}

            {/* Demandes de documents en attente */}
            {documentRequests.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold mb-4">📄 Demandes de documents en attente</h2>
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
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
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
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historique et Timeline du dossier */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
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
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-2xl">{getHistoryTypeIcon(item.type)}</span>
                                <span className="font-semibold text-foreground">{getHistoryTypeLabel(item.type)}</span>
                              </div>
                              <p className="text-gray-700 mb-2">{item.description}</p>
                              {item.details && Object.keys(item.details).length > 0 && (
                                <div className="mt-2 text-sm text-gray-600 space-y-1">
                                  {item.details.newStatut && item.details.oldStatut && (
                                    <p>
                                      <span className="font-medium">Ancien statut:</span> {getStatutLabel(item.details.oldStatut)} → 
                                      <span className="font-medium"> Nouveau statut:</span> {getStatutLabel(item.details.newStatut)}
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
                            <div className="text-right text-sm text-gray-500 ml-4">
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

            {/* Historique des notifications (repliable, plié par défaut) */}
            {notifications.length > 0 && (
              <details className="bg-white rounded-lg shadow-lg">
                <summary className="list-none cursor-pointer p-4 sm:p-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Notifications récentes</h2>
                    <p className="text-xs text-muted-foreground">
                      {notifications.length} notification{notifications.length > 1 ? 's' : ''} pour ce dossier
                    </p>
                  </div>
                  <span className="ml-4 text-gray-500 text-sm select-none">
                    Afficher / masquer
                  </span>
                </summary>
                <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                  <div className="space-y-3">
                    {notifications.slice(0, 5).map((notif) => (
                      <div key={notif._id || notif.id} className="border-l-4 border-primary pl-4 py-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">{notif.titre}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{notif.message}</p>
                          </div>
                          <span className="text-xs text-muted-foreground ml-4">
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
              </details>
            )}
          </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions rapides */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">Actions</h2>
              <div className="space-y-2">
                <Link href={`/partenaire/dossiers/${dossierId}/documents`} className="block">
                  <Button variant="outline" className="w-full">Voir les documents</Button>
                </Link>
                <Link href={`/partenaire/dossiers/${dossierId}/messages`} className="block">
                  <Button variant="outline" className="w-full">Voir les messages</Button>
                </Link>
                <Link href="/partenaire/notifications" className="block">
                  <Button variant="outline" className="w-full">Voir les notifications</Button>
        </Link>
              </div>
            </div>

            {/* Documents du dossier */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">📁 Documents du dossier</h2>
              {isLoadingDocuments ? (
                <p className="text-sm text-muted-foreground">Chargement...</p>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun document</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc: any) => (
                    <div
                      key={doc._id || doc.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-lg">📄</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{doc.nom}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          className="text-xs h-8"
                          onClick={() => {
                            setSelectedDocumentForPreview(doc);
                            setShowDocumentPreviewModal(true);
                          }}
                        >
                          👁️ Voir
                        </Button>
                        <Button
                          variant="outline"
                          className="text-xs h-8"
                          onClick={async () => {
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
                            } catch (error) {
                              console.error('Erreur lors du téléchargement:', error);
                              alert('Erreur lors du téléchargement du document');
                            }
                          }}
                        >
                          ⬇️ Télécharger
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tâches du dossier */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">✅ Tâches du dossier</h2>
              {isLoadingTasks ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Chargement des tâches...</p>
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Aucune tâche pour ce dossier</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task: any) => (
                    <div
                      key={task._id || task.id}
                      className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
        >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="font-semibold text-foreground">{task.titre}</h3>
                            <span className={`text-xs px-2 py-1 rounded ${getTaskStatutColor(task.statut)}`}>
                              {getTaskStatutLabel(task.statut)}
                            </span>
                            {task.priorite && (
                              <span className={`text-xs px-2 py-1 rounded ${getTaskPrioriteColor(task.priorite)}`}>
                                {getTaskPrioriteLabel(task.priorite)}
                              </span>
                            )}
                          </div>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{task.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                            {task.createdBy && (
                              <span>
                                Créé par: {task.createdBy.firstName} {task.createdBy.lastName}
                              </span>
                            )}
                            {task.dateEcheance && (
                              <span>
                                Échéance: {new Date(task.dateEcheance).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                            {task.dateDebut && (
                              <span>
                                Début: {new Date(task.dateDebut).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            {/* Messages récents */}
            {messages.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold mb-4">💬 Messages récents</h2>
                <div className="space-y-2">
                  {messages.slice(0, 3).map((message: any) => (
        <Link
                      key={message._id || message.id}
                      href={`/partenaire/dossiers/${dossierId}/messages`}
                      className="block p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      <p className="font-semibold text-sm truncate">{message.sujet || 'Sans sujet'}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{message.contenu}</p>
                    </Link>
                  ))}
                </div>
                <Link href={`/partenaire/dossiers/${dossierId}/messages`} className="block mt-3">
                  <Button variant="outline" className="w-full text-xs">Voir tous les messages</Button>
        </Link>
      </div>
            )}
          </div>
        </div>

        {/* Documents en préparation (brouillons collaboratifs internes) — même affichage que l'admin */}
        <DossierDraftsPanel
          dossierId={dossier._id || (dossier as any).id}
          linkToDedicatedPageHref={`/partenaire/dossiers/${dossierId}/documents-en-preparation`}
        />
      </main>
      
      {/* Modal d'accusé de réception */}
      {showAcknowledgeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">
              {acknowledgeAction === 'accept' ? 'Accepter le dossier' : 'Refuser le dossier'}
            </h2>
            <p className="text-gray-600 mb-4">
              {acknowledgeAction === 'accept' 
                ? 'Vous confirmez accepter ce dossier et vous engagez à le traiter.'
                : 'Vous confirmez refuser ce dossier. Veuillez indiquer la raison.'}
            </p>
            <textarea
              value={acknowledgeNotes}
              onChange={(e) => setAcknowledgeNotes(e.target.value)}
              placeholder={acknowledgeAction === 'accept' ? 'Notes optionnelles...' : 'Raison du refus...'}
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
              rows={4}
            />
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <button
                onClick={() => { setShowAcknowledgeModal(false); setAcknowledgeAction(null); setAcknowledgeNotes(''); }}
                className="flex-1 min-h-[44px] px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={acknowledging}
              >
                Annuler
              </button>
              <button
                onClick={handleAcknowledge}
                className={`flex-1 min-h-[44px] px-4 py-2 rounded-lg text-white ${
                  acknowledgeAction === 'accept' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
                disabled={acknowledging}
              >
                {acknowledging ? 'Traitement...' : acknowledgeAction === 'accept' ? 'Accepter' : 'Refuser'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de décharge */}
      {showDischargeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full mx-3 sm:mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Se décharger du dossier</h2>
            <p className="text-gray-600 mb-4">
              Vous allez vous décharger de ce dossier. Le dossier ne sera <strong>pas supprimé</strong> et restera disponible pour les administrateurs. 
              Vous ne pourrez plus y accéder depuis votre compte partenaire.
            </p>
            <p className="text-sm text-orange-600 mb-4 font-semibold">
              ⚠️ Cette action est irréversible. Vous devrez attendre qu'un administrateur vous transmette à nouveau le dossier pour y accéder.
            </p>
            <textarea
              value={dischargeNotes}
              onChange={(e) => setDischargeNotes(e.target.value)}
              placeholder="Raison de la décharge (optionnel)..."
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
              rows={4}
            />
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <button
                onClick={() => { setShowDischargeModal(false); setDischargeNotes(''); }}
                className="flex-1 min-h-[44px] px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={discharging}
              >
                Annuler
              </button>
              <button
                onClick={handleDischarge}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-lg text-white bg-orange-600 hover:bg-orange-700"
                disabled={discharging}
              >
                {discharging ? 'Traitement...' : 'Confirmer la décharge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de prévisualisation de document */}
      {showDocumentPreviewModal && selectedDocumentForPreview && (
        <DocumentPreview
          document={selectedDocumentForPreview}
          isOpen={showDocumentPreviewModal}
          onClose={() => {
            setShowDocumentPreviewModal(false);
            setSelectedDocumentForPreview(null);
          }}
        />
      )}

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
          await loadDocumentRequests();
          await loadNotifications();
          await loadDossier();
        }}
      />
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { dossiersAPI, messagesAPI } from '@/lib/api';
import { ArrowLeft, CheckCircle, XCircle, FileText, Calendar, MessageSquare, History, Clock } from 'lucide-react';
import Link from 'next/link';

export default function PartenaireDossierDetailPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const dossierId = params.id as string;
  
  const [dossier, setDossier] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [showAcknowledgeModal, setShowAcknowledgeModal] = useState(false);
  const [acknowledgeAction, setAcknowledgeAction] = useState<'accept' | 'refuse' | null>(null);
  const [acknowledgeNotes, setAcknowledgeNotes] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  useEffect(() => {
    if (dossierId) {
      loadDossier();
      loadMessages();
    }
  }, [dossierId]);
  
  const loadMessages = async () => {
    try {
      setLoadingMessages(true);
      const response = await messagesAPI.getMessages({ 
        type: 'all',
        dossierId: dossierId 
      });
      if (response.data.success) {
        const allMessages = response.data.messages || [];
        const threads = response.data.threads || [];
        
        // Si on a des threads, extraire tous les messages
        if (threads.length > 0) {
          const messagesFromThreads: any[] = [];
          threads.forEach((thread: any) => {
            if (thread.messages && Array.isArray(thread.messages)) {
              messagesFromThreads.push(...thread.messages);
            } else if (thread.root) {
              messagesFromThreads.push(thread.root);
            }
            if (thread.replies && Array.isArray(thread.replies)) {
              messagesFromThreads.push(...thread.replies);
            }
          });
          setMessages(messagesFromThreads.length > 0 ? messagesFromThreads.slice(0, 5) : allMessages.slice(0, 5));
        } else {
          setMessages(allMessages.slice(0, 5)); // Afficher les 5 derniers messages
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement des messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };
  
  const loadDossier = async () => {
    try {
      setLoading(true);
      const response = await dossiersAPI.getDossierById(dossierId);
      if (response.data.success && response.data.dossier && typeof response.data.dossier === 'object') {
        setDossier(response.data.dossier);
      } else {
        console.error('Dossier invalide reçu:', response.data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du dossier:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await dossiersAPI.getDossierHistory(dossierId);
      if (response.data.success) {
        setHistory(response.data.history || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement de l\'historique:', error);
    } finally {
      setLoadingHistory(false);
    }
  };
  
  const getStatutLabel = (statut: string) => {
    const labels: { [key: string]: string } = {
      recu: 'Reçu',
      accepte: 'Accepté',
      refuse: 'Refusé',
      annule: 'Annulé',
      en_attente_onboarding: 'En attente d\'onboarding',
      en_cours_instruction: 'En cours d\'instruction',
      pieces_manquantes: 'Pièces manquantes',
      dossier_complet: 'Dossier complet',
      depose: 'Déposé',
      reception_confirmee: 'Réception confirmée',
      complement_demande: 'Complément demandé',
      decision_defavorable: 'Décision défavorable',
      communication_motifs: 'Communication des motifs',
      recours_preparation: 'Recours en préparation',
      refere_mesures_utiles: 'Référé mesures utiles',
      refere_suspension_rep: 'Référé suspension REP',
      gain_cause: 'Gain de cause',
      rejet: 'Rejet',
      decision_favorable: 'Décision favorable',
      autre: 'Autre'
    };
    return labels[statut] || statut;
  };
  
  const getHistoryTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      creation: 'Création',
      modification: 'Modification',
      statut_change: 'Changement de statut',
      transmission: 'Transmission',
      acknowledgment: 'Accusé de réception',
      suppression: 'Suppression'
    };
    return labels[type] || type;
  };
  
  const getHistoryTypeIcon = (type: string) => {
    switch (type) {
      case 'creation':
        return '✨';
      case 'statut_change':
        return '🔄';
      case 'transmission':
        return '📤';
      case 'acknowledgment':
        return '✅';
      case 'modification':
        return '✏️';
      default:
        return '📝';
    }
  };
  
  const getTransmission = () => {
    if (!dossier || !dossier.transmittedTo) return null;
    const userId = (session?.user as any)?._id || (session?.user as any)?.id;
    return dossier.transmittedTo.find((t: any) => 
      (t.partenaire?._id?.toString() || t.partenaire?.toString()) === userId
    );
  };
  
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    // Si c'est un objet, ne pas le convertir, retourner une chaîne vide
    if (typeof value === 'object') {
      console.warn('Tentative de convertir un objet en string:', value);
      return '';
    }
    return '';
  };
  
  const handleAcknowledge = async () => {
    if (!acknowledgeAction) return;
    
    try {
      setAcknowledging(true);
      await dossiersAPI.acknowledgeDossier(dossierId, acknowledgeAction, acknowledgeNotes);
      setShowAcknowledgeModal(false);
      setAcknowledgeAction(null);
      setAcknowledgeNotes('');
      loadDossier(); // Recharger le dossier
    } catch (error: any) {
      console.error('Erreur lors de l\'accusé de réception:', error);
      alert(error.response?.data?.message || 'Erreur lors de l\'accusé de réception');
    } finally {
      setAcknowledging(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!dossier || typeof dossier !== 'object') {
    return (
      <div className="p-6">
        <p className="text-red-500">Dossier non trouvé</p>
      </div>
    );
  }
  
  // S'assurer que dossier est un objet valide et non un tableau ou autre chose
  if (Array.isArray(dossier)) {
    return (
      <div className="p-6">
        <p className="text-red-500">Format de dossier invalide</p>
      </div>
    );
  }
  
  const transmission = getTransmission();
  const status = transmission?.status || 'pending';
  const canAcknowledge = status === 'pending';
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10">
      <main className="w-full px-4 py-8 overflow-x-hidden">
        {/* En-tête amélioré */}
        <div className="mb-6">
          <Link 
            href="/partenaire/dossiers"
            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-4 transition-colors"
          >
        <ArrowLeft className="w-4 h-4" />
        Retour aux dossiers
      </Link>
      
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6 overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-foreground">{safeString(dossier.titre) || safeString(dossier.numero) || 'Sans titre'}</h1>
                  {safeString(dossier.numero) && (
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-sm font-semibold">
                      N° {safeString(dossier.numero)}
                    </span>
                  )}
                </div>
                {safeString(dossier.description) && (
                  <p className="text-muted-foreground text-sm mb-3">{safeString(dossier.description)}</p>
                )}
              </div>
              {transmission && (
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${
                  status === 'accepted' ? 'bg-green-100 text-green-800' :
                  status === 'refused' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {status === 'accepted' ? 'Accepté' :
                   status === 'refused' ? 'Refusé' :
                   'En attente'}
                </span>
              )}
            </div>
            
            {dossier.user && typeof dossier.user === 'object' && (
              <div className="mb-4">
                <h3 className="font-semibold mb-2 text-foreground">Client</h3>
                <p className="text-muted-foreground">
                  {safeString(dossier.user.firstName)} {safeString(dossier.user.lastName)}
                  {safeString(dossier.user.email) && ` (${safeString(dossier.user.email)})`}
                </p>
              </div>
            )}
            
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
                    <strong>Notes:</strong> {safeString(transmission.notes)}
                  </p>
                )}
              </div>
            )}
        
        {canAcknowledge && (
          <div className="flex gap-4 mt-6">
            <button
              onClick={() => {
                setAcknowledgeAction('accept');
                setShowAcknowledgeModal(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <CheckCircle className="w-5 h-5" />
              Accepter le dossier
            </button>
            <button
              onClick={() => {
                setAcknowledgeAction('refuse');
                setShowAcknowledgeModal(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <XCircle className="w-5 h-5" />
              Refuser le dossier
            </button>
          </div>
        )}
      </div>
      
        {/* Informations détaillées du dossier */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-foreground">Informations du dossier</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Statut</p>
              <p className="font-semibold text-foreground">{getStatutLabel(dossier.statut || 'recu')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Catégorie</p>
              <p className="font-semibold text-foreground">{safeString(dossier.categorie) || 'Non spécifiée'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Type</p>
              <p className="font-semibold text-foreground">{safeString(dossier.type) || 'Non spécifié'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Priorité</p>
              <p className="font-semibold capitalize text-foreground">{safeString(dossier.priorite) || 'Normale'}</p>
            </div>
            {dossier.dateEcheance && (
              <div>
                <p className="text-sm text-muted-foreground">Date d'échéance</p>
                <p className="font-semibold text-foreground">
                  {new Date(dossier.dateEcheance).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Date de création</p>
              <p className="font-semibold text-foreground">
                {new Date(dossier.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
        </div>
        
        {/* Section Messages récents */}
        {messages.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground flex items-center">
                <MessageSquare className="w-5 h-5 mr-2" />
                Messages récents
              </h2>
              <Link
                href={`/partenaire/dossiers/${dossierId}/messages`}
                className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
              >
                Voir tous les messages →
              </Link>
            </div>
          
            {loadingMessages ? (
              <p className="text-sm text-muted-foreground">Chargement des messages...</p>
            ) : (
              <div className="space-y-3">
                {messages.map((message: any) => {
                  const isFromMe = message.expediteur?._id?.toString() === (session?.user as any)?._id || 
                                  message.expediteur?.toString() === (session?.user as any)?._id;
                  
                  return (
                    <div
                      key={message._id || message.id}
                      className={`border border-gray-200 rounded-lg p-4 ${isFromMe ? 'bg-blue-50' : 'bg-gray-50'}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm text-foreground">
                            {message.sujet || 'Sans sujet'}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {isFromMe 
                              ? 'Vous' 
                              : `${message.expediteur?.firstName || ''} ${message.expediteur?.lastName || ''}`.trim() || message.expediteur?.email || 'Expéditeur'
                            }
                            {' • '}
                            {new Date(message.createdAt || message.dateCreation || new Date()).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">
                        {message.contenu}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
        {/* Sections Documents, Messages, Rendez-vous, Historique */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Link
            href={`/partenaire/dossiers/${dossierId}/documents`}
            className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg hover:border-primary/30 transition-all duration-200"
          >
            <FileText className="w-8 h-8 text-primary mb-2" />
            <h3 className="font-semibold text-foreground">Documents</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {dossier.documents?.length || 0} document(s)
            </p>
          </Link>
          
          <Link
            href={`/partenaire/dossiers/${dossierId}/messages`}
            className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg hover:border-primary/30 transition-all duration-200"
          >
            <MessageSquare className="w-8 h-8 text-primary mb-2" />
            <h3 className="font-semibold text-foreground">Messages</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {messages.length} message(s) récent(s)
            </p>
          </Link>
          
          <Link
            href={`/partenaire/dossiers/${dossierId}/rendez-vous`}
            className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg hover:border-primary/30 transition-all duration-200"
          >
            <Calendar className="w-8 h-8 text-primary mb-2" />
            <h3 className="font-semibold text-foreground">Rendez-vous</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {dossier.rendezVous?.length || 0} rendez-vous
            </p>
          </Link>
          
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory && history.length === 0) {
                loadHistory();
              }
            }}
            className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg hover:border-primary/30 transition-all duration-200 text-left"
          >
            <History className="w-8 h-8 text-primary mb-2" />
            <h3 className="font-semibold text-foreground">Historique</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Voir l'historique
            </p>
          </button>
        </div>
        
        {/* Historique du dossier */}
        {showHistory && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <History className="w-6 h-6" />
              Historique du dossier
            </h2>
            <button
              onClick={() => setShowHistory(false)}
              className="text-gray-600 hover:text-gray-800"
            >
              Fermer
            </button>
          </div>
          
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : history.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Aucun historique disponible</p>
          ) : (
            <div className="space-y-4">
              {history.map((item: any, index: number) => (
                <div key={index} className="border-l-4 border-primary pl-4 py-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">{getHistoryTypeIcon(item.type)}</span>
                        <span className="font-semibold">{getHistoryTypeLabel(item.type)}</span>
                      </div>
                      <p className="text-gray-700">{item.description}</p>
                      {item.details && Object.keys(item.details).length > 0 && (
                        <div className="mt-2 text-sm text-gray-600">
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
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm text-gray-500">
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
                          {safeString(item.user.firstName)} {safeString(item.user.lastName)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
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
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowAcknowledgeModal(false);
                  setAcknowledgeAction(null);
                  setAcknowledgeNotes('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={acknowledging}
              >
                Annuler
              </button>
              <button
                onClick={handleAcknowledge}
                className={`flex-1 px-4 py-2 rounded-lg text-white ${
                  acknowledgeAction === 'accept' 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
                disabled={acknowledging}
              >
                {acknowledging ? 'Traitement...' : acknowledgeAction === 'accept' ? 'Accepter' : 'Refuser'}
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}


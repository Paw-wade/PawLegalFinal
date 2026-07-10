'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { messagesAPI, dossiersAPI } from '@/lib/api';
import { Toast } from '@/components/Toast';

function Button({ children, variant = 'default', size = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses = {
    default: 'bg-primary text-white hover:bg-primary/90 shadow-sm hover:shadow',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow',
  };
  const sizeClasses = {
    default: 'px-4 py-2 text-sm',
    sm: 'px-3 py-1.5 text-xs',
    lg: 'px-6 py-3 text-base',
  };
  return (
    <button 
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
}

function Input({ className = '', ...props }: any) {
  return (
    <input
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
      className={`flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none ${className}`}
      {...props}
    />
  );
}

export default function PartenaireMessagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'received' | 'sent' | 'unread'>('received');
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    sujet: '',
    contenu: '',
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyData, setReplyData] = useState({
    sujet: '',
    contenu: '',
  });
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [isReplying, setIsReplying] = useState(false);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [selectedDossierId, setSelectedDossierId] = useState<string>('');
  const [composeDossierId, setComposeDossierId] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  // Gérer les query params pour pré-sélectionner le dossier et ouvrir le modal
  useEffect(() => {
    const dossierIdParam = searchParams?.get('dossierId');
    const actionParam = searchParams?.get('action');
    
    if (dossierIdParam) {
      setSelectedDossierId(dossierIdParam);
      
      // Si action=send, ouvrir le modal de composition
      if (actionParam === 'send') {
        setShowComposeModal(true);
    }
    }
  }, [searchParams]);
  
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      loadDossiers();
    loadMessages();
    }
  }, [session, status, router, filter, selectedDossierId]);
  
  const loadMessages = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = { type: filter };
      if (selectedDossierId) {
        params.dossierId = selectedDossierId;
      }
      const response = await messagesAPI.getMessages(params);
      if (response.data.success) {
        setMessages(response.data.messages || []);
        setSelectedMessages(new Set());
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des messages:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement des messages');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDossiers = async () => {
    try {
      const response = await dossiersAPI.getMyDossiers();
      if (response.data.success) {
        const list = response.data.dossiers || [];
        setDossiers(list);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des dossiers pour la messagerie:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('sujet', formData.sujet);
      formDataToSend.append('contenu', formData.contenu);
      if (composeDossierId) {
        formDataToSend.append('dossierId', composeDossierId);
      }

      attachments.forEach((file) => {
        formDataToSend.append('piecesJointes', file);
      });

      const response = await messagesAPI.sendMessage(formDataToSend);
      if (response.data.success) {
        setToast({ message: '✅ Message envoyé avec succès.', type: 'success' });
        setShowComposeModal(false);
        setFormData({ sujet: '', contenu: '' });
        setComposeDossierId('');
        setAttachments([]);
        loadMessages();
      }
    } catch (err: any) {
      console.error('Erreur lors de l\'envoi du message:', err);
      setError(err.response?.data?.message || 'Erreur lors de l\'envoi du message');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadAttachment = async (messageId: string, fileIndex: number, originalName: string) => {
    try {
      const response = await messagesAPI.downloadAttachment(messageId, fileIndex);
      const { triggerBlobDownload } = await import('@/lib/downloadFile');
      triggerBlobDownload(response, originalName);
    } catch (err: any) {
      console.error('Erreur lors du téléchargement:', err);
      setToast({ message: 'Erreur lors du téléchargement de la pièce jointe', type: 'error' });
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMessage) return;
    
    setIsReplying(true);
    setError(null);

    try {
      if (!selectedMessage) {
        setError('Aucun message sélectionné.');
        setIsReplying(false);
        return;
      }

      // Pour une réponse, utiliser le message sélectionné comme parent
      // Le dossierId sera automatiquement hérité du message parent par le backend
      const formDataToSend = new FormData();
      formDataToSend.append('sujet', replyData.sujet);
      formDataToSend.append('contenu', replyData.contenu);
      
      // Le message parent est le message auquel on répond (selectedMessage)
      const messageParentId = selectedMessage._id || selectedMessage.id;
      if (!messageParentId) {
        setError('Impossible d\'identifier le message parent.');
        setIsReplying(false);
        return;
      }
      formDataToSend.append('messageParent', messageParentId);
      
      // Le dossierId sera hérité automatiquement du message parent par le backend
      // Mais on peut l'envoyer aussi si disponible pour plus de sécurité
      const dossierId = selectedMessage.dossierId?._id?.toString() || 
                       selectedMessage.dossierId?.toString() || 
                       selectedMessage.dossier?._id?.toString() || 
                       selectedMessage.dossier?.toString() || 
                       selectedDossierId;
      if (dossierId) {
        formDataToSend.append('dossierId', dossierId);
      }

      replyAttachments.forEach((file) => {
        formDataToSend.append('piecesJointes', file);
      });

      const response = await messagesAPI.sendMessage(formDataToSend);
      if (response.data.success) {
        setToast({ message: '✅ Réponse envoyée avec succès.', type: 'success' });
        setShowReplyModal(false);
        setReplyData({ sujet: '', contenu: '' });
        setReplyAttachments([]);
        loadMessages();
        setSelectedMessage(null);
      }
    } catch (err: any) {
      console.error('Erreur lors de l\'envoi de la réponse:', err);
      setError(err.response?.data?.message || 'Erreur lors de l\'envoi de la réponse');
    } finally {
      setIsReplying(false);
    }
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - d.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      const hours = Math.floor(diffTime / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diffTime / (1000 * 60));
        return `Il y a ${minutes} min`;
      }
      return `Il y a ${hours}h`;
    }
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isMessageRead = (message: any) => {
    const userId = (session?.user as any)?.id;
    if (!message.lu || !Array.isArray(message.lu)) {
      return false;
    }
    return message.lu.some((l: any) => {
      const luUserId = l?.user?._id?.toString?.() || l?.user?.toString?.();
      return luUserId && userId && luUserId.toString() === userId.toString();
    });
  };

  const canCurrentUserMarkAsRead = (message: any) => {
    const userId = (session?.user as any)?.id;
    if (!userId) return false;
    const isDestinataire = message.destinataires?.some(
      (d: any) =>
        d?._id?.toString() === userId.toString() ||
        d?.toString?.() === userId.toString()
    );
    const isEnCopie = message.copie?.some(
      (c: any) =>
        c?._id?.toString() === userId.toString() ||
        c?.toString?.() === userId.toString()
    );
    return !!(isDestinataire || isEnCopie);
  };

  const markMessageAsReadOptimistic = (messageId: string) => {
    const userId = (session?.user as any)?.id?.toString?.();
    if (!userId) return;
    setMessages((prev) =>
      prev.map((m: any) => {
        const id = (m._id || m.id)?.toString?.();
        if (id !== messageId.toString()) return m;
        const alreadyRead = m.lu?.some((l: any) => {
          const luUserId = l?.user?._id?.toString?.() || l?.user?.toString?.();
          return luUserId === userId;
        });
        if (alreadyRead) return m;
        return {
          ...m,
          lu: [...(m.lu || []), { user: userId, readAt: new Date().toISOString() }],
        };
      })
    );
    setSelectedMessage((prev: any) => {
      const id = (prev?._id || prev?.id)?.toString?.();
      if (!prev || id !== messageId.toString()) return prev;
      const alreadyRead = prev.lu?.some((l: any) => {
        const luUserId = l?.user?._id?.toString?.() || l?.user?.toString?.();
        return luUserId === userId;
      });
      if (alreadyRead) return prev;
      return { ...prev, lu: [...(prev.lu || []), { user: userId, readAt: new Date().toISOString() }] };
    });
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedMessages.size === messages.length) {
      setSelectedMessages(new Set());
    } else {
      setSelectedMessages(new Set(messages.map(m => m._id || m.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedMessages.size === 0) return;
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${selectedMessages.size} message(s) ?`)) return;
    try {
      await messagesAPI.deleteBatch(Array.from(selectedMessages));
      await loadMessages();
      setSelectedMessages(new Set());
      setError(null);
    } catch (err: any) {
      console.error('Erreur lors de la suppression batch:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Erreur lors de la suppression des messages';
      setError(errorMessage);
      setToast({ message: `Erreur: ${errorMessage}`, type: 'error' });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce message ?')) return;
    try {
      await messagesAPI.deleteMessage(messageId);
      await loadMessages();
      if (selectedMessage && (selectedMessage._id || selectedMessage.id) === messageId) {
        setSelectedMessage(null);
      }
      setError(null);
    } catch (err: any) {
      console.error('Erreur lors de la suppression:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Erreur lors de la suppression du message';
      setError(errorMessage);
      setToast({ message: `Erreur: ${errorMessage}`, type: 'error' });
    }
  };

  // Grouper les messages par dossier
  const messagesByDossier = messages.reduce((acc: any, message: any) => {
    const dossierId = message.dossierId?._id?.toString() || message.dossierId?.toString() || message.dossier?._id?.toString() || message.dossier?.toString() || 'sans-dossier';
    const dossierTitre = message.dossierId?.titre || message.dossier?.titre || message.dossierId?.numero || message.dossier?.numero || 'Hors dossier';
    
    if (!acc[dossierId]) {
      acc[dossierId] = {
        dossierId,
        dossierTitre,
        messages: []
      };
    }
    acc[dossierId].messages.push(message);
    return acc;
  }, {});

  const dossiersList = Object.values(messagesByDossier) as any[];

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

  if (!session) return null;

  const unreadCount = messages.filter(m => canCurrentUserMarkAsRead(m) && !isMessageRead(m)).length;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/5">
      <div className="min-w-0 max-w-[100vw] overflow-x-hidden w-full px-3 py-6 sm:px-4 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="mb-2 text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent sm:text-4xl">
                Messagerie
              </h1>
              <p className="text-muted-foreground">Communiquez avec les administrateurs</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:max-w-md sm:flex-row sm:items-center">
                <span className="shrink-0 text-sm font-medium text-muted-foreground">Filtrer par dossier :</span>
                <select
                  value={selectedDossierId}
                  onChange={(e) => setSelectedDossierId(e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-input bg-background px-4 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 sm:max-w-xs"
                >
                  <option value="">Tous les messages</option>
                  {dossiers.map((dossier) => (
                    <option key={dossier._id || dossier.id} value={dossier._id || dossier.id}>
                      {dossier.titre || dossier.numero || 'Dossier'} – {dossier.numero}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={() => {
                  setComposeDossierId('');
                  setShowComposeModal(true);
                }}
                className="w-full shrink-0 shadow-md sm:w-auto"
              >
                <span className="mr-2">✉️</span>
                Nouveau message
              </Button>
            </div>
          </div>

          {/* Filtres */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                onClick={() => setFilter('all')}
                size="sm"
              >
                Tous ({messages.length})
              </Button>
              <Button
                variant={filter === 'received' ? 'default' : 'outline'}
                onClick={() => setFilter('received')}
                size="sm"
              >
                Reçus
              </Button>
              <Button
                variant={filter === 'sent' ? 'default' : 'outline'}
                onClick={() => setFilter('sent')}
                size="sm"
              >
                Envoyés
              </Button>
              <Button
                variant={filter === 'unread' ? 'default' : 'outline'}
                onClick={() => setFilter('unread')}
                size="sm"
                className={unreadCount > 0 ? 'relative' : ''}
              >
                Non lus
                {unreadCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Actions batch */}
        {selectedMessages.size > 0 && (
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/10 p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-primary">
                {selectedMessages.size} message(s) sélectionné(s)
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
                🗑️ Supprimer
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedMessages(new Set())}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {/* Messages classés par dossier */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement des messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-border bg-white p-8 text-center shadow-lg sm:p-16">
            <div className="text-6xl mb-6">📭</div>
            <p className="text-muted-foreground mb-6 text-lg">
              Aucun message {filter !== 'all' ? `(${filter})` : ''}
            </p>
            <Button onClick={() => { setComposeDossierId(''); setShowComposeModal(true); }}>
              Envoyer un message
            </Button>
        </div>
      ) : (
          <div className="space-y-6">
            {dossiersList.map((dossierGroup: any) => (
              <div key={dossierGroup.dossierId} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                        <span className="text-primary text-xl">📁</span>
                      </div>
                      <div className="min-w-0">
                        <h2 className="break-words text-lg font-bold text-foreground">{dossierGroup.dossierTitre}</h2>
                        <p className="text-sm text-muted-foreground">
                          {dossierGroup.messages.length} message{dossierGroup.messages.length > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    {dossierGroup.dossierId !== 'sans-dossier' && (
                      <Link href={`/partenaire/dossiers/${dossierGroup.dossierId}`} className="shrink-0 sm:self-start">
                        <Button variant="outline" size="sm" className="w-full whitespace-normal sm:w-auto">
                          Voir le dossier →
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
                
                <div className="divide-y divide-gray-100">
                  {dossierGroup.messages.map((message: any) => {
                    const expediteur = message.expediteur;
                    const userId = (session?.user as any)?.id;
                    const isReceived = message.destinataires?.some((d: any) => 
                      d._id?.toString() === userId?.toString() || 
                      d.toString() === userId?.toString()
                    ) || message.copie?.some((c: any) => 
                      c._id?.toString() === userId?.toString() || 
                      c.toString() === userId?.toString()
                    );
                    const isRead = isMessageRead(message);
                    const messageId = message._id || message.id;
                    const isSelected = selectedMessages.has(messageId);
                    
                    const expediteurName = expediteur?.firstName && expediteur?.lastName
                      ? `${expediteur.firstName} ${expediteur.lastName}`
                      : expediteur?.email || 'Expéditeur inconnu';
                    const expediteurInitials = expediteur?.firstName && expediteur?.lastName
                      ? `${expediteur.firstName[0]}${expediteur.lastName[0]}`
                      : expediteur?.email?.[0]?.toUpperCase() || '?';
                    
                    const messageDate = new Date(message.createdAt);
                    const isToday = messageDate.toDateString() === new Date().toDateString();
                    const isYesterday = messageDate.toDateString() === new Date(Date.now() - 86400000).toDateString();
                    const dateDisplay = isToday 
                      ? `Aujourd'hui à ${messageDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                      : isYesterday
                      ? `Hier à ${messageDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                      : formatDate(message.createdAt);
                    
                    return (
                      <div
                        key={messageId}
                        className={`p-4 transition-all duration-300 hover:bg-gray-50 border rounded-xl sm:p-6 ${
                          (isReceived && !isRead)
                            ? 'bg-gradient-to-r from-primary/5 via-primary/2 to-white border-primary/70 hover:shadow-[0_12px_30px_-18px_rgba(249,115,22,0.45)]' 
                            : 'border-gray-200/80'
                        } ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4">
                          <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleMessageSelection(messageId)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary"
                          />

                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-md sm:h-14 sm:w-14 sm:text-base ${
                            (isReceived && !isRead) 
                              ? 'bg-gradient-to-br from-primary to-primary/80' 
                              : 'bg-gradient-to-br from-gray-400 to-gray-500'
                          }`}>
                            {expediteurInitials}
                          </div>

                          <div 
                            className="flex-1 cursor-pointer min-w-0"
                            onClick={async () => {
                              setSelectedMessage(message);
                              if (!isRead && canCurrentUserMarkAsRead(message)) {
                                try {
                                  markMessageAsReadOptimistic(messageId);
                                  await messagesAPI.markAsRead(messageId);
                                  await loadMessages();
                                  setError(null);
                                } catch (err: any) {
                                  console.error('Erreur lors du marquage comme lu:', err);
                                  setError(err.response?.data?.message || 'Erreur lors du marquage comme lu');
            }
                              }
                            }}
                          >
                            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <h3 className={`min-w-0 break-words text-base font-bold sm:text-lg ${
                                    isRead ? 'text-gray-700' : 'text-gray-900'
                                  }`}>
                                    {message.sujet}
                                  </h3>
                                  {isReceived && !isRead && (
                                    <span className="flex-shrink-0 px-2.5 py-1 rounded-full bg-primary text-white text-xs font-bold shadow-sm">
                                      ✉️ Nouveau
                                    </span>
                                  )}
                                </div>
                                
                                <p className={`text-sm mb-2 line-clamp-2 ${
                                  isRead ? 'text-gray-600' : 'text-gray-800'
                                }`}>
                                  {message.contenu}
                                </p>
                                
                                <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                                  <span className="min-w-0 break-words">{isReceived ? '📤 De' : '📥 À'}: {isReceived ? expediteurName : '👥 Tous les administrateurs'}</span>
                                  <span className="shrink-0">🕐 {dateDisplay}</span>
                                  {message.piecesJointes && message.piecesJointes.length > 0 && (
                                    <span className="shrink-0">📎 {message.piecesJointes.length} pièce{message.piecesJointes.length > 1 ? 's' : ''} jointe{message.piecesJointes.length > 1 ? 's' : ''}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          </div>

                          <div className="flex w-full shrink-0 flex-row flex-wrap gap-2 sm:w-auto sm:flex-col sm:flex-nowrap sm:items-stretch" onClick={(e) => e.stopPropagation()}>
                            {isReceived && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-[40px] flex-1 sm:flex-none"
                                onClick={() => {
                                  setReplyData({
                                    sujet: `Re: ${message.sujet}`,
                                    contenu: '',
                                  });
                                  setSelectedMessage(message);
                                  setShowReplyModal(true);
                                }}
                              >
                                Répondre
                              </Button>
                            )}
                            <Button
                              variant="destructive"
                              size="sm"
                              className="min-h-[40px] flex-1 sm:flex-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMessage(messageId);
                              }}
                            >
                              🗑️ Supprimer
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal de composition */}
        {showComposeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 flex items-start justify-between gap-3 rounded-t-2xl border-b bg-white px-4 py-4 sm:items-center sm:px-6">
                <h2 className="min-w-0 flex-1 break-words text-lg font-bold sm:text-2xl">Nouveau message</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowComposeModal(false);
                    setComposeDossierId('');
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-3xl leading-none text-muted-foreground hover:bg-gray-100 hover:text-foreground transition-colors"
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleSendMessage} className="space-y-5 p-4 sm:p-6">
                <div>
                  <Label htmlFor="compose-dossier-p">Lier à un dossier (optionnel)</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Si vous choisissez un dossier, il doit vous être transmis. Laissez vide pour un message général.
                  </p>
                  <select
                    id="compose-dossier-p"
                    value={composeDossierId}
                    onChange={(e) => setComposeDossierId(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background"
                  >
                    <option value="">Aucun dossier</option>
                    {dossiers.map((dossier) => (
                      <option key={dossier._id || dossier.id} value={dossier._id || dossier.id}>
                        {dossier.titre || dossier.numero || 'Dossier'} – {dossier.numero}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="sujet">Sujet *</Label>
                  <Input
                    id="sujet"
                    value={formData.sujet}
                    onChange={(e) => setFormData({ ...formData, sujet: e.target.value })}
                    required
                    className="mt-1"
                    placeholder="Sujet du message"
                  />
                </div>
                <div>
                  <Label htmlFor="contenu">Message *</Label>
                  <Textarea
                    id="contenu"
                    value={formData.contenu}
                    onChange={(e) => setFormData({ ...formData, contenu: e.target.value })}
                    required
                    className="mt-1"
                    placeholder="Votre message..."
                    rows={6}
                  />
                </div>
                <div>
                  <Label htmlFor="attachments">Pièces jointes (max 5 fichiers, 10MB chacun)</Label>
                  <Input
                    id="attachments"
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []) as File[];
                      if (files.length > 5) {
                        setToast({ message: 'Maximum 5 fichiers autorisés', type: 'warning' });
                        return;
                      }
                      setAttachments(files);
                    }}
                    className="mt-1"
                  />
                  {attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {attachments.map((file, index) => (
                        <div key={index} className="flex items-start justify-between gap-2 rounded bg-gray-50 p-2 text-xs text-muted-foreground">
                          <span className="min-w-0 break-all">📎 {file.name}</span>
                          <button
                            type="button"
                            onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}
                            className="shrink-0 font-bold text-red-500 hover:text-red-700"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setShowComposeModal(false);
                      setComposeDossierId('');
                    }}
                    disabled={isSubmitting}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
                    {isSubmitting ? 'Envoi...' : 'Envoyer'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de détail du message */}
        {selectedMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 flex items-start justify-between gap-3 rounded-t-2xl border-b bg-white px-4 py-4 sm:items-center sm:px-6">
                <h2 className="min-w-0 flex-1 break-words text-lg font-bold sm:text-2xl">{selectedMessage.sujet}</h2>
                <button onClick={() => setSelectedMessage(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-3xl leading-none text-muted-foreground hover:bg-gray-100 hover:text-foreground transition-colors">×</button>
              </div>
              <div className="space-y-5 p-4 sm:p-6">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  {selectedMessage.destinataires?.some((d: any) => 
                    d._id?.toString() === (session?.user as any)?.id?.toString() || 
                    d.toString() === (session?.user as any)?.id?.toString()
                  ) && (
                    <Button
                      onClick={() => {
                        setReplyData({
                          sujet: `Re: ${selectedMessage.sujet}`,
                          contenu: '',
                        });
                        setShowReplyModal(true);
                      }}
                    >
                      Répondre
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-muted-foreground mb-1">De</p>
                    <p className="font-semibold break-words">
                      {selectedMessage.expediteur?.firstName} {selectedMessage.expediteur?.lastName} ({selectedMessage.expediteur?.email})
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-muted-foreground mb-1">Date</p>
                    <p className="font-semibold break-words">{formatDate(selectedMessage.createdAt)}</p>
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <p className="text-muted-foreground mb-1">À</p>
                    <p className="font-semibold">
                      {selectedMessage.destinataires?.map((d: any) => 
                        `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email
                      ).join(', ') || 'Équipe admin'}
                    </p>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-muted-foreground mb-2 font-medium">Message</p>
                  <p className="whitespace-pre-wrap text-gray-700 leading-relaxed">{selectedMessage.contenu}</p>
                </div>
                {selectedMessage.piecesJointes && selectedMessage.piecesJointes.length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-muted-foreground mb-2 font-medium">Pièces jointes</p>
                    <div className="space-y-2">
                      {selectedMessage.piecesJointes.map((pj: any, index: number) => (
                        <div key={index} className="flex flex-col gap-3 rounded-lg border border-border bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0">📎</span>
                            <span className="break-all text-sm">{pj.originalName}</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full shrink-0 sm:w-auto"
                            onClick={() => handleDownloadAttachment(selectedMessage._id || selectedMessage.id, index, pj.originalName)}
                          >
                            Télécharger
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de réponse */}
        {showReplyModal && selectedMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 flex items-start justify-between gap-3 rounded-t-2xl border-b bg-white px-4 py-4 sm:items-center sm:px-6">
                <h2 className="min-w-0 flex-1 break-words text-lg font-bold sm:text-2xl">Répondre</h2>
                <button 
                  onClick={() => {
                    setShowReplyModal(false);
                    setReplyData({ sujet: '', contenu: '' });
                    setReplyAttachments([]);
                  }} 
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-3xl leading-none text-muted-foreground hover:bg-gray-100 hover:text-foreground transition-colors"
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleReply} className="space-y-5 p-4 sm:p-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">ℹ️</span>
                    <div>
                      <p className="text-sm font-semibold text-blue-900 mb-1">Réponse automatique aux administrateurs</p>
                      <p className="text-xs text-blue-700">
                        Votre réponse sera automatiquement envoyée à tous les administrateurs de l'équipe.
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="reply-sujet">Sujet *</Label>
                  <Input
                    id="reply-sujet"
                    value={replyData.sujet}
                    onChange={(e) => setReplyData({ ...replyData, sujet: e.target.value })}
                    required
                    className="mt-1"
                    placeholder="Sujet de la réponse"
                  />
                </div>
                <div>
                  <Label htmlFor="reply-contenu">Message *</Label>
                  <Textarea
                    id="reply-contenu"
                    value={replyData.contenu}
                    onChange={(e) => setReplyData({ ...replyData, contenu: e.target.value })}
                    required
                    className="mt-1"
                    placeholder="Votre réponse..."
                    rows={6}
                  />
                </div>
                <div>
                  <Label htmlFor="reply-attachments">Pièces jointes (max 5 fichiers, 10MB chacun)</Label>
                  <Input
                    id="reply-attachments"
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []) as File[];
                      if (files.length > 5) {
                        setToast({ message: 'Maximum 5 fichiers autorisés', type: 'warning' });
                        return;
                      }
                      setReplyAttachments(files);
                    }}
                    className="mt-1"
                  />
                  {replyAttachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {replyAttachments.map((file, index) => (
                        <div key={index} className="flex items-start justify-between gap-2 rounded bg-gray-50 p-2 text-xs text-muted-foreground">
                          <span className="min-w-0 break-all">📎 {file.name}</span>
                          <button
                            type="button"
                            onClick={() => setReplyAttachments(replyAttachments.filter((_, i) => i !== index))}
                            className="shrink-0 font-bold text-red-500 hover:text-red-700"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end sm:gap-3">
                  <Button 
                    type="button" 
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setShowReplyModal(false);
                      setReplyData({ sujet: '', contenu: '' });
                      setReplyAttachments([]);
                    }} 
                    disabled={isReplying}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" className="w-full sm:w-auto" disabled={isReplying}>
                    {isReplying ? 'Envoi...' : 'Envoyer la réponse'}
                  </Button>
                </div>
              </form>
            </div>
        </div>
      )}
      </div>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

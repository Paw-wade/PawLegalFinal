'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { messagesAPI, dossiersAPI } from '@/lib/api';

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

export default function MessagesPage() {
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
  const [users, setUsers] = useState<any[]>([]);
  const [selectedExpediteurId, setSelectedExpediteurId] = useState<string>('');
  const [selectedDestinataireId, setSelectedDestinataireId] = useState<string>('');

  // Gérer les query params pour pré-sélectionner le dossier et ouvrir le modal
  useEffect(() => {
    const dossierIdParam = searchParams.get('dossierId');
    const actionParam = searchParams.get('action');
    
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
      loadUsers();
      loadMessages();
    }
  }, [session, status, router, filter, selectedDossierId, selectedExpediteurId, selectedDestinataireId]);

  const loadMessages = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = { type: filter };
      if (selectedDossierId) {
        params.dossierId = selectedDossierId;
      }
      if (selectedExpediteurId) {
        params.expediteurId = selectedExpediteurId;
      }
      if (selectedDestinataireId) {
        params.destinataireId = selectedDestinataireId;
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
        if (!selectedDossierId && list.length === 1) {
          setSelectedDossierId(list[0]._id || list[0].id);
        }
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des dossiers pour la messagerie:', err);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await messagesAPI.getUsers();
      if (response.data.success) {
        setUsers(response.data.users || []);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des utilisateurs:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!selectedDossierId) {
      setError('Vous devez sélectionner un dossier pour envoyer un message.');
      setIsSubmitting(false);
      return;
    }

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('sujet', formData.sujet);
      formDataToSend.append('contenu', formData.contenu);
      formDataToSend.append('dossierId', selectedDossierId);

      attachments.forEach((file) => {
        formDataToSend.append('piecesJointes', file);
      });

      const response = await messagesAPI.sendMessage(formDataToSend);
      if (response.data.success) {
        alert('Message envoyé avec succès à tous les administrateurs !');
        setShowComposeModal(false);
        setFormData({ sujet: '', contenu: '' });
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
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Erreur lors du téléchargement:', err);
      alert('Erreur lors du téléchargement de la pièce jointe');
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

      const dossierId = selectedMessage.dossierId || selectedDossierId;
      if (!dossierId) {
        setError('Ce message n\'est rattaché à aucun dossier. La réponse ne peut pas être envoyée.');
        setIsReplying(false);
        return;
      }

      const formDataToSend = new FormData();
      formDataToSend.append('sujet', replyData.sujet);
      formDataToSend.append('contenu', replyData.contenu);
      const messageParentId = selectedMessage.messageParent?._id || selectedMessage.messageParent || selectedMessage._id || selectedMessage.id;
      formDataToSend.append('messageParent', messageParentId);
      formDataToSend.append('dossierId', dossierId);

      replyAttachments.forEach((file) => {
        formDataToSend.append('piecesJointes', file);
      });

      const response = await messagesAPI.sendMessage(formDataToSend);
      if (response.data.success) {
        alert('Réponse envoyée avec succès à tous les administrateurs !');
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

  const handleBatchRead = async () => {
    if (selectedMessages.size === 0) return;
    try {
      const response = await messagesAPI.markBatchAsRead(Array.from(selectedMessages));
      if (response.data.success) {
        await loadMessages();
        setSelectedMessages(new Set());
        setError(null);
      } else {
        setError(response.data.message || 'Erreur lors du marquage des messages');
      }
    } catch (err: any) {
      console.error('Erreur lors du marquage batch:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Erreur lors du marquage des messages';
      setError(errorMessage);
      alert(`Erreur: ${errorMessage}`);
    }
  };

  const handleBatchUnread = async () => {
    if (selectedMessages.size === 0) return;
    try {
      const response = await messagesAPI.markBatchAsUnread(Array.from(selectedMessages));
      if (response.data.success) {
        await loadMessages();
        setSelectedMessages(new Set());
        setError(null);
      } else {
        setError(response.data.message || 'Erreur lors du marquage des messages');
      }
    } catch (err: any) {
      console.error('Erreur lors du marquage batch:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Erreur lors du marquage des messages';
      setError(errorMessage);
      alert(`Erreur: ${errorMessage}`);
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

  if (!session) return null;

  // IMPORTANT: "Non lus" = non lus PAR MOI (uniquement si je suis destinataire ou en copie)
  const unreadCount = messages.filter(m => canCurrentUserMarkAsRead(m) && !isMessageRead(m)).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/5">
      <main className="w-full px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <div>
              <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Messagerie
              </h1>
              <p className="text-muted-foreground">Communiquez avec l'équipe administrative</p>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-medium">Dossier :</span>
                <select
                  value={selectedDossierId}
                  onChange={(e) => setSelectedDossierId(e.target.value)}
                  className="px-4 py-2 border border-input rounded-lg text-sm bg-background shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 max-w-xs"
                >
                  <option value="">Sélectionnez un dossier</option>
                  {dossiers.map((dossier) => (
                    <option key={dossier._id || dossier.id} value={dossier._id || dossier.id}>
                      {dossier.titre || dossier.numero || 'Dossier'} – {dossier.numero}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={() => setShowComposeModal(true)} disabled={!selectedDossierId} className="shadow-md">
                <span className="mr-2">✉️</span>
                Nouveau message
              </Button>
              {!selectedDossierId && (
                <p className="text-xs text-amber-600 max-w-xs text-right">
                  Sélectionnez un dossier pour envoyer un message
                </p>
              )}
            </div>
          </div>

          {/* Filtres */}
          <div className="space-y-4">
            {/* Filtres de type */}
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

            {/* Filtres par utilisateur */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Label htmlFor="filter-expediteur" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  Expéditeur :
                </Label>
                <select
                  id="filter-expediteur"
                  value={selectedExpediteurId}
                  onChange={(e) => setSelectedExpediteurId(e.target.value)}
                  className="px-3 py-1.5 border border-input rounded-md text-sm bg-background shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[200px]"
                >
                  <option value="">Tous les expéditeurs</option>
                  {users.map((user) => {
                    const userId = user._id || user.id;
                    return (
                      <option key={userId} value={userId}>
                        {user.firstName} {user.lastName} ({user.email})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="filter-destinataire" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  Destinataire :
                </Label>
                <select
                  id="filter-destinataire"
                  value={selectedDestinataireId}
                  onChange={(e) => setSelectedDestinataireId(e.target.value)}
                  className="px-3 py-1.5 border border-input rounded-md text-sm bg-background shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[200px]"
                >
                  <option value="">Tous les destinataires</option>
                  {users.map((user) => {
                    const userId = user._id || user.id;
                    return (
                      <option key={userId} value={userId}>
                        {user.firstName} {user.lastName} ({user.email})
                      </option>
                    );
                  })}
                </select>
              </div>

              {(selectedExpediteurId || selectedDestinataireId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedExpediteurId('');
                    setSelectedDestinataireId('');
                  }}
                  className="text-xs"
                >
                  Réinitialiser les filtres
                </Button>
              )}
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
          <div className="mb-4 p-4 bg-primary/10 border border-primary/20 rounded-lg shadow-sm flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-primary">
                {selectedMessages.size} message(s) sélectionné(s)
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleBatchRead}>
                Marquer comme lu
              </Button>
              <Button variant="outline" size="sm" onClick={handleBatchUnread}>
                Marquer comme non lu
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedMessages(new Set())}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {/* Liste des messages */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement des messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-16 text-center border border-border">
            <div className="text-6xl mb-6">📭</div>
            <p className="text-muted-foreground mb-6 text-lg">
              Aucun message {filter !== 'all' ? `(${filter})` : ''}
            </p>
            <Button onClick={() => setShowComposeModal(true)}>Envoyer un message</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Checkbox pour sélectionner tous */}
            <div className="flex items-center gap-3 px-4 py-2 bg-white/50 rounded-lg border border-border">
              <input
                type="checkbox"
                checked={selectedMessages.size === messages.length && messages.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
              />
              <span className="text-sm font-medium text-muted-foreground">
                Sélectionner tout
              </span>
            </div>

            {messages.map((message) => {
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
              
              // Formater la date avec plus de détails
              const messageDate = new Date(message.createdAt);
              const isToday = messageDate.toDateString() === new Date().toDateString();
              const isYesterday = messageDate.toDateString() === new Date(Date.now() - 86400000).toDateString();
              const dateDisplay = isToday 
                ? `Aujourd'hui à ${messageDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                : isYesterday
                ? `Hier à ${messageDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                : formatDate(message.createdAt);
              
              // Obtenir la copie
              const copieList = message.copie?.map((c: any) => `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email).filter(Boolean) || [];
              
              return (
                <div
                  key={messageId}
                  className={`bg-white rounded-xl shadow-md border-l-4 transition-all duration-200 hover:shadow-xl ${
                    (isReceived && !isRead)
                      ? 'border-primary bg-gradient-to-r from-primary/5 via-primary/2 to-white' 
                      : 'border-gray-300 bg-white'
                  } ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                >
                  <div className="p-6">
                    <div className="flex items-start gap-4">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMessageSelection(messageId)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1.5 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                      />

                      {/* Avatar/Initiale avec gradient */}
                      <div className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md ${
                        (isReceived && !isRead) 
                          ? 'bg-gradient-to-br from-primary to-primary/80' 
                          : 'bg-gradient-to-br from-gray-400 to-gray-500'
                      }`}>
                        {expediteurInitials}
                      </div>

                      {/* Contenu principal */}
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
                              const errorMessage = err.response?.data?.message || err.message || 'Erreur lors du marquage comme lu';
                              setError(errorMessage);
                            }
                          }
                        }}
                      >
                        {/* En-tête avec sujet et badges */}
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className={`font-bold text-lg ${
                                isRead ? 'text-gray-700' : 'text-gray-900'
                              }`}>
                                {message.sujet}
                              </h3>
                              {isReceived && !isRead && (
                                <span className="flex-shrink-0 px-2.5 py-1 rounded-full bg-primary text-white text-xs font-bold shadow-sm">
                                  ✉️ Nouveau
                                </span>
                              )}
                              <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                isRead 
                                  ? 'bg-gray-100 text-gray-600' 
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {isRead ? '✓ Lu' : '● Non lu'}
                              </span>
                            </div>
                            
                            {/* Aperçu du contenu */}
                            <p className={`text-sm mb-3 line-clamp-2 ${
                              isRead ? 'text-gray-600' : 'text-gray-800'
                            }`}>
                              {message.contenu}
                            </p>
                            
                            {/* Métadonnées détaillées */}
                            <div className="space-y-2 text-xs">
                              {/* Expéditeur/Destinataire */}
                              <div className="flex items-start gap-2">
                                <span className="text-muted-foreground font-medium min-w-[70px]">
                                  {isReceived ? '📤 De' : '📥 À'}:
                                </span>
                                <span className="text-foreground font-semibold">
                                  {isReceived 
                                    ? expediteurName
                                    : '👥 Tous les administrateurs'
                                  }
                                </span>
                              </div>
                              
                              {/* Copie */}
                              {copieList.length > 0 && (
                                <div className="flex items-start gap-2">
                                  <span className="text-muted-foreground font-medium min-w-[70px]">📋 Copie:</span>
                                  <span className="text-foreground">{copieList.join(', ')}</span>
                                </div>
                              )}
                              
                              {/* Date et pièces jointes */}
                              <div className="flex items-center gap-4 flex-wrap pt-1 border-t border-gray-100">
                                <div className="flex items-center gap-1.5">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span className="text-muted-foreground font-medium">{dateDisplay}</span>
                                </div>
                                
                                {message.piecesJointes && message.piecesJointes.length > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                    <span className="text-muted-foreground font-medium">
                                      {message.piecesJointes.length} pièce{message.piecesJointes.length > 1 ? 's' : ''} jointe{message.piecesJointes.length > 1 ? 's' : ''}
                                    </span>
                                  </div>
                                )}
                                
                                {/* Dossier lié */}
                                {message.dossier && message.dossier.titre && (
                                  <div className="flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                    <span className="text-muted-foreground font-medium">
                                      Dossier: {message.dossier.titre}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {isReceived && (
                          <Button
                            variant="outline"
                            size="sm"
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
                          variant="outline"
                          size="sm"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              if (isRead) {
                                await messagesAPI.markAsUnread(messageId);
                              } else {
                                await messagesAPI.markAsRead(messageId);
                              }
                              await loadMessages();
                              setError(null);
                            } catch (err: any) {
                              console.error('Erreur lors du changement de statut:', err);
                              const errorMessage = err.response?.data?.message || err.message || 'Erreur lors du changement de statut';
                              setError(errorMessage);
                              alert(`Erreur: ${errorMessage}`);
                            }
                          }}
                        >
                          {isRead ? 'Non lu' : 'Marquer lu'}
                        </Button>
                        <Link href={`/client/messages/${messageId}`}>
                          <Button variant="outline" size="sm" className="w-full">
                            Détails
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de composition */}
        {showComposeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <h2 className="text-2xl font-bold">Nouveau message</h2>
                <button onClick={() => setShowComposeModal(false)} className="text-muted-foreground hover:text-foreground text-3xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">×</button>
              </div>
              <form onSubmit={handleSendMessage} className="p-6 space-y-5">
                {/* Info automatique aux admins */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">ℹ️</span>
                    <div>
                      <p className="text-sm font-semibold text-blue-900 mb-1">Message automatique aux administrateurs</p>
                      <p className="text-xs text-blue-700">
                        Votre message sera automatiquement envoyé à tous les administrateurs de l'équipe.
                      </p>
                    </div>
                  </div>
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
                        alert('Maximum 5 fichiers autorisés');
                        return;
                      }
                      setAttachments(files);
                    }}
                    className="mt-1"
                  />
                  {attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {attachments.map((file, index) => (
                        <div key={index} className="text-xs text-muted-foreground flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span>📎 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                          <button
                            type="button"
                            onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}
                            className="text-red-500 hover:text-red-700 font-bold"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setShowComposeModal(false)} disabled={isSubmitting}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
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
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <h2 className="text-2xl font-bold">{selectedMessage.sujet}</h2>
                <button onClick={() => setSelectedMessage(null)} className="text-muted-foreground hover:text-foreground text-3xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">×</button>
              </div>
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        if (isMessageRead(selectedMessage)) {
                          await messagesAPI.markAsUnread(selectedMessage._id || selectedMessage.id);
                        } else {
                          await messagesAPI.markAsRead(selectedMessage._id || selectedMessage.id);
                        }
                        await loadMessages();
                        const updatedMessage = await messagesAPI.getMessage(selectedMessage._id || selectedMessage.id).then(r => r.data.message);
                        setSelectedMessage(updatedMessage);
                        setError(null);
                      } catch (err: any) {
                        console.error('Erreur lors du changement de statut:', err);
                        const errorMessage = err.response?.data?.message || err.message || 'Erreur lors du changement de statut';
                        setError(errorMessage);
                        alert(`Erreur: ${errorMessage}`);
                      }
                    }}
                  >
                    {isMessageRead(selectedMessage) ? 'Marquer comme non lu' : 'Marquer comme lu'}
                  </Button>
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
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">De</p>
                    <p className="font-semibold">
                      {selectedMessage.expediteur?.firstName} {selectedMessage.expediteur?.lastName} ({selectedMessage.expediteur?.email})
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Date</p>
                    <p className="font-semibold">{formatDate(selectedMessage.createdAt)}</p>
                  </div>
                  <div className="col-span-2">
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
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-border">
                          <div className="flex items-center gap-2">
                            <span>📎</span>
                            <span className="text-sm">{pj.originalName}</span>
                            <span className="text-xs text-muted-foreground">
                              ({(pj.size / 1024 / 1024).toFixed(2)} MB)
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
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
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <h2 className="text-2xl font-bold">Répondre</h2>
                <button 
                  onClick={() => {
                    setShowReplyModal(false);
                    setReplyData({ sujet: '', contenu: '' });
                    setReplyAttachments([]);
                  }} 
                  className="text-muted-foreground hover:text-foreground text-3xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleReply} className="p-6 space-y-5">
                {/* Info automatique aux admins */}
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
                        alert('Maximum 5 fichiers autorisés');
                        return;
                      }
                      setReplyAttachments(files);
                    }}
                    className="mt-1"
                  />
                  {replyAttachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {replyAttachments.map((file, index) => (
                        <div key={index} className="text-xs text-muted-foreground flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span>📎 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                          <button
                            type="button"
                            onClick={() => setReplyAttachments(replyAttachments.filter((_, i) => i !== index))}
                            className="text-red-500 hover:text-red-700 font-bold"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setShowReplyModal(false);
                      setReplyData({ sujet: '', contenu: '' });
                      setReplyAttachments([]);
                    }} 
                    disabled={isReplying}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isReplying}>
                    {isReplying ? 'Envoi...' : 'Envoyer la réponse'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

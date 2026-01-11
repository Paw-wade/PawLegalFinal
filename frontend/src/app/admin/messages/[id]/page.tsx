'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { messagesAPI, notificationsAPI, contactAPI, dossiersAPI } from '@/lib/api';

function Button({ children, variant = 'default', className = '', size = 'sm', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-primary text-white hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  const sizeClasses = {
    sm: 'h-9 px-3',
    default: 'h-10 px-4',
    lg: 'h-11 px-8',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>{children}</button>;
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
      className={`flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export default function AdminMessageDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const messageId = params?.id as string;
  
  const [message, setMessage] = useState<any>(null);
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [rootMessage, setRootMessage] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageNotifications, setMessageNotifications] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [showCreateDossierModal, setShowCreateDossierModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingDossier, setIsCreatingDossier] = useState(false);
  const [dossierFormData, setDossierFormData] = useState({
    titre: '',
    description: '',
    categorie: '',
    type: '',
    statut: 'recu',
    priorite: 'normale',
  });
  const [replyData, setReplyData] = useState({
    sujet: '',
    contenu: '',
    destinataire: '',
    copie: [] as string[],
  });
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      const userRole = (session?.user as any)?.role;
      const isAuthorized = userRole === 'admin' || userRole === 'superadmin';
      if (!isAuthorized) {
        router.push('/client');
        return;
      }
      if (messageId) {
        loadMessage();
        loadUsers();
      }
    }
  }, [session, status, router, messageId]);

  useEffect(() => {
    if (message) {
      loadMessageNotifications(message._id || message.id);
      // Pré-remplir le formulaire de réponse
      if (message.expediteur) {
        const expediteurId = message.expediteur._id || message.expediteur.id;
        setReplyData({
          sujet: `Re: ${message.sujet}`,
          contenu: '',
          destinataire: expediteurId?.toString() || '',
          copie: [],
        });
      }
    }
  }, [message]);

  const loadMessage = async () => {
    if (!messageId) return;
    setIsLoading(true);
    setError(null);
    try {
      // Essayer d'abord avec l'API des messages internes
      let response;
      let fetchedMessage;
      let isContactMessage = false;
      
      try {
        response = await messagesAPI.getMessage(messageId);
        if (response.data.success) {
          fetchedMessage = response.data.message;
        }
      } catch (err: any) {
        // Si ce n'est pas un message interne, essayer avec l'API de contact
        if (err.response?.status === 404) {
          try {
            const { contactAPI } = await import('@/lib/api');
            response = await contactAPI.getMessage(messageId);
            if (response.data.success) {
              fetchedMessage = response.data.message;
              isContactMessage = true;
            }
          } catch (contactErr: any) {
            throw contactErr;
          }
        } else {
          throw err;
        }
      }
      
      if (response && response.data.success && fetchedMessage) {
        const msg = { ...fetchedMessage, isContactMessage };
        setMessage(msg);
        
        // Si le backend retourne les messages du thread, les utiliser
        if (response.data.threadMessages && Array.isArray(response.data.threadMessages)) {
          setThreadMessages(response.data.threadMessages);
          if (response.data.root) {
            setRootMessage(response.data.root);
          } else {
            setRootMessage(response.data.threadMessages.find((m: any) => !m.messageParent) || response.data.threadMessages[0]);
          }
        } else {
          // Sinon, créer un thread avec un seul message
          setThreadMessages([msg]);
          setRootMessage(msg);
        }

        // Marquer comme lu automatiquement à l'ouverture
        const userId = (session?.user as any)?.id?.toString?.();
        
        if (isContactMessage) {
          // Pour les messages de contact, tous les admins peuvent les marquer comme lus
          const isRead = fetchedMessage.lu?.some((l: any) => {
            const luUserId = l?.user?._id?.toString() || l?.user?.toString();
            return luUserId === userId;
          });
          
          if (!isRead && userId) {
            // Supprimer le badge "Nouveau" immédiatement côté UI
            setMessage((prev: any) => {
              if (!prev) return prev;
              const alreadyRead = prev.lu?.some((l: any) => {
                const luUserId = l?.user?._id?.toString() || l?.user?.toString();
                return luUserId === userId;
              });
              if (alreadyRead) return prev;
              return { ...prev, lu: [...(prev.lu || []), { user: userId, luAt: new Date().toISOString() }] };
            });
            try {
              const { contactAPI } = await import('@/lib/api');
              await contactAPI.markAsRead(messageId, true);
            } catch (err) {
              console.error('Erreur lors du marquage comme lu:', err);
            }
          }
        } else {
          // Pour les messages internes, uniquement si l'utilisateur est destinataire ou en copie
          const isDestinataire = fetchedMessage.destinataires?.some(
            (d: any) => (d?._id?.toString?.() || d?.toString?.()) === userId
          );
          const isEnCopie = fetchedMessage.copie?.some(
            (c: any) => (c?._id?.toString?.() || c?.toString?.()) === userId
          );
          const canMark = !!(userId && (isDestinataire || isEnCopie));
          const isRead = fetchedMessage.lu?.some((l: any) => {
            const luUserId = l?.user?._id?.toString?.() || l?.user?.toString?.();
            return luUserId === userId;
          });

          if (canMark && !isRead) {
            // Supprimer le badge "Nouveau" immédiatement côté UI
            setMessage((prev: any) => {
              if (!prev) return prev;
              const alreadyRead = prev.lu?.some((l: any) => {
                const luUserId = l?.user?._id?.toString?.() || l?.user?.toString?.();
                return luUserId === userId;
              });
              if (alreadyRead) return prev;
              return { ...prev, lu: [...(prev.lu || []), { user: userId, readAt: new Date().toISOString() }] };
            });
            try {
              await messagesAPI.markAsRead(messageId);
            } catch (err) {
              console.error('Erreur lors du marquage comme lu:', err);
            }
          }
        }
      } else {
        setError('Message non trouvé');
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement du message:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement du message');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessageNotifications = async (msgId: string) => {
    try {
      const response = await notificationsAPI.getNotifications({ limit: 100 });
      if (response.data.success) {
        const relatedNotifications = (response.data.notifications || []).filter((notif: any) => 
          notif.metadata?.messageId === msgId?.toString()
        );
        setMessageNotifications(relatedNotifications);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des notifications du message:', err);
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

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!replyData.destinataire) {
      setError('Veuillez sélectionner un destinataire');
      setIsSubmitting(false);
      return;
    }

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('sujet', replyData.sujet);
      formDataToSend.append('contenu', replyData.contenu);
      formDataToSend.append('destinataire', replyData.destinataire);
      replyData.copie.forEach(cc => {
        formDataToSend.append('copie', cc);
      });

      attachments.forEach((file) => {
        formDataToSend.append('piecesJointes', file);
      });

      const response = await messagesAPI.sendMessage(formDataToSend);
      if (response.data.success) {
        alert('Réponse envoyée avec succès !');
        setShowReplyModal(false);
        setReplyData({ sujet: '', contenu: '', destinataire: '', copie: [] });
        setAttachments([]);
        // Recharger le message pour voir les notifications
        await loadMessage();
      }
    } catch (err: any) {
      console.error('Erreur lors de l\'envoi de la réponse:', err);
      setError(err.response?.data?.message || 'Erreur lors de l\'envoi de la réponse');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadAttachment = async (messageId: string, index: number, filename: string) => {
    try {
      const response = await messagesAPI.downloadAttachment(messageId, index);
      const blob = new Blob([response.data], { type: response.headers['content-type'] });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Erreur lors du téléchargement:', err);
      alert('Erreur lors du téléchargement du fichier');
    }
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isMessageRead = (msg: any) => {
    const userId = (session?.user as any)?.id;
    if (!msg.lu || !Array.isArray(msg.lu)) {
      return false;
    }
    return msg.lu.some((l: any) => {
      const luUserId = l?.user?._id?.toString?.() || l?.user?.toString?.();
      return luUserId && userId && luUserId.toString() === userId.toString();
    });
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement du message...</p>
        </div>
      </div>
    );
  }

  if (!session || ((session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin')) {
    return null;
  }

  if (error && !message) {
    return (
      <div className="min-h-screen bg-background">
        <main className="w-full px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-600">{error}</p>
            <Link href="/admin/messages">
              <Button variant="outline" className="mt-4">Retour aux messages</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!message) {
    return null;
  }

  const isContactMessage = message.isContactMessage;
  const expediteur = isContactMessage 
    ? { firstName: message.name?.split(' ')[0] || '', lastName: message.name?.split(' ').slice(1).join(' ') || '', email: message.email }
    : message.expediteur;
  const isReceived = isContactMessage 
    ? true // Les messages de contact sont toujours "reçus" par les admins
    : message.destinataires?.some((d: any) => 
        d._id?.toString() === (session?.user as any)?.id?.toString() || 
        d.toString() === (session?.user as any)?.id?.toString()
      );

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-8">
        {/* En-tête avec bouton retour */}
        <div className="mb-6 flex items-center justify-between">
          <Link href="/admin/messages">
            <Button variant="outline" size="sm">← Retour aux messages</Button>
          </Link>
          {isReceived && (
            <Button onClick={() => setShowReplyModal(true)}>
              Répondre
            </Button>
          )}
        </div>

        {/* Message principal */}
        <div className="bg-white rounded-xl shadow-lg border-l-4 border-primary p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold mb-2">{isContactMessage ? message.subject : message.sujet}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  {isReceived ? 'De' : 'À'}: {isReceived 
                    ? isContactMessage
                      ? `${message.name || ''} (${message.email || ''})`
                      : `${expediteur?.firstName || ''} ${expediteur?.lastName || ''}`.trim() || expediteur?.email
                    : message.typeMessage === 'user_to_admins'
                    ? 'Tous les administrateurs'
                    : message.destinataires?.map((d: any) => 
                        `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email
                      ).join(', ')
                  }
                </span>
                <span>•</span>
                <span>{formatDate(message.createdAt)}</span>
                {isReceived && !isMessageRead(message) && (
                  <>
                    <span>•</span>
                    <span className="px-2 py-1 rounded-full bg-primary text-white text-xs font-semibold">
                      Nouveau
                    </span>
                  </>
                )}
              </div>
            </div>
            {isReceived && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const isRead = isMessageRead(message);
                      if (isContactMessage) {
                        const { contactAPI } = await import('@/lib/api');
                        await contactAPI.markAsRead(message._id || message.id, !isRead);
                      } else {
                        if (isRead) {
                          await messagesAPI.markAsUnread(message._id || message.id);
                        } else {
                          await messagesAPI.markAsRead(message._id || message.id);
                        }
                      }
                      await loadMessage();
                      if (!isContactMessage) {
                        await loadMessageNotifications(message._id || message.id);
                      }
                    } catch (err) {
                      console.error('Erreur lors du changement de statut:', err);
                    }
                  }}
                >
                  {isMessageRead(message) ? 'Marquer comme non lu' : 'Marquer comme lu'}
                </Button>
                {isContactMessage && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowCreateDossierModal(true)}
                  >
                    Créer un dossier
                  </Button>
                )}
              </div>
            )}
          </div>

          {message.copie && message.copie.length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Copie (CC)</p>
              <p className="text-sm font-semibold">
                {message.copie.map((c: any) => 
                  `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email
                ).join(', ')}
              </p>
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Contenu du message
            </h3>
            <div className="prose max-w-none p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="whitespace-pre-wrap text-foreground leading-relaxed">
                {isContactMessage ? message.message : message.contenu}
              </p>
            </div>
          </div>

          {/* Informations complètes pour les messages de contact */}
          {isContactMessage && (
            <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">📋</span>
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Informations de l'expéditeur
                </h3>
                <span className="ml-auto px-2 py-0.5 rounded-full bg-blue-500 text-white text-xs font-semibold">
                  Envoyé depuis le formulaire de contact
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Nom complet</p>
                    <p className="text-sm font-semibold text-foreground">{message.name || 'Non renseigné'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Prénom</p>
                    <p className="text-sm font-semibold text-foreground">
                      {message.name?.split(' ')[0] || 'Non renseigné'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Nom de famille</p>
                    <p className="text-sm font-semibold text-foreground">
                      {message.name?.split(' ').slice(1).join(' ') || 'Non renseigné'}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Adresse e-mail</p>
                    <a 
                      href={`mailto:${message.email}`}
                      className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      {message.email || 'Non renseigné'}
                      <span className="text-xs">✉️</span>
                    </a>
                  </div>
                  {message.phone && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Numéro de téléphone</p>
                      <a 
                        href={`tel:${message.phone}`}
                        className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                      >
                        {message.phone}
                        <span className="text-xs">📞</span>
                      </a>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Date d'envoi</p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatDate(message.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(isContactMessage ? message.documents : message.piecesJointes) && 
           (isContactMessage ? message.documents : message.piecesJointes).length > 0 && (
            <div className="pt-4 border-t">
              <p className="text-sm font-semibold mb-3">Pièces jointes</p>
              <div className="space-y-2">
                {(isContactMessage ? message.documents : message.piecesJointes).map((pj: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
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
                      onClick={async () => {
                        try {
                          if (isContactMessage) {
                            const { contactAPI } = await import('@/lib/api');
                            const response = await contactAPI.downloadDocument(message._id || message.id, pj._id || index.toString());
                            const blob = new Blob([response.data], { type: response.headers['content-type'] });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = pj.originalName;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                          } else {
                            handleDownloadAttachment(message._id || message.id, index, pj.originalName);
                          }
                        } catch (err) {
                          console.error('Erreur lors du téléchargement:', err);
                          alert('Erreur lors du téléchargement du fichier');
                        }
                      }}
                    >
                      Télécharger
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notifications liées - Toujours affichée */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Notifications liées</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadMessageNotifications(message._id || message.id)}
            >
              Actualiser
            </Button>
          </div>
          {messageNotifications.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {messageNotifications.map((notif: any) => (
                <div key={notif._id || notif.id} className="p-3 bg-gray-50 rounded-md border-l-4 border-blue-500">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground mb-1">{notif.titre}</p>
                      <p className="text-xs text-muted-foreground">{notif.message}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {formatDate(notif.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucune notification liée à ce message pour le moment.
            </p>
          )}
        </div>

        {/* Modal de réponse */}
        {showReplyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Répondre</h2>
                <button onClick={() => setShowReplyModal(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
              </div>
              <form onSubmit={handleReply} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div>
                  <Label htmlFor="reply-destinataire">Destinataire *</Label>
                  <select
                    id="reply-destinataire"
                    value={replyData.destinataire}
                    onChange={(e) => setReplyData({ ...replyData, destinataire: e.target.value })}
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Sélectionner un destinataire</option>
                    {expediteur && (
                      <option value={expediteur._id || expediteur.id}>
                        {expediteur.firstName} {expediteur.lastName} ({expediteur.email})
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <Label htmlFor="reply-sujet">Sujet *</Label>
                  <Input
                    id="reply-sujet"
                    value={replyData.sujet}
                    onChange={(e) => setReplyData({ ...replyData, sujet: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="reply-contenu">Message *</Label>
                  <Textarea
                    id="reply-contenu"
                    value={replyData.contenu}
                    onChange={(e) => setReplyData({ ...replyData, contenu: e.target.value })}
                    required
                    placeholder="Votre réponse..."
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
                      setAttachments(files);
                    }}
                  />
                  {attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {attachments.map((file, index) => (
                        <div key={index} className="text-xs text-muted-foreground flex items-center justify-between">
                          <span>📎 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                          <button
                            type="button"
                            onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}
                            className="text-red-500 hover:text-red-700"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setShowReplyModal(false)} disabled={isSubmitting}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !replyData.destinataire}>
                    {isSubmitting ? 'Envoi...' : 'Envoyer la réponse'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de création de dossier depuis un message de contact */}
        {showCreateDossierModal && message && message.isContactMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Créer un dossier depuis ce message</h2>
                <button onClick={() => setShowCreateDossierModal(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setIsCreatingDossier(true);
                setError(null);
                try {
                  // Pré-remplir avec les données du message
                  const nameParts = (message.name || '').split(' ');
                  const dossierData = {
                    ...dossierFormData,
                    clientNom: nameParts.slice(1).join(' ') || '',
                    clientPrenom: nameParts[0] || '',
                    clientEmail: message.email,
                    clientTelephone: message.phone || '',
                    description: dossierFormData.description || `Dossier créé depuis le message de contact: "${message.subject}"\n\n${message.message}`,
                  };
                  
                  const { contactAPI } = await import('@/lib/api');
                  const response = await contactAPI.createDossierFromMessage(message._id || message.id, dossierData);
                  if (response.data.success) {
                    alert('Dossier créé avec succès ! Une notification SMS a été envoyée.');
                    setShowCreateDossierModal(false);
                    router.push(`/admin/dossiers/${response.data.dossier._id || response.data.dossier.id}`);
                  }
                } catch (err: any) {
                  console.error('Erreur lors de la création du dossier:', err);
                  setError(err.response?.data?.message || 'Erreur lors de la création du dossier');
                } finally {
                  setIsCreatingDossier(false);
                }
              }} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div className="p-4 bg-blue-50 rounded-md mb-4">
                  <p className="text-sm font-semibold mb-2">Informations du client (pré-remplies depuis le message)</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Nom:</span> {message.name?.split(' ').slice(1).join(' ') || 'N/A'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Prénom:</span> {message.name?.split(' ')[0] || 'N/A'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email:</span> {message.email}
                    </div>
                    {message.phone && (
                      <div>
                        <span className="text-muted-foreground">Téléphone:</span> {message.phone}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="dossier-titre">Titre du dossier *</Label>
                  <Input
                    id="dossier-titre"
                    value={dossierFormData.titre}
                    onChange={(e) => setDossierFormData({ ...dossierFormData, titre: e.target.value })}
                    placeholder="Ex: Demande de titre de séjour - [Nom du client]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dossier-categorie">Catégorie *</Label>
                    <select
                      id="dossier-categorie"
                      value={dossierFormData.categorie}
                      onChange={(e) => setDossierFormData({ ...dossierFormData, categorie: e.target.value, type: '' })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="">-- Sélectionner --</option>
                      <option value="sejour_titres">Séjour et titres de séjour</option>
                      <option value="contentieux_administratif">Contentieux administratif</option>
                      <option value="asile">Asile</option>
                      <option value="regroupement_familial">Regroupement familial</option>
                      <option value="nationalite_francaise">Nationalité française</option>
                      <option value="eloignement_urgence">Éloignement et urgence</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="dossier-type">Type *</Label>
                    <select
                      id="dossier-type"
                      value={dossierFormData.type}
                      onChange={(e) => setDossierFormData({ ...dossierFormData, type: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                      disabled={!dossierFormData.categorie}
                    >
                      <option value="">-- Sélectionner --</option>
                      {dossierFormData.categorie && (
                        <>
                          {dossierFormData.categorie === 'sejour_titres' && (
                            <>
                              <option value="premier_titre_etudiant">Premier titre (étudiant)</option>
                              <option value="renouvellement_titre">Renouvellement</option>
                              <option value="carte_resident">Carte de résident</option>
                            </>
                          )}
                          {dossierFormData.categorie === 'contentieux_administratif' && (
                            <>
                              <option value="recours_gracieux">Recours gracieux</option>
                              <option value="recours_oqtf">Recours OQTF</option>
                            </>
                          )}
                          {dossierFormData.categorie === 'autre' && (
                            <option value="autre">Autre</option>
                          )}
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dossier-statut">Statut</Label>
                    <select
                      id="dossier-statut"
                      value={dossierFormData.statut}
                      onChange={(e) => setDossierFormData({ ...dossierFormData, statut: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="recu">Reçu</option>
                      <option value="en_cours">En cours</option>
                      <option value="termine">Terminé</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="dossier-priorite">Priorité</Label>
                    <select
                      id="dossier-priorite"
                      value={dossierFormData.priorite}
                      onChange={(e) => setDossierFormData({ ...dossierFormData, priorite: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="normale">Normale</option>
                      <option value="haute">Haute</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="dossier-description">Description</Label>
                  <Textarea
                    id="dossier-description"
                    value={dossierFormData.description}
                    onChange={(e) => setDossierFormData({ ...dossierFormData, description: e.target.value })}
                    placeholder="Description du dossier (sera pré-remplie avec le contenu du message)"
                    rows={6}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setShowCreateDossierModal(false)} disabled={isCreatingDossier}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isCreatingDossier || !dossierFormData.titre || !dossierFormData.categorie || !dossierFormData.type}>
                    {isCreatingDossier ? 'Création...' : 'Créer le dossier'}
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





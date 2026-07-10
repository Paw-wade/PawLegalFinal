'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { messagesAPI, notificationsAPI } from '@/lib/api';
import { Toast } from '@/components/Toast';

function Button({ children, variant = 'default', className = '', size = 'sm', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses: Record<string, string> = {
    default: 'bg-primary text-white hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  const sizeClasses: Record<string, string> = {
    sm: 'h-9 px-3',
    default: 'h-10 px-4',
    lg: 'h-11 px-8',
  };
  const variantClass = variantClasses[variant] ?? variantClasses.default;
  const sizeClass = sizeClasses[size] ?? sizeClasses.sm;
  return (
    <button
      className={`${baseClasses} ${variantClass} ${sizeClass} ${className}`}
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
    <label
      htmlFor={htmlFor}
      className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}
    >
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

export default function ClientMessageDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const messageId = params?.id as string;

  const [message, setMessage] = useState<any>(null);
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageNotifications, setMessageNotifications] = useState<any[]>([]);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyData, setReplyData] = useState({ sujet: '', contenu: '' });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  const { expediteur, isReceived } = useMemo(() => {
    if (!message) {
      return { expediteur: null as any, isReceived: false };
    }
    const isRecv =
      message.destinataires?.some(
        (d: any) =>
          d._id?.toString() === (session?.user as any)?.id?.toString() ||
          d.toString() === (session?.user as any)?.id?.toString()
      ) ?? false;
    return { expediteur: message.expediteur, isReceived: isRecv };
  }, [message, session]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && messageId) {
      loadMessage();
    }
  }, [status, messageId, router]);

  useEffect(() => {
    if (message) {
      loadMessageNotifications(message._id || message.id);
      if (message.expediteur) {
        setReplyData({
          sujet: `Re: ${message.sujet}`,
          contenu: '',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  const loadMessage = async () => {
    if (!messageId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await messagesAPI.getMessage(messageId);
      if (response.data.success) {
        const fetchedMessage = response.data.message;
        setMessage(fetchedMessage);

        if (response.data.threadMessages && Array.isArray(response.data.threadMessages)) {
          setThreadMessages(response.data.threadMessages);
        } else {
          setThreadMessages([fetchedMessage]);
        }

        const userId = (session?.user as any)?.id?.toString?.();
        const isRead = fetchedMessage.lu?.some((l: any) => {
          const luUserId = l?.user?._id?.toString?.() || l?.user?.toString?.();
          return luUserId === userId;
        });

        if (userId && !isRead) {
          setMessage((prev: any) => {
            if (!prev) return prev;
            const alreadyRead = prev.lu?.some((l: any) => {
              const luUserId = l?.user?._id?.toString?.() || l?.user?.toString?.();
              return luUserId === userId;
            });
            if (alreadyRead) return prev;
            return {
              ...prev,
              lu: [...(prev.lu || []), { user: userId, readAt: new Date().toISOString() }],
            };
          });
          try {
            await messagesAPI.markAsRead(messageId);
          } catch (err) {
            console.error('Erreur lors du marquage comme lu:', err);
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
        const relatedNotifications = (response.data.notifications || []).filter(
          (notif: any) => notif.metadata?.messageId === msgId?.toString()
        );
        setMessageNotifications(relatedNotifications);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des notifications du message:', err);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('sujet', replyData.sujet);
      formDataToSend.append('contenu', replyData.contenu);

      const messageParentId = message?._id || message?.id;
      if (!messageParentId) {
        setError("Impossible d'identifier le message parent.");
        setIsSubmitting(false);
        return;
      }
      formDataToSend.append('messageParent', messageParentId);

      const dossierId =
        message?.dossierId?._id?.toString() ||
        message?.dossierId?.toString() ||
        message?.dossier?._id?.toString() ||
        message?.dossier?.toString();
      if (dossierId) {
        formDataToSend.append('dossierId', dossierId);
      }

      attachments.forEach((file) => {
        formDataToSend.append('piecesJointes', file);
      });

      const response = await messagesAPI.sendMessage(formDataToSend);
      if (response.data.success) {
        setToast({ message: '✅ Réponse envoyée avec succès.', type: 'success' });
        setShowReplyModal(false);
        setReplyData({ sujet: '', contenu: '' });
        setAttachments([]);
        await loadMessage();
      }
    } catch (err: any) {
      console.error("Erreur lors de l'envoi de la réponse:", err);
      setError(err.response?.data?.message || "Erreur lors de l'envoi de la réponse");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadAttachment = async (msgId: string, index: number, filename: string) => {
    try {
      const response = await messagesAPI.downloadAttachment(msgId, index);
      const { triggerBlobDownload } = await import('@/lib/downloadFile');
      triggerBlobDownload(response, filename);
    } catch (err) {
      console.error('Erreur lors du téléchargement:', err);
      setToast({ message: 'Erreur lors du téléchargement du fichier', type: 'error' });
    }
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement du message...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (error && !message) {
    return (
      <div className="min-h-screen bg-background">
        <main className="w-full px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-600">{error}</p>
            <Link href="/client/messages">
              <Button variant="outline" className="mt-4">
                Retour aux messages
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!message) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-8">
        {/* En-tête avec bouton retour */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <Link href="/client/messages">
            <Button variant="outline" size="sm">
              ← Retour aux messages
            </Button>
          </Link>
          <div className="flex flex-col sm:flex-row gap-2">
            {isReceived && (
              <Button onClick={() => setShowReplyModal(true)}>
                Répondre
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!confirm('Êtes-vous sûr de vouloir supprimer ce message ?')) return;
                try {
                  await messagesAPI.deleteMessage(messageId);
                  router.push('/client/messages');
                } catch (err: any) {
                  console.error('Erreur lors de la suppression:', err);
                  setToast({ message: 'Erreur lors de la suppression du message', type: 'error' });
                }
              }}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              🗑️ Supprimer
            </Button>
          </div>
        </div>

        {/* Fil de discussion complet */}
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-4">Fil de discussion</h2>
          <div className="space-y-4">
            {threadMessages.length > 0 ? (
              threadMessages.map((msg: any, index: number) => {
                const msgExpediteur = msg.expediteur;
                const msgExpediteurName =
                  msgExpediteur?.firstName && msgExpediteur?.lastName
                    ? `${msgExpediteur.firstName} ${msgExpediteur.lastName}`
                    : msgExpediteur?.email || 'Expéditeur inconnu';
                const msgIsReceived =
                  msg.destinataires?.some(
                    (d: any) =>
                      d._id?.toString() === (session?.user as any)?.id?.toString() ||
                      d.toString() === (session?.user as any)?.id?.toString()
                  ) ||
                  msg.copie?.some(
                    (c: any) =>
                      c._id?.toString() === (session?.user as any)?.id?.toString() ||
                      c.toString() === (session?.user as any)?.id?.toString()
                  );
                const msgIsRead = isMessageRead(msg);
                const isRootMessage = !msg.messageParent;

                return (
                  <div
                    key={msg._id || msg.id || index}
                    className={`bg-white rounded-xl shadow-md border-l-4 p-6 ${
                      msgIsReceived && !msgIsRead
                        ? 'border-primary bg-gradient-to-r from-primary/5 via-primary/2 to-white'
                        : 'border-gray-300'
                    } ${isRootMessage ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {isRootMessage && (
                            <span className="px-2 py-1 rounded-full bg-primary text-white text-xs font-semibold">
                              Message initial
                            </span>
                          )}
                          <h3 className="text-lg font-bold">{msg.sujet || msg.subject}</h3>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <span>
                            <span className="font-semibold">{msgIsReceived ? 'De' : 'À'}:</span>{' '}
                            {msgIsReceived
                              ? msgExpediteurName
                              : msg.typeMessage === 'user_to_admins'
                              ? 'Tous les administrateurs'
                              : msg.destinataires
                                  ?.map(
                                    (d: any) =>
                                      `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email
                                  )
                                  .join(', ') || 'Aucun destinataire'}
                          </span>
                          <span>•</span>
                          <span className="font-semibold">📅 {formatDate(msg.createdAt)}</span>
                          {msg.updatedAt && msg.updatedAt !== msg.createdAt && (
                            <>
                              <span>•</span>
                              <span className="text-xs">Modifié: {formatDate(msg.updatedAt)}</span>
                            </>
                          )}
                          {msgIsReceived && !msgIsRead && (
                            <>
                              <span>•</span>
                              <span className="px-2 py-1 rounded-full bg-primary text-white text-xs font-semibold">
                                ✉️ Nouveau
                              </span>
                            </>
                          )}
                          {msgIsRead && (
                            <>
                              <span>•</span>
                              <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                                ✓ Lu
                              </span>
                            </>
                          )}
                        </div>
                        {msg.copie && msg.copie.length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <span className="font-semibold">Copie (CC):</span>{' '}
                            {msg.copie
                              .map(
                                (c: any) =>
                                  `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email
                              )
                              .join(', ')}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="prose max-w-none p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="whitespace-pre-wrap text-foreground leading-relaxed">
                          {msg.contenu || msg.message}
                        </p>
                      </div>
                    </div>

                    {msg.piecesJointes && msg.piecesJointes.length > 0 && (
                      <div className="pt-4 border-t">
                        <p className="text-sm font-semibold mb-2">
                          Pièces jointes ({msg.piecesJointes.length})
                        </p>
                        <div className="space-y-2">
                          {msg.piecesJointes.map((pj: any, pjIndex: number) => (
                            <div
                              key={pjIndex}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span>📎</span>
                                <span>{pj.originalName}</span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleDownloadAttachment(msg._id || msg.id, pjIndex, pj.originalName)
                                }
                              >
                                Télécharger
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="bg-white rounded-xl shadow-md border-l-4 border-primary p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h1 className="text-2xl font-bold mb-2">{message.sujet}</h1>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>
                        {isReceived ? 'De' : 'À'}:{' '}
                        {isReceived
                          ? `${expediteur?.firstName || ''} ${expediteur?.lastName || ''}`.trim() ||
                            expediteur?.email
                          : message.typeMessage === 'user_to_admins'
                          ? 'Tous les administrateurs'
                          : message.destinataires
                              ?.map(
                                (d: any) =>
                                  `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email
                              )
                              .join(', ')}
                      </span>
                      <span>•</span>
                      <span>📅 {formatDate(message.createdAt)}</span>
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const read = isMessageRead(message);
                          if (read) {
                            await messagesAPI.markAsUnread(message._id || message.id);
                          } else {
                            await messagesAPI.markAsRead(message._id || message.id);
                          }
                          await loadMessage();
                          await loadMessageNotifications(message._id || message.id);
                        } catch (err) {
                          console.error('Erreur lors du changement de statut:', err);
                        }
                      }}
                    >
                      {isMessageRead(message) ? 'Marquer comme non lu' : 'Marquer comme lu'}
                    </Button>
                  )}
                </div>

                {message.copie && message.copie.length > 0 && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Copie (CC)</p>
                    <p className="text-sm font-semibold">
                      {message.copie
                        .map(
                          (c: any) =>
                            `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email
                        )
                        .join(', ')}
                    </p>
                  </div>
                )}

                <div className="prose max-w-none mb-6">
                  <p className="whitespace-pre-wrap text-foreground">{message.contenu}</p>
                </div>

                {message.piecesJointes && message.piecesJointes.length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-sm font-semibold mb-3">Pièces jointes</p>
                    <div className="space-y-2">
                      {message.piecesJointes.map((pj: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                        >
                          <div className="flex items-center gap-2">
                            <span>📎</span>
                            <span className="text-sm">{pj.originalName}</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleDownloadAttachment(message._id || message.id, index, pj.originalName)
                            }
                          >
                            Télécharger
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Notifications liées */}
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
                <div
                  key={notif._id || notif.id}
                  className="p-3 bg-gray-50 rounded-md border-l-4 border-blue-500"
                >
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
                <button
                  onClick={() => {
                    setShowReplyModal(false);
                    setReplyData({ sujet: '', contenu: '' });
                    setAttachments([]);
                  }}
                  className="text-muted-foreground hover:text-foreground text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleReply} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div>
                  <Label htmlFor="reply-sujet">Sujet *</Label>
                  <Input
                    id="reply-sujet"
                    value={replyData.sujet}
                    onChange={(e) => setReplyData({ ...replyData, sujet: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Votre réponse sera envoyée à tous les administrateurs
                  </p>
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
                  <Label htmlFor="reply-attachments">
                    Pièces jointes (max 5 fichiers, 10MB chacun)
                  </Label>
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
                      setAttachments(files);
                    }}
                  />
                  {attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {attachments.map((file, index) => (
                        <div
                          key={index}
                          className="text-xs text-muted-foreground flex items-center justify-between"
                        >
                          <span>📎 {file.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setAttachments(attachments.filter((_, i) => i !== index))
                            }
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowReplyModal(false);
                      setReplyData({ sujet: '', contenu: '' });
                      setAttachments([]);
                    }}
                    disabled={isSubmitting}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Envoi...' : 'Envoyer la réponse'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}


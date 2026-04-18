'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { notificationsAPI } from '@/lib/api';
import { DocumentRequestNotificationModal } from '@/components/DocumentRequestNotificationModal';
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

function NotificationsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | NotificationCategoryKey>('all');
  const [selectedDocumentRequestNotification, setSelectedDocumentRequestNotification] = useState<any>(null);
  const [showDocumentRequestModal, setShowDocumentRequestModal] = useState(false);
  const [selectedDossierId, setSelectedDossierId] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  // Gérer les query params pour filtrer par dossier
  useEffect(() => {
    const dossierIdParam = searchParams.get('dossierId');
    const filterParam = searchParams.get('filter');
    
    if (dossierIdParam) {
      setSelectedDossierId(dossierIdParam);
    }
    
    if (filterParam === 'unread') {
      setFilter('unread');
    }
  }, [searchParams]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      // Ensure token is stored in localStorage
      if (session && (session.user as any)?.accessToken && typeof window !== 'undefined') {
        const token = (session.user as any).accessToken;
        if (!localStorage.getItem('token')) {
          localStorage.setItem('token', token);
          console.log('🔑 Token stored in localStorage from session');
        }
      }
      loadNotifications();
    }
  }, [session, status, router, filter]);

  const loadNotifications = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await notificationsAPI.getNotifications({
        lu: filter === 'unread' ? false : undefined,
        limit: 100
      });
      if (response.data.success) {
        setNotifications(response.data.notifications || []);
      } else {
        setError('Erreur lors du chargement des notifications');
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des notifications:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement des notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      const response = await notificationsAPI.markAsRead(id);
      if (response.data.success) {
        await loadNotifications();
        setToast({ message: '✅ Notification marquée comme lue.', type: 'success' });
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour de la notification:', err);
      setToast({ message: err.response?.data?.message || 'Erreur lors de la mise à jour de la notification', type: 'error' });
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const response = await notificationsAPI.markAllAsRead();
      if (response.data.success) {
        await loadNotifications();
        setToast({ message: '✅ Toutes les notifications ont été marquées comme lues.', type: 'success' });
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour des notifications:', err);
      setToast({ message: err.response?.data?.message || 'Erreur lors de la mise à jour des notifications', type: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await notificationsAPI.deleteNotification(id);
      if (response.data.success) {
        await loadNotifications();
        setToast({ message: '✅ Notification supprimée avec succès.', type: 'success' });
      }
    } catch (err: any) {
      console.error('Erreur lors de la suppression de la notification:', err);
      setToast({ message: err.response?.data?.message || 'Erreur lors de la suppression de la notification', type: 'error' });
    }
  };

  const getNotificationIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      dossier_created: '📁',
      dossier_updated: '✏️',
      dossier_deleted: '🗑️',
      dossier_status_changed: '🔄',
      dossier_assigned: '👤',
      dossier_cancelled: '❌',
      document_uploaded: '📄',
      document_request: '📄',
      document_received: '📥',
      appointment_created: '📅',
      appointment_updated: '📅',
      appointment_cancelled: '❌',
      message_received: '💬',
      tarification_choice_requested: '💶',
      tarification_payment_reminder: '💶',
      other: '🔔',
    };
    return icons[type] || '🔔';
  };

  const getNotificationColor = (type: string) => {
    const colors: { [key: string]: string } = {
      dossier_created: 'bg-blue-50 border border-blue-300/70',
      dossier_updated: 'bg-yellow-50 border border-yellow-300/70',
      dossier_deleted: 'bg-red-50 border border-red-300/70',
      dossier_status_changed: 'bg-green-50 border border-green-300/70',
      dossier_assigned: 'bg-purple-50 border border-purple-300/70',
      dossier_cancelled: 'bg-orange-50 border border-orange-300/70',
      document_uploaded: 'bg-indigo-50 border border-indigo-300/70',
      document_request: 'bg-orange-50 border border-orange-300/70',
      document_received: 'bg-green-50 border border-green-300/70',
      appointment_created: 'bg-teal-50 border border-teal-300/70',
      appointment_updated: 'bg-teal-50 border border-teal-300/70',
      appointment_cancelled: 'bg-red-50 border border-red-300/70',
      message_received: 'bg-pink-50 border border-pink-300/70',
      tarification_choice_requested: 'bg-amber-50 border border-amber-300/70',
      tarification_payment_reminder: 'bg-amber-50 border border-amber-300/70',
      other: 'bg-gray-50 border border-gray-300/70',
    };
    return colors[type] || 'bg-gray-50 border border-gray-300/70';
  };

  type NotificationCategoryKey = 'dossiers' | 'rendezvous' | 'messages' | 'documents' | 'autres';

  const getNotificationCategory = (notification: any): NotificationCategoryKey => {
    const type = notification.type || '';
    if (type === 'tarification_choice_requested' || type === 'tarification_payment_reminder') return 'dossiers';
    if (type.startsWith('dossier_')) return 'dossiers';
    if (type.startsWith('appointment_')) return 'rendezvous';
    if (type === 'message_received') return 'messages';
    if (type === 'document_uploaded') return 'documents';
    return 'autres';
  };

  const categoryDefinitions: { key: NotificationCategoryKey; label: string; icon: string }[] = [
    { key: 'dossiers', label: 'Dossiers', icon: '📁' },
    { key: 'rendezvous', label: 'Rendez-vous', icon: '📅' },
    { key: 'messages', label: 'Messagerie', icon: '💬' },
    { key: 'documents', label: 'Documents', icon: '📄' },
    { key: 'autres', label: 'Autres notifications', icon: '🔔' },
  ];

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

  // Appliquer le filtre de statut (lu/non-lu) sur toutes les notifications
  let filteredByStatus = filter === 'unread' ? notifications.filter(n => !n.lu) : notifications;

  // Filtrer par dossier si sélectionné
  if (selectedDossierId) {
    filteredByStatus = filteredByStatus.filter((notif) => {
      const notifDossierId = notif.data?.dossierId || notif.dossierId;
      return notifDossierId && (
        notifDossierId.toString() === selectedDossierId.toString() ||
        (typeof notifDossierId === 'object' && notifDossierId._id?.toString() === selectedDossierId.toString())
      );
    });
  }

  // Catégoriser les notifications filtrées par statut
  const categorizedNotifications: Record<NotificationCategoryKey, any[]> = {
    dossiers: [],
    rendezvous: [],
    messages: [],
    documents: [],
    autres: [],
  };

  filteredByStatus.forEach((notif) => {
    const key = getNotificationCategory(notif);
    categorizedNotifications[key].push(notif);
  });

  // Fonctions pour obtenir les comptes par catégorie
  const getCategoryUnreadCount = (key: NotificationCategoryKey) =>
    (categorizedNotifications[key] || []).filter((n) => !n.lu).length;

  const getCategoryCount = (key: NotificationCategoryKey) => (categorizedNotifications[key] || []).length;

  // Notifications visibles selon les filtres appliqués
  const visibleNotifications = (() => {
    let base = filteredByStatus;
    
    // Appliquer le filtre de catégorie
    if (categoryFilter !== 'all') {
      base = base.filter((n) => getNotificationCategory(n) === categoryFilter);
    }
    
    return base.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  })();

  // Calculer les comptes pour les badges
  // Total toutes catégories avec le filtre de statut appliqué
  const totalCount = filteredByStatus.length;
  const unreadCount = filteredByStatus.filter(n => !n.lu).length;
  
  // Comptes pour la catégorie sélectionnée
  const categoryCount = categoryFilter === 'all' 
    ? totalCount 
    : getCategoryCount(categoryFilter);
  const categoryUnreadCount = categoryFilter === 'all'
    ? unreadCount
    : getCategoryUnreadCount(categoryFilter);

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">Mes Notifications</h1>
            <p className="text-muted-foreground text-sm">Vue claire par catégories</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllAsRead}>
              Tout marquer comme lu
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement des notifications...</p>
          </div>
        ) : visibleNotifications.length === 0 && !isLoading ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">🔔</div>
            <p className="text-muted-foreground text-lg mb-2">
              {filter === 'unread' ? 'Aucune notification non lue' : 'Aucune notification'}
            </p>
            <p className="text-sm text-muted-foreground">
              Vous serez notifié lorsque des actions seront effectuées sur vos dossiers
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Badges catégories */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Badges statut */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                    filter === 'all'
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white border-gray-200 hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  Toutes
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                    filter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {categoryFilter === 'all' ? totalCount : categoryCount}
                  </span>
                </button>

                <button
                  onClick={() => setFilter('unread')}
                  className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                    filter === 'unread'
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white border-gray-200 hover:border-primary/40 hover:bg-primary/5'
                  }`}
                  title="Afficher uniquement les notifications non lues"
                >
                  Non lues
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                    filter === 'unread' ? 'bg-white/20 text-white' : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {categoryFilter === 'all' ? unreadCount : categoryUnreadCount}
                  </span>
                </button>
              </div>

              <div className="hidden sm:block w-px h-8 bg-gray-200 mx-1" />

              {/* Badges catégories */}
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                  categoryFilter === 'all'
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white border-gray-200 hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                Toutes catégories
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                  categoryFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                }`}>
                  {totalCount}
                </span>
              </button>

              {categoryDefinitions.map(({ key, label, icon }) => {
                // Calculer les comptes en tenant compte du filtre de statut
                const categoryNotifs = filteredByStatus.filter((n) => getNotificationCategory(n) === key);
                const total = categoryNotifs.length;
                const unreadInCat = categoryNotifs.filter((n) => !n.lu).length;
                const active = categoryFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setCategoryFilter(key)}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-all flex items-center gap-2 ${
                      active
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white border-gray-200 hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    <span className="text-base">{icon}</span>
                    <span>{label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {total}
                    </span>
                    {filter === 'all' && unreadInCat > 0 && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                        active ? 'bg-red-500/90 text-white' : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {unreadInCat} non lue{unreadInCat > 1 ? 's' : ''}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Liste */}
            {visibleNotifications.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucune notification dans cette catégorie.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {visibleNotifications.map((notification: any) => (
                  <div
                    key={notification._id || notification.id}
                    className={`bg-white rounded-xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-18px_rgba(59,130,246,0.35)] ${getNotificationColor(notification.type)} ${
                      notification.lu ? 'opacity-90' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${
                        notification.lu ? 'bg-gray-100' : 'bg-primary/10'
                      }`}>
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`font-semibold text-sm ${notification.lu ? 'text-muted-foreground' : 'text-foreground'}`}>
                              {notification.titre}
                            </p>
                            <p className={`text-xs mt-1 line-clamp-2 ${notification.lu ? 'text-muted-foreground' : 'text-gray-700'}`}>
                              {notification.message}
                            </p>
                          </div>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                            {new Date(notification.createdAt).toLocaleDateString('fr-FR', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div className="flex gap-2 flex-wrap mt-3">
                          {notification.type === 'document_request' && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setSelectedDocumentRequestNotification(notification);
                                setShowDocumentRequestModal(true);
                              }}
                              className="text-xs h-9 px-3 bg-primary hover:bg-primary/90 text-white"
                            >
                              📤 Envoyer le document
                            </Button>
                          )}
                          {notification.lien && (
                            <Link href={notification.lien}>
                              <Button variant="outline" size="sm" className="text-xs h-9 px-3">
                                Ouvrir
                              </Button>
                            </Link>
                          )}
                          {!notification.lu && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMarkAsRead(notification._id || notification.id)}
                              className="text-xs h-9 px-3"
                            >
                              Marquer comme lu
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(notification._id || notification.id)}
                            className="text-red-600 hover:text-red-700 text-xs h-9 px-3"
                          >
                            Supprimer
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal de demande de document */}
      <DocumentRequestNotificationModal
        isOpen={showDocumentRequestModal}
        onClose={() => {
          setShowDocumentRequestModal(false);
          setSelectedDocumentRequestNotification(null);
          loadNotifications();
        }}
        notification={selectedDocumentRequestNotification}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Chargement...</div>}>
      <NotificationsContent />
    </Suspense>
  );
}


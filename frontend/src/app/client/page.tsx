'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ReservationWidget } from '@/components/ReservationWidget';
import { ReservationBadge } from '@/components/ReservationBadge';
import { MessageNotificationModal } from '@/components/MessageNotificationModal';
import { AppointmentBadgeModal } from '@/components/AppointmentBadgeModal';
import { DocumentRequestNotificationModal } from '@/components/DocumentRequestNotificationModal';
import { dossiersAPI, documentsAPI, appointmentsAPI, userAPI, messagesAPI, notificationsAPI, documentRequestsAPI, forumAPI } from '@/lib/api';
import { getStatutColor, getStatutLabel, getPrioriteColor } from '@/lib/dossierUtils';
import { useCmsText } from '@/lib/contentClient';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

function ClientDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [stats, setStats] = useState({
    dossiers: 0,
    documents: 0,
    rendezVous: 0,
    dossiersEnCours: 0,
  });
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [recentDossiers, setRecentDossiers] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [unreadMessage, setUnreadMessage] = useState<any>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [hasCheckedMessages, setHasCheckedMessages] = useState(false);
  const [messagesPreview, setMessagesPreview] = useState<any[]>([]);
  const [hasToken, setHasToken] = useState(false);
  const [recentAppointments, setRecentAppointments] = useState<any[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [documentRequests, setDocumentRequests] = useState<Record<string, any[]>>({});
  const [selectedDocumentRequest, setSelectedDocumentRequest] = useState<any>(null);
  const [showDocumentRequestModal, setShowDocumentRequestModal] = useState(false);
  const [documentRequestNotification, setDocumentRequestNotification] = useState<any>(null);
  const [bookmarkedThreads, setBookmarkedThreads] = useState<any[]>([]);
  const [showBookmarksBar, setShowBookmarksBar] = useState(true);

  // Textes CMS pour le header du dashboard client
  const dashboardTitleClient = useCmsText(
    'client.dashboard.title',
    'Bienvenue'
  );
  const dashboardSubtitleClient = useCmsText(
    'client.dashboard.subtitle',
    "Gérez vos dossiers et suivez l'avancement de vos démarches"
  );

  // Vérifier si on a un token dans localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      setHasToken(!!token);
    }
  }, []);

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

    // Si on a une session, vérifier le profil et le rôle
    if (session) {
      // S'assurer que le token est stocké dans localStorage
      if ((session.user as any)?.accessToken && typeof window !== 'undefined') {
        const accessToken = (session.user as any).accessToken;
        if (!localStorage.getItem('token')) {
          localStorage.setItem('token', accessToken);
          console.log('🔑 Token stocké dans localStorage depuis la session');
        }
      }

      // Définir userRole une seule fois
      const userRole = (session.user as any)?.role;
      const isAdmin = userRole === 'admin' || userRole === 'superadmin';
      const isPartenaire = userRole === 'partenaire';

      // Vérifier le délai de 7 jours pour la complétion du profil (sauf pour admin/superadmin/partenaire)
      if (!isAdmin && !isPartenaire) {
        // Charger les informations utilisateur pour vérifier le délai
        userAPI.getProfile().then(res => {
          if (res.data.success && res.data.user) {
            if (!res.data.user.profilComplete && res.data.user.createdAt) {
              const daysSinceCreation = Math.floor((Date.now() - new Date(res.data.user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
              if (daysSinceCreation >= 7) {
                // Le délai est dépassé, rediriger vers la page de complétion avec un message
                router.push('/auth/complete-profile?expired=true');
                return;
              }
            }
          }
        }).catch(() => {
          // En cas d'erreur, continuer
        });
      }
      
      // Si admin, rediriger vers l'espace admin
      if (isAdmin) {
        console.log('🚫 Admin tentant d\'accéder à la vue client - redirection vers /admin');
        router.push('/admin');
        return;
      }

      // Si partenaire, rediriger vers l'espace partenaire
      if (isPartenaire) {
        console.log('🚫 Partenaire tentant d\'accéder à la vue client - redirection vers /partenaire');
        router.push('/partenaire');
        return;
      }

      // Charger les statistiques depuis l'API
      loadStats();
      loadUserProfile();
      checkUnreadMessages();
      checkDocumentRequestNotifications();
      loadNotifications();
      loadDocumentRequests();
      loadForumBookmarks();
    } else if (token) {
      // Si on a un token mais pas de session, charger quand même les stats
      loadStats();
      loadUserProfile();
      checkUnreadMessages();
      checkDocumentRequestNotifications();
      loadNotifications();
      loadDocumentRequests();
    }
  }, [session, status, router, searchParams]);

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

  const loadForumBookmarks = async () => {
    try {
      const res = await forumAPI.getBookmarks();
      if (res.data?.success) {
        const bookmarks = res.data.bookmarks || [];
        const threads = bookmarks
          .map((b: any) =>
            b.thread
              ? {
                  ...b.thread,
                  newRepliesCount: b.newRepliesCount ?? 0,
                }
              : null
          )
          .filter((t: any) => !!t)
          .slice(0, 10);
        setBookmarkedThreads(threads);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des signets forum:', err);
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

  const getCategorieLabel = (categorie: string) => {
    const categories: Record<string, string> = {
      sejour_titres: 'Séjour et titres de séjour',
      contentieux_administratif: 'Contentieux administratif',
      asile: 'Asile',
      regroupement_familial: 'Regroupement familial',
      nationalite_francaise: 'Nationalité française',
      eloignement_urgence: 'Éloignement et urgence',
      autre: 'Autre'
    };
    return categories[categorie] || categorie;
  };

  const loadDocumentRequests = async () => {
    try {
      // Charger toutes les demandes de documents en attente pour les dossiers du client
      const response = await documentRequestsAPI.getRequests({ status: 'pending' });
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

  const loadStatsForUser = async (userId: string) => {
    setIsLoading(true);
    try {
      // Utiliser l'API admin avec l'ID de l'utilisateur impersonné
      const dossiersResponse = await dossiersAPI.getAllDossiers({ userId });
      if (dossiersResponse.data.success) {
        const dossiers = dossiersResponse.data.dossiers || [];
        setStats(prev => ({
          ...prev,
          dossiers: dossiers.length,
          dossiersEnCours: dossiers.filter((d: any) => {
            const statut = d.statut;
            return statut === 'recu' || statut === 'accepte' || statut === 'en_attente_onboarding' || 
                   statut === 'en_cours_instruction' || statut === 'pieces_manquantes' || 
                   statut === 'dossier_complet' || statut === 'depose' || statut === 'en_instruction';
          }).length,
        }));
        setRecentDossiers(dossiers.slice(0, 5));
      }

      // Charger les documents via l'API admin
      const documentsResponse = await documentsAPI.getAllDocuments({ userId });
      if (documentsResponse.data.success) {
        setStats(prev => ({
          ...prev,
          documents: documentsResponse.data.documents?.length || 0,
        }));
      }

      // Charger les rendez-vous via l'API admin
      const appointmentsResponse = await appointmentsAPI.getAllAppointments({ userId });
      if (appointmentsResponse.data.success) {
        const appointments = appointmentsResponse.data.data || appointmentsResponse.data.appointments || [];
        setStats(prev => ({
          ...prev,
          rendezVous: appointments.length,
        }));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserProfileForUser = async (userId: string) => {
    try {
      const response = await userAPI.getUserById(userId);
      if (response.data.success) {
        setUserProfile(response.data.user);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du profil:', error);
    }
  };


  // Vérifier les messages non lus à la connexion
  const checkUnreadMessages = async () => {
    if (hasCheckedMessages) return;
    
    try {
      const response = await messagesAPI.getMessages({ type: 'unread' });
      if (response.data.success && response.data.messages && response.data.messages.length > 0) {
        // Prendre le message le plus récent
        const latestMessage = response.data.messages[0];
        setUnreadMessage(latestMessage);
        setShowMessageModal(true);
        // Garder un aperçu des 3 derniers messages pour le bloc messagerie du dashboard
        setMessagesPreview(response.data.messages.slice(0, 3));
        setHasCheckedMessages(true);
      } else {
        setMessagesPreview([]);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des messages:', error);
    }
  };

  // Vérifier les notifications de demandes de documents
  const checkDocumentRequestNotifications = async () => {
    try {
      // D'abord, vérifier s'il y a des demandes de documents en attente réelles pour l'utilisateur connecté
      const documentRequestsResponse = await documentRequestsAPI.getRequests({ 
        status: 'pending' 
      });
      
      // Si aucune demande en attente, ne pas afficher le modal
      if (!documentRequestsResponse.data.success || 
          !documentRequestsResponse.data.documentRequests || 
          documentRequestsResponse.data.documentRequests.length === 0) {
        console.log('ℹ️ Aucune demande de document en attente trouvée');
        return;
      }

      // Prendre la demande la plus récente
      const latestRequest = documentRequestsResponse.data.documentRequests[0];
      
      // Vérifier que la demande existe vraiment et est bien en attente
      if (!latestRequest || latestRequest.status !== 'pending') {
        console.log('ℹ️ La demande de document n\'est plus en attente');
        return;
      }

      // Vérifier s'il y a une notification non lue correspondante
      const notificationsResponse = await notificationsAPI.getNotifications({
        type: 'document_request',
        lu: false,
        limit: 10
      });

      if (notificationsResponse.data.success && notificationsResponse.data.notifications) {
        // Trouver la notification correspondant à cette demande de document
        const matchingNotification = notificationsResponse.data.notifications.find(
          (notif: any) => {
            const notifRequestId = notif.metadata?.documentRequestId || notif.data?.documentRequestId;
            const requestId = latestRequest._id || latestRequest.id;
            return notifRequestId && requestId && notifRequestId.toString() === requestId.toString();
          }
        );

        if (matchingNotification) {
          // Créer un objet notification enrichi avec les données de la demande
          const enrichedNotification = {
            ...matchingNotification,
            data: {
              ...matchingNotification.data,
              documentRequestId: latestRequest._id || latestRequest.id,
              dossierId: latestRequest.dossier?._id || latestRequest.dossier,
              dossierNumero: latestRequest.dossier?.numero || latestRequest.dossier?._id?.toString().slice(-6),
              documentType: latestRequest.documentType,
              documentTypeLabel: latestRequest.documentTypeLabel,
              isUrgent: latestRequest.isUrgent,
            }
          };
          console.log('✅ Demande de document valide trouvée, affichage du modal');
          setDocumentRequestNotification(enrichedNotification);
          setShowDocumentRequestModal(true);
        } else {
          console.log('ℹ️ Aucune notification non lue correspondante trouvée pour la demande');
        }
      } else {
        console.log('ℹ️ Aucune notification de type document_request trouvée');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la vérification des notifications de demandes de documents:', error);
    }
  };

  // (Rafraîchissement automatique supprimé pour éviter les sursauts de page)

  const loadUserProfile = async () => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token && session && (session.user as any)?.accessToken) {
        localStorage.setItem('token', (session.user as any).accessToken);
      }

      const response = await userAPI.getProfile();
      if (response.data.success) {
        const profile = response.data.user || response.data.data;
        setUserProfile(profile);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du profil:', error);
    }
  };

  // Calculer les jours restants jusqu'à l'échéance du titre de séjour
  const calculateDaysRemaining = () => {
    if (!userProfile?.dateExpiration) return null;
    const expirationDate = new Date(userProfile.dateExpiration);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expirationDate.setHours(0, 0, 0, 0);
    const diffTime = expirationDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const loadStats = async () => {
    setIsLoading(true);
    try {

      console.log('📊 Chargement des statistiques pour l\'utilisateur:', session?.user?.email);
      
      // Vérifier que le token est disponible
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token && session && (session.user as any)?.accessToken) {
          localStorage.setItem('token', (session.user as any).accessToken);
          console.log('🔑 Token stocké dans localStorage depuis la session');
        }
      }

      // Charger les dossiers
      try {
        const dossiersResponse = await dossiersAPI.getMyDossiers();
        if (dossiersResponse.data.success) {
          const dossiers = dossiersResponse.data.dossiers || [];
          setStats(prev => ({
            ...prev,
            dossiers: dossiers.length,
            dossiersEnCours: dossiers.filter((d: any) => {
              const statut = d.statut;
              // Nouveaux statuts en cours
              return statut === 'recu' || 
                     statut === 'accepte' || 
                     statut === 'en_attente_onboarding' || 
                     statut === 'en_cours_instruction' || 
                     statut === 'pieces_manquantes' || 
                     statut === 'dossier_complet' || 
                     statut === 'depose' || 
                     statut === 'reception_confirmee' || 
                     statut === 'complement_demande' || 
                     statut === 'communication_motifs' || 
                     statut === 'recours_preparation' || 
                     statut === 'refere_mesures_utiles' || 
                     statut === 'refere_suspension_rep' ||
                     // Anciens statuts pour compatibilité
                     statut === 'en_cours' || 
                     statut === 'en_attente' ||
                     statut === 'en_revision';
            }).length
          }));
          // Garder les 5 dossiers les plus récents
          setRecentDossiers(dossiers.slice(0, 5));
        }
      } catch (err) {
        console.error('❌ Erreur lors du chargement des dossiers:', err);
      }

      // Charger les documents
      try {
        const documentsResponse = await documentsAPI.getMyDocuments();
        if (documentsResponse.data.success) {
          setStats(prev => ({
            ...prev,
            documents: documentsResponse.data.documents?.length || 0
          }));
        }
      } catch (err) {
        console.error('❌ Erreur lors du chargement des documents:', err);
      }

      // Charger les rendez-vous
      try {
        const appointmentsResponse = await appointmentsAPI.getMyAppointments();
        if (appointmentsResponse.data.success) {
          const appointments = appointmentsResponse.data.data || appointmentsResponse.data.appointments || [];
          setStats(prev => ({
            ...prev,
            rendezVous: appointments.length
          }));
          
          // Trier par date (plus récents en premier) et prendre les 3 prochains
          const sortedAppointments = appointments
            .filter((apt: any) => apt.statut !== 'annule' && apt.statut !== 'annulé')
            .map((apt: any) => {
              // Calculer les alertes pour chaque rendez-vous
              const aptDate = new Date(apt.date);
              const aptTime = apt.heure ? apt.heure.split(':') : ['00', '00'];
              aptDate.setHours(parseInt(aptTime[0]), parseInt(aptTime[1]), 0, 0);
              const now = new Date();
              const diffMs = aptDate.getTime() - now.getTime();
              const diffHours = diffMs / (1000 * 60 * 60);
              
              return {
                ...apt,
                alertLevel: diffHours < 0 ? 'past' : diffHours <= 1 ? 'urgent' : diffHours <= 24 ? 'soon' : 'upcoming',
                hoursUntil: diffHours
              };
            })
            .sort((a: any, b: any) => {
              const dateA = new Date(a.date).getTime();
              const dateB = new Date(b.date).getTime();
              return dateA - dateB; // Plus proche en premier
            })
            .slice(0, 3);
          
          setRecentAppointments(sortedAppointments);
        }
      } catch (err) {
        console.error('❌ Erreur lors du chargement des rendez-vous:', err);
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des statistiques:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper functions pour calculer les valeurs utilisateur
  const getDisplayUser = () => {
    return session?.user || {};
  };

  const getUserName = () => {
    return session?.user?.name || 'Utilisateur';
  };

  const getUserEmail = () => {
    return session?.user?.email || '';
  };

  // Pré-calculer les valeurs qui seront utilisées dans le JSX (après toutes les fonctions, avant les return conditionnels)
  const daysRemainingValue = calculateDaysRemaining();
  const hasTitreInfoValue = userProfile?.numeroTitre && userProfile?.dateExpiration;
  const displayUser = getDisplayUser();
  const userName = getUserName();
  const userEmail = getUserEmail();

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

  // Si pas de session mais on a un token, afficher quand même (utilisateur vient de s'inscrire)
  if (!session && !hasToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Redirection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scroll-text {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}} />
      <main className="w-full max-w-6xl mx-auto px-4 py-8">
        <div id="dashboard-top" className="scroll-mt-20"></div>

        {/* En-tête de bienvenue */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {dashboardTitleClient}, {userName.split(' ')[0]}
              </h1>
              <p className="text-muted-foreground text-lg">
                {dashboardSubtitleClient}
              </p>
            </div>
            
            {/* Badge de renouvellement du titre de séjour */}
            {hasTitreInfoValue && daysRemainingValue !== null && (
              <div className={`rounded-xl shadow-lg p-4 border-2 min-w-[280px] max-w-[320px] ${
                daysRemainingValue < 0 
                  ? 'bg-red-50 border-red-300' 
                  : daysRemainingValue <= 30 
                  ? 'bg-orange-50 border-orange-300' 
                  : daysRemainingValue <= 90 
                  ? 'bg-yellow-50 border-yellow-300' 
                  : 'bg-green-50 border-green-300'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    daysRemainingValue < 0 
                      ? 'bg-red-100' 
                      : daysRemainingValue <= 30 
                      ? 'bg-orange-100' 
                      : daysRemainingValue <= 90 
                      ? 'bg-yellow-100' 
                      : 'bg-green-100'
                  }`}>
                    <span className="text-2xl">
                      {daysRemainingValue < 0 ? '⚠️' : daysRemainingValue <= 30 ? '⏰' : daysRemainingValue <= 90 ? '📅' : '✅'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Renouvellement du titre de séjour</p>
                    {daysRemainingValue < 0 ? (
                      <p className="text-lg font-bold text-red-600">
                        Expiré depuis {Math.abs(daysRemainingValue)} jour{Math.abs(daysRemainingValue) > 1 ? 's' : ''}
                      </p>
                    ) : daysRemainingValue === 0 ? (
                      <p className="text-lg font-bold text-orange-600">
                        Expire aujourd'hui
                      </p>
                    ) : (
                      <p className="text-lg font-bold text-foreground">
                        {daysRemainingValue} jour{daysRemainingValue > 1 ? 's' : ''} restant{daysRemainingValue > 1 ? 's' : ''}
                      </p>
                    )}
                    {userProfile?.dateExpiration && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Échéance: {new Date(userProfile.dateExpiration).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    )}
                  </div>
                </div>
                {daysRemainingValue !== null && daysRemainingValue <= 90 && (
                  <div className="mt-3 pt-3 border-t border-current/20">
                    <Link href="/dossiers/create">
                      <Button 
                        variant="outline" 
                        className={`w-full text-sm ${
                          daysRemainingValue < 0 
                            ? 'border-red-300 text-red-600 hover:bg-red-100' 
                            : daysRemainingValue <= 30 
                            ? 'border-orange-300 text-orange-600 hover:bg-orange-100' 
                            : 'border-yellow-300 text-yellow-600 hover:bg-yellow-100'
                        }`}
                      >
                        {daysRemainingValue < 0 ? '⚠️ Demander le renouvellement' : '📋 Préparer le renouvellement'}
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Barre des discussions mises en signet */}
          {showBookmarksBar && bookmarkedThreads.length > 0 && (
            <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 overflow-hidden">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-sm font-semibold text-orange-800 flex items-center gap-1">
                  <span>⭐</span>
                  <span>Discussions que vous suivez</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowBookmarksBar(false)}
                  className="text-[11px] text-orange-700 hover:text-orange-900 hover:underline"
                >
                  Fermer
                </button>
              </div>
              <div className="whitespace-nowrap text-sm text-orange-800">
                {bookmarkedThreads.map((thread: any) => {
                  const id = thread._id || thread.id;
                  const newReplies = thread.newRepliesCount ?? 0;
                  return (
                    <Link
                      key={id}
                      href={`/forum/${id}`}
                      className="inline-flex items-center gap-1 mr-6 hover:underline"
                    >
                      <span>⭐</span>
                      <span className="font-medium truncate max-w-[240px] inline-block align-middle">
                        {thread.title}
                      </span>
                      {newReplies > 0 && (
                        <span className="text-xs font-semibold text-orange-700">
                          ({newReplies} nouvelle{newReplies > 1 ? 's' : ''} réponse{newReplies > 1 ? 's' : ''})
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Statistiques - Design professionnel et chaleureux avec accès direct */}
        <div id="dossiers-section" className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 scroll-mt-20">
          {/* Badge Dossiers avec lien direct - Fusion des deux badges */}
          <Link href="/client/dossiers" className="group">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-primary hover:shadow-lg hover:border-primary/80 transition-all duration-200 hover:-translate-y-1 cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <span className="text-2xl">📁</span>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-primary transition-colors">{stats.dossiers}</p>
                </div>
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Mes Dossiers</h3>
              <p className="text-xs text-muted-foreground mb-3">Total de vos dossiers</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 text-xs font-semibold group-hover:bg-blue-500/20 transition-colors">
                  {stats.dossiersEnCours} en cours
                </span>
                <span className="text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
              </div>
            </div>
          </Link>

          {/* Badge Documents avec lien direct */}
          <div id="documents-section" className="scroll-mt-20">
          <Link href="/client/documents" className="group">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500 hover:shadow-lg hover:border-green-600 transition-all duration-200 hover:-translate-y-1 cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                  <span className="text-2xl">📄</span>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-green-600 transition-colors">{stats.documents}</p>
                </div>
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Documents</h3>
              <p className="text-xs text-muted-foreground mb-3">Documents disponibles</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-muted-foreground">Tous vos documents</span>
                <span className="text-green-600 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
              </div>
            </div>
          </Link>
          </div>
        </div>

        {/* Actions rapides - Seulement les sections sans doublons */}
        <div id="rendez-vous-section" className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 scroll-mt-20">
          <div className="group">
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 border border-blue-200 hover:border-blue-400 hover:scale-105">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <span className="text-3xl">📅</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground group-hover:text-blue-600 transition-colors mb-1">Rendez-vous</h3>
                  <p className="text-sm text-muted-foreground">Gérez vos rendez-vous</p>
                </div>
              </div>
              {/* Rendez-vous récents avec alertes */}
              {recentAppointments.length > 0 && (
                <div className="mb-4 space-y-2 max-h-32 overflow-y-auto">
                  {recentAppointments.map((apt: any) => {
                    const aptDate = apt.date ? new Date(apt.date) : null;
                    const formattedDate = aptDate ? aptDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';
                    const alertClass = apt.alertLevel === 'urgent' ? 'border-red-300 bg-red-50' :
                                      apt.alertLevel === 'soon' ? 'border-orange-300 bg-orange-50' :
                                      apt.alertLevel === 'past' ? 'border-gray-300 bg-gray-50' :
                                      'border-blue-200 bg-white';
                    const alertText = apt.alertLevel === 'urgent' ? '⚠️ Dans moins d\'1h' :
                                     apt.alertLevel === 'soon' ? '⏰ Dans moins de 24h' :
                                     apt.alertLevel === 'past' ? '✅ Passé' :
                                     '';
                    
                    return (
                      <div
                        key={apt._id || apt.id}
                        onClick={() => {
                          setSelectedAppointment(apt);
                          setShowAppointmentModal(true);
                        }}
                        className={`p-2 rounded-lg border ${alertClass} hover:shadow-md cursor-pointer transition-all`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                            <p className="font-semibold text-xs text-foreground">{formattedDate}</p>
                              {alertText && (
                                <span className={`text-[10px] font-bold ${
                                  apt.alertLevel === 'urgent' ? 'text-red-600' :
                                  apt.alertLevel === 'soon' ? 'text-orange-600' :
                                  'text-gray-600'
                                }`}>
                                  {alertText}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">⏰ {apt.heure?.substring(0, 5) || '-'}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            apt.statut === 'confirme' ? 'bg-blue-100 text-blue-800' :
                            apt.statut === 'termine' ? 'bg-green-100 text-green-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {apt.statut === 'confirme' ? 'Confirmé' : apt.statut === 'termine' ? 'Terminé' : 'En attente'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              <div className="flex gap-2 pt-4 border-t border-blue-200">
                <Button 
                  variant="outline" 
                  className="flex-1 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
                  onClick={() => setIsWidgetOpen(true)}
                >
                  Prendre RDV
                </Button>
                <Link href="/client/rendez-vous" className="flex-1">
                  <Button variant="outline" className="w-full text-xs border-blue-300 text-blue-600 hover:bg-blue-50">
                    Voir mes RDV →
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div id="temoignages-section" className="scroll-mt-20">
          <Link href="/client/temoignages" className="group">
            <div className="bg-gradient-to-br from-white to-purple-50 rounded-2xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 border border-purple-200 hover:border-purple-400 hover:scale-105">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <span className="text-3xl">⭐</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground group-hover:text-purple-600 transition-colors mb-1">Témoignage</h3>
                  <p className="text-sm text-muted-foreground">Partagez votre expérience</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-purple-200">
                <span className="text-xs font-medium text-purple-600">Accéder →</span>
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <span className="text-purple-600 text-sm">→</span>
                </div>
              </div>
            </div>
          </Link>
          </div>

          <Link href="/client/compte" className="group">
            <div className="bg-gradient-to-br from-white to-indigo-50 rounded-2xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 border border-indigo-200 hover:border-indigo-400 hover:scale-105">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <span className="text-3xl">👤</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground group-hover:text-indigo-600 transition-colors mb-1">Mon compte</h3>
                  <p className="text-sm text-muted-foreground">Gérez vos informations</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-indigo-200">
                <span className="text-xs font-medium text-indigo-600">Accéder →</span>
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                  <span className="text-indigo-600 text-sm">→</span>
                </div>
              </div>
            </div>
          </Link>

        </div>

      </main>
      
      {/* Modal de réservation */}
      {isWidgetOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsWidgetOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="relative">
            <ReservationWidget 
              isOpen={isWidgetOpen} 
              onClose={() => setIsWidgetOpen(false)}
            />
          </div>
        </div>
      )}
      
             {/* Badge flottant pour ouvrir le widget - toujours visible quand fermé, ou au scroll */}
             <ReservationBadge 
               onOpen={() => setIsWidgetOpen(true)}
               alwaysVisible={!isWidgetOpen}
             />

             {/* Modal de notification de message */}
        <MessageNotificationModal
          isOpen={showMessageModal}
          onClose={() => {
            setShowMessageModal(false);
            setUnreadMessage(null);
          }}
          message={unreadMessage}
        />

        {/* Modal de gestion des rendez-vous */}
        <AppointmentBadgeModal
          isOpen={showAppointmentModal}
          onClose={() => {
            setShowAppointmentModal(false);
            setSelectedAppointment(null);
          }}
          appointment={selectedAppointment}
          isAdmin={false}
          onUpdate={() => {
            loadStats();
          }}
        />

        {/* Modal de demande de document depuis les notifications automatiques */}
        <DocumentRequestNotificationModal
          isOpen={!!documentRequestNotification && !showDocumentRequestModal}
          onClose={() => {
            setDocumentRequestNotification(null);
            // Recharger les stats après fermeture
            loadStats();
            loadDocumentRequests();
            loadNotifications();
          }}
          notification={documentRequestNotification}
          onDocumentSent={async () => {
            // Recharger les données après l'envoi du document
            await loadDocumentRequests();
            await loadNotifications();
            await checkDocumentRequestNotifications();
            await loadStats();
          }}
        />
        {/* Modal de demande de document depuis les badges de dossiers */}
        <DocumentRequestNotificationModal
          isOpen={showDocumentRequestModal}
          onClose={() => {
            setShowDocumentRequestModal(false);
            setSelectedDocumentRequest(null);
            // Recharger les stats et les demandes après fermeture
            loadStats();
            loadDocumentRequests();
            loadNotifications();
            checkDocumentRequestNotifications();
          }}
          notification={selectedDocumentRequest}
          onDocumentSent={async () => {
            // Recharger les données après l'envoi du document
            await loadDocumentRequests();
            await loadNotifications();
            await checkDocumentRequestNotifications();
            await loadStats();
          }}
        />
           </div>
         );
       }

export default function ClientDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    }>
      <ClientDashboardContent />
    </Suspense>
  );
}

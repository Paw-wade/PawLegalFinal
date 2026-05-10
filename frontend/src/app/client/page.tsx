'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ReservationWidget } from '@/components/ReservationWidget';
import { ReservationBadge } from '@/components/ReservationBadge';
import { MessageNotificationModal } from '@/components/MessageNotificationModal';
import { AppointmentBadgeModal } from '@/components/AppointmentBadgeModal';
import { DocumentRequestNotificationModal } from '@/components/DocumentRequestNotificationModal';
import { dossiersAPI, documentsAPI, appointmentsAPI, userAPI, messagesAPI, notificationsAPI, documentRequestsAPI } from '@/lib/api';
import { UserAvatarDisplay } from '@/components/UserAvatarDisplay';
import { getStatutColor, getStatutLabel, getPrioriteColor } from '@/lib/dossierUtils';
import { useCmsText } from '@/lib/contentClient';
const IS_DEV = process.env.NODE_ENV === 'development';

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
  const [isPersonalInfoOpen, setIsPersonalInfoOpen] = useState(false);
  const [isAdminInfoOpen, setIsAdminInfoOpen] = useState(true);
  const [joursRestantsSidebar, setJoursRestantsSidebar] = useState<number | null>(null);
  const [heuresRestantes, setHeuresRestantes] = useState(0);
  const [minutesRestantes, setMinutesRestantes] = useState(0);
  const [secondesRestantes, setSecondesRestantes] = useState(0);

  // Charger les blocs secondaires sans délai artificiel pour limiter la latence perçue.
  const loadDeferredDashboardData = () => {
    checkUnreadMessages();
    checkDocumentRequestNotifications();
    loadNotifications();
    loadDocumentRequests();
  };

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
          if (IS_DEV) console.log('🔑 Token stocké dans localStorage depuis la session');
        }
      }

      // Définir userRole une seule fois
      const userRole = (session.user as any)?.role;
      const isAdmin = userRole === 'admin' || userRole === 'superadmin';
      const isPartenaire = userRole === 'partenaire';

      // Si admin, rediriger vers l'espace admin
      if (isAdmin) {
        if (IS_DEV) console.log('🚫 Admin tentant d\'accéder à la vue client - redirection vers /admin');
        router.push('/admin');
        return;
      }

      // Si partenaire, rediriger vers l'espace partenaire
      if (isPartenaire) {
        if (IS_DEV) console.log('🚫 Partenaire tentant d\'accéder à la vue client - redirection vers /partenaire');
        router.push('/partenaire');
        return;
      }

      // Charger les statistiques depuis l'API
      loadStats();
      loadUserProfile();
      loadDeferredDashboardData();
    } else if (token) {
      // Si on a un token mais pas de session, charger quand même les stats
      loadStats();
      loadUserProfile();
      loadDeferredDashboardData();
    }
  }, [session, status, router]);

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
      const role = (session?.user as any)?.role;
      const isAdmin = role === 'admin' || role === 'superadmin';
      const response = isAdmin ? await userAPI.getUserById(userId) : await userAPI.getProfile();
      if (response.data.success) {
        setUserProfile(response.data.user || response.data.data);
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
        if (IS_DEV) console.log('ℹ️ Aucune demande de document en attente trouvée');
        return;
      }

      // Prendre la demande la plus récente
      const latestRequest = documentRequestsResponse.data.documentRequests[0];
      
      // Vérifier que la demande existe vraiment et est bien en attente
      if (!latestRequest || latestRequest.status !== 'pending') {
        if (IS_DEV) console.log('ℹ️ La demande de document n\'est plus en attente');
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
          if (IS_DEV) console.log('✅ Demande de document valide trouvée, affichage du modal');
          setDocumentRequestNotification(enrichedNotification);
          setShowDocumentRequestModal(true);
        } else {
          if (IS_DEV) console.log('ℹ️ Aucune notification non lue correspondante trouvée pour la demande');
        }
      } else {
        if (IS_DEV) console.log('ℹ️ Aucune notification de type document_request trouvée');
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

  const formatDateCourte = (d: Date) => {
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getProfileTypeTitre = () => {
    const candidates = [
      userProfile?.typeTitre,
      userProfile?.type_titre,
      userProfile?.titreSejourType,
      userProfile?.typeTitreSejour,
      userProfile?.titreSejour?.typeTitre,
      userProfile?.titreSejour?.type,
      (session?.user as any)?.typeTitre,
    ];
    const firstNonEmpty = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return firstNonEmpty ? String(firstNonEmpty).trim() : '';
  };

  // Minuteur dynamique pour la sidebar (temps restant avant expiration)
  useEffect(() => {
    if (!userProfile?.dateExpiration) {
      setJoursRestantsSidebar(null);
      return;
    }
    const updateTimer = () => {
      const expiration = new Date(userProfile.dateExpiration);
      const maintenant = new Date();
      const difference = expiration.getTime() - maintenant.getTime();
      if (difference <= 0) {
        setJoursRestantsSidebar(0);
        setHeuresRestantes(0);
        setMinutesRestantes(0);
        setSecondesRestantes(0);
        return;
      }
      setJoursRestantsSidebar(Math.floor(difference / (1000 * 60 * 60 * 24)));
      setHeuresRestantes(Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
      setMinutesRestantes(Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)));
      setSecondesRestantes(Math.floor((difference % (1000 * 60)) / 1000));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [userProfile?.dateExpiration]);

  const loadStats = async () => {
    setIsLoading(true);
    try {

      if (IS_DEV) console.log('📊 Chargement des statistiques pour l\'utilisateur:', session?.user?.email);
      
      // Vérifier que le token est disponible
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token && session && (session.user as any)?.accessToken) {
          localStorage.setItem('token', (session.user as any).accessToken);
          if (IS_DEV) console.log('🔑 Token stocké dans localStorage depuis la session');
        }
      }

      const [dossiersResult, documentsResult, appointmentsResult] = await Promise.allSettled([
        dossiersAPI.getMyDossiers(),
        documentsAPI.getMyDocuments(),
        appointmentsAPI.getMyAppointments(),
      ]);

      // Dossiers
      if (dossiersResult.status === 'fulfilled') {
        const dossiersResponse = dossiersResult.value;
        if (dossiersResponse.data.success) {
          const dossiers = dossiersResponse.data.dossiers || [];
          setStats(prev => ({
            ...prev,
            dossiers: dossiers.length,
            dossiersEnCours: dossiers.filter((d: any) => {
              const statut = d.statut;
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
                     statut === 'en_cours' ||
                     statut === 'en_attente' ||
                     statut === 'en_revision';
            }).length
          }));
          setRecentDossiers(dossiers.slice(0, 5));
        }
      } else {
        console.error('❌ Erreur lors du chargement des dossiers:', dossiersResult.reason);
      }

      // Documents
      if (documentsResult.status === 'fulfilled') {
        const documentsResponse = documentsResult.value;
        if (documentsResponse.data.success) {
          setStats(prev => ({
            ...prev,
            documents: documentsResponse.data.documents?.length || 0
          }));
        }
      } else {
        console.error('❌ Erreur lors du chargement des documents:', documentsResult.reason);
      }

      // Rendez-vous
      if (appointmentsResult.status === 'fulfilled') {
        const appointmentsResponse = appointmentsResult.value;
        if (appointmentsResponse.data.success) {
          const appointments = appointmentsResponse.data.data || appointmentsResponse.data.appointments || [];
          setStats(prev => ({
            ...prev,
            rendezVous: appointments.length
          }));

          const sortedAppointments = appointments
            .filter((apt: any) => apt.statut !== 'annule' && apt.statut !== 'annulé')
            .map((apt: any) => {
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
              const prop = (x: any) =>
                Boolean(x.attenteReponseClient) && (x.statut === 'en_attente' || !x.statut);
              const pa = prop(a) ? 1 : 0;
              const pb = prop(b) ? 1 : 0;
              if (pb !== pa) return pb - pa;
              const dateA = new Date(a.date).getTime();
              const dateB = new Date(b.date).getTime();
              return dateA - dateB;
            })
            .slice(0, 3);

          setRecentAppointments(sortedAppointments);
        }
      } else {
        console.error('❌ Erreur lors du chargement des rendez-vous:', appointmentsResult.reason);
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
  const showDashboardSkeleton = isLoading && stats.dossiers === 0 && stats.documents === 0 && stats.rendezVous === 0;
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
    <div className="min-h-screen bg-background max-w-[100vw]">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scroll-text {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}} />
      <main className="w-full max-w-7xl mx-auto px-0 sm:px-2 py-3 sm:py-4 lg:py-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
          <div className="flex-1 min-w-0">
        <div id="dashboard-top" className="scroll-mt-20" />

        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Tableau de bord</p>
          <h1 className="text-2xl font-bold text-foreground mb-1">
            {dashboardTitleClient}{userName ? `, ${userName.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-gray-700">
            {dashboardSubtitleClient}
          </p>
        </div>
        <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
            <div className="flex-1 min-w-0">
            
            {/* Badge de renouvellement du titre de séjour */}
            {hasTitreInfoValue && daysRemainingValue !== null && (
              <div className={`rounded-xl shadow-lg p-4 border-2 w-full max-w-[320px] ${
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
                    <p className="text-xs font-medium text-gray-700 mb-1">Renouvellement du titre de séjour</p>
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
                      <p className="text-xs text-gray-600 mt-1">
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

        </div>

        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Vue d'ensemble</p>
        <div id="dossiers-section" className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-4 scroll-mt-20">
          <Link href="/client/dossiers" className="group block min-w-0">
            <div
              className={`rounded-xl p-[1px] bg-gradient-to-r from-orange-200/70 via-orange-200/70 to-orange-200/70 shadow-sm group-hover:shadow-md group-hover:from-orange-400/70 group-hover:via-orange-400/70 group-hover:to-orange-400/70 transition-all duration-300 cursor-pointer ${showDashboardSkeleton ? 'animate-pulse' : ''}`}
            >
              <div className="bg-white rounded-xl border border-white/70 p-4 sm:p-5 group-hover:shadow-md group-hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <span className="text-2xl">📁</span>
                  </div>
                  <div className="text-right">
                    {showDashboardSkeleton ? (
                      <div className="h-8 w-14 bg-gray-200 rounded ml-auto" />
                    ) : (
                      <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-primary transition-colors">{stats.dossiers}</p>
                    )}
                  </div>
                </div>
                <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-1">Mes Dossiers</h3>
                <p className="text-xs text-gray-600 mb-3">Total de vos dossiers</p>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  {showDashboardSkeleton ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-200 text-transparent text-xs font-semibold">
                      00 en cours
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 text-xs font-semibold group-hover:bg-blue-500/20 transition-colors">
                      {stats.dossiersEnCours} en cours
                    </span>
                  )}
                  <span className="text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Badge Documents avec lien direct */}
          <div id="documents-section" className="scroll-mt-20 min-w-0">
          <Link href="/client/documents" className="group block min-w-0">
            <div
              className={`rounded-xl p-[1px] bg-gradient-to-r from-green-200/70 via-emerald-200/70 to-green-200/70 shadow-sm group-hover:shadow-md group-hover:from-green-400/70 group-hover:via-emerald-400/70 group-hover:to-green-400/70 transition-all duration-300 cursor-pointer ${showDashboardSkeleton ? 'animate-pulse' : ''}`}
            >
              <div className="bg-white rounded-xl border border-white/70 p-4 sm:p-5 group-hover:shadow-md group-hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                    <span className="text-2xl">📄</span>
                  </div>
                  <div className="text-right">
                    {showDashboardSkeleton ? (
                      <div className="h-8 w-14 bg-gray-200 rounded ml-auto" />
                    ) : (
                      <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-green-600 transition-colors">{stats.documents}</p>
                    )}
                  </div>
                </div>
                <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-1">Documents</h3>
                <p className="text-xs text-gray-600 mb-3">Documents disponibles</p>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-600">Tous vos documents</span>
                  <span className="text-green-600 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
                </div>
              </div>
            </div>
          </Link>
          </div>
        </div>

        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Rendez-vous et accès</p>
        <div id="rendez-vous-section" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 scroll-mt-20">
          <div
            className="group min-w-0 min-h-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            role="link"
            tabIndex={0}
            aria-label="Rendez-vous : ouvrir la page Mes rendez-vous"
            onClick={() => router.push('/client/rendez-vous')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push('/client/rendez-vous');
              }
            }}
          >
            <div
              className={`rounded-xl p-[1px] bg-gradient-to-r from-blue-200/70 via-indigo-200/70 to-blue-200/70 shadow-sm group-hover:shadow-md group-hover:from-blue-400/70 group-hover:via-indigo-400/70 group-hover:to-blue-400/70 transition-all duration-300 ${showDashboardSkeleton ? 'animate-pulse' : ''}`}
            >
              <div className="bg-white rounded-xl border border-white/70 p-4 sm:p-5 group-hover:shadow-md group-hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📅</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-0.5">Rendez-vous</h3>
                  <p className="text-xs text-gray-600">Gérez vos rendez-vous</p>
                </div>
              </div>
              {/* Rendez-vous récents avec alertes */}
              {showDashboardSkeleton ? (
                <div className="mb-4 space-y-2">
                  <div className="h-12 bg-gray-200 rounded-lg" />
                  <div className="h-12 bg-gray-200 rounded-lg" />
                </div>
              ) : recentAppointments.length > 0 && (
                <div className="mb-4 space-y-2 max-h-32 overflow-y-auto">
                  {recentAppointments.map((apt: any) => {
                    const needsPropositionResponse =
                      Boolean(apt.attenteReponseClient) && (apt.statut === 'en_attente' || !apt.statut);
                    const aptDate = apt.date ? new Date(apt.date) : null;
                    const formattedDate = aptDate ? aptDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';
                    const alertClass = needsPropositionResponse
                      ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200/80'
                      : apt.alertLevel === 'urgent'
                        ? 'border-red-300 bg-red-50'
                        : apt.alertLevel === 'soon'
                          ? 'border-orange-300 bg-orange-50'
                          : apt.alertLevel === 'past'
                            ? 'border-gray-300 bg-gray-50'
                            : 'border-blue-200 bg-white';
                    const alertText = needsPropositionResponse
                      ? '👆 À confirmer'
                      : apt.alertLevel === 'urgent'
                        ? '⚠️ Dans moins d\'1h'
                        : apt.alertLevel === 'soon'
                          ? '⏰ Dans moins de 24h'
                          : apt.alertLevel === 'past'
                            ? '✅ Passé'
                            : '';
                    
                    return (
                      <div
                        key={apt._id || apt.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedAppointment(apt);
                          setShowAppointmentModal(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedAppointment(apt);
                            setShowAppointmentModal(true);
                          }
                        }}
                        className={`p-2 rounded-lg border ${alertClass} hover:shadow-md cursor-pointer transition-all`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                            <p className="font-semibold text-xs text-foreground">{formattedDate}</p>
                              {alertText && (
                                <span className={`text-[10px] font-bold ${
                                  needsPropositionResponse
                                    ? 'text-amber-800'
                                    : apt.alertLevel === 'urgent'
                                      ? 'text-red-600'
                                      : apt.alertLevel === 'soon'
                                        ? 'text-orange-600'
                                        : 'text-gray-600'
                                }`}>
                                  {alertText}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600">⏰ {apt.heure?.substring(0, 5) || '-'}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            needsPropositionResponse
                              ? 'bg-amber-100 text-amber-900'
                              : apt.statut === 'confirme'
                                ? 'bg-blue-100 text-blue-800'
                                : apt.statut === 'termine'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {needsPropositionResponse
                              ? 'À confirmer'
                              : apt.statut === 'confirme'
                                ? 'Confirmé'
                                : apt.statut === 'termine'
                                  ? 'Terminé'
                                  : 'En attente'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              <div className="flex gap-2 pt-4 border-t border-gray-100">
                <Button 
                  variant="outline" 
                  type="button"
                  className="flex-1 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsWidgetOpen(true);
                  }}
                >
                  Prendre RDV
                </Button>
                <div className="flex-1 flex items-center justify-center rounded-md border border-blue-300/60 bg-blue-50/50 text-xs font-medium text-blue-600">
                  Voir mes RDV →
                </div>
              </div>
              </div>
            </div>
          </div>

          <div id="temoignages-section" className="scroll-mt-20 min-w-0">
          <Link href="/client/temoignages" className="group block min-w-0">
            <div className="rounded-xl p-[1px] bg-gradient-to-r from-yellow-200/70 via-amber-200/70 to-yellow-200/70 shadow-sm transition-all duration-300 group-hover:from-yellow-400/70 group-hover:via-amber-400/70 group-hover:to-yellow-400/70 group-hover:shadow-md">
              <div className="bg-white rounded-xl border border-white/70 p-4 sm:p-5 group-hover:shadow-md group-hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">⭐</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-0.5">Témoignage</h3>
                    <p className="text-xs text-gray-600">Partagez votre expérience</p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 pt-2 border-t border-gray-100">Accéder →</p>
              </div>
            </div>
          </Link>
          </div>

          <Link href="/client/compte" className="group block min-w-0">
            <div className="rounded-xl p-[1px] bg-gradient-to-r from-gray-200/70 via-slate-200/70 to-gray-200/70 shadow-sm transition-all duration-300 group-hover:from-gray-300/70 group-hover:via-slate-300/70 group-hover:to-gray-300/70 group-hover:shadow-md">
              <div className="bg-white rounded-xl border border-white/70 p-4 sm:p-5 group-hover:shadow-md group-hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">👤</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-0.5">Mon compte</h3>
                    <p className="text-xs text-gray-600">Gérez vos informations</p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 pt-2 border-t border-gray-100">Accéder →</p>
              </div>
            </div>
          </Link>

        </div>

          </div>

          {/* Barre Mon Profil à droite (ou en bas sur mobile) */}
          <div className="w-full min-w-0 lg:w-72 lg:flex-shrink-0 lg:self-start">
            <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:border-gray-300 hover:shadow-sm transition-all lg:sticky lg:top-24 lg:w-72">
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center overflow-hidden shrink-0">
                    <UserAvatarDisplay
                      user={
                        userProfile && typeof userProfile === 'object'
                          ? {
                              profilePhoto: userProfile.profilePhoto,
                              firstName: userProfile.firstName,
                              lastName: userProfile.lastName,
                            }
                          : null
                      }
                      alt=""
                      fallback={
                        <span className="text-white font-bold text-lg">
                          {userProfile?.firstName?.[0]?.toUpperCase() || session?.user?.name?.[0]?.toUpperCase() || 'U'}
                          {userProfile?.lastName?.[0]?.toUpperCase() || ''}
                        </span>
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-foreground">Mon Profil</h2>
                    <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary/20 text-primary mt-1">Client</span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mb-4">
                  <p className="text-sm font-bold text-foreground mb-1">
                    {userProfile?.firstName && userProfile?.lastName
                      ? `${userProfile.firstName} ${userProfile.lastName}`
                      : session?.user?.name || 'Utilisateur'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {userProfile?.email || session?.user?.email || ''}
                  </p>
                </div>
              </div>

              {!userProfile ? (
                <div className="text-center py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                  <p className="text-muted-foreground text-sm">Chargement du profil...</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => setIsPersonalInfoOpen(!isPersonalInfoOpen)}
                      className="flex items-center justify-between w-full gap-2 mb-3 hover:opacity-80 transition-opacity cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-5 bg-blue-500 rounded-full"></div>
                        <h3 className="text-sm font-bold text-foreground group-hover:text-blue-600 transition-colors">Informations personnelles</h3>
                      </div>
                      <span className={`text-blue-600 transition-transform duration-300 text-xs ${isPersonalInfoOpen ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                    </button>
                    {isPersonalInfoOpen && (
                      <div className="space-y-2.5">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Nom complet</p>
                          <p className="text-xs font-medium text-foreground break-words">
                            {userProfile.firstName && userProfile.lastName ? `${userProfile.firstName} ${userProfile.lastName}` : <span className="text-muted-foreground italic">Non renseigné</span>}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Email</p>
                          <p className="text-xs font-medium text-foreground break-all">{userProfile.email || <span className="text-muted-foreground italic">Non renseigné</span>}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Téléphone</p>
                          <p className="text-xs font-medium text-foreground">{userProfile.phone || <span className="text-muted-foreground italic">Non renseigné</span>}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Adresse</p>
                          <p className="text-xs font-medium text-foreground break-words">
                            {(userProfile.adressePostale || userProfile.ville || userProfile.codePostal) ? (
                              <>{userProfile.adressePostale || ''}{userProfile.adressePostale && (userProfile.ville || userProfile.codePostal) ? ', ' : ''}{userProfile.codePostal || ''}{userProfile.codePostal && userProfile.ville ? ' ' : ''}{userProfile.ville || ''}{userProfile.pays && (userProfile.ville || userProfile.codePostal || userProfile.adressePostale) ? `, ${userProfile.pays}` : ''}</>
                            ) : (
                              <span className="text-muted-foreground italic">Non renseigné</span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setIsAdminInfoOpen(!isAdminInfoOpen)}
                      className="flex items-center justify-between w-full gap-2 mb-3 hover:opacity-80 transition-opacity cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-5 bg-green-500 rounded-full"></div>
                        <h3 className="text-sm font-bold text-foreground group-hover:text-green-600 transition-colors">Informations administratives</h3>
                      </div>
                      <span className={`text-green-600 transition-transform duration-300 text-xs ${isAdminInfoOpen ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                    </button>
                    {isAdminInfoOpen && (
                      <div className="space-y-2.5">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Type de titre</p>
                          <p className="text-xs font-medium text-foreground break-words">{getProfileTypeTitre() || <span className="text-muted-foreground italic">Non renseigné</span>}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Délivrance</p>
                            <p className="text-xs font-medium text-foreground">{userProfile.dateDelivrance ? formatDateCourte(new Date(userProfile.dateDelivrance)) : <span className="text-muted-foreground italic">-</span>}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Expiration</p>
                            <p className="text-xs font-medium text-foreground">{userProfile.dateExpiration ? formatDateCourte(new Date(userProfile.dateExpiration)) : <span className="text-muted-foreground italic">-</span>}</p>
                          </div>
                        </div>
                        {userProfile.dateExpiration && joursRestantsSidebar !== null && (
                          <div className={`rounded-lg p-4 border ${joursRestantsSidebar <= 0 ? 'bg-red-50 border-red-200' : joursRestantsSidebar < 30 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                            <p className={`text-xs font-bold mb-2 uppercase tracking-wide ${joursRestantsSidebar <= 0 ? 'text-red-900' : joursRestantsSidebar < 30 ? 'text-orange-900' : 'text-green-900'}`}>
                              {joursRestantsSidebar <= 0 ? 'Titre expiré' : 'Temps restant'}
                            </p>
                            {joursRestantsSidebar <= 0 ? (
                              <p className="text-[11px] font-semibold text-red-800">Votre titre a expiré. Pensez au renouvellement.</p>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="bg-white/80 rounded-lg px-2 py-1.5 border-2 border-green-400 text-green-900">
                                  <p className="text-[9px] font-semibold uppercase opacity-70">Jours</p>
                                  <p className="text-base font-bold">{joursRestantsSidebar}</p>
                                </div>
                                <div className="bg-white/80 rounded-lg px-2 py-1.5 border-2 border-green-400 text-green-900">
                                  <p className="text-[9px] font-semibold uppercase opacity-70">H</p>
                                  <p className="text-base font-bold">{String(heuresRestantes).padStart(2, '0')}</p>
                                </div>
                                <div className="bg-white/80 rounded-lg px-2 py-1.5 border-2 border-green-400 text-green-900">
                                  <p className="text-[9px] font-semibold uppercase opacity-70">Min</p>
                                  <p className="text-base font-bold">{String(minutesRestantes).padStart(2, '0')}</p>
                                </div>
                                <div className="bg-white/80 rounded-lg px-2 py-1.5 border-2 border-green-400 text-green-900">
                                  <p className="text-[9px] font-semibold uppercase opacity-70">Sec</p>
                                  <p className="text-base font-bold">{String(secondesRestantes).padStart(2, '0')}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Numéro de titre</p>
                          <p className="text-xs font-medium text-foreground break-all">{userProfile.numeroTitre || <span className="text-muted-foreground italic">Non renseigné</span>}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <Link href="/client/compte">
                      <Button variant="outline" className="w-full text-xs h-9 font-semibold border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all">
                        ✏️ Modifier mon profil
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
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

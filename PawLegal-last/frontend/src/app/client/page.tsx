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
import { dossiersAPI, documentsAPI, appointmentsAPI, userAPI, messagesAPI, notificationsAPI, documentRequestsAPI } from '@/lib/api';
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
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<any>(null);
  const [hasToken, setHasToken] = useState(false);
  const [recentAppointments, setRecentAppointments] = useState<any[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [documentRequests, setDocumentRequests] = useState<Record<string, any[]>>({});
  const [selectedDocumentRequest, setSelectedDocumentRequest] = useState<any>(null);
  const [showDocumentRequestModal, setShowDocumentRequestModal] = useState(false);
  const [documentRequestNotification, setDocumentRequestNotification] = useState<any>(null);

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
    // Vérifier le mode impersonation
    const impersonateParam = searchParams?.get('impersonate');
    const impersonateUserId = localStorage.getItem('impersonateUserId');
    
    if (impersonateParam === 'true' && impersonateUserId) {
      setIsImpersonating(true);
      loadImpersonatedUser(impersonateUserId);
      return;
    }

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

      // Si le profil n'est pas complet, rediriger vers la complétion
      // Mais seulement si on n'a pas de token (pour éviter les boucles)
      if (!(session.user as any).profilComplete && !token) {
        router.push('/auth/complete-profile');
        return;
      }
      
      // Si admin et pas en mode impersonation, rediriger vers l'espace admin
      // Les admins n'ont PAS accès à la vue client (seule l'impersonation permet l'accès)
      if (((session.user as any)?.role === 'admin' || (session.user as any)?.role === 'superadmin') && !isImpersonating) {
        // Ne pas rediriger si on est en mode impersonation
        if (!impersonateUserId) {
          console.log('🚫 Admin tentant d\'accéder à la vue client sans impersonation - redirection vers /admin');
          router.push('/admin');
          return;
        }
      }

      // Charger les statistiques depuis l'API
      loadStats();
      loadUserProfile();
      checkUnreadMessages();
      checkDocumentRequestNotifications();
      loadNotifications();
      loadDocumentRequests();
    } else if (token) {
      // Si on a un token mais pas de session, charger quand même les stats
      loadStats();
      loadUserProfile();
      checkUnreadMessages();
      checkDocumentRequestNotifications();
      loadNotifications();
      loadDocumentRequests();
    }
  }, [session, status, router, searchParams, isImpersonating]);

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

  const loadImpersonatedUser = async (userId: string) => {
    try {
      const response = await userAPI.getUserById(userId);
      if (response.data.success) {
        setImpersonatedUser(response.data.user);
        // Charger les stats pour cet utilisateur
        loadStatsForUser(userId);
        loadUserProfileForUser(userId);
      }
    } catch (error) {
      console.error('Erreur lors du chargement de l\'utilisateur impersonné:', error);
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

  const stopImpersonating = () => {
    localStorage.removeItem('impersonateUserId');
    localStorage.removeItem('impersonateAdminId');
    setIsImpersonating(false);
    setImpersonatedUser(null);
    router.push('/admin');
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

  // Rafraîchissement automatique toutes les 30 secondes pour les mises à jour en temps réel
  useEffect(() => {
    const interval = setInterval(() => {
      if (session || localStorage.getItem('token')) {
        // Vérifier si on est en mode impersonation
        const impersonateUserId = typeof window !== 'undefined' ? localStorage.getItem('impersonateUserId') : null;
        if (isImpersonating && impersonateUserId) {
          loadStatsForUser(impersonateUserId);
        } else {
          loadStats();
          loadNotifications();
          loadDocumentRequests();
        }
      }
    }, 30000); // Rafraîchir toutes les 30 secondes

    return () => clearInterval(interval);
  }, [session, isImpersonating]);

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
      // Vérifier si on est en mode impersonation
      const impersonateUserId = typeof window !== 'undefined' ? localStorage.getItem('impersonateUserId') : null;
      
      if (isImpersonating && impersonateUserId) {
        // En mode impersonation, utiliser loadStatsForUser
        console.log('📊 Mode impersonation: chargement des stats pour l\'utilisateur:', impersonateUserId);
        await loadStatsForUser(impersonateUserId);
        return;
      }

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
    if (isImpersonating && impersonatedUser) return impersonatedUser;
    return session?.user || {};
  };

  const getUserName = () => {
    if (isImpersonating && impersonatedUser) {
      const name = `${impersonatedUser?.firstName || ''} ${impersonatedUser?.lastName || ''}`.trim();
      return name || 'Utilisateur';
    }
    return session?.user?.name || 'Utilisateur';
  };

  const getUserEmail = () => {
    if (isImpersonating && impersonatedUser) {
      return impersonatedUser?.email || '';
    }
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
        .animate-scroll-text {
          animation: scroll-text 15s linear infinite;
          display: inline-block;
          padding-left: 100%;
        }
        .animate-scroll-text:hover {
          animation-play-state: paused;
        }
      `}} />
      <main className="w-full px-4 py-8">
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
              {/* Rendez-vous récents */}
              {recentAppointments.length > 0 && (
                <div className="mb-4 space-y-2 max-h-32 overflow-y-auto">
                  {recentAppointments.map((apt: any) => {
                    const aptDate = apt.date ? new Date(apt.date) : null;
                    const formattedDate = aptDate ? aptDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';
                    return (
                      <div
                        key={apt._id || apt.id}
                        onClick={() => {
                          setSelectedAppointment(apt);
                          setShowAppointmentModal(true);
                        }}
                        className="p-2 rounded-lg bg-white border border-blue-200 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-xs text-foreground">{formattedDate}</p>
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

        {/* Bloc messagerie sur le dashboard client */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2" />
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <span>✉️ Messagerie</span>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Retrouvez vos échanges avec l&apos;équipe juridique.
                  </p>
                </div>
                <Link href="/client/messages">
                  <Button variant="outline" className="text-xs">
                    Ouvrir la messagerie
                  </Button>
                </Link>
              </div>
              {messagesPreview.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun message non lu pour le moment.
                </p>
              ) : (
                <div className="space-y-3">
                  {messagesPreview.map((msg) => (
                    <Link
                      key={msg._id || msg.id}
                      href={`/client/messages/${msg._id || msg.id}`}
                      className="block rounded-lg border border-gray-100 px-3 py-2 hover:bg-primary/5 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{msg.sujet}</p>
                          <p className="text-[11px] text-muted-foreground line-clamp-2">
                            {msg.contenu}
                          </p>
                        </div>
                        <span className="ml-2 flex-shrink-0 rounded-full bg-primary text-white text-[10px] px-2 py-0.5">
                          Voir
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mes Dossiers - Format complet */}
        <div className="bg-gradient-to-br from-white to-primary/5 rounded-2xl shadow-lg p-8 border border-primary/20">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/70 rounded-lg flex items-center justify-center">
                <span className="text-xl">📁</span>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Mes Dossiers</h2>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadStats} disabled={isLoading} size="sm">
                Actualiser
              </Button>
              <Link href="/client/dossiers">
                <Button variant="outline" size="sm">
                  Voir tout →
                </Button>
              </Link>
            </div>
          </div>
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Chargement des dossiers...</p>
              </div>
            ) : recentDossiers.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">📋</span>
                </div>
                <p className="text-muted-foreground mb-4 font-medium">Aucun dossier</p>
                <Link href="/dossiers/create">
                  <Button className="bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 shadow-md">
                    Créer mon premier dossier
                  </Button>
                </Link>
              </div>
            ) : (
              recentDossiers.map((dossier) => (
                <div
                  key={dossier._id || dossier.id}
                  className={`border rounded-xl p-5 hover:shadow-xl transition-all duration-200 bg-white w-full ${
                    dossier.statut === 'recu' || dossier.statut === 'en_attente_onboarding'
                      ? 'border-l-4 border-l-yellow-500 border-t border-r border-b border-gray-200'
                      : dossier.statut === 'decision_favorable' || dossier.statut === 'gain_cause'
                      ? 'border-l-4 border-l-green-500 border-t border-r border-b border-gray-200'
                      : dossier.statut === 'decision_defavorable' || dossier.statut === 'refuse' || dossier.statut === 'rejet'
                      ? 'border-l-4 border-l-red-500 border-t border-r border-b border-gray-200'
                      : 'border-l-4 border-l-blue-500 border-t border-r border-b border-gray-200'
                  }`}
                >
                  {/* En-tête de la carte */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-2">
                      <h3 className="font-bold text-base text-foreground line-clamp-2 leading-tight">
                        {dossier.titre || 'Sans titre'}
                      </h3>
                      {dossier.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {dossier.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getStatutColor(dossier.statut)}`}>
                        {getStatutLabel(dossier.statut)}
                      </span>
                      {dossier.priorite && (
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getPrioriteColor(dossier.priorite)}`}>
                          {dossier.priorite}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Informations du dossier */}
                  <div className="space-y-2 mb-3">
                    {(dossier.numero || dossier.numeroDossier) && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-primary font-semibold">🔢</span>
                        <span className="text-primary font-semibold">
                          N° {dossier.numero || dossier.numeroDossier}
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground mt-0.5">📋</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-xs">{getCategorieLabel(dossier.categorie || 'autre')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>📅</span>
                      <span>
                        {dossier.createdAt ? new Date(dossier.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        }) : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {(() => {
                          // Vérifier d'abord s'il y a des demandes de documents en attente
                          const dossierRequests = documentRequests[dossier._id || dossier.id] || [];
                          const pendingRequests = dossierRequests.filter((r: any) => r.status === 'pending');
                          
                          if (pendingRequests.length > 0) {
                            const urgentRequests = pendingRequests.filter((r: any) => r.isUrgent);
                            const hasUrgent = urgentRequests.length > 0;
                            
                            return (
                              <div 
                                className={`relative overflow-hidden rounded-md px-3 py-2 border cursor-pointer transition-all hover:shadow-md ${
                                  hasUrgent 
                                    ? 'bg-red-50/50 border-red-200/50 hover:bg-red-100/50' 
                                    : 'bg-orange-50/50 border-orange-200/50 hover:bg-orange-100/50'
                                }`}
                                onClick={() => {
                                  // Ouvrir le modal avec la première demande en attente (ou urgente si disponible)
                                  const requestToShow = urgentRequests[0] || pendingRequests[0];
                                  if (requestToShow) {
                                    // Créer une notification factice pour le modal
                                    const notification = {
                                      _id: requestToShow._id,
                                      id: requestToShow.id,
                                      type: 'document_request',
                                      titre: requestToShow.isUrgent
                                        ? `🔴 Demande urgente de document - Dossier ${dossier.numero || dossier._id}`
                                        : `📄 Demande de document - Dossier ${dossier.numero || dossier._id}`,
                                      message: `Un document de type "${requestToShow.documentTypeLabel}" est requis pour votre dossier.`,
                                      data: {
                                        documentRequestId: requestToShow._id || requestToShow.id,
                                        dossierId: dossier._id || dossier.id,
                                        dossierNumero: dossier.numero,
                                        documentType: requestToShow.documentType,
                                        documentTypeLabel: requestToShow.documentTypeLabel,
                                        isUrgent: requestToShow.isUrgent || false
                                      }
                                    };
                                    setSelectedDocumentRequest(notification);
                                    setShowDocumentRequestModal(true);
                                  }
                                }}
                                title={`${pendingRequests.length} demande(s) de document(s) en attente${hasUrgent ? ' (urgente)' : ''}. Cliquez pour envoyer le document.`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs">{hasUrgent ? '🔴' : '📄'}</span>
                                  <div className="flex-1 min-w-0 overflow-hidden">
                                    <div className="animate-scroll-text whitespace-nowrap">
                                      <span className={`text-xs font-medium ${
                                        hasUrgent ? 'text-red-900' : 'text-orange-900'
                                      }`}>
                                        {hasUrgent 
                                          ? `🔴 ${urgentRequests.length} demande(s) urgente(s) de document`
                                          : `${pendingRequests.length} demande(s) de document en attente`
                                        }
                                        {pendingRequests.length > 1 && !hasUrgent && ` (${pendingRequests.length} demandes)`}
                                      </span>
                                    </div>
                                  </div>
                                  {pendingRequests.length > 1 && (
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                      hasUrgent ? 'bg-red-200 text-red-800' : 'bg-orange-200 text-orange-800'
                                    }`}>
                                      {pendingRequests.length}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          
                          // Sinon, afficher la dernière notification défilante
                          const lastNotification = getLastNotificationForDossier(dossier._id || dossier.id);
                          if (lastNotification) {
                            return (
                              <div className="relative overflow-hidden bg-blue-50/50 rounded-md px-3 py-2 border border-blue-200/50">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs">🔔</span>
                                  <div className="flex-1 min-w-0 overflow-hidden">
                                    <div className="animate-scroll-text whitespace-nowrap">
                                      <span className="text-xs text-blue-900 font-medium">
                                        {lastNotification.title || lastNotification.message || 'Nouvelle notification'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          
                          return (
                            <div className="flex gap-3 text-xs text-muted-foreground">
                              {dossier.documents && dossier.documents.length > 0 && (
                                <span>📄 {dossier.documents.length}</span>
                              )}
                              {dossier.messages && dossier.messages.length > 0 && (
                                <span>💬 {dossier.messages.length}</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(() => {
                          const unreadCount = getUnreadNotificationsCountForDossier(dossier._id || dossier.id);
                          return (
                            <Link href={`/client/notifications?dossierId=${dossier._id || dossier.id}&filter=unread`}>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className={`text-xs h-8 relative ${unreadCount > 0 ? 'bg-orange-50 border-orange-300 hover:bg-orange-100' : ''}`}
                                title="Voir les notifications non lues"
                              >
                                🔔 Notifications
                                {unreadCount > 0 && (
                                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                  </span>
                                )}
                              </Button>
                            </Link>
                          );
                        })()}
                        <Link href={`/client/messages?dossierId=${dossier._id || dossier.id}&action=view`}>
                          <Button variant="outline" size="sm" className="text-xs h-8" title="Voir les discussions">
                            💬 Discussions
                          </Button>
                        </Link>
                        <Link href={`/client/messages?dossierId=${dossier._id || dossier.id}&action=send`}>
                          <Button size="sm" className="text-xs h-8" title="Envoyer un message">
                            ✉️ Message
                          </Button>
                        </Link>
                        <Link href={`/client/dossiers/${dossier._id || dossier.id}`}>
                          <Button variant="outline" size="sm" className="text-xs h-8">
                            Détails
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
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

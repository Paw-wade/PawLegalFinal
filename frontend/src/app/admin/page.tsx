'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageNotificationModal } from '@/components/MessageNotificationModal';
import { AppointmentBadgeModal } from '@/components/AppointmentBadgeModal';
import { userAPI, appointmentsAPI, documentsAPI, tasksAPI, messagesAPI, dossiersAPI } from '@/lib/api';
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

export default function AdminDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Vérifier le délai de 7 jours pour la complétion du profil (sauf pour admin/superadmin)
  useEffect(() => {
    if (status === 'authenticated' && session) {
      const userRole = (session.user as any)?.role;
      
      // Vérifier le délai de 7 jours pour la complétion du profil (sauf pour admin/superadmin)
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        const profilComplete = (session.user as any)?.profilComplete;
        if (!profilComplete) {
          // Charger les informations utilisateur pour vérifier le délai
          userAPI.getProfile().then(res => {
            if (res.data.success && res.data.user) {
              if (res.data.user.createdAt) {
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
      }
    }
  }, [session, status, router]);
  const [stats, setStats] = useState({
    utilisateurs: 0,
    dossiers: 0,
    rendezVous: 0,
    documents: 0,
    dossiersEnCours: 0,
    nouveauxClients: 0,
    revenus: 0,
    tasks: 0,
    tasksEnCours: 0,
    dossiersTransmis: 0,
    tauxTransmission: 0,
  });
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month'>('month');
  const [tasks, setTasks] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [tomorrowAppointments, setTomorrowAppointments] = useState<any[]>([]);
  const [weekTasks, setWeekTasks] = useState<any[]>([]);
  // Fonction pour obtenir la date du jour au format YYYY-MM-DD
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const [taskFormData, setTaskFormData] = useState({
    titre: '',
    description: '',
    assignedTo: '',
    priorite: 'normale',
    dateEcheance: getTodayDate(),
    dossier: '',
  });
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  // État pour gérer l'index du document affiché pour chaque utilisateur
  const [documentIndices, setDocumentIndices] = useState<{ [userId: string]: number }>({});
  const [unreadMessage, setUnreadMessage] = useState<any>(null);
  const [messagesPreview, setMessagesPreview] = useState<any[]>([]);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [hasCheckedMessages, setHasCheckedMessages] = useState(false);
  const [showTasksNotificationModal, setShowTasksNotificationModal] = useState(false);
  const [hasShownTasksNotification, setHasShownTasksNotification] = useState(false);
  const [selectedTaskForStatus, setSelectedTaskForStatus] = useState<any>(null);
  const [showTaskStatusModal, setShowTaskStatusModal] = useState(false);
  const [taskStatusComment, setTaskStatusComment] = useState('');
  const [isUpdatingTaskStatus, setIsUpdatingTaskStatus] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'a_faire' | 'en_cours' | 'termine' | 'en_attente'>('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<'all' | 'urgente' | 'haute' | 'normale' | 'basse'>('all');
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<string>('all');
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<any>(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [isUpdatingTaskAssignment, setIsUpdatingTaskAssignment] = useState(false);
  const [newAssigneeId, setNewAssigneeId] = useState<string>('');
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const hasChecked = useRef(false);
  const [newTaskNote, setNewTaskNote] = useState('');
  const [isAddingTaskNote, setIsAddingTaskNote] = useState(false);
  const [taskNotesError, setTaskNotesError] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [expandedDossiers, setExpandedDossiers] = useState<Set<string>>(new Set());
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [isMessagesExpanded, setIsMessagesExpanded] = useState(false);

  // Textes CMS pour le header du dashboard admin
  const dashboardTitle = useCmsText(
    'admin.dashboard.title',
    'Tableau de bord Administrateur'
  );
  const dashboardSubtitle = useCmsText(
    'admin.dashboard.subtitle',
    "Vue d'ensemble de votre cabinet juridique"
  );

  useEffect(() => {
    // Empêcher les vérifications multiples
    if (hasChecked.current) {
      return;
    }

    if (status === 'loading') {
      return; // Attendre que la session soit chargée
    }

    if (status === 'unauthenticated') {
      hasChecked.current = true;
      window.location.href = '/auth/signin';
      return;
    }

    if (!session) {
      return; // Attendre que la session soit disponible
    }

    const userRole = (session.user as any)?.role;
    // Autoriser admin et superadmin
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      hasChecked.current = true;
      window.location.href = '/client';
      return;
    }

    // Si on est admin/superadmin, charger les statistiques
    hasChecked.current = true;
    loadStats();
    loadTasks();
    // Charger les membres de l'équipe seulement pour les admins
    if (userRole === 'admin' || userRole === 'superadmin') {
      loadTeamMembers();
    }
    checkUnreadMessages();
    loadNotifications();
  }, [session, status]);

  // Vérifier les messages non lus à la connexion (internes + contact)
  const checkUnreadMessages = async () => {
    if (hasCheckedMessages) return;
    
    try {
      // Charger les messages internes non lus
      const messagesResponse = await messagesAPI.getMessages({ type: 'unread' });
      const messages = messagesResponse.data.success && messagesResponse.data.messages 
        ? messagesResponse.data.messages.map((m: any) => ({ ...m, isContactMessage: false }))
        : [];
      
      // Charger les messages de contact non lus
      try {
        const { contactAPI } = await import('@/lib/api');
        const contactResponse = await contactAPI.getAllMessages({ lu: false });
        if (contactResponse.data.success && contactResponse.data.messages) {
          const contactMessages = contactResponse.data.messages.map((m: any) => ({ 
            ...m, 
            isContactMessage: true,
            sujet: m.subject,
            contenu: m.message,
            expediteur: { firstName: m.name?.split(' ')[0] || '', lastName: m.name?.split(' ').slice(1).join(' ') || '', email: m.email }
          }));
          messages.push(...contactMessages);
        }
      } catch (contactError) {
        console.error('Erreur lors du chargement des messages de contact:', contactError);
      }
      
      // Trier par date de création (plus récent en premier)
      messages.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      
      if (messages.length > 0) {
        // Prendre le message le plus récent
        const latestMessage = messages[0];
        setUnreadMessage(latestMessage);
        setShowMessageModal(true);
        // Garder un aperçu des 3 derniers messages pour le dashboard
        setMessagesPreview(messages.slice(0, 3));
        setHasCheckedMessages(true);
      } else {
        setMessagesPreview([]);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des messages:', error);
    }
  };


  const loadStats = async () => {
    try {
      const userRole = (session?.user as any)?.role;
      const isAdmin = userRole === 'admin' || userRole === 'superadmin';
      
      // Charger les utilisateurs (seulement pour les admins)
      if (isAdmin) {
        try {
          const usersResponse = await userAPI.getAllUsers();
          if (usersResponse.data.success) {
            const users = usersResponse.data.users || [];
            const totalUsers = users.length;
            const newUsers = users.filter((user: any) => {
              const createdAt = new Date(user.createdAt);
              const now = new Date();
              const daysDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
              return daysDiff <= 30; // Utilisateurs créés dans les 30 derniers jours
            }).length;

            setStats(prev => ({
              ...prev,
              utilisateurs: totalUsers,
              nouveauxClients: newUsers,
            }));
          }
        } catch (error) {
          console.error('Erreur lors du chargement des utilisateurs:', error);
          // Pour les professionnels, mettre à 0
          if (!isAdmin) {
            setStats(prev => ({
              ...prev,
              utilisateurs: 0,
              nouveauxClients: 0,
            }));
          }
        }
      } else {
        // Pour les professionnels, mettre à 0
        setStats(prev => ({
          ...prev,
          utilisateurs: 0,
          nouveauxClients: 0,
        }));
      }

      // Charger les rendez-vous
      const appointmentsResponse = await appointmentsAPI.getAllAppointments();
      if (appointmentsResponse.data.success) {
        const appointments = appointmentsResponse.data.data || appointmentsResponse.data.appointments || [];
        setStats(prev => ({
          ...prev,
          rendezVous: appointments.length,
        }));
      }

      // Charger les documents
      try {
        console.log('📄 Chargement des documents pour le dashboard admin...');
        const documentsResponse = await documentsAPI.getAllDocuments();
        console.log('📄 Réponse getAllDocuments:', documentsResponse.data);
        
        if (documentsResponse.data.success) {
          const documents = documentsResponse.data.documents || documentsResponse.data.data || [];
          console.log('📄 Documents trouvés:', documents.length);
          
          setStats(prev => ({
            ...prev,
            documents: documents.length,
          }));
        } else {
          console.error('❌ Erreur dans la réponse getAllDocuments:', documentsResponse.data.message);
          // Mettre à jour avec 0 si erreur
          setStats(prev => ({
            ...prev,
            documents: 0,
          }));
        }
      } catch (docError: any) {
        console.error('❌ Erreur lors du chargement des documents:', docError);
        console.error('Détails:', {
          message: docError.message,
          response: docError.response?.data,
          status: docError.response?.status
        });
        // Mettre à jour avec 0 si erreur
        setStats(prev => ({
          ...prev,
          documents: 0,
        }));
      }

      // Charger les dossiers pour calculer les statistiques de transmission
      try {
        const dossiersResponse = await dossiersAPI.getMyDossiers();
        if (dossiersResponse.data.success) {
          const allDossiers = dossiersResponse.data.dossiers || [];
          const now = new Date();
          
          // Calculer les dates pour la période sélectionnée
          const periodStart = statsPeriod === 'week' 
            ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            : new Date(now.getFullYear(), now.getMonth(), 1);
          
          // Filtrer les dossiers de la période
          const periodDossiers = allDossiers.filter((d: any) => {
            const dossierDate = new Date(d.createdAt || d.updatedAt);
            return dossierDate >= periodStart;
          });
          
          // Calculer les dossiers transmis
          const dossiersTransmis = periodDossiers.filter((d: any) => 
            d.transmittedTo && d.transmittedTo.length > 0
          ).length;
          
          // Calculer le taux de transmission
          const tauxTransmission = periodDossiers.length > 0 
            ? Math.round((dossiersTransmis / periodDossiers.length) * 100) 
            : 0;
          
          // Calculer les dossiers en cours
          const dossiersEnCours = periodDossiers.filter((d: any) => 
            d.statut && !['termine', 'cloture', 'annule', 'refuse'].includes(d.statut)
          ).length;
          
          setStats(prev => ({
            ...prev,
            dossiers: allDossiers.length,
            dossiersEnCours: dossiersEnCours,
            dossiersTransmis: dossiersTransmis,
            tauxTransmission: tauxTransmission,
          }));
        }
      } catch (dossiersError) {
        console.error('Erreur lors du chargement des dossiers:', dossiersError);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (typeMime: string) => {
    if (typeMime.includes('pdf')) return '📄';
    if (typeMime.includes('image')) return '🖼️';
    if (typeMime.includes('word') || typeMime.includes('document')) return '📝';
    if (typeMime.includes('excel') || typeMime.includes('spreadsheet')) return '📊';
    return '📎';
  };

  const loadTasks = async () => {
    try {
      const response = await tasksAPI.getAllTasks();
      if (response.data.success) {
        const allTasks = response.data.tasks || [];
        setTasks(allTasks);
        const tasksEnCours = allTasks.filter((t: any) => 
          t.statut === 'a_faire' || t.statut === 'en_cours' || t.statut === 'en_attente'
        ).length;
        setStats(prev => ({
          ...prev,
          tasks: allTasks.length,
          tasksEnCours,
        }));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des tâches:', error);
    }
  };

  // Fonction loadDossiers supprimée car les dossiers ne sont plus affichés sur le dashboard


  const loadTeamMembers = async () => {
    try {
      const response = await userAPI.getAllUsers();
      if (response.data.success) {
        const users = response.data.users || [];
        // Filtrer pour ne garder que les membres de l'équipe (admin, superadmin, etc.)
        const members = users.filter((user: any) => 
          ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'].includes(user.role)
        );
        setTeamMembers(members);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des membres:', error);
    }
  };

  const loadNotifications = async () => {
    try {
      // Charger tous les rendez-vous
      const appointmentsResponse = await appointmentsAPI.getAllAppointments();
      if (appointmentsResponse.data.success) {
        const appointments = appointmentsResponse.data.data || appointmentsResponse.data.appointments || [];
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(23, 59, 59, 999);

        // Filtrer les rendez-vous du jour
        const todayApps = appointments.filter((apt: any) => {
          if (!apt.date) return false;
          const aptDate = new Date(apt.date);
          aptDate.setHours(0, 0, 0, 0);
          return aptDate.getTime() === today.getTime() && apt.statut !== 'annule' && apt.statut !== 'annulé';
        });

        // Filtrer les rendez-vous du lendemain
        const tomorrowApps = appointments.filter((apt: any) => {
          if (!apt.date) return false;
          const aptDate = new Date(apt.date);
          aptDate.setHours(0, 0, 0, 0);
          return aptDate.getTime() === tomorrow.getTime() && apt.statut !== 'annule' && apt.statut !== 'annulé';
        });

        setTodayAppointments(todayApps);
        setTomorrowAppointments(tomorrowApps);
      }

      // Charger les tâches de la semaine
      const tasksResponse = await tasksAPI.getAllTasks();
      if (tasksResponse.data.success && session) {
        const allTasks = tasksResponse.data.tasks || [];
        const now = new Date();
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const weekTasks = allTasks.filter((task: any) => {
          if (!task.dateEcheance) return false;
          const taskDate = new Date(task.dateEcheance);
          return taskDate <= weekFromNow && 
                 (task.statut === 'a_faire' || task.statut === 'en_cours' || task.statut === 'en_attente');
        });
        
        setWeekTasks(weekTasks);
        
        // Filtrer les tâches assignées à l'admin connecté
        // Note: Le popup de notification des tâches a été désactivé
        // const currentUserId = (session.user as any)?.id;
        // const tasksForAdmin = weekTasks.filter((task: any) => {
        //   // Tâches assignées à l'admin connecté
        //   if (task.assignedTo) {
        //     if (typeof task.assignedTo === 'object' && task.assignedTo._id === currentUserId) {
        //       return true;
        //     }
        //     if (typeof task.assignedTo === 'string' && task.assignedTo === currentUserId) {
        //       return true;
        //     }
        //   }
        //   return false;
        // });
        
        // Afficher la pop-up si il y a des tâches et qu'elle n'a pas encore été affichée
        // DÉSACTIVÉ: Le popup des tâches ne s'affiche plus à la connexion
        // if (tasksForAdmin.length > 0 && !hasShownTasksNotification) {
        //   setTimeout(() => {
        //     setShowTasksNotificationModal(true);
        //     setHasShownTasksNotification(true);
        //   }, 1000); // Délai de 1 seconde après le chargement
        // }
      }
    } catch (error) {
      console.error('Erreur lors du chargement des notifications:', error);
    }
  };

  const handleOpenTaskDetail = async (task: any) => {
    try {
      setTaskNotesError(null);
      setNewTaskNote('');
      // Recharger la tâche depuis l'API pour inclure l'historique des commentaires
      const id = task._id || task.id;
      const response = await tasksAPI.getTaskById(id);
      if (response.data.success && response.data.task) {
        setSelectedTaskDetail(response.data.task);
      } else {
        setSelectedTaskDetail(task);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du détail de la tâche:', error);
      // En cas d'erreur, afficher au moins les infos de base déjà chargées
      setSelectedTaskDetail(task);
    } finally {
      setShowTaskDetailModal(true);
    }
  };

  const handleAddTaskNote = async () => {
    if (!selectedTaskDetail || !newTaskNote.trim()) return;
    try {
      setIsAddingTaskNote(true);
      setTaskNotesError(null);
      const id = selectedTaskDetail._id || selectedTaskDetail.id;
      const response = await tasksAPI.addNoteToTask(id, { contenu: newTaskNote.trim() });
      if (response.data.success && response.data.task) {
        const updatedTask = response.data.task;
        // Mettre à jour le détail
        setSelectedTaskDetail(updatedTask);
        // Mettre à jour la liste principale
        setTasks(prev =>
          prev.map((t: any) => (t._id === updatedTask._id ? { ...t, ...updatedTask } : t))
        );
        setNewTaskNote('');
      } else {
        setTaskNotesError(response.data.message || 'Erreur lors de l\'ajout de la note');
      }
    } catch (error: any) {
      console.error('Erreur lors de l\'ajout de la note de tâche:', error);
      setTaskNotesError(
        error.response?.data?.message || 'Erreur lors de l\'ajout de la note de tâche'
      );
    } finally {
      setIsAddingTaskNote(false);
    }
  };

  const handleUpdateTaskAssignment = async () => {
    if (!selectedTaskDetail || !newAssigneeId) {
      return;
    }

    setIsUpdatingTaskAssignment(true);
    try {
      await tasksAPI.updateTask(selectedTaskDetail._id, {
        assignedTo: newAssigneeId
      });
      
      // Recharger les tâches
      await loadTasks();
      
      // Mettre à jour la tâche sélectionnée
      const updatedTask = tasks.find((t: any) => t._id === selectedTaskDetail._id);
      if (updatedTask) {
        setSelectedTaskDetail(updatedTask);
      }
      
      setNewAssigneeId('');
      alert('Assignation mise à jour avec succès !');
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour de l\'assignation:', error);
      alert('Erreur lors de la mise à jour de l\'assignation: ' + (error.response?.data?.message || error.message));
    } finally {
      setIsUpdatingTaskAssignment(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskFormData.titre || !taskFormData.assignedTo) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setIsSubmittingTask(true);
    try {
      const response = await tasksAPI.createTask(taskFormData);
      if (response.data.success) {
        setShowTaskModal(false);
        setTaskFormData({
          titre: '',
          description: '',
          assignedTo: '',
          priorite: 'normale',
          dateEcheance: '',
          dossier: '',
        });
        loadTasks();
        alert('Tâche créée avec succès !');
      }
    } catch (error: any) {
      console.error('Erreur lors de la création de la tâche:', error);
      alert(error.response?.data?.message || 'Erreur lors de la création de la tâche');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (effectue: boolean) => {
    if (!selectedTaskForStatus) return;

    setIsUpdatingTaskStatus(true);
    try {
      const response = await tasksAPI.updateTask(selectedTaskForStatus._id, {
        effectue: effectue,
        commentaireEffectue: taskStatusComment,
        statut: effectue ? 'termine' : 'a_faire',
      });

      if (response.data.success) {
        setShowTaskStatusModal(false);
        setSelectedTaskForStatus(null);
        setTaskStatusComment('');
        await loadTasks();
        await loadNotifications();
      } else {
        alert(response.data.message || 'Erreur lors de la mise à jour de la tâche');
      }
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour de la tâche:', error);
      alert(error.response?.data?.message || 'Erreur lors de la mise à jour de la tâche');
    } finally {
      setIsUpdatingTaskStatus(false);
    }
  };

  const handleInlineStatusChange = async (task: any, newStatus: string) => {
    if (!newStatus || task.statut === newStatus) return;
    setUpdatingTaskId(task._id);
    try {
      const response = await tasksAPI.updateTask(task._id, { statut: newStatus });
      if (response.data.success) {
        const updatedTask = response.data.task;
        setTasks(prev =>
          prev.map((t: any) => (t._id === updatedTask._id ? updatedTask : t))
        );
        if (selectedTaskDetail && selectedTaskDetail._id === updatedTask._id) {
          setSelectedTaskDetail(updatedTask);
        }
      } else {
        alert(response.data.message || 'Erreur lors de la mise à jour du statut de la tâche');
      }
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour du statut de la tâche:', error);
      alert(error.response?.data?.message || 'Erreur lors de la mise à jour du statut de la tâche');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleInlinePriorityChange = async (task: any, newPriority: string) => {
    if (!newPriority || task.priorite === newPriority) return;
    setUpdatingTaskId(task._id);
    try {
      const response = await tasksAPI.updateTask(task._id, { priorite: newPriority });
      if (response.data.success) {
        const updatedTask = response.data.task;
        setTasks(prev =>
          prev.map((t: any) => (t._id === updatedTask._id ? updatedTask : t))
        );
        if (selectedTaskDetail && selectedTaskDetail._id === updatedTask._id) {
          setSelectedTaskDetail(updatedTask);
        }
      } else {
        alert(response.data.message || 'Erreur lors de la mise à jour de la priorité de la tâche');
      }
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour de la priorité de la tâche:', error);
      alert(error.response?.data?.message || 'Erreur lors de la mise à jour de la priorité de la tâche');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case 'termine':
        return 'bg-green-100 text-green-800';
      case 'en_cours':
        return 'bg-yellow-100 text-yellow-800';
      case 'en_attente':
        return 'bg-blue-100 text-blue-800';
      case 'annule':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatutLabel = (statut: string) => {
    const labels: { [key: string]: string } = {
      'a_faire': 'À faire',
      'en_cours': 'En cours',
      'en_attente': 'En attente',
      'termine': 'Terminée',
      'annule': 'Annulé',
    };
    return labels[statut] || statut;
  };

  const getPrioriteColor = (priorite: string) => {
    switch (priorite) {
      case 'urgente':
        return 'bg-red-100 text-red-800';
      case 'haute':
        return 'bg-orange-100 text-orange-800';
      case 'normale':
        return 'bg-blue-100 text-blue-800';
      case 'basse':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Afficher un loader pendant le chargement de la session
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

  // Si pas de session ou pas admin, ne rien afficher (la redirection est gérée dans useEffect)
  const userRole = session ? (session.user as any)?.role : null;
  const isAuthorized = userRole === 'admin' || userRole === 'superadmin';
  
  if (!session || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Redirection...</p>
        </div>
      </div>
    );
  }
  
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <main className="w-full px-4 py-8 max-w-full">
        {/* En-tête avec navigation rapide */}
        <div id="dashboard-top" className="mb-8 scroll-mt-20">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {dashboardTitle}
              </h1>
              <p className="text-muted-foreground text-lg">{dashboardSubtitle}</p>
            </div>
          </div>
        </div>


        {/* Statistiques principales - Disposition optimisée */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
          {/* Badge Utilisateurs - Seulement pour les admins */}
          {isAdmin && (
            <Link href="/admin/utilisateurs" className="group" id="utilisateurs-section">
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-primary hover:shadow-lg hover:border-primary/80 transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <span className="text-2xl">👥</span>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-primary transition-colors">{stats.utilisateurs}</p>
                  </div>
                </div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Utilisateurs</h3>
                <p className="text-xs text-muted-foreground mb-3">Clients actifs</p>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-semibold group-hover:bg-primary/20 transition-colors">
                    +{stats.nouveauxClients} ce mois
                  </span>
                  <span className="text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
                </div>
              </div>
            </Link>
          )}

          {/* Badge Dossiers */}
          <Link href="/admin/dossiers" className="group" id="dossiers-section">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500 hover:shadow-lg hover:border-blue-600 transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <span className="text-2xl">📁</span>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-blue-600 transition-colors">{stats.dossiers}</p>
                </div>
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Dossiers</h3>
              <p className="text-xs text-muted-foreground mb-3">Tous les dossiers</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-muted-foreground">Gestion complète</span>
                <span className="text-blue-600 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
              </div>
            </div>
          </Link>

          {/* Badge Documents */}
          <Link href="/admin/documents" className="group" id="documents-section">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500 hover:shadow-lg hover:border-purple-600 transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                  <span className="text-2xl">📄</span>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-purple-600 transition-colors">{stats.documents}</p>
                </div>
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Documents</h3>
              <p className="text-xs text-muted-foreground mb-3">Total des documents</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-muted-foreground">Téléversés par les clients</span>
                <span className="text-purple-600 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
              </div>
            </div>
          </Link>

          {/* Badge Tâches */}
          <Link href="/admin/taches" className="group">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-500 hover:shadow-lg hover:border-orange-600 transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                  <span className="text-2xl">✅</span>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-orange-600 transition-colors">{stats.tasks}</p>
                </div>
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Tâches</h3>
              <p className="text-xs text-muted-foreground mb-3">Gestion complète des tâches</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="inline-flex items-center px-2 py-1 rounded-md bg-orange-500/10 text-orange-600 text-xs font-semibold">
                  {stats.tasksEnCours} en cours
                </span>
                <span className="text-orange-600 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
              </div>
            </div>
          </Link>

          {/* Badge Rendez-vous */}
          <Link href="/admin/rendez-vous" className="group" id="rendez-vous-section">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500 hover:shadow-lg hover:border-green-600 transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                  <span className="text-2xl">📅</span>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-green-600 transition-colors">{stats.rendezVous}</p>
                </div>
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Rendez-vous</h3>
              <p className="text-xs text-muted-foreground mb-3">Gérez le calendrier</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-muted-foreground">Planification</span>
                <span className="text-green-600 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
              </div>
            </div>
          </Link>

          {/* Badge Témoignages - Seulement pour les admins */}
          {isAdmin && (
            <Link href="/admin/temoignages" className="group" id="temoignages-section">
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500 hover:shadow-lg hover:border-yellow-600 transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center group-hover:bg-yellow-500/20 transition-colors">
                    <span className="text-2xl">⭐</span>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-yellow-600 transition-colors">-</p>
                  </div>
                </div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Témoignages</h3>
                <p className="text-xs text-muted-foreground mb-3">Validez les avis</p>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-xs text-muted-foreground">Avis clients</span>
                  <span className="text-yellow-600 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
                </div>
              </div>
            </Link>
          )}
        </div>


        {/* Messagerie - Pleine largeur et dépliable */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            {/* En-tête avec bouton déplier/replier */}
            <div 
              className="flex items-center justify-between p-6 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-200"
              onClick={() => setIsMessagesExpanded(!isMessagesExpanded)}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">✉️</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Messagerie interne</h2>
                  <p className="text-sm text-muted-foreground">
                    {messagesPreview.length > 0 
                      ? `${messagesPreview.length} message${messagesPreview.length > 1 ? 's' : ''} non lu${messagesPreview.length > 1 ? 's' : ''}`
                      : 'Aucun message non lu'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link 
                  href="/admin/messages"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm text-primary hover:text-primary/80 font-semibold"
                >
                  Ouvrir la messagerie →
                </Link>
                <button className="text-2xl text-muted-foreground hover:text-foreground transition-colors">
                  {isMessagesExpanded ? '▴' : '▾'}
                </button>
              </div>
            </div>

            {/* Contenu dépliable */}
            {isMessagesExpanded && (
              <div className="p-6 max-h-[600px] overflow-y-auto">
                {messagesPreview.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-4xl">✉️</span>
                    </div>
                    <p className="text-muted-foreground font-medium mb-2">Aucun message non lu</p>
                    <p className="text-sm text-muted-foreground">
                      Vous serez notifié lorsque vous recevrez de nouveaux messages
                    </p>
                    <Link href="/admin/messages">
                      <Button className="mt-4">
                        Accéder à la messagerie
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messagesPreview.map((msg) => (
                      <Link
                        key={msg._id || msg.id}
                        href={`/admin/messages/${msg._id || msg.id}`}
                        className="block rounded-xl border-2 border-gray-200 hover:border-primary/40 hover:bg-primary/5 transition-all p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-lg">💬</span>
                              <p className="text-base font-bold text-foreground truncate">{msg.sujet || 'Sans sujet'}</p>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-3 mb-2">
                              {msg.contenu || 'Aucun contenu'}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {msg.expediteur && typeof msg.expediteur === 'object' && (
                                <span>👤 {msg.expediteur.firstName} {msg.expediteur.lastName}</span>
                              )}
                              {msg.createdAt && (
                                <span>📅 {new Date(msg.createdAt).toLocaleDateString('fr-FR', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-primary text-white text-sm font-semibold">
                              Voir →
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>


        {/* Statistiques professionnelles - Seulement pour les admins */}
        {isAdmin && (
          <div className="mb-8">
            <div className="bg-gradient-to-br from-white via-blue-50/20 to-white rounded-2xl shadow-xl p-8 border border-blue-200/50 backdrop-blur-sm">
              {/* En-tête avec toggle période */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                    <span className="text-2xl">📈</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">Statistiques {statsPeriod === 'week' ? 'hebdomadaires' : 'mensuelles'}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {statsPeriod === 'week' 
                        ? '7 derniers jours' 
                        : `Mois de ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setStatsPeriod('week')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      statsPeriod === 'week'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Hebdomadaire
                  </button>
                  <button
                    onClick={() => setStatsPeriod('month')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      statsPeriod === 'month'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Mensuel
                  </button>
                </div>
              </div>

              {/* Grille de statistiques avec diagrammes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Nouveaux clients */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-xl p-6 border border-orange-200/50 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-sm">
                        <span className="text-white text-lg">👥</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">Nouveaux clients</span>
                    </div>
                    <span className="text-2xl font-bold text-orange-600">{stats.nouveauxClients}</span>
                  </div>
                  <div className="w-full bg-orange-200/50 rounded-full h-4 overflow-hidden shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-orange-500 to-orange-600 h-4 rounded-full transition-all duration-700 shadow-sm" 
                      style={{ width: `${Math.min((stats.nouveauxClients / Math.max(stats.nouveauxClients, 1)) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {/* Dossiers traités */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-6 border border-blue-200/50 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                        <span className="text-white text-lg">📁</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">Dossiers traités</span>
                    </div>
                    <span className="text-2xl font-bold text-blue-600">{stats.dossiersEnCours}</span>
                  </div>
                  <div className="w-full bg-blue-200/50 rounded-full h-4 overflow-hidden shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all duration-700 shadow-sm" 
                      style={{ width: `${Math.min((stats.dossiersEnCours / Math.max(stats.dossiersEnCours, 1)) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {/* Dossiers transmis */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl p-6 border border-purple-200/50 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
                        <span className="text-white text-lg">📤</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">Dossiers transmis</span>
                    </div>
                    <span className="text-2xl font-bold text-purple-600">{stats.dossiersTransmis}</span>
                  </div>
                  <div className="w-full bg-purple-200/50 rounded-full h-4 overflow-hidden shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-purple-600 h-4 rounded-full transition-all duration-700 shadow-sm" 
                      style={{ width: `${Math.min((stats.dossiersTransmis / Math.max(stats.dossiersEnCours, 1)) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {/* Taux de transmission */}
                <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl p-6 border border-green-200/50 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-sm">
                        <span className="text-white text-lg">📊</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">Taux de transmission</span>
                    </div>
                    <span className="text-2xl font-bold text-green-600">{stats.tauxTransmission}%</span>
                  </div>
                  <div className="w-full bg-green-200/50 rounded-full h-4 overflow-hidden shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-green-500 to-green-600 h-4 rounded-full transition-all duration-700 shadow-sm" 
                      style={{ width: `${stats.tauxTransmission}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Modals de tâches - DÉPLACÉS vers /admin/taches */}
        {false && showTaskModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold mb-4">Créer une nouvelle tâche</h3>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Titre *</label>
                  <input
                    type="text"
                    value={taskFormData.titre}
                    onChange={(e) => setTaskFormData({ ...taskFormData, titre: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-input rounded-md"
                    placeholder="Ex: Réviser le dossier X"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={taskFormData.description}
                    onChange={(e) => setTaskFormData({ ...taskFormData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md min-h-[100px]"
                    placeholder="Détails de la tâche..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Assigner à *</label>
                    <select
                      value={taskFormData.assignedTo}
                      onChange={(e) => setTaskFormData({ ...taskFormData, assignedTo: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-input rounded-md"
                    >
                      <option value="">Sélectionner un membre</option>
                      {teamMembers.map((member: any) => (
                        <option key={member._id} value={member._id}>
                          {member.firstName} {member.lastName} ({member.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Priorité</label>
                    <select
                      value={taskFormData.priorite}
                      onChange={(e) => setTaskFormData({ ...taskFormData, priorite: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md"
                    >
                      <option value="basse">Basse</option>
                      <option value="normale">Normale</option>
                      <option value="haute">Haute</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date d'échéance</label>
                  <input
                    type="date"
                    value={taskFormData.dateEcheance}
                    onChange={(e) => setTaskFormData({ ...taskFormData, dateEcheance: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md"
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowTaskModal(false);
                      setTaskFormData({
                        titre: '',
                        description: '',
                        assignedTo: '',
                        priorite: 'normale',
                        dateEcheance: '',
                        dossier: '',
                      });
                    }}
                    disabled={isSubmittingTask}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isSubmittingTask}>
                    {isSubmittingTask ? 'Création...' : 'Créer la tâche'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de détail de tâche - DÉPLACÉ vers /admin/taches */}
        {false && showTaskDetailModal && selectedTaskDetail && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold">Détails de la tâche</h3>
                <button
                  onClick={() => {
                    setShowTaskDetailModal(false);
                    setSelectedTaskDetail(null);
                    setNewAssigneeId('');
                  }}
                  className="text-2xl text-muted-foreground hover:text-foreground transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Titre */}
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Titre</label>
                  <p className="text-lg font-bold text-foreground">{selectedTaskDetail.titre}</p>
                </div>

                {/* Statut et Priorité */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-2">Statut</label>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getStatutColor(selectedTaskDetail.statut)}`}>
                      {getStatutLabel(selectedTaskDetail.statut)}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-2">Priorité</label>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getPrioriteColor(selectedTaskDetail.priorite)}`}>
                      {selectedTaskDetail.priorite === 'urgente' ? '🔴 ' : selectedTaskDetail.priorite === 'haute' ? '🟠 ' : ''}
                      {selectedTaskDetail.priorite}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {selectedTaskDetail.description && (
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-2">Description</label>
                    <p className="text-foreground bg-gray-50 rounded-md p-3 whitespace-pre-wrap">
                      {selectedTaskDetail.description}
                    </p>
                  </div>
                )}

                {/* Assignation */}
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">
                    Assigné à
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-foreground font-medium">
                        {selectedTaskDetail.assignedTo?.firstName 
                          ? `${selectedTaskDetail.assignedTo.firstName} ${selectedTaskDetail.assignedTo.lastName} (${selectedTaskDetail.assignedTo.email})`
                          : 'Non assigné'}
                      </p>
                    </div>
                    <div className="flex-1">
                      <select
                        value={newAssigneeId || (selectedTaskDetail.assignedTo?._id || selectedTaskDetail.assignedTo || '')}
                        onChange={(e) => setNewAssigneeId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Sélectionner un membre</option>
                        {teamMembers.map((member: any) => (
                          <option key={member._id} value={member._id}>
                            {member.firstName} {member.lastName} ({member.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      onClick={handleUpdateTaskAssignment}
                      disabled={isUpdatingTaskAssignment || !newAssigneeId || newAssigneeId === (selectedTaskDetail.assignedTo?._id || selectedTaskDetail.assignedTo || '')}
                      className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                    >
                      {isUpdatingTaskAssignment ? 'Mise à jour...' : 'Réassigner'}
                    </Button>
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  {selectedTaskDetail.dateEcheance && (
                    <div>
                      <label className="block text-sm font-semibold text-muted-foreground mb-2">Date d'échéance</label>
                      <p className="text-foreground">
                        {new Date(selectedTaskDetail.dateEcheance).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                        {new Date(selectedTaskDetail.dateEcheance) < new Date() && !selectedTaskDetail.effectue && (
                          <span className="ml-2 text-red-600 font-semibold">⚠️ En retard</span>
                        )}
                      </p>
                    </div>
                  )}
                  {selectedTaskDetail.dateDebut && (
                    <div>
                      <label className="block text-sm font-semibold text-muted-foreground mb-2">Date de début</label>
                      <p className="text-foreground">
                        {new Date(selectedTaskDetail.dateDebut).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                  {selectedTaskDetail.dateFin && (
                    <div>
                      <label className="block text-sm font-semibold text-muted-foreground mb-2">Date de fin</label>
                      <p className="text-foreground">
                        {new Date(selectedTaskDetail.dateFin).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                  {selectedTaskDetail.dateEffectue && (
                    <div>
                      <label className="block text-sm font-semibold text-muted-foreground mb-2">Date d'effectuation</label>
                      <p className="text-foreground">
                        {new Date(selectedTaskDetail.dateEffectue).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Dossier lié */}
                {selectedTaskDetail.dossier && (
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-2">Dossier lié</label>
                    <p className="text-foreground font-medium">
                      {selectedTaskDetail.dossier.titre || selectedTaskDetail.dossier}
                      {selectedTaskDetail.dossier.numero && (
                        <span className="text-muted-foreground ml-2">
                          (N° {selectedTaskDetail.dossier.numero})
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* Notes */}
                {selectedTaskDetail.notes && (
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-2">Notes</label>
                    <p className="text-foreground bg-gray-50 rounded-md p-3 whitespace-pre-wrap">
                      {selectedTaskDetail.notes}
                    </p>
                  </div>
                )}

                {/* Commentaire d'effectuation */}
                {selectedTaskDetail.commentaireEffectue && (
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-2">Commentaire d'effectuation</label>
                    <p className="text-foreground bg-green-50 rounded-md p-3 whitespace-pre-wrap border border-green-200">
                      {selectedTaskDetail.commentaireEffectue}
                    </p>
                  </div>
                )}

                {/* Historique des notes / commentaires sur la tâche */}
                {Array.isArray(selectedTaskDetail.commentaires) && selectedTaskDetail.commentaires.length > 0 && (
                  <div className="mt-6">
                    <label className="block text-sm font-semibold text-muted-foreground mb-2">
                      Notes / commentaires sur la tâche
                    </label>
                    <div className="space-y-3 max-h-60 overflow-y-auto bg-gray-50 rounded-md p-3 border border-gray-200">
                      {selectedTaskDetail.commentaires
                        .slice()
                        .sort(
                          (a: any, b: any) =>
                            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                        )
                        .map((comment: any, index: number) => (
                          <div
                            key={comment._id || index}
                            className="rounded-md bg-white p-2.5 border border-gray-200 text-sm"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-foreground">
                                {comment.utilisateur?.firstName || comment.utilisateur?.lastName
                                  ? `${comment.utilisateur.firstName || ''} ${
                                      comment.utilisateur.lastName || ''
                                    }`.trim()
                                  : comment.utilisateur?.email || 'Utilisateur'}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {comment.createdAt
                                  ? new Date(comment.createdAt).toLocaleString('fr-FR', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : ''}
                              </span>
                            </div>
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {comment.contenu}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Ajouter une note */}
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">
                    Ajouter une note / commentaire
                  </label>
                  <textarea
                    value={newTaskNote}
                    onChange={(e) => setNewTaskNote(e.target.value)}
                    placeholder="Renseignez un suivi, une décision, ou un échange interne lié à cette tâche..."
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  {taskNotesError && (
                    <p className="text-xs text-red-600 mt-1">{taskNotesError}</p>
                  )}
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      onClick={handleAddTaskNote}
                      disabled={isAddingTaskNote || !newTaskNote.trim()}
                      className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                    >
                      {isAddingTaskNote ? 'Enregistrement...' : 'Enregistrer la note'}
                    </Button>
                  </div>
                </div>

                {/* Informations de création */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Créé par</label>
                      <p className="text-foreground">
                        {selectedTaskDetail.createdBy?.firstName 
                          ? `${selectedTaskDetail.createdBy.firstName} ${selectedTaskDetail.createdBy.lastName}`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Date de création</label>
                      <p className="text-foreground">
                        {selectedTaskDetail.createdAt 
                          ? new Date(selectedTaskDetail.createdAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowTaskDetailModal(false);
                      setSelectedTaskDetail(null);
                      setNewAssigneeId('');
                    }}
                  >
                    Fermer
                  </Button>
                  {/* Bouton pour ouvrir la modale de commentaire de statut, sans mention de “Marquer comme effectuée” */}
                  <Button
                    onClick={() => {
                      setSelectedTaskForStatus(selectedTaskDetail);
                      setTaskStatusComment(selectedTaskDetail.commentaireEffectue || '');
                      setShowTaskDetailModal(false);
                      setShowTaskStatusModal(true);
                    }}
                    className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                  >
                    Commenter le statut
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de notification des tâches */}
        {showTasksNotificationModal && weekTasks.filter((task: any) => {
          const currentUserId = (session?.user as any)?.id;
          if (task.assignedTo) {
            if (typeof task.assignedTo === 'object' && task.assignedTo._id === currentUserId) return true;
            if (typeof task.assignedTo === 'string' && task.assignedTo === currentUserId) return true;
          }
          return false;
        }).length > 0 && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTasksNotificationModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* En-tête */}
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">✅</span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">Tâches à effectuer</h2>
                      <p className="text-purple-100 text-sm">Vous avez {weekTasks.filter((task: any) => {
                        const currentUserId = (session?.user as any)?.id;
                        if (task.assignedTo) {
                          if (typeof task.assignedTo === 'object' && task.assignedTo._id === currentUserId) return true;
                          if (typeof task.assignedTo === 'string' && task.assignedTo === currentUserId) return true;
                        }
                        return false;
                      }).length} tâche(s) à réaliser</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTasksNotificationModal(false)}
                    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  >
                    <span className="text-xl">×</span>
                  </button>
                </div>
              </div>

              {/* Liste des tâches */}
              <div className="p-6 overflow-y-auto flex-1">
                <div className="space-y-3">
                  {weekTasks.filter((task: any) => {
                    const currentUserId = (session?.user as any)?.id;
                    if (task.assignedTo) {
                      if (typeof task.assignedTo === 'object' && task.assignedTo._id === currentUserId) return true;
                      if (typeof task.assignedTo === 'string' && task.assignedTo === currentUserId) return true;
                    }
                    return false;
                  }).map((task: any) => {
                    const assignedUser = teamMembers.find((m: any) => 
                      (task.assignedTo && typeof task.assignedTo === 'object' && m._id === task.assignedTo._id) ||
                      (task.assignedTo && typeof task.assignedTo === 'string' && m._id === task.assignedTo)
                    );
                    const isUrgent = task.dateEcheance && new Date(task.dateEcheance) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
                    
                    return (
                      <div key={task._id || task.id} className={`p-4 rounded-lg border-2 ${
                        isUrgent 
                          ? 'bg-red-50 border-red-300' 
                          : task.priorite === 'haute' 
                          ? 'bg-orange-50 border-orange-300' 
                          : 'bg-white border-gray-200'
                      }`}>
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-bold text-lg text-foreground flex-1">{task.titre}</h3>
                          <div className="flex gap-2 ml-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatutColor(task.statut)}`}>
                              {getStatutLabel(task.statut)}
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPrioriteColor(task.priorite)}`}>
                              {task.priorite}
                            </span>
                          </div>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {assignedUser ? (
                            <span className="flex items-center gap-1">
                              <span>👤</span>
                              <span>{assignedUser.firstName} {assignedUser.lastName}</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-orange-600 font-semibold">
                              <span>⚠️</span>
                              <span>Non assignée</span>
                            </span>
                          )}
                          {task.dateEcheance && (
                            <span className={`flex items-center gap-1 ${isUrgent ? 'text-red-600 font-bold' : ''}`}>
                              <span>📅</span>
                              <span>Échéance: {new Date(task.dateEcheance).toLocaleDateString('fr-FR')}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pied de page */}
              <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                <Link href="/admin?section=tasks" onClick={() => setShowTasksNotificationModal(false)}>
                  <Button variant="outline" className="border-purple-300 text-purple-600 hover:bg-purple-50">
                    Voir toutes les tâches →
                  </Button>
                </Link>
                <Button onClick={() => setShowTasksNotificationModal(false)} className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700">
                  J'ai compris
                </Button>
              </div>
            </div>
          </div>
        )}

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
          isAdmin={true}
          onUpdate={() => {
            loadNotifications();
            loadStats();
          }}
        />

        {/* Modal de commentaire sur le statut de la tâche - DÉPLACÉ vers /admin/taches */}
        {false && showTaskStatusModal && selectedTaskForStatus && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
                <h2 className="text-2xl font-bold">
                  Commentaire sur la tâche
                </h2>
                <button
                  onClick={() => {
                    setShowTaskStatusModal(false);
                    setSelectedTaskForStatus(null);
                    setTaskStatusComment('');
                  }}
                  className="text-muted-foreground hover:text-foreground text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Tâche:</p>
                  <p className="font-semibold text-lg">{selectedTaskForStatus.titre}</p>
                  {selectedTaskForStatus.description && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedTaskForStatus.description}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="taskStatusComment" className="block text-sm font-medium mb-2">
                    Commentaire
                  </label>
                  <textarea
                    id="taskStatusComment"
                    value={taskStatusComment}
                    onChange={(e) => setTaskStatusComment(e.target.value)}
                    placeholder="Ajoutez un commentaire sur l'état de la tâche..."
                    rows={4}
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowTaskStatusModal(false);
                      setSelectedTaskForStatus(null);
                      setTaskStatusComment('');
                    }}
                    disabled={isUpdatingTaskStatus}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={() => handleUpdateTaskStatus(selectedTaskForStatus.effectue)}
                    disabled={isUpdatingTaskStatus}
                    className="bg-green-500 hover:bg-green-600 text-white"
                  >
                    {isUpdatingTaskStatus ? 'Enregistrement...' : 'Enregistrer le commentaire'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

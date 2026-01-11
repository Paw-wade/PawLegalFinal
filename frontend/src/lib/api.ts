import axios from 'axios';

// URL de base de l'API backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api';

// Créer une instance axios avec la configuration par défaut
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 secondes
});

// Fonction utilitaire pour récupérer le token
const getToken = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;

  // 1. Essayer localStorage
  let token = localStorage.getItem('token');
  if (token) {
    // Log désactivé pour réduire le bruit dans la console
    // console.log('🔑 Token trouvé dans localStorage');
    return token;
  }

  // 2. Essayer sessionStorage
  token = sessionStorage.getItem('token');
  if (token) {
    console.log('🔑 Token trouvé dans sessionStorage');
    localStorage.setItem('token', token); // Migrer vers localStorage
    return token;
  }

  // 3. Essayer de récupérer depuis NextAuth (seulement côté client)
  if (typeof window !== 'undefined') {
    try {
      const { getSession } = await import('next-auth/react');
      const session = await getSession();
      if (session && (session.user as any)?.accessToken) {
        token = (session.user as any).accessToken;
        if (token) {
          localStorage.setItem('token', token);
          console.log('🔑 Token récupéré de NextAuth et stocké dans localStorage');
          return token;
        }
      }
    } catch (error) {
      // Ne pas afficher d'avertissement pour les erreurs NextAuth normales
      if (error && typeof error === 'object' && 'message' in error && !error.message?.includes('NEXT_REDIRECT')) {
        console.warn('⚠️ Impossible de récupérer la session NextAuth:', error);
      }
    }

    // 4. Essayer de faire un appel direct à l'API pour obtenir le token
    // (si l'utilisateur est connecté via NextAuth mais le token n'est pas dans la session)
    try {
      const sessionResponse = await fetch('/api/auth/session');
      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        if (sessionData?.user && sessionData?.accessToken) {
          token = sessionData.accessToken;
          if (token) {
            localStorage.setItem('token', token);
            console.log('🔑 Token récupéré depuis /api/auth/session');
            return token;
          }
        }
      }
    } catch (error) {
      // Ne pas afficher d'avertissement pour les erreurs de fetch normales
      if (error && typeof error === 'object' && 'message' in error) {
        console.warn('⚠️ Impossible de récupérer le token depuis /api/auth/session:', error);
      }
    }
  }

  // Ne pas afficher d'avertissement si on est côté serveur ou si c'est une route publique
  if (typeof window !== 'undefined') {
    console.warn('⚠️ Aucun token trouvé');
  }
  return null;
};

// Intercepteur pour ajouter le token d'authentification
api.interceptors.request.use(
  async (config) => {
    // Si la requête contient un FormData, supprimer le Content-Type pour que le navigateur le définisse avec le boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
      console.log('📤 FormData détecté, Content-Type supprimé pour laisser le navigateur le définir');
    }
    
    if (typeof window !== 'undefined') {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        // Log désactivé pour réduire le bruit dans la console
        // console.log('🔑 Token ajouté à la requête:', config.url);
      } else {
        // Ne pas spammer la console pour les routes publiques
        const url = config.url || '';
        const isPublicEndpoint =
          url.includes('/creneaux/available') ||
          url.includes('/temoignages') ||
          url.includes('/contact') ||
          url.includes('/otp/send') ||
          url.includes('/otp/verify') ||
          url.includes('/auth/register') ||
          url.includes('/auth/login');

        // Avertir seulement si une route clairement protégée part sans token
        const isProtectedEndpoint =
          url.includes('/user') ||
          url.includes('/appointments') ||
          url.includes('/dossiers') ||
          url.includes('/messages') ||
          url.includes('/notifications') ||
          url.includes('/tasks');

        if (isProtectedEndpoint && !isPublicEndpoint) {
          console.warn('⚠️ Aucun token trouvé pour une requête protégée :', config.url);
        }
      }
      
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Intercepteur pour gérer les erreurs de réponse
api.interceptors.response.use(
  (response) => {
    // Log des réponses réussies pour le débogage
    if (response.config?.url?.includes('/dossiers') || response.config?.url?.includes('/appointments')) {
      console.log('✅ Réponse API reçue pour:', response.config.url);
      console.log('✅ Status:', response.status);
      console.log('✅ Data:', response.data);
    }
    return response;
  },
  (error) => {
    // Ignorer silencieusement les 404 pour les clés CMS manquantes (comportement attendu)
    // Cette vérification doit être faite AVANT tous les logs d'erreur
    const isCmsKeyNotFound = error.response?.status === 404 && 
                             error.config?.url?.includes('/content/value');
    
    if (isCmsKeyNotFound) {
      // Ne pas logger cette erreur - c'est un comportement attendu quand une clé CMS n'existe pas encore
      // Retourner une réponse avec status 404 mais sans déclencher d'erreur
      // Cela permettra à getText de gérer le cas normalement sans polluer la console
      return Promise.reject({
        response: {
          status: 404,
          data: { success: false, message: 'Clé non trouvée' }
        },
        isCmsNotFound: true,
        config: error.config
      });
    }
    
    // Gérer les erreurs de connexion (backend non disponible)
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED') || !error.response) {
      console.warn('⚠️ Le serveur backend n\'est pas disponible. Vérifiez que le serveur est démarré sur le port 3005.');
      // Ne pas rejeter l'erreur de manière agressive, retourner une erreur contrôlée
      return Promise.reject({
        ...error,
        isConnectionError: true,
        message: 'Le serveur backend n\'est pas disponible. Veuillez vérifier que le serveur est démarré.'
      });
    }
    
    // Log détaillé des erreurs pour appointments
    if (error.config?.url?.includes('/appointments')) {
      console.error('❌ Erreur API appointments:', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      if (error.response?.status === 404) {
        console.error('❌ Route non trouvée:', error.config?.url);
      }
    }
    
    // Log des erreurs pour le débogage (sauf pour les erreurs CMS déjà gérées)
    if (!isCmsKeyNotFound) {
      console.error('❌ Erreur API:', {
        url: error.config?.url,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
        data: error.response?.data
      });
    }
    
    // Gérer les erreurs 401 (non autorisé)
    // Ne pas déconnecter automatiquement - laisser l'utilisateur choisir
    if (error.response?.status === 401) {
      console.warn('⚠️ Token invalide ou expiré pour:', error.config?.url);
      // Ne pas supprimer le token ni rediriger automatiquement
      // L'utilisateur peut choisir de se déconnecter manuellement
    }
    
    // Gérer les erreurs 404 (route non trouvée) - sauf pour les clés CMS manquantes
    if (error.response?.status === 404 && !isCmsKeyNotFound) {
      console.error('❌ Route non trouvée:', error.config?.url);
    }
    
    return Promise.reject(error);
  }
);

export default api;

// Fonctions utilitaires pour les appels API
export const authAPI = {
  register: (data: { firstName: string; lastName: string; email: string; password: string; phone?: string }) =>
    api.post('/auth/register', data),
  
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  
  loginPhone: (data: { phone: string }) =>
    api.post('/auth/login-phone', data),
  
  setupPassword: (data: { password: string; email?: string }) =>
    api.post('/auth/setup-password', data),
  
  forgotPassword: (data: { email: string }) =>
    api.post('/auth/forgot-password', data),
  
  getMe: () =>
    api.get('/auth/me'),
};

export const otpAPI = {
  send: (data: { 
    firstName: string; 
    lastName: string; 
    phone: string;
    professionnelType?: 'consulat' | 'cabinet_avocat';
    organisationName?: string;
    email?: string;
  }) =>
    api.post('/otp/send', data),
  
  verify: (data: { 
    phone: string; 
    code: string;
    professionnelType?: 'consulat' | 'cabinet_avocat';
    organisationName?: string;
    email?: string;
  }) =>
    api.post('/otp/verify', data),
};

export const userAPI = {
  getProfile: () =>
    api.get('/user/profile'),
  
  updateProfile: (data: any) => {
    // Si c'est FormData, ne pas définir Content-Type pour laisser le navigateur le faire
    if (data instanceof FormData) {
      return api.put('/user/profile', data, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    }
    return api.put('/user/profile', data);
  },
  
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/user/password', data),
  
  // Admin - Récupérer tous les utilisateurs
  getAllUsers: () =>
    api.get('/user/all'),
  
  // Admin - Récupérer un utilisateur par ID
  getUserById: (id: string) =>
    api.get(`/user/${id}`),
  
  // Admin - Mettre à jour un utilisateur par ID
  updateUser: (id: string, data: any) =>
    api.put(`/user/${id}`, data),
  
  // Admin - Supprimer un utilisateur par ID
  deleteUser: (id: string) =>
    api.delete(`/user/${id}`),
  
  // SuperAdmin - Créer un utilisateur
  createUser: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
    role?: 'client' | 'admin' | 'superadmin' | 'avocat' | 'consulat' | 'collaborateur' | 'assistant' | 'comptable' | 'secretaire' | 'juriste' | 'stagiaire' | 'visiteur';
    professionnelType?: 'consulat' | 'cabinet_avocat';
    organisationName?: string;
  }) => api.post('/user/create', data),
};

export const logsAPI = {
  // SuperAdmin - Récupérer tous les logs
  getAllLogs: (params?: { action?: string; userId?: string; targetUserId?: string; startDate?: string; endDate?: string; limit?: number; page?: number }) => {
    return api.get('/logs', { params });
  },
  
  // SuperAdmin - Récupérer les logs de connexion
  getLoginLogs: (params?: { userId?: string; startDate?: string; endDate?: string; limit?: number; page?: number }) => {
    return api.get('/logs', { params: { ...params, action: 'login' } });
  },
  
  // SuperAdmin - Télécharger le DLOG en PDF pour une date donnée
  downloadDlogPDF: async (date: string): Promise<void> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || sessionStorage.getItem('token') : null;
    
    // Utiliser la même logique que pour API_BASE_URL
    let baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api';
    
    // Si baseURL se termine déjà par /api, ne pas l'ajouter à nouveau
    // Sinon, construire l'URL complète
    const url = baseURL.endsWith('/api')
      ? `${baseURL}/logs/dlog/pdf?date=${date}`
      : `${baseURL}/api/logs/dlog/pdf?date=${date}`;
    
    console.log('📥 Tentative de téléchargement DLOG:', { url, date, hasToken: !!token });
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token || ''}`
        }
      });
      
      console.log('📥 Réponse DLOG:', { 
        status: response.status, 
        statusText: response.statusText, 
        ok: response.ok,
        contentType: response.headers.get('content-type')
      });
    
      if (!response.ok) {
        // Essayer de récupérer le message d'erreur du serveur
        let errorMessage = 'Erreur lors du téléchargement du DLOG';
        let errorDetails = '';
        
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
            errorDetails = errorData.details || '';
            console.error('📥 Détails de l\'erreur serveur:', errorData);
          } else {
            // Si la réponse n'est pas du JSON, utiliser le statut
            errorMessage = `Erreur ${response.status}: ${response.statusText}`;
          }
        } catch (e) {
          console.error('📥 Erreur lors de la lecture de la réponse d\'erreur:', e);
          // Si la réponse n'est pas du JSON, utiliser le statut
          errorMessage = `Erreur ${response.status}: ${response.statusText}`;
        }
        
        const fullErrorMessage = errorDetails 
          ? `${errorMessage}${errorDetails ? ` (${errorDetails})` : ''}`
          : errorMessage;
        throw new Error(fullErrorMessage);
      }
      
      // Vérifier que la réponse est bien un PDF
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/pdf')) {
        console.warn('⚠️ Content-Type inattendu:', contentType);
        // Ne pas bloquer si le contenu est vide mais le type est correct
        if (!contentType) {
          console.warn('⚠️ Content-Type manquant, tentative de téléchargement quand même');
        }
    }
    
    const blob = await response.blob();
      console.log('📥 Blob reçu:', { size: blob.size, type: blob.type });
      
      // Vérifier que le blob n'est pas vide
      if (blob.size === 0) {
        throw new Error('Le fichier PDF téléchargé est vide. Aucun log trouvé pour cette date.');
      }
      
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `DLOG_${date.replace(/-/g, '_')}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
      
      console.log('✅ DLOG téléchargé avec succès');
    } catch (error: any) {
      console.error('❌ Erreur détaillée lors du téléchargement du DLOG:', error);
      
      // Gérer les erreurs de connexion
      if (error.message?.includes('Failed to fetch') || 
          error.message?.includes('NetworkError') || 
          error.message?.includes('ERR_CONNECTION_REFUSED') ||
          (error.name === 'TypeError' && error.message?.includes('fetch'))) {
        throw new Error('Impossible de contacter le serveur. Vérifiez que le serveur backend est démarré sur le port 3005.');
      }
      
      throw error;
    }
  },
};

export const contactAPI = {
  sendMessage: (data: { name: string; email: string; phone?: string; subject: string; message: string }) =>
    api.post('/contact', data),
  
  // Admin - Récupérer tous les messages
  getAllMessages: (params?: { lu?: boolean; repondu?: boolean; limit?: number; page?: number }) =>
    api.get('/contact', { params }),
  
  // Admin - Récupérer un message spécifique
  getMessage: (id: string) =>
    api.get(`/contact/${id}`),
  
  // Admin - Mettre à jour un message
  updateMessage: (id: string, data: { lu?: boolean; repondu?: boolean; reponse?: string }) =>
    api.patch(`/contact/${id}`, data),
  
  // Admin - Marquer un message comme lu/non lu
  markAsRead: (id: string, isRead: boolean = true) =>
    api.patch(`/contact/${id}`, { lu: isRead }),
  
  // Admin - Télécharger un document
  downloadDocument: (messageId: string, docId: string) =>
    api.get(`/contact/${messageId}/document/${docId}`, { responseType: 'blob' }),
  
  // Admin - Créer un dossier depuis un message de contact
  createDossierFromMessage: (messageId: string, data: {
    titre: string;
    description?: string;
    categorie: string;
    type: string;
    statut?: string;
    priorite?: string;
    clientNom?: string;
    clientPrenom?: string;
    clientEmail?: string;
    clientTelephone?: string;
  }) =>
    api.post(`/contact/${messageId}/create-dossier`, data),
};

export const permissionsAPI = {
  // Récupérer les permissions d'un utilisateur
  getUserPermissions: (userId: string) =>
    api.get(`/permissions/${userId}`),
  
  // Créer ou mettre à jour les permissions
  savePermissions: (data: { userId: string; roles: string[]; permissions: any[] }) =>
    api.post('/permissions', data),
  
  // Mettre à jour les permissions
  updatePermissions: (userId: string, data: { roles?: string[]; permissions?: any[] }) =>
    api.put(`/permissions/${userId}`, data),
  
  // Récupérer les modèles prédéfinis
  getPresets: () =>
    api.get('/permissions/roles/presets'),
};

export const temoignagesAPI = {
  // Public - Récupérer les témoignages validés
  getTemoignages: () =>
    api.get('/temoignages'),
  
  // Client - Créer un témoignage
  createTemoignage: (data: { texte: string; note: number; nom?: string; role?: string }) =>
    api.post('/temoignages', data),
  
  // Client - Récupérer son témoignage
  getMyTemoignage: () =>
    api.get('/temoignages/my'),
  
  // Admin - Récupérer tous les témoignages
  getAllTemoignages: (valide?: boolean) => {
    const params = valide !== undefined ? { params: { valide } } : {};
    return api.get('/temoignages/admin', params);
  },
  
  // Admin - Valider/rejeter un témoignage
  validateTemoignage: (id: string, valide: boolean) =>
    api.patch(`/temoignages/${id}/validate`, { valide }),
  
  // Admin - Supprimer un témoignage
  deleteTemoignage: (id: string) =>
    api.delete(`/temoignages/${id}`),
};

export const appointmentsAPI = {
  // Public - Créer un rendez-vous
  createAppointment: (data: {
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
    date: string;
    heure: string;
    motif: string;
    description?: string;
  }) => api.post('/appointments', data),
  
  // Client - Récupérer ses rendez-vous
  getMyAppointments: () =>
    api.get('/appointments'),
  
  // Récupérer un rendez-vous par ID
  getAppointmentById: (id: string) =>
    api.get(`/appointments/${id}`),
  
  // Client - Annuler un rendez-vous
  cancelAppointment: (id: string) =>
    api.patch(`/appointments/${id}/cancel`),
  
  // Client - Mettre à jour un rendez-vous
  updateMyAppointment: (id: string, data: {
    date?: string;
    heure?: string;
    motif?: string;
    description?: string;
    effectue?: boolean;
  }) =>
    api.put(`/appointments/${id}`, data),
  
  // Admin - Récupérer tous les rendez-vous
  getAllAppointments: (params?: { statut?: string; date?: string; userId?: string; includeArchived?: string }) => {
    return api.get('/appointments/admin', { params });
  },
  
  // Admin - Archiver/désarchiver un rendez-vous
  archiveAppointment: (id: string, archived: boolean) =>
    api.put(`/appointments/${id}/archive`, { archived }),
  
  // Admin - Mettre à jour un rendez-vous
  updateAppointment: (id: string, data: { 
    statut?: string; 
    date?: string;
    heure?: string;
    motif?: string;
    description?: string;
    notes?: string;
    effectue?: boolean;
  }) =>
    api.patch(`/appointments/${id}`, data),
  
  // Admin - Supprimer un rendez-vous
  deleteAppointment: (id: string) =>
    api.delete(`/appointments/${id}`),
};

export const tasksAPI = {
  // Récupérer toutes les tâches (Admin)
  getAllTasks: (params?: { statut?: string; assignedTo?: string; createdBy?: string; dossier?: string; priorite?: string }) => {
    return api.get('/tasks', { params });
  },
  
  // Récupérer les tâches assignées à l'utilisateur connecté
  getMyTasks: (params?: { statut?: string; priorite?: string }) => {
    return api.get('/tasks/my', { params });
  },
  
  // Récupérer une tâche par ID
  getTaskById: (id: string) => {
    return api.get(`/tasks/${id}`);
  },
  
  // Créer une tâche (Admin)
  createTask: (data: {
    titre: string;
    description?: string;
    statut?: string;
    priorite?: string;
    assignedTo: string | string[];
    dateEcheance?: string;
    dateDebut?: string;
    dossier?: string;
    notes?: string;
  }) => {
    return api.post('/tasks', data);
  },
  
  // Mettre à jour une tâche
  updateTask: (id: string, data: {
    titre?: string;
    description?: string;
    statut?: string;
    priorite?: string;
    assignedTo?: string | string[];
    dateEcheance?: string;
    dateDebut?: string;
    dateFin?: string;
    dossier?: string;
    notes?: string;
    effectue?: boolean;
    commentaireEffectue?: string;
  }) => {
    return api.put(`/tasks/${id}`, data);
  },
  
  // Ajouter une note/commentaire à une tâche
  addNoteToTask: (id: string, data: { contenu: string }) => {
    return api.post(`/tasks/${id}/notes`, data);
  },
  
  // Supprimer une tâche (Admin)
  deleteTask: (id: string) => {
    return api.delete(`/tasks/${id}`);
  },
  
  // Vérifier et notifier les tâches en retard (Admin)
  checkOverdueTasks: () => {
    return api.post('/tasks/check-overdue');
  },
};

export const dossiersAPI = {
  // Client - Récupérer ses dossiers
  getMyDossiers: () =>
    api.get('/user/dossiers'),
  
  // Admin - Récupérer tous les dossiers
  getAllDossiers: (params?: { statut?: string; type?: string; categorie?: string; userId?: string; search?: string }) => {
    return api.get('/user/dossiers/admin', { params });
  },
  
  // Créer un dossier
  createDossier: (data: {
    userId?: string;
    clientNom?: string;
    clientPrenom?: string;
    clientEmail?: string;
    clientTelephone?: string;
    titre: string;
    description?: string;
    categorie?: string;
    type?: string;
    statut?: string;
    priorite?: string;
    dateEcheance?: string;
    notes?: string;
    assignedTo?: string;
  }) => api.post('/user/dossiers', data),
  
  // Récupérer un dossier par ID
  getDossierById: (id: string | any) => {
    // Protection : s'assurer que l'ID est une string
    let dossierId = id;
    if (typeof id === 'object' && id !== null) {
      dossierId = id._id || id.id || String(id);
      console.warn('⚠️ getDossierById a reçu un objet au lieu d\'un ID. ID extrait:', dossierId);
    }
    if (!dossierId || typeof dossierId !== 'string') {
      console.error('❌ getDossierById: ID invalide', id);
      return Promise.reject(new Error('ID de dossier invalide'));
    }
    return api.get(`/user/dossiers/${dossierId}`);
  },
  
  // Récupérer l'historique d'un dossier
  getDossierHistory: (id: string) => {
    return api.get(`/user/dossiers/${id}/history`);
  },
  
  // Récupérer les documents d'un dossier spécifique
  getDossierDocuments: (dossierId: string) => {
    return api.get(`/user/documents/dossier/${dossierId}`);
  },
  
  // Client - Annuler un dossier
  cancelDossier: (id: string) =>
    api.patch(`/user/dossiers/${id}/cancel`),
  
  // Mettre à jour un dossier
  updateDossier: (id: string, data: any) =>
    api.put(`/user/dossiers/${id}`, data),
  
  // Supprimer un dossier (Admin)
  deleteDossier: (id: string) =>
    api.delete(`/user/dossiers/${id}`),
  
  // Transmettre un dossier à un partenaire (Admin/Superadmin)
  transmitDossier: (id: string, data: { partenaireId: string; notes?: string }) =>
    api.post(`/user/dossiers/${id}/transmit`, data),
  
  // Retirer la transmission d'un dossier (Admin/Secrétaire)
  removeTransmission: (id: string, userId: string) =>
    api.delete(`/user/dossiers/${id}/transmit/${userId}`),
  
  // Accuser réception d'un dossier transmis avec acceptation/refus (Consulat/Avocat/Association)
  acknowledgeDossier: (id: string, action: 'accept' | 'refuse', notes?: string) =>
    api.post(`/user/dossiers/${id}/acknowledge`, { action, notes }),
};

export const notificationsAPI = {
  // Récupérer toutes les notifications
  getNotifications: (params?: { lu?: boolean; limit?: number }) =>
    api.get('/notifications', { params }),
  
  // Récupérer le nombre de notifications non lues
  getUnreadCount: () =>
    api.get('/notifications/unread'),
  
  // Marquer une notification comme lue
  markAsRead: (id: string) =>
    api.put(`/notifications/${id}/read`),
  
  // Marquer toutes les notifications comme lues
  markAllAsRead: () =>
    api.put('/notifications/read-all'),
  
  // Supprimer une notification
  deleteNotification: (id: string) =>
    api.delete(`/notifications/${id}`),
};

export const messagesAPI = {
  // Récupérer les messages (retourne aussi les threads)
  getMessages: (params?: { type?: 'all' | 'received' | 'sent' | 'unread'; dossierId?: string; expediteurId?: string; destinataireId?: string }) =>
    api.get('/messages', { params }),
  
  // Récupérer un thread complet par threadId
  getThread: (threadId: string) =>
    api.get(`/messages/thread/${threadId}`),
  
  // Récupérer le nombre de messages non lus
  getUnreadCount: () =>
    api.get('/messages/unread-count'),
  
  // Récupérer un message spécifique (retourne aussi le thread complet)
  getMessage: (id: string) =>
    api.get(`/messages/${id}`),
  
  // Récupérer la liste des utilisateurs (admin seulement)
  getUsers: () =>
    api.get('/messages/users'),
  
  // Envoyer un message
  sendMessage: (data: FormData) =>
    api.post('/messages', data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),
  
  // Marquer un message comme lu
  markAsRead: (id: string) =>
    api.put(`/messages/${id}/read`),
  
  // Marquer un message comme non lu
  markAsUnread: (id: string) =>
    api.put(`/messages/${id}/unread`),
  
  // Archiver un message
  archiveMessage: (id: string) =>
    api.put(`/messages/${id}/archive`),
  
  // Télécharger une pièce jointe
  downloadAttachment: (messageId: string, fileIndex: number) =>
    api.get(`/messages/${messageId}/download/${fileIndex}`, {
      responseType: 'blob',
    }),
  
  // Supprimer un message (l'expéditeur peut supprimer, les admins peuvent supprimer n'importe quel message)
  deleteMessage: (id: string) =>
    api.delete(`/messages/${id}`),
  
  // Actions batch
  markBatchAsRead: (messageIds: string[]) =>
    api.post('/messages/batch/read', { messageIds }),
  
  markBatchAsUnread: (messageIds: string[]) =>
    api.post('/messages/batch/unread', { messageIds }),
  
  deleteBatch: (messageIds: string[]) =>
    api.post('/messages/batch/delete', { messageIds }),
};

export const documentsAPI = {
  // Client - Récupérer ses documents
  getMyDocuments: () =>
    api.get('/user/documents'),
  
  // Admin - Récupérer tous les documents
  getAllDocuments: (params?: { userId?: string }) => {
    return api.get('/user/documents/admin', { params });
  },
  
  // Téléverser un document
  uploadDocument: (formData: FormData) => {
    // Ne pas définir Content-Type manuellement - laisser le navigateur le définir avec le boundary
    return api.post('/user/documents', formData, {
      headers: {
        // Le navigateur définira automatiquement Content-Type: multipart/form-data avec le boundary
      },
    });
  },
  
  // Prévisualiser un document (retourne une Promise qui résout avec l'URL du blob)
  previewDocument: async (id: string): Promise<string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || sessionStorage.getItem('token') : null;
    let baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
    // Si baseURL contient déjà /api, ne pas l'ajouter à nouveau
    const url = baseURL.endsWith('/api')
      ? `${baseURL}/user/documents/${id}/preview`
      : `${baseURL}/api/user/documents/${id}/preview`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token || ''}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Erreur lors de la prévisualisation');
    }
    
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
  
  // Obtenir l'URL directe de prévisualisation (pour iframe)
  getPreviewUrl: (id: string): string => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || sessionStorage.getItem('token') : null;
    let baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
    // Si baseURL contient déjà /api, ne pas l'ajouter à nouveau
    return baseURL.endsWith('/api')
      ? `${baseURL}/user/documents/${id}/preview`
      : `${baseURL}/api/user/documents/${id}/preview`;
  },
  
  // Télécharger un document
  downloadDocument: (id: string) =>
    api.get(`/user/documents/${id}/download`, {
      responseType: 'blob',
    }),
  
  // Supprimer un document
  deleteDocument: (id: string) =>
    api.delete(`/user/documents/${id}`),
};

export const creneauxAPI = {
  // Récupérer les créneaux disponibles pour une date
  getAvailableSlots: (date: string) =>
    api.get('/creneaux/available', { params: { date } }),
  
  // Admin - Récupérer tous les créneaux
  getAllCreneaux: (params?: { date?: string; ferme?: boolean }) =>
    api.get('/creneaux', { params }),
  
  // Admin - Fermer des créneaux
  closeSlots: (data: { date: string; heures: string[]; motifFermeture?: string }) =>
    api.post('/creneaux', data),
  
  // Admin - Rouvrir un créneau
  reopenSlot: (id: string) =>
    api.patch(`/creneaux/${id}/reopen`),
};

// CMS - Gestion des contenus texte
export const trashAPI = {
  // Récupérer tous les éléments de la corbeille
  getTrashItems: (params?: { itemType?: string; origin?: string; page?: number; limit?: number }) =>
    api.get('/trash', { params }),
  
  // Récupérer les statistiques de la corbeille
  getStats: () =>
    api.get('/trash/stats'),
  
  // Restaurer un élément
  restoreItem: (id: string) =>
    api.post(`/trash/restore/${id}`),
  
  // Supprimer définitivement un élément
  deletePermanently: (id: string) =>
    api.delete(`/trash/${id}`),
  
  // Vider la corbeille (admin seulement)
  emptyTrash: () =>
    api.post('/trash/empty'),
};

export const cmsAPI = {
  // Public/Front - récupérer une valeur par clé
  getText: async (key: string, locale: string = 'fr-FR'): Promise<string | null> => {
    try {
      const response = await api.get('/content/value', {
        params: { key, locale },
        // Accepter les 404 sans les traiter comme des erreurs (c'est normal si la clé n'existe pas)
        validateStatus: (status) => status < 500,
      });
      if (response.data?.success) {
        return response.data.value as string;
      }
      // Si 404, retourner null silencieusement
      if (response.status === 404) {
        return null;
      }
      return null;
    } catch (error: any) {
      // Si la clé n'existe pas (404) ou si c'est une erreur CMS silencieuse, on renvoie null
      // Ne pas logger ces erreurs car c'est un comportement attendu
      if (error?.response?.status === 404 || error?.isCmsNotFound) {
        return null;
      }
      // Ne logger que les erreurs non-404 (erreurs serveur, etc.)
      if (error?.response?.status !== 404 && !error?.isCmsNotFound && error?.response?.status >= 500) {
        console.error('❌ Erreur serveur lors de la récupération du texte CMS:', error);
      }
      return null;
    }
  },

  // Admin - lister les entrées CMS
  listEntries: (params?: {
    page?: string;
    section?: string;
    search?: string;
    locale?: string;
    limit?: number;
    skip?: number;
  }) => {
    return api.get('/content', { params });
  },

  // Admin - créer une entrée
  createEntry: (data: {
    key: string;
    value: string;
    locale?: string;
    page?: string;
    section?: string;
    description?: string;
  }) => {
    return api.post('/content', data);
  },

  // Admin - mettre à jour une entrée
  updateEntry: (
    id: string,
    data: {
      value: string;
      description?: string;
      page?: string;
      section?: string;
      isActive?: boolean;
    }
  ) => {
    return api.put(`/content/${id}`, data);
  },

  // Admin - désactiver/archiver une entrée
  deleteEntry: (id: string) => {
    return api.delete(`/content/${id}`);
  },
  
  // Admin - publier un contenu
  publishEntry: (id: string) => {
    return api.patch(`/content/${id}/publish`);
  },
  
  // Admin - dépublier un contenu
  unpublishEntry: (id: string) => {
    return api.patch(`/content/${id}/unpublish`);
  },
  
  // Admin - récupérer l'historique d'un contenu
  getEntryHistory: (id: string) => {
    return api.get(`/content/${id}/history`);
  },
};

export const smsTemplatesAPI = {
  // Récupérer tous les templates
  getTemplates: (params?: { category?: string; isActive?: boolean; search?: string }) => {
    return api.get('/sms-templates', { params });
  },
  
  // Récupérer un template par ID
  getTemplate: (id: string) => {
    return api.get(`/sms-templates/${id}`);
  },
  
  // Créer un template
  createTemplate: (data: {
    code: string;
    name: string;
    description?: string;
    message: string;
    variables?: Array<{ name: string; description?: string; example?: string }>;
    category?: string;
    isActive?: boolean;
  }) => {
    return api.post('/sms-templates', data);
  },
  
  // Mettre à jour un template
  updateTemplate: (id: string, data: {
    code?: string;
    name?: string;
    description?: string;
    message?: string;
    variables?: Array<{ name: string; description?: string; example?: string }>;
    category?: string;
    isActive?: boolean;
  }) => {
    return api.put(`/sms-templates/${id}`, data);
  },
  
  // Supprimer un template
  deleteTemplate: (id: string) => {
    return api.delete(`/sms-templates/${id}`);
  },
  
  // Tester un template (prévisualisation uniquement)
  testTemplate: (id: string, variables: Record<string, any>) => {
    return api.post(`/sms-templates/${id}/test`, { variables });
  },
  
  // Envoyer un SMS de test réel
  sendTestSMS: (id: string, phone: string, variables: Record<string, any>) => {
    return api.post(`/sms-templates/${id}/send-test`, { phone, variables });
  },
  
  // Initialiser les templates par défaut
  initDefaults: () => {
    return api.post('/sms-templates/init-defaults');
  },
};

export const documentRequestsAPI = {
  // Créer une demande de document (admin)
  createRequest: (data: {
    dossierId: string;
    documentType: string;
    documentTypeLabel: string;
    message?: string;
    isUrgent?: boolean;
  }) => {
    return api.post('/document-requests', data);
  },

  // Récupérer les demandes de documents
  getRequests: (params?: {
    dossierId?: string;
    status?: 'pending' | 'sent' | 'received';
    userId?: string;
  }) => {
    return api.get('/document-requests', { params });
  },

  // Récupérer une demande par ID
  getRequest: (id: string) => {
    return api.get(`/document-requests/${id}`);
  },

  // Téléverser un document en réponse à une demande
  uploadDocument: (requestId: string, documentId: string) => {
    return api.post(`/document-requests/${requestId}/upload`, { documentId });
  },

  // Mettre à jour le statut d'une demande (admin)
  updateStatus: (id: string, status: 'pending' | 'sent' | 'received') => {
    return api.patch(`/document-requests/${id}/status`, { status });
  },
};

export const smsHistoryAPI = {
  // Récupérer l'historique des SMS
  getHistory: (params?: {
    to?: string;
    status?: string;
    context?: string;
    templateCode?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    return api.get('/sms-history', { params });
  },
  
  // Récupérer les statistiques
  getStats: (params?: { startDate?: string; endDate?: string }) => {
    return api.get('/sms-history/stats', { params });
  },
  
  // Récupérer un SMS par ID
  getSms: (id: string) => {
    return api.get(`/sms-history/${id}`);
  },
};

export const smsPreferencesAPI = {
  // Mettre à jour les préférences SMS
  updatePreferences: (data: {
    enabled?: boolean;
    types?: Record<string, boolean>;
  }) => {
    return api.put('/user/sms-preferences', data);
  },
};



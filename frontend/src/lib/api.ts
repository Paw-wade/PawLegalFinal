import axios from 'axios';
import { getPublicApiBaseUrl } from './publicApiUrl';

const IS_DEV = process.env.NODE_ENV === 'development';
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedToken: string | null = null;
let cachedTokenAt = 0;
let pendingTokenPromise: Promise<string | null> | null = null;

/** Évite plusieurs redirections si plusieurs requêtes reçoivent 401 en parallèle. */
let authSessionExpiredRedirectScheduled = false;

/**
 * Supprime le JWT stocké et invalide le cache mémoire (sans toucher au reste du localStorage).
 * Utile après 401 « session » ou depuis une déconnexion explicite.
 */
export function clearStoredAuthToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem('token');
    window.sessionStorage.removeItem('token');
  } catch {
    /* ignore */
  }
  cachedToken = null;
  cachedTokenAt = 0;
  pendingTokenPromise = null;
}

function requestHadBearerToken(cfg: { headers?: unknown } | undefined): boolean {
  const h = cfg?.headers as Record<string, unknown> & { get?: (n: string) => unknown };
  if (!h) return false;
  let auth: unknown;
  if (typeof h.get === 'function') {
    auth = h.get('Authorization') ?? h.get('authorization');
  }
  if (typeof auth !== 'string') {
    auth = h.Authorization ?? h.authorization;
  }
  return typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ');
}

function shouldSkip401SessionHandling(requestUrl: string): boolean {
  const u = String(requestUrl || '').toLowerCase();
  return (
    u.includes('/auth/login') ||
    u.includes('/auth/register') ||
    u.includes('/auth/google-login') ||
    u.includes('/auth/forgot-password') ||
    u.includes('/auth/reset-password') ||
    u.includes('/auth/setup-password') ||
    u.includes('/auth/complete-signup') ||
    u.includes('/auth/resend-activation')
  );
}

/** Messages backend typiques d’échec JWT / compte (hors « mauvais mot de passe » sur /auth/login). */
function isSessionInvalidMessage(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (!m) return false;
  if (m.includes('identifiants invalides')) return false;
  if (m.includes('token google')) return false;
  if (m.includes('email google')) return false;
  return (
    m.includes('token invalide') ||
    m.includes('token manquant') ||
    m.includes('utilisateur non trouvé') ||
    m.includes('session expirée') ||
    m.includes('compte désactivé')
  );
}

function scheduleSessionExpiredRedirect(apiMessage?: string): void {
  if (typeof window === 'undefined' || authSessionExpiredRedirectScheduled) return;
  authSessionExpiredRedirectScheduled = true;
  const hint =
    typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage.trim()
      : "Votre session a expiré ou n'est plus valide. Reconnectez-vous.";
  void (async () => {
    clearStoredAuthToken();
    try {
      const { signOut } = await import('next-auth/react');
      await signOut({ redirect: false });
    } catch {
      /* ignore */
    }
    try {
      const q = new URLSearchParams();
      q.set('error', 'session');
      q.set('message', hint);
      window.location.assign(`/auth/signin?${q.toString()}`);
    } catch {
      authSessionExpiredRedirectScheduled = false;
    }
  })();
}

/** URL API terminée par `/api` une seule fois (axios + fetch hors axios). */
export function getApiBaseUrl(): string {
  return getPublicApiBaseUrl();
}

// Même base que getApiBaseUrl : sinon api.get('/logs') tape .../logs au lieu de .../api/logs → 404 en prod
const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 secondes
});

// Retry léger sur erreurs réseau temporaires (mobile/4G, réveil backend, micro-coupures)
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;

const FORUM_VISITOR_ID_KEY = 'forumVisitorId';

const getForumVisitorId = (): string | null => {
  if (typeof window === 'undefined') return null;
  let visitorId = window.localStorage.getItem(FORUM_VISITOR_ID_KEY);
  if (!visitorId) {
    visitorId = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(FORUM_VISITOR_ID_KEY, visitorId);
  }
  return visitorId;
};

const getForumHeaders = () => {
  const visitorId = getForumVisitorId();
  return visitorId ? { 'x-forum-visitor-id': visitorId } : {};
};

// Fonction utilitaire pour récupérer le token (NextAuth + localStorage + session)
export const getAuthToken = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;
  const now = Date.now();

  if (cachedToken && now - cachedTokenAt < TOKEN_CACHE_TTL_MS) {
    return cachedToken;
  }
  if (pendingTokenPromise) {
    return pendingTokenPromise;
  }

  pendingTokenPromise = (async () => {
    const resolvedAt = Date.now();

    // 1. Essayer localStorage
    let token = localStorage.getItem('token');
    if (token) {
      cachedToken = token;
      cachedTokenAt = resolvedAt;
      return token;
    }

    // 2. Essayer sessionStorage
    token = sessionStorage.getItem('token');
    if (token) {
      localStorage.setItem('token', token); // Migrer vers localStorage
      cachedToken = token;
      cachedTokenAt = resolvedAt;
      return token;
    }

    // 3. Essayer de récupérer depuis NextAuth (seulement côté client)
    try {
      const { getSession } = await import('next-auth/react');
      const session = await getSession();
      if (session && (session.user as any)?.accessToken) {
        token = (session.user as any).accessToken;
        if (token) {
          localStorage.setItem('token', token);
          cachedToken = token;
          cachedTokenAt = Date.now();
          if (IS_DEV) console.log('🔑 Token récupéré de NextAuth et stocké dans localStorage');
          return token;
        }
      }
    } catch (error) {
      // Ne pas afficher d'avertissement pour les erreurs NextAuth normales
      if (IS_DEV && error && typeof error === 'object' && 'message' in error && !error.message?.includes('NEXT_REDIRECT')) {
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
            cachedToken = token;
            cachedTokenAt = Date.now();
            if (IS_DEV) console.log('🔑 Token récupéré depuis /api/auth/session');
            return token;
          }
        }
      }
    } catch (error) {
      // Ne pas afficher d'avertissement pour les erreurs de fetch normales
      if (IS_DEV && error && typeof error === 'object' && 'message' in error) {
        console.warn('⚠️ Impossible de récupérer le token depuis /api/auth/session:', error);
      }
    }

    // Absence de token normale sur pages publiques : on évite le bruit console.
    cachedToken = null;
    cachedTokenAt = Date.now();
    return null;
  })();

  try {
    return await pendingTokenPromise;
  } finally {
    pendingTokenPromise = null;
  }
};

/** @deprecated alias */
const getToken = getAuthToken;

// Intercepteur pour ajouter le token d'authentification
api.interceptors.request.use(
  async (config) => {
    // Si la requête contient un FormData, supprimer le Content-Type pour que le navigateur le définisse avec le boundary
    if (config.data instanceof FormData) {
      const headers = config.headers as Record<string, unknown> & {
        set?: (name: string, value: unknown) => void;
        delete?: (name: string) => void;
      };
      if (headers && typeof headers.set === 'function') {
        headers.set('Content-Type', false);
      } else if (headers) {
        delete headers['Content-Type'];
        delete headers['content-type'];
      }
      if (IS_DEV) {
        console.log('📤 FormData détecté, Content-Type supprimé pour laisser le navigateur le définir');
      }
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
          url.includes('/dossier-document-drafts') ||
          url.includes('/collaborative-drafts') ||
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
    return response;
  },
  async (error) => {
    const cfg: any = error.config || {};
    const status = error.response?.status;
    const retried = Number(cfg.__retryCount || 0);
    const isNetworkError =
      error.code === 'ECONNABORTED' ||
      error.code === 'ECONNREFUSED' ||
      error.message?.includes('Network Error') ||
      error.message?.includes('ERR_CONNECTION_REFUSED') ||
      !error.response;
    const canRetry = (isNetworkError || (status && RETRYABLE_STATUS.has(status))) && retried < MAX_RETRIES;
    const isAuthRoute = String(cfg.url || '').includes('/auth/');

    if (canRetry && !isAuthRoute) {
      cfg.__retryCount = retried + 1;
      const delay = 300 * Math.pow(2, retried); // 300ms, 600ms
      await new Promise((resolve) => setTimeout(resolve, delay));
      return api(cfg);
    }

    const url = error.config?.url || '';

    // Ignorer silencieusement les 404 pour les clés CMS manquantes (comportement attendu)
    // Cette vérification doit être faite AVANT tous les logs d'erreur
    const isCmsKeyNotFound = error.response?.status === 404 && 
                             url.includes('/content/value');

    // Ne pas spammer la console si la route /forum/unread-count n'existe pas encore
    const isForumUnreadCountNotFound = error.response?.status === 404 &&
                                       url.includes('/forum/unread-count');
    
    if (isCmsKeyNotFound || isForumUnreadCountNotFound) {
      // Ne pas logger cette erreur - c'est un comportement attendu quand une clé CMS n'existe pas encore
      // Retourner une réponse avec status 404 mais sans déclencher d'erreur
      // Cela permettra à getText de gérer le cas normalement sans polluer la console
      return Promise.reject({
        response: {
          status: 404,
          data: { success: false, message: isCmsKeyNotFound ? 'Clé non trouvée' : 'Route forum/unread-count non disponible' }
        },
        isCmsNotFound: isCmsKeyNotFound,
        isForumUnreadCountNotFound,
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
    
    const isExpectedUserProfileFallback =
      typeof url === 'string' &&
      /(?:^|\/)(?:api\/)?user\/[a-f\d]{24}$/i.test(url) &&
      (error.response?.status === 400 || error.response?.status === 401 || error.response?.status === 403);

    const isExpectedPushAbort =
      typeof error?.name === 'string' && error.name === 'AbortError';

    // Log des erreurs pour le débogage (sauf erreurs connues non critiques)
    if (!isCmsKeyNotFound && !isForumUnreadCountNotFound && !isExpectedUserProfileFallback && !isExpectedPushAbort) {
      console.error('❌ Erreur API:', {
        url,
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
        data: error.response?.data
      });
    }
    
    // Gérer les erreurs 401 : session JWT expirée / invalide → nettoyer et renvoyer à la connexion
    if (error.response?.status === 401) {
      const reqUrl = String(error.config?.url || '');
      if (!shouldSkip401SessionHandling(reqUrl)) {
        const hadBearer = requestHadBearerToken(error.config);
        const apiMsg =
          typeof error.response?.data?.message === 'string' ? error.response.data.message : '';
        if (hadBearer || isSessionInvalidMessage(apiMsg)) {
          if (IS_DEV) {
            console.warn('⚠️ Session expirée ou non autorisée, redirection connexion:', reqUrl);
          }
          scheduleSessionExpiredRedirect(apiMsg);
        } else if (IS_DEV) {
          console.warn('⚠️ 401 sans action session (route ou message exclu):', reqUrl, apiMsg);
        }
      } else if (IS_DEV) {
        console.warn('⚠️ 401 sur route auth (pas de redirection session):', reqUrl);
      }
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
  register: (data: { firstName: string; lastName: string; email: string; phone: string }) =>
    api.post('/auth/register', data),

  resendActivation: (data: { email: string }) => api.post('/auth/resend-activation', data),

  completeSignup: (data: { token: string; password: string }) =>
    api.post('/auth/complete-signup', data),
  
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  
  loginPhone: (data: { phone: string }) =>
    api.post('/auth/login-phone', data),
  
  setupPassword: (data: { password: string; email?: string }) =>
    api.post('/auth/setup-password', data),
  
  // Mot de passe oublié par email (par défaut)
  forgotPassword: (data: { email: string }) =>
    api.post('/auth/forgot-password', data),

  // Mot de passe oublié via téléphone + code SMS (méthode alternative)
  forgotPasswordByPhone: (data: { phone: string }) =>
    api.post('/auth/forgot-password-phone', data),

  resetPasswordByPhone: (data: { phone: string; code: string; password: string }) =>
    api.post('/auth/reset-password-phone', data),

  resetPassword: (data: { token: string; password: string }) =>
    api.post('/auth/reset-password', data),
  
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
    // FormData : l’intercepteur supprime Content-Type pour que le boundary soit correct
    return api.put('/user/profile', data);
  },
  
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/user/password', data),

  // Désactiver son propre compte (soft delete)
  deactivateMyAccount: () =>
    api.post('/user/profile/deactivate'),
  
  // Admin - Récupérer tous les utilisateurs
  getAllUsers: () =>
    api.get('/user/all'),

  // Admin - Registre des expirations (clients)
  getClientExpirationsRegister: (params: { pastDays: number; futureDays: number }) =>
    api.get('/user/expirations', { params }),
  
  // Admin - Récupérer un utilisateur par ID
  // Fallback robuste: en contexte non-admin, retourner le profil connecté plutôt qu'un 400/403 bruyant.
  getUserById: async (id: string) => {
    const normalizedId = String(id || '').trim();
    if (!/^[a-f\d]{24}$/i.test(normalizedId)) {
      throw new Error('ID utilisateur invalide');
    }
    try {
      return await api.get(`/user/${normalizedId}`);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 400 || status === 401 || status === 403) {
        return api.get('/user/profile');
      }
      throw error;
    }
  },
  
  // Admin - Mettre à jour un utilisateur par ID
  updateUser: (id: string, data: any) =>
    api.put(`/user/${id}`, data),

  // Admin - Modifier le mot de passe d'un utilisateur
  updateUserPassword: (id: string, data: { newPassword: string }) =>
    api.put(`/user/${id}/password`, data),
  
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
    role?: 'client' | 'admin' | 'superadmin' | 'partenaire' | 'avocat' | 'consulat' | 'collaborateur' | 'assistant' | 'comptable' | 'secretaire' | 'juriste' | 'stagiaire' | 'visiteur';
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

  // SuperAdmin - Récupérer les statistiques des logs
  getStats: (params?: { startDate?: string; endDate?: string }) => {
    return api.get('/logs/stats', { params });
  },
  
  // SuperAdmin - Télécharger le DLOG en PDF pour une date donnée
  downloadDlogPDF: async (date: string): Promise<void> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || sessionStorage.getItem('token') : null;
    
    const baseURL = getApiBaseUrl();
    const url = `${baseURL}/logs/dlog/pdf?date=${encodeURIComponent(date)}`;
    
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

/** Texte intégral d’un fichier du corpus Lexia (POST /api/lexia/knowledge-file, JWT requis). */
export const lexiaAPI = {
  readKnowledgeFile: (file: string) =>
    api.post<{
      success: boolean;
      file?: string;
      content?: string;
      truncated?: boolean;
      empty?: boolean;
      ext?: string;
      /** Libellé de référence aligné sur le document (prioritaire sur le titre affiché). */
      referenceLabel?: string;
      error?: string;
    }>('/lexia/knowledge-file', { file }, { timeout: 120000 }),

  /** Crée un lien de lecture publique (POST /api/lexia/public-share, JWT requis). */
  createPublicShare: (body: {
    title: string;
    scope: 'full' | 'since_last_user' | 'this_exchange';
    messages: Array<{ role: 'user' | 'assistant'; content: string; isError?: boolean }>;
  }) =>
    api.post<{ success: boolean; token?: string; error?: string }>('/lexia/public-share', body, { timeout: 60000 }),

  /** Historique Paw AI du compte (GET /api/lexia/chat-state). */
  getChatState: () =>
    api.get<{ success: boolean; threads?: unknown[]; error?: string }>('/lexia/chat-state', {
      timeout: 60000,
    }),

  /** Enregistre l’historique Paw AI (PUT /api/lexia/chat-state). */
  putChatState: (body: { threads: unknown[] }) =>
    api.put<{ success: boolean; saved?: number; error?: string }>('/lexia/chat-state', body, {
      timeout: 120000,
    }),

  listThreadAttachments: (threadId: string) =>
    api.get<{
      success: boolean;
      attachments?: Array<{
        id: string;
        threadId: string;
        originalName: string;
        mimeType?: string;
        size: number;
        empty?: boolean;
        extractionNote?: string;
        preview?: string;
        transcript?: string;
        createdAt?: string;
      }>;
      error?: string;
    }>('/lexia/thread-attachments', { params: { threadId }, timeout: 60000 }),

  uploadThreadAttachment: async (threadId: string, file: File) => {
    const formData = new FormData();
    formData.append('threadId', threadId);
    formData.append('file', file, file.name || 'piece-jointe.bin');

    const token = typeof window !== 'undefined' ? await getAuthToken() : null;
    const controller = new AbortController();
    const timeoutMs = 180000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    type UploadResponse = {
      success: boolean;
      attachment?: {
        id: string;
        threadId: string;
        originalName: string;
        mimeType?: string;
        size: number;
        empty?: boolean;
        extractionNote?: string;
        preview?: string;
        transcript?: string;
      };
      error?: string;
      message?: string;
      code?: string;
    };

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/lexia/thread-attachments?threadId=${encodeURIComponent(threadId)}`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData,
          signal: controller.signal,
          credentials: 'omit',
        }
      );

      const data = (await response.json().catch(() => null)) as UploadResponse | null;
      if (!response.ok || !data || data.success === false) {
        const message = data?.error || data?.message || `Erreur import (${response.status})`;
        const err = new Error(message) as Error & { response?: { status: number; data?: UploadResponse | null } };
        err.response = { status: response.status, data };
        throw err;
      }

      return { data };
    } finally {
      clearTimeout(timer);
    }
  },

  deleteThreadAttachment: (attachmentId: string) =>
    api.delete<{ success: boolean; id?: string; error?: string }>(
      `/lexia/thread-attachments/${encodeURIComponent(attachmentId)}`,
      { timeout: 60000 }
    ),
};

export const pawSearchAPI = {
  search: (data: {
    query?: string;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    page?: number;
    limit?: number;
    filters?: {
      juridiction?: string;
      contentType?: string;
      dateFrom?: string;
      dateTo?: string;
    };
  }) => api.post('/paw-search', data, { timeout: 120000 }),
  getConfig: () => api.get('/paw-search/config'),
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
    /** Admin / superadmin : associer le RDV à ce client */
    forUserId?: string;
    /** Admin / superadmin : rattacher au dossier et remplir côté serveur les contrôles de cohérence */
    dossierId?: string;
    /** Admin connecté uniquement : e-mails / synthèses côté client */
    informClient?: boolean;
    /** Admin connecté uniquement : notifications in-app + e-mails équipe admin */
    informTeam?: boolean;
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

  /** Client : accepter ou refuser une proposition faite par l’admin */
  respondToProposedAppointment: (
    id: string,
    body: { decision: 'accept' | 'decline'; motifRefus?: string }
  ) => api.patch(`/appointments/${id}/reponse-client`, body),
  
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
  getAllAppointments: (params?: {
    statut?: string;
    date?: string;
    userId?: string;
    includeArchived?: string;
    dateFrom?: string;
    dateTo?: string;
    q?: string;
  }) => {
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
  
  // Récupérer les tâches d'un dossier spécifique
  getDossierTasks: (dossierId: string, params?: { statut?: string; priorite?: string }) => {
    return api.get(`/tasks/dossier/${dossierId}`, { params });
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
  
  // Récupérer le récit récapitulatif d'un dossier
  getDossierRecap: (dossierId: string) => {
    return api.get(`/user/dossiers/${dossierId}/recap`);
  },
  
  // Télécharger le récit récapitulatif en PDF
  downloadDossierRecapPDF: (dossierId: string) => {
    return api.get(`/user/dossiers/${dossierId}/recap/pdf`, {
      responseType: 'blob'
    });
  },

  // Compléments au récit (visibles dans le récap et le PDF)
  addRecapComplement: (dossierId: string, body: { text: string; title?: string }) =>
    api.post(`/user/dossiers/${dossierId}/recap/complements`, body),
  updateRecapComplement: (dossierId: string, complementId: string, body: { text: string; title?: string }) =>
    api.patch(`/user/dossiers/${dossierId}/recap/complements/${complementId}`, body),
  deleteRecapComplement: (dossierId: string, complementId: string) =>
    api.delete(`/user/dossiers/${dossierId}/recap/complements/${complementId}`),
  
  // Client — choix de la formule tarifaire (Premium / Standard)
  setDossierFormuleTarifaire: (dossierId: string, formule: 'standard' | 'premium') =>
    api.patch(`/user/dossiers/${dossierId}/formule-tarifaire`, { formule }),

  // Client - Annuler un dossier
  cancelDossier: (id: string) =>
    api.patch(`/user/dossiers/${id}/cancel`),
  
  // Mettre à jour un dossier
  updateDossier: (id: string, data: any) =>
    api.put(`/user/dossiers/${id}`, data),

  // Admin / superadmin — notifier tarification à la demande (PUT dossier)
  notifyTarification: (id: string) =>
    api.put(`/user/dossiers/${id}`, { notifyTarificationClient: true }),

  /** Admin / superadmin : relance paiement tarification (notification in-app + email) */
  sendTarificationPaymentReminder: (dossierId: string) =>
    api.post(`/user/dossiers/${dossierId}/tarification-payment-reminder`),

  /** Admin / superadmin : marquer une prestation de tarification comme réglée */
  markTarificationPrestationPaid: (dossierId: string, prestationId: string) =>
    api.post(`/user/dossiers/${dossierId}/tarification-prestations/${prestationId}/mark-paid`),
  markTarificationEcheancePaid: (dossierId: string, echeanceId: string) =>
    api.post(`/user/dossiers/${dossierId}/tarification-echeances/${echeanceId}/mark-paid`),

  /** Admin / superadmin : retirer la dernière demande tarification envoyée (sans formule enregistrée, sans montant fixe) */
  retractTarificationChoiceRequest: (dossierId: string) =>
    api.put(`/user/dossiers/${dossierId}`, { retractTarificationChoiceRequest: true }),

  /** Admin / superadmin : notifier un utilisateur même sans dossier (in-app/push + email + SMS +33) */
  notifyTarificationUserStandalone: (payload: { userId: string; motif: string; amount?: number | null }) =>
    api.post('/user/dossiers/tarification-notify-user', payload),

  /** Client : accepter/refuser une demande de tarification sans dossier */
  respondStandaloneTarificationRequest: (
    requestId: string,
    decision: 'accepted' | 'refused'
  ) => api.post(`/user/dossiers/tarification-standalone/${requestId}/respond`, { decision }),

  /** Admin / superadmin : lister les demandes de tarification sans dossier */
  getStandaloneTarificationRequests: (params?: { limit?: number }) =>
    api.get('/user/dossiers/tarification-standalone', { params }),

  /** Admin / superadmin : relancer une demande sans dossier (cooldown 48h) */
  remindStandaloneTarificationRequest: (requestId: string) =>
    api.post(`/user/dossiers/tarification-standalone/${requestId}/remind`),

  /** Admin / superadmin : annuler une demande sans dossier en attente */
  cancelStandaloneTarificationRequest: (requestId: string) =>
    api.post(`/user/dossiers/tarification-standalone/${requestId}/cancel`),
  
  // Supprimer un dossier (Admin)
  deleteDossier: (id: string) =>
    api.delete(`/user/dossiers/${id}`),
  
  // Transmettre un dossier à un partenaire (Admin/Superadmin)
  transmitDossier: (
    id: string,
    data: { partenaireId: string; notes?: string; notifyClient?: boolean }
  ) => api.post(`/user/dossiers/${id}/transmit`, data),
  
  // Retirer la transmission d'un dossier (Admin/Secrétaire)
  removeTransmission: (id: string, userId: string) =>
    api.delete(`/user/dossiers/${id}/transmit/${userId}`),
  
  // Accuser réception d'un dossier transmis avec acceptation/refus (Consulat/Avocat/Association)
  acknowledgeDossier: (id: string, action: 'accept' | 'refuse', notes?: string) =>
    api.post(`/user/dossiers/${id}/acknowledge`, { action, notes }),
  
  // Partenaire - Se décharger d'un dossier transmis
  dischargeDossier: (id: string, notes?: string) =>
    api.post(`/user/dossiers/${id}/discharge`, { notes }),
};

export const notificationsAPI = {
  // Récupérer toutes les notifications
  getNotifications: (params?: { lu?: boolean; limit?: number; type?: string }) =>
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

  // Supprimer toutes les notifications de l'utilisateur connecté
  deleteAllNotifications: () =>
    api.delete('/notifications'),
};

export const pushAPI = {
  getPublicKey: () => api.get('/push/public-key'),
  subscribe: (subscription: PushSubscriptionJSON) =>
    api.post('/push/subscribe', { subscription }),
  unsubscribe: (endpoint: string) => api.post('/push/unsubscribe', { endpoint }),
  sendTest: () => api.post('/push/test'),
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
  
  // Prévisualiser un document (blob URL — à révoquer avec URL.revokeObjectURL quand terminé)
  previewDocument: async (id: string): Promise<string> => {
    const token = typeof window !== 'undefined' ? await getAuthToken() : null;
    const url = `${getApiBaseUrl()}/user/documents/${encodeURIComponent(id)}/preview`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token || ''}`,
      },
      credentials: 'omit',
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 401) {
        throw new Error('Session expirée ou token invalide. Reconnectez-vous.');
      }
      if (response.status === 403) {
        throw new Error('Accès non autorisé à ce document.');
      }
      if (response.status === 404) {
        throw new Error('Document ou fichier introuvable sur le serveur.');
      }
      throw new Error(`Erreur prévisualisation (${response.status})${errText ? `: ${errText.slice(0, 120)}` : ''}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  /** URL d’API preview (sans token) — préférer previewDocument + blob pour l’affichage */
  getPreviewUrl: (id: string): string => {
    return `${getApiBaseUrl()}/user/documents/${encodeURIComponent(id)}/preview`;
  },
  
  // Télécharger un document
  downloadDocument: (id: string) =>
    api.get(`/user/documents/${id}/download`, {
      responseType: 'blob',
    }),
  
  // Supprimer un document
  deleteDocument: (id: string) =>
    api.delete(`/user/documents/${id}`),

  /** Admin — autoriser ou masquer un document pour le client */
  updateDocumentVisibility: (
    id: string,
    data: { visibleToClient?: boolean; confidentialReason?: string }
  ) => api.patch(`/user/documents/${id}/visibility`, data),
};

export const dossierGuestUploadAPI = {
  createInvite: (data: { dossierId: string; recipientEmail: string; message?: string }) =>
    api.post<{
      success: boolean;
      token?: string;
      url?: string;
      expiresAt?: string;
      message?: string;
    }>('/dossier-guest-upload/invites', data),
};

export const documentDownloadShareAPI = {
  createShare: (data: {
    resourceType: 'document' | 'recours_template';
    resourceId: string;
    recipientEmail?: string;
    message?: string;
  }) =>
    api.post<{
      success: boolean;
      token?: string;
      url?: string;
      expiresAt?: string;
      shareId?: string;
      message?: string;
    }>('/document-download-share/shares', data),
};

export const collaborativeDraftsAPI = {
  getGlobalCount: () => api.get('/collaborative-drafts/count'),
  getGlobalList: (params?: { q?: string }) => api.get('/collaborative-drafts', { params }),
  getDossierDrafts: (dossierId: string) =>
    api.get(`/dossiers/${dossierId}/drafts`),
  createDraft: (dossierId: string, data: { title: string; content?: any; dueDate?: string | null }) =>
    api.post(`/dossiers/${dossierId}/drafts`, data),
  updateDraft: (
    draftId: string,
    data: { title?: string; content?: any; dueDate?: string | null; completed?: boolean | null }
  ) => api.patch(`/drafts/${draftId}`, data),
  updatePermissions: (
    draftId: string,
    data: {
      visibleToAdmins?: boolean;
      excludedAdminIds?: string[];
      partnerAccess?: { partner: string; canEdit: boolean }[];
      visibleToClient?: boolean;
      clientCanEdit?: boolean;
    }
  ) => api.patch(`/drafts/${draftId}/permissions`, data),
  archiveDraft: (draftId: string) =>
    api.delete(`/drafts/${draftId}`),
};

/** Brouillons rédactionnels liés à un dossier (admin / équipe), export .docx */
export const dossierDocumentDraftsAPI = {
  getCount: () => api.get('/dossier-document-drafts/count'),
  list: (params?: { q?: string }) => api.get('/dossier-document-drafts', { params }),
  getById: (id: string) => api.get(`/dossier-document-drafts/${id}`),
  create: (data: { dossierId: string; title: string; body?: string; dueDate?: string | null }) =>
    api.post('/dossier-document-drafts', data),
  update: (id: string, data: { title?: string; body?: string; dueDate?: string | null; completed?: boolean | null }) =>
    api.patch(`/dossier-document-drafts/${id}`, data),
  remove: (id: string) => api.delete(`/dossier-document-drafts/${id}`),
  downloadDocx: (id: string) =>
    api.get(`/dossier-document-drafts/${id}/docx`, { responseType: 'blob' }),
};

// Médias publics (carrousel, etc.)
export const mediaAPI = {
  // Upload d'un média pour le carrousel du hero (admin)
  uploadHeroMedia: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/media/hero', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

// Forum - discussions et réponses
export const forumAPI = {
  // Lister les discussions (optionnel : theme pour filtrer par thème)
  listThreads: (params?: { page?: number; limit?: number; theme?: string; statusFilter?: 'pinned' | 'resolved' | 'archived'; q?: string }) =>
    api.get('/forum/threads', { params, headers: getForumHeaders() }),

  // Récupérer une discussion et ses réponses
  getThread: (id: string) =>
    api.get(`/forum/threads/${id}`, { headers: getForumHeaders() }),

  // Créer une nouvelle discussion (theme requis : titre-sejour-etudiant, titre-sejour-salarie, regroupement-familial, demande-visa, autres)
  createThread: (data: { title: string; body: string; theme?: string; tags?: string[]; guestName?: string }) =>
    api.post('/forum/threads', data),

  // Répondre à une discussion
  replyToThread: (id: string, data: { body: string; guestName?: string; parentPostId?: string }) =>
    api.post(`/forum/threads/${id}/posts`, data),

  // Admin - mettre à jour une discussion (statut / épinglage)
  updateThreadAsAdmin: (id: string, data: { status?: 'open' | 'closed' | 'archived' | 'resolved'; isPinned?: boolean }) =>
    api.patch(`/forum/threads/${id}`, data),

  // Admin - supprimer une réponse
  deletePostAsAdmin: (postId: string) =>
    api.delete(`/forum/posts/${postId}`),

  // Admin - modifier le texte d'une réponse (sans notification)
  updatePostAsAdmin: (postId: string, data: { body: string }) =>
    api.patch(`/forum/posts/${postId}`, data),

  // Admin - modérer une réponse (approuver / désapprouver)
  verifyPostAsAdmin: (postId: string, data: { isVerified?: boolean; isRejected?: boolean }) =>
    api.patch(`/forum/posts/${postId}/verify`, data),

  // Aimer / retirer son like sur une réponse
  toggleLikePost: (postId: string) =>
    api.post(`/forum/posts/${postId}/like`, {}, { headers: getForumHeaders() }),

  // Aimer / retirer son like sur une discussion
  toggleLikeThread: (threadId: string) =>
    api.post(`/forum/threads/${threadId}/like`, {}, { headers: getForumHeaders() }),

  // Mettre en signet / retirer un signet sur une discussion
  toggleBookmarkThread: (threadId: string) =>
    api.post(`/forum/threads/${threadId}/bookmark`),

  // Récupérer les discussions mises en signet par l'utilisateur courant
  getBookmarks: () =>
    api.get('/forum/bookmarks'),

  // Marquer un fil comme lu (met à jour le badge dans la sidebar)
  markThreadRead: (id: string) =>
    api.post(`/forum/threads/${id}/mark-read`),

  // Nombre de discussions à jour (réponses non lues sur mes fils + signets)
  getUnreadThreadsCount: () =>
    api.get('/forum/unread-count'),
};

export const creneauxAPI = {
  // Récupérer les créneaux disponibles pour une date
  getAvailableSlots: (date: string) =>
    api.get('/creneaux/available', { params: { date } }),
  
  // Admin - Récupérer tous les créneaux
  getAllCreneaux: (params?: { date?: string; ferme?: boolean }) =>
    api.get('/creneaux', { params }),
  
  // Admin - Fermer des créneaux (date unique ou plusieurs dates)
  closeSlots: (data: { date?: string; dates?: string[]; heures: string[]; motifFermeture?: string }) =>
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
      status?: 'draft' | 'published' | 'archived';
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
    skipSms?: boolean;
    /** Nombre total de demandes créées dans le même envoi (1er appel uniquement) — adapte le SMS client */
    batchDocumentCount?: number;
  }) => {
    return api.post('/document-requests', data);
  },

  // Récupérer les demandes de documents
  getRequests: (params?: {
    dossierId?: string;
    status?: 'pending' | 'sent' | 'received' | 'cancelled';
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
  updateStatus: (id: string, status: 'pending' | 'sent' | 'received' | 'cancelled') => {
    return api.patch(`/document-requests/${id}/status`, { status });
  },

  // Annuler une demande (admin)
  cancelRequest: (id: string) => {
    return api.patch(`/document-requests/${id}/cancel`);
  },

  // Supprimer le document reçu lié à une demande (admin)
  removeReceivedDocument: (id: string) => {
    return api.patch(`/document-requests/${id}/remove-document`);
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

export const smsAPI = {
  // Envoi SMS manuel simple
  send: (data: { to: string; message: string }) => {
    return api.post('/sms/send', data);
  },

  // Envoi SMS via template/code de notification
  sendNotification: (data: { to: string; type: string; data?: Record<string, any> }) => {
    return api.post('/sms/notification', data);
  },

  // Envoi SMS manuel en masse
  sendBulk: (data: { recipients: Array<{ phone: string; name?: string }>; message: string }) => {
    return api.post('/sms/bulk', data);
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

export const emailConsoleAPI = {
  initDefaults: () => api.post('/email/init-defaults'),
  sendDirect: (data: { to: string; toName?: string; subject: string; htmlContent: string; textContent?: string }) =>
    api.post('/email/send', data),

  getTemplates: (params?: { category?: string; isActive?: boolean; search?: string }) =>
    api.get('/email/templates', { params }),
  createTemplate: (data: {
    code: string;
    name: string;
    description?: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
    variables?: Array<{ name: string; description?: string; example?: string }>;
    category?: string;
    isActive?: boolean;
  }) => api.post('/email/templates', data),
  updateTemplate: (id: string, data: any) => api.put(`/email/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/email/templates/${id}`),
  previewTemplate: (id: string, variables: Record<string, any>) =>
    api.post(`/email/templates/${id}/preview`, { variables }),
  sendTemplateTest: (id: string, to: string, toName: string, variables: Record<string, any>) =>
    api.post(`/email/templates/${id}/send-test`, { to, toName, variables }),

  getEvents: () => api.get('/email/events'),
  updateEvent: (id: string, data: any) => api.put(`/email/events/${id}`, data),

  getLogs: (params?: { to?: string; status?: string; eventKey?: string; templateCode?: string; page?: number; limit?: number }) =>
    api.get('/email/logs', { params }),
};



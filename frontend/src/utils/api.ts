import axios from 'axios';
import { getPublicApiBaseUrl } from '@/lib/publicApiUrl';

// URL de base de l'API backend
const API_BASE_URL = getPublicApiBaseUrl();

// Créer une instance axios avec la configuration par défaut
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 secondes
});

// Intercepteur pour ajouter le token d'authentification
api.interceptors.request.use(
  (config) => {
    // Récupérer le token depuis le localStorage
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
  (error) => {
    const cfg: { data?: unknown; url?: string } = error.config || {};
    const isBackendDown =
      error.code === 'ECONNREFUSED' ||
      error.message?.includes('ERR_CONNECTION_REFUSED') ||
      error.code === 'ERR_NETWORK';
    const isUploadTimeout =
      error.code === 'ECONNABORTED' &&
      (cfg.data instanceof FormData || String(cfg.url || '').includes('/user/documents'));

    if (isBackendDown) {
      console.warn('⚠️ Le serveur backend n\'est pas disponible. Vérifiez que le serveur est démarré sur le port 3005.');
      return Promise.reject({
        ...error,
        isConnectionError: true,
        message:
          'Le serveur backend n\'est pas disponible. Démarrez-le avec `npm run dev` dans le dossier backend (port 3005).',
      });
    }

    if (isUploadTimeout) {
      return Promise.reject({
        ...error,
        isTimeoutError: true,
        message:
          'Le téléversement a pris trop de temps. Réessayez ou vérifiez la taille du fichier (max 10 Mo).',
      });
    }
    
    // Gérer les erreurs 401 (non autorisé)
    if (error.response?.status === 401) {
      // Rediriger vers la page de connexion seulement si on est sur le client
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        // Ne pas rediriger automatiquement, laisser l'utilisateur choisir
        console.warn('⚠️ Session expirée ou token invalide');
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Fonctions utilitaires pour les appels API
export const authAPI = {
  register: (data: { firstName: string; lastName: string; email: string; phone: string }) =>
    api.post('/auth/register', data),
  
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  
  forgotPassword: (data: { email: string }) =>
    api.post('/auth/forgot-password', data),
  
  getMe: () =>
    api.get('/auth/me'),
};

export const userAPI = {
  getProfile: () =>
    api.get('/user/profile'),
  
  updateProfile: (data: any) =>
    api.put('/user/profile', data),
  
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/user/password', data),
};

export const contactAPI = {
  sendMessage: (data: { name: string; email: string; phone?: string; subject: string; message: string }) =>
    api.post('/contact', data),
};




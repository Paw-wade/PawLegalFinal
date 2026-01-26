// Configuration de l'application

export const config = {
  // URL de l'API backend
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api',
  
  // URL du frontend
  frontendUrl: process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000',
  
  // Timeout pour les requêtes API (en millisecondes)
  apiTimeout: 10000,
  
  // Configuration NextAuth
  nextAuthUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  nextAuthSecret: process.env.NEXTAUTH_SECRET || 'your-secret-key-change-this-in-production',
};

// Vérifier que les variables d'environnement sont définies
if (typeof window === 'undefined') {
  // Côté serveur
  if (!process.env.NEXT_PUBLIC_API_URL) {
    console.warn('⚠️  NEXT_PUBLIC_API_URL n\'est pas défini. Utilisation de la valeur par défaut: http://localhost:3005/api');
  }
} else {
  // Côté client
  console.log('🔗 API Backend:', config.apiUrl);
}




const jwt = require('jsonwebtoken');
const User = require('../models/User');
const isDev = process.env.NODE_ENV !== 'production';
const authUserCache = new Map();
const AUTH_USER_CACHE_TTL_MS = 30000;

function normalizeAuthUser(userDoc) {
  if (!userDoc) return null;
  const normalized = { ...userDoc };
  // Beaucoup de routes utilisent req.user.id ; avec lean() il peut manquer.
  if (!normalized.id && normalized._id) {
    normalized.id = String(normalized._id);
  }
  return normalized;
}

// Middleware pour protéger les routes
const protect = async (req, res, next) => {
  try {
    let token;

    // Vérifier si le token est dans les headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      if (isDev) console.log('🔑 Token reçu pour:', req.method, req.path); // Debug log
    } else {
      if (isDev) console.warn('⚠️ Aucun token dans les headers pour:', req.method, req.path); // Debug log
    }

    // ⚠️ Cas particulier pour les prévisualisations de documents (iframe, nouvel onglet, etc.)
    // On accepte aussi un token passé en query string (?token=...)
    if (!token && req.query && req.query.token) {
      token = req.query.token;
      if (isDev) console.log('🔑 Token récupéré depuis query parameter pour:', req.method, req.path);
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé, token manquant'
      });
    }

    try {
      // Vérifier le token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here');
      if (isDev) console.log('✅ Token valide pour l\'utilisateur ID:', decoded.id); // Debug log
      
      const cacheKey = String(decoded.id);
      const now = Date.now();
      const cachedUserEntry = authUserCache.get(cacheKey);

      if (cachedUserEntry && now - cachedUserEntry.cachedAt < AUTH_USER_CACHE_TTL_MS) {
        req.user = cachedUserEntry.user;
      } else {
        // Récupérer l'utilisateur (sans le mot de passe)
        const dbUser = await User.findById(decoded.id).select('-password').lean();
        req.user = normalizeAuthUser(dbUser);
        if (req.user) {
          authUserCache.set(cacheKey, { user: req.user, cachedAt: now });
        }
      }
      
      if (!req.user) {
        if (isDev) console.error('❌ Utilisateur non trouvé pour ID:', decoded.id); // Debug log
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      if (!req.user.isActive) {
        if (isDev) console.warn('⚠️ Compte désactivé pour:', req.user.email || `phone:${req.user.phone}`); // Debug log
        return res.status(401).json({
          success: false,
          message: 'Compte désactivé'
        });
      }

      if (isDev) console.log('✅ Utilisateur authentifié:', req.user.email || `phone:${req.user.phone}`, 'Rôle:', req.user.role); // Debug log
      next();
    } catch (error) {
      if (isDev) console.error('❌ Erreur de vérification du token:', error.message); // Debug log
      return res.status(401).json({
        success: false,
        message: 'Token invalide'
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification'
    });
  }
};

// Middleware pour vérifier le rôle
const authorize = (...roles) => {
  return (req, res, next) => {
    if (isDev) console.log('🔍 Middleware authorize - Route:', req.method, req.path); // Debug log
    if (isDev) console.log('🔍 User:', req.user ? `${req.user.email || `phone:${req.user.phone}`} (${req.user.role})` : 'non défini'); // Debug log
    if (isDev) console.log('🔍 Rôles autorisés:', roles); // Debug log
    
    if (!req.user) {
      if (isDev) console.error('❌ Authorize: Utilisateur non défini'); // Debug log
      return res.status(401).json({
        success: false,
        message: 'Non autorisé'
      });
    }

    if (!roles.includes(req.user.role)) {
      if (isDev) console.error('❌ Authorize: Rôle non autorisé', req.user.role, 'pour', roles); // Debug log
      return res.status(403).json({
        success: false,
        message: `Le rôle ${req.user.role} n'a pas accès à cette ressource`
      });
    }

    if (isDev) console.log('✅ Authorize: Accès autorisé'); // Debug log
    next();
  };
};

module.exports = { protect, authorize };



const jwt = require('jsonwebtoken');
const User = require('../models/User');
const isDev = process.env.NODE_ENV !== 'production';

const ACCESS_DENIED_MESSAGE =
  "Vous n'avez pas accès à cette ressource. Contactez l'administrateur pour plus d'informations.";
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
        message: ACCESS_DENIED_MESSAGE
      });
    }

    if (isDev) console.log('✅ Authorize: Accès autorisé'); // Debug log
    next();
  };
};

// Middleware de contrôle d'accès basé sur les permissions par domaine.
// action ∈ { 'consulter', 'modifier', 'supprimer' }.
// Le superadmin a toujours accès. Les autres rôles staff sont soumis à leur
// document Permission (à défaut, au preset de leur rôle).
const authorizePermission = (domaine, action = 'consulter') => {
  // Requis ici (et non en haut) pour éviter tout cycle de dépendances au chargement.
  const Permission = require('../models/Permission');
  const { getPresetForRole, isStaffRole } = require('../utils/rolePresets');

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Non autorisé' });
      }

      const role = req.user.role;

      // Superadmin : accès total
      if (role === 'superadmin') {
        return next();
      }

      // Seuls les rôles staff peuvent accéder à ces ressources d'administration
      if (!isStaffRole(role)) {
        return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
      }

      // Charger les permissions de l'utilisateur (fallback : preset du rôle)
      let permissionDoc = await Permission.findOne({ user: req.user.id }).lean();
      let permissionsList = permissionDoc?.permissions;
      if (!permissionsList || permissionsList.length === 0) {
        const preset = getPresetForRole(role);
        permissionsList = preset?.permissions || [];
      }

      const perm = permissionsList.find((p) => p.domaine === domaine);
      if (!perm) {
        return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
      }

      let allowed = false;
      if (action === 'modifier') {
        allowed = Boolean(perm.modifier) && !perm.nePasModifier;
      } else if (action === 'supprimer') {
        allowed = Boolean(perm.supprimer);
      } else {
        allowed = Boolean(perm.consulter) && !perm.nePasConsulter;
      }

      if (!allowed) {
        return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
      }

      return next();
    } catch (error) {
      if (isDev) console.error('❌ authorizePermission erreur:', error.message);
      return res.status(500).json({ success: false, message: 'Erreur serveur (permissions)' });
    }
  };
};

// Comme authorizePermission, mais accorde un accès "restreint" (scoped) aux
// membres du staff qui n'ont pas la permission de catégorie mais qui ont des
// dossiers assignés. Dans ce cas, on laisse passer la requête en positionnant
// req.accessMode = 'scoped' et req.assignedDossierIds ; le handler doit alors
// filtrer les résultats sur ces dossiers assignés.
// Sinon, req.accessMode = 'full'.
const authorizePermissionOrAssignment = (domaine, action = 'consulter') => {
  const { getAssignedDossierIds, userHasPermission, isStaffRole } = require('../utils/accessScope');

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Non autorisé' });
      }

      const role = req.user.role;

      if (role === 'superadmin') {
        req.accessMode = 'full';
        return next();
      }

      if (!isStaffRole(role)) {
        return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
      }

      // Permission de catégorie => accès complet
      if (await userHasPermission(req.user, domaine, action)) {
        req.accessMode = 'full';
        return next();
      }

      // Sinon : accès restreint aux dossiers assignés (le cas échéant)
      const assignedIds = await getAssignedDossierIds(req.user.id);
      if (assignedIds.length > 0) {
        req.accessMode = 'scoped';
        req.assignedDossierIds = assignedIds;
        return next();
      }

      return res.status(403).json({ success: false, message: ACCESS_DENIED_MESSAGE });
    } catch (error) {
      if (isDev) console.error('❌ authorizePermissionOrAssignment erreur:', error.message);
      return res.status(500).json({ success: false, message: 'Erreur serveur (permissions)' });
    }
  };
};

module.exports = {
  protect,
  authorize,
  authorizePermission,
  authorizePermissionOrAssignment,
  ACCESS_DENIED_MESSAGE,
};



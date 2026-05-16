const jwt = require('jsonwebtoken');
const { getModel } = require('../lib/tenant/asyncContext');
const { isMultiTenantEnabled } = require('../lib/db/master');
const { assertTokenMatchesTenant, getJwtSecret } = require('../lib/tenant/jwt');
const isDev = process.env.NODE_ENV !== 'production';
const authUserCache = new Map();
const AUTH_USER_CACHE_TTL_MS = 30000;

function normalizeAuthUser(userDoc) {
  if (!userDoc) return null;
  const normalized = { ...userDoc };
  if (!normalized.id && normalized._id) {
    normalized.id = String(normalized._id);
  }
  return normalized;
}

function authCacheKey(decoded, req) {
  const orgPart = req.tenant?.orgId || 'legacy';
  return `${orgPart}:${decoded.id}`;
}

const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      if (isDev) console.log('🔑 Token reçu pour:', req.method, req.path);
    } else if (isDev) {
      console.warn('⚠️ Aucun token dans les headers pour:', req.method, req.path);
    }

    if (!token && req.query && req.query.token) {
      token = req.query.token;
      if (isDev) console.log('🔑 Token récupéré depuis query parameter pour:', req.method, req.path);
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé, token manquant',
      });
    }

    try {
      const decoded = jwt.verify(token, getJwtSecret());
      if (isDev) console.log('✅ Token valide pour l\'utilisateur ID:', decoded.id);

      const tenantMismatch = assertTokenMatchesTenant(decoded, req);
      if (tenantMismatch) {
        return res.status(403).json({ success: false, message: tenantMismatch });
      }

      if (isMultiTenantEnabled() && req.tenant?.orgId && !decoded.orgId) {
        if (isDev) {
          console.warn('⚠️ JWT sans orgId sur route multi-tenant — reconnectez-vous pour renouveler le jeton.');
        }
      }

      const cacheKey = authCacheKey(decoded, req);
      const now = Date.now();
      const cachedUserEntry = authUserCache.get(cacheKey);

      if (cachedUserEntry && now - cachedUserEntry.cachedAt < AUTH_USER_CACHE_TTL_MS) {
        req.user = cachedUserEntry.user;
      } else {
        const User = getModel('User');
        const dbUser = await User.findById(decoded.id).select('-password').lean();
        req.user = normalizeAuthUser(dbUser);
        if (req.user) {
          authUserCache.set(cacheKey, { user: req.user, cachedAt: now });
        }
      }

      if (!req.user) {
        if (isDev) console.error('❌ Utilisateur non trouvé pour ID:', decoded.id);
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non trouvé',
        });
      }

      if (!req.user.isActive) {
        if (isDev) console.warn('⚠️ Compte désactivé pour:', req.user.email || `phone:${req.user.phone}`);
        return res.status(401).json({
          success: false,
          message: 'Compte désactivé',
        });
      }

      if (isDev) {
        console.log(
          '✅ Utilisateur authentifié:',
          req.user.email || `phone:${req.user.phone}`,
          'Rôle:',
          req.user.role,
          req.tenant?.slug ? `Cabinet: ${req.tenant.slug}` : ''
        );
      }
      next();
    } catch (error) {
      if (isDev) console.error('❌ Erreur de vérification du token:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Token invalide',
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification',
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (isDev) console.log('🔍 Middleware authorize - Route:', req.method, req.path);
    if (isDev) {
      console.log(
        '🔍 User:',
        req.user ? `${req.user.email || `phone:${req.user.phone}`} (${req.user.role})` : 'non défini'
      );
    }
    if (isDev) console.log('🔍 Rôles autorisés:', roles);

    if (!req.user) {
      if (isDev) console.error('❌ Authorize: Utilisateur non défini');
      return res.status(401).json({
        success: false,
        message: 'Non autorisé',
      });
    }

    if (!roles.includes(req.user.role)) {
      if (isDev) console.error('❌ Authorize: Rôle non autorisé', req.user.role, 'pour', roles);
      return res.status(403).json({
        success: false,
        message: `Le rôle ${req.user.role} n'a pas accès à cette ressource`,
      });
    }

    if (isDev) console.log('✅ Authorize: Accès autorisé');
    next();
  };
};

module.exports = { protect, authorize };

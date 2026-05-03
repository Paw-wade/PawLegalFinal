/**
 * Impersonation réservée aux administrateurs (admin / superadmin).
 * Headers : X-Impersonate-User-Id (utilisateur à incarner), X-Impersonate-Admin-Id (doit correspondre au JWT).
 */
const User = require('../models/User');

function normalizeId(u) {
  if (!u) return '';
  return String(u._id || u.id || u).trim();
}

const handleImpersonation = async (req, res, next) => {
  try {
    if (!req.user) {
      req.impersonateUserId = null;
      req.impersonateAdminId = null;
      req.impersonateTargetUser = null;
      return next();
    }

    const impersonateUserId = req.headers['x-impersonate-user-id'];
    const impersonateAdminId = req.headers['x-impersonate-admin-id'];

    req.impersonateUserId = null;
    req.impersonateAdminId = null;
    req.impersonateTargetUser = null;

    if (!impersonateUserId || !impersonateAdminId) {
      return next();
    }

    const jwtAdminId = normalizeId(req.user);
    if (!jwtAdminId || jwtAdminId !== String(impersonateAdminId).trim()) {
      return res.status(403).json({
        success: false,
        message: 'Impersonation non autorisée (identifiant administrateur)',
      });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Seuls les administrateurs peuvent utiliser l'impersonation",
      });
    }

    const target = await User.findById(impersonateUserId).select('-password').lean();
    if (!target) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur à incarner introuvable',
      });
    }

    const t = { ...target };
    if (!t.id && t._id) t.id = String(t._id);

    req.impersonateUserId = String(target._id);
    req.impersonateAdminId = jwtAdminId;
    req.impersonateTargetUser = t;

    return next();
  } catch (error) {
    console.error('Erreur middleware impersonation:', error);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de l'impersonation",
    });
  }
};

function getEffectiveUserId(req) {
  if (req.impersonateUserId) return String(req.impersonateUserId);
  if (req.user?.id) return String(req.user.id);
  if (req.user?._id) return String(req.user._id);
  return null;
}

function getEffectiveUser(req) {
  return req.impersonateTargetUser || req.user || null;
}

/** Rôle « vu » par les filtres (client en impersonation, sinon rôle JWT). */
function getEffectiveRole(req) {
  if (req.impersonateUserId && req.impersonateTargetUser) {
    return req.impersonateTargetUser.role || 'client';
  }
  return req.user?.role;
}

/** Bloque les écritures pendant l’aperçu admin (JWT reste admin mais on n’altère pas les données du client). */
function forbidImpersonationWrite(req, res, message) {
  if (!req.impersonateUserId) return false;
  res.status(403).json({
    success: false,
    message: message || "Action désactivée pendant l'aperçu client (impersonation).",
  });
  return true;
}

module.exports = {
  handleImpersonation,
  getEffectiveUserId,
  getEffectiveUser,
  getEffectiveRole,
  forbidImpersonationWrite,
};

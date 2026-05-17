/**
 * Accès console plateforme Ada Papers (CRUD organizations).
 * Requiert rôle superadmin + liste blanche PLATFORM_ADMIN_EMAILS si définie.
 */
function getPlatformAdminEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isPlatformAdminUser(user) {
  if (!user || user.role !== 'superadmin') {
    return false;
  }
  const whitelist = getPlatformAdminEmails();
  if (whitelist.length === 0) {
    return true;
  }
  return whitelist.includes(String(user.email || '').toLowerCase());
}

function requirePlatformAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Non autorisé' });
  }
  if (!isPlatformAdminUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux administrateurs plateforme Ada Papers',
    });
  }
  next();
}

module.exports = {
  getPlatformAdminEmails,
  isPlatformAdminUser,
  requirePlatformAdmin,
};

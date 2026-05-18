/**
 * Accès console plateforme Ada Papers (CRUD organizations).
 * Uniquement : rôle superadmin + email équipe Ada Papers (@adapapers.fr ou PLATFORM_ADMIN_EMAILS).
 * Les superadmins d’un cabinet client n’y ont pas accès.
 */
function getPlatformAdminEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getPlatformAdminEmailDomain() {
  return (process.env.PLATFORM_ADMIN_EMAIL_DOMAIN || 'adapapers.fr')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}

function isAdaPapersSuperadminEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;

  if (getPlatformAdminEmails().includes(normalized)) {
    return true;
  }

  const domain = getPlatformAdminEmailDomain();
  if (domain && normalized.endsWith(`@${domain}`)) {
    return true;
  }

  return false;
}

function isPlatformAdminUser(user) {
  if (!user || user.role !== 'superadmin') {
    return false;
  }
  return isAdaPapersSuperadminEmail(user.email);
}

function requirePlatformAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Non autorisé' });
  }
  if (!isPlatformAdminUser(req.user)) {
    return res.status(403).json({
      success: false,
      message:
        'Accès réservé aux superadmins Ada Papers (équipe plateforme). Les superadmins cabinet client ne sont pas autorisés.',
    });
  }
  next();
}

module.exports = {
  getPlatformAdminEmails,
  getPlatformAdminEmailDomain,
  isAdaPapersSuperadminEmail,
  isPlatformAdminUser,
  requirePlatformAdmin,
};

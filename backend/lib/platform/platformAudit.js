const { getPlatformAuditLogModel } = require('../../models/PlatformAuditLog');

/**
 * @param {{ action: string, orgSlug?: string, orgId?: string, actorEmail: string, actorId?: string, details?: object }} entry
 */
async function logPlatformAudit(entry) {
  try {
    const PlatformAuditLog = getPlatformAuditLogModel();
    await PlatformAuditLog.create({
      action: entry.action,
      orgSlug: entry.orgSlug || undefined,
      orgId: entry.orgId || undefined,
      actorEmail: entry.actorEmail,
      actorId: entry.actorId || undefined,
      details: entry.details || {},
    });
  } catch (err) {
    console.warn('[platformAudit] log failed:', err.message);
  }
}

function auditActor(req) {
  return {
    email: String(req.user?.email || 'unknown').toLowerCase(),
    id: req.user?._id ? String(req.user._id) : req.user?.id ? String(req.user.id) : undefined,
  };
}

module.exports = { logPlatformAudit, auditActor };

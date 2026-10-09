const mongoose = require('mongoose');

const platformAuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    orgSlug: { type: String, index: true },
    orgId: { type: String },
    actorEmail: { type: String, required: true, index: true },
    actorId: { type: String },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

platformAuditLogSchema.index({ createdAt: -1 });

function getPlatformAuditLogModel() {
  const { getMasterConnection } = require('../lib/db/master');
  const conn = getMasterConnection();
  if (!conn.models.PlatformAuditLog) {
    conn.model('PlatformAuditLog', platformAuditLogSchema);
  }
  return conn.models.PlatformAuditLog;
}

module.exports = {
  platformAuditLogSchema,
  getPlatformAuditLogModel,
};

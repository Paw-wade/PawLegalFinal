const express = require('express');
const { isMultiTenantEnabled, getMasterConnection } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');
const { protect } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/platformAdmin');
const { buildOrgChecklistSync } = require('../lib/platform/buildOrgChecklist');
const { checkTenantOrgHealth } = require('../lib/platform/tenantOrgHealth');
const { toOrganizationDto } = require('../lib/platform/organizationDto');
const { getPlatformAuditLogModel } = require('../models/PlatformAuditLog');

const router = express.Router();

router.use(protect);
router.use(requirePlatformAdmin);

router.get('/health', async (req, res) => {
  try {
    const masterOk = isMultiTenantEnabled() && getMasterConnection()?.readyState === 1;
    const Organization = getOrganizationModel();
    const orgs = await Organization.find({}).lean();
    const byStatus = { trial: 0, active: 0, suspended: 0 };
    for (const o of orgs) {
      if (byStatus[o.status] !== undefined) byStatus[o.status]++;
    }
    res.json({
      success: true,
      multiTenant: isMultiTenantEnabled(),
      masterDbOk: masterOk,
      organizationCount: orgs.length,
      byStatus,
      cacheTtlMs: Number(process.env.TENANT_ORG_CACHE_TTL_MS) || 60000,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const Organization = getOrganizationModel();
    const orgs = await Organization.find({}).sort({ updatedAt: -1 }).lean();
    const byStatus = { trial: 0, active: 0, suspended: 0 };
    const items = [];

    for (const org of orgs) {
      byStatus[org.status] = (byStatus[org.status] || 0) + 1;
      const checklist = buildOrgChecklistSync(org);
      items.push({
        organization: toOrganizationDto(org),
        checklistProgress: checklist.progress,
        primaryDomain: checklist.primaryDomain,
      });
    }

    const trialOld = orgs.filter((o) => {
      if (o.status !== 'trial' || !o.createdAt) return false;
      const days = (Date.now() - new Date(o.createdAt).getTime()) / (86400000);
      return days > 30;
    });

    let recentAudit = [];
    try {
      const PlatformAuditLog = getPlatformAuditLogModel();
      recentAudit = await PlatformAuditLog.find({})
        .sort({ createdAt: -1 })
        .limit(15)
        .lean();
    } catch {
      /* collection may not exist yet */
    }

    res.json({
      success: true,
      summary: {
        total: orgs.length,
        byStatus,
        trialOlderThan30Days: trialOld.length,
      },
      organizations: items,
      recentAudit: recentAudit.map((a) => ({
        id: String(a._id),
        action: a.action,
        orgSlug: a.orgSlug,
        actorEmail: a.actorEmail,
        details: a.details,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    console.error('platform dashboard:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

module.exports = router;

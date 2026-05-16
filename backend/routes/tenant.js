const express = require('express');
const router = express.Router();
const { isMultiTenantEnabled } = require('../lib/db/master');
const { getTenantConnectionsCount } = require('../lib/db/tenants');
const { resolveOrganizationFromRequest, toPublicOrg } = require('../lib/tenant/resolveOrganization');

/**
 * GET /api/tenant/config — branding & landing (public, résolu par Host)
 */
router.get('/config', async (req, res) => {
  try {
    if (!isMultiTenantEnabled()) {
      return res.json({
        success: true,
        multiTenant: false,
        organization: null,
      });
    }

    const org = await resolveOrganizationFromRequest(req);
    if (!org) {
      return res.status(404).json({
        success: false,
        message: 'Cabinet introuvable pour ce domaine',
      });
    }

    return res.json({
      success: true,
      multiTenant: true,
      organization: toPublicOrg(org),
    });
  } catch (e) {
    console.error('GET /api/tenant/config:', e);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

/**
 * GET /api/health — statut API + tenant (debug / monitoring)
 */
router.get('/health', async (req, res) => {
  const multiTenant = isMultiTenantEnabled();
  let organization = null;

  if (multiTenant) {
    try {
      const org = await resolveOrganizationFromRequest(req);
      organization = org ? { slug: org.slug, id: org._id.toString(), status: org.status } : null;
    } catch {
      organization = null;
    }
  }

  return res.json({
    success: true,
    multiTenant,
    organization,
    tenantConnectionsPooled: multiTenant ? getTenantConnectionsCount() : 0,
    tenant: req.tenant
      ? { orgId: req.tenant.orgId, slug: req.tenant.slug }
      : null,
  });
});

module.exports = router;

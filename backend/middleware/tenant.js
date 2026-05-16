const mongoose = require('mongoose');
const { isMultiTenantEnabled } = require('../lib/db/master');
const { getTenantConnection } = require('../lib/db/tenants');
const { resolveOrganizationFromRequest, toPublicOrg } = require('../lib/tenant/resolveOrganization');
const { runWithTenantStore } = require('../lib/tenant/asyncContext');

/** Routes sans résolution tenant (health, config publique gère elle-même, plateforme phase 2+) */
const TENANT_SKIP_PREFIXES = [
  '/api-status',
  '/api/tenant',
];

/** Modules plateforme : pas de base tenant requise (CMS, Lexia, Légifrance) */
const PLATFORM_API_PREFIXES = [
  '/api/legal',
  '/api/judilibre',
  '/api/lexia',
  '/api/content',
  '/api/paw-search',
];

function shouldSkipTenant(path) {
  return TENANT_SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function isPlatformRoute(path) {
  return PLATFORM_API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function continueInTenantContext(req, res, next, store) {
  return runWithTenantStore(store, () => next());
}

async function tenantMiddleware(req, res, next) {
  const path = req.path || req.url || '';

  if (!isMultiTenantEnabled()) {
    return continueInTenantContext(req, res, next, { connection: mongoose.connection });
  }

  if (shouldSkipTenant(path)) {
    return continueInTenantContext(req, res, next, { connection: mongoose.connection });
  }

  try {
    const org = await resolveOrganizationFromRequest(req);

    if (!org) {
      if (isPlatformRoute(path)) {
        req.tenant = null;
        req.tenantDb = null;
        return continueInTenantContext(req, res, next, { connection: mongoose.connection });
      }
      return res.status(404).json({
        success: false,
        message: 'Cabinet introuvable pour ce domaine',
        hint:
          process.env.NODE_ENV !== 'production'
            ? 'Utilisez un domaine configuré (ex. dupont.localhost) ou l’en-tête X-Tenant-Slug: cabinet-dupont'
            : undefined,
      });
    }

    const orgId = org._id.toString();
    const conn = await getTenantConnection(org.mongoUri, orgId);

    req.tenant = {
      orgId,
      slug: org.slug,
      mongoUri: org.mongoUri,
      status: org.status,
      branding: org.branding,
      email: org.email,
      landingPage: org.landingPage,
      limits: org.limits,
      public: toPublicOrg(org),
    };
    req.tenantDb = conn;

    res.setHeader('x-org-id', orgId);
    res.setHeader('x-org-slug', org.slug);

    return continueInTenantContext(req, res, next, {
      connection: conn,
      orgId,
      slug: org.slug,
      email: org.email,
      branding: org.branding,
    });
  } catch (err) {
    console.error('tenantMiddleware:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur de résolution du cabinet',
    });
  }
}

module.exports = {
  tenantMiddleware,
  shouldSkipTenant,
  isPlatformRoute,
};

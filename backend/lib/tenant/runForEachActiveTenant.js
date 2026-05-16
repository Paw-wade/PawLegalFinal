const mongoose = require('mongoose');
const { isMultiTenantEnabled, connectMaster } = require('../db/master');
const { getOrganizationModel } = require('../../models/Organization');
const { getTenantConnection, closeAllTenantConnections } = require('../db/tenants');
const { runWithTenantStore } = require('./asyncContext');
const { preloadDefaultModels } = require('../models/registerTenantModels');

/**
 * Exécute un job pour chaque organisation active (cron / scripts).
 * En mode legacy (MULTI_TENANT off), une seule passe sur mongoose.connection.
 * @param {(ctx: { org: object|null, orgId: string|null, slug: string|null }) => Promise<void>} fn
 */
async function runForEachActiveTenant(fn) {
  if (!isMultiTenantEnabled()) {
    await fn({ org: null, orgId: null, slug: null });
    return;
  }

  await connectMaster();
  if (mongoose.connection.readyState !== 1 && process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    preloadDefaultModels();
  }

  const Organization = getOrganizationModel();
  const orgs = await Organization.find({ status: 'active' }).lean();

  for (const org of orgs) {
    const orgId = org._id.toString();
    const conn = await getTenantConnection(org.mongoUri, orgId);
    await runWithTenantStore(
      { connection: conn, orgId, slug: org.slug },
      async () => {
        await fn({ org, orgId, slug: org.slug });
      }
    );
  }
}

module.exports = {
  runForEachActiveTenant,
  closeAllTenantConnections,
};

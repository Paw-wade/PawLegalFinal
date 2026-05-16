const mongoose = require('mongoose');
const { isMultiTenantEnabled, connectMaster } = require('../db/master');
const { getOrganizationModel } = require('../../models/Organization');
const { getTenantConnection } = require('../db/tenants');
const { runWithTenantStore, getModel } = require('./asyncContext');

/**
 * Recherche un utilisateur par email dans les bases tenant (multi-cabinet).
 * Priorise le cabinet de la requête courante si fourni.
 *
 * @param {string} email
 * @param {{ preferredOrgId?: string, selectPassword?: boolean }} [options]
 * @returns {Promise<{ user: import('mongoose').Document, orgId: string, slug: string } | null>}
 */
async function findUserByEmailAcrossTenants(email, options = {}) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalizedEmail) return null;

  const passwordQuery = options.selectPassword ? '+password' : '';

  if (!isMultiTenantEnabled()) {
    const User = getModel('User');
    let q = User.findOne({ email: normalizedEmail });
    if (passwordQuery) q = q.select(passwordQuery);
    const user = await q;
    if (!user) return null;
    return { user, orgId: null, slug: null };
  }

  await connectMaster();
  const Organization = getOrganizationModel();
  let orgs = await Organization.find({ status: 'active' }).lean();
  const preferred = options.preferredOrgId ? String(options.preferredOrgId) : null;
  if (preferred) {
    orgs = [
      ...orgs.filter((o) => o._id.toString() === preferred),
      ...orgs.filter((o) => o._id.toString() !== preferred),
    ];
  }

  for (const org of orgs) {
    const orgId = org._id.toString();
    const conn = await getTenantConnection(org.mongoUri, orgId);
    const user = await runWithTenantStore(
      {
        connection: conn,
        orgId,
        slug: org.slug,
        email: org.email,
        branding: org.branding,
      },
      async () => {
        const User = getModel('User');
        let q = User.findOne({ email: normalizedEmail });
        if (passwordQuery) q = q.select(passwordQuery);
        return q;
      }
    );
    if (user) {
      return { user, orgId, slug: org.slug };
    }
  }

  return null;
}

module.exports = { findUserByEmailAcrossTenants };

const mongoose = require('mongoose');
const { getTenantConnection } = require('../db/tenants');

const PING_MS = 8000;

/**
 * @param {{ mongoUri: string, orgId: string }} org
 */
async function checkTenantOrgHealth(org) {
  const started = Date.now();
  if (!org?.mongoUri?.trim()) {
    return {
      mongoOk: false,
      dbName: null,
      adminCount: 0,
      userCount: 0,
      latencyMs: 0,
      error: 'mongoUri manquant',
    };
  }

  let conn;
  try {
    conn = await Promise.race([
      getTenantConnection(org.mongoUri, org.orgId || org._id),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout connexion Mongo')), PING_MS)
      ),
    ]);

    const dbName = conn.name;
    const adminRoles = ['admin', 'superadmin'];
    let userCount = 0;
    let adminCount = 0;

    if (conn.db.listCollections) {
      const cols = await conn.db.listCollections().toArray();
      const hasUsers = cols.some((c) => c.name === 'users');
      if (hasUsers) {
        if (!mongoose.models.User) {
          require('../../models/User');
        }
        if (!conn.models.User) {
          conn.model('User', mongoose.models.User.schema);
        }
        const User = conn.models.User;
        userCount = await User.countDocuments({});
        adminCount = await User.countDocuments({ role: { $in: adminRoles } });
      }
    }

    return {
      mongoOk: conn.readyState === 1,
      dbName,
      adminCount,
      userCount,
      latencyMs: Date.now() - started,
      error: null,
    };
  } catch (err) {
    return {
      mongoOk: false,
      dbName: null,
      adminCount: 0,
      userCount: 0,
      latencyMs: Date.now() - started,
      error: err.message || 'Connexion impossible',
    };
  }
}

module.exports = { checkTenantOrgHealth };

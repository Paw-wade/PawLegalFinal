const mongoose = require('mongoose');
const { isMultiTenantEnabled } = require('../db/master');

/**
 * Connexion MongoDB à utiliser pour les données métier du cabinet.
 * Phase 1 : les routes legacy utilisent encore `mongoose.connection` ; Phase 2 migrera vers `req.tenantDb`.
 * @param {import('express').Request} req
 * @returns {import('mongoose').Connection}
 */
function getTenantDb(req) {
  if (!isMultiTenantEnabled()) {
    return mongoose.connection;
  }
  if (req.tenantDb) {
    return req.tenantDb;
  }
  throw new Error('Connexion tenant absente — vérifiez le domaine ou MULTI_TENANT / DEFAULT_ORG_SLUG');
}

module.exports = { getTenantDb };

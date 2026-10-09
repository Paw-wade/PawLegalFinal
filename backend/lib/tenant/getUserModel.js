const mongoose = require('mongoose');
const { getTenantDb } = require('./getTenantDb');

/**
 * Modèle User sur la connexion Mongo du cabinet (req.tenantDb), sans dépendre du proxy ALS.
 * @param {import('express').Request} req
 */
function getUserModel(req) {
  const conn = getTenantDb(req);
  if (!conn.models.User) {
    if (!mongoose.models.User) {
      require('../../models/User');
    }
    conn.model('User', mongoose.models.User.schema);
  }
  return conn.models.User;
}

module.exports = { getUserModel };

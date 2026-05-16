const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const { isMultiTenantEnabled } = require('../db/master');

const tenantAls = new AsyncLocalStorage();

/**
 * Exécute la suite Express dans le contexte de connexion Mongo du cabinet.
 * @param {{ connection?: import('mongoose').Connection, orgId?: string, slug?: string }} store
 * @param {() => void} fn
 */
function runWithTenantStore(store, fn) {
  return tenantAls.run(store || {}, fn);
}

function getTenantStore() {
  return tenantAls.getStore();
}

function getActiveConnection() {
  const store = tenantAls.getStore();
  if (store?.connection) {
    return store.connection;
  }
  return mongoose.connection;
}

/**
 * Modèle Mongoose sur la connexion du tenant courant (ou connexion legacy).
 * @param {string} name
 */
function getModel(name) {
  const conn = getActiveConnection();
  if (!conn.models[name]) {
    if (!mongoose.models[name]) {
      throw new Error(
        `Modèle Mongoose "${name}" introuvable. Vérifiez preloadDefaultModels() au démarrage.`
      );
    }
    conn.model(name, mongoose.models[name].schema);
  }
  return conn.models[name];
}

function isInTenantContext() {
  return Boolean(tenantAls.getStore()?.connection);
}

module.exports = {
  runWithTenantStore,
  getTenantStore,
  getActiveConnection,
  getModel,
  isInTenantContext,
  isMultiTenantEnabled,
};

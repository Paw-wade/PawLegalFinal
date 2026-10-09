/**
 * Accès aux modèles métier sur la connexion Mongo du tenant courant (AsyncLocalStorage).
 * Usage : const M = require('../tenantModels'); await M.User.findById(...)
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { getModel } = require('./lib/tenant/asyncContext');

const MODEL_DIR = path.join(__dirname, 'models');
const SKIP = new Set(['Organization.js']);

const MODEL_NAMES = fs
  .readdirSync(MODEL_DIR)
  .filter((f) => f.endsWith('.js') && !SKIP.has(f))
  .map((f) => path.basename(f, '.js'));

function createModelProxy(name) {
  return new Proxy(
    function TenantModelProxy() {
      return getModel(name);
    },
    {
      get(_target, prop) {
        if (prop === 'modelName') return name;
        const Model = getModel(name);
        const value = Model[prop];
        if (typeof value === 'function') {
          return value.bind(Model);
        }
        return value;
      },
    }
  );
}

const M = {
  mongoose,
  Types: mongoose.Types,
  Schema: mongoose.Schema,
};

for (const name of MODEL_NAMES) {
  M[name] = createModelProxy(name);
}

module.exports = M;

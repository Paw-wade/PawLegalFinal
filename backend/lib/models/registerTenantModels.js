const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const SKIP_FILES = new Set(['Organization.js']);

/**
 * Enregistre les schémas métier sur une connexion tenant (copie depuis les modèles déjà chargés sur la connexion par défaut).
 * Prérequis : `mongoose.connect` + `require` des routes/modèles sur la connexion par défaut au démarrage.
 * @param {import('mongoose').Connection} conn
 */
function registerTenantModels(conn) {
  if (conn.__adaTenantModelsRegistered) {
    return conn.models;
  }

  const defaultModelNames = Object.keys(mongoose.models).filter((name) => name !== 'Organization');

  for (const name of defaultModelNames) {
    if (conn.models[name]) continue;
    const schema = mongoose.model(name).schema;
    conn.model(name, schema);
  }

  conn.__adaTenantModelsRegistered = true;
  return conn.models;
}

/**
 * Précharge tous les fichiers models/ sur la connexion par défaut (si pas encore fait).
 */
function preloadDefaultModels() {
  const modelsDir = path.join(__dirname, '../../models');
  const files = fs.readdirSync(modelsDir).filter((f) => f.endsWith('.js') && !SKIP_FILES.has(f));
  for (const file of files) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    require(path.join(modelsDir, file));
  }
}

module.exports = {
  registerTenantModels,
  preloadDefaultModels,
};

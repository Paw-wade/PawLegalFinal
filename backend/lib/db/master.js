const mongoose = require('mongoose');
const { resolveMongoUriWithDatabase } = require('./mongoUri');

let masterConnection = null;

function isMultiTenantEnabled() {
  const flag = (process.env.MULTI_TENANT || '').trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  // Si la base maître est configurée, activer le multi-tenant même sans MULTI_TENANT explicite
  if (process.env.MASTER_MONGODB_URI || process.env.MASTER_DB_NAME) return true;
  return false;
}

function getMasterMongoUri() {
  if (process.env.MASTER_MONGODB_URI) {
    return process.env.MASTER_MONGODB_URI.trim();
  }
  const base = process.env.MONGODB_URI;
  const dbName = process.env.MASTER_DB_NAME || 'adapapers_master';
  return resolveMongoUriWithDatabase(base, dbName);
}

async function connectMaster() {
  if (!isMultiTenantEnabled()) {
    return null;
  }
  if (masterConnection) {
    return masterConnection;
  }
  const uri = getMasterMongoUri();
  if (!uri) {
    throw new Error('MASTER_MONGODB_URI ou MONGODB_URI requis pour le mode multi-tenant');
  }
  masterConnection = await mongoose.createConnection(uri).asPromise();
  console.log(`✅ Base maître connectée (${masterConnection.name || 'master'})`);
  return masterConnection;
}

function getMasterConnection() {
  if (!masterConnection) {
    throw new Error('Base maître non connectée — appelez connectMaster() au démarrage');
  }
  return masterConnection;
}

async function disconnectMaster() {
  if (masterConnection) {
    await masterConnection.close();
    masterConnection = null;
  }
}

module.exports = {
  isMultiTenantEnabled,
  getMasterMongoUri,
  connectMaster,
  getMasterConnection,
  disconnectMaster,
};

const mongoose = require('mongoose');
const { registerTenantModels } = require('../models/registerTenantModels');

/** @type {Map<string, { conn: import('mongoose').Connection, mongoUri: string }>} */
const connections = new Map();

/**
 * @param {string} mongoUri
 * @param {string} orgId
 * @returns {Promise<import('mongoose').Connection>}
 */
async function getTenantConnection(mongoUri, orgId) {
  const key = String(orgId);
  const uri = String(mongoUri || '').trim();
  const existing = connections.get(key);
  if (existing?.conn?.readyState === 1 && existing.mongoUri === uri) {
    return existing.conn;
  }
  if (existing?.conn) {
    await existing.conn.close().catch(() => {});
    connections.delete(key);
  }
  const conn = await mongoose.createConnection(uri).asPromise();
  registerTenantModels(conn);
  connections.set(key, { conn, mongoUri: uri });
  return conn;
}

async function closeAllTenantConnections() {
  const closing = [];
  for (const [key, entry] of connections.entries()) {
    closing.push(
      entry.conn.close().then(() => {
        connections.delete(key);
      })
    );
  }
  await Promise.all(closing);
}

function getTenantConnectionsCount() {
  return connections.size;
}

async function evictTenantConnection(orgId) {
  const key = String(orgId);
  const entry = connections.get(key);
  if (!entry?.conn) return;
  await entry.conn.close().catch(() => {});
  connections.delete(key);
}

module.exports = {
  getTenantConnection,
  closeAllTenantConnections,
  getTenantConnectionsCount,
  evictTenantConnection,
};

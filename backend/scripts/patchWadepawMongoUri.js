/**
 * Met à jour mongoUri de cabinet-wadepaw en base maître (PowerShell-friendly).
 * Usage : npm run patch:wadepaw-uri
 */
require('dotenv').config();
const { connectMaster, disconnectMaster } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');
const { ensureMongoUriDatabase } = require('../lib/db/mongoUri');
const { clearOrganizationCache } = require('../lib/tenant/resolveOrganization');

async function main() {
  const raw = (process.env.TENANT_WADEPAW_MONGODB_URI || process.env.TENANT_WADEPAW_URI || '').trim();
  const dbName = process.env.TENANT_WADEPAW_DB_NAME || 'test';
  const mongoUri = ensureMongoUriDatabase(
    raw || 'mongodb+srv://ablaye:Pawlegal25@pawlegalnew.zeenzkp.mongodb.net/?appName=Pawlegalnew',
    dbName
  );

  await connectMaster();
  const Organization = getOrganizationModel();
  const r = await Organization.updateOne(
    { slug: 'cabinet-wadepaw' },
    { $set: { mongoUri } }
  );

  clearOrganizationCache();
  console.log('✅ mongoUri mis à jour pour cabinet-wadepaw');
  console.log('   Base cible :', dbName);
  console.log('   Modifié    :', r.modifiedCount, '| Trouvé :', r.matchedCount);
  console.log('   URI        :', mongoUri.replace(/:[^:@/]+@/, ':***@'));

  await disconnectMaster();
  process.exit(r.matchedCount ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

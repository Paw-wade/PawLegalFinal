/**
 * Supprime l'index unique obsolète sur documents.nomFichier (conflits à l'upload).
 * Usage : npm run fix:document-nomfichier-index -- cabinet-wadepaw
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectMaster } = require('../lib/db/master');
const { getTenantConnection } = require('../lib/db/tenants');

async function main() {
  const slug = (process.argv[2] || process.env.DEFAULT_ORG_SLUG || 'cabinet-wadepaw').toLowerCase();
  await connectMaster();
  const { getOrganizationModel } = require('../models/Organization');
  const org = await getOrganizationModel().findOne({ slug }).lean();
  if (!org) {
    console.error('Organisation introuvable:', slug);
    process.exit(1);
  }
  const conn = await getTenantConnection(org.mongoUri, org._id.toString());
  const col = conn.collection('documents');
  const indexes = await col.indexes();
  console.log('Index actuels:', indexes.map((i) => ({ name: i.name, key: i.key, unique: i.unique })));

  const target = indexes.find(
    (i) => i.unique && i.key && Object.keys(i.key).length === 1 && i.key.nomFichier === 1
  );
  if (!target) {
    console.log('Aucun index unique sur nomFichier — rien à faire.');
    process.exit(0);
  }
  await col.dropIndex(target.name);
  console.log('✅ Index supprimé:', target.name);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

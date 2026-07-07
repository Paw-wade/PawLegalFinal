/**
 * Audit d'intégrité des documents (S3, Cloudinary, chemins locaux).
 * Usage: node scripts/audit-documents-integrity.js
 * Code sortie 1 si des fichiers sont inaccessibles.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { runDocumentsIntegrityAudit } = require('../utils/documentsIntegrityAudit');

async function main() {
  const uri = process.env.TENANT_WADEPAW_MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const report = await runDocumentsIntegrityAudit({ quiet: false });
  await mongoose.disconnect();
  process.exit(report.healthy ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

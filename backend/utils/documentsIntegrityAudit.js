const path = require('path');
const { isDocumentFileAvailable, isS3StoragePath } = require('./documentFileStorage');

const UPLOADS_DOCUMENTS = path.join(__dirname, '..', 'uploads', 'documents');

/**
 * Vérifie que chaque document en base a un fichier accessible (S3, Cloudinary, local, etc.).
 */
async function runDocumentsIntegrityAudit({ quiet = false, limit = 0 } = {}) {
  const Document = require('../models/Document');
  const query = Document.find({}).select('_id nom nomFichier cheminFichier').lean();
  if (limit > 0) query.limit(limit);
  const docs = await query;

  const report = {
    checkedAt: new Date().toISOString(),
    total: docs.length,
    ok: 0,
    missing: 0,
    s3: 0,
    s3Missing: 0,
    localOnly: 0,
    dockerPaths: 0,
    samples: [],
  };

  for (const doc of docs) {
    const chemin = String(doc.cheminFichier || '');
    if (isS3StoragePath(chemin)) report.s3++;
    if (/^\/app\//.test(chemin)) report.dockerPaths++;
    if (/^uploads\//.test(chemin) && !isS3StoragePath(chemin)) report.localOnly++;

    const fileName = path.basename(String(doc.nomFichier || chemin));
    const localPath = fileName ? path.join(UPLOADS_DOCUMENTS, fileName) : null;
    const available = await isDocumentFileAvailable(doc, { localPath });

    if (available) {
      report.ok++;
    } else {
      report.missing++;
      if (isS3StoragePath(chemin)) report.s3Missing++;
      if (report.samples.length < 15) {
        report.samples.push({
          id: String(doc._id),
          nom: doc.nom,
          cheminFichier: chemin,
        });
      }
    }
  }

  report.healthy = report.missing === 0;

  if (!quiet) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!report.healthy) {
    console.warn(
      `⚠️ Audit documents: ${report.missing}/${report.total} inaccessible(s) (${report.s3Missing} S3)`
    );
    for (const s of report.samples.slice(0, 5)) {
      console.warn(`   - ${s.id} ${s.nom}: ${s.cheminFichier}`);
    }
  } else {
    console.log(`✅ Audit documents: ${report.ok}/${report.total} accessibles`);
  }

  return report;
}

module.exports = {
  runDocumentsIntegrityAudit,
};

/**
 * Teste l'acces aux fichiers documents (local, Cloudinary, origines distantes).
 * Usage: node scripts/test-document-access.js [--limit=20] [--docker-only]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const path = require('path');
const Document = require('../models/Document');
const {
  isDocumentFileAvailable,
  getDocumentRemoteStaticUrls,
  findCloudinaryDocumentUrl,
} = require('../utils/documentFileStorage');

const BACKEND_ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(BACKEND_ROOT, 'uploads', 'documents');

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 30;
const DOCKER_ONLY = args.includes('--docker-only');

function localPathFor(doc) {
  const name = path.basename(String(doc.nomFichier || doc.cheminFichier || '').replace(/\\/g, '/'));
  if (!name) return null;
  return path.join(UPLOADS_DIR, name);
}

function isCloudinary(doc) {
  return /cloudinary\.com/i.test(String(doc.cheminFichier || ''));
}

function isDockerPath(doc) {
  return /\/app\/uploads/i.test(String(doc.cheminFichier || ''));
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  let q = {};
  if (DOCKER_ONLY) {
    q = { cheminFichier: /\/app\/uploads/i };
  }
  const docs = await Document.find(q).sort({ createdAt: -1 }).limit(LIMIT).lean();

  let available = 0;
  let unavailable = 0;
  const failures = [];

  for (const doc of docs) {
    const local = localPathFor(doc);
    const ok = await isDocumentFileAvailable(doc, { localPath: local });
    if (ok) {
      available++;
    } else {
      unavailable++;
      if (failures.length < 10) {
        const remoteUrls = getDocumentRemoteStaticUrls(doc);
        let cloudUrl = null;
        try {
          cloudUrl = await findCloudinaryDocumentUrl(doc);
        } catch {
          /* ignore */
        }
        failures.push({
          id: String(doc._id),
          nom: doc.nom,
          cheminFichier: doc.cheminFichier,
          nomFichier: doc.nomFichier,
          cloudinary: isCloudinary(doc),
          docker: isDockerPath(doc),
          remoteUrls: remoteUrls.slice(0, 3),
          cloudUrl,
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        tested: docs.length,
        available,
        unavailable,
        dockerOnly: DOCKER_ONLY,
        failures,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
  process.exit(unavailable > 0 && DOCKER_ONLY ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

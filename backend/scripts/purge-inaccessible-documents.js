/**
 * Identifie et supprime les documents dont le fichier est introuvable.
 *
 * Usage:
 *   node scripts/purge-inaccessible-documents.js
 *   node scripts/purge-inaccessible-documents.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const mongoose = require('mongoose');
const {
  isDocumentFileAvailable,
  isS3StoragePath,
} = require('../utils/documentFileStorage');
const { headS3Object } = require('../utils/s3DocumentStorage');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'documents');

process.env.DOCUMENT_REMOTE_FETCH_TIMEOUT_MS =
  process.env.DOCUMENT_REMOTE_FETCH_TIMEOUT_MS || '6000';

function getMongoUri() {
  return (
    process.env.TENANT_WADEPAW_MONGODB_URI ||
    process.env.TENANT_WADEPAW_URI ||
    process.env.MONGODB_URI
  );
}

function isDockerStoragePath(stored) {
  const s = String(stored || '').trim();
  return /^\/app\//.test(s) || /^app\//.test(s);
}

function localPathFor(doc) {
  const name = path
    .basename(String(doc.nomFichier || doc.cheminFichier || '').replace(/\\/g, '/'))
    .split('?')[0];
  if (!name) return null;
  const p = path.join(UPLOADS_DIR, name);
  try {
    const fs = require('fs');
    return fs.existsSync(p) && fs.statSync(p).isFile() ? p : null;
  } catch {
    return null;
  }
}

async function isAccessible(doc) {
  const stored = String(doc.cheminFichier || '').trim();

  if (isS3StoragePath(stored)) {
    return headS3Object(stored);
  }

  if (isDockerStoragePath(stored)) {
    const local = localPathFor(doc);
    if (local) return true;
    return false;
  }

  const local = localPathFor(doc);
  return isDocumentFileAvailable(doc, { localPath: local });
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('❌ Aucune URI Mongo');
    process.exit(1);
  }

  const deletedBy =
    process.env.DOCUMENTS_RECOVERY_USER_ID || process.env.ADMIN_USER_ID || null;
  if (!deletedBy && !DRY_RUN) {
    console.error('❌ DOCUMENTS_RECOVERY_USER_ID requis pour --apply');
    process.exit(1);
  }

  console.log(DRY_RUN ? '🔍 Mode dry-run' : '🗑️  Mode APPLY — suppression');
  await mongoose.connect(uri);

  const Document = require('../models/Document');
  const Trash = require('../models/Trash');

  const docs = await Document.find({}).sort({ createdAt: 1 }).lean();
  console.log(`📄 ${docs.length} documents à vérifier\n`);

  const inaccessible = [];
  let checked = 0;

  for (const doc of docs) {
    checked++;
    if (checked % 25 === 0) {
      console.log(`… vérifiés ${checked}/${docs.length}`);
    }
    const ok = await isAccessible(doc);
    if (!ok) {
      inaccessible.push(doc);
      console.log(
        '❌ inaccessible',
        doc._id,
        '|',
        String(doc.nom || '').slice(0, 50),
        '|',
        String(doc.cheminFichier || '').slice(0, 70)
      );
    }
  }

  console.log(`\n📊 ${inaccessible.length} document(s) inaccessible(s) sur ${docs.length}`);

  if (DRY_RUN || inaccessible.length === 0) {
    await mongoose.disconnect();
    return;
  }

  let deleted = 0;
  for (const doc of inaccessible) {
    try {
      await Trash.create({
        itemType: 'document',
        originalId: doc._id,
        itemData: doc,
        deletedBy,
        originalOwner: doc.user,
        origin: 'purge-inaccessible-documents.js',
        metadata: {
          nom: doc.nom,
          dossierId: doc.dossierId,
          reason: 'fichier_introuvable',
        },
      });
    } catch (e) {
      console.warn('⚠️ corbeille', doc._id, e.message);
    }

    await Document.deleteOne({ _id: doc._id });
    deleted++;
    console.log('🗑️ supprimé', doc._id, doc.nom?.slice(0, 40));
  }

  console.log(`\n✅ ${deleted} document(s) supprimé(s) de la base`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

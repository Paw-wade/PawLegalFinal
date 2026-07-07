/**
 * Rapport d'acces documents (Cloudinary + docker paths).
 * Usage: node scripts/test-document-access-report.js
 */
require('dotenv').config();
process.env.DOCUMENTS_RECOVERY_USER_ID =
  process.env.DOCUMENTS_RECOVERY_USER_ID || '693696e4b613f9b41ddc8d34';
process.env.DOCUMENT_REMOTE_FETCH_TIMEOUT_MS = process.env.DOCUMENT_REMOTE_FETCH_TIMEOUT_MS || '8000';

const path = require('path');
const mongoose = require('mongoose');
const Document = require('../models/Document');
const { isDocumentFileAvailable } = require('../utils/documentFileStorage');

const UP = path.join(__dirname, '..', 'uploads', 'documents');

async function testGroup(label, query, limit) {
  const docs = await Document.find(query).limit(limit).lean();
  let ok = 0;
  let fail = 0;
  for (const d of docs) {
    const name = path.basename(String(d.nomFichier || d.cheminFichier));
    const local = path.join(UP, name);
    if (await isDocumentFileAvailable(d, { localPath: local })) ok++;
    else fail++;
  }
  return { label, total: docs.length, ok, fail };
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const cloud = await testGroup('cloudinary', { cheminFichier: { $regex: 'cloudinary.com', $options: 'i' } }, 80);
  const docker = await testGroup('docker_vps', { cheminFichier: { $regex: '/app/uploads' } }, 15);
  const disk = (await require('fs').promises.readdir(UP).catch(() => [])).filter((f) => !f.startsWith('.')).length;
  console.log(JSON.stringify({ diskFiles: disk, cloud, docker, pass: cloud.fail === 0 }, null, 2));
  await mongoose.disconnect();
  process.exit(docker.fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

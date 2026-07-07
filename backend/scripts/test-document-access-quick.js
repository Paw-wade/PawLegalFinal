require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('../models/Document');
const { isDocumentFileAvailable } = require('../utils/documentFileStorage');
const path = require('path');
const UP = path.join(__dirname, '..', 'uploads', 'documents');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const cloud = await Document.find({ cheminFichier: { $regex: 'cloudinary.com', $options: 'i' } }).limit(8).lean();
  const docker = await Document.find({ cheminFichier: { $regex: '/app/uploads', $options: 'i' } }).limit(8).lean();
  async function testSet(label, docs) {
    let ok = 0;
    let fail = 0;
    for (const d of docs) {
      const name = path.basename(String(d.nomFichier || d.cheminFichier));
      const local = path.join(UP, name);
      const avail = await isDocumentFileAvailable(d, { localPath: local });
      if (avail) ok++;
      else fail++;
      console.log(label, avail ? 'OK' : 'FAIL', String(d._id), (d.nom || '').slice(0, 50));
    }
    console.log(label + ' summary', { ok, fail, total: docs.length });
  }
  await testSet('cloudinary', cloud);
  await testSet('docker', docker);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

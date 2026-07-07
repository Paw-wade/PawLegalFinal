require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Document = require('../models/Document');

const UPLOADS = path.join(__dirname, '..', 'uploads');

function allUploadFiles() {
  const out = new Set();
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (st.isFile()) out.add(name.toLowerCase());
        else if (st.isDirectory()) walk(full);
      } catch {
        /* ignore */
      }
    }
  }
  walk(UPLOADS);
  return out;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const onDisk = allUploadFiles();
  console.log('files on disk:', onDisk.size);
  const docker = await Document.find({ cheminFichier: { $regex: '/app/uploads' } }).lean();
  let matched = 0;
  for (const d of docker) {
    const name = path.basename(String(d.nomFichier || d.cheminFichier)).toLowerCase();
    if (onDisk.has(name)) matched++;
  }
  const cloud = await Document.find({ cheminFichier: { $regex: 'cloudinary.com', $options: 'i' } }).lean();
  let cloudLocal = 0;
  for (const d of cloud) {
    const name = path.basename(String(d.nomFichier || d.cheminFichier)).toLowerCase();
    if (onDisk.has(name)) cloudLocal++;
  }
  console.log('docker docs with file on disk:', matched, '/', docker.length);
  console.log('cloudinary docs with same-name file on disk:', cloudLocal);
  await mongoose.disconnect();
})();

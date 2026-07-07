require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const Document = require('../models/Document');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function stripTs(name) {
  return String(name || '').replace(/^\d{10,}-/, '');
}

async function buildIndex() {
  const map = new Map();
  for (const rt of ['raw', 'image']) {
    for (const prefix of ['pawlegal/documents', 'cabinets/cabinet-wadepaw/documents', '']) {
      let next = null;
      do {
        const r = await cloudinary.api.resources({
          type: 'upload',
          resource_type: rt,
          prefix: prefix || undefined,
          max_results: 500,
          next_cursor: next,
        });
        for (const res of r.resources || []) {
          const base = path.basename(String(res.public_id || ''));
          map.set(base.toLowerCase(), res.secure_url);
          map.set(stripTs(base).toLowerCase(), res.secure_url);
          const noExt = base.replace(/\.[^/.]+$/, '');
          map.set(noExt.toLowerCase(), res.secure_url);
          map.set(stripTs(noExt).toLowerCase(), res.secure_url);
        }
        next = r.next_cursor;
      } while (next);
    }
  }
  return map;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Indexing cloudinary...');
  const idx = await buildIndex();
  console.log('Keys:', idx.size);
  const docker = await Document.find({ cheminFichier: { $regex: '/app/uploads' } }).limit(130).lean();
  let matched = 0;
  for (const d of docker) {
    const name = path.basename(String(d.nomFichier || d.cheminFichier));
    const keys = [name, stripTs(name), name.replace(/\.[^/.]+$/, ''), stripTs(name.replace(/\.[^/.]+$/, ''))].map((k) =>
      k.toLowerCase()
    );
    let url = null;
    for (const k of keys) {
      if (idx.has(k)) {
        url = idx.get(k);
        break;
      }
    }
    if (url) {
      matched++;
      if (matched <= 5) console.log('MATCH', d._id, name, '->', url.slice(0, 80));
    }
  }
  console.log('docker docs:', docker.length, 'cloudinary matches:', matched);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Document = require('../models/Document');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

function findFileByTailleAndCreatedAt(document) {
  const size = Number(document.taille);
  if (!Number.isFinite(size) || size <= 0) return null;
  const t0 = document.createdAt ? new Date(document.createdAt).getTime() : null;
  const scanDirs = new Set([
    path.join(UPLOADS_ROOT, 'documents'),
    path.join(process.cwd(), 'uploads', 'documents'),
    UPLOADS_ROOT,
  ]);
  const matches = [];
  for (const dir of scanDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const walk = (d) => {
        for (const name of fs.readdirSync(d)) {
          const full = path.join(d, name);
          const st = fs.statSync(full);
          if (st.isDirectory()) walk(full);
          else if (st.isFile() && st.size === size) {
            matches.push({ full, timeDiff: t0 != null ? Math.abs(st.mtimeMs - t0) : 0 });
          }
        }
      };
      walk(dir);
    } catch {
      /* ignore */
    }
  }
  if (!matches.length) return null;
  matches.sort((a, b) => a.timeDiff - b.timeDiff);
  return matches[0].full;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const docker = await Document.find({ cheminFichier: { $regex: '/app/uploads' } }).limit(130).lean();
  let bySize = 0;
  for (const d of docker) {
    if (findFileByTailleAndCreatedAt(d)) bySize++;
  }
  console.log('docker matched by size heuristic:', bySize, '/', docker.length);
  await mongoose.disconnect();
})();

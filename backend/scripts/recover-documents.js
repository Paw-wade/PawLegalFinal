/**
 * Récupération des fichiers documents orphelins (métadonnée en base, binaire absent).
 *
 * Usage:
 *   node scripts/recover-documents.js --dry-run
 *   node scripts/recover-documents.js --apply
 *   node scripts/recover-documents.js --apply --limit=20
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const mongoose = require('mongoose');

const BACKEND_ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(BACKEND_ROOT, 'uploads', 'documents');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 0;
const DOCKER_ONLY = args.includes('--docker-only');
const SKIP_REMOTE = args.includes('--skip-remote');

function getMongoUri() {
  return (
    process.env.TENANT_WADEPAW_MONGODB_URI ||
    process.env.TENANT_WADEPAW_URI ||
    process.env.MONGODB_URI
  );
}

function buildRemoteOrigins() {
  const raw = [
    process.env.DOCUMENTS_REMOTE_ORIGIN,
    process.env.REMOTE_UPLOADS_ORIGIN,
    process.env.PRODUCTION_UPLOADS_ORIGIN,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.CLIENT_URL,
    'https://www.adapapers.fr',
    'https://adapapers.fr',
    'https://pawlegalfinal.onrender.com',
  ];
  const fromFrontend = String(process.env.FRONTEND_URL || process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  raw.push(...fromFrontend);

  const out = [];
  const seen = new Set();
  for (let origin of raw) {
    if (!origin) continue;
    origin = origin.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
    if (!/^https?:\/\//i.test(origin)) continue;
    if (/localhost|127\.0\.0\.1|:3004$/i.test(origin)) continue;
    const key = origin.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(origin);
  }
  return out;
}

function getFileName(doc) {
  return path
    .basename(String(doc.nomFichier || doc.cheminFichier || '').replace(/\\/g, '/'))
    .split('?')[0];
}

function localPathFor(doc) {
  const name = getFileName(doc);
  if (!name) return null;
  const candidates = [
    path.join(UPLOADS_DIR, name),
    path.join(BACKEND_ROOT, 'uploads', 'documents', name),
  ];
  const stored = String(doc.cheminFichier || '').replace(/\\/g, '/');
  const docker = stored.match(/uploads\/documents\/([^/?#]+)/i);
  if (docker?.[1]) candidates.push(path.join(UPLOADS_DIR, docker[1]));

  const tryFile = (p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile() ? p : null;
    } catch {
      return null;
    }
  };

  for (const p of candidates) {
    const hit = tryFile(p);
    if (hit) return hit;
  }

  // Recherche recursive sous uploads/ (ex. uploads/{userId}/documents/)
  const targets = new Set([name.toLowerCase()]);
  try {
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return null;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && targets.has(entry.name.toLowerCase())) return full;
        if (entry.isDirectory()) {
          const nested = walk(full);
          if (nested) return nested;
        }
      }
      return null;
    };
    return walk(path.join(BACKEND_ROOT, 'uploads'));
  } catch {
    return null;
  }
}

function httpGetBuffer(url, redirectCount = 0) {
  return new Promise((resolve) => {
    const clean = String(url || '').trim();
    if (!clean || redirectCount > 6) {
      resolve(null);
      return;
    }
    const lib = clean.toLowerCase().startsWith('https') ? https : http;
    const opts = { method: 'GET', timeout: 8000 };
    if (lib === https && /sslip\.io/i.test(clean)) {
      opts.rejectUnauthorized = false;
    }
    const req = lib.request(clean, opts, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        let next = String(res.headers.location).trim();
        try {
          next = new URL(next, clean).href;
        } catch {
          /* keep */
        }
        httpGetBuffer(next, redirectCount + 1).then(resolve);
        return;
      }
      if (!status || status >= 400) {
        res.resume();
        resolve(null);
        return;
      }
      const ct = String(res.headers['content-type'] || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('text/plain') && !ct.includes('pdf')) {
        res.resume();
        resolve(null);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 32) {
          resolve(null);
          return;
        }
        if (buf.slice(0, 5).toString() === '%PDF-' || buf.length > 200) {
          resolve({ buffer: buf, contentType: res.headers['content-type'] || 'application/octet-stream', url: clean });
          return;
        }
        resolve(null);
      });
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

async function buildCloudinaryIndex(cloudinary) {
  const byBase = new Map();
  const prefixes = ['pawlegal/documents', 'cabinets/cabinet-wadepaw/documents', 'cabinets'];
  for (const prefix of prefixes) {
    let next = null;
    do {
      const r = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'raw',
        prefix,
        max_results: 500,
        next_cursor: next,
      });
      for (const res of r.resources || []) {
        const base = path.basename(String(res.public_id || ''));
        const key = base.toLowerCase();
        if (!byBase.has(key)) byBase.set(key, res.secure_url);
        const noExt = base.replace(/\.[^/.]+$/, '').toLowerCase();
        if (noExt && !byBase.has(noExt)) byBase.set(noExt, res.secure_url);
      }
      next = r.next_cursor;
    } while (next);
  }
  return byBase;
}

function matchCloudinary(doc, cloudIndex, cloudinary) {
  const name = getFileName(doc);
  if (!name) return null;
  const keys = [name.toLowerCase(), name.replace(/\.[^/.]+$/, '').toLowerCase()];
  for (const k of keys) {
    if (cloudIndex.has(k)) return cloudIndex.get(k);
  }
  return null;
}

async function tryRemoteDownload(doc, origins) {
  const name = getFileName(doc);
  if (!name) return null;
  for (const origin of origins) {
    const url = `${origin}/uploads/documents/${encodeURIComponent(name)}`;
    const hit = await httpGetBuffer(url);
    if (hit) return { ...hit, source: url };
  }
  return null;
}

async function uploadToCloudinary(cloudinary, filePath, doc) {
  const name = getFileName(doc);
  const publicId = `pawlegal/documents/${name.replace(/\.[^/.]+$/, '')}`;
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'raw',
    public_id: publicId,
    overwrite: false,
    unique_filename: true,
  });
  return result.secure_url;
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('❌ Aucune URI Mongo (TENANT_WADEPAW_MONGODB_URI / MONGODB_URI)');
    process.exit(1);
  }

  console.log('🔗 Mongo:', uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
  console.log(DRY_RUN ? '🔍 Mode dry-run (ajoutez --apply pour écrire)' : '✅ Mode APPLY — écriture disque + base');

  await mongoose.connect(uri);
  const Document = require('../models/Document');

  let cloudinary = null;
  let cloudIndex = new Map();
  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    console.log('☁️ Index Cloudinary…');
    try {
      cloudIndex = await buildCloudinaryIndex(cloudinary);
      console.log(`☁️ ${cloudIndex.size} clés Cloudinary indexées`);
    } catch (e) {
      const msg = e?.error?.message || e?.message || String(e);
      console.warn(`⚠️ Index Cloudinary ignoré (${msg}) — poursuite sans index.`);
      cloudIndex = new Map();
    }
  }

  const origins = buildRemoteOrigins();
  console.log('🌐 Origines distantes:', origins.join(', '));

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const docs = await Document.find({}).sort({ createdAt: 1 }).lean();
  console.log(`📄 ${docs.length} documents en base`);

  const stats = { ok: 0, already: 0, recovered: 0, failed: 0, skipped: 0 };
  let processed = 0;

  for (const doc of docs) {
    if (LIMIT > 0 && processed >= LIMIT) break;

    const name = getFileName(doc);
    const stored = String(doc.cheminFichier || '');
    const isHttp = /^https?:\/\//i.test(stored);
    const isDockerPath = /^\/app\//.test(stored) || /^app\//.test(stored);

    if (DOCKER_ONLY && !isDockerPath) continue;
    processed++;

    if (isHttp && stored.includes('cloudinary.com')) {
      const hit = await httpGetBuffer(stored.split('?')[0]);
      if (hit) {
        stats.already++;
        continue;
      }
    }

    const local = localPathFor(doc);
    if (local) {
      stats.already++;
      if (isHttp) continue;
      if (!DRY_RUN && cloudinary) {
        try {
          const url = await uploadToCloudinary(cloudinary, local, doc);
          await Document.updateOne({ _id: doc._id }, { $set: { cheminFichier: url } });
          stats.recovered++;
          console.log('☁️↑ local→cloud', doc._id, name);
        } catch (e) {
          console.warn('⚠️ cloud upload fail', doc._id, e.message);
        }
      }
      continue;
    }

    let recovered = null;
    let newChemin = null;

    if (isHttp && !stored.includes('cloudinary.com')) {
      recovered = await httpGetBuffer(stored);
      if (recovered) newChemin = stored;
    }

    if (!recovered && cloudinary) {
      const cloudUrl = matchCloudinary(doc, cloudIndex, cloudinary);
      if (cloudUrl) {
        recovered = await httpGetBuffer(cloudUrl);
        if (recovered) newChemin = cloudUrl;
      }
    }

    if (!recovered && !SKIP_REMOTE) {
      recovered = await tryRemoteDownload(doc, origins);
      if (recovered) newChemin = `uploads/documents/${name}`;
    }

    if (!recovered && !SKIP_REMOTE) {
      const { fetchProductionApiDocumentBuffer } = require('../utils/documentFileStorage');
      const apiHit = await fetchProductionApiDocumentBuffer(doc);
      if (apiHit?.buffer) {
        recovered = {
          buffer: apiHit.buffer,
          source: apiHit.url,
          contentType: apiHit.contentType,
        };
        newChemin = `uploads/documents/${name}`;
      }
    }

    if (!recovered) {
      stats.failed++;
      if (stats.failed <= 15 || DRY_RUN) {
        console.log('❌ introuvable', doc._id, doc.nom?.slice(0, 50), '|', name);
      }
      continue;
    }

    stats.ok++;
    const dest = path.join(UPLOADS_DIR, name);

    if (DRY_RUN) {
      console.log('✅ recoverable', doc._id, name, '←', recovered.source || recovered.url, `(${recovered.buffer.length} o)`);
      stats.recovered++;
      continue;
    }

    fs.writeFileSync(dest, recovered.buffer);
    let cheminToStore = newChemin || `uploads/documents/${name}`;

    if (cloudinary && !String(cheminToStore).includes('cloudinary.com')) {
      try {
        cheminToStore = await uploadToCloudinary(cloudinary, dest, doc);
      } catch (e) {
        console.warn('⚠️ Cloudinary upload', doc._id, e.message, '— garde local');
      }
    }

    await Document.updateOne(
      { _id: doc._id },
      { $set: { cheminFichier: cheminToStore, nomFichier: name } }
    );
    stats.recovered++;
    console.log('💾 restauré', doc._id, name, '→', cheminToStore.slice(0, 80));
  }

  console.log('\n📊 Bilan:', stats);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

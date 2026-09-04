/**
 * Migration de tous les documents vers S3.
 *
 * Usage:
 *   node scripts/migrate-documents-to-s3.js
 *   node scripts/migrate-documents-to-s3.js --apply
 *   node scripts/migrate-documents-to-s3.js --apply --limit=20
 *   node scripts/migrate-documents-to-s3.js --apply --skip-remote
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const mongoose = require('mongoose');

const {
  isS3Configured,
  isS3StoragePath,
  buildDocumentObjectKey,
  buildS3StorageUri,
  uploadBufferToS3,
  headS3Object,
  headS3ObjectByKey,
  getS3Config,
} = require('../utils/s3DocumentStorage');
const {
  findCloudinaryDocumentUrl,
  fetchProductionApiDocumentBuffer,
} = require('../utils/documentFileStorage');

const BACKEND_ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(BACKEND_ROOT, 'uploads', 'documents');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const SKIP_REMOTE = args.includes('--skip-remote');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 0;
const HTTP_TIMEOUT_MS = Number(process.env.MIGRATE_S3_HTTP_TIMEOUT_MS) || 8000;

function isDockerStoragePath(stored) {
  const s = String(stored || '').trim();
  return /^\/app\//.test(s) || /^app\//.test(s);
}

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
  const fromNomFichier = String(doc.nomFichier || '').trim();
  if (fromNomFichier) {
    return path.basename(fromNomFichier.replace(/\\/g, '/')).split('?')[0];
  }
  return path
    .basename(String(doc.cheminFichier || '').replace(/\\/g, '/'))
    .split('?')[0];
}

function resolveContentType(doc, fallback) {
  const mime = String(doc.typeMime || '').trim();
  if (mime && mime !== 'application/octet-stream') return mime;
  const name = getFileName(doc).toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (/\.(jpe?g)$/.test(name)) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (name.endsWith('.doc')) return 'application/msword';
  return fallback || 'application/octet-stream';
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

  try {
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return null;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return full;
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
    const opts = { method: 'GET', timeout: HTTP_TIMEOUT_MS };
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
      if (ct.includes('text/html') || (ct.includes('text/plain') && !ct.includes('pdf'))) {
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
        resolve({
          buffer: buf,
          contentType: res.headers['content-type'] || 'application/octet-stream',
          source: clean,
        });
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

async function fetchDocumentBuffer(doc, { origins }) {
  const stored = String(doc.cheminFichier || '').trim();
  const dockerOnly = isDockerStoragePath(stored);

  if (isS3StoragePath(stored) && (await headS3Object(stored))) {
    return { alreadyS3: true, uri: stored };
  }

  if (/^https?:\/\//i.test(stored)) {
    const hit = await httpGetBuffer(stored.split('?')[0]);
    if (hit) return hit;
  }

  const local = localPathFor(doc);
  if (local) {
    return {
      buffer: fs.readFileSync(local),
      contentType: resolveContentType(doc),
      source: local,
    };
  }

  const cloudUrl = await findCloudinaryDocumentUrl(doc);
  if (cloudUrl) {
    const hit = await httpGetBuffer(cloudUrl);
    if (hit) return hit;
  }

  // Chemins Docker éphémères : pas de tentative HTTP/API lente (fichiers perdus).
  if (dockerOnly || SKIP_REMOTE) {
    return null;
  }

  const remote = await tryRemoteDownload(doc, origins);
  if (remote) return remote;

  const apiHit = await fetchProductionApiDocumentBuffer(doc);
  if (apiHit?.buffer) {
    return {
      buffer: apiHit.buffer,
      contentType: apiHit.contentType || resolveContentType(doc),
      source: apiHit.url,
    };
  }

  return null;
}

async function main() {
  if (!isS3Configured()) {
    console.error('❌ S3 non configuré. Définissez AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  const uri = getMongoUri();
  if (!uri) {
    console.error('❌ Aucune URI Mongo');
    process.exit(1);
  }

  const s3 = getS3Config();
  console.log('🔗 Mongo:', uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
  console.log('🪣 S3:', s3.bucket, '| prefix:', s3.prefix, '| region:', s3.region);
  console.log(DRY_RUN ? '🔍 Mode dry-run (ajoutez --apply pour migrer)' : '✅ Mode APPLY - upload S3 + mise à jour base');

  await mongoose.connect(uri);
  const Document = require('../models/Document');

  const origins = buildRemoteOrigins();
  console.log('🌐 Origines distantes:', origins.join(', ') || '(aucune)');

  const docs = await Document.find({}).sort({ createdAt: 1 }).lean();
  console.log(`📄 ${docs.length} documents en base\n`);

  const stats = { already: 0, migrated: 0, dryRunOk: 0, failed: 0, skipped: 0 };
  let processed = 0;

  for (const doc of docs) {
    if (LIMIT > 0 && processed >= LIMIT) break;
    processed++;

    const name = getFileName(doc);
    if (!name || name === '.') {
      stats.skipped++;
      console.log('⏭️  sans nom fichier', doc._id);
      continue;
    }

    if (processed % 25 === 0) {
      console.log(`… progression ${processed}/${docs.length} (migrés: ${stats.migrated}, déjà S3: ${stats.already}, échecs: ${stats.failed})`);
    }

    const targetKey = buildDocumentObjectKey(name);
    const targetUri = buildS3StorageUri(targetKey);

    if (isS3StoragePath(doc.cheminFichier) && (await headS3Object(doc.cheminFichier))) {
      stats.already++;
      continue;
    }

    if (!isS3StoragePath(doc.cheminFichier) && (await headS3ObjectByKey(targetKey))) {
      if (DRY_RUN) {
        stats.dryRunOk++;
        console.log('✅ S3 existe déjà (base à mettre à jour)', doc._id, name);
        continue;
      }
      await Document.updateOne({ _id: doc._id }, { $set: { cheminFichier: targetUri, nomFichier: name } });
      stats.migrated++;
      console.log('📝 base → S3 existant', doc._id, targetUri);
      continue;
    }

    let hit;
    try {
      hit = await fetchDocumentBuffer(doc, { origins });
    } catch (err) {
      stats.failed++;
      console.log('❌ erreur lecture', doc._id, name, err.message);
      continue;
    }

    if (hit?.alreadyS3) {
      stats.already++;
      if (!DRY_RUN && doc.cheminFichier !== hit.uri) {
        await Document.updateOne({ _id: doc._id }, { $set: { cheminFichier: hit.uri } });
      }
      continue;
    }

    if (!hit?.buffer) {
      stats.failed++;
      if (stats.failed <= 20 || DRY_RUN) {
        console.log('❌ introuvable', doc._id, doc.nom?.slice(0, 60) || '', '|', name);
      }
      continue;
    }

    if (DRY_RUN) {
      stats.dryRunOk++;
      console.log(
        '✅ migrable',
        doc._id,
        name,
        '←',
        hit.source?.slice?.(0, 80) || hit.source,
        `(${hit.buffer.length} o)`
      );
      continue;
    }

    try {
      const s3Uri = await uploadBufferToS3(hit.buffer, {
        fileName: name,
        contentType: resolveContentType(doc, hit.contentType),
      });
      await Document.updateOne(
        { _id: doc._id },
        { $set: { cheminFichier: s3Uri, nomFichier: name } }
      );
      stats.migrated++;
      console.log('☁️↑', doc._id, name, '→', s3Uri);
    } catch (err) {
      stats.failed++;
      console.log('❌ upload S3', doc._id, name, err.message);
    }
  }

  console.log('\n📊 Bilan:', stats);
  if (DRY_RUN) {
    console.log(`   ${stats.dryRunOk} migrables, ${stats.already} déjà sur S3, ${stats.failed} introuvables`);
    console.log('   Relancez avec --apply pour exécuter la migration.');
  } else {
    console.log(`   ${stats.migrated} migrés, ${stats.already} déjà sur S3, ${stats.failed} échecs`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

const path = require('path');
const http = require('http');
const https = require('https');

const REMOTE_FETCH_TIMEOUT_MS = Number(process.env.DOCUMENT_REMOTE_FETCH_TIMEOUT_MS) || 45000;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function isHttpStorageUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isCloudinaryStoragePath(value) {
  return /cloudinary\.com/i.test(String(value || '').trim());
}

function isRemoteDocumentStoragePath(value) {
  return isHttpStorageUrl(value);
}

function normalizeOrigin(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

function isLocalOrigin(origin) {
  try {
    const u = new URL(origin.startsWith('http') ? origin : `http://${origin}`);
    return LOCAL_HOSTNAMES.has(u.hostname);
  } catch {
    return false;
  }
}

function getDocumentHttpUrl(document) {
  const url = String(document?.cheminFichier || '').trim();
  return isHttpStorageUrl(url) ? url : null;
}

function getDocumentsRemoteOrigin() {
  return getDocumentsRemoteOrigins()[0] || '';
}

function getDocumentsRemoteOrigins() {
  const candidates = [
    process.env.DOCUMENTS_REMOTE_ORIGIN,
    process.env.REMOTE_UPLOADS_ORIGIN,
    process.env.PRODUCTION_UPLOADS_ORIGIN,
    'https://www.adapapers.fr',
    'https://adapapers.fr',
    process.env.NEXT_PUBLIC_API_URL,
    process.env.CLIENT_URL,
  ];

  const fromList = String(
    process.env.FRONTEND_URL || process.env.FRONTEND_ORIGINS || process.env.CORS_ORIGINS || ''
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  candidates.push(...fromList);
  candidates.push('https://pawlegalfinal.onrender.com');

  const out = [];
  const seen = new Set();
  for (const raw of candidates) {
    const origin = normalizeOrigin(raw);
    if (!origin || !/^https?:\/\//i.test(origin) || isLocalOrigin(origin)) continue;
    const key = origin.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(origin);
  }
  return out;
}

function isSslipOrigin(url) {
  return /sslip\.io/i.test(String(url || ''));
}

function getHttpClientOptions(url) {
  const opts = {};
  if (isSslipOrigin(url)) {
    opts.rejectUnauthorized = false;
  }
  return opts;
}

function resolveUploadedFileStoragePath(file, backendRoot) {
  if (!file) return '';
  if (file.secure_url) return String(file.secure_url);
  if (file.url && isHttpStorageUrl(String(file.url))) return String(file.url);
  const rawPath = String(file.path || '').trim();
  if (isHttpStorageUrl(rawPath)) return rawPath;
  if (file.filename) {
    return `uploads/documents/${String(file.filename).replace(/\\/g, '/')}`;
  }
  if (!rawPath) return '';
  try {
    const rel = path.relative(backendRoot, rawPath).replace(/\\/g, '/');
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  } catch {
    /* ignore */
  }
  const base = path.basename(rawPath.replace(/\\/g, '/'));
  if (base && base !== '.') return `uploads/documents/${base}`;
  return rawPath.replace(/\\/g, '/');
}

function getStoredDocumentFileName(document) {
  return path.basename(
    String(document?.nomFichier || document?.cheminFichier || '')
      .replace(/\\/g, '/')
      .split('?')[0]
  );
}

function getDocumentRemoteStaticUrl(document, origin = getDocumentsRemoteOrigin()) {
  const stored = String(document?.cheminFichier || '').trim();
  if (isHttpStorageUrl(stored) || isCloudinaryStoragePath(stored)) {
    return null;
  }
  if (!origin) return null;
  const fileName = getStoredDocumentFileName(document);
  if (!fileName || fileName === '.') return null;
  return `${origin}/uploads/documents/${encodeURIComponent(fileName)}`;
}

function getDocumentRemoteStaticUrls(document) {
  const stored = String(document?.cheminFichier || '').trim();
  if (isHttpStorageUrl(stored) || isCloudinaryStoragePath(stored)) {
    return [];
  }
  const fileName = getStoredDocumentFileName(document);
  if (!fileName || fileName === '.') return [];
  return getDocumentsRemoteOrigins()
    .map((origin) => `${origin}/uploads/documents/${encodeURIComponent(fileName)}`)
    .filter(Boolean);
}

function getCloudinaryPublicIdCandidates(document) {
  const fileName = getStoredDocumentFileName(document);
  if (!fileName || fileName === '.') return [];
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  if (!withoutExt) return [];

  const ids = new Set([
    `pawlegal/documents/${withoutExt}`,
    withoutExt,
    `cabinets/cabinet-wadepaw/documents/${withoutExt}`,
  ]);

  const stored = String(document?.cheminFichier || '').trim();
  if (isCloudinaryStoragePath(stored)) {
    try {
      const marker = '/upload/';
      const idx = stored.indexOf(marker);
      if (idx !== -1) {
        let rest = stored.slice(idx + marker.length).split('?')[0];
        while (rest.includes('/') && /^[a-z0-9_]+,[a-z0-9_.,\-]+/i.test(rest.split('/')[0])) {
          rest = rest.slice(rest.indexOf('/') + 1);
        }
        rest = rest.replace(/^v\d+\//, '').replace(/\.[^/.]+$/, '');
        if (rest) ids.add(rest);
      }
    } catch {
      /* ignore */
    }
  }

  return [...ids];
}

function getCloudinaryClient() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    return cloudinary;
  } catch {
    return null;
  }
}

async function findCloudinaryDocumentUrl(document) {
  if (isCloudinaryStoragePath(document?.cheminFichier)) {
    return String(document.cheminFichier).trim();
  }

  const cloudinary = getCloudinaryClient();
  if (!cloudinary) return null;

  for (const publicId of getCloudinaryPublicIdCandidates(document)) {
    for (const resourceType of ['raw', 'image']) {
      try {
        const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType });
        if (resource?.secure_url) return resource.secure_url;
      } catch {
        /* try next candidate */
      }
    }
  }

  const fileName = getStoredDocumentFileName(document);
  if (fileName) {
    const base = fileName.replace(/\.[^/.]+$/, '');
    if (base) {
      try {
        const search = await cloudinary.search
          .expression(`filename:${base}* OR public_id:*${base}*`)
          .max_results(5)
          .execute();
        for (const hit of search?.resources || []) {
          if (hit?.secure_url) return hit.secure_url;
        }
      } catch {
        /* search unavailable on plan or rate limit */
      }
    }
  }

  return null;
}

function isRejectableRemoteContentType(contentType) {
  const ct = String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (!ct) return false;
  return (
    ct.includes('text/html') ||
    ct.includes('text/plain') ||
    ct === 'application/json' ||
    ct.startsWith('text/')
  );
}

function probeHttpDocumentUrl(fileUrl, redirectCount = 0) {
  return new Promise((resolve) => {
    try {
      const cleanUrl = String(fileUrl || '').trim();
      if (!isHttpStorageUrl(cleanUrl) || redirectCount > 5) {
        resolve(false);
        return;
      }
      const client = cleanUrl.toLowerCase().startsWith('https') ? https : http;
      const req = client.request(
        cleanUrl,
        { method: 'HEAD', timeout: REMOTE_FETCH_TIMEOUT_MS, ...getHttpClientOptions(cleanUrl) },
        (remoteRes) => {
        const status = remoteRes.statusCode || 0;
        if (status >= 300 && status < 400 && remoteRes.headers.location) {
          remoteRes.resume();
          let nextUrl = String(remoteRes.headers.location).trim();
          try {
            nextUrl = new URL(nextUrl, cleanUrl).href;
          } catch {
            /* keep raw */
          }
          probeHttpDocumentUrl(nextUrl, redirectCount + 1).then(resolve);
          return;
        }
        remoteRes.resume();
        if (!status || status >= 400) {
          resolve(false);
          return;
        }
        if (isRejectableRemoteContentType(remoteRes.headers['content-type'])) {
          resolve(false);
          return;
        }
        const len = Number(remoteRes.headers['content-length'] || 0);
        if (len > 0 && len < 64) {
          resolve(false);
          return;
        }
        resolve(true);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

async function isDocumentFileAvailable(document, { localPath = null } = {}) {
  if (localPath) {
    try {
      const fs = require('fs');
      if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) return true;
    } catch {
      /* ignore */
    }
  }

  const directUrl = getDocumentHttpUrl(document);
  if (directUrl && (await probeHttpDocumentUrl(directUrl))) return true;

  const cloudUrl = await findCloudinaryDocumentUrl(document);
  if (cloudUrl && (await probeHttpDocumentUrl(cloudUrl))) return true;

  for (const remoteUrl of getDocumentRemoteStaticUrls(document)) {
    if (await probeHttpDocumentUrl(remoteUrl)) return true;
  }

  return false;
}

function resolveDocumentResponseContentType(document, fallback = 'application/octet-stream') {
  const mime = String(document?.typeMime || '').trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream') return mime;
  const name = String(document?.nom || document?.nomFichier || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (/\.(jpe?g)$/.test(name)) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.webp')) return 'image/webp';
  return fallback;
}

function pipeHttpDocumentUrl(fileUrl, res, document, { inline = false } = {}, redirectCount = 0) {
  return new Promise((resolve) => {
    try {
      const cleanUrl = String(fileUrl || '').trim();
      if (!isHttpStorageUrl(cleanUrl)) {
        resolve(false);
        return;
      }
      if (redirectCount > 5) {
        resolve(false);
        return;
      }
      const client = cleanUrl.toLowerCase().startsWith('https') ? https : http;
      const req = client.get(cleanUrl, getHttpClientOptions(cleanUrl), (remoteRes) => {
        const status = remoteRes.statusCode || 0;
        if (status >= 300 && status < 400 && remoteRes.headers.location) {
          remoteRes.resume();
          let nextUrl = String(remoteRes.headers.location).trim();
          try {
            nextUrl = new URL(nextUrl, cleanUrl).href;
          } catch {
            /* keep raw */
          }
          pipeHttpDocumentUrl(nextUrl, res, document, { inline }, redirectCount + 1).then(resolve);
          return;
        }
        if (!status || status >= 400) {
          remoteRes.resume();
          resolve(false);
          return;
        }
        const remoteContentType = String(remoteRes.headers['content-type'] || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        if (isRejectableRemoteContentType(remoteContentType)) {
          remoteRes.resume();
          resolve(false);
          return;
        }
        const len = Number(remoteRes.headers['content-length'] || 0);
        if (len > 0 && len < 64) {
          remoteRes.resume();
          resolve(false);
          return;
        }
        let contentType =
          remoteContentType && !remoteContentType.includes('octet-stream')
            ? remoteContentType
            : resolveDocumentResponseContentType(
                document,
                remoteContentType || 'application/octet-stream'
              );
        res.setHeader('Content-Type', contentType);
        res.setHeader(
          'Content-Disposition',
          `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(document.nom || 'document')}"`
        );
        if (inline) res.setHeader('Cache-Control', 'private, max-age=3600');
        remoteRes.pipe(res);
        remoteRes.on('end', () => resolve(true));
        remoteRes.on('error', () => resolve(false));
      });
      req.on('error', () => resolve(false));
      req.setTimeout(REMOTE_FETCH_TIMEOUT_MS, () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

function pipeRemoteDocumentUrl(remoteUrl, res, document, { inline = false } = {}) {
  return pipeHttpDocumentUrl(remoteUrl, res, document, { inline });
}

async function tryServeDocumentFromCloudinary(document, res, { inline = false } = {}) {
  const cloudUrl = await findCloudinaryDocumentUrl(document);
  if (!cloudUrl) return false;
  console.log('✅ Document — Cloudinary:', cloudUrl);
  return pipeHttpDocumentUrl(cloudUrl, res, document, { inline });
}

async function tryServeDocumentFromRemoteOrigin(document, res, { inline = false } = {}) {
  if (isRemoteDocumentStoragePath(document?.cheminFichier)) {
    return false;
  }

  const remoteUrls = getDocumentRemoteStaticUrls(document);
  for (const remoteUrl of remoteUrls) {
    console.log('🔍 Tentative fichier distant:', remoteUrl);
    const ok = await pipeRemoteDocumentUrl(remoteUrl, res, document, { inline });
    if (ok) {
      console.log('✅ Document — distant:', remoteUrl);
      return true;
    }
  }
  return false;
}

async function tryServeDocumentFromAlternateSources(document, res, { inline = false } = {}) {
  if (await tryServeDocumentFromCloudinary(document, res, { inline })) return true;
  return tryServeDocumentFromRemoteOrigin(document, res, { inline });
}

module.exports = {
  isHttpStorageUrl,
  isCloudinaryStoragePath,
  isRemoteDocumentStoragePath,
  getDocumentHttpUrl,
  getDocumentsRemoteOrigin,
  getDocumentsRemoteOrigins,
  resolveUploadedFileStoragePath,
  getDocumentRemoteStaticUrl,
  getDocumentRemoteStaticUrls,
  findCloudinaryDocumentUrl,
  resolveDocumentResponseContentType,
  probeHttpDocumentUrl,
  isDocumentFileAvailable,
  pipeHttpDocumentUrl,
  tryServeDocumentFromCloudinary,
  tryServeDocumentFromRemoteOrigin,
  tryServeDocumentFromAlternateSources,
};

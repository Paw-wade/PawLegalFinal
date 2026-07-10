const path = require('path');
const http = require('http');
const https = require('https');

const REMOTE_FETCH_TIMEOUT_MS = Number(process.env.DOCUMENT_REMOTE_FETCH_TIMEOUT_MS) || 45000;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const failedRecoveryApiOrigins = new Set();

const { isS3StoragePath, headS3Object, tryServeDocumentFromS3 } = require('./s3DocumentStorage');

function isHttpStorageUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isCloudinaryStoragePath(value) {
  return /cloudinary\.com/i.test(String(value || '').trim());
}

function isRemoteDocumentStoragePath(value) {
  return isHttpStorageUrl(value) || isS3StoragePath(value);
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
  if (isHttpStorageUrl(stored) || isCloudinaryStoragePath(stored) || isS3StoragePath(stored)) {
    return null;
  }
  if (!origin) return null;
  const fileName = getStoredDocumentFileName(document);
  if (!fileName || fileName === '.') return null;
  return `${origin}/uploads/documents/${encodeURIComponent(fileName)}`;
}

function getDocumentRemoteStaticUrls(document) {
  const stored = String(document?.cheminFichier || '').trim();
  if (isHttpStorageUrl(stored) || isCloudinaryStoragePath(stored) || isS3StoragePath(stored)) {
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

  if (isS3StoragePath(document?.cheminFichier) && (await headS3Object(document.cheminFichier))) {
    return true;
  }

  const cloudUrl = await findCloudinaryDocumentUrl(document);
  if (cloudUrl && (await probeHttpDocumentUrl(cloudUrl))) return true;

  for (const remoteUrl of getDocumentRemoteStaticUrls(document)) {
    if (await probeHttpDocumentUrl(remoteUrl)) return true;
  }

  if (getRecoveryJwt()) {
    const apiHit = await fetchProductionApiDocumentBuffer(document);
    if (apiHit?.buffer) return true;
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
        const { buildContentDisposition, resolveDocumentDownloadFileName } = require('./documentDownloadName');
        const fileName = resolveDocumentDownloadFileName(document);
        res.setHeader('Content-Disposition', buildContentDisposition(fileName, { inline }));
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

function getRecoveryApiOrigins() {
  const raw =
    process.env.DOCUMENTS_RECOVERY_API_ORIGINS ||
    process.env.PRODUCTION_API_ORIGIN ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://api.adapapers.fr';
  const out = [];
  const seen = new Set();
  for (const part of String(raw).split(',')) {
    const origin = normalizeOrigin(part);
    if (!origin || !/^https?:\/\//i.test(origin) || isLocalOrigin(origin)) continue;
    const key = origin.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(origin);
  }
  for (const o of getDocumentsRemoteOrigins()) {
    const key = o.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(o);
    }
  }
  return out;
}

function getRecoveryJwt() {
  const explicit = String(process.env.DOCUMENTS_RECOVERY_JWT || '').trim();
  if (explicit) return explicit;
  const secret = process.env.JWT_SECRET;
  const userId = process.env.DOCUMENTS_RECOVERY_USER_ID;
  if (!secret || !userId) return null;
  try {
    const jwt = require('jsonwebtoken');
    return jwt.sign({ id: userId }, secret, { expiresIn: '2h' });
  } catch {
    return null;
  }
}

function fetchProductionApiDocumentBuffer(document, redirectCount = 0) {
  return new Promise((resolve) => {
    const token = getRecoveryJwt();
    const docId = document?._id ? String(document._id) : '';
    if (!token || !docId || redirectCount > 4) {
      resolve(null);
      return;
    }

    const tryOrigin = (originIndex) => {
      const origins = getRecoveryApiOrigins().filter((o) => !failedRecoveryApiOrigins.has(o.toLowerCase()));
      if (originIndex >= origins.length) {
        resolve(null);
        return;
      }
      const origin = origins[originIndex];
      const url = `${origin}/api/user/documents/${encodeURIComponent(docId)}/download`;
      const client = url.toLowerCase().startsWith('https') ? https : http;
      const req = client.request(
        url,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
          timeout: REMOTE_FETCH_TIMEOUT_MS,
          ...getHttpClientOptions(url),
        },
        (remoteRes) => {
          const status = remoteRes.statusCode || 0;
          if (status >= 300 && status < 400 && remoteRes.headers.location) {
            remoteRes.resume();
            let nextUrl = String(remoteRes.headers.location).trim();
            try {
              nextUrl = new URL(nextUrl, url).href;
            } catch {
              /* keep */
            }
            const nextClient = nextUrl.toLowerCase().startsWith('https') ? https : http;
            const req2 = nextClient.get(nextUrl, getHttpClientOptions(nextUrl), (r2) => {
              const chunks = [];
              r2.on('data', (c) => chunks.push(c));
              r2.on('end', () => {
                const buf = Buffer.concat(chunks);
                if ((r2.statusCode || 0) < 400 && buf.length > 64) resolve({ buffer: buf, url: nextUrl });
                else tryOrigin(originIndex + 1);
              });
            });
            req2.on('error', () => tryOrigin(originIndex + 1));
            return;
          }
          if (!status || status >= 400) {
            remoteRes.resume();
            if (status === 404 || status === 503) failedRecoveryApiOrigins.add(origin.toLowerCase());
            tryOrigin(originIndex + 1);
            return;
          }
          const chunks = [];
          remoteRes.on('data', (c) => chunks.push(c));
          remoteRes.on('end', () => {
            const buf = Buffer.concat(chunks);
            const ct = String(remoteRes.headers['content-type'] || '').toLowerCase();
            if (buf.length < 64 || isRejectableRemoteContentType(ct)) {
              tryOrigin(originIndex + 1);
              return;
            }
            resolve({ buffer: buf, url, contentType: remoteRes.headers['content-type'] });
          });
          remoteRes.on('error', () => tryOrigin(originIndex + 1));
        }
      );
      req.on('error', () => tryOrigin(originIndex + 1));
      req.on('timeout', () => {
        req.destroy();
        tryOrigin(originIndex + 1);
      });
      req.end();
    };

    tryOrigin(0);
  });
}

async function tryServeDocumentFromProductionApi(document, res, { inline = false } = {}) {
  const hit = await fetchProductionApiDocumentBuffer(document);
  if (!hit?.buffer) return false;
  const contentType = resolveDocumentResponseContentType(document, hit.contentType || 'application/octet-stream');
  const { buildContentDisposition, resolveDocumentDownloadFileName } = require('./documentDownloadName');
  const fileName = resolveDocumentDownloadFileName(document);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', buildContentDisposition(fileName, { inline }));
  res.send(hit.buffer);
  console.log('✅ Document — API production:', hit.url);
  return true;
}

async function tryServeDocumentFromAlternateSources(document, res, { inline = false } = {}) {
  if (await tryServeDocumentFromS3(document, res, { inline })) return true;
  if (await tryServeDocumentFromCloudinary(document, res, { inline })) return true;
  if (await tryServeDocumentFromRemoteOrigin(document, res, { inline })) return true;
  return tryServeDocumentFromProductionApi(document, res, { inline });
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
  tryServeDocumentFromProductionApi,
  tryServeDocumentFromAlternateSources,
  fetchProductionApiDocumentBuffer,
  getRecoveryApiOrigins,
  isS3StoragePath,
};

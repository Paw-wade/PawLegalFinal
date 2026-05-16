const path = require('path');
const fs = require('fs');
const { getTenantStore } = require('./asyncContext');
const { isMultiTenantEnabled } = require('../db/master');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const UPLOADS_ROOT = path.resolve(BACKEND_ROOT, 'uploads');

/** Sous-dossiers métier scopés par cabinet */
const TENANT_UPLOAD_SUBDIRS = [
  'documents',
  'avatars',
  'messages',
  'contact',
  'lexia-attachments',
];

function sanitizeOrgId(orgId) {
  const id = String(orgId || '').trim();
  if (!id || !/^[a-f\d]{24}$/i.test(id)) return null;
  return id;
}

function getOrgIdFromStore() {
  const store = getTenantStore();
  return sanitizeOrgId(store?.orgId);
}

function getOrgIdFromRequest(req) {
  return sanitizeOrgId(req?.tenant?.orgId) || getOrgIdFromStore();
}

function isOrgScopedUploadsEnabled(orgId) {
  return isMultiTenantEnabled() && Boolean(sanitizeOrgId(orgId));
}

/**
 * Chemin absolu : uploads/{orgId}/{subdir} ou uploads/{subdir} (legacy).
 * @param {string} subdir
 * @param {string|null} [orgId]
 */
function getTenantUploadDir(subdir, orgId = null) {
  const sub = String(subdir || '').replace(/^\/+|\/+$/g, '');
  const oid = sanitizeOrgId(orgId) || getOrgIdFromStore();
  if (isOrgScopedUploadsEnabled(oid)) {
    return path.join(UPLOADS_ROOT, oid, sub);
  }
  return path.join(UPLOADS_ROOT, sub);
}

function ensureTenantUploadDir(subdir, orgId = null) {
  const dir = getTenantUploadDir(subdir, orgId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * URL publique servie par express.static('/uploads').
 * @param {string} subdir
 * @param {string} filename
 * @param {string|null} [orgId]
 */
function toPublicUploadUrl(subdir, filename, orgId = null) {
  const sub = String(subdir || '').replace(/^\/+|\/+$/g, '');
  const name = path.basename(String(filename || ''));
  const oid = sanitizeOrgId(orgId) || getOrgIdFromStore();
  if (isOrgScopedUploadsEnabled(oid)) {
    return `/uploads/${oid}/${sub}/${name}`;
  }
  return `/uploads/${sub}/${name}`;
}

/**
 * Dossier Cloudinary : orgs/{orgId}/{subdir} ou pawlegal/{subdir} (legacy).
 */
function getCloudinaryFolder(subdir, orgId = null) {
  const sub = String(subdir || 'documents').replace(/^\/+|\/+$/g, '');
  const oid = sanitizeOrgId(orgId) || getOrgIdFromStore();
  if (isOrgScopedUploadsEnabled(oid)) {
    return `orgs/${oid}/${sub}`;
  }
  return `pawlegal/${sub}`;
}

/**
 * Résout un chemin stocké (relatif ou absolu) vers un fichier existant.
 * Cherche d’abord le chemin tenant, puis les emplacements legacy.
 */
function resolveTenantUploadFile(storedPath, options = {}) {
  const { subdir = 'documents', fileName = null, orgId = null } = options;
  const raw = String(storedPath || '').trim();
  const filenameOnly =
    fileName ? path.basename(String(fileName)) : raw ? path.basename(raw.replace(/\\/g, '/')) : '';

  const candidates = [];

  if (raw) {
    const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    if (path.isAbsolute(raw)) candidates.push(raw);
    candidates.push(path.join(BACKEND_ROOT, normalized));
    candidates.push(path.join(process.cwd(), normalized));
    if (normalized.startsWith('uploads/')) {
      candidates.push(path.join(BACKEND_ROOT, ...normalized.split('/')));
      candidates.push(path.join(process.cwd(), ...normalized.split('/')));
    }
  }

  const oid = sanitizeOrgId(orgId) || getOrgIdFromStore();
  if (filenameOnly) {
    candidates.push(path.join(getTenantUploadDir(subdir, oid), filenameOnly));
    candidates.push(path.join(UPLOADS_ROOT, subdir, filenameOnly));
    candidates.push(path.join(process.cwd(), 'uploads', subdir, filenameOnly));
    candidates.push(path.join(process.cwd(), 'backend', 'uploads', subdir, filenameOnly));
    if (oid) {
      candidates.push(path.join(UPLOADS_ROOT, oid, subdir, filenameOnly));
    }
  }

  const seen = new Set();
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Répertoires à scanner pour retrouver un fichier (tenant + legacy).
 */
function getUploadScanDirs(subdir, orgId = null) {
  const dirs = new Set();
  const oid = sanitizeOrgId(orgId) || getOrgIdFromStore();
  dirs.add(getTenantUploadDir(subdir, oid));
  dirs.add(path.join(UPLOADS_ROOT, subdir));
  if (oid) dirs.add(path.join(UPLOADS_ROOT, oid, subdir));
  if (process.env.UPLOADS_DOCUMENTS_DIR && subdir === 'documents') {
    dirs.add(path.resolve(process.env.UPLOADS_DOCUMENTS_DIR));
  }
  return [...dirs];
}

module.exports = {
  BACKEND_ROOT,
  UPLOADS_ROOT,
  TENANT_UPLOAD_SUBDIRS,
  getOrgIdFromRequest,
  getOrgIdFromStore,
  isOrgScopedUploadsEnabled,
  getTenantUploadDir,
  ensureTenantUploadDir,
  toPublicUploadUrl,
  getCloudinaryFolder,
  resolveTenantUploadFile,
  getUploadScanDirs,
};

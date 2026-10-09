const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const CloudinaryStorageFactory = require('multer-storage-cloudinary');
const cloudinarySdk = require('cloudinary');
const { shouldUseCloudinaryForUploads, applyCloudinaryConfig } = require('../cloudinaryConfig');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const UPLOADS_ROOT = path.resolve(BACKEND_ROOT, 'uploads');

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

function sanitizeSlug(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!s || s.length > 64 || !/^[a-z0-9][a-z0-9-]*$/.test(s)) return null;
  return s;
}

function buildUniqueFilename(originalname) {
  const safeName = (originalname || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  const suffix = crypto.randomBytes(6).toString('hex');
  return `${Date.now()}-${suffix}-${safeName}`;
}

function getPlatformBrandingDiskDir(slug) {
  const s = sanitizeSlug(slug) || 'unknown';
  const dir = path.join(UPLOADS_ROOT, 'platform-branding', s);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getPlatformBrandingCloudinaryFolder(slug) {
  const s = sanitizeSlug(slug) || 'unknown';
  return `platform-branding/${s}`;
}

function resolvePlatformBrandingPublicUrl(file, slug) {
  if (!file) return '';
  const raw = file.path || file.secure_url || file.url || '';
  if (String(raw).startsWith('http')) return String(raw);
  const filename = file.filename || path.basename(String(raw));
  const s = sanitizeSlug(slug) || 'unknown';
  return `/uploads/platform-branding/${s}/${filename}`;
}

function createPlatformBrandingUpload(slug) {
  const safeSlug = sanitizeSlug(slug);
  if (!safeSlug) {
    throw new Error('Slug cabinet invalide');
  }

  const fileFilter = (req, file, cb) => {
    if (IMAGE_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Format non supporté. Utilisez PNG, JPG, WEBP, GIF, SVG ou ICO.'
        )
      );
    }
  };

  const limits = { fileSize: 5 * 1024 * 1024 };

  if (shouldUseCloudinaryForUploads()) {
    applyCloudinaryConfig(cloudinarySdk.v2);
    const storage = CloudinaryStorageFactory({
      cloudinary: cloudinarySdk,
      params: (req, file, cb) => {
        try {
          const storedName = buildUniqueFilename(file.originalname);
          cb(null, {
            folder: getPlatformBrandingCloudinaryFolder(safeSlug),
            resource_type: 'image',
            public_id: storedName.replace(/\.[^/.]+$/, ''),
          });
        } catch (err) {
          cb(err);
        }
      },
    });
    return multer({ storage, limits, fileFilter });
  }

  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try {
          cb(null, getPlatformBrandingDiskDir(safeSlug));
        } catch (err) {
          cb(err);
        }
      },
      filename: (req, file, cb) => {
        cb(null, buildUniqueFilename(file.originalname));
      },
    }),
    limits,
    fileFilter,
  });
}

module.exports = {
  createPlatformBrandingUpload,
  resolvePlatformBrandingPublicUrl,
  sanitizeSlug,
};

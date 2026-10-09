const crypto = require('crypto');
const multer = require('multer');
const CloudinaryStorageFactory = require('multer-storage-cloudinary');
/** SDK complet : multer-storage-cloudinary appelle `cloudinary.v2.uploader` (pas l’instance v2 seule). */
const cloudinarySdk = require('cloudinary');
const { shouldUseCloudinaryForUploads, applyCloudinaryConfig } = require('./cloudinaryConfig');

applyCloudinaryConfig(cloudinarySdk.v2);
const {
  ensureTenantUploadDir,
  getCloudinaryFolder,
} = require('./tenant/uploads');

/**
 * Multer storage tenant-aware : Cloudinary (dev + prod) ou disque si UPLOAD_STORAGE=disk.
 * @param {{ subdir?: string, getOrgId?: (req: import('express').Request) => string|null }} opts
 */
function buildUniqueStoredFilename(originalname) {
  const safeName = (originalname || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 180);
  const suffix = crypto.randomBytes(6).toString('hex');
  return `${Date.now()}-${suffix}-${safeName}`;
}

function createTenantMulterStorage(opts = {}) {
  const subdir = opts.subdir || 'documents';
  const getOrgId = opts.getOrgId || (() => null);

  if (shouldUseCloudinaryForUploads()) {
    return CloudinaryStorageFactory({
      cloudinary: cloudinarySdk,
      // multer-storage-cloudinary utilise run-parallel (callback) — pas de async ici.
      params: (req, file, cb) => {
        try {
          const mime = file.mimetype || '';
          const isImage = mime.startsWith('image/');
          const isVideo = mime.startsWith('video/');
          const storedName = buildUniqueStoredFilename(file.originalname);
          cb(null, {
            folder: getCloudinaryFolder(subdir, { req }),
            resource_type: isImage ? 'image' : isVideo ? 'video' : 'raw',
            public_id: storedName.replace(/\.[^/.]+$/, ''),
          });
        } catch (err) {
          cb(err);
        }
      },
    });
  }

  return multer.diskStorage({
    destination: (req, file, cb) =>
      cb(null, ensureTenantUploadDir(subdir, getOrgId(req))),
    filename: (req, file, cb) => {
      cb(null, buildUniqueStoredFilename(file.originalname));
    },
  });
}

module.exports = {
  createTenantMulterStorage,
};

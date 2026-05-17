const fs = require('fs');
const path = require('path');
const { toPublicUploadUrl } = require('./tenant/uploads');
const { shouldUseCloudinaryForUploads } = require('./cloudinaryConfig');

function isRemoteUploadPath(filePath) {
  return String(filePath || '').startsWith('http');
}

/**
 * URL / chemin public après upload Multer (Cloudinary ou disque local).
 */
function resolveUploadedFilePath(file, subdir, orgId) {
  if (!file) return '';
  const rawPath = file.path || file.secure_url || file.url || '';
  if (String(rawPath).startsWith('http')) {
    return String(rawPath);
  }
  const filename = file.filename || path.basename(String(rawPath));
  return toPublicUploadUrl(subdir, filename, orgId);
}

function resolveUploadedFileMeta(file, subdir, orgId) {
  const storedPath = resolveUploadedFilePath(file, subdir, orgId);
  return {
    filename: file.filename || path.basename(storedPath),
    originalName: file.originalname,
    path: storedPath,
    size: file.size,
    mimetype: file.mimetype,
    storage: shouldUseCloudinaryForUploads() ? 'cloudinary' : 'disk',
  };
}

/** Supprime un fichier disque local ; ignore les URLs Cloudinary. */
function safeUnlinkUploadedFile(filePath) {
  if (!filePath || isRemoteUploadPath(filePath)) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn('⚠️ Suppression fichier local échouée:', err.message);
  }
}

function safeUnlinkMulterFiles(files) {
  if (!files) return;
  const list = Array.isArray(files) ? files : [files];
  list.forEach((file) => {
    if (!file) return;
    const p = file.path || '';
    safeUnlinkUploadedFile(isRemoteUploadPath(p) ? null : p);
  });
}

module.exports = {
  isRemoteUploadPath,
  resolveUploadedFilePath,
  resolveUploadedFileMeta,
  safeUnlinkUploadedFile,
  safeUnlinkMulterFiles,
};

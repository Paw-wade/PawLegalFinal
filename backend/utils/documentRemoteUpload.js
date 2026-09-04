const fs = require('fs');
const { uploadLocalFileToS3, isS3UploadMode } = require('./s3DocumentStorage');
const { resolveUploadedFileStoragePath } = require('./documentFileStorage');

function getUploadStorageMode() {
  return String(process.env.UPLOAD_STORAGE || 'cloudinary').toLowerCase();
}

function removeLocalUploadTempFile(file) {
  try {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch (err) {
    console.warn('Fichier local temporaire non supprimé:', err.message);
  }
}

/**
 * Envoie le fichier vers le stockage distant configuré.
 * En mode S3 : échec = exception (aucun enregistrement local silencieux).
 */
async function uploadDocumentToRemoteStorage(file, { backendRoot, s3Prefix = null, uploadToCloudinary } = {}) {
  const storage = getUploadStorageMode();

  if (storage === 's3') {
    const uri = await uploadLocalFileToS3(file, { prefix: s3Prefix });
    if (!uri) {
      throw new Error('Upload S3 refusé - vérifiez la configuration AWS');
    }
    removeLocalUploadTempFile(file);
    console.log('Document vérifié et enregistré sur S3:', uri);
    return uri;
  }

  if (storage === 'local') {
    return resolveUploadedFileStoragePath(file, backendRoot);
  }

  if (typeof uploadToCloudinary === 'function') {
    const remoteUrl = await uploadToCloudinary(file);
    if (remoteUrl) {
      removeLocalUploadTempFile(file);
      console.log('Document enregistré sur Cloudinary');
      return remoteUrl;
    }
  }

  if (isS3UploadMode()) {
    throw new Error('Stockage distant requis mais indisponible');
  }

  console.warn('Stockage distant indisponible - conservation locale (mode non-S3)');
  return resolveUploadedFileStoragePath(file, backendRoot);
}

module.exports = {
  getUploadStorageMode,
  removeLocalUploadTempFile,
  uploadDocumentToRemoteStorage,
};

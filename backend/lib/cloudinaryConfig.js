/**
 * Lit CLOUDINARY_URL (cloudinary://key:secret@cloud_name) ou les variables séparées.
 */
function getCloudinaryCredentials() {
  const rawUrl = (process.env.CLOUDINARY_URL || '').trim();
  if (rawUrl.startsWith('cloudinary://')) {
    const match = rawUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?]+)/);
    if (match) {
      return {
        api_key: match[1],
        api_secret: match[2],
        cloud_name: match[3],
      };
    }
  }
  return {
    cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    api_key: (process.env.CLOUDINARY_API_KEY || '').trim(),
    api_secret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
  };
}

function isCloudinaryConfigured() {
  const c = getCloudinaryCredentials();
  return Boolean(c.cloud_name && c.api_key && c.api_secret);
}

function applyCloudinaryConfig(cloudinary) {
  const c = getCloudinaryCredentials();
  if (!isCloudinaryConfigured()) return false;
  cloudinary.config({
    cloud_name: c.cloud_name,
    api_key: c.api_key,
    api_secret: c.api_secret,
  });
  return true;
}

module.exports = {
  getCloudinaryCredentials,
  isCloudinaryConfigured,
  applyCloudinaryConfig,
};

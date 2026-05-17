/**
 * Lit CLOUDINARY_URL (cloudinary://key:secret@cloud_name) ou les variables séparées.
 */
function getCloudinaryCredentials() {
  const cloud_name = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const api_key = (process.env.CLOUDINARY_API_KEY || '').trim();
  const api_secret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  if (cloud_name && api_key && api_secret) {
    return { cloud_name, api_key, api_secret };
  }

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

  return { cloud_name, api_key, api_secret };
}

function isCloudinaryConfigured() {
  const c = getCloudinaryCredentials();
  return Boolean(c.cloud_name && c.api_key && c.api_secret);
}

/**
 * Stockage des uploads :
 * - `UPLOAD_STORAGE=cloudinary` → Cloudinary (dev + prod) si les clés sont définies
 * - `UPLOAD_STORAGE=disk` → disque local uniquement
 * - défaut / `auto` → Cloudinary si configuré, sinon disque
 */
function shouldUseCloudinaryForUploads() {
  const mode = (process.env.UPLOAD_STORAGE || 'cloudinary').trim().toLowerCase();

  if (mode === 'disk') return false;
  if (mode === 'cloudinary' || mode === 'auto' || mode === '') {
    return isCloudinaryConfigured();
  }
  if (process.env.UPLOAD_USE_CLOUDINARY === 'false') return false;
  if (process.env.UPLOAD_USE_CLOUDINARY === 'true') return isCloudinaryConfigured();

  return isCloudinaryConfigured();
}

function applyCloudinaryConfig(cloudinary) {
  const c = getCloudinaryCredentials();
  if (!isCloudinaryConfigured()) return false;
  cloudinary.config({
    cloud_name: c.cloud_name,
    api_key: c.api_key,
    api_secret: c.api_secret,
    secure: true,
  });
  return true;
}

/** Vérifie les identifiants (ping API Cloudinary). */
async function verifyCloudinaryConnection(cloudinary) {
  if (!isCloudinaryConfigured()) {
    return { ok: false, error: 'Variables CLOUDINARY_* manquantes' };
  }
  applyCloudinaryConfig(cloudinary);
  try {
    await cloudinary.api.ping();
    return { ok: true, cloud_name: getCloudinaryCredentials().cloud_name };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = {
  getCloudinaryCredentials,
  isCloudinaryConfigured,
  shouldUseCloudinaryForUploads,
  applyCloudinaryConfig,
  verifyCloudinaryConnection,
};

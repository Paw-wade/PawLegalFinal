/**
 * Chemins / public_id Cloudinary (cabinets/{slug}/…).
 */

function cloudinaryPublicIdFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  if (!fileUrl.includes('res.cloudinary.com')) return null;
  const noQuery = fileUrl.split('?')[0];
  const marker = '/upload/';
  const idx = noQuery.indexOf(marker);
  if (idx === -1) return null;
  let rest = noQuery.slice(idx + marker.length);
  while (rest.includes('/') && /^[a-z0-9_]+,[a-z0-9_.,\-]+/i.test(rest.split('/')[0])) {
    rest = rest.slice(rest.indexOf('/') + 1);
  }
  rest = rest.replace(/^v\d+\//, '');
  const withoutExt = rest.replace(/\.[^/.]+$/, '');
  return withoutExt || null;
}

function cloudinaryResourceTypeFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return 'raw';
  if (fileUrl.includes('/image/upload/')) return 'image';
  if (fileUrl.includes('/video/upload/')) return 'video';
  return 'raw';
}

/**
 * orgs/{orgId}/documents/foo → cabinets/cabinet-dupont/documents/foo
 * pawlegal/documents/foo → cabinets/cabinet-wadepaw/documents/foo (slug par défaut)
 */
function remapCloudinaryPublicId(publicId, orgIdToSlug, defaultSlug = 'cabinet-wadepaw') {
  if (!publicId) return null;
  const parts = String(publicId).split('/').filter(Boolean);
  if (parts.length < 2) return null;

  if (parts[0] === 'cabinets') {
    return null;
  }

  if (parts[0] === 'orgs' && parts.length >= 3) {
    const orgId = parts[1];
    const slug = orgIdToSlug.get(orgId) || orgIdToSlug.get(orgId.toLowerCase());
    if (!slug) return null;
    const sub = parts.slice(2).join('/');
    return `cabinets/${slug}/${sub}`;
  }

  if (parts[0] === 'pawlegal' && parts.length >= 2) {
    const sub = parts.slice(1).join('/');
    const slug = defaultSlug || 'cabinet-wadepaw';
    return `cabinets/${slug}/${sub}`;
  }

  return null;
}

function rewriteCloudinaryUrl(oldUrl, newPublicId, resourceType) {
  if (!oldUrl || !newPublicId) return oldUrl;
  const rt = resourceType || cloudinaryResourceTypeFromUrl(oldUrl);
  const cloudinary = require('cloudinary').v2;
  const { applyCloudinaryConfig } = require('./cloudinaryConfig');
  applyCloudinaryConfig(cloudinary);
  return cloudinary.url(newPublicId, {
    secure: true,
    resource_type: rt,
  });
}

module.exports = {
  cloudinaryPublicIdFromUrl,
  cloudinaryResourceTypeFromUrl,
  remapCloudinaryPublicId,
  rewriteCloudinaryUrl,
};

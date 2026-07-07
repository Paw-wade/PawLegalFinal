/**
 * Slug et préfixe S3 pour un cabinet.
 */
function slugifyCabinetName(name) {
  const base = String(name || 'cabinet')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'cabinet';
}

function buildCabinetS3Prefix(slug) {
  const clean = slugifyCabinetName(slug);
  return `Cabinet-${clean}/`;
}

function slugFromS3Prefix(prefix) {
  const clean = String(prefix || '').replace(/\/+$/, '');
  const m = clean.match(/^Cabinet-(.+)$/i);
  return m ? m[1].toLowerCase() : slugifyCabinetName(prefix);
}

module.exports = {
  slugifyCabinetName,
  buildCabinetS3Prefix,
  slugFromS3Prefix,
};

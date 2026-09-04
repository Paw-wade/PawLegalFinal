const path = require('path');

const isHttpLikeStoragePath = (value) => /^https?:\/\//i.test(String(value || '').trim());

function extractStoredFileLabel(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (isHttpLikeStoragePath(value)) {
    try {
      const segments = new URL(value).pathname.split('/').filter(Boolean);
      let last = segments[segments.length - 1] || '';
      if (/^v\d+$/.test(last) && segments.length > 1) {
        last = segments[segments.length - 2];
      }
      return decodeURIComponent(last);
    } catch {
      // fall through
    }
  }
  return path.basename(value.replace(/\\/g, '/'));
}

function sanitizeDownloadName(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  // Empêcher les injections dans Content-Disposition
  return extractStoredFileLabel(value).replace(/["\r\n\\]/g, '_');
}

function isInternalStorageFileName(name) {
  const value = String(name || '').trim();
  if (!value) return false;
  if (isHttpLikeStoragePath(value)) return true;
  const normalized = value.toLowerCase();
  if (normalized.includes('cloudinary.com')) return true;
  if (normalized.startsWith('s3://')) return true;
  if (
    normalized.includes('raw_upload') ||
    normalized.includes('pawlegal_documents') ||
    normalized.includes('pawlegal/')
  ) {
    return true;
  }
  if (/^\d{10,}-/.test(value)) return true;
  return false;
}

function stripLeadingStorageTimestamp(name) {
  const base = sanitizeDownloadName(name);
  const matched = base.match(/^\d{10,}-(.+)$/);
  return matched ? matched[1] : base;
}

function pickFileExtension(...names) {
  for (const name of names) {
    const ext = path.extname(String(name || '')).toLowerCase();
    if (ext && ext.length > 1 && ext.length <= 12) return ext;
  }
  return '';
}

/** Extension de secours uniquement si le fichier n'en a aucune - ne remplace jamais une extension existante. */
function pickMimeExtension(mimeType) {
  const map = {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/rtf': '.rtf',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'image/jpeg': '.jpeg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/tiff': '.tiff',
    'image/bmp': '.bmp',
    'application/octet-stream': '',
  };
  return map[String(mimeType || '').toLowerCase()] || '';
}

/**
 * Nom de téléchargement = fichier tel quel.
 * Priorité : originalName (upload) → nomFichier sans timestamp → chemin → nom d'affichage + extension réelle.
 * Ne remplace jamais une extension réelle du fichier stocké par une autre (MIME).
 */
function resolveDocumentDownloadFileName(document, localPath) {
  const originalName = sanitizeDownloadName(document?.originalName);
  if (originalName && pickFileExtension(originalName)) {
    return originalName;
  }

  const storedName = stripLeadingStorageTimestamp(sanitizeDownloadName(document?.nomFichier));
  const pathName = stripLeadingStorageTimestamp(
    sanitizeDownloadName(localPath ? path.basename(localPath) : document?.cheminFichier)
  );

  // Extension réelle du fichier stocké (jamais inventée pour écraser)
  const realExt =
    pickFileExtension(originalName, storedName, pathName) || pickMimeExtension(document?.typeMime);

  let displayName = sanitizeDownloadName(document?.nom);
  if (isInternalStorageFileName(displayName)) displayName = '';

  if (displayName) {
    const displayExt = pickFileExtension(displayName);
    if (displayExt) {
      // Garder le titre utilisateur, mais forcer l'extension du fichier réel s'il y a divergence
      if (realExt && displayExt !== realExt) {
        const base = displayName.slice(0, -displayExt.length) || displayName;
        return `${base}${realExt}`;
      }
      return displayName;
    }
    return realExt ? `${displayName}${realExt}` : displayName;
  }

  if (originalName) {
    return realExt && !pickFileExtension(originalName) ? `${originalName}${realExt}` : originalName;
  }

  for (const candidate of [storedName, pathName]) {
    if (!candidate || isInternalStorageFileName(candidate)) continue;
    const ext = pickFileExtension(candidate);
    if (!ext && realExt) return `${candidate}${realExt}`;
    return candidate;
  }

  return realExt ? `document${realExt}` : 'document';
}

function resolveDocumentDisplayTitle(document, localPath) {
  const displayName = sanitizeDownloadName(document?.nom);
  if (displayName && !isInternalStorageFileName(displayName)) {
    return displayName;
  }

  const fileName = resolveDocumentDownloadFileName(document, localPath);
  if (!fileName || fileName === 'document') return 'Document';
  const ext = path.extname(fileName);
  if (ext) {
    const base = fileName.slice(0, -ext.length);
    return base || fileName;
  }
  return fileName;
}

/**
 * Content-Disposition RFC 5987 - filename ASCII + filename* UTF-8.
 * Ne pas mettre encodeURIComponent dans filename="..." (sinon %20 littéral).
 */
function buildContentDisposition(fileName, { inline = false } = {}) {
  const raw = String(fileName || 'document').replace(/["\r\n\\]/g, '_').trim() || 'document';
  const asciiFallback = raw.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'document';
  const encoded = encodeURIComponent(raw).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function applyDocumentDownloadHeaders(res, document, { inline = false, localPath = null } = {}) {
  const { resolveDocumentResponseContentType } = require('./documentFileStorage');
  const fileName = resolveDocumentDownloadFileName(document, localPath);
  const contentType = resolveDocumentResponseContentType(document);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', buildContentDisposition(fileName, { inline }));
  if (inline) res.setHeader('Cache-Control', 'private, max-age=3600');
  return { fileName, contentType };
}

module.exports = {
  sanitizeDownloadName,
  isInternalStorageFileName,
  stripLeadingStorageTimestamp,
  pickFileExtension,
  pickMimeExtension,
  resolveDocumentDownloadFileName,
  resolveDocumentDisplayTitle,
  buildContentDisposition,
  applyDocumentDownloadHeaders,
};

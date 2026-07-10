/**
 * Téléchargement de fichiers : conserve le nom et l'extension exacts
 * renvoyés par le serveur (Content-Disposition), sans réécrire le blob.
 */

type AxiosLikeResponse = {
  data: Blob | ArrayBuffer | ArrayBufferView | string;
  headers?: Record<string, unknown>;
};

function headerValue(headers: Record<string, unknown> | undefined, name: string): string {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      if (Array.isArray(value)) return String(value[0] || '');
      return value == null ? '' : String(value);
    }
  }
  return '';
}

/** Parse Content-Disposition (filename* UTF-8 puis filename). */
export function parseContentDispositionFileName(header: string | undefined | null): string | null {
  if (!header) return null;

  const star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"+|"+$/g, ''));
    } catch {
      // ignore
    }
  }

  const quoted = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i.exec(header);
  if (quoted?.[1]) {
    return quoted[1].replace(/\\"/g, '"').trim();
  }

  const plain = /filename\s*=\s*([^;\s]+)/i.exec(header);
  if (plain?.[1]) {
    return plain[1].replace(/^"+|"+$/g, '').trim();
  }

  return null;
}

const MIME_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/zip': '.zip',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'image/jpeg': '.jpeg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

function extensionFromMime(mime: string): string {
  const base = String(mime || '').split(';')[0].trim().toLowerCase();
  return MIME_EXT[base] || '';
}

function hasFileExtension(name: string): boolean {
  return /\.[a-z0-9]{1,12}$/i.test(String(name || '').trim());
}

/** Nom de fichier exact à partir de la réponse API (headers + fallback). */
export function resolveFileNameFromDownloadResponse(
  response: AxiosLikeResponse,
  fallbackName?: string
): string {
  const disposition = headerValue(response.headers, 'content-disposition');
  const contentType =
    headerValue(response.headers, 'content-type') ||
    (response.data instanceof Blob ? response.data.type : '') ||
    '';

  let fileName =
    parseContentDispositionFileName(disposition) ||
    String(fallbackName || '').trim() ||
    'document';

  if (!hasFileExtension(fileName)) {
    const ext = extensionFromMime(contentType);
    if (ext) fileName = `${fileName}${ext}`;
  }
  return fileName;
}

/** Blob prêt à enregistrer, avec MIME conservé. */
export function blobFromDownloadResponse(response: AxiosLikeResponse): Blob {
  const contentType =
    headerValue(response.headers, 'content-type') ||
    (response.data instanceof Blob ? response.data.type : '') ||
    'application/octet-stream';

  if (response.data instanceof Blob) {
    if (response.data.type && response.data.type !== 'application/octet-stream') {
      return response.data;
    }
    return new Blob([response.data], { type: contentType || response.data.type || 'application/octet-stream' });
  }
  return new Blob([response.data as BlobPart], { type: contentType });
}

/**
 * Déclenche un téléchargement navigateur en préservant le nom/extension serveur.
 * Ne recrée pas un Blob sans type (évite la perte du MIME).
 */
export function triggerBlobDownload(
  response: AxiosLikeResponse,
  fallbackName?: string
): string {
  const fileName = resolveFileNameFromDownloadResponse(response, fallbackName);
  const blob = blobFromDownloadResponse(response);

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return fileName;
}

/** Raccourci : télécharge un document API et enregistre avec le nom exact. */
export async function downloadDocumentResponse(
  downloadFn: () => Promise<AxiosLikeResponse>,
  fallbackName?: string
): Promise<string> {
  const response = await downloadFn();
  return triggerBlobDownload(response, fallbackName);
}

const fs = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} = require('@aws-sdk/client-s3');

const S3_URI_PREFIX = 's3://';

function normalizePrefix(raw) {
  let prefix = String(raw || '').trim().replace(/^\/+/, '');
  if (prefix && !prefix.endsWith('/')) prefix += '/';
  return prefix;
}

function resolveStoragePrefix(prefixOverride) {
  if (prefixOverride) return normalizePrefix(prefixOverride);
  return normalizePrefix(process.env.AWS_S3_PREFIX || 'Cabinet-adapapers/');
}

function getS3Config() {
  return {
    region: process.env.AWS_REGION || 'eusc-de-east-1',
    bucket: process.env.AWS_S3_BUCKET || 'adapapers-248310411895-eusc-de-east-1-an',
    prefix: normalizePrefix(process.env.AWS_S3_PREFIX || 'Cabinet-adapapers/'),
    accessKeyId: String(process.env.AWS_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY || '').trim(),
  };
}

function isS3Configured() {
  const { bucket, region, accessKeyId, secretAccessKey } = getS3Config();
  if (!bucket || !region) return false;
  if (accessKeyId && secretAccessKey) return true;
  return String(process.env.AWS_USE_DEFAULT_CREDENTIALS || '').toLowerCase() === 'true';
}

function isS3UploadMode() {
  return String(process.env.UPLOAD_STORAGE || '').toLowerCase() === 's3';
}

function assertS3UploadReady() {
  if (!isS3UploadMode()) return;
  if (!isS3Configured()) {
    throw new Error('UPLOAD_STORAGE=s3 mais S3 non configuré (AWS_S3_BUCKET, AWS_REGION, clés IAM)');
  }
}

let cachedClient = null;

function getS3Client() {
  if (cachedClient) return cachedClient;
  const { region, accessKeyId, secretAccessKey } = getS3Config();
  const opts = { region };
  if (accessKeyId && secretAccessKey) {
    opts.credentials = { accessKeyId, secretAccessKey };
  }
  cachedClient = new S3Client(opts);
  return cachedClient;
}

function isS3StoragePath(value) {
  return String(value || '').trim().startsWith(S3_URI_PREFIX);
}

function buildS3StorageUri(key) {
  const { bucket } = getS3Config();
  const cleanKey = String(key || '').replace(/^\/+/, '');
  return `${S3_URI_PREFIX}${bucket}/${cleanKey}`;
}

function parseS3StorageUri(uri) {
  const s = String(uri || '').trim();
  if (!isS3StoragePath(s)) return null;
  const rest = s.slice(S3_URI_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  return {
    bucket: rest.slice(0, slash),
    key: rest.slice(slash + 1),
  };
}

function buildDocumentObjectKey(fileName, subfolder = 'documents', prefixOverride = null) {
  const prefix = resolveStoragePrefix(prefixOverride);
  const safeName = String(fileName || 'document').replace(/\\/g, '/').replace(/^\/+/, '');
  return `${prefix}${subfolder}/${safeName}`.replace(/\/+/g, '/');
}

async function ensureS3PrefixExists(prefixOverride) {
  if (!isS3Configured()) return false;
  const prefix = resolveStoragePrefix(prefixOverride);
  const markerKey = `${prefix}.keep`;
  const client = getS3Client();
  const { bucket } = getS3Config();
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: markerKey })
    );
    return true;
  } catch {
    /* create marker */
  }
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: markerKey,
      Body: '',
      ContentType: 'application/octet-stream',
    })
  );
  return true;
}

async function verifyS3ObjectByKey(key, expectedSize = null) {
  if (!key || !isS3Configured()) return false;
  const { bucket } = getS3Config();
  try {
    const client = getS3Client();
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (expectedSize != null && Number(head.ContentLength) !== Number(expectedSize)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function uploadBufferToS3(buffer, { fileName, contentType, subfolder = 'documents', prefix = null } = {}) {
  assertS3UploadReady();
  if (!isS3Configured()) {
    throw new Error('S3 non configuré (AWS_S3_BUCKET, AWS_REGION, clés IAM)');
  }
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Buffer vide');
  }
  const { bucket } = getS3Config();
  const key = buildDocumentObjectKey(fileName, subfolder, prefix);
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    })
  );
  const verified = await verifyS3ObjectByKey(key, buffer.length);
  if (!verified) {
    throw new Error(`Vérification S3 échouée après upload (HeadObject): ${key}`);
  }
  return buildS3StorageUri(key);
}

async function headS3ObjectByKey(key) {
  return verifyS3ObjectByKey(key);
}

async function uploadLocalFileToS3(file, { subfolder = 'documents', prefix = null } = {}) {
  if (!isS3UploadMode()) return null;
  assertS3UploadReady();

  const localPath = file?.path;
  if (!localPath || !fs.existsSync(localPath)) {
    throw new Error('Fichier local temporaire introuvable pour upload S3');
  }

  const { bucket } = getS3Config();
  const fileName = file.filename || path.basename(localPath);
  const key = buildDocumentObjectKey(fileName, subfolder, prefix);
  const body = fs.readFileSync(localPath);
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: file.mimetype || 'application/octet-stream',
    })
  );

  const verified = await verifyS3ObjectByKey(key, body.length);
  if (!verified) {
    throw new Error(`Vérification S3 échouée après upload (HeadObject): ${key}`);
  }

  return buildS3StorageUri(key);
}

async function headS3Object(storagePath) {
  const parsed = parseS3StorageUri(storagePath);
  if (!parsed || !isS3Configured()) return false;
  try {
    const client = getS3Client();
    await client.send(
      new HeadObjectCommand({
        Bucket: parsed.bucket,
        Key: parsed.key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function deleteS3Object(storagePath) {
  const parsed = parseS3StorageUri(storagePath);
  if (!parsed || !isS3Configured()) return false;
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    })
  );
  return true;
}

function buildArchiveKeyFromSourceKey(sourceKey) {
  const clean = String(sourceKey || '').replace(/^\/+/, '');
  const slash = clean.indexOf('/');
  const cabinetPrefix = slash > 0 ? clean.slice(0, slash + 1) : '';
  const rest = slash > 0 ? clean.slice(slash + 1) : clean;
  const baseName = path.basename(rest.replace(/\\/g, '/'));
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${cabinetPrefix}archive/documents/${yyyy}/${mm}/${Date.now()}_${baseName}`.replace(/\/+/g, '/');
}

/**
 * Copie le fichier vers archive/ puis supprime l'original (récupérable si versioning S3 activé).
 * Retourne l'URI S3 de l'archive.
 */
async function archiveS3Object(storagePath) {
  const parsed = parseS3StorageUri(storagePath);
  if (!parsed || !isS3Configured()) return null;

  const archiveKey = buildArchiveKeyFromSourceKey(parsed.key);
  const client = getS3Client();

  await client.send(
    new CopyObjectCommand({
      Bucket: parsed.bucket,
      Key: archiveKey,
      CopySource: `${parsed.bucket}/${parsed.key}`,
    })
  );

  const archived = await verifyS3ObjectByKey(archiveKey);
  if (!archived) {
    throw new Error(`Échec vérification archive S3: ${archiveKey}`);
  }

  const keepOriginal =
    String(process.env.DOCUMENT_S3_KEEP_ORIGINAL_ON_DELETE || '').toLowerCase() === 'true';
  if (!keepOriginal) {
    await client.send(
      new DeleteObjectCommand({
        Bucket: parsed.bucket,
        Key: parsed.key,
      })
    );
  }

  return buildS3StorageUri(archiveKey);
}

async function tryServeDocumentFromS3(document, res, { inline = false } = {}) {
  const parsed = parseS3StorageUri(document?.cheminFichier);
  if (!parsed || !isS3Configured()) return false;

  const { resolveDocumentResponseContentType } = require('./documentFileStorage');

  try {
    const client = getS3Client();
    const resp = await client.send(
      new GetObjectCommand({
        Bucket: parsed.bucket,
        Key: parsed.key,
      })
    );
    if (!resp?.Body) return false;

    const contentType = resolveDocumentResponseContentType(
      document,
      resp.ContentType || 'application/octet-stream'
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(document.nom || 'document')}"`
    );
    if (inline) res.setHeader('Cache-Control', 'private, max-age=3600');
    if (resp.ContentLength) res.setHeader('Content-Length', String(resp.ContentLength));

    return new Promise((resolve) => {
      resp.Body.on('error', () => resolve(false));
      resp.Body.pipe(res);
      resp.Body.on('end', () => {
        console.log('✅ Document — S3:', document.cheminFichier);
        resolve(true);
      });
    });
  } catch (err) {
    console.warn('⚠️ Lecture S3 échouée:', err.message);
    return false;
  }
}

module.exports = {
  S3_URI_PREFIX,
  normalizePrefix,
  resolveStoragePrefix,
  getS3Config,
  isS3Configured,
  isS3UploadMode,
  assertS3UploadReady,
  isS3StoragePath,
  buildS3StorageUri,
  parseS3StorageUri,
  buildDocumentObjectKey,
  ensureS3PrefixExists,
  uploadBufferToS3,
  verifyS3ObjectByKey,
  headS3ObjectByKey,
  uploadLocalFileToS3,
  headS3Object,
  deleteS3Object,
  archiveS3Object,
  tryServeDocumentFromS3,
};

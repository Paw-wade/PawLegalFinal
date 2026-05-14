const express = require('express');
const multer = require('multer');
const { protect, authorize } = require('../middleware/auth');
const {
  saveThreadAttachment,
  listThreadAttachments,
  deleteThreadAttachment,
  MAX_FILE_BYTES,
} = require('../services/lexiaThreadAttachments');

const router = express.Router();

const LEXIA_KNOWLEDGE_READ_ROLES = [
  'client',
  'admin',
  'superadmin',
  'assistant',
  'comptable',
  'secretaire',
  'juriste',
  'stagiaire',
  'visiteur',
  'partenaire',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

async function readUploadedFileBuffer(file) {
  if (!file) return null;
  if (Buffer.isBuffer(file.buffer) && file.buffer.length > 0) {
    return file.buffer;
  }
  if (!file.stream) return null;

  const chunks = [];
  for await (const chunk of file.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  return buffer.length > 0 ? buffer : null;
}

router.use(protect, authorize(...LEXIA_KNOWLEDGE_READ_ROLES));

router.get('/', async (req, res) => {
  try {
    const threadId = String(req.query.threadId || '').trim();
    if (!threadId) {
      return res.status(400).json({ success: false, error: 'threadId requis' });
    }
    const attachments = await listThreadAttachments(req.user.id, threadId);
    res.json({ success: true, attachments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Erreur serveur' });
  }
});

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: `Fichier trop volumineux (max ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} Mo).`,
          code: 'FILE_TOO_LARGE',
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message || 'Erreur lors de l’import du fichier.',
        code: err.code || 'UPLOAD_ERROR',
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const contentType = String(req.headers['content-type'] || '');
    const threadId = String(req.body?.threadId || req.query?.threadId || '').trim();
    if (!threadId) {
      return res.status(400).json({ success: false, error: 'threadId requis', code: 'THREAD_ID_REQUIRED' });
    }
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({
        success: false,
        error: 'Requête invalide : import multipart attendu.',
        code: 'INVALID_MULTIPART',
      });
    }
    const buffer = await readUploadedFileBuffer(req.file);
    if (!buffer?.length) {
      return res.status(400).json({ success: false, error: 'Fichier requis', code: 'FILE_REQUIRED' });
    }
    const attachment = await saveThreadAttachment({
      userId: req.user.id,
      threadId,
      originalName: req.file?.originalname || 'piece-jointe',
      buffer,
      mimeType: req.file?.mimetype,
    });
    res.json({ success: true, attachment });
  } catch (err) {
    const code = err.code;
    const status =
      code === 'INVALID_THREAD' || code === 'EMPTY_FILE' || code === 'UNSUPPORTED_EXT'
        ? 400
        : code === 'FILE_TOO_LARGE' || code === 'ATTACHMENT_LIMIT'
          ? 413
          : 500;
    res.status(status).json({ success: false, error: err.message || 'Erreur serveur', code });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteThreadAttachment(req.user.id, req.params.id);
    res.json({ success: true, ...deleted });
  } catch (err) {
    const status = err.code === 'NOT_FOUND' ? 404 : 500;
    res.status(status).json({ success: false, error: err.message || 'Erreur serveur', code: err.code });
  }
});

module.exports = router;

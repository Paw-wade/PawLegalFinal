const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const M = require('../tenantModels');
require('../models/LexiaPawAiAttachment');
const { extractPlainTextFromKnowledgeBuffer } = require('./lexiaInternal');
const { extractImageTextWithGemini, getGeminiApiKey } = require('./lexiaGeminiOcr');

const MAX_ATTACHMENTS_PER_THREAD = 20;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_EXTRACT_CHARS_PER_FILE = 120_000;
const MAX_APPENDIX_CHARS = 220_000;

const ALLOWED_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.xml',
  '.pdf',
  '.doc',
  '.docx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.webm',
  '.ogg',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const AUDIO_EXTENSIONS = new Set(['.webm', '.ogg', '.mp3', '.wav', '.m4a', '.aac']);
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

const { ensureTenantUploadDir, getOrgIdFromStore } = require('../lib/tenant/uploads');

function getAttachmentsRootDir() {
  return ensureTenantUploadDir('lexia-attachments', getOrgIdFromStore());
}

function sanitizeThreadId(threadId) {
  const raw = String(threadId || '').trim();
  if (!raw || raw.length > 200) return null;
  if (/[\r\n\0]/.test(raw)) return null;
  return raw;
}

function normalizeAttachmentUserId(userId) {
  if (userId == null) return null;
  if (userId instanceof mongoose.Types.ObjectId) return userId;
  if (typeof userId === 'object' && mongoose.Types.ObjectId.isValid(userId)) return userId;
  const s = String(userId).trim();
  if (mongoose.Types.ObjectId.isValid(s) && /^[a-f\d]{24}$/i.test(s)) {
    return new mongoose.Types.ObjectId(s);
  }
  return s || null;
}

function sanitizeOriginalName(name) {
  const base = path.basename(String(name || 'fichier').trim()) || 'fichier';
  return base.replace(/[^\w.\- ()éèêëàâäùûüôöîïçÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ]/g, '_').slice(0, 200);
}

function mimeFromExt(ext) {
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xml':
      return 'application/xml';
    case '.md':
      return 'text/markdown';
    case '.txt':
      return 'text/plain';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.webm':
      return 'audio/webm';
    case '.ogg':
      return 'audio/ogg';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    case '.aac':
      return 'audio/aac';
    default:
      return 'application/octet-stream';
  }
}

function extensionFromMimeType(mimeType) {
  const normalized = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  switch (normalized) {
    case 'audio/webm':
    case 'video/webm':
      return '.webm';
    case 'audio/ogg':
      return '.ogg';
    case 'audio/mpeg':
      return '.mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return '.wav';
    case 'audio/mp4':
    case 'audio/aac':
      return '.m4a';
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'application/pdf':
      return '.pdf';
    case 'application/msword':
      return '.doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return '.docx';
    case 'application/xml':
    case 'text/xml':
      return '.xml';
    case 'text/markdown':
      return '.md';
    case 'text/plain':
      return '.txt';
    default:
      return '';
  }
}

function normalizeGeminiMimeType(mimeType, ext = '') {
  const normalized = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (normalized && normalized !== 'application/octet-stream') {
    return normalized;
  }
  const fromExt = mimeFromExt(ext || '');
  return fromExt === 'application/octet-stream' ? '' : fromExt;
}

function parseGeminiTextResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts)
    ? parts
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('\n')
        .trim()
    : '';
}

async function extractAudioTextWithGemini(buffer, mimeType, ext = '') {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    return { text: '', note: 'Note vocale : transcription automatique indisponible (GEMINI_API_KEY absente).' };
  }

  const model = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const candidates = [];
  for (const value of [
    normalizeGeminiMimeType(mimeType, ext),
    ext === '.webm' ? 'audio/webm' : '',
    ext === '.webm' ? 'video/webm' : '',
    ext === '.ogg' ? 'audio/ogg' : '',
    ext === '.m4a' ? 'audio/mp4' : '',
    ext === '.mp3' ? 'audio/mpeg' : '',
    ext === '.wav' ? 'audio/wav' : '',
  ]) {
    if (value && !candidates.includes(value)) candidates.push(value);
  }

  let lastNote = 'Note vocale : transcription automatique indisponible (erreur Gemini).';

  try {
    for (const candidateMime of candidates) {
      const res = await axios.post(
        url,
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text:
                    'Transcris fidèlement en français l’enregistrement audio joint. ' +
                    'Restitue uniquement la transcription, sans commentaire.',
                },
                {
                  inline_data: {
                    mime_type: candidateMime,
                    data: buffer.toString('base64'),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.1,
          },
        },
        { timeout: 180000, validateStatus: () => true }
      );

      if (res.status >= 400) {
        const apiMessage = String(res.data?.error?.message || '').trim();
        if (apiMessage) {
          lastNote = `Note vocale : transcription automatique indisponible (${apiMessage}).`;
        }
        continue;
      }

      const text = parseGeminiTextResponse(res.data);
      if (text) return { text, note: '' };
      lastNote = 'Note vocale : aucune parole détectée.';
    }

    return { text: '', note: lastNote };
  } catch (err) {
    return {
      text: '',
      note: `Note vocale : transcription automatique indisponible (${err.message || 'erreur'}).`,
    };
  }
}

async function extractAttachmentText(buffer, ext, mimeType) {
  const normalizedMime = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext) || normalizedMime.startsWith('image/')) {
    return extractImageTextWithGemini(buffer, mimeType || mimeFromExt(ext));
  }
  if (
    AUDIO_EXTENSIONS.has(ext) ||
    normalizedMime.startsWith('audio/') ||
    normalizedMime === 'video/webm'
  ) {
    return extractAudioTextWithGemini(buffer, mimeType || mimeFromExt(ext), ext);
  }

  let text = await extractPlainTextFromKnowledgeBuffer(buffer, ext);
  if (text.length > MAX_EXTRACT_CHARS_PER_FILE) {
    text = text.slice(0, MAX_EXTRACT_CHARS_PER_FILE);
  }
  if (!text.trim()) {
    if (ext === '.pdf') {
      const note = getGeminiApiKey()
        ? 'PDF (scan) : aucun texte exploitable après extraction et OCR.'
        : 'PDF scanné : configurez GEMINI_API_KEY sur le serveur pour activer l’OCR.';
      return { text: '', note };
    }
    return { text: '', note: 'Aucun texte exploitable extrait de ce fichier.' };
  }
  return { text, note: '' };
}

async function saveThreadAttachment({ userId, threadId, originalName, buffer, mimeType }) {
  const safeThreadId = sanitizeThreadId(threadId);
  if (!safeThreadId) {
    const err = new Error('Identifiant de discussion invalide.');
    err.code = 'INVALID_THREAD';
    throw err;
  }
  const ownerId = normalizeAttachmentUserId(userId);
  if (!ownerId) {
    const err = new Error('Utilisateur invalide pour la pièce jointe.');
    err.code = 'INVALID_USER';
    throw err;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error('Fichier vide.');
    err.code = 'EMPTY_FILE';
    throw err;
  }
  if (buffer.length > MAX_FILE_BYTES) {
    const err = new Error(`Fichier trop volumineux (max ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} Mo).`);
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }
  if (AUDIO_EXTENSIONS.has(path.extname(sanitizeOriginalName(originalName)).toLowerCase()) && buffer.length > MAX_AUDIO_BYTES) {
    const err = new Error(`Audio trop volumineux (max ${Math.floor(MAX_AUDIO_BYTES / (1024 * 1024))} Mo).`);
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }

  const count = await M.LexiaPawAiAttachment.countDocuments({ user: ownerId, threadId: safeThreadId });
  if (count >= MAX_ATTACHMENTS_PER_THREAD) {
    const err = new Error(`Maximum ${MAX_ATTACHMENTS_PER_THREAD} pièces jointes par discussion.`);
    err.code = 'ATTACHMENT_LIMIT';
    throw err;
  }

  const safeNameBase = sanitizeOriginalName(originalName);
  let safeName = safeNameBase;
  let ext = path.extname(safeNameBase).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const guessed = extensionFromMimeType(mimeType);
    if (guessed && ALLOWED_EXTENSIONS.has(guessed)) {
      ext = guessed;
      if (!path.extname(safeName)) safeName = `${safeName}${guessed}`;
    }
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error('Type de fichier non pris en charge pour Paw AI.');
    err.code = 'UNSUPPORTED_EXT';
    throw err;
  }

  const resolvedMime = String(mimeType || mimeFromExt(ext)).slice(0, 120);
  const { text, note } = await extractAttachmentText(buffer, ext, resolvedMime);

  const attachmentId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const userDir = path.join(getAttachmentsRootDir(), String(ownerId));
  await fsp.mkdir(userDir, { recursive: true });
  const storagePath = path.join(userDir, `${attachmentId}${ext}`);
  await fsp.writeFile(storagePath, buffer);

  const doc = await M.LexiaPawAiAttachment.create({
    user: ownerId,
    threadId: safeThreadId,
    originalName: safeName,
    mimeType: resolvedMime,
    size: buffer.length,
    storagePath,
    extractedText: text,
    extractionNote: note,
    empty: !String(text || '').trim(),
  });

  return {
    id: String(doc._id),
    threadId: safeThreadId,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    size: doc.size,
    empty: doc.empty,
    extractionNote: doc.extractionNote || '',
    transcript: String(text || '').trim(),
    preview: String(text || '').slice(0, 280),
  };
}

async function listThreadAttachments(userId, threadId) {
  const safeThreadId = sanitizeThreadId(threadId);
  const ownerId = normalizeAttachmentUserId(userId);
  if (!safeThreadId || !ownerId) return [];
  const rows = await M.LexiaPawAiAttachment.find({ user: ownerId, threadId: safeThreadId })
    .sort({ createdAt: 1 })
    .lean();
  return rows.map((row) => ({
    id: String(row._id),
    threadId: row.threadId,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    empty: !!row.empty,
    extractionNote: row.extractionNote || '',
    transcript: String(row.extractedText || '').trim(),
    preview: String(row.extractedText || '').slice(0, 280),
    createdAt: row.createdAt,
  }));
}

async function deleteThreadAttachment(userId, attachmentId) {
  const ownerId = normalizeAttachmentUserId(userId);
  if (!ownerId) {
    const err = new Error('Pièce jointe introuvable.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const doc = await M.LexiaPawAiAttachment.findOne({ _id: attachmentId, user: ownerId });
  if (!doc) {
    const err = new Error('Pièce jointe introuvable.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  try {
    if (doc.storagePath && fs.existsSync(doc.storagePath)) {
      await fsp.unlink(doc.storagePath);
    }
  } catch {
    /* ignore */
  }
  await doc.deleteOne();
  return { id: String(doc._id) };
}

async function buildThreadAttachmentAppendix(userId, threadId) {
  const safeThreadId = sanitizeThreadId(threadId);
  const ownerId = normalizeAttachmentUserId(userId);
  if (!safeThreadId || !ownerId) return '';

  const rows = await M.LexiaPawAiAttachment.find({ user: ownerId, threadId: safeThreadId })
    .sort({ createdAt: 1 })
    .lean();
  if (!rows.length) return '';

  const blocks = [];
  let used = 0;
  for (const row of rows) {
    const title = String(row.originalName || 'fichier').trim();
    const note = String(row.extractionNote || '').trim();
    let body = String(row.extractedText || '').trim();
    if (!body && note) body = note;
    if (!body) body = '(Aucun texte exploitable extrait.)';

    const remaining = MAX_APPENDIX_CHARS - used;
    if (remaining <= 0) break;
    if (body.length > remaining) body = `${body.slice(0, Math.max(0, remaining - 20))}\n…`;

    blocks.push(`#### Pièce jointe : ${title}\n\n${body}`);
    used += body.length + title.length + 32;
  }

  if (!blocks.length) return '';

  return [
    '### Pièces jointes de la discussion (mémoire du fil)',
    'Le client a fourni les documents ci-dessous. Tu dois t’appuyer sur leur contenu extrait pour répondre, citer ce qui est pertinent et réutiliser ces éléments dans les tours suivants de ce fil.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

function prependAttachmentsToLastUserMessage(messages, appendix) {
  if (!appendix?.trim() || !Array.isArray(messages) || !messages.length) return messages;
  const augmented = messages.map((m) => ({ ...m }));
  let lastUser = -1;
  for (let i = augmented.length - 1; i >= 0; i -= 1) {
    if (augmented[i]?.role === 'user') {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return augmented;
  const current = String(augmented[lastUser].content || '');
  augmented[lastUser] = {
    ...augmented[lastUser],
    content: `${appendix}\n\n---\n\n${current}`,
  };
  return augmented;
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_ATTACHMENTS_PER_THREAD,
  MAX_FILE_BYTES,
  saveThreadAttachment,
  listThreadAttachments,
  deleteThreadAttachment,
  buildThreadAttachmentAppendix,
  prependAttachmentsToLastUserMessage,
  sanitizeThreadId,
};

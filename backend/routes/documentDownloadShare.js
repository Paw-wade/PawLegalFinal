const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const DocumentDownloadShare = require('../models/DocumentDownloadShare');
const Document = require('../models/Document');
const RecoursTemplate = require('../models/RecoursTemplate');
const { protect, authorize } = require('../middleware/auth');
const {
  buildCabinetMessageVariables,
  buildEmailCtaButton,
  sendTemplatedTransactionalEmail,
} = require('../utils/emailTemplateMailer');
const { getPrimaryFrontendUrl } = require('../utils/frontendOrigins');
const {
  deliverDocumentFileResponse,
  resolveDocumentDownloadFileName,
  resolveDocumentDisplayTitle,
} = require('./documents');

const router = express.Router();
const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 24;

function publicDownloadPageUrl(token) {
  const base = getPrimaryFrontendUrl().replace(/\/+$/, '');
  return `${base}/telechargement/${encodeURIComponent(token)}`;
}

function extractDocumentIdFromUrl(rawUrl) {
  const m = String(rawUrl || '').match(/\/documents\/([a-f0-9]{24})(?:\/|$|\?)/i);
  return m ? m[1] : null;
}

async function findActiveShare(token) {
  const clean = String(token || '')
    .trim()
    .replace(/[^a-f0-9]/gi, '');
  if (clean.length < 32 || clean.length > 80) return null;
  const share = await DocumentDownloadShare.findOne({ token: clean }).lean();
  if (!share) return null;
  if (share.revokedAt) return null;
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return null;
  return share;
}

async function resolveSharePayload(share) {
  if (share.resourceType === 'document') {
    const doc = await Document.findById(share.resourceId).lean();
    if (!doc) return null;
    return {
      title: resolveDocumentDisplayTitle(doc),
      fileName: resolveDocumentDownloadFileName(doc),
      mimeType: doc.typeMime || 'application/octet-stream',
      document: doc,
    };
  }

  const tpl = await RecoursTemplate.findById(share.resourceId).lean();
  if (!tpl) return null;

  const docId = extractDocumentIdFromUrl(tpl.fileUrl);
  if (docId) {
    const doc = await Document.findById(docId).lean();
    if (doc) {
      return {
        title: tpl.title || resolveDocumentDisplayTitle(doc),
        fileName: resolveDocumentDownloadFileName(doc) || tpl.fileName || 'document',
        mimeType: tpl.mimeType || doc.typeMime || 'application/octet-stream',
        document: doc,
      };
    }
  }

  const fileUrl = String(tpl.fileUrl || '').trim();
  if (fileUrl.toLowerCase().startsWith('http')) {
    return {
      title: tpl.title || tpl.fileName || 'Document',
      fileName: tpl.fileName || 'document',
      mimeType: tpl.mimeType || 'application/octet-stream',
      externalUrl: fileUrl,
    };
  }

  return null;
}

// @route   GET /api/document-download-share/public/:token
router.get('/public/:token', async (req, res) => {
  try {
    const share = await findActiveShare(req.params.token);
    if (!share) {
      return res.status(404).json({ success: false, message: 'Lien introuvable ou expiré.' });
    }
    const payload = await resolveSharePayload(share);
    if (!payload) {
      return res.status(404).json({ success: false, message: 'Fichier introuvable.' });
    }
    return res.json({
      success: true,
      title: payload.title,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      expiresAt: share.expiresAt,
      message: share.message || '',
    });
  } catch (err) {
    console.error('[document-download-share] GET public:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   GET /api/document-download-share/public/:token/file
router.get('/public/:token/file', async (req, res) => {
  try {
    const share = await findActiveShare(req.params.token);
    if (!share) {
      return res.status(404).json({ success: false, message: 'Lien introuvable ou expiré.' });
    }
    const payload = await resolveSharePayload(share);
    if (!payload) {
      return res.status(404).json({ success: false, message: 'Fichier introuvable.' });
    }

    await DocumentDownloadShare.updateOne({ _id: share._id }, { $inc: { downloadCount: 1 } });

    if (payload.document) {
      return deliverDocumentFileResponse(payload.document, res);
    }
    if (payload.externalUrl) {
      return res.redirect(payload.externalUrl);
    }
    return res.status(404).json({ success: false, message: 'Fichier introuvable.' });
  } catch (err) {
    console.error('[document-download-share] GET file:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
    return undefined;
  }
});

// @route   POST /api/document-download-share/shares
router.post(
  '/shares',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('resourceType').isIn(['document', 'recours_template']).withMessage('resourceType invalide'),
    body('resourceId').notEmpty().withMessage('resourceId requis'),
    body('recipientEmail').optional({ values: 'falsy' }).isEmail().withMessage('E-mail invalide'),
    body('message').optional().trim().isLength({ max: 2000 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Erreurs de validation', errors: errors.array() });
      }

      const { resourceType, resourceId, recipientEmail, message } = req.body;
      const rid = String(resourceId).trim();
      if (!mongoose.Types.ObjectId.isValid(rid)) {
        return res.status(400).json({ success: false, message: 'Identifiant de ressource invalide.' });
      }

      let title = 'Document';
      if (resourceType === 'document') {
        const doc = await Document.findById(rid).lean();
        if (!doc) return res.status(404).json({ success: false, message: 'Document introuvable.' });
        title = resolveDocumentDisplayTitle(doc);
      } else {
        const tpl = await RecoursTemplate.findById(rid).select('title fileName').lean();
        if (!tpl) return res.status(404).json({ success: false, message: 'Modèle introuvable.' });
        title = tpl.title || tpl.fileName || title;
      }

      const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
      const expiresAt = new Date(Date.now() + SHARE_TTL_MS);
      const share = await DocumentDownloadShare.create({
        token,
        resourceType,
        resourceId: rid,
        createdBy: req.user.id,
        recipientEmail: recipientEmail ? String(recipientEmail).trim().toLowerCase() : '',
        message: message ? String(message).trim() : '',
        expiresAt,
      });

      const downloadUrl = publicDownloadPageUrl(token);
      const expiryLabel = expiresAt.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      if (share.recipientEmail) {
        const emailVariables = {
          title,
          downloadUrl,
          expiryLabel,
          downloadButtonBlock: buildEmailCtaButton(downloadUrl, 'Télécharger le document'),
          ...buildCabinetMessageVariables(share.message),
        };

        const emailResult = await sendTemplatedTransactionalEmail({
          templateCode: 'document_download_share',
          eventKey: 'document_download_share',
          to: share.recipientEmail,
          variables: emailVariables,
          fallback: {
            subject: 'Téléchargement de document — Ada Papers',
            htmlContent:
              '<p>Bonjour,</p><p>Ada Papers vous transmet un lien pour télécharger le document <strong>{{title}}</strong>.</p>{{cabinetMessageBlock}}<p>Le lien est valable 7 jours et permet plusieurs téléchargements.</p>{{downloadButtonBlock}}<p>Ce lien expire le {{expiryLabel}}.</p>',
            textContent:
              'Bonjour,\n\nAda Papers vous transmet un lien pour télécharger le document « {{title}} ».\n{{cabinetMessageText}}Lien de téléchargement (7 jours, usage multiple) :\n{{downloadUrl}}\n\nExpiration : {{expiryLabel}}',
          },
        });
        if (!emailResult.ok) {
          console.warn('[document-download-share] e-mail non envoye:', emailResult.error || 'unknown');
        }
      }

      return res.status(201).json({
        success: true,
        token,
        url: downloadUrl,
        expiresAt,
        shareId: share._id,
      });
    } catch (err) {
      console.error('[document-download-share] POST shares:', err?.message || err);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

module.exports = router;

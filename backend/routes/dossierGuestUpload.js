const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const DossierGuestUploadInvite = require('../models/DossierGuestUploadInvite');
const Document = require('../models/Document');
const Dossier = require('../models/Dossier');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const {
  buildCabinetMessageVariables,
  sendTemplatedTransactionalEmail,
} = require('../utils/emailTemplateMailer');
const { getPrimaryFrontendUrl } = require('../utils/frontendOrigins');

const router = express.Router();
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 24;

const BACKEND_ROOT = path.resolve(__dirname, '..');
const UPLOADS_ROOT = path.resolve(BACKEND_ROOT, 'uploads');
const localDocumentsDir = path.join(UPLOADS_ROOT, 'documents');
if (!fs.existsSync(localDocumentsDir)) {
  fs.mkdirSync(localDocumentsDir, { recursive: true });
}

const cloudinaryPkg = require('cloudinary');
const cloudinary = cloudinaryPkg.v2;
const createCloudinaryStorage = require('multer-storage-cloudinary');

const hasCloudinaryConfig =
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  !!process.env.CLOUDINARY_API_KEY &&
  !!process.env.CLOUDINARY_API_SECRET;

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const cloudinaryStorage = hasCloudinaryConfig
  ? createCloudinaryStorage({
      cloudinary: cloudinaryPkg,
      params: async (req, file) => {
        const isImage = (file.mimetype || '').startsWith('image/');
        return {
          folder: 'pawlegal/documents',
          resource_type: isImage ? 'image' : 'raw',
          public_id: `${Date.now()}-${(file.originalname || 'document').replace(/[^a-zA-Z0-9]/g, '_')}`,
        };
      },
    })
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, localDocumentsDir),
      filename: (req, file, cb) => {
        const safeName = (file.originalname || 'document')
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .replace(/_+/g, '_');
        cb(null, `${Date.now()}-${safeName}`);
      },
    });

const upload = multer({
  storage: cloudinaryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, true),
});

function normalizeCategorie(rawCategorie) {
  if (!rawCategorie) return 'autre';
  const normalized = String(rawCategorie)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  const mapping = {
    identite: 'identite',
    titre_sejour: 'titre_sejour',
    contrat: 'contrat',
    facture: 'facture',
    autre: 'autre',
  };
  return mapping[normalized] || 'autre';
}

function guestDepotPageUrl(token) {
  const base = getPrimaryFrontendUrl().replace(/\/+$/, '');
  return `${base}/depot-dossier/${encodeURIComponent(token)}`;
}

async function resolveDossierOwnerUserId(dossier) {
  if (dossier.user) {
    return dossier.user._id ? dossier.user._id : dossier.user;
  }
  if (dossier.clientEmail) {
    const linked = await User.findOne({
      email: String(dossier.clientEmail).trim().toLowerCase(),
    })
      .select('_id')
      .lean();
    if (linked?._id) return linked._id;
  }
  return null;
}

async function findActiveInvite(token) {
  const clean = String(token || '')
    .trim()
    .replace(/[^a-f0-9]/gi, '');
  if (clean.length < 32 || clean.length > 80) return null;
  const invite = await DossierGuestUploadInvite.findOne({ token: clean }).lean();
  if (!invite) return null;
  if (invite.revokedAt) return null;
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return null;
  return invite;
}

// @route   GET /api/dossier-guest-upload/public/:token
router.get('/public/:token', async (req, res) => {
  try {
    const invite = await findActiveInvite(req.params.token);
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Lien introuvable ou expiré.' });
    }
    const dossier = await Dossier.findById(invite.dossierId).select('titre numero').lean();
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier introuvable.' });
    }
    return res.json({
      success: true,
      dossierTitle: dossier.titre || dossier.numero || 'Dossier Ada Papers',
      expiresAt: invite.expiresAt,
      message: invite.message || '',
    });
  } catch (err) {
    console.error('[dossier-guest-upload] GET public:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   POST /api/dossier-guest-upload/public/:token
router.post('/public/:token', (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Le fichier est trop volumineux. Taille maximale : 10 Mo.',
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'Erreur lors du téléversement du fichier',
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const invite = await findActiveInvite(req.params.token);
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Lien introuvable ou expiré.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier téléversé.' });
    }

    const dossier = await Dossier.findById(invite.dossierId).select('user clientEmail titre numero').lean();
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier introuvable.' });
    }

    let ownerUserId = await resolveDossierOwnerUserId(dossier);
    if (!ownerUserId) {
      ownerUserId = invite.createdBy;
    }

    const { nom, description, categorie, contributorName } = req.body || {};
    const guestName = String(contributorName || '').trim().slice(0, 200);
    const docNom = String(nom || req.file.originalname || 'Document').trim().slice(0, 500);

    const document = await Document.create({
      user: ownerUserId,
      nom: docNom,
      nomFichier: req.file.filename,
      cheminFichier: req.file.path,
      typeMime: req.file.mimetype,
      taille: req.file.size,
      description: String(description || '').trim(),
      categorie: normalizeCategorie(categorie),
      dossierId: invite.dossierId,
      visibleToClient: false,
      confidentialReason: 'Document transmis par un tiers via lien sécurisé — en attente de validation par le cabinet.',
      uploadedViaGuestLink: true,
      guestUploadInviteId: invite._id,
      guestContributorName: guestName,
    });

    await DossierGuestUploadInvite.updateOne({ _id: invite._id }, { $inc: { uploadsCount: 1 } });

    try {
      const admins = await User.find({
        role: { $in: ['admin', 'superadmin'] },
        isActive: { $ne: false },
      }).select('_id');
      const dossierTitle = dossier.titre || dossier.numero || 'Dossier';
      const notifMessage = guestName
        ? `${guestName} a déposé « ${docNom} » sur le dossier « ${dossierTitle} » via un lien d’invitation.`
        : `Un tiers a déposé « ${docNom} » sur le dossier « ${dossierTitle} » via un lien d’invitation.`;
      for (const adm of admins) {
        await Notification.create({
          user: adm._id,
          type: 'document_uploaded',
          titre: 'Document reçu (tiers)',
          message: notifMessage,
          lien: '/admin/dossiers',
          metadata: {
            dossierId: String(invite.dossierId),
            documentId: String(document._id),
            guestUploadInviteId: String(invite._id),
          },
        });
      }
    } catch (notifErr) {
      console.error('[dossier-guest-upload] notifications admin:', notifErr?.message || notifErr);
    }

    return res.status(201).json({
      success: true,
      message: 'Document transmis avec succès. Merci.',
      document: {
        id: document._id,
        nom: document.nom,
        createdAt: document.createdAt,
      },
    });
  } catch (err) {
    console.error('[dossier-guest-upload] POST public:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors du dépôt.' });
  }
});

// @route   POST /api/dossier-guest-upload/invites
router.post(
  '/invites',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('dossierId').notEmpty().withMessage('dossierId requis'),
    body('recipientEmail').isEmail().withMessage('E-mail du destinataire invalide'),
    body('message').optional().trim().isLength({ max: 2000 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Erreurs de validation', errors: errors.array() });
      }

      const { dossierId, recipientEmail, message } = req.body;
      const dossier = await Dossier.findById(String(dossierId).trim()).select('titre numero').lean();
      if (!dossier) {
        return res.status(404).json({ success: false, message: 'Dossier introuvable.' });
      }

      const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const invite = await DossierGuestUploadInvite.create({
        token,
        dossierId: dossier._id,
        createdBy: req.user.id,
        recipientEmail: String(recipientEmail).trim().toLowerCase(),
        message: message ? String(message).trim() : '',
        expiresAt,
      });

      const depotUrl = guestDepotPageUrl(token);
      const dossierTitle = dossier.titre || dossier.numero || 'votre dossier';
      const expiryLabel = expiresAt.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const emailVariables = {
        dossierTitle,
        depotUrl,
        expiryLabel,
        ...buildCabinetMessageVariables(invite.message),
      };

      const emailResult = await sendTemplatedTransactionalEmail({
        templateCode: 'dossier_guest_upload_invite',
        eventKey: 'dossier_guest_upload_invite',
        to: invite.recipientEmail,
        variables: emailVariables,
        fallback: {
          subject: 'Dépôt de document — Ada Papers',
          htmlContent:
            '<p>Bonjour,</p><p>Ada Papers vous invite à transmettre un document pour le dossier <strong>{{dossierTitle}}</strong>.</p>{{cabinetMessageBlock}}<p>Utilisez le lien ci-dessous pour déposer votre fichier (valable 7 jours, plusieurs dépôts possibles) :</p><p><a href="{{depotUrl}}">{{depotUrl}}</a></p><p>Ce lien expire le {{expiryLabel}}.</p><p>Merci de ne pas transférer ce lien à d’autres personnes.</p>',
          textContent:
            'Bonjour,\n\nAda Papers vous invite à transmettre un document pour le dossier « {{dossierTitle}} ».\n{{cabinetMessageText}}Lien de dépôt (7 jours, usage multiple) :\n{{depotUrl}}\n\nExpiration : {{expiryLabel}}\n\nMerci de ne pas transférer ce lien à d’autres personnes.',
        },
      });
      if (!emailResult.ok) {
        console.warn('[dossier-guest-upload] e-mail non envoye:', emailResult.error || 'unknown');
      }

      return res.status(201).json({
        success: true,
        token,
        url: depotUrl,
        expiresAt,
        inviteId: invite._id,
      });
    } catch (err) {
      console.error('[dossier-guest-upload] POST invites:', err?.message || err);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

module.exports = router;

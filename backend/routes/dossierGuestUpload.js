const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const DossierGuestUploadInvite = require('../models/DossierGuestUploadInvite');
const DocumentRequest = require('../models/DocumentRequest');
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
const { uploadDocumentToRemoteStorage, removeLocalUploadTempFile } = require('../utils/documentRemoteUpload');
const { resolveCabinetForUser } = require('../utils/cabinetResolver');

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

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, localDocumentsDir),
  filename: (req, file, cb) => {
    const safeName = (file.originalname || 'document')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

async function uploadLocalFileToCloudinary(file) {
  const storage = String(process.env.UPLOAD_STORAGE || 'cloudinary').toLowerCase();
  if (storage === 'local' || storage === 's3') {
    return null;
  }
  if (!hasCloudinaryConfig) return null;
  const localPath = file?.path;
  if (!localPath || !fs.existsSync(localPath)) return null;
  const isImage = String(file.mimetype || '').startsWith('image/');
  const baseName = path.basename(String(file.filename || 'document'), path.extname(String(file.filename || '')));
  const result = await cloudinary.uploader.upload(localPath, {
    resource_type: isImage ? 'image' : 'raw',
    folder: 'pawlegal/documents',
    public_id: baseName || `${Date.now()}-document`,
    overwrite: true,
  });
  return result?.secure_url || null;
}

const upload = multer({
  storage: diskStorage,
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

    let cheminFichier;
    const cabinet = await resolveCabinetForUser(ownerUserId);
    const s3Prefix = cabinet?.s3Prefix || null;
    try {
      cheminFichier = await uploadDocumentToRemoteStorage(req.file, {
        backendRoot: BACKEND_ROOT,
        s3Prefix,
        uploadToCloudinary: () => uploadLocalFileToCloudinary(req.file),
      });
    } catch (uploadErr) {
      removeLocalUploadTempFile(req.file);
      console.error('Échec upload distant (invité) — document non créé:', uploadErr.message);
      return res.status(503).json({
        success: false,
        message:
          'Impossible d\'enregistrer le fichier. Réessayez dans quelques instants.',
      });
    }

    const document = await Document.create({
      user: ownerUserId,
      nom: docNom,
      nomFichier: req.file.filename,
      originalName: req.file.originalname,
      cheminFichier,
      typeMime: req.file.mimetype,
      taille: req.file.size,
      description: String(description || '').trim(),
      categorie: normalizeCategorie(categorie),
      dossierId: invite.dossierId,
      cabinetId: cabinet?._id || null,
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

// ============ SUIVI PUBLIC (demande sans compte, via suiviToken du dossier) ============

async function findDossierBySuiviToken(token) {
  const clean = String(token || '').trim().replace(/[^a-f0-9]/gi, '');
  if (clean.length < 32 || clean.length > 80) return null;
  return Dossier.findOne({ suiviToken: clean });
}

// Le lien de suivi n'expire que lorsque le dossier est clôturé.
function isDossierClosed(dossier) {
  const s = String(dossier?.statut || '').trim();
  return dossier?.estCloture === true || s === 'cloture';
}

// @route   GET /api/dossier-guest-upload/suivi/:token
// @desc    Vue publique de suivi : statut, étapes, documents partagés, demandes de documents
router.get('/suivi/:token', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) {
      return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif : votre dossier a été clôturé.' });
    }

    const documents = await Document.find({ dossierId: dossier._id, visibleToClient: true })
      .select('nom originalName createdAt').sort({ createdAt: -1 }).lean();
    // Documents déposés par le demandeur via ce lien (restent visibles/téléchargeables pour lui).
    const mesDocuments = await Document.find({ dossierId: dossier._id, uploadedViaGuestLink: true })
      .select('nom originalName createdAt').sort({ createdAt: -1 }).lean();
    const demandes = await DocumentRequest.find({ dossier: dossier._id, status: { $in: ['pending', 'sent'] } })
      .select('documentType documentTypeLabel description status createdAt').sort({ createdAt: 1 }).lean();

    // Le demandeur a-t-il déjà un compte ? (dossier rattaché, ou compte avec le même e-mail)
    const clientEmail = (dossier.clientEmail || '').trim();
    let compteExiste = !!dossier.user;
    if (!compteExiste && clientEmail) {
      const u = await User.findOne({ email: clientEmail.toLowerCase() }).select('_id').lean();
      compteExiste = !!u;
    }

    return res.json({
      success: true,
      dossier: {
        id: String(dossier._id),
        titre: dossier.titre,
        numero: dossier.numero || null,
        statut: dossier.statut,
        etapesSupplementaires: dossier.etapesSupplementaires || [],
        categorie: dossier.categorie,
        createdAt: dossier.createdAt,
        updatedAt: dossier.updatedAt,
        clientPrenom: dossier.clientPrenom || '',
      },
      compte: { existe: compteExiste, email: clientEmail },
      documents: documents.map((d) => ({ id: String(d._id), nom: d.nom || d.originalName || 'Document', createdAt: d.createdAt })),
      mesDocuments: mesDocuments.map((d) => ({ id: String(d._id), nom: d.nom || d.originalName || 'Document', createdAt: d.createdAt })),
      documentRequests: demandes.map((r) => ({
        id: String(r._id),
        libelle: r.documentTypeLabel || r.documentType || 'Document',
        description: r.description || '',
        status: r.status,
      })),
    });
  } catch (err) {
    console.error('[suivi] GET:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route   POST /api/dossier-guest-upload/suivi/:token/documents
// @desc    Le porteur du lien dépose un document (éventuellement pour une demande) → dossier
router.post('/suivi/:token/documents', (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || 'Fichier invalide.' });
    next();
  });
}, async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) {
      return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif : votre dossier a été clôturé.' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier téléversé.' });

    const { requestId, nom, description } = req.body || {};
    let demande = null;
    if (requestId) {
      demande = await DocumentRequest.findOne({ _id: requestId, dossier: dossier._id });
    }

    let ownerUserId = await resolveDossierOwnerUserId(dossier);
    if (!ownerUserId) ownerUserId = dossier.createdBy || null;
    if (!ownerUserId) {
      const anAdmin = await User.findOne({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id').lean();
      ownerUserId = anAdmin?._id || null;
    }
    const cabinet = await resolveCabinetForUser(ownerUserId);
    const docNom = String(nom || (demande && (demande.documentTypeLabel || demande.documentType)) || req.file.originalname || 'Document').trim().slice(0, 500);

    let cheminFichier;
    try {
      cheminFichier = await uploadDocumentToRemoteStorage(req.file, {
        backendRoot: BACKEND_ROOT,
        s3Prefix: cabinet?.s3Prefix || null,
        uploadToCloudinary: () => uploadLocalFileToCloudinary(req.file),
      });
    } catch (uploadErr) {
      removeLocalUploadTempFile(req.file);
      console.error('[suivi] upload distant échoué:', uploadErr.message);
      return res.status(503).json({ success: false, message: 'Impossible d\'enregistrer le fichier. Réessayez.' });
    }

    const document = await Document.create({
      user: ownerUserId,
      nom: docNom,
      nomFichier: req.file.filename,
      originalName: req.file.originalname,
      cheminFichier,
      typeMime: req.file.mimetype,
      taille: req.file.size,
      description: String(description || '').trim(),
      categorie: demande ? normalizeCategorie(demande.documentType) : 'autre',
      dossierId: dossier._id,
      cabinetId: cabinet?._id || null,
      visibleToClient: false,
      confidentialReason: 'Document déposé par le demandeur via le lien de suivi — en attente de validation.',
      uploadedViaGuestLink: true,
      guestContributorName: `${dossier.clientPrenom || ''} ${dossier.clientNom || ''}`.trim().slice(0, 200),
    });

    // Marquer la demande de document comme satisfaite.
    if (demande && demande.status !== 'received') {
      demande.status = 'received';
      demande.document = document._id;
      try { await demande.save(); } catch (e) { console.error('[suivi] maj demande:', e.message || e); }
    }

    // Notifier les admins.
    try {
      const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id');
      const dossierTitle = dossier.titre || dossier.numero || 'Dossier';
      const msg = `Le demandeur a déposé « ${docNom} » sur le dossier « ${dossierTitle} » via son lien de suivi${demande ? ' (demande de document satisfaite)' : ''}.`;
      for (const adm of admins) {
        await Notification.create({
          user: adm._id, type: 'document_uploaded', titre: 'Document reçu (suivi)', message: msg,
          lien: '/admin/dossiers', metadata: { dossierId: String(dossier._id), documentId: String(document._id) },
        });
      }
    } catch (e) { console.error('[suivi] notif admin:', e.message || e); }

    return res.status(201).json({ success: true, message: 'Document transmis. Merci.', document: { id: String(document._id), nom: document.nom } });
  } catch (err) {
    console.error('[suivi] POST documents:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors du dépôt.' });
  }
});

// @route   GET /api/dossier-guest-upload/suivi/:token/documents/:docId/download
// @desc    Télécharger un document du suivi (déposé par le demandeur ou partagé par le cabinet)
router.get('/suivi/:token/documents/:docId/download', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) {
      return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif : votre dossier a été clôturé.' });
    }
    const doc = await Document.findOne({ _id: req.params.docId, dossierId: dossier._id });
    if (!doc || !(doc.uploadedViaGuestLink === true || doc.visibleToClient === true)) {
      return res.status(404).json({ success: false, message: 'Document introuvable.' });
    }
    const { deliverDocumentFileResponse } = require('./documents');
    return deliverDocumentFileResponse(doc, res);
  } catch (err) {
    console.error('[suivi] GET download:', err?.message || err);
    if (!res.headersSent) return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    return undefined;
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

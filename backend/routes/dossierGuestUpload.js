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
const Message = require('../models/Message');
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

// Adresses e-mail du cabinet (ADMIN_EMAILS, séparateurs , ; espace).
function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Coordonnées de contact affichées sur la page de suivi (surchargées par l'environnement).
function getCabinetContact() {
  return {
    nom: (process.env.CABINET_CONTACT_NAME || 'Ada Papers').trim(),
    telephone: (process.env.CABINET_CONTACT_PHONE || '+33 7 68 03 33 58').trim(),
    email: (process.env.CABINET_CONTACT_EMAIL || 'contact@adapapers.fr').trim(),
  };
}

// Prochaine étape prévue : première étape supplémentaire non encore datée/atteinte.
function computeProchaineEtape(etapes) {
  const list = Array.isArray(etapes) ? [...etapes] : [];
  list.sort((a, b) => (a?.ordre ?? 0) - (b?.ordre ?? 0));
  const next = list.find((e) => e && !e.date && (e.statut ? e.statut !== 'termine' : true));
  return next?.label || null;
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
      .select('nom originalName createdAt taille typeMime validationStatus validationMotif').sort({ createdAt: -1 }).lean();
    const demandes = await DocumentRequest.find({ dossier: dossier._id, status: { $in: ['pending', 'sent'] } })
      .select('documentType documentTypeLabel description message isUrgent status createdAt').sort({ createdAt: 1 }).lean();
    // Fiches de constitution : demandes (à remplir) + fiches déjà remplies.
    const FicheRequest = require('../models/FicheRequest');
    const FicheConstitution = require('../models/FicheConstitution');
    const PieceRequest = require('../models/PieceRequest');
    const ficheRequests = await FicheRequest.find({ dossier: dossier._id }).sort({ createdAt: 1 }).lean();
    const fichesRemplies = await FicheConstitution.find({ dossier: dossier._id }).select('typeFiche titre createdAt').sort({ createdAt: -1 }).lean();
    const pieceRequestsList = await PieceRequest.find({ dossier: dossier._id, statut: { $ne: 'annulee' } }).sort({ createdAt: 1 }).lean();

    // Le demandeur a-t-il déjà un compte ? (dossier rattaché, ou compte avec le même e-mail)
    const clientEmail = (dossier.clientEmail || '').trim();
    let compteExiste = !!dossier.user;
    if (!compteExiste && clientEmail) {
      const u = await User.findOne({ email: clientEmail.toLowerCase() }).select('_id').lean();
      compteExiste = !!u;
    }

    const champsFormulaire = Array.isArray(dossier.champsFormulaire)
      ? dossier.champsFormulaire
          .filter((c) => c && (c.valeur !== undefined && c.valeur !== null && String(c.valeur).trim() !== ''))
          .map((c) => ({ libelle: c.libelle || c.nom || '', valeur: String(c.valeur) }))
      : [];

    return res.json({
      success: true,
      dossier: {
        id: String(dossier._id),
        titre: dossier.titre,
        numero: dossier.numero || null,
        statut: dossier.statut,
        etapesSupplementaires: dossier.etapesSupplementaires || [],
        prochaineEtape: computeProchaineEtape(dossier.etapesSupplementaires),
        categorie: dossier.categorie,
        description: dossier.description || '',
        champsFormulaire,
        recommandations: Array.isArray(dossier.recommandations)
          ? dossier.recommandations.map((r) => ({
              id: String(r._id),
              formeJuridiqueRecommandee: r.formeJuridiqueRecommandee || '',
              demarcheRecommandee: r.demarcheRecommandee || '',
              motif: r.motif || '',
              statut: r.statut || 'en_attente',
              motifRefus: r.motifRefus || '',
              createdAt: r.createdAt,
              decidedAt: r.decidedAt || null,
            }))
          : [],
        createdAt: dossier.createdAt,
        updatedAt: dossier.updatedAt,
        clientPrenom: dossier.clientPrenom || '',
      },
      cabinet: getCabinetContact(),
      compte: { existe: compteExiste, email: clientEmail },
      documents: documents.map((d) => ({ id: String(d._id), nom: d.nom || d.originalName || 'Document', createdAt: d.createdAt })),
      mesDocuments: mesDocuments.map((d) => ({
        id: String(d._id),
        nom: d.nom || d.originalName || 'Document',
        createdAt: d.createdAt,
        taille: d.taille || 0,
        validationStatus: d.validationStatus || 'en_attente',
        validationMotif: d.validationMotif || '',
      })),
      documentRequests: demandes.map((r) => ({
        id: String(r._id),
        libelle: r.documentTypeLabel || r.documentType || 'Document',
        description: r.description || '',
        message: r.message || '',
        isUrgent: r.isUrgent === true,
        status: r.status,
      })),
      ficheRequests: ficheRequests.map((r) => ({
        id: String(r._id),
        typeFiche: r.typeFiche,
        titre: r.titre || '',
        pourPersonne: r.pourPersonne || '',
        message: r.message || '',
        statut: r.statut,
        validationStatus: r.validationStatus || 'en_attente',
        validationMotif: r.validationMotif || '',
        ficheId: r.fiche ? String(r.fiche) : null,
      })),
      fiches: fichesRemplies.map((f) => ({ id: String(f._id), typeFiche: f.typeFiche, titre: f.titre || '', createdAt: f.createdAt })),
      pieceRequests: pieceRequestsList.map((p) => ({ id: String(p._id), libelle: p.libelle, nature: p.nature, pourPersonne: p.pourPersonne || '', note: p.note || '', statut: p.statut, validationStatus: p.validationStatus || 'en_attente', validationMotif: p.validationMotif || '' })),
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

// @route   POST /api/dossier-guest-upload/suivi/:token/message
// @desc    Le porteur du lien envoie un message / une question au cabinet (→ note interne)
router.post('/suivi/:token/message', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) {
      return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif : votre dossier a été clôturé.' });
    }

    const contenu = String((req.body && req.body.contenu) || '').trim();
    if (contenu.length < 2) return res.status(400).json({ success: false, message: 'Votre message est vide.' });
    if (contenu.length > 5000) return res.status(400).json({ success: false, message: 'Message trop long (5000 caractères max).' });
    const contactEmail = String((req.body && req.body.email) || dossier.clientEmail || '').trim().toLowerCase();
    const contactTel = String((req.body && req.body.telephone) || dossier.clientTelephone || '').trim();

    const auteur = `${dossier.clientPrenom || ''} ${dossier.clientNom || ''}`.trim() || 'Le demandeur';
    const dossierTitle = dossier.titre || dossier.numero || 'Dossier';
    const frontUrl = (getPrimaryFrontendUrl() || '').replace(/\/+$/, '');
    const dossierUrl = `${frontUrl}/admin/dossiers?dossier=${String(dossier._id)}`;

    // 1) Rattacher le message au dossier (modèle Message → dossier.messages, visible côté admin).
    const messageDoc = await Message.create({
      name: auteur,
      email: contactEmail || 'non-renseigne@adapapers.fr',
      phone: contactTel,
      subject: `Message via lien de suivi — ${dossierTitle}`.slice(0, 200),
      message: contenu,
    });
    try {
      await Dossier.updateOne({ _id: dossier._id }, { $push: { messages: messageDoc._id } });
    } catch (e) { console.error('[suivi] rattachement message au dossier:', e.message || e); }

    // 2) Notifications in-app aux admins/superadmins.
    try {
      const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id');
      for (const adm of admins) {
        await Notification.create({
          user: adm._id, type: 'message_received', titre: 'Message via lien de suivi',
          message: `${auteur} a envoyé un message sur le dossier « ${dossierTitle} ».`,
          lien: '/admin/dossiers', metadata: { dossierId: String(dossier._id), messageId: String(messageDoc._id) },
        });
      }
    } catch (e) { console.error('[suivi] notif message:', e.message || e); }

    // 3) E-mail au cabinet (ADMIN_EMAILS), envoi individuel.
    const coordTxt = [contactEmail && `E-mail : ${contactEmail}`, contactTel && `Tél. : ${contactTel}`].filter(Boolean).join('\n');
    for (const adminEmail of parseAdminEmails()) {
      try {
        await sendTemplatedTransactionalEmail({
          templateCode: 'dossier_suivi_message',
          eventKey: 'dossier_suivi_message',
          to: adminEmail,
          toName: 'Équipe Ada Papers',
          variables: { auteur, email: contactEmail, telephone: contactTel, titre: dossierTitle, contenu, dossierUrl },
          fallback: {
            subject: `Message du demandeur — ${dossierTitle}`,
            htmlContent: `<p>${escapeHtml(auteur)} a envoyé un message via le lien de suivi du dossier <strong>${escapeHtml(dossierTitle)}</strong> :</p>
<blockquote style="border-left:3px solid #cbd5e1;padding-left:12px;color:#334155">${escapeHtml(contenu).replace(/\n/g, '<br>')}</blockquote>
<p><strong>Contact :</strong> ${escapeHtml(contactEmail || '—')}${contactTel ? ` · ${escapeHtml(contactTel)}` : ''}</p>
<p>Ouvrir le dossier : <a href="${escapeHtml(dossierUrl)}">${escapeHtml(dossierUrl)}</a></p>`,
            textContent: `${auteur} a envoyé un message via le lien de suivi du dossier « ${dossierTitle} » :\n\n${contenu}\n\n${coordTxt}\n\nDossier : ${dossierUrl}`,
          },
        });
      } catch (e) { console.error('[suivi] email admin message:', e.message || e); }
    }

    return res.status(201).json({ success: true, message: 'Votre message a bien été transmis au cabinet.' });
  } catch (err) {
    console.error('[suivi] POST message:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route   DELETE /api/dossier-guest-upload/suivi/:token/documents/:docId
// @desc    Le porteur du lien retire un document qu'il a déposé (tant qu'il n'est pas validé)
router.delete('/suivi/:token/documents/:docId', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) {
      return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif : votre dossier a été clôturé.' });
    }
    const doc = await Document.findOne({ _id: req.params.docId, dossierId: dossier._id, uploadedViaGuestLink: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Document introuvable.' });
    if (doc.validationStatus === 'valide') {
      return res.status(409).json({ success: false, message: 'Ce document a déjà été validé par le cabinet et ne peut plus être retiré.' });
    }
    // Rouvrir une éventuelle demande de document satisfaite par ce fichier.
    try {
      await DocumentRequest.updateMany(
        { dossier: dossier._id, document: doc._id },
        { $set: { status: 'pending', document: null, receivedAt: null } }
      );
    } catch (e) { console.error('[suivi] réouverture demande:', e.message || e); }
    await Document.deleteOne({ _id: doc._id });
    return res.json({ success: true, message: 'Document retiré.' });
  } catch (err) {
    console.error('[suivi] DELETE document:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route   POST /api/dossier-guest-upload/suivi/:token/recommandations/:recId/decision
// @desc    Le porteur du lien accepte ou refuse une recommandation de l'équipe
router.post('/suivi/:token/recommandations/:recId/decision', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) {
      return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif : votre dossier a été clôturé.' });
    }
    const decision = String((req.body && req.body.decision) || '').trim();
    if (!['acceptee', 'refusee'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Décision invalide.' });
    }
    const rec = dossier.recommandations && dossier.recommandations.id(req.params.recId);
    if (!rec) return res.status(404).json({ success: false, message: 'Recommandation introuvable.' });
    if (rec.statut !== 'en_attente') {
      return res.status(409).json({ success: false, message: 'Cette recommandation a déjà fait l\'objet d\'une décision.' });
    }

    rec.statut = decision;
    rec.decidedAt = new Date();
    if (decision === 'refusee') rec.motifRefus = String((req.body && req.body.motifRefus) || '').trim().slice(0, 1000);
    if (decision === 'acceptee') {
      const { applyAcceptedRecommendation } = require('../utils/recommandations');
      applyAcceptedRecommendation(dossier, rec);
    }
    dossier.markModified('recommandations');
    await dossier.save();

    // Notifier l'équipe (in-app + e-mail).
    const titre = dossier.titre || dossier.numero || 'un dossier';
    const frontUrl = (getPrimaryFrontendUrl() || '').replace(/\/+$/, '');
    const dossierUrl = `${frontUrl}/admin/dossiers?dossierId=${String(dossier._id)}`;
    const verbe = decision === 'acceptee' ? 'accepté' : 'refusé';
    try {
      const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id');
      for (const adm of admins) {
        await Notification.create({
          user: adm._id, type: 'dossier_updated', titre: `Recommandation ${verbe}e`,
          message: `Le demandeur a ${verbe} une recommandation sur le dossier « ${titre} ».`,
          lien: '/admin/dossiers', metadata: { dossierId: String(dossier._id), recommandationId: String(rec._id) },
        });
      }
    } catch (e) { console.error('[suivi] notif décision recommandation:', e.message || e); }
    for (const adminEmail of parseAdminEmails()) {
      try {
        await sendTemplatedTransactionalEmail({
          templateCode: 'dossier_recommandation_decision',
          eventKey: 'dossier_recommandation_decision',
          to: adminEmail,
          toName: 'Équipe Ada Papers',
          variables: { titre, decision: verbe, dossierUrl },
          fallback: {
            subject: `Recommandation ${verbe}e — ${titre}`,
            htmlContent: `<p>Le demandeur a <strong>${escapeHtml(verbe)}</strong> une recommandation sur le dossier « ${escapeHtml(titre)} » via son lien de suivi.</p><p>Ouvrir le dossier : <a href="${escapeHtml(dossierUrl)}">${escapeHtml(dossierUrl)}</a></p>`,
            textContent: `Le demandeur a ${verbe} une recommandation sur le dossier « ${titre} » via son lien de suivi.\nDossier : ${dossierUrl}`,
          },
        });
      } catch (e) { console.error('[suivi] email décision recommandation:', e.message || e); }
    }

    return res.json({ success: true, message: decision === 'acceptee' ? 'Recommandation acceptée.' : 'Recommandation refusée.' });
  } catch (err) {
    console.error('[suivi] POST décision recommandation:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route   POST /api/dossier-guest-upload/suivi/:token/fiche-requests/:reqId/remplir
// @desc    Le porteur du lien remplit une fiche demandée (sans compte)
router.post('/suivi/:token/fiche-requests/:reqId/remplir', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) {
      return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif : votre dossier a été clôturé.' });
    }
    const FicheRequest = require('../models/FicheRequest');
    const FicheConstitution = require('../models/FicheConstitution');
    const fr = await FicheRequest.findOne({ _id: req.params.reqId, dossier: dossier._id });
    if (!fr) return res.status(404).json({ success: false, message: 'Demande de fiche introuvable.' });
    const { getSchema } = require('../fiches/registry');
    const schema = getSchema(fr.typeFiche);
    const fiche = await FicheConstitution.create({
      dossier: dossier._id, typeFiche: fr.typeFiche, titre: (schema && schema.titre) || fr.titre,
      data: (req.body && req.body.data) || {}, viaGuestLink: true,
    });
    fr.statut = 'remplie'; fr.fiche = fiche._id; fr.remplieAt = new Date();
    await fr.save();

    // Enregistrer le PDF de la fiche comme document du dossier (best-effort).
    try {
      let ownerId = await resolveDossierOwnerUserId(dossier);
      if (!ownerId) ownerId = dossier.createdBy || null;
      const { persistFichePdfAsDocument } = require('../fiches/persistFichePdf');
      const doc = await persistFichePdfAsDocument(fiche, dossier, ownerId);
      fiche.document = doc._id; await fiche.save();
    } catch (e) { console.error('[suivi] PDF fiche → document:', e.message || e); }

    // Générer la checklist de constitution (états civils, pièces d'identité, casiers/déclarations).
    try {
      const { ensureConstitutionChecklist } = require('../fiches/checklist');
      await ensureConstitutionChecklist(dossier._id, schema, fiche.data, null);
    } catch (e) { console.error('[suivi] génération checklist:', e.message || e); }

    // Inviter par e-mail chaque associé dont l'adresse est renseignée (best-effort).
    let invitationsSent = 0;
    try {
      const { sendAssocieInvitations } = require('../fiches/associeInvitations');
      const cab = getCabinetContact();
      const inv = await sendAssocieInvitations(dossier._id, schema, fiche.data, {
        origin: req.body && req.body.origin, createdViaGuest: true, cabinetNom: cab && cab.nom,
      });
      invitationsSent = (inv && inv.sent) || 0;
    } catch (e) { console.error('[suivi] invitations associés:', e.message || e); }

    // Notifier l'équipe (in-app + e-mail).
    const titre = dossier.titre || dossier.numero || 'un dossier';
    const frontUrl = (getPrimaryFrontendUrl() || '').replace(/\/+$/, '');
    const dossierUrl = `${frontUrl}/admin/dossiers?dossierId=${String(dossier._id)}`;
    try {
      const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id');
      for (const adm of admins) {
        await Notification.create({
          user: adm._id, type: 'document_received', titre: 'Fiche remplie',
          message: `Le demandeur a rempli « ${fiche.titre} » sur le dossier « ${titre} ».`,
          lien: '/admin/dossiers', metadata: { dossierId: String(dossier._id), ficheId: String(fiche._id) },
        });
      }
    } catch (e) { console.error('[suivi] notif fiche remplie:', e.message || e); }
    for (const adminEmail of parseAdminEmails()) {
      try {
        await sendTemplatedTransactionalEmail({
          templateCode: 'dossier_fiche_remplie', eventKey: 'dossier_fiche_remplie', to: adminEmail, toName: 'Équipe Ada Papers',
          variables: { titre, fiche: fiche.titre, dossierUrl },
          fallback: {
            subject: `Fiche remplie — ${titre}`,
            htmlContent: `<p>Le demandeur a rempli la fiche <strong>${escapeHtml(fiche.titre)}</strong> sur le dossier « ${escapeHtml(titre)} » via son lien de suivi.</p><p>Ouvrir le dossier : <a href="${escapeHtml(dossierUrl)}">${escapeHtml(dossierUrl)}</a></p>`,
            textContent: `Le demandeur a rempli la fiche « ${fiche.titre} » sur le dossier « ${titre} ».\nDossier : ${dossierUrl}`,
          },
        });
      } catch (e) { console.error('[suivi] email fiche remplie:', e.message || e); }
    }

    return res.status(201).json({ success: true, message: 'Fiche enregistrée. Merci.', invitationsSent, fiche: { id: String(fiche._id), typeFiche: fiche.typeFiche, titre: fiche.titre } });
  } catch (err) {
    console.error('[suivi] POST remplir fiche:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route   POST /api/dossier-guest-upload/suivi/:token/etat-civil-request
// @desc    Le porteur du lien ajoute une fiche d'état civil pour une personne supplémentaire
router.post('/suivi/:token/etat-civil-request', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) {
      return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif : votre dossier a été clôturé.' });
    }
    const FicheRequest = require('../models/FicheRequest');
    const { getSchema } = require('../fiches/registry');
    const ec = getSchema('etat_civil');
    const nom = String((req.body && req.body.pourPersonne) || '').trim();
    await FicheRequest.create({
      dossier: dossier._id, typeFiche: 'etat_civil',
      titre: nom ? `${ec.titre} — ${nom}` : ec.titre, pourPersonne: nom,
    });
    return res.status(201).json({ success: true, message: 'Fiche d\'état civil ajoutée.' });
  } catch (err) {
    console.error('[suivi] POST etat-civil-request:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route   POST /api/dossier-guest-upload/suivi/:token/piece-requests
// @desc    Le porteur du lien ajoute une pièce à fournir
router.post('/suivi/:token/piece-requests', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif.' });
    const libelle = String((req.body && req.body.libelle) || '').trim();
    if (!libelle) return res.status(400).json({ success: false, message: 'Libellé requis.' });
    const PieceRequest = require('../models/PieceRequest');
    const natures = ['identite', 'casier', 'statuts', 'procuration', 'autre'];
    const nature = natures.includes(req.body && req.body.nature) ? req.body.nature : 'autre';
    await PieceRequest.create({ dossier: dossier._id, libelle, nature, pourPersonne: String((req.body && req.body.pourPersonne) || '').trim() });
    return res.status(201).json({ success: true, message: 'Pièce ajoutée.' });
  } catch (err) {
    console.error('[suivi] POST piece-requests:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route   POST /api/dossier-guest-upload/suivi/:token/piece-requests/:pieceId/fournir
router.post('/suivi/:token/piece-requests/:pieceId/fournir', (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || 'Fichier invalide.' });
    next();
  });
}, async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif.' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier.' });
    const PieceRequest = require('../models/PieceRequest');
    const piece = await PieceRequest.findOne({ _id: req.params.pieceId, dossier: dossier._id });
    if (!piece) return res.status(404).json({ success: false, message: 'Pièce introuvable.' });
    let ownerUserId = await resolveDossierOwnerUserId(dossier);
    if (!ownerUserId) ownerUserId = dossier.createdBy || null;
    if (!ownerUserId) {
      const anAdmin = await User.findOne({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id').lean();
      ownerUserId = anAdmin?._id || null;
    }
    const { persistDocumentForDossier } = require('../utils/pieceUpload');
    let doc;
    try {
      doc = await persistDocumentForDossier(req.file, { dossierId: dossier._id, ownerUserId, contributorName: piece.pourPersonne || `${dossier.clientPrenom || ''} ${dossier.clientNom || ''}`.trim(), nom: piece.libelle });
    } catch (e) {
      return res.status(503).json({ success: false, message: 'Enregistrement du fichier impossible. Réessayez.' });
    }
    piece.statut = 'fourni'; piece.document = doc._id; piece.fourniAt = new Date();
    await piece.save();
    try {
      const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id');
      for (const a of admins) await Notification.create({ user: a._id, type: 'document_received', titre: 'Pièce reçue', message: `« ${piece.libelle} » déposée sur le dossier « ${dossier.titre || ''} ».`, lien: '/admin/dossiers', metadata: { dossierId: String(dossier._id), documentId: String(doc._id) } });
    } catch (e) { /* ignore */ }
    return res.status(201).json({ success: true, message: 'Pièce transmise. Merci.' });
  } catch (err) {
    console.error('[suivi] POST piece fournir:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route   POST /api/dossier-guest-upload/suivi/:token/fiche-invites
// @desc    Le porteur du lien de suivi génère un lien d'invitation ciblé pour une personne
router.post('/suivi/:token/fiche-invites', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    if (isDossierClosed(dossier)) return res.status(410).json({ success: false, message: 'Ce lien de suivi n\'est plus actif.' });
    const FicheInvite = require('../models/FicheInvite');
    const ids = Array.isArray(req.body && req.body.ficheRequestIds) ? req.body.ficheRequestIds : [];
    if (ids.length === 0) return res.status(400).json({ success: false, message: 'Aucune fiche sélectionnée.' });
    const token = crypto.randomBytes(24).toString('hex');
    const personne = String((req.body && req.body.personne) || '').trim();
    const PieceRequest = require('../models/PieceRequest');
    const pieceIds = personne
      ? (await PieceRequest.find({ dossier: dossier._id, pourPersonne: personne, statut: 'a_fournir' }).select('_id').lean()).map((p) => p._id)
      : [];
    await FicheInvite.create({
      token, dossier: dossier._id, ficheRequests: ids, pieceRequests: pieceIds, personne,
      allowUpload: (req.body && req.body.allowUpload) !== false, createdViaGuest: true,
    });
    const frontUrl = (getPrimaryFrontendUrl() || '').replace(/\/+$/, '');
    return res.status(201).json({ success: true, token, url: `${frontUrl}/invitation/${token}` });
  } catch (err) {
    console.error('[suivi] POST fiche-invites:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route   GET /api/dossier-guest-upload/suivi/:token/fiches/:ficheId/pdf
// @desc    Télécharger le PDF d'une fiche remplie (via le lien de suivi)
router.get('/suivi/:token/fiches/:ficheId/pdf', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });
    const FicheConstitution = require('../models/FicheConstitution');
    const fiche = await FicheConstitution.findOne({ _id: req.params.ficheId, dossier: dossier._id }).lean();
    if (!fiche) return res.status(404).json({ success: false, message: 'Fiche introuvable.' });
    const { generateFichePdf } = require('../fiches/generate');
    const buf = await generateFichePdf(fiche, { reference: dossier.numero || '' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fiche-${fiche.typeFiche}-${String(dossier.numero || dossier._id)}.pdf"`);
    return res.send(buf);
  } catch (err) {
    console.error('[suivi] GET PDF fiche:', err?.message || err);
    if (!res.headersSent) return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    return undefined;
  }
});

// @route   GET /api/dossier-guest-upload/suivi/:token/recap.pdf
// @desc    Accusé de réception / récapitulatif PDF téléchargeable par le porteur du lien
router.get('/suivi/:token/recap.pdf', async (req, res) => {
  try {
    const dossier = await findDossierBySuiviToken(req.params.token);
    if (!dossier) return res.status(404).json({ success: false, message: 'Lien de suivi introuvable.' });

    const cabinet = getCabinetContact();
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="accuse-reception-${String(dossier.numero || dossier._id)}.pdf"`);
    doc.pipe(res);

    const fmt = (d) => { try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return ''; } };
    doc.fontSize(20).fillColor('#1e3a8a').text(cabinet.nom, { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#555').text('Accusé de réception de votre demande');
    doc.moveDown(1);
    doc.fontSize(14).fillColor('#111').text(dossier.titre || 'Votre dossier');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#333');
    if (dossier.numero) doc.text(`Numéro de dossier : ${dossier.numero}`);
    doc.text(`Statut actuel : ${dossier.statut || '—'}`);
    doc.text(`Demande déposée le : ${fmt(dossier.createdAt)}`);
    if (dossier.clientPrenom || dossier.clientNom) doc.text(`Demandeur : ${`${dossier.clientPrenom || ''} ${dossier.clientNom || ''}`.trim()}`);
    doc.moveDown(1);

    if (dossier.description) {
      doc.fontSize(11).fillColor('#1e3a8a').text('Description');
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#333').text(String(dossier.description));
      doc.moveDown(1);
    }

    const champs = Array.isArray(dossier.champsFormulaire) ? dossier.champsFormulaire.filter((c) => c && String(c.valeur || '').trim() !== '') : [];
    if (champs.length) {
      doc.fontSize(11).fillColor('#1e3a8a').text('Informations du formulaire');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#333');
      champs.forEach((c) => { doc.text(`• ${(c.libelle || c.nom || '').trim()} : ${String(c.valeur)}`); });
      doc.moveDown(1);
    }

    const recos = Array.isArray(dossier.recommandations) ? dossier.recommandations : [];
    if (recos.length) {
      doc.fontSize(11).fillColor('#1e3a8a').text('Recommandations & décisions');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#333');
      const statutLabel = (s) => (s === 'acceptee' ? 'Acceptée' : s === 'refusee' ? 'Refusée' : 'En attente');
      recos.forEach((r, i) => {
        doc.text(`• Recommandation ${i + 1} — ${statutLabel(r.statut)}`);
        if (r.formeJuridiqueRecommandee) doc.text(`   Forme juridique conseillée : ${r.formeJuridiqueRecommandee}`);
        if (r.demarcheRecommandee) doc.text(`   Démarche : ${r.demarcheRecommandee}`);
      });
      doc.moveDown(1);
    }

    doc.moveDown(1);
    doc.fontSize(9).fillColor('#777').text(`Contact : ${cabinet.telephone} · ${cabinet.email}`);
    doc.text(`Document généré le ${fmt(Date.now())}.`);
    doc.end();
  } catch (err) {
    console.error('[suivi] GET recap.pdf:', err?.message || err);
    if (!res.headersSent) return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    return undefined;
  }
});

// @route   PATCH /api/dossier-guest-upload/documents/:docId/validation
// @desc    (Admin) Valider / refuser un document déposé, avec motif éventuel
router.patch('/documents/:docId/validation', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const statut = String((req.body && req.body.statut) || '').trim();
    if (!['en_attente', 'valide', 'refuse'].includes(statut)) {
      return res.status(400).json({ success: false, message: 'Statut de validation invalide.' });
    }
    const doc = await Document.findById(req.params.docId);
    if (!doc) return res.status(404).json({ success: false, message: 'Document introuvable.' });
    doc.validationStatus = statut;
    doc.validationMotif = statut === 'refuse' ? String((req.body && req.body.motif) || '').trim().slice(0, 1000) : '';
    doc.validatedAt = statut === 'en_attente' ? null : new Date();
    doc.validatedBy = statut === 'en_attente' ? null : req.user.id;
    await doc.save();
    return res.json({
      success: true,
      document: { id: String(doc._id), validationStatus: doc.validationStatus, validationMotif: doc.validationMotif },
    });
  } catch (err) {
    console.error('[suivi] PATCH validation:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
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

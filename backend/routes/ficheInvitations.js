const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const FicheInvite = require('../models/FicheInvite');
const FicheRequest = require('../models/FicheRequest');
const FicheConstitution = require('../models/FicheConstitution');
const Dossier = require('../models/Dossier');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getSchema } = require('../fiches/registry');
const { uploadDocumentToRemoteStorage, removeLocalUploadTempFile } = require('../utils/documentRemoteUpload');
const { resolveCabinetForUser } = require('../utils/cabinetResolver');

const router = express.Router();

const BACKEND_ROOT = path.resolve(__dirname, '..');
const localDir = path.join(BACKEND_ROOT, 'uploads', 'documents');
if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, localDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${(file.originalname || 'document').replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function isDossierClosed(d) {
  const s = String(d?.statut || '').trim();
  return d?.estCloture === true || s === 'cloture';
}
async function findInvite(token) {
  const clean = String(token || '').trim().replace(/[^a-f0-9]/gi, '');
  if (clean.length < 32 || clean.length > 80) return null;
  const inv = await FicheInvite.findOne({ token: clean });
  if (!inv || inv.revokedAt) return null;
  return inv;
}
async function resolveOwnerUserId(dossier) {
  if (dossier.user) return dossier.user._id ? dossier.user._id : dossier.user;
  if (dossier.clientEmail) {
    const u = await User.findOne({ email: String(dossier.clientEmail).trim().toLowerCase() }).select('_id').lean();
    if (u?._id) return u._id;
  }
  if (dossier.createdBy) return dossier.createdBy;
  const admin = await User.findOne({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id').lean();
  return admin?._id || null;
}
async function notifyAdmins(dossier, titre, message, metadata) {
  try {
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id');
    for (const a of admins) {
      await Notification.create({ user: a._id, type: 'document_received', titre, message, lien: '/admin/dossiers', metadata });
    }
  } catch (e) { console.error('[invitation] notif:', e.message || e); }
}

// @route GET /api/fiche-invitations/:token — vue scopée
router.get('/:token', async (req, res) => {
  try {
    const inv = await findInvite(req.params.token);
    if (!inv) return res.status(404).json({ success: false, message: 'Invitation introuvable ou révoquée.' });
    const dossier = await Dossier.findById(inv.dossier).select('titre numero statut estCloture').lean();
    if (!dossier) return res.status(404).json({ success: false, message: 'Dossier introuvable.' });
    if (isDossierClosed(dossier)) return res.status(410).json({ success: false, message: 'Ce lien n\'est plus actif.' });
    const reqs = await FicheRequest.find({ _id: { $in: inv.ficheRequests }, dossier: inv.dossier }).lean();
    return res.json({
      success: true,
      societe: dossier.titre || dossier.numero || 'Dossier',
      personne: inv.personne || '',
      allowUpload: inv.allowUpload !== false,
      requests: reqs.map((r) => ({ id: String(r._id), typeFiche: r.typeFiche, titre: r.titre, statut: r.statut, ficheId: r.fiche ? String(r.fiche) : null })),
    });
  } catch (err) {
    console.error('[invitation] GET:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route POST /api/fiche-invitations/:token/fiche-requests/:reqId/remplir
router.post('/:token/fiche-requests/:reqId/remplir', async (req, res) => {
  try {
    const inv = await findInvite(req.params.token);
    if (!inv) return res.status(404).json({ success: false, message: 'Invitation introuvable.' });
    if (!inv.ficheRequests.map(String).includes(String(req.params.reqId))) {
      return res.status(403).json({ success: false, message: 'Cette fiche n\'est pas autorisée par cette invitation.' });
    }
    const dossier = await Dossier.findById(inv.dossier).select('titre numero statut estCloture').lean();
    if (!dossier || isDossierClosed(dossier)) return res.status(410).json({ success: false, message: 'Ce lien n\'est plus actif.' });
    const fr = await FicheRequest.findOne({ _id: req.params.reqId, dossier: inv.dossier });
    if (!fr) return res.status(404).json({ success: false, message: 'Fiche introuvable.' });
    const schema = getSchema(fr.typeFiche);
    const fiche = await FicheConstitution.create({
      dossier: inv.dossier, typeFiche: fr.typeFiche, titre: (schema && schema.titre) || fr.titre,
      data: (req.body && req.body.data) || {}, viaGuestLink: true,
    });
    fr.statut = 'remplie'; fr.fiche = fiche._id; fr.remplieAt = new Date();
    await fr.save();
    await notifyAdmins(dossier, 'Fiche remplie (invitation)', `${inv.personne || 'Une personne invitée'} a rempli « ${fiche.titre} » (dossier « ${dossier.titre || ''} »).`, { dossierId: String(inv.dossier), ficheId: String(fiche._id) });
    return res.status(201).json({ success: true, message: 'Fiche enregistrée. Merci.', fiche: { id: String(fiche._id), typeFiche: fiche.typeFiche } });
  } catch (err) {
    console.error('[invitation] remplir:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// @route POST /api/fiche-invitations/:token/documents — dépôt ciblé
router.post('/:token/documents', (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || 'Fichier invalide.' });
    next();
  });
}, async (req, res) => {
  try {
    const inv = await findInvite(req.params.token);
    if (!inv) return res.status(404).json({ success: false, message: 'Invitation introuvable.' });
    if (inv.allowUpload === false) return res.status(403).json({ success: false, message: 'Dépôt non autorisé par cette invitation.' });
    const dossier = await Dossier.findById(inv.dossier).select('titre numero statut estCloture user clientEmail createdBy').lean();
    if (!dossier || isDossierClosed(dossier)) return res.status(410).json({ success: false, message: 'Ce lien n\'est plus actif.' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier.' });
    const ownerUserId = await resolveOwnerUserId(dossier);
    const cabinet = await resolveCabinetForUser(ownerUserId);
    let cheminFichier;
    try {
      cheminFichier = await uploadDocumentToRemoteStorage(req.file, { backendRoot: BACKEND_ROOT, s3Prefix: cabinet?.s3Prefix || null, uploadToCloudinary: () => null });
    } catch (e) {
      removeLocalUploadTempFile(req.file);
      return res.status(503).json({ success: false, message: 'Enregistrement du fichier impossible. Réessayez.' });
    }
    const Document = require('../models/Document');
    const docNom = String((req.body && req.body.nom) || req.file.originalname || 'Document').trim().slice(0, 500);
    const document = await Document.create({
      user: ownerUserId, nom: docNom, nomFichier: req.file.filename, originalName: req.file.originalname,
      cheminFichier, typeMime: req.file.mimetype, taille: req.file.size, dossierId: inv.dossier,
      cabinetId: cabinet?._id || null, visibleToClient: false,
      confidentialReason: 'Document déposé via une invitation ciblée — en attente de validation.',
      uploadedViaGuestLink: true, guestContributorName: (inv.personne || '').slice(0, 200),
    });
    await notifyAdmins(dossier, 'Document reçu (invitation)', `${inv.personne || 'Une personne invitée'} a déposé « ${docNom} » (dossier « ${dossier.titre || ''} »).`, { dossierId: String(inv.dossier), documentId: String(document._id) });
    return res.status(201).json({ success: true, message: 'Document transmis. Merci.' });
  } catch (err) {
    console.error('[invitation] documents:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

module.exports = router;

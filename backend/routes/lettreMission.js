const express = require('express');
const Dossier = require('../models/Dossier');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Log = require('../models/Log');
const { protect, authorize } = require('../middleware/auth');
const { userHasPermission, isUserOnDossierTeam } = require('../utils/accessScope');
const { sendTransactionalEmail, escapeHtml } = require('../utils/emailNotifications');
const fs = require('fs');
const path = require('path');
const { generateLettreMissionPdf, buildFileName } = require('../utils/lettreMissionPdf');
const {
  sanitizeLettreHtml,
  isLettreHtmlEmpty,
  hashLettreHtml,
} = require('../utils/lettreMissionHtml');

// Monté sur /api/user/dossiers/:id/lettre-mission
const router = express.Router({ mergeParams: true });
router.use(protect);

const STAFF_ROLES = ['admin', 'superadmin', 'assistant', 'secretaire', 'juriste'];

function lastVersion(dossier) {
  const versions = dossier.lettreMission?.versions || [];
  return versions.length ? versions[versions.length - 1] : null;
}

/** non_envoyee | en_attente | acceptee (l'avenant en attente prime sur l'acceptation precedente). */
function computeStatut(dossier) {
  const last = lastVersion(dossier);
  if (!last) return 'non_envoyee';
  return last.statut === 'acceptee' ? 'acceptee' : 'en_attente';
}

function isClientOf(dossier, user) {
  const isOwner = dossier.user && String(dossier.user._id || dossier.user) === String(user.id);
  const isByEmail =
    dossier.clientEmail &&
    user.email &&
    String(dossier.clientEmail).toLowerCase() === String(user.email).toLowerCase();
  return Boolean(isOwner || isByEmail);
}

async function isStaffWithAccess(dossier, user) {
  if (!STAFF_ROLES.includes(user.role)) return false;
  if (user.role === 'superadmin') return true;
  if (isUserOnDossierTeam(dossier, user.id)) return true;
  return userHasPermission(user, 'dossiers', 'modifier');
}

function serializeVersion(v, { withContent = true } = {}) {
  const o = v.toObject ? v.toObject() : { ...v };
  if (!withContent) delete o.contenuHtml;
  delete o.accepteeIp;
  delete o.accepteeUserAgent;
  return o;
}

function buildPayload(dossier, { isStaff }) {
  const versions = (dossier.lettreMission?.versions || []).map((v) => serializeVersion(v));
  return {
    statut: computeStatut(dossier),
    versions,
    ...(isStaff
      ? {
          brouillon: dossier.lettreMission?.brouillon?.contenuHtml
            ? {
                titre: dossier.lettreMission.brouillon.titre || '',
                contenuHtml: dossier.lettreMission.brouillon.contenuHtml,
                updatedAt: dossier.lettreMission.brouillon.updatedAt || null,
              }
            : null,
        }
      : {}),
  };
}

async function loadContext(req, res) {
  const dossier = await Dossier.findById(req.params.id).select('+lettreMission');
  if (!dossier) {
    res.status(404).json({ success: false, message: 'Dossier non trouvé' });
    return null;
  }
  const isStaff = await isStaffWithAccess(dossier, req.user);
  const isClient = isClientOf(dossier, req.user);
  if (!isStaff && !isClient) {
    res.status(403).json({ success: false, message: 'Accès non autorisé' });
    return null;
  }
  return { dossier, isStaff, isClient };
}

/**
 * Cree le PDF de la version acceptee et l'ajoute aux documents du dossier (visible du client).
 * Best-effort : un echec est journalise mais n'annule pas l'acceptation.
 */
async function persistAcceptedLettreAsDocument(dossier, version) {
  const { persistDocumentForDossier, BACKEND_ROOT } = require('../utils/pieceUpload');
  const Document = require('../models/Document');
  const buf = await generateLettreMissionPdf(dossier, version);
  const dir = path.join(BACKEND_ROOT, 'uploads', 'documents');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `lettre-mission-${dossier._id}-v${version.numero}-${Date.now()}.pdf`;
  const p = path.join(dir, filename);
  fs.writeFileSync(p, buf);
  const label = version.type === 'avenant' ? 'Avenant à la lettre de mission' : 'Lettre de mission';
  const ownerId = dossier.user ? String(dossier.user._id || dossier.user) : String(version.accepteePar);
  const doc = await persistDocumentForDossier(
    { path: p, filename, originalname: buildFileName(dossier, version), mimetype: 'application/pdf', size: buf.length },
    { dossierId: dossier._id, ownerUserId: ownerId, nom: `${label} (acceptée)`, reason: '' }
  );
  await Document.updateOne(
    { _id: doc._id },
    {
      $set: {
        visibleToClient: true,
        confidentialReason: '',
        uploadedViaGuestLink: false,
        guestContributorName: '',
        validationStatus: 'valide',
        categorie: 'contrat',
      },
    }
  );
  return doc;
}

// GET / : etat de la lettre de mission (le client ne voit jamais le brouillon)
router.get('/', async (req, res) => {
  try {
    const ctx = await loadContext(req, res);
    if (!ctx) return;
    res.json({ success: true, data: buildPayload(ctx.dossier, { isStaff: ctx.isStaff }) });
  } catch (error) {
    console.error('Erreur GET lettre de mission:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// PUT /brouillon : enregistre le texte en cours de redaction (staff)
router.put('/brouillon', authorize(...STAFF_ROLES), async (req, res) => {
  try {
    const ctx = await loadContext(req, res);
    if (!ctx) return;
    if (!ctx.isStaff) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
    ctx.dossier.lettreMission = ctx.dossier.lettreMission || {};
    ctx.dossier.lettreMission.brouillon = {
      titre: String(req.body?.titre || '').slice(0, 200),
      contenuHtml: sanitizeLettreHtml(req.body?.contenuHtml),
      updatedAt: new Date(),
      updatedBy: req.user.id,
    };
    ctx.dossier.markModified('lettreMission');
    await ctx.dossier.save();
    res.json({ success: true, data: buildPayload(ctx.dossier, { isStaff: true }) });
  } catch (error) {
    console.error('Erreur PUT brouillon lettre de mission:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /envoyer : envoie la lettre (ou un avenant si la derniere version est acceptee)
router.post('/envoyer', authorize(...STAFF_ROLES), async (req, res) => {
  try {
    const ctx = await loadContext(req, res);
    if (!ctx) return;
    if (!ctx.isStaff) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
    const { dossier } = ctx;

    const contenuHtml = sanitizeLettreHtml(req.body?.contenuHtml);
    if (isLettreHtmlEmpty(contenuHtml)) {
      return res.status(400).json({ success: false, message: 'Le texte de la lettre de mission est vide.' });
    }
    const titre = String(req.body?.titre || '').trim().slice(0, 200);
    const motifAvenant = String(req.body?.motifAvenant || '').trim().slice(0, 500);

    dossier.lettreMission = dossier.lettreMission || { versions: [] };
    const versions = dossier.lettreMission.versions;
    const last = versions.length ? versions[versions.length - 1] : null;
    const isAvenant = Boolean(last && last.statut === 'acceptee');
    if (isAvenant && !motifAvenant) {
      return res.status(400).json({
        success: false,
        message: "La lettre est déjà acceptée : précisez l'objet de l'avenant.",
      });
    }

    // Une version envoyee mais pas encore acceptee peut etre remplacee par le staff.
    if (last && last.statut === 'envoyee') last.statut = 'remplacee';

    const numero = versions.length + 1;
    versions.push({
      numero,
      type: versions.some((v) => v.statut === 'acceptee') ? 'avenant' : 'initiale',
      motifAvenant: isAvenant ? motifAvenant : '',
      titre,
      contenuHtml,
      hash: hashLettreHtml(contenuHtml),
      statut: 'envoyee',
      envoyeeAt: new Date(),
      envoyeePar: req.user.id,
    });
    dossier.lettreMission.brouillon = { titre: '', contenuHtml: '', updatedAt: new Date(), updatedBy: req.user.id };
    dossier.markModified('lettreMission');
    await dossier.save();

    const sent = dossier.lettreMission.versions[dossier.lettreMission.versions.length - 1];
    const label = sent.type === 'avenant' ? 'un avenant à votre lettre de mission' : 'votre lettre de mission';
    const dossierTitle = dossier.titre || dossier.numero || 'votre dossier';

    try {
      let clientUserId = dossier.user ? String(dossier.user._id || dossier.user) : null;
      let clientUser = null;
      if (clientUserId) {
        clientUser = await User.findById(clientUserId).select('email firstName');
      } else if (dossier.clientEmail) {
        clientUser = await User.findOne({ email: String(dossier.clientEmail).toLowerCase() }).select('email firstName');
        clientUserId = clientUser ? String(clientUser._id) : null;
      }
      if (clientUserId) {
        await Notification.create({
          user: clientUserId,
          type: 'lettre_mission_envoyee',
          titre: sent.type === 'avenant' ? 'Avenant à la lettre de mission' : 'Lettre de mission à accepter',
          message: `Nous vous avons adressé ${label} pour le dossier « ${dossierTitle} ». Merci d'en prendre connaissance et de l'accepter depuis votre espace client.`,
          lien: `/client/dossiers/${dossier._id}#lettre-mission`,
          metadata: { dossierId: String(dossier._id), versionNumero: sent.numero },
        });
      }
      if (clientUser?.email && !dossier.isStandby) {
        const msg = `Nous vous avons adressé ${label} pour le dossier « ${dossierTitle} ». Merci d'en prendre connaissance et de l'accepter depuis votre espace client.`;
        await sendTransactionalEmail({
          to: clientUser.email,
          toName: clientUser.firstName || '',
          subject: `${sent.type === 'avenant' ? 'Avenant à la lettre de mission' : 'Lettre de mission'} - Ada Papers`,
          htmlContent: `<p>${escapeHtml(msg)}</p>`,
          textContent: msg,
        });
      }
    } catch (notifErr) {
      console.error('Notification lettre de mission non envoyée:', notifErr);
    }

    try {
      await Log.create({
        action: 'dossier_updated',
        user: req.user.id,
        userEmail: req.user.email,
        description: `${req.user.email} a envoyé la lettre de mission (v${sent.numero}${sent.type === 'avenant' ? ', avenant' : ''}) du dossier ${dossier._id}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        metadata: { dossierId: String(dossier._id), lettreMissionVersion: sent.numero, hash: sent.hash },
      });
    } catch (logErr) {
      console.error('Log lettre de mission non enregistré:', logErr);
    }

    res.json({ success: true, data: buildPayload(dossier, { isStaff: true }) });
  } catch (error) {
    console.error('Erreur POST envoyer lettre de mission:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /accepter : le client accepte la version en attente (signature simple)
router.post('/accepter', async (req, res) => {
  try {
    const ctx = await loadContext(req, res);
    if (!ctx) return;
    if (!ctx.isClient) {
      return res.status(403).json({ success: false, message: 'Seul le client peut accepter la lettre de mission.' });
    }
    const { dossier } = ctx;

    const nomSignature = String(req.body?.nomSignature || '').trim().slice(0, 200);
    if (!nomSignature) {
      return res.status(400).json({ success: false, message: 'Saisissez votre nom complet pour signer.' });
    }
    if (req.body?.consentement !== true) {
      return res.status(400).json({ success: false, message: "Vous devez cocher la case d'acceptation." });
    }

    const last = lastVersion(dossier);
    if (!last || last.statut !== 'envoyee') {
      return res.status(409).json({ success: false, message: 'Aucune lettre de mission en attente d\'acceptation.' });
    }
    if (req.body?.numero !== undefined && Number(req.body.numero) !== last.numero) {
      return res.status(409).json({
        success: false,
        message: 'La lettre a été mise à jour. Rechargez la page pour lire la dernière version.',
      });
    }

    last.statut = 'acceptee';
    last.accepteeAt = new Date();
    last.accepteePar = req.user.id;
    last.accepteeNom = nomSignature;
    last.accepteeIp = req.ip || req.headers['x-forwarded-for'] || '';
    last.accepteeUserAgent = req.get('user-agent') || '';
    dossier.markModified('lettreMission');
    await dossier.save();

    try {
      const doc = await persistAcceptedLettreAsDocument(dossier, last);
      last.documentId = doc._id;
      dossier.markModified('lettreMission');
      await dossier.save();
    } catch (docErr) {
      console.error('PDF lettre de mission non ajouté aux documents du dossier:', docErr);
    }

    try {
      const dossierTitle = dossier.titre || dossier.numero || 'un dossier';
      const staffIds = new Set(
        [dossier.assignedTo, dossier.teamLeader, ...(dossier.teamMembers || []), last.envoyeePar]
          .filter(Boolean)
          .map((u) => String(u._id || u))
      );
      for (const uid of staffIds) {
        await Notification.create({
          user: uid,
          type: 'lettre_mission_acceptee',
          titre: 'Lettre de mission acceptée',
          message: `Le client a accepté la lettre de mission (v${last.numero}) du dossier « ${dossierTitle} ».`,
          lien: `/admin/dossiers/${dossier._id}`,
          metadata: { dossierId: String(dossier._id), versionNumero: last.numero },
        });
      }
      await Log.create({
        action: 'dossier_updated',
        user: req.user.id,
        userEmail: req.user.email,
        description: `${req.user.email} a accepté la lettre de mission (v${last.numero}) du dossier ${dossier._id}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        metadata: { dossierId: String(dossier._id), lettreMissionVersion: last.numero, hash: last.hash },
      });
    } catch (notifErr) {
      console.error('Notification acceptation lettre de mission non envoyée:', notifErr);
    }

    res.json({ success: true, data: buildPayload(dossier, { isStaff: false }) });
  } catch (error) {
    console.error('Erreur POST accepter lettre de mission:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /:numero/pdf : telecharge le PDF d'une version (client ou staff)
router.get('/:numero/pdf', async (req, res) => {
  try {
    const ctx = await loadContext(req, res);
    if (!ctx) return;
    const numero = Number(req.params.numero);
    const version = (ctx.dossier.lettreMission?.versions || []).find((v) => v.numero === numero);
    if (!version || (version.statut === 'remplacee' && !ctx.isStaff)) {
      return res.status(404).json({ success: false, message: 'Version introuvable' });
    }
    const buf = await generateLettreMissionPdf(ctx.dossier, version);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${buildFileName(ctx.dossier, version)}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (error) {
    console.error('Erreur PDF lettre de mission:', error);
    res.status(500).json({ success: false, message: 'Impossible de générer le PDF' });
  }
});

module.exports = router;

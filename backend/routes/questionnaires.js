const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Questionnaire = require('../models/Questionnaire');
const QuestionnaireReponse = require('../models/QuestionnaireReponse');
const Document = require('../models/Document');
const Dossier = require('../models/Dossier');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { sendTransactionalEmail } = require('../utils/emailNotifications');
const { getPrimaryFrontendUrl } = require('../utils/frontendOrigins');

const router = express.Router();

const uploadsDir = path.join(__dirname, '../uploads/questionnaires');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = (file.originalname || 'fichier')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 100);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e8)}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

function buildPublicUrl(req, token) {
  const frontendUrl = getPrimaryFrontendUrl() || `${req.protocol}://${req.get('host')}`;
  return `${frontendUrl}/questionnaire/${token}`;
}

function buildFileUrl(req, nomStocke) {
  const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  return `${backendUrl}/uploads/questionnaires/${nomStocke}`;
}

// ============================================================
// ROUTES PUBLIQUES (sans authentification)
// ============================================================

// GET /api/questionnaires/public/:token
router.get('/public/:token', async (req, res) => {
  try {
    const q = await Questionnaire.findOne({ token: req.params.token });
    if (!q) return res.status(404).json({ success: false, message: 'Questionnaire introuvable.' });
    if (q.statut === 'brouillon') {
      return res.status(403).json({ success: false, message: 'Ce questionnaire n\'est pas encore ouvert.' });
    }
    if (q.statut === 'clos') {
      return res.status(410).json({ success: false, message: 'Ce questionnaire est clos.' });
    }
    if (q.expiresAt && new Date() > q.expiresAt) {
      return res.status(410).json({ success: false, message: 'Ce questionnaire a expire.' });
    }
    return res.json({
      success: true,
      questionnaire: {
        _id: q._id,
        titre: q.titre,
        description: q.description,
        questions: q.questions,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/questionnaires/public/:token/soumettre
router.post('/public/:token/soumettre', upload.any(), async (req, res) => {
  try {
    const q = await Questionnaire.findOne({ token: req.params.token });
    if (!q) return res.status(404).json({ success: false, message: 'Questionnaire introuvable.' });
    if (q.statut !== 'actif') {
      return res.status(403).json({ success: false, message: 'Ce questionnaire n\'accepte plus de reponses.' });
    }
    if (q.expiresAt && new Date() > q.expiresAt) {
      return res.status(410).json({ success: false, message: 'Ce questionnaire a expire.' });
    }

    const body = req.body || {};
    const files = req.files || [];

    const expediteur = {
      nom: (body.expediteurNom || '').trim().slice(0, 200),
      email: (body.expediteurEmail || '').trim().slice(0, 200),
      tel: (body.expediteurTel || '').trim().slice(0, 50),
    };

    const reponses = [];
    for (const question of q.questions) {
      if (question.type === 'section') continue;

      const reponseItem = { questionId: question.id, valeur: null, fichiers: [] };

      if (question.type === 'fichier') {
        const questionFiles = files.filter(f => f.fieldname === `fichier_${question.id}`);
        for (const f of questionFiles) {
          reponseItem.fichiers.push({
            nomOriginal: f.originalname,
            nomStocke: f.filename,
            url: buildFileUrl(req, f.filename),
            taille: f.size,
            typeMime: f.mimetype,
          });
        }
      } else if (question.type === 'choix_multiple') {
        const raw = body[`q_${question.id}`];
        reponseItem.valeur = Array.isArray(raw) ? raw : raw ? [raw] : [];
      } else {
        reponseItem.valeur = (body[`q_${question.id}`] || '').toString().trim();
      }

      reponses.push(reponseItem);
    }

    const reponse = await QuestionnaireReponse.create({
      questionnaire: q._id,
      reponses,
      expediteur,
      ipSoumission: req.ip || '',
    });

    // Notification in-app aux admins
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }).select('_id email');
    const frontendUrl = getPrimaryFrontendUrl() || '';
    const lienReponse = `${frontendUrl}/admin/questionnaires/${q._id}?tab=reponses`;

    await Promise.allSettled(
      admins.map(admin =>
        Notification.create({
          user: admin._id,
          type: 'other',
          titre: 'Nouvelle reponse au questionnaire',
          message: `${expediteur.nom || 'Quelqu\'un'} a repondu au questionnaire "${q.titre}".`,
          lien: lienReponse,
        })
      )
    );

    // Email aux admins si ADMIN_EMAILS defini
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(/[,;\s]+/).filter(Boolean);
    if (adminEmails.length > 0) {
      const hasFiles = reponses.some(r => r.fichiers.length > 0);
      await Promise.allSettled(
        adminEmails.map(email =>
          sendTransactionalEmail({
            to: email,
            subject: `Reponse au questionnaire : ${q.titre}`,
            html: `<p><strong>${expediteur.nom || 'Un visiteur'}</strong> (${expediteur.email || 'email inconnu'}) a repondu au questionnaire <em>${q.titre}</em>.</p>
${hasFiles ? '<p>Des pieces jointes ont ete uploadees.</p>' : ''}
<p><a href="${lienReponse}">Voir la reponse</a></p>`,
          })
        )
      );
    }

    return res.json({ success: true, message: 'Reponse enregistree.', reponseId: reponse._id });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// ROUTES PROTEGEES (admin)
// ============================================================

const adminOnly = [protect, authorize('admin', 'superadmin')];

// GET /api/questionnaires
router.get('/', ...adminOnly, async (req, res) => {
  try {
    const questionnaires = await Questionnaire.find()
      .sort({ createdAt: -1 })
      .populate('dossier', 'reference clientNom')
      .populate('createdBy', 'firstName lastName');

    const ids = questionnaires.map(q => q._id);
    const counts = await QuestionnaireReponse.aggregate([
      { $match: { questionnaire: { $in: ids } } },
      { $group: { _id: '$questionnaire', total: { $sum: 1 }, nonLus: { $sum: { $cond: [{ $eq: ['$lu', false] }, 1, 0] } } } },
    ]);
    const countMap = {};
    for (const c of counts) countMap[String(c._id)] = { total: c.total, nonLus: c.nonLus };

    return res.json({
      success: true,
      questionnaires: questionnaires.map(q => ({
        ...q.toObject(),
        publicUrl: buildPublicUrl(req, q.token),
        nbReponses: countMap[String(q._id)]?.total || 0,
        nbNonLus: countMap[String(q._id)]?.nonLus || 0,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/questionnaires
router.post('/', ...adminOnly, async (req, res) => {
  try {
    const { titre, description, questions, statut, dossier, expiresAt } = req.body;
    if (!titre || !titre.trim()) {
      return res.status(400).json({ success: false, message: 'Le titre est requis.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    const q = await Questionnaire.create({
      titre: titre.trim(),
      description: (description || '').trim(),
      questions: questions || [],
      token,
      statut: statut || 'brouillon',
      dossier: dossier || null,
      expiresAt: expiresAt || null,
      createdBy: req.user._id || req.user.id,
    });
    return res.status(201).json({ success: true, questionnaire: { ...q.toObject(), publicUrl: buildPublicUrl(req, q.token) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/questionnaires/reponses/:id  (AVANT /:id)
router.get('/reponses/:id', ...adminOnly, async (req, res) => {
  try {
    const reponse = await QuestionnaireReponse.findById(req.params.id)
      .populate('questionnaire', 'titre questions token')
      .populate('dossierRattache', 'reference clientNom');
    if (!reponse) return res.status(404).json({ success: false, message: 'Reponse introuvable.' });
    if (!reponse.lu) {
      await QuestionnaireReponse.updateOne({ _id: reponse._id }, { lu: true });
    }
    return res.json({ success: true, reponse });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/questionnaires/reponses/:id/rattacher-dossier
router.patch('/reponses/:id/rattacher-dossier', ...adminOnly, async (req, res) => {
  try {
    const { dossierId } = req.body;
    const reponse = await QuestionnaireReponse.findById(req.params.id).populate('questionnaire');
    if (!reponse) return res.status(404).json({ success: false, message: 'Reponse introuvable.' });

    if (dossierId) {
      const dossier = await Dossier.findById(dossierId);
      if (!dossier) return res.status(404).json({ success: false, message: 'Dossier introuvable.' });
      await QuestionnaireReponse.updateOne({ _id: reponse._id }, { dossierRattache: dossierId });
    } else {
      await QuestionnaireReponse.updateOne({ _id: reponse._id }, { dossierRattache: null });
    }

    return res.json({ success: true, message: dossierId ? 'Reponse rattachee au dossier.' : 'Rattachement supprime.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/questionnaires/reponses/:id/rattacher-fichier
router.post('/reponses/:id/rattacher-fichier', ...adminOnly, async (req, res) => {
  try {
    const { fichierId, dossierId, nom } = req.body;
    const reponse = await QuestionnaireReponse.findById(req.params.id);
    if (!reponse) return res.status(404).json({ success: false, message: 'Reponse introuvable.' });

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) return res.status(404).json({ success: false, message: 'Dossier introuvable.' });

    let fichierTrouve = null;
    for (const r of reponse.reponses) {
      const f = r.fichiers.id ? r.fichiers.id(fichierId) : r.fichiers.find(x => String(x._id) === String(fichierId));
      if (f) { fichierTrouve = f; break; }
    }
    if (!fichierTrouve) return res.status(404).json({ success: false, message: 'Fichier introuvable.' });
    if (fichierTrouve.rattacheCommeDocumentId) {
      return res.status(400).json({ success: false, message: 'Ce fichier est deja rattache.' });
    }

    const localPath = path.join(uploadsDir, fichierTrouve.nomStocke);
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ success: false, message: 'Fichier physique introuvable sur le serveur.' });
    }
    const stat = fs.statSync(localPath);

    const doc = await Document.create({
      user: dossier.user || req.user._id || req.user.id,
      nom: (nom || fichierTrouve.nomOriginal || 'Document').slice(0, 200),
      nomFichier: fichierTrouve.nomStocke,
      originalName: fichierTrouve.nomOriginal,
      cheminFichier: localPath,
      typeMime: fichierTrouve.typeMime || 'application/octet-stream',
      taille: fichierTrouve.taille || stat.size,
      dossierId,
      categorie: 'autre',
    });

    // Marquer le fichier comme rattache dans la reponse
    for (const r of reponse.reponses) {
      for (const f of r.fichiers) {
        if (String(f._id) === String(fichierId)) {
          f.rattacheCommeDocumentId = doc._id;
        }
      }
    }
    await reponse.save();

    return res.json({ success: true, document: doc, message: 'Fichier rattache au dossier.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/questionnaires/:id
router.get('/:id', ...adminOnly, async (req, res) => {
  try {
    const q = await Questionnaire.findById(req.params.id)
      .populate('dossier', 'reference clientNom')
      .populate('createdBy', 'firstName lastName');
    if (!q) return res.status(404).json({ success: false, message: 'Questionnaire introuvable.' });
    return res.json({ success: true, questionnaire: { ...q.toObject(), publicUrl: buildPublicUrl(req, q.token) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/questionnaires/:id
router.put('/:id', ...adminOnly, async (req, res) => {
  try {
    const { titre, description, questions, statut, dossier, expiresAt } = req.body;
    const q = await Questionnaire.findById(req.params.id);
    if (!q) return res.status(404).json({ success: false, message: 'Questionnaire introuvable.' });

    if (titre !== undefined) q.titre = titre.trim();
    if (description !== undefined) q.description = description.trim();
    if (questions !== undefined) q.questions = questions;
    if (statut !== undefined) q.statut = statut;
    if (dossier !== undefined) q.dossier = dossier || null;
    if (expiresAt !== undefined) q.expiresAt = expiresAt || null;

    await q.save();
    return res.json({ success: true, questionnaire: { ...q.toObject(), publicUrl: buildPublicUrl(req, q.token) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/questionnaires/:id
router.delete('/:id', ...adminOnly, async (req, res) => {
  try {
    const q = await Questionnaire.findById(req.params.id);
    if (!q) return res.status(404).json({ success: false, message: 'Questionnaire introuvable.' });
    await Questionnaire.deleteOne({ _id: q._id });
    await QuestionnaireReponse.deleteMany({ questionnaire: q._id });
    return res.json({ success: true, message: 'Questionnaire supprime.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/questionnaires/:id/reponses
router.get('/:id/reponses', ...adminOnly, async (req, res) => {
  try {
    const q = await Questionnaire.findById(req.params.id);
    if (!q) return res.status(404).json({ success: false, message: 'Questionnaire introuvable.' });

    const reponses = await QuestionnaireReponse.find({ questionnaire: q._id })
      .sort({ createdAt: -1 })
      .populate('dossierRattache', 'reference clientNom');

    return res.json({ success: true, reponses });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

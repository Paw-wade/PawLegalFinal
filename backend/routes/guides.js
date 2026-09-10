const express = require('express');
const { protect } = require('../middleware/auth');
const { sendTransactionalEmail, escapeHtml } = require('../utils/emailNotifications');

const GuideConfig = require('../models/GuideConfig');
const Parrainage = require('../models/Parrainage');
const Notification = require('../models/Notification');
const User = require('../models/User');

const ADMIN_ROLES = ['admin', 'superadmin'];

const router = express.Router();

// @route   GET /api/guides/nouvel-arrivant
// @desc    Retourne le contenu du guide etudiant international
// @access  Private (client connecte)
router.get('/guides/nouvel-arrivant', async (req, res) => {
  try {
    const guide = await GuideConfig.findOne({ slug: 'nouvel-arrivant' }).lean();
    if (!guide) {
      return res.status(404).json({ success: false, message: 'Guide introuvable' });
    }
    return res.json({ success: true, guide });
  } catch (e) {
    console.error('Erreur GET /guides/nouvel-arrivant:', e);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   GET /api/admin/guides/nouvel-arrivant
// @desc    Retourne le guide complet pour edition (admin)
// @access  Private (admin)
router.get('/admin/guides/nouvel-arrivant', protect, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Acces reserve aux administrateurs' });
    }
    const guide = await GuideConfig.findOne({ slug: 'nouvel-arrivant' }).lean();
    if (!guide) return res.status(404).json({ success: false, message: 'Guide introuvable' });
    return res.json({ success: true, guide });
  } catch (e) {
    console.error('Erreur GET /admin/guides/nouvel-arrivant:', e);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   PUT /api/admin/guides/nouvel-arrivant
// @desc    Met a jour le guide nouvel arrivant (admin)
// @access  Private (admin)
router.put('/admin/guides/nouvel-arrivant', protect, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Acces reserve aux administrateurs' });
    }
    const { titre, intro, steps } = req.body;
    if (!titre || !String(titre).trim()) {
      return res.status(400).json({ success: false, message: 'Le titre est requis' });
    }
    const guide = await GuideConfig.findOneAndUpdate(
      { slug: 'nouvel-arrivant' },
      { titre: String(titre).trim(), intro: String(intro || '').trim(), steps: steps || [] },
      { new: true, upsert: true, runValidators: false }
    ).lean();
    return res.json({ success: true, guide });
  } catch (e) {
    console.error('Erreur PUT /admin/guides/nouvel-arrivant:', e);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   POST /api/parrainage/bnp
// @desc    Enregistre une demande de parrainage BNP Paribas et notifie Ada Papers
// @access  Public (formulaire accessible sans connexion)
router.post('/parrainage/bnp', async (req, res) => {
  try {
    const { nom, prenom, email } = req.body;

    if (!nom || !String(nom).trim()) {
      return res.status(400).json({ success: false, message: 'Le nom est requis' });
    }
    if (!prenom || !String(prenom).trim()) {
      return res.status(400).json({ success: false, message: 'Le prenom est requis' });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, message: "L'adresse email est requise" });
    }

    const parrainage = await Parrainage.create({
      nom: String(nom).trim(),
      prenom: String(prenom).trim(),
      email: String(email).trim().toLowerCase(),
      banque: 'BNP Paribas',
    });

    void notifyParrainage(parrainage, nom, prenom, email, req.user?.id);

    return res.status(201).json({ success: true, id: parrainage._id });
  } catch (e) {
    console.error('Erreur POST /parrainage/bnp:', e);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

async function notifyParrainage(parrainage, nom, prenom, email, demandeurId) {
  const nomEsc = escapeHtml(String(nom).trim());
  const prenomEsc = escapeHtml(String(prenom).trim());
  const emailEsc = escapeHtml(String(email).trim());
  const message = `${prenomEsc} ${nomEsc} (${emailEsc}) a soumis une demande de parrainage BNP Paribas.`;

  // Profil complet du demandeur
  let profil = null;
  try {
    profil = await User.findById(demandeurId).select('firstName lastName email phone role').lean();
  } catch (e) {
    console.warn('[parrainage] profil demandeur non recupere:', e.message);
  }

  const pFirstName = escapeHtml(String(profil?.firstName || '').trim());
  const pLastName = escapeHtml(String(profil?.lastName || '').trim());
  const pEmail = escapeHtml(String(profil?.email || '').trim());
  const pPhone = escapeHtml(String(profil?.phone || '').trim());
  const pRole = escapeHtml(String(profil?.role || '').trim());

  const coordonneesHtml = profil ? `
<h3 style="margin:16px 0 6px;font-size:14px;color:#555;">Coordonnees du compte (espace client)</h3>
<ul>
  <li><strong>Nom complet :</strong> ${pFirstName} ${pLastName}</li>
  <li><strong>Email du compte :</strong> ${pEmail}</li>
  ${pPhone ? `<li><strong>Telephone :</strong> ${pPhone}</li>` : ''}
  <li><strong>Role :</strong> ${pRole}</li>
</ul>` : '';

  // Email vers contact@adapapers.fr
  sendTransactionalEmail({
    to: 'contact@adapapers.fr',
    toName: 'Ada Papers',
    subject: 'Nouvelle demande de parrainage BNP Paribas',
    htmlContent: `<p>Nouvelle demande de parrainage BNP Paribas recue depuis l'espace client :</p>
<h3 style="margin:16px 0 6px;font-size:14px;color:#555;">Informations saisies dans le formulaire</h3>
<ul>
  <li><strong>Prenom :</strong> ${prenomEsc}</li>
  <li><strong>Nom :</strong> ${nomEsc}</li>
  <li><strong>Email BNP :</strong> ${emailEsc}</li>
</ul>
${coordonneesHtml}
<p style="margin-top:16px;">A traiter manuellement via votre conseiller BNP Paribas.</p>`,
  }).catch((e) => console.warn('[parrainage] email non envoye:', e.message));

  // Notifications in-app + push pour les admins actifs
  try {
    const admins = await User.find({ role: { $in: ADMIN_ROLES }, isActive: { $ne: false } }).select('_id');
    await Promise.all(
      admins.map(async (adm) => {
        await Notification.create({
          user: adm._id,
          type: 'parrainage_bnp',
          titre: 'Demande de parrainage BNP',
          message,
          lien: '/admin',
          metadata: { parrainageId: String(parrainage._id) },
        });
      })
    );
  } catch (e) {
    console.warn('[parrainage] notifs admin echouees:', e.message);
  }
}

module.exports = router;

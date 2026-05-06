const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const { sendTransactionalEmailDetailed } = require('../utils/emailNotifications');
const { protect, authorize } = require('../middleware/auth');
const EmailTemplate = require('../models/EmailTemplate');
const EmailEventSetting = require('../models/EmailEventSetting');
const EmailLog = require('../models/EmailLog');

const router = express.Router();

/** Routes email console : templates / événements / logs nécessitent MongoDB. */
function requireMongo(req, res, next) {
  if (mongoose.connection.readyState === 1) return next();
  return res.status(503).json({
    success: false,
    code: 'DATABASE_UNAVAILABLE',
    message:
      'Base de données indisponible. La console email nécessite MongoDB : vérifiez MONGODB_URI et la whitelist IP sur MongoDB Atlas, puis redémarrez le backend.',
  });
}

const DEFAULT_TEMPLATES = [
  {
    code: 'account_welcome',
    name: 'Bienvenue utilisateur',
    description: 'Envoyé après validation du compte (lien d’activation / OTP)',
    subject: 'Bienvenue sur Ada Papers, {{firstName}} !',
    htmlContent:
      '<p>Bienvenue sur Ada Papers, {{firstName}} !</p><p>Nous sommes ravis de vous accueillir. Votre espace personnel est maintenant actif.</p><p><strong>CE QUE VOUS POUVEZ FAIRE DÈS MAINTENANT</strong></p><p>📁 <strong>Création et suivi de dossier</strong><br/>Créez un dossier d’accompagnement et suivez l’avancement de votre dossier en temps réel, de la création jusqu’à la finalisation.</p><p>⏱️ <strong>Calculateur de délais</strong><br/>Anticipez vos échéances et planifiez vos démarches sereinement.</p><p>🤖 <strong>Ada AI</strong><br/>Obtenez des réponses claires et vérifiées, corroborées par des décisions de justice et adaptées à votre situation. Recevez également des recommandations sur les démarches à suivre.</p><p>💬 <strong>Accompagnement humain</strong><br/>Notre équipe reste disponible à chaque étape depuis votre espace.</p><p><strong>Accédez à votre espace :</strong> https://adapapers.fr</p><p>Cordialement,<br/>L’équipe Ada Papers</p><p style="font-size:12px;color:#666;">© 2025 Ada Papers — adapapers.fr<br/>Si vous n’êtes pas à l’origine de cette inscription, ignorez ce message.</p>',
    textContent:
      'Bienvenue sur Ada Papers, {{firstName}} !\n\nNous sommes ravis de vous accueillir. Votre espace personnel est maintenant actif.\n\nCE QUE VOUS POUVEZ FAIRE DÈS MAINTENANT\n\n📁 Création et suivi de dossier\nCréez un dossier d’accompagnement et suivez l’avancement de votre dossier en temps réel, de la création jusqu’à la finalisation.\n\n⏱️ Calculateur de délais\nAnticipez vos échéances et planifiez vos démarches sereinement.\n\n🤖 Ada AI\nObtenez des réponses claires et vérifiées, corroborées par des décisions de justice et adaptées à votre situation. Recevez également des recommandations sur les démarches à suivre.\n\n💬 Accompagnement humain\nNotre équipe reste disponible à chaque étape depuis votre espace.\n\nAccédez à votre espace : https://adapapers.fr\n\nCordialement,\nL’équipe Ada Papers\n\n© 2025 Ada Papers — adapapers.fr\nSi vous n’êtes pas à l’origine de cette inscription, ignorez ce message.',
    category: 'account',
    isSystem: true,
    variables: [{ name: 'firstName', description: 'Prénom', example: 'Ablaye' }],
  },
  {
    code: 'password_reset_code',
    name: 'Code de réinitialisation',
    description: 'Code temporaire envoyé pour récupérer le compte',
    subject: 'Code de réinitialisation',
    htmlContent:
      '<p>Bonjour,</p><p>Vous avez demandé la réinitialisation de votre mot de passe.</p><p>Votre code de vérification est : <strong>{{code}}</strong>.</p><p>Ce code est valable pendant 10 minutes. Pour des raisons de sécurité, ne le partagez avec personne.</p><p>Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.</p><p>Cordialement,<br/>L’équipe Ada Papers</p>',
    textContent:
      'Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe.\n\nVotre code de vérification est : {{code}}.\nCe code est valable pendant 10 minutes. Pour des raisons de sécurité, ne le partagez avec personne.\n\nSi vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.\n\nCordialement,\nL’équipe Ada Papers',
    category: 'account',
    isSystem: true,
    variables: [{ name: 'code', description: 'Code OTP', example: '123456' }],
  },
  {
    code: 'dossier_created',
    name: 'Dossier créé',
    description: 'Confirmation de création de dossier',
    subject: 'Votre dossier {{dossierNumero}} a été créé',
    htmlContent:
      '<p>Bonjour,</p><p>Nous vous confirmons la création de votre dossier <strong>{{dossierNumero}}</strong>.</p><p>Notre équipe procédera à l’analyse de votre situation et vous informera des prochaines étapes dès que nécessaire.</p><p>Nous vous invitons à consulter régulièrement votre espace personnel pour suivre l’avancement.</p><p>Cordialement,<br/>L’équipe Ada Papers</p>',
    textContent:
      'Bonjour,\n\nNous vous confirmons la création de votre dossier {{dossierNumero}}.\n\nNotre équipe procédera à l’analyse de votre situation et vous informera des prochaines étapes dès que nécessaire.\nNous vous invitons à consulter régulièrement votre espace personnel pour suivre l’avancement.\n\nCordialement,\nL’équipe Ada Papers',
    category: 'dossier',
    isSystem: true,
    variables: [{ name: 'dossierNumero', description: 'Référence dossier', example: 'DOS-001' }],
  },
  {
    code: 'dossier_status_changed',
    name: 'Changement de statut dossier',
    description: 'Notification de changement de statut',
    subject: 'Mise à jour de votre dossier {{dossierNumero}}',
    htmlContent:
      '<p>Bonjour,</p><p>Le statut de votre dossier <strong>{{dossierNumero}}</strong> a été mis à jour.</p><p>Nouveau statut : <strong>{{status}}</strong>.</p><p>Pour davantage de détails, nous vous invitons à consulter votre espace client.</p><p>Cordialement,<br/>L’équipe Ada Papers</p>',
    textContent:
      'Bonjour,\n\nLe statut de votre dossier {{dossierNumero}} a été mis à jour.\nNouveau statut : {{status}}.\n\nPour davantage de détails, nous vous invitons à consulter votre espace client.\n\nCordialement,\nL’équipe Ada Papers',
    category: 'dossier',
    isSystem: true,
    variables: [
      { name: 'dossierNumero', description: 'Référence dossier', example: 'DOS-001' },
      { name: 'status', description: 'Nouveau statut', example: 'En cours' },
    ],
  },
  {
    code: 'message_received',
    name: 'Nouveau message',
    description: 'Alerte email pour nouveau message interne',
    subject: 'Nouveau message reçu',
    htmlContent:
      '<p>Bonjour,</p><p>Vous avez reçu un nouveau message de <strong>{{senderName}}</strong> dans votre espace Ada Papers.</p><p>Nous vous invitons à vous connecter afin de consulter son contenu et y répondre si nécessaire.</p><p>Cordialement,<br/>L’équipe Ada Papers</p>',
    textContent:
      'Bonjour,\n\nVous avez reçu un nouveau message de {{senderName}} dans votre espace Ada Papers.\nNous vous invitons à vous connecter afin de consulter son contenu et y répondre si nécessaire.\n\nCordialement,\nL’équipe Ada Papers',
    category: 'message',
    isSystem: true,
    variables: [{ name: 'senderName', description: 'Expéditeur', example: 'Cabinet Ada Papers' }],
  },
];

const DEFAULT_EVENTS = [
  { eventKey: 'account_created', label: 'Compte créé', description: 'Email de bienvenue', category: 'account', templateCode: 'account_welcome' },
  { eventKey: 'password_reset_requested', label: 'Réinitialisation mot de passe', description: 'Envoi code temporaire', category: 'account', templateCode: 'password_reset_code' },
  { eventKey: 'dossier_created', label: 'Dossier créé', description: 'Confirmation client', category: 'dossier', templateCode: 'dossier_created' },
  { eventKey: 'dossier_status_changed', label: 'Statut dossier modifié', description: 'Notification de changement de statut', category: 'dossier', templateCode: 'dossier_status_changed' },
  { eventKey: 'message_received', label: 'Message reçu', description: 'Notification message interne', category: 'message', templateCode: 'message_received' },
];

function renderWithVariables(template, variables = {}) {
  const normalize = (v) => (v === undefined || v === null ? '' : String(v));
  const replacer = (_, key) => normalize(variables[String(key).trim()]);
  return String(template || '').replace(/\{\{(.*?)\}\}/g, replacer);
}

async function logEmail(payload) {
  try {
    await EmailLog.create(payload);
  } catch (error) {
    console.error('Erreur log email:', error.message);
  }
}

// Endpoint utilitaire d'envoi direct (préserve le flux de tests manuel existant)
router.post(
  '/send',
  [
    body('to').isEmail().withMessage('Email destinataire invalide'),
    body('subject').trim().notEmpty().withMessage('Le sujet est requis'),
    body('htmlContent').trim().notEmpty().withMessage('Le contenu HTML est requis'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Erreurs de validation', errors: errors.array() });
    }

    const { to, toName = '', subject, htmlContent, textContent = '' } = req.body;
    try {
      const result = await sendTransactionalEmailDetailed({ to, toName, subject, htmlContent, textContent });
      if (!result.ok) {
        throw new Error(result.error || 'Envoi impossible (Brevo et SMTP non configurés ou en erreur)');
      }
      await logEmail({
        eventKey: 'manual',
        to,
        toName,
        subject,
        htmlContent,
        textContent,
        status: 'sent',
        providerMessageId: result.provider || '',
      });
      return res.json({ success: true, provider: result.provider, messageId: result.provider || null });
    } catch (error) {
      await logEmail({
        eventKey: 'manual',
        to,
        toName,
        subject,
        htmlContent,
        textContent,
        status: 'failed',
        error: error.message,
      });
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.use(protect);
router.use(authorize('admin', 'superadmin'));
router.use(requireMongo);

router.post('/init-defaults', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const created = [];
    const existing = [];

    for (const tpl of DEFAULT_TEMPLATES) {
      const found = await EmailTemplate.findOne({ code: tpl.code });
      if (found) {
        existing.push(tpl.code);
        continue;
      }
      const doc = await EmailTemplate.create({ ...tpl, createdBy: userId, updatedBy: userId });
      created.push(doc);
    }

    for (const ev of DEFAULT_EVENTS) {
      const found = await EmailEventSetting.findOne({ eventKey: ev.eventKey });
      if (!found) {
        await EmailEventSetting.create({ ...ev, enabled: true, updatedBy: userId });
      }
    }

    res.json({ success: true, created: created.length, existing: existing.length, templates: created });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.get('/templates', async (req, res) => {
  try {
    const { search, category, isActive } = req.query;
    const q = {};
    if (category) q.category = category;
    if (isActive !== undefined) q.isActive = isActive === 'true';
    if (search) {
      q.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    const templates = await EmailTemplate.find(q).sort({ category: 1, code: 1 });
    res.json({ success: true, count: templates.length, templates });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.post(
  '/templates',
  [
    body('code').trim().notEmpty(),
    body('name').trim().notEmpty(),
    body('subject').trim().notEmpty(),
    body('htmlContent').trim().notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const existing = await EmailTemplate.findOne({ code: req.body.code });
      if (existing) return res.status(400).json({ success: false, message: 'Un template avec ce code existe déjà' });

      const doc = await EmailTemplate.create({
        ...req.body,
        variables: req.body.variables || [],
        category: req.body.category || 'other',
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        createdBy: req.user.id,
        updatedBy: req.user.id,
      });
      res.status(201).json({ success: true, template: doc });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
    }
  }
);

router.put('/templates/:id', async (req, res) => {
  try {
    const doc = await EmailTemplate.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Template non trouvé' });

    if (req.body.code && req.body.code !== doc.code) {
      const exists = await EmailTemplate.findOne({ code: req.body.code });
      if (exists) return res.status(400).json({ success: false, message: 'Un template avec ce code existe déjà' });
      doc.code = req.body.code;
    }
    ['name', 'description', 'subject', 'htmlContent', 'textContent', 'category'].forEach((k) => {
      if (req.body[k] !== undefined) doc[k] = req.body[k];
    });
    if (req.body.variables !== undefined) doc.variables = req.body.variables;
    if (req.body.isActive !== undefined) doc.isActive = req.body.isActive;
    doc.updatedBy = req.user.id;
    await doc.save();
    res.json({ success: true, template: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    const doc = await EmailTemplate.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Template non trouvé' });
    if (doc.isSystem) return res.status(403).json({ success: false, message: 'Les templates système ne peuvent pas être supprimés' });
    await doc.deleteOne();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.post('/templates/:id/preview', async (req, res) => {
  try {
    const doc = await EmailTemplate.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Template non trouvé' });
    const variables = req.body.variables || {};
    res.json({
      success: true,
      preview: {
        subject: renderWithVariables(doc.subject, variables),
        htmlContent: renderWithVariables(doc.htmlContent, variables),
        textContent: renderWithVariables(doc.textContent, variables),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.post(
  '/templates/:id/send-test',
  [body('to').isEmail().withMessage('Email destinataire invalide')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const template = await EmailTemplate.findById(req.params.id);
      if (!template) return res.status(404).json({ success: false, message: 'Template non trouvé' });
      if (!template.isActive) return res.status(400).json({ success: false, message: 'Template inactif' });

      const variables = req.body.variables || {};
      const subject = renderWithVariables(template.subject, variables);
      const htmlContent = renderWithVariables(template.htmlContent, variables);
      const textContent = renderWithVariables(template.textContent, variables);

      const result = await sendTransactionalEmailDetailed({
        to: req.body.to,
        toName: req.body.toName || '',
        subject,
        htmlContent,
        textContent,
      });
      if (!result.ok) {
        throw new Error(result.error || 'Envoi impossible (Brevo et SMTP non configurés ou en erreur)');
      }

      await logEmail({
        eventKey: 'template_test',
        to: req.body.to,
        toName: req.body.toName || '',
        subject,
        htmlContent,
        textContent,
        templateCode: template.code,
        variables,
        status: 'sent',
        sentBy: req.user.id,
        providerMessageId: result.provider || '',
      });

      res.json({ success: true, provider: result.provider, messageId: result.provider || null });
    } catch (error) {
      await logEmail({
        eventKey: 'template_test',
        to: req.body.to || '',
        toName: req.body.toName || '',
        subject: 'N/A',
        status: 'failed',
        error: error.message,
        sentBy: req.user.id,
      });
      res.status(500).json({ success: false, message: 'Erreur envoi test', error: error.message });
    }
  }
);

router.get('/events', async (req, res) => {
  try {
    const events = await EmailEventSetting.find().sort({ category: 1, eventKey: 1 });
    res.json({ success: true, count: events.length, events });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.put('/events/:id', async (req, res) => {
  try {
    const event = await EmailEventSetting.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Événement non trouvé' });
    ['label', 'description', 'category', 'templateCode', 'conditions'].forEach((k) => {
      if (req.body[k] !== undefined) event[k] = req.body[k];
    });
    if (req.body.enabled !== undefined) event.enabled = req.body.enabled;
    if (req.body.cooldownSec !== undefined) event.cooldownSec = req.body.cooldownSec;
    event.updatedBy = req.user.id;
    await event.save();
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const { to, status, eventKey, templateCode, page = 1, limit = 50 } = req.query;
    const q = {};
    if (to) q.to = { $regex: to, $options: 'i' };
    if (status) q.status = status;
    if (eventKey) q.eventKey = eventKey;
    if (templateCode) q.templateCode = templateCode;

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      EmailLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('sentBy', 'firstName lastName email'),
      EmailLog.countDocuments(q),
    ]);

    res.json({ success: true, logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

module.exports = router;


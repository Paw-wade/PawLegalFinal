const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const EmailTemplate = require('../models/EmailTemplate');
const { protect } = require('../middleware/auth');
const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');
const { getPrimaryFrontendUrl } = require('../utils/frontendOrigins');
const {
  escapeHtml,
  sendTransactionalEmail,
  sendTransactionalEmailDetailed,
} = require('../utils/emailNotifications');

const router = express.Router();
// Générer un token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your-secret-key-here', {
    // Session longue configurable (ex: 90d) pour limiter les reconnexions fréquentes.
    expiresIn: process.env.JWT_EXPIRES_IN || '90d'
  });
};

/** JWT court pour le premier clic depuis l’email d’inscription (pas de mot de passe dans le mail). */
const generateSignupActivationToken = (userId) => {
  return jwt.sign(
    { id: userId.toString(), purpose: 'signup_activate' },
    process.env.JWT_SECRET || 'your-secret-key-here',
    { expiresIn: process.env.SIGNUP_ACTIVATION_EXPIRES_IN || '48h' }
  );
};

function buildSignupActivationEmailPayload(user, activationUrl) {
  return {
    to: user.email,
    toName: `${user.firstName} ${user.lastName}`.trim(),
    subject: 'Activez votre compte Ada Papers',
    htmlContent: `
            <p>Bonjour ${escapeHtml(user.firstName)},</p>
            <p>Bienvenue sur Ada Papers. Pour choisir votre mot de passe et activer votre compte, cliquez sur le lien ci-dessous (lien personnel et limité dans le temps) :</p>
            <p style="margin:24px 0;"><a href="${activationUrl}" style="display:inline-block;padding:12px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Activer mon compte</a></p>
            <p style="font-size:13px;color:#555;">Si le bouton ne fonctionne pas, copiez-collez cette adresse dans votre navigateur :<br/><span style="word-break:break-all;">${activationUrl}</span></p>
            <p style="font-size:13px;color:#555;">Ce lien expire automatiquement. Aucun mot de passe n’est envoyé par email pour des raisons de sécurité.</p>
            <p>À très vite,<br/>L’équipe Ada Papers</p>
          `,
    textContent: `Bonjour ${user.firstName},\n\nPour activer votre compte et choisir votre mot de passe, ouvrez ce lien dans votre navigateur :\n${activationUrl}\n\nCe lien est personnel et expire automatiquement.`,
  };
}

const WELCOME_TEMPLATE_CODE = 'account_welcome';
const DEFAULT_WELCOME_TEMPLATE = {
  code: WELCOME_TEMPLATE_CODE,
  name: 'Bienvenue utilisateur',
  description: 'Envoyé après validation du compte (lien d’activation / OTP).',
  subject: 'Bienvenue sur Ada Papers, {{firstName}} !',
  htmlContent:
    '<p>Bienvenue sur Ada Papers, {{firstName}} !</p><p>Nous sommes ravis de vous accueillir. Votre espace personnel est maintenant actif.</p><p><strong>CE QUE VOUS POUVEZ FAIRE DÈS MAINTENANT</strong></p><p>📁 <strong>Création et suivi de dossier</strong><br/>Créez un dossier d’accompagnement et suivez l’avancement de votre dossier en temps réel, de la création jusqu’à la finalisation.</p><p>⏱️ <strong>Calculateur de délais</strong><br/>Anticipez vos échéances et planifiez vos démarches sereinement.</p><p>🤖 <strong>Paw AI</strong><br/>Obtenez des réponses claires et vérifiées, corroborées par des décisions de justice et adaptées à votre situation. Recevez également des recommandations sur les démarches à suivre.</p><p>💬 <strong>Accompagnement humain</strong><br/>Notre équipe reste disponible à chaque étape depuis votre espace.</p><p><strong>Accédez à votre espace :</strong> https://adapapers.fr</p><p>Cordialement,<br/>L’équipe Ada Papers</p><p style="font-size:12px;color:#666;">© 2025 Ada Papers — adapapers.fr<br/>Si vous n’êtes pas à l’origine de cette inscription, ignorez ce message.</p>',
  textContent:
    'Bienvenue sur Ada Papers, {{firstName}} !\n\nNous sommes ravis de vous accueillir. Votre espace personnel est maintenant actif.\n\nCE QUE VOUS POUVEZ FAIRE DÈS MAINTENANT\n\n📁 Création et suivi de dossier\nCréez un dossier d’accompagnement et suivez l’avancement de votre dossier en temps réel, de la création jusqu’à la finalisation.\n\n⏱️ Calculateur de délais\nAnticipez vos échéances et planifiez vos démarches sereinement.\n\n🤖 Paw AI\nObtenez des réponses claires et vérifiées, corroborées par des décisions de justice et adaptées à votre situation. Recevez également des recommandations sur les démarches à suivre.\n\n💬 Accompagnement humain\nNotre équipe reste disponible à chaque étape depuis votre espace.\n\nAccédez à votre espace : https://adapapers.fr\n\nCordialement,\nL’équipe Ada Papers\n\n© 2025 Ada Papers — adapapers.fr\nSi vous n’êtes pas à l’origine de cette inscription, ignorez ce message.',
  category: 'account',
  isSystem: true,
  isActive: true,
  variables: [
    { name: 'firstName', description: 'Prénom', example: 'Ablaye' },
    { name: 'lastName', description: 'Nom', example: 'Diop' },
  ],
};

function renderTemplateWithVariables(template, variables = {}) {
  return String(template || '').replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const value = variables[String(key).trim()];
    return value == null ? '' : String(value);
  });
}

async function ensureWelcomeTemplateExists() {
  try {
    const existing = await EmailTemplate.findOne({ code: WELCOME_TEMPLATE_CODE }).select('_id').lean();
    if (existing) return;
    await EmailTemplate.create(DEFAULT_WELCOME_TEMPLATE);
    console.log('✅ Template email account_welcome créé automatiquement.');
  } catch (e) {
    // Ne jamais bloquer l'inscription si la base est indisponible ou contrainte unique en concurrence.
    console.warn('⚠️ Impossible de garantir la présence du template account_welcome:', e.message || e);
  }
}

async function sendWelcomeEmailOnAccountCreated(user) {
  if (!user?.email) return false;
  let subject = DEFAULT_WELCOME_TEMPLATE.subject;
  let htmlContent = DEFAULT_WELCOME_TEMPLATE.htmlContent;
  let textContent = DEFAULT_WELCOME_TEMPLATE.textContent;

  try {
    const tpl = await EmailTemplate.findOne({
      code: WELCOME_TEMPLATE_CODE,
      isActive: true,
    })
      .sort({ version: -1, updatedAt: -1 })
      .lean();
    if (tpl?.subject && tpl?.htmlContent) {
      subject = tpl.subject;
      htmlContent = tpl.htmlContent;
      textContent = tpl.textContent || textContent;
    }
  } catch (e) {
    console.warn('⚠️ Lecture template account_welcome impossible, fallback par défaut:', e.message || e);
  }

  const variables = {
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
  };

  const detailed = await sendTransactionalEmailDetailed({
    to: user.email,
    toName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    subject: renderTemplateWithVariables(subject, variables),
    htmlContent: renderTemplateWithVariables(htmlContent, variables),
    textContent: renderTemplateWithVariables(textContent, variables),
  });

  if (!detailed.ok) {
    console.warn('⚠️ Email de bienvenue non envoyé:', detailed.error || 'inconnu');
  }
  return detailed.ok;
}

const getDaysRemainingForUser = (user) => {
  if (!user || user.role === 'admin' || user.role === 'superadmin' || user.profilComplete) {
    return null;
  }
  const daysSinceCreation = Math.floor(
    (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, 7 - daysSinceCreation);
};

const getGoogleClient = () => {
  if (!process.env.GOOGLE_CLIENT_ID) return null;
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
};

/** Lien de réinitialisation (email uniquement — pas de code SMS en doublon si l’utilisateur a un email). */
async function deliverPasswordResetLinkEmail(user) {
  if (!user?.email || !String(user.email).trim()) return false;
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHashed = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetPasswordToken = resetTokenHashed;
  user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
  await user.save();
  const resetUrl = `${getPrimaryFrontendUrl()}/auth/reset-password?token=${resetToken}`;
  const fn = escapeHtml(user.firstName || '');
  const htmlContent = `
        <p>Bonjour ${fn},</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe sur la plateforme.</p>
        <p>Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe (valable 1 heure) :</p>
        <p style="margin:20px 0;"><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Réinitialiser mon mot de passe</a></p>
        <p style="font-size:13px;color:#555;">Si le bouton ne fonctionne pas, copiez cette adresse :<br/><span style="word-break:break-all;">${resetUrl}</span></p>
        <p>Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet email.</p>
        <p>Ada Papers</p>`;
  const textContent = `Bonjour ${user.firstName || ''},

Réinitialisation du mot de passe (lien valable 1 heure) :
${resetUrl}

Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.

Ada Papers`;
  return sendTransactionalEmail({
    to: user.email,
    toName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    subject: 'Réinitialisation de votre mot de passe',
    htmlContent,
    textContent,
  });
}

// @route   POST /api/auth/register
// @desc    Créer un compte : mot de passe aléatoire inconnu + lien signé par email (pas de SMS)
// @access  Public
router.post(
  '/register',
  [
    body('firstName').trim().notEmpty().withMessage('Le prénom est requis'),
    body('lastName').trim().notEmpty().withMessage('Le nom est requis'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Le numéro de téléphone est requis'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { firstName, lastName, email, phone } = req.body;

      // Normaliser le numéro de téléphone
      const formattedPhone = formatPhoneNumber(phone);
      if (!formattedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Numéro de téléphone invalide',
        });
      }

      // Vérifier l'unicité de l'email et du téléphone
      const existingUser = await User.findOne({
        $or: [{ email }, { phone: formattedPhone }],
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Un utilisateur avec cet email ou ce numéro de téléphone existe déjà',
        });
      }

      const provisionalPassword = crypto.randomBytes(32).toString('hex');

      const user = await User.create({
        firstName,
        lastName,
        email,
        password: provisionalPassword,
        phone: formattedPhone,
        role: 'client',
        profilComplete: false,
        phoneVerified: false,
        needsPasswordSetup: true,
      });

      const activationToken = generateSignupActivationToken(user._id);
      const activationUrl = `${getPrimaryFrontendUrl()}/auth/activate?token=${encodeURIComponent(activationToken)}`;
      await ensureWelcomeTemplateExists();

      const activationDetail = await sendTransactionalEmailDetailed(
        buildSignupActivationEmailPayload(user, activationUrl)
      );
      const activationSent = activationDetail.ok;
      if (!activationSent) {
        console.error(
          '❌ Inscription : email d’activation non envoyé (Brevo/SMTP). Détail:',
          activationDetail.error || 'inconnu'
        );
        if (process.env.NODE_ENV === 'development') {
          console.warn('[dev] Lien d’activation (test manuel, ne pas partager) :', activationUrl);
        }
      }

      res.status(201).json({
        success: true,
        message: activationSent
          ? 'Compte créé. Consultez votre boîte mail pour activer votre compte.'
          : 'Compte créé. L’email d’activation n’a pas pu être envoyé (vérifiez BREVO_API_KEY ou SMTP sur le serveur). Utilisez « Renvoyer l’email » ci-dessous ou contactez le support.',
        emailSent: activationSent,
        code: activationSent ? undefined : 'ACTIVATION_EMAIL_FAILED',
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          phoneVerified: user.phoneVerified,
          needsPasswordSetup: user.needsPasswordSetup,
          profilComplete: user.profilComplete || false,
        }
      });
    } catch (error) {
      console.error('Erreur lors de l\'inscription:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de l\'inscription',
        error: error.message
      });
    }
  }
);

// @route   POST /api/auth/resend-activation
// @desc    Renvoyer l’email d’activation (compte en needsPasswordSetup)
// @access  Public
router.post(
  '/resend-activation',
  [body('email').isEmail().normalizeEmail().withMessage('Email invalide')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array(),
        });
      }

      const { email } = req.body;
      const genericMessage =
        'Si cette adresse correspond à un compte en attente d’activation, un email vient de vous être envoyé.';

      const user = await User.findOne({ email });
      if (!user || !user.needsPasswordSetup) {
        return res.json({ success: true, message: genericMessage, emailSent: null });
      }

      const activationToken = generateSignupActivationToken(user._id);
      const activationUrl = `${getPrimaryFrontendUrl()}/auth/activate?token=${encodeURIComponent(activationToken)}`;
      const detail = await sendTransactionalEmailDetailed(
        buildSignupActivationEmailPayload(user, activationUrl)
      );

      if (!detail.ok) {
        console.error('❌ resend-activation:', detail.error);
      }

      return res.json({
        success: true,
        message: genericMessage,
        emailSent: detail.ok,
      });
    } catch (error) {
      console.error('Erreur resend-activation:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
      });
    }
  }
);

// @route   POST /api/auth/complete-signup
// @desc    Définir le mot de passe après clic sur le lien signé reçu par email
// @access  Public
router.post(
  '/complete-signup',
  [
    body('token').notEmpty().withMessage('Le lien d\'activation est requis'),
    body('password').isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array(),
        });
      }

      const { token, password } = req.body;

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here');
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Lien invalide ou expiré. Demandez une nouvelle inscription ou contactez le support.',
        });
      }

      if (decoded.purpose !== 'signup_activate' || !decoded.id) {
        return res.status(400).json({
          success: false,
          message: 'Lien invalide.',
        });
      }

      const user = await User.findById(decoded.id).select('+password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur introuvable.',
        });
      }

      if (!user.needsPasswordSetup) {
        return res.status(400).json({
          success: false,
          message: 'Ce compte est déjà activé. Connectez-vous avec votre mot de passe.',
        });
      }

      user.password = password;
      user.needsPasswordSetup = false;
      await user.save();
      // Bienvenue uniquement après validation du compte par lien signé.
      await ensureWelcomeTemplateExists();
      await sendWelcomeEmailOnAccountCreated(user);

      try {
        const Log = require('../models/Log');
        Log.create({
          action: 'signup_activate',
          user: user._id,
          userEmail: user.email,
          description: `${user.email} a activé son compte via le lien email`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent'),
          metadata: { role: user.role },
        }).catch((logError) => {
          console.error('Erreur lors de l\'enregistrement du log signup_activate:', logError);
        });
      } catch (logError) {
        console.error('Erreur lors de l\'initialisation du log signup_activate:', logError);
      }

      const authToken = generateToken(user._id);

      let daysRemaining = null;
      if (user.role !== 'admin' && user.role !== 'superadmin' && !user.profilComplete) {
        const daysSinceCreation = Math.floor(
          (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        daysRemaining = Math.max(0, 7 - daysSinceCreation);
      }

      res.json({
        success: true,
        message: 'Compte activé',
        token: authToken,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          phoneVerified: user.phoneVerified,
          needsPasswordSetup: user.needsPasswordSetup,
          profilComplete: user.profilComplete || false,
          createdAt: user.createdAt,
          daysRemaining,
        },
      });
    } catch (error) {
      console.error('Erreur lors de l\'activation du compte:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de l\'activation',
        error: error.message,
      });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Connecter un utilisateur
// @access  Public
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('password').notEmpty().withMessage('Le mot de passe est requis')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ email }).select('+password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Identifiants invalides'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Compte désactivé. Contactez l\'administrateur.'
        });
      }

      const isPasswordValid = await user.comparePassword(password);
      
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Identifiants invalides'
        });
      }

      const token = generateToken(user._id);

      // Logger la connexion en non-bloquant pour ne pas ralentir la réponse login.
      try {
        const Log = require('../models/Log');
        Log.create({
          action: 'login',
          user: user._id,
          userEmail: user.email,
          description: `${user.email} s'est connecté`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent'),
          metadata: {
            role: user.role
          }
        }).catch((logError) => {
          console.error('Erreur lors de l\'enregistrement du log de connexion:', logError);
        });
      } catch (logError) {
        console.error('Erreur lors de l\'initialisation du log de connexion:', logError);
      }

      res.json({
        success: true,
        message: 'Connexion réussie',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          phoneVerified: user.phoneVerified,
          needsPasswordSetup: user.needsPasswordSetup,
          profilComplete: user.profilComplete || false,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('Erreur lors de la connexion:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la connexion',
        error: error.message
      });
    }
  }
);

// @route   POST /api/auth/google-login
// @desc    Connecter un utilisateur via Google (échange idToken -> token API)
// @access  Public
router.post(
  '/google-login',
  [body('idToken').notEmpty().withMessage('Le token Google est requis')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array(),
        });
      }

      const googleClient = getGoogleClient();
      if (!googleClient || !process.env.GOOGLE_CLIENT_ID) {
        return res.status(500).json({
          success: false,
          message: 'Connexion Google non configurée sur le serveur.',
        });
      }

      const { idToken } = req.body;
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      if (!payload?.email) {
        return res.status(401).json({
          success: false,
          message: 'Impossible de récupérer un email depuis Google.',
        });
      }

      const email = String(payload.email).trim().toLowerCase();
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Aucun compte Ada Papers n’est associé à cet email Google.',
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Compte désactivé. Contactez l’administrateur.',
        });
      }

      const token = generateToken(user._id);
      const daysRemaining = getDaysRemainingForUser(user);

      return res.json({
        success: true,
        message: 'Connexion Google réussie',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          phoneVerified: user.phoneVerified,
          needsPasswordSetup: user.needsPasswordSetup,
          profilComplete: user.profilComplete || false,
          createdAt: user.createdAt,
          daysRemaining,
        },
      });
    } catch (error) {
      console.error('Erreur lors de la connexion Google:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la connexion Google',
        error: error.message,
      });
    }
  }
);

// @route   POST /api/auth/forgot-password
// @desc    Demander une réinitialisation de mot de passe
// @access  Public
router.post(
  '/forgot-password',
  [
    body('email').isEmail().normalizeEmail().withMessage('Email invalide')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { email } = req.body;

      const user = await User.findOne({ email });

      if (!user) {
        return res.json({
          success: true,
          message: 'Si cet email existe, un lien de réinitialisation a été envoyé',
        });
      }

      const emailSent = await deliverPasswordResetLinkEmail(user);
      if (!emailSent) {
        console.warn('⚠️ Brevo : email de réinitialisation non envoyé pour', email);
      }

      res.json({
        success: true,
        message: 'Si cet email existe, un lien de réinitialisation a été envoyé',
      });
    } catch (error) {
      console.error('Erreur lors de la demande de réinitialisation:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   POST /api/auth/forgot-password-phone
// @desc    Demander l'envoi d'un code de vérification par SMS pour réinitialiser le mot de passe
// @access  Public
router.post(
  '/forgot-password-phone',
  [
    body('phone').trim().notEmpty().withMessage('Le numéro de téléphone est requis')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { phone } = req.body;
      const formattedPhone = formatPhoneNumber(phone);

      if (!formattedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Numéro de téléphone invalide'
        });
      }

      const user = await User.findOne({ phone: formattedPhone }).select('+resetPasswordToken +resetPasswordExpires');

      if (!user) {
        return res.json({
          success: true,
          message: 'Si ce numéro est associé à un compte, un SMS vient de vous être envoyé.',
        });
      }

      // Priorité email : lien sécurisé (pas de doublon avec code SMS / mot de passe temporaire)
      if (user.email && String(user.email).trim()) {
        const emailSent = await deliverPasswordResetLinkEmail(user);
        if (!emailSent) {
          console.warn('⚠️ Réinitialisation par téléphone : email prioritaire non envoyé pour', user.email);
        }
        return res.json({
          success: true,
          message:
            'Si ce numéro est associé à un compte, consultez votre boîte mail pour réinitialiser votre mot de passe.',
        });
      }

      // Générer un code de vérification à 6 chiffres
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedToken = crypto.createHash('sha256').update(verificationCode).digest('hex');
      const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      const isDev = process.env.NODE_ENV === 'development';
      const twilioNotConfigured =
        !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN;
      const devSimulateSms =
        isDev &&
        (process.env.ALLOW_OTP_WITHOUT_SMS === 'true' || twilioNotConfigured);

      const successPayload = (message, extra = {}) =>
        res.json({
          success: true,
          message,
          ...extra,
        });

      const persistResetCode = async () => {
        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = resetExpires;
        await user.save();
      };

      // Développement : même logique que /otp/send (SMS simulé ou Twilio absent)
      if (devSimulateSms) {
        await persistResetCode();
        console.log(
          `⚠️ [dev] SMS réinitialisation mdp simulé pour ${formattedPhone} — code : ${verificationCode} (10 min)`
        );
        return successPayload(
          'Si ce numéro est associé à un compte, un code de vérification a été généré (mode développement — SMS simulé).',
          { devResetCode: verificationCode }
        );
      }

      if (twilioNotConfigured) {
        console.error(
          '❌ Twilio non configuré : impossible d\'envoyer le SMS de réinitialisation (aucun jeton enregistré).'
        );
        return successPayload(
          'Si ce numéro est associé à un compte, un SMS vient de vous être envoyé avec un code de vérification.'
        );
      }

      try {
        await sendNotificationSMS(
          formattedPhone,
          'password_reset_temp',
          {
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            tempPassword: verificationCode,
          },
          {
            userId: user._id,
            context: 'auth',
            contextId: user._id.toString(),
            skipPreferences: true,
          }
        );
        await persistResetCode();
        return successPayload(
          'Si ce numéro est associé à un compte, un SMS vient de vous être envoyé avec un code de vérification.'
        );
      } catch (smsError) {
        console.error('Erreur lors de l\'envoi du SMS de réinitialisation:', smsError);
        if (isDev) {
          await persistResetCode();
          console.log(
            `⚠️ [dev] Envoi SMS échoué — code réinitialisation conservé pour ${formattedPhone} : ${verificationCode} (10 min)`
          );
          return successPayload(
            'Si ce numéro est associé à un compte, un code a été généré (développement — échec envoi SMS).',
            { devResetCode: verificationCode }
          );
        }
        return successPayload(
          'Si ce numéro est associé à un compte, un SMS vient de vous être envoyé avec un code de vérification.'
        );
      }
    } catch (error) {
      console.error('Erreur lors de la demande de réinitialisation par téléphone:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   POST /api/auth/reset-password-phone
// @desc    Réinitialiser le mot de passe à partir du téléphone + code de vérification
// @access  Public
router.post(
  '/reset-password-phone',
  [
    body('phone').trim().notEmpty().withMessage('Le numéro de téléphone est requis'),
    body('code').trim().notEmpty().withMessage('Le code de vérification est requis'),
    body('password').isLength({ min: 8 }).withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { phone, code, password } = req.body;
      const formattedPhone = formatPhoneNumber(phone);

      if (!formattedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Numéro de téléphone invalide'
        });
      }

      const hashedToken = crypto.createHash('sha256').update(code).digest('hex');

      const user = await User.findOne({
        phone: formattedPhone,
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() }
      }).select('+password +resetPasswordToken +resetPasswordExpires');

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Code de vérification invalide ou expiré pour ce numéro de téléphone'
        });
      }

      // Mettre à jour le mot de passe et nettoyer les champs de reset
      user.password = password;
      user.needsPasswordSetup = false;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      user.phoneVerified = true;
      await user.save();

      return res.json({
        success: true,
        message: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.'
      });
    } catch (error) {
      console.error('Erreur lors de la réinitialisation du mot de passe par téléphone:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   POST /api/auth/setup-password
// @desc    Définir le mot de passe lors de la première connexion
// @access  Private
router.post(
  '/setup-password',
  protect,
  [
    body('password').isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères'),
    body('email').optional().isEmail().normalizeEmail().withMessage('Email invalide')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { password, email } = req.body;
      const user = await User.findById(req.user.id).select('+password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Vérifier si l'utilisateur a déjà un mot de passe
      if (user.password && !user.needsPasswordSetup) {
        return res.status(400).json({
          success: false,
          message: 'Un mot de passe est déjà défini pour ce compte'
        });
      }

      // Définir le mot de passe
      user.password = password;
      user.needsPasswordSetup = false;

      // Si un email est fourni, l'ajouter au profil
      if (email) {
        // Vérifier si l'email n'est pas déjà utilisé
        const existingUserWithEmail = await User.findOne({ email, _id: { $ne: user._id } });
        if (existingUserWithEmail) {
          return res.status(400).json({
            success: false,
            message: 'Cet email est déjà utilisé par un autre compte'
          });
        }
        user.email = email;
      }

      await user.save();

      // Logger l'action
      try {
        const Log = require('../models/Log');
        await Log.create({
          action: 'setup_password',
          user: user._id,
          userEmail: user.email || `phone:${user.phone}`,
          description: 'Définition du mot de passe lors de la première connexion',
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent')
        });
      } catch (logError) {
        console.error('Erreur lors de l\'enregistrement du log:', logError);
      }

      res.json({
        success: true,
        message: 'Mot de passe défini avec succès',
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          phoneVerified: user.phoneVerified,
          needsPasswordSetup: user.needsPasswordSetup,
          profilComplete: user.profilComplete || false
        }
      });
    } catch (error) {
      console.error('Erreur lors de la définition du mot de passe:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   POST /api/auth/reset-password
// @desc    Réinitialiser le mot de passe avec un token
// @access  Public
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Token de réinitialisation manquant'),
    body('password').isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { token, password } = req.body;

      const tokenHashed = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      const user = await User.findOne({
        resetPasswordToken: tokenHashed,
        resetPasswordExpires: { $gt: Date.now() },
      }).select('+password');

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Lien de réinitialisation invalide ou expiré',
        });
      }

      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      user.needsPasswordSetup = false;

      await user.save();

      return res.json({
        success: true,
        message: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.',
      });
    } catch (error) {
      console.error('Erreur lors de la réinitialisation du mot de passe:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la réinitialisation du mot de passe',
        error: error.message,
      });
    }
  }
);

// @route   POST /api/auth/login-phone
// @desc    Connecter un utilisateur par téléphone (sans mot de passe si needsPasswordSetup)
// @access  Public
router.post(
  '/login-phone',
  [
    body('phone').trim().notEmpty().withMessage('Le numéro de téléphone est requis')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { phone } = req.body;
      const { formatPhoneNumber } = require('../sendSMS');
      const formattedPhone = formatPhoneNumber(phone);

      if (!formattedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Numéro de téléphone invalide'
        });
      }

      const user = await User.findOne({ phone: formattedPhone });
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Aucun compte trouvé avec ce numéro de téléphone'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Compte désactivé. Contactez l\'administrateur.'
        });
      }

      if (!user.phoneVerified) {
        return res.status(401).json({
          success: false,
          message: 'Numéro de téléphone non vérifié'
        });
      }

      // Si l'utilisateur n'a pas de mot de passe, permettre la connexion
      if (user.needsPasswordSetup || !user.password) {
        const token = generateToken(user._id);
        
        return res.json({
          success: true,
          message: 'Connexion réussie. Veuillez définir un mot de passe.',
          token,
          needsPasswordSetup: true,
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            phoneVerified: user.phoneVerified,
            needsPasswordSetup: true,
            profilComplete: user.profilComplete || false
          }
        });
      }

      // Si l'utilisateur a un mot de passe, demander le mot de passe
      return res.status(400).json({
        success: false,
        message: 'Veuillez utiliser la connexion avec email/mot de passe ou définir un mot de passe'
      });
    } catch (error) {
      console.error('Erreur lors de la connexion par téléphone:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la connexion',
        error: error.message
      });
    }
  }
);

// @route   GET /api/auth/me
// @desc    Récupérer l'utilisateur connecté
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        phoneVerified: user.phoneVerified,
        needsPasswordSetup: user.needsPasswordSetup,
        profilComplete: user.profilComplete || false,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;



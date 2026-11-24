const express = require('express');
const { body, validationResult } = require('express-validator');
const OTP = require('../models/OTP');
const User = require('../models/User');
const EmailTemplate = require('../models/EmailTemplate');
const { sendSMS, formatPhoneNumber } = require('../sendSMS');
const { sendTransactionalEmailDetailed, escapeHtml } = require('../utils/emailNotifications');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth');

const router = express.Router();
const WELCOME_TEMPLATE_CODE = 'account_welcome';
const OTP_WELCOME_FALLBACK = {
  subject: 'Bienvenue sur Ada Papers, {{firstName}} !',
  htmlContent:
    '<p>Bienvenue sur Ada Papers, {{firstName}} !</p><p>Nous sommes ravis de vous accueillir. Votre espace personnel est maintenant actif.</p><p><strong>CE QUE VOUS POUVEZ FAIRE DÈS MAINTENANT</strong></p><p>📁 <strong>Création et suivi de dossier</strong><br/>Créez un dossier d’accompagnement et suivez l’avancement de votre dossier en temps réel, de la création jusqu’à la finalisation.</p><p>⏱️ <strong>Calculateur de délais</strong><br/>Anticipez vos échéances et planifiez vos démarches sereinement.</p><p>🤖 <strong>Paw AI</strong><br/>Obtenez des réponses claires et vérifiées, corroborées par des décisions de justice et adaptées à votre situation. Recevez également des recommandations sur les démarches à suivre.</p><p>💬 <strong>Accompagnement humain</strong><br/>Notre équipe reste disponible à chaque étape depuis votre espace.</p><p><strong>Accédez à votre espace :</strong> https://adapapers.fr</p><p>Cordialement,<br/>L’équipe Ada Papers</p><p style="font-size:12px;color:#666;">© 2025 Ada Papers - adapapers.fr<br/>Si vous n’êtes pas à l’origine de cette inscription, ignorez ce message.</p>',
  textContent:
    'Bienvenue sur Ada Papers, {{firstName}} !\n\nNous sommes ravis de vous accueillir. Votre espace personnel est maintenant actif.\n\nCE QUE VOUS POUVEZ FAIRE DÈS MAINTENANT\n\n📁 Création et suivi de dossier\nCréez un dossier d’accompagnement et suivez l’avancement de votre dossier en temps réel, de la création jusqu’à la finalisation.\n\n⏱️ Calculateur de délais\nAnticipez vos échéances et planifiez vos démarches sereinement.\n\n🤖 Paw AI\nObtenez des réponses claires et vérifiées, corroborées par des décisions de justice et adaptées à votre situation. Recevez également des recommandations sur les démarches à suivre.\n\n💬 Accompagnement humain\nNotre équipe reste disponible à chaque étape depuis votre espace.\n\nAccédez à votre espace : https://adapapers.fr\n\nCordialement,\nL’équipe Ada Papers\n\n© 2025 Ada Papers - adapapers.fr\nSi vous n’êtes pas à l’origine de cette inscription, ignorez ce message.',
};

function renderTemplateWithVariables(template, variables = {}) {
  return String(template || '').replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const value = variables[String(key).trim()];
    return value == null ? '' : String(value);
  });
}

async function ensureWelcomeTemplateExistsForOtp() {
  try {
    const existing = await EmailTemplate.findOne({ code: WELCOME_TEMPLATE_CODE }).select('_id').lean();
    if (existing) return;
    await EmailTemplate.create({
      code: WELCOME_TEMPLATE_CODE,
      name: 'Bienvenue utilisateur',
      description: 'Envoyé après validation du compte (lien d’activation / OTP).',
      subject: OTP_WELCOME_FALLBACK.subject,
      htmlContent: OTP_WELCOME_FALLBACK.htmlContent,
      textContent: OTP_WELCOME_FALLBACK.textContent,
      category: 'account',
      isSystem: true,
      isActive: true,
      variables: [
        { name: 'firstName', description: 'Prénom', example: 'Ablaye' },
        { name: 'lastName', description: 'Nom', example: 'Diop' },
      ],
    });
  } catch (error) {
    console.warn('⚠️ Impossible de créer le template account_welcome via OTP:', error.message || error);
  }
}

async function sendWelcomeEmailAfterOtpValidation(user) {
  if (!user?.email) return;
  await ensureWelcomeTemplateExistsForOtp();
  let subject = OTP_WELCOME_FALLBACK.subject;
  let htmlContent = OTP_WELCOME_FALLBACK.htmlContent;
  let textContent = OTP_WELCOME_FALLBACK.textContent;

  try {
    const tpl = await EmailTemplate.findOne({ code: WELCOME_TEMPLATE_CODE, isActive: true })
      .sort({ version: -1, updatedAt: -1 })
      .lean();
    if (tpl?.subject && tpl?.htmlContent) {
      subject = tpl.subject;
      htmlContent = tpl.htmlContent;
      textContent = tpl.textContent || textContent;
    }
  } catch (error) {
    console.warn('⚠️ Lecture template account_welcome impossible via OTP:', error.message || error);
  }

  const variables = {
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
  };

  const detail = await sendTransactionalEmailDetailed({
    to: user.email,
    toName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    subject: renderTemplateWithVariables(subject, variables),
    htmlContent: renderTemplateWithVariables(htmlContent, variables),
    textContent: renderTemplateWithVariables(textContent, variables),
  });
  if (!detail.ok) {
    console.warn('⚠️ Email de bienvenue non envoyé après OTP:', detail.error || 'inconnu');
  }
}

// Générer un token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your-secret-key-here', {
    expiresIn: '30d'
  });
};

// Générer un code OTP aléatoire (6 chiffres)
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

function buildWaLink(code) {
  const botPhone = process.env.WHATSAPP_BOT_PHONE;
  if (!botPhone) return null;
  return `https://wa.me/${botPhone}?text=${encodeURIComponent(code)}`;
}

// @route   POST /api/otp/send
// @desc    Creer un OTP - WhatsApp prioritaire, email en secours
// @access  Public
router.post(
  '/send',
  [
    body('firstName').trim().notEmpty().withMessage('Le prenom est requis'),
    body('lastName').trim().notEmpty().withMessage('Le nom est requis'),
    body('phone').trim().notEmpty().withMessage('Le numero de telephone est requis'),
    body('email').trim().isEmail().withMessage("L'adresse email est requise et doit etre valide"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0]?.msg || 'Erreurs de validation',
          errors: errors.array(),
        });
      }

      const { firstName, lastName, phone, email } = req.body;
      const cleanEmail = email.trim().toLowerCase();

      const formattedPhone = formatPhoneNumber(phone);
      if (!formattedPhone) {
        return res.status(400).json({ success: false, message: 'Numero de telephone invalide' });
      }

      const botPhone = process.env.WHATSAPP_BOT_PHONE;
      if (!botPhone) {
        return res.status(503).json({
          success: false,
          message: 'La verification WhatsApp n\'est pas configuree. Contactez le support.',
        });
      }

      const normalizedBotPhone = '+' + botPhone.replace(/^\+/, '');
      if (formattedPhone === normalizedBotPhone) {
        return res.status(400).json({ success: false, message: 'Numero de telephone invalide' });
      }

      const existingUser = await User.findOne({ phone: formattedPhone });
      if (existingUser && existingUser.password && !existingUser.needsPasswordSetup) {
        return res.status(400).json({
          success: false,
          message: 'Un compte avec ce numero de telephone existe deja. Veuillez vous connecter.',
        });
      }

      const code = generateOTP();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await OTP.deleteMany({ phone: formattedPhone });

      await OTP.create({
        phone: formattedPhone,
        code,
        firstName,
        lastName,
        email: cleanEmail,
        expiresAt,
        channel: 'whatsapp',
        attempts: 0,
      });

      const waLink = buildWaLink(code);

      console.log(`[otp/send] Code WhatsApp genere pour ${formattedPhone}`);
      return res.json({
        success: true,
        channel: 'whatsapp',
        waLink,
        waPhone: botPhone,
        expiresAt: expiresAt.toISOString(),
        message: `Envoyez le code au bot WhatsApp Ada Papers pour verifier votre numero.`,
      });
    } catch (error) {
      console.error('[otp/send] Erreur serveur:', error);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// @route   POST /api/otp/send-sms
// @desc    Fallback : envoyer le code par SMS Twilio
// @access  Public
router.post(
  '/send-sms',
  [body('phone').trim().notEmpty().withMessage('Le numero de telephone est requis')],
  async (req, res) => {
    try {
      const { phone } = req.body;
      const formattedPhone = formatPhoneNumber(phone);
      if (!formattedPhone) {
        return res.status(400).json({ success: false, message: 'Numero de telephone invalide' });
      }

      const otp = await OTP.findOne({ phone: formattedPhone, verified: false });
      if (!otp) {
        return res.status(404).json({
          success: false,
          message: 'Aucun code en attente. Recommencez l\'inscription.',
        });
      }
      if (new Date() > otp.expiresAt) {
        return res.status(400).json({
          success: false,
          message: 'Code expire. Recommencez l\'inscription.',
        });
      }

      const smsText = `Ada Papers - votre code de verification : ${otp.code}. Valable 15 min.`;
      try {
        await sendSMS(formattedPhone, smsText);
      } catch (smsErr) {
        console.error('[otp/send-sms] Echec SMS:', smsErr.message);
        return res.status(500).json({
          success: false,
          message: "Impossible d'envoyer le SMS. Verifiez votre numero ou utilisez WhatsApp.",
        });
      }

      otp.channel = 'sms';
      await otp.save();

      console.log(`[otp/send-sms] SMS envoye a ${formattedPhone}`);
      return res.json({
        success: true,
        channel: 'sms',
        message: 'Code envoye par SMS. Saisissez-le ci-dessous.',
      });
    } catch (error) {
      console.error('[otp/send-sms] Erreur serveur:', error);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// @route   GET /api/otp/wa-status
// @desc    Polling : verifier si le code WhatsApp a ete valide par le webhook
// @access  Public
router.get('/wa-status', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'Parametre phone requis' });

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      return res.status(400).json({ success: false, message: 'Numero invalide' });
    }

    const otp = await OTP.findOne({ phone: formattedPhone }).select('+waToken');
    if (!otp || !otp.waVerified || !otp.waToken) {
      return res.json({ verified: false });
    }

    const { waToken } = otp;

    await OTP.deleteOne({ _id: otp._id });

    return res.json({ verified: true, token: waToken });
  } catch (error) {
    console.error('[otp/wa-status] Erreur:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   POST /api/otp/whatsapp-link-code
// @desc    Compte existant sans telephone verifie : genere un code pour lier le numero via WhatsApp
// @access  Prive (utilisateur connecte)
router.post('/whatsapp-link-code', protect, async (req, res) => {
  try {
    const user = req.user;
    if (!user.phone) {
      return res.status(400).json({ success: false, message: 'Aucun numero de telephone sur ce compte.' });
    }

    const botPhone = process.env.WHATSAPP_BOT_PHONE;
    if (!botPhone) {
      return res.status(503).json({ success: false, message: 'WhatsApp non configure.' });
    }

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.deleteMany({ phone: user.phone, verified: false });
    await OTP.create({
      phone: user.phone,
      code,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email || '',
      expiresAt,
      channel: 'whatsapp',
      attempts: 0,
    });

    const waLink = buildWaLink(code);

    return res.json({
      success: true,
      waLink,
      waPhone: botPhone,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('[otp/whatsapp-link-code] Erreur:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   POST /api/otp/verify
// @desc    Vérifier le code OTP et créer le compte
// @access  Public
router.post(
  '/verify',
  [
    body('phone').trim().notEmpty().withMessage('Le numéro de téléphone est requis'),
    body('code').trim().notEmpty().withMessage('Le code OTP est requis'),
    body('email').optional({ nullable: true, checkFalsy: true }).custom((value) => {
      if (value && value.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error('Email invalide');
        }
      }
      return true;
    }).normalizeEmail()
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

      const { phone, code, email } = req.body;

      // Formater le numéro de téléphone
      const formattedPhone = formatPhoneNumber(phone);
      if (!formattedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Numéro de téléphone invalide'
        });
      }

      // Trouver le code OTP
      const otp = await OTP.findOne({
        phone: formattedPhone,
        code: code.trim(),
        verified: false
      });

      if (!otp) {
        return res.status(400).json({
          success: false,
          message: 'Code OTP invalide ou expiré'
        });
      }

      // Vérifier si le code n'a pas expiré
      if (new Date() > otp.expiresAt) {
        await OTP.findByIdAndDelete(otp._id);
        return res.status(400).json({
          success: false,
          message: 'Code OTP expiré. Veuillez demander un nouveau code.'
        });
      }

      // Mettre à jour l'OTP avec l'email si fourni lors de la vérification
      if (email && email.trim() !== '') {
        otp.email = email.trim().toLowerCase();
      }
      await otp.save();

      // Vérifier si un utilisateur avec ce numéro existe déjà
      let user = await User.findOne({ phone: formattedPhone });
      
      // Rôle par défaut pour une inscription publique via OTP
      const finalRole = 'client';
      
      if (!user) {
        // Créer un nouvel utilisateur sans mot de passe
        const userData = {
          firstName: otp.firstName,
          lastName: otp.lastName,
          phone: formattedPhone,
          phoneVerified: true,
          needsPasswordSetup: true, // L'utilisateur devra définir un mot de passe
          role: finalRole,
          profilComplete: false
        };

        if (otp.email && otp.email.trim() !== '') {
          userData.email = otp.email.trim().toLowerCase();
        }
        if (otp.organisationName && otp.organisationName.trim() !== '') {
          userData.organisationName = otp.organisationName.trim();
        }

        user = await User.create(userData);

        // Créer les permissions par défaut (toutes refusées pour consulat, avocat et association)
        if (finalRole === 'consulat' || finalRole === 'avocat' || finalRole === 'association') {
          const Permission = require('../models/Permission');
          const allDomaines = [
            'tableau_de_bord', 'utilisateurs', 'dossiers', 'taches',
            'rendez_vous', 'creneaux', 'messages', 'documents',
            'temoignages', 'notifications', 'sms', 'cms', 'logs', 'corbeille'
          ];
          
          const defaultPermissions = allDomaines.map(domaine => ({
            domaine,
            consulter: false,
            modifier: false,
            nePasConsulter: true,
            nePasModifier: true,
            supprimer: false
          }));

          await Permission.create({
            user: user._id,
            roles: [finalRole],
            permissions: defaultPermissions
          });
          console.log('✅ Permissions par défaut créées (toutes refusées) pour', finalRole);
        }
      } else {
        // Mettre à jour l'utilisateur existant
        user.phoneVerified = true;
        if (otp.email && otp.email.trim() !== '' && !user.email) {
          user.email = otp.email.trim().toLowerCase();
        }
        if (otp.organisationName && otp.organisationName.trim() !== '' && !user.organisationName) {
          user.organisationName = otp.organisationName.trim();
        }
        await user.save();
      }

      // Marquer le code OTP comme vérifié
      otp.verified = true;
      await otp.save();

      // Générer un token JWT
      const token = generateToken(user._id);

      // Logger la création de compte
      try {
        const Log = require('../models/Log');
        await Log.create({
          action: 'signup_otp',
          user: user._id,
          userEmail: user.email || `phone:${formattedPhone}`,
          description: `Création de compte via OTP pour ${formattedPhone}`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent'),
          metadata: {
            phone: formattedPhone,
            needsPasswordSetup: true
          }
        });
      } catch (logError) {
        console.error('Erreur lors de l\'enregistrement du log:', logError);
      }

      // Bienvenue uniquement après validation OTP.
      await sendWelcomeEmailAfterOtpValidation(user);

      res.json({
        success: true,
        message: 'Code OTP vérifié avec succès',
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
          profilComplete: user.profilComplete || false
        }
      });
    } catch (error) {
      console.error('Erreur lors de la vérification de l\'OTP:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

module.exports = router;


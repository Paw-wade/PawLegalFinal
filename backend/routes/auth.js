const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');

const router = express.Router();

const { sendNotificationSMS } = require('../sendSMS');
const { formatPhoneNumber } = require('../sendSMS');
// Générer un token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your-secret-key-here', {
    expiresIn: '30d'
  });
};

// Mot de passe temporaire par défaut envoyé par SMS lors de la création de compte
const DEFAULT_TEMP_PASSWORD = process.env.DEFAULT_TEMP_PASSWORD || 'Adap2026+';

// @route   POST /api/auth/register
// @desc    Enregistrer un nouvel utilisateur avec mot de passe par défaut envoyé par SMS
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

      const user = await User.create({
        firstName,
        lastName,
        email,
        // Mot de passe temporaire par défaut (sera changé à la première connexion)
        password: DEFAULT_TEMP_PASSWORD,
        phone: formattedPhone,
        role: 'client',
        profilComplete: false,
        phoneVerified: true,
        needsPasswordSetup: true,
      });

      // Envoyer le mot de passe temporaire par SMS
      let smsSent = false;
      try {
        const message = `Bonjour ${user.firstName}, votre compte Ada Papers a été créé.\n\nVotre mot de passe temporaire est : ${DEFAULT_TEMP_PASSWORD}\n\nPour votre sécurité, changez-le lors de votre première connexion.`;
        await sendNotificationSMS(user.phone, 'account_security', { message }, {
          userId: user._id,
          context: 'account',
          contextId: user._id,
          skipPreferences: false,
        });
        smsSent = true;
      } catch (smsError) {
        console.error('Erreur lors de l\'envoi du SMS de création de compte:', smsError);
        // On ne bloque pas la création du compte, le mot de passe par défaut est connu (Adap2026+)
      }

      res.status(201).json({
        success: true,
        message: 'Compte créé avec succès',
        smsSent,
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

      // Vérifier si le profil doit être complété (sauf pour admin/superadmin)
      if (user.role !== 'admin' && user.role !== 'superadmin') {
        const daysSinceCreation = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        if (!user.profilComplete && daysSinceCreation >= 7) {
          return res.status(403).json({
            success: false,
            message: 'Votre profil doit être complété dans les 7 jours suivant la création du compte. Le délai est dépassé. Veuillez contacter l\'administrateur pour réactiver votre compte.',
            code: 'PROFILE_EXPIRED'
          });
        }
      }

      const isPasswordValid = await user.comparePassword(password);
      
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Identifiants invalides'
        });
      }

      const token = generateToken(user._id);

      // Logger la connexion
      try {
        const Log = require('../models/Log');
        await Log.create({
          action: 'login',
          user: user._id,
          userEmail: user.email,
          description: `${user.email} s'est connecté`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent'),
          metadata: {
            role: user.role
          }
        });
      } catch (logError) {
        console.error('Erreur lors de l\'enregistrement du log de connexion:', logError);
        // Continuer même si le log échoue
      }

      // Calculer les jours restants pour compléter le profil (sauf pour admin/superadmin)
      let daysRemaining = null;
      if (user.role !== 'admin' && user.role !== 'superadmin' && !user.profilComplete) {
        const daysSinceCreation = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        daysRemaining = Math.max(0, 7 - daysSinceCreation);
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
          createdAt: user.createdAt,
          daysRemaining
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
        // Toujours répondre succès pour ne pas révéler l'existence des comptes
        return res.json({
          success: true,
          message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
        });
      }

      // Générer un token de réinitialisation
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHashed = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

      // Stocker le token hashé et la date d'expiration (1h)
      user.resetPasswordToken = resetTokenHashed;
      user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
      await user.save();

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3004';
      const resetUrl = `${frontendUrl}/auth/reset-password?token=${resetToken}`;

      // Préparer le contenu de l'email
      const subject = 'Réinitialisation de votre mot de passe';
      const text = `Bonjour ${user.firstName || ''},

Vous avez demandé à réinitialiser votre mot de passe sur la plateforme.

Cliquez sur le lien suivant (ou copiez-le dans votre navigateur) pour définir un nouveau mot de passe. Ce lien est valable 1 heure :

${resetUrl}

Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.

Ada Papers`;

      const html = `
        <p>Bonjour ${user.firstName || ''},</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe sur la plateforme.</p>
        <p>Cliquez sur le lien suivant pour définir un nouveau mot de passe (valable 1 heure) :</p>
        <p><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">${resetUrl}</a></p>
        <p>Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.</p>
        <p>Ada Papers</p>
      `;

      // Essayer d'envoyer l'email si la configuration SMTP est présente
      let emailSent = false;
      try {
        const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
        if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && EMAIL_FROM) {
          const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: Number(SMTP_PORT) === 465,
            auth: {
              user: SMTP_USER,
              pass: SMTP_PASS,
            },
          });

          await transporter.sendMail({
            from: EMAIL_FROM,
            to: user.email,
            subject,
            text,
            html,
          });
          emailSent = true;
        } else {
          console.warn('⚠️ SMTP non configuré, impossible d\'envoyer l\'email de réinitialisation. Lien:', resetUrl);
        }
      } catch (emailError) {
        console.error('❌ Erreur lors de l\'envoi de l\'email de réinitialisation:', emailError);
      }

      if (!emailSent) {
        // Toujours logguer le lien en développement pour pouvoir le tester
        console.log('🔗 Lien de réinitialisation de mot de passe:', resetUrl);
      }

      res.json({
        success: true,
        message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
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
        // Toujours répondre succès pour ne pas révéler l'existence des comptes
        return res.json({
          success: true,
          message: 'Si ce numéro est associé à un compte, un SMS vient de vous être envoyé.'
        });
      }

      // Générer un code de vérification à 6 chiffres
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Stocker une version hachée du code dans le compte utilisateur avec une expiration courte (10 minutes)
      const hashedToken = crypto.createHash('sha256').update(verificationCode).digest('hex');
      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await user.save();

      // Envoyer le code de vérification par SMS
      try {
        await sendNotificationSMS(
          formattedPhone,
          'password_reset_temp',
          {
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            tempPassword: verificationCode, // utilisé comme code de vérification
          },
          {
            userId: user._id,
            context: 'auth',
            contextId: user._id.toString(),
            // SMS critique pour l'accès : on ignore les préférences générales
            skipPreferences: true,
          }
        );
      } catch (smsError) {
        console.error('Erreur lors de l\'envoi du SMS de réinitialisation:', smsError);
        // Même si le SMS échoue, ne pas révéler l’erreur précise au client
      }

      return res.json({
        success: true,
        message: 'Si ce numéro est associé à un compte, un SMS vient de vous être envoyé avec un code de vérification.'
      });
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



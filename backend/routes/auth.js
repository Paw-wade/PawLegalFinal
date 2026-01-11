const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Générer un token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your-secret-key-here', {
    expiresIn: '30d'
  });
};

// @route   POST /api/auth/register
// @desc    Enregistrer un nouvel utilisateur
// @access  Public
router.post(
  '/register',
  [
    body('firstName').trim().notEmpty().withMessage('Le prénom est requis'),
    body('lastName').trim().notEmpty().withMessage('Le nom est requis'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
    body('phone').optional().trim()
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

      const { firstName, lastName, email, password, phone } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Un utilisateur avec cet email existe déjà'
        });
      }

      const user = await User.create({
        firstName,
        lastName,
        email,
        password,
        phone: phone || undefined,
        role: 'client',
        profilComplete: false
      });

      const token = generateToken(user._id);

      res.status(201).json({
        success: true,
        message: 'Compte créé avec succès',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profilComplete: user.profilComplete || false
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
        return res.json({
          success: true,
          message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
        });
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



const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { handleImpersonation, getEffectiveUserId } = require('../middleware/impersonation');

const router = express.Router();

// Middleware de débogage pour toutes les routes
router.use((req, res, next) => {
  console.log('🔍 Route interceptée:', req.method, req.path, req.originalUrl); // Debug log
  next();
});

// Toutes les routes nécessitent une authentification
router.use(protect);
// Activer l'impersonation pour permettre aux admins d'agir au nom d'un utilisateur
router.use(handleImpersonation);

// @route   GET /api/user/profile
// @desc    Récupérer le profil de l'utilisateur effectif
// @access  Private
router.get('/profile', async (req, res) => {
  try {
    const effectiveUserId = getEffectiveUserId(req);
    const user = await User.findById(effectiveUserId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

      res.json({
        success: true,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profilComplete: user.profilComplete || false,
          smsPreferences: user.smsPreferences || { enabled: true, types: {} },
          dateNaissance: user.dateNaissance,
          lieuNaissance: user.lieuNaissance,
          nationalite: user.nationalite,
          sexe: user.sexe,
          numeroEtranger: user.numeroEtranger,
          numeroTitre: user.numeroTitre,
          typeTitre: user.typeTitre,
          dateDelivrance: user.dateDelivrance,
          dateExpiration: user.dateExpiration,
          adressePostale: user.adressePostale,
          ville: user.ville,
          codePostal: user.codePostal,
          pays: user.pays,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
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

// @route   PUT /api/user/profile
// @desc    Mettre à jour le profil de l'utilisateur effectif
// @access  Private
router.put(
  '/profile',
  [
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
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

      const {
        firstName,
        lastName,
        phone,
        dateNaissance,
        lieuNaissance,
        nationalite,
        sexe,
        numeroEtranger,
        numeroTitre,
        typeTitre,
        dateDelivrance,
        dateExpiration,
        adressePostale,
        ville,
        codePostal,
        pays,
        profilComplete,
        smsPreferences
      } = req.body;
      
      const effectiveUserId = getEffectiveUserId(req);
      const user = await User.findById(effectiveUserId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (phone !== undefined) user.phone = phone;
      if (dateNaissance) user.dateNaissance = dateNaissance;
      if (lieuNaissance) user.lieuNaissance = lieuNaissance;
      if (nationalite) user.nationalite = nationalite;
      if (sexe) user.sexe = sexe;
      if (numeroEtranger) user.numeroEtranger = numeroEtranger;
      if (numeroTitre) user.numeroTitre = numeroTitre;
      if (typeTitre) user.typeTitre = typeTitre;
      if (dateDelivrance) user.dateDelivrance = dateDelivrance;
      if (dateExpiration) user.dateExpiration = dateExpiration;
      if (adressePostale !== undefined) user.adressePostale = adressePostale;
      if (ville !== undefined) user.ville = ville;
      if (codePostal !== undefined) user.codePostal = codePostal;
      if (pays !== undefined) user.pays = pays;
      if (profilComplete !== undefined) user.profilComplete = profilComplete;

      await user.save();

      res.json({
        success: true,
        message: 'Profil mis à jour avec succès',
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profilComplete: user.profilComplete || false,
          smsPreferences: user.smsPreferences || { enabled: true, types: {} }
        }
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du profil:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   PUT /api/user/sms-preferences
// @desc    Mettre à jour les préférences SMS
// @access  Private
router.put(
  '/sms-preferences',
  [
    body('enabled').optional().isBoolean(),
    body('types').optional().isObject()
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

      const effectiveUserId = getEffectiveUserId(req);
      const user = await User.findById(effectiveUserId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const { enabled, types } = req.body;

      if (!user.smsPreferences) {
        user.smsPreferences = {
          enabled: true,
          types: {}
        };
      }

      if (enabled !== undefined) {
        user.smsPreferences.enabled = enabled;
      }

      if (types) {
        user.smsPreferences.types = user.smsPreferences.types || {};
        Object.keys(types).forEach(type => {
          // Ne pas permettre de désactiver l'OTP pour des raisons de sécurité
          if (type === 'otp' && types[type] === false) {
            return; // Ignorer la désactivation de l'OTP
          }
          user.smsPreferences.types[type] = types[type];
        });
      }

      await user.save();

      res.json({
        success: true,
        message: 'Préférences SMS mises à jour avec succès',
        smsPreferences: user.smsPreferences
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour des préférences SMS:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   PUT /api/user/password
// @desc    Changer le mot de passe
// @access  Private
router.put(
  '/password',
  [
    body('currentPassword').notEmpty().withMessage('Le mot de passe actuel est requis'),
    body('newPassword').isLength({ min: 8 }).withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
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

      const { currentPassword, newPassword } = req.body;
      
      const user = await User.findById(req.user.id).select('+password');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const isPasswordValid = await user.comparePassword(currentPassword);
      
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Mot de passe actuel incorrect'
        });
      }

      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: 'Mot de passe modifié avec succès'
      });
    } catch (error) {
      console.error('Erreur lors du changement de mot de passe:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   GET /api/user/all
// @desc    Récupérer tous les utilisateurs (Admin seulement)
// @access  Private/Admin
router.get('/all', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    console.log('✅ Route GET /api/user/all appelée'); // Debug log
    const users = await User.find().select('-password');
    
    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/user/:id
// @desc    Récupérer un utilisateur par ID (Admin seulement)
// @access  Private/Admin
router.get('/:id', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    console.log('✅ Route GET /api/user/:id appelée avec ID:', req.params.id); // Debug log
    console.log('✅ Requête complète:', req.method, req.originalUrl, req.path); // Debug log
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profilComplete: user.profilComplete || false,
        dateNaissance: user.dateNaissance,
        lieuNaissance: user.lieuNaissance,
        nationalite: user.nationalite,
        sexe: user.sexe,
        numeroEtranger: user.numeroEtranger,
        numeroTitre: user.numeroTitre,
        typeTitre: user.typeTitre,
        dateDelivrance: user.dateDelivrance,
        dateExpiration: user.dateExpiration,
        adressePostale: user.adressePostale,
        ville: user.ville,
        codePostal: user.codePostal,
        pays: user.pays,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   PUT /api/user/:id
// @desc    Mettre à jour un utilisateur par ID (Admin seulement)
// @access  Private/Admin
router.put(
  '/:id',
  authorize('admin', 'superadmin'),
  [
    body('firstName').optional().trim().notEmpty().withMessage('Le prénom ne peut pas être vide'),
    body('lastName').optional().trim().notEmpty().withMessage('Le nom ne peut pas être vide'),
    body('email').optional().isEmail().normalizeEmail().withMessage('Email invalide'),
    body('phone').optional().trim(),
    body('role').optional().isIn(['client', 'admin', 'superadmin']).withMessage('Rôle invalide')
  ],
  async (req, res) => {
    try {
      console.log('✅ Route PUT /api/user/:id appelée avec ID:', req.params.id); // Debug log
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        role,
        dateNaissance,
        lieuNaissance,
        nationalite,
        sexe,
        numeroEtranger,
        numeroTitre,
        typeTitre,
        dateDelivrance,
        dateExpiration,
        adressePostale,
        ville,
        codePostal,
        pays,
        profilComplete,
        isActive
      } = req.body;

      // Vérifier si l'email est déjà utilisé par un autre utilisateur
      if (email && email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Cet email est déjà utilisé par un autre utilisateur'
          });
        }
        user.email = email;
      }

      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (phone !== undefined) user.phone = phone;
      if (role) user.role = role;
      if (dateNaissance) user.dateNaissance = dateNaissance;
      if (lieuNaissance !== undefined) user.lieuNaissance = lieuNaissance;
      if (nationalite !== undefined) user.nationalite = nationalite;
      if (sexe) user.sexe = sexe;
      if (numeroEtranger !== undefined) user.numeroEtranger = numeroEtranger;
      if (numeroTitre !== undefined) user.numeroTitre = numeroTitre;
      if (typeTitre !== undefined) user.typeTitre = typeTitre;
      if (dateDelivrance) user.dateDelivrance = dateDelivrance;
      if (dateExpiration) user.dateExpiration = dateExpiration;
      if (adressePostale !== undefined) user.adressePostale = adressePostale;
      if (ville !== undefined) user.ville = ville;
      if (codePostal !== undefined) user.codePostal = codePostal;
      if (pays !== undefined) user.pays = pays;
      if (profilComplete !== undefined) user.profilComplete = profilComplete;
      if (isActive !== undefined) user.isActive = isActive;

      await user.save();

      // Logger l'action
      try {
        const Log = require('../models/Log');
        await Log.create({
          action: 'user_updated',
          user: req.user.id,
          userEmail: req.user.email,
          targetUser: user._id,
          targetUserEmail: user.email,
          description: `${req.user.email} a modifié l'utilisateur ${user.email} (${user.firstName} ${user.lastName})`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent'),
          metadata: {
            updatedFields: Object.keys(updateData),
            updatedUser: {
              id: user._id.toString(),
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role
            }
          }
        });
      } catch (logError) {
        console.error('Erreur lors de l\'enregistrement du log:', logError);
      }

      res.json({
        success: true,
        message: 'Utilisateur mis à jour avec succès',
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profilComplete: user.profilComplete || false,
          isActive: user.isActive,
          dateNaissance: user.dateNaissance,
          lieuNaissance: user.lieuNaissance,
          nationalite: user.nationalite,
          sexe: user.sexe,
          numeroEtranger: user.numeroEtranger,
          numeroTitre: user.numeroTitre,
          typeTitre: user.typeTitre,
          dateDelivrance: user.dateDelivrance,
          dateExpiration: user.dateExpiration,
          adressePostale: user.adressePostale,
          ville: user.ville,
          codePostal: user.codePostal,
          pays: user.pays,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'utilisateur:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   DELETE /api/user/:id
// @desc    Supprimer un utilisateur par ID (Admin seulement)
// @access  Private/Admin
router.delete('/:id', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    console.log('✅ Route DELETE /api/user/:id appelée avec ID:', req.params.id); // Debug log
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Empêcher la suppression d'un superadmin par un admin simple
    if (user.role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas les permissions pour supprimer un super administrateur'
      });
    }

    // Empêcher l'auto-suppression
    if (user._id.toString() === req.user.id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas supprimer votre propre compte'
      });
    }

    // Logger l'action avant suppression
    try {
      const Log = require('../models/Log');
      await Log.create({
        action: 'user_deleted',
        user: req.user.id,
        userEmail: req.user.email,
        targetUser: user._id,
        targetUserEmail: user.email,
        description: `${req.user.email} a supprimé l'utilisateur ${user.email} (${user.firstName} ${user.lastName})`,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        metadata: {
          deletedUser: {
            id: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          }
        }
      });
    } catch (logError) {
      console.error('Erreur lors de l\'enregistrement du log:', logError);
      // Continuer même si le log échoue
    }

    // Supprimer l'utilisateur
    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Utilisateur supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/user/create
// @desc    Créer un nouvel utilisateur (SuperAdmin seulement)
// @access  Private/SuperAdmin
router.post(
  '/create',
  authorize('superadmin'),
  [
    body('firstName').trim().notEmpty().withMessage('Le prénom est requis'),
    body('lastName').trim().notEmpty().withMessage('Le nom est requis'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('password').isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères'),
    body('phone').optional().trim(),
    body('role').isIn(['client', 'admin', 'superadmin']).withMessage('Rôle invalide')
  ],
  async (req, res) => {
    try {
      console.log('📝 Données reçues pour création utilisateur:', {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        password: req.body.password ? '***' : 'MANQUANT',
        phone: req.body.phone || 'non fourni',
        role: req.body.role
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('❌ Erreurs de validation:', errors.array());
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { firstName, lastName, email, password, phone, role } = req.body;

      // Vérifier si l'email existe déjà
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        console.error('❌ Email déjà utilisé:', email);
        return res.status(400).json({
          success: false,
          message: 'Un utilisateur avec cet email existe déjà',
          errors: [{
            param: 'email',
            msg: 'Un utilisateur avec cet email existe déjà'
          }]
        });
      }

      // Créer l'utilisateur
      console.log('✅ Création de l\'utilisateur...');
      const user = await User.create({
        firstName,
        lastName,
        email,
        password,
        phone: phone || undefined,
        role: role || 'client',
        profilComplete: false,
        isActive: true
      });
      console.log('✅ Utilisateur créé avec succès:', user._id);

      // Logger l'action
      try {
        const Log = require('../models/Log');
        await Log.create({
          user: req.user.id,
          userEmail: req.user.email,
          targetUser: user._id,
          targetUserEmail: user.email,
          action: 'user_created',
          description: `${req.user.email} a créé l'utilisateur ${user.email} (${user.firstName} ${user.lastName}) avec le rôle ${user.role}`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent'),
          metadata: {
            createdUser: {
              id: user._id.toString(),
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role
            }
          }
        });
      } catch (logError) {
        console.error('Erreur lors de l\'enregistrement du log:', logError);
      }

      res.status(201).json({
        success: true,
        message: 'Utilisateur créé avec succès',
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profilComplete: user.profilComplete || false,
          isActive: user.isActive
        }
      });
    } catch (error) {
      console.error('❌ Erreur lors de la création de l\'utilisateur:', error);
      console.error('❌ Stack trace:', error.stack);
      
      // Si c'est une erreur de validation Mongoose
      if (error.name === 'ValidationError') {
        const mongooseErrors = Object.values(error.errors).map((err) => ({
          param: err.path,
          msg: err.message
        }));
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation du modèle',
          errors: mongooseErrors
        });
      }
      
      // Si c'est une erreur de duplication (email unique)
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Un utilisateur avec cet email existe déjà',
          errors: [{
            param: 'email',
            msg: 'Un utilisateur avec cet email existe déjà'
          }]
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Une erreur est survenue lors de la création de l\'utilisateur'
      });
    }
  }
);

module.exports = router;



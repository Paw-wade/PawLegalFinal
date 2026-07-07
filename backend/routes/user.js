const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const avatarDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    const safe = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase())
      ? ext.toLowerCase()
      : '.jpg';
    cb(null, `user-${req.user.id}-${Date.now()}${safe}`);
  },
});

const uploadProfilePhoto = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Fichier image requis'));
    }
    cb(null, true);
  },
});

/** Multer uniquement si multipart (sinon body déjà parsé en JSON) */
function optionalProfilePhotoUpload(req, res, next) {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return uploadProfilePhoto.single('photo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Upload de photo invalide',
        });
      }
      next();
    });
  }
  next();
}

function userToProfilePayload(user) {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    profilComplete: user.profilComplete || false,
    smsPreferences: user.smsPreferences || { enabled: true, types: {} },
    profilePhoto: user.profilePhoto || '',
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
    partenaireInfo: user.partenaireInfo || undefined,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Convertit une chaîne date (YYYY-MM-DD) ou Date en Date, sinon null
function parseDateOrNull(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Middleware de débogage pour toutes les routes
router.use((req, res, next) => {
  console.log('🔍 Route interceptée:', req.method, req.path, req.originalUrl); // Debug log
  next();
});

// Toutes les routes nécessitent une authentification
router.use(protect);

const ALLOWED_USER_ROLES = [
  'client',
  'admin',
  'superadmin',
  'assistant',
  'comptable',
  'secretaire',
  'juriste',
  'stagiaire',
  'visiteur',
  'partenaire',
];

// @route   GET /api/user/profile
// @desc    Récupérer le profil de l'utilisateur effectif
// @access  Private
router.get('/profile', async (req, res) => {
  try {
    const effectiveUserId = req.user.id;
    const user = await User.findById(effectiveUserId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

      res.json({
        success: true,
        user: userToProfilePayload(user),
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
  optionalProfilePhotoUpload,
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
        email,
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
      
      const effectiveUserId = req.user.id;
      const user = await User.findById(effectiveUserId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Champs requis : ne pas écraser par une chaîne vide
      if (firstName !== undefined && firstName !== null) user.firstName = String(firstName).trim() || user.firstName;
      if (lastName !== undefined && lastName !== null) user.lastName = String(lastName).trim() || user.lastName;
      if (phone !== undefined) user.phone = (phone != null && String(phone).trim()) ? String(phone).trim() : user.phone;

      if (email !== undefined && email !== null) {
        const nextEmail = String(email).trim().toLowerCase();
        if (nextEmail === '') {
          // ne pas vider l'email unique sparse sans logique métier explicite
        } else if (nextEmail !== (user.email || '').toLowerCase()) {
          const existingUser = await User.findOne({ email: nextEmail });
          if (existingUser && String(existingUser._id) !== String(user._id)) {
            return res.status(400).json({
              success: false,
              message: 'Cet email est déjà utilisé par un autre compte',
            });
          }
          user.email = nextEmail;
        }
      }

      if (req.file && req.file.filename) {
        user.profilePhoto = `/uploads/avatars/${req.file.filename}`;
      }

      // Champs optionnels texte : autoriser la mise à jour et la suppression (chaîne vide)
      if (dateNaissance !== undefined) user.dateNaissance = parseDateOrNull(dateNaissance);
      if (lieuNaissance !== undefined) user.lieuNaissance = lieuNaissance != null ? String(lieuNaissance).trim() : '';
      if (nationalite !== undefined) user.nationalite = nationalite != null ? String(nationalite).trim() : '';
      if (sexe !== undefined) {
        const s = sexe != null ? String(sexe).trim() : '';
        if (['M', 'F', 'Autre'].includes(s)) user.sexe = s;
        // si vide ou invalide, ne pas modifier (garder l'ancienne valeur)
      }
      if (numeroEtranger !== undefined) user.numeroEtranger = numeroEtranger != null ? String(numeroEtranger).trim() : '';
      if (numeroTitre !== undefined) user.numeroTitre = numeroTitre != null ? String(numeroTitre).trim() : '';
      if (typeTitre !== undefined) user.typeTitre = typeTitre != null ? String(typeTitre).trim() : '';
      if (dateDelivrance !== undefined) user.dateDelivrance = parseDateOrNull(dateDelivrance);
      if (dateExpiration !== undefined) user.dateExpiration = parseDateOrNull(dateExpiration);
      if (adressePostale !== undefined) user.adressePostale = adressePostale != null ? String(adressePostale).trim() : '';
      if (ville !== undefined) user.ville = ville != null ? String(ville).trim() : '';
      if (codePostal !== undefined) user.codePostal = codePostal != null ? String(codePostal).trim() : '';
      if (pays !== undefined) user.pays = pays != null ? String(pays).trim() : 'France';
      if (profilComplete !== undefined && profilComplete !== null && profilComplete !== '') {
        const pc = profilComplete;
        user.profilComplete = pc === true || pc === 'true' || pc === '1' || pc === 1;
      }
      // smsPreferences (JSON ou chaîne depuis FormData)
      if (smsPreferences !== undefined && smsPreferences !== null && smsPreferences !== '') {
        let sp = smsPreferences;
        if (typeof sp === 'string') {
          try {
            sp = JSON.parse(sp);
          } catch {
            sp = null;
          }
        }
        if (sp && typeof sp === 'object') {
          user.smsPreferences = { ...(user.smsPreferences || {}), ...sp };
        }
      }

      await user.save();

      res.json({
        success: true,
        message: 'Profil mis à jour avec succès',
        user: userToProfilePayload(user),
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du profil:', error);
      const isValidationError = error.name === 'ValidationError' && error.errors;
      const status = isValidationError ? 400 : 500;
      const message = isValidationError
        ? (error.message || 'Données invalides')
        : 'Erreur serveur';
      const details = isValidationError && error.errors
        ? Object.values(error.errors).map((e) => e.message).filter(Boolean)
        : undefined;
      res.status(status).json({
        success: false,
        message,
        error: error.message,
        ...(details && details.length ? { errors: details } : {})
      });
    }
  }
);

// @route   POST /api/user/profile/deactivate
// @desc    Désactiver son propre compte (soft delete : isActive = false)
// @access  Private
router.post('/profile/deactivate', async (req, res) => {
  try {
    const effectiveUserId = req.user.id;
    const user = await User.findById(effectiveUserId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (user.isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Ce compte est déjà désactivé'
      });
    }

    user.isActive = false;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Votre compte a été désactivé. Vous ne pourrez plus vous connecter tant qu’il ne sera pas réactivé par un administrateur.'
    });
  } catch (error) {
    console.error('Erreur lors de la désactivation du compte:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

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

      const effectiveUserId = req.user.id;
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

// @route   GET /api/user/expirations
// @desc    Récupérer les comptes clients dont la date d'expiration est dans une plage (trié par date)
// @access  Private/Admin
router.get('/expirations', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const pastDays = Math.max(0, parseInt(req.query.pastDays, 10) || 125);
    const futureDays = Math.max(0, parseInt(req.query.futureDays, 10) || 15);

    const now = new Date();
    const start = new Date(now.getTime() - pastDays * 24 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + futureDays * 24 * 60 * 60 * 1000);

    // Filtrer uniquement les clients avec une date d'expiration dans l'intervalle.
    // (Les clients déjà expirés sont inclus via pastDays)
    const clients = await User.find({
      role: 'client',
      isActive: true,
      dateExpiration: { $gte: start, $lte: end }
    }).select('firstName lastName email phone adressePostale ville codePostal pays dateExpiration');

    const formatAddress = (u) => {
      const parts = [
        u.adressePostale,
        u.codePostal,
        u.ville,
        u.pays,
      ].filter(Boolean).map((p) => String(p).trim());

      // Retirer les virgules en double si des éléments manquent
      return parts.join(', ').replace(/,\s*,/g, ', ');
    };

    const users = clients
      .sort((a, b) => (a.dateExpiration?.getTime?.() || 0) - (b.dateExpiration?.getTime?.() || 0))
      .map((u) => ({
        id: u._id,
        nom: u.lastName || '',
        prenom: u.firstName || '',
        telephone: u.phone || '',
        email: u.email || '',
        adresse: formatAddress(u),
        dateExpiration: u.dateExpiration || null,
      }));

    res.json({
      success: true,
      count: users.length,
      users,
      range: {
        pastDays,
        futureDays,
        start: start.toISOString(),
        end: end.toISOString(),
      }
    });
  } catch (error) {
    console.error('Erreur lors du chargement des expirations:', error);
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
// @route   PUT /api/user/:id/password
// @desc    Modifier le mot de passe d'un utilisateur (Admin seulement)
// @access  Private/Admin
router.put(
  '/:id/password',
  authorize('admin', 'superadmin'),
  [
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
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

      const { newPassword } = req.body;
      const targetUser = await User.findById(req.params.id).select('+password');

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      targetUser.password = newPassword;
      targetUser.needsPasswordSetup = false;
      targetUser.resetPasswordToken = undefined;
      targetUser.resetPasswordExpires = undefined;
      await targetUser.save();

      try {
        const Log = require('../models/Log');
        await Log.create({
          action: 'user_password_updated_by_admin',
          user: req.user.id,
          userEmail: req.user.email,
          targetUser: targetUser._id,
          targetUserEmail: targetUser.email,
          description: `${req.user.email} a modifié le mot de passe de ${targetUser.email || targetUser._id}`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent')
        });
      } catch (logError) {
        console.error('Erreur lors de l\'enregistrement du log mot de passe admin:', logError);
      }

      return res.json({
        success: true,
        message: 'Mot de passe utilisateur mis à jour avec succès'
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour admin du mot de passe:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

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
        partenaireInfo: user.partenaireInfo || undefined,
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
    body('password').optional().isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères'),
    body('role').optional().isIn(ALLOWED_USER_ROLES).withMessage('Rôle invalide'),
    body('partenaireInfo.typeOrganisme')
      .optional({ values: 'falsy' })
      .isIn(['consulat', 'association', 'avocat'])
      .withMessage('Type d\'organisme partenaire invalide')
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
        password,
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
        isActive,
        partenaireInfo
      } = req.body;
      const changedFields = Object.keys(req.body || {});

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
      if (password !== undefined && password !== null && String(password).trim() !== '') {
        user.password = String(password);
        user.needsPasswordSetup = false;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
      }
      if (role) {
        if (req.user.role === 'admin' && (role === 'admin' || role === 'superadmin')) {
          return res.status(403).json({
            success: false,
            message: 'Vous n\'avez pas la permission d\'attribuer les rôles admin ou superadmin'
          });
        }
        user.role = role;
      }
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

      // Mettre à jour les informations partenaire si fournies
      if (partenaireInfo && user.role === 'partenaire') {
        user.partenaireInfo = {
          typeOrganisme: partenaireInfo.typeOrganisme || undefined,
          nomOrganisme: partenaireInfo.nomOrganisme || '',
          adresseOrganisme: partenaireInfo.adresseOrganisme || '',
          contactPrincipal: partenaireInfo.contactPrincipal || ''
        };
      } else if (user.role !== 'partenaire') {
        // Nettoyer les infos partenaire si le rôle n'est plus partenaire
        user.partenaireInfo = undefined;
      }

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
            updatedFields: changedFields,
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

    // Empêcher la suppression d'un admin par un autre admin (seul superadmin peut supprimer des admins)
    if (user.role === 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas les permissions pour supprimer un administrateur. Seul un Super Admin peut supprimer des administrateurs.'
      });
    }

    // Empêcher l'auto-suppression
    if (user._id.toString() === req.user.id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas supprimer votre propre compte'
      });
    }

    // Ajouter l'utilisateur à la corbeille avant suppression
    try {
      const Trash = require('../models/Trash');
      // Convertir l'utilisateur en objet et exclure le mot de passe
      const userData = user.toObject();
      delete userData.password; // Ne pas sauvegarder le mot de passe dans la corbeille
      
      await Trash.create({
        itemType: 'user',
        originalId: user._id,
        itemData: userData,
        deletedBy: req.user.id,
        originalOwner: user._id, // L'utilisateur est son propre propriétaire
        origin: req.headers.referer || 'unknown',
        metadata: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive
        }
      });
      console.log('✅ Utilisateur ajouté à la corbeille:', user._id);
    } catch (trashError) {
      console.error('⚠️ Erreur lors de l\'ajout à la corbeille (continuation de la suppression):', trashError);
      // Continuer la suppression même si l'ajout à la corbeille échoue
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
// @desc    Créer un nouvel utilisateur (SuperAdmin/Admin pour professionnels)
// @access  Private/SuperAdmin ou Admin (pour professionnels)
router.post(
  '/create',
  authorize('superadmin', 'admin'),
  [
    body('firstName').trim().notEmpty().withMessage('Le prénom est requis'),
    body('lastName').trim().notEmpty().withMessage('Le nom est requis'),
    body('email').optional({ nullable: true, checkFalsy: true }).custom((value) => {
      if (value && value.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error('Email invalide');
        }
      }
      return true;
    }).normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères'),
    body('phone').optional().trim(),
    body('role').optional().isIn(ALLOWED_USER_ROLES).withMessage('Rôle invalide')
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

      // Normaliser les valeurs vides avant validation
      // Normaliser l'email vide
      if (req.body.email === '') {
        req.body.email = null;
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('❌ Erreurs de validation:', JSON.stringify(errors.array(), null, 2));
        console.error('❌ Données reçues:', JSON.stringify(req.body, null, 2));
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { firstName, lastName, email, password, phone, role, partenaireInfo } = req.body;

      // Déterminer le rôle
      let finalRole = role || 'client';

      // Vérifier les permissions : seul superadmin peut créer admin/superadmin
      // Cette vérification doit être faite APRÈS la détermination du finalRole
      if (req.user.role === 'admin' && (finalRole === 'admin' || finalRole === 'superadmin')) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas la permission de créer des comptes admin ou superadmin'
        });
      }

      console.log('🔍 Détermination du rôle:', {
        roleFourni: role,
        roleFinal: finalRole
      });

      // Vérifier si l'email existe déjà (seulement si un email est fourni)
      if (email && email.trim() !== '') {
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
      }

      // Créer l'utilisateur
      console.log('✅ Création de l\'utilisateur...');
      const userData = {
        firstName,
        lastName,
        password,
        phone: phone || undefined,
        role: finalRole,
        profilComplete: false,
        isActive: true
      };

      // Ajouter email seulement s'il est fourni
      if (email && email.trim() !== '') {
        userData.email = email.trim();
      }
      
      // Ajouter partenaireInfo si le rôle est partenaire
      if (finalRole === 'partenaire' && partenaireInfo) {
        userData.partenaireInfo = {
          typeOrganisme: partenaireInfo.typeOrganisme || undefined,
          nomOrganisme: partenaireInfo.nomOrganisme || undefined,
          adresseOrganisme: partenaireInfo.adresseOrganisme || undefined,
          contactPrincipal: partenaireInfo.contactPrincipal || undefined
        };
      }

      const staffRoles = ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'];
      if (staffRoles.includes(finalRole)) {
        const { resolveCabinetForUser } = require('../utils/cabinetResolver');
        const Cabinet = require('../models/Cabinet');
        let cabinet = null;
        if (req.body.cabinetId) {
          cabinet = await Cabinet.findById(req.body.cabinetId).lean();
        }
        if (!cabinet) {
          cabinet = await resolveCabinetForUser(req.user);
        }
        if (cabinet?._id) {
          userData.cabinetId = cabinet._id;
        }
      }


      const user = await User.create(userData);
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
          partenaireInfo: user.partenaireInfo || undefined,
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



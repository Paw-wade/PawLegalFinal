const express = require('express');
const { body, validationResult } = require('express-validator');
const Permission = require('../models/Permission');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Toutes les routes nécessitent une authentification admin
router.use(protect);
router.use(authorize('admin', 'superadmin'));

// @route   GET /api/permissions/:userId
// @desc    Récupérer les permissions d'un utilisateur
// @access  Private/Admin
router.get('/:userId', async (req, res) => {
  try {
    const permission = await Permission.findOne({ user: req.params.userId })
      .populate('user', 'firstName lastName email role');

    if (!permission) {
      // Retourner des permissions par défaut basées sur le rôle
      const user = await User.findById(req.params.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      return res.json({
        success: true,
        permission: {
          user: user._id,
          roles: [user.role],
          permissions: []
        }
      });
    }

    res.json({
      success: true,
      permission
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/permissions
// @desc    Créer ou mettre à jour les permissions d'un utilisateur
// @access  Private/Admin
router.post(
  '/',
  [
    body('userId').notEmpty().withMessage('L\'ID utilisateur est requis'),
    body('roles').isArray().withMessage('Les rôles doivent être un tableau'),
    body('permissions').isArray().withMessage('Les permissions doivent être un tableau')
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

      const { userId, roles, permissions } = req.body;

      // Vérifier que l'utilisateur existe
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Mettre à jour le rôle principal de l'utilisateur (premier rôle de la liste)
      if (roles && roles.length > 0) {
        user.role = roles[0];
        await user.save();
      }

      // Créer ou mettre à jour les permissions
      let permission = await Permission.findOne({ user: userId });

      if (permission) {
        permission.roles = roles;
        permission.permissions = permissions;
        await permission.save();
      } else {
        permission = await Permission.create({
          user: userId,
          roles: roles,
          permissions: permissions
        });
      }

      await permission.populate('user', 'firstName lastName email role');

      res.json({
        success: true,
        message: 'Permissions mises à jour avec succès',
        permission
      });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   PUT /api/permissions/:userId
// @desc    Mettre à jour les permissions d'un utilisateur
// @access  Private/Admin
router.put(
  '/:userId',
  [
    body('roles').optional().isArray().withMessage('Les rôles doivent être un tableau'),
    body('permissions').optional().isArray().withMessage('Les permissions doivent être un tableau')
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

      const { roles, permissions } = req.body;

      const user = await User.findById(req.params.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Mettre à jour le rôle principal si des rôles sont fournis
      if (roles && roles.length > 0) {
        user.role = roles[0];
        await user.save();
      }

      let permission = await Permission.findOne({ user: req.params.userId });

      if (permission) {
        if (roles) permission.roles = roles;
        if (permissions) permission.permissions = permissions;
        await permission.save();
      } else {
        permission = await Permission.create({
          user: req.params.userId,
          roles: roles || [user.role],
          permissions: permissions || []
        });
      }

      await permission.populate('user', 'firstName lastName email role');

      res.json({
        success: true,
        message: 'Permissions mises à jour avec succès',
        permission
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour des permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   GET /api/permissions/roles/presets
// @desc    Récupérer les modèles de permissions prédéfinis
// @access  Private/Admin
router.get('/roles/presets', async (req, res) => {
  try {
    const presets = {
      client: {
        roles: ['client'],
        permissions: [
          { domaine: 'dossiers_clients', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
          { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false }
        ]
      },
      admin: {
        roles: ['admin'],
        permissions: [
          { domaine: 'utilisateurs', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'dossiers_clients', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'messages_contact', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'temoignages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false }
        ]
      },
      superadmin: {
        roles: ['superadmin'],
        permissions: [
          { domaine: 'utilisateurs', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'dossiers_clients', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'messages_contact', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'temoignages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'parametres_systeme', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'logs', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false }
        ]
      },
      avocat: {
        roles: ['avocat'],
        permissions: [
          { domaine: 'titres_sejour', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'recours', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'dossiers_clients', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false }
        ]
      },
      assistant: {
        roles: ['assistant'],
        permissions: [
          { domaine: 'dossiers_clients', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
          { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'messages_contact', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false }
        ]
      },
      juriste: {
        roles: ['juriste'],
        permissions: [
          { domaine: 'titres_sejour', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'recours', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'dossiers_clients', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'outils_internes', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false }
        ]
      },
      stagiaire: {
        roles: ['stagiaire'],
        permissions: [
          { domaine: 'dossiers_clients', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
          { domaine: 'documents', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
          { domaine: 'rendez_vous', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false }
        ]
      },
      visiteur: {
        roles: ['visiteur'],
        permissions: [
          { domaine: 'dossiers_clients', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
          { domaine: 'documents', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
          { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false }
        ]
      }
    };

    res.json({
      success: true,
      presets
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des modèles:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;


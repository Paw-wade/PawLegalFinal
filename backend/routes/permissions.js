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

      // Valider et convertir les domaines de permissions
      const validDomaines = [
        'tableau_de_bord', 'utilisateurs', 'dossiers', 'taches',
        'rendez_vous', 'creneaux', 'messages', 'documents',
        'temoignages', 'notifications', 'sms', 'cms', 'logs', 'corbeille'
      ];

      // Mapping des anciens domaines vers les nouveaux
      const domaineMapping = {
        'titres_sejour': 'dossiers',
        'recours': 'dossiers',
        'dossiers_clients': 'dossiers',
        'paiements_facturation': 'dossiers',
        'parametres_systeme': 'cms',
        'outils_internes': 'sms',
        'messages_contact': 'messages'
      };

      let finalPermissions = permissions;
      if (permissions && Array.isArray(permissions)) {
        // Convertir les anciens domaines vers les nouveaux
        const convertedPermissions = permissions.map(p => {
          if (domaineMapping[p.domaine]) {
            console.log(`🔄 Conversion du domaine "${p.domaine}" vers "${domaineMapping[p.domaine]}"`);
            return { ...p, domaine: domaineMapping[p.domaine] };
          }
          return p;
        });

        // Vérifier que tous les domaines sont valides après conversion
        const invalidDomaines = convertedPermissions.filter(p => !validDomaines.includes(p.domaine));
        if (invalidDomaines.length > 0) {
          console.error('❌ Domaines invalides après conversion:', invalidDomaines);
          return res.status(400).json({
            success: false,
            message: 'Domaines de permissions invalides',
            errors: invalidDomaines.map(p => ({
              domaine: p.domaine,
              message: `Le domaine "${p.domaine}" n'est pas valide`
            }))
          });
        }

        // Utiliser les permissions converties
        finalPermissions = convertedPermissions;
        
        // Vérifier que toutes les permissions ont les champs requis et sont correctement formatées
        finalPermissions = finalPermissions.map(p => {
          // S'assurer que tous les champs booléens sont bien des booléens
          const normalized = {
            domaine: String(p.domaine),
            consulter: Boolean(p.consulter === true || p.consulter === 'true' || p.consulter === 1),
            modifier: Boolean(p.modifier === true || p.modifier === 'true' || p.modifier === 1),
            nePasConsulter: Boolean(p.nePasConsulter === true || p.nePasConsulter === 'true' || p.nePasConsulter === 1),
            nePasModifier: Boolean(p.nePasModifier === true || p.nePasModifier === 'true' || p.nePasModifier === 1),
            supprimer: Boolean(p.supprimer === true || p.supprimer === 'true' || p.supprimer === 1)
          };
          
          // Vérifier que le domaine est valide
          if (!validDomaines.includes(normalized.domaine)) {
            console.error(`⚠️ Domaine invalide détecté: ${normalized.domaine}`);
          }
          
          return normalized;
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
        permission.permissions = finalPermissions;
        try {
          await permission.save();
        } catch (saveError) {
          console.error('Erreur lors de la sauvegarde:', saveError);
          if (saveError.errors) {
            console.error('Erreurs de validation détaillées:', JSON.stringify(saveError.errors, null, 2));
          }
          throw saveError;
        }
      } else {
        try {
          permission = await Permission.create({
            user: userId,
            roles: roles,
            permissions: finalPermissions
          });
        } catch (createError) {
          console.error('Erreur lors de la création:', createError);
          if (createError.errors) {
            console.error('Erreurs de validation détaillées:', JSON.stringify(createError.errors, null, 2));
          }
          throw createError;
        }
      }

      await permission.populate('user', 'firstName lastName email role');

      res.json({
        success: true,
        message: 'Permissions mises à jour avec succès',
        permission
      });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des permissions:', error);
      console.error('Stack trace:', error.stack);
      console.error('Données reçues:', { userId, roles, permissions: permissions?.length || 0 });
      if (error.errors) {
        console.error('Erreurs de validation Mongoose:', JSON.stringify(error.errors, null, 2));
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.keys(error.errors || {}).map(key => ({
          field: key,
          message: error.errors[key].message,
          value: error.errors[key].value
        }));
        return res.status(400).json({
          success: false,
          message: 'Erreur de validation',
          errors: validationErrors
        });
      }
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

      // Valider et convertir les domaines de permissions
      const validDomaines = [
        'tableau_de_bord', 'utilisateurs', 'dossiers', 'taches',
        'rendez_vous', 'creneaux', 'messages', 'documents',
        'temoignages', 'notifications', 'sms', 'cms', 'logs', 'corbeille'
      ];

      // Mapping des anciens domaines vers les nouveaux
      const domaineMapping = {
        'titres_sejour': 'dossiers',
        'recours': 'dossiers',
        'dossiers_clients': 'dossiers',
        'paiements_facturation': 'dossiers',
        'parametres_systeme': 'cms',
        'outils_internes': 'sms',
        'messages_contact': 'messages'
      };

      let finalPermissions = permissions;
      if (permissions && Array.isArray(permissions)) {
        // Convertir les anciens domaines vers les nouveaux
        const convertedPermissions = permissions.map(p => {
          if (domaineMapping[p.domaine]) {
            console.log(`🔄 Conversion du domaine "${p.domaine}" vers "${domaineMapping[p.domaine]}"`);
            return { ...p, domaine: domaineMapping[p.domaine] };
          }
          return p;
        });

        // Vérifier que tous les domaines sont valides après conversion
        const invalidDomaines = convertedPermissions.filter(p => !validDomaines.includes(p.domaine));
        if (invalidDomaines.length > 0) {
          console.error('❌ Domaines invalides après conversion:', invalidDomaines);
          return res.status(400).json({
            success: false,
            message: 'Domaines de permissions invalides',
            errors: invalidDomaines.map(p => ({
              domaine: p.domaine,
              message: `Le domaine "${p.domaine}" n'est pas valide`
            }))
          });
        }

        // Utiliser les permissions converties
        finalPermissions = convertedPermissions;
        
        // Vérifier que toutes les permissions ont les champs requis et sont correctement formatées
        finalPermissions = finalPermissions.map(p => {
          // S'assurer que tous les champs booléens sont bien des booléens
          const normalized = {
            domaine: String(p.domaine),
            consulter: Boolean(p.consulter === true || p.consulter === 'true' || p.consulter === 1),
            modifier: Boolean(p.modifier === true || p.modifier === 'true' || p.modifier === 1),
            nePasConsulter: Boolean(p.nePasConsulter === true || p.nePasConsulter === 'true' || p.nePasConsulter === 1),
            nePasModifier: Boolean(p.nePasModifier === true || p.nePasModifier === 'true' || p.nePasModifier === 1),
            supprimer: Boolean(p.supprimer === true || p.supprimer === 'true' || p.supprimer === 1)
          };
          
          // Vérifier que le domaine est valide
          if (!validDomaines.includes(normalized.domaine)) {
            console.error(`⚠️ Domaine invalide détecté: ${normalized.domaine}`);
          }
          
          return normalized;
        });
      }

      // Mettre à jour le rôle principal si des rôles sont fournis
      if (roles && roles.length > 0) {
        user.role = roles[0];
        await user.save();
      }

      console.log('📝 Tentative de mise à jour des permissions:', {
        userId: req.params.userId,
        rolesCount: roles?.length || 0,
        permissionsCount: finalPermissions?.length || 0,
        roles: roles,
        samplePermissions: finalPermissions?.slice(0, 3).map(p => ({ 
          domaine: p.domaine, 
          consulter: p.consulter, 
          modifier: p.modifier,
          nePasConsulter: p.nePasConsulter,
          nePasModifier: p.nePasModifier,
          supprimer: p.supprimer
        }))
      });

      // Vérifier que tous les domaines sont valides avant de continuer
      if (finalPermissions && Array.isArray(finalPermissions)) {
        const invalidDomains = finalPermissions.filter(p => !validDomaines.includes(p.domaine));
        if (invalidDomains.length > 0) {
          console.error('❌ Domaines invalides détectés:', invalidDomains);
          return res.status(400).json({
            success: false,
            message: 'Domaines de permissions invalides',
            errors: invalidDomains.map(p => ({
              domaine: p.domaine,
              message: `Le domaine "${p.domaine}" n'est pas valide`
            }))
          });
        }
      }

      let permission = await Permission.findOne({ user: req.params.userId });

      if (permission) {
        if (roles) {
          // Valider les rôles
          const validRoles = ['client', 'admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire', 'visiteur'];
          const invalidRoles = roles.filter(r => !validRoles.includes(r));
          if (invalidRoles.length > 0) {
            return res.status(400).json({
              success: false,
              message: 'Rôles invalides',
              errors: invalidRoles.map(r => ({ role: r, message: `Le rôle "${r}" n'est pas valide` }))
            });
          }
          permission.roles = roles;
        }
        if (finalPermissions) {
          permission.permissions = finalPermissions;
        }
        try {
          await permission.save();
          console.log('✅ Permissions mises à jour avec succès');
        } catch (saveError) {
          console.error('❌ Erreur lors de la sauvegarde:', saveError);
          console.error('Erreur complète:', JSON.stringify(saveError, Object.getOwnPropertyNames(saveError), 2));
          if (saveError.errors) {
            console.error('Erreurs de validation détaillées:', JSON.stringify(saveError.errors, null, 2));
          }
          throw saveError;
        }
      } else {
        // Valider les rôles avant création
        const finalRoles = roles || [user.role];
        const validRoles = ['client', 'admin', 'superadmin', 'avocat', 'consulat', 'association', 'collaborateur', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire', 'visiteur'];
        const invalidRoles = finalRoles.filter(r => !validRoles.includes(r));
        if (invalidRoles.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Rôles invalides',
            errors: invalidRoles.map(r => ({ role: r, message: `Le rôle "${r}" n'est pas valide` }))
          });
        }
        
        try {
          permission = await Permission.create({
            user: req.params.userId,
            roles: finalRoles,
            permissions: finalPermissions || []
          });
          console.log('✅ Permissions créées avec succès');
        } catch (createError) {
          console.error('❌ Erreur lors de la création:', createError);
          console.error('Erreur complète:', JSON.stringify(createError, Object.getOwnPropertyNames(createError), 2));
          if (createError.errors) {
            console.error('Erreurs de validation détaillées:', JSON.stringify(createError.errors, null, 2));
          }
          throw createError;
        }
      }

      await permission.populate('user', 'firstName lastName email role');

      res.json({
        success: true,
        message: 'Permissions mises à jour avec succès',
        permission
      });
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour des permissions:', error);
      console.error('Stack trace:', error.stack);
      console.error('Données reçues:', { 
        userId: req.params.userId, 
        roles, 
        permissionsCount: permissions?.length || 0,
        finalPermissionsCount: finalPermissions?.length || 0
      });
      if (error.errors) {
        console.error('Erreurs de validation Mongoose:', JSON.stringify(error.errors, null, 2));
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.keys(error.errors || {}).map(key => ({
          field: key,
          message: error.errors[key].message,
          value: error.errors[key].value
        }));
        return res.status(400).json({
          success: false,
          message: 'Erreur de validation',
          errors: validationErrors
        });
      }
      // Retourner un message d'erreur plus détaillé en développement
      const errorResponse = {
        success: false,
        message: 'Erreur serveur',
        error: error.message
      };
      if (process.env.NODE_ENV === 'development') {
        errorResponse.details = error.stack;
        errorResponse.fullError = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
      }
      res.status(500).json(errorResponse);
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
          { domaine: 'dossiers', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
          { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false }
        ]
      },
      admin: {
        roles: ['admin'],
        permissions: [
          { domaine: 'tableau_de_bord', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
          { domaine: 'utilisateurs', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'dossiers', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'taches', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'creneaux', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'messages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'temoignages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'notifications', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'sms', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'cms', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'corbeille', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false }
        ]
      },
      superadmin: {
        roles: ['superadmin'],
        permissions: [
          { domaine: 'tableau_de_bord', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
          { domaine: 'utilisateurs', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'dossiers', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'taches', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'creneaux', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'messages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'temoignages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'notifications', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'sms', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'cms', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
          { domaine: 'logs', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
          { domaine: 'corbeille', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true }
        ]
      },
      assistant: {
        roles: ['assistant'],
        permissions: [
          { domaine: 'dossiers', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'taches', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false }
        ]
      },
      collaborateur: {
        roles: ['collaborateur'],
        permissions: [
          { domaine: 'dossiers', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'taches', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
          { domaine: 'messages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false }
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


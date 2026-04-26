const express = require('express');
const { body, validationResult } = require('express-validator');
const SmsTemplate = require('../models/SmsTemplate');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Toutes les routes nécessitent une authentification admin
router.use(protect);
router.use(authorize('admin', 'superadmin'));

// @route   GET /api/sms-templates
// @desc    Récupérer tous les templates SMS
// @access  Private/Admin
router.get('/', async (req, res) => {
  try {
    const { category, isActive, search } = req.query;
    const query = {};

    if (category) query.category = category;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const templates = await SmsTemplate.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: templates.length,
      templates
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des templates:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/sms-templates/init-defaults
// @desc    Initialiser les templates par défaut (système)
// @access  Private/Admin
router.post('/init-defaults', async (req, res) => {
  try {
    const defaultTemplates = [
      {
        code: 'appointment_confirmed',
        name: 'Confirmation de rendez-vous',
        description: 'Message envoyé lors de la confirmation d\'un rendez-vous',
        message: 'Bonjour {{name}}, votre rendez-vous est confirmé le {{date}} à {{time}}. Paw Legal.',
        variables: [
          { name: 'name', description: 'Nom complet du client', example: 'Jean Dupont' },
          { name: 'date', description: 'Date du rendez-vous', example: '15 janvier 2024' },
          { name: 'time', description: 'Heure du rendez-vous', example: '14:30' }
        ],
        category: 'appointment',
        isActive: true,
        isSystem: true
      },
      {
        code: 'appointment_cancelled',
        name: 'Annulation de rendez-vous',
        description: 'Message envoyé lors de l\'annulation d\'un rendez-vous',
        message: 'Votre rendez-vous du {{date}} à {{time}} a été annulé. Paw Legal.',
        variables: [
          { name: 'date', description: 'Date du rendez-vous', example: '15 janvier 2024' },
          { name: 'time', description: 'Heure du rendez-vous', example: '14:30' }
        ],
        category: 'appointment',
        isActive: true,
        isSystem: true
      },
      {
        code: 'appointment_updated',
        name: 'Modification de rendez-vous',
        description: 'Message envoyé lors de la modification d\'un rendez-vous',
        message: 'Votre rendez-vous du {{date}} à {{time}} a été modifié. Paw Legal.',
        variables: [
          { name: 'date', description: 'Date du rendez-vous', example: '15 janvier 2024' },
          { name: 'time', description: 'Heure du rendez-vous', example: '14:30' }
        ],
        category: 'appointment',
        isActive: true,
        isSystem: true
      },
      {
        code: 'appointment_reminder',
        name: 'Rappel de rendez-vous',
        description: 'Message de rappel envoyé avant un rendez-vous',
        message: 'Rappel: Vous avez un rendez-vous demain le {{date}} à {{time}}. Paw Legal.',
        variables: [
          { name: 'date', description: 'Date du rendez-vous', example: '15 janvier 2024' },
          { name: 'time', description: 'Heure du rendez-vous', example: '14:30' }
        ],
        category: 'appointment',
        isActive: true,
        isSystem: true
      },
      {
        code: 'dossier_created',
        name: 'Création de dossier',
        description: 'Message envoyé lors de la création d\'un dossier',
        message: 'Bonjour, votre dossier "{{dossierTitle}}" a été créé suite à votre rendez-vous du {{appointmentDate}} à {{appointmentTime}}. Référence: {{dossierId}}. Paw Legal.',
        variables: [
          { name: 'dossierTitle', description: 'Titre du dossier', example: 'Demande de titre de séjour' },
          { name: 'dossierId', description: 'Identifiant du dossier', example: 'DOS-2024-001' },
          { name: 'appointmentDate', description: 'Date du rendez-vous', example: '15 janvier 2024' },
          { name: 'appointmentTime', description: 'Heure du rendez-vous', example: '14:30' }
        ],
        category: 'dossier',
        isActive: true,
        isSystem: true
      },
      {
        code: 'dossier_updated',
        name: 'Mise à jour de dossier',
        description: 'Message envoyé lors de la mise à jour d\'un dossier',
        message: 'Votre dossier "{{dossierTitle}}" a été mis à jour. Statut: {{statut}}. Paw Legal.',
        variables: [
          { name: 'dossierTitle', description: 'Titre du dossier', example: 'Demande de titre de séjour' },
          { name: 'statut', description: 'Nouveau statut du dossier', example: 'En cours' }
        ],
        category: 'dossier',
        isActive: true,
        isSystem: true
      },
      {
        code: 'dossier_status_changed',
        name: 'Changement de statut de dossier',
        description: 'Message envoyé lors du changement de statut d\'un dossier',
        message: 'Votre dossier "{{dossierTitle}}" a changé de statut: {{statut}}. Paw Legal.',
        variables: [
          { name: 'dossierTitle', description: 'Titre du dossier', example: 'Demande de titre de séjour' },
          { name: 'statut', description: 'Nouveau statut', example: 'Accepté' }
        ],
        category: 'dossier',
        isActive: true,
        isSystem: true
      },
      {
        code: 'document_uploaded',
        name: 'Document ajouté',
        description: 'Message envoyé lorsqu\'un document est ajouté à un dossier',
        message: 'Un nouveau document a été ajouté à votre dossier "{{dossierTitle}}". Paw Legal.',
        variables: [
          { name: 'dossierTitle', description: 'Titre du dossier', example: 'Demande de titre de séjour' }
        ],
        category: 'dossier',
        isActive: true,
        isSystem: true
      },
      {
        code: 'document_request',
        name: 'Demande de document',
        description: 'Message envoyé lorsqu\'un document est demandé au client',
        message: '{{isUrgentText}}Document requis pour votre dossier {{dossierNumero}}. Type: {{documentType}}. Connectez-vous pour envoyer. Paw Legal.',
        variables: [
          { name: 'dossierNumero', description: 'Numéro du dossier', example: 'DOS-2024-001' },
          { name: 'documentType', description: 'Type de document demandé', example: 'Passeport' },
          { name: 'isUrgent', description: 'Indique si la demande est urgente', example: 'true' },
          { name: 'isUrgentText', description: 'Texte "🔴 URGENT: " si urgent, vide sinon', example: '🔴 URGENT: ' }
        ],
        category: 'dossier',
        isActive: true,
        isSystem: true
      },
      {
        code: 'document_received',
        name: 'Document reçu',
        description: 'Message envoyé à l\'admin lorsqu\'un document est reçu',
        message: 'Document "{{documentName}}" reçu pour le dossier {{dossierNumero}}. Paw Legal.',
        variables: [
          { name: 'documentName', description: 'Nom du document', example: 'Passeport' },
          { name: 'dossierNumero', description: 'Numéro du dossier', example: 'DOS-2024-001' }
        ],
        category: 'dossier',
        isActive: true,
        isSystem: true
      },
      {
        code: 'message_received',
        name: 'Nouveau message',
        description: 'Message envoyé lorsqu\'un utilisateur reçoit un nouveau message',
        message: 'Vous avez reçu un nouveau message de {{senderName}}. Connectez-vous pour le consulter. Paw Legal.',
        variables: [
          { name: 'senderName', description: 'Nom de l\'expéditeur', example: 'Cabinet Paw Legal' }
        ],
        category: 'message',
        isActive: true,
        isSystem: true
      },
      {
        code: 'task_assigned',
        name: 'Tâche assignée',
        description: 'Message envoyé lorsqu\'une tâche est assignée',
        message: 'Une nouvelle tâche vous a été assignée: {{taskTitle}}. Paw Legal.',
        variables: [
          { name: 'taskTitle', description: 'Titre de la tâche', example: 'Réviser le dossier DOS-2024-001' }
        ],
        category: 'task',
        isActive: true,
        isSystem: true
      },
      {
        code: 'task_reminder',
        name: 'Rappel de tâche',
        description: 'Message de rappel pour une tâche avec échéance',
        message: 'Rappel: La tâche "{{taskTitle}}" est due le {{dateEcheance}}. Paw Legal.',
        variables: [
          { name: 'taskTitle', description: 'Titre de la tâche', example: 'Réviser le dossier DOS-2024-001' },
          { name: 'dateEcheance', description: 'Date d\'échéance', example: '20 janvier 2024' }
        ],
        category: 'task',
        isActive: true,
        isSystem: true
      }
    ];

    const createdTemplates = [];
    const existingTemplates = [];

    const userId = req.user.id || req.user._id;
    
    for (const templateData of defaultTemplates) {
      const existing = await SmsTemplate.findOne({ code: templateData.code });
      if (existing) {
        existingTemplates.push(templateData.code);
      } else {
        const template = await SmsTemplate.create({
          ...templateData,
          createdBy: userId,
          updatedBy: userId
        });
        createdTemplates.push(template);
      }
    }

    res.json({
      success: true,
      message: 'Initialisation terminée',
      created: createdTemplates.length,
      existing: existingTemplates.length,
      templates: createdTemplates
    });
  } catch (error) {
    console.error('Erreur lors de l\'initialisation des templates:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/sms-templates/:id
// @desc    Récupérer un template SMS par ID
// @access  Private/Admin
router.get('/:id', async (req, res) => {
  try {
    const template = await SmsTemplate.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trouvé'
      });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du template:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/sms-templates
// @desc    Créer un nouveau template SMS
// @access  Private/Admin
router.post(
  '/',
  [
    body('code').trim().notEmpty().withMessage('Le code est requis'),
    body('name').trim().notEmpty().withMessage('Le nom est requis'),
    body('message').trim().notEmpty().withMessage('Le message est requis')
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

      const { code, name, description, message, variables, category, isActive } = req.body;

      // Vérifier si le code existe déjà
      const existingTemplate = await SmsTemplate.findOne({ code });
      if (existingTemplate) {
        return res.status(400).json({
          success: false,
          message: 'Un template avec ce code existe déjà'
        });
      }

      const template = await SmsTemplate.create({
        code,
        name,
        description,
        message,
        variables: variables || [],
        category: category || 'other',
        isActive: isActive !== undefined ? isActive : true,
        createdBy: req.user.id,
        updatedBy: req.user.id
      });

      await template.populate('createdBy', 'firstName lastName email');
      await template.populate('updatedBy', 'firstName lastName email');

      res.status(201).json({
        success: true,
        message: 'Template créé avec succès',
        template
      });
    } catch (error) {
      console.error('Erreur lors de la création du template:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   PUT /api/sms-templates/:id
// @desc    Mettre à jour un template SMS
// @access  Private/Admin
router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty().withMessage('Le nom ne peut pas être vide'),
    body('message').optional().trim().notEmpty().withMessage('Le message ne peut pas être vide')
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

      const template = await SmsTemplate.findById(req.params.id);

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template non trouvé'
        });
      }

      // Permettre la modification des templates système (mais garder isSystem à true)
      // Les templates système peuvent être modifiés mais pas supprimés

      // Vérifier si le code est modifié et s'il existe déjà
      if (req.body.code && req.body.code !== template.code) {
        const existingTemplate = await SmsTemplate.findOne({ code: req.body.code });
        if (existingTemplate) {
          return res.status(400).json({
            success: false,
            message: 'Un template avec ce code existe déjà'
          });
        }
      }

      const { name, description, message, variables, category, isActive } = req.body;

      if (name) template.name = name;
      if (description !== undefined) template.description = description;
      if (message) template.message = message;
      if (variables !== undefined) template.variables = variables;
      if (category) template.category = category;
      if (isActive !== undefined) template.isActive = isActive;
      // Permettre la modification du code même pour les templates système
      if (req.body.code && req.body.code !== template.code) {
        const existingTemplate = await SmsTemplate.findOne({ code: req.body.code });
        if (existingTemplate) {
          return res.status(400).json({
            success: false,
            message: 'Un template avec ce code existe déjà'
          });
        }
        template.code = req.body.code;
      }
      template.updatedBy = req.user.id;

      await template.save();
      await template.populate('updatedBy', 'firstName lastName email');

      res.json({
        success: true,
        message: 'Template mis à jour avec succès',
        template
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du template:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   DELETE /api/sms-templates/:id
// @desc    Supprimer un template SMS
// @access  Private/Admin
router.delete('/:id', async (req, res) => {
  try {
    const template = await SmsTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trouvé'
      });
    }

    // Empêcher la suppression des templates système
    if (template.isSystem) {
      return res.status(403).json({
        success: false,
        message: 'Les templates système ne peuvent pas être supprimés'
      });
    }

    await SmsTemplate.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Template supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du template:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/sms-templates/:id/test
// @desc    Tester un template SMS avec des variables (prévisualisation uniquement)
// @access  Private/Admin
router.post(
  '/:id/test',
  [
    body('variables').optional().isObject().withMessage('Les variables doivent être un objet')
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

      const template = await SmsTemplate.findById(req.params.id);

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template non trouvé'
        });
      }

      // Remplacer les variables dans le message
      let testMessage = template.message;
      const variables = req.body.variables || {};

      Object.keys(variables).forEach(key => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        testMessage = testMessage.replace(regex, variables[key]);
      });

      res.json({
        success: true,
        originalMessage: template.message,
        testMessage,
        variables: req.body.variables
      });
    } catch (error) {
      console.error('Erreur lors du test du template:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   POST /api/sms-templates/:id/send-test
// @desc    Envoyer un SMS de test réel avec un template
// @access  Private/Admin
router.post(
  '/:id/send-test',
  [
    body('phone').trim().notEmpty().withMessage('Le numéro de téléphone est requis'),
    body('variables').optional().isObject().withMessage('Les variables doivent être un objet')
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

      const template = await SmsTemplate.findById(req.params.id);

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template non trouvé'
        });
      }

      if (!template.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Le template est inactif. Activez-le avant de l\'envoyer.'
        });
      }

      const { sendNotificationSMS } = require('../sendSMS');
      const { phone, variables = {} } = req.body;

      // Envoyer le SMS de test
      const result = await sendNotificationSMS(
        phone,
        template.code,
        variables,
        {
          context: 'manual',
          sentBy: req.user.id,
          skipPreferences: true // Toujours envoyer les SMS de test
        }
      );

      res.json({
        success: true,
        message: 'SMS de test envoyé avec succès',
        result: {
          to: phone,
          templateCode: template.code,
          templateName: template.name,
          message: result.message || 'Message envoyé',
          status: result.status || 'sent'
        }
      });
    } catch (error) {
      console.error('Erreur lors de l\'envoi du SMS de test:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi du SMS de test',
        error: error.message
      });
    }
  }
);

module.exports = router;


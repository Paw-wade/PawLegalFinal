const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');

const router = express.Router();

// Configuration du stockage Multer pour les documents de contact
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/contact');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, name + '-' + uniqueSuffix + ext);
  }
});

// Filtre pour accepter seulement certains types de fichiers
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Formats acceptés : PDF, DOC, DOCX, JPG, PNG'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB max par fichier
  },
  fileFilter: fileFilter
});

// @route   POST /api/contact
// @desc    Envoyer un message de contact
// @access  Public
router.post(
  '/',
  upload.array('documents', 5), // Maximum 5 fichiers
  [
    body('name').trim().notEmpty().withMessage('Le nom est requis'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('subject').trim().notEmpty().withMessage('Le sujet est requis'),
    body('message').trim().notEmpty().withMessage('Le message est requis'),
    body('phone').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Supprimer les fichiers uploadés en cas d'erreur de validation
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { name, email, phone, subject, message } = req.body;

      // Préparer les informations des documents
      const documents = [];
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          documents.push({
            filename: file.filename,
            originalName: file.originalname,
            path: file.path,
            size: file.size,
            mimetype: file.mimetype
          });
        });
      }

      // Sauvegarder le message dans la base de données
      const newMessage = await Message.create({
        name,
        email,
        phone: phone || '',
        subject,
        message,
        documents
      });

      console.log('✅ Nouveau message de contact enregistré:', newMessage._id);

      // Envoyer un SMS de confirmation au client si un numéro de téléphone est fourni
      if (phone && phone.trim()) {
        try {
          const { sendSMS } = require('../sendSMS');
          const smsMessage = `Merci de nous avoir contactés.\n\nNous vous invitons à créer un compte sur notre site afin de faciliter le suivi de votre demande.\n\nÀ très bientôt.`;
          
          await sendSMS(phone, smsMessage);
          console.log(`✅ SMS de confirmation envoyé à ${phone}`);
        } catch (smsError) {
          console.error('⚠️ Erreur lors de l\'envoi du SMS de confirmation:', smsError);
          // Ne pas bloquer l'envoi du message si le SMS échoue
        }
      }

      // Notifier tous les admins
      try {
        const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } });
        
        for (const admin of admins) {
          await Notification.create({
            user: admin._id,
            type: 'message_received',
            titre: 'Nouveau message de contact',
            message: `Nouveau message de ${name} (${email}) : "${subject}"`,
            lien: `/admin/messages/${newMessage._id}`,
            metadata: {
              messageId: newMessage._id.toString(),
              email: email,
              subject: subject
            }
          });
        }
        console.log(`✅ Notifications envoyées à ${admins.length} admin(s)`);
      } catch (notifError) {
        console.error('⚠️ Erreur lors de l\'envoi des notifications:', notifError);
        // Ne pas bloquer l'envoi du message si les notifications échouent
      }

      res.json({
        success: true,
        message: 'Votre message a été envoyé avec succès. Nous vous répondrons dans les plus brefs délais.',
        data: {
          id: newMessage._id
        }
      });
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message:', error);
      
      // Supprimer les fichiers uploadés en cas d'erreur
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            try {
              fs.unlinkSync(file.path);
            } catch (unlinkError) {
              console.error('Erreur lors de la suppression du fichier:', unlinkError);
            }
          }
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de l\'envoi du message',
        error: error.message
      });
    }
  }
);

// @route   GET /api/contact
// @desc    Récupérer tous les messages (admin seulement)
// @access  Private/Admin
router.get(
  '/',
  require('../middleware/auth').protect,
  require('../middleware/auth').authorize('admin', 'superadmin'),
  async (req, res) => {
    try {
      const { lu, repondu, limit = 50, page = 1 } = req.query;
      const userId = req.user.id || req.user._id;
      
      let query = {};
      
      // Filtrer par statut lu/non lu pour l'utilisateur actuel
      if (lu !== undefined) {
        if (lu === 'false' || lu === false) {
          // Messages non lus par cet utilisateur
          query = {
            $or: [
              { lu: { $exists: false } },
              { lu: { $size: 0 } },
              { lu: { $not: { $elemMatch: { user: userId } } } }
            ]
          };
        } else {
          // Messages lus par cet utilisateur
          query = {
            lu: { $elemMatch: { user: userId } }
          };
        }
      }
      
      if (repondu !== undefined) {
        query.repondu = repondu === 'true';
      }

      const messages = await Message.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate('lu.user', 'firstName lastName email');

      const total = await Message.countDocuments(query);

      res.json({
        success: true,
        count: messages.length,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        messages: messages
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des messages:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   GET /api/contact/:id
// @desc    Récupérer un message spécifique (admin seulement)
// @access  Private/Admin
router.get(
  '/:id',
  require('../middleware/auth').protect,
  require('../middleware/auth').authorize('admin', 'superadmin'),
  async (req, res) => {
    try {
      // Valider que l'ID est un ObjectId valide
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'ID de message invalide'
        });
      }

      const message = await Message.findById(req.params.id);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message non trouvé'
        });
      }

      // Nettoyer les entrées lu invalides (sans user) - utiliser markModified pour forcer la sauvegarde
      if (message.lu && Array.isArray(message.lu)) {
        const cleanedLu = message.lu.filter(l => l && l.user && (l.user._id || l.user));
        if (cleanedLu.length !== message.lu.length) {
          message.lu = cleanedLu;
          message.markModified('lu');
        }
      } else {
        message.lu = [];
        message.markModified('lu');
      }

      // Marquer comme lu par cet admin (gestion partagée)
      const userId = req.user.id || req.user._id;
      const dejaLu = message.lu && message.lu.length > 0 && message.lu.some((l) => {
        const luUserId = l.user?._id?.toString() || l.user?.toString();
        return luUserId && userId && luUserId.toString() === userId.toString();
      });
      
      if (!dejaLu) {
        if (!message.lu || !Array.isArray(message.lu)) {
          message.lu = [];
        }
        message.lu.push({
          user: userId,
          luAt: new Date()
        });
        message.markModified('lu');
        await message.save();
      }

      // Populate après la sauvegarde
      await message.populate('lu.user', 'firstName lastName email');

      res.json({
        success: true,
        message: message
      });
    } catch (error) {
      console.error('Erreur lors de la récupération du message:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   PATCH /api/contact/:id
// @desc    Marquer un message comme lu ou répondre (admin seulement)
// @access  Private/Admin
router.patch(
  '/:id',
  require('../middleware/auth').protect,
  require('../middleware/auth').authorize('admin', 'superadmin'),
  [
    body('lu').optional().isBoolean(),
    body('repondu').optional().isBoolean(),
    body('reponse').optional().trim()
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

      // Valider que l'ID est un ObjectId valide
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'ID de message invalide'
        });
      }

      const message = await Message.findById(req.params.id);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message non trouvé'
        });
      }

      // Gérer le marquage lu/non lu partagé
      if (req.body.lu !== undefined) {
        const userId = req.user.id || req.user._id;
        // Nettoyer les entrées lu invalides (sans user)
        if (message.lu && Array.isArray(message.lu)) {
          const cleanedLu = message.lu.filter(l => l && l.user && (l.user._id || l.user));
          if (cleanedLu.length !== message.lu.length) {
            message.lu = cleanedLu;
            message.markModified('lu');
          }
        } else {
          message.lu = [];
          message.markModified('lu');
        }

        if (req.body.lu === true) {
          // Marquer comme lu par cet admin
          const dejaLu = message.lu && message.lu.length > 0 && message.lu.some((l) => {
            const luUserId = l.user?._id?.toString() || l.user?.toString();
            return luUserId && userId && luUserId.toString() === userId.toString();
          });
          if (!dejaLu) {
            if (!message.lu || !Array.isArray(message.lu)) {
              message.lu = [];
            }
            message.lu.push({
              user: userId,
              luAt: new Date()
            });
            message.markModified('lu');
          }
        } else {
          // Marquer comme non lu (retirer de la liste)
          message.lu = message.lu.filter((l) => {
            const luUserId = l.user?._id?.toString() || l.user?.toString();
            return luUserId && userId && luUserId.toString() !== userId.toString();
          });
          message.markModified('lu');
        }
      }
      if (req.body.repondu !== undefined) message.repondu = req.body.repondu;
      if (req.body.reponse !== undefined) message.reponse = req.body.reponse;

      await message.save();
      await message.populate('lu.user', 'firstName lastName email');

      res.json({
        success: true,
        message: 'Message mis à jour avec succès',
        data: message
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du message:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   GET /api/contact/:id/document/:docId
// @desc    Télécharger un document joint à un message (admin seulement)
// @access  Private/Admin
router.get(
  '/:id/document/:docId',
  require('../middleware/auth').protect,
  require('../middleware/auth').authorize('admin', 'superadmin'),
  async (req, res) => {
    try {
      const message = await Message.findById(req.params.id);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message non trouvé'
        });
      }

      // Si docId est un index numérique, utiliser l'index du tableau
      let document;
      if (!isNaN(req.params.docId)) {
        const index = parseInt(req.params.docId);
        if (message.documents && message.documents[index]) {
          document = message.documents[index];
        }
      } else {
        document = message.documents.id(req.params.docId);
      }

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document non trouvé'
        });
      }

      if (!fs.existsSync(document.path)) {
        return res.status(404).json({
          success: false,
          message: 'Fichier non trouvé sur le serveur'
        });
      }

      res.download(document.path, document.originalName);
    } catch (error) {
      console.error('Erreur lors du téléchargement du document:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   POST /api/contact/:id/create-dossier
// @desc    Créer un dossier depuis un message de contact (admin seulement)
// @access  Private/Admin
router.post(
  '/:id/create-dossier',
  require('../middleware/auth').protect,
  require('../middleware/auth').authorize('admin', 'superadmin'),
  [
    body('titre').trim().notEmpty().withMessage('Le titre est requis'),
    body('categorie').trim().notEmpty().withMessage('La catégorie est requise'),
    body('type').trim().notEmpty().withMessage('Le type est requis'),
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

      const message = await Message.findById(req.params.id);
      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message non trouvé'
        });
      }

      const Dossier = require('../models/Dossier');
      const { sendNotificationSMS } = require('../sendSMS');

      // Extraire nom et prénom du message
      const nameParts = (message.name || '').split(' ');
      const clientPrenom = nameParts[0] || '';
      const clientNom = nameParts.slice(1).join(' ') || '';

      // Créer le dossier avec les données du message
      const dossierData = {
        titre: req.body.titre,
        description: req.body.description || `Dossier créé depuis le message de contact: "${message.subject}"\n\n${message.message}`,
        categorie: req.body.categorie,
        type: req.body.type,
        statut: req.body.statut || 'recu',
        priorite: req.body.priorite || 'normale',
        clientNom: req.body.clientNom || clientNom,
        clientPrenom: req.body.clientPrenom || clientPrenom,
        clientEmail: req.body.clientEmail || message.email,
        clientTelephone: req.body.clientTelephone || message.phone || '',
        notes: `Dossier créé depuis le message de contact ID: ${message._id}\nSujet: ${message.subject}\nDate du message: ${message.createdAt}`,
        createdFromContactMessage: message._id, // Lier le dossier au message
      };

      const newDossier = await Dossier.create(dossierData);

      // Marquer le message comme traité (optionnel)
      message.repondu = true;
      await message.save();

      // Envoyer une notification SMS si un numéro de téléphone est disponible
      try {
        const phoneNumber = message.phone || req.body.clientTelephone;
        if (phoneNumber) {
          await sendNotificationSMS(
            phoneNumber,
            'dossier_created',
            {
              dossierTitle: newDossier.titre || 'Votre dossier',
              dossierId: newDossier.numero || newDossier._id.toString()
            },
            {
              context: 'dossier',
              contextId: newDossier._id.toString(),
              skipPreferences: true // Toujours envoyer ce SMS car c'est une confirmation importante
            }
          );
          console.log(`✅ SMS envoyé à ${phoneNumber} pour la création du dossier ${newDossier.numero || newDossier._id}`);
        }
      } catch (smsError) {
        console.error('⚠️ Erreur lors de l\'envoi du SMS:', smsError);
        // Ne pas bloquer la création du dossier si le SMS échoue
      }

      // Notifier tous les admins de la création du dossier
      try {
        const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } });
        for (const admin of admins) {
          await Notification.create({
            user: admin._id,
            type: 'dossier_created',
            titre: 'Dossier créé depuis un message de contact',
            message: `Un nouveau dossier "${req.body.titre}" a été créé depuis le message de ${message.name} (${message.email})`,
            lien: `/admin/dossiers/${newDossier._id}`,
            metadata: {
              dossierId: newDossier._id.toString(),
              messageId: message._id.toString(),
            }
          });
        }
      } catch (notifError) {
        console.error('⚠️ Erreur lors de l\'envoi des notifications:', notifError);
      }

      res.json({
        success: true,
        message: 'Dossier créé avec succès',
        dossier: newDossier
      });
    } catch (error) {
      console.error('Erreur lors de la création du dossier:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la création du dossier',
        error: error.message
      });
    }
  }
);

module.exports = router;



const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { sendTransactionalEmail, escapeHtml } = require('../utils/emailNotifications');

const M = require('../tenantModels');
const { getOrgIdFromRequest } = require('../lib/tenant/uploads');
const { createTenantMulterStorage } = require('../lib/cloudinaryMulterStorage');
const {
  resolveUploadedFilePath,
  safeUnlinkMulterFiles,
  safeUnlinkUploadedFile,
  isRemoteUploadPath,
} = require('../lib/resolveUploadedFile');
const router = express.Router();

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
  storage: createTenantMulterStorage({
    subdir: 'contact',
    getOrgId: getOrgIdFromRequest,
  }),
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
        safeUnlinkMulterFiles(req.files);
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
        const orgId = getOrgIdFromRequest(req);
        req.files.forEach((file) => {
          documents.push({
            filename: file.filename || path.basename(String(file.path || '')),
            originalName: file.originalname,
            path: resolveUploadedFilePath(file, 'contact', orgId),
            size: file.size,
            mimetype: file.mimetype,
          });
        });
      }

      // Sauvegarder le message dans la base de données
      const newMessage = await M.Message.create({
        name,
        email,
        phone: phone || '',
        subject,
        message,
        documents
      });

      console.log('✅ Nouveau message de contact enregistré:', newMessage._id);

      // Envoyer un e-mail de confirmation au client
      if (email && String(email).trim()) {
        try {
          await sendTransactionalEmail({
            to: email,
            toName: name || '',
            subject: 'Confirmation de réception de votre demande — Ada Papers',
            htmlContent: `
              <p>Nous vous remercions pour votre message.</p>
              <p>Votre demande a bien été enregistrée sous la référence <strong>${escapeHtml(newMessage._id.toString())}</strong>.</p>
              <p><strong>Sujet :</strong> ${escapeHtml(subject)}</p>
              <p>Notre équipe analysera votre demande et vous répondra dans les meilleurs délais, en principe sous 24 à 48 heures ouvrées.</p>
              <p>Pour faciliter le suivi de votre dossier, nous vous invitons à conserver cet e-mail.</p>
            `,
            textContent: `Nous vous remercions pour votre message.

Votre demande a bien été enregistrée sous la référence ${newMessage._id.toString()}.
Sujet : ${subject}

Notre équipe analysera votre demande et vous répondra dans les meilleurs délais, en principe sous 24 à 48 heures ouvrées.
Pour faciliter le suivi de votre dossier, nous vous invitons à conserver cet e-mail.`,
          });
        } catch (emailError) {
          console.error('⚠️ Erreur lors de l\'envoi de l\'email de confirmation contact:', emailError);
        }
      }

      // Notifier tous les admins + e-mail d’alerte
      try {
        const admins = await M.User.find({ role: { $in: ['admin', 'superadmin'] } });
        
        for (const admin of admins) {
          await M.Notification.create({
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

          if (admin.email) {
            await sendTransactionalEmail({
              to: admin.email,
              toName: `${admin.firstName || ''} ${admin.lastName || ''}`.trim(),
              subject: `Nouveau message de contact — ${subject}`,
              htmlContent: `
                <p>Un nouveau message de contact a été reçu sur la plateforme.</p>
                <p><strong>Expéditeur :</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
                ${phone ? `<p><strong>Téléphone :</strong> ${escapeHtml(phone)}</p>` : ''}
                <p><strong>Sujet :</strong> ${escapeHtml(subject)}</p>
                <p><strong>Message :</strong><br/>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
                <p>Vous pouvez consulter et traiter ce message depuis l’espace d’administration.</p>
              `,
              textContent: `Un nouveau message de contact a été reçu.

Expéditeur : ${name} (${email})
${phone ? `Téléphone : ${phone}\n` : ''}Sujet : ${subject}
Message : ${message}

Vous pouvez consulter et traiter ce message depuis l’espace d’administration.`,
            });
          }
        }
        console.log(`✅ Notifications envoyées à ${admins.length} admin(s)`);
      } catch (notifError) {
        console.error('⚠️ Erreur lors de l\'envoi des notifications:', notifError);
        // Ne pas bloquer l'envoi du message si les notifications échouent
      }

      // Pas de SMS aux admins : notification in-app + push (hook Notification) suffisent.

      res.json({
        success: true,
        message: 'Votre message a été envoyé avec succès. Nous vous répondrons dans les plus brefs délais.',
        data: {
          id: newMessage._id
        }
      });
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message:', error);
      
      safeUnlinkMulterFiles(req.files);
      
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

      const messages = await M.Message.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate('lu.user', 'firstName lastName email');

      const total = await M.Message.countDocuments(query);

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

      const message = await M.Message.findById(req.params.id);

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

      const message = await M.Message.findById(req.params.id);

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
      const message = await M.Message.findById(req.params.id);

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

      if (isRemoteUploadPath(document.path)) {
        return res.redirect(document.path);
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

      const message = await M.Message.findById(req.params.id);
      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message non trouvé'
        });
      }

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

      const newDossier = await M.Dossier.create(dossierData);

      // Marquer le message comme traité (optionnel)
      message.repondu = true;
      await message.save();

      // Envoyer un e-mail de confirmation de création de dossier
      if (message.email) {
        try {
          await sendTransactionalEmail({
            to: message.email,
            toName: message.name || '',
            subject: `Votre dossier a été créé — Référence ${newDossier.numero || newDossier._id}`,
            htmlContent: `
              <p>Nous vous confirmons la création de votre dossier suite à votre message de contact.</p>
              <p><strong>Référence du dossier :</strong> ${escapeHtml(newDossier.numero || newDossier._id.toString())}</p>
              <p><strong>Intitulé :</strong> ${escapeHtml(newDossier.titre || 'Sans titre')}</p>
              <p>Nos équipes prendront en charge votre demande et vous informeront des prochaines étapes depuis votre espace Ada Papers.</p>
            `,
            textContent: `Nous vous confirmons la création de votre dossier suite à votre message de contact.

Référence du dossier : ${newDossier.numero || newDossier._id.toString()}
Intitulé : ${newDossier.titre || 'Sans titre'}

Nos équipes prendront en charge votre demande et vous informeront des prochaines étapes depuis votre espace Ada Papers.`,
          });
        } catch (mailErr) {
          console.error('⚠️ Erreur lors de l\'envoi de l\'email de confirmation dossier:', mailErr);
        }
      }

      // Notifier tous les admins de la création du dossier
      try {
        const admins = await M.User.find({ role: { $in: ['admin', 'superadmin'] } });
        for (const admin of admins) {
          await M.Notification.create({
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



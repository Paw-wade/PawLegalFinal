const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const DocumentRequest = require('../models/DocumentRequest');
const Document = require('../models/Document');
const Dossier = require('../models/Dossier');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { handleImpersonation } = require('../middleware/impersonation');
const { sendNotificationSMS } = require('../sendSMS');

// Toutes les routes nécessitent une authentification
router.use(protect);
router.use(handleImpersonation);

// @route   POST /api/document-requests
// @desc    Créer une demande de document (admin seulement)
// @access  Private/Admin
router.post(
  '/',
  authorize('admin', 'superadmin'),
  [
    body('dossierId').notEmpty().withMessage('L\'ID du dossier est requis'),
    body('documentType').notEmpty().withMessage('Le type de document est requis'),
    body('documentTypeLabel').notEmpty().withMessage('Le libellé du type de document est requis'),
    body('message').optional().trim(),
    body('isUrgent').optional().isBoolean()
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

      const { dossierId, documentType, documentTypeLabel, message, isUrgent } = req.body;

      // Valider que documentType est dans l'enum autorisé
      const allowedDocumentTypes = ['identite', 'titre_sejour', 'contrat', 'facture', 'passeport', 'justificatif_domicile', 'avis_imposition', 'autre'];
      if (!documentType || !allowedDocumentTypes.includes(documentType)) {
        console.error('❌ Type de document invalide:', documentType);
        return res.status(400).json({
          success: false,
          message: `Type de document invalide. Types autorisés: ${allowedDocumentTypes.join(', ')}`
        });
      }

      console.log('📄 Création de demande de document:', {
        dossierId,
        documentType,
        documentTypeLabel,
        message,
        isUrgent,
        requestedBy: req.user.id,
        userEmail: req.user.email
      });

      // Vérifier que le dossier existe
      const dossier = await Dossier.findById(dossierId)
        .populate('user', 'firstName lastName email phone');
      
      if (!dossier) {
        console.error(`❌ Dossier non trouvé: ${dossierId}`);
        return res.status(404).json({
          success: false,
          message: 'Dossier non trouvé'
        });
      }

      console.log('📁 Dossier trouvé:', {
        dossierId: dossier._id,
        titre: dossier.titre,
        numero: dossier.numero,
        hasUser: !!dossier.user,
        clientEmail: dossier.clientEmail
      });

      // Déterminer le client (requestedFrom)
      // Le dossier peut avoir un utilisateur connecté (dossier.user) ou seulement des coordonnées client
      let requestedFrom = null;
      
      if (dossier.user) {
        // Utilisateur connecté
        requestedFrom = dossier.user._id || dossier.user;
      } else if (dossier.clientEmail) {
        // Pas d'utilisateur connecté, mais email client disponible
        // Chercher l'utilisateur par email
        const clientUser = await User.findOne({ email: dossier.clientEmail.toLowerCase() });
        if (clientUser) {
          requestedFrom = clientUser._id;
        }
      }

      if (!requestedFrom) {
        return res.status(400).json({
          success: false,
          message: 'Le dossier n\'a pas d\'utilisateur connecté associé. Veuillez d\'abord créer un compte pour le client ou associer un utilisateur existant au dossier.'
        });
      }

      // Vérifier que requestedBy est un ObjectId valide
      const mongoose = require('mongoose');
      let requestedByObjId;
      try {
        const userId = req.user._id || req.user.id;
        console.log('🔍 req.user:', {
          _id: req.user._id,
          id: req.user.id,
          email: req.user.email,
          role: req.user.role
        });
        
        if (!userId) {
          console.error('❌ req.user.id ou req.user._id est undefined');
          return res.status(400).json({
            success: false,
            message: 'ID utilisateur manquant'
          });
        }
        requestedByObjId = mongoose.Types.ObjectId.isValid(userId) 
          ? new mongoose.Types.ObjectId(userId) 
          : userId;
        console.log('✅ requestedBy validé:', requestedByObjId.toString());
      } catch (err) {
        console.error('❌ Erreur lors de la conversion de requestedBy:', err);
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur invalide'
        });
      }

      // Vérifier que requestedFrom est un ObjectId valide
      let requestedFromObjId;
      try {
        if (!requestedFrom) {
          console.error('❌ requestedFrom est null ou undefined');
          return res.status(400).json({
            success: false,
            message: 'ID client manquant'
          });
        }
        requestedFromObjId = mongoose.Types.ObjectId.isValid(requestedFrom) 
          ? new mongoose.Types.ObjectId(requestedFrom) 
          : requestedFrom;
        console.log('✅ requestedFrom validé:', requestedFromObjId.toString());
      } catch (err) {
        console.error('❌ Erreur lors de la conversion de requestedFrom:', err);
        return res.status(400).json({
          success: false,
          message: 'ID client invalide'
        });
      }

      // Vérifier que dossierId est un ObjectId valide
      let dossierObjId;
      try {
        if (!dossierId) {
          console.error('❌ dossierId est null ou undefined');
          return res.status(400).json({
            success: false,
            message: 'ID dossier manquant'
          });
        }
        dossierObjId = mongoose.Types.ObjectId.isValid(dossierId) 
          ? new mongoose.Types.ObjectId(dossierId) 
          : dossierId;
        console.log('✅ dossierId validé:', dossierObjId.toString());
      } catch (err) {
        console.error('❌ Erreur lors de la conversion de dossierId:', err);
        return res.status(400).json({
          success: false,
          message: 'ID dossier invalide'
        });
      }

      // Créer la demande
      console.log('📝 Tentative de création de DocumentRequest avec:', {
        dossier: dossierObjId.toString(),
        requestedBy: requestedByObjId.toString(),
        requestedFrom: requestedFromObjId.toString(),
        documentType,
        documentTypeLabel,
        message: message || '',
        isUrgent: isUrgent || false,
        status: 'pending'
      });

      let documentRequest;
      try {
        documentRequest = await DocumentRequest.create({
          dossier: dossierObjId,
          requestedBy: requestedByObjId,
          requestedFrom: requestedFromObjId,
          documentType,
          documentTypeLabel,
          message: message || '',
          isUrgent: isUrgent || false,
          status: 'pending'
        });
        console.log('✅ Demande de document créée avec succès:', documentRequest._id);
      } catch (createError) {
        console.error('❌ Erreur lors de la création du DocumentRequest:', createError);
        console.error('❌ Détails de l\'erreur:', {
          name: createError.name,
          message: createError.message,
          code: createError.code,
          keyPattern: createError.keyPattern,
          keyValue: createError.keyValue,
          errors: createError.errors
        });
        throw createError; // Re-lancer pour être capturé par le catch global
      }

      console.log('✅ Demande de document créée:', documentRequest._id);

      // Populate pour la réponse
      await documentRequest.populate('requestedBy', 'firstName lastName email');
      await documentRequest.populate('requestedFrom', 'firstName lastName email phone');
      await documentRequest.populate('dossier', 'titre numero');

      // Créer une notification pour le client
      const clientUser = await User.findById(requestedFrom);
      if (!clientUser) {
        console.error(`❌ Utilisateur non trouvé pour l'ID: ${requestedFrom}`);
        return res.status(404).json({
          success: false,
          message: 'Utilisateur client non trouvé'
        });
      }

      try {
        await Notification.create({
          user: requestedFrom,
          type: 'document_request',
          title: isUrgent 
            ? `🔴 Demande urgente de document - Dossier ${dossier.numero || dossier._id}`
            : `📄 Demande de document - Dossier ${dossier.numero || dossier._id}`,
          message: `Un document de type "${documentTypeLabel}" est requis pour votre dossier ${dossier.numero || dossier._id}.${message ? `\n\nMessage: ${message}` : ''}`,
          data: {
            documentRequestId: documentRequest._id,
            dossierId: dossierId,
            dossierNumero: dossier.numero,
            documentType: documentType,
            documentTypeLabel: documentTypeLabel,
            isUrgent: isUrgent || false
          },
          priority: isUrgent ? 'high' : 'normal'
        });
        console.log(`✅ Notification créée pour le client ${clientUser.email}`);
      } catch (notifError) {
        console.error('⚠️ Erreur lors de la création de la notification:', notifError);
        // Ne pas bloquer la création de la demande si la notification échoue
      }

      // Envoyer un SMS si configuré
      if (clientUser.phone) {
        try {
          await sendNotificationSMS(
            clientUser.phone,
            'document_request',
            {
              dossierNumero: dossier.numero || dossier._id.toString(),
              documentType: documentTypeLabel,
              isUrgent: isUrgent || false,
              isUrgentText: isUrgent ? '🔴 URGENT: ' : ''
            },
            {
              userId: requestedFrom.toString(),
              context: 'document_request',
              contextId: documentRequest._id.toString()
            }
          );
          console.log(`✅ SMS envoyé au client ${clientUser.email} pour la demande de document`);
        } catch (smsError) {
          console.error('⚠️ Erreur lors de l\'envoi du SMS:', smsError);
          // Ne pas bloquer la création de la demande si le SMS échoue
        }
      }

      res.status(201).json({
        success: true,
        message: 'Demande de document créée avec succès',
        documentRequest
      });
    } catch (error) {
      console.error('❌ Erreur lors de la création de la demande de document:', error);
      console.error('❌ Stack trace:', error.stack);
      console.error('❌ Détails de l\'erreur:', {
        name: error.name,
        message: error.message,
        code: error.code,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue
      });
      
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
      
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la création de la demande de document',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   GET /api/document-requests
// @desc    Récupérer les demandes de documents
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { dossierId, status, userId } = req.query;
    const query = {};

    // Si admin, peut voir toutes les demandes ou filtrer par dossier
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      if (dossierId) {
        query.dossier = dossierId;
      }
      if (status) {
        query.status = status;
      }
      if (userId) {
        query.requestedFrom = userId;
      }
    } else {
      // Si client, voir uniquement ses demandes
      const targetUserId = req.impersonateUserId || req.user.id;
      query.requestedFrom = targetUserId;
      if (status) {
        query.status = status;
      }
      if (dossierId) {
        query.dossier = dossierId;
      }
    }

    const documentRequests = await DocumentRequest.find(query)
      .populate('dossier', 'titre numero statut')
      .populate('requestedBy', 'firstName lastName email')
      .populate('requestedFrom', 'firstName lastName email phone')
      .populate('document', 'nom typeMime taille')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: documentRequests.length,
      documentRequests
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des demandes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/document-requests/:id
// @desc    Récupérer une demande de document par ID
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const documentRequest = await DocumentRequest.findById(req.params.id)
      .populate('dossier', 'titre numero statut')
      .populate('requestedBy', 'firstName lastName email')
      .populate('requestedFrom', 'firstName lastName email phone')
      .populate('document', 'nom typeMime taille cheminFichier');

    if (!documentRequest) {
      return res.status(404).json({
        success: false,
        message: 'Demande de document non trouvée'
      });
    }

    // Vérifier les permissions
    const targetUserId = req.impersonateUserId || req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const isRequestedFrom = documentRequest.requestedFrom._id?.toString() === targetUserId.toString() || 
                           documentRequest.requestedFrom.toString() === targetUserId.toString();
    const isRequestedBy = documentRequest.requestedBy._id?.toString() === req.user.id.toString() ||
                         documentRequest.requestedBy.toString() === req.user.id.toString();

    if (!isAdmin && !isRequestedFrom && !isRequestedBy) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette demande'
      });
    }

    res.json({
      success: true,
      documentRequest
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de la demande:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/document-requests/:id/upload
// @desc    Téléverser un document en réponse à une demande
// @access  Private
router.post(
  '/:id/upload',
  [
    body('documentId').notEmpty().withMessage('L\'ID du document est requis')
  ],
  async (req, res) => {
    try {
      console.log('📤 Upload de document - Début de la requête:', {
        requestId: req.params.id,
        userId: req.user.id,
        userRole: req.user.role,
        impersonateUserId: req.impersonateUserId,
        body: req.body
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

      const { documentId } = req.body;
      const targetUserId = req.impersonateUserId || req.user.id;
      
      console.log('📤 Données extraites:', {
        documentId: documentId,
        targetUserId: targetUserId.toString()
      });

      // Vérifier que la demande existe
      const documentRequest = await DocumentRequest.findById(req.params.id)
        .populate('dossier', 'titre numero')
        .populate('requestedBy', 'firstName lastName email')
        .populate('requestedFrom', 'firstName lastName email phone');

      if (!documentRequest) {
        return res.status(404).json({
          success: false,
          message: 'Demande de document non trouvée'
        });
      }

      // Vérifier que l'utilisateur est le destinataire de la demande
      let isRequestedFrom = false;
      if (documentRequest.requestedFrom) {
        if (documentRequest.requestedFrom._id) {
          isRequestedFrom = documentRequest.requestedFrom._id.toString() === targetUserId.toString();
        } else {
          isRequestedFrom = documentRequest.requestedFrom.toString() === targetUserId.toString();
        }
      }
      const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

      if (!isAdmin && !isRequestedFrom) {
        console.error('❌ Accès refusé:', {
          targetUserId: targetUserId.toString(),
          requestedFrom: documentRequest.requestedFrom ? (documentRequest.requestedFrom._id || documentRequest.requestedFrom).toString() : 'null',
          isAdmin: isAdmin,
          isRequestedFrom: isRequestedFrom
        });
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à répondre à cette demande'
        });
      }

      // Vérifier que le document existe et appartient à l'utilisateur
      const document = await Document.findById(documentId);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document non trouvé'
        });
      }

      if (!isAdmin && document.user.toString() !== targetUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Ce document ne vous appartient pas'
        });
      }

      // Note: On permet maintenant la réutilisation d'un document même s'il est déjà associé à une autre demande
      // Un document peut répondre à plusieurs demandes si nécessaire

      // Mettre à jour la demande - marquer comme "received" car le document a été envoyé et reçu
      console.log('📝 Mise à jour de la demande de document:', {
        requestId: req.params.id,
        documentId: documentId,
        dossier: documentRequest.dossier ? (documentRequest.dossier._id || documentRequest.dossier) : 'NON TROUVÉ'
      });

      documentRequest.document = documentId;
      documentRequest.status = 'received';
      documentRequest.sentAt = new Date();
      documentRequest.receivedAt = new Date();
      await documentRequest.save();
      console.log('✅ Demande de document mise à jour avec succès');

      // Mettre à jour le document pour le lier au dossier si ce n'est pas déjà fait
      try {
        if (!documentRequest.dossier) {
          console.error('❌ Erreur: documentRequest.dossier est null ou undefined');
          throw new Error('Dossier non trouvé dans la demande de document');
        }

        const dossierId = documentRequest.dossier._id 
          ? documentRequest.dossier._id.toString() 
          : documentRequest.dossier.toString();
        
        console.log('📁 Liaison du document au dossier:', {
          documentId: documentId,
          dossierId: dossierId,
          documentDossierId: document.dossierId ? document.dossierId.toString() : 'null'
        });
        
        if (!document.dossierId || document.dossierId.toString() !== dossierId) {
          document.dossierId = documentRequest.dossier._id || documentRequest.dossier;
          await document.save();
          console.log(`✅ Document ${documentId} lié au dossier ${dossierId}`);
        } else {
          console.log(`ℹ️ Document ${documentId} déjà lié au dossier ${dossierId}`);
        }
      } catch (dossierLinkError) {
        console.error('⚠️ Erreur lors de la liaison du document au dossier:', dossierLinkError);
        console.error('Stack trace:', dossierLinkError.stack);
        // Ne pas bloquer le processus si la liaison échoue
      }

      // Marquer la notification de demande de document comme lue pour le client
      try {
        if (!documentRequest.requestedFrom) {
          console.error('❌ Erreur: documentRequest.requestedFrom est null ou undefined');
          throw new Error('Utilisateur destinataire non trouvé dans la demande de document');
        }

        const requestedFromId = documentRequest.requestedFrom._id 
          ? documentRequest.requestedFrom._id.toString() 
          : documentRequest.requestedFrom.toString();
        
        console.log('🔔 Marquage de la notification comme lue pour le client:', {
          userId: requestedFromId,
          requestId: documentRequest._id.toString()
        });

        await Notification.updateMany(
          {
            user: requestedFromId,
            type: 'document_request',
            'data.documentRequestId': documentRequest._id.toString(),
            lu: false
          },
          {
            $set: { lu: true, readAt: new Date() }
          }
        );
        console.log(`✅ Notification(s) de demande de document marquée(s) comme lue(s) pour le client`);
      } catch (notifError) {
        console.error('⚠️ Erreur lors du marquage de la notification comme lue:', notifError);
        console.error('Stack trace:', notifError.stack);
        // Ne pas bloquer le processus si la mise à jour de la notification échoue
      }

      // Créer une notification pour l'administrateur
      try {
        if (!documentRequest.requestedBy) {
          console.error('❌ Erreur: documentRequest.requestedBy est null ou undefined');
          throw new Error('Administrateur demandeur non trouvé dans la demande de document');
        }

        const requestedById = documentRequest.requestedBy._id 
          ? documentRequest.requestedBy._id.toString() 
          : documentRequest.requestedBy.toString();
        
        console.log('👤 Recherche de l\'administrateur:', requestedById);
        const adminUser = await User.findById(requestedById);
        
        if (!adminUser) {
          console.warn('⚠️ Administrateur non trouvé avec l\'ID:', requestedById);
        } else {
          const dossierNumero = documentRequest.dossier?.numero || documentRequest.dossier?._id?.toString() || 'N/A';
          const dossierId = documentRequest.dossier?._id?.toString() || documentRequest.dossier?.toString() || 'N/A';
          
          console.log('📨 Création de la notification pour l\'admin:', {
            adminId: requestedById,
            dossierNumero: dossierNumero,
            documentName: document.nom
          });

          await Notification.create({
            user: requestedById,
            type: 'document_received',
            title: `📥 Document reçu - Dossier ${dossierNumero}`,
            message: `Le document "${document.nom}" a été envoyé en réponse à votre demande pour le dossier ${dossierNumero}.`,
            data: {
              documentRequestId: documentRequest._id.toString(),
              documentId: documentId.toString(),
              dossierId: dossierId,
              dossierNumero: dossierNumero
            },
            priority: 'normal'
          });

          // Envoyer un SMS à l'admin si configuré
          if (adminUser.phone) {
            try {
              const smsDossierNumero = documentRequest.dossier?.numero || documentRequest.dossier?._id?.toString() || 'N/A';
              await sendNotificationSMS(
                adminUser.phone,
                'document_received',
                {
                  dossierNumero: smsDossierNumero,
                  documentName: document.nom
                },
                {
                  userId: requestedById,
                  context: 'document_request',
                  contextId: documentRequest._id.toString()
                }
              );
              console.log(`✅ SMS envoyé à l'admin ${adminUser.email} pour la réception du document`);
            } catch (smsError) {
              console.error('⚠️ Erreur lors de l\'envoi du SMS:', smsError);
              console.error('Stack trace:', smsError.stack);
            }
          }
        }
      } catch (adminNotifError) {
        console.error('⚠️ Erreur lors de la création de la notification admin:', adminNotifError);
        // Ne pas bloquer le processus si la notification admin échoue
      }

      // Re-populate pour la réponse
      try {
        await documentRequest.populate('document', 'nom typeMime taille');
      } catch (populateError) {
        console.error('⚠️ Erreur lors du populate du document:', populateError);
        // Ne pas bloquer la réponse si le populate échoue
      }

      console.log('✅ Document envoyé avec succès pour la demande:', req.params.id);
      res.json({
        success: true,
        message: 'Document envoyé avec succès',
        documentRequest
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi du document:', error);
      console.error('Stack trace:', error.stack);
      console.error('Request params:', req.params);
      console.error('Request body:', req.body);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de l\'envoi du document',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

// @route   PATCH /api/document-requests/:id/status
// @desc    Mettre à jour le statut d'une demande (admin seulement)
// @access  Private/Admin
router.patch(
  '/:id/status',
  authorize('admin', 'superadmin'),
  [
    body('status').isIn(['pending', 'sent', 'received']).withMessage('Statut invalide')
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

      const { status } = req.body;
      const documentRequest = await DocumentRequest.findById(req.params.id);

      if (!documentRequest) {
        return res.status(404).json({
          success: false,
          message: 'Demande de document non trouvée'
        });
      }

      documentRequest.status = status;
      if (status === 'received') {
        documentRequest.receivedAt = new Date();
      }
      await documentRequest.save();

      await documentRequest.populate('dossier', 'titre numero');
      await documentRequest.populate('requestedBy', 'firstName lastName email');
      await documentRequest.populate('requestedFrom', 'firstName lastName email phone');
      await documentRequest.populate('document', 'nom typeMime taille');

      res.json({
        success: true,
        message: 'Statut mis à jour avec succès',
        documentRequest
      });
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du statut:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;


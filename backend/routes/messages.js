const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const MessageInterne = require('../models/MessageInterne');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Dossier = require('../models/Dossier');
const { protect, authorize } = require('../middleware/auth');
const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');

// Configuration de multer pour les pièces jointes
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/messages');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max par fichier
  },
  fileFilter: (req, file, cb) => {
    // Accepter tous les types de fichiers
    cb(null, true);
  }
});

// Middleware d'authentification pour toutes les routes
router.use(protect);

// IMPORTANT: Les routes spécifiques (comme /unread-count, /users) doivent être définies AVANT les routes paramétrées (/:id)
// pour éviter que Express ne les intercepte avec le paramètre :id

// @route   GET /api/messages/unread-count
// @desc    Récupérer le nombre de messages non lus (destinataire ou copie)
// @access  Private
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const count = await MessageInterne.countDocuments({
      $or: [
        { destinataires: userId },
        { copie: userId }
      ],
      lu: { $not: { $elemMatch: { user: userId } } },
      archive: { $not: { $elemMatch: { user: userId } } }
    });

    res.json({
      success: true,
      count: count
    });
  } catch (error) {
    console.error('Erreur lors du comptage des messages non lus:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/messages/users
// @desc    Récupérer la liste des utilisateurs pour la sélection du destinataire
// @access  Private (tous les utilisateurs authentifiés)
router.get('/users', async (req, res) => {
  try {
    const userRole = req.user.role;
    const isClient = userRole === 'client';
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    const isPartenaire = userRole === 'partenaire';

    let query = { isActive: { $ne: false } };
    let selectFields = 'firstName lastName email role';

    // Filtrer selon les règles de communication
    if (isClient) {
      // Les clients ne peuvent voir que les admins
      query.role = { $in: ['admin', 'superadmin'] };
    } else if (isPartenaire) {
      // Les partenaires peuvent voir les admins et superadmins
      query.role = { $in: ['admin', 'superadmin'] };
    }
    // Les admins peuvent voir tout le monde (pas de filtre)

    const users = await User.find(query)
      .select(selectFields)
      .sort({ role: 1, lastName: 1, firstName: 1 }); // Trier par rôle puis par nom

    res.json({
      success: true,
      users: users
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

// @route   GET /api/messages
// @desc    Récupérer les messages de l'utilisateur connecté
// @access  Private
router.get('/', async (req, res) => {
  try {
    console.log('📨 GET /api/messages - Requête reçue:', {
      user: req.user?.email,
      userId: req.user?.id,
      type: req.query.type,
      path: req.path
    });
    
    const userId = req.user.id;
    const { 
      type = 'all', 
      dossierId, 
      expediteurId, 
      destinataireId 
    } = req.query; // Filtres disponibles

    let query = {};
    
    if (type === 'received') {
      // Messages reçus (destinataire principal ou en copie)
      query = {
        $or: [
          { destinataires: userId },
          { copie: userId }
        ]
      };
    } else if (type === 'sent') {
      query = { expediteur: userId };
    } else if (type === 'unread') {
      // Messages non lus (destinataire principal ou en copie)
      query = { 
        $or: [
          { destinataires: userId },
          { copie: userId }
        ],
        lu: { $not: { $elemMatch: { user: userId } } }
      };
    } else {
      // 'all' - messages reçus (destinataire ou copie) ou envoyés
      query = {
        $or: [
          { destinataires: userId },
          { copie: userId },
          { expediteur: userId }
        ]
      };
    }

    // Exclure les messages archivés par l'utilisateur
    query.archive = { $not: { $elemMatch: { user: userId } } };
    
    // Filtrer par dossier si fourni
    if (dossierId) {
      const mongoose = require('mongoose');
      const dossierIdObj = typeof dossierId === 'string' && mongoose.Types.ObjectId.isValid(dossierId)
        ? new mongoose.Types.ObjectId(dossierId)
        : dossierId;
      query.dossierId = dossierIdObj;
      
      // Si partenaire et dossierId fourni, vérifier l'accès au dossier
      if (req.user.role === 'partenaire') {
        const Dossier = require('../models/Dossier');
        const dossier = await Dossier.findById(dossierIdObj)
          .populate('transmittedTo.partenaire', '_id');
        
        if (dossier && dossier.transmittedTo && Array.isArray(dossier.transmittedTo)) {
          const hasAccess = dossier.transmittedTo.some((trans) => {
            if (!trans || !trans.partenaire) return false;
            const transPartenaireId = trans.partenaire._id ? trans.partenaire._id.toString() : trans.partenaire.toString();
            // Accepter pending et accepted, mais pas refused
            return transPartenaireId === req.user.id.toString() && trans.status !== 'refused';
          });
          
          if (!hasAccess) {
            return res.status(403).json({
              success: false,
              message: 'Accès non autorisé aux messages de ce dossier'
            });
          }
        } else {
          // Si le dossier n'existe pas ou n'a pas de transmissions, refuser l'accès
          return res.status(403).json({
            success: false,
            message: 'Accès non autorisé aux messages de ce dossier'
          });
        }
      }
    }

    // Filtrer par expéditeur si fourni
    if (expediteurId) {
      const mongoose = require('mongoose');
      const expediteurIdObj = typeof expediteurId === 'string' && mongoose.Types.ObjectId.isValid(expediteurId)
        ? new mongoose.Types.ObjectId(expediteurId)
        : expediteurId;
      query.expediteur = expediteurIdObj;
    }

    // Filtrer par destinataire si fourni
    if (destinataireId) {
      const mongoose = require('mongoose');
      const destinataireIdObj = typeof destinataireId === 'string' && mongoose.Types.ObjectId.isValid(destinataireId)
        ? new mongoose.Types.ObjectId(destinataireId)
        : destinataireId;
      // Le destinataire peut être dans destinataires ou copie
      // Si query a déjà un $or, on doit combiner avec $and pour préserver toutes les conditions
      if (query.$or) {
        const existingConditions = { ...query };
        delete existingConditions.$or;
        query = {
          $and: [
            { $or: query.$or },
            {
              $or: [
                { destinataires: destinataireIdObj },
                { copie: destinataireIdObj }
              ]
            },
            ...Object.keys(existingConditions).map(key => ({ [key]: existingConditions[key] }))
          ]
        };
      } else {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { destinataires: destinataireIdObj },
            { copie: destinataireIdObj }
          ]
        });
      }
    }

    const messages = await MessageInterne.find(query)
      .populate('expediteur', 'firstName lastName email role')
      .populate('destinataires', 'firstName lastName email role')
      .populate('copie', 'firstName lastName email role')
      .populate('dossierId', 'titre numero statut')
      .populate('messageParent', 'sujet expediteur')
      .sort({ createdAt: -1 })
      .limit(1000); // Augmenter la limite pour avoir tous les messages des threads

    console.log('✅ Messages trouvés:', messages.length);

    // Regrouper les messages par threadId
    const threadMap = new Map();
    const allThreadIds = new Set();
    
    messages.forEach(message => {
      const threadId = message.threadId || message._id.toString();
      allThreadIds.add(threadId);
      
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId).push(message);
    });

    // Construire les threads avec les informations nécessaires
    const threads = Array.from(allThreadIds).map(threadId => {
      const threadMessages = threadMap.get(threadId) || [];
      
      // Trier les messages du thread par date croissante (plus ancien en premier)
      threadMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      // Le message racine est celui sans parent (ou le premier si tous ont un parent)
      const rootMessage = threadMessages.find(m => !m.messageParent) || threadMessages[0];
      const lastMessage = threadMessages[threadMessages.length - 1];
      
      // Déterminer si le thread est non lu (au moins un message non lu)
      const hasUnreadMessage = threadMessages.some(m => {
        return !m.lu?.some((l) => 
          (l.user?._id?.toString() || l.user?.toString()) === userId.toString()
        );
      });
      
      // Obtenir tous les participants du thread (expéditeurs et destinataires uniques)
      const participants = new Set();
      threadMessages.forEach(m => {
        if (m.expediteur?._id) {
          participants.add(m.expediteur._id.toString());
        }
        if (m.destinataires && Array.isArray(m.destinataires)) {
          m.destinataires.forEach((d) => {
            if (d._id) participants.add(d._id.toString());
          });
        }
        if (m.copie && Array.isArray(m.copie)) {
          m.copie.forEach((c) => {
            if (c._id) participants.add(c._id.toString());
          });
        }
      });
      
      return {
        threadId: threadId,
        root: rootMessage,
        messages: threadMessages,
        lastMessage: lastMessage,
        messageCount: threadMessages.length,
        hasUnread: hasUnreadMessage,
        participants: Array.from(participants),
        dossierId: rootMessage.dossierId?._id || rootMessage.dossierId,
        dossier: rootMessage.dossierId
      };
    });

    // Trier les threads par date du dernier message (plus récent en premier)
    // Les threads non lus en premier
    threads.sort((a, b) => {
      // Priorité aux threads non lus
      if (a.hasUnread && !b.hasUnread) return -1;
      if (!a.hasUnread && b.hasUnread) return 1;
      
      // Dans le même groupe (lus ou non lus), trier par date du dernier message
      const dateA = new Date(a.lastMessage.createdAt).getTime();
      const dateB = new Date(b.lastMessage.createdAt).getTime();
      return dateB - dateA;
    });

    res.json({
      success: true,
      messages: messages, // Garder pour compatibilité
      threads: threads
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des messages:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/messages
// @desc    Envoyer un message
// @access  Private
router.post(
  '/',
  upload.array('piecesJointes', 5), // Maximum 5 fichiers
  [
    body('sujet').trim().notEmpty().withMessage('Le sujet est requis'),
    body('contenu').trim().notEmpty().withMessage('Le contenu est requis'),
  ],
  async (req, res) => {
    try {
      console.log('📨 POST /api/messages - Requête reçue:', {
        user: req.user?.email,
        userId: req.user?.id,
        userRole: req.user?.role,
        body: req.body,
        bodyKeys: Object.keys(req.body || {}),
        files: req.files ? req.files.length : 0
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('❌ Erreurs de validation:', errors.array());
        return res.status(400).json({
          success: false,
          message: 'Erreur de validation',
          errors: errors.array()
        });
      }

      const mongoose = require('mongoose');
      const userId = req.user.id;
      const effectiveUser = req.user;
      const userRole = effectiveUser?.role || req.user.role;
      const { sujet, contenu, destinataire, copie, destinataires, messageParent, dossierId } = req.body; // messageParent pour les fils de discussion
      
      console.log('📨 Données extraites:', { sujet, contenu, destinataire, copie, destinataires, dossierId, messageParent, userRole });

      // Convertir userId en ObjectId si nécessaire
      const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

      console.log('📨 Données reçues:', { 
        sujet, 
        contenu, 
        destinataire, 
        copie, 
        dossierId,
        messageParent,
        userRole,
        userId: userIdObj.toString() 
      });

      let destinatairesIds = [];
      let copieIds = [];
      let typeMessage = 'user_to_admins';
      let threadId;

      // CAS 1: Administrateur / Super administrateur → Un destinataire (utilisateur ou admin) + copie optionnelle
      if (userRole === 'admin' || userRole === 'superadmin') {
        console.log('👨‍💼 Message d\'un administrateur');
        
        // Vérifier qu'un destinataire est fourni
        if (!destinataire) {
          return res.status(400).json({
            success: false,
            message: 'Veuillez sélectionner un destinataire'
          });
        }

        // Convertir le destinataire en ObjectId
        let destinataireId;
        try {
          if (typeof destinataire === 'string') {
            if (!mongoose.Types.ObjectId.isValid(destinataire)) {
              throw new Error(`ID de destinataire invalide: ${destinataire}`);
            }
            destinataireId = new mongoose.Types.ObjectId(destinataire);
          } else {
            destinataireId = destinataire;
          }
        } catch (idError) {
          console.error('❌ Erreur lors de la conversion de l\'ID destinataire:', idError);
          return res.status(400).json({
            success: false,
            message: idError.message || 'Format d\'ID de destinataire invalide'
          });
        }

        // Vérifier que l'admin ne s'envoie pas un message à lui-même
        if (destinataireId.toString() === userIdObj.toString()) {
          return res.status(400).json({
            success: false,
            message: 'Vous ne pouvez pas vous envoyer un message à vous-même'
          });
        }

        // Vérifier que le destinataire existe
        const destinataireUser = await User.findOne({
          _id: destinataireId,
          isActive: { $ne: false }
        });

        if (!destinataireUser) {
          return res.status(400).json({
            success: false,
            message: 'Destinataire non trouvé ou inactif'
          });
        }

        destinatairesIds = [destinataireId];

        // Déterminer le type de message
        if (destinataireUser.role === 'client') {
          typeMessage = 'admin_to_user';
        } else if (destinataireUser.role === 'admin' || destinataireUser.role === 'superadmin') {
          typeMessage = 'admin_to_admin';
        }

        // Traiter la copie (CC) si fournie
        if (copie && Array.isArray(copie) && copie.length > 0) {
          try {
            copieIds = copie
              .filter(id => id && id.toString() !== userIdObj.toString() && id.toString() !== destinataireId.toString()) // Exclure l'expéditeur et le destinataire principal
              .map(id => {
                if (typeof id === 'string') {
                  if (!mongoose.Types.ObjectId.isValid(id)) {
                    throw new Error(`ID de copie invalide: ${id}`);
                  }
                  return new mongoose.Types.ObjectId(id);
                }
                return id;
              });

            // Vérifier que tous les destinataires en copie existent
            if (copieIds.length > 0) {
              const copieValides = await User.find({
                _id: { $in: copieIds },
                isActive: { $ne: false }
              });

              if (copieValides.length !== copieIds.length) {
                return res.status(400).json({
                  success: false,
                  message: 'Un ou plusieurs destinataires en copie sont invalides'
                });
              }
            }
          } catch (copieError) {
            console.error('❌ Erreur lors du traitement de la copie:', copieError);
            return res.status(400).json({
              success: false,
              message: copieError.message || 'Format d\'ID de copie invalide'
            });
          }
        }

        // Vérifier la copie pour bloquer communication directe client-professionnel
        if (copie && Array.isArray(copie) && copie.length > 0) {
          const copieUsers = await User.find({
            _id: { $in: copie.map(id => typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id) },
            isActive: { $ne: false }
          });

        }

        console.log(`✅ Message adressé à ${destinatairesIds.length} destinataire(s) principal(aux) et ${copieIds.length} en copie`);
      } else if (userRole === 'partenaire') {
        // CAS 2: Partenaire → Administrateurs (pour les dossiers transmis)
        console.log('🤝 Message d\'un partenaire → Administrateurs');
        
        // Si dossierId est fourni, vérifier que le dossier est transmis au partenaire
        if (dossierId) {
          const Dossier = require('../models/Dossier');
          const dossierIdObj = typeof dossierId === 'string' && mongoose.Types.ObjectId.isValid(dossierId)
            ? new mongoose.Types.ObjectId(dossierId)
            : dossierId;
          
          const dossier = await Dossier.findById(dossierIdObj)
            .populate('transmittedTo.partenaire', '_id');
          
          if (!dossier) {
            return res.status(404).json({
              success: false,
              message: 'Dossier non trouvé'
            });
          }
          
          // Vérifier que le dossier est transmis au partenaire (pending ou accepted)
          const isTransmitted = dossier.transmittedTo && dossier.transmittedTo.some((trans) => {
            if (!trans || !trans.partenaire) return false;
            const transPartenaireId = trans.partenaire._id ? trans.partenaire._id.toString() : trans.partenaire.toString();
            // Accepter pending et accepted, mais pas refused
            return transPartenaireId === req.user.id.toString() && trans.status !== 'refused';
          });
          
          if (!isTransmitted) {
            return res.status(403).json({
              success: false,
              message: 'Ce dossier ne vous a pas été transmis ou a été refusé'
            });
          }
        }
        
        // Si un destinataire spécifique est fourni, vérifier qu'il s'agit d'un admin
        if (destinataire) {
          let destinataireId;
          try {
            if (typeof destinataire === 'string') {
              if (!mongoose.Types.ObjectId.isValid(destinataire)) {
                throw new Error(`ID de destinataire invalide: ${destinataire}`);
              }
              destinataireId = new mongoose.Types.ObjectId(destinataire);
            } else {
              destinataireId = destinataire;
            }
            
            const destinataireUser = await User.findOne({
              _id: destinataireId,
              isActive: { $ne: false }
            });
            
            if (!destinataireUser) {
              return res.status(400).json({
                success: false,
                message: 'Destinataire non trouvé ou inactif'
              });
            }
            
            // Vérifier que le destinataire est un admin
            if (destinataireUser.role !== 'admin' && destinataireUser.role !== 'superadmin') {
              return res.status(403).json({
                success: false,
                message: 'Vous ne pouvez envoyer des messages qu\'aux administrateurs'
              });
            }
            
            destinatairesIds = [destinataireId];
            typeMessage = 'professional_to_admin';
          } catch (idError) {
            console.error('❌ Erreur lors de la conversion de l\'ID destinataire:', idError);
            // En cas d'erreur, envoyer à tous les admins
            const admins = await User.find({
              role: { $in: ['admin', 'superadmin'] },
              isActive: { $ne: false }
            });
            destinatairesIds = admins.map(admin => admin._id);
            typeMessage = 'user_to_admins';
          }
        } else {
          // Pas de destinataire spécifique, envoyer à tous les administrateurs
          const admins = await User.find({
            role: { $in: ['admin', 'superadmin'] },
            isActive: { $ne: false }
          });
          
          if (admins.length === 0) {
            return res.status(400).json({
              success: false,
              message: 'Aucun administrateur disponible'
            });
          }
          
          destinatairesIds = admins.map(admin => admin._id);
          typeMessage = 'user_to_admins';
        }
        
        console.log(`✅ Message partenaire adressé à ${destinatairesIds.length} administrateur(s)`);
      } else {
        // CAS 3: Autres rôles → Uniquement les administrateurs
        console.log(`👤 Message d'un utilisateur (${userRole}) → Tous les administrateurs`);
        
        // Si un destinataire est fourni, vérifier qu'il s'agit d'un admin
        if (destinataire) {
          let destinataireId;
          try {
            if (typeof destinataire === 'string') {
              if (!mongoose.Types.ObjectId.isValid(destinataire)) {
                throw new Error(`ID de destinataire invalide: ${destinataire}`);
              }
              destinataireId = new mongoose.Types.ObjectId(destinataire);
            } else {
              destinataireId = destinataire;
            }

            const destinataireUser = await User.findOne({
              _id: destinataireId,
              isActive: { $ne: false }
            });

            if (!destinataireUser) {
              return res.status(400).json({
                success: false,
                message: 'Destinataire non trouvé ou inactif'
              });
            }

            // Vérifier que le destinataire est un admin ou un autre professionnel
            if (destinataireUser.role === 'client') {
              return res.status(403).json({
                success: false,
                message: 'Vous ne pouvez pas envoyer de message directement à un client. Toute communication doit passer par l\'administrateur.'
              });
            }

            if (destinataireUser.role === 'admin' || destinataireUser.role === 'superadmin') {
              destinatairesIds = [destinataireId];
              typeMessage = 'professional_to_admin';
            } else {
              // Par défaut, envoyer à tous les admins
              const admins = await User.find({
                role: { $in: ['admin', 'superadmin'] },
                isActive: { $ne: false }
              });
              destinatairesIds = admins.map(admin => admin._id);
              typeMessage = 'professional_to_admin';
            }
          } catch (idError) {
            console.error('❌ Erreur lors de la conversion de l\'ID destinataire:', idError);
            // En cas d'erreur, envoyer à tous les admins
            const admins = await User.find({
              role: { $in: ['admin', 'superadmin'] },
              isActive: { $ne: false }
            });
            destinatairesIds = admins.map(admin => admin._id);
            typeMessage = 'user_to_admins';
          }
        } else {
          // Pas de destinataire spécifique, envoyer à tous les admins
          const admins = await User.find({
            role: { $in: ['admin', 'superadmin'] },
            isActive: { $ne: false }
          });

          if (admins.length === 0) {
            return res.status(400).json({
              success: false,
              message: 'Aucun administrateur disponible'
            });
          }

          destinatairesIds = admins.map(admin => admin._id);
          typeMessage = 'user_to_admins';
        }

        console.log(`✅ Message adressé à ${destinatairesIds.length} destinataire(s)`);
      }

      // Traiter les pièces jointes
      const piecesJointes = [];
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          piecesJointes.push({
            filename: file.filename,
            originalName: file.originalname,
            path: file.path,
            size: file.size,
            mimetype: file.mimetype,
            uploadedAt: new Date()
          });
        });
      }

      // Créer le message
      console.log('📝 Création du message...');
      const messageData = {
        expediteur: userIdObj,
        destinataires: destinatairesIds,
        sujet: sujet.trim(),
        contenu: contenu.trim(),
        typeMessage: typeMessage,
        // dossierId sera fixé plus bas : soit celui fourni, soit hérité du parent
      };
      
      // Ajouter le message parent si c'est une réponse
      if (messageParent && mongoose.Types.ObjectId.isValid(messageParent)) {
        // Vérifier que le message parent existe
        const parentMessage = await MessageInterne.findById(messageParent);
        if (parentMessage) {
          messageData.messageParent = new mongoose.Types.ObjectId(messageParent);
          // Hériter du threadId du parent si disponible
          threadId = parentMessage.threadId || parentMessage._id.toString();
          // Hériter du dossier si non fourni (pour compatibilité et éviter de bloquer l'envoi)
          if (!messageData.dossierId && parentMessage.dossierId) {
            messageData.dossierId = parentMessage.dossierId;
          }
          console.log('📎 Message parent trouvé:', messageParent, 'threadId:', threadId, 'dossierId hérité:', messageData.dossierId?.toString());
        } else {
          console.warn('⚠️ Message parent non trouvé:', messageParent);
        }
      }

      // Si aucun dossierId n'a encore été défini, utiliser celui fourni dans le body si présent
      if (!messageData.dossierId && dossierId && mongoose.Types.ObjectId.isValid(dossierId)) {
        messageData.dossierId = new mongoose.Types.ObjectId(dossierId);
      }

      // En dernier recours, si aucun dossierId disponible, ne pas bloquer l'envoi
      // (mais consigner un avertissement pour suivi)
      if (!messageData.dossierId) {
        console.warn('⚠️ Aucun dossierId fourni ou hérité pour ce message. Le message sera créé sans dossier lié.');
      }

      // Générer un threadId si nécessaire (nouveau fil)
      if (!threadId) {
        threadId = new mongoose.Types.ObjectId().toString();
      }
      messageData.threadId = threadId;
      
      // Ajouter la copie si elle existe
      if (copieIds.length > 0) {
        messageData.copie = copieIds;
      }
      
      // Ajouter les pièces jointes seulement si elles existent
      if (piecesJointes.length > 0) {
        messageData.piecesJointes = piecesJointes;
      }
      
      console.log('📝 Données du message:', {
        expediteur: messageData.expediteur,
        destinataires: messageData.destinataires.map(d => d.toString()),
        copie: messageData.copie ? messageData.copie.map(c => c.toString()) : [],
        typeMessage: messageData.typeMessage,
        sujet: messageData.sujet,
        contenuLength: messageData.contenu.length,
        piecesJointesCount: piecesJointes.length
      });
      
      const nouveauMessage = await MessageInterne.create(messageData);
      console.log('✅ Message créé avec succès:', nouveauMessage._id);

      // Populate pour la réponse
      await nouveauMessage.populate('expediteur', 'firstName lastName email role');
      await nouveauMessage.populate('destinataires', 'firstName lastName email role');

      // Créer des notifications selon le type de message
      console.log('📧 Création des notifications...');
      const expediteurName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;

      if (typeMessage === 'user_to_admins') {
        // Notification pour tous les administrateurs
        for (const adminId of destinatairesIds) {
          try {
            await Notification.create({
              user: adminId.toString(),
              type: 'message_received',
              titre: 'Nouveau message utilisateur',
              message: `Un utilisateur vous a envoyé un message : "${sujet}"`,
              lien: `/admin/messages/${nouveauMessage._id}`,
              metadata: {
                messageId: nouveauMessage._id.toString(),
                expediteurId: userIdObj.toString(),
                typeMessage: 'user_to_admins'
              }
            });
            console.log(`✅ Notification créée pour admin: ${adminId.toString()}`);
          } catch (notifError) {
            console.error('❌ Erreur lors de la création de la notification:', notifError);
          }
        }
      } else if (typeMessage === 'admin_to_user' || typeMessage === 'admin_to_admin' || typeMessage === 'professional_to_admin') {
        // Notification pour le destinataire principal
        const destinatairePrincipal = await User.findById(destinatairesIds[0]);
        
        if (destinatairePrincipal) {
          try {
            await Notification.create({
              user: destinatairesIds[0].toString(),
              type: 'message_received',
              titre: 'Nouveau message',
              message: `${expediteurName} vous a envoyé un message : "${sujet}"`,
              lien: destinatairePrincipal.role === 'client' 
                ? `/client/messages/${nouveauMessage._id}` 
                : `/admin/messages/${nouveauMessage._id}`,
              metadata: {
                messageId: nouveauMessage._id.toString(),
                expediteurId: userIdObj.toString(),
                typeMessage: typeMessage
              }
            });
            console.log(`✅ Notification créée pour destinataire principal: ${destinatairesIds[0].toString()}`);

            // Envoyer un SMS si le destinataire est un utilisateur (client)
            if (typeMessage === 'admin_to_user' && destinatairePrincipal.phone) {
              try {
                const formattedPhone = formatPhoneNumber(destinatairePrincipal.phone);
                if (formattedPhone) {
                  await sendNotificationSMS(formattedPhone, 'message_received', {
                    senderName: expediteurName,
                    messageId: nouveauMessage._id.toString()
                  }, {
                    userId: destinatairesIds[0].toString(),
                    context: 'message',
                    contextId: nouveauMessage._id.toString()
                  });
                  console.log(`✅ SMS envoyé à ${formattedPhone}`);
                }
              } catch (smsError) {
                console.error('⚠️ Erreur lors de l\'envoi du SMS:', smsError);
              }
            }
          } catch (notifError) {
            console.error('❌ Erreur lors de la création de la notification:', notifError);
          }
        }

        // Notifications pour les destinataires en copie
        for (const copieId of copieIds) {
          try {
            const copieUser = await User.findById(copieId);
            if (copieUser) {
              await Notification.create({
                user: copieId.toString(),
                type: 'message_received',
                titre: 'Message en copie',
                message: `${expediteurName} vous a mis en copie d'un message : "${sujet}"`,
                lien: copieUser.role === 'client' 
                  ? `/client/messages/${nouveauMessage._id}` 
                  : `/admin/messages/${nouveauMessage._id}`,
                metadata: {
                  messageId: nouveauMessage._id.toString(),
                  expediteurId: userIdObj.toString(),
                  typeMessage: typeMessage,
                  isCopie: true
                }
              });
              console.log(`✅ Notification créée pour copie: ${copieId.toString()}`);
            }
          } catch (notifError) {
            console.error('❌ Erreur lors de la création de la notification copie:', notifError);
          }
        }

        // Notification pour tous les autres administrateurs (sauf l'expéditeur)
        try {
          const autresAdmins = await User.find({
            role: { $in: ['admin', 'superadmin'] },
            _id: { $ne: userIdObj },
            isActive: { $ne: false }
          });

          const destinataireInfo = await User.findById(destinatairesIds[0]);
          const destinataireLabel = destinataireInfo 
            ? `${destinataireInfo.firstName} ${destinataireInfo.lastName}`.trim() || destinataireInfo.email
            : 'Destinataire inconnu';

          for (const admin of autresAdmins) {
            // Ne pas notifier si l'admin est déjà destinataire ou en copie
            if (destinatairesIds.some(id => id.toString() === admin._id.toString()) ||
                copieIds.some(id => id.toString() === admin._id.toString())) {
              continue;
            }

            await Notification.create({
              user: admin._id.toString(),
              type: 'message_sent',
              titre: 'Message envoyé par un administrateur',
              message: `${expediteurName} a envoyé un message à ${destinataireLabel} : "${sujet}"`,
              lien: `/admin/messages/${nouveauMessage._id}`,
              metadata: {
                messageId: nouveauMessage._id.toString(),
                expediteurId: userIdObj.toString(),
                destinataireId: destinatairesIds[0].toString(),
                typeMessage: typeMessage
              }
            });
            console.log(`✅ Notification créée pour admin observateur: ${admin._id.toString()}`);
          }
        } catch (notifError) {
          console.error('❌ Erreur lors de la création des notifications pour les autres admins:', notifError);
        }
      }

      res.status(201).json({
        success: true,
        message: 'Message envoyé avec succès',
        data: nouveauMessage
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi du message:', error);
      console.error('❌ Stack trace:', error.stack);
      console.error('❌ Détails de l\'erreur:', {
        name: error.name,
        message: error.message,
        code: error.code,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue
      });
      
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
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        details: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          code: error.code,
          keyPattern: error.keyPattern,
          keyValue: error.keyValue
        } : undefined
      });
    }
  }
);

// IMPORTANT: Les routes batch doivent être définies AVANT les routes paramétrées (/:id)
// pour éviter que Express ne les intercepte avec le paramètre :id

// @route   POST /api/messages/batch/read
// @desc    Marquer plusieurs messages comme lus
// @access  Private
router.post('/batch/read', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const userId = getEffectiveUserId(req);
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez fournir un tableau de IDs de messages'
      });
    }

    const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const messageIdsObj = messageIds.map(id => 
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    // Récupérer les messages où l'utilisateur est destinataire ou en copie
    const messages = await MessageInterne.find({
      _id: { $in: messageIdsObj },
      $or: [
        { destinataires: userIdObj },
        { copie: userIdObj }
      ]
    });

    let updatedCount = 0;
    for (const message of messages) {
      const dejaLu = message.lu.some(l => l.user && l.user.toString() === userIdObj.toString());
      if (!dejaLu) {
        message.lu.push({
          user: userIdObj,
          luAt: new Date()
        });
        await message.save();
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `${updatedCount} message(s) marqué(s) comme lu`,
      updatedCount
    });
  } catch (error) {
    console.error('Erreur lors du marquage batch des messages:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/messages/batch/unread
// @desc    Marquer plusieurs messages comme non lus
// @access  Private
router.post('/batch/unread', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const userId = getEffectiveUserId(req);
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez fournir un tableau de IDs de messages'
      });
    }

    const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const messageIdsObj = messageIds.map(id => 
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    // Récupérer les messages où l'utilisateur est destinataire ou en copie
    const messages = await MessageInterne.find({
      _id: { $in: messageIdsObj },
      $or: [
        { destinataires: userIdObj },
        { copie: userIdObj }
      ]
    });

    let updatedCount = 0;
    for (const message of messages) {
      const wasRead = message.lu.some(l => l.user && l.user.toString() === userIdObj.toString());
      if (wasRead) {
        message.lu = message.lu.filter(l => 
          l.user && l.user.toString() !== userIdObj.toString()
        );
        await message.save();
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `${updatedCount} message(s) marqué(s) comme non lu`,
      updatedCount
    });
  } catch (error) {
    console.error('Erreur lors du marquage batch des messages comme non lus:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/messages/batch/delete
// @desc    Supprimer plusieurs messages
// @access  Private
router.post('/batch/delete', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const userId = getEffectiveUserId(req);
    const effectiveUser = getEffectiveUser(req);
    const userRole = effectiveUser?.role || req.user.role;
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez fournir un tableau de IDs de messages'
      });
    }

    const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const messageIdsObj = messageIds.map(id => 
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    // Les admins peuvent supprimer n'importe quel message, les autres seulement ceux qu'ils ont envoyés
    let query;
    if (userRole === 'admin' || userRole === 'superadmin') {
      query = { _id: { $in: messageIdsObj } };
    } else {
      query = {
        _id: { $in: messageIdsObj },
        expediteur: userIdObj
      };
    }

    const messages = await MessageInterne.find(query);

    // Supprimer les fichiers associés
    for (const message of messages) {
      if (message.piecesJointes && message.piecesJointes.length > 0) {
        message.piecesJointes.forEach((pieceJointe) => {
          if (fs.existsSync(pieceJointe.path)) {
            try {
              fs.unlinkSync(pieceJointe.path);
            } catch (unlinkError) {
              console.error('Erreur lors de la suppression du fichier:', unlinkError);
            }
          }
        });
      }
    }

    const result = await MessageInterne.deleteMany(query);

    res.json({
      success: true,
      message: `${result.deletedCount} message(s) supprimé(s)`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Erreur lors de la suppression batch des messages:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/messages/thread/:threadId
// @desc    Récupérer tous les messages d'un thread spécifique
// @access  Private
router.get('/thread/:threadId', async (req, res) => {
  try {
    const userId = getEffectiveUserId(req);
    const threadId = req.params.threadId;

    // Récupérer tous les messages du thread
    const messages = await MessageInterne.find({
      threadId: threadId,
      $or: [
        { expediteur: userId },
        { destinataires: userId },
        { copie: userId }
      ],
      'archive.user': { $ne: userId }
    })
      .populate('expediteur', 'firstName lastName email role')
      .populate('destinataires', 'firstName lastName email role')
      .populate('copie', 'firstName lastName email role')
      .populate('dossierId', 'titre numero statut')
      .populate('messageParent', 'sujet expediteur')
      .sort({ createdAt: 1 }); // Trier par date croissante (ordre chronologique)

    if (!messages || messages.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Thread non trouvé'
      });
    }

    // Marquer tous les messages non lus comme lus
    for (const message of messages) {
      const isRecipient = message.destinataires.some((d) => d._id.toString() === userId.toString()) ||
                          (message.copie && message.copie.some((c) => c._id.toString() === userId.toString()));
      
      if (isRecipient) {
        const dejaLu = message.lu?.some((l) => 
          (l.user?._id?.toString() || l.user?.toString()) === userId.toString()
        );
        
        if (!dejaLu) {
          if (!message.lu) message.lu = [];
          message.lu.push({
            user: userId,
            luAt: new Date()
          });
          await message.save();
        }
      }
    }

    const rootMessage = messages.find(m => !m.messageParent) || messages[0];

    res.json({
      success: true,
      threadId: threadId,
      root: rootMessage,
      messages: messages,
      messageCount: messages.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du thread:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/messages/:id
// @desc    Récupérer un message spécifique et son thread complet
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;

    const message = await MessageInterne.findOne({
      _id: messageId,
      $or: [
        { expediteur: userId },
        { destinataires: userId },
        { copie: userId }
      ],
      'archive.user': { $ne: userId }
    })
      .populate('expediteur', 'firstName lastName email role')
      .populate('destinataires', 'firstName lastName email role')
      .populate('copie', 'firstName lastName email role')
      .populate('dossierId', 'titre numero statut');

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }

    // Récupérer tous les messages du thread pour affichage complet
    const threadId = message.threadId || message._id.toString();
    const threadMessages = await MessageInterne.find({
      threadId: threadId,
      $or: [
        { expediteur: userId },
        { destinataires: userId },
        { copie: userId }
      ],
      'archive.user': { $ne: userId }
    })
      .populate('expediteur', 'firstName lastName email role')
      .populate('destinataires', 'firstName lastName email role')
      .populate('copie', 'firstName lastName email role')
      .populate('dossierId', 'titre numero statut')
      .populate('messageParent', 'sujet expediteur')
      .sort({ createdAt: 1 }); // Trier par date croissante (ordre chronologique)

    // Marquer tous les messages comme lus si l'utilisateur est destinataire
    for (const msg of threadMessages) {
      const isRecipient = msg.destinataires.some((d) => d._id.toString() === userId.toString()) ||
                          (msg.copie && msg.copie.some((c) => c._id.toString() === userId.toString()));
      
      if (isRecipient) {
        const dejaLu = msg.lu?.some((l) => 
          (l.user?._id?.toString() || l.user?.toString()) === userId.toString()
        );
        
        if (!dejaLu) {
          if (!msg.lu) msg.lu = [];
          msg.lu.push({
            user: userId,
            luAt: new Date()
          });
          await msg.save();
        }
      }
    }

    const rootMessage = threadMessages.find(m => !m.messageParent) || threadMessages[0];

    res.json({
      success: true,
      message: message,
      threadId: threadId,
      threadMessages: threadMessages,
      root: rootMessage,
      messageCount: threadMessages.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du message:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   PUT /api/messages/:id/read
// @desc    Marquer un message comme lu
// @access  Private
router.put('/:id/read', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const userId = req.user.id;
    const effectiveUser = getEffectiveUser(req);
    const userRole = effectiveUser?.role || req.user.role;
    const messageId = req.params.id;

    const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    // Récupérer le message (peut être destinataire principal ou en copie)
    const message = await MessageInterne.findOne({
      _id: messageId,
      $or: [
        { destinataires: userIdObj },
        { copie: userIdObj }
      ]
    })
      .populate('expediteur', 'firstName lastName email role')
      .populate('destinataires', 'firstName lastName email role');

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }

    const dejaLu = message.lu.some(l => l.user && l.user.toString() === userIdObj.toString());
    
    if (!dejaLu) {
      message.lu.push({
        user: userIdObj,
        luAt: new Date()
      });
      await message.save();

      // Créer une notification pour l'expéditeur et les autres destinataires
      try {
        const lecteur = effectiveUser || req.user;
        const lecteurName = `${lecteur.firstName || ''} ${lecteur.lastName || ''}`.trim() || lecteur.email;
        const lecteurRole = lecteur.role || userRole;
        
        const expediteurUser = message.expediteur;
        const expediteurId = expediteurUser?._id || expediteurUser?.id || expediteurUser;
        const expediteurName = expediteurUser 
          ? `${expediteurUser.firstName || ''} ${expediteurUser.lastName || ''}`.trim() || expediteurUser.email
          : 'Utilisateur inconnu';

        // Notifier l'expéditeur si ce n'est pas lui qui lit
        if (expediteurId && expediteurId.toString() !== userIdObj.toString()) {
          await Notification.create({
            user: expediteurId.toString(),
            type: 'message_read',
            titre: 'Message lu',
            message: `Votre message "${message.sujet}" a été lu par ${lecteurName}`,
            lien: lecteurRole === 'admin' || lecteurRole === 'superadmin' 
              ? `/admin/messages/${messageId}` 
              : `/client/messages/${messageId}`,
            metadata: {
              messageId: messageId,
              luParId: userIdObj.toString(),
              luParName: lecteurName,
              luParRole: lecteurRole
            }
          });
          console.log(`✅ Notification de lecture envoyée à l'expéditeur: ${expediteurId.toString()}`);
        }

        // Si c'est un message d'utilisateur vers admins et qu'un admin le lit
        // Notifier tous les autres admins
        if (message.typeMessage === 'user_to_admins' && (lecteurRole === 'admin' || lecteurRole === 'superadmin')) {
          const autresAdmins = await User.find({
            role: { $in: ['admin', 'superadmin'] },
            _id: { $ne: userIdObj },
            isActive: { $ne: false }
          });

          for (const admin of autresAdmins) {
            const adminALu = message.lu.some(l => l.user && l.user.toString() === admin._id.toString());
            if (!adminALu) {
              await Notification.create({
                user: admin._id.toString(),
                type: 'message_read',
                titre: 'Message lu par un administrateur',
                message: `Le message de ${expediteurName} a été lu par ${lecteurName}`,
                lien: `/admin/messages/${messageId}`,
                metadata: {
                  messageId: messageId,
                  expediteurId: expediteurId.toString(),
                  luParId: userIdObj.toString(),
                  luParName: lecteurName
                }
              });
              console.log(`✅ Notification de lecture envoyée à admin: ${admin._id.toString()}`);
            }
          }
        }

        // Si c'est un admin qui envoie à un client et que le client lit
        // Notifier l'admin
        if (message.typeMessage === 'admin_to_user' && lecteurRole === 'client') {
          if (expediteurId && expediteurId.toString() !== userIdObj.toString()) {
            // La notification à l'expéditeur a déjà été créée ci-dessus
            console.log(`✅ Notification de lecture envoyée à l'admin expéditeur: ${expediteurId.toString()}`);
          }
        }
      } catch (notifError) {
        console.error('❌ Erreur lors de la création des notifications de lecture:', notifError);
        // Ne pas bloquer le marquage comme lu si la notification échoue
      }
    }

    const updatedMessage = await MessageInterne.findById(messageId)
      .populate('expediteur', 'firstName lastName email role')
      .populate('destinataires', 'firstName lastName email role');

    res.json({
      success: true,
      message: 'Message marqué comme lu',
      data: updatedMessage
    });
  } catch (error) {
    console.error('Erreur lors du marquage du message:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   PUT /api/messages/:id/unread
// @desc    Marquer un message comme non lu (retirer de la liste des lus)
// @access  Private
router.put('/:id/unread', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const userId = getEffectiveUserId(req);
    const messageId = req.params.id;

    const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    // Récupérer le message
    const message = await MessageInterne.findOne({
      _id: messageId,
      $or: [
        { destinataires: userIdObj },
        { copie: userIdObj }
      ]
    })
      .populate('expediteur', 'firstName lastName email role')
      .populate('destinataires', 'firstName lastName email role');

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }

    // Retirer l'utilisateur de la liste des lus
    message.lu = message.lu.filter(l => 
      l.user && l.user.toString() !== userIdObj.toString()
    );
    await message.save();

    res.json({
      success: true,
      message: 'Message marqué comme non lu',
      message: message
    });
  } catch (error) {
    console.error('Erreur lors du marquage du message comme non lu:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   PUT /api/messages/:id/archive
// @desc    Archiver un message
// @access  Private
router.put('/:id/archive', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;

    const message = await MessageInterne.findOne({
      _id: messageId,
      $or: [
        { expediteur: userId },
        { destinataires: userId }
      ]
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }

    const dejaArchive = message.archive.some(a => a.user.toString() === userId.toString());
    if (!dejaArchive) {
      message.archive.push({
        user: userId,
        archiveAt: new Date()
      });
      await message.save();
    }

    res.json({
      success: true,
      message: 'Message archivé'
    });
  } catch (error) {
    console.error('Erreur lors de l\'archivage du message:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   DELETE /api/messages/:id
// @desc    Supprimer un message (l'expéditeur peut supprimer, les admins peuvent supprimer n'importe quel message)
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;

    const effectiveUser = getEffectiveUser(req);
    const userRole = effectiveUser?.role || req.user.role;
    
    // Les admins peuvent supprimer n'importe quel message, les autres seulement ceux qu'ils ont envoyés
    let query;
    if (userRole === 'admin' || userRole === 'superadmin') {
      query = { _id: messageId };
    } else {
      query = { _id: messageId, expediteur: userId };
    }

    const message = await MessageInterne.findOne(query);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé ou vous n\'avez pas l\'autorisation de le supprimer'
      });
    }

    // Supprimer les fichiers associés
    if (message.piecesJointes && message.piecesJointes.length > 0) {
      message.piecesJointes.forEach((pieceJointe) => {
        if (fs.existsSync(pieceJointe.path)) {
          try {
            fs.unlinkSync(pieceJointe.path);
          } catch (unlinkError) {
            console.error('Erreur lors de la suppression du fichier:', unlinkError);
          }
        }
      });
    }

    await MessageInterne.findByIdAndDelete(messageId);

    res.json({
      success: true,
      message: 'Message supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du message:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/messages/:id/download/:fileIndex
// @desc    Télécharger une pièce jointe
// @access  Private
router.get('/:id/download/:fileIndex', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;
    const fileIndex = parseInt(req.params.fileIndex);

    const message = await MessageInterne.findOne({
      _id: messageId,
      $or: [
        { expediteur: userId },
        { destinataires: userId }
      ]
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }

    if (!message.piecesJointes || message.piecesJointes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucune pièce jointe trouvée'
      });
    }

    if (fileIndex < 0 || fileIndex >= message.piecesJointes.length) {
      return res.status(400).json({
        success: false,
        message: 'Index de fichier invalide'
      });
    }

    const pieceJointe = message.piecesJointes[fileIndex];
    const filePath = pieceJointe.path;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Fichier non trouvé'
      });
    }

    res.download(filePath, pieceJointe.originalName, (err) => {
      if (err) {
        console.error('Erreur lors du téléchargement:', err);
        res.status(500).json({
          success: false,
          message: 'Erreur lors du téléchargement'
        });
      }
    });
  } catch (error) {
    console.error('Erreur lors du téléchargement de la pièce jointe:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;


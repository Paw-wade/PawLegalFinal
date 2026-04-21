const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Dossier = require('../models/Dossier');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper function pour créer une notification
function sanitizeDossierForPartenaire(dossier) {
  const o = dossier && typeof dossier.toObject === 'function' ? dossier.toObject() : { ...dossier };
  delete o.formuleTarifaire;
  delete o.formuleTarifaireChoisieAt;
  delete o.formuleTarifaireReminderSent;
  delete o.montantTarificationFixe;
  delete o.montantTarificationFixeAt;
  delete o.montantTarificationFixeBy;
  delete o.tarificationNotificationSentAt;
  delete o.paiementTarificationEffectue;
  delete o.paiementTarificationEffectueAt;
  delete o.paiementTarificationEffectueBy;
  delete o.fraisExoneres;
  delete o.fraisExoneresAt;
  delete o.fraisExoneresBy;
  delete o.fraisExoneresMotif;
  return o;
}

const createNotification = async (userId, type, titre, message, lien = null, metadata = {}) => {
  try {
    if (!userId) {
      console.warn('⚠️ Pas de notification créée : userId manquant');
      return null; // Pas de notification si pas d'utilisateur
    }
    
    console.log('📧 Création de notification:', { userId, type, titre, message: message ? message.substring(0, 50) + '...' : 'message vide' });
    
    const notification = await Notification.create({
      user: userId,
      type,
      titre,
      message,
      lien,
      metadata
    });
    
    console.log('✅ Notification créée avec succès:', notification._id);
    return notification;
  } catch (error) {
    console.error('❌ Erreur lors de la création de la notification:', error);
    console.error('❌ Détails:', { userId, type, titre, error: error.message, stack: error.stack });
    // Ne pas bloquer l'action principale si la notification échoue
    // Retourner null pour indiquer l'échec sans bloquer
    return null;
  }
};

// Helper function pour notifier toutes les parties lors d'une modification de dossier
const notifyDossierModification = async (dossier, modifier, changes = {}) => {
  try {
    if (changes.skipAllPingAndSms === true) {
      console.log('⏭️ notifyDossierModification ignorée (montant tarification — aucun ping / SMS).');
      return;
    }
    const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');
    const modifierName = `${modifier.firstName} ${modifier.lastName}`;
    const modifierRole = modifier.role;
    const dossierTitle = dossier.titre || dossier.numero || 'Votre dossier';
    
    // Liste des utilisateurs à notifier
    const usersToNotify = [];
    
    // 1. Le client (propriétaire du dossier)
    if (dossier.user) {
      const clientId = dossier.user._id ? dossier.user._id.toString() : dossier.user.toString();
      usersToNotify.push({
        userId: clientId,
        user: dossier.user,
        role: 'client'
      });
    }
    
    
    // 4. L'admin assigné (si différent du modificateur)
    if (dossier.assignedTo) {
      const assignedId = dossier.assignedTo._id ? dossier.assignedTo._id.toString() : dossier.assignedTo.toString();
      const modifierId = modifier._id ? modifier._id.toString() : modifier.id.toString();
      if (assignedId !== modifierId) {
        if (!usersToNotify.find(u => u.userId === assignedId)) {
          const assignedUser = await User.findById(assignedId);
          if (assignedUser) {
            usersToNotify.push({
              userId: assignedId,
              user: assignedUser,
              role: 'admin',
              isAssigned: true
            });
          }
        }
      }
    }
    
    // Créer les notifications pour tous les utilisateurs concernés
    let qualityLabel = 'Administrateur';
    
    const notificationMessage = changes.newStatut && changes.oldStatut !== changes.newStatut
      ? `Le dossier "${dossierTitle}" a été modifié par ${modifierName} (${qualityLabel}). Statut: ${changes.newStatut}`
      : `Le dossier "${dossierTitle}" a été modifié par ${modifierName} (${qualityLabel})`;
    
    for (const userInfo of usersToNotify) {
      const skipClientPing =
        (changes.skipClientEtapesOnlyNotify === true && userInfo.role === 'client') ||
        (changes.skipClientTarificationOnlyNotify === true && userInfo.role === 'client');
      const skipClientSmsBecauseStandby =
        userInfo.role === 'client' && !!dossier.isStandby;

      // Notification dashboard
      const lien = userInfo.role === 'client' 
        ? `/client/dossiers/${dossier._id}`
        : `/admin/dossiers/${dossier._id}`;
      
      if (!skipClientPing) {
        await createNotification(
          userInfo.userId,
          'dossier_updated',
          'Dossier modifié',
          notificationMessage,
          lien,
          {
            dossierId: dossier._id.toString(),
            dossierTitre: dossierTitle,
            modifiedBy: modifier._id ? modifier._id.toString() : modifier.id.toString(),
            modifierName: modifierName,
            modifierRole: modifierRole,
            changes: changes
          }
        );
      }
      
      // SMS si téléphone disponible (ex. renommage du dossier seul → pas de SMS)
      if (!skipClientPing && !skipClientSmsBecauseStandby && !changes.skipSms && userInfo.user && userInfo.user.phone) {
        try {
          const formattedPhone = formatPhoneNumber(userInfo.user.phone);
          if (formattedPhone) {
            await sendNotificationSMS(formattedPhone, 'dossier_updated', {
              dossierTitle: dossierTitle,
              statut: changes.newStatut || dossier.statut,
              modifierName: modifierName
            }, {
              userId: userInfo.userId,
              context: 'dossier',
              contextId: dossier._id.toString()
            });
          }
        } catch (smsError) {
          console.error(`⚠️ Erreur lors de l'envoi du SMS à ${userInfo.user.email}:`, smsError);
        }
      }
    }
    
    console.log(`✅ Notifications envoyées à ${usersToNotify.length} utilisateur(s) pour la modification du dossier ${dossier._id}`);
  } catch (error) {
    console.error('❌ Erreur lors de la notification de modification:', error);
    // Ne pas bloquer la modification si la notification échoue
  }
};

// @route   POST /api/user/dossiers
// @desc    Créer un nouveau dossier (Public pour visiteurs, Private pour utilisateurs connectés)
// @access  Public/Private
router.post(
  '/',
  [
    body('titre').optional().trim(),
    body('categorie').optional().isIn(['sejour_titres', 'contentieux_administratif', 'asile', 'regroupement_familial', 'nationalite_francaise', 'eloignement_urgence', 'autre']),
    body('statut').optional().isString().trim().isLength({ max: 200 }),
    body('priorite').optional().isIn(['basse', 'normale', 'haute', 'urgente'])
  ],
  // Middleware d'authentification optionnel
  async (req, res, next) => {
    // Si un token est fourni, vérifier l'authentification
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      return protect(req, res, next);
    }
    // Sinon, continuer sans authentification (visiteur)
    next();
  },
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
        userId: bodyUserId,
        clientNom,
        clientPrenom,
        clientEmail,
        clientTelephone,
        titre,
        description,
        categorie,
        type,
        statut,
        priorite,
        dateEcheance,
        notes,
        assignedTo,
        rendezVousId
      } = req.body;

      const normalizedTitre = [titre, req.body?.title, req.body?.nomDossier, req.body?.nom]
        .find((v) => typeof v === 'string' && v.trim().length > 0)?.trim() || '';

      // Création depuis l'espace admin: le nom du dossier est obligatoire.
      if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin') && !normalizedTitre) {
        return res.status(400).json({
          success: false,
          message: 'Le nom du dossier est requis'
        });
      }

      // Vérifier si un utilisateur est spécifié (pour utilisateurs connectés)
      let user = null;
      let finalUserId = bodyUserId;
      
      // Si l'utilisateur est connecté mais n'a pas fourni d'ID, utiliser l'ID de l'utilisateur connecté
      if (!finalUserId && req.user && req.user.id) {
        finalUserId = req.user.id;
      }
      
      if (finalUserId) {
        user = await User.findById(finalUserId);
        if (!user) {
          return res.status(404).json({
            success: false,
            message: 'Utilisateur non trouvé'
          });
        }
      }

      // Tous les champs sont optionnels - pas de validation obligatoire pour les visiteurs

      // Vérifier si un membre de l'équipe est assigné (seulement pour les admins)
      let assignedUser = null;
      if (assignedTo) {
        // Seuls les admins peuvent assigner des dossiers
        if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
          return res.status(403).json({
            success: false,
            message: 'Seuls les administrateurs peuvent assigner des dossiers'
          });
        }
        assignedUser = await User.findById(assignedTo);
        if (!assignedUser) {
          return res.status(404).json({
            success: false,
            message: 'Membre de l\'équipe assigné non trouvé'
          });
        }
        // Vérifier que l'utilisateur assigné est un admin ou superadmin
        if (assignedUser.role !== 'admin' && assignedUser.role !== 'superadmin') {
          return res.status(400).json({
            success: false,
            message: 'Le dossier ne peut être assigné qu\'à un membre de l\'équipe (admin ou superadmin)'
          });
        }
      }

      const dossier = await Dossier.create({
        user: finalUserId || null,
        clientNom: finalUserId ? null : clientNom,
        clientPrenom: finalUserId ? null : clientPrenom,
        clientEmail: finalUserId ? user.email : clientEmail,
        clientTelephone: finalUserId ? user.phone : clientTelephone,
        titre: normalizedTitre,
        description: description || '',
        categorie: categorie || 'autre',
        type: type || '',
        statut: statut || 'recu',
        priorite: priorite || 'normale',
        dateEcheance: dateEcheance || null,
        notes: notes || '',
        createdBy: req.user ? req.user.id : null, // null si créé par un visiteur
        assignedTo: assignedTo || null,
        rendezVous: rendezVousId ? [rendezVousId] : []
      });

      // Si le dossier est créé depuis un rendez-vous, lier le rendez-vous au dossier
      if (rendezVousId) {
        try {
          const RendezVous = require('../models/RendezVous');
          const rendezVous = await RendezVous.findById(rendezVousId);
          
          if (rendezVous) {
            rendezVous.dossierId = dossier._id;
            await rendezVous.save();
            console.log(`✅ Rendez-vous ${rendezVousId} lié au dossier ${dossier._id}`);
          }
        } catch (linkError) {
          console.error('Erreur lors de la liaison du rendez-vous au dossier:', linkError);
          // Ne pas bloquer la création du dossier si la liaison échoue
        }
      }

      // Si le dossier est créé depuis un rendez-vous, notifier les admins et le client
      if (rendezVousId) {
        try {
          const RendezVous = require('../models/RendezVous');
          const rendezVous = await RendezVous.findById(rendezVousId);
          const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');
          
          if (rendezVous) {
            // Notifier le client (utilisateur connecté ou coordonnées du rendez-vous)
            if (finalUserId && user) {
              // Client connecté - notification et SMS
              try {
                await createNotification(
                  finalUserId,
                  'dossier_created',
                  'Nouveau dossier créé',
                  `Un nouveau dossier "${dossier.titre}" a été créé suite à votre rendez-vous du ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure}.`,
                  '/client/dossiers',
                  {
                    dossierId: dossier._id.toString(),
                    rendezVousId: rendezVousId.toString()
                  }
                );
                console.log(`✅ Notification créée pour le client: ${user.email}`);

                // Envoyer un SMS au client si le téléphone est disponible
                if (user.phone) {
                  try {
                    const formattedPhone = formatPhoneNumber(user.phone);
                    if (formattedPhone) {
                      await sendNotificationSMS(formattedPhone, 'dossier_created', {
                        dossierTitle: dossier.titre,
                        dossierId: dossier.numero || dossier._id.toString(),
                        appointmentDate: new Date(rendezVous.date).toLocaleDateString('fr-FR'),
                        appointmentTime: rendezVous.heure
                      }, {
                        userId: finalUserId.toString(),
                        context: 'dossier',
                        contextId: dossier._id.toString()
                      });
                      console.log(`✅ SMS envoyé au client: ${formattedPhone}`);
                    }
                  } catch (smsError) {
                    console.error('⚠️ Erreur lors de l\'envoi du SMS au client:', smsError);
                  }
                }
              } catch (clientNotifError) {
                console.error('Erreur lors de la création de la notification client:', clientNotifError);
              }
            } else if (clientEmail) {
              // Client non connecté - chercher par email ou créer une notification pour l'email
              try {
                const userByEmail = await User.findOne({ email: clientEmail.toLowerCase() });
                if (userByEmail) {
                  await createNotification(
                    userByEmail._id,
                    'dossier_created',
                    'Nouveau dossier créé',
                    `Un nouveau dossier "${dossier.titre}" a été créé suite à votre rendez-vous du ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure}.`,
                    '/client/dossiers',
                    {
                      dossierId: dossier._id.toString(),
                      rendezVousId: rendezVousId.toString()
                    }
                  );
                  console.log(`✅ Notification créée pour le client: ${clientEmail}`);

                  // Envoyer un SMS si le téléphone est disponible
                  if (userByEmail.phone) {
                    try {
                      const formattedPhone = formatPhoneNumber(userByEmail.phone);
                      if (formattedPhone) {
                        await sendNotificationSMS(formattedPhone, 'dossier_created', {
                          dossierTitle: dossier.titre,
                          dossierId: dossier.numero || dossier._id.toString(),
                          appointmentDate: new Date(rendezVous.date).toLocaleDateString('fr-FR'),
                          appointmentTime: rendezVous.heure
                        }, {
                          userId: userByEmail._id.toString(),
                          context: 'dossier',
                          contextId: dossier._id.toString()
                        });
                        console.log(`✅ SMS envoyé au client: ${formattedPhone}`);
                      }
                    } catch (smsError) {
                      console.error('⚠️ Erreur lors de l\'envoi du SMS au client:', smsError);
                    }
                  }
                } else if (clientTelephone) {
                  // Client non inscrit mais avec téléphone - envoyer SMS uniquement
                  try {
                    const formattedPhone = formatPhoneNumber(clientTelephone);
                    if (formattedPhone) {
                      await sendNotificationSMS(formattedPhone, 'dossier_created', {
                        dossierTitle: dossier.titre,
                        dossierId: dossier.numero || dossier._id.toString(),
                        appointmentDate: new Date(rendezVous.date).toLocaleDateString('fr-FR'),
                        appointmentTime: rendezVous.heure
                      }, {
                        context: 'dossier',
                        contextId: dossier._id.toString(),
                        clientEmail: clientEmail
                      });
                      console.log(`✅ SMS envoyé au client non inscrit: ${formattedPhone}`);
                    }
                  } catch (smsError) {
                    console.error('⚠️ Erreur lors de l\'envoi du SMS au client non inscrit:', smsError);
                  }
                }
              } catch (clientNotifError) {
                console.error('Erreur lors de la notification du client:', clientNotifError);
              }
            }

            // Notifier tous les admins actifs
            if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
              const admins = await User.find({ 
                role: { $in: ['admin', 'superadmin'] },
                isActive: true,
                _id: { $ne: req.user._id } // Exclure l'admin qui a créé le dossier
              });
              
              for (const admin of admins) {
                await createNotification(
                  admin._id,
                  'dossier_created',
                  'Nouveau dossier créé depuis un rendez-vous',
                  `Un nouveau dossier "${dossier.titre}" a été créé ${finalUserId && user ? `pour ${user.firstName} ${user.lastName}` : `pour ${clientNom} ${clientPrenom}`} suite au rendez-vous du ${new Date(rendezVous.date).toLocaleDateString('fr-FR')}.`,
                  '/admin/dossiers',
                  {
                    dossierId: dossier._id.toString(),
                    rendezVousId: rendezVousId.toString(),
                    userId: finalUserId ? finalUserId.toString() : null
                  }
                );
              }

              // SMS au superadmin principal (s'il a un téléphone)
              try {
                const superadmin = await User.findOne({ role: 'superadmin', isActive: true }).sort({ createdAt: 1 });
                if (superadmin && superadmin.phone) {
                  const superPhone = formatPhoneNumber(superadmin.phone);
                  if (superPhone) {
                    await sendNotificationSMS(
                      superPhone,
                      'dossier_created',
                      {
                        dossierTitle: dossier.titre || dossier.numero || 'Nouveau dossier',
                        dossierId: dossier.numero || dossier._id.toString(),
                      },
                      {
                        userId: superadmin._id.toString(),
                        context: 'dossier',
                        contextId: dossier._id.toString(),
                      }
                    );
                  }
                }
              } catch (smsAdminError) {
                console.error('⚠️ Erreur lors de l\'envoi du SMS au superadmin pour la création de dossier:', smsAdminError);
              }
            }
          }
        } catch (notifError) {
          console.error('Erreur lors de la création des notifications:', notifError);
          // Ne pas bloquer la création du dossier si la notification échoue
        }
      }

      // Logger l'action (si utilisateur connecté)
      if (req.user) {
        try {
          const Log = require('../models/Log');
          await Log.create({
            action: 'dossier_created',
            user: req.user.id,
            userEmail: req.user.email,
            targetUser: finalUserId || null,
            targetUserEmail: finalUserId ? user.email : clientEmail,
            description: `${req.user.email} a créé le dossier "${normalizedTitre || 'Sans titre'}" ${finalUserId ? `pour ${user.email}` : `pour ${clientNom} ${clientPrenom} (non inscrit)`}`,
            ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.get('user-agent'),
            metadata: {
              dossierId: dossier._id.toString(),
              titre: normalizedTitre,
              categorie: dossier.categorie,
              type: dossier.type,
              statut,
              rendezVousId: rendezVousId || null
            }
          });
        } catch (logError) {
          console.error('Erreur lors de l\'enregistrement du log:', logError);
        }
      }

      res.status(201).json({
        success: true,
        message: 'Dossier créé avec succès',
        dossier
      });
    } catch (error) {
      console.error('Erreur lors de la création du dossier:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// Toutes les autres routes nécessitent une authentification
router.use(protect);

// @route   GET /api/user/dossiers
// @desc    Récupérer tous les dossiers de l'utilisateur connecté (tous les rôles)
// @access  Private (tous les rôles authentifiés)
router.get('/', async (req, res) => {
  try {
    const targetUserId = req.user.id;
    const targetUserEmail = req.user.email;
    
    console.log('📁 Récupération des dossiers pour l\'utilisateur:', targetUserId, 'Email:', targetUserEmail, 'Rôle:', req.user.role);
    
    // Construire le filtre pour récupérer les dossiers de l'utilisateur
    const userRole = req.user.role;
    const userEmailLower = targetUserEmail ? targetUserEmail.toLowerCase() : '';
    
    let filter = {};
    
    if (userRole === 'partenaire') {
      // Les partenaires voient uniquement les dossiers qui leur sont transmis
      // Utiliser $elemMatch pour une recherche plus précise dans le tableau
      const mongoose = require('mongoose');
      const targetUserIdObj = mongoose.Types.ObjectId.isValid(targetUserId) 
        ? new mongoose.Types.ObjectId(targetUserId) 
        : targetUserId;
      
      console.log('🔍 Partenaire - targetUserId:', targetUserId, 'Type:', typeof targetUserId);
      filter = {
        'transmittedTo': {
          $elemMatch: {
            'partenaire': targetUserIdObj
          }
        }
      };
      console.log('🔍 Partenaire - Filtre avec $elemMatch:', JSON.stringify(filter));
    } else if (userRole === 'client') {
      // Clients voient leurs propres dossiers
      filter = {
        $or: [
          { user: targetUserId },
          { clientEmail: { $regex: new RegExp(`^${userEmailLower}$`, 'i') } } // Comparaison insensible à la casse
        ]
      };
    } else if (userRole === 'admin' || userRole === 'superadmin') {
      // Admins voient tous les dossiers (pas de filtre)
      filter = {};
    } else {
      // Autres rôles : dossiers assignés
      filter = {
        $or: [
          { user: targetUserId },
          { assignedTo: targetUserId }
        ]
      };
    }
    
    console.log('🔍 Filtre de recherche:', JSON.stringify(filter, null, 2));
    
    const dossiers = await Dossier.find(filter)
      .populate('user', 'firstName lastName email phone profilePhoto')
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email role')
      .populate('transmittedTo.partenaire', 'firstName lastName email partenaireInfo')
      .populate('transmittedTo.transmittedBy', 'firstName lastName email')
      .populate('documents')
      .populate('messages')
      .sort({ createdAt: -1 });
    
    console.log('✅ Dossiers trouvés:', dossiers.length, 'pour l\'utilisateur:', targetUserEmail);
    if (userRole === 'partenaire') {
      console.log('📋 Détails des dossiers trouvés pour le partenaire:');
      dossiers.forEach((d, idx) => {
        console.log(`  ${idx + 1}. Dossier ID: ${d._id}, Titre: ${d.titre || d.numero || 'Sans titre'}`);
        if (d.transmittedTo && d.transmittedTo.length > 0) {
          d.transmittedTo.forEach((trans, tIdx) => {
            const partenaireId = trans.partenaire?._id?.toString() || trans.partenaire?.toString() || trans.partenaire;
            console.log(`     Transmission ${tIdx + 1}: partenaire=${partenaireId}, status=${trans.status}, targetUserId=${targetUserId}`);
          });
        }
      });
    }

    const dossiersOut =
      userRole === 'partenaire' ? dossiers.map((d) => sanitizeDossierForPartenaire(d)) : dossiers;

    res.json({
      success: true,
      count: dossiersOut.length,
      dossiers: dossiersOut
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des dossiers:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/user/dossiers/admin
// @desc    Récupérer tous les dossiers (équipe cabinet)
// @access  Private — rôles admin / équipe
router.get(
  '/admin',
  authorize('admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'),
  async (req, res) => {
  try {
    const { statut, type, categorie, userId, search } = req.query;
    
    const filter = {};
    
    if (statut) {
      filter.statut = statut;
    }
    
    if (type) {
      filter.type = type;
    }
    
    if (categorie) {
      filter.categorie = categorie;
    }
    
    if (userId) {
      filter.user = userId;
    }
    
    if (search) {
      filter.$or = [
        { titre: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { clientNom: { $regex: search, $options: 'i' } },
        { clientPrenom: { $regex: search, $options: 'i' } },
        { clientEmail: { $regex: search, $options: 'i' } }
      ];
    }
    
    const dossiers = await Dossier.find(filter)
      .populate('user', 'firstName lastName email phone profilePhoto')
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email role')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: dossiers.length,
      dossiers
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des dossiers:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// Note : PATCH /api/user/dossiers/:id/formule-tarifaire est enregistré dans server.js (avant ce routeur)
// pour garantir la résolution de la route en toutes circonstances.

// @route   POST /api/user/dossiers
// @desc    Créer un nouveau dossier
// @access  Private
router.post(
  '/',
  [
    body('titre').optional().trim(),
    body('categorie').optional().isIn(['sejour_titres', 'contentieux_administratif', 'asile', 'regroupement_familial', 'nationalite_francaise', 'eloignement_urgence', 'autre']),
    body('statut').optional().isIn(['recu', 'accepte', 'refuse', 'annule', 'en_attente_onboarding', 'en_cours_instruction', 'pieces_manquantes', 'dossier_complet', 'depose', 'reception_confirmee', 'complement_demande', 'decision_defavorable', 'communication_motifs', 'recours_preparation', 'refere_mesures_utiles', 'refere_suspension_rep', 'gain_cause', 'rejet', 'decision_favorable', 'autre']),
    body('priorite').optional().isIn(['basse', 'normale', 'haute', 'urgente'])
  ],
  async (req, res) => {
    try {
      // Log du body reçu pour déboguer
      console.log('📥 POST /user/dossiers - Body reçu:', JSON.stringify(req.body, null, 2));
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('❌ Erreurs de validation:', JSON.stringify(errors.array(), null, 2));
        console.error('❌ Body reçu:', JSON.stringify(req.body, null, 2));
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const {
        userId,
        clientNom,
        clientPrenom,
        clientEmail,
        clientTelephone,
        titre,
        description,
        categorie,
        type,
        statut,
        priorite,
        dateEcheance,
        notes,
        assignedTo,
        rendezVousId
      } = req.body;

      const normalizedTitre = [titre, req.body?.title, req.body?.nomDossier, req.body?.nom]
        .find((v) => typeof v === 'string' && v.trim().length > 0)?.trim() || '';

      if (!normalizedTitre) {
        return res.status(400).json({
          success: false,
          message: 'Le nom du dossier est requis'
        });
      }

      // Vérifier si un utilisateur est spécifié (pour utilisateurs connectés)
      let user = null;
      let finalUserId = bodyUserId;
      if (finalUserId) {
        user = await User.findById(finalUserId);
        if (!user) {
          return res.status(404).json({
            success: false,
            message: 'Utilisateur non trouvé'
          });
        }
      }

      // Tous les champs sont optionnels - pas de validation obligatoire pour les visiteurs

      // Si l'utilisateur est connecté mais n'a pas fourni d'ID, utiliser l'ID de l'utilisateur connecté
      if (!finalUserId && req.user && req.user.id) {
        finalUserId = req.user.id;
        user = await User.findById(finalUserId);
      }

      // Vérifier si un membre de l'équipe est assigné
      let assignedUser = null;
      if (assignedTo) {
        assignedUser = await User.findById(assignedTo);
        if (!assignedUser) {
          return res.status(404).json({
            success: false,
            message: 'Membre de l\'équipe assigné non trouvé'
          });
        }
        // Vérifier que l'utilisateur assigné est un admin ou superadmin
        if (assignedUser.role !== 'admin' && assignedUser.role !== 'superadmin') {
          return res.status(400).json({
            success: false,
            message: 'Le dossier ne peut être assigné qu\'à un membre de l\'équipe (admin ou superadmin)'
          });
        }
      }

      const dossier = await Dossier.create({
        user: finalUserId || null,
        clientNom: finalUserId ? null : clientNom,
        clientPrenom: finalUserId ? null : clientPrenom,
        clientEmail: finalUserId ? user.email : clientEmail,
        clientTelephone: finalUserId ? user.phone : clientTelephone,
        titre: normalizedTitre,
        description: description || '',
        categorie: categorie || 'autre',
        type: type || '',
        statut: statut || 'recu',
        priorite: priorite || 'normale',
        dateEcheance: dateEcheance || null,
        notes: notes || '',
        createdBy: req.user.id,
        assignedTo: assignedTo || null,
        rendezVous: rendezVousId ? [rendezVousId] : []
      });

      // Logger l'action
      try {
        const Log = require('../models/Log');
        await Log.create({
          action: 'dossier_created',
          user: req.user.id,
          userEmail: req.user.email,
          targetUser: finalUserId || null,
          targetUserEmail: finalUserId ? user.email : clientEmail,
          description: `${req.user.email} a créé le dossier "${normalizedTitre || 'Sans titre'}" ${finalUserId ? `pour ${user.email}` : `pour ${clientNom} ${clientPrenom} (non inscrit)`}`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent'),
          metadata: {
            dossierId: dossier._id.toString(),
            titre: normalizedTitre,
            categorie: dossier.categorie,
            type: dossier.type,
            statut
          }
        });
      } catch (logError) {
        console.error('Erreur lors de l\'enregistrement du log:', logError);
      }

      const dossierPopulated = await Dossier.findById(dossier._id)
        .populate('user', 'firstName lastName email phone profilePhoto')
        .populate('createdBy', 'firstName lastName email');

      // Si le dossier a été créé par un client (pas un admin), notifier tous les admins
      // (robuste: si req.user n'est pas défini, mais qu'un userId client existe en entrée)
      const isClientCreator = (req.user && req.user.role === 'client') || (!req.user && user && user.role === 'client');
      if (isClientCreator) {
        try {
          const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');

          const clientId = req.user ? req.user.id : user._id.toString();
          const clientEmail = req.user ? req.user.email : user.email;
          const clientFirstName = req.user ? req.user.firstName : user.firstName;
          const clientLastName = req.user ? req.user.lastName : user.lastName;
          const clientDisplayName = `${clientFirstName} ${clientLastName}`.trim() || 'Client';

          // Trouver tous les admins et superadmins
          const admins = await User.find({
            role: { $in: ['admin', 'superadmin'] },
            isActive: true
          });

          // Créer une notification pour chaque admin
          for (const admin of admins) {
            await createNotification(
              admin._id.toString(),
              'dossier_created',
              'Nouveau dossier créé par un client',
              `${clientDisplayName} (${clientEmail}) a créé un nouveau dossier : "${normalizedTitre || 'Sans titre'}"`,
              `/admin/dossiers/${dossier._id}`,
              { 
                dossierId: dossier._id.toString(), 
                titre: normalizedTitre || 'Sans titre',
                clientId,
                clientEmail
              }
            );

            // SMS (non bloquant) aux admins : permet d'être averti même sans passer par le dashboard
            if (admin.phone) {
              try {
                const formattedPhone = formatPhoneNumber(admin.phone);
                if (formattedPhone) {
                  void sendNotificationSMS(
                    formattedPhone,
                    'dossier_created',
                    {
                      dossierTitle: normalizedTitre || dossier.titre || 'Sans titre',
                      dossierId: dossier.numero || dossier._id.toString()
                    },
                    {
                      userId: admin._id.toString(),
                      context: 'dossier',
                      contextId: dossier._id.toString()
                    }
                  ).catch((smsError) => {
                    console.error(`⚠️ Erreur lors de l'envoi du SMS à l'admin ${admin.email}:`, smsError);
                  });
                }
              } catch (smsFormatError) {
                console.error(`⚠️ Erreur lors du formatage du téléphone admin ${admin.email}:`, smsFormatError);
              }
            }
          }
          console.log(`✅ Notifications envoyées à ${admins.length} administrateur(s) pour le nouveau dossier`);
        } catch (notifError) {
          console.error('❌ Erreur lors de la notification des admins:', notifError);
        }
      }
      // Si le dossier a été créé par un admin, notifier le client
      else if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        let targetUserId = finalUserId;
        
        // Si pas de userId mais on a un clientEmail, chercher l'utilisateur par email
        if (!targetUserId && clientEmail) {
          try {
            const userByEmail = await User.findOne({ email: clientEmail.toLowerCase() });
            if (userByEmail) {
              targetUserId = userByEmail._id.toString();
            }
          } catch (err) {
            console.error('Erreur lors de la recherche de l\'utilisateur par email:', err);
          }
        }
        
        // Créer la notification si on a trouvé un utilisateur
        if (targetUserId) {
          await createNotification(
            targetUserId,
            'dossier_created',
            'Nouveau dossier créé',
            `Un nouveau dossier "${normalizedTitre || 'Sans titre'}" a été créé pour vous par l'administrateur.`,
            `/client/dossiers`,
            { dossierId: dossier._id.toString(), titre: normalizedTitre || 'Sans titre' }
          );
        }
      }

      res.status(201).json({
        success: true,
        message: 'Dossier créé avec succès',
        dossier: dossierPopulated
      });
    } catch (error) {
      console.error('Erreur lors de la création du dossier:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   GET /api/user/dossiers/:id/recap
// @desc    Récupérer le récit récapitulatif complet d'un dossier
// @access  Private (Admin, Superadmin, Partenaire avec accès au dossier, Propriétaire du dossier)
router.get('/:id/recap', protect, async (req, res) => {
  try {
    const dossierId = req.params.id;
    
    // Récupérer le dossier avec toutes les relations
    const dossier = await Dossier.findById(dossierId)
      .populate('user', 'firstName lastName email phone profilePhoto createdAt')
      .populate('createdBy', 'firstName lastName email role')
      .populate('assignedTo', 'firstName lastName email role')
      .populate('teamMembers', 'firstName lastName email role')
      .populate('teamLeader', 'firstName lastName email role')
      .populate('transmittedTo.partenaire', 'firstName lastName email partenaireInfo')
      .populate('transmittedTo.transmittedBy', 'firstName lastName email role')
      .populate('documents')
      .populate('messages')
      .populate('rendezVous');
    
    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }
    
    // Vérifier l'accès (gérer user/assignedTo populés ou non)
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const ownerId = dossier.user ? (dossier.user._id || dossier.user).toString() : null;
    const isOwner = ownerId && ownerId === req.user.id.toString();
    const assignedId = dossier.assignedTo ? (dossier.assignedTo._id || dossier.assignedTo).toString() : null;
    const isAssigned = assignedId && assignedId === req.user.id.toString();
    const isTeamMember = dossier.teamMembers && dossier.teamMembers.some(
      m => m._id.toString() === req.user.id.toString()
    );
    const isPartenaire = req.user.role === 'partenaire';
    const isTransmittedToPartenaire = isPartenaire && dossier.transmittedTo && dossier.transmittedTo.some(
      t => {
        if (!t.partenaire) return false;
        const partenaireId = t.partenaire._id ? t.partenaire._id.toString() : t.partenaire.toString();
        // Le partenaire a accès au dossier tant qu'il lui a été transmis,
        // même si la transmission a été précédemment refusée
        return partenaireId === req.user.id.toString();
      }
    );
    
    if (!isAdmin && !isOwner && !isAssigned && !isTeamMember && !isTransmittedToPartenaire) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce dossier'
      });
    }
    
    // Récupérer les données complémentaires
    const Document = require('../models/Document');
    const Task = require('../models/Task');
    const MessageInterne = require('../models/MessageInterne');
    const RendezVous = require('../models/RendezVous');
    const DocumentRequest = require('../models/DocumentRequest');
    const Log = require('../models/Log');
    
    // Documents
    const documents = await Document.find({ dossierId: dossierId })
      .populate('user', 'firstName lastName email profilePhoto')
      .sort({ createdAt: -1 });
    
    // Tâches
    const tasks = await Task.find({ dossier: dossierId })
      .populate('createdBy', 'firstName lastName email role')
      .populate('assignedTo', 'firstName lastName email role')
      .populate('completedBy', 'firstName lastName email role')
      .sort({ createdAt: -1 });
    
    // Messages
    const messages = await MessageInterne.find({ dossierId: dossierId })
      .populate('expediteur', 'firstName lastName email role')
      .populate('destinataires', 'firstName lastName email role')
      .sort({ createdAt: -1 });
    
    // Rendez-vous
    const rendezVous = await RendezVous.find({ dossierId: dossierId })
      .populate('client', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email role')
      .sort({ date: -1 });
    
    // Demandes de documents
    const documentRequests = await DocumentRequest.find({ dossier: dossierId })
      .populate('requestedBy', 'firstName lastName email role')
      .populate('requestedFrom', 'firstName lastName email role')
      .populate('document')
      .sort({ createdAt: -1 });
    
    // Historique (logs)
    const logs = await Log.find({
      $or: [
        { 'metadata.dossierId': dossierId },
        { description: { $regex: dossierId, $options: 'i' } }
      ]
    })
      .populate('user', 'firstName lastName email role profilePhoto')
      .sort({ createdAt: -1 });
    
    // Calculer les statistiques
    const now = new Date();
    const createdAt = new Date(dossier.createdAt);
    const dureeTraitement = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    
    // Construire le récit récapitulatif
    const recap = {
      dossier: {
        numero: dossier.numero,
        titre: dossier.titre,
        description: dossier.description,
        categorie: dossier.categorie,
        type: dossier.type,
        statut: dossier.statut,
        priorite: dossier.priorite,
        dateEcheance: dossier.dateEcheance,
        motifRefus: dossier.motifRefus,
        notes: dossier.notes,
        createdAt: dossier.createdAt,
        updatedAt: dossier.updatedAt
      },
      client: dossier.user ? {
        nom: `${dossier.user.firstName || ''} ${dossier.user.lastName || ''}`.trim(),
        email: dossier.user.email,
        telephone: dossier.user.phone,
        inscritDepuis: dossier.user.createdAt
      } : {
        nom: `${dossier.clientPrenom || ''} ${dossier.clientNom || ''}`.trim(),
        email: dossier.clientEmail,
        telephone: dossier.clientTelephone,
        inscritDepuis: null
      },
      equipe: {
        createur: dossier.createdBy ? {
          nom: `${dossier.createdBy.firstName || ''} ${dossier.createdBy.lastName || ''}`.trim(),
          email: dossier.createdBy.email,
          role: dossier.createdBy.role
        } : null,
        chefEquipe: dossier.teamLeader ? {
          nom: `${dossier.teamLeader.firstName || ''} ${dossier.teamLeader.lastName || ''}`.trim(),
          email: dossier.teamLeader.email,
          role: dossier.teamLeader.role
        } : null,
        membres: dossier.teamMembers ? dossier.teamMembers.map(m => ({
          nom: `${m.firstName || ''} ${m.lastName || ''}`.trim(),
          email: m.email,
          role: m.role
        })) : [],
        assigneA: dossier.assignedTo ? {
          nom: `${dossier.assignedTo.firstName || ''} ${dossier.assignedTo.lastName || ''}`.trim(),
          email: dossier.assignedTo.email,
          role: dossier.assignedTo.role
        } : null
      },
      documents: {
        total: documents.length,
        liste: documents.map(doc => ({
          nom: doc.nom,
          type: doc.typeMime || doc.categorie,
          taille: doc.taille,
          description: doc.description,
          uploadPar: doc.user ? `${doc.user.firstName || ''} ${doc.user.lastName || ''}`.trim() : 'Inconnu',
          dateUpload: doc.createdAt
        }))
      },
      documentRequests: {
        total: documentRequests.length,
        enAttente: documentRequests.filter(r => r.status === 'pending').length,
        recus: documentRequests.filter(r => r.status === 'received').length,
        liste: documentRequests.map(req => ({
          type: req.documentTypeLabel,
          demandePar: req.requestedBy ? `${req.requestedBy.firstName || ''} ${req.requestedBy.lastName || ''}`.trim() : 'Inconnu',
          demandeA: req.requestedFrom ? `${req.requestedFrom.firstName || ''} ${req.requestedFrom.lastName || ''}`.trim() : 'Inconnu',
          statut: req.status,
          message: req.message,
          dateDemande: req.createdAt,
          dateReception: req.receivedAt
        }))
      },
      taches: {
        total: tasks.length,
        enCours: tasks.filter(t => t.statut !== 'termine' && t.statut !== 'annule' && !t.effectue).length,
        terminees: tasks.filter(t => t.statut === 'termine' || t.effectue).length,
        liste: tasks.map(task => ({
          titre: task.titre,
          description: task.description,
          statut: task.statut,
          priorite: task.priorite,
          creePar: task.createdBy ? `${task.createdBy.firstName || ''} ${task.createdBy.lastName || ''}`.trim() : 'Inconnu',
          assigneA: task.assignedTo ? task.assignedTo.map(u => `${u.firstName || ''} ${u.lastName || ''}`.trim()).join(', ') : 'Non assigné',
          dateEcheance: task.dateEcheance,
          dateCreation: task.dateDebut || task.createdAt,
          dateCompletion: task.dateEffectue || task.dateFin,
          completePar: task.completedBy ? `${task.completedBy.firstName || ''} ${task.completedBy.lastName || ''}`.trim() : null
        }))
      },
      messages: {
        total: messages.length,
        liste: messages.slice(0, 10).map(msg => ({
          sujet: msg.sujet,
          expediteur: msg.expediteur ? `${msg.expediteur.firstName || ''} ${msg.expediteur.lastName || ''}`.trim() : 'Inconnu',
          destinataires: msg.destinataires ? msg.destinataires.map(d => `${d.firstName || ''} ${d.lastName || ''}`.trim()).join(', ') : 'Non spécifié',
          date: msg.createdAt
        }))
      },
      rendezVous: {
        total: rendezVous.length,
        passes: rendezVous.filter(r => new Date(r.date) < now).length,
        aVenir: rendezVous.filter(r => new Date(r.date) >= now).length,
        liste: rendezVous.map(rv => ({
          date: rv.date,
          heure: rv.heure,
          statut: rv.statut,
          type: rv.type,
          notes: rv.notes
        }))
      },
      transmissions: dossier.transmittedTo ? dossier.transmittedTo.map(trans => ({
        partenaire: trans.partenaire ? {
          nom: trans.partenaire.partenaireInfo?.nomOrganisme || `${trans.partenaire.firstName || ''} ${trans.partenaire.lastName || ''}`.trim(),
          email: trans.partenaire.email
        } : null,
        transmisPar: trans.transmittedBy ? `${trans.transmittedBy.firstName || ''} ${trans.transmittedBy.lastName || ''}`.trim() : 'Inconnu',
        dateTransmission: trans.transmittedAt,
        statut: trans.status,
        accepte: trans.acknowledged,
        dateAcceptation: trans.acknowledgedAt,
        notes: trans.notes
      })) : [],
      historique: logs.slice(0, 20).map(log => ({
        action: log.action,
        description: log.description,
        utilisateur: log.user ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() : 'Inconnu',
        date: log.createdAt,
        details: log.metadata
      })),
      complementsRecit: (dossier.complementsRecit || []).map(c => ({
        _id: c._id,
        addedBy: c.addedBy ? c.addedBy.toString() : null,
        addedAt: c.addedAt,
        authorName: c.authorName || 'Inconnu',
        role: c.role || '',
        title: c.title || '',
        text: c.text
      })),
      statistiques: {
        dureeTraitement: dureeTraitement,
        joursDepuisCreation: dureeTraitement,
        joursDepuisDerniereMAJ: dossier.updatedAt ? Math.floor((now.getTime() - new Date(dossier.updatedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        nombreModifications: logs.filter(l => l.action === 'dossier_updated').length,
        nombreChangementsStatut: logs.filter(l => l.metadata?.newStatut).length
      }
    };
    
    res.json({
      success: true,
      recap,
      currentUserId: req.user.id
    });
  } catch (error) {
    console.error('Erreur lors de la génération du récit récapitulatif:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// Helper : vérifier si l'utilisateur peut modifier les compléments du récit (client, créateur, admin, partenaire, assigné, membre équipe)
function canEditRecapComplements(dossier, user) {
  const uid = (user && user.id ? user.id : user).toString();
  const role = user && user.role ? user.role : '';
  if (role === 'admin' || role === 'superadmin') return true;
  const ownerId = dossier.user ? (dossier.user._id || dossier.user).toString() : null;
  const isOwner = ownerId && ownerId === uid;
  const createdById = dossier.createdBy ? (dossier.createdBy._id || dossier.createdBy).toString() : null;
  const isCreatedBy = createdById && createdById === uid;
  const assignedId = dossier.assignedTo ? (dossier.assignedTo._id || dossier.assignedTo).toString() : null;
  const isAssigned = assignedId && assignedId === uid;
  const isTeamMember = dossier.teamMembers && dossier.teamMembers.some(m => (m._id || m).toString() === uid);
  const isPartenaire = dossier.transmittedTo && dossier.transmittedTo.some(t => {
    const pid = t.partenaire ? (t.partenaire._id || t.partenaire).toString() : null;
    return pid === uid;
  });
  return isOwner || isCreatedBy || isAssigned || isTeamMember || isPartenaire;
}

// @route   POST /api/user/dossiers/:id/recap/complements
// @desc    Ajouter un complément au récit (client, créateur, admin, partenaire)
// @access  Private
router.post('/:id/recap/complements', protect, async (req, res) => {
  try {
    const dossierId = req.params.id;
    const { text, title } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, message: 'Le texte du complément est requis.' });
    }
    const dossier = await Dossier.findById(dossierId)
      .populate('user', 'firstName lastName profilePhoto')
      .populate('createdBy', 'firstName lastName role')
      .populate('assignedTo', 'firstName lastName role')
      .populate('teamMembers', 'firstName lastName role')
      .populate('transmittedTo.partenaire', 'firstName lastName partenaireInfo');
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier non trouvé' });
    }
    const canEdit = canEditRecapComplements(dossier, req.user);
    if (!canEdit) {
      return res.status(403).json({ success: false, message: 'Vous n\'êtes pas autorisé à ajouter un complément à ce dossier.' });
    }
    const authorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email || 'Inconnu';
    const role = req.user.role || '';
    const complement = {
      addedBy: req.user.id,
      addedAt: new Date(),
      authorName,
      role,
      title: title != null ? String(title).trim().slice(0, 200) : '',
      text: String(text).trim()
    };
    if (!dossier.complementsRecit) dossier.complementsRecit = [];
    dossier.complementsRecit.push(complement);
    await dossier.save();
    const added = dossier.complementsRecit[dossier.complementsRecit.length - 1];

    // Notifications : client + partenaires/admin concernés
    try {
      const modifier = req.user;
      const dossierTitle = dossier.titre || dossier.numero || 'Votre dossier';
      const baseMessage = `Une nouvelle explication a été ajoutée au dossier "${dossierTitle}" par ${authorName}.`;
      const lienClient = `/client/dossiers/${dossier._id.toString()}/recap`;
      const lienAdmin = `/admin/dossiers/${dossier._id.toString()}/recap`;
      const lienPartenaire = `/partenaire/dossiers/${dossier._id.toString()}/recap`;

      // 1. Notifier le client (propriétaire) si ce n'est pas lui qui parle
      if (dossier.user) {
        const clientId = dossier.user._id ? dossier.user._id.toString() : dossier.user.toString();
        if (clientId !== req.user.id.toString()) {
          await createNotification(
            clientId,
            'dossier_updated',
            'Nouvelle explication sur votre dossier',
            baseMessage,
            lienClient,
            { dossierId: dossier._id.toString(), complementId: added._id.toString(), source: 'complementsRecit' }
          );
        }
      }

      // 2. Notifier les partenaires à qui le dossier est transmis
      if (Array.isArray(dossier.transmittedTo) && dossier.transmittedTo.length > 0) {
        for (const trans of dossier.transmittedTo) {
          const part = trans.partenaire;
          const partenaireId = part?._id ? part._id.toString() : part?.toString();
          if (partenaireId && partenaireId !== req.user.id.toString()) {
            await createNotification(
              partenaireId,
              'dossier_updated',
              'Nouvelle explication sur un dossier transmis',
              baseMessage,
              lienPartenaire,
              { dossierId: dossier._id.toString(), complementId: added._id.toString(), source: 'complementsRecit' }
            );
          }
        }
      }

      // 3. Notifier l'admin assigné le cas échéant (si ce n'est pas lui)
      if (dossier.assignedTo) {
        const assignedId = dossier.assignedTo._id ? dossier.assignedTo._id.toString() : dossier.assignedTo.toString();
        if (assignedId !== req.user.id.toString()) {
          await createNotification(
            assignedId,
            'dossier_updated',
            'Nouvelle explication sur un dossier',
            baseMessage,
            lienAdmin,
            { dossierId: dossier._id.toString(), complementId: added._id.toString(), source: 'complementsRecit' }
          );
        }
      }
    } catch (notifyError) {
      console.error('Erreur lors de la création des notifications pour complément récit:', notifyError);
    }

    return res.status(201).json({
      success: true,
      message: 'Complément ajouté.',
      complement: {
        _id: added._id,
        addedAt: added.addedAt,
        authorName: added.authorName,
        role: added.role,
        title: added.title || '',
        text: added.text
      }
    });
  } catch (error) {
    console.error('Erreur ajout complément récit:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

// @route   PATCH /api/user/dossiers/:id/recap/complements/:complementId
// @desc    Modifier un complément (auteur du complément ou admin)
// @access  Private
router.patch('/:id/recap/complements/:complementId', protect, async (req, res) => {
  try {
    const { id: dossierId, complementId } = req.params;
    const { text, title } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, message: 'Le texte du complément est requis.' });
    }
    const dossier = await Dossier.findById(dossierId)
      .populate('user', 'firstName lastName profilePhoto')
      .populate('createdBy', 'firstName lastName role')
      .populate('assignedTo', 'firstName lastName role')
      .populate('teamMembers', 'firstName lastName role')
      .populate('transmittedTo.partenaire', 'firstName lastName partenaireInfo');
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier non trouvé' });
    }
    const canEdit = canEditRecapComplements(dossier, req.user);
    if (!canEdit) {
      return res.status(403).json({ success: false, message: 'Non autorisé.' });
    }
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const comp = (dossier.complementsRecit || []).find(c => (c._id || c).toString() === complementId);
    if (!comp) {
      return res.status(404).json({ success: false, message: 'Complément non trouvé.' });
    }
    const isAuthor = (comp.addedBy || comp).toString() === req.user.id.toString();
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Seul l\'auteur du complément ou un administrateur peut le modifier.' });
    }
    comp.text = String(text).trim();
    if (title !== undefined) {
      comp.title = String(title).trim().slice(0, 200);
    }
    await dossier.save();
    return res.json({
      success: true,
      message: 'Complément mis à jour.',
      complement: {
        _id: comp._id,
        addedAt: comp.addedAt,
        authorName: comp.authorName,
        role: comp.role,
        title: comp.title || '',
        text: comp.text
      }
    });
  } catch (error) {
    console.error('Erreur modification complément récit:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

// @route   DELETE /api/user/dossiers/:id/recap/complements/:complementId
// @desc    Supprimer un complément (auteur du complément ou admin)
// @access  Private
router.delete('/:id/recap/complements/:complementId', protect, async (req, res) => {
  try {
    const { id: dossierId, complementId } = req.params;
    const dossier = await Dossier.findById(dossierId)
      .populate('user', 'firstName lastName profilePhoto')
      .populate('createdBy', 'firstName lastName role')
      .populate('assignedTo', 'firstName lastName role')
      .populate('teamMembers', 'firstName lastName role')
      .populate('transmittedTo.partenaire', 'firstName lastName partenaireInfo');
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier non trouvé' });
    }
    const canEdit = canEditRecapComplements(dossier, req.user);
    if (!canEdit) {
      return res.status(403).json({ success: false, message: 'Non autorisé.' });
    }
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const index = (dossier.complementsRecit || []).findIndex(c => (c._id || c).toString() === complementId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Complément non trouvé.' });
    }
    const comp = dossier.complementsRecit[index];
    const isAuthor = (comp.addedBy || comp).toString() === req.user.id.toString();
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Seul l\'auteur du complément ou un administrateur peut le supprimer.' });
    }
    dossier.complementsRecit.splice(index, 1);
    await dossier.save();
    return res.json({ success: true, message: 'Complément supprimé.' });
  } catch (error) {
    console.error('Erreur suppression complément récit:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

// @route   GET /api/user/dossiers/:id/recap/pdf
// @desc    Générer et télécharger le récit récapitulatif en PDF
// @access  Private (Admin, Superadmin, Partenaire avec accès au dossier, Propriétaire du dossier)
router.get('/:id/recap/pdf', protect, async (req, res) => {
  try {
    const dossierId = req.params.id;
    
    // Récupérer le dossier avec toutes les relations (même logique que /recap)
    const dossier = await Dossier.findById(dossierId)
      .populate('user', 'firstName lastName email phone profilePhoto createdAt')
      .populate('createdBy', 'firstName lastName email role')
      .populate('assignedTo', 'firstName lastName email role')
      .populate('teamMembers', 'firstName lastName email role')
      .populate('teamLeader', 'firstName lastName email role')
      .populate('transmittedTo.partenaire', 'firstName lastName email partenaireInfo')
      .populate('transmittedTo.transmittedBy', 'firstName lastName email role')
      .populate('documents')
      .populate('messages')
      .populate('rendezVous');
    
    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }
    
    // Vérifier l'accès (même logique que /recap, gérer user/assignedTo populés ou non)
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const ownerIdPdf = dossier.user ? (dossier.user._id || dossier.user).toString() : null;
    const isOwner = ownerIdPdf && ownerIdPdf === req.user.id.toString();
    const assignedIdPdf = dossier.assignedTo ? (dossier.assignedTo._id || dossier.assignedTo).toString() : null;
    const isAssigned = assignedIdPdf && assignedIdPdf === req.user.id.toString();
    const isTeamMember = dossier.teamMembers && dossier.teamMembers.some(
      m => m._id.toString() === req.user.id.toString()
    );
    const isPartenaire = req.user.role === 'partenaire';
    const isTransmittedToPartenaire = isPartenaire && dossier.transmittedTo && dossier.transmittedTo.some(
      t => {
        if (!t.partenaire) return false;
        const partenaireId = t.partenaire._id ? t.partenaire._id.toString() : t.partenaire.toString();
        // Le partenaire a accès aux données détaillées du dossier
        // tant que le dossier lui a été transmis, quel que soit le statut
        return partenaireId === req.user.id.toString();
      }
    );
    
    if (!isAdmin && !isOwner && !isAssigned && !isTeamMember && !isTransmittedToPartenaire) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce dossier'
      });
    }
    
    // Récupérer les données complémentaires
    const Document = require('../models/Document');
    const Task = require('../models/Task');
    const MessageInterne = require('../models/MessageInterne');
    const RendezVous = require('../models/RendezVous');
    const DocumentRequest = require('../models/DocumentRequest');
    const Log = require('../models/Log');
    
    const [documents, tasks, messages, rendezVous, documentRequests, logs] = await Promise.all([
      Document.find({ dossierId: dossierId }).populate('user', 'firstName lastName email profilePhoto').sort({ createdAt: -1 }),
      Task.find({ dossier: dossierId }).populate('createdBy', 'firstName lastName email role').populate('assignedTo', 'firstName lastName email role').populate('completedBy', 'firstName lastName email role').sort({ createdAt: -1 }),
      MessageInterne.find({ dossierId: dossierId }).populate('expediteur', 'firstName lastName email role').populate('destinataires', 'firstName lastName email role').sort({ createdAt: -1 }),
      RendezVous.find({ dossierId: dossierId }).populate('client', 'firstName lastName email').populate('createdBy', 'firstName lastName email role').sort({ date: -1 }),
      DocumentRequest.find({ dossier: dossierId }).populate('requestedBy', 'firstName lastName email role').populate('requestedFrom', 'firstName lastName email role').populate('document').sort({ createdAt: -1 }),
      Log.find({
        $or: [
          { 'metadata.dossierId': dossierId },
          { description: { $regex: dossierId, $options: 'i' } }
        ]
      }).populate('user', 'firstName lastName email role profilePhoto').sort({ createdAt: -1 })
    ]);
    
    // Construire le récit récapitulatif (même structure que /recap)
    const now = new Date();
    const createdAt = new Date(dossier.createdAt);
    const dureeTraitement = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    
    const recap = {
      dossier: {
        numero: dossier.numero,
        titre: dossier.titre,
        description: dossier.description,
        categorie: dossier.categorie,
        type: dossier.type,
        statut: dossier.statut,
        priorite: dossier.priorite,
        dateEcheance: dossier.dateEcheance,
        motifRefus: dossier.motifRefus,
        notes: dossier.notes,
        createdAt: dossier.createdAt,
        updatedAt: dossier.updatedAt
      },
      client: dossier.user ? {
        nom: `${dossier.user.firstName || ''} ${dossier.user.lastName || ''}`.trim(),
        email: dossier.user.email,
        telephone: dossier.user.phone,
        inscritDepuis: dossier.user.createdAt
      } : {
        nom: `${dossier.clientPrenom || ''} ${dossier.clientNom || ''}`.trim(),
        email: dossier.clientEmail,
        telephone: dossier.clientTelephone,
        inscritDepuis: null
      },
      equipe: {
        createur: dossier.createdBy ? {
          nom: `${dossier.createdBy.firstName || ''} ${dossier.createdBy.lastName || ''}`.trim(),
          email: dossier.createdBy.email,
          role: dossier.createdBy.role
        } : null,
        chefEquipe: dossier.teamLeader ? {
          nom: `${dossier.teamLeader.firstName || ''} ${dossier.teamLeader.lastName || ''}`.trim(),
          email: dossier.teamLeader.email,
          role: dossier.teamLeader.role
        } : null,
        membres: dossier.teamMembers ? dossier.teamMembers.map(m => ({
          nom: `${m.firstName || ''} ${m.lastName || ''}`.trim(),
          email: m.email,
          role: m.role
        })) : [],
        assigneA: dossier.assignedTo ? {
          nom: `${dossier.assignedTo.firstName || ''} ${dossier.assignedTo.lastName || ''}`.trim(),
          email: dossier.assignedTo.email,
          role: dossier.assignedTo.role
        } : null
      },
      documents: {
        total: documents.length,
        liste: documents.map(doc => ({
          nom: doc.nom,
          type: doc.typeMime || doc.categorie,
          taille: doc.taille,
          description: doc.description,
          uploadPar: doc.user ? `${doc.user.firstName || ''} ${doc.user.lastName || ''}`.trim() : 'Inconnu',
          dateUpload: doc.createdAt
        }))
      },
      documentRequests: {
        total: documentRequests.length,
        enAttente: documentRequests.filter(r => r.status === 'pending').length,
        recus: documentRequests.filter(r => r.status === 'received').length,
        liste: documentRequests.map(req => ({
          type: req.documentTypeLabel,
          demandePar: req.requestedBy ? `${req.requestedBy.firstName || ''} ${req.requestedBy.lastName || ''}`.trim() : 'Inconnu',
          demandeA: req.requestedFrom ? `${req.requestedFrom.firstName || ''} ${req.requestedFrom.lastName || ''}`.trim() : 'Inconnu',
          statut: req.status,
          message: req.message,
          dateDemande: req.createdAt,
          dateReception: req.receivedAt
        }))
      },
      taches: {
        total: tasks.length,
        enCours: tasks.filter(t => t.statut !== 'termine' && t.statut !== 'annule' && !t.effectue).length,
        terminees: tasks.filter(t => t.statut === 'termine' || t.effectue).length,
        liste: tasks.map(task => ({
          titre: task.titre,
          description: task.description,
          statut: task.statut,
          priorite: task.priorite,
          creePar: task.createdBy ? `${task.createdBy.firstName || ''} ${task.createdBy.lastName || ''}`.trim() : 'Inconnu',
          assigneA: task.assignedTo ? task.assignedTo.map(u => `${u.firstName || ''} ${u.lastName || ''}`.trim()).join(', ') : 'Non assigné',
          dateEcheance: task.dateEcheance,
          dateCreation: task.dateDebut || task.createdAt,
          dateCompletion: task.dateEffectue || task.dateFin,
          completePar: task.completedBy ? `${task.completedBy.firstName || ''} ${task.completedBy.lastName || ''}`.trim() : null
        }))
      },
      messages: {
        total: messages.length,
        liste: messages.slice(0, 10).map(msg => ({
          sujet: msg.sujet,
          expediteur: msg.expediteur ? `${msg.expediteur.firstName || ''} ${msg.expediteur.lastName || ''}`.trim() : 'Inconnu',
          destinataires: msg.destinataires ? msg.destinataires.map(d => `${d.firstName || ''} ${d.lastName || ''}`.trim()).join(', ') : 'Non spécifié',
          date: msg.createdAt
        }))
      },
      rendezVous: {
        total: rendezVous.length,
        passes: rendezVous.filter(r => new Date(r.date) < now).length,
        aVenir: rendezVous.filter(r => new Date(r.date) >= now).length,
        liste: rendezVous.map(rv => ({
          date: rv.date,
          heure: rv.heure,
          statut: rv.statut,
          type: rv.type,
          notes: rv.notes
        }))
      },
      transmissions: dossier.transmittedTo ? dossier.transmittedTo.map(trans => ({
        partenaire: trans.partenaire ? {
          nom: trans.partenaire.partenaireInfo?.nomOrganisme || `${trans.partenaire.firstName || ''} ${trans.partenaire.lastName || ''}`.trim(),
          email: trans.partenaire.email
        } : null,
        transmisPar: trans.transmittedBy ? `${trans.transmittedBy.firstName || ''} ${trans.transmittedBy.lastName || ''}`.trim() : 'Inconnu',
        dateTransmission: trans.transmittedAt,
        statut: trans.status,
        accepte: trans.acknowledged,
        dateAcceptation: trans.acknowledgedAt,
        notes: trans.notes
      })) : [],
      historique: logs.slice(0, 20).map(log => ({
        action: log.action,
        description: log.description,
        utilisateur: log.user ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() : 'Inconnu',
        date: log.createdAt,
        details: log.metadata
      })),
      complementsRecit: (dossier.complementsRecit || []).map(c => ({
        _id: c._id,
        addedBy: c.addedBy ? c.addedBy.toString() : null,
        addedAt: c.addedAt,
        authorName: c.authorName || 'Inconnu',
        role: c.role || '',
        title: c.title || '',
        text: c.text
      })),
      statistiques: {
        dureeTraitement: dureeTraitement,
        joursDepuisCreation: dureeTraitement,
        joursDepuisDerniereMAJ: dossier.updatedAt ? Math.floor((now.getTime() - new Date(dossier.updatedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        nombreModifications: logs.filter(l => l.action === 'dossier_updated').length,
        nombreChangementsStatut: logs.filter(l => l.metadata?.newStatut).length
      }
    };
    
    // Générer le PDF
    const { addDocumentHeader, PLATFORM_CONFIG } = require('../utils/documentHeader');
    const PDFDocument = require('pdfkit');
    const margin = 50;
    const doc = new PDFDocument({ margin, size: 'A4' });
    
    // Headers pour le téléchargement
    const filename = `Recit_Dossier_${recap.dossier.numero || dossierId}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Pipe le PDF vers la réponse
    doc.pipe(res);
    
    // Ajouter l'en-tête standard Ada Papers et récupérer la position de départ du contenu
    let yPosition = addDocumentHeader(doc, { margin });
    
    // Fonction helper pour ajouter du texte avec gestion de la pagination
    const pageHeight = doc.page.height;
    const lineHeight = 15;
    const sectionSpacing = 20;
    let pageCount = 1;
    
    // Suivre les pages pour le footer
    doc.on('pageAdded', () => {
      pageCount++;
    });
    
    const addText = (text, x, y, options = {}) => {
      let currentY = y;
      if (currentY > pageHeight - 80) {
        doc.addPage();
        currentY = margin;
      }
      doc.text(text, x, currentY, options);
      // Retourner la nouvelle position Y après l'ajout du texte
      return doc.y || (currentY + lineHeight);
    };
    
    const addMultilineText = (text, x, y, options = {}) => {
      let currentY = y;
      if (currentY > pageHeight - 100) {
        doc.addPage();
        currentY = margin;
      }
      
      // Calculer approximativement le nombre de lignes nécessaires
      const textWidth = options.width || (doc.page.width - 2 * margin);
      const fontSize = doc._fontSize || 10;
      const charsPerLine = Math.floor(textWidth / (fontSize * 0.6)); // Approximation
      const lines = Math.ceil(text.length / charsPerLine) || 1;
      
      doc.text(text, x, currentY, options);
      return currentY + (lines * lineHeight);
    };
    
    const addSection = (title, y) => {
      let currentY = y;
      if (currentY > pageHeight - 100) {
        doc.addPage();
        currentY = margin;
      }
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#FF6600');
      currentY = addText(title, margin, currentY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      currentY += lineHeight;
      return currentY;
    };
    
    // Titre principal sous l'en-tête
    yPosition = addSection('RÉCIT RÉCAPITULATIF DU DOSSIER', yPosition);
    
    // Informations du dossier
    yPosition = addSection('INFORMATIONS DU DOSSIER', yPosition);
    yPosition = addText(`Numéro : ${recap.dossier.numero || 'N/A'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Titre : ${recap.dossier.titre || 'Sans titre'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Catégorie : ${recap.dossier.categorie || 'N/A'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Type : ${recap.dossier.type || 'N/A'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Statut : ${recap.dossier.statut || 'N/A'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Priorité : ${recap.dossier.priorite || 'N/A'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Créé le : ${new Date(recap.dossier.createdAt).toLocaleDateString('fr-FR')}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Dernière mise à jour : ${new Date(recap.dossier.updatedAt).toLocaleDateString('fr-FR')}`, margin, yPosition);
    if (recap.dossier.dateEcheance) {
      yPosition += lineHeight;
      yPosition = addText(`Échéance : ${new Date(recap.dossier.dateEcheance).toLocaleDateString('fr-FR')}`, margin, yPosition);
    }
    yPosition += sectionSpacing;
    
    // Informations client
    yPosition = addSection('INFORMATIONS CLIENT', yPosition);
    yPosition = addText(`Nom : ${recap.client.nom || 'N/A'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Email : ${recap.client.email || 'N/A'}`, margin, yPosition);
    yPosition += lineHeight;
    if (recap.client.telephone) {
      yPosition = addText(`Téléphone : ${recap.client.telephone}`, margin, yPosition);
      yPosition += lineHeight;
    }
    if (recap.client.inscritDepuis) {
      yPosition = addText(`Inscrit depuis : ${new Date(recap.client.inscritDepuis).toLocaleDateString('fr-FR')}`, margin, yPosition);
      yPosition += lineHeight;
    }
    yPosition += sectionSpacing;
    
    // Équipe
    yPosition = addSection('ÉQUIPE DE TRAITEMENT', yPosition);
    if (recap.equipe.createur) {
      yPosition = addText(`Créateur : ${recap.equipe.createur.nom} (${recap.equipe.createur.email})`, margin, yPosition);
      yPosition += lineHeight;
    }
    if (recap.equipe.chefEquipe) {
      yPosition = addText(`Chef d'équipe : ${recap.equipe.chefEquipe.nom} (${recap.equipe.chefEquipe.email})`, margin, yPosition);
      yPosition += lineHeight;
    }
    if (recap.equipe.membres && recap.equipe.membres.length > 0) {
      yPosition = addText(`Membres de l'équipe : ${recap.equipe.membres.map(m => m.nom).join(', ')}`, margin, yPosition);
      yPosition += lineHeight;
    }
    yPosition += sectionSpacing;
    
    // Explication du dossier (compléments au récit, visibles par tous) — placés AVANT les documents
    if (recap.complementsRecit && recap.complementsRecit.length > 0) {
      yPosition = addSection('EXPLICATION DU DOSSIER', yPosition);
      doc.fontSize(10);
      recap.complementsRecit.forEach((c, index) => {
        const dateStr = c.addedAt ? new Date(c.addedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const authorLabel = [c.authorName, c.role].filter(Boolean).join(' • ');
        const titlePart = c.title && String(c.title).trim() ? ` — ${String(c.title).trim()}` : '';
        yPosition = addText(`${index + 1}. Le ${dateStr} — ${authorLabel}${titlePart}`, margin, yPosition);
        yPosition += lineHeight * 0.5;
        yPosition = addMultilineText(c.text, margin + 10, yPosition, {
          width: doc.page.width - 2 * margin - 10,
          align: 'left'
        });
        yPosition += lineHeight;
      });
      yPosition += sectionSpacing;
    }
    
    // Documents
    yPosition = addSection('DOCUMENTS', yPosition);
    yPosition = addText(`Total : ${recap.documents.total} document(s)`, margin, yPosition);
    yPosition += lineHeight;
    if (recap.documents.liste && recap.documents.liste.length > 0) {
      recap.documents.liste.forEach((doc, index) => {
        yPosition = addText(`${index + 1}. ${doc.nom}`, margin + 20, yPosition);
        yPosition += lineHeight * 0.7;
        yPosition = addText(`   Type: ${doc.type} | Taille: ${doc.taille ? (doc.taille / 1024).toFixed(2) + ' KB' : 'N/A'} | Ajouté par: ${doc.uploadPar} | Date: ${new Date(doc.dateUpload).toLocaleDateString('fr-FR')}`, margin + 20, yPosition);
        yPosition += lineHeight;
      });
    }
    yPosition += sectionSpacing;
    
    // Demandes de documents
    if (recap.documentRequests.total > 0) {
      yPosition = addSection('DEMANDES DE DOCUMENTS', yPosition);
      yPosition = addText(`Total : ${recap.documentRequests.total} demande(s)`, margin, yPosition);
      yPosition += lineHeight;
      yPosition = addText(`En attente : ${recap.documentRequests.enAttente} | Reçus : ${recap.documentRequests.recus}`, margin, yPosition);
      yPosition += sectionSpacing;
    }
    // Tâches
    if (recap.taches.total > 0) {
      yPosition = addSection('TÂCHES', yPosition);
      yPosition = addText(`Total : ${recap.taches.total} tâche(s)`, margin, yPosition);
      yPosition += lineHeight;
      yPosition = addText(`En cours : ${recap.taches.enCours} | Terminées : ${recap.taches.terminees}`, margin, yPosition);
      yPosition += lineHeight;
      if (recap.taches.liste && recap.taches.liste.length > 0) {
        recap.taches.liste.slice(0, 10).forEach((task, index) => {
          yPosition = addText(`${index + 1}. ${task.titre}`, margin + 20, yPosition);
          yPosition += lineHeight * 0.7;
          yPosition = addText(`   Statut: ${task.statut} | Priorité: ${task.priorite} | Assigné à: ${task.assigneA}`, margin + 20, yPosition);
          yPosition += lineHeight;
        });
      }
      yPosition += sectionSpacing;
    }
    
    // Messages
    if (recap.messages.total > 0) {
      yPosition = addSection('COMMUNICATION', yPosition);
      yPosition = addText(`Total : ${recap.messages.total} message(s) échangé(s)`, margin, yPosition);
      yPosition += sectionSpacing;
    }
    
    // Rendez-vous
    if (recap.rendezVous.total > 0) {
      yPosition = addSection('RENDEZ-VOUS', yPosition);
      yPosition = addText(`Total : ${recap.rendezVous.total} rendez-vous`, margin, yPosition);
      yPosition += lineHeight;
      yPosition = addText(`Passés : ${recap.rendezVous.passes} | À venir : ${recap.rendezVous.aVenir}`, margin, yPosition);
      yPosition += sectionSpacing;
    }
    
    // Transmissions
    if (recap.transmissions && recap.transmissions.length > 0) {
      yPosition = addSection('TRANSMISSIONS AUX PARTENAIRES', yPosition);
      recap.transmissions.forEach((trans, index) => {
        if (trans.partenaire) {
          yPosition = addText(`${index + 1}. ${trans.partenaire.nom}`, margin + 20, yPosition);
          yPosition += lineHeight * 0.7;
          yPosition = addText(`   Transmis le: ${new Date(trans.dateTransmission).toLocaleDateString('fr-FR')} | Statut: ${trans.statut}`, margin + 20, yPosition);
          if (trans.accepte && trans.dateAcceptation) {
            yPosition += lineHeight * 0.7;
            yPosition = addText(`   Accepté le: ${new Date(trans.dateAcceptation).toLocaleDateString('fr-FR')}`, margin + 20, yPosition);
          }
          yPosition += lineHeight;
        }
      });
      yPosition += sectionSpacing;
    }
    
    // Statistiques
    yPosition = addSection('STATISTIQUES', yPosition);
    yPosition = addText(`Durée de traitement : ${recap.statistiques.dureeTraitement} jour(s)`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Nombre de modifications : ${recap.statistiques.nombreModifications}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Changements de statut : ${recap.statistiques.nombreChangementsStatut}`, margin, yPosition);
    yPosition += sectionSpacing;
    
    // Description
    if (recap.dossier.description) {
      yPosition = addSection('DESCRIPTION', yPosition);
      doc.fontSize(10);
      yPosition = addMultilineText(recap.dossier.description, margin, yPosition, {
        width: doc.page.width - 2 * margin,
        align: 'left'
      });
      yPosition += sectionSpacing;
    }
    
    // Notes
    if (recap.dossier.notes) {
      yPosition = addSection('NOTES INTERNES', yPosition);
      doc.fontSize(10);
      yPosition = addMultilineText(recap.dossier.notes, margin, yPosition, {
        width: doc.page.width - 2 * margin,
        align: 'left'
      });
      yPosition += sectionSpacing;
    }
    
    // Gérer les erreurs du stream PDF
    doc.on('error', (err) => {
      console.error('Erreur dans le stream PDF:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la génération du PDF',
          error: err.message
        });
      }
    });
    
    // Ajouter le footer sur toutes les pages AVANT de finaliser
    try {
      const bufferedPages = doc.bufferedPageRange();
      if (bufferedPages && bufferedPages.count > 0) {
        const totalPages = bufferedPages.count;
        const startPage = bufferedPages.start;
        
        for (let i = startPage; i < startPage + totalPages; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).fillColor('#666666');
          const footerText = `${PLATFORM_CONFIG.name} - ${PLATFORM_CONFIG.website} - ${PLATFORM_CONFIG.email} | Page ${i - startPage + 1}/${totalPages}`;
          doc.text(
            footerText,
            margin,
            doc.page.height - 30,
            { align: 'center', width: doc.page.width - 2 * margin }
          );
        }
      }
    } catch (err) {
      console.warn('⚠️ Erreur lors de l\'ajout du footer:', err.message);
      // Continuer même si l'ajout du footer échoue
    }
    
    // Finaliser le PDF
    doc.end();
    
  } catch (error) {
    console.error('Erreur lors de la génération du PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la génération du PDF',
        error: error.message
      });
    }
  }
});

// @route   POST /api/user/dossiers/:id/tarification-payment-reminder
// @desc    Relance client : notification in-app + SMS court (1 segment) si numéro présent
// @access  Private (admin, superadmin)
router.post(
  '/:id/tarification-payment-reminder',
  protect,
  authorize('admin', 'superadmin'),
  async (req, res) => {
    try {
      const dossierId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(dossierId)) {
        return res.status(400).json({ success: false, message: 'Identifiant de dossier invalide' });
      }

      const dossier = await Dossier.findById(dossierId).lean();
      if (!dossier) {
        return res.status(404).json({ success: false, message: 'Dossier non trouvé' });
      }

      if (dossier.fraisExoneres) {
        return res.status(400).json({
          success: false,
          message: 'Dossier exonéré : relance paiement non applicable.'
        });
      }

      const hasPaymentDefined =
        Number(dossier.montantTarificationFixe || 0) > 0 || !!dossier.formuleTarifaire;
      if (!hasPaymentDefined) {
        return res.status(400).json({
          success: false,
          message: 'Aucun montant ni formule de tarification définie pour ce dossier.'
        });
      }

      if (dossier.paiementTarificationEffectue) {
        return res.status(400).json({
          success: false,
          message: 'Le paiement est déjà enregistré comme effectué.'
        });
      }

      let clientUserId = null;
      if (dossier.user) {
        clientUserId = dossier.user.toString();
      } else if (dossier.clientEmail) {
        const userByEmail = await User.findOne({
          email: String(dossier.clientEmail).toLowerCase()
        }).select('_id');
        if (userByEmail) clientUserId = userByEmail._id.toString();
      }

      if (!clientUserId) {
        return res.status(400).json({
          success: false,
          message: 'Client introuvable : associez un compte ou un email client au dossier.'
        });
      }

      const dossierTitle = dossier.titre || dossier.numero || 'votre dossier';
      const refCourte = (dossier.numero || dossierId.slice(-8)).toString().replace(/\s+/g, '').slice(0, 20);
      const montantFixe = Number(dossier.montantTarificationFixe || 0);
      const messageInApp =
        montantFixe > 0
          ? `Le règlement de la tarification (${montantFixe.toLocaleString('fr-FR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })} EUR) pour le dossier « ${dossierTitle} » est en attente. Finalisez depuis la rubrique Tarification.`
          : `Le dossier « ${dossierTitle} » : choix de formule et paiement tarifaire sont attendus. Consultez Tarification dans votre espace client.`;

      const notif = await createNotification(
        clientUserId,
        'tarification_payment_reminder',
        'Rappel : paiement tarification en attente',
        messageInApp,
        '/client/tarification',
        { dossierId: dossierId.toString(), sentByAdmin: req.user.id?.toString?.() || String(req.user.id) }
      );

      if (!notif) {
        return res.status(500).json({
          success: false,
          message: 'Impossible de créer la notification in-app (voir les logs serveur).'
        });
      }

      const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');
      let smsSent = false;
      let smsSkipped = null;

      const phoneUser = await User.findById(clientUserId).select('phone');
      if (dossier.isStandby) {
        smsSkipped = 'dossier_standby';
      } else if (!phoneUser?.phone) {
        smsSkipped = 'no_phone';
      } else {
        const formattedPhone = formatPhoneNumber(phoneUser.phone);
        if (!formattedPhone) {
          smsSkipped = 'invalid_phone';
        } else {
          try {
            await sendNotificationSMS(
              formattedPhone,
              'tarification_payment_reminder',
              { numero: refCourte },
              {
                userId: clientUserId,
                skipPreferences: true,
                context: 'tarification_payment_reminder',
                contextId: dossierId,
                sentBy: req.user.id
              }
            );
            smsSent = true;
          } catch (smsErr) {
            console.error('⚠️ SMS relance tarification:', smsErr);
            smsSkipped = smsErr.message || 'sms_error';
          }
        }
      }

      const parts = ['notification in-app'];
      if (smsSent) parts.push('SMS');
      const smsHint =
        smsSent ? '' : ` — SMS non envoyé${smsSkipped ? ` (${smsSkipped})` : ''}`;

      return res.json({
        success: true,
        message: `Relance enregistrée (${parts.join(' + ')})${smsHint}.`,
        notificationCreated: true,
        smsSent,
        smsSkipped: smsSent ? null : smsSkipped
      });
    } catch (error) {
      console.error('Erreur relance tarification:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   GET /api/user/dossiers/:id
// @desc    Récupérer un dossier par ID
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    console.log('📥 GET /api/user/dossiers/:id - ID:', req.params.id);
    console.log('📥 User:', req.user?.email || req.user?.id);
    const dossier = await Dossier.findById(req.params.id)
      .populate('user', 'firstName lastName email phone profilePhoto dateNaissance lieuNaissance nationalite sexe numeroEtranger numeroTitre typeTitre dateDelivrance dateExpiration adressePostale ville codePostal pays')
      .populate('createdBy', 'firstName lastName email role')
      .populate('assignedTo', 'firstName lastName email role')
      .populate('teamMembers', 'firstName lastName email role')
      .populate('teamLeader', 'firstName lastName email role')
      .populate('activeCollaborators.user', 'firstName lastName email role')
      .populate('transmittedTo.partenaire', 'firstName lastName email partenaireInfo')
      .populate('transmittedTo.transmittedBy', 'firstName lastName email')
      .populate('documents')
      .populate('messages')
      .populate('rendezVous')
      .populate('createdFromContactMessage');

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }

    // Vérifier que l'utilisateur a accès à ce dossier
    // L'utilisateur peut accéder si :
    // 1. Il est le propriétaire du dossier (user field)
    // 2. Son email correspond au clientEmail du dossier
    // 3. Il est admin/superadmin
    // 4. Le dossier lui est assigné (assignedTo)
    // 5. Le dossier lui a été transmis (partenaire)
    const isPartenaire = req.user.role === 'partenaire';
    const isTransmittedToPartenaire = dossier.transmittedTo && dossier.transmittedTo.some(
      t => {
        if (!t.partenaire) return false;
        const partenaireId = t.partenaire._id ? t.partenaire._id.toString() : t.partenaire.toString();
        return partenaireId === req.user.id.toString();
      }
    );
    
    // Vérifier chaque condition d'accès
    const isOwner = dossier.user && dossier.user._id && dossier.user._id.toString() === req.user.id.toString();
    const isClientByEmail = dossier.clientEmail && dossier.clientEmail.toLowerCase() === req.user.email.toLowerCase();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const isAssigned = dossier.assignedTo && dossier.assignedTo._id && dossier.assignedTo._id.toString() === req.user.id.toString();
    const isTransmitted = isPartenaire && isTransmittedToPartenaire;
    
    let hasAccess = isOwner || isClientByEmail || isAdmin || isAssigned || isTransmitted;

    console.log('🔐 Vérification d\'accès au dossier:', {
      dossierId: req.params.id,
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      checks: {
        isOwner,
        isClientByEmail,
        isAdmin,
        isAssigned,
        isTransmitted,
        isPartenaire
      },
      dossierUser: dossier.user ? (dossier.user._id ? dossier.user._id.toString() : dossier.user.toString()) : null,
      dossierClientEmail: dossier.clientEmail,
      dossierAssignedTo: dossier.assignedTo ? (dossier.assignedTo._id ? dossier.assignedTo._id.toString() : dossier.assignedTo.toString()) : null,
      transmittedTo: dossier.transmittedTo ? dossier.transmittedTo.map(t => ({
        partenaire: t.partenaire ? (t.partenaire._id ? t.partenaire._id.toString() : t.partenaire.toString()) : null
      })) : []
    });

    if (!hasAccess) {
      console.warn('⚠️ Accès refusé au dossier:', {
        dossierId: req.params.id,
        userId: req.user.id,
        userRole: req.user.role
      });
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce dossier',
        details: process.env.NODE_ENV === 'development' ? {
          checks: {
            isOwner,
            isClientByEmail,
            isAdmin,
            isAssigned,
            isTransmitted
          }
        } : undefined
      });
    }

    const dossierOut = req.user.role === 'partenaire' ? sanitizeDossierForPartenaire(dossier) : dossier;

    res.json({
      success: true,
      dossier: dossierOut
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du dossier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   PUT /api/user/dossiers/:id
// @desc    Mettre à jour un dossier
// @access  Private
router.put(
  '/:id',
  [
    // Validation simplifiée : tous les champs sont optionnels
    // Si un champ est fourni, il sera validé, sinon ignoré
    body('categorie').optional().isIn(['sejour_titres', 'contentieux_administratif', 'asile', 'regroupement_familial', 'nationalite_francaise', 'eloignement_urgence', 'autre']).withMessage('Catégorie invalide'),
    body('titre').optional().trim().isLength({ max: 500 }).withMessage('Titre trop long (max 500 caractères)'),
    body('statut').optional().isString().trim().isLength({ max: 200 }).withMessage('Statut invalide'),
    body('priorite').optional().isIn(['basse', 'normale', 'haute', 'urgente']).withMessage('Priorité invalide')
    // Pas de validation pour les autres champs optionnels
  ],
  async (req, res) => {
    try {
      // Log du body reçu pour déboguer
      console.log('📥 PUT /user/dossiers/:id - Body reçu:', JSON.stringify(req.body, null, 2));
      console.log('📥 PUT /user/dossiers/:id - Params:', req.params);
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('❌ Erreurs de validation:', JSON.stringify(errors.array(), null, 2));
        console.error('❌ Body reçu:', JSON.stringify(req.body, null, 2));
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const dossier = await Dossier.findById(req.params.id)
        .populate('user', 'firstName lastName email phone profilePhoto');

      if (!dossier) {
        return res.status(404).json({
          success: false,
          message: 'Dossier non trouvé'
        });
      }

      // Vérifier les permissions
      const dossierUserId = dossier.user ? (dossier.user._id ? dossier.user._id.toString() : dossier.user.toString()) : null;
      let hasModifyPermission = false;
      const isPartenaire = req.user.role === 'partenaire';
      const isTransmittedToPartenaire = isPartenaire && dossier.transmittedTo && dossier.transmittedTo.some(
        t => {
          if (!t.partenaire) return false;
          const pid = t.partenaire._id ? t.partenaire._id.toString() : t.partenaire.toString();
          return pid === req.user.id.toString();
        }
      );

      // L'utilisateur peut modifier si :
      // 1. Il est le propriétaire du dossier
      // 2. Il est admin/superadmin
      // 3. Il est partenaire et le dossier lui a été transmis et accepté
      if (dossierUserId && dossierUserId === req.user.id.toString()) {
        hasModifyPermission = true;
      } else if (req.user.role === 'admin' || req.user.role === 'superadmin') {
        hasModifyPermission = true;
      } else if (isTransmittedToPartenaire) {
        hasModifyPermission = true;
      }

      if (!hasModifyPermission) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce dossier'
        });
      }

      // Partenaire : ne peut mettre à jour que les étapes supplémentaires
      if (isPartenaire && hasModifyPermission) {
        const etapesSupplementaires = req.body.etapesSupplementaires;
        if (Array.isArray(etapesSupplementaires)) {
          dossier.etapesSupplementaires = etapesSupplementaires.map((e, idx) => ({
            id: e.id || e.label || `step_${idx}`,
            label: e.label || '',
            date: e.date ? new Date(e.date) : undefined,
            ordre: typeof e.ordre === 'number' ? e.ordre : idx,
            addedAt: e.addedAt ? new Date(e.addedAt) : new Date(),
            addedBy: req.user.id
          }));
        }
        await dossier.save();
        const updated = await Dossier.findById(dossier._id).populate('user', 'firstName lastName email phone profilePhoto');
        return res.status(200).json({ success: true, message: 'Dossier mis à jour', dossier: updated });
      }

      const {
        titre,
        description,
        categorie,
        type,
        statut,
        priorite,
        dateEcheance,
        notes,
        assignedTo,
        motifRefus,
        notificationMessage,
        etapesSupplementaires: bodyEtapesSupplementaires,
        fraisExoneres,
        fraisExoneresMotif: bodyFraisExoneresMotif,
        montantTarificationFixe,
        paiementTarificationEffectue,
        notifyTarificationClient,
        tarificationClientMessage,
        isStandby,
        standbyReason,
        standbyUntil
      } = req.body;

      const shouldNotifyTarificationClientNow =
        notifyTarificationClient === true ||
        notifyTarificationClient === 'true' ||
        notifyTarificationClient === 1 ||
        notifyTarificationClient === '1';
      const isMontantTarificationPatch =
        montantTarificationFixe !== undefined && montantTarificationFixe !== null;

      /** Superadmin : enregistrer uniquement le montant fixe sans aucune notif/SMS « dossier modifié ». */
      const skipMontantSilentNotify =
        (req.body.skipDossierModificationNotify === true || req.body.skipDossierModificationNotify === 'true') &&
        req.user.role === 'superadmin' &&
        isMontantTarificationPatch &&
        !shouldNotifyTarificationClientNow;

      if ((montantTarificationFixe !== undefined || shouldNotifyTarificationClientNow) && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Seul le superadmin peut fixer un montant manuel ou envoyer la notification de tarification.'
        });
      }

      const oldStatut = dossier.statut;
      const oldAssignedTo = dossier.assignedTo ? dossier.assignedTo.toString() : null;
      /** Après save : retirer toute trace du montant fixe en base (évite null / 0 résiduel). */
      let shouldUnsetMontantTarificationFixeFields = false;

      const dossierSnapshotBeforeUpdate = {
        titre: (dossier.titre || '').trim(),
        description: dossier.description == null ? '' : String(dossier.description),
        categorie: dossier.categorie || '',
        type: dossier.type == null ? '' : String(dossier.type),
        statut: dossier.statut || '',
        priorite: dossier.priorite || '',
        notes: dossier.notes == null ? '' : String(dossier.notes),
        motifRefus: dossier.motifRefus == null ? '' : String(dossier.motifRefus),
        assignedTo: dossier.assignedTo ? dossier.assignedTo.toString() : null,
        dateEcheanceMs: dossier.dateEcheance ? new Date(dossier.dateEcheance).getTime() : null,
        etapesJson: JSON.stringify(dossier.etapesSupplementaires || []),
        fraisExoneres: !!dossier.fraisExoneres,
        fraisExoneresMotif: dossier.fraisExoneresMotif == null ? '' : String(dossier.fraisExoneresMotif),
        montantTarificationFixe: Number(dossier.montantTarificationFixe || 0),
        paiementTarificationEffectue: !!dossier.paiementTarificationEffectue,
        isStandby: !!dossier.isStandby,
        standbyReason: dossier.standbyReason == null ? '' : String(dossier.standbyReason),
        standbyUntilMs: dossier.standbyUntil ? new Date(dossier.standbyUntil).getTime() : null
      };

      // Appliquer directement les modifications
      if (titre !== undefined && titre !== null) {
        dossier.titre = typeof titre === 'string' ? titre.trim() : String(titre).trim();
      }
      if (description !== undefined) dossier.description = description;
      if (categorie) dossier.categorie = categorie;
      if (type !== undefined) dossier.type = type;
      if (statut) dossier.statut = statut;

      // Synchroniser le statut partenaire (tableau transmittedTo) quand l'admin change le statut du dossier.
      // Cela permet aux filtres des espaces client/partenaire de réagir immédiatement.
      if (statut && Array.isArray(dossier.transmittedTo) && dossier.transmittedTo.length > 0) {
        if (statut === 'en_cours') {
          dossier.transmittedTo.forEach((t) => {
            t.status = 'accepted';
          });
        } else if (statut === 'refuse') {
          dossier.transmittedTo.forEach((t) => {
            t.status = 'refused';
          });
        }
      }

      if (priorite) dossier.priorite = priorite;
      if (dateEcheance) dossier.dateEcheance = dateEcheance;
      if (notes !== undefined) dossier.notes = notes;
      if (motifRefus !== undefined) dossier.motifRefus = motifRefus;

      // Stand-by (admin/superadmin uniquement) : suspend temporairement le traitement sans changer le statut métier
      if (req.user.role === 'admin' || req.user.role === 'superadmin') {
        if (isStandby !== undefined && isStandby !== null) {
          const truthy =
            isStandby === true ||
            isStandby === 'true' ||
            isStandby === 1 ||
            isStandby === '1';
          const falsy =
            isStandby === false ||
            isStandby === 'false' ||
            isStandby === 0 ||
            isStandby === '0';

          if (truthy) {
            dossier.isStandby = true;
            dossier.standbyAt = new Date();
            dossier.standbyBy = req.user.id;
            if (standbyReason !== undefined && standbyReason !== null) {
              const reason = String(standbyReason).trim();
              dossier.standbyReason = reason ? reason.slice(0, 500) : undefined;
            }
            if (standbyUntil !== undefined) {
              if (standbyUntil) {
                const d = new Date(standbyUntil);
                dossier.standbyUntil = Number.isNaN(d.getTime()) ? undefined : d;
              } else {
                dossier.standbyUntil = undefined;
              }
            }
          } else if (falsy) {
            dossier.isStandby = false;
            dossier.standbyReason = undefined;
            dossier.standbyAt = undefined;
            dossier.standbyBy = undefined;
            dossier.standbyUntil = undefined;
          }
        } else {
          if (dossier.isStandby && standbyReason !== undefined) {
            const reason = String(standbyReason || '').trim();
            dossier.standbyReason = reason ? reason.slice(0, 500) : undefined;
          }
          if (dossier.isStandby && standbyUntil !== undefined) {
            if (standbyUntil) {
              const d = new Date(standbyUntil);
              dossier.standbyUntil = Number.isNaN(d.getTime()) ? undefined : d;
            } else {
              dossier.standbyUntil = undefined;
            }
          }
        }
      }

      // Étapes supplémentaires (admin/superadmin uniquement, partenaire géré au-dessus)
      if (Array.isArray(bodyEtapesSupplementaires)) {
        dossier.etapesSupplementaires = bodyEtapesSupplementaires.map((e, idx) => ({
          id: e.id || e.label || `step_${idx}`,
          label: e.label || '',
          date: e.date ? new Date(e.date) : undefined,
          ordre: typeof e.ordre === 'number' ? e.ordre : idx,
          addedAt: e.addedAt ? new Date(e.addedAt) : new Date(),
          addedBy: e.addedBy || req.user.id
        }));
      }

      // Exonération des frais (admin / superadmin uniquement)
      let fraisExoneresJustGranted = false;
      if (req.user.role === 'admin' || req.user.role === 'superadmin') {
        const wasFraisExoneresBefore = !!dossier.fraisExoneres;
        if (fraisExoneres !== undefined && fraisExoneres !== null) {
          const truthy =
            fraisExoneres === true ||
            fraisExoneres === 'true' ||
            fraisExoneres === 1 ||
            fraisExoneres === '1';
          const falsy =
            fraisExoneres === false ||
            fraisExoneres === 'false' ||
            fraisExoneres === 0 ||
            fraisExoneres === '0';
          if (truthy) {
            dossier.fraisExoneres = true;
            dossier.fraisExoneresAt = new Date();
            dossier.fraisExoneresBy = req.user.id;
            if (bodyFraisExoneresMotif !== undefined && bodyFraisExoneresMotif !== null) {
              const m = String(bodyFraisExoneresMotif).trim();
              dossier.fraisExoneresMotif = m ? m.slice(0, 500) : undefined;
            }
            fraisExoneresJustGranted = !wasFraisExoneresBefore;
          } else if (falsy) {
            dossier.fraisExoneres = false;
            dossier.fraisExoneresAt = undefined;
            dossier.fraisExoneresBy = undefined;
            dossier.fraisExoneresMotif = undefined;
          }
        } else if (bodyFraisExoneresMotif !== undefined && dossier.fraisExoneres) {
          const m = String(bodyFraisExoneresMotif || '').trim();
          dossier.fraisExoneresMotif = m ? m.slice(0, 500) : undefined;
        }
      }

      // Montant manuel de tarification (superadmin uniquement)
      if (req.user.role === 'superadmin' && montantTarificationFixe !== undefined) {
        const rawAmount = typeof montantTarificationFixe === 'string'
          ? montantTarificationFixe.replace(',', '.').trim()
          : montantTarificationFixe;
        const parsedAmount = Number(rawAmount);
        if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
          return res.status(400).json({
            success: false,
            message: 'Le montant de tarification fixe est invalide.'
          });
        }

        if (parsedAmount === 0) {
          dossier.montantTarificationFixe = undefined;
          dossier.montantTarificationFixeAt = undefined;
          dossier.montantTarificationFixeBy = undefined;
          shouldUnsetMontantTarificationFixeFields = true;
        } else {
          dossier.montantTarificationFixe = parsedAmount;
          dossier.montantTarificationFixeAt = new Date();
          dossier.montantTarificationFixeBy = req.user.id;
          // Pas de choix client quand un montant manuel est défini.
          dossier.formuleTarifaire = undefined;
          dossier.formuleTarifaireChoisieAt = undefined;
          dossier.formuleTarifaireReminderSent = true;
          // Un montant manuel n'est pas une exonération.
          dossier.fraisExoneres = false;
          dossier.fraisExoneresAt = undefined;
          dossier.fraisExoneresBy = undefined;
          dossier.fraisExoneresMotif = undefined;
        }
      }

      // Statut de paiement tarification (admin / superadmin)
      if (
        (req.user.role === 'admin' || req.user.role === 'superadmin') &&
        paiementTarificationEffectue !== undefined &&
        paiementTarificationEffectue !== null
      ) {
        const truthy =
          paiementTarificationEffectue === true ||
          paiementTarificationEffectue === 'true' ||
          paiementTarificationEffectue === 1 ||
          paiementTarificationEffectue === '1';
        const falsy =
          paiementTarificationEffectue === false ||
          paiementTarificationEffectue === 'false' ||
          paiementTarificationEffectue === 0 ||
          paiementTarificationEffectue === '0';

        if (truthy) {
          dossier.paiementTarificationEffectue = true;
          dossier.paiementTarificationEffectueAt = new Date();
          dossier.paiementTarificationEffectueBy = req.user.id;
        } else if (falsy) {
          dossier.paiementTarificationEffectue = false;
          dossier.paiementTarificationEffectueAt = undefined;
          dossier.paiementTarificationEffectueBy = undefined;
        }
      }

      // Gérer l'assignation
      if (assignedTo !== undefined) {
        if (assignedTo === '' || assignedTo === null) {
          dossier.assignedTo = null;
        } else {
          const assignedUser = await User.findById(assignedTo);
          if (!assignedUser) {
            return res.status(404).json({
              success: false,
              message: 'Membre de l\'équipe assigné non trouvé'
            });
          }
          // Vérifier que l'utilisateur assigné est un admin ou superadmin
          if (assignedUser.role !== 'admin' && assignedUser.role !== 'superadmin') {
            return res.status(400).json({
              success: false,
              message: 'Le dossier ne peut être assigné qu\'à un membre de l\'équipe (admin ou superadmin)'
            });
          }
          dossier.assignedTo = assignedTo;
        }
      }

      const dossierSnapshotAfterUpdate = {
        titre: (dossier.titre || '').trim(),
        description: dossier.description == null ? '' : String(dossier.description),
        categorie: dossier.categorie || '',
        type: dossier.type == null ? '' : String(dossier.type),
        statut: dossier.statut || '',
        priorite: dossier.priorite || '',
        notes: dossier.notes == null ? '' : String(dossier.notes),
        motifRefus: dossier.motifRefus == null ? '' : String(dossier.motifRefus),
        assignedTo: dossier.assignedTo ? dossier.assignedTo.toString() : null,
        dateEcheanceMs: dossier.dateEcheance ? new Date(dossier.dateEcheance).getTime() : null,
        etapesJson: JSON.stringify(dossier.etapesSupplementaires || []),
        fraisExoneres: !!dossier.fraisExoneres,
        fraisExoneresMotif: dossier.fraisExoneresMotif == null ? '' : String(dossier.fraisExoneresMotif),
        montantTarificationFixe: Number(dossier.montantTarificationFixe || 0),
        paiementTarificationEffectue: !!dossier.paiementTarificationEffectue,
        isStandby: !!dossier.isStandby,
        standbyReason: dossier.standbyReason == null ? '' : String(dossier.standbyReason),
        standbyUntilMs: dossier.standbyUntil ? new Date(dossier.standbyUntil).getTime() : null
      };

      const onlyTitreRenamed =
        dossierSnapshotBeforeUpdate.titre !== dossierSnapshotAfterUpdate.titre &&
        dossierSnapshotBeforeUpdate.description === dossierSnapshotAfterUpdate.description &&
        dossierSnapshotBeforeUpdate.categorie === dossierSnapshotAfterUpdate.categorie &&
        dossierSnapshotBeforeUpdate.type === dossierSnapshotAfterUpdate.type &&
        dossierSnapshotBeforeUpdate.statut === dossierSnapshotAfterUpdate.statut &&
        dossierSnapshotBeforeUpdate.priorite === dossierSnapshotAfterUpdate.priorite &&
        dossierSnapshotBeforeUpdate.notes === dossierSnapshotAfterUpdate.notes &&
        dossierSnapshotBeforeUpdate.motifRefus === dossierSnapshotAfterUpdate.motifRefus &&
        dossierSnapshotBeforeUpdate.assignedTo === dossierSnapshotAfterUpdate.assignedTo &&
        dossierSnapshotBeforeUpdate.dateEcheanceMs === dossierSnapshotAfterUpdate.dateEcheanceMs &&
        dossierSnapshotBeforeUpdate.etapesJson === dossierSnapshotAfterUpdate.etapesJson;

      // Édition des seules étapes (jalons) : pas de changement de statut métier → pas de SMS client
      const onlyEtapesEdited =
        dossierSnapshotBeforeUpdate.etapesJson !== dossierSnapshotAfterUpdate.etapesJson &&
        dossierSnapshotBeforeUpdate.titre === dossierSnapshotAfterUpdate.titre &&
        dossierSnapshotBeforeUpdate.description === dossierSnapshotAfterUpdate.description &&
        dossierSnapshotBeforeUpdate.categorie === dossierSnapshotAfterUpdate.categorie &&
        dossierSnapshotBeforeUpdate.type === dossierSnapshotAfterUpdate.type &&
        dossierSnapshotBeforeUpdate.statut === dossierSnapshotAfterUpdate.statut &&
        dossierSnapshotBeforeUpdate.priorite === dossierSnapshotAfterUpdate.priorite &&
        dossierSnapshotBeforeUpdate.notes === dossierSnapshotAfterUpdate.notes &&
        dossierSnapshotBeforeUpdate.motifRefus === dossierSnapshotAfterUpdate.motifRefus &&
        dossierSnapshotBeforeUpdate.assignedTo === dossierSnapshotAfterUpdate.assignedTo &&
        dossierSnapshotBeforeUpdate.dateEcheanceMs === dossierSnapshotAfterUpdate.dateEcheanceMs;

      const standbyFieldsChanged =
        dossierSnapshotBeforeUpdate.isStandby !== dossierSnapshotAfterUpdate.isStandby ||
        dossierSnapshotBeforeUpdate.standbyReason !== dossierSnapshotAfterUpdate.standbyReason ||
        dossierSnapshotBeforeUpdate.standbyUntilMs !== dossierSnapshotAfterUpdate.standbyUntilMs;

      const onlyStandbySettingChanged =
        standbyFieldsChanged &&
        dossierSnapshotBeforeUpdate.titre === dossierSnapshotAfterUpdate.titre &&
        dossierSnapshotBeforeUpdate.description === dossierSnapshotAfterUpdate.description &&
        dossierSnapshotBeforeUpdate.categorie === dossierSnapshotAfterUpdate.categorie &&
        dossierSnapshotBeforeUpdate.type === dossierSnapshotAfterUpdate.type &&
        dossierSnapshotBeforeUpdate.statut === dossierSnapshotAfterUpdate.statut &&
        dossierSnapshotBeforeUpdate.priorite === dossierSnapshotAfterUpdate.priorite &&
        dossierSnapshotBeforeUpdate.notes === dossierSnapshotAfterUpdate.notes &&
        dossierSnapshotBeforeUpdate.motifRefus === dossierSnapshotAfterUpdate.motifRefus &&
        dossierSnapshotBeforeUpdate.assignedTo === dossierSnapshotAfterUpdate.assignedTo &&
        dossierSnapshotBeforeUpdate.dateEcheanceMs === dossierSnapshotAfterUpdate.dateEcheanceMs &&
        dossierSnapshotBeforeUpdate.etapesJson === dossierSnapshotAfterUpdate.etapesJson;

      const tarificationFieldsChanged =
        dossierSnapshotBeforeUpdate.fraisExoneres !== dossierSnapshotAfterUpdate.fraisExoneres ||
        dossierSnapshotBeforeUpdate.fraisExoneresMotif !== dossierSnapshotAfterUpdate.fraisExoneresMotif ||
        dossierSnapshotBeforeUpdate.montantTarificationFixe !== dossierSnapshotAfterUpdate.montantTarificationFixe ||
        dossierSnapshotBeforeUpdate.paiementTarificationEffectue !== dossierSnapshotAfterUpdate.paiementTarificationEffectue ||
        shouldNotifyTarificationClientNow;

      const onlyTarificationSettingChanged =
        tarificationFieldsChanged &&
        dossierSnapshotBeforeUpdate.titre === dossierSnapshotAfterUpdate.titre &&
        dossierSnapshotBeforeUpdate.description === dossierSnapshotAfterUpdate.description &&
        dossierSnapshotBeforeUpdate.categorie === dossierSnapshotAfterUpdate.categorie &&
        dossierSnapshotBeforeUpdate.type === dossierSnapshotAfterUpdate.type &&
        dossierSnapshotBeforeUpdate.statut === dossierSnapshotAfterUpdate.statut &&
        dossierSnapshotBeforeUpdate.priorite === dossierSnapshotAfterUpdate.priorite &&
        dossierSnapshotBeforeUpdate.notes === dossierSnapshotAfterUpdate.notes &&
        dossierSnapshotBeforeUpdate.motifRefus === dossierSnapshotAfterUpdate.motifRefus &&
        dossierSnapshotBeforeUpdate.assignedTo === dossierSnapshotAfterUpdate.assignedTo &&
        dossierSnapshotBeforeUpdate.dateEcheanceMs === dossierSnapshotAfterUpdate.dateEcheanceMs &&
        dossierSnapshotBeforeUpdate.etapesJson === dossierSnapshotAfterUpdate.etapesJson &&
        !standbyFieldsChanged;

      await dossier.save();

      if (shouldUnsetMontantTarificationFixeFields) {
        await Dossier.updateOne(
          { _id: dossier._id },
          { $unset: { montantTarificationFixe: 1, montantTarificationFixeAt: 1, montantTarificationFixeBy: 1 } }
        );
      }

      // Recharger le dossier avec les données peuplées pour les notifications
      const dossierForNotification = await Dossier.findById(dossier._id)
        .populate('user', 'firstName lastName email phone profilePhoto');

      // Notifier toutes les parties concernées lors d'une modification
      // Cette fonction gère les notifications pour tous les rôles (admin, consulat, avocat)
      await notifyDossierModification(dossierForNotification, req.user, {
        oldStatut,
        newStatut: statut,
        oldAssignedTo,
        newAssignedTo: assignedTo,
        skipSms:
          skipMontantSilentNotify ||
          onlyTitreRenamed ||
          onlyEtapesEdited ||
          onlyStandbySettingChanged ||
          onlyTarificationSettingChanged,
        skipClientEtapesOnlyNotify: onlyEtapesEdited,
        skipClientTarificationOnlyNotify: onlyTarificationSettingChanged || skipMontantSilentNotify,
        skipAllPingAndSms: skipMontantSilentNotify,
      });

      // Pour les admins, créer aussi des notifications spécifiques au client (logique existante)
      if ((req.user.role === 'admin' || req.user.role === 'superadmin') && !skipMontantSilentNotify) {
        let userId = null;
        
        // Si le dossier a un user associé
        if (dossierForNotification.user) {
          userId = dossierForNotification.user._id ? dossierForNotification.user._id.toString() : dossierForNotification.user.toString();
        } 
        // Sinon, chercher l'utilisateur par email (clientEmail)
        else if (dossierForNotification.clientEmail) {
          try {
            const userByEmail = await User.findOne({ email: dossierForNotification.clientEmail.toLowerCase() });
            if (userByEmail) {
              userId = userByEmail._id.toString();
            }
          } catch (err) {
            console.error('Erreur lors de la recherche de l\'utilisateur par email:', err);
          }
        }
        
        // Si on a trouvé un userId, créer les notifications
        if (userId) {
          // Notification si le statut a changé
          if (statut && statut !== oldStatut) {
          const statutLabels = {
            recu: 'Reçu',
            accepte: 'Accepté',
            refuse: 'Refusé',
            en_attente_onboarding: 'En attente d\'onboarding (RDV)',
            en_cours_instruction: 'En cours d\'instruction (constitution dossier)',
            pieces_manquantes: 'Pièces manquantes (relance client)',
            dossier_complet: 'Dossier Complet',
            depose: 'Déposé',
            reception_confirmee: 'Réception confirmée',
            complement_demande: 'Complément demandé (avec date limite)',
            decision_defavorable: 'Décision défavorable',
            communication_motifs: 'Communication des Motifs',
            recours_preparation: 'Recours en préparation',
            refere_mesures_utiles: 'Référé Mesures Utiles',
            refere_suspension_rep: 'Référé suspension et REP',
            gain_cause: 'Gain de cause',
            rejet: 'Rejet',
            decision_favorable: 'Décision favorable'
          };
          
          // Utiliser le message personnalisé si fourni, sinon générer un message par défaut
          const messageNotification = notificationMessage && notificationMessage.trim() 
            ? notificationMessage.trim()
            : `Le statut de votre dossier "${dossierForNotification.titre}" a été modifié de "${statutLabels[oldStatut] || oldStatut}" à "${statutLabels[statut] || statut}".`;
          
          const titreNotification = `Statut du dossier modifié : ${statutLabels[statut] || statut}`;
          
          console.log('📧 Création de notification pour utilisateur:', userId, 'Message:', messageNotification);
          
          await createNotification(
            userId,
            'dossier_status_changed',
            titreNotification,
            messageNotification,
            `/client/dossiers`,
            { dossierId: dossierForNotification._id.toString(), oldStatut, newStatut: statut }
          );
          
            console.log('✅ Notification créée avec succès');
          }
          
          // ⚠️ Ne plus notifier le client sur les changements d'assignation de dossier
          // (ni assignation ni retrait d'assignation)
          
          // Notification générale si d'autres modifications (pas si seules les étapes ont changé)
          if (!onlyEtapesEdited && !onlyStandbySettingChanged && !onlyTarificationSettingChanged && (!statut || statut === oldStatut)) {
            if (assignedTo === undefined || assignedTo === oldAssignedTo) {
              await createNotification(
                userId,
                'dossier_updated',
                'Dossier modifié',
                `Votre dossier "${dossierForNotification.titre}" a été modifié par l'administrateur.`,
                `/client/dossiers`,
                { dossierId: dossierForNotification._id.toString() }
              );
            }
          }
        } else {
          console.warn('⚠️ Impossible de créer une notification : aucun utilisateur trouvé pour le dossier', dossierForNotification._id);
        }
      }

      // Client informé lors d'une nouvelle exonération des frais de tarification
      // (éviter le doublon si notifyTarificationClient est aussi envoyé dans la même requête)
      if (
        fraisExoneresJustGranted &&
        !isMontantTarificationPatch &&
        !shouldNotifyTarificationClientNow &&
        (req.user.role === 'admin' || req.user.role === 'superadmin')
      ) {
        try {
          let userIdExo = null;
          if (dossierForNotification.user) {
            userIdExo = dossierForNotification.user._id
              ? dossierForNotification.user._id.toString()
              : dossierForNotification.user.toString();
          } else if (dossierForNotification.clientEmail) {
            const u = await User.findOne({
              email: String(dossierForNotification.clientEmail).toLowerCase()
            });
            if (u) userIdExo = u._id.toString();
          }
          if (userIdExo) {
            const dossierTitle =
              dossierForNotification.titre ||
              dossierForNotification.numero ||
              'votre dossier';
            const motif =
              dossierForNotification.fraisExoneresMotif &&
              String(dossierForNotification.fraisExoneresMotif).trim();
            const baseMsg =
              `Vous êtes exonéré(e) des frais de prise en charge de votre dossier « ${dossierTitle} ». Aucune formule n’est à sélectionner dans l’espace Tarification. Les éventuelles frais d'envoi postal demeurent à votre charge.`;
            const messageExo = motif
              ? `${baseMsg} Précision de l’équipe : ${motif}`
              : baseMsg;
            await createNotification(
              userIdExo,
              'frais_tarification_exoneres',
              'Frais de tarification exonérés',
              messageExo,
              '/client/tarification',
              {
                dossierId: dossierForNotification._id.toString(),
                ...(motif ? { fraisExoneresMotif: motif.slice(0, 200) } : {})
              }
            );
            const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');
            const phoneUser = await User.findById(userIdExo).select('phone');
            if (phoneUser?.phone && !dossierForNotification.isStandby) {
              const formattedPhone = formatPhoneNumber(phoneUser.phone);
              if (formattedPhone) {
                await sendNotificationSMS(
                  formattedPhone,
                  'frais_tarification_exoneres',
                  { dossierTitle },
                  {
                    userId: userIdExo,
                    skipPreferences: true,
                    context: 'dossier',
                    contextId: dossierForNotification._id.toString()
                  }
                );
              }
            }
          }
        } catch (exoErr) {
          console.error('⚠️ Notification exonération frais non envoyée:', exoErr);
        }
      }

      // Notification tarification envoyée uniquement à la demande du superadmin (à tout moment)
      if (shouldNotifyTarificationClientNow && req.user.role === 'superadmin') {
        try {
          let clientUserId = null;
          if (dossierForNotification.user) {
            clientUserId = dossierForNotification.user._id
              ? dossierForNotification.user._id.toString()
              : dossierForNotification.user.toString();
          } else if (dossierForNotification.clientEmail) {
            const userByEmail = await User.findOne({
              email: String(dossierForNotification.clientEmail).toLowerCase()
            }).select('_id');
            if (userByEmail) clientUserId = userByEmail._id.toString();
          }

          if (clientUserId) {
            const dossierTitle = dossierForNotification.titre || dossierForNotification.numero || 'votre dossier';
            const montantFixe = Number(dossierForNotification.montantTarificationFixe || 0);
            const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');
            let titreTarif = 'Choisissez votre formule tarifaire';
            let messageTarif = `Votre dossier « ${dossierTitle} » nécessite un choix de formule (Standard ou Tawfekh) dans votre espace client, rubrique Tarification.`;
            let smsType = 'tarification_choice_reminder';
            let smsData = { dossierTitle };

            if (dossierForNotification.fraisExoneres) {
              const motif = dossierForNotification.fraisExoneresMotif
                ? String(dossierForNotification.fraisExoneresMotif).trim()
                : '';
              titreTarif = 'Frais de tarification exonérés';
              messageTarif = motif
                ? `Vous êtes exonéré(e) des frais de tarification pour le dossier « ${dossierTitle} ». Motif : ${motif}`
                : `Vous êtes exonéré(e) des frais de tarification pour le dossier « ${dossierTitle} ».`;
              smsType = 'frais_tarification_exoneres';
              smsData = { dossierTitle };
            } else if (montantFixe > 0) {
              const amountText = montantFixe.toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
              titreTarif = 'Montant du paiement convenu avec Ada Papers.';
              messageTarif = `Pour le dossier « ${dossierTitle} », le montant à payer a été fixé à ${amountText} EUR.`;
              smsType = 'manual';
              smsData = {
                message: `Dossier "${dossierTitle}" : montant de tarification fixe ${amountText} EUR. Ada Papers.`
              };
            }

            const tarifMsgExtra =
              tarificationClientMessage != null && String(tarificationClientMessage).trim()
                ? String(tarificationClientMessage).trim().slice(0, 2000)
                : '';
            if (tarifMsgExtra) {
              messageTarif = `${messageTarif}\n\n— Message de l’équipe —\n${tarifMsgExtra}`;
            }

            await createNotification(
              clientUserId,
              'tarification_choice_requested',
              titreTarif,
              messageTarif,
              '/client/tarification',
              {
                dossierId: dossierForNotification._id.toString(),
                ...(tarifMsgExtra ? { tarificationClientMessage: tarifMsgExtra.slice(0, 500) } : {})
              }
            );

            const phoneUser = await User.findById(clientUserId).select('phone');
            if (phoneUser?.phone && !dossierForNotification.isStandby && !isMontantTarificationPatch) {
              const formattedPhone = formatPhoneNumber(phoneUser.phone);
              if (formattedPhone) {
                await sendNotificationSMS(
                  formattedPhone,
                  smsType,
                  smsData,
                  {
                    userId: clientUserId,
                    skipPreferences: true,
                    context: 'tarification_reminder',
                    contextId: dossier._id.toString()
                  }
                );
              }
            }

            dossier.tarificationNotificationSentAt = new Date();
            await dossier.save();
          } else {
            console.warn('⚠️ Notification tarification non envoyée: client introuvable pour ce dossier', dossier._id);
          }
        } catch (tarifErr) {
          console.error('⚠️ Notification tarification manuelle non envoyée:', tarifErr);
        }
      }

      // Logger l'action
      try {
        const Log = require('../models/Log');
        await Log.create({
          action: 'dossier_updated',
          user: req.user.id,
          userEmail: req.user.email,
          description: `${req.user.email} a modifié le dossier "${dossier.titre}"`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent'),
          metadata: {
            dossierId: dossier._id.toString(),
            titre: dossier.titre
          }
        });
      } catch (logError) {
        console.error('Erreur lors de l\'enregistrement du log:', logError);
      }


      const dossierPopulated = await Dossier.findById(dossier._id)
        .populate('user', 'firstName lastName email phone profilePhoto')
        .populate('createdBy', 'firstName lastName email');

      res.json({
        success: true,
        message: 'Dossier mis à jour avec succès',
        dossier: dossierPopulated
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du dossier:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   PATCH /api/user/dossiers/:id/cancel
// @desc    Annuler un dossier (client seulement)
// @access  Private
router.patch('/:id/cancel', protect, async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }

    // Vérifier que l'utilisateur est le propriétaire du dossier
    const userId = req.user.id;
    const dossierUserId = dossier.user ? (dossier.user._id ? dossier.user._id.toString() : dossier.user.toString()) : null;
    
    if (dossierUserId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas la permission d\'annuler ce dossier'
      });
    }

    // Vérifier que le dossier n'est pas déjà annulé ou dans un statut final
    const statutsFinaux = ['annule', 'decision_favorable', 'decision_defavorable', 'rejet', 'gain_cause'];
    if (statutsFinaux.includes(dossier.statut)) {
      return res.status(400).json({
        success: false,
        message: 'Ce dossier ne peut pas être annulé car il est déjà dans un statut final'
      });
    }

    // Mettre à jour le statut à "annule"
    dossier.statut = 'annule';
    dossier.notes = (dossier.notes || '') + `\n\n[Dossier annulé par le client le ${new Date().toLocaleDateString('fr-FR')}]`;
    await dossier.save();

    // Notifier les admins
    try {
      const admins = await User.find({
        role: { $in: ['admin', 'superadmin'] },
        isActive: true
      });

      for (const admin of admins) {
        await createNotification(
          admin._id.toString(),
          'dossier_cancelled',
          'Dossier annulé par le client',
          `${req.user.firstName} ${req.user.lastName} (${req.user.email}) a annulé le dossier "${dossier.titre}".`,
          `/admin/dossiers/${dossier._id}`,
          { 
            dossierId: dossier._id.toString(), 
            titre: dossier.titre,
            clientId: userId,
            clientEmail: req.user.email
          }
        );
      }
      console.log(`✅ Notifications envoyées à ${admins.length} administrateur(s) pour l'annulation du dossier`);
    } catch (notifError) {
      console.error('❌ Erreur lors de la notification des admins:', notifError);
    }

    // Logger l'action
    try {
      const Log = require('../models/Log');
      await Log.create({
        action: 'dossier_cancelled',
        user: userId,
        userEmail: req.user.email,
        description: `${req.user.email} a annulé le dossier "${dossier.titre}"`,
        ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
        userAgent: req.get('user-agent'),
        metadata: {
          dossierId: dossier._id.toString(),
          titre: dossier.titre
        }
      });
    } catch (logError) {
      console.error('Erreur lors de l\'enregistrement du log:', logError);
    }

    const dossierPopulated = await Dossier.findById(dossier._id)
      .populate('user', 'firstName lastName email phone profilePhoto')
      .populate('createdBy', 'firstName lastName email');

    res.json({
      success: true,
      message: 'Dossier annulé avec succès',
      dossier: dossierPopulated
    });
  } catch (error) {
    console.error('Erreur lors de l\'annulation du dossier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   DELETE /api/user/dossiers/:id
// @desc    Supprimer un dossier
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id)
      .populate('user', 'firstName lastName email profilePhoto')
      .populate('createdBy', 'firstName lastName email');

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }

    // Ajouter le dossier à la corbeille avant suppression
    try {
      const Trash = require('../models/Trash');
      const dossierData = dossier.toObject();
      
      await Trash.create({
        itemType: 'dossier',
        originalId: dossier._id,
        itemData: dossierData,
        deletedBy: req.user.id,
        originalOwner: dossier.user?._id || dossier.user,
        origin: req.headers.referer || 'unknown',
        metadata: {
          titre: dossier.titre,
          numero: dossier.numero,
          categorie: dossier.categorie,
          statut: dossier.statut
        }
      });
      console.log('✅ Dossier ajouté à la corbeille:', dossier._id);
    } catch (trashError) {
      console.error('⚠️ Erreur lors de l\'ajout à la corbeille (continuation de la suppression):', trashError);
      // Continuer la suppression même si l'ajout à la corbeille échoue
    }

    // Logger l'action
    try {
      const Log = require('../models/Log');
      await Log.create({
        action: 'dossier_deleted',
        user: req.user.id,
        userEmail: req.user.email,
        description: `${req.user.email} a supprimé le dossier "${dossier.titre}"`,
        ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
        userAgent: req.get('user-agent'),
        metadata: {
          dossierId: dossier._id.toString(),
          titre: dossier.titre
        }
      });
    } catch (logError) {
      console.error('Erreur lors de l\'enregistrement du log:', logError);
    }

    // Créer une notification pour l'utilisateur du dossier avant suppression
    if (dossier.user) {
      const userId = dossier.user._id ? dossier.user._id.toString() : dossier.user.toString();
      await createNotification(
        userId,
        'dossier_deleted',
        'Dossier supprimé',
        `Votre dossier "${dossier.titre}" a été supprimé par l'administrateur.`,
        `/client/dossiers`,
        { dossierId: dossier._id.toString(), titre: dossier.titre }
      );
    }

    await Dossier.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Dossier supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du dossier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// ============================================
// ROUTES DE COLLABORATION
// ============================================

// @route   POST /api/user/dossiers/:id/open
// @desc    Ouvrir un dossier (devenir collaborateur actif)
// @access  Private (Admin/SuperAdmin ou membre de l'équipe)
router.post('/:id/open', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const dossierId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const dossier = await Dossier.findById(dossierId)
      .populate('teamMembers', 'firstName lastName email role')
      .populate('teamLeader', 'firstName lastName email role')
      .populate('activeCollaborators.user', 'firstName lastName email role');

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }

    // Vérifier si le dossier est clôturé ou annulé
    const statutsFinaux = ['annule', 'decision_favorable', 'decision_defavorable', 'rejet', 'gain_cause'];
    const isDossierClosed = statutsFinaux.includes(dossier.statut);

    // SuperAdmin peut toujours ouvrir même si clôturé
    if (isDossierClosed && userRole !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Ce dossier est clôturé ou annulé. La collaboration n\'est plus possible.',
        dossierClosed: true
      });
    }

    // Vérifier que l'utilisateur est membre de l'équipe ou superadmin
    const isTeamMember = dossier.teamMembers.some(member => 
      (member._id || member).toString() === userId.toString()
    );
    const isSuperAdmin = userRole === 'superadmin';

    if (!isTeamMember && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous devez être membre de l\'équipe pour collaborer sur ce dossier'
      });
    }

    // Vérifier si l'utilisateur est déjà collaborateur actif
    const existingCollaborator = dossier.activeCollaborators.find(collab => 
      (collab.user._id || collab.user).toString() === userId.toString()
    );

    if (existingCollaborator) {
      // Mettre à jour la dernière activité
      existingCollaborator.lastActivity = new Date();
      await dossier.save();
    } else {
      // Ajouter comme collaborateur actif
      dossier.activeCollaborators.push({
        user: userId,
        joinedAt: new Date(),
        lastActivity: new Date()
      });
      await dossier.save();

      // Notifier les autres collaborateurs
      const otherCollaborators = dossier.activeCollaborators
        .filter(collab => (collab.user._id || collab.user).toString() !== userId.toString())
        .map(collab => collab.user._id || collab.user);

      const currentUser = await User.findById(userId);
      const dossierTitre = dossier.titre || `Dossier ${dossier.numero || dossier._id}`;

      for (const collaboratorId of otherCollaborators) {
        await createNotification(
          collaboratorId,
          'dossier_collaborator_active',
          'Collaborateur actif sur le dossier',
          `L'administrateur ${currentUser.firstName} ${currentUser.lastName} est actuellement collaborateur actif sur le dossier "${dossierTitre}".`,
          `/admin/dossiers/${dossier._id}`,
          {
            dossierId: dossier._id.toString(),
            titre: dossierTitre,
            activeCollaboratorId: userId.toString(),
            activeCollaboratorName: `${currentUser.firstName} ${currentUser.lastName}`
          }
        );
      }

      // Notifier aussi les autres membres de l'équipe qui ne sont pas encore collaborateurs actifs
      const teamMemberIds = dossier.teamMembers
        .map(member => (member._id || member).toString())
        .filter(id => id !== userId.toString() && !otherCollaborators.some(collabId => collabId.toString() === id));

      for (const memberId of teamMemberIds) {
        await createNotification(
          memberId,
          'dossier_collaborator_active',
          'Collaborateur actif sur le dossier',
          `L'administrateur ${currentUser.firstName} ${currentUser.lastName} est actuellement collaborateur actif sur le dossier "${dossierTitre}".`,
          `/admin/dossiers/${dossier._id}`,
          {
            dossierId: dossier._id.toString(),
            titre: dossierTitre,
            activeCollaboratorId: userId.toString(),
            activeCollaboratorName: `${currentUser.firstName} ${currentUser.lastName}`
          }
        );
      }

      console.log(`✅ ${currentUser.firstName} ${currentUser.lastName} est maintenant collaborateur actif sur le dossier ${dossier._id}`);
    }

    const updatedDossier = await Dossier.findById(dossierId)
      .populate('teamMembers', 'firstName lastName email role')
      .populate('teamLeader', 'firstName lastName email role')
      .populate('activeCollaborators.user', 'firstName lastName email role');

    res.json({
      success: true,
      message: 'Dossier ouvert avec succès. Vous êtes maintenant collaborateur actif.',
      dossier: updatedDossier,
      isCollaborator: true
    });
  } catch (error) {
    console.error('Erreur lors de l\'ouverture du dossier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/user/dossiers/:id/close-collaboration
// @desc    Fermer la collaboration (quitter le statut de collaborateur actif)
// @access  Private
router.post('/:id/close-collaboration', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const dossierId = req.params.id;
    const userId = req.user.id;

    const dossier = await Dossier.findById(dossierId);

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }

    // Retirer l'utilisateur des collaborateurs actifs
    dossier.activeCollaborators = dossier.activeCollaborators.filter(collab => 
      (collab.user._id || collab.user).toString() !== userId.toString()
    );
    await dossier.save();

    res.json({
      success: true,
      message: 'Collaboration fermée avec succès',
      dossier
    });
  } catch (error) {
    console.error('Erreur lors de la fermeture de la collaboration:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/user/dossiers/:id/collaborators
// @desc    Obtenir la liste des collaborateurs actifs
// @access  Private
router.get('/:id/collaborators', protect, async (req, res) => {
  try {
    const dossierId = req.params.id;

    const dossier = await Dossier.findById(dossierId)
      .populate('activeCollaborators.user', 'firstName lastName email role')
      .populate('teamLeader', 'firstName lastName email role');

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }

    // Vérifier si le dossier est clôturé
    const statutsFinaux = ['annule', 'decision_favorable', 'decision_defavorable', 'rejet', 'gain_cause'];
    const isDossierClosed = statutsFinaux.includes(dossier.statut);

    res.json({
      success: true,
      collaborators: dossier.activeCollaborators || [],
      teamLeader: dossier.teamLeader || null,
      isDossierClosed,
      message: isDossierClosed ? 'Ce dossier est clôturé. La collaboration n\'est plus active.' : null
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des collaborateurs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/user/dossiers/:id/transmit
// @desc    Transmettre un dossier à un partenaire
// @access  Private (Admin/Superadmin)
router.post('/:id/transmit', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { partenaireId, notes } = req.body;
    
    // Validation des paramètres
    if (!partenaireId) {
      return res.status(400).json({ 
        success: false, 
        message: 'L\'ID du partenaire est requis' 
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID de dossier invalide' 
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(partenaireId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID de partenaire invalide' 
      });
    }
    
    const dossier = await Dossier.findById(req.params.id);
    
    if (!dossier) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dossier non trouvé' 
      });
    }
    
    // Vérifier que le partenaire existe et a le bon rôle
    const partenaire = await User.findById(partenaireId);
    if (!partenaire || partenaire.role !== 'partenaire') {
      return res.status(400).json({ 
        success: false, 
        message: 'Partenaire invalide ou n\'existe pas' 
      });
    }
    
    // Vérifier si déjà transmis
    const alreadyTransmitted = dossier.transmittedTo && dossier.transmittedTo.some(
      t => {
        if (!t.partenaire) return false;
        const partenaireIdInTransmission = t.partenaire._id 
          ? t.partenaire._id.toString() 
          : t.partenaire.toString();
        return partenaireIdInTransmission === partenaireId;
      }
    );
    
    if (alreadyTransmitted) {
      return res.status(400).json({ 
        success: false, 
        message: 'Dossier déjà transmis à ce partenaire' 
      });
    }
    
    // Ajouter la transmission
    if (!dossier.transmittedTo) {
      dossier.transmittedTo = [];
    }
    
    dossier.transmittedTo.push({
      partenaire: partenaireId,
      transmittedBy: req.user.id,
      notes: notes || '',
      status: 'pending'
    });
    
    await dossier.save();
    
    // Populate pour la réponse
    await dossier.populate('transmittedTo.partenaire', 'firstName lastName email partenaireInfo');
    await dossier.populate('transmittedTo.transmittedBy', 'firstName lastName email');
    
    // Créer une notification pour le partenaire
    await Notification.create({
      user: partenaireId,
      type: 'dossier_transmitted',
      titre: 'Nouveau dossier transmis',
      message: `Un dossier vous a été transmis : ${dossier.titre || dossier.numero || 'Sans titre'}`,
      lien: `/partenaire/dossiers/${dossier._id}`,
      metadata: {
        dossierId: dossier._id.toString(),
        transmittedBy: req.user.id.toString()
      }
    });
    // SMS pour le partenaire (si téléphone disponible et préférences OK)
    try {
      if (partenaire.phone) {
        const formattedPhone = formatPhoneNumber(partenaire.phone);
        if (formattedPhone) {
          await sendNotificationSMS(
            formattedPhone,
            'dossier_transmitted',
            {
              dossierTitle: dossier.titre || dossier.numero || 'Sans titre',
              partenaireName: partenaire.partenaireInfo?.nomOrganisme || `${partenaire.firstName || ''} ${partenaire.lastName || ''}`.trim() || 'Partenaire',
            },
            {
              userId: partenaire._id.toString(),
              context: 'dossier',
              contextId: dossier._id.toString(),
            }
          );
        }
      }
    } catch (smsError) {
      console.error('⚠️ Erreur lors de l\'envoi du SMS au partenaire pour la transmission du dossier:', smsError);
    }
    
    // Notifier aussi le client si le dossier a un propriétaire
    if (dossier.user) {
      // S'assurer que dossier.user est un ObjectId (peut être un objet ou un ObjectId)
      const userId = dossier.user._id ? dossier.user._id.toString() : dossier.user.toString();
      
      await Notification.create({
        user: userId,
        type: 'dossier_transmitted',
        titre: 'Dossier transmis à un partenaire',
        message: `Votre dossier ${dossier.numero || dossier._id} a été transmis à ${partenaire.partenaireInfo?.nomOrganisme || partenaire.email || 'un partenaire'}`,
        lien: `/client/dossiers/${dossier._id}`,
        metadata: {
          dossierId: dossier._id.toString(),
          partenaireId: partenaireId.toString ? partenaireId.toString() : String(partenaireId)
        }
      });
      // SMS pour le client (si téléphone disponible et préférences OK)
      try {
        const clientUser = await User.findById(userId);
        if (clientUser?.phone) {
          const formattedPhone = formatPhoneNumber(clientUser.phone);
          if (formattedPhone) {
            await sendNotificationSMS(
              formattedPhone,
              'dossier_transmitted',
              {
                dossierTitle: dossier.titre || dossier.numero || 'Sans titre',
                partenaireName: partenaire.partenaireInfo?.nomOrganisme || partenaire.email || 'un partenaire',
              },
              {
                userId: clientUser._id.toString(),
                context: 'dossier',
                contextId: dossier._id.toString(),
              }
            );
          }
        }
      } catch (smsError) {
        console.error('⚠️ Erreur lors de l\'envoi du SMS au client pour la transmission du dossier:', smsError);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Dossier transmis avec succès', 
      dossier 
    });
  } catch (error) {
    console.error('❌ Erreur lors de la transmission du dossier:', error);
    console.error('❌ Stack:', error.stack);
    console.error('❌ Détails:', {
      dossierId: req.params.id,
      partenaireId: req.body?.partenaireId,
      userId: req.user?.id
    });
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur lors de la transmission du dossier',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Une erreur est survenue'
    });
  }
});

// @route   DELETE /api/user/dossiers/:id/transmit/:partenaireId
// @desc    Retirer la transmission d'un dossier à un partenaire
// @access  Private (Admin/Superadmin)
router.delete('/:id/transmit/:partenaireId', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { id, partenaireId } = req.params;
    const dossier = await Dossier.findById(id);
    
    if (!dossier) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dossier non trouvé' 
      });
    }
    
    if (!dossier.transmittedTo || dossier.transmittedTo.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Aucune transmission trouvée' 
      });
    }
    
    // Retirer la transmission
    dossier.transmittedTo = dossier.transmittedTo.filter((t) => 
      t.partenaire && t.partenaire.toString() !== partenaireId
    );
    
    await dossier.save();
    
    // Notifier le partenaire
    const Notification = require('../models/Notification');
    await Notification.create({
      user: partenaireId,
      type: 'dossier_updated',
      titre: 'Transmission retirée',
      message: `La transmission du dossier ${dossier.numero || dossier._id} vous a été retirée`,
      lien: '/partenaire/dossiers',
      metadata: {
        dossierId: dossier._id.toString()
      }
    });
    
    res.json({ 
      success: true, 
      message: 'Transmission retirée avec succès', 
      dossier 
    });
  } catch (error) {
    console.error('Erreur lors du retrait de la transmission:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message 
    });
  }
});

// @route   POST /api/user/dossiers/:id/acknowledge
// @desc    Accuser réception d'un dossier transmis (accept/refuse)
// @access  Private (Partenaire)
router.post('/:id/acknowledge', authorize('partenaire'), async (req, res) => {
  try {
    const { action, notes } = req.body; // action: 'accept' | 'refuse'
    const dossier = await Dossier.findById(req.params.id);
    
    if (!dossier) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dossier non trouvé' 
      });
    }
    
    if (!dossier.transmittedTo || dossier.transmittedTo.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ce dossier n\'a pas été transmis' 
      });
    }
    
    const transmission = dossier.transmittedTo.find(
      t => t.partenaire && t.partenaire.toString() === req.user.id.toString()
    );
    
    if (!transmission) {
      return res.status(403).json({ 
        success: false, 
        message: 'Dossier non transmis à votre compte' 
      });
    }
    
    if (action !== 'accept' && action !== 'refuse') {
      return res.status(400).json({ 
        success: false, 
        message: 'Action invalide. Utilisez "accept" ou "refuse"' 
      });
    }
    
    transmission.acknowledged = true;
    transmission.acknowledgedAt = new Date();
    transmission.status = action === 'accept' ? 'accepted' : 'refused';
    if (notes) transmission.notes = notes;
    
    await dossier.save();
    
    // Populate pour la réponse
    await dossier.populate('transmittedTo.partenaire', 'firstName lastName email partenaireInfo');
    await dossier.populate('transmittedTo.transmittedBy', 'firstName lastName email');
    
    // Notifier l'admin
    const User = require('../models/User');
    const Notification = require('../models/Notification');
    const admins = await User.find({ 
      role: { $in: ['admin', 'superadmin'] },
      isActive: { $ne: false }
    });
    
    const partenaireName = req.user.partenaireInfo?.nomOrganisme || req.user.email || 'Partenaire';
    
    for (const admin of admins) {
      await Notification.create({
        user: admin._id,
        type: 'dossier_acknowledged',
        titre: `Dossier ${action === 'accept' ? 'accepté' : 'refusé'} par le partenaire`,
        message: `Le partenaire ${partenaireName} a ${action === 'accept' ? 'accepté' : 'refusé'} le dossier ${dossier.numero || dossier._id}`,
        lien: `/admin/dossiers/${dossier._id}`,
        metadata: {
          dossierId: dossier._id.toString(),
          partenaireId: req.user.id.toString(),
          action
        }
      });
    }
    
    // Notifier le client si le dossier a un propriétaire
    if (dossier.user) {
      await Notification.create({
        user: dossier.user,
        type: 'dossier_acknowledged',
        titre: `Dossier ${action === 'accept' ? 'accepté' : 'refusé'}`,
        message: `Le partenaire ${partenaireName} a ${action === 'accept' ? 'accepté' : 'refusé'} votre dossier ${dossier.numero || dossier._id}`,
        lien: `/client/dossiers/${dossier._id}`,
        metadata: {
          dossierId: dossier._id.toString(),
          partenaireId: req.user.id.toString(),
          action
        }
      });
    }
    
    // Si le dossier est accepté, s'assurer que tous les documents sont accessibles
    // (Ils le sont déjà via la logique d'accès, mais on log cette action)
    if (action === 'accept') {
      const Document = require('../models/Document');
      const documents = await Document.find({ dossierId: dossier._id });
      console.log(`✅ Dossier accepté par le partenaire. ${documents.length} document(s) accessibles.`);
      
      // Logger l'action d'acceptation
      try {
        const Log = require('../models/Log');
        await Log.create({
          action: 'dossier_updated',
          user: req.user.id,
          userEmail: req.user.email,
          description: `Partenaire ${req.user.email} a accepté le dossier "${dossier.titre || dossier.numero}"`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent'),
          metadata: {
            dossierId: dossier._id.toString(),
            action: 'accepted_by_partenaire',
            documentsCount: documents.length
          }
        });
      } catch (logError) {
        console.error('Erreur lors de l\'enregistrement du log:', logError);
      }
    }
    
    res.json({ 
      success: true, 
      message: `Dossier ${action === 'accept' ? 'accepté' : 'refusé'}`, 
      dossier 
    });
  } catch (error) {
    console.error('Erreur lors de l\'accusé de réception:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message 
    });
  }
});

// @route   POST /api/user/dossiers/:id/discharge
// @desc    Se décharger d'un dossier transmis (Partenaire seulement - annule la transmission sans supprimer le dossier)
// @access  Private (Partenaire)
router.post('/:id/discharge', protect, authorize('partenaire'), async (req, res) => {
  try {
    const { notes } = req.body;
    const dossier = await Dossier.findById(req.params.id);
    
    if (!dossier) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dossier non trouvé' 
      });
    }
    
    if (!dossier.transmittedTo || dossier.transmittedTo.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ce dossier n\'a pas été transmis' 
      });
    }
    
    // Trouver la transmission pour ce partenaire
    const transmissionIndex = dossier.transmittedTo.findIndex(
      t => t.partenaire && t.partenaire.toString() === req.user.id.toString()
    );
    
    if (transmissionIndex === -1) {
      return res.status(403).json({ 
        success: false, 
        message: 'Ce dossier ne vous a pas été transmis' 
      });
    }
    
    const transmission = dossier.transmittedTo[transmissionIndex];
    
    // Retirer la transmission du tableau
    dossier.transmittedTo.splice(transmissionIndex, 1);
    await dossier.save();
    
    // Populate pour la réponse
    await dossier.populate('transmittedTo.partenaire', 'firstName lastName email partenaireInfo');
    await dossier.populate('transmittedTo.transmittedBy', 'firstName lastName email');
    
    // Notifier les administrateurs
    const User = require('../models/User');
    const Notification = require('../models/Notification');
    const admins = await User.find({ 
      role: { $in: ['admin', 'superadmin'] },
      isActive: { $ne: false }
    });
    
    const partenaireName = req.user.partenaireInfo?.nomOrganisme || req.user.email || 'Partenaire';
    
    for (const admin of admins) {
      await Notification.create({
        user: admin._id,
        type: 'dossier_updated',
        titre: 'Partenaire s\'est déchargé du dossier',
        message: `Le partenaire ${partenaireName} s'est déchargé du dossier ${dossier.numero || dossier._id}${notes ? `. Raison: ${notes}` : ''}`,
        lien: `/admin/dossiers/${dossier._id}`,
        metadata: {
          dossierId: dossier._id.toString(),
          partenaireId: req.user.id.toString(),
          action: 'discharge',
          notes: notes || ''
        }
      });
    }
    
    // Logger l'action
    try {
      const Log = require('../models/Log');
      await Log.create({
        action: 'dossier_discharged',
        user: req.user.id,
        userEmail: req.user.email,
        description: `Partenaire ${req.user.email} s'est déchargé du dossier "${dossier.titre || dossier.numero}"${notes ? `. Raison: ${notes}` : ''}`,
        ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
        userAgent: req.get('user-agent'),
        metadata: {
          dossierId: dossier._id.toString(),
          action: 'discharge',
          notes: notes || ''
        }
      });
    } catch (logError) {
      console.error('Erreur lors de l\'enregistrement du log:', logError);
    }
    
    res.json({ 
      success: true, 
      message: 'Vous vous êtes déchargé du dossier avec succès. Le dossier reste disponible pour les administrateurs.', 
      dossier 
    });
  } catch (error) {
    console.error('Erreur lors de la décharge du dossier:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message 
    });
  }
});

// @route   GET /api/user/dossiers/:id/history
// @desc    Récupérer l'historique complet d'un dossier (changements de statut, modifications, etc.)
// @access  Private (Admin, Superadmin, Partenaire avec accès au dossier)
router.get('/:id/history', async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    
    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }
    
    // Vérifier l'accès
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const isPartenaire = req.user.role === 'partenaire';
    const isOwner = dossier.user && dossier.user.toString() === req.user.id.toString();
    const isAssigned = dossier.assignedTo && dossier.assignedTo.toString() === req.user.id.toString();
    const isTransmittedToPartenaire = isPartenaire && dossier.transmittedTo && dossier.transmittedTo.some(
      t => {
        if (!t.partenaire) return false;
        const partenaireId = t.partenaire._id ? t.partenaire._id.toString() : t.partenaire.toString();
        return partenaireId === req.user.id.toString();
      }
    );
    
    if (!isAdmin && !isOwner && !isAssigned && !isTransmittedToPartenaire) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à l\'historique de ce dossier'
      });
    }
    
    // Récupérer tous les logs liés à ce dossier
    const Log = require('../models/Log');
    const logs = await Log.find({
      $or: [
        { 'metadata.dossierId': dossier._id.toString() },
        { description: { $regex: dossier._id.toString(), $options: 'i' } }
      ]
    })
      .populate('user', 'firstName lastName email role profilePhoto')
      .sort({ createdAt: -1 });
    
    // Créer un historique structuré
    const history = [];
    
    // Ajouter la création du dossier
    history.push({
      type: 'creation',
      date: dossier.createdAt,
      user: dossier.createdBy,
      description: 'Dossier créé',
      details: {
        titre: dossier.titre,
        categorie: dossier.categorie,
        type: dossier.type,
        statut: dossier.statut
      }
    });
    
    // Ajouter les logs
    for (const log of logs) {
      let type = 'modification';
      let description = log.description;
      
      if (log.action === 'dossier_created') {
        type = 'creation';
      } else if (log.action === 'dossier_updated') {
        type = 'modification';
        if (log.metadata?.newStatut && log.metadata?.oldStatut) {
          type = 'statut_change';
          description = `Statut changé de "${log.metadata.oldStatut}" à "${log.metadata.newStatut}"`;
        }
      } else if (log.action === 'dossier_deleted') {
        type = 'suppression';
      }
      
      history.push({
        type,
        date: log.createdAt,
        user: log.user,
        description,
        details: log.metadata || {}
      });
    }
    
    // Ajouter les transmissions aux partenaires
    if (dossier.transmittedTo && dossier.transmittedTo.length > 0) {
      for (const transmission of dossier.transmittedTo) {
        await dossier.populate('transmittedTo.partenaire', 'firstName lastName email partenaireInfo');
        await dossier.populate('transmittedTo.transmittedBy', 'firstName lastName email');
        
        const trans = dossier.transmittedTo.find(t => 
          (t.partenaire?._id?.toString() || t.partenaire?.toString()) === 
          (transmission.partenaire?._id?.toString() || transmission.partenaire?.toString())
        );
        
        if (trans) {
          history.push({
            type: 'transmission',
            date: trans.transmittedAt || new Date(),
            user: trans.transmittedBy,
            description: `Dossier transmis à ${trans.partenaire?.partenaireInfo?.nomOrganisme || trans.partenaire?.email || 'partenaire'}`,
            details: {
              partenaire: trans.partenaire,
              status: trans.status,
              acknowledged: trans.acknowledged,
              acknowledgedAt: trans.acknowledgedAt,
              notes: trans.notes
            }
          });
          
          if (trans.acknowledgedAt) {
            history.push({
              type: 'acknowledgment',
              date: trans.acknowledgedAt,
              user: trans.partenaire,
              description: `Dossier ${trans.status === 'accepted' ? 'accepté' : 'refusé'} par le partenaire`,
              details: {
                status: trans.status,
                notes: trans.notes
              }
            });
          }
        }
      }
    }
    
    // Trier par date (plus récent en premier)
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message 
    });
  }
});

module.exports = router;

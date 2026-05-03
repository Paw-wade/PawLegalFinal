const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  handleImpersonation,
  getEffectiveUserId,
  getEffectiveRole,
  forbidImpersonationWrite,
} = require('../middleware/impersonation');
const { body, validationResult } = require('express-validator');
const Task = require('../models/Task');
const User = require('../models/User');
const Dossier = require('../models/Dossier');
const Notification = require('../models/Notification');
const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');

// @route   GET /api/tasks
// @desc    Récupérer toutes les tâches (Admin seulement)
// @access  Private/Admin
router.get('/', protect, handleImpersonation, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { statut, assignedTo, createdBy, dossier, priorite, includeArchived } = req.query;
    
    const filter = {};
    
    // Appliquer les filtres normaux
    if (statut) filter.statut = statut;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (createdBy) filter.createdBy = createdBy;
    if (dossier) filter.dossier = dossier;
    if (priorite) filter.priorite = priorite;
    
    // Par défaut, exclure les tâches archivées sauf si includeArchived=true
    if (includeArchived !== 'true') {
      filter.archived = { $ne: true };
    }

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'firstName lastName email role')
      .populate('createdBy', 'firstName lastName email role')
      .populate('completedBy', 'firstName lastName email role')
      .populate('dossier', 'titre numero statut')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: tasks.length,
      tasks
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des tâches:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/tasks/my
// @desc    Récupérer les tâches assignées à l'utilisateur connecté
// @access  Private
router.get('/my', protect, handleImpersonation, async (req, res) => {
  try {
    const { statut, priorite, includeArchived } = req.query;
    
    // Filtrer les tâches où l'utilisateur est dans le tableau assignedTo
    const filter = { assignedTo: getEffectiveUserId(req) };
    if (statut) filter.statut = statut;
    if (priorite) filter.priorite = priorite;
    
    // Par défaut, exclure les tâches archivées sauf si includeArchived=true
    if (includeArchived !== 'true') {
      filter.archived = { $ne: true };
    }

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'firstName lastName email role')
      .populate('createdBy', 'firstName lastName email role')
      .populate('dossier', 'titre numero statut')
      .sort({ priorite: -1, dateEcheance: 1, createdAt: -1 });

    res.json({
      success: true,
      count: tasks.length,
      tasks
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des tâches:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/tasks/dossier/:dossierId
// @desc    Récupérer les tâches d'un dossier (pour partenaires et admins)
// @access  Private
router.get('/dossier/:dossierId', protect, handleImpersonation, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const { statut, priorite, includeArchived } = req.query;
    
    // Vérifier que le dossier existe
    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }

    const role = getEffectiveRole(req);
    const uid = getEffectiveUserId(req);
    const isAdmin = role === 'admin' || role === 'superadmin';
    const isOwner = dossier.user && dossier.user.toString() === uid;
    const isPartenaire = role === 'partenaire';
    
    // Pour les partenaires, vérifier que le dossier leur est transmis
    let hasAccess = false;
    if (isAdmin || isOwner) {
      hasAccess = true;
    } else if (isPartenaire) {
      const transmission = dossier.transmittedTo?.find((t) => {
        const partenaireId = t.partenaire?._id?.toString() || t.partenaire?.toString();
        return partenaireId === uid;
      });
      hasAccess = !!transmission && (transmission.status === 'pending' || transmission.status === 'accepted');
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas accès à ce dossier'
      });
    }

    // Construire le filtre
    const filter = { dossier: dossierId };
    if (statut) filter.statut = statut;
    if (priorite) filter.priorite = priorite;
    
    // Par défaut, exclure les tâches archivées sauf si includeArchived=true
    if (includeArchived !== 'true') {
      filter.archived = { $ne: true };
    }

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'firstName lastName email role')
      .populate('createdBy', 'firstName lastName email role')
      .populate('completedBy', 'firstName lastName email role')
      .populate('dossier', 'titre numero statut')
      .sort({ priorite: -1, dateEcheance: 1, createdAt: -1 });

    res.json({
      success: true,
      count: tasks.length,
      tasks
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des tâches du dossier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/tasks/:id
// @desc    Récupérer une tâche par ID
// @access  Private
router.get('/:id', protect, handleImpersonation, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'firstName lastName email role')
      .populate('createdBy', 'firstName lastName email role')
      .populate('completedBy', 'firstName lastName email role')
      .populate('dossier', 'titre numero statut')
      .populate('commentaires.utilisateur', 'firstName lastName email role');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Tâche non trouvée'
      });
    }

    const uid = getEffectiveUserId(req);
    const role = getEffectiveRole(req);
    const isCreator = task.createdBy._id.toString() === uid;
    const isAssigned = task.assignedTo._id.toString() === uid;
    const isAdmin = role === 'admin' || role === 'superadmin';

    if (!isCreator && !isAssigned && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas accès à cette tâche'
      });
    }

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la tâche:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/tasks
// @desc    Créer une nouvelle tâche (Admin, Superadmin, Partenaire)
// @access  Private (Admin, Superadmin, Partenaire)
router.post(
  '/',
  protect,
  handleImpersonation,
  async (req, res, next) => {
    // Autoriser admin, superadmin et partenaire
    const allowedRoles = ['admin', 'superadmin', 'partenaire'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas l\'autorisation de créer des tâches'
      });
    }
    next();
  },
  [
    body('titre').optional().trim(),
    body('assignedTo').optional(),
    body('statut').optional().isIn(['a_faire', 'en_cours', 'en_attente', 'termine', 'annule']),
    body('priorite').optional().isIn(['basse', 'normale', 'haute', 'urgente'])
  ],
  async (req, res) => {
    try {
      if (forbidImpersonationWrite(req, res)) return;
      console.log('📝 Données reçues pour création de tâche:', {
        titre: req.body.titre,
        assignedTo: req.body.assignedTo,
        statut: req.body.statut,
        priorite: req.body.priorite,
        dateEcheance: req.body.dateEcheance,
        dossier: req.body.dossier
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

      const {
        titre,
        description,
        statut,
        priorite,
        assignedTo,
        dateEcheance,
        dateDebut,
        dossier,
        notes
      } = req.body;

      // Normaliser assignedTo en tableau (optionnel)
      let assignedToArray = [];
      if (assignedTo) {
        if (Array.isArray(assignedTo)) {
          assignedToArray = assignedTo.filter(id => id); // Filtrer les valeurs vides
        } else {
          assignedToArray = [assignedTo];
        }
      }

      // Vérifier que tous les utilisateurs assignés existent (seulement s'il y en a)
      if (assignedToArray.length > 0) {
        console.log('👤 Vérification des utilisateurs assignés:', assignedToArray);
        const assignedUsers = await User.find({ _id: { $in: assignedToArray } });
        if (assignedUsers.length !== assignedToArray.length) {
          console.error('❌ Utilisateurs non trouvés. Attendus:', assignedToArray.length, 'Trouvés:', assignedUsers.length);
          return res.status(404).json({
            success: false,
            message: 'Un ou plusieurs utilisateurs assignés non trouvés',
            errors: [{
              param: 'assignedTo',
              msg: 'Un ou plusieurs utilisateurs assignés non trouvés'
            }]
          });
        }
        console.log('✅ Utilisateurs assignés validés:', assignedUsers.map(u => u.email));
      } else {
        console.log('ℹ️ Aucun utilisateur assigné - tâche créée sans assignation');
      }

      // Vérifier que le dossier existe si fourni
      let dossierExists = null;
      if (dossier) {
        dossierExists = await Dossier.findById(dossier);
        if (!dossierExists) {
          return res.status(404).json({
            success: false,
            message: 'Dossier non trouvé'
          });
        }
      }

      // Générer un titre par défaut si aucun titre n'est fourni
      let finalTitre = titre && titre.trim() ? titre.trim() : '';
      if (!finalTitre) {
        if (dossierExists) {
          finalTitre = `Tâche - ${dossierExists.titre || dossierExists.numero || 'Dossier'}`;
        } else {
          finalTitre = 'Nouvelle tâche';
        }
      }

      console.log('✅ Création de la tâche...');
      const taskDataToCreate = {
        titre: finalTitre,
        description: description || '',
        statut: statut || 'a_faire',
        priorite: priorite || 'normale',
        createdBy: req.user.id,
        dateEcheance: dateEcheance || null,
        dateDebut: dateDebut || null,
        dossier: dossier || null,
        notes: notes || ''
      };

      // Ajouter assignedTo seulement s'il y a des utilisateurs assignés
      if (assignedToArray.length > 0) {
        taskDataToCreate.assignedTo = assignedToArray;
      }

      const task = await Task.create(taskDataToCreate);
      console.log('✅ Tâche créée avec succès:', task._id);

      const taskPopulated = await Task.findById(task._id)
        .populate('assignedTo', 'firstName lastName email role')
        .populate('createdBy', 'firstName lastName email role')
        .populate('completedBy', 'firstName lastName email role')
        .populate('dossier', 'titre numero statut');

      // Notifier tous les utilisateurs assignés à la nouvelle tâche (seulement s'il y en a)
      if (assignedToArray.length > 0) {
        try {
          const creator = req.user;
          const creatorName = `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || creator.email;

          for (const assignedUserId of assignedToArray) {
            try {
              await Notification.create({
                user: assignedUserId,
                type: 'other',
                titre: 'Nouvelle tâche assignée',
                message: `${creatorName} vous a assigné une nouvelle tâche : "${task.titre}".`,
                lien: '/admin/taches',
                metadata: {
                  taskId: task._id.toString(),
                  dossierId: dossier || null,
                  createdBy: creator._id.toString()
                }
              });
            } catch (notifError) {
              console.error('Erreur lors de la notification d\'un utilisateur assigné:', notifError);
            }
          }
        } catch (notifError) {
          console.error('Erreur lors de la notification des utilisateurs assignés:', notifError);
        }
      }

      // Si la tâche est liée à un dossier, notifier les autres membres de l'équipe du dossier
      if (dossierExists && Array.isArray(dossierExists.teamMembers) && dossierExists.teamMembers.length > 0) {
        try {
          const uniqueMembers = new Set(
            dossierExists.teamMembers
              .map((m) => m.toString())
          );

          // Ajouter le chef d'équipe si défini
          if (dossierExists.teamLeader) {
            uniqueMembers.add(dossierExists.teamLeader.toString());
          }

          // Retirer le créateur et les utilisateurs déjà notifiés (assignedTo)
          uniqueMembers.delete(req.user.id.toString());
          // Retirer tous les utilisateurs assignés de la liste des membres à notifier
          assignedToArray.forEach(userId => {
            uniqueMembers.delete(userId.toString());
          });

          const memberIds = Array.from(uniqueMembers);

          if (memberIds.length > 0) {
            // Ne notifier que les admins, pas les clients
            const teamUsers = await User.find({ 
              _id: { $in: memberIds },
              role: { $in: ['admin', 'superadmin'] } // Filtrer uniquement les admins
            });

            for (const member of teamUsers) {
              try {
                await Notification.create({
                  user: member._id,
                  type: 'other',
                  titre: 'Nouvelle tâche sur un dossier',
                  message: `Une nouvelle tâche "${task.titre}" a été créée sur le dossier "${dossierExists.titre || dossierExists.numero}".`,
                  lien: '/admin?section=tasks',
                  metadata: {
                    taskId: task._id.toString(),
                    dossierId: dossierExists._id.toString(),
                    type: 'task_created_on_dossier'
                  }
                });
              } catch (memberNotifError) {
                console.error('Erreur lors de la notification d\'un membre de l\'équipe pour la tâche:', memberNotifError);
              }
            }
          }
        } catch (teamNotifError) {
          console.error('Erreur lors de la notification des membres de l\'équipe pour la tâche:', teamNotifError);
        }
      }

      // Si un partenaire crée une tâche sur un dossier transmis, notifier tous les admins
      if (req.user.role === 'partenaire' && dossierExists) {
        try {
          const allAdmins = await User.find({ 
            role: { $in: ['admin', 'superadmin'] }
          });

          const creatorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;

          for (const admin of allAdmins) {
            try {
              await Notification.create({
                user: admin._id,
                type: 'other',
                titre: 'Nouvelle tâche créée par un partenaire',
                message: `${creatorName} (partenaire) a créé une nouvelle tâche "${task.titre}" sur le dossier "${dossierExists.titre || dossierExists.numero}".`,
                lien: `/admin/dossiers/${dossierExists._id}`,
                metadata: {
                  taskId: task._id.toString(),
                  dossierId: dossierExists._id.toString(),
                  type: 'task_created_by_partenaire',
                  createdBy: req.user.id.toString()
                }
              });
            } catch (adminNotifError) {
              console.error('Erreur lors de la notification d\'un admin pour la tâche créée par un partenaire:', adminNotifError);
            }
          }
        } catch (partenaireNotifError) {
          console.error('Erreur lors de la notification des admins pour la tâche créée par un partenaire:', partenaireNotifError);
        }
      }

      res.status(201).json({
        success: true,
        message: 'Tâche créée avec succès',
        task: taskPopulated
      });
    } catch (error) {
      console.error('❌ Erreur lors de la création de la tâche:', error);
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
      
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Une erreur est survenue lors de la création de la tâche'
      });
    }
  }
);

// @route   PUT /api/tasks/:id
// @desc    Mettre à jour une tâche
// @access  Private
router.put(
  '/:id',
  protect,
  handleImpersonation,
  [
    body('statut').optional().isIn(['a_faire', 'en_cours', 'en_attente', 'termine', 'annule']),
    body('priorite').optional().isIn(['basse', 'normale', 'haute', 'urgente'])
  ],
  async (req, res) => {
    try {
      if (forbidImpersonationWrite(req, res)) return;
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      console.log('📝 Mise à jour de la tâche:', req.params.id);
      console.log('📝 Données reçues:', req.body);
      
      const task = await Task.findById(req.params.id);
      if (!task) {
        console.error('❌ Tâche non trouvée:', req.params.id);
        return res.status(404).json({
          success: false,
          message: 'Tâche non trouvée'
        });
      }
      
      console.log('✅ Tâche trouvée:', task.titre);

      const uid = getEffectiveUserId(req);
      const role = getEffectiveRole(req);
      const isCreator = task.createdBy && task.createdBy.toString() === uid;
      const currentAssignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo].filter(Boolean);
      const isAssigned = currentAssignedToArray.some(id => id.toString() === uid);
      const isAdmin = role === 'admin' || role === 'superadmin';
      const isPartenaire = role === 'partenaire';
      
      // Pour les partenaires, vérifier qu'ils ont accès au dossier de la tâche
      let hasDossierAccess = false;
      if (isPartenaire && task.dossier) {
        const dossier = await Dossier.findById(task.dossier);
        if (dossier) {
          const transmission = dossier.transmittedTo?.find((t) => {
            const partenaireId = t.partenaire?._id?.toString() || t.partenaire?.toString();
            return partenaireId === uid;
          });
          hasDossierAccess = !!transmission && (transmission.status === 'pending' || transmission.status === 'accepted');
        }
      }

      if (!isCreator && !isAssigned && !isAdmin && !hasDossierAccess) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas la permission de modifier cette tâche'
        });
      }

      const {
        titre,
        description,
        statut,
        priorite,
        assignedTo,
        dateEcheance,
        dateDebut,
        dateFin,
        dossier,
        notes,
        effectue,
        commentaireEffectue
      } = req.body;

      // Normaliser assignedTo en tableau si fourni (optionnel)
      let assignedToArray = null;
      if (assignedTo !== undefined) {
        if (Array.isArray(assignedTo)) {
          assignedToArray = assignedTo.filter(id => id); // Filtrer les valeurs vides
        } else if (assignedTo) {
          assignedToArray = [assignedTo];
        } else {
          assignedToArray = []; // Permettre un tableau vide
        }

        // Seuls les admins peuvent réassigner
        if (!isAdmin) {
          return res.status(403).json({
            success: false,
            message: 'Seuls les administrateurs peuvent réassigner une tâche'
          });
        }

        // Vérifier que tous les utilisateurs assignés existent (seulement s'il y en a)
        if (assignedToArray.length > 0) {
          const assignedUsers = await User.find({ _id: { $in: assignedToArray } });
          if (assignedUsers.length !== assignedToArray.length) {
            return res.status(404).json({
              success: false,
              message: 'Un ou plusieurs utilisateurs assignés non trouvés'
            });
          }
        }
      }

      // Vérifier que le dossier existe si fourni
      if (dossier) {
        const dossierExists = await Dossier.findById(dossier);
        if (!dossierExists) {
          return res.status(404).json({
            success: false,
            message: 'Dossier non trouvé'
          });
        }
      }

      // Sauvegarder les anciennes valeurs pour les notifications
      const oldStatut = task.statut;
      const oldPriorite = task.priorite;
      const oldAssignedTo = Array.isArray(task.assignedTo) ? [...task.assignedTo] : [task.assignedTo].filter(Boolean);

      // Mettre à jour les champs
      if (titre !== undefined) task.titre = titre;
      if (description !== undefined) task.description = description;
      if (statut !== undefined) task.statut = statut;
      if (priorite !== undefined) task.priorite = priorite;
      if (assignedToArray !== null && isAdmin) task.assignedTo = assignedToArray;
      if (dateEcheance !== undefined) task.dateEcheance = dateEcheance || null;
      if (dateDebut !== undefined) task.dateDebut = dateDebut || null;
      if (dateFin !== undefined) task.dateFin = dateFin || null;
      if (dossier !== undefined) task.dossier = dossier || null;
      if (notes !== undefined) task.notes = notes;

      // Gérer le statut effectué (n'importe quel utilisateur connecté peut marquer une tâche comme effectuée)
      const wasEffectue = task.effectue;
      if (req.body.effectue !== undefined) {
        task.effectue = req.body.effectue;
        if (req.body.effectue) {
          task.dateEffectue = new Date();
          task.completedBy = req.user.id; // Enregistrer qui a effectué la tâche
          // Si marqué comme effectué, mettre le statut à "termine" si ce n'est pas déjà fait
          if (task.statut !== 'termine') {
            task.statut = 'termine';
            if (!task.dateFin) {
              task.dateFin = new Date();
            }
          }
          // Archiver automatiquement la tâche terminée
          if (!task.archived) {
            task.archived = true;
            task.archivedAt = new Date();
          }
        } else {
          task.dateEffectue = null;
          task.completedBy = null;
          // Désarchiver si la tâche n'est plus effectuée
          if (task.archived) {
            task.archived = false;
            task.archivedAt = null;
          }
        }
      }
      
      // Gérer le commentaire (peut être modifié par n'importe qui si la tâche est marquée comme effectuée)
      if (req.body.commentaireEffectue !== undefined) {
        task.commentaireEffectue = req.body.commentaireEffectue || null;
      }

      // Si le statut passe à "termine", enregistrer la date de fin et archiver
      if (statut === 'termine' || (statut === undefined && task.statut === 'termine' && oldStatut !== 'termine')) {
        if (!task.dateFin) {
          task.dateFin = new Date();
        }
        // Archiver automatiquement la tâche terminée
        if (!task.archived) {
          task.archived = true;
          task.archivedAt = new Date();
        }
      } else if (statut !== undefined && statut !== 'termine' && oldStatut === 'termine') {
        // Si le statut change de "termine" à autre chose, désarchiver
        if (task.archived) {
          task.archived = false;
          task.archivedAt = null;
        }
      }

      // Créer des notifications pour tous les membres de l'équipe si la tâche est marquée comme effectuée
      if (req.body.effectue === true && !wasEffectue) {
        try {
          const completedUser = await User.findById(req.user.id);
          const completedUserName = completedUser ? `${completedUser.firstName} ${completedUser.lastName}` : 'Un utilisateur';
          
          // Récupérer tous les utilisateurs de l'équipe (admins et superadmins)
          const teamUsers = await User.find({ 
            role: { $in: ['admin', 'superadmin'] },
            _id: { $ne: req.user.id } // Exclure l'utilisateur qui a effectué la tâche
          });
          
          // Créer une notification pour chaque membre de l'équipe
          const notifications = teamUsers.map(user => ({
            user: user._id,
            type: 'other',
            titre: 'Tâche effectuée',
            message: `${completedUserName} a marqué la tâche "${task.titre || 'Sans titre'}" comme effectuée.${req.body.commentaireEffectue ? ` Commentaire: ${req.body.commentaireEffectue}` : ''}`,
            lien: `/admin/taches`,
            metadata: {
              taskId: task._id.toString(),
              completedBy: req.user.id,
              commentaire: req.body.commentaireEffectue || null
            }
          }));
          
          if (notifications.length > 0) {
            await Notification.insertManyWithPush(notifications);
          }
        } catch (notifError) {
          console.error('Erreur lors de la création des notifications:', notifError);
        }
      }

      // Notifications pour changements de statut ou priorité
      // Utiliser les nouvelles assignations si elles ont été mises à jour, sinon les actuelles
      const finalAssignedTo = assignedToArray !== null && isAdmin ? assignedToArray : currentAssignedToArray;
      const allRecipients = new Set();
      
      // Ajouter les assignés (utiliser les IDs directement)
      finalAssignedTo.forEach(id => {
        const idStr = (id && id.toString) ? id.toString() : (id && id._id ? id._id.toString() : String(id));
        if (idStr) allRecipients.add(idStr);
      });
      
      // Ajouter tous les admins
      try {
        const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } });
        admins.forEach(admin => allRecipients.add(admin._id.toString()));
      } catch (err) {
        console.error('Erreur lors de la récupération des admins:', err);
      }

      // Notification de changement de statut
      if (statut !== undefined && statut !== oldStatut) {
        try {
          const modifier = req.user;
          const modifierName = `${modifier.firstName || ''} ${modifier.lastName || ''}`.trim() || modifier.email;
          const statutLabels = {
            'a_faire': 'À faire',
            'en_cours': 'En cours',
            'en_attente': 'En attente',
            'termine': 'Terminé',
            'annule': 'Annulé'
          };

          for (const recipientId of allRecipients) {
            if (recipientId === req.user.id.toString()) continue; // Ne pas notifier le modificateur
            try {
              await Notification.create({
                user: recipientId,
                type: 'other',
                titre: 'Statut de tâche modifié',
                message: `${modifierName} a modifié le statut de la tâche "${task.titre}" de "${statutLabels[oldStatut] || oldStatut}" à "${statutLabels[statut] || statut}".`,
                lien: '/admin/taches',
                metadata: {
                  taskId: task._id.toString(),
                  oldStatut,
                  newStatut: statut,
                  modifierId: req.user.id.toString()
                }
              });
            } catch (notifError) {
              console.error('Erreur lors de la notification de changement de statut:', notifError);
            }
          }
        } catch (err) {
          console.error('Erreur lors des notifications de changement de statut:', err);
        }
      }

      // Notification de changement de priorité
      if (priorite !== undefined && priorite !== oldPriorite) {
        try {
          const modifier = req.user;
          const modifierName = `${modifier.firstName || ''} ${modifier.lastName || ''}`.trim() || modifier.email;
          const prioriteLabels = {
            'basse': 'Basse',
            'normale': 'Normale',
            'haute': 'Haute',
            'urgente': 'Urgente'
          };

          for (const recipientId of allRecipients) {
            if (recipientId === req.user.id.toString()) continue; // Ne pas notifier le modificateur
            try {
              await Notification.create({
                user: recipientId,
                type: 'other',
                titre: 'Priorité de tâche modifiée',
                message: `${modifierName} a modifié la priorité de la tâche "${task.titre}" de "${prioriteLabels[oldPriorite] || oldPriorite}" à "${prioriteLabels[priorite] || priorite}".`,
                lien: '/admin/taches',
                metadata: {
                  taskId: task._id.toString(),
                  oldPriorite,
                  newPriorite: priorite,
                  modifierId: req.user.id.toString()
                }
              });
            } catch (notifError) {
              console.error('Erreur lors de la notification de changement de priorité:', notifError);
            }
          }
        } catch (err) {
          console.error('Erreur lors des notifications de changement de priorité:', err);
        }
      }

      console.log('💾 Sauvegarde de la tâche...');
      await task.save();
      console.log('✅ Tâche sauvegardée avec succès');

      const taskPopulated = await Task.findById(task._id)
        .populate('assignedTo', 'firstName lastName email role')
        .populate('createdBy', 'firstName lastName email role')
        .populate('completedBy', 'firstName lastName email role')
        .populate('dossier', 'titre numero statut');

      console.log('✅ Tâche mise à jour avec succès');
      res.json({
        success: true,
        message: 'Tâche mise à jour avec succès',
        task: taskPopulated
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la tâche:', error);
      console.error('Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Une erreur est survenue lors de la mise à jour de la tâche'
      });
    }
  }
);

// @route   POST /api/tasks/:id/notes
// @desc    Ajouter une note/commentaire lié à une tâche
// @access  Private (créateur, assigné ou admin)
router.post(
  '/:id/notes',
  protect,
  handleImpersonation,
  [
    body('contenu').trim().notEmpty().withMessage('Le contenu de la note est requis'),
  ],
  async (req, res) => {
    try {
      if (forbidImpersonationWrite(req, res)) return;
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array(),
        });
      }

      const task = await Task.findById(req.params.id);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Tâche non trouvée',
        });
      }

      const uid = getEffectiveUserId(req);
      const role = getEffectiveRole(req);
      const isCreator = task.createdBy && task.createdBy.toString() === uid;
      const isAssigned = task.assignedTo && task.assignedTo.toString() === uid;
      const isAdmin = role === 'admin' || role === 'superadmin';

      if (!isCreator && !isAssigned && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas la permission d\'ajouter une note à cette tâche',
        });
      }

      const { contenu } = req.body;

      // Ajouter la note dans l'historique des commentaires
      task.commentaires = task.commentaires || [];
      task.commentaires.push({
        utilisateur: uid,
        contenu,
        createdAt: new Date(),
      });

      await task.save();

      // Recharger la tâche avec les relations
      const taskPopulated = await Task.findById(task._id)
        .populate('assignedTo', 'firstName lastName email role')
        .populate('createdBy', 'firstName lastName email role')
        .populate('dossier', 'titre numero statut')
        .populate('commentaires.utilisateur', 'firstName lastName email role');

      const auteur = await User.findById(uid).lean() || req.user;
      const auteurName = `${auteur.firstName || ''} ${auteur.lastName || ''}`.trim() || auteur.email;

      // Notification au créateur de la tâche (s'il existe)
      if (task.createdBy) {
        try {
          await Notification.create({
            user: task.createdBy,
            type: 'other',
            titre: 'Nouvelle note sur une tâche',
            message: `${auteurName} a ajouté une note sur la tâche "${task.titre}".`,
            lien: `/admin?section=tasks`,
            metadata: {
              taskId: task._id.toString(),
              auteurId: auteur._id.toString(),
              type: 'task_note',
            },
          });
        } catch (notifError) {
          console.error('Erreur lors de la notification du créateur de la tâche:', notifError);
        }
      }

      // Notification à tous les administrateurs (y compris superadmin)
      try {
        const admins = await User.find({
          role: { $in: ['admin', 'superadmin'] },
          isActive: { $ne: false },
        });

        for (const admin of admins) {
          try {
            await Notification.create({
              user: admin._id,
              type: 'other',
              titre: 'Nouvelle note sur une tâche',
              message: `${auteurName} a ajouté une note sur la tâche "${task.titre}".`,
              lien: `/admin?section=tasks`,
              metadata: {
                taskId: task._id.toString(),
                auteurId: auteur._id.toString(),
                type: 'task_note_admin',
              },
            });
          } catch (adminNotifError) {
            console.error('Erreur lors de la notification admin pour la note de tâche:', adminNotifError);
          }
        }
      } catch (adminsError) {
        console.error('Erreur lors de la récupération des administrateurs pour la note de tâche:', adminsError);
      }

      res.status(201).json({
        success: true,
        message: 'Note ajoutée avec succès',
        task: taskPopulated,
      });
    } catch (error) {
      console.error('Erreur lors de l\'ajout d\'une note à la tâche:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de l\'ajout de la note',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @route   DELETE /api/tasks/:id
// @desc    Supprimer une tâche (Admin seulement)
// @access  Private/Admin
router.delete('/:id', protect, handleImpersonation, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (forbidImpersonationWrite(req, res)) return;
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Tâche non trouvée'
      });
    }

    await Task.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Tâche supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la tâche:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/tasks/check-overdue
// @desc    Vérifier et notifier les tâches en retard (Admin seulement)
// @access  Private/Admin
router.post('/check-overdue', protect, handleImpersonation, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (forbidImpersonationWrite(req, res)) return;
    const { checkOverdueTasks } = require('../utils/taskDeadlineNotifications');
    const result = await checkOverdueTasks();
    res.json(result);
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des tâches en retard:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   PUT /api/tasks/:id/archive
// @desc    Archiver ou désarchiver une tâche (Admin seulement)
// @access  Private/Admin
router.put('/:id/archive', protect, handleImpersonation, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (forbidImpersonationWrite(req, res)) return;
    const { archived } = req.body;
    
    if (typeof archived !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre "archived" doit être un booléen'
      });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Tâche non trouvée'
      });
    }

    task.archived = archived;
    task.archivedAt = archived ? new Date() : null;
    await task.save();

    res.json({
      success: true,
      message: archived ? 'Tâche archivée avec succès' : 'Tâche désarchivée avec succès',
      task
    });
  } catch (error) {
    console.error('Erreur lors de l\'archivage/désarchivage de la tâche:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;

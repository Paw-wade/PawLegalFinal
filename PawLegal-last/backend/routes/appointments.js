const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const RendezVous = require('../models/RendezVous');
const { protect, authorize } = require('../middleware/auth');
const { handleImpersonation, logImpersonationAction, getEffectiveUserId, getEffectiveUser } = require('../middleware/impersonation');
const { sendNotificationSMS } = require('../sendSMS');

// @route   POST /api/appointments
// @desc    Créer un rendez-vous (public ou authentifié)
// @access  Public ou Private
router.post(
  '/',
  [
    body('nom').trim().notEmpty().withMessage('Le nom est requis'),
    // Le prénom est recommandé mais n'est plus bloquant
    body('prenom').optional().trim(),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    // Le téléphone est recommandé mais n'est plus bloquant
    body('telephone').optional().trim(),
    body('date').notEmpty().withMessage('La date est requise'),
    body('heure').trim().notEmpty().withMessage('L\'heure est requise'),
    body('motif').trim().notEmpty().withMessage('Le motif est requis'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('La description ne peut pas dépasser 500 caractères')
  ],
  async (req, res) => {
    try {
      console.log('📅 Requête de création de rendez-vous reçue:', {
        method: req.method,
        path: req.path,
        body: req.body
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('❌ Erreurs de validation:', errors.array());
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array()
        });
      }

      const { nom, prenom, email, telephone, date, heure, motif, description } = req.body;

      // Vérifier si un utilisateur est connecté (optionnel)
      let userId = null;
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
          const jwt = require('jsonwebtoken');
          const token = req.headers.authorization.split(' ')[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here');
          const User = require('../models/User');
          const user = await User.findById(decoded.id);
          if (user) userId = user._id;
        } catch (error) {
          // Si le token est invalide, on continue sans utilisateur (rendez-vous public)
        }
      }

      // Vérifier si le créneau est fermé
      const Creneau = require('../models/Creneau');
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      const endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);
      
      const creneauFerme = await Creneau.findOne({
        date: { $gte: targetDate, $lte: endDate },
        heure: heure,
        ferme: true
      });

      if (creneauFerme) {
        return res.status(400).json({
          success: false,
          message: 'Ce créneau est fermé. Veuillez choisir un autre horaire.'
        });
      }

      // Vérifier les conflits de rendez-vous (même date et heure)
      const existingAppointment = await RendezVous.findOne({
        date: new Date(date),
        heure: heure,
        statut: { $in: ['en_attente', 'confirme'] }
      });

      if (existingAppointment) {
        return res.status(400).json({
          success: false,
          message: 'Ce créneau est déjà réservé. Veuillez choisir un autre horaire.'
        });
      }

      const rendezVous = await RendezVous.create({
        user: userId,
        nom,
        prenom,
        email,
        telephone,
        date: new Date(date),
        heure,
        motif,
        description: description || ''
      });

      console.log('✅ Rendez-vous créé avec succès:', rendezVous._id);

      // Notifier tous les administrateurs (superadmin + admins) d'une nouvelle demande de rendez-vous
      try {
        const Notification = require('../models/Notification');
        const User = require('../models/User');

        const admins = await User.find({
          role: { $in: ['admin', 'superadmin'] },
          isActive: { $ne: false }
        });

        const dateLabel = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        for (const admin of admins) {
          await Notification.create({
            user: admin._id,
            type: 'appointment_created',
            titre: 'Nouveau rendez-vous demandé',
            message: `${prenom} ${nom} (${email}) a demandé un rendez-vous le ${dateLabel} à ${heure}.`,
            lien: '/admin?section=appointments',
            metadata: {
              appointmentId: rendezVous._id.toString(),
              userId: userId ? userId.toString() : null,
              email,
              telephone,
              date: rendezVous.date,
              heure: rendezVous.heure
            }
          });
        }

        console.log(`✅ Notifications de rendez-vous envoyées à ${admins.length} administrateur(s)`);
      } catch (notifError) {
        console.error('⚠️ Erreur lors de la création des notifications de rendez-vous (non bloquant):', notifError);
      }

      res.status(201).json({
        success: true,
        message: 'Votre demande de rendez-vous a été enregistrée. Nous vous confirmerons rapidement par email.',
        data: rendezVous
      });
    } catch (error) {
      console.error('Erreur lors de la création du rendez-vous:', error);
      console.error('Détails de l\'erreur:', error.message);
      console.error('Stack:', error.stack);
      
      // Retourner un message d'erreur plus détaillé
      let errorMessage = 'Erreur serveur lors de la création du rendez-vous';
      
      if (error.name === 'ValidationError') {
        // Erreur de validation Mongoose
        const validationErrors = Object.values(error.errors).map((err) => err.message);
        errorMessage = `Erreur de validation: ${validationErrors.join(', ')}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      res.status(500).json({
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Note: La route POST / est publique, les autres routes nécessitent une authentification

// Middleware de debug pour toutes les routes GET (désactivé pour éviter les conflits)
// router.use((req, res, next) => {
//   if (req.method === 'GET') {
//     console.log('🔍 Route GET interceptée:', req.path, 'Original URL:', req.originalUrl);
//   }
//   next();
// });

// @route   GET /api/appointments/admin
// @desc    Récupérer tous les rendez-vous (admin)
// @access  Private (Admin)
// IMPORTANT: Cette route DOIT être définie AVANT router.get('/:id') pour éviter les conflits
router.get('/admin', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    console.log('📥 Requête GET /api/appointments/admin reçue:', {
      user: req.user?.email,
      role: req.user?.role,
      query: req.query
    });
    
    const { statut, date, userId, includeArchived } = req.query;
    let query = {};

    if (statut) {
      query.statut = statut;
    }

    if (userId) {
      query.user = userId;
    }

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }

    // Exclure les rendez-vous archivés par défaut (sauf si includeArchived=true)
    if (includeArchived !== 'true' && includeArchived !== true) {
      query.archived = { $ne: true };
    }

    console.log('🔍 Query MongoDB:', JSON.stringify(query, null, 2));

    // Archiver automatiquement les rendez-vous dépassés qui ne sont pas encore archivés
    // On archive uniquement ceux qui sont passés (date ET heure si disponible)
    const now = new Date();
    const allAppointments = await RendezVous.find({
      archived: { $ne: true }
    });
    
    for (const apt of allAppointments) {
      if (apt.date) {
        let appointmentDateTime = new Date(apt.date);
        // Si une heure est spécifiée, l'ajouter à la date
        if (apt.heure) {
          const [hours, minutes] = apt.heure.split(':').map(Number);
          appointmentDateTime.setHours(hours || 0, minutes || 0, 0, 0);
        } else {
          // Si pas d'heure, considérer la fin de journée
          appointmentDateTime.setHours(23, 59, 59, 999);
        }
        
        // Archiver si la date/heure est passée (sauf si déjà annulé)
        if (appointmentDateTime < now && apt.statut !== 'annule' && apt.statut !== 'annulé') {
          apt.archived = true;
          apt.archivedAt = now;
          await apt.save();
        }
      }
    }

    const rendezVous = await RendezVous.find(query)
      .populate('user', 'firstName lastName email')
      .sort({ date: 1, heure: 1 });

    console.log('✅ Rendez-vous trouvés:', rendezVous.length);

    res.json({
      success: true,
      data: rendezVous,
      appointments: rendezVous // Alias pour compatibilité
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des rendez-vous:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des rendez-vous',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/appointments
// @desc    Récupérer les rendez-vous de l'utilisateur connecté
// @access  Private
router.get('/', protect, handleImpersonation, async (req, res) => {
  try {
    console.log('📅 GET /api/appointments - Requête reçue:', {
      user: req.user?.email,
      userId: req.user?.id,
      impersonateUserId: req.impersonateUserId,
      path: req.path
    });
    
    // En mode impersonation, utiliser l'ID de l'utilisateur impersonné
    const targetUserId = req.impersonateUserId || req.user.id;
    const targetUserEmail = req.impersonateTargetUser?.email || req.user.email;
    
    console.log('📅 Récupération des rendez-vous pour l\'utilisateur:', targetUserId, req.impersonateUserId ? '[IMPERSONATION]' : '');
    
    // Exclure les rendez-vous archivés pour les utilisateurs
    const query = { user: targetUserId, archived: { $ne: true } };
    
    const rendezVous = await RendezVous.find(query)
      .sort({ date: -1, heure: -1 });

    console.log('✅ Rendez-vous trouvés:', rendezVous.length);

    // Logger l'action si en impersonation
    if (req.impersonateUserId) {
      logImpersonationAction(req, 'view_appointments', `Consultation de ${rendezVous.length} rendez-vous`, { count: rendezVous.length }).catch(err => {
        console.error('Erreur lors du log d\'impersonation:', err);
      });
    }

    res.json({
      success: true,
      data: rendezVous
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des rendez-vous:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des rendez-vous',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/appointments/:id
// @desc    Récupérer un rendez-vous par ID
// @access  Private
router.get('/:id', protect, handleImpersonation, async (req, res) => {
  try {
    const rendezVous = await RendezVous.findById(req.params.id)
      .populate('user', 'firstName lastName email');

    if (!rendezVous) {
      return res.status(404).json({
        success: false,
        message: 'Rendez-vous non trouvé'
      });
    }

    // Vérifier les permissions : propriétaire ou admin
    const isOwner = rendezVous.user && rendezVous.user.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    
    if (!isOwner && !isAdmin) {
      // Vérifier aussi par email si pas d'utilisateur connecté mais rendez-vous créé avec email
      if (!rendezVous.user && rendezVous.email !== req.user.email) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas l\'autorisation de voir ce rendez-vous'
        });
      }
    }

    res.json({
      success: true,
      data: rendezVous
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du rendez-vous:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du rendez-vous'
    });
  }
});

// @route   PUT /api/appointments/:id/archive
// @desc    Archiver ou désarchiver un rendez-vous (admin)
// @access  Private (Admin)
router.put('/:id/archive', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { archived } = req.body;
    const rendezVous = await RendezVous.findById(req.params.id);

    if (!rendezVous) {
      return res.status(404).json({
        success: false,
        message: 'Rendez-vous non trouvé'
      });
    }

    rendezVous.archived = archived === true || archived === 'true';
    if (rendezVous.archived) {
      rendezVous.archivedAt = new Date();
    } else {
      rendezVous.archivedAt = null;
    }

    await rendezVous.save();
    await rendezVous.populate('user', 'firstName lastName email');

    res.json({
      success: true,
      message: rendezVous.archived ? 'Rendez-vous archivé avec succès' : 'Rendez-vous désarchivé avec succès',
      data: rendezVous
    });
  } catch (error) {
    console.error('Erreur lors de l\'archivage du rendez-vous:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'archivage du rendez-vous'
    });
  }
});

// @route   DELETE /api/appointments/:id
// @desc    Supprimer un rendez-vous (admin seulement)
// @access  Private (Admin)
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const rendezVous = await RendezVous.findById(req.params.id);

    if (!rendezVous) {
      return res.status(404).json({
        success: false,
        message: 'Rendez-vous non trouvé'
      });
    }

    await RendezVous.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Rendez-vous supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du rendez-vous:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression du rendez-vous'
    });
  }
});

// @route   PATCH /api/appointments/:id/cancel
// @desc    Annuler un rendez-vous (client propriétaire)
// @access  Private
// IMPORTANT: Cette route doit être définie AVANT la route /:id pour éviter les conflits
router.patch(
  '/:id/cancel',
  protect,
  async (req, res) => {
    try {
      console.log('📅 Route d\'annulation appelée:', {
        method: req.method,
        originalUrl: req.originalUrl,
        path: req.path,
        params: req.params,
        userId: req.user?.id,
        userEmail: req.user?.email
      });

      const rendezVous = await RendezVous.findById(req.params.id);

      if (!rendezVous) {
        return res.status(404).json({
          success: false,
          message: 'Rendez-vous non trouvé'
        });
      }

      // Vérifier que l'utilisateur est le propriétaire du rendez-vous
      if (rendezVous.user && rendezVous.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas l\'autorisation d\'annuler ce rendez-vous'
        });
      }

      // Vérifier aussi par email si pas d'utilisateur connecté mais rendez-vous créé avec email
      if (!rendezVous.user && rendezVous.email !== req.user.email) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas l\'autorisation d\'annuler ce rendez-vous'
        });
      }

      // Ne pas permettre l'annulation si déjà annulé ou terminé
      if (rendezVous.statut === 'annule') {
        return res.status(400).json({
          success: false,
          message: 'Ce rendez-vous est déjà annulé'
        });
      }

      if (rendezVous.statut === 'termine') {
        return res.status(400).json({
          success: false,
          message: 'Impossible d\'annuler un rendez-vous déjà terminé'
        });
      }

      const oldStatut = rendezVous.statut;
      rendezVous.statut = 'annule';
      await rendezVous.save();
      await rendezVous.populate('user', 'firstName lastName email');

      // Créer une notification pour l'utilisateur
      if (rendezVous.user) {
        try {
          const Notification = require('../models/Notification');
          await Notification.create({
            user: rendezVous.user._id || rendezVous.user,
            type: 'appointment_cancelled',
            titre: 'Rendez-vous annulé',
            message: `Vous avez annulé votre rendez-vous du ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure}.`,
            lien: '/client/rendez-vous',
            metadata: {
              appointmentId: rendezVous._id.toString(),
              date: rendezVous.date,
              heure: rendezVous.heure,
              oldStatut,
              newStatut: 'annule'
            }
          });

          // Envoyer un SMS si le téléphone est disponible
          if (rendezVous.telephone) {
            try {
              const dateFormatted = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              });
              await sendNotificationSMS(rendezVous.telephone, 'appointment_cancelled', {
                name: `${rendezVous.prenom} ${rendezVous.nom}`,
                date: dateFormatted,
                time: rendezVous.heure
              }, {
                userId: rendezVous.user?._id || rendezVous.user,
                context: 'appointment',
                contextId: rendezVous._id.toString()
              });
              console.log(`✅ SMS d'annulation envoyé à ${rendezVous.telephone}`);
            } catch (smsError) {
              console.error('⚠️ Erreur lors de l\'envoi du SMS (non bloquant):', smsError.message);
            }
          }
        } catch (notifError) {
          console.error('Erreur lors de la création de la notification:', notifError);
        }
      }

      // Créer une notification pour tous les administrateurs
      try {
        const User = require('../models/User');
        const Notification = require('../models/Notification');
        
        const admins = await User.find({ 
          role: { $in: ['admin', 'superadmin'] },
          isActive: { $ne: false }
        }).select('_id');

        const clientName = rendezVous.user 
          ? `${rendezVous.user.firstName || ''} ${rendezVous.user.lastName || ''}`.trim() || rendezVous.user.email
          : `${rendezVous.prenom || ''} ${rendezVous.nom || ''}`.trim() || rendezVous.email || 'Client';

        const dateFormatted = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        // Créer une notification pour chaque admin
        const adminNotifications = admins.map(admin => ({
          user: admin._id,
          type: 'appointment_cancelled',
          titre: `🚫 Rendez-vous annulé - ${clientName}`,
          message: `Le client ${clientName} a annulé son rendez-vous prévu le ${dateFormatted} à ${rendezVous.heure || 'heure non spécifiée'}.\n\nMotif: ${rendezVous.motif || 'Non spécifié'}\n${rendezVous.description ? `Description: ${rendezVous.description}` : ''}`,
          lien: '/admin/rendez-vous',
          metadata: {
            appointmentId: rendezVous._id.toString(),
            clientName: clientName,
            date: rendezVous.date,
            heure: rendezVous.heure,
            motif: rendezVous.motif,
            description: rendezVous.description,
            oldStatut,
            newStatut: 'annule'
          }
        }));

        if (adminNotifications.length > 0) {
          await Notification.insertMany(adminNotifications);
          console.log(`✅ Notifications d'annulation envoyées à ${adminNotifications.length} administrateur(s)`);
        }
      } catch (adminNotifError) {
        console.error('⚠️ Erreur lors de la création des notifications pour les admins:', adminNotifError);
      }

      res.json({
        success: true,
        message: 'Rendez-vous annulé avec succès',
        data: rendezVous
      });
    } catch (error) {
      console.error('Erreur lors de l\'annulation du rendez-vous:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de l\'annulation du rendez-vous'
      });
    }
  }
);

// @route   PUT /api/appointments/:id
// @desc    Mettre à jour un rendez-vous (client propriétaire) - peut modifier date, heure, motif, description
// @access  Private
router.put(
  '/:id',
  protect,
  [
    body('date').optional().isISO8601().withMessage('Date invalide'),
    body('heure').optional().trim(),
    body('motif').optional().trim(),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('La description ne peut pas dépasser 500 caractères'),
    body('effectue').optional().isBoolean().withMessage('Le champ effectue doit être un booléen'),
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

      const { date, heure, motif, description, effectue } = req.body;
      const rendezVous = await RendezVous.findById(req.params.id);

      if (!rendezVous) {
        return res.status(404).json({
          success: false,
          message: 'Rendez-vous non trouvé'
        });
      }

      // Vérifier que l'utilisateur est le propriétaire du rendez-vous
      const effectiveUserId = getEffectiveUserId(req);
      const effectiveUser = getEffectiveUser(req);
      
      if (rendezVous.user && rendezVous.user.toString() !== effectiveUserId) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas l\'autorisation de modifier ce rendez-vous'
        });
      }

      // Vérifier aussi par email si pas d'utilisateur connecté mais rendez-vous créé avec email
      if (!rendezVous.user && rendezVous.email !== effectiveUser?.email) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas l\'autorisation de modifier ce rendez-vous'
        });
      }

      // Ne pas permettre la modification si déjà annulé ou terminé
      if (rendezVous.statut === 'annule') {
        return res.status(400).json({
          success: false,
          message: 'Ce rendez-vous est annulé et ne peut pas être modifié'
        });
      }

      if (rendezVous.statut === 'termine') {
        return res.status(400).json({
          success: false,
          message: 'Ce rendez-vous est terminé et ne peut pas être modifié'
        });
      }

      const oldDate = rendezVous.date;
      const oldHeure = rendezVous.heure;
      
      // Mettre à jour les champs fournis
      if (date !== undefined) rendezVous.date = new Date(date);
      if (heure !== undefined) rendezVous.heure = heure;
      if (motif !== undefined) rendezVous.motif = motif;
      if (description !== undefined) rendezVous.description = description;
      if (effectue !== undefined) {
        rendezVous.effectue = effectue;
        if (effectue) {
          rendezVous.dateEffectue = new Date();
        } else {
          rendezVous.dateEffectue = null;
        }
      }

      await rendezVous.save();
      await rendezVous.populate('user', 'firstName lastName email');

      // Créer une notification pour l'utilisateur si des modifications ont été apportées
      if (rendezVous.user) {
        try {
          const Notification = require('../models/Notification');
          let notificationMessage = '';
          let hasChanges = false;

          // Vérifier les changements
          if (date && new Date(date).getTime() !== new Date(oldDate).getTime()) {
            hasChanges = true;
            notificationMessage = `Votre rendez-vous a été reprogrammé. Nouvelle date : ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure || oldHeure}.`;
          } else if (heure && heure !== oldHeure) {
            hasChanges = true;
            notificationMessage = `L'heure de votre rendez-vous a été modifiée. Nouvelle heure : ${rendezVous.heure} (date : ${new Date(rendezVous.date).toLocaleDateString('fr-FR')}).`;
          } else if (date && heure && (new Date(date).getTime() !== new Date(oldDate).getTime() || heure !== oldHeure)) {
            hasChanges = true;
            notificationMessage = `Votre rendez-vous a été reprogrammé. Nouvelle date et heure : ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure}.`;
          } else if (motif || description) {
            hasChanges = true;
            notificationMessage = `Votre rendez-vous du ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure} a été modifié.`;
          }

          if (hasChanges) {
            await Notification.create({
              user: rendezVous.user._id || rendezVous.user,
              type: 'appointment_updated',
              titre: 'Rendez-vous modifié',
              message: notificationMessage,
              lien: '/client/rendez-vous',
              metadata: {
                appointmentId: rendezVous._id.toString(),
                date: rendezVous.date,
                heure: rendezVous.heure,
                oldDate,
                newDate: date || oldDate,
                oldHeure,
                newHeure: heure || oldHeure
              }
            });

            // Envoyer un SMS si le téléphone est disponible
            if (rendezVous.telephone) {
              try {
                const dateFormatted = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                });
                await sendNotificationSMS(rendezVous.telephone, 'appointment_updated', {
                  name: `${rendezVous.prenom} ${rendezVous.nom}`,
                  date: dateFormatted,
                  time: rendezVous.heure
                }, {
                  userId: rendezVous.user?._id || rendezVous.user,
                  context: 'appointment',
                  contextId: rendezVous._id.toString()
                });
                console.log(`✅ SMS de modification envoyé à ${rendezVous.telephone}`);
              } catch (smsError) {
                console.error('⚠️ Erreur lors de l\'envoi du SMS (non bloquant):', smsError.message);
              }
            }
          }
        } catch (notifError) {
          console.error('Erreur lors de la création de la notification:', notifError);
          // Ne pas bloquer la mise à jour si la notification échoue
        }
      }

      res.json({
        success: true,
        message: 'Rendez-vous mis à jour avec succès',
        data: rendezVous
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du rendez-vous:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la mise à jour du rendez-vous'
      });
    }
  }
);

// @route   PATCH /api/appointments/:id
// @desc    Mettre à jour un rendez-vous (admin) - peut modifier statut, date, heure, motif, description, notes
// @access  Private (Admin)
router.patch(
  '/:id',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('statut').optional().isIn(['en_attente', 'confirme', 'annule', 'termine']).withMessage('Statut invalide'),
    body('date').optional().isISO8601().withMessage('Date invalide'),
    body('heure').optional().trim().notEmpty().withMessage('Heure invalide'),
    body('motif').optional().trim(),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('La description ne peut pas dépasser 500 caractères'),
    body('notes').optional().trim(),
    body('effectue').optional().isBoolean().withMessage('Le champ effectue doit être un booléen')
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

      const { statut, date, heure, motif, description, notes, effectue } = req.body;
      const rendezVous = await RendezVous.findById(req.params.id);

      if (!rendezVous) {
        return res.status(404).json({
          success: false,
          message: 'Rendez-vous non trouvé'
        });
      }

      const oldStatut = rendezVous.statut;
      const oldDate = rendezVous.date;
      const oldHeure = rendezVous.heure;
      
      // Mettre à jour les champs fournis
      if (statut !== undefined) rendezVous.statut = statut;
      if (date !== undefined) rendezVous.date = new Date(date);
      if (heure !== undefined) rendezVous.heure = heure;
      if (motif !== undefined) rendezVous.motif = motif;
      if (description !== undefined) rendezVous.description = description;
      if (notes !== undefined) rendezVous.notes = notes;
      if (effectue !== undefined) rendezVous.effectue = effectue;

      await rendezVous.save();
      await rendezVous.populate('user', 'firstName lastName email');

      // Créer une notification pour l'utilisateur si des modifications ont été apportées
      if (rendezVous.user) {
        try {
          const Notification = require('../models/Notification');
          let notificationType = 'appointment_updated';
          let notificationTitre = 'Rendez-vous modifié';
          let notificationMessage = '';
          let hasChanges = false;

          // Vérifier les changements
          if (statut && statut !== oldStatut) {
            hasChanges = true;
            if (statut === 'confirme' && oldStatut === 'en_attente') {
              notificationType = 'appointment_created';
              notificationTitre = 'Rendez-vous confirmé';
              notificationMessage = `Votre rendez-vous du ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure} a été confirmé.`;
            } else if (statut === 'annule') {
              notificationType = 'appointment_cancelled';
              notificationTitre = 'Rendez-vous annulé';
              notificationMessage = `Votre rendez-vous du ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure} a été annulé.`;
            } else {
              notificationMessage = `Le statut de votre rendez-vous a été modifié de "${oldStatut}" à "${statut}".`;
            }
          } else if (date && new Date(date).getTime() !== new Date(oldDate).getTime()) {
            hasChanges = true;
            notificationMessage = `Votre rendez-vous a été reprogrammé. Nouvelle date : ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure}.`;
          } else if (heure && heure !== oldHeure) {
            hasChanges = true;
            notificationMessage = `L'heure de votre rendez-vous a été modifiée. Nouvelle heure : ${rendezVous.heure} (date : ${new Date(rendezVous.date).toLocaleDateString('fr-FR')}).`;
          } else if (date && heure && (new Date(date).getTime() !== new Date(oldDate).getTime() || heure !== oldHeure)) {
            hasChanges = true;
            notificationMessage = `Votre rendez-vous a été reprogrammé. Nouvelle date et heure : ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure}.`;
          } else if (motif || description || notes) {
            hasChanges = true;
            notificationMessage = `Votre rendez-vous du ${new Date(rendezVous.date).toLocaleDateString('fr-FR')} à ${rendezVous.heure} a été modifié par l'administrateur.`;
          }

          if (hasChanges) {
            await Notification.create({
              user: rendezVous.user._id || rendezVous.user,
              type: notificationType,
              titre: notificationTitre,
              message: notificationMessage,
              lien: '/client/rendez-vous',
              metadata: {
                appointmentId: rendezVous._id.toString(),
                date: rendezVous.date,
                heure: rendezVous.heure,
                oldStatut,
                newStatut: statut || oldStatut,
                oldDate,
                newDate: date || oldDate,
                oldHeure,
                newHeure: heure || oldHeure
              }
            });

            // Envoyer un SMS si le téléphone est disponible et si c'est une confirmation ou annulation
            if (rendezVous.telephone && (statut === 'confirme' || statut === 'annule')) {
              try {
                const dateFormatted = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                });
                const smsData = {
                  name: `${rendezVous.prenom} ${rendezVous.nom}`,
                  date: dateFormatted,
                  time: rendezVous.heure
                };
                await sendNotificationSMS(rendezVous.telephone, statut === 'confirme' ? 'appointment_confirmed' : 'appointment_cancelled', smsData, {
                  userId: rendezVous.user?._id || rendezVous.user,
                  context: 'appointment',
                  contextId: rendezVous._id.toString()
                });
                console.log(`✅ SMS envoyé à ${rendezVous.telephone} pour le rendez-vous ${rendezVous._id}`);
              } catch (smsError) {
                console.error('⚠️ Erreur lors de l\'envoi du SMS (non bloquant):', smsError.message);
                // Ne pas bloquer la réponse si l'envoi de SMS échoue
              }
            }
          }
        } catch (notifError) {
          console.error('Erreur lors de la création de la notification:', notifError);
          // Ne pas bloquer la mise à jour si la notification échoue
        }
      }

      res.json({
        success: true,
        message: 'Rendez-vous mis à jour avec succès',
        data: rendezVous
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du rendez-vous:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la mise à jour du rendez-vous'
      });
    }
  }
);

module.exports = router;


const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const RendezVous = require('../models/RendezVous');
const { protect, authorize } = require('../middleware/auth');
const { sendTransactionalEmail, escapeHtml } = require('../utils/emailNotifications');
const { getPrimaryFrontendUrl } = require('../utils/frontendOrigins');

/** Libellés des motifs (formulaire public) — pour les notifications admin. */
const MOTIF_RDV_LABELS = {
  premiere_demande_titre: 'Je fais une première demande de titre de séjour',
  renouvellement_titre: 'Je demande le renouvellement de mon titre de séjour',
  changement_statut: 'Je demande un changement de statut',
  regroupement_familial: 'Je demande un regroupement familial',
  nationalite_francaise: 'Je demande la nationalité française',
  demande_visa: 'Je demande un visa',
  demande_carte_resident: 'Je demande une carte de résident',
  pas_reponse_titre: 'Je n’ai pas eu de réponse à ma demande de titre de séjour',
  pas_reponse_visa: 'Je n’ai pas eu de réponse à ma demande de visa',
  conteste_refus_titre: 'Je conteste un refus de titre de séjour',
  conteste_oqtf: 'J’ai reçu une OQTF (obligation de quitter le territoire)',
  autre: 'Autre'
};

function getMotifRdvLabel(motifKey) {
  const k = String(motifKey || '').trim();
  return MOTIF_RDV_LABELS[k] || k || 'Non renseigné';
}

async function resolveRdvClientEmail(rendezVous) {
  if (rendezVous.email && String(rendezVous.email).trim()) return String(rendezVous.email).trim();
  const u = rendezVous.user;
  if (u && typeof u === 'object' && u.email) return String(u.email).trim();
  const uid = u && (u._id || u);
  if (uid) {
    const UserModel = require('../models/User');
    const doc = await UserModel.findById(uid).select('email').lean();
    if (doc?.email) return String(doc.email).trim();
  }
  return null;
}

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
    body('description').optional().trim().isLength({ max: 500 }).withMessage('La description ne peut pas dépasser 500 caractères'),
    body('forUserId')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('Identifiant utilisateur client invalide')
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

      const { nom, prenom, email, telephone, date, heure, motif, description, forUserId } = req.body;

      const User = require('../models/User');

      // Lier le RDV au bon compte : client connecté, ou client ciblé par un admin (forUserId), jamais le compte admin seul.
      let userId = null;
      let bookingByAdmin = false;
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
          const jwt = require('jsonwebtoken');
          const token = req.headers.authorization.split(' ')[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here');
          const authUser = await User.findById(decoded.id);
          if (authUser) {
            const isAdmin = authUser.role === 'admin' || authUser.role === 'superadmin';
            if (isAdmin && forUserId) {
              bookingByAdmin = true;
              const target = await User.findById(String(forUserId).trim());
              if (!target) {
                return res.status(400).json({
                  success: false,
                  message: 'Utilisateur client introuvable pour ce rendez-vous.'
                });
              }
              const tr = target.role || 'client';
              if (tr === 'admin' || tr === 'superadmin') {
                return res.status(400).json({
                  success: false,
                  message: 'Vous ne pouvez pas réserver pour un compte administrateur.'
                });
              }
              userId = target._id;
            } else if (!isAdmin) {
              userId = authUser._id;
            }
          }
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

        const motifLabel = getMotifRdvLabel(rendezVous.motif);
        const descTrim = String(rendezVous.description || '').trim();
        let message = `${prenom || ''} ${nom} (${email}) a demandé un rendez-vous le ${dateLabel} à ${heure}. Motif : ${motifLabel}.`;
        if (descTrim) {
          message += ` Précisions : ${descTrim}`;
        }

        for (const admin of admins) {
          await Notification.create({
            user: admin._id,
            type: 'appointment_created',
            titre: 'Nouveau rendez-vous demandé',
            message,
            lien: '/admin?section=appointments',
            metadata: {
              appointmentId: rendezVous._id.toString(),
              userId: userId ? userId.toString() : null,
              email,
              telephone,
              date: rendezVous.date,
              heure: rendezVous.heure,
              motif: rendezVous.motif,
              motifLabel,
              description: descTrim || undefined
            }
          });
        }

        console.log(`✅ Notifications de rendez-vous envoyées à ${admins.length} administrateur(s)`);
      } catch (notifError) {
        console.error('⚠️ Erreur lors de la création des notifications de rendez-vous (non bloquant):', notifError);
      }

      // Emails : demandeur + équipe (priorité email, pas de SMS)
      try {
        const dateLabelReq = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const motifLabelMail = getMotifRdvLabel(rendezVous.motif);
        // Évite un doublon avec le mail « RDV planifié » lorsque c’est l’admin qui réserve pour un client.
        if (!(bookingByAdmin && userId)) {
          await sendTransactionalEmail({
            to: email,
            toName: `${prenom || ''} ${nom}`.trim() || 'Client',
            subject: 'Demande de rendez-vous bien reçue — Ada Papers',
            htmlContent: `<p>Bonjour ${escapeHtml(prenom || nom)},</p><p>Nous accusons réception de votre demande de rendez-vous.</p><p><strong>Date souhaitée :</strong> ${escapeHtml(dateLabelReq)} à ${escapeHtml(heure)}.</p><p><strong>Motif déclaré :</strong> ${escapeHtml(motifLabelMail)}.</p><p>Notre équipe va examiner votre demande et vous adressera une confirmation, ou une proposition d’ajustement de créneau, par e-mail dans les meilleurs délais.</p><p style="margin-top:16px;font-size:13px;color:#555;">Accès à votre espace : ${escapeHtml(getPrimaryFrontendUrl())}</p>`,
            textContent: `Bonjour ${prenom || nom || ''},

Nous accusons réception de votre demande de rendez-vous.

Date souhaitée : ${dateLabelReq} à ${heure}
Motif déclaré : ${motifLabelMail}

Notre équipe va examiner votre demande et vous adressera une confirmation, ou une proposition d’ajustement de créneau, par e-mail dans les meilleurs délais.

Accès à votre espace : ${getPrimaryFrontendUrl()}`,
          });
        }
        const adminsMail = await User.find({
          role: { $in: ['admin', 'superadmin'] },
          isActive: { $ne: false },
        })
          .select('email firstName')
          .lean();
        for (const adm of adminsMail) {
          if (!adm.email) continue;
          await sendTransactionalEmail({
            to: adm.email,
            toName: adm.firstName || '',
            subject: `Nouvelle demande de RDV — ${prenom || ''} ${nom || ''}`.trim(),
            htmlContent: `<p>Une nouvelle demande de rendez-vous a été soumise.</p><p><strong>Demandeur :</strong> ${escapeHtml(prenom)} ${escapeHtml(nom)}<br/><strong>E-mail :</strong> ${escapeHtml(email)}${telephone ? `<br/><strong>Téléphone :</strong> ${escapeHtml(telephone)}` : ''}</p><p><strong>Date/heure demandées :</strong> ${escapeHtml(dateLabelReq)} à ${escapeHtml(heure)}.</p><p><strong>Motif :</strong> ${escapeHtml(motifLabelMail)}.</p><p>Merci de traiter cette demande depuis l’espace d’administration.</p>`,
            textContent: `Une nouvelle demande de rendez-vous a été soumise.

Demandeur : ${prenom} ${nom}
E-mail : ${email}${telephone ? `\nTéléphone : ${telephone}` : ''}
Date/heure demandées : ${dateLabelReq} à ${heure}
Motif : ${motifLabelMail}

Merci de traiter cette demande depuis l’espace d’administration.`,
          });
        }
      } catch (mailErr) {
        console.error('⚠️ Emails RDV (création) non bloquant:', mailErr);
      }

      // Si un admin a créé un rendez-vous pour un client : notification par email uniquement
      if (bookingByAdmin && userId) {
        try {
          const client = await User.findById(userId).select('firstName lastName email');
          const clientMail = client?.email && String(client.email).trim();
          if (clientMail) {
            const name =
              `${client?.firstName || ''} ${client?.lastName || ''}`.trim() ||
              `${prenom || ''} ${nom || ''}`.trim() ||
              'Client';
            const dateLabelSms = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });
            await sendTransactionalEmail({
              to: clientMail,
              toName: name,
              subject: 'Rendez-vous enregistré — Ada Papers',
              htmlContent: `<p>Bonjour ${escapeHtml(name)},</p><p>Un rendez-vous a été planifié à votre nom.</p><p><strong>Date :</strong> ${escapeHtml(dateLabelSms)}<br/><strong>Heure :</strong> ${escapeHtml(rendezVous.heure)}</p><p>Ce rendez-vous est actuellement en attente de validation finale. Vous recevrez une confirmation par e-mail dès sa prise en charge.</p>`,
              textContent: `Bonjour ${name},

Un rendez-vous a été planifié à votre nom.
Date : ${dateLabelSms}
Heure : ${rendezVous.heure}

Ce rendez-vous est actuellement en attente de validation finale. Vous recevrez une confirmation par e-mail dès sa prise en charge.`,
            });
          }
        } catch (mailErr) {
          console.error('⚠️ Email création RDV (admin) non bloquant:', mailErr);
        }
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
// @desc    Récupérer tous les rendez-vous (admin) ou les rendez-vous d'un utilisateur spécifique
// @access  Private (Admin ou utilisateur récupérant ses propres rendez-vous)
// IMPORTANT: Cette route DOIT être définie AVANT router.get('/:id') pour éviter les conflits
router.get('/admin', protect, async (req, res) => {
  try {
    console.log('📥 Requête GET /api/appointments/admin reçue:', {
      user: req.user?.email,
      role: req.user?.role,
      query: req.query
    });
    
    const { statut, date, userId, includeArchived, dateFrom, dateTo, q } = req.query;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    let query = {};

    // Si l'utilisateur n'est pas admin, il ne peut récupérer que ses propres rendez-vous
    if (!isAdmin) {
      if (userId && userId !== req.user.id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas l\'autorisation de voir les rendez-vous d\'autres utilisateurs'
        });
      }
      // Forcer userId à l'ID de l'utilisateur connecté
      query.user = req.user.id;
    } else {
      // Admin peut voir tous les rendez-vous ou filtrer par userId
    if (userId) {
      query.user = userId;
      }
    }

    // Appliquer les filtres normaux
    if (statut) {
      query.statut = statut;
    }

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }
    if (dateFrom || dateTo) {
      const range = query.date && typeof query.date === 'object' ? { ...query.date } : {};
      if (dateFrom) {
        const start = new Date(String(dateFrom));
        if (!Number.isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          range.$gte = start;
        }
      }
      if (dateTo) {
        const end = new Date(String(dateTo));
        if (!Number.isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          range.$lte = end;
        }
      }
      if (Object.keys(range).length > 0) query.date = range;
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

    let filteredRendezVous = rendezVous;
    const qText = String(q || '').trim().toLowerCase();
    if (qText) {
      filteredRendezVous = rendezVous.filter((rdv) => {
        const user = rdv.user && typeof rdv.user === 'object' ? rdv.user : null;
        const haystack = [
          rdv.nom,
          rdv.prenom,
          rdv.email,
          rdv.telephone,
          rdv.motif,
          rdv.description,
          rdv.notes,
          user?.firstName,
          user?.lastName,
          user?.email,
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        return haystack.includes(qText);
      });
    }

    console.log('✅ Rendez-vous trouvés:', filteredRendezVous.length);

    res.json({
      success: true,
      data: filteredRendezVous,
      appointments: filteredRendezVous // Alias pour compatibilité
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
router.get('/', protect, async (req, res) => {
  try {
    console.log('📅 GET /api/appointments - Requête reçue:', {
      user: req.user?.email,
      userId: req.user?.id,
      path: req.path
    });
    
    const targetUserId = req.user.id;
    const targetUserEmail = req.user.email;
    
    console.log('📅 Récupération des rendez-vous pour l\'utilisateur:', targetUserId);
    
    // Exclure les rendez-vous archivés pour les utilisateurs
    const query = { user: targetUserId, archived: { $ne: true } };
    
    const rendezVous = await RendezVous.find(query)
      .sort({ date: -1, heure: -1 });

    console.log('✅ Rendez-vous trouvés:', rendezVous.length);

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
router.get('/:id', protect, async (req, res) => {
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

    if (!rendezVous.archived) {
      return res.status(400).json({
        success: false,
        message: 'Seuls les rendez-vous archivés peuvent être supprimés. Archivez d’abord le rendez-vous.'
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
      await rendezVous.populate('user', 'firstName lastName email phone');

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

          try {
            const clientMail = await resolveRdvClientEmail(rendezVous);
            if (clientMail) {
              const dateFormatted = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              });
              await sendTransactionalEmail({
                to: clientMail,
                toName: `${rendezVous.prenom || ''} ${rendezVous.nom || ''}`.trim(),
                subject: 'Rendez-vous annulé — Ada Papers',
                htmlContent: `<p>Bonjour,</p><p>Nous confirmons la prise en compte de votre annulation de rendez-vous.</p><p><strong>Créneau annulé :</strong> ${escapeHtml(dateFormatted)} à ${escapeHtml(rendezVous.heure)}.</p><p>Si vous souhaitez reprendre rendez-vous, vous pouvez soumettre une nouvelle demande depuis votre espace client.</p>`,
                textContent: `Bonjour,

Nous confirmons la prise en compte de votre annulation de rendez-vous.
Créneau annulé : ${dateFormatted} à ${rendezVous.heure}.

Si vous souhaitez reprendre rendez-vous, vous pouvez soumettre une nouvelle demande depuis votre espace client.`,
              });
            }
          } catch (mailErr) {
            console.error('⚠️ Email annulation RDV (non bloquant):', mailErr);
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
          await Notification.insertManyWithPush(adminNotifications);
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

            try {
              const clientMail = await resolveRdvClientEmail(rendezVous);
              if (clientMail) {
                const dateFormatted = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                });
                await sendTransactionalEmail({
                  to: clientMail,
                  toName: `${rendezVous.prenom || ''} ${rendezVous.nom || ''}`.trim(),
                  subject: 'Rendez-vous modifié — Ada Papers',
                  htmlContent: `<p>Bonjour,</p><p>Votre rendez-vous a fait l’objet d’une mise à jour.</p><p>${escapeHtml(notificationMessage)}</p><p>Nous vous invitons à vérifier les détails actualisés dans votre espace client.</p>`,
                  textContent: `Bonjour,

Votre rendez-vous a fait l’objet d’une mise à jour.
${notificationMessage}

Nous vous invitons à vérifier les détails actualisés dans votre espace client.`,
                });
              }
            } catch (mailErr) {
              console.error('⚠️ Email modification RDV (non bloquant):', mailErr);
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

          }
        } catch (notifError) {
          console.error('Erreur lors de la création de la notification:', notifError);
          // Ne pas bloquer la mise à jour si la notification échoue
        }
      }

      // Email de confirmation / annulation (priorité email — pas de SMS en doublon)
      if (statut && statut !== oldStatut && (statut === 'confirme' || statut === 'annule')) {
        try {
          const clientMail = await resolveRdvClientEmail(rendezVous);
          if (!clientMail) {
            console.warn(`⚠️ Email RDV non envoyé (pas d’adresse) pour ${rendezVous._id}`);
          } else {
            const dateFormatted = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            const isOk = statut === 'confirme';
            await sendTransactionalEmail({
              to: clientMail,
              toName: `${rendezVous.prenom || ''} ${rendezVous.nom || ''}`.trim() || 'Client',
              subject: isOk ? 'Rendez-vous confirmé — Ada Papers' : 'Rendez-vous annulé — Ada Papers',
              htmlContent: isOk
                ? `<p>Bonjour,</p><p>Nous vous confirmons que votre rendez-vous est désormais validé.</p><p><strong>Date :</strong> ${escapeHtml(dateFormatted)}<br/><strong>Heure :</strong> ${escapeHtml(rendezVous.heure)}</p><p>Merci de vous présenter à l’heure prévue avec vos documents utiles.</p>`
                : `<p>Bonjour,</p><p>Nous vous informons que votre rendez-vous prévu a été annulé.</p><p><strong>Créneau concerné :</strong> ${escapeHtml(dateFormatted)} à ${escapeHtml(rendezVous.heure)}</p><p>Vous pouvez effectuer une nouvelle demande de rendez-vous à votre convenance.</p>`,
              textContent: isOk
                ? `Bonjour,

Nous vous confirmons que votre rendez-vous est désormais validé.
Date : ${dateFormatted}
Heure : ${rendezVous.heure}

Merci de vous présenter à l’heure prévue avec vos documents utiles.`
                : `Bonjour,

Nous vous informons que votre rendez-vous prévu a été annulé.
Créneau concerné : ${dateFormatted} à ${rendezVous.heure}

Vous pouvez effectuer une nouvelle demande de rendez-vous à votre convenance.`,
            });
          }
        } catch (mailErr) {
          console.error('⚠️ Email confirmation/annulation RDV (non bloquant):', mailErr);
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

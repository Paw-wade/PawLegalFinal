const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const Note = require('../models/Note');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Fonction utilitaire pour créer une notification
const createNotification = async (userId, type, titre, message, lien, metadata = {}) => {
  try {
    await Notification.create({
      user: userId,
      type,
      titre,
      message,
      lien,
      metadata
    });
  } catch (error) {
    console.error('Erreur lors de la création de la notification:', error);
  }
};

// @route   GET /api/notes
// @desc    Récupérer toutes les notes d'équipe (pour l'utilisateur connecté)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const user = req.user;
    
    // Récupérer les notes où :
    // 1. destinataires est vide (note pour toute l'équipe) ET l'utilisateur est admin/superadmin
    // 2. OU l'utilisateur est dans destinataires
    // 3. OU l'utilisateur est le créateur
    const notes = await Note.find({
      $or: [
        { destinataires: { $size: 0 }, createdBy: { $exists: true } }, // Notes pour toute l'équipe
        { destinataires: user.id }, // Notes où l'utilisateur est destinataire
        { createdBy: user.id } // Notes créées par l'utilisateur
      ]
    })
      .populate('createdBy', 'firstName lastName email role')
      .populate('destinataires', 'firstName lastName email role')
      .sort({ createdAt: -1 });

    // Filtrer pour ne garder que les notes pertinentes pour l'utilisateur
    // (si destinataires est vide, seuls les admins/superadmins peuvent voir)
    const filteredNotes = notes.filter(note => {
      if (note.destinataires.length === 0) {
        // Note pour toute l'équipe - seuls les membres de l'équipe peuvent voir
        return user.role === 'admin' || user.role === 'superadmin' || 
               user.role === 'avocat' || user.role === 'assistant' ||
               user.role === 'comptable' || user.role === 'secretaire' ||
               user.role === 'juriste' || user.role === 'stagiaire';
      }
      // Note avec destinataires spécifiques
      return note.destinataires.some(dest => dest._id.toString() === user.id.toString()) ||
             note.createdBy._id.toString() === user.id.toString();
    });

    // Compter les notes non lues
    const notesNonLues = filteredNotes.filter(note => {
      return !note.lu.some(lu => lu.user.toString() === user.id.toString());
    });

    res.json({
      success: true,
      count: filteredNotes.length,
      notesNonLues: notesNonLues.length,
      notes: filteredNotes
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des notes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/notes/:id
// @desc    Récupérer une note par ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email role')
      .populate('destinataires', 'firstName lastName email role');

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note non trouvée'
      });
    }

    // Vérifier les permissions
    const user = req.user;
    const canView = note.destinataires.length === 0 
      ? (user.role === 'admin' || user.role === 'superadmin' || 
         user.role === 'avocat' || user.role === 'assistant' ||
         user.role === 'comptable' || user.role === 'secretaire' ||
         user.role === 'juriste' || user.role === 'stagiaire')
      : note.destinataires.some(dest => dest._id.toString() === user.id.toString()) ||
        note.createdBy._id.toString() === user.id.toString();

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette note'
      });
    }

    res.json({
      success: true,
      note
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la note:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/notes
// @desc    Créer une nouvelle note d'équipe
// @access  Private/Admin
router.post(
  '/',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('titre').trim().notEmpty().withMessage('Le titre est requis'),
    body('contenu').trim().notEmpty().withMessage('Le contenu est requis'),
    body('destinataires').optional().isArray().withMessage('Les destinataires doivent être un tableau'),
    body('priorite').optional().isIn(['basse', 'normale', 'haute', 'urgente'])
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

      const { titre, contenu, destinataires, priorite } = req.body;

      const note = await Note.create({
        titre,
        contenu,
        createdBy: req.user.id,
        destinataires: destinataires || [],
        priorite: priorite || 'normale'
      });

      const notePopulated = await Note.findById(note._id)
        .populate('createdBy', 'firstName lastName email role')
        .populate('destinataires', 'firstName lastName email role');

      // Créer des notifications pour tous les membres de l'équipe concernés
      let usersToNotify = [];

      if (destinataires && destinataires.length > 0) {
        // Notifier les destinataires spécifiques
        usersToNotify = await User.find({
          _id: { $in: destinataires },
          isActive: true
        });
      } else {
        // Notifier tous les membres de l'équipe
        usersToNotify = await User.find({
          role: { $in: ['admin', 'superadmin', 'avocat', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'] },
          isActive: true,
          _id: { $ne: req.user.id } // Ne pas notifier le créateur
        });
      }

      // Créer les notifications
      for (const user of usersToNotify) {
        await createNotification(
          user._id,
          'other',
          `Nouvelle note d'équipe: ${titre}`,
          contenu.length > 100 ? contenu.substring(0, 100) + '...' : contenu,
          '/admin',
          { noteId: note._id.toString(), type: 'team_note' }
        );
      }

      res.status(201).json({
        success: true,
        message: 'Note créée avec succès',
        note: notePopulated
      });
    } catch (error) {
      console.error('Erreur lors de la création de la note:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   PUT /api/notes/:id/read
// @desc    Marquer une note comme lue
// @access  Private
router.put('/:id/read', protect, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note non trouvée'
      });
    }

    // Vérifier les permissions
    const user = req.user;
    const canView = note.destinataires.length === 0 
      ? (user.role === 'admin' || user.role === 'superadmin' || 
         user.role === 'avocat' || user.role === 'assistant' ||
         user.role === 'comptable' || user.role === 'secretaire' ||
         user.role === 'juriste' || user.role === 'stagiaire')
      : note.destinataires.some(dest => dest.toString() === user.id.toString()) ||
        note.createdBy.toString() === user.id.toString();

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette note'
      });
    }

    // Vérifier si déjà marquée comme lue
    const alreadyRead = note.lu.some(lu => lu.user.toString() === user.id.toString());

    if (!alreadyRead) {
      note.lu.push({
        user: user.id,
        date: new Date()
      });
      await note.save();
    }

    res.json({
      success: true,
      message: 'Note marquée comme lue'
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la note:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   PUT /api/notes/:id
// @desc    Mettre à jour une note
// @access  Private/Admin
router.put(
  '/:id',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('titre').optional().trim().notEmpty().withMessage('Le titre ne peut pas être vide'),
    body('contenu').optional().trim().notEmpty().withMessage('Le contenu ne peut pas être vide'),
    body('destinataires').optional().isArray().withMessage('Les destinataires doivent être un tableau'),
    body('priorite').optional().isIn(['basse', 'normale', 'haute', 'urgente'])
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

      const note = await Note.findById(req.params.id);

      if (!note) {
        return res.status(404).json({
          success: false,
          message: 'Note non trouvée'
        });
      }

      // Vérifier que l'utilisateur est le créateur
      if (note.createdBy.toString() !== req.user.id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Seul le créateur peut modifier cette note'
        });
      }

      const { titre, contenu, destinataires, priorite } = req.body;

      if (titre !== undefined) note.titre = titre;
      if (contenu !== undefined) note.contenu = contenu;
      if (destinataires !== undefined) note.destinataires = destinataires;
      if (priorite !== undefined) note.priorite = priorite;

      await note.save();

      const notePopulated = await Note.findById(note._id)
        .populate('createdBy', 'firstName lastName email role')
        .populate('destinataires', 'firstName lastName email role');

      res.json({
        success: true,
        message: 'Note mise à jour avec succès',
        note: notePopulated
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la note:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   DELETE /api/notes/:id
// @desc    Supprimer une note
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note non trouvée'
      });
    }

    // Vérifier que l'utilisateur est le créateur ou un superadmin
    if (note.createdBy.toString() !== req.user.id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Seul le créateur ou un superadmin peut supprimer cette note'
      });
    }

    await note.deleteOne();

    res.json({
      success: true,
      message: 'Note supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la note:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;


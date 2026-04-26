const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Temoignage = require('../models/Temoignage');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/temoignages
// @desc    Récupérer les témoignages validés (public)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const temoignages = await Temoignage.find({ valide: true })
      .populate('user', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: temoignages
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des témoignages:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des témoignages'
    });
  }
});

// @route   POST /api/temoignages
// @desc    Créer un témoignage (client)
// @access  Private (Client)
router.post(
  '/',
  protect,
  [
    body('texte')
      .trim()
      .notEmpty()
      .withMessage('Le texte du témoignage est requis')
      .isLength({ max: 500 })
      .withMessage('Le témoignage ne peut pas dépasser 500 caractères'),
    body('note')
      .isInt({ min: 1, max: 5 })
      .withMessage('La note doit être entre 1 et 5'),
    body('nom')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Le nom ne peut pas dépasser 100 caractères'),
    body('role')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Le rôle ne peut pas dépasser 50 caractères')
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

      const { texte, note, nom, role } = req.body;

      // Vérifier si l'utilisateur a déjà soumis un témoignage
      const existingTemoignage = await Temoignage.findOne({ user: req.user.id });
      if (existingTemoignage) {
        return res.status(400).json({
          success: false,
          message: 'Vous avez déjà soumis un témoignage. Contactez l\'administrateur pour le modifier.'
        });
      }

      const temoignage = await Temoignage.create({
        user: req.user.id,
        nom: nom || `${req.user.firstName} ${req.user.lastName}`,
        role: role || 'Client',
        texte,
        note
      });

      await temoignage.populate('user', 'firstName lastName');

      res.status(201).json({
        success: true,
        message: 'Témoignage soumis avec succès. Il sera publié après validation par un administrateur.',
        data: temoignage
      });
    } catch (error) {
      console.error('Erreur lors de la création du témoignage:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la création du témoignage'
      });
    }
  }
);

// @route   GET /api/temoignages/admin
// @desc    Récupérer tous les témoignages (admin)
// @access  Private (Admin)
router.get('/admin', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { valide } = req.query;
    let query = {};

    if (valide !== undefined) {
      query.valide = valide === 'true';
    }

    const temoignages = await Temoignage.find(query)
      .populate('user', 'firstName lastName email')
      .populate('validePar', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: temoignages
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des témoignages:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des témoignages'
    });
  }
});

// @route   PATCH /api/temoignages/:id/validate
// @desc    Valider ou rejeter un témoignage (admin)
// @access  Private (Admin)
router.patch(
  '/:id/validate',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('valide')
      .isBoolean()
      .withMessage('Le champ valide doit être un booléen')
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

      const { valide } = req.body;
      const temoignage = await Temoignage.findById(req.params.id);

      if (!temoignage) {
        return res.status(404).json({
          success: false,
          message: 'Témoignage non trouvé'
        });
      }

      temoignage.valide = valide;
      temoignage.validePar = req.user.id;
      temoignage.dateValidation = new Date();

      await temoignage.save();
      await temoignage.populate('user', 'firstName lastName email');
      await temoignage.populate('validePar', 'firstName lastName');

      res.json({
        success: true,
        message: valide 
          ? 'Témoignage validé avec succès' 
          : 'Témoignage rejeté avec succès',
        data: temoignage
      });
    } catch (error) {
      console.error('Erreur lors de la validation du témoignage:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la validation du témoignage'
      });
    }
  }
);

// @route   DELETE /api/temoignages/:id
// @desc    Supprimer un témoignage (admin)
// @access  Private (Admin)
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const temoignage = await Temoignage.findById(req.params.id);

    if (!temoignage) {
      return res.status(404).json({
        success: false,
        message: 'Témoignage non trouvé'
      });
    }

    await temoignage.deleteOne();

    res.json({
      success: true,
      message: 'Témoignage supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du témoignage:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression du témoignage'
    });
  }
});

// @route   GET /api/temoignages/my
// @desc    Récupérer le témoignage de l'utilisateur connecté
// @access  Private (Client)
router.get('/my', protect, async (req, res) => {
  try {
    const temoignage = await Temoignage.findOne({ user: req.user.id })
      .populate('user', 'firstName lastName');

    if (!temoignage) {
      return res.status(404).json({
        success: false,
        message: 'Aucun témoignage trouvé'
      });
    }

    res.json({
      success: true,
      data: temoignage
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du témoignage:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du témoignage'
    });
  }
});

module.exports = router;




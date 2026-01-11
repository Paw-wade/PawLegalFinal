const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Creneau = require('../models/Creneau');
const RendezVous = require('../models/RendezVous');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/creneaux/available
// @desc    Récupérer les créneaux disponibles pour une date donnée
// @access  Public (pour le widget de réservation)
router.get('/available', async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'La date est requise'
      });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

    // Récupérer les créneaux fermés pour cette date
    const creneauxFermes = await Creneau.find({
      date: { $gte: targetDate, $lte: endDate },
      ferme: true
    });

    // Récupérer les rendez-vous confirmés ou en attente pour cette date
    const rendezVousPris = await RendezVous.find({
      date: { $gte: targetDate, $lte: endDate },
      statut: { $in: ['en_attente', 'confirme'] }
    });

    // Heures disponibles par défaut
    const heuresDisponibles = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
    ];

    // Créer un Set des heures indisponibles
    const heuresIndisponibles = new Set();
    
    // Ajouter les heures des créneaux fermés
    creneauxFermes.forEach(creneau => {
      heuresIndisponibles.add(creneau.heure);
    });

    // Ajouter les heures des rendez-vous pris
    rendezVousPris.forEach(rdv => {
      heuresIndisponibles.add(rdv.heure);
    });

    // Filtrer les heures disponibles
    let heuresDisponiblesFiltrees = heuresDisponibles.filter(
      heure => !heuresIndisponibles.has(heure)
    );

    // Si la date est aujourd'hui, filtrer les heures déjà passées
    const maintenant = new Date();
    const dateAujourdhui = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const dateDemandee = new Date(targetDate);
    
    if (dateDemandee.getTime() === dateAujourdhui.getTime()) {
      // C'est aujourd'hui, filtrer les heures passées
      const heureActuelle = maintenant.getHours();
      const minuteActuelle = maintenant.getMinutes();
      const heureActuelleStr = `${heureActuelle.toString().padStart(2, '0')}:${minuteActuelle.toString().padStart(2, '0')}`;
      
      heuresDisponiblesFiltrees = heuresDisponiblesFiltrees.filter(heure => {
        // Comparer les heures au format HH:MM
        return heure > heureActuelleStr;
      });
    }

    res.json({
      success: true,
      date: date,
      heuresDisponibles: heuresDisponiblesFiltrees,
      heuresIndisponibles: Array.from(heuresIndisponibles)
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des créneaux disponibles:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// Toutes les routes suivantes nécessitent une authentification admin
router.use(protect);
router.use(authorize('admin', 'superadmin'));

// @route   GET /api/creneaux
// @desc    Récupérer tous les créneaux (admin)
// @access  Private (Admin)
router.get('/', async (req, res) => {
  try {
    const { date, ferme } = req.query;
    
    console.log('📥 Requête GET /api/creneaux:', { date, ferme, user: req.user?.email });
    
    let query = {};

    if (date) {
      try {
        const startDate = new Date(date);
        if (isNaN(startDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Format de date invalide'
          });
        }
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        query.date = { $gte: startDate, $lte: endDate };
      } catch (dateError) {
        console.error('❌ Erreur lors du parsing de la date:', dateError);
        return res.status(400).json({
          success: false,
          message: 'Format de date invalide',
          error: dateError.message
        });
      }
    }

    if (ferme !== undefined && ferme !== null && ferme !== '') {
      // Convertir en booléen (gérer 'true', 'false', true, false, '1', '0')
      query.ferme = ferme === 'true' || ferme === true || ferme === '1' || ferme === 1;
    }

    console.log('🔍 Recherche de créneaux avec query:', JSON.stringify(query, null, 2));

    const creneaux = await Creneau.find(query)
      .sort({ date: 1, heure: 1 })
      .lean(); // Utiliser lean() pour améliorer les performances

    console.log('✅ Créneaux trouvés:', creneaux.length);
    if (creneaux.length > 0) {
      console.log('📋 Exemples de créneaux:', creneaux.slice(0, 3).map(c => ({
        id: c._id,
        date: c.date,
        heure: c.heure,
        ferme: c.ferme
      })));
    }

    res.json({
      success: true,
      count: creneaux.length,
      creneaux
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des créneaux:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des créneaux',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   POST /api/creneaux
// @desc    Fermer un ou plusieurs créneaux (admin)
// @access  Private (Admin)
router.post(
  '/',
  [
    body('date').notEmpty().withMessage('La date est requise'),
    body('heures').isArray().withMessage('Les heures doivent être un tableau'),
    body('heures.*').trim().notEmpty().withMessage('Chaque heure doit être valide'),
    body('motifFermeture').optional().trim()
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

      const { date, heures, motifFermeture } = req.body;
      
      console.log('📅 Requête de fermeture de créneaux:', {
        date,
        heures,
        motifFermeture,
        user: req.user?.email
      });
      
      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'La date est requise'
        });
      }
      
      if (!heures || !Array.isArray(heures) || heures.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Au moins une heure doit être fournie'
        });
      }
      
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);

      const creneauxCrees = [];

      for (const heure of heures) {
        try {
          // Vérifier si le créneau existe déjà
          let creneau = await Creneau.findOne({
            date: targetDate,
            heure: heure
          });

          if (creneau) {
            // Mettre à jour le créneau existant
            creneau.ferme = true;
            if (motifFermeture) creneau.motifFermeture = motifFermeture;
            await creneau.save();
            console.log(`✅ Créneau ${heure} mis à jour (fermé)`);
          } else {
            // Créer un nouveau créneau fermé
            creneau = await Creneau.create({
              date: targetDate,
              heure: heure,
              ferme: true,
              motifFermeture: motifFermeture || ''
            });
            console.log(`✅ Créneau ${heure} créé (fermé)`);
          }

          creneauxCrees.push(creneau);
        } catch (creneauError) {
          // Si erreur d'unicité (index unique), mettre à jour le créneau existant
          if (creneauError.code === 11000) {
            const creneau = await Creneau.findOne({
              date: targetDate,
              heure: heure
            });
            if (creneau) {
              creneau.ferme = true;
              if (motifFermeture) creneau.motifFermeture = motifFermeture;
              await creneau.save();
              creneauxCrees.push(creneau);
            }
          } else {
            console.error(`Erreur lors de la fermeture du créneau ${heure}:`, creneauError);
            throw creneauError;
          }
        }
      }

      console.log('✅ Créneaux fermés avec succès:', creneauxCrees.length);
      
      res.status(201).json({
        success: true,
        message: `${creneauxCrees.length} créneau(x) fermé(s) avec succès`,
        creneaux: creneauxCrees
      });
    } catch (error) {
      console.error('Erreur lors de la fermeture des créneaux:', error);
      console.error('Détails de l\'erreur:', {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack
      });
      
      // Si erreur de validation MongoDB (duplicate key)
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Un ou plusieurs créneaux existent déjà pour cette date et heure',
          error: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la fermeture des créneaux',
        error: error.message
      });
    }
  }
);

// @route   PATCH /api/creneaux/:id/reopen
// @desc    Rouvrir un créneau (admin) - met ferme à false au lieu de supprimer
// @access  Private (Admin)
router.patch('/:id/reopen', async (req, res) => {
  try {
    const creneau = await Creneau.findById(req.params.id);

    if (!creneau) {
      return res.status(404).json({
        success: false,
        message: 'Créneau non trouvé'
      });
    }

    // Mettre à jour le créneau pour le rouvrir
    creneau.ferme = false;
    creneau.motifFermeture = ''; // Optionnel : supprimer le motif de fermeture
    await creneau.save();

    res.json({
      success: true,
      message: 'Créneau rouvert avec succès',
      creneau: creneau
    });
  } catch (error) {
    console.error('Erreur lors de la réouverture du créneau:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   DELETE /api/creneaux/:id
// @desc    Supprimer un créneau (admin) - gardé pour compatibilité
// @access  Private (Admin)
router.delete('/:id', async (req, res) => {
  try {
    const creneau = await Creneau.findById(req.params.id);

    if (!creneau) {
      return res.status(404).json({
        success: false,
        message: 'Créneau non trouvé'
      });
    }

    // Si le créneau est fermé, on le rouvre au lieu de le supprimer
    if (creneau.ferme === true || creneau.ferme === 'true') {
      creneau.ferme = false;
      creneau.motifFermeture = '';
      await creneau.save();
      
      return res.json({
        success: true,
        message: 'Créneau rouvert avec succès',
        creneau: creneau
      });
    }

    // Sinon, on supprime le créneau
    await creneau.deleteOne();

    res.json({
      success: true,
      message: 'Créneau supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression/réouverture du créneau:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;


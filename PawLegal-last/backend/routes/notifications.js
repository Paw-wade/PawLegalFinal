const express = require('express');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(protect);

// @route   GET /api/notifications
// @desc    Récupérer toutes les notifications de l'utilisateur connecté
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { lu, limit = 50 } = req.query;
    
    const filter = { user: req.user.id };
    if (lu !== undefined) {
      filter.lu = lu === 'true';
    }
    
    const notifications = await Notification.find(filter)
      // Toujours afficher les notifications non lues en premier,
      // puis trier chaque groupe par date de création (plus récentes en premier)
      .sort({ lu: 1, createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      count: notifications.length,
      notifications
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/notifications/unread
// @desc    Récupérer le nombre de notifications non lues
// @access  Private
router.get('/unread', async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user.id,
      lu: false
    });
    
    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Erreur lors du comptage des notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Marquer une notification comme lue
// @access  Private
router.put('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification non trouvée'
      });
    }
    
    // Vérifier que la notification appartient à l'utilisateur
    if (notification.user.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette notification'
      });
    }
    
    notification.lu = true;
    await notification.save();
    
    res.json({
      success: true,
      message: 'Notification marquée comme lue',
      notification
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la notification:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   PUT /api/notifications/read-all
// @desc    Marquer toutes les notifications comme lues
// @access  Private
router.put('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, lu: false },
      { lu: true }
    );
    
    res.json({
      success: true,
      message: 'Toutes les notifications ont été marquées comme lues'
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour des notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Supprimer une notification
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification non trouvée'
      });
    }
    
    // Vérifier que la notification appartient à l'utilisateur
    if (notification.user.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette notification'
      });
    }
    
    await notification.deleteOne();
    
    res.json({
      success: true,
      message: 'Notification supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la notification:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;


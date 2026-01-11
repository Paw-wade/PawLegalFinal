const express = require('express');
const router = express.Router();
const Trash = require('../models/Trash');
const MessageInterne = require('../models/MessageInterne');
const Document = require('../models/Document');
const Dossier = require('../models/Dossier');
const RendezVous = require('../models/RendezVous');
const Temoignage = require('../models/Temoignage');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// Toutes les routes nécessitent une authentification
router.use(protect);

// Mapping des types d'éléments vers leurs modèles
const modelMap = {
  message: MessageInterne,
  document: Document,
  dossier: Dossier,
  appointment: RendezVous,
  temoignage: Temoignage,
  task: Task,
  notification: Notification,
  user: User
};

// @route   GET /api/trash
// @desc    Récupérer tous les éléments de la corbeille
// @access  Private
router.get('/', async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user._id;
    
    // Construire le filtre selon le rôle
    let filter = {};
    
    if (userRole === 'client') {
      // Les clients voient uniquement leurs propres éléments supprimés
      filter = {
        $or: [
          { deletedBy: userId },
          { originalOwner: userId }
        ]
      };
    } else if (userRole === 'admin' || userRole === 'superadmin') {
      // Les admins voient tous les éléments
      filter = {};
    } else {
      // Autres rôles : uniquement leurs propres éléments
      filter = {
        $or: [
          { deletedBy: userId },
          { originalOwner: userId }
        ]
      };
    }
    
    // Filtres optionnels
    if (req.query.itemType) {
      filter.itemType = req.query.itemType;
    }
    
    if (req.query.origin) {
      filter.origin = req.query.origin;
    }
    
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Récupérer les éléments
    const trashItems = await Trash.find(filter)
      .populate('deletedBy', 'firstName lastName email role')
      .populate('originalOwner', 'firstName lastName email role')
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Compter le total
    const total = await Trash.countDocuments(filter);
    
    res.json({
      success: true,
      count: trashItems.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      items: trashItems
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la corbeille:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/trash/restore/:id
// @desc    Restaurer un élément de la corbeille
// @access  Private
router.post('/restore/:id', async (req, res) => {
  try {
    const trashId = req.params.id;
    const userId = req.user._id;
    const userRole = req.user.role;
    
    // Récupérer l'élément de la corbeille
    const trashItem = await Trash.findById(trashId)
      .populate('deletedBy', 'role')
      .populate('originalOwner', 'role');
    
    if (!trashItem) {
      return res.status(404).json({
        success: false,
        message: 'Élément non trouvé dans la corbeille'
      });
    }
    
    // Vérifier les permissions
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      // Les clients ne peuvent restaurer que leurs propres éléments
      const isOwner = trashItem.deletedBy._id.toString() === userId.toString() ||
                     (trashItem.originalOwner && trashItem.originalOwner._id.toString() === userId.toString());
      
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas la permission de restaurer cet élément'
        });
      }
    }
    
    // Récupérer le modèle correspondant
    const Model = modelMap[trashItem.itemType];
    
    if (!Model) {
      return res.status(400).json({
        success: false,
        message: `Type d'élément non supporté: ${trashItem.itemType}`
      });
    }
    
    // Vérifier si l'élément existe déjà (au cas où il aurait été restauré entre-temps)
    const existingItem = await Model.findById(trashItem.originalId);
    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Cet élément existe déjà. Il a peut-être déjà été restauré.'
      });
    }
    
    // Restaurer l'élément
    const restoredData = { ...trashItem.itemData };
    // Supprimer les champs qui ne doivent pas être restaurés
    delete restoredData._id;
    delete restoredData.__v;
    
    const restoredItem = await Model.create(restoredData);
    
    // Supprimer l'élément de la corbeille
    await Trash.findByIdAndDelete(trashId);
    
    res.json({
      success: true,
      message: 'Élément restauré avec succès',
      item: restoredItem
    });
  } catch (error) {
    console.error('Erreur lors de la restauration:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la restauration',
      error: error.message
    });
  }
});

// @route   DELETE /api/trash/:id
// @desc    Supprimer définitivement un élément de la corbeille
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const trashId = req.params.id;
    const userId = req.user._id;
    const userRole = req.user.role;
    
    // Récupérer l'élément de la corbeille
    const trashItem = await Trash.findById(trashId)
      .populate('deletedBy', 'role')
      .populate('originalOwner', 'role');
    
    if (!trashItem) {
      return res.status(404).json({
        success: false,
        message: 'Élément non trouvé dans la corbeille'
      });
    }
    
    // Vérifier les permissions
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      // Les clients ne peuvent supprimer définitivement que leurs propres éléments
      const isOwner = trashItem.deletedBy._id.toString() === userId.toString() ||
                     (trashItem.originalOwner && trashItem.originalOwner._id.toString() === userId.toString());
      
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas la permission de supprimer définitivement cet élément'
        });
      }
    }
    
    // Supprimer définitivement de la corbeille
    await Trash.findByIdAndDelete(trashId);
    
    res.json({
      success: true,
      message: 'Élément supprimé définitivement'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression définitive:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/trash/empty
// @desc    Vider la corbeille (supprimer définitivement tous les éléments)
// @access  Private/Admin
router.post('/empty', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const result = await Trash.deleteMany({});
    
    res.json({
      success: true,
      message: 'Corbeille vidée avec succès',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Erreur lors du vidage de la corbeille:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/trash/stats
// @desc    Récupérer les statistiques de la corbeille
// @access  Private
router.get('/stats', async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user._id;
    
    // Construire le filtre selon le rôle
    let filter = {};
    
    if (userRole === 'client') {
      filter = {
        $or: [
          { deletedBy: userId },
          { originalOwner: userId }
        ]
      };
    } else if (userRole !== 'admin' && userRole !== 'superadmin') {
      filter = {
        $or: [
          { deletedBy: userId },
          { originalOwner: userId }
        ]
      };
    }
    
    // Statistiques par type
    const statsByType = await Trash.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$itemType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Total
    const total = await Trash.countDocuments(filter);
    
    // Éléments qui seront supprimés automatiquement bientôt (dans les 7 prochains jours)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const expiringSoon = await Trash.countDocuments({
      ...filter,
      deletedAt: {
        $gte: thirtyDaysAgo,
        $lte: sevenDaysFromNow
      }
    });
    
    res.json({
      success: true,
      stats: {
        total,
        byType: statsByType,
        expiringSoon
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;


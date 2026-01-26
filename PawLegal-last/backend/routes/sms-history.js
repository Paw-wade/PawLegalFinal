const express = require('express');
const SmsHistory = require('../models/SmsHistory');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Toutes les routes nécessitent une authentification admin
router.use(protect);
router.use(authorize('admin', 'superadmin'));

// @route   GET /api/sms-history
// @desc    Récupérer l'historique des SMS
// @access  Private/Admin
router.get('/', async (req, res) => {
  try {
    const {
      to,
      status,
      context,
      templateCode,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const query = {};

    if (to) {
      query.to = { $regex: to, $options: 'i' };
    }
    if (status) {
      query.status = status;
    }
    if (context) {
      query.context = context;
    }
    if (templateCode) {
      query.templateCode = templateCode;
    }
    if (startDate || endDate) {
      query.sentAt = {};
      if (startDate) {
        query.sentAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.sentAt.$lte = end;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [history, total] = await Promise.all([
      SmsHistory.find(query)
        .populate('sentBy', 'firstName lastName email')
        .populate('sentToUser', 'firstName lastName email phone')
        .sort({ sentAt: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      SmsHistory.countDocuments(query)
    ]);

    // Statistiques
    const stats = await SmsHistory.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalCost: { $sum: '$cost' }
        }
      }
    ]);

    res.json({
      success: true,
      count: history.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      history,
      stats
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

// @route   GET /api/sms-history/stats
// @desc    Récupérer les statistiques des SMS
// @access  Private/Admin
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {};

    if (startDate || endDate) {
      query.sentAt = {};
      if (startDate) {
        query.sentAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.sentAt.$lte = end;
      }
    }

    const stats = await SmsHistory.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          totalCost: { $sum: '$cost' }
        }
      }
    ]);

    const contextStats = await SmsHistory.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$context',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      overall: stats[0] || { total: 0, sent: 0, delivered: 0, failed: 0, totalCost: 0 },
      byContext: contextStats
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

// @route   GET /api/sms-history/:id
// @desc    Récupérer un SMS par ID
// @access  Private/Admin
router.get('/:id', async (req, res) => {
  try {
    const sms = await SmsHistory.findById(req.params.id)
      .populate('sentBy', 'firstName lastName email')
      .populate('sentToUser', 'firstName lastName email phone');

    if (!sms) {
      return res.status(404).json({
        success: false,
        message: 'SMS non trouvé'
      });
    }

    res.json({
      success: true,
      sms
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;


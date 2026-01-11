const express = require('express');
const PDFDocument = require('pdfkit');
const Log = require('../models/Log');
const { protect, authorize } = require('../middleware/auth');
const { createDocumentWithHeader } = require('../utils/documentHeader');

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(protect);

// @route   GET /api/logs/dlog/pdf
// @desc    Générer et télécharger le DLOG en PDF pour une date donnée (SuperAdmin seulement)
// @access  Private/SuperAdmin
// NOTE: Cette route doit être définie AVANT la route '/' pour éviter les conflits
router.get('/dlog/pdf', authorize('superadmin'), async (req, res) => {
  try {
    const { date } = req.query;

    console.log('📥 Requête DLOG PDF reçue:', { date, user: req.user?.email });

    // stringify robuste (évite les erreurs BigInt / circular / etc.)
    const safeStringify = (value) => {
      try {
        return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      } catch (e) {
        try {
          return String(value);
        } catch (_e2) {
          return '[unserializable]';
        }
      }
    };

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'La date est requise (format: YYYY-MM-DD)'
      });
    }

    // Valider le format de date
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Format de date invalide. Utilisez le format YYYY-MM-DD (ex: 2024-12-25)'
      });
    }

    const selectedDate = new Date(date + 'T00:00:00.000Z');
    if (isNaN(selectedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Date invalide. Veuillez vérifier la date fournie'
      });
    }

    // Définir le début et la fin de la journée
    const startDate = new Date(selectedDate);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(selectedDate);
    endDate.setHours(23, 59, 59, 999);

    // Récupérer tous les logs de la journée
    const logs = await Log.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    })
      .populate('user', 'firstName lastName email role')
      .populate('targetUser', 'firstName lastName email role')
      .sort({ createdAt: 1 });

    // Vérifier que les logs existent avant de créer le PDF
    if (logs.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Aucun log trouvé pour la date ${date}`
      });
    }

    // Créer le document PDF avec en-tête standard
    const doc = createDocumentWithHeader({
      margin: 50,
      size: 'A4'
    });

    // Configurer les headers de réponse AVANT de pipe
    const filename = `DLOG_${date.replace(/-/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

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

    // Suivre le nombre de pages
    let pageCount = 1;
    
    // Fonction pour ajouter le numéro de page en bas de chaque page
    const addPageFooter = () => {
      try {
        const savedY = doc.y;
        doc.fontSize(8)
           .fillColor('#666666')
           .text(
             `Page ${pageCount} - DLOG ${date}`,
             50,
             doc.page.height - 30,
             { align: 'center', width: 500 }
           );
        doc.y = savedY;
      } catch (err) {
        console.warn('⚠️ Erreur lors de l\'ajout du footer de page:', err.message);
        // Continuer même si l'ajout du footer échoue
      }
    };

    // Pipe le PDF vers la réponse
    doc.pipe(res);
    
    // Ajouter le numéro de page à chaque nouvelle page créée
    doc.on('pageAdded', () => {
      pageCount++;
      addPageFooter();
    });

    // En-tête du document
    doc.fontSize(20)
       .fillColor('#FF6600')
       .text('DLOG - Journal des Activités', { align: 'center' })
       .moveDown();

    doc.fontSize(12)
       .fillColor('#000000')
       .text(`Date: ${selectedDate.toLocaleDateString('fr-FR', { 
         weekday: 'long', 
         year: 'numeric', 
         month: 'long', 
         day: 'numeric' 
       })}`, { align: 'center' })
       .moveDown();

    doc.text(`Généré le: ${new Date().toLocaleString('fr-FR')}`, { align: 'center' })
       .moveDown(2);

    // Informations de synthèse
    doc.fontSize(14)
       .fillColor('#333333')
       .text('Synthèse', { underline: true })
       .moveDown();

    doc.fontSize(10)
       .fillColor('#000000')
       .text(`Nombre total d'actions: ${logs.length}`, { indent: 20 })
       .moveDown(0.5);

    // Statistiques par action
    const statsByAction = {};
    logs.forEach(log => {
      statsByAction[log.action] = (statsByAction[log.action] || 0) + 1;
    });

    if (Object.keys(statsByAction).length > 0) {
      doc.text('Répartition par type d\'action:', { indent: 20 })
         .moveDown(0.5);
      Object.entries(statsByAction)
        .sort((a, b) => b[1] - a[1])
        .forEach(([action, count]) => {
          doc.text(`  • ${action}: ${count}`, { indent: 30 });
        });
      doc.moveDown();
    }

    // Ligne de séparation
    doc.moveTo(50, doc.y)
       .lineTo(550, doc.y)
       .stroke()
       .moveDown();

    // Détail des logs
    doc.fontSize(14)
       .fillColor('#333333')
       .text('Détail des Actions', { underline: true })
       .moveDown();

    if (logs.length === 0) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text('Aucune action enregistrée pour cette date.', { indent: 20 });
    } else {
      logs.forEach((log, index) => {
        try {
        // Vérifier si on doit ajouter une nouvelle page
        if (doc.y > 700) {
          doc.addPage();
        }

        doc.fontSize(10)
           .fillColor('#000000');

        // Numéro de l'action
        doc.fontSize(9)
           .fillColor('#666666')
           .text(`Action #${index + 1}`, { indent: 20 })
           .moveDown(0.3);

        // Heure
        const logTime = new Date(log.createdAt).toLocaleTimeString('fr-FR');
        doc.fontSize(9)
           .fillColor('#666666')
           .text(`Heure: ${logTime}`, { indent: 30 })
           .moveDown(0.3);

        // Type d'action
        doc.fontSize(10)
           .fillColor('#FF6600')
           .text(`Type: ${log.action}`, { indent: 30 })
           .moveDown(0.3);

        // Utilisateur
        const userName = log.user 
          ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.userEmail
          : log.userEmail || 'Utilisateur inconnu';
        doc.fontSize(10)
           .fillColor('#000000')
           .text(`Utilisateur: ${userName}`, { indent: 30 })
           .moveDown(0.3);

        // Utilisateur cible (si applicable)
        if (log.targetUser || log.targetUserEmail) {
          const targetUserName = log.targetUser
            ? `${log.targetUser.firstName || ''} ${log.targetUser.lastName || ''}`.trim() || log.targetUserEmail
            : log.targetUserEmail || 'Utilisateur inconnu';
          doc.text(`Utilisateur cible: ${targetUserName}`, { indent: 30 })
             .moveDown(0.3);
        }

        // Description
        doc.text(`Description: ${log.description}`, { indent: 30 })
           .moveDown(0.3);

        // Adresse IP
        if (log.ipAddress) {
          doc.fontSize(9)
             .fillColor('#666666')
             .text(`IP: ${log.ipAddress}`, { indent: 30 })
             .moveDown(0.3);
        }

        // Métadonnées (si présentes)
        if (log.metadata && Object.keys(log.metadata).length > 0) {
          doc.fontSize(9)
             .fillColor('#666666')
             .text('Métadonnées:', { indent: 30 })
             .moveDown(0.2);
          Object.entries(log.metadata).forEach(([key, value]) => {
            const serialized = safeStringify(value);
            // éviter les lignes gigantesques qui peuvent faire exploser le PDF
            const clipped = typeof serialized === 'string' && serialized.length > 2000
              ? `${serialized.slice(0, 2000)}…`
              : serialized;
            doc.text(`  ${key}: ${clipped}`, { indent: 40 });
          });
        }

        // Ligne de séparation entre les actions
        doc.moveDown(0.5)
           .moveTo(50, doc.y)
           .lineTo(550, doc.y)
           .stroke()
           .moveDown();
        } catch (perLogErr) {
          console.warn('⚠️ Log ignoré lors de la génération PDF (erreur sur une entrée):', perLogErr?.message || perLogErr);
          try {
            doc.fontSize(9)
              .fillColor('#cc0000')
              .text(`⚠️ Erreur sur l'action #${index + 1} (entrée ignorée)`, { indent: 20 })
              .moveDown(0.5);
          } catch (_ignore) {}
        }
      });
    }

    // Ajouter le numéro de page sur la première page
    addPageFooter();
    
    doc.on('end', () => {
      console.log('✅ DLOG PDF généré avec succès pour la date:', date);
    });

    // Finaliser le PDF
    doc.end();

  } catch (error) {
    console.error('❌ Erreur lors de la génération du DLOG PDF:', error);
    console.error('Stack trace:', error.stack);
    
    // Vérifier si les headers ont déjà été envoyés
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la génération du PDF',
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } else {
      // Si les headers sont déjà envoyés, on ne peut que logger l'erreur
      console.error('⚠️ Impossible d\'envoyer une réponse d\'erreur: headers déjà envoyés');
    }
  }
});

// @route   GET /api/logs
// @desc    Récupérer tous les logs (SuperAdmin seulement)
// @access  Private/SuperAdmin
router.get('/', authorize('superadmin'), async (req, res) => {
  try {
    const {
      action,
      userId,
      targetUserId,
      startDate,
      endDate,
      limit = 100,
      page = 1
    } = req.query;

    // Construire le filtre
    const filter = {};

    if (action) {
      filter.action = action;
    }

    if (userId) {
      filter.user = userId;
    }

    if (targetUserId) {
      filter.targetUser = targetUserId;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const sd = new Date(startDate);
        if (!isNaN(sd.getTime())) {
          sd.setHours(0, 0, 0, 0);
          filter.createdAt.$gte = sd;
        }
      }
      if (endDate) {
        const ed = new Date(endDate);
        if (!isNaN(ed.getTime())) {
          ed.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = ed;
        }
      }
    }

    // Calculer la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Récupérer les logs avec pagination
    const logs = await Log.find(filter)
      .populate('user', 'firstName lastName email role')
      .populate('targetUser', 'firstName lastName email role')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    // Compter le total
    const total = await Log.countDocuments(filter);

    res.json({
      success: true,
      count: logs.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      logs
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/logs/stats
// @desc    Récupérer les statistiques des logs (SuperAdmin seulement)
// @access  Private/SuperAdmin
router.get('/stats', authorize('superadmin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    // Statistiques par action
    const statsByAction = await Log.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Statistiques par jour
    const statsByDay = await Log.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);

    // Nombre total de connexions
    const loginCount = await Log.countDocuments({
      ...filter,
      action: 'login'
    });

    // Nombre total d'actions
    const totalActions = await Log.countDocuments(filter);

    res.json({
      success: true,
      stats: {
        totalActions,
        loginCount,
        byAction: statsByAction,
        byDay: statsByDay
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



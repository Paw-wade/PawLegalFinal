const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const { sendSMS, sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');
const User = require('../models/User');
const Log = require('../models/Log');

// @route   POST /api/sms/send
// @desc    Envoyer un SMS (admin seulement)
// @access  Private/Admin
router.post(
  '/send',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('to').trim().notEmpty().withMessage('Le numéro de téléphone est requis'),
    body('message').trim().notEmpty().withMessage('Le message est requis').isLength({ max: 1600 }).withMessage('Le message ne peut pas dépasser 1600 caractères')
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

      const { to, message } = req.body;
      const adminId = req.user.id;
      const adminEmail = req.user.email;

      // Envoyer le SMS
      const result = await sendSMS(to, message);

      // Logger l'action
      try {
        await Log.create({
          user: adminId,
          userEmail: adminEmail,
          action: 'send_sms',
          description: `Envoi d'un SMS à ${result.to}`,
          metadata: {
            to: result.to,
            messageLength: message.length,
            twilioSid: result.sid,
            status: result.status
          }
        });
      } catch (logError) {
        console.error('⚠️ Erreur lors de la journalisation:', logError);
      }

      res.json({
        success: true,
        message: 'SMS envoyé avec succès',
        data: result
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi du SMS:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de l\'envoi du SMS',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   POST /api/sms/notification
// @desc    Envoyer un SMS de notification (admin seulement)
// @access  Private/Admin
router.post(
  '/notification',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('to').trim().notEmpty().withMessage('Le numéro de téléphone est requis'),
    body('type').trim().notEmpty().withMessage('Le type de notification est requis'),
    body('data').optional().isObject().withMessage('Les données doivent être un objet')
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

      const { to, type, data = {} } = req.body;
      const adminId = req.user.id;
      const adminEmail = req.user.email;

      // Envoyer le SMS de notification
      const result = await sendNotificationSMS(to, type, data);

      // Logger l'action
      try {
        await Log.create({
          user: adminId,
          userEmail: adminEmail,
          action: 'send_notification_sms',
          description: `Envoi d'un SMS de notification (${type}) à ${result.to}`,
          metadata: {
            to: result.to,
            type: type,
            twilioSid: result.sid,
            status: result.status,
            data: data
          }
        });
      } catch (logError) {
        console.error('⚠️ Erreur lors de la journalisation:', logError);
      }

      res.json({
        success: true,
        message: 'SMS de notification envoyé avec succès',
        data: result
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi du SMS de notification:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de l\'envoi du SMS de notification',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   POST /api/sms/bulk
// @desc    Envoyer un SMS à plusieurs destinataires (admin seulement)
// @access  Private/Admin
router.post(
  '/bulk',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('recipients').isArray({ min: 1 }).withMessage('Au moins un destinataire est requis'),
    body('recipients.*.phone').trim().notEmpty().withMessage('Le numéro de téléphone est requis pour chaque destinataire'),
    body('message').trim().notEmpty().withMessage('Le message est requis').isLength({ max: 1600 }).withMessage('Le message ne peut pas dépasser 1600 caractères')
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

      const { recipients, message } = req.body;
      const adminId = req.user.id;
      const adminEmail = req.user.email;

      const results = [];
      const smsErrors = [];

      // Envoyer les SMS à tous les destinataires
      for (const recipient of recipients) {
        try {
          const result = await sendSMS(recipient.phone, message);
          results.push({
            phone: recipient.phone,
            name: recipient.name || 'N/A',
            success: true,
            sid: result.sid,
            status: result.status
          });
        } catch (error) {
          smsErrors.push({
            phone: recipient.phone,
            name: recipient.name || 'N/A',
            success: false,
            error: error.message
          });
        }
      }

      // Logger l'action
      try {
        await Log.create({
          user: adminId,
          userEmail: adminEmail,
          action: 'send_bulk_sms',
          description: `Envoi de ${recipients.length} SMS (${results.length} réussis, ${smsErrors.length} échoués)`,
          metadata: {
            total: recipients.length,
            success: results.length,
            failed: smsErrors.length,
            results: results,
            errors: smsErrors
          }
        });
      } catch (logError) {
        console.error('⚠️ Erreur lors de la journalisation:', logError);
      }

      res.json({
        success: true,
        message: `SMS envoyés: ${results.length} réussis, ${smsErrors.length} échoués`,
        data: {
          total: recipients.length,
          success: results.length,
          failed: smsErrors.length,
          results: results,
          errors: smsErrors
        }
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi en masse des SMS:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de l\'envoi en masse des SMS',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   POST /api/sms/format-phone
// @desc    Formater un numéro de téléphone (utilitaire)
// @access  Private
router.post(
  '/format-phone',
  protect,
  [
    body('phone').trim().notEmpty().withMessage('Le numéro de téléphone est requis')
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

      const { phone } = req.body;
      const formatted = formatPhoneNumber(phone);

      if (!formatted) {
        return res.status(400).json({
          success: false,
          message: 'Numéro de téléphone invalide'
        });
      }

      res.json({
        success: true,
        data: {
          original: phone,
          formatted: formatted
        }
      });
    } catch (error) {
      console.error('❌ Erreur lors du formatage du numéro:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du formatage du numéro',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;


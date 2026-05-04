const express = require('express');
const { body, validationResult } = require('express-validator');
const OTP = require('../models/OTP');
const User = require('../models/User');
const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Générer un token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your-secret-key-here', {
    expiresIn: '30d'
  });
};

// Générer un code OTP aléatoire (6 chiffres)
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// @route   POST /api/otp/send
// @desc    Envoyer un code OTP par SMS
// @access  Public
router.post(
  '/send',
  [
    body('firstName').trim().notEmpty().withMessage('Le prénom est requis'),
    body('lastName').trim().notEmpty().withMessage('Le nom est requis'),
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

      const { firstName, lastName, phone, email } = req.body;

      // Formater le numéro de téléphone
      const formattedPhone = formatPhoneNumber(phone);
      if (!formattedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Numéro de téléphone invalide'
        });
      }

      // Vérifier si un utilisateur avec ce numéro existe déjà
      // Permettre la réinscription si l'utilisateur n'a pas encore défini de mot de passe
      const existingUser = await User.findOne({ phone: formattedPhone });
      if (existingUser && existingUser.password && !existingUser.needsPasswordSetup) {
        return res.status(400).json({
          success: false,
          message: 'Un compte avec ce numéro de téléphone existe déjà. Veuillez vous connecter.'
        });
      }

      // Générer un code OTP
      const code = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Supprimer les anciens codes OTP pour ce numéro
      await OTP.deleteMany({ phone: formattedPhone });

      // Créer un nouveau code OTP
      const otpData = {
        phone: formattedPhone,
        code,
        firstName,
        lastName,
        expiresAt
      };

      if (email && email.trim() !== '') {
        otpData.email = email.trim().toLowerCase();
      }

      const otp = await OTP.create(otpData);

      // Envoyer le SMS avec le code OTP (modèle `otp` éditable dans Admin → SMS)
      try {
        // En mode développement, permettre de continuer sans SMS réel si Twilio n'est pas configuré
        const allowWithoutSMS = process.env.NODE_ENV === 'development' && process.env.ALLOW_OTP_WITHOUT_SMS === 'true';
        const twilioNotConfigured = !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN;
        
        if (allowWithoutSMS || twilioNotConfigured) {
          console.log(`⚠️ Mode développement: SMS simulé pour ${formattedPhone}`);
          console.log(`📱 Code OTP généré: ${code} (valide 10 minutes)`);
          
          res.json({
            success: true,
            message: 'Code OTP généré avec succès (mode développement - SMS simulé)',
            expiresAt: expiresAt.toISOString(),
            code: code // Retourner le code en mode développement pour faciliter les tests
          });
          return;
        }
        
        await sendNotificationSMS(
          formattedPhone,
          'otp',
          { code },
          {
            skipPreferences: true,
            context: 'otp',
            contextId: otp._id.toString(),
          }
        );

        console.log(`✅ Code OTP envoyé à ${formattedPhone}: ${code}`);
        
        res.json({
          success: true,
          message: 'Code OTP envoyé avec succès',
          expiresAt: expiresAt.toISOString()
        });
      } catch (smsError) {
        console.error('❌ Erreur lors de l\'envoi du SMS:', smsError);
        console.error('❌ Détails de l\'erreur:', {
          message: smsError.message,
          code: smsError.code,
          stack: process.env.NODE_ENV === 'development' ? smsError.stack : undefined
        });
        
        // En mode développement, permettre de continuer même si l'envoi SMS échoue
        if (process.env.NODE_ENV === 'development') {
          console.log(`⚠️ Mode développement: SMS échoué mais code OTP conservé pour ${formattedPhone}`);
          console.log(`📱 Code OTP généré: ${code} (valide 10 minutes)`);
          
          res.json({
            success: true,
            message: 'Code OTP généré avec succès (mode développement - SMS échoué)',
            expiresAt: expiresAt.toISOString(),
            code: code,
            warning: `Erreur SMS: ${smsError.message}`
          });
          return;
        }
        
        // Supprimer le code OTP si l'envoi du SMS échoue (en production uniquement)
        await OTP.findByIdAndDelete(otp._id);
        
        // Message d'erreur plus détaillé selon le type d'erreur
        let errorMessage = 'Erreur lors de l\'envoi du SMS. Veuillez réessayer.';
        
        if (smsError.message?.includes('Twilio n\'est pas configuré')) {
          errorMessage = 'Le service SMS n\'est pas configuré. Veuillez contacter l\'administrateur.';
        } else if (smsError.message?.includes('numéro de téléphone n\'est pas vérifié')) {
          errorMessage = 'Ce numéro de téléphone n\'est pas vérifié. En mode test, seuls les numéros vérifiés peuvent recevoir des SMS.';
        } else if (smsError.message?.includes('Numéro de téléphone invalide')) {
          errorMessage = 'Le numéro de téléphone fourni est invalide. Veuillez vérifier le format.';
        } else if (smsError.message) {
          errorMessage = `Erreur SMS: ${smsError.message}`;
        }
        
        return res.status(500).json({
          success: false,
          message: errorMessage,
          error: process.env.NODE_ENV === 'development' ? smsError.message : undefined
        });
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'OTP:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

// @route   POST /api/otp/verify
// @desc    Vérifier le code OTP et créer le compte
// @access  Public
router.post(
  '/verify',
  [
    body('phone').trim().notEmpty().withMessage('Le numéro de téléphone est requis'),
    body('code').trim().notEmpty().withMessage('Le code OTP est requis'),
    body('email').optional({ nullable: true, checkFalsy: true }).custom((value) => {
      if (value && value.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error('Email invalide');
        }
      }
      return true;
    }).normalizeEmail()
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

      const { phone, code, email } = req.body;

      // Formater le numéro de téléphone
      const formattedPhone = formatPhoneNumber(phone);
      if (!formattedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Numéro de téléphone invalide'
        });
      }

      // Trouver le code OTP
      const otp = await OTP.findOne({
        phone: formattedPhone,
        code: code.trim(),
        verified: false
      });

      if (!otp) {
        return res.status(400).json({
          success: false,
          message: 'Code OTP invalide ou expiré'
        });
      }

      // Vérifier si le code n'a pas expiré
      if (new Date() > otp.expiresAt) {
        await OTP.findByIdAndDelete(otp._id);
        return res.status(400).json({
          success: false,
          message: 'Code OTP expiré. Veuillez demander un nouveau code.'
        });
      }

      // Mettre à jour l'OTP avec l'email si fourni lors de la vérification
      if (email && email.trim() !== '') {
        otp.email = email.trim().toLowerCase();
      }
      await otp.save();

      // Vérifier si un utilisateur avec ce numéro existe déjà
      let user = await User.findOne({ phone: formattedPhone });
      
      // Rôle par défaut pour une inscription publique via OTP
      const finalRole = 'client';
      
      if (!user) {
        // Créer un nouvel utilisateur sans mot de passe
        const userData = {
          firstName: otp.firstName,
          lastName: otp.lastName,
          phone: formattedPhone,
          phoneVerified: true,
          needsPasswordSetup: true, // L'utilisateur devra définir un mot de passe
          role: finalRole,
          profilComplete: false
        };

        if (otp.email && otp.email.trim() !== '') {
          userData.email = otp.email.trim().toLowerCase();
        }
        if (otp.organisationName && otp.organisationName.trim() !== '') {
          userData.organisationName = otp.organisationName.trim();
        }

        user = await User.create(userData);

        // Créer les permissions par défaut (toutes refusées pour consulat, avocat et association)
        if (finalRole === 'consulat' || finalRole === 'avocat' || finalRole === 'association') {
          const Permission = require('../models/Permission');
          const allDomaines = [
            'tableau_de_bord', 'utilisateurs', 'dossiers', 'taches',
            'rendez_vous', 'creneaux', 'messages', 'documents',
            'temoignages', 'notifications', 'sms', 'cms', 'logs', 'corbeille'
          ];
          
          const defaultPermissions = allDomaines.map(domaine => ({
            domaine,
            consulter: false,
            modifier: false,
            nePasConsulter: true,
            nePasModifier: true,
            supprimer: false
          }));

          await Permission.create({
            user: user._id,
            roles: [finalRole],
            permissions: defaultPermissions
          });
          console.log('✅ Permissions par défaut créées (toutes refusées) pour', finalRole);
        }
      } else {
        // Mettre à jour l'utilisateur existant
        user.phoneVerified = true;
        if (otp.email && otp.email.trim() !== '' && !user.email) {
          user.email = otp.email.trim().toLowerCase();
        }
        if (otp.organisationName && otp.organisationName.trim() !== '' && !user.organisationName) {
          user.organisationName = otp.organisationName.trim();
        }
        await user.save();
      }

      // Marquer le code OTP comme vérifié
      otp.verified = true;
      await otp.save();

      // Générer un token JWT
      const token = generateToken(user._id);

      // Logger la création de compte
      try {
        const Log = require('../models/Log');
        await Log.create({
          action: 'signup_otp',
          user: user._id,
          userEmail: user.email || `phone:${formattedPhone}`,
          description: `Création de compte via OTP pour ${formattedPhone}`,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.get('user-agent'),
          metadata: {
            phone: formattedPhone,
            needsPasswordSetup: true
          }
        });
      } catch (logError) {
        console.error('Erreur lors de l\'enregistrement du log:', logError);
      }

      res.json({
        success: true,
        message: 'Code OTP vérifié avec succès',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          phoneVerified: user.phoneVerified,
          needsPasswordSetup: user.needsPasswordSetup,
          profilComplete: user.profilComplete || false
        }
      });
    } catch (error) {
      console.error('Erreur lors de la vérification de l\'OTP:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
);

module.exports = router;


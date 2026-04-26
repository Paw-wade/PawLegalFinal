const User = require('../models/User');
const Log = require('../models/Log');
const Notification = require('../models/Notification');

/**
 * Middleware pour gérer l'impersonation
 * Vérifie les headers X-Impersonate-User-Id et X-Impersonate-Admin-Id
 * et valide que l'admin a les droits d'impersonation
 */
const handleImpersonation = async (req, res, next) => {
  try {
    const impersonateUserId = req.headers['x-impersonate-user-id'];
    const impersonateAdminId = req.headers['x-impersonate-admin-id'];

    // Si pas d'impersonation, continuer normalement
    if (!impersonateUserId || !impersonateAdminId) {
      req.impersonateUserId = null;
      req.impersonateAdminId = null;
      return next();
    }

    // Vérifier que l'utilisateur connecté est bien l'admin qui demande l'impersonation
    if (req.user.id.toString() !== impersonateAdminId) {
      console.warn('⚠️ Tentative d\'impersonation non autorisée:', {
        connectedUser: req.user.id,
        requestedAdmin: impersonateAdminId
      });
      return res.status(403).json({
        success: false,
        message: 'Impersonation non autorisée'
      });
    }

    // Vérifier que l'utilisateur connecté est admin ou superadmin
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      console.warn('⚠️ Tentative d\'impersonation par un non-admin:', req.user.email);
      return res.status(403).json({
        success: false,
        message: 'Seuls les administrateurs peuvent utiliser l\'impersonation'
      });
    }

    // Vérifier que l'utilisateur à impersonner existe
    const targetUser = await User.findById(impersonateUserId);
    if (!targetUser) {
      console.warn('⚠️ Utilisateur à impersonner non trouvé:', impersonateUserId);
      return res.status(404).json({
        success: false,
        message: 'Utilisateur à impersonner non trouvé'
      });
    }

    // Logger l'action d'impersonation (de manière asynchrone, ne pas bloquer)
    Log.create({
      user: req.user.id,
      userEmail: req.user.email,
      targetUser: impersonateUserId,
      targetUserEmail: targetUser.email,
      action: 'impersonation_start',
      description: `${req.user.email} (${req.user.role}) a démarré une impersonation de ${targetUser.email}`,
      ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
      userAgent: req.get('user-agent'),
      metadata: {
        adminId: req.user.id.toString(),
        targetUserId: impersonateUserId,
        route: req.path,
        method: req.method
      }
    }).catch((logError) => {
      console.error('❌ Erreur lors de l\'enregistrement du log d\'impersonation:', logError);
      // Ne pas bloquer la requête si le log échoue
    });

    // Ajouter les informations d'impersonation à la requête
    req.impersonateUserId = impersonateUserId;
    req.impersonateAdminId = impersonateAdminId;
    req.impersonateTargetUser = targetUser;

    console.log('👤 Impersonation active:', {
      admin: req.user.email,
      targetUser: targetUser.email,
      route: req.path
    });

    next();
  } catch (error) {
    console.error('❌ Erreur dans le middleware d\'impersonation:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la gestion de l\'impersonation'
    });
  }
};

/**
 * Helper pour logger les actions en mode impersonation
 */
const logImpersonationAction = async (req, action, description, metadata = {}) => {
  if (!req.impersonateUserId) return; // Pas d'impersonation, pas de log spécial

  try {
    await Log.create({
      user: req.impersonateAdminId,
      userEmail: req.user.email,
      targetUser: req.impersonateUserId,
      targetUserEmail: req.impersonateTargetUser?.email,
      action: `impersonation_${action}`,
      description: `[IMPERSONATION] ${req.user.email} (${req.user.role}) - ${description}`,
      ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
      userAgent: req.get('user-agent'),
      metadata: {
        adminId: req.impersonateAdminId,
        targetUserId: req.impersonateUserId,
        route: req.path,
        method: req.method,
        ...metadata
      }
    });
  } catch (logError) {
    console.error('❌ Erreur lors de l\'enregistrement du log d\'action impersonation:', logError);
  }
};

/**
 * Helper pour notifier l'utilisateur impersonné et tous les autres administrateurs
 * lorsqu'une action est effectuée en mode impersonation
 */
const notifyImpersonationAction = async (req, actionType, titre, message, lien = null, metadata = {}) => {
  if (!req.impersonateUserId) return; // Pas d'impersonation, pas de notification spéciale

  try {
    const adminName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
    const targetUserName = req.impersonateTargetUser 
      ? `${req.impersonateTargetUser.firstName || ''} ${req.impersonateTargetUser.lastName || ''}`.trim() || req.impersonateTargetUser.email
      : 'Utilisateur';

    // 1. Notifier l'utilisateur impersonné
    if (req.impersonateUserId) {
      try {
        await Notification.create({
          user: req.impersonateUserId,
          type: actionType || 'other',
          titre: titre || 'Action effectuée sur votre compte',
          message: message || `L'administrateur ${adminName} a effectué une action sur votre compte en mode impersonation.`,
          lien: lien,
          metadata: {
            ...metadata,
            impersonation: true,
            adminId: req.impersonateAdminId,
            adminEmail: req.user.email,
            adminName: adminName
          }
        });
        console.log(`✅ Notification envoyée à l'utilisateur impersonné: ${req.impersonateTargetUser?.email}`);
      } catch (notifError) {
        console.error('❌ Erreur lors de la notification de l\'utilisateur impersonné:', notifError);
      }
    }

    // 2. Notifier tous les autres administrateurs (sauf celui qui effectue l'action)
    try {
      const otherAdmins = await User.find({
        role: { $in: ['admin', 'superadmin'] },
        _id: { $ne: req.impersonateAdminId }, // Exclure l'admin qui effectue l'action
        isActive: true
      });

      const adminNotificationMessage = `L'administrateur ${adminName} (${req.user.email}) a effectué l'action suivante sur le compte de ${targetUserName} (${req.impersonateTargetUser?.email}) en mode impersonation : ${message || 'Action effectuée'}`;

      for (const admin of otherAdmins) {
        try {
          await Notification.create({
            user: admin._id,
            type: actionType || 'other',
            titre: titre || `Action impersonation - ${targetUserName}`,
            message: adminNotificationMessage,
            lien: lien,
            metadata: {
              ...metadata,
              impersonation: true,
              adminId: req.impersonateAdminId,
              adminEmail: req.user.email,
              adminName: adminName,
              targetUserId: req.impersonateUserId,
              targetUserEmail: req.impersonateTargetUser?.email,
              targetUserName: targetUserName
            }
          });
        } catch (adminNotifError) {
          console.error(`❌ Erreur lors de la notification de l'admin ${admin.email}:`, adminNotifError);
        }
      }
      console.log(`✅ Notifications envoyées à ${otherAdmins.length} administrateur(s)`);
    } catch (adminsError) {
      console.error('❌ Erreur lors de la notification des administrateurs:', adminsError);
    }

    // 3. Logger l'action
    await logImpersonationAction(req, actionType || 'action', message || 'Action effectuée en mode impersonation', metadata);

  } catch (error) {
    console.error('❌ Erreur lors de la notification d\'action impersonation:', error);
    // Ne pas bloquer l'action principale si les notifications échouent
  }
};

/**
 * Helper pour obtenir l'ID utilisateur effectif (impersonné si en impersonation, sinon l'utilisateur connecté)
 * Cette fonction doit être utilisée partout où on enregistre une action au nom d'un utilisateur
 */
const getEffectiveUserId = (req) => {
  return req.impersonateUserId || req.user?.id || null;
};

/**
 * Helper pour obtenir l'utilisateur effectif (impersonné si en impersonation, sinon l'utilisateur connecté)
 */
const getEffectiveUser = (req) => {
  return req.impersonateTargetUser || req.user || null;
};

module.exports = { 
  handleImpersonation, 
  logImpersonationAction, 
  notifyImpersonationAction,
  getEffectiveUserId,
  getEffectiveUser
};


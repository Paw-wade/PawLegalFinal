const Dossier = require('../models/Dossier');
const User = require('../models/User');

/**
 * Vérifie si l'utilisateur a les permissions nécessaires pour une action sur un dossier
 * @param {string} action - L'action à effectuer ('view', 'update_status', 'close', 'cancel', 'send_message', 'manage_team', 'change_leader')
 * @returns {Function} Middleware Express
 */
const checkDossierPermission = (action) => {
  return async (req, res, next) => {
    try {
      const dossierId = req.params.id;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Super Admin a tous les droits
      if (userRole === 'superadmin') {
        req.dossierPermission = {
          canView: true,
          canUpdateStatus: true,
          canClose: true,
          canCancel: true,
          canSendMessage: true,
          canManageTeam: true,
          canChangeLeader: true,
          isTeamLeader: false,
          isTeamMember: false,
          isSuperAdmin: true
        };
        return next();
      }

      const dossier = await Dossier.findById(dossierId)
        .populate('teamMembers', 'firstName lastName email role')
        .populate('teamLeader', 'firstName lastName email role');

      if (!dossier) {
        return res.status(404).json({
          success: false,
          message: 'Dossier non trouvé'
        });
      }

      // Vérifier si l'utilisateur est membre de l'équipe
      const isTeamMember = dossier.teamMembers.some(member => 
        (member._id || member).toString() === userId.toString()
      );

      // Vérifier si l'utilisateur est chef d'équipe
      const isTeamLeader = dossier.teamLeader && 
        (dossier.teamLeader._id || dossier.teamLeader).toString() === userId.toString();

      // Permissions par défaut
      const permissions = {
        canView: false,
        canUpdateStatus: false,
        canClose: false,
        canCancel: false,
        canSendMessage: false,
        canManageTeam: false,
        canChangeLeader: false,
        isTeamLeader: isTeamLeader,
        isTeamMember: isTeamMember,
        isSuperAdmin: false
      };

      // Si l'utilisateur est admin ou superadmin, il peut au moins voir
      if (userRole === 'admin' || userRole === 'superadmin') {
        permissions.canView = true;
      }

      // Si l'utilisateur est membre de l'équipe
      if (isTeamMember) {
        permissions.canView = true;
        // Les membres peuvent consulter et ajouter des notes internes (à implémenter)
      }

      // Si l'utilisateur est chef d'équipe
      if (isTeamLeader) {
        permissions.canView = true;
        permissions.canUpdateStatus = true;
        permissions.canClose = true;
        permissions.canCancel = true;
        permissions.canSendMessage = true;
        permissions.canManageTeam = true;
        permissions.canChangeLeader = true;
      }

      // Vérifier la permission spécifique demandée
      const actionPermissions = {
        'view': 'canView',
        'update_status': 'canUpdateStatus',
        'close': 'canClose',
        'cancel': 'canCancel',
        'send_message': 'canSendMessage',
        'manage_team': 'canManageTeam',
        'change_leader': 'canChangeLeader'
      };

      const requiredPermission = actionPermissions[action];
      if (!requiredPermission || !permissions[requiredPermission]) {
        return res.status(403).json({
          success: false,
          message: `Vous n'avez pas la permission d'effectuer cette action (${action}) sur ce dossier`,
          permissions: permissions
        });
      }

      req.dossierPermission = permissions;
      req.dossier = dossier;
      next();
    } catch (error) {
      console.error('Erreur lors de la vérification des permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la vérification des permissions',
        error: error.message
      });
    }
  };
};

module.exports = { checkDossierPermission };





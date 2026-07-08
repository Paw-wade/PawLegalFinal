const Permission = require('../models/Permission');
const { getPresetForRole, isStaffRole } = require('./rolePresets');

/**
 * Retourne la liste des _id de dossiers assignés à un utilisateur (membre de
 * l'équipe, chef d'équipe, ou champ legacy assignedTo).
 * Sert de base à l'accès "par assignation" : un membre du staff peut consulter
 * les dossiers (et leurs tâches/documents) qui lui sont assignés même s'il n'a
 * pas la permission de catégorie correspondante.
 */
async function getAssignedDossierIds(userId) {
  if (!userId) return [];
  // require local pour éviter tout cycle de dépendances au chargement
  const Dossier = require('../models/Dossier');
  const dossiers = await Dossier.find({
    $or: [
      { assignedTo: userId },
      { teamMembers: userId },
      { teamLeader: userId },
    ],
  })
    .select('_id')
    .lean();
  return dossiers.map((d) => d._id);
}

/**
 * Indique si un utilisateur possède une permission de catégorie pour une action
 * donnée. Le superadmin a toujours accès. À défaut de document Permission, on
 * utilise le preset du rôle.
 * action ∈ { 'consulter', 'modifier', 'supprimer' }
 */
async function userHasPermission(user, domaine, action = 'consulter') {
  if (!user) return false;
  if (user.role === 'superadmin') return true;

  const userId = user.id || user._id;
  let doc = null;
  try {
    doc = await Permission.findOne({ user: userId }).lean();
  } catch {
    doc = null;
  }

  let list = doc?.permissions;
  if (!list || list.length === 0) {
    list = getPresetForRole(user.role)?.permissions || [];
  }

  const perm = list.find((p) => p.domaine === domaine);
  if (!perm) return false;

  if (action === 'modifier') {
    return Boolean(perm.modifier) && !perm.nePasModifier;
  }
  if (action === 'supprimer') {
    return Boolean(perm.supprimer);
  }
  return Boolean(perm.consulter) && !perm.nePasConsulter;
}

function normalizeRefId(ref) {
  if (!ref) return null;
  return String(ref._id || ref);
}

/** Vérifie si l'utilisateur fait partie de l'équipe du dossier (assigné, membre ou chef). */
function isUserOnDossierTeam(dossier, userId) {
  if (!dossier || !userId) return false;
  const uid = String(userId);
  if (normalizeRefId(dossier.assignedTo) === uid) return true;
  if (normalizeRefId(dossier.teamLeader) === uid) return true;
  if (Array.isArray(dossier.teamMembers)) {
    return dossier.teamMembers.some((m) => normalizeRefId(m) === uid);
  }
  return false;
}

/** Champs modifiables en mode restreint (dossier assigné sans permission "modifier"). */
const SCOPED_DOSSIER_MODIFY_FIELDS = new Set([
  'statut',
  'notes',
  'isPinned',
  'isStandby',
  'standbyReason',
  'standbyUntil',
]);

function getScopedDossierModifyViolations(body) {
  if (!body || typeof body !== 'object') return [];
  return Object.keys(body).filter(
    (key) => body[key] !== undefined && !SCOPED_DOSSIER_MODIFY_FIELDS.has(key)
  );
}

module.exports = {
  getAssignedDossierIds,
  userHasPermission,
  isStaffRole,
  isUserOnDossierTeam,
  SCOPED_DOSSIER_MODIFY_FIELDS,
  getScopedDossierModifyViolations,
};

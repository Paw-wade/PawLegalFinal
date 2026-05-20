const M = require('../tenantModels');

/**
 * Vérifie l'accès au dossier (aligné sur GET /user/dossiers/:id/recap).
 */
async function assertUserCanAccessDossier(req, dossierId) {
  const dossier = await M.Dossier.findById(dossierId)
    .select('user assignedTo teamMembers transmittedTo')
    .lean();

  if (!dossier) {
    const err = new Error('Dossier non trouvé');
    err.status = 404;
    throw err;
  }

  const userId = req.user.id.toString();
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
  const ownerId = dossier.user ? String(dossier.user) : null;
  const isOwner = ownerId && ownerId === userId;
  const assignedId = dossier.assignedTo ? String(dossier.assignedTo) : null;
  const isAssigned = assignedId && assignedId === userId;
  const isTeamMember =
    Array.isArray(dossier.teamMembers) &&
    dossier.teamMembers.some((m) => String(m) === userId);
  const isPartenaire = req.user.role === 'partenaire';
  const isTransmittedToPartenaire =
    isPartenaire &&
    Array.isArray(dossier.transmittedTo) &&
    dossier.transmittedTo.some((t) => {
      if (!t?.partenaire) return false;
      const partenaireId = t.partenaire._id
        ? String(t.partenaire._id)
        : String(t.partenaire);
      return partenaireId === userId;
    });

  if (!isAdmin && !isOwner && !isAssigned && !isTeamMember && !isTransmittedToPartenaire) {
    const err = new Error('Accès non autorisé à ce dossier');
    err.status = 403;
    throw err;
  }

  return dossier;
}

module.exports = { assertUserCanAccessDossier };

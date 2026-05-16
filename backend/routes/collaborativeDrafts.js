const express = require('express');
const router = express.Router();

const M = require('../tenantModels');
const { protect } = require('../middleware/auth');

// Middleware d'auth obligatoire pour toutes les routes
router.use(protect);

// Vérifier si l'utilisateur est admin (ou assimilé) ou partenaire
function isAdmin(user) {
  return ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'].includes(
    user.role
  );
}

function isPartenaire(user) {
  return user.role === 'partenaire';
}

function isClient(user) {
  return user.role === 'client';
}

/** Le compte connecté est le client propriétaire du dossier (dossier.user). */
function isClientOwnerOfDossier(user, dossier) {
  if (!isClient(user) || !dossier || !dossier.user) return false;
  return dossier.user.toString() === user._id.toString();
}

/** Résout l'entrée partnerAccess pour l'utilisateur (partner peut être un ObjectId ou un objet peuplé). */
function getPartnerAccessEntry(draft, userId) {
  const uid = userId.toString();
  if (!draft.partnerAccess || !draft.partnerAccess.length) return null;
  return (
    draft.partnerAccess.find((p) => {
      const raw = p.partner;
      if (!raw) return false;
      const pid =
        typeof raw === 'object' && raw !== null && raw._id != null
          ? raw._id.toString()
          : raw.toString();
      return pid === uid;
    }) || null
  );
}

function clientDisplayName(dossier) {
  if (!dossier) return '';
  const u = dossier.user;
  if (u && (u.firstName || u.lastName)) {
    return [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  }
  const n = [dossier.clientPrenom, dossier.clientNom].filter(Boolean).join(' ').trim();
  return n || dossier.clientEmail || '—';
}

function parseDueDateField(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

async function buildGlobalCollaborativeQuery(user, qTrim) {
  const parts = [];
  if (isAdmin(user)) {
    parts.push({
      $or: [
        { visibleToAdmins: true, excludedAdminIds: { $ne: user._id } },
        { createdBy: user._id },
      ],
    });
  } else if (isPartenaire(user)) {
    parts.push({
      $or: [{ 'partnerAccess.partner': user._id }, { createdBy: user._id }],
    });
  } else if (isClient(user)) {
    const dossierIds = await M.Dossier.distinct('_id', { user: user._id });
    const or = [{ createdBy: user._id }];
    if (dossierIds.length) {
      or.push({ visibleToClient: true, dossier: { $in: dossierIds } });
    }
    parts.push({ $or: or });
  } else {
    return null;
  }
  if (qTrim) {
    const esc = qTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    parts.push({ title: { $regex: esc, $options: 'i' } });
  }
  if (parts.length === 1) return { isArchived: false, ...parts[0] };
  return { isArchived: false, $and: parts };
}

/** Droit d’édition du contenu (titre, corps, échéance, statut terminé). */
function computeDraftContentCanEdit(draft, user, dossier) {
  const isCreator = draft.createdBy && draft.createdBy._id.toString() === user._id.toString();
  const partnerAccessEntry = getPartnerAccessEntry(draft, user._id);
  const adminCanSee =
    isAdmin(user) &&
    (isCreator ||
      (draft.visibleToAdmins === true &&
        !(draft.excludedAdminIds || []).some((id) => id.toString() === user._id.toString())));
  if (adminCanSee) return true;
  if (isPartenaire(user) && (isCreator || (partnerAccessEntry && partnerAccessEntry.canEdit === true))) {
    return true;
  }
  if (isClient(user) && dossier && isClientOwnerOfDossier(user, dossier)) {
    if (isCreator) return true;
    if (draft.visibleToClient && draft.clientCanEdit) return true;
  }
  return false;
}

// GET /collaborative-drafts/count — tous les brouillons visibles (liste globale)
router.get('/collaborative-drafts/count', async (req, res) => {
  try {
    const user = await M.User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }
    const query = await buildGlobalCollaborativeQuery(user, '');
    if (!query) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }
    const count = await M.CollaborativeDraft.countDocuments(query);
    return res.json({ success: true, count });
  } catch (error) {
    console.error('collaborative-drafts count:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /collaborative-drafts — liste globale (mêmes règles de visibilité que par dossier)
router.get('/collaborative-drafts', async (req, res) => {
  try {
    const user = await M.User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }
    const q = (req.query.q || '').toString().trim();
    const query = await buildGlobalCollaborativeQuery(user, q);
    if (!query) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const drafts = await M.CollaborativeDraft.find(query)
      .sort({ updatedAt: -1 })
      .populate('createdBy', 'firstName lastName role email')
      .populate('partnerAccess.partner', 'firstName lastName email')
      .populate({
        path: 'dossier',
        select: 'numero titre clientNom clientPrenom clientEmail user',
        populate: { path: 'user', select: 'firstName lastName email' },
      })
      .lean();

    const enhancedDrafts = drafts
      .filter((draft) => draft.dossier)
      .map((draft) => {
        const isCreator = draft.createdBy && draft.createdBy._id?.toString() === user._id.toString();
        const canEdit = computeDraftContentCanEdit(draft, user, draft.dossier);

        const canManagePermissions =
          (isCreator || isAdmin(user)) && !isClient(user);

        return {
          ...draft,
          canEdit,
          canManagePermissions,
          clientName: clientDisplayName(draft.dossier),
        };
      });

    return res.json({
      success: true,
      drafts: enhancedDrafts,
      currentUserIsAdmin: isAdmin(user),
      currentUserIsClient: isClient(user),
    });
  } catch (error) {
    console.error('collaborative-drafts list:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /dossiers/:dossierId/drafts - lister les brouillons visibles pour l'utilisateur
router.get('/dossiers/:dossierId/drafts', async (req, res) => {
  try {
    const { dossierId } = req.params;
    const userId = req.user.id;

    const dossier = await M.Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier introuvable' });
    }

    const user = await M.User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }

    const query = { dossier: dossierId, isArchived: false };

    if (isAdmin(user)) {
      query.$or = [
        { visibleToAdmins: true, excludedAdminIds: { $ne: user._id } },
        { createdBy: user._id },
      ];
    } else if (isPartenaire(user)) {
      query.$or = [
        { 'partnerAccess.partner': user._id },
        { createdBy: user._id },
      ];
    } else if (isClient(user)) {
      if (!isClientOwnerOfDossier(user, dossier)) {
        return res.status(403).json({ success: false, message: 'Accès refusé' });
      }
      query.$or = [{ visibleToClient: true }, { createdBy: user._id }];
    } else {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const drafts = await M.CollaborativeDraft.find(query)
      .sort({ updatedAt: -1 })
      .populate('createdBy', 'firstName lastName role')
      .populate('partnerAccess.partner', 'firstName lastName email')
      .lean();

    const enhancedDrafts = drafts.map((draft) => {
      const isCreator = draft.createdBy && draft.createdBy._id?.toString() === user._id.toString();
      const canEdit = computeDraftContentCanEdit(draft, user, dossier);
      const canManagePermissions = (isCreator || isAdmin(user)) && !isClient(user);

      return {
        ...draft,
        canEdit,
        canManagePermissions,
      };
    });

    return res.json({
      success: true,
      drafts: enhancedDrafts,
      currentUserIsAdmin: isAdmin(user),
      currentUserIsClient: isClient(user),
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des brouillons collaboratifs:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /dossiers/:dossierId/drafts - créer un nouveau brouillon
router.post('/dossiers/:dossierId/drafts', async (req, res) => {
  try {
    const { dossierId } = req.params;
    const { title, content, dueDate: dueDateRaw } = req.body;
    const userId = req.user.id;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Le titre est requis' });
    }

    const dossier = await M.Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier introuvable' });
    }

    const user = await M.User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }

    if (!isAdmin(user) && !isPartenaire(user)) {
      if (!isClient(user) || !isClientOwnerOfDossier(user, dossier)) {
        return res.status(403).json({ success: false, message: 'Accès refusé' });
      }
    }

    const dueParsed = parseDueDateField(dueDateRaw);
    const draft = await M.CollaborativeDraft.create({
      dossier: dossierId,
      title: title.trim(),
      content: content || '',
      createdBy: user._id,
      visibleToAdmins: isAdmin(user),
      ...(dueParsed !== undefined ? { dueDate: dueParsed } : {}),
    });

    return res.status(201).json({ success: true, draft });
  } catch (error) {
    console.error('Erreur lors de la création du brouillon collaboratif:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// PATCH /drafts/:draftId - mettre à jour un brouillon (titre + contenu)
router.patch('/drafts/:draftId', async (req, res) => {
  try {
    const { draftId } = req.params;
    const { title, content, dueDate: dueDateRaw } = req.body;
    const userId = req.user.id;

    const draft = await M.CollaborativeDraft.findById(draftId).populate('createdBy');
    if (!draft || draft.isArchived) {
      return res.status(404).json({ success: false, message: 'Brouillon introuvable' });
    }

    const user = await M.User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }

    const dossier = await M.Dossier.findById(draft.dossier);
    const canEdit = computeDraftContentCanEdit(draft, user, dossier);

    if (!canEdit) {
      return res.status(403).json({ success: false, message: 'Vous ne pouvez pas modifier ce brouillon' });
    }

    if (typeof title === 'string' && title.trim()) {
      draft.title = title.trim();
    }
    if (typeof content !== 'undefined') {
      draft.content = content;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'dueDate')) {
      const parsed = parseDueDateField(dueDateRaw);
      if (parsed === undefined) {
        return res.status(400).json({ success: false, message: 'Date d’échéance invalide' });
      }
      draft.dueDate = parsed;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'completed')) {
      const c = req.body.completed;
      if (c === true) {
        draft.completedAt = new Date();
      } else if (c === false || c === null) {
        draft.completedAt = null;
      }
    }

    await draft.save();

    return res.json({ success: true, draft });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du brouillon collaboratif:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// PATCH /drafts/:draftId/permissions - mettre à jour les droits
router.patch('/drafts/:draftId/permissions', async (req, res) => {
  try {
    const { draftId } = req.params;
    const { visibleToAdmins, excludedAdminIds, partnerAccess, visibleToClient, clientCanEdit } = req.body;
    const userId = req.user.id;

    const draft = await M.CollaborativeDraft.findById(draftId).populate('createdBy');
    if (!draft || draft.isArchived) {
      return res.status(404).json({ success: false, message: 'Brouillon introuvable' });
    }

    const user = await M.User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }

    if (isClient(user)) {
      return res.status(403).json({
        success: false,
        message: 'Les comptes client ne peuvent pas modifier les autorisations des documents en préparation.',
      });
    }

    const isCreator = draft.createdBy && draft.createdBy._id.toString() === user._id.toString();

    if (!isCreator && !isAdmin(user)) {
      return res.status(403).json({ success: false, message: 'Seul le créateur du document ou un administrateur peut modifier les autorisations' });
    }

    const dossierDoc = await M.Dossier.findById(draft.dossier);
    const prevVisibleToClient = !!draft.visibleToClient;
    const prevClientCanEdit = !!draft.clientCanEdit;

    if (typeof visibleToAdmins === 'boolean') {
      draft.visibleToAdmins = visibleToAdmins;
    }

    if (Array.isArray(excludedAdminIds)) {
      const creatorId = draft.createdBy && (draft.createdBy._id || draft.createdBy).toString();
      draft.excludedAdminIds = excludedAdminIds.filter(
        (id) => id && id.toString() !== creatorId
      );
    }

    const previousPartnerAccess = (draft.partnerAccess || []).map((p) => ({
      partner: p.partner.toString(),
      canEdit: !!p.canEdit,
    }));

    if (Array.isArray(partnerAccess)) {
      draft.partnerAccess = partnerAccess;
    }

    if (typeof visibleToClient === 'boolean') {
      if (visibleToClient === true && (!dossierDoc || !dossierDoc.user)) {
        return res.status(400).json({
          success: false,
          message:
            'Impossible de partager avec le client : aucun compte utilisateur n’est lié à ce dossier. Liez d’abord le client au dossier.',
        });
      }
      draft.visibleToClient = visibleToClient;
      if (!visibleToClient) {
        draft.clientCanEdit = false;
      }
    }

    if (typeof clientCanEdit === 'boolean') {
      draft.clientCanEdit = draft.visibleToClient ? !!clientCanEdit : false;
    }

    await draft.save();

    const dossierId = draft.dossier.toString();
    const draftTitle = draft.title || 'Document en préparation';
    const newV = !!draft.visibleToClient;
    const newE = !!draft.clientCanEdit;

    const notifyClient =
      dossierDoc &&
      dossierDoc.user &&
      (newV !== prevVisibleToClient || newE !== prevClientCanEdit) &&
      newV &&
      (!prevVisibleToClient || (prevVisibleToClient && newE && !prevClientCanEdit));

    if (notifyClient && dossierDoc.user) {
      const clientUid = dossierDoc.user.toString();
      try {
        await M.Notification.create({
          user: clientUid,
          type: 'draft_access_granted',
          titre: 'Accès à un document en préparation',
          message: newE
            ? `Vous pouvez consulter et modifier le document « ${draftTitle} » depuis votre dossier (Documents en préparation).`
            : `Vous pouvez consulter le document « ${draftTitle} » depuis votre dossier (Documents en préparation).`,
          lien: `/client/dossiers/${dossierId}/documents-en-preparation`,
          metadata: {
            dossierId,
            draftId: draft._id.toString(),
            draftTitle,
            canEdit: newE,
            audience: 'client',
          },
        });
      } catch (notifErr) {
        console.error('Erreur création notification accès draft (client):', notifErr);
      }
    }

    for (const entry of draft.partnerAccess || []) {
      const partnerId = entry.partner.toString();
      const canEditNow = !!entry.canEdit;
      const previous = previousPartnerAccess.find((p) => p.partner === partnerId);
      const wasNew = !previous;
      const gainedEdit = canEditNow && (!previous || !previous.canEdit);
      if (wasNew || gainedEdit) {
        try {
          await M.Notification.create({
            user: partnerId,
            type: 'draft_access_granted',
            titre: 'Accès accordé à un document en préparation',
            message: canEditNow
              ? `Vous avez reçu l'accès en édition au document « ${draftTitle} » sur le dossier. Vous pouvez le modifier dans la section "Documents en préparation".`
              : `Vous avez reçu l'accès en lecture au document « ${draftTitle} » sur le dossier. Consultez la section "Documents en préparation".`,
            lien: `/partenaire/dossiers/${dossierId}`,
            metadata: {
              dossierId,
              draftId: draft._id.toString(),
              draftTitle,
              canEdit: canEditNow,
            },
          });
        } catch (notifErr) {
          console.error('Erreur création notification accès draft:', notifErr);
        }
      }
    }

    return res.json({ success: true, draft });
  } catch (error) {
    console.error('Erreur lors de la mise à jour des permissions du brouillon collaboratif:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// DELETE /drafts/:draftId - archiver un brouillon
router.delete('/drafts/:draftId', async (req, res) => {
  try {
    const { draftId } = req.params;
    const userId = req.user.id;

    const draft = await M.CollaborativeDraft.findById(draftId).populate('createdBy');
    if (!draft || draft.isArchived) {
      return res.status(404).json({ success: false, message: 'Brouillon introuvable' });
    }

    const user = await M.User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }

    const isCreator = draft.createdBy && draft.createdBy._id.toString() === user._id.toString();

    if (!isCreator && !isAdmin(user)) {
      return res.status(403).json({ success: false, message: 'Vous ne pouvez pas supprimer ce brouillon' });
    }

    draft.isArchived = true;
    await draft.save();

    return res.json({ success: true, message: 'Brouillon archivé' });
  } catch (error) {
    console.error('Erreur lors de l\'archivage du brouillon collaboratif:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;


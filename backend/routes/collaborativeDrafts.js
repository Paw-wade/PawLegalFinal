const express = require('express');
const router = express.Router();

const CollaborativeDraft = require('../models/CollaborativeDraft');
const Dossier = require('../models/Dossier');
const User = require('../models/User');
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

// GET /dossiers/:dossierId/drafts - lister les brouillons visibles pour l'utilisateur
router.get('/dossiers/:dossierId/drafts', async (req, res) => {
  try {
    const { dossierId } = req.params;
    const userId = req.user.id;

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier introuvable' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }

    const query = { dossier: dossierId, isArchived: false };

    // Filtrer selon le rôle
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
    } else {
      // Client ou autre rôle: pas d'accès
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const drafts = await CollaborativeDraft.find(query)
      .sort({ updatedAt: -1 })
      .populate('createdBy', 'firstName lastName role')
      .lean();

    const enhancedDrafts = drafts.map((draft) => {
      const isCreator = draft.createdBy && draft.createdBy._id?.toString() === user._id.toString();
      const partnerAccessEntry =
        draft.partnerAccess &&
        draft.partnerAccess.find((p) => p.partner.toString() === user._id.toString());

      const canEdit =
        isCreator ||
        (isAdmin(user) &&
          draft.visibleToAdmins &&
          !(draft.excludedAdminIds || []).some((id) => id.toString() === user._id.toString())) ||
        (isPartenaire(user) && partnerAccessEntry && partnerAccessEntry.canEdit);

      return {
        ...draft,
        canEdit,
      };
    });

    return res.json({ success: true, drafts: enhancedDrafts });
  } catch (error) {
    console.error('Erreur lors de la récupération des brouillons collaboratifs:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /dossiers/:dossierId/drafts - créer un nouveau brouillon
router.post('/dossiers/:dossierId/drafts', async (req, res) => {
  try {
    const { dossierId } = req.params;
    const { title, content } = req.body;
    const userId = req.user.id;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Le titre est requis' });
    }

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier introuvable' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }

    if (!isAdmin(user) && !isPartenaire(user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const draft = await CollaborativeDraft.create({
      dossier: dossierId,
      title: title.trim(),
      content: content || '',
      createdBy: user._id,
      visibleToAdmins: isAdmin(user),
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
    const { title, content } = req.body;
    const userId = req.user.id;

    const draft = await CollaborativeDraft.findById(draftId).populate('createdBy');
    if (!draft || draft.isArchived) {
      return res.status(404).json({ success: false, message: 'Brouillon introuvable' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }

    const isCreator = draft.createdBy && draft.createdBy._id.toString() === user._id.toString();
    const partnerAccessEntry =
      draft.partnerAccess &&
      draft.partnerAccess.find((p) => p.partner.toString() === user._id.toString());

    const canEdit =
      isCreator ||
      (isAdmin(user) && draft.visibleToAdmins && !draft.excludedAdminIds?.includes(user._id)) ||
      (isPartenaire(user) && partnerAccessEntry && partnerAccessEntry.canEdit);

    if (!canEdit) {
      return res.status(403).json({ success: false, message: 'Vous ne pouvez pas modifier ce brouillon' });
    }

    if (typeof title === 'string' && title.trim()) {
      draft.title = title.trim();
    }
    if (typeof content !== 'undefined') {
      draft.content = content;
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
    const { visibleToAdmins, excludedAdminIds, partnerAccess } = req.body;
    const userId = req.user.id;

    const draft = await CollaborativeDraft.findById(draftId).populate('createdBy');
    if (!draft || draft.isArchived) {
      return res.status(404).json({ success: false, message: 'Brouillon introuvable' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
    }

    const isCreator = draft.createdBy && draft.createdBy._id.toString() === user._id.toString();

    if (!isCreator && !isAdmin(user) && !isPartenaire(user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    if (typeof visibleToAdmins === 'boolean') {
      draft.visibleToAdmins = visibleToAdmins;
    }

    if (Array.isArray(excludedAdminIds)) {
      draft.excludedAdminIds = excludedAdminIds;
    }

    if (Array.isArray(partnerAccess)) {
      draft.partnerAccess = partnerAccess;
    }

    await draft.save();

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

    const draft = await CollaborativeDraft.findById(draftId).populate('createdBy');
    if (!draft || draft.isArchived) {
      return res.status(404).json({ success: false, message: 'Brouillon introuvable' });
    }

    const user = await User.findById(userId);
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


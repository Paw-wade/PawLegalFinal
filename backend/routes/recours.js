const express = require('express');
const router = express.Router();

const RecoursType = require('../models/RecoursType');
const RecoursTemplate = require('../models/RecoursTemplate');
const CollaborativeDraft = require('../models/CollaborativeDraft');
const Dossier = require('../models/Dossier');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Middleware auth
router.use(protect);

function isAdmin(user) {
  return ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'].includes(
    user.role
  );
}

function isSuperadmin(user) {
  return user.role === 'superadmin';
}

// Thèmes de recours autorisés (affichés dans le répertoire)
const DEFAULT_RECOURS_TYPES = [
  {
    code: 'REFERE_MESURES_UTILES',
    label: 'Référé mesure utiles',
    description: 'Modèles de référé mesures utiles pour demandes urgentes.',
  },
  {
    code: 'REFERE_SUSPENSION',
    label: 'Référé suspension',
    description: 'Modèles de référé suspension contre décisions administratives.',
  },
  {
    code: 'RECOURS_ANNULATION',
    label: 'Recours en annulation',
    description: 'Modèles de recours en annulation devant la juridiction compétente.',
  },
  {
    code: 'COMMUNICATION_MOTIFS',
    label: 'Communication des motifs',
    description: 'Modèles de demande de communication des motifs de décision.',
  },
  {
    code: 'FORMULAIRE_CERFA',
    label: 'Formulaire CERFA',
    description: 'Formulaires CERFA officiels à joindre ou compléter dans les dossiers.',
  },
  {
    code: 'LEGISLATION',
    label: 'Législation',
    description: 'Textes législatifs et réglementaires utiles aux recours.',
  },
  {
    code: 'AUTRES_DOCUMENTS',
    label: 'Autres documents',
    description: 'Documents complémentaires divers liés aux démarches de recours.',
  },
];
// GET /recours/types - liste des types de recours visibles pour l'utilisateur
router.get('/recours/types', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !isAdmin(user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    // Compléter automatiquement les types par défaut manquants.
    // (utile même si la base contient déjà des types créés manuellement)
    for (const t of DEFAULT_RECOURS_TYPES) {
      const code = t.code.toUpperCase();
      const already = await RecoursType.findOne({ code });
      if (!already) {
        await RecoursType.create({
          code,
          label: t.label,
          description: t.description,
          restrictedToSuperadmin: false,
        });
      }
    }

    const query = {};
    if (!isSuperadmin(user)) {
      query.restrictedToSuperadmin = { $ne: true };
    }

    const types = await RecoursType.find(query).sort({ label: 1 }).lean();
    return res.json({ success: true, types });
  } catch (error) {
    console.error('Erreur lors de la récupération des types de recours:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /recours/types - création d'un type (admin/superadmin)
router.post('/recours/types', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !isAdmin(user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const { code, label, description, restrictedToSuperadmin } = req.body;
    if (!code || !label) {
      return res.status(400).json({ success: false, message: 'Code et libellé sont requis' });
    }

    const existing = await RecoursType.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Un type de recours avec ce code existe déjà' });
    }

    const canRestrictToSuperadmin = isSuperadmin(user);
    const type = await RecoursType.create({
      code: code.toUpperCase().trim(),
      label: label.trim(),
      description: description || '',
      restrictedToSuperadmin: canRestrictToSuperadmin ? !!restrictedToSuperadmin : false,
    });

    return res.status(201).json({ success: true, type });
  } catch (error) {
    console.error('Erreur lors de la création du type de recours:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /recours/templates - lister les modèles selon les droits
router.get('/recours/templates', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !isAdmin(user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const { typeId } = req.query;

    const typeFilter = {};
    if (typeId) {
      typeFilter.type = typeId;
    }

    // Filtrer par visibilité/partage
    const orClauses = [
      { createdBy: user._id },
      { isPublicForAdmins: true },
      { sharedWithUsers: user._id },
      { sharedWithRoles: user.role },
    ];

    const templates = await RecoursTemplate.find({
      ...typeFilter,
      $or: orClauses,
    })
      .sort({ createdAt: -1 })
      .populate('type', 'code label restrictedToSuperadmin')
      .populate('createdBy', 'firstName lastName role')
      .lean();

    return res.json({ success: true, templates });
  } catch (error) {
    console.error('Erreur lors de la récupération des modèles de recours:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /recours/templates - créer un modèle de recours (upload déjà géré ailleurs)
router.post('/recours/templates', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !isAdmin(user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const {
      typeId,
      title,
      description,
      fileUrl,
      fileName,
      mimeType,
      size,
      sharedWithUsers,
      sharedWithRoles,
      sharedWithPartners,
      isPublicForAdmins,
    } = req.body;

    if (!typeId || !title || !fileUrl || !fileName || !mimeType) {
      return res.status(400).json({ success: false, message: 'Type, titre et fichier sont requis' });
    }

    const type = await RecoursType.findById(typeId);
    if (!type) {
      return res.status(404).json({ success: false, message: 'Type de recours introuvable' });
    }

    const template = await RecoursTemplate.create({
      type: typeId,
      title: title.trim(),
      description: description || '',
      fileUrl,
      fileName,
      mimeType,
      size: size || 0,
      createdBy: user._id,
      sharedWithUsers: Array.isArray(sharedWithUsers) ? sharedWithUsers : [],
      sharedWithRoles: Array.isArray(sharedWithRoles) ? sharedWithRoles : [],
      sharedWithPartners: Array.isArray(sharedWithPartners) ? sharedWithPartners : [],
      isPublicForAdmins: typeof isPublicForAdmins === 'boolean' ? isPublicForAdmins : true,
    });

    return res.status(201).json({ success: true, template });
  } catch (error) {
    console.error('Erreur lors de la création du modèle de recours:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// PATCH /recours/templates/:id/share - mettre à jour le partage
router.patch('/recours/templates/:id/share', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !isAdmin(user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const { id } = req.params;
    const { sharedWithUsers, sharedWithRoles, sharedWithPartners, isPublicForAdmins } = req.body;

    const template = await RecoursTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Modèle de recours introuvable' });
    }

    if (Array.isArray(sharedWithUsers)) {
      template.sharedWithUsers = sharedWithUsers;
    }
    if (Array.isArray(sharedWithRoles)) {
      template.sharedWithRoles = sharedWithRoles;
    }
    if (Array.isArray(sharedWithPartners)) {
      template.sharedWithPartners = sharedWithPartners;
    }
    if (typeof isPublicForAdmins === 'boolean') {
      template.isPublicForAdmins = isPublicForAdmins;
    }

    await template.save();
    return res.json({ success: true, template });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du partage du modèle de recours:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// DELETE /recours/templates/:id - supprimer un modèle de recours
router.delete('/recours/templates/:id', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !isAdmin(user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const { id } = req.params;
    const template = await RecoursTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Modèle de recours introuvable' });
    }

    // Les admins/superadmins peuvent supprimer; les autres rôles admin étendus seulement leurs modèles
    if (!isSuperadmin(user) && user.role !== 'admin') {
      const creatorId = String(template.createdBy || '');
      if (creatorId !== String(user._id)) {
        return res.status(403).json({
          success: false,
          message: "Vous ne pouvez supprimer que les modèles que vous avez créés",
        });
      }
    }

    await template.deleteOne();
    return res.json({ success: true, message: 'Modèle supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du modèle de recours:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /recours/templates/:id/send-to-dossier - créer un document en préparation à partir d'un modèle
router.post('/recours/templates/:id/send-to-dossier', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !isAdmin(user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const { id } = req.params;
    const { dossierId } = req.body;

    if (!dossierId) {
      return res.status(400).json({ success: false, message: 'Le dossier est requis' });
    }

    const template = await RecoursTemplate.findById(id).populate('type');
    if (!template) {
      return res.status(404).json({ success: false, message: 'Modèle de recours introuvable' });
    }

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier introuvable' });
    }

    // Créer un brouillon collaboratif qui référence le fichier modèle
    const title = template.title || `Modèle recours ${template.type?.label || ''}`.trim();
    const content = {
      type: 'recours_template',
      templateId: template._id.toString(),
      fileUrl: template.fileUrl,
      fileName: template.fileName,
      mimeType: template.mimeType,
      size: template.size,
      typeId: template.type?._id?.toString(),
      typeLabel: template.type?.label,
    };

    const draft = await CollaborativeDraft.create({
      dossier: dossierId,
      title,
      content,
      createdBy: user._id,
      visibleToAdmins: true,
    });

    return res.status(201).json({ success: true, draft });
  } catch (error) {
    console.error('Erreur lors de l\'envoi du modèle de recours vers un dossier:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;


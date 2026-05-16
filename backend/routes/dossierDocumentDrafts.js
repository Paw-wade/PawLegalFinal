const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const { protect } = require('../middleware/auth');

const M = require('../tenantModels');
const router = express.Router();
router.use(protect);

function isStaff(user) {
  return ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'].includes(
    user?.role
  );
}

function staffOnly(req, res, next) {
  if (!isStaff(req.user)) {
    return res.status(403).json({ success: false, message: 'Accès réservé à l’équipe' });
  }
  next();
}

const dossierPopulate = {
  path: 'dossier',
  select: 'numero titre clientNom clientPrenom clientEmail user',
  populate: { path: 'user', select: 'firstName lastName email' },
};

function clientDisplayName(dossier) {
  if (!dossier) return '';
  const u = dossier.user;
  if (u && (u.firstName || u.lastName)) {
    return [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  }
  const n = [dossier.clientPrenom, dossier.clientNom].filter(Boolean).join(' ').trim();
  return n || dossier.clientEmail || '—';
}

function decodeBasicEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToParagraphTexts(html) {
  const withBreaks = decodeBasicEntities(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  return stripped
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function slugFilename(title) {
  const base = String(title || 'document')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return base || 'document';
}

/** Accepte ISO, date seule (YYYY-MM-DD) ou null pour effacer. Retourne `undefined` si valeur absente à ignorer. */
function parseDueDateField(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

// @route GET /api/dossier-document-drafts/count
router.get('/dossier-document-drafts/count', staffOnly, async (req, res) => {
  try {
    const count = await M.DossierDocumentDraft.countDocuments();
    return res.json({ success: true, count });
  } catch (e) {
    console.error('dossier-document-drafts count:', e);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route GET /api/dossier-document-drafts
router.get('/dossier-document-drafts', staffOnly, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const filter = {};
    if (q) {
      filter.$or = [
        { title: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { body: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ];
    }
    const drafts = await M.DossierDocumentDraft.find(filter)
      .sort({ updatedAt: -1 })
      .populate(dossierPopulate)
      .populate('createdBy', 'firstName lastName email')
      .lean();

    const list = drafts.map((d) => ({
      ...d,
      clientName: clientDisplayName(d.dossier),
    }));

    return res.json({ success: true, drafts: list });
  } catch (e) {
    console.error('dossier-document-drafts list:', e);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route GET /api/dossier-document-drafts/:id/docx
router.get('/dossier-document-drafts/:id/docx', staffOnly, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }
    const draft = await M.DossierDocumentDraft.findById(req.params.id).populate(dossierPopulate).lean();
    if (!draft) {
      return res.status(404).json({ success: false, message: 'Brouillon introuvable' });
    }

    const metaLines = [];
    if (draft.dossier?.numero) metaLines.push(`Dossier : ${draft.dossier.numero}`);
    if (draft.dossier?.titre) metaLines.push(`Objet : ${draft.dossier.titre}`);
    const client = clientDisplayName(draft.dossier);
    if (client && client !== '—') metaLines.push(`Client : ${client}`);
    if (draft.dueDate) {
      metaLines.push(
        `Échéance : ${new Date(draft.dueDate).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}`
      );
    }
    if (draft.completedAt) {
      metaLines.push(
        `Statut : terminé le ${new Date(draft.completedAt).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}`
      );
    }

    const bodyParagraphs = htmlToParagraphTexts(draft.body);
    const children = [
      new Paragraph({
        text: draft.title,
        heading: HeadingLevel.TITLE,
      }),
      ...metaLines.map((t) => new Paragraph({ children: [new TextRun({ text: t, italics: true, size: 20 })] })),
      new Paragraph({ children: [new TextRun({ text: '' })] }),
      ...bodyParagraphs.map((t) => new Paragraph({ children: [new TextRun({ text: t, size: 22 })] })),
    ];

    const doc = new Document({
      sections: [{ children }],
    });
    const buffer = await Packer.toBuffer(doc);
    const fname = `${slugFilename(draft.title)}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
    return res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('dossier-document-drafts docx:', e);
    return res.status(500).json({ success: false, message: 'Erreur export Word' });
  }
});

// @route GET /api/dossier-document-drafts/:id
router.get('/dossier-document-drafts/:id', staffOnly, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }
    const draft = await M.DossierDocumentDraft.findById(req.params.id)
      .populate(dossierPopulate)
      .populate('createdBy', 'firstName lastName email')
      .lean();
    if (!draft) {
      return res.status(404).json({ success: false, message: 'Brouillon introuvable' });
    }
    return res.json({
      success: true,
      draft: { ...draft, clientName: clientDisplayName(draft.dossier) },
    });
  } catch (e) {
    console.error('dossier-document-drafts get:', e);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route POST /api/dossier-document-drafts
router.post(
  '/dossier-document-drafts',
  staffOnly,
  [body('dossierId').notEmpty(), body('title').trim().notEmpty(), body('body').optional().isString()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const { dossierId, title, body: bodyHtml, dueDate: dueDateRaw } = req.body;
      if (!mongoose.Types.ObjectId.isValid(dossierId)) {
        return res.status(400).json({ success: false, message: 'dossierId invalide' });
      }
      const dossier = await M.Dossier.findById(dossierId);
      if (!dossier) {
        return res.status(404).json({ success: false, message: 'Dossier introuvable' });
      }
      const dueParsed = parseDueDateField(dueDateRaw);
      const draft = await M.DossierDocumentDraft.create({
        dossier: dossierId,
        title,
        body: bodyHtml != null ? String(bodyHtml) : '',
        createdBy: req.user.id,
        ...(dueParsed !== undefined ? { dueDate: dueParsed } : {}),
      });
      const populated = await M.DossierDocumentDraft.findById(draft._id)
        .populate(dossierPopulate)
        .populate('createdBy', 'firstName lastName email')
        .lean();
      return res.status(201).json({
        success: true,
        draft: { ...populated, clientName: clientDisplayName(populated.dossier) },
      });
    } catch (e) {
      console.error('dossier-document-drafts create:', e);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// @route PATCH /api/dossier-document-drafts/:id
router.patch(
  '/dossier-document-drafts/:id',
  staffOnly,
  [body('title').optional().trim().notEmpty(), body('body').optional().isString()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'ID invalide' });
      }
      const draft = await M.DossierDocumentDraft.findById(req.params.id);
      if (!draft) {
        return res.status(404).json({ success: false, message: 'Brouillon introuvable' });
      }
      if (req.body.title != null) draft.title = req.body.title;
      if (req.body.body != null) draft.body = String(req.body.body);
      if (Object.prototype.hasOwnProperty.call(req.body, 'dueDate')) {
        const parsed = parseDueDateField(req.body.dueDate);
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
      const populated = await M.DossierDocumentDraft.findById(draft._id)
        .populate(dossierPopulate)
        .populate('createdBy', 'firstName lastName email')
        .lean();
      return res.json({
        success: true,
        draft: { ...populated, clientName: clientDisplayName(populated.dossier) },
      });
    } catch (e) {
      console.error('dossier-document-drafts patch:', e);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// @route DELETE /api/dossier-document-drafts/:id
router.delete('/dossier-document-drafts/:id', staffOnly, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }
    const r = await M.DossierDocumentDraft.findByIdAndDelete(req.params.id);
    if (!r) {
      return res.status(404).json({ success: false, message: 'Brouillon introuvable' });
    }
    return res.json({ success: true });
  } catch (e) {
    console.error('dossier-document-drafts delete:', e);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;

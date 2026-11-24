const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const WhatsappConversation = require('../models/WhatsappConversation');
const { sendMessage, sendProactiveMessage, sendMediaMessage } = require('../services/whatsappService');
const { uploadBufferToS3, getS3PresignedUrl, isS3Configured } = require('../utils/s3DocumentStorage');

const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

router.use(protect);

// GET /api/whatsapp-admin/media/:mediaId
// Telecharge un media WhatsApp, l'uploade sur R2 et retourne une URL presignee
router.get('/media/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { convId, filename, mimeType } = req.query;

    // Si deja uploade sur R2, utiliser directement
    if (convId) {
      const conv = await WhatsappConversation.findById(convId).select('messages').lean();
      const msg = conv?.messages?.find((m) => m.mediaId === mediaId);
      if (msg?.mediaUri) {
        const url = await getS3PresignedUrl(msg.mediaUri, { expiresIn: 300, fileName: filename || 'document', inline: true });
        if (url) return res.json({ success: true, url, cached: true });
      }
    }

    const token = process.env.WHATSAPP_TOKEN;
    if (!token) return res.status(500).json({ success: false, message: 'WHATSAPP_TOKEN non configure' });

    // Recuperer l'URL de telechargement via l'API Meta
    const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      const err = await metaRes.text();
      return res.status(502).json({ success: false, message: `Erreur API WhatsApp: ${err}` });
    }
    const meta = await metaRes.json();
    if (!meta.url) return res.status(502).json({ success: false, message: 'URL media introuvable dans la reponse WhatsApp' });

    // Telecharger le fichier
    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileRes.ok) return res.status(502).json({ success: false, message: 'Echec du telechargement du media' });
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    // Si R2 non configure, envoyer directement le fichier
    if (!isS3Configured()) {
      res.setHeader('Content-Type', mimeType || meta.mime_type || 'application/octet-stream');
      const safeName = (filename || `media_${mediaId}`).replace(/[^\w.\-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      return res.send(buffer);
    }

    // Uploader sur R2
    const safeName = (filename || `media_${mediaId}`).replace(/[^\w.\-]/g, '_');
    const r2Uri = await uploadBufferToS3(buffer, {
      fileName: `${Date.now()}_${safeName}`,
      contentType: mimeType || meta.mime_type || 'application/octet-stream',
      subfolder: 'whatsapp-media',
    });

    // Stocker l'URI R2 sur le message pour eviter de retelecharger
    if (convId) {
      WhatsappConversation.updateOne(
        { _id: convId, 'messages.mediaId': mediaId },
        { $set: { 'messages.$.mediaUri': r2Uri } }
      ).catch(() => {});
    }

    const url = await getS3PresignedUrl(r2Uri, { expiresIn: 300, fileName: filename || 'document', inline: true });
    res.json({ success: true, url, cached: false });
  } catch (err) {
    console.error('[WhatsApp Media] Erreur:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/whatsapp-admin/advisors
// Liste les conseillers (admin/superadmin) disponibles pour assignation
router.get('/advisors', async (req, res) => {
  try {
    const User = require('../models/User');
    const advisors = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } })
      .select('prenom nom email role')
      .sort({ prenom: 1 })
      .lean();
    res.json({ success: true, advisors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/whatsapp-admin/conversations
// Liste toutes les conversations, triées par lastActivity desc
// Query params: assignedTo=me|none, unread=true
router.get('/conversations', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.unread === 'true') {
      filter.unreadAdmin = { $gt: 0 };
    }
    if (req.query.assignedTo === 'me') {
      filter.assignedTo = req.user._id;
    } else if (req.query.assignedTo === 'none') {
      filter.assignedTo = null;
    }

    const [conversations, total] = await Promise.all([
      WhatsappConversation.find(filter, { messages: { $slice: -1 } })
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(limit)
        .populate('clientId', 'prenom nom email')
        .populate({ path: 'dossierId', select: 'titre categorie statut reference clientNom clientPrenom user', populate: { path: 'user', select: 'prenom nom' } })
        .populate('assignedTo', 'prenom nom'),
      WhatsappConversation.countDocuments(filter),
    ]);

    const unreadTotal = await WhatsappConversation.aggregate([
      { $group: { _id: null, total: { $sum: '$unreadAdmin' } } },
    ]);

    res.json({
      success: true,
      conversations,
      total,
      page,
      pages: Math.ceil(total / limit),
      unreadTotal: unreadTotal[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/whatsapp-admin/conversations/:id
// Detail d'une conversation avec l'historique des messages
router.get('/conversations/:id', async (req, res) => {
  try {
    const conv = await WhatsappConversation.findById(req.params.id)
      .populate('clientId', 'prenom nom email telephone')
      .populate({ path: 'dossierId', select: 'titre categorie statut reference clientNom clientPrenom user', populate: { path: 'user', select: 'prenom nom' } })
      .populate('assignedTo', 'prenom nom');

    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation introuvable' });
    }

    let clientDossiers = [];
    if (conv.clientId) {
      const Dossier = require('../models/Dossier');
      clientDossiers = await Dossier.find({ user: conv.clientId._id })
        .select('titre numero categorie statut createdAt')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      // Auto-lier le dossier le plus recent si aucun n'est encore lie
      if (!conv.dossierId && clientDossiers.length > 0) {
        const autoLink = clientDossiers[0];
        WhatsappConversation.findByIdAndUpdate(conv._id, { dossierId: autoLink._id }).catch(() => {});
        conv.dossierId = autoLink;
      }
    }

    res.json({ success: true, conversation: conv, clientDossiers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/whatsapp-admin/conversations/:id/read
router.put('/conversations/:id/read', async (req, res) => {
  try {
    await WhatsappConversation.findByIdAndUpdate(req.params.id, { unreadAdmin: 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/whatsapp-admin/conversations/:id/notes
// Ajoute une note interne (non envoyee au client)
router.post('/conversations/:id/notes', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, message: 'text requis' });

    const User = require('../models/User');
    const user = await User.findById(req.user._id).select('prenom nom').lean();
    const noteContent = `[${user?.prenom || ''} ${user?.nom || ''}] ${text.trim()}`;

    const conv = await WhatsappConversation.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          messages: {
            direction: 'outbound',
            type: 'text',
            content: noteContent,
            isInternalNote: true,
            timestamp: new Date(),
          },
        },
        lastActivity: new Date(),
      },
      { new: true }
    ).populate('clientId', 'prenom nom email').populate('assignedTo', 'prenom nom');

    if (!conv) return res.status(404).json({ success: false, message: 'Conversation introuvable' });
    res.json({ success: true, conversation: conv });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/whatsapp-admin/conversations/:id/reminder
router.put('/conversations/:id/reminder', async (req, res) => {
  try {
    const { reminderAt, reminderNote } = req.body;
    const conv = await WhatsappConversation.findByIdAndUpdate(
      req.params.id,
      { reminderAt: reminderAt || null, reminderNote: reminderNote || '' },
      { new: true }
    ).select('reminderAt reminderNote');
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation introuvable' });
    res.json({ success: true, reminderAt: conv.reminderAt, reminderNote: conv.reminderNote });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/whatsapp-admin/conversations/:id/status
router.put('/conversations/:id/status', async (req, res) => {
  try {
    const { followUpStatus } = req.body;
    const conv = await WhatsappConversation.findByIdAndUpdate(
      req.params.id,
      { followUpStatus: followUpStatus || 'none' },
      { new: true }
    ).select('followUpStatus');
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation introuvable' });
    res.json({ success: true, followUpStatus: conv.followUpStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/whatsapp-admin/conversations/:id/pin-message
router.put('/conversations/:id/pin-message', async (req, res) => {
  try {
    const { messageId, pinned } = req.body;
    await WhatsappConversation.updateOne(
      { _id: req.params.id, 'messages._id': messageId },
      { $set: { 'messages.$.pinned': !!pinned } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/whatsapp-admin/send
router.post('/send', async (req, res) => {
  try {
    const { phone, text, replyToWaId, replyToContent } = req.body;
    if (!phone || !text) {
      return res.status(400).json({ success: false, message: 'phone et text requis' });
    }

    const WhatsappConversation = require('../models/WhatsappConversation');
    let conv = await WhatsappConversation.findOne({ phone });
    if (!conv) {
      conv = new WhatsappConversation({ phone, state: 'menu', lastActivity: new Date() });
      await conv.save();
    }
    await sendMessage(phone, text, conv, { replyToWaId, replyToContent });

    // Activer le mode conseiller et assigner a l'expediteur si non encore assigne
    const updateFields = { humanMode: true };
    if (!conv.assignedTo) updateFields.assignedTo = req.user._id;
    await WhatsappConversation.findOneAndUpdate({ phone }, updateFields);

    const updatedConv = await WhatsappConversation.findOne({ phone })
      .select('-messages')
      .populate('assignedTo', 'prenom nom');
    res.json({ success: true, conversation: updatedConv });
  } catch (err) {
    console.error('[WhatsApp Admin] Erreur envoi proactif:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/whatsapp-admin/send-media
// Upload un fichier vers Meta et l'envoie en message WhatsApp media
router.post('/send-media', uploadMemory.single('file'), async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !req.file) {
      return res.status(400).json({ success: false, message: 'phone et fichier requis' });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      return res.status(500).json({ success: false, message: 'WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID non configure' });
    }

    // Determiner le type WhatsApp selon le MIME
    const mime = req.file.mimetype;
    let waType = 'document';
    if (mime.startsWith('image/')) waType = 'image';
    else if (mime.startsWith('video/')) waType = 'video';
    else if (mime.startsWith('audio/')) waType = 'audio';

    // Upload vers l'API Media Meta (multipart natif Node 18+)
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append('file', blob, req.file.originalname);
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', req.file.mimetype);

    const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return res.status(502).json({ success: false, message: `Erreur upload Meta: ${err}` });
    }
    const uploadData = await uploadRes.json();
    const mediaId = uploadData.id;
    if (!mediaId) {
      return res.status(502).json({ success: false, message: 'Aucun media_id retourne par Meta' });
    }

    // Activer humanMode, auto-assigner, puis envoyer le media
    let conv = await WhatsappConversation.findOne({ phone });
    if (!conv) {
      conv = new WhatsappConversation({ phone, state: 'menu', lastActivity: new Date() });
      await conv.save();
    }
    const updateFields = { humanMode: true };
    if (!conv.assignedTo) updateFields.assignedTo = req.user._id;
    await WhatsappConversation.updateOne({ phone }, updateFields);
    conv = await WhatsappConversation.findOne({ phone });

    await sendMediaMessage(phone, mediaId, waType, req.file.originalname, conv);

    const updatedConv = await WhatsappConversation.findOne({ phone })
      .select('-messages')
      .populate('assignedTo', 'prenom nom');
    res.json({ success: true, conversation: updatedConv });
  } catch (err) {
    console.error('[WhatsApp Admin] Erreur send-media:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/whatsapp-admin/conversations/:id/assign
// Assigne la conversation a un conseiller (ou null pour desassigner)
router.put('/conversations/:id/assign', async (req, res) => {
  try {
    const { userId } = req.body;
    const conv = await WhatsappConversation.findByIdAndUpdate(
      req.params.id,
      { assignedTo: userId || null },
      { new: true }
    ).populate('assignedTo', 'prenom nom');

    if (!conv) return res.status(404).json({ success: false, message: 'Conversation introuvable' });
    res.json({ success: true, assignedTo: conv.assignedTo });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/whatsapp-admin/conversations/:id/link
router.put('/conversations/:id/link', async (req, res) => {
  try {
    const { clientId, dossierId } = req.body;
    const update = {};
    if (clientId !== undefined) update.clientId = clientId || null;
    if (dossierId !== undefined) update.dossierId = dossierId || null;

    if (dossierId && !clientId) {
      try {
        const Dossier = require('../models/Dossier');
        const dossier = await Dossier.findById(dossierId).select('user').lean();
        if (dossier?.user) update.clientId = dossier.user;
      } catch (e) {
        console.warn('[WhatsApp Admin] Impossible de recuperer le user du dossier:', e.message);
      }
    }

    const conv = await WhatsappConversation.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('clientId', 'prenom nom email')
      .populate({ path: 'dossierId', select: 'titre categorie statut reference clientNom clientPrenom user', populate: { path: 'user', select: 'prenom nom' } })
      .populate('assignedTo', 'prenom nom');

    if (!conv) return res.status(404).json({ success: false, message: 'Conversation introuvable' });
    res.json({ success: true, conversation: conv });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/whatsapp-admin/conversations/:id/rename
router.put('/conversations/:id/rename', async (req, res) => {
  try {
    const { customName } = req.body;
    const conv = await WhatsappConversation.findByIdAndUpdate(
      req.params.id,
      { customName: (customName || '').trim() },
      { new: true }
    ).select('customName phone contactName');

    if (!conv) return res.status(404).json({ success: false, message: 'Conversation introuvable' });
    res.json({ success: true, customName: conv.customName });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/whatsapp-admin/conversations/:id/human-mode
router.put('/conversations/:id/human-mode', async (req, res) => {
  try {
    const { humanMode } = req.body;
    const update = { humanMode: !!humanMode };
    // Quand on active le mode conseiller, s'auto-assigner si non assigne
    if (humanMode) {
      const existing = await WhatsappConversation.findById(req.params.id).select('assignedTo').lean();
      if (!existing?.assignedTo) update.assignedTo = req.user._id;
    }

    const conv = await WhatsappConversation.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('assignedTo', 'prenom nom')
      .select('humanMode assignedTo phone contactName clientId');

    if (!conv) return res.status(404).json({ success: false, message: 'Conversation introuvable' });
    res.json({ success: true, humanMode: conv.humanMode, assignedTo: conv.assignedTo });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/whatsapp-admin/conversations/:id
router.delete('/conversations/:id', async (req, res) => {
  try {
    await WhatsappConversation.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/whatsapp-admin/conversations/:id/save-to-dossier
// Telecharge un media WhatsApp et l'enregistre dans les documents d'un dossier
router.post('/conversations/:id/save-to-dossier', async (req, res) => {
  try {
    const { mediaId, mediaUri, dossierId, nom, categorie, mimeType, filename } = req.body;
    if (!mediaId && !mediaUri) return res.status(400).json({ success: false, message: 'mediaId ou mediaUri requis' });
    if (!dossierId) return res.status(400).json({ success: false, message: 'dossierId requis' });

    const Document = require('../models/Document');
    const Dossier = require('../models/Dossier');
    const { resolveCabinetForUser } = require('../utils/cabinetResolver');

    const dossier = await Dossier.findById(dossierId).lean();
    if (!dossier) return res.status(404).json({ success: false, message: 'Dossier introuvable' });

    const token = process.env.WHATSAPP_TOKEN;
    let buffer;
    let resolvedMime = mimeType || 'application/octet-stream';

    if (mediaUri) {
      const url = await getS3PresignedUrl(mediaUri, { expiresIn: 300, inline: true });
      const r = await fetch(url);
      if (!r.ok) throw new Error('Impossible de recuperer le media depuis R2');
      buffer = Buffer.from(await r.arrayBuffer());
    } else {
      if (!token) return res.status(500).json({ success: false, message: 'WHATSAPP_TOKEN non configure' });
      const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!metaRes.ok) throw new Error('Erreur API WhatsApp lors de la recuperation du media');
      const meta = await metaRes.json();
      if (!meta.url) throw new Error('URL media introuvable dans la reponse WhatsApp');
      resolvedMime = mimeType || meta.mime_type || 'application/octet-stream';
      const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
      if (!fileRes.ok) throw new Error('Echec du telechargement du media WhatsApp');
      buffer = Buffer.from(await fileRes.arrayBuffer());
    }

    const safeName = (filename || `media_${mediaId || Date.now()}`).replace(/[^\w.\-]/g, '_');
    const cabinet = await resolveCabinetForUser(req.user);
    const s3Prefix = cabinet?.s3Prefix || null;

    const r2Uri = await uploadBufferToS3(buffer, {
      fileName: `${Date.now()}_${safeName}`,
      contentType: resolvedMime,
      subfolder: 'documents',
      prefix: s3Prefix,
    });

    const normalizeCategorie = (c) => {
      const allowed = ['identite', 'titre_sejour', 'contrat', 'facture', 'autre'];
      return allowed.includes(c) ? c : 'autre';
    };

    const doc = await Document.create({
      user: dossier.user || req.user.id,
      nom: nom || safeName,
      nomFichier: safeName,
      originalName: filename || safeName,
      cheminFichier: r2Uri,
      typeMime: resolvedMime,
      taille: buffer.length,
      categorie: normalizeCategorie(categorie),
      dossierId,
      cabinetId: cabinet?._id || null,
      visibleToClient: false,
      description: 'Document recu via WhatsApp',
    });

    res.json({ success: true, document: doc });
  } catch (err) {
    console.error('[WhatsApp save-to-dossier]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

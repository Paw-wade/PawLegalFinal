const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const WhatsappConversation = require('../models/WhatsappConversation');
const { sendProactiveMessage } = require('../services/whatsappService');

router.use(protect);

// GET /api/whatsapp-admin/conversations
// Liste toutes les conversations, triées par lastActivity desc
router.get('/conversations', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.unread === 'true') {
      filter.unreadAdmin = { $gt: 0 };
    }

    const [conversations, total] = await Promise.all([
      WhatsappConversation.find(filter)
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(limit)
        .populate('clientId', 'prenom nom email')
        .populate('dossierId', 'titre categorie statut')
        .select('-messages'),
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
      .populate('dossierId', 'titre categorie statut reference');

    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation introuvable' });
    }

    res.json({ success: true, conversation: conv });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/whatsapp-admin/conversations/:id/read
// Marque la conversation comme lue (réinitialise unreadAdmin)
router.put('/conversations/:id/read', async (req, res) => {
  try {
    await WhatsappConversation.findByIdAndUpdate(req.params.id, { unreadAdmin: 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/whatsapp-admin/send
// Envoie un message proactif depuis l'admin
// Body: { phone, text }
router.post('/send', async (req, res) => {
  try {
    const { phone, text } = req.body;
    if (!phone || !text) {
      return res.status(400).json({ success: false, message: 'phone et text requis' });
    }

    await sendProactiveMessage(phone, text);

    // Recupérer la conversation mise à jour
    const conv = await WhatsappConversation.findOne({ phone }).select('-messages');
    res.json({ success: true, conversation: conv });
  } catch (err) {
    console.error('[WhatsApp Admin] Erreur envoi proactif:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/whatsapp-admin/conversations/:id/link
// Lie la conversation a un client ou un dossier
// Body: { clientId?, dossierId? }
router.put('/conversations/:id/link', async (req, res) => {
  try {
    const { clientId, dossierId } = req.body;
    const update = {};
    if (clientId !== undefined) update.clientId = clientId || null;
    if (dossierId !== undefined) update.dossierId = dossierId || null;

    const conv = await WhatsappConversation.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('clientId', 'prenom nom email')
      .populate('dossierId', 'titre categorie statut');

    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation introuvable' });
    }
    res.json({ success: true, conversation: conv });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/whatsapp-admin/conversations/:id
// Supprime une conversation
router.delete('/conversations/:id', async (req, res) => {
  try {
    await WhatsappConversation.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

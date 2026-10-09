const express = require('express');
const crypto = require('crypto');
const { protect, authorize } = require('../middleware/auth');
const LEXIA_SHARE_ROLES = [
  'client',
  'admin',
  'superadmin',
  'assistant',
  'comptable',
  'secretaire',
  'juriste',
  'stagiaire',
  'visiteur',
  'partenaire',
];

const MAX_MESSAGES = 80;
const MAX_CONTENT_PER_MSG = 48000;
const MAX_TOTAL_CONTENT = 600000;
const TOKEN_BYTES = 20;
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

function sanitizeIncomingMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  let total = 0;
  for (const m of raw.slice(0, MAX_MESSAGES)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'user' || m.role === 'assistant' ? m.role : null;
    if (!role) continue;
    let content = typeof m.content === 'string' ? m.content : '';
    if (content.length > MAX_CONTENT_PER_MSG) content = content.slice(0, MAX_CONTENT_PER_MSG);
    total += content.length;
    if (total > MAX_TOTAL_CONTENT) return null;
    const row = { role, content };
    if (m.isError === true) row.isError = true;
    out.push(row);
  }
  return out.length ? out : null;
}

const M = require('../tenantModels');
const router = express.Router();

/**
 * POST /api/lexia/public-share (monté sous le routeur lexia)
 * Crée un jeton de lecture publique (JWT utilisateur requis).
 */
router.post('/', protect, authorize(...LEXIA_SHARE_ROLES), async (req, res) => {
  try {
    const scope = String(req.body?.scope || '').trim();
    if (!['full', 'since_last_user', 'this_exchange'].includes(scope)) {
      return res.status(400).json({ success: false, error: 'Paramètre scope invalide.' });
    }
    const messages = sanitizeIncomingMessages(req.body?.messages);
    if (!messages) {
      return res.status(400).json({
        success: false,
        error: 'Liste messages invalide, vide ou trop volumineuse.',
      });
    }
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim().slice(0, 500)
        : 'Discussion Paw AI';

    const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + TTL_MS);

    await M.PawAiPublicShare.create({
      token,
      title,
      scope,
      messages,
      createdBy: req.user?.id || null,
      expiresAt,
    });

    return res.json({
      success: true,
      token,
    });
  } catch (err) {
    console.error('[paw-ai-public-share] POST:', err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Erreur serveur' });
  }
});

/**
 * GET /api/lexia/public-share/:token (monté sous le routeur lexia)
 * Lecture publique (sans authentification).
 */
router.get('/:token', async (req, res) => {
  try {
    const raw = String(req.params.token || '').trim();
    const token = raw.replace(/[^a-f0-9]/gi, '');
    if (token.length < 32 || token.length > 80) {
      return res.status(404).json({ success: false, error: 'Lien introuvable.' });
    }

    const doc = await M.PawAiPublicShare.findOne({ token }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Lien introuvable ou expiré.' });
    }
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) {
      return res.status(404).json({ success: false, error: 'Lien expiré.' });
    }

    return res.json({
      success: true,
      title: doc.title,
      scope: doc.scope,
      messages: doc.messages,
      createdAt: doc.createdAt,
    });
  } catch (err) {
    console.error('[paw-ai-public-share] GET:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;

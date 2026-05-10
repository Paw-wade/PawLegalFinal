const express = require('express');
const router = express.Router();
const {
  searchKnowledge,
  searchAndCompose,
  getKnowledgeDir,
  getKnowledgeStats,
  invalidateCache,
} = require('../services/lexiaInternal');

console.log('✅ Route /api/lexia enregistrée');

/**
 * GET /api/lexia/stats
 * Statistiques du corpus indexé (nombre de fichiers, extensions, etc.)
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getKnowledgeStats();
    res.json({ success: true, stats });
  } catch (err) {
    console.error('[lexia] /stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/lexia/search
 * Recherche dans le corpus par mots-clés
 * Body: { query, filters?, page?, limit? }
 */
router.post('/search', async (req, res) => {
  try {
    const {
      query = '',
      filters = {},
      page = 1,
      limit = 12,
    } = req.body;

    const result = await searchKnowledge({
      queryText: query,
      knowledgeDir: getKnowledgeDir(),
      filters,
      page,
      limit,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[lexia] /search error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/lexia/compose
 * Recherche + composition d'une réponse markdown sans LLM externe
 * Body: { messages: [{ role, content }] }
 */
router.post('/compose', async (req, res) => {
  try {
    const { messages = [] } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages[] requis' });
    }

    const result = await searchAndCompose(messages, getKnowledgeDir());
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[lexia] /compose error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/lexia/invalidate-cache
 * Vide le cache mémoire pour forcer une réindexation au prochain appel
 */
router.post('/invalidate-cache', (req, res) => {
  try {
    invalidateCache();
    res.json({ success: true, message: 'Cache Lexia vidé' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
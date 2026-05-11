const express = require('express');
const router = express.Router();
const {
  rechercher,
  getArticle,
  searchThenGetArticlePreview,
  getArticlePreviewById,
} = require('../lib/legifrance');
const { protect } = require('../middleware/auth');

router.post('/search', async (req, res) => {
  try {
    const { query, fond } = req.body;
    const result = await rechercher(query, fond);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/article', async (req, res) => {
  try {
    const { id } = req.body;
    const result = await getArticle(id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Prévisualisation texte article (Paw AI) — authentifié pour limiter l’usage des quotas PISTE. */
router.post('/article-preview', protect, async (req, res) => {
  try {
    if (!process.env.LEGIFRANCE_API_URL) {
      return res.status(503).json({
        success: false,
        configured: false,
        error: 'API Légifrance non configurée sur le serveur (LEGIFRANCE_API_URL).',
      });
    }
    const { query, fond, id } = req.body || {};
    if (id && typeof id === 'string' && id.trim()) {
      const preview = await getArticlePreviewById(String(id).trim(), String(id).trim());
      return res.status(200).json({ success: true, ...preview });
    }
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, error: 'query ou id requis' });
    }
    const preview = await searchThenGetArticlePreview(query.trim(), fond || 'CODE_DATE');
    res.status(200).json({ success: true, ...preview });
  } catch (err) {
    const code = err.code;
    const status = code === 'NO_ARTICLE_ID' ? 404 : 500;
    res.status(status).json({ success: false, error: err.message || 'Erreur Légifrance' });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const {
  rechercher,
  getArticle,
  searchThenGetArticlePreview,
  getArticlePreviewById,
  getArticlePreviewEnriched,
  extractLegiartiIdFromSearch,
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

/** Prévisualisation texte article (Paw AI) - authentifié pour limiter l’usage des quotas PISTE. */
router.post('/article-preview', protect, async (req, res) => {
  try {
    if (!process.env.LEGIFRANCE_API_URL) {
      return res.status(503).json({
        success: false,
        configured: false,
        error: 'API Légifrance non configurée sur le serveur (LEGIFRANCE_API_URL).',
      });
    }
    const { query, fond, id, enriched } = req.body || {};
    const wantEnriched = enriched !== false;

    if (id && typeof id === 'string' && id.trim()) {
      if (wantEnriched) {
        const preview = await getArticlePreviewEnriched(String(id).trim(), String(id).trim());
        return res.status(200).json({ success: true, ...preview });
      }
      const preview = await getArticlePreviewById(String(id).trim(), String(id).trim());
      return res.status(200).json({ success: true, ...preview });
    }
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, error: 'query ou id requis' });
    }
    if (wantEnriched) {
      const search = await rechercher(query.trim(), fond || 'CODE_DATE');
      const rid = extractLegiartiIdFromSearch(search);
      if (!rid) {
        return res.status(404).json({
          success: false,
          error: 'Aucun article Légifrance identifié dans les résultats.',
          code: 'NO_ARTICLE_ID',
        });
      }
      const preview = await getArticlePreviewEnriched(rid, query.trim());
      return res.status(200).json({ success: true, ...preview });
    }
    const preview = await searchThenGetArticlePreview(query.trim(), fond || 'CODE_DATE');
    res.status(200).json({ success: true, ...preview });
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : undefined;
    const upstream = err && typeof err === 'object' ? err.httpStatus : undefined;
    let status = 500;
    if (code === 'NO_ARTICLE_ID' || code === 'ARTICLE_NOT_FOUND') status = 404;
    else if (code === 'INVALID_LEGIARTI') status = 400;
    else if (code === 'LEGIFRANCE_UNAUTHORIZED') status = 502;
    else if (code === 'LEGIFRANCE_CONSULT_ERROR' && upstream === 404) status = 404;
    else if (code === 'LEGIFRANCE_CONSULT_ERROR' && typeof upstream === 'number' && upstream >= 400 && upstream < 500) {
      status = 502;
    } else if (
      code === 'LEGIFRANCE_SEARCH_ERROR' &&
      typeof upstream === 'number' &&
      upstream >= 400 &&
      upstream < 500
    ) {
      status = 502;
    }
    res.status(status).json({
      success: false,
      error: err.message || 'Erreur Légifrance',
      ...(code ? { code: String(code) } : {}),
    });
  }
});

module.exports = router;
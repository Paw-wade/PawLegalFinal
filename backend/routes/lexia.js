const express = require('express');
const router = express.Router();
const {
  searchKnowledge,
  searchAndCompose,
  getKnowledgeDir,
  getKnowledgeStats,
  invalidateCache,
} = require('../services/lexiaInternal');
const { runLexiaWithProvider, toSourcesFound } = require('../services/lexiaProviders');


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

/**
 * GET /api/lexia/config
 * Configuration du provider Lexia
 */
router.get('/config', async (req, res) => {
  try {
    const knowledgeDir = getKnowledgeDir();
    res.json({
      success: true,
      envProvider: process.env.LEXIA_PROVIDER || 'internal',
      anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      knowledgeDirRelative: knowledgeDir,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/lexia
 * Point d'entrée principal — reçoit les messages et retourne une réponse
 */
router.post('/', async (req, res) => {
  const t0 = Date.now();
  let finished = false;
  const onClose = () => {
    if (!finished && !res.headersSent) {
      console.warn(`[lexia] POST / client fermé la connexion après ${Date.now() - t0} ms (souvent timeout navigateur ou OOM)`);
    }
  };
  req.on('close', onClose);

  try {
    const { messages = [], provider } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      finished = true;
      return res.status(400).json({ success: false, error: 'messages[] requis' });
    }

    console.log(`[lexia] POST / démarrage (${messages.length} message(s))`);
    const result = await searchAndCompose(messages, getKnowledgeDir());
    const sourcesArr = Array.isArray(result.sources) ? result.sources : [];
    const sourcesFound = sourcesArr
      .map((s) => (s && s.file != null ? String(s.file) : null))
      .filter(Boolean);
    res.json({
      success: true,
      text: typeof result.text === 'string' ? result.text : String(result.text ?? ''),
      sources: sourcesArr,
      searched: true,
      sourcesFound,
    });
    finished = true;
    console.log(`[lexia] POST / terminé en ${Date.now() - t0} ms`);
  } catch (err) {
    finished = true;
    console.error('[lexia] POST / error:', err.stack || err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Erreur interne Lexia',
    });
    console.log(`[l
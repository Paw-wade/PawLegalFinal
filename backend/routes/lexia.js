const express = require('express');
const router = express.Router();
const {
  searchKnowledge,
  searchAndCompose,
  getKnowledgeDir,
  getKnowledgeStats,
  invalidateCache,
  readKnowledgeFileContent,
} = require('../services/lexiaInternal');
const {
  runLexiaWithProvider,
  buildLexiaChatSuccessPayload,
  isGeminiDisabled,
  getAnthropicModelEffective,
  resolveLexiaProvider,
  streamAnthropicLexia,
} = require('../services/lexiaProviders');
const { protect, authorize } = require('../middleware/auth');

/** Même périmètre que paw-search : lecture du corpus indexé. */
const LEXIA_KNOWLEDGE_READ_ROLES = [
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
 * POST /api/lexia/knowledge-file
 * Corps : { file: "chemin/relatif/doc.md" } — texte intégral extrait (sécurisé sous LEXIA_KNOWLEDGE_DIR).
 */
router.post('/knowledge-file', protect, authorize(...LEXIA_KNOWLEDGE_READ_ROLES), async (req, res) => {
  try {
    const file = String(req.body?.file || '').trim();
    if (!file) {
      return res.status(400).json({ success: false, error: 'file requis' });
    }
    const result = await readKnowledgeFileContent(file);
    return res.json({ success: true, ...result });
  } catch (err) {
    const code = err.code;
    if (code === 'INVALID_FILE_PATH') {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (code === 'FILE_NOT_FOUND') {
      return res.status(404).json({ success: false, error: err.message });
    }
    if (code === 'UNSUPPORTED_EXT' || code === 'FILE_TOO_LARGE') {
      return res.status(415).json({ success: false, error: err.message, code });
    }
    console.error('[lexia] /knowledge-file:', err.stack || err.message);
    return res.status(500).json({ success: false, error: err.message || 'Erreur lecture fichier' });
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
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY) && !isGeminiDisabled(),
      knowledgeDirRelative: knowledgeDir,
      anthropicModel: getAnthropicModelEffective().effective,
      geminiModel: (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim(),
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
    const { messages = [], provider, stream: streamRequested } = req.body;
    const wantStream = streamRequested === true || streamRequested === 'true';

    if (!Array.isArray(messages) || messages.length === 0) {
      finished = true;
      return res.status(400).json({ success: false, error: 'messages[] requis' });
    }

    const resolved = resolveLexiaProvider(provider);
    if (wantStream && resolved !== 'anthropic') {
      finished = true;
      return res.status(400).json({
        success: false,
        error:
          'Le streaming (SSE) n’est disponible que pour le fournisseur Anthropic. Choisissez « Anthropic uniquement » ou désactivez stream.',
        code: 'LEXIA_STREAM_PROVIDER',
      });
    }

    if (wantStream && resolved === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
      finished = true;
      return res.status(400).json({ success: false, error: 'ANTHROPIC_API_KEY requise pour le streaming Anthropic' });
    }

    if (wantStream && resolved === 'anthropic') {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
      console.log(`[lexia] POST / démarrage (stream SSE, ${messages.length} message(s)) provider=anthropic`);
      try {
        await streamAnthropicLexia(res, req, messages);
        finished = true;
        console.log(`[lexia] POST / (stream) terminé en ${Date.now() - t0} ms`);
      } catch (streamErr) {
        finished = true;
        console.error('[lexia] POST / stream error:', streamErr.stack || streamErr.message);
      } finally {
        if (!res.writableEnded) {
          res.end();
        }
      }
      return;
    }

    console.log(`[lexia] POST / démarrage (${messages.length} message(s)) provider=${String(provider || 'auto')}`);
    const result = await runLexiaWithProvider(messages, provider);
    res.json(buildLexiaChatSuccessPayload(result));
    finished = true;
    console.log(`[lexia] POST / terminé en ${Date.now() - t0} ms`);
  } catch (err) {
    finished = true;
    console.error('[lexia] POST / error:', err.stack || err.message);
    const code = err.code;
    const axiosMsg =
      err.response?.data?.error?.message ||
      (typeof err.response?.data === 'string' ? err.response.data : null);
    const msg = axiosMsg || err.message || 'Erreur interne Lexia';
    /** Erreurs Anthropic/Gemini : on met `status` sur l'erreur sans toujours remplir `err.response` (axios + validateStatus). */
    const upstreamStatus = Number(err.response?.status ?? err.status);
    let status = 500;
    if (code === 'MISSING_KEY' || code === 'EMPTY_MESSAGES') {
      status = 400;
    } else if (code === 'GEMINI_QUOTA') {
      status = 429;
    } else if (code === 'GEMINI_DISABLED') {
      status = 503;
    } else if (code === 'ANTHROPIC_RATE_LIMIT') {
      status = 429;
    } else if (code === 'ANTHROPIC_AUTH') {
      status = 502;
    } else if (code === 'ANTHROPIC_MODEL_NOT_FOUND') {
      status = 400;
    } else if (Number.isFinite(upstreamStatus) && upstreamStatus === 429) {
      status = 429;
    } else if (Number.isFinite(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus < 600) {
      status = 502;
    }
    res.status(status).json({
      success: false,
      error: msg,
      code: code || undefined,
    });
    console.log(`[lexia] POST / échec après ${Date.now() - t0} ms`);
  }
});

module.exports = router;
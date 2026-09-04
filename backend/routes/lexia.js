const express = require('express');
const mongoose = require('mongoose');
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
const LexiaPawAiState = require('../models/LexiaPawAiState');
const jwt = require('jsonwebtoken');
const { buildThreadAttachmentAppendix } = require('../services/lexiaThreadAttachments');

const MAX_CLOUD_THREADS = 40;
const MAX_CLOUD_MESSAGES_PER_THREAD = 80;
const MAX_CLOUD_MESSAGE_CHARS = 48000;

/**
 * Nettoie le JSON threads côté serveur (évite documents Mongo hors limites / injection).
 */
function sanitizeChatThreadsForStorage(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_CLOUD_THREADS)
    .map((t) => {
      if (!t || typeof t !== 'object') return null;
      const id = typeof t.id === 'string' && t.id.length > 0 && t.id.length < 200 ? t.id : null;
      if (!id) return null;
      const title =
        typeof t.title === 'string' && t.title.trim() ? t.title.trim().slice(0, 500) : 'Nouvelle conversation';
      const rawMsgs = Array.isArray(t.messages) ? t.messages : [];
      const messages = rawMsgs.slice(0, MAX_CLOUD_MESSAGES_PER_THREAD).map((m) => {
        if (!m || typeof m !== 'object') return null;
        const role = m.role === 'user' || m.role === 'assistant' ? m.role : null;
        if (!role) return null;
        let content = typeof m.content === 'string' ? m.content : '';
        if (content.length > MAX_CLOUD_MESSAGE_CHARS) {
          content = content.slice(0, MAX_CLOUD_MESSAGE_CHARS);
        }
        const mid =
          typeof m.id === 'number' && Number.isFinite(m.id) ? m.id : Math.floor(Date.now() + Math.random() * 1e6);
        const row = {
          id: mid,
          role,
          content,
        };
        if (m.searched === true) row.searched = true;
        if (m.isError === true) row.isError = true;
        if (typeof m.lexiaProvider === 'string' && m.lexiaProvider.length < 40) {
          row.lexiaProvider = m.lexiaProvider;
        }
        if (Array.isArray(m.sourcesFound)) {
          row.sourcesFound = m.sourcesFound.filter((x) => typeof x === 'string').slice(0, 200);
        }
        if (typeof m.totalToolUses === 'number' && Number.isFinite(m.totalToolUses)) {
          row.totalToolUses = m.totalToolUses;
        }
        if (Array.isArray(m.lexiaKnowledgeSources)) {
          row.lexiaKnowledgeSources = m.lexiaKnowledgeSources.slice(0, 400);
        }
        return row;
      }).filter(Boolean);
      const updatedAt =
        typeof t.updatedAt === 'number' && Number.isFinite(t.updatedAt) ? t.updatedAt : Date.now();
      const row = { id, title, messages, updatedAt };
      if (typeof t.forumThreadId === 'string' && t.forumThreadId.length < 80) {
        row.forumThreadId = t.forumThreadId;
      }
      return row;
    })
    .filter(Boolean);
}

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

/** ObjectId Mongo pour LexiaPawAiState (évite cast / findOne qui rejette). */
function pawAiMongoUserId(req) {
  const raw = req.user?._id ?? req.user?.id;
  if (raw == null) return null;
  if (typeof raw === 'object' && mongoose.Types.ObjectId.isValid(raw)) return raw;
  const s = String(raw).trim();
  if (mongoose.Types.ObjectId.isValid(s) && /^[a-f\d]{24}$/i.test(s)) {
    return new mongoose.Types.ObjectId(s);
  }
  return null;
}

/**
 * Partage public Paw AI - même préfixe que le proxy Next `/api/lexia/*`.
 * POST /api/lexia/public-share · GET /api/lexia/public-share/:token
 */
router.use('/public-share', require('./pawAiPublicShare'));
router.use('/thread-attachments', require('./lexiaThreadAttachments'));

function resolveOptionalLexiaUserId(req) {
  try {
    const bearer = req.headers.authorization;
    if (!bearer || !bearer.startsWith('Bearer ')) return null;
    const decoded = jwt.verify(bearer.slice(7), process.env.JWT_SECRET || 'your-secret-key-here');
    return pawAiMongoUserId({ user: { _id: decoded.id, id: decoded.id } });
  } catch {
    return null;
  }
}

/**
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
 * Corps : { file: "chemin/relatif/doc.md" } - texte intégral extrait (sécurisé sous LEXIA_KNOWLEDGE_DIR).
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
      /** Moteur effectif si le client envoie provider=auto (même logique que POST /api/lexia). */
      resolvedForAuto: resolveLexiaProvider('auto'),
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
 * GET /api/lexia/chat-state
 * Historique Paw AI du compte connecté (multi-appareils).
 */
router.get('/chat-state', protect, authorize(...LEXIA_KNOWLEDGE_READ_ROLES), async (req, res) => {
  try {
    const userId = pawAiMongoUserId(req);
    if (!userId) {
      console.error('[lexia] GET /chat-state: identifiant utilisateur invalide', req.user?.id);
      return res.json({ success: true, threads: [] });
    }
    const doc = await LexiaPawAiState.findOne({ user: userId }).lean();
    res.json({ success: true, threads: Array.isArray(doc?.threads) ? doc.threads : [] });
  } catch (err) {
    console.error('[lexia] GET /chat-state:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Erreur serveur' });
  }
});

/**
 * PUT /api/lexia/chat-state
 * Remplace l’historique Paw AI du compte (dernière version client, debouncée).
 */
router.put('/chat-state', protect, authorize(...LEXIA_KNOWLEDGE_READ_ROLES), async (req, res) => {
  try {
    const threads = sanitizeChatThreadsForStorage(req.body?.threads);
    const userId = pawAiMongoUserId(req);
    if (!userId) {
      console.error('[lexia] PUT /chat-state: identifiant utilisateur invalide', req.user?.id);
      return res.status(400).json({ success: false, error: 'Identifiant utilisateur invalide' });
    }
    await LexiaPawAiState.findOneAndUpdate(
      { user: userId },
      { $set: { threads } },
      { upsert: true, new: true }
    );
    res.json({ success: true, saved: threads.length });
  } catch (err) {
    console.error('[lexia] PUT /chat-state:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Erreur serveur' });
  }
});

/**
 * POST /api/lexia
 * Point d'entrée principal - reçoit les messages et retourne une réponse
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
    const { messages = [], provider, stream: streamRequested, threadId } = req.body;
    const wantStream = streamRequested === true || streamRequested === 'true';

    if (!Array.isArray(messages) || messages.length === 0) {
      finished = true;
      return res.status(400).json({ success: false, error: 'messages[] requis' });
    }

    let threadAttachmentAppendix = '';
    const safeThreadId = typeof threadId === 'string' ? threadId.trim() : '';
    const lexiaUserId = resolveOptionalLexiaUserId(req);
    if (safeThreadId && lexiaUserId) {
      try {
        threadAttachmentAppendix = await buildThreadAttachmentAppendix(lexiaUserId, safeThreadId);
      } catch (attachErr) {
        console.warn('[lexia] Pièces jointes du fil - non bloquant:', attachErr?.message || attachErr);
      }
    }
    const lexiaOpts = { threadAttachmentAppendix };

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
        await streamAnthropicLexia(res, req, messages, lexiaOpts);
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

    const resolvedForLog = resolveLexiaProvider(provider);
    console.log(
      `[lexia] POST / démarrage (${messages.length} message(s)) provider=${String(provider || 'auto')} → résolu=${resolvedForLog}`
    );
    const result = await runLexiaWithProvider(messages, provider, lexiaOpts);
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
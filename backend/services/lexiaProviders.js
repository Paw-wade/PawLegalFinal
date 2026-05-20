/**
 * Orchestration Paw AI : Anthropic, Gemini, base interne (Lexia), mode combiné.
 * Les clés API restent côté serveur uniquement.
 */

const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { searchAndCompose, getKnowledgeDir } = require('./lexiaInternal');
const { getPawAiLegalSystemPrompt } = require('./lexiaLegalCharter');
const { prepareLlmContext, gatherExternalOnlyForInternal, mergeSystemPrompt } = require('./lexiaRetrieval');
const { prependAttachmentsToLastUserMessage } = require('./lexiaThreadAttachments');

const VALID = new Set(['auto', 'internal', 'anthropic', 'gemini', 'all']);

function isGeminiDisabled() {
  const v = String(process.env.LEXIA_DISABLE_GEMINI || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function normalizeProvider(p) {
  const s = String(p || '').trim().toLowerCase();
  return VALID.has(s) ? s : 'auto';
}

/** Requête « auto » (ou vide) : en cas d'échec d'une API externe, on peut retomber sur la base interne. */
function isAutoRequested(providerRequested) {
  const s = String(providerRequested ?? '').trim().toLowerCase();
  return s === '' || s === 'auto';
}

const LEXIA_AUTO_FALLBACK_NOTE =
  '\n\n> *L\'analyse Paw AI approfondie n\'a pas pu être produite ; affichage des éléments issus de la base documentaire interne.*';

/**
 * Résolution du moteur : requête client > LEXIA_PROVIDER > auto.
 */
function resolveLexiaProvider(requested) {
  const fromBody = normalizeProvider(requested);
  if (fromBody !== 'auto') return fromBody;
  const envP = normalizeProvider(process.env.LEXIA_PROVIDER);
  if (envP !== 'auto') return envP;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY && !isGeminiDisabled()) return 'gemini';
  return 'internal';
}

function normalizeMessagesForAnthropic(messages) {
  const out = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = String(m.content ?? '').trim();
    if (!content) continue;
    out.push({ role, content });
  }
  return out;
}

function normalizeContentsForGemini(messages) {
  const out = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const text = String(m.content ?? '').trim();
    if (!text) continue;
    out.push({ role, parts: [{ text }] });
  }
  return out;
}

function textFromAnthropicContent(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text' && b.text != null)
    .map((b) => String(b.text))
    .join('');
}

/** Modèles retirés côté Anthropic : on bascule vers un id supporté (voir docs dépréciations). */
const ANTHROPIC_MODEL_ALIASES = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
};

function getAnthropicModelEffective() {
  let work = process.env.ANTHROPIC_MODEL != null ? String(process.env.ANTHROPIC_MODEL).trim() : '';
  if (work.charCodeAt(0) === 0xfeff) work = work.slice(1).trim();
  // Faute fréquente : « laude-… » au lieu de « claude-… »
  if (/^laude-/i.test(work)) {
    const fixed = (`c${work}`).toLowerCase();
    console.warn(
      `[lexia] ANTHROPIC_MODEL corrigé faute « ${work} » → « ${fixed} ». Mettez claude-… dans backend/.env.`
    );
    work = fixed;
  }
  const requested = (work || 'claude-sonnet-4-6').toLowerCase();
  const effective = ANTHROPIC_MODEL_ALIASES[requested] || requested;
  return { requested, effective };
}

/** Erreur API Anthropic (SDK) → erreur applicative avec `code` / `status`. */
function mapAnthropicSdkError(e, model) {
  if (e instanceof Anthropic.APIUserAbortError) {
    const err = new Error('Requête Anthropic interrompue (annulation ou fermeture de connexion).');
    err.code = 'ANTHROPIC_USER_ABORT';
    return err;
  }
  if (e instanceof Anthropic.RateLimitError) {
    const err = new Error(
      'Limite de débit Anthropic atteinte (trop de requêtes). Réessayez dans quelques instants ou vérifiez votre plan.'
    );
    err.code = 'ANTHROPIC_RATE_LIMIT';
    err.status = 429;
    return err;
  }
  if (e instanceof Anthropic.AuthenticationError) {
    const err = new Error('Authentification Anthropic refusée (clé API invalide ou révoquée).');
    err.code = 'ANTHROPIC_AUTH';
    err.status = 401;
    return err;
  }
  if (e instanceof Anthropic.NotFoundError) {
    const raw = String(e.message || '');
    const isModel = raw.toLowerCase().includes('model');
    const err = new Error(
      isModel
        ? `Modèle Anthropic inconnu ou retiré (« ${model} »). Dans backend/.env, définissez par ex. ANTHROPIC_MODEL=claude-sonnet-4-6 (ids à jour sur la console Anthropic).`
        : raw || 'Ressource Anthropic introuvable.'
    );
    err.code = 'ANTHROPIC_MODEL_NOT_FOUND';
    err.status = 404;
    return err;
  }
  if (e instanceof Anthropic.APIError) {
    const status = e.status;
    const raw = e.message || 'Erreur API Anthropic';
    const low = raw.toLowerCase();
    if (status === 429 || low.includes('rate limit') || low.includes('too many requests')) {
      const err = new Error(
        'Limite de débit Anthropic atteinte (trop de requêtes). Réessayez dans quelques instants ou vérifiez votre plan.'
      );
      err.code = 'ANTHROPIC_RATE_LIMIT';
      err.status = 429;
      return err;
    }
    const err = new Error(raw);
    err.code = 'ANTHROPIC_API';
    err.status = status;
    return err;
  }
  if (e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.APIConnectionTimeoutError) {
    const err = new Error(e.message || 'Connexion à l’API Anthropic impossible.');
    err.code = 'ANTHROPIC_CONNECTION';
    return err;
  }
  return null;
}

/**
 * Anthropic en SSE : garde la connexion ouverte (évite les abandons navigateur sur réponses longues).
 * Le client doit envoyer `stream: true` et accepter `text/event-stream`.
 */
async function streamAnthropicLexia(res, req, messages, lexiaOpts = {}) {
  const writeSse = (obj) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    }
  };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const err = new Error('ANTHROPIC_API_KEY non configurée sur le serveur');
    err.code = 'MISSING_KEY';
    writeSse({ type: 'error', success: false, error: err.message, code: err.code });
    throw err;
  }
  const { requested, effective: model } = getAnthropicModelEffective();
  if (model !== requested) {
    console.warn(
      `[lexia] ANTHROPIC_MODEL « ${requested} » n’est plus disponible ; utilisation de « ${model} ». Mettez à jour backend/.env.`
    );
  }
  const attachmentAppendix = String(lexiaOpts.threadAttachmentAppendix || '').trim();
  const messagesForProvider = attachmentAppendix
    ? prependAttachmentsToLastUserMessage(messages, attachmentAppendix)
    : messages;
  const msgs = normalizeMessagesForAnthropic(messagesForProvider);
  if (!msgs.length) {
    const err = new Error('Aucun message utilisateur valide');
    err.code = 'EMPTY_MESSAGES';
    writeSse({ type: 'error', success: false, error: err.message, code: err.code });
    throw err;
  }

  let retrievalCtx;
  try {
    retrievalCtx = await prepareLlmContext(messages, {
      threadAttachmentAppendix: lexiaOpts.threadAttachmentAppendix,
    });
  } catch (prepErr) {
    console.warn('[lexia] Récupération documentaire (stream) — non bloquant:', prepErr?.message || prepErr);
    retrievalCtx = { systemAppendix: '', sources: [], searched: false, totalToolUses: 0 };
  }

  const maxTokens = Math.min(Math.max(Number(process.env.ANTHROPIC_MAX_TOKENS) || 4096, 256), 8192);
  const system = mergeSystemPrompt(getPawAiLegalSystemPrompt(), retrievalCtx.systemAppendix);
  const timeoutMs = Math.min(Math.max(Number(process.env.ANTHROPIC_TIMEOUT_MS) || 120000, 30000), 600000);

  const client = new Anthropic({ apiKey: key, timeout: timeoutMs });
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages: msgs,
  });

  /** Évite d’appeler `abort()` après une fin normale — `req` « close » peut arriver trop tôt sur certains proxies. */
  let upstreamSettled = false;
  const onResClose = () => {
    if (upstreamSettled) return;
    try {
      stream.abort();
    } catch (_) {
      /* ignore */
    }
  };
  res.on('close', onResClose);

  stream.on('text', (delta) => {
    if (typeof delta === 'string' && delta.length) {
      writeSse({ type: 'delta', text: delta });
    }
  });

  try {
    const finalText = await stream.finalText();
    upstreamSettled = true;
    writeSse({
      type: 'complete',
      ...buildLexiaChatSuccessPayload({
        text: finalText,
        sources: [
          ...(Array.isArray(retrievalCtx.sources) ? retrievalCtx.sources : []),
          { file: 'api:anthropic', score: 1, metadata: { model }, source: 'anthropic' },
        ],
        searched: Boolean(retrievalCtx.searched),
        totalToolUses: retrievalCtx.totalToolUses,
        provider: 'anthropic',
        resolvedProvider: 'anthropic',
      }),
    });
  } catch (e) {
    upstreamSettled = true;
    if (e instanceof Anthropic.APIUserAbortError) {
      console.warn('[lexia] POST / stream annulé (client, navigation ou double requête).');
      if (!res.writableEnded) {
        try {
          writeSse({
            type: 'error',
            success: false,
            error: 'Connexion interrompue avant la fin de la réponse.',
            code: 'ANTHROPIC_CLIENT_ABORT',
          });
        } catch (_) {
          /* client déjà parti */
        }
      }
      return;
    }
    const mapped = mapAnthropicSdkError(e, model) || e;
    const msg = mapped instanceof Error ? mapped.message : String(mapped);
    const code = mapped && typeof mapped === 'object' && 'code' in mapped ? mapped.code : undefined;
    writeSse({ type: 'error', success: false, error: msg, code: code || undefined });
    throw mapped instanceof Error ? mapped : e;
  } finally {
    upstreamSettled = true;
    res.removeListener('close', onResClose);
  }
}

async function callAnthropic(messages, retrievalCtx = null) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const err = new Error('ANTHROPIC_API_KEY non configurée sur le serveur');
    err.code = 'MISSING_KEY';
    throw err;
  }
  const { requested, effective: model } = getAnthropicModelEffective();
  if (model !== requested) {
    console.warn(
      `[lexia] ANTHROPIC_MODEL « ${requested} » n’est plus disponible ; utilisation de « ${model} ». Mettez à jour backend/.env.`
    );
  }
  const msgs = normalizeMessagesForAnthropic(messages);
  if (!msgs.length) {
    const err = new Error('Aucun message utilisateur valide');
    err.code = 'EMPTY_MESSAGES';
    throw err;
  }

  let ctx = retrievalCtx;
  if (ctx == null) {
    try {
      ctx = await prepareLlmContext(messages);
    } catch (prepErr) {
      console.warn('[lexia] Récupération documentaire — non bloquant:', prepErr?.message || prepErr);
      ctx = { systemAppendix: '', sources: [], searched: false, totalToolUses: 0 };
    }
  }

  const maxTokens = Math.min(Math.max(Number(process.env.ANTHROPIC_MAX_TOKENS) || 4096, 256), 8192);
  const systemBase = ctx.systemPromptOverride || getPawAiLegalSystemPrompt();
  const system = mergeSystemPrompt(systemBase, ctx.systemAppendix);
  const timeoutMs = Math.min(Math.max(Number(process.env.ANTHROPIC_TIMEOUT_MS) || 120000, 30000), 600000);

  const client = new Anthropic({ apiKey: key, timeout: timeoutMs });

  try {
    const data = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: msgs,
    });

    const text = textFromAnthropicContent(data.content);
    if (!text && data.stop_reason === 'max_tokens') {
      return { text: '_(Réponse tronquée — augmentez ANTHROPIC_MAX_TOKENS si besoin.)_', model, retrievalCtx: ctx };
    }
    return { text: text || '_(Réponse vide du modèle.)_', model, retrievalCtx: ctx };
  } catch (e) {
    const mapped = mapAnthropicSdkError(e, model);
    if (mapped) throw mapped;
    throw e;
  }
}

async function callGemini(messages, retrievalCtx = null) {
  if (isGeminiDisabled()) {
    const err = new Error('Gemini est désactivé sur ce serveur (LEXIA_DISABLE_GEMINI).');
    err.code = 'GEMINI_DISABLED';
    throw err;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error('GEMINI_API_KEY non configurée sur le serveur');
    err.code = 'MISSING_KEY';
    throw err;
  }
  const model = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
  const contents = normalizeContentsForGemini(messages);
  if (!contents.length) {
    const err = new Error('Aucun message utilisateur valide');
    err.code = 'EMPTY_MESSAGES';
    throw err;
  }

  let ctx = retrievalCtx;
  if (ctx == null) {
    try {
      ctx = await prepareLlmContext(messages);
    } catch (prepErr) {
      console.warn('[lexia] Récupération documentaire (Gemini) — non bloquant:', prepErr?.message || prepErr);
      ctx = { systemAppendix: '', sources: [], searched: false, totalToolUses: 0 };
    }
  }

  const maxOut = Math.min(Math.max(Number(process.env.GEMINI_MAX_TOKENS) || 8192, 256), 8192);
  const systemBase = ctx.systemPromptOverride || getPawAiLegalSystemPrompt();
  const systemInstruction = {
    parts: [{ text: mergeSystemPrompt(systemBase, ctx.systemAppendix) }],
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await axios.post(
    url,
    {
      systemInstruction,
      contents,
      generationConfig: {
        maxOutputTokens: maxOut,
        temperature: 0.35,
      },
    },
    {
      timeout: 120000,
      headers: { 'content-type': 'application/json' },
      validateStatus: () => true,
    }
  );

  const data = res.data;
  if (res.status >= 400) {
    const rawMsg =
      data?.error?.message ||
      (typeof data === 'string' ? data : null) ||
      `Gemini HTTP ${res.status}`;
    const low = String(rawMsg).toLowerCase();
    const isQuota =
      res.status === 429 ||
      low.includes('quota') ||
      low.includes('resource exhausted') ||
      low.includes('rate limit') ||
      low.includes('too many requests');
    const msg = isQuota
      ? 'Quota ou limite Gemini atteinte (essai gratuit ou débit). Réessayez plus tard ou choisissez un autre fournisseur Paw AI.'
      : rawMsg;
    const err = new Error(msg);
    err.code = isQuota ? 'GEMINI_QUOTA' : 'GEMINI_API';
    err.status = res.status;
    throw err;
  }

  if (data.error) {
    const rawMsg = data.error.message || 'Erreur API Gemini';
    const low = String(rawMsg).toLowerCase();
    const isQuota =
      low.includes('quota') ||
      low.includes('resource exhausted') ||
      low.includes('rate limit');
    const msg = isQuota
      ? 'Quota ou limite Gemini atteinte (essai gratuit ou débit). Réessayez plus tard ou choisissez un autre fournisseur Paw AI.'
      : rawMsg;
    const err = new Error(msg);
    err.code = isQuota ? 'GEMINI_QUOTA' : 'GEMINI_API';
    throw err;
  }

  const cand = data.candidates?.[0];
  const finish = cand?.finishReason;
  if (finish === 'SAFETY' || finish === 'BLOCKLIST') {
    const err = new Error('Réponse Gemini bloquée (safety). Reformulez la question.');
    err.code = 'GEMINI_SAFETY';
    throw err;
  }

  const parts = cand?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p) => (p.text != null ? String(p.text) : '')).join('') : '';
  return { text: text || '_(Réponse vide du modèle.)_', model, retrievalCtx: ctx };
}

function sourcesFromInternal(internalResult) {
  const arr = Array.isArray(internalResult.sources) ? internalResult.sources : [];
  return arr.map((s) => ({
    file: s.file != null ? String(s.file) : '',
    score: Number(s.score) || 0,
    metadata: s.metadata || {},
    source: 'internal',
  }));
}

function toSourcesFound(sources) {
  return (Array.isArray(sources) ? sources : [])
    .map((s) => (s && s.file != null ? String(s.file) : null))
    .filter(Boolean);
}

/**
 * Corps JSON pour POST /api/lexia en succès — même objet pour réponse HTTP et événement SSE `complete`
 * (Anthropic stream), sauf le discriminant `type` sur le flux.
 */
function buildLexiaChatSuccessPayload(result) {
  const sourcesArr = Array.isArray(result.sources) ? result.sources : [];
  const sourcesFound = toSourcesFound(sourcesArr);
  const tu = result.totalToolUses;
  const totalToolUses =
    typeof tu === 'number' && Number.isFinite(tu) ? tu : 0;
  return {
    success: true,
    text: typeof result.text === 'string' ? result.text : String(result.text ?? ''),
    sources: sourcesArr,
    searched: Boolean(result.searched),
    sourcesFound,
    provider: result.provider,
    resolvedProvider: result.resolvedProvider,
    totalToolUses,
  };
}

/**
 * Mode « tout » : interne + Anthropic + Gemini en parallèle, puis synthèse (LLM si clé dispo).
 */
async function runAllAndMerge(messages, lexiaOpts = {}) {
  const dir = getKnowledgeDir();
  const attachmentAppendix = String(lexiaOpts.threadAttachmentAppendix || '').trim();
  const internalMessages = attachmentAppendix
    ? prependAttachmentsToLastUserMessage(messages, attachmentAppendix)
    : messages;
  const ctxOptions = { threadAttachmentAppendix: attachmentAppendix };
  const lastUser = [...internalMessages].reverse().find((m) => m.role === 'user');
  const lastUserSnippet = String(lastUser?.content || '').slice(0, 2000);

  let retrievalCtx = { systemAppendix: '', sources: [], searched: false, totalToolUses: 0 };
  try {
    retrievalCtx = await prepareLlmContext(messages, ctxOptions);
  } catch (prepErr) {
    console.warn('[lexia] Mode « all » — récupération documentaire non bloquante:', prepErr?.message || prepErr);
  }

  const internalP = searchAndCompose(internalMessages, dir).catch((e) => ({
    text: `## Base interne — erreur\n\n${String(e.message || e)}`,
    sources: [],
  }));

  const anthropicP = process.env.ANTHROPIC_API_KEY
    ? callAnthropic(internalMessages, retrievalCtx).catch((e) => ({
        text: `_(Analyse externe indisponible : ${String(e.message || e)})_`,
        failed: true,
      }))
    : Promise.resolve({ text: '_(Une analyse externe n’est pas configurée sur ce serveur.)_', skipped: true });

  let geminiP;
  if (!process.env.GEMINI_API_KEY) {
    geminiP = Promise.resolve({ text: '_(Seconde analyse externe non configurée sur ce serveur.)_', skipped: true });
  } else if (isGeminiDisabled()) {
    geminiP = Promise.resolve({ text: '_(Gemini désactivé sur ce serveur (LEXIA_DISABLE_GEMINI).)_', skipped: true });
  } else {
    geminiP = callGemini(internalMessages, retrievalCtx).catch((e) => ({
        text: `_(Seconde analyse externe indisponible : ${String(e.message || e)})_`,
        failed: true,
      }));
  }

  const [internalR, antR, gemR] = await Promise.all([internalP, anthropicP, geminiP]);

  const internalText = String(internalR.text || '');
  const antText = String(antR.text || '');
  const gemText = String(gemR.text || '');
  const internalSources = sourcesFromInternal(internalR);

  const synthUserMessage = {
    role: 'user',
    content:
      `L'utilisateur a posé une question ; la dernière formulation utile est :\n` +
      `"""${lastUserSnippet}"""\n\n` +
      `Tu reçois trois briques produites en parallèle (ci-dessous sous des intitulés neutres A / B / C — ne **jamais** les répéter tels quels ni révéler à l'utilisateur qu'il s'agit de chaînes ou fournisseurs distincts). ` +
      `Rédige **une seule** réponse en français, claire et structurée (titres markdown ## / ### si utile), comme si **Paw AI** produisait une analyse unifiée. ` +
      `Respecte la charte Paw AI (sources, syllogisme, section Recommandations). Balises span lexia-* : **très peu**, uniquement pour l’essentiel (voir consigne « parcimonie ») ; le gras markdown suffit le plus souvent. ` +
      `N'utilise **aucune** étiquette du type [Interne], [Anthropic], [Gemini], [Claude], [Google], ni aucun nom de modèle ou d'API. Ne dis pas quelle « brique » a fourni quoi. ` +
      `Si une brique indique une erreur ou une absence de configuration, intègre l'information de façon générique (« une partie de l'analyse n'a pas pu être produite ») sans nommer de fournisseur. ` +
      `Si tu recommandes un contact humain ou un accompagnement personnalisé sur le dossier, oriente **uniquement** vers **Ada Papers** (plateforme / messagerie Ada Papers) — jamais vers la Cimade, le Gisti, un autre cabinet ou une autre association pour ce suivi.\n\n` +
      `---\n### Brique A — recherche documentaire indexée\n\n${internalText.slice(0, 16000)}\n\n` +
      `---\n### Brique B — analyse complémentaire\n\n${antText.slice(0, 16000)}\n\n` +
      `---\n### Brique C — analyse complémentaire\n\n${gemText.slice(0, 16000)}`,
  };

  const retrievalNonIndex = (retrievalCtx.sources || []).filter((s) => s && s.source !== 'internal_index');

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const out = await callAnthropic([synthUserMessage], retrievalCtx);
      const mergedSources = [
        ...internalSources,
        ...retrievalNonIndex,
        { file: 'api:anthropic', score: 1, metadata: {}, source: 'anthropic' },
        { file: 'api:gemini', score: 1, metadata: {}, source: 'gemini' },
      ];
      return {
        text: out.text,
        sources: mergedSources,
        searched: true,
        totalToolUses: retrievalCtx.totalToolUses,
      };
    } catch (e) {
      console.warn('[lexia] Synthèse mode « all » via Anthropic échouée, repli Gemini ou concat :', e.message);
    }
  }

  if (process.env.GEMINI_API_KEY && !isGeminiDisabled()) {
    try {
      const out = await callGemini([synthUserMessage], retrievalCtx);
      const mergedSources = [
        ...internalSources,
        ...retrievalNonIndex,
        { file: 'api:anthropic', score: 1, metadata: {}, source: 'anthropic' },
        { file: 'api:gemini', score: 1, metadata: {}, source: 'gemini' },
      ];
      return {
        text: out.text,
        sources: mergedSources,
        searched: true,
        totalToolUses: retrievalCtx.totalToolUses,
      };
    } catch (e) {
      console.warn('[lexia] Synthèse mode « all » via Gemini échouée, concaténation :', e.message);
    }
  }

  const concat = [
    '## Réponse (recomposition automatique indisponible)',
    '',
    'Les extraits ci-dessous proviennent d’analyses parallèles à recouper. Ne citez pas de nom de modèle ou de fournisseur dans une production finale.',
    '',
    '### Recherche documentaire',
    internalText,
    '',
    '### Analyses complémentaires (extrait 1)',
    antText,
    '',
    '### Analyses complémentaires (extrait 2)',
    gemText,
  ].join('\n');

  return {
    text: concat,
    sources: [
      ...internalSources,
      ...retrievalNonIndex,
      { file: 'api:anthropic', score: 1, metadata: {}, source: 'anthropic' },
      { file: 'api:gemini', score: 1, metadata: {}, source: 'gemini' },
    ],
    searched: true,
    totalToolUses: retrievalCtx.totalToolUses,
  };
}

/**
 * Point d’entrée principal pour POST /api/lexia
 */
async function runLexiaWithProvider(messages, providerRequested, lexiaOpts = {}) {
  const resolved = resolveLexiaProvider(providerRequested);
  const dir = getKnowledgeDir();
  const attachmentAppendix = String(lexiaOpts.threadAttachmentAppendix || '').trim();
  const customSystemPrompt = String(lexiaOpts.customSystemPrompt || '').trim();
  const internalMessages = attachmentAppendix
    ? prependAttachmentsToLastUserMessage(messages, attachmentAppendix)
    : messages;
  const ctxOptions = { threadAttachmentAppendix: attachmentAppendix };
  const applyCustomSystem = (ctx) => {
    if (customSystemPrompt && ctx && typeof ctx === 'object') {
      ctx.systemPromptOverride = customSystemPrompt;
    }
    return ctx;
  };

  if (resolved === 'internal') {
    const [result, ext] = await Promise.all([
      searchAndCompose(internalMessages, dir),
      gatherExternalOnlyForInternal(internalMessages),
    ]);
    const text = ext.markdown?.trim() ? `${result.text}\n\n${ext.markdown}` : result.text;
    return {
      text,
      sources: [...(result.sources || []), ...(ext.sources || [])],
      searched: true,
      totalToolUses: ext.totalToolUses,
      provider: 'internal',
      resolvedProvider: 'internal',
    };
  }

  if (resolved === 'anthropic') {
    try {
      let retrievalCtx = { systemAppendix: '', sources: [], searched: false, totalToolUses: 0 };
      try {
        retrievalCtx = applyCustomSystem(await prepareLlmContext(messages, ctxOptions));
      } catch (prepErr) {
        console.warn('[lexia] Récupération (Anthropic) — non bloquant:', prepErr?.message || prepErr);
      }
      applyCustomSystem(retrievalCtx);
      const out = await callAnthropic(internalMessages, retrievalCtx);
      const ctx = out.retrievalCtx || retrievalCtx;
      const sources = [
        ...(Array.isArray(ctx.sources) ? ctx.sources : []),
        { file: 'api:anthropic', score: 1, metadata: { model: out.model }, source: 'anthropic' },
      ];
      return {
        text: out.text,
        sources,
        searched: Boolean(ctx.searched),
        totalToolUses: ctx.totalToolUses,
        provider: 'anthropic',
        resolvedProvider: 'anthropic',
      };
    } catch (e) {
      if (isAutoRequested(providerRequested)) {
        console.warn('[lexia] Anthropic échoué, repli base interne (mode auto):', e.message || e);
        const [result, ext] = await Promise.all([
          searchAndCompose(internalMessages, dir),
          gatherExternalOnlyForInternal(internalMessages),
        ]);
        const text =
          String(result.text || '') +
          LEXIA_AUTO_FALLBACK_NOTE +
          (ext.markdown?.trim() ? `\n\n${ext.markdown}` : '');
        return {
          text,
          sources: [...(result.sources || []), ...(ext.sources || [])],
          searched: true,
          totalToolUses: ext.totalToolUses,
          provider: 'internal',
          resolvedProvider: 'internal',
        };
      }
      throw e;
    }
  }

  if (resolved === 'gemini') {
    try {
      let retrievalCtx = { systemAppendix: '', sources: [], searched: false, totalToolUses: 0 };
      try {
        retrievalCtx = applyCustomSystem(await prepareLlmContext(messages, ctxOptions));
      } catch (prepErr) {
        console.warn('[lexia] Récupération (Gemini) — non bloquant:', prepErr?.message || prepErr);
      }
      applyCustomSystem(retrievalCtx);
      const out = await callGemini(internalMessages, retrievalCtx);
      const ctx = out.retrievalCtx || retrievalCtx;
      const sources = [
        ...(Array.isArray(ctx.sources) ? ctx.sources : []),
        { file: 'api:gemini', score: 1, metadata: { model: out.model }, source: 'gemini' },
      ];
      return {
        text: out.text,
        sources,
        searched: Boolean(ctx.searched),
        totalToolUses: ctx.totalToolUses,
        provider: 'gemini',
        resolvedProvider: 'gemini',
      };
    } catch (e) {
      if (isAutoRequested(providerRequested)) {
        console.warn('[lexia] Gemini échoué, repli base interne (mode auto):', e.message || e);
        const [result, ext] = await Promise.all([
          searchAndCompose(internalMessages, dir),
          gatherExternalOnlyForInternal(internalMessages),
        ]);
        const text =
          String(result.text || '') +
          LEXIA_AUTO_FALLBACK_NOTE +
          (ext.markdown?.trim() ? `\n\n${ext.markdown}` : '');
        return {
          text,
          sources: [...(result.sources || []), ...(ext.sources || [])],
          searched: true,
          totalToolUses: ext.totalToolUses,
          provider: 'internal',
          resolvedProvider: 'internal',
        };
      }
      throw e;
    }
  }

  if (resolved === 'all') {
    const result = await runAllAndMerge(messages, lexiaOpts);
    return {
      text: result.text,
      sources: result.sources || [],
      searched: Boolean(result.searched),
      totalToolUses: result.totalToolUses,
      provider: 'all',
      resolvedProvider: 'all',
    };
  }

  // auto (ne devrait pas arriver ici — resolveLexiaProvider renvoie déjà un mode concret)
  const [fallback, ext] = await Promise.all([
    searchAndCompose(internalMessages, dir),
    gatherExternalOnlyForInternal(internalMessages),
  ]);
  const text = ext.markdown?.trim() ? `${fallback.text}\n\n${ext.markdown}` : fallback.text;
  return {
    text,
    sources: [...(fallback.sources || []), ...(ext.sources || [])],
    searched: true,
    totalToolUses: ext.totalToolUses,
    provider: 'internal',
    resolvedProvider: 'internal',
  };
}

module.exports = {
  resolveLexiaProvider,
  runLexiaWithProvider,
  callAnthropic,
  callGemini,
  toSourcesFound,
  buildLexiaChatSuccessPayload,
  isGeminiDisabled,
  getAnthropicModelEffective,
  streamAnthropicLexia,
};

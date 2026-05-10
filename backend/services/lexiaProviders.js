/**
 * Orchestration Paw AI : Anthropic, Gemini, base interne (Lexia), mode combiné.
 * Les clés API restent côté serveur uniquement.
 */

const axios = require('axios');
const { searchAndCompose, getKnowledgeDir } = require('./lexiaInternal');
const { getPawAiLegalSystemPrompt } = require('./lexiaLegalCharter');

const VALID = new Set(['auto', 'internal', 'anthropic', 'gemini', 'all']);

function normalizeProvider(p) {
  const s = String(p || '').trim().toLowerCase();
  return VALID.has(s) ? s : 'auto';
}

/**
 * Résolution du moteur : requête client > LEXIA_PROVIDER > auto.
 */
function resolveLexiaProvider(requested) {
  const fromBody = normalizeProvider(requested);
  if (fromBody !== 'auto') return fromBody;
  const envP = normalizeProvider(process.env.LEXIA_PROVIDER);
  if (envP !== 'auto') return envP;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
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

async function callAnthropic(messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const err = new Error('ANTHROPIC_API_KEY non configurée sur le serveur');
    err.code = 'MISSING_KEY';
    throw err;
  }
  const model = (process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022').trim();
  const msgs = normalizeMessagesForAnthropic(messages);
  if (!msgs.length) {
    const err = new Error('Aucun message utilisateur valide');
    err.code = 'EMPTY_MESSAGES';
    throw err;
  }

  const maxTokens = Math.min(Math.max(Number(process.env.ANTHROPIC_MAX_TOKENS) || 4096, 256), 8192);
  const system = getPawAiLegalSystemPrompt();

  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model,
      max_tokens: maxTokens,
      system,
      messages: msgs,
    },
    {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 120000,
      validateStatus: () => true,
    }
  );

  const data = res.data;
  if (res.status >= 400) {
    const msg =
      data?.error?.message ||
      (typeof data === 'string' ? data : null) ||
      `Anthropic HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = 'ANTHROPIC_API';
    err.status = res.status;
    throw err;
  }

  if (data.error) {
    const err = new Error(data.error.message || 'Erreur API Anthropic');
    err.code = 'ANTHROPIC_API';
    throw err;
  }
  if (data.type === 'error') {
    const err = new Error(data.error?.message || 'Erreur Anthropic');
    err.code = 'ANTHROPIC_API';
    throw err;
  }

  const block = Array.isArray(data.content) ? data.content.find((c) => c.type === 'text') : null;
  const text = block?.text != null ? String(block.text) : '';
  if (!text && data.stop_reason === 'max_tokens') {
    return { text: '_(Réponse tronquée — augmentez ANTHROPIC_MAX_TOKENS si besoin.)_', model };
  }
  return { text: text || '_(Réponse vide du modèle.)_', model };
}

async function callGemini(messages) {
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

  const maxOut = Math.min(Math.max(Number(process.env.GEMINI_MAX_TOKENS) || 8192, 256), 8192);
  const systemInstruction = { parts: [{ text: getPawAiLegalSystemPrompt() }] };
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
    const msg =
      data?.error?.message ||
      (typeof data === 'string' ? data : null) ||
      `Gemini HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = 'GEMINI_API';
    err.status = res.status;
    throw err;
  }

  if (data.error) {
    const err = new Error(data.error.message || 'Erreur API Gemini');
    err.code = 'GEMINI_API';
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
  return { text: text || '_(Réponse vide du modèle.)_', model };
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
 * Mode « tout » : interne + Anthropic + Gemini en parallèle, puis synthèse (LLM si clé dispo).
 */
async function runAllAndMerge(messages) {
  const dir = getKnowledgeDir();
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastUserSnippet = String(lastUser?.content || '').slice(0, 2000);

  const internalP = searchAndCompose(messages, dir).catch((e) => ({
    text: `## Base interne — erreur\n\n${String(e.message || e)}`,
    sources: [],
  }));

  const anthropicP = process.env.ANTHROPIC_API_KEY
    ? callAnthropic(messages).catch((e) => ({
        text: `_(Anthropic : ${String(e.message || e)})_`,
        failed: true,
      }))
    : Promise.resolve({ text: '_(Anthropic non configuré.)_', skipped: true });

  const geminiP = process.env.GEMINI_API_KEY
    ? callGemini(messages).catch((e) => ({
        text: `_(Gemini : ${String(e.message || e)})_`,
        failed: true,
      }))
    : Promise.resolve({ text: '_(Gemini non configuré.)_', skipped: true });

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
      `Tu reçois trois briques produites en parallèle. Rédige **une seule** réponse en français, claire et structurée (titres markdown ## / ### si utile). ` +
      `Respecte impérativement ton instruction système (charte Paw AI : sources, syllogisme, balises span lexia-verified / lexia-hypothesis / lexia-caution, section Recommandations). ` +
      `Indique explicitement l'origine des éléments avec les étiquettes **[Interne]**, **[Anthropic]**, **[Gemini]** lorsque tu t'appuies sur chaque brique. ` +
      `Si une brique indique une erreur ou « non configuré », le mentionner brièvement sans inventer de contenu.\n\n` +
      `---\n### Brique base interne (recherche documentaire indexée)\n\n${internalText.slice(0, 16000)}\n\n` +
      `---\n### Brique Anthropic (Claude)\n\n${antText.slice(0, 16000)}\n\n` +
      `---\n### Brique Gemini\n\n${gemText.slice(0, 16000)}`,
  };

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const out = await callAnthropic([synthUserMessage]);
      const mergedSources = [
        ...internalSources,
        { file: 'api:anthropic', score: 1, metadata: {}, source: 'anthropic' },
        { file: 'api:gemini', score: 1, metadata: {}, source: 'gemini' },
      ];
      return {
        text: out.text,
        sources: mergedSources,
        searched: true,
      };
    } catch (e) {
      console.warn('[lexia] Synthèse mode « all » via Anthropic échouée, repli Gemini ou concat :', e.message);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const out = await callGemini([synthUserMessage]);
      const mergedSources = [
        ...internalSources,
        { file: 'api:anthropic', score: 1, metadata: {}, source: 'anthropic' },
        { file: 'api:gemini', score: 1, metadata: {}, source: 'gemini' },
      ];
      return {
        text: out.text,
        sources: mergedSources,
        searched: true,
      };
    } catch (e) {
      console.warn('[lexia] Synthèse mode « all » via Gemini échouée, concaténation :', e.message);
    }
  }

  const concat = [
    '## Réponse combinée (synthèse LLM indisponible — ajoutez ANTHROPIC_API_KEY ou GEMINI_API_KEY pour une fusion automatique)',
    '',
    '### [Interne]',
    internalText,
    '',
    '### [Anthropic]',
    antText,
    '',
    '### [Gemini]',
    gemText,
  ].join('\n');

  return {
    text: concat,
    sources: [
      ...internalSources,
      { file: 'api:anthropic', score: 1, metadata: {}, source: 'anthropic' },
      { file: 'api:gemini', score: 1, metadata: {}, source: 'gemini' },
    ],
    searched: true,
  };
}

/**
 * Point d’entrée principal pour POST /api/lexia
 */
async function runLexiaWithProvider(messages, providerRequested) {
  const resolved = resolveLexiaProvider(providerRequested);
  const dir = getKnowledgeDir();

  if (resolved === 'internal') {
    const result = await searchAndCompose(messages, dir);
    return {
      text: result.text,
      sources: result.sources || [],
      searched: true,
      provider: 'internal',
      resolvedProvider: 'internal',
    };
  }

  if (resolved === 'anthropic') {
    const out = await callAnthropic(messages);
    const sources = [{ file: 'api:anthropic', score: 1, metadata: { model: out.model }, source: 'anthropic' }];
    return {
      text: out.text,
      sources,
      searched: false,
      provider: 'anthropic',
      resolvedProvider: 'anthropic',
    };
  }

  if (resolved === 'gemini') {
    const out = await callGemini(messages);
    const sources = [{ file: 'api:gemini', score: 1, metadata: { model: out.model }, source: 'gemini' }];
    return {
      text: out.text,
      sources,
      searched: false,
      provider: 'gemini',
      resolvedProvider: 'gemini',
    };
  }

  if (resolved === 'all') {
    const result = await runAllAndMerge(messages);
    return {
      text: result.text,
      sources: result.sources || [],
      searched: Boolean(result.searched),
      provider: 'all',
      resolvedProvider: 'all',
    };
  }

  // auto (ne devrait pas arriver ici — resolveLexiaProvider renvoie déjà un mode concret)
  const fallback = await searchAndCompose(messages, dir);
  return {
    text: fallback.text,
    sources: fallback.sources || [],
    searched: true,
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
};

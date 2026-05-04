const express = require('express');
const path = require('path');
const { protect, authorize } = require('../middleware/auth');
const { LEXIA_SYSTEM_PROMPT } = require('../lib/lexiaSystemPrompt');
const { searchAndCompose, getKnowledgeDir } = require('../services/lexiaInternal');

const router = express.Router();
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** Aligné sur `User.role` (models/User.js) — tout compte actif connecté peut utiliser LEXIA. */
const LEXIA_ALLOWED_ROLES = [
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

const VALID_PROVIDERS = new Set(['auto', 'anthropic', 'internal']);

/** Heuristique sur la requête de l'outil web_search (affichage UI LEXIA). */
const LEXIA_SOURCE_TERM_GROUPS = [
  { key: 'legifrance', terms: ['legifrance', 'légifrance', 'ceseda', 'crpa'] },
  { key: 'conseil-etat', terms: ["conseil d'état", 'conseil-etat', 'arianeweb', 'conseil etat'] },
  { key: 'caa', terms: ['caa ', "cour administrative d'appel"] },
  { key: 'ta', terms: ['tribunal administratif'] },
  { key: 'cassation', terms: ['cassation', 'courdecassation', 'judilibre'] },
  { key: 'pappers', terms: ['pappers', 'justice.pappers'] },
  { key: 'eurlex', terms: ['eur-lex', 'eurlex', 'cjue', 'directive ue', 'règlement ue'] },
  { key: 'cedh', terms: ['cedh', 'hudoc', 'article 8', 'cour européenne des droits'] },
  { key: 'gisti', terms: ['gisti'] },
  { key: 'datagouv', terms: ['data.gouv', 'datagouv', 'open data décisions'] },
  { key: 'accords', terms: ['accord franco', 'bilatéral', 'ankara', 'cedeao', 'convention franco'] },
];

function mergeSourcesFromToolUses(toolUses, existing) {
  const set = new Set(Array.isArray(existing) ? existing : []);
  for (const tu of toolUses) {
    const q = String(tu?.input?.query ?? tu?.input?.q ?? '').toLowerCase();
    for (const { key, terms } of LEXIA_SOURCE_TERM_GROUPS) {
      if (terms.some((t) => q.includes(t))) set.add(key);
    }
  }
  return [...set];
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b?.type === 'text' && typeof b?.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

function normalizeProvider(v) {
  const s = String(v ?? 'auto')
    .toLowerCase()
    .trim();
  if (!VALID_PROVIDERS.has(s)) return 'auto';
  return s;
}

/**
 * Corps `provider` prioritaire sur LEXIA_PROVIDER ; `auto` = Anthropic si clé, sinon interne.
 */
function resolveEffectiveProvider(body) {
  const fromBody = body?.provider != null ? normalizeProvider(body.provider) : null;
  const fromEnv = normalizeProvider(process.env.LEXIA_PROVIDER);
  const base = fromBody || fromEnv;
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  if (base === 'auto') {
    return hasKey ? 'anthropic' : 'internal';
  }
  return base;
}

async function anthropicMessagesCreate(body) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const err = new Error('MISSING_API_KEY');
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const err = new Error(raw.slice(0, 500) || 'Réponse Anthropic invalide');
    err.status = res.status;
    throw err;
  }
  if (!res.ok) {
    const msg = data?.error?.message || raw.slice(0, 800);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function runAnthropicLexia(trimmed) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  let includeWebSearch = process.env.ANTHROPIC_WEB_SEARCH !== 'false';

  let conversation = [...trimmed];
  let searched = false;
  let lastText = '';
  let sourcesFound = [];
  let totalToolUses = 0;

  for (let turn = 0; turn < 10; turn += 1) {
    const payload = {
      model,
      max_tokens: 8192,
      system: LEXIA_SYSTEM_PROMPT,
      messages: conversation,
    };
    if (includeWebSearch) {
      payload.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    let data;
    try {
      data = await anthropicMessagesCreate(payload);
    } catch (e) {
      if (includeWebSearch && turn === 0 && (e.status === 400 || String(e.message || '').includes('tool'))) {
        includeWebSearch = false;
        continue;
      }
      throw e;
    }

    const blocks = data.content || [];
    const text = extractTextFromContent(blocks);
    if (text) lastText = text;

    const stop = data.stop_reason;
    if (stop === 'end_turn' || stop === 'max_tokens') {
      return { text: lastText || '(Réponse vide)', searched, sourcesFound, totalToolUses };
    }

    if (stop === 'tool_use' && Array.isArray(blocks)) {
      searched = true;
      const toolUses = blocks.filter((b) => b?.type === 'tool_use' && b?.id);
      totalToolUses += toolUses.length;
      sourcesFound = mergeSourcesFromToolUses(toolUses, sourcesFound);
      if (toolUses.length === 0) {
        return {
          text: lastText || 'Réponse interrompue (outil sans identifiant).',
          searched,
          sourcesFound,
          totalToolUses,
        };
      }
      const toolResults = toolUses.map((tu) => ({
        type: 'tool_result',
        tool_use_id: tu.id,
        content:
          'La recherche web a été exécutée côté infrastructure Anthropic. Synthétise les informations utiles au dossier, cite les sources vérifiables et respecte le format de réponse obligatoire du prompt système.',
      }));
      conversation = [...conversation, { role: 'assistant', content: blocks }, { role: 'user', content: toolResults }];
      continue;
    }

    return { text: lastText || 'Fin de génération inattendue.', searched, sourcesFound, totalToolUses };
  }

  return {
    text: lastText || 'Limite d’échanges avec le modèle atteinte.',
    searched,
    sourcesFound,
    totalToolUses,
  };
}

router.get('/config', protect, authorize(...LEXIA_ALLOWED_ROLES), (req, res) => {
  const knowledgeDir = getKnowledgeDir();
  const isStaff = req.user.role === 'admin' || req.user.role === 'superadmin';
  res.json({
    envProvider: normalizeProvider(process.env.LEXIA_PROVIDER),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    ...(isStaff
      ? {
          knowledgeDir,
          knowledgeDirRelative: path.relative(path.join(__dirname, '..'), knowledgeDir),
        }
      : {}),
  });
});

router.post('/', protect, authorize(...LEXIA_ALLOWED_ROLES), async (req, res) => {
  try {
    const incoming = req.body?.messages;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ error: 'Le tableau messages est requis.' });
    }

    const trimmed = incoming
      .filter(
        (m) =>
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          m.content.length > 0 &&
          m.content.length <= 120000
      )
      .slice(-40)
      .map((m) => ({ role: m.role, content: m.content }));

    if (trimmed.length === 0) {
      return res.status(400).json({ error: 'Aucun message valide.' });
    }
    if (trimmed[0].role !== 'user') {
      return res.status(400).json({ error: 'Le premier message doit être un message utilisateur.' });
    }

    const requested = req.body?.provider != null ? normalizeProvider(req.body.provider) : null;
    const effective = resolveEffectiveProvider(req.body);

    if (effective === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error:
          'Mode Anthropic demandé mais **ANTHROPIC_API_KEY** est absente. Utilisez le mode **interne** ou **auto** sans clé, ou définissez la variable.',
        provider: 'anthropic',
      });
    }

    if (effective === 'internal') {
      const knowledgeDir = getKnowledgeDir();
      const { text, sources } = await searchAndCompose(trimmed, knowledgeDir);
      return res.json({
        text,
        searched: true,
        provider: 'internal',
        sources,
        resolvedProvider: 'internal',
        requestedProvider: requested || normalizeProvider(process.env.LEXIA_PROVIDER),
      });
    }

    const { text, searched, sourcesFound, totalToolUses } = await runAnthropicLexia(trimmed);
    return res.json({
      text,
      searched,
      sourcesFound,
      totalToolUses,
      provider: 'anthropic',
      resolvedProvider: 'anthropic',
      requestedProvider: requested || normalizeProvider(process.env.LEXIA_PROVIDER),
    });
  } catch (e) {
    if (e.code === 'MISSING_API_KEY') {
      return res.status(503).json({
        error:
          'Clé API Anthropic absente : définissez ANTHROPIC_API_KEY sur le serveur backend, ou utilisez le mode interne (LEXIA_PROVIDER=internal ou auto sans clé).',
      });
    }
    return res.status(502).json({
      error: typeof e.message === 'string' ? e.message : 'Erreur lors de l’appel au modèle.',
    });
  }
});

module.exports = router;

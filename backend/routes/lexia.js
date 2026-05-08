const express = require('express');
const path = require('path');
const { protect, authorize } = require('../middleware/auth');
const { LEXIA_SYSTEM_PROMPT } = require('../lib/lexiaSystemPrompt');
const { searchAndCompose, getKnowledgeDir } = require('../services/lexiaInternal');

const router = express.Router();
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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

const VALID_PROVIDERS = new Set(['auto', 'anthropic', 'gemini', 'internal']);
const TRUSTED_JURISPRUDENCE_HOSTS = [
  'legifrance.gouv.fr',
  'www.legifrance.gouv.fr',
  'conseil-etat.fr',
  'www.conseil-etat.fr',
  'arianeweb.conseil-etat.fr',
  'justice.pappers.fr',
  'www.courdecassation.fr',
  'courdecassation.fr',
  'eur-lex.europa.eu',
  'hudoc.echr.coe.int',
  'gisti.org',
  'www.gisti.org',
  'data.gouv.fr',
  'www.data.gouv.fr',
];

function isTrustedJurisprudenceUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || '').trim());
    const host = (u.hostname || '').toLowerCase();
    return TRUSTED_JURISPRUDENCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function hasDecisionNumber(referenceLine) {
  const s = String(referenceLine || '');
  return /(?:n[°o]\s*[:\-]?\s*[a-z0-9\-./]+)/i.test(s);
}

function hasDecisionDate(referenceLine) {
  const s = String(referenceLine || '');
  const hasNumericDate = /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/.test(s);
  const hasLongDate =
    /\b\d{1,2}\s+(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\s+\d{4}\b/i.test(
      s
    );
  return hasNumericDate || hasLongDate;
}

async function isLiveJurisprudenceUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const headRes = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (headRes.ok) return true;
    if (headRes.status !== 405 && headRes.status !== 403) return false;
  } catch {
    // fallback GET
  } finally {
    clearTimeout(timeoutId);
  }

  const controller2 = new AbortController();
  const timeoutId2 = setTimeout(() => controller2.abort(), 3500);
  try {
    const getRes = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller2.signal,
    });
    return getRes.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId2);
  }
}

async function validateAndSanitizeJurisprudenceBlocks(text) {
  const src = String(text || '');
  if (!src.trim()) {
    return { text: src, citationValidation: { total: 0, valid: 0, rejected: 0 } };
  }

  const lines = src.split('\n');
  let i = 0;
  let total = 0;
  let valid = 0;
  let rejected = 0;

  while (i < lines.length) {
    if (!/^\s*⚖️\s*Référence/i.test(lines[i])) {
      i += 1;
      continue;
    }

    total += 1;
    const blockStart = i;
    let blockEnd = i + 1;
    while (blockEnd < lines.length) {
      const line = lines[blockEnd];
      if (/^\s*⚖️\s*Référence/i.test(line)) break;
      if (/^\s*──\s*SECTION/i.test(line)) break;
      if (/^\s*━━━━━━━━/.test(line)) break;
      blockEnd += 1;
    }

    const block = lines.slice(blockStart, blockEnd);
    const referenceLine = block.find((l) => /^\s*⚖️\s*Référence/i.test(l)) || '';
    const sourceLine = block.find((l) => /^\s*🔗\s*Source/i.test(l)) || '';
    const urlMatch = sourceLine.match(/https?:\/\/[^\s)\]]+/i);
    const url = urlMatch ? urlMatch[0] : '';

    const numberOk = hasDecisionNumber(referenceLine);
    const dateOk = hasDecisionDate(referenceLine);
    const trustedDomainOk = Boolean(url) && isTrustedJurisprudenceUrl(url);
    const liveUrlOk = trustedDomainOk ? await isLiveJurisprudenceUrl(url) : false;
    const isValid = numberOk && dateOk && trustedDomainOk && liveUrlOk;

    if (isValid) {
      valid += 1;
      i = blockEnd;
      continue;
    }

    rejected += 1;
    const reasons = [];
    if (!numberOk) reasons.push('numero non detecte');
    if (!dateOk) reasons.push('date non detectee');
    if (!url) reasons.push('url absente');
    else if (!trustedDomainOk) reasons.push('domaine non fiable');
    else if (!liveUrlOk) reasons.push('url inaccessible');

    const reasonText = reasons.join(', ');
    lines[blockStart] = '⚖️ Référence   : [RÉFÉRENCE REJETÉE - non vérifiée automatiquement]';
    for (let k = blockStart + 1; k < blockEnd; k += 1) {
      if (/^\s*📋\s*Question/i.test(lines[k])) lines[k] = '📋 Question    : [Non affichée - référence invalide]';
      if (/^\s*🎯\s*Moyen/i.test(lines[k])) lines[k] = '🎯 Moyen       : [Non affiché - référence invalide]';
      if (/^\s*📌\s*Principe/i.test(lines[k])) lines[k] = '📌 Principe    : [Non affiché - référence invalide]';
      if (/^\s*✅\s*Applicable/i.test(lines[k])) lines[k] = '✅ Applicable  : [Non - référence invalide]';
      if (/^\s*🔗\s*Source/i.test(lines[k])) lines[k] = `🔗 Source      : [SOURCE INVALIDE - ${reasonText}]`;
    }

    i = blockEnd;
  }

  const note =
    total > 0
      ? `\n\n---\n\n### Validation automatique des references\n\n- References detectees: ${total}\n- References validees: ${valid}\n- References rejetees: ${rejected}\n`
      : '';

  return {
    text: `${lines.join('\n')}${note}`,
    citationValidation: { total, valid, rejected },
  };
}

function buildTemporalGuardrailPrompt() {
  const now = new Date();
  const isoNow = now.toISOString();
  const dateOnly = isoNow.slice(0, 10);
  return [
    '## RÈGLE TEMPORELLE STRICTE',
    `Date serveur courante (UTC) : ${dateOnly} (${isoNow})`,
    'Tu dois considérer cette date comme la seule référence temporelle valide pour "aujourd\'hui".',
    'Interdiction d\'inventer une autre année/date.',
    'Si l\'utilisateur te contredit sur la date, rappelle calmement la date serveur ci-dessus.',
    'Si une date locale est nécessaire, indique que seule la date UTC serveur est certaine.',
  ].join('\n');
}

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
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  if (base === 'auto') {
    if (hasAnthropicKey) return 'anthropic';
    if (hasGeminiKey) return 'gemini';
    return 'internal';
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

async function runAnthropicLexia(trimmed, temporalGuardrail) {
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
      system: `${LEXIA_SYSTEM_PROMPT}\n\n${temporalGuardrail}`,
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

async function runGeminiLexia(trimmed, temporalGuardrail) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error('MISSING_GEMINI_API_KEY');
    err.code = 'MISSING_GEMINI_API_KEY';
    throw err;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: `${LEXIA_SYSTEM_PROMPT}\n\n${temporalGuardrail}` }],
      },
      contents: trimmed.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const err = new Error(raw.slice(0, 500) || 'Reponse Gemini invalide');
    err.status = res.status;
    throw err;
  }

  if (!res.ok) {
    const msg = data?.error?.message || raw.slice(0, 800);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim()
    : '';

  return { text: text || '(Reponse vide)' };
}

router.get('/config', protect, authorize(...LEXIA_ALLOWED_ROLES), (req, res) => {
  const knowledgeDir = getKnowledgeDir();
  const isStaff = req.user.role === 'admin' || req.user.role === 'superadmin';
  res.json({
    envProvider: normalizeProvider(process.env.LEXIA_PROVIDER),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
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
    const temporalGuardrail = buildTemporalGuardrailPrompt();
    const serverNowIso = new Date().toISOString();

    if (effective === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error:
          'Mode Anthropic demandé mais **ANTHROPIC_API_KEY** est absente. Utilisez le mode **interne** ou **auto** sans clé, ou définissez la variable.',
        provider: 'anthropic',
      });
    }
    if (effective === 'gemini' && !process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error:
          'Mode Gemini demande mais **GEMINI_API_KEY** est absente. Utilisez le mode **interne** ou **auto** sans clé, ou definissez la variable.',
        provider: 'gemini',
      });
    }

    if (effective === 'internal') {
      const knowledgeDir = getKnowledgeDir();
      const { text, sources } = await searchAndCompose(trimmed, knowledgeDir);
      const { text: safeText, citationValidation } = await validateAndSanitizeJurisprudenceBlocks(text);
      return res.json({
        text: safeText,
        searched: true,
        provider: 'internal',
        sources,
        citationValidation,
        resolvedProvider: 'internal',
        requestedProvider: requested || normalizeProvider(process.env.LEXIA_PROVIDER),
        serverNow: serverNowIso,
      });
    }

    if (effective === 'gemini') {
      const { text } = await runGeminiLexia(trimmed, temporalGuardrail);
      const { text: safeText, citationValidation } = await validateAndSanitizeJurisprudenceBlocks(text);
      return res.json({
        text: safeText,
        searched: false,
        provider: 'gemini',
        citationValidation,
        resolvedProvider: 'gemini',
        requestedProvider: requested || normalizeProvider(process.env.LEXIA_PROVIDER),
        serverNow: serverNowIso,
      });
    }

    const { text, searched, sourcesFound, totalToolUses } = await runAnthropicLexia(
      trimmed,
      temporalGuardrail
    );
    const { text: safeText, citationValidation } = await validateAndSanitizeJurisprudenceBlocks(text);
    return res.json({
      text: safeText,
      searched,
      sourcesFound,
      totalToolUses,
      citationValidation,
      provider: 'anthropic',
      resolvedProvider: 'anthropic',
      requestedProvider: requested || normalizeProvider(process.env.LEXIA_PROVIDER),
      serverNow: serverNowIso,
    });
  } catch (e) {
    if (e.code === 'MISSING_API_KEY') {
      return res.status(503).json({
        error:
          'Clé API Anthropic absente : définissez ANTHROPIC_API_KEY sur le serveur backend, ou utilisez le mode interne (LEXIA_PROVIDER=internal ou auto sans clé).',
      });
    }
    if (e.code === 'MISSING_GEMINI_API_KEY') {
      return res.status(503).json({
        error:
          'Cle API Gemini absente : definissez GEMINI_API_KEY sur le serveur backend, ou utilisez le mode interne (LEXIA_PROVIDER=internal ou auto sans cle).',
      });
    }
    return res.status(502).json({
      error: typeof e.message === 'string' ? e.message : 'Erreur lors de l’appel au modèle.',
    });
  }
});

module.exports = router;

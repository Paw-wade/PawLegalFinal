const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const axios = require('axios');
const M = require('../tenantModels');
require('../models/DossierPawAiState');
const { assertUserCanAccessDossier } = require('../lib/dossierAccess');
const { extractPlainTextFromKnowledgeBuffer } = require('./lexiaInternal');
const { prependAttachmentsToLastUserMessage } = require('./lexiaThreadAttachments');
const { prepareLlmContext, mergeSystemPrompt } = require('./lexiaRetrieval');
const {
  runLexiaWithProvider,
  callAnthropic,
  callGemini,
  resolveLexiaProvider,
  buildLexiaChatSuccessPayload,
  isGeminiDisabled,
} = require('./lexiaProviders');
const BACKEND_ROOT = path.resolve(__dirname, '..');

const DEFAULT_DOSSIER_PROMPT =
  'Exploite et extrais toutes les informations dans les documents de ce dossier. Fais une fiche informative complète et chronologique.';

const DOSSIER_DOCUMENT_AGENT_SYSTEM = `Tu es **Paw AI — Agent documents de dossier** pour Ada Papers.

## Mission
- Analyser **uniquement** le texte extrait des pièces du dossier fourni en contexte.
- Produire des synthèses factuelles, structurées et chronologiques lorsque cela est pertinent.
- Signaler les pièces illisibles, manquantes ou ambiguës.

## Règles
- Ne pas inventer de faits absents des documents.
- Distinguer clairement ce qui est **dans les pièces** de vos **hypothèses**.
- Ne pas donner de conseil juridique stratégique sauf si le prompt utilisateur le demande explicitement.
- Répondre en français, en markdown lisible (titres, listes, tableaux si utile).`;

const MAX_DOCS_PER_DOSSIER = 50;
const MAX_CHARS_PER_FILE = 120000;
const MAX_CORPUS_CHARS = 450000;
const MAX_RUNS_STORED = 30;

function extFromName(name) {
  const base = String(name || '').trim();
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i).toLowerCase() : '';
}

async function loadDocumentBuffer(document) {
  const url = String(document.cheminFichier || '').trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: 20 * 1024 * 1024,
      maxBodyLength: 20 * 1024 * 1024,
    });
    return Buffer.from(res.data);
  }
  const candidates = [
    path.isAbsolute(url) ? url : path.join(BACKEND_ROOT, url),
    path.join(BACKEND_ROOT, 'uploads', path.basename(url)),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return await fsp.readFile(p);
      }
    } catch {
      /* next */
    }
  }
  return null;
}

function fingerprintsMatch(stored, documents) {
  if (!stored?.length && !documents.length) return !stored?.length;
  if (stored.length !== documents.length) return false;
  const map = new Map(stored.map((f) => [String(f.documentId), new Date(f.updatedAt).getTime()]));
  for (const doc of documents) {
    const id = String(doc._id);
    const t = new Date(doc.updatedAt || doc.createdAt || 0).getTime();
    if (map.get(id) !== t) return false;
  }
  return true;
}

async function buildDossierCorpus(dossierId) {
  const documents = await M.Document.find({ dossierId })
    .sort({ createdAt: 1 })
    .limit(MAX_DOCS_PER_DOSSIER)
    .lean();

  const blocks = [];
  const fingerprints = [];
  let totalChars = 0;
  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const doc of documents) {
    const title = String(doc.nom || doc.nomFichier || 'Document').trim();
    const updatedAt = doc.updatedAt || doc.createdAt || new Date();
    let body = '';
    let note = '';

    try {
      const buffer = await loadDocumentBuffer(doc);
      if (!buffer || buffer.length === 0) {
        note = 'Fichier inaccessible ou vide.';
        filesSkipped += 1;
      } else {
        const ext = extFromName(title) || extFromName(doc.nomFichier) || extFromName(doc.cheminFichier);
        body = await extractPlainTextFromKnowledgeBuffer(buffer, ext);
        if (body.length > MAX_CHARS_PER_FILE) {
          body = body.slice(0, MAX_CHARS_PER_FILE);
        }
        if (!body.trim()) {
          note = 'Aucun texte exploitable extrait.';
          filesSkipped += 1;
        } else {
          filesProcessed += 1;
        }
      }
    } catch (e) {
      note = `Erreur lecture : ${e.message || 'inconnue'}`;
      filesSkipped += 1;
    }

    const section = note
      ? `#### ${title}\n\n_${note}_\n`
      : `#### ${title}\n\n${body.trim()}\n`;

    if (totalChars + section.length > MAX_CORPUS_CHARS) break;
    blocks.push(section);
    totalChars += section.length;
    fingerprints.push({
      documentId: String(doc._id),
      updatedAt,
      charCount: body.length,
      fileName: title,
    });
  }

  const corpusText = blocks.length
    ? ['## Corpus documentaire du dossier', '', ...blocks].join('\n')
    : '';

  return {
    corpusText,
    fingerprints,
    corpusMeta: {
      documentCount: documents.length,
      totalChars,
      filesProcessed,
      filesSkipped,
    },
  };
}

function buildCorpusAppendix(corpusText) {
  const t = String(corpusText || '').trim();
  if (!t) {
    return [
      '### Documents du dossier',
      'Aucun texte n’a pu être extrait des pièces de ce dossier.',
      'Indiquez-le à l’utilisateur et listez les limites (fichiers manquants, scans non OCR, etc.).',
    ].join('\n');
  }
  return [
    '### Documents du dossier (texte extrait — source obligatoire)',
    'Tu dois fonder ta réponse sur ce corpus. Cite les pièces par leur titre lorsque tu t’y réfères.',
    '',
    t,
  ].join('\n');
}

async function ensureCorpus(dossierId, { force = false } = {}) {
  let state = await M.DossierPawAiState.findOne({ dossierId });
  if (!state) {
    state = await M.DossierPawAiState.create({ dossierId, extractionStatus: 'idle' });
  }

  const documents = await M.Document.find({ dossierId })
    .select('_id updatedAt createdAt')
    .sort({ createdAt: 1 })
    .limit(MAX_DOCS_PER_DOSSIER)
    .lean();

  const upToDate =
    state.extractionStatus === 'ready' &&
    !force &&
    fingerprintsMatch(state.documentFingerprints, documents);

  if (upToDate) return state;

  state.extractionStatus = 'running';
  state.extractionError = '';
  await state.save();

  try {
    const built = await buildDossierCorpus(dossierId);
    state.corpusText = built.corpusText;
    state.documentFingerprints = built.fingerprints;
    state.corpusMeta = built.corpusMeta;
    state.extractedAt = new Date();
    state.extractionStatus = 'ready';
    state.extractionError = '';
    await state.save();
    return state;
  } catch (e) {
    state.extractionStatus = 'error';
    state.extractionError = e.message || 'Erreur extraction';
    await state.save();
    throw e;
  }
}

function serializeState(state) {
  if (!state) return null;
  const o = state.toObject ? state.toObject() : state;
  return {
    dossierId: String(o.dossierId),
    extractionStatus: o.extractionStatus,
    extractionError: o.extractionError || '',
    extractedAt: o.extractedAt,
    corpusMeta: o.corpusMeta || {},
    runs: (o.runs || []).map((r) => ({
      id: r.id,
      prompt: r.prompt,
      isDefaultPrompt: Boolean(r.isDefaultPrompt),
      outputMarkdown: r.outputMarkdown,
      provider: r.provider,
      resolvedProvider: r.resolvedProvider,
      createdAt: r.createdAt,
    })),
  };
}

async function runDossierAgent({ req, dossierId, prompt, isDefaultPrompt, provider }) {
  const trimmedPrompt = String(prompt || '').trim();
  if (!trimmedPrompt) {
    const err = new Error('Un prompt est requis.');
    err.status = 400;
    throw err;
  }

  await assertUserCanAccessDossier(req, dossierId);
  const state = await ensureCorpus(dossierId);

  const appendix = buildCorpusAppendix(state.corpusText);
  const messages = [{ role: 'user', content: trimmedPrompt }];

  const useFullPawAi = !isDefaultPrompt;
  let result;

  if (useFullPawAi) {
    const resolved = provider && provider !== 'default' ? provider : 'auto';
    result = await runLexiaWithProvider(messages, resolved, {
      threadAttachmentAppendix: appendix,
      customSystemPrompt: DOSSIER_DOCUMENT_AGENT_SYSTEM,
    });
  } else {
    const internalMessages = prependAttachmentsToLastUserMessage(messages, appendix);
    const retrievalCtx = {
      systemAppendix: '',
      sources: [],
      searched: false,
      totalToolUses: 0,
      systemPromptOverride: DOSSIER_DOCUMENT_AGENT_SYSTEM,
    };
    const resolved = resolveLexiaProvider(provider || 'auto');
    if (resolved === 'gemini' && !isGeminiDisabled() && process.env.GEMINI_API_KEY) {
      const out = await callGemini(internalMessages, retrievalCtx);
      result = {
        text: out.text,
        sources: out.retrievalCtx?.sources || [],
        searched: false,
        totalToolUses: 0,
        provider: 'gemini',
        resolvedProvider: 'gemini',
      };
    } else {
      const out = await callAnthropic(internalMessages, retrievalCtx);
      result = {
        text: out.text,
        sources: out.retrievalCtx?.sources || [],
        searched: false,
        totalToolUses: 0,
        provider: 'anthropic',
        resolvedProvider: 'anthropic',
      };
    }
  }

  const runId = crypto.randomUUID();
  const run = {
    id: runId,
    prompt: trimmedPrompt,
    isDefaultPrompt: Boolean(isDefaultPrompt),
    outputMarkdown: String(result.text || '').trim(),
    provider: result.provider || '',
    resolvedProvider: result.resolvedProvider || result.provider || '',
    sources: result.sources || [],
    createdBy: req.user.id,
    createdAt: new Date(),
  };

  state.runs = [run, ...(state.runs || [])].slice(0, MAX_RUNS_STORED);
  await state.save();

  return {
    run,
    state: serializeState(state),
    ...buildLexiaChatSuccessPayload({
      text: run.outputMarkdown,
      sources: run.sources,
      searched: Boolean(result.searched),
      totalToolUses: result.totalToolUses,
      provider: run.provider,
      resolvedProvider: run.resolvedProvider,
    }),
  };
}

module.exports = {
  DEFAULT_DOSSIER_PROMPT,
  DOSSIER_DOCUMENT_AGENT_SYSTEM,
  ensureCorpus,
  runDossierAgent,
  serializeState,
  buildCorpusAppendix,
};

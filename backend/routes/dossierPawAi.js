const express = require('express');
const { protect } = require('../middleware/auth');
const {
  DEFAULT_DOSSIER_PROMPT,
  ensureCorpus,
  runDossierAgent,
  serializeState,
} = require('../services/dossierPawAi');
const { assertUserCanAccessDossier } = require('../lib/dossierAccess');
const M = require('../tenantModels');
require('../models/DossierPawAiState');

const router = express.Router({ mergeParams: true });

router.use(protect);

function dossierIdParam(req) {
  return String(req.params.id || req.params.dossierId || '').trim();
}

router.get('/state', async (req, res) => {
  try {
    const dossierId = dossierIdParam(req);
    await assertUserCanAccessDossier(req, dossierId);
    let state = await M.DossierPawAiState.findOne({ dossierId });
    if (!state) {
      return res.json({
        success: true,
        state: {
          dossierId,
          extractionStatus: 'idle',
          extractionError: '',
          extractedAt: null,
          corpusMeta: {},
          runs: [],
        },
        defaultPrompt: DEFAULT_DOSSIER_PROMPT,
      });
    }
    return res.json({
      success: true,
      state: serializeState(state),
      defaultPrompt: DEFAULT_DOSSIER_PROMPT,
    });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ success: false, message: e.message || 'Erreur serveur' });
  }
});

router.post('/extract', async (req, res) => {
  try {
    const dossierId = dossierIdParam(req);
    await assertUserCanAccessDossier(req, dossierId);
    const state = await ensureCorpus(dossierId, { force: true });
    return res.json({ success: true, state: serializeState(state) });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ success: false, message: e.message || 'Erreur serveur' });
  }
});

router.post('/run', async (req, res) => {
  try {
    const dossierId = dossierIdParam(req);
    const prompt = String(req.body?.prompt || '').trim();
    const isDefaultPrompt = Boolean(req.body?.isDefaultPrompt);
    const provider = req.body?.provider;

    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Un prompt est requis.' });
    }

    const payload = await runDossierAgent({
      req,
      dossierId,
      prompt,
      isDefaultPrompt,
      provider,
    });

    return res.status(201).json({
      success: true,
      run: payload.run,
      state: payload.state,
      text: payload.text,
      sources: payload.sources,
      provider: payload.provider,
      resolvedProvider: payload.resolvedProvider,
    });
  } catch (e) {
    const status = e.status || 500;
    console.error('[dossier-paw-ai] POST /run:', e.message || e);
    return res.status(status).json({ success: false, message: e.message || 'Erreur serveur' });
  }
});

module.exports = router;

const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { searchKnowledge, getKnowledgeDir } = require('../services/lexiaInternal');

const router = express.Router();

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

function readFilters(payload) {
  const src = payload || {};
  return {
    juridiction: src.juridiction || '',
    contentType: src.contentType || '',
    dateFrom: src.dateFrom || '',
    dateTo: src.dateTo || '',
  };
}

router.get('/config', protect, authorize(...LEXIA_ALLOWED_ROLES), (_req, res) => {
  const knowledgeDir = getKnowledgeDir();
  res.json({
    success: true,
    engine: 'paw-search-internal',
    knowledgeDir,
    supportedExtensions: ['xml', 'md', 'txt'],
    filters: ['juridiction', 'contentType', 'dateFrom', 'dateTo'],
  });
});

router.post('/', protect, authorize(...LEXIA_ALLOWED_ROLES), async (req, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!query && messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'query ou messages est requis.',
      });
    }

    const page = req.body?.page;
    const limit = req.body?.limit;
    const filters = readFilters(req.body?.filters);

    const result = await searchKnowledge({
      queryText: query,
      messages,
      filters,
      page,
      limit,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: 'Erreur paw-search',
      error: e?.message || 'Erreur inconnue',
    });
  }
});

module.exports = router;


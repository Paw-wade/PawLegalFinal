'use strict';

const express = require('express');
const router = express.Router();
const piste = require('../services/pisteService');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/piste/ping
router.get('/ping', async (req, res) => {
  try {
    const data = await piste.ping();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/piste/legifrance/search
// body: { query, nature?, fond?, pageNumber?, pageSize? }
router.post('/legifrance/search', async (req, res) => {
  try {
    const data = await piste.legifrance.search(req.body);
    res.json(data);
  } catch (err) {
    console.error('[PISTE/Légifrance]', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// POST /api/piste/legifrance/article
// body: { textId }
router.post('/legifrance/article', async (req, res) => {
  try {
    const data = await piste.legifrance.getArticle(req.body.textId);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// POST /api/piste/legifrance/code
// body: { textId }
router.post('/legifrance/code', async (req, res) => {
  try {
    const data = await piste.legifrance.getCode(req.body.textId);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// POST /api/piste/legifrance/loi
// body: { textId }
router.post('/legifrance/loi', async (req, res) => {
  try {
    const data = await piste.legifrance.getLoi(req.body.textId);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// GET /api/piste/judilibre/search?query=...&chamber=...&page=0&page_size=10
router.get('/judilibre/search', async (req, res) => {
  try {
    const { query, chamber, theme, type, date_start, date_end, page, page_size } = req.query;
    const data = await piste.judilibre.search({
      query,
      chamber,
      theme,
      type,
      date_start,
      date_end,
      page: page ? parseInt(page, 10) : 0,
      page_size: page_size ? parseInt(page_size, 10) : 10,
    });
    res.json(data);
  } catch (err) {
    console.error('[PISTE/JUDILIBRE]', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// GET /api/piste/judilibre/decision?id=...
router.get('/judilibre/decision', async (req, res) => {
  try {
    const data = await piste.judilibre.getDecision(req.query.id);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// GET /api/piste/judilibre/taxonomy?target=chamber
router.get('/judilibre/taxonomy', async (req, res) => {
  try {
    const data = await piste.judilibre.taxonomy(req.query.target);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

module.exports = router;

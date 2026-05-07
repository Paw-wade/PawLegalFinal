const express = require('express');
const router = express.Router();
const { searchDecisions, getDecision, scanDecisions } = require('../lib/judilibre');

router.get('/search', async (req, res) => {
  try {
    const { query, page, pageSize, chamber } = req.query;
    const result = await searchDecisions(query, { page, pageSize, chamber });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/decision/:id', async (req, res) => {
  try {
    const result = await getDecision(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/scan', async (req, res) => {
  try {
    const { page, pageSize, date_start, date_end } = req.query;
    const result = await scanDecisions({ page, pageSize, date_start, date_end });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
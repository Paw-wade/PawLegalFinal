const express = require('express');
const router = express.Router();
const { rechercher, getArticle } = require('../lib/legifrance');

router.post('/search', async (req, res) => {
  try {
    const { query, fond } = req.body;
    const result = await rechercher(query, fond);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/article', async (req, res) => {
  try {
    const { id } = req.body;
    const result = await getArticle(id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
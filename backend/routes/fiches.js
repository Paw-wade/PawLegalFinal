const express = require('express');
const router = express.Router();
const { getSchema, listTypes } = require('../fiches/registry');

// @route GET /api/fiches/types - liste des types de fiches disponibles
router.get('/types', (req, res) => {
  res.json({ success: true, types: listTypes() });
});

// @route GET /api/fiches/schema/:type - schéma d'une fiche (pilote le formulaire)
router.get('/schema/:type', (req, res) => {
  const schema = getSchema(req.params.type);
  if (!schema) return res.status(404).json({ success: false, message: 'Type de fiche inconnu.' });
  res.json({ success: true, schema });
});

module.exports = router;

'use strict';
const express = require('express');
const router = express.Router();
const AutomationRule = require('../models/AutomationRule');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin', 'superadmin'));

router.get('/', async (req, res) => {
  try {
    const rules = await AutomationRule.find().sort({ statutDeclencheur: 1, createdAt: -1 }).lean();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { statutDeclencheur, actions, actif } = req.body;
    if (!statutDeclencheur || !Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ message: 'statutDeclencheur et au moins une action sont requis.' });
    }
    const rule = await AutomationRule.create({
      statutDeclencheur: statutDeclencheur.trim(),
      actions,
      actif: actif !== false,
      createdBy: req.user._id,
    });
    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { statutDeclencheur, actions, actif } = req.body;
    const update = {};
    if (statutDeclencheur !== undefined) update.statutDeclencheur = statutDeclencheur.trim();
    if (actions !== undefined) update.actions = actions;
    if (actif !== undefined) update.actif = actif;
    const rule = await AutomationRule.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!rule) return res.status(404).json({ message: 'Regle introuvable.' });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const rule = await AutomationRule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ message: 'Regle introuvable.' });
    res.json({ message: 'Regle supprimee.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

module.exports = router;

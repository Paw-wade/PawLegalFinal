const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const DahiraMembre = require('../models/DahiraMembre');
const { protect, authorize } = require('../middleware/auth');

const COMMISSIONS_VALIDES = [
  'Culte',
  'Enseignements et soutien scolaire',
  'Organisation',
  'Communication et audiovisuel',
  'Finance',
  'Sociale',
  'Kourel',
  'Secretariat general',
];

// POST /api/dahira/membres — soumission publique
router.post(
  '/membres',
  [
    body('nom').trim().notEmpty().withMessage('Le nom est requis').isLength({ max: 100 }),
    body('prenom').trim().notEmpty().withMessage('Le prenom est requis').isLength({ max: 100 }),
    body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
    body('telephone').optional().trim().isLength({ max: 30 }),
    body('adresse').optional().trim().isLength({ max: 300 }),
    body('situationProfessionnelle').optional().trim().isLength({ max: 200 }),
    body('categorieMembre')
      .isIn(['actif', 'adherent', 'sympathisant'])
      .withMessage('Categorie invalide'),
    body('statutAnciennete')
      .isIn(['nouveau', '1_3_ans', 'plus_3_ans'])
      .withMessage('Statut invalide'),
    body('dateAdhesionApprox').optional().trim().isLength({ max: 10 }),
    body('commissions')
      .optional()
      .isArray({ max: 8 })
      .withMessage('Maximum 8 commissions'),
    body('commissions.*')
      .optional()
      .isIn(COMMISSIONS_VALIDES)
      .withMessage('Commission invalide'),
    body('competences').optional().trim().isLength({ max: 1000 }),
    body('disponibilite').optional().trim().isLength({ max: 300 }),
    body('engagementCommission')
      .isBoolean()
      .withMessage("L'engagement de commission est requis")
      .custom((v) => v === true)
      .withMessage("L'engagement doit etre accepte"),
    body('consentementDonnees')
      .isBoolean()
      .withMessage('Le consentement est requis')
      .custom((v) => v === true)
      .withMessage('Le consentement doit etre accepte'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const membre = await DahiraMembre.create(req.body);
      res.status(201).json({
        success: true,
        message: 'Votre fiche de recensement a ete enregistree. Merci.',
        data: { id: membre._id },
      });
    } catch (err) {
      console.error('dahira POST /membres:', err.message);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// GET /api/dahira/membres — liste admin
router.get('/membres', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const membres = await DahiraMembre.find().sort({ createdAt: -1 });
    res.json({ success: true, count: membres.length, data: membres });
  } catch (err) {
    console.error('dahira GET /membres:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// DELETE /api/dahira/membres/:id — suppression admin
router.delete('/membres/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const membre = await DahiraMembre.findByIdAndDelete(req.params.id);
    if (!membre) return res.status(404).json({ success: false, message: 'Membre non trouve' });
    res.json({ success: true, message: 'Fiche supprimee' });
  } catch (err) {
    console.error('dahira DELETE /membres/:id:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;

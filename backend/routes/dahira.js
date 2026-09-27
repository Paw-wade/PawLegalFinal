const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const DahiraMembre = require('../models/DahiraMembre');
const DahiraConfig = require('../models/DahiraConfig');
const { protect, authorize } = require('../middleware/auth');

// Upload multer (disque temporaire)
const tmpDir = path.join(require('os').tmpdir(), 'dahira-uploads');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpDir),
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'reglement').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const uploadPdf = multer({
  storage: uploadStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Seuls les fichiers PDF sont acceptes'));
  },
}).single('pdf');

// Cloudinary (optionnel, meme pattern que documents.js)
let cloudinary = null;
try {
  const pkg = require('cloudinary');
  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    cloudinary = pkg.v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
} catch (_) {}

async function uploadToCloudinary(localPath, originalName) {
  if (!cloudinary) return null;
  const baseName = path.basename(originalName, path.extname(originalName));
  const result = await cloudinary.uploader.upload(localPath, {
    resource_type: 'raw',
    folder: 'pawlegal/dahira',
    public_id: `reglement-interieur-${baseName}`,
    overwrite: true,
  });
  return result?.secure_url || null;
}

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
    body('acceptationReglement')
      .isBoolean()
      .withMessage("L'acceptation du reglement est requise")
      .custom((v) => v === true)
      .withMessage('Vous devez accepter le reglement interieur'),
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

// GET /api/dahira/membres/:id — fiche publique (champs non sensibles)
router.get('/membres/:id', async (req, res) => {
  try {
    const membre = await DahiraMembre.findById(req.params.id).select(
      'photo nom prenom sexe categorieMembre statutAnciennete dateAdhesionApprox createdAt'
    );
    if (!membre) return res.status(404).json({ success: false, message: 'Membre non trouve' });
    res.json({ success: true, data: membre });
  } catch (err) {
    console.error('dahira GET /membres/:id:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

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

// GET /api/dahira/reglement — public, retourne l'URL du reglement interieur
router.get('/reglement', async (req, res) => {
  try {
    const cfg = await DahiraConfig.findOne();
    res.json({ success: true, data: { url: cfg?.reglementUrl || '', nom: cfg?.reglementNom || '' } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/dahira/reglement — admin, upload PDF
router.post('/reglement', protect, authorize('admin', 'superadmin'), (req, res) => {
  uploadPdf(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });

    try {
      let url = '';
      const cloudUrl = await uploadToCloudinary(req.file.path, req.file.originalname);
      if (cloudUrl) {
        url = cloudUrl;
      } else {
        // Fallback : on garde l'URL vide et on informe (pas de stockage local public ici)
        fs.unlink(req.file.path, () => {});
        return res.status(500).json({ success: false, message: 'Cloudinary non configure' });
      }
      fs.unlink(req.file.path, () => {});

      const cfg = await DahiraConfig.findOneAndUpdate(
        {},
        { reglementUrl: url, reglementNom: req.file.originalname },
        { upsert: true, new: true }
      );
      res.json({ success: true, data: { url: cfg.reglementUrl, nom: cfg.reglementNom } });
    } catch (e) {
      console.error('dahira POST /reglement:', e.message);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  });
});

// DELETE /api/dahira/reglement — admin, supprime le reglement
router.delete('/reglement', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    await DahiraConfig.findOneAndUpdate({}, { reglementUrl: '', reglementNom: '' }, { upsert: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;

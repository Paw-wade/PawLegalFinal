const express = require('express');
const Cabinet = require('../models/Cabinet');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const {
  makeUniqueSlug,
  buildCabinetS3Prefix,
  slugifyCabinetName,
  invalidateCabinetCache,
} = require('../utils/cabinetResolver');
const { ensureS3PrefixExists } = require('../utils/s3DocumentStorage');

const router = express.Router();

router.use(protect);
router.use(authorize('superadmin'));

// GET /api/cabinets
router.get('/', async (req, res) => {
  try {
    const cabinets = await Cabinet.find({}).sort({ name: 1 }).lean();
    return res.json({ success: true, count: cabinets.length, cabinets });
  } catch (error) {
    console.error('GET /api/cabinets:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /api/cabinets/:id
router.get('/:id', async (req, res) => {
  try {
    const cabinet = await Cabinet.findById(req.params.id).lean();
    if (!cabinet) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    return res.json({ success: true, cabinet });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/cabinets — crée le cabinet + préfixe S3 Cabinet-{slug}/
router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Le nom du cabinet est requis' });
    }

    const requestedSlug = String(req.body?.slug || '').trim();
    const slug = requestedSlug
      ? slugifyCabinetName(requestedSlug)
      : await makeUniqueSlug(name);
    const s3Prefix = buildCabinetS3Prefix(slug);

    const existing = await Cabinet.findOne({ slug }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Un cabinet avec ce slug existe déjà',
        cabinet: existing,
      });
    }

    await ensureS3PrefixExists(s3Prefix);

    const cabinet = await Cabinet.create({
      name,
      slug,
      s3Prefix,
      active: true,
      createdBy: req.user.id || req.user._id,
    });

    invalidateCabinetCache();

    return res.status(201).json({
      success: true,
      message: `Cabinet créé. Documents S3: ${s3Prefix}documents/`,
      cabinet,
    });
  } catch (error) {
    console.error('POST /api/cabinets:', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur' });
  }
});

// PATCH /api/cabinets/:id
router.patch('/:id', async (req, res) => {
  try {
    const cabinet = await Cabinet.findById(req.params.id);
    if (!cabinet) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }

    if (req.body?.name !== undefined) {
      cabinet.name = String(req.body.name).trim();
    }
    if (req.body?.active !== undefined) {
      cabinet.active = !!req.body.active;
    }

    await cabinet.save();
    invalidateCabinetCache();

    return res.json({ success: true, cabinet });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/cabinets/:id/users/:userId — rattacher un utilisateur au cabinet
router.post('/:id/users/:userId', async (req, res) => {
  try {
    const cabinet = await Cabinet.findById(req.params.id).lean();
    if (!cabinet) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    user.cabinetId = cabinet._id;
    await user.save();

    return res.json({
      success: true,
      message: `Utilisateur rattaché au cabinet ${cabinet.name}`,
      user: { _id: user._id, email: user.email, cabinetId: user.cabinetId },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;

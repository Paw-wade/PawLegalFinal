const express = require('express');
const { body, validationResult, query } = require('express-validator');
const CmsContent = require('../models/CmsContent');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Cache en mémoire très simple pour les valeurs de texte
const contentCache = new Map();

const makeCacheKey = (key, locale) => `${locale || 'fr-FR'}::${key}`;

const clearCacheForKey = (key, locale) => {
  if (locale) {
    contentCache.delete(makeCacheKey(key, locale));
  } else {
    // Supprimer toutes les locales pour cette clé
    for (const cacheKey of contentCache.keys()) {
      if (cacheKey.endsWith(`::${key}`)) {
        contentCache.delete(cacheKey);
      }
    }
  }
};

// @route   GET /api/content/value
// @desc    Récupérer la valeur d'une clé de contenu (lecture publique)
// @access  Public
router.get(
  '/value',
  [
    query('key').notEmpty().withMessage('La clé est requise'),
    query('locale').optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array(),
        });
      }

      const { key, locale = 'fr-FR' } = req.query;
      const cacheKey = makeCacheKey(key, locale);

      if (contentCache.has(cacheKey)) {
        return res.json({
          success: true,
          key,
          locale,
          value: contentCache.get(cacheKey),
          fromCache: true,
        });
      }

      const entry = await CmsContent.findOne({
        key,
        locale,
        isActive: true,
        status: 'published', // Seuls les contenus publiés sont accessibles publiquement
      })
        .sort({ version: -1, updatedAt: -1 })
        .lean();

      if (!entry) {
        return res.status(404).json({
          success: false,
          message: 'Clé non trouvée',
          key,
          locale,
        });
      }

      contentCache.set(cacheKey, entry.value);

      res.json({
        success: true,
        key,
        locale,
        value: entry.value,
      });
    } catch (error) {
      console.error('Erreur lors de la récupération du contenu CMS:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message,
      });
    }
  }
);

// Toutes les routes suivantes nécessitent une authentification admin
router.use(protect, authorize('admin', 'superadmin'));

// @route   GET /api/content
// @desc    Lister les entrées CMS
// @access  Private (admin)
router.get('/', async (req, res) => {
  try {
    const { page, section, search, locale = 'fr-FR', limit = 100, skip = 0 } = req.query;

    const filter = {
      locale,
    };

    if (page) filter.page = page;
    if (section) filter.section = section;
    if (search) {
      filter.$or = [
        { key: new RegExp(search, 'i') },
        { value: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
      ];
    }

    const entries = await CmsContent.find(filter)
      .sort({ updatedAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));

    const total = await CmsContent.countDocuments(filter);

    res.json({
      success: true,
      total,
      entries,
    });
  } catch (error) {
    console.error('Erreur lors de la liste des contenus CMS:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message,
    });
  }
});

// @route   POST /api/content
// @desc    Créer une nouvelle entrée CMS ou un override
// @access  Private (admin)
router.post(
  '/',
  [
    body('key').trim().notEmpty().withMessage('La clé est requise'),
    body('value').trim().notEmpty().withMessage('La valeur est requise'),
    body('locale').optional().isString(),
    body('page').optional().isString(),
    body('section').optional().isString(),
    body('description').optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array(),
        });
      }

      const { key, value, locale = 'fr-FR', page, section, description } = req.body;

      // Récupérer la version actuelle pour cette clé/locale
      const last = await CmsContent.findOne({ key, locale })
        .sort({ version: -1 })
        .lean();

      const version = last ? last.version + 1 : 1;

      const entry = await CmsContent.create({
        key,
        value,
        locale,
        page,
        section,
        description,
        version,
        isActive: true,
        status: 'draft',
        updatedBy: req.user ? req.user._id : undefined,
        changeHistory: [{
          version,
          value,
          description,
          status: 'draft',
          updatedBy: req.user ? req.user._id : undefined,
          changeType: 'created',
        }],
      });

      clearCacheForKey(key, locale);

      res.status(201).json({
        success: true,
        message: 'Contenu créé avec succès',
        entry,
      });
    } catch (error) {
      console.error('Erreur lors de la création du contenu CMS:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message,
      });
    }
  }
);

// @route   PUT /api/content/:id
// @desc    Mettre à jour une entrée CMS (crée une nouvelle version)
// @access  Private (admin)
router.put(
  '/:id',
  [
    body('value').trim().notEmpty().withMessage('La valeur est requise'),
    body('description').optional().isString(),
    body('page').optional().isString(),
    body('section').optional().isString(),
    body('isActive').optional().isBoolean(),
    body('status').optional().isIn(['draft', 'published', 'archived']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Erreurs de validation',
          errors: errors.array(),
        });
      }

      const existing = await CmsContent.findById(req.params.id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Entrée CMS non trouvée',
        });
      }

      const { value, description, page, section, isActive, status } = req.body;

      // Créer une nouvelle version pour garder l'historique
      const newVersion = existing.version + 1;
      
      // Détecter le type de changement
      let changeType = 'updated';
      if (status && status !== existing.status) {
        changeType = status === 'published' ? 'published' : status === 'archived' ? 'archived' : 'status_changed';
      }

      // Ajouter à l'historique
      if (!existing.changeHistory) {
        existing.changeHistory = [];
      }
      existing.changeHistory.push({
        version: existing.version,
        value: existing.value,
        description: existing.description,
        status: existing.status,
        updatedBy: existing.updatedBy,
        changeType: 'updated',
        updatedAt: existing.updatedAt || new Date(),
      });

      existing.value = value;
      if (description !== undefined) existing.description = description;
      if (page !== undefined) existing.page = page;
      if (section !== undefined) existing.section = section;
      if (isActive !== undefined) existing.isActive = isActive;
      if (status !== undefined) existing.status = status;
      existing.version = newVersion;
      existing.updatedBy = req.user ? req.user._id : undefined;

      await existing.save();

      clearCacheForKey(existing.key, existing.locale);

      res.json({
        success: true,
        message: 'Contenu mis à jour avec succès',
        entry: existing,
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du contenu CMS:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message,
      });
    }
  }
);

// @route   DELETE /api/content/:id
// @desc    Désactiver une entrée CMS
// @access  Private (admin)
router.delete('/:id', async (req, res) => {
  try {
    const existing = await CmsContent.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Entrée CMS non trouvée',
      });
    }

    // Ajouter à l'historique
    if (!existing.changeHistory) {
      existing.changeHistory = [];
    }
    existing.changeHistory.push({
      version: existing.version,
      value: existing.value,
      description: existing.description,
      status: existing.status,
      updatedBy: existing.updatedBy,
      changeType: 'archived',
      updatedAt: new Date(),
    });

    existing.isActive = false;
    existing.status = 'archived';
    existing.updatedBy = req.user ? req.user._id : undefined;
    await existing.save();

    clearCacheForKey(existing.key, existing.locale);

    res.json({
      success: true,
      message: 'Contenu archivé avec succès',
    });
  } catch (error) {
    console.error('Erreur lors de l\'archivage du contenu CMS:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message,
    });
  }
});

// @route   PATCH /api/content/:id/publish
// @desc    Publier un contenu
// @access  Private (admin)
router.patch('/:id/publish', async (req, res) => {
  try {
    const existing = await CmsContent.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Entrée CMS non trouvée',
      });
    }

    // Ajouter à l'historique
    if (!existing.changeHistory) {
      existing.changeHistory = [];
    }
    existing.changeHistory.push({
      version: existing.version,
      value: existing.value,
      description: existing.description,
      status: existing.status,
      updatedBy: existing.updatedBy,
      changeType: 'published',
      updatedAt: new Date(),
    });

    existing.status = 'published';
    existing.isActive = true;
    existing.updatedBy = req.user ? req.user._id : undefined;
    await existing.save();

    clearCacheForKey(existing.key, existing.locale);

    res.json({
      success: true,
      message: 'Contenu publié avec succès',
      entry: existing,
    });
  } catch (error) {
    console.error('Erreur lors de la publication du contenu CMS:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message,
    });
  }
});

// @route   PATCH /api/content/:id/unpublish
// @desc    Dépublier un contenu (retour en brouillon)
// @access  Private (admin)
router.patch('/:id/unpublish', async (req, res) => {
  try {
    const existing = await CmsContent.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Entrée CMS non trouvée',
      });
    }

    // Ajouter à l'historique
    if (!existing.changeHistory) {
      existing.changeHistory = [];
    }
    existing.changeHistory.push({
      version: existing.version,
      value: existing.value,
      description: existing.description,
      status: existing.status,
      updatedBy: existing.updatedBy,
      changeType: 'status_changed',
      updatedAt: new Date(),
    });

    existing.status = 'draft';
    existing.updatedBy = req.user ? req.user._id : undefined;
    await existing.save();

    clearCacheForKey(existing.key, existing.locale);

    res.json({
      success: true,
      message: 'Contenu dépublié avec succès',
      entry: existing,
    });
  } catch (error) {
    console.error('Erreur lors de la dépublication du contenu CMS:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message,
    });
  }
});

// @route   GET /api/content/:id/history
// @desc    Récupérer l'historique des modifications d'un contenu
// @access  Private (admin)
router.get('/:id/history', async (req, res) => {
  try {
    const entry = await CmsContent.findById(req.params.id)
      .populate('changeHistory.updatedBy', 'firstName lastName email')
      .select('changeHistory');

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Entrée CMS non trouvée',
      });
    }

    res.json({
      success: true,
      history: entry.changeHistory || [],
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message,
    });
  }
});

module.exports = router;




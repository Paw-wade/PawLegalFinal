const express = require('express');
const multer = require('multer');
const { protect, authorize } = require('../middleware/auth');
const { getOrgIdFromRequest } = require('../lib/tenant/uploads');
const { createTenantMulterStorage } = require('../lib/cloudinaryMulterStorage');
const { resolveUploadedFilePath } = require('../lib/resolveUploadedFile');

const router = express.Router();

const upload = multer({
  storage: createTenantMulterStorage({
    subdir: 'hero-carousel',
    getOrgId: getOrgIdFromRequest,
  }),
  limits: {
    fileSize: 300 * 1024 * 1024, // 300 MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedImage = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/webp',
      'image/gif',
    ];
    const allowedVideo = [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime',
      'video/x-matroska',
      'video/x-msvideo',
    ];

    if (allowedImage.includes(file.mimetype) || allowedVideo.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Type de fichier non autorisé. Images (JPG, PNG, WEBP, GIF) ou vidéos (MP4, WEBM, OGG, MOV, MKV, AVI) uniquement.'
        ),
        false
      );
    }
  },
});

router.use(protect, authorize('admin', 'superadmin'));

// @route   POST /api/media/hero
// @desc    Téléverser un média (image ou vidéo) pour le carrousel du hero
// @access  Private (admin, superadmin)
router.post('/hero', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('❌ Erreur upload média hero:', err);

      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Le fichier est trop volumineux. Taille maximale: 300 MB',
        });
      }

      return res.status(400).json({
        success: false,
        message:
          err.message ||
          'Erreur lors du téléversement du fichier. Vérifiez le type et la taille.',
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier reçu. Le champ doit s’appeler "file".',
      });
    }

    const isVideo = req.file.mimetype.startsWith('video/');
    const isImage = req.file.mimetype.startsWith('image/');
    const publicUrl = resolveUploadedFilePath(
      req.file,
      'hero-carousel',
      getOrgIdFromRequest(req)
    );

    res.status(201).json({
      success: true,
      message: 'Média téléversé avec succès',
      url: publicUrl,
      type: isVideo ? 'video' : isImage ? 'image' : 'unknown',
      mimetype: req.file.mimetype,
      filename: req.file.filename || publicUrl,
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement du média hero:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du téléversement du média',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;

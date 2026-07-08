const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorizePermission } = require('../middleware/auth');

const router = express.Router();

// Configuration du stockage Multer pour les médias du carrousel
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/hero-carousel');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, name + '-' + uniqueSuffix + ext);
  },
});

// Autoriser images et vidéos courantes (formats étendus)
const fileFilter = (req, file, cb) => {
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
    'video/quicktime', // .mov (iPhone, Mac)
    'video/x-matroska', // .mkv
    'video/x-msvideo', // .avi
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
};

const upload = multer({
  storage,
  limits: {
    fileSize: 300 * 1024 * 1024, // 300 MB max
  },
  fileFilter,
});

// Toutes les routes média nécessitent un admin
router.use(protect, authorizePermission('cms', 'consulter'));

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

    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/hero-carousel/${req.file.filename}`;

    res.status(201).json({
      success: true,
      message: 'Média téléversé avec succès',
      url: publicUrl,
      type: isVideo ? 'video' : isImage ? 'image' : 'unknown',
      mimetype: req.file.mimetype,
      filename: req.file.filename,
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


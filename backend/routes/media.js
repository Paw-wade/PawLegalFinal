const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { protect, authorizePermission } = require('../middleware/auth');

const router = express.Router();

// Cloudinary (optionnel - si CLOUDINARY_* configure, les medias carousel y sont stockes)
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

const CLOUDINARY_FOLDER = 'pawlegal/hero-carousel';

// Multer : tmp dir si Cloudinary, sinon uploads/hero-carousel local
const diskDest = cloudinary
  ? (req, file, cb) => {
      const tmpDir = path.join(os.tmpdir(), 'hero-tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      cb(null, tmpDir);
    }
  : (req, file, cb) => {
      const uploadDir = path.join(__dirname, '../uploads/hero-carousel');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    };

const upload = multer({
  storage: multer.diskStorage({
    destination: diskDest,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
      cb(null, `${name}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif',
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
      'video/x-matroska', 'video/x-msvideo',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Type de fichier non autorise. Images (JPG, PNG, WEBP, GIF) ou videos (MP4, WEBM, OGG, MOV, MKV, AVI) uniquement.'), false);
  },
});

// Toutes les routes media necessitent un admin
router.use(protect, authorizePermission('cms', 'consulter'));

// GET /api/media/hero
router.get('/hero', async (req, res) => {
  try {
    if (cloudinary) {
      const [imgRes, vidRes] = await Promise.all([
        cloudinary.api.resources({ type: 'upload', prefix: CLOUDINARY_FOLDER + '/', resource_type: 'image', max_results: 100 }),
        cloudinary.api.resources({ type: 'upload', prefix: CLOUDINARY_FOLDER + '/', resource_type: 'video', max_results: 100 }),
      ]);
      const toItem = (r, type) => ({
        filename: r.public_id,
        url: r.secure_url,
        type,
        size: r.bytes,
        createdAt: r.created_at,
      });
      const media = [
        ...(imgRes.resources || []).map((r) => toItem(r, 'image')),
        ...(vidRes.resources || []).map((r) => toItem(r, 'video')),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.json({ success: true, media });
    }

    // Fallback : filesystem local
    const uploadDir = path.join(__dirname, '../uploads/hero-carousel');
    if (!fs.existsSync(uploadDir)) return res.json({ success: true, media: [] });
    const videoExts = new Set(['.mp4', '.webm', '.ogg', '.mov', '.mkv', '.avi']);
    const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '')
      || `${req.protocol}://${(req.get('host') || '').replace('127.0.0.1', 'localhost')}`;
    const files = fs.readdirSync(uploadDir).filter((f) => !f.startsWith('.'));
    const media = files
      .map((filename) => {
        const ext = path.extname(filename).toLowerCase();
        const type = videoExts.has(ext) ? 'video' : 'image';
        const url = `${backendBase}/uploads/hero-carousel/${filename}`;
        const stat = fs.statSync(path.join(uploadDir, filename));
        return { filename, url, type, size: stat.size, createdAt: stat.birthtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, media });
  } catch (error) {
    console.error('Erreur lecture galerie:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la lecture de la galerie' });
  }
});

// DELETE /api/media/hero/:filename
// filename peut etre un public_id Cloudinary (ex: pawlegal/hero-carousel/foo-123) encode en URL
router.delete('/hero/:filename', authorizePermission('cms', 'modifier'), async (req, res) => {
  try {
    const filename = req.params.filename;
    if (cloudinary) {
      // public_id peut contenir des slashes (dossier Cloudinary)
      let destroyed = false;
      for (const resourceType of ['image', 'video']) {
        try {
          const r = await cloudinary.uploader.destroy(filename, { resource_type: resourceType });
          if (r.result === 'ok') { destroyed = true; break; }
        } catch (_) {}
      }
      return res.json({ success: true, message: destroyed ? 'Media supprime' : 'Media introuvable ou deja supprime' });
    }

    // Fallback : filesystem local
    if (filename.includes('..') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }
    const filePath = path.join(__dirname, '../uploads/hero-carousel', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Fichier introuvable' });
    }
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Media supprime' });
  } catch (error) {
    console.error('Erreur suppression media:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression du media' });
  }
});

// POST /api/media/hero
router.post('/hero', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Erreur upload media hero:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'Le fichier est trop volumineux. Taille maximale : 300 MB' });
      }
      return res.status(400).json({ success: false, message: err.message || 'Erreur lors du televersement du fichier.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier recu. Le champ doit s\'appeler "file".' });
    }

    if (cloudinary) {
      let result;
      try {
        result = await cloudinary.uploader.upload(req.file.path, {
          resource_type: 'auto',
          folder: CLOUDINARY_FOLDER,
          overwrite: false,
        });
      } finally {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(201).json({
        success: true,
        message: 'Media televerse avec succes',
        url: result.secure_url,
        type: result.resource_type === 'video' ? 'video' : 'image',
        mimetype: req.file.mimetype,
        filename: result.public_id,
      });
    }

    // Fallback : filesystem local
    const isVideo = req.file.mimetype.startsWith('video/');
    const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '')
      || `${req.protocol}://${(req.get('host') || '').replace('127.0.0.1', 'localhost')}`;
    const publicUrl = `${backendBase}/uploads/hero-carousel/${req.file.filename}`;
    res.status(201).json({
      success: true,
      message: 'Media televerse avec succes',
      url: publicUrl,
      type: isVideo ? 'video' : 'image',
      mimetype: req.file.mimetype,
      filename: req.file.filename,
    });
  } catch (error) {
    console.error('Erreur traitement media hero:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur lors du televersement du media' });
  }
});

module.exports = router;

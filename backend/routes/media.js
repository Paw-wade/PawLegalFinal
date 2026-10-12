const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { protect, authorizePermission } = require('../middleware/auth');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');

const router = express.Router();

const R2_CAROUSEL_PREFIX = 'carousel/hero-carousel/';
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.mkv', '.avi']);

function getR2Cfg() {
  const endpoint = process.env.R2_ENDPOINT
    || (process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : null);
  return {
    endpoint,
    bucket: String(process.env.R2_BUCKET || '').trim(),
    accessKeyId: String(process.env.R2_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY || '').trim(),
    publicUrl: String(process.env.R2_PUBLIC_URL || '').replace(/\/+$/, ''),
  };
}

function r2Ready() {
  const c = getR2Cfg();
  return !!(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

let _r2Client = null;
function r2Client() {
  if (_r2Client) return _r2Client;
  const c = getR2Cfg();
  _r2Client = new S3Client({
    region: 'auto',
    endpoint: c.endpoint,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  return _r2Client;
}

function publicUrl(key, req) {
  const { publicUrl } = getR2Cfg();
  if (publicUrl) return `${publicUrl}/${key}`;
  // Proxy interne si pas de bucket public configure
  const base = (process.env.BACKEND_URL || '').replace(/\/+$/, '')
    || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/media/hero/file/${encodeURIComponent(key)}`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const d = path.join(os.tmpdir(), 'hero-tmp');
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      cb(null, d);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
      cb(null, `${name}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = [
      'image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif',
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
      'video/x-matroska', 'video/x-msvideo',
    ];
    if (ok.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Type non autorise. Images (JPG, PNG, WEBP, GIF) ou videos (MP4, WEBM, OGG, MOV, MKV, AVI) uniquement.'), false);
  },
});

// Proxy public (sans auth) - sert les fichiers R2 si R2_PUBLIC_URL absent
router.get('/hero/file/:key', async (req, res) => {
  if (!r2Ready()) return res.status(404).json({ success: false, message: 'Stockage non configure' });
  try {
    const key = req.params.key; // Express decode deja %2F -> /
    if (key.includes('..')) return res.status(400).end();
    const { bucket } = getR2Cfg();
    const data = await r2Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    res.setHeader('Content-Type', data.ContentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (data.ContentLength) res.setHeader('Content-Length', data.ContentLength);
    data.Body.pipe(res);
  } catch (err) {
    console.error('Erreur proxy R2:', err);
    res.status(404).json({ success: false, message: 'Fichier introuvable' });
  }
});

// Toutes les routes suivantes necessitent une session admin
router.use(protect, authorizePermission('cms', 'consulter'));

// GET /api/media/hero
router.get('/hero', async (req, res) => {
  try {
    if (r2Ready()) {
      const { bucket } = getR2Cfg();
      const result = await r2Client().send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: R2_CAROUSEL_PREFIX })
      );
      const media = (result.Contents || [])
        .filter((o) => !o.Key.endsWith('/'))
        .map((o) => {
          const ext = path.extname(o.Key).toLowerCase();
          return {
            filename: o.Key,
            url: publicUrl(o.Key, req),
            type: VIDEO_EXTS.has(ext) ? 'video' : 'image',
            size: o.Size,
            createdAt: o.LastModified,
          };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.json({ success: true, media });
    }

    // Fallback filesystem (dev local sans R2)
    const uploadDir = path.join(__dirname, '../uploads/hero-carousel');
    if (!fs.existsSync(uploadDir)) return res.json({ success: true, media: [] });
    const base = (process.env.BACKEND_URL || '').replace(/\/+$/, '')
      || `${req.protocol}://${req.get('host')}`;
    const media = fs.readdirSync(uploadDir)
      .filter((f) => !f.startsWith('.'))
      .map((f) => {
        const ext = path.extname(f).toLowerCase();
        const stat = fs.statSync(path.join(uploadDir, f));
        return { filename: f, url: `${base}/uploads/hero-carousel/${f}`, type: VIDEO_EXTS.has(ext) ? 'video' : 'image', size: stat.size, createdAt: stat.birthtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, media });
  } catch (err) {
    console.error('Erreur lecture galerie:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la lecture de la galerie' });
  }
});

// DELETE /api/media/hero/:filename
router.delete('/hero/:filename', authorizePermission('cms', 'modifier'), async (req, res) => {
  try {
    const filename = req.params.filename; // deja decode par Express (%2F -> /)
    if (r2Ready()) {
      const key = filename.startsWith(R2_CAROUSEL_PREFIX) ? filename : R2_CAROUSEL_PREFIX + filename;
      const { bucket } = getR2Cfg();
      await r2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return res.json({ success: true, message: 'Media supprime' });
    }

    // Fallback filesystem
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }
    const filePath = path.join(__dirname, '../uploads/hero-carousel', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Fichier introuvable' });
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Media supprime' });
  } catch (err) {
    console.error('Erreur suppression media:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression du media' });
  }
});

// POST /api/media/hero
router.post('/hero', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'Fichier trop volumineux. Maximum : 300 MB' });
      }
      return res.status(400).json({ success: false, message: err.message || 'Erreur lors du televersement.' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Aucun fichier recu. Le champ doit s\'appeler "file".' });
  }
  try {
    if (r2Ready()) {
      const { bucket } = getR2Cfg();
      const key = `${R2_CAROUSEL_PREFIX}${req.file.filename}`;
      const body = fs.readFileSync(req.file.path);
      try {
        await r2Client().send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: req.file.mimetype,
          ContentLength: body.length,
        }));
      } finally {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(201).json({
        success: true,
        message: 'Media televerse avec succes',
        url: publicUrl(key, req),
        type: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
        mimetype: req.file.mimetype,
        filename: key,
      });
    }

    // Fallback filesystem - deplace de tmp vers uploads/hero-carousel
    const uploadDir = path.join(__dirname, '../uploads/hero-carousel');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const dest = path.join(uploadDir, req.file.filename);
    fs.renameSync(req.file.path, dest);
    const base = (process.env.BACKEND_URL || '').replace(/\/+$/, '')
      || `${req.protocol}://${req.get('host')}`;
    res.status(201).json({
      success: true,
      message: 'Media televerse avec succes',
      url: `${base}/uploads/hero-carousel/${req.file.filename}`,
      type: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
      mimetype: req.file.mimetype,
      filename: req.file.filename,
    });
  } catch (err) {
    console.error('Erreur traitement media hero:', err);
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ success: false, message: 'Erreur serveur lors du televersement du media' });
  }
});

module.exports = router;

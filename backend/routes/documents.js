const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Document = require('../models/Document');
const DocumentCompartiment = require('../models/DocumentCompartiment');
const User = require('../models/User');
const Log = require('../models/Log');
const Dossier = require('../models/Dossier');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { getAssignedDossierIds, userHasPermission } = require('../utils/accessScope');
const {
  getDocumentHttpUrl,
  pipeHttpDocumentUrl,
  tryServeDocumentFromAlternateSources,
  resolveDocumentResponseContentType,
  isS3StoragePath,
} = require('../utils/documentFileStorage');
const {
  resolveDocumentDownloadFileName,
  resolveDocumentDisplayTitle,
  buildContentDisposition,
  pickFileExtension,
} = require('../utils/documentDownloadName');
const {
  deleteS3Object,
  archiveS3Object,
  tryServeDocumentFromS3,
} = require('../utils/s3DocumentStorage');
const { uploadDocumentToRemoteStorage, removeLocalUploadTempFile } = require('../utils/documentRemoteUpload');
const { resolveCabinetForUser } = require('../utils/cabinetResolver');

const router = express.Router();
const BACKEND_ROOT = path.resolve(__dirname, '..');
const UPLOADS_ROOT = path.resolve(BACKEND_ROOT, 'uploads');

const isExistingFile = (p) => {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Liste plate uploads/documents puis recherche récursive (compat Node sans recursive) */
const searchFileInUploads = (targetNames = []) => {
  const normalizedTargets = targetNames
    .filter(Boolean)
    .map((n) => path.basename(String(n)).toLowerCase());
  if (normalizedTargets.length === 0) return null;

  const tryDir = (dir) => {
    try {
      if (!fs.existsSync(dir)) return null;
      const names = fs.readdirSync(dir);
      for (const name of names) {
        const full = path.join(dir, name);
        if (!isExistingFile(full)) continue;
        if (normalizedTargets.includes(name.toLowerCase())) return full;
      }
    } catch (e) {
      console.warn('⚠️ scan dossier uploads:', dir, e.message);
    }
    return null;
  };

  // 1) Dossier standard des documents
  const flat = tryDir(path.join(UPLOADS_ROOT, 'documents'));
  if (flat) return flat;

  if (process.env.UPLOADS_DOCUMENTS_DIR) {
    const fromEnv = tryDir(path.resolve(process.env.UPLOADS_DOCUMENTS_DIR));
    if (fromEnv) return fromEnv;
  }

  // 2) Récursif depuis uploads/ (Node 18+)
  try {
    if (!fs.existsSync(UPLOADS_ROOT)) return null;
    const entries = fs.readdirSync(UPLOADS_ROOT, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const entryName = entry.name.toLowerCase();
      if (!normalizedTargets.includes(entryName)) continue;
      const parent = entry.parentPath || UPLOADS_ROOT;
      const candidate = path.join(parent, entry.name);
      if (isExistingFile(candidate)) return candidate;
    }
  } catch (e) {
    console.warn('⚠️ Recherche récursive uploads échouée:', e.message);
  }
  return null;
};

const resolveExistingDocumentPath = (storedPath, fileName) => {
  if (!storedPath && !fileName) return null;

  const rawPath = String(storedPath || '').trim();
  const filenameOnly = fileName ? path.basename(String(fileName)) : (rawPath ? path.basename(rawPath) : '');

  const normalized = rawPath.replace(/[\\/]+/g, path.sep);
  const withoutLeadingSep = normalized.replace(new RegExp(`^\\${path.sep}+`), '');
  const uploadsRelative = withoutLeadingSep.replace(/^uploads[\\/]+documents[\\/]+/i, '');
  const asForwardSlash = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');

  const candidates = [];

  const dockerUploadsMatch = asForwardSlash.match(/^(?:app\/)?uploads\/documents\/(.+)$/i);
  if (dockerUploadsMatch?.[1]) {
    const relFile = dockerUploadsMatch[1];
    candidates.push(
      path.join(UPLOADS_ROOT, 'documents', relFile),
      path.resolve(BACKEND_ROOT, 'uploads', 'documents', relFile),
      path.join(process.cwd(), 'uploads', 'documents', relFile),
      path.join(process.cwd(), 'backend', 'uploads', 'documents', relFile)
    );
  }

  if (normalized) {
    if (path.isAbsolute(normalized)) candidates.push(normalized);
    candidates.push(
      path.resolve(BACKEND_ROOT, normalized),
      path.resolve(BACKEND_ROOT, withoutLeadingSep),
      path.resolve(process.cwd(), normalized),
      path.resolve(process.cwd(), withoutLeadingSep)
    );
  }

  if (asForwardSlash.startsWith('uploads/')) {
    const parts = asForwardSlash.split('/').filter(Boolean);
    if (parts.length > 0) {
      candidates.push(path.join(BACKEND_ROOT, ...parts));
      candidates.push(path.join(process.cwd(), ...parts));
    }
  }

  if (uploadsRelative && uploadsRelative !== '.' && uploadsRelative !== path.sep) {
    candidates.push(path.resolve(BACKEND_ROOT, 'uploads', 'documents', uploadsRelative));
    candidates.push(path.resolve(process.cwd(), 'uploads', 'documents', uploadsRelative));
  }
  if (filenameOnly) {
    candidates.push(
      path.resolve(BACKEND_ROOT, 'uploads', 'documents', filenameOnly),
      path.join(UPLOADS_ROOT, 'documents', filenameOnly),
      path.join(process.cwd(), 'uploads', 'documents', filenameOnly),
      path.join(process.cwd(), 'backend', 'uploads', 'documents', filenameOnly)
    );
  }

  if (process.env.UPLOADS_DOCUMENTS_DIR && filenameOnly) {
    candidates.push(path.join(path.resolve(process.env.UPLOADS_DOCUMENTS_DIR), filenameOnly));
  }

  const unique = [...new Set(candidates.filter(Boolean))];

  for (const candidate of unique) {
    if (isExistingFile(candidate)) return candidate;
  }

  const foundByName = searchFileInUploads([fileName, filenameOnly, rawPath ? path.basename(normalized) : '']);
  if (foundByName) return foundByName;

  return null;
};

/**
 * Fichier introuvable par chemin : retrouver par taille (octets) + proximité de createdAt.
 */
const findFileByTailleAndCreatedAt = (document) => {
  const size = Number(document.taille);
  if (!Number.isFinite(size) || size <= 0) return null;
  const t0 = document.createdAt ? new Date(document.createdAt).getTime() : null;

  const scanDirs = new Set([
    path.join(UPLOADS_ROOT, 'documents'),
    path.join(process.cwd(), 'uploads', 'documents'),
    path.join(process.cwd(), 'backend', 'uploads', 'documents'),
  ]);
  if (process.env.UPLOADS_DOCUMENTS_DIR) {
    scanDirs.add(path.resolve(process.env.UPLOADS_DOCUMENTS_DIR));
  }

  const matches = [];
  for (const dir of scanDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (!isExistingFile(full)) continue;
        const st = fs.statSync(full);
        if (st.size !== size) continue;
        const timeDiff = t0 != null ? Math.abs(st.mtimeMs - t0) : 0;
        matches.push({ full, timeDiff });
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].full;

  matches.sort((a, b) => a.timeDiff - b.timeDiff);
  const best = matches[0];
  if (t0 == null) return null;
  if (best.timeDiff > 48 * 60 * 60 * 1000) return null;
  if (matches.length > 1 && Math.abs(matches[1].timeDiff - best.timeDiff) < 3000) {
    return null;
  }
  return best.full;
};

/**
 * Résolution complète : chemins multiples, nom d'affichage, puis empreinte taille/date.
 * Met à jour cheminFichier / nomFichier en base si retrouvé par heuristique.
 */
const resolveDocumentPhysicalPath = async (document) => {
  let filePath = resolveExistingDocumentPath(document.cheminFichier, document.nomFichier);
  if (filePath) return filePath;

  if (document.nom) {
    filePath = resolveExistingDocumentPath(null, document.nom);
    if (filePath) return filePath;
  }

  filePath = findFileByTailleAndCreatedAt(document);
  if (!filePath) return null;

  try {
    const absFile = path.resolve(filePath);
    const rel = path.relative(BACKEND_ROOT, absFile);
    const cheminToStore =
      rel && !rel.startsWith('..') && !path.isAbsolute(rel)
        ? rel.replace(/\\/g, '/')
        : absFile.replace(/\\/g, '/');
    await Document.updateOne(
      { _id: document._id },
      {
        $set: {
          cheminFichier: cheminToStore,
          nomFichier: path.basename(absFile),
        },
      }
    );
    document.cheminFichier = cheminToStore;
    document.nomFichier = path.basename(absFile);
    console.log('🔧 Chemin fichier document réparé en base:', String(document._id), '→', cheminToStore);
  } catch (e) {
    console.warn('⚠️ Impossible de persister le chemin réparé:', e.message);
  }

  return filePath;
};

async function sendDocumentToClient(document, res, { inline = false } = {}) {
  const directUrl = getDocumentHttpUrl(document);
  if (directUrl) {
    const ok = await pipeHttpDocumentUrl(directUrl, res, document, { inline });
    if (ok) return true;
  }

  if (await tryServeDocumentFromS3(document, res, { inline })) return true;

  const localPath = await resolveDocumentPhysicalPath(document);
  if (localPath) {
    const fileName = resolveDocumentDownloadFileName(document, localPath);
    const contentType = resolveDocumentResponseContentType(document);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', buildContentDisposition(fileName, { inline }));
    if (inline) res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(localPath);
    return true;
  }

  return tryServeDocumentFromAlternateSources(document, res, { inline });
}

const isHttpLikeStoragePath = (value) => /^https?:\/\//i.test(String(value || '').trim());

// Normaliser la catégorie pour éviter les erreurs de validation Mongoose
// lorsque la valeur vient d'écrans différents (libellés libres, accents, etc.).
const normalizeCategorie = (rawCategorie) => {
  if (!rawCategorie) return 'autre';

  const normalized = String(rawCategorie)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');

  const mapping = {
    identite: 'identite',
    piece_identite: 'identite',
    pieces_identite: 'identite',
    identity: 'identite',
    passport: 'identite',
    passeport: 'identite',
    carte_identite: 'identite',
    titre_sejour: 'titre_sejour',
    titre_de_sejour: 'titre_sejour',
    sejour: 'titre_sejour',
    residence_permit: 'titre_sejour',
    contrat: 'contrat',
    contract: 'contrat',
    facture: 'facture',
    facture_energie: 'facture',
    invoice: 'facture',
    autre: 'autre',
    other: 'autre'
  };

  return mapping[normalized] || 'autre';
};

// Configuration du stockage Multer
const cloudinaryPkg = require('cloudinary');
const cloudinary = cloudinaryPkg.v2;

const hasCloudinaryConfig =
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  !!process.env.CLOUDINARY_API_KEY &&
  !!process.env.CLOUDINARY_API_SECRET;

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const localDocumentsDir = path.join(UPLOADS_ROOT, 'documents');
if (!fs.existsSync(localDocumentsDir)) {
  fs.mkdirSync(localDocumentsDir, { recursive: true });
}

/** public_id Cloudinary depuis une URL res.cloudinary.com (évite slice(-2) qui coupe le dossier racine) */
function cloudinaryPublicIdFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  if (!fileUrl.includes('res.cloudinary.com')) return null;
  const noQuery = fileUrl.split('?')[0];
  const marker = '/upload/';
  const idx = noQuery.indexOf(marker);
  if (idx === -1) return null;
  let rest = noQuery.slice(idx + marker.length);
  // Segments de transformations (ex. c_scale,w_500/) avant la version ou le public_id
  while (rest.includes('/') && /^[a-z0-9_]+,[a-z0-9_.,\-]+/i.test(rest.split('/')[0])) {
    rest = rest.slice(rest.indexOf('/') + 1);
  }
  rest = rest.replace(/^v\d+\//, '');
  const withoutExt = rest.replace(/\.[^/.]+$/, '');
  return withoutExt || null;
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, localDocumentsDir),
  filename: (req, file, cb) => {
    const safeName = (file.originalname || 'document')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

/** Disque d'abord (reception rapide), puis S3 ou Cloudinary dans le handler POST. */
async function uploadLocalFileToCloudinary(file) {
  const storage = String(process.env.UPLOAD_STORAGE || 'cloudinary').toLowerCase();
  if (storage === 'local' || storage === 's3') {
    return null;
  }
  if (!hasCloudinaryConfig) return null;
  const localPath = file?.path;
  if (!localPath || !fs.existsSync(localPath)) return null;

  const isImage = String(file.mimetype || '').startsWith('image/');
  const baseName = path.basename(String(file.filename || 'document'), path.extname(String(file.filename || '')));
  const result = await cloudinary.uploader.upload(localPath, {
    resource_type: isImage ? 'image' : 'raw',
    folder: 'pawlegal/documents',
    public_id: baseName || `${Date.now()}-document`,
    overwrite: true,
  });
  return result?.secure_url || null;
}

const fileFilter = (req, file, cb) => {
  cb(null, true);
};

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
});

// Toutes les routes nécessitent une authentification
router.use(protect);

// @route   GET /api/user/documents
// @desc    Récupérer tous les documents de l'utilisateur connecté
// @access  Private (tous les rôles authentifiés)
router.get('/', async (req, res) => {
  try {
    const targetUserId = req.user.id;
    const targetUserEmail = req.user.email;
    
    console.log('📄 Récupération des documents pour l\'utilisateur:', targetUserId, 'Rôle:', req.user.role);
    
    const documents = await Document.find({ user: targetUserId })
      .populate('dossierId', 'titre numero categorie statut')
      .sort({ createdAt: -1 });

    console.log('✅ Documents trouvés:', documents.length, 'pour l\'utilisateur:', targetUserEmail);

    res.json({
      success: true,
      count: documents.length,
      documents
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des documents:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   GET /api/user/documents/admin
// @desc    Récupérer tous les documents (Admin, Superadmin, Partenaire)
// @access  Private (Admin, Superadmin, Partenaire)
router.get('/admin', protect, async (req, res) => {
  try {
    console.log('📄 Requête GET /api/user/documents/admin reçue - User:', req.user?.email || req.user?.id);
    console.log('📄 Requête GET /api/user/documents/admin reçue:', {
      user: req.user?.email,
      role: req.user?.role,
      userId: req.query?.userId
    });
    
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const isPartenaire = req.user.role === 'partenaire';
    
    let query = {};
    
    // Si un userId est fourni, filtrer par utilisateur
    if (req.query.userId) {
      query.user = req.query.userId;
      console.log('🔍 Filtrage par userId:', req.query.userId);
    }
    
    // Si partenaire, filtrer les documents des dossiers qui lui sont transmis (pending ou accepted, pas refused)
    if (isPartenaire) {
      const Dossier = require('../models/Dossier');
      // Récupérer tous les dossiers qui ont une transmission au partenaire
      const dossiersTransmis = await Dossier.find({
        'transmittedTo.partenaire': req.user.id
      }).select('_id transmittedTo');
      
      // Filtrer pour garder ceux transmis (pending ou accepted, mais pas refused)
      const dossierIds = dossiersTransmis
        .filter(d => {
          if (!d.transmittedTo || !Array.isArray(d.transmittedTo)) return false;
          return d.transmittedTo.some((trans) => {
            const transPartenaireId = trans.partenaire?._id?.toString() || trans.partenaire?.toString() || trans.partenaire;
            // Accepter pending et accepted, mais pas refused
            return transPartenaireId === req.user.id.toString() && trans.status !== 'refused';
          });
        })
        .map(d => d._id);
      
      if (dossierIds.length === 0) {
        // Aucun dossier transmis, retourner un tableau vide
        query.dossierId = { $in: [] };
      } else {
        query.dossierId = { $in: dossierIds };
      }
      console.log('🔍 Partenaire - Filtrage par dossiers transmis (pending/accepted):', dossierIds.length, 'dossiers');
    }

    // Accès restreint : un membre du staff sans permission "documents" ne voit
    // que les documents rattachés à un dossier qui lui est assigné.
    if (!isPartenaire && req.user.role !== 'superadmin') {
      const canViewAll = await userHasPermission(req.user, 'documents', 'consulter');
      if (!canViewAll) {
        const assignedIds = await getAssignedDossierIds(req.user.id);
        query.dossierId = { $in: assignedIds };
        console.log('🔒 Accès restreint documents - dossiers assignés:', assignedIds.length);
      }
    }
    
    // Filtre optionnel par dossier
    if (req.query.dossierId && mongoose.Types.ObjectId.isValid(req.query.dossierId)) {
      query.dossierId = req.query.dossierId;
    }

    const documents = await Document.find(query)
      .populate('user', 'firstName lastName email')
      .populate('dossierId', 'titre numero')
      .populate('compartiment', 'nom ordre')
      .sort({ createdAt: -1 });

    console.log('✅ Documents trouvés:', documents.length);

    res.json({
      success: true,
      count: documents.length,
      documents
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des documents (admin):', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/user/documents/dossier/:dossierId
// @desc    Récupérer tous les documents d'un dossier spécifique
// @access  Private (Admin, Superadmin, Partenaire avec accès au dossier, Propriétaire du dossier)
router.get('/dossier/:dossierId', async (req, res) => {
  try {
    const { dossierId } = req.params;
    const Dossier = require('../models/Dossier');
    
    // Vérifier que le dossier existe
    const dossier = await Dossier.findById(dossierId)
      .populate('transmittedTo.partenaire', '_id');
    
    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Dossier non trouvé'
      });
    }
    
    // Vérifier l'accès (aligné sur GET /user/dossiers/:id pour le client)
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const isOwner = dossier.user && dossier.user.toString() === req.user.id.toString();
    const isAssigned = dossier.assignedTo && dossier.assignedTo.toString() === req.user.id.toString();
    const isClientByEmail =
      req.user.role === 'client' &&
      dossier.clientEmail &&
      req.user.email &&
      String(dossier.clientEmail).trim().toLowerCase() === String(req.user.email).trim().toLowerCase();
    const isPartenaire = req.user.role === 'partenaire';
    
    let hasAccess = isAdmin || isOwner || isAssigned || isClientByEmail;
    
    // Pour les partenaires, vérifier si le dossier leur est transmis (pending ou accepted, pas refused)
    if (isPartenaire && !hasAccess) {
      if (dossier.transmittedTo && Array.isArray(dossier.transmittedTo)) {
        hasAccess = dossier.transmittedTo.some((trans) => {
          if (!trans || !trans.partenaire) return false;
          const transPartenaireId = trans.partenaire._id ? trans.partenaire._id.toString() : trans.partenaire.toString();
          // Accepter pending et accepted, mais pas refused
          return transPartenaireId === req.user.id.toString() && trans.status !== 'refused';
        });
      }
    }
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce dossier'
      });
    }
    
    // Récupérer tous les documents du dossier
    const rawDocuments = await Document.find({ dossierId: dossierId })
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 });

    const documents = await Promise.all(
      rawDocuments.map(async (doc) => {
        if (req.user.role !== 'client') return doc;

        const canViewContent = await canClientViewDocumentContent(doc, req.user);
        if (canViewContent) return doc;

        const docObj = doc.toObject();
        return {
          ...docObj,
          isConfidentialForClient: true,
          canPreview: false,
          canDownload: false,
          confidentialReason: undefined,
          cheminFichier: undefined
        };
      })
    );
    
    res.json({
      success: true,
      count: documents.length,
      documents
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des documents du dossier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   POST /api/user/documents
// @desc    Téléverser un document
// @access  Private
router.post('/', (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      console.error('❌ Erreur Multer:', err);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Le fichier est trop volumineux. Taille maximale: 10 MB'
        });
      }
      
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          message: 'Nom de champ de fichier incorrect. Le champ doit s\'appeler "document"'
        });
      }
      
      if (err.message && err.message.includes('Type de fichier non autorisé')) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (err.message === 'Request aborted' || /request aborted/i.test(String(err.message || ''))) {
        return res.status(408).json({
          success: false,
          message:
            'Televersement interrompu (connexion coupee). Reessayez avec un fichier plus petit ou verifiez votre connexion.',
        });
      }
      
      return res.status(400).json({
        success: false,
        message: err.message || 'Erreur lors du téléversement du fichier'
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('📤 Upload de document - Début');
    console.log('📤 Headers Content-Type:', req.headers['content-type']);
    console.log('📤 Fichier reçu:', req.file ? {
      originalname: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    } : 'AUCUN FICHIER');
    console.log('📤 Body:', req.body);

    if (!req.file) {
      console.error('❌ Aucun fichier téléversé');
      console.error('❌ Request headers:', req.headers);
      console.error('❌ Request body keys:', Object.keys(req.body || {}));
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier téléversé. Assurez-vous que le champ du formulaire s\'appelle "document"'
      });
    }

    const { nom, description, categorie, dossierId, visibleToClient, confidentialReason } = req.body;
    const effectiveUserId = req.user.id;
    const safeCategorie = normalizeCategorie(categorie);
    const uploaderIsCabinet = isCabinetStaff(req.user.role);

    console.log('📤 Données du document:', {
      userId: effectiveUserId,
      nom: nom || req.file.originalname,
      dossierId: dossierId,
      categorieRecue: categorie,
      categorieNormalisee: safeCategorie
    });

    let cheminFichier;
    const cabinet = await resolveCabinetForUser(req.user);
    const s3Prefix = cabinet?.s3Prefix || null;
    try {
      cheminFichier = await uploadDocumentToRemoteStorage(req.file, {
        backendRoot: BACKEND_ROOT,
        s3Prefix,
        uploadToCloudinary: () => uploadLocalFileToCloudinary(req.file),
      });
    } catch (uploadErr) {
      removeLocalUploadTempFile(req.file);
      console.error('Échec upload distant - document non créé:', uploadErr.message);
      return res.status(503).json({
        success: false,
        message:
          'Impossible d\'enregistrer le fichier sur le stockage distant. Le document n\'a pas été créé. Réessayez dans quelques instants.',
      });
    }

    const documentData = {
      user: effectiveUserId,
      nom: nom || req.file.originalname,
      // `nomFichier` est indexé/unique côté DB : utiliser le nom de fichier généré par multer (timestamp)
      // pour éviter les doublons lorsque l'utilisateur upload plusieurs fois le même fichier original.
      nomFichier: req.file.filename,
      originalName: req.file.originalname,
      cheminFichier,
      typeMime: req.file.mimetype,
      taille: req.file.size,
      description: description || '',
      categorie: safeCategorie,
      visibleToClient: uploaderIsCabinet ? parseBoolean(visibleToClient, true) : true,
      cabinetId: cabinet?._id || null,
      confidentialReason:
        uploaderIsCabinet && parseBoolean(visibleToClient, true) === false
          ? String(confidentialReason || '').trim()
          : ''
    };

    // Ajouter dossierId seulement s'il est fourni et valide
    if (dossierId && dossierId.trim() !== '') {
      // Vérifier que le dossierId est un ObjectId valide
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(dossierId)) {
        documentData.dossierId = dossierId;
        console.log('📁 Dossier ID ajouté:', dossierId);
      } else {
        console.warn('⚠️ Dossier ID invalide, ignoré:', dossierId);
      }
    }

    console.log('📤 Création du document...');
    const document = await Document.create(documentData);
    console.log('✅ Document créé avec succès:', document._id);

    // Notifier le client (push + in-app) quand un tiers ajoute un document à son dossier
    if (documentData.dossierId) {
      try {
        const dossier = await Dossier.findById(documentData.dossierId)
          .select('user clientEmail titre numero')
          .lean();
        if (dossier) {
          let clientUserId = dossier.user ? dossier.user.toString() : null;
          if (!clientUserId && dossier.clientEmail) {
            const linked = await User.findOne({
              email: String(dossier.clientEmail).trim().toLowerCase(),
            })
              .select('_id')
              .lean();
            if (linked?._id) clientUserId = linked._id.toString();
          }
          const uploaderId = String(req.user.id);
          const isOwnClientUpload = clientUserId && clientUserId === uploaderId;
          if (clientUserId && !isOwnClientUpload) {
            const dossierTitle = dossier.titre || dossier.numero || 'votre dossier';
            await Notification.create({
              user: clientUserId,
              type: 'document_uploaded',
              titre: 'Nouveau document sur votre dossier',
              message: `« ${document.nom} » a été ajouté au dossier « ${dossierTitle} ».`,
              lien: `/client/dossiers/${dossier._id}`,
              metadata: {
                dossierId: dossier._id.toString(),
                documentId: document._id.toString(),
                uploadedBy: uploaderId,
              },
            });
          }
        }
      } catch (pushNotifError) {
        console.error('⚠️ Notification client document_uploaded:', pushNotifError?.message || pushNotifError);
      }
    }

    // Logger l'action
    try {
      await Log.create({
        user: req.user.id,
        userEmail: req.user.email,
        action: 'document_uploaded',
        description: `${req.user.email} a téléversé le document "${document.nom}"`,
        ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
        userAgent: req.get('user-agent'),
        metadata: {
          documentId: document._id.toString(),
          nom: document.nom,
          taille: document.taille
        }
      });
    } catch (logError) {
      console.error('Erreur lors de l\'enregistrement du log:', logError);
    }

    console.log('✅ Document téléversé avec succès:', document._id);
    res.status(201).json({
      success: true,
      message: 'Document téléversé avec succès',
      document
    });
  } catch (error) {
    console.error('❌ Erreur lors du téléversement du document:', error);
    console.error('❌ Stack trace:', error.stack);
    console.error('❌ Request body:', req.body);
    console.error('❌ Request file:', req.file);
    
    // Supprimer le fichier si le document n'a pas pu être créé
    if (req.file && req.file.path && req.file.path.startsWith('http')) {
      try {
        const urlParts = req.file.path.split('/');
        const publicIdWithExt = urlParts.slice(-2).join('/');
        const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        console.log('🗑️ Fichier Cloudinary supprimé après erreur:', publicId);
      } catch (cloudErr) {
        console.warn('⚠️ Suppression Cloudinary échouée:', cloudErr.message);
      }
    }

    // Erreurs de validation Mongoose -> 400 (problème de données d'entrée)
    if (error && (error.name === 'ValidationError' || error.name === 'CastError')) {
      return res.status(400).json({
        success: false,
        message: 'Données de document invalides',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du téléversement du document',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Rôles équipe Ada Papers avec accès lecture à tous les documents
const isCabinetStaff = (role) =>
  role === 'admin' || role === 'superadmin' || role === 'secretaire';

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  }
  return fallback;
};

const canClientViewDocumentContent = async (document, user) => {
  if (!document || !user || user.role !== 'client') return true;
  const isDossierOwnerClient = await canClientAccessDocumentViaOwningDossier(document, user);
  if (!isDossierOwnerClient) return true;
  return document.visibleToClient !== false;
};

/**
 * Client : accès aux pièces du dossier si même règle que GET /user/dossiers/:id
 * (utilisateur lié au dossier OU email client du dossier = email connecté).
 */
async function canClientAccessDocumentViaOwningDossier(document, user) {
  if (!document || !document.dossierId || user.role !== 'client') return false;
  const userId = (user.id || user._id || '').toString();
  const userEmail = (user.email || '').trim().toLowerCase();
  if (!userId) return false;
  const rawDossierId = document.dossierId._id || document.dossierId;
  if (!rawDossierId || !mongoose.Types.ObjectId.isValid(String(rawDossierId))) return false;
  try {
    const Dossier = require('../models/Dossier');
    const dossier = await Dossier.findById(rawDossierId).select('user clientEmail').lean();
    if (!dossier) return false;
    if (dossier.user && dossier.user.toString() === userId) return true;
    if (
      dossier.clientEmail &&
      userEmail &&
      String(dossier.clientEmail).trim().toLowerCase() === userEmail
    ) {
      return true;
    }
    return false;
  } catch (e) {
    console.warn('canClientAccessDocumentViaOwningDossier:', e.message);
    return false;
  }
}

// @route   GET /api/user/documents/:id/preview
// @desc    Prévisualiser un document (retourne le fichier avec headers pour affichage)
// @access  Private - auth via middleware protect (Bearer ou ?token=)
router.get('/:id/preview', async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé'
      });
    }

    const mongoose = require('mongoose');
    const docId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(docId)) {
      return res.status(400).json({
        success: false,
        message: 'Identifiant de document invalide'
      });
    }

    const document = await Document.findById(docId)
      .populate('user', 'firstName lastName email')
      .populate({
        path: 'dossierId',
        select: 'transmittedTo',
        populate: {
          path: 'transmittedTo.partenaire',
          select: '_id firstName lastName email role'
        }
      });

    if (!document) {
      console.error('❌ Document non trouvé en base:', docId);
      return res.status(404).json({
        success: false,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document non trouvé'
      });
    }

    console.log('📄 Document trouvé:', document.nom, 'Propriétaire:', document.user?.email || 'N/A');

    // Vérifier les permissions
    const documentUserId = document.user?._id?.toString() || document.user?.toString() || document.user?.toString();
    const currentUserId = user._id.toString();
    
    const isOwner = documentUserId === currentUserId;
    const isAdmin = isCabinetStaff(user.role);
    const isPartenaire = user.role === 'partenaire';
    
    // Vérifier si le document appartient à un dossier transmis au partenaire ET accepté
    let isTransmittedToPartenaire = false;
    if (isPartenaire && document.dossierId) {
      const dossier = document.dossierId;
      // Si le populate n'a pas fonctionné, récupérer le dossier séparément
      if (!dossier || !dossier.transmittedTo || !Array.isArray(dossier.transmittedTo)) {
        const Dossier = require('../models/Dossier');
        const dossierId = dossier?._id || dossier || document.dossierId;
        const fullDossier = await Dossier.findById(dossierId)
          .populate('transmittedTo.partenaire', '_id');
        if (fullDossier && fullDossier.transmittedTo && Array.isArray(fullDossier.transmittedTo)) {
          isTransmittedToPartenaire = fullDossier.transmittedTo.some(trans => {
            if (!trans || !trans.partenaire) return false;
            const transPartenaireId = trans.partenaire._id ? trans.partenaire._id.toString() : trans.partenaire.toString();
            // Accepter pending et accepted, mais pas refused
            return transPartenaireId === currentUserId && trans.status !== 'refused';
          });
        }
      } else {
        isTransmittedToPartenaire = dossier.transmittedTo.some((t) => {
          if (!t || !t.partenaire) return false;
          const transPartenaireId = t.partenaire._id ? t.partenaire._id.toString() : t.partenaire.toString();
          // Accepter pending et accepted, mais pas refused
          return transPartenaireId === currentUserId && t.status !== 'refused';
        });
      }
    }
    
    const isDossierOwnerClient = await canClientAccessDocumentViaOwningDossier(document, user);

    console.log('🔐 Vérification des permissions:', {
      isOwner,
      isAdmin,
      isPartenaire,
      isTransmittedToPartenaire,
      isDossierOwnerClient,
      documentUserId,
      currentUserId,
      userRole: user.role,
      dossierId: document.dossierId?._id || document.dossierId
    });

    if (!isOwner && !isAdmin && !isTransmittedToPartenaire && !isDossierOwnerClient) {
      console.error('❌ Accès refusé - Pas propriétaire, pas admin/secrétaire, pas partenaire autorisé, pas client propriétaire du dossier');
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce document'
      });
    }

    if (user.role === 'client') {
      const canViewContent = await canClientViewDocumentContent(document, user);
      if (!canViewContent) {
        return res.status(403).json({
          success: false,
          message: 'Ce document est confidentiel et réservé à l’administration.'
        });
      }
    }

    // Stream Cloudinary / local / origines distantes
    const served = await sendDocumentToClient(document, res, { inline: true });
    if (served) return;

    return res.status(404).json({
      success: false,
      code: 'FILE_NOT_FOUND',
      message: 'Fichier non trouvé sur le serveur. Le fichier peut être absent du disque local - récupérez-le depuis le VPS ou re-téléversez le document.',
    });
  } catch (error) {
    console.error('Erreur lors de la prévisualisation du document:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        error: error.message
      });
    }
  }
});

// @route   GET /api/user/documents/:id/download
// @desc    Télécharger un document
// @access  Private
router.get('/:id/download', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate({
        path: 'dossierId',
        select: 'transmittedTo',
        populate: {
          path: 'transmittedTo.partenaire',
          select: '_id firstName lastName email role'
        }
      });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document non trouvé'
      });
    }

    // Vérifier les permissions
    // L'utilisateur peut télécharger ses propres documents
    // Les admins peuvent télécharger tous les documents
    // Les partenaires peuvent télécharger les documents des dossiers transmis
    const effectiveUserId = req.user.id;
    const isOwner =
      document.user && document.user.toString() === effectiveUserId.toString();
    const isAdmin = isCabinetStaff(req.user.role);
    const isPartenaire = req.user.role === 'partenaire';
    
    // Pour partenaire, vérifier si le document appartient à un dossier transmis ET accepté
    let hasAccessViaTransmission = false;
    if (isPartenaire && document.dossierId) {
      const dossier = document.dossierId;
      // Si le populate n'a pas fonctionné, récupérer le dossier séparément
      if (!dossier || !dossier.transmittedTo || !Array.isArray(dossier.transmittedTo)) {
        const Dossier = require('../models/Dossier');
        const dossierId = dossier?._id || dossier || document.dossierId;
        const fullDossier = await Dossier.findById(dossierId)
          .populate('transmittedTo.partenaire', '_id');
        if (fullDossier && fullDossier.transmittedTo && Array.isArray(fullDossier.transmittedTo)) {
          hasAccessViaTransmission = fullDossier.transmittedTo.some(trans => {
            if (!trans || !trans.partenaire) return false;
            const transPartenaireId = trans.partenaire._id ? trans.partenaire._id.toString() : trans.partenaire.toString();
            // Accepter pending et accepted, mais pas refused
            return transPartenaireId === effectiveUserId.toString() && trans.status !== 'refused';
          });
        }
      } else {
        hasAccessViaTransmission = dossier.transmittedTo.some(trans => {
          if (!trans || !trans.partenaire) return false;
          // Gérer les cas où partenaire est un ObjectId ou un objet peuplé
          const transPartenaireId = trans.partenaire._id ? trans.partenaire._id.toString() : trans.partenaire.toString();
          // Accepter pending et accepted, mais pas refused
          return transPartenaireId === effectiveUserId.toString() && trans.status !== 'refused';
        });
      }
    }

    const isDossierOwnerClient = await canClientAccessDocumentViaOwningDossier(document, req.user);
    
    if (!isOwner && !isAdmin && !hasAccessViaTransmission && !isDossierOwnerClient) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce document'
      });
    }

    if (req.user.role === 'client') {
      const canViewContent = await canClientViewDocumentContent(document, req.user);
      if (!canViewContent) {
        return res.status(403).json({
          success: false,
          message: 'Ce document est confidentiel et réservé à l’administration.'
        });
      }
    }

    const served = await sendDocumentToClient(document, res, { inline: false });
    if (served) return;

    return res.status(404).json({
      success: false,
      code: 'FILE_NOT_FOUND',
      message: 'Fichier non trouvé sur le serveur. Le fichier peut être absent du disque local - récupérez-le depuis le VPS ou re-téléversez le document.',
    });
  } catch (error) {
    console.error('Erreur lors du téléchargement du document:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   PATCH /api/user/documents/:id
// @desc    Renommer / mettre à jour les métadonnées d’un document
// @access  Private (propriétaire ou admin)
router.patch('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Identifiant de document invalide' });
    }

    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document non trouvé' });
    }

    const effectiveUserId = req.user.id || req.user._id;
    if (!effectiveUserId) {
      return res.status(401).json({ success: false, message: 'Session invalide' });
    }

    const ownerId = document.user != null ? String(document.user) : null;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const isPartenaire = req.user.role === 'partenaire';
    if (ownerId && ownerId !== String(effectiveUserId) && !isAdmin && !isPartenaire) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé à ce document' });
    }

    const { nom, description, compartiment } = req.body || {};

    if (compartiment !== undefined) {
      if (compartiment === null || compartiment === '') {
        document.compartiment = null;
      } else if (mongoose.Types.ObjectId.isValid(compartiment)) {
        document.compartiment = compartiment;
      }
    }

    if (nom !== undefined) {
      const trimmed = String(nom).trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: 'Le nom du document est requis' });
      }
      // Préserver l'extension réelle du fichier si le nouveau nom n'en a pas (ou une incorrecte)
      const realExt =
        pickFileExtension(document.originalName, document.nomFichier, document.cheminFichier) ||
        pickFileExtension(document.nom);
      const newExt = pickFileExtension(trimmed);
      if (realExt && !newExt) {
        document.nom = `${trimmed}${realExt}`;
      } else if (realExt && newExt && newExt !== realExt) {
        document.nom = `${trimmed.slice(0, -newExt.length)}${realExt}`;
      } else {
        document.nom = trimmed;
      }
    }
    if (description !== undefined) {
      document.description = String(description || '').trim();
    }

    await document.save();

    return res.json({
      success: true,
      message: 'Document mis à jour.',
      document,
    });
  } catch (error) {
    console.error('Erreur PATCH document:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   PATCH /api/user/documents/:id/visibility
// @desc    Autoriser ou restreindre l’accès client à un document (admin)
// @access  Private (Admin, Superadmin)
router.patch('/:id/visibility', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Identifiant de document invalide' });
    }

    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document non trouvé' });
    }

    const { visibleToClient, confidentialReason } = req.body || {};
    if (visibleToClient !== undefined) {
      document.visibleToClient = parseBoolean(visibleToClient, true);
    }
    if (confidentialReason !== undefined) {
      document.confidentialReason = String(confidentialReason || '').trim();
    }
    if (document.visibleToClient === true) {
      document.confidentialReason = '';
    }

    await document.save();

    return res.json({
      success: true,
      message: document.visibleToClient
        ? 'Le document est désormais visible pour le client.'
        : 'Le document est marqué comme confidentiel pour le client.',
      document,
    });
  } catch (error) {
    console.error('Erreur PATCH visibility document:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   DELETE /api/user/documents/:id
// @desc    Supprimer un document
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Identifiant de document invalide' });
    }

    // Ne pas populate('user') : si le compte a été supprimé, user devient null et .toString() provoque un 500.
    const document = await Document.findById(req.params.id).populate('dossierId', 'titre numero');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document non trouvé'
      });
    }

    const effectiveUserId = req.user.id || req.user._id;
    if (!effectiveUserId) {
      return res.status(401).json({ success: false, message: 'Session invalide' });
    }

    const ownerId = document.user != null ? String(document.user) : null;
    if (!ownerId) {
      return res.status(400).json({
        success: false,
        message: 'Document sans propriétaire valide',
      });
    }

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (ownerId !== String(effectiveUserId) && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce document'
      });
    }

    // Ajouter le document à la corbeille avant suppression
    try {
      const Trash = require('../models/Trash');
      const documentData = document.toObject();
      
      await Trash.create({
        itemType: 'document',
        originalId: document._id,
        itemData: documentData,
        deletedBy: effectiveUserId,
        originalOwner: document.user,
        origin: req.headers.referer || 'unknown',
        metadata: {
          nom: document.nom,
          dossierId: document.dossierId?._id || document.dossierId,
          dossierTitre: document.dossierId?.titre || document.dossierId?.numero
        }
      });
      console.log('✅ Document ajouté à la corbeille:', document._id);
    } catch (trashError) {
      console.error('⚠️ Erreur lors de l\'ajout à la corbeille (continuation de la suppression):', trashError);
      // Continuer la suppression même si l'ajout à la corbeille échoue
    }

    // Archivage S3 (copie vers archive/) au lieu de suppression définitive
    if (isS3StoragePath(document.cheminFichier)) {
      const hardDelete = String(process.env.DOCUMENT_S3_HARD_DELETE || '').toLowerCase() === 'true';
      try {
        if (hardDelete) {
          await deleteS3Object(document.cheminFichier);
          console.log('✅ Fichier supprimé sur S3 (hard delete):', document.cheminFichier);
        } else {
          const archiveUri = await archiveS3Object(document.cheminFichier);
          console.log('✅ Fichier archivé sur S3:', archiveUri || document.cheminFichier);
        }
      } catch (s3Err) {
        console.warn('⚠️ Archivage/suppression S3 échouée:', s3Err.message);
      }
    }

    // Suppression sur Cloudinary (uniquement si configuré + URL Cloudinary + public_id fiable)
    if (
      hasCloudinaryConfig &&
      document.cheminFichier &&
      document.cheminFichier.startsWith('http') &&
      document.cheminFichier.includes('res.cloudinary.com')
    ) {
      try {
        const publicId = cloudinaryPublicIdFromUrl(document.cheminFichier);
        if (publicId) {
          const resourceType = document.cheminFichier.includes('/raw/upload/') ? 'raw' : 'image';
          await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
          console.log('✅ Fichier supprimé sur Cloudinary:', publicId, resourceType);
        } else {
          console.warn('⚠️ Impossible d’extraire le public_id Cloudinary:', document.cheminFichier);
        }
      } catch (cloudErr) {
        console.warn('⚠️ Suppression Cloudinary échouée:', cloudErr.message);
      }
    }

    // Supprimer le document de la base de données
    await document.deleteOne();

    // Logger l'action (userEmail requis par le schéma - comptes téléphone seulement sans email)
    try {
      const actorEmail =
        req.user.email || req.user.phone || (req.user.name ? String(req.user.name) : '') || 'inconnu';
      await Log.create({
        user: effectiveUserId,
        userEmail: actorEmail,
        action: 'document_deleted',
        description: `${actorEmail} a supprimé le document "${document.nom || document.nomFichier || 'sans nom'}"`,
        ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
        userAgent: req.get('user-agent'),
        metadata: {
          documentId: document._id.toString(),
          nom: document.nom
        }
      });
    } catch (logError) {
      console.error('Erreur lors de l\'enregistrement du log:', logError);
    }

    res.json({
      success: true,
      message: 'Document supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du document:', error);
    if (error.name === 'CastError' || error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Requête de suppression invalide',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// ─── Compartiments ────────────────────────────────────────────────────────────

// @route   GET /api/user/documents/compartiments?dossierId=xxx
// @access  Private (staff + partenaire)
router.get('/compartiments', async (req, res) => {
  try {
    const { dossierId } = req.query;
    if (!dossierId || !mongoose.Types.ObjectId.isValid(dossierId)) {
      return res.status(400).json({ success: false, message: 'dossierId requis et valide' });
    }
    const compartiments = await DocumentCompartiment.find({ dossier: dossierId })
      .sort({ ordre: 1, createdAt: 1 });
    return res.json({ success: true, compartiments });
  } catch (error) {
    console.error('Erreur GET compartiments:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   POST /api/user/documents/compartiments
// @access  Private (admin/superadmin)
router.post('/compartiments', authorize('admin', 'superadmin', 'partenaire'), async (req, res) => {
  try {
    const { dossierId, nom } = req.body || {};
    if (!dossierId || !mongoose.Types.ObjectId.isValid(dossierId)) {
      return res.status(400).json({ success: false, message: 'dossierId requis et valide' });
    }
    const trimmed = String(nom || '').trim();
    if (!trimmed) {
      return res.status(400).json({ success: false, message: 'Nom du compartiment requis' });
    }
    const maxOrdre = await DocumentCompartiment.findOne({ dossier: dossierId })
      .sort({ ordre: -1 }).select('ordre').lean();
    const ordre = maxOrdre ? (maxOrdre.ordre || 0) + 1 : 0;
    const compartiment = await DocumentCompartiment.create({
      dossier: dossierId,
      nom: trimmed,
      ordre,
      createdBy: req.user.id,
    });
    return res.status(201).json({ success: true, compartiment });
  } catch (error) {
    console.error('Erreur POST compartiment:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   PATCH /api/user/documents/compartiments/:id
// @access  Private (admin/superadmin)
router.patch('/compartiments/:id', authorize('admin', 'superadmin', 'partenaire'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const compartiment = await DocumentCompartiment.findById(req.params.id);
    if (!compartiment) {
      return res.status(404).json({ success: false, message: 'Compartiment non trouve' });
    }
    const { nom } = req.body || {};
    if (nom !== undefined) {
      const trimmed = String(nom).trim();
      if (!trimmed) return res.status(400).json({ success: false, message: 'Nom requis' });
      compartiment.nom = trimmed;
    }
    await compartiment.save();
    return res.json({ success: true, compartiment });
  } catch (error) {
    console.error('Erreur PATCH compartiment:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   DELETE /api/user/documents/compartiments/:id
// @access  Private (admin/superadmin)
router.delete('/compartiments/:id', authorize('admin', 'superadmin', 'partenaire'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const compartiment = await DocumentCompartiment.findById(req.params.id);
    if (!compartiment) {
      return res.status(404).json({ success: false, message: 'Compartiment non trouve' });
    }
    // Dé-classer les documents qui étaient dans ce compartiment
    await Document.updateMany({ compartiment: compartiment._id }, { $set: { compartiment: null } });
    await compartiment.deleteOne();
    return res.json({ success: true, message: 'Compartiment supprime, documents deplaces vers Non classes' });
  } catch (error) {
    console.error('Erreur DELETE compartiment:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

async function deliverDocumentFileResponse(document, res) {
  const served = await sendDocumentToClient(document, res, { inline: false });
  if (served) return;
  return res.status(404).json({
    success: false,
    code: 'FILE_NOT_FOUND',
    message: 'Fichier non trouvé',
  });
}

module.exports = router;
module.exports.deliverDocumentFileResponse = deliverDocumentFileResponse;
module.exports.resolveDocumentDownloadFileName = resolveDocumentDownloadFileName;
module.exports.resolveDocumentDisplayTitle = resolveDocumentDisplayTitle;


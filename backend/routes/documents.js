const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const User = require('../models/User');
const Log = require('../models/Log');
const { protect, authorize } = require('../middleware/auth');

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
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

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

const cloudinaryStorage = hasCloudinaryConfig
  ? new CloudinaryStorage({
      cloudinary,
      params: async (req, file) => {
        const isImage = (file.mimetype || '').startsWith('image/');
        return {
          folder: 'pawlegal/documents',
          resource_type: isImage ? 'image' : 'raw',
          public_id: `${Date.now()}-${(file.originalname || 'document').replace(/[^a-zA-Z0-9]/g, '_')}`,
        };
      },
    })
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, localDocumentsDir),
      filename: (req, file, cb) => {
        const safeName = (file.originalname || 'document')
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .replace(/_+/g, '_');
        cb(null, `${Date.now()}-${safeName}`);
      },
    });

// Filtre permissif: accepter tous les types de fichiers
const fileFilter = (req, file, cb) => {
  cb(null, true);
};

const upload = multer({
  storage: cloudinaryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
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
    
    const documents = await Document.find(query)
      .populate('user', 'firstName lastName email')
      .populate('dossierId', 'titre numero')
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
    
    // Vérifier l'accès
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const isOwner = dossier.user && dossier.user.toString() === req.user.id.toString();
    const isAssigned = dossier.assignedTo && dossier.assignedTo.toString() === req.user.id.toString();
    const isPartenaire = req.user.role === 'partenaire';
    
    let hasAccess = isAdmin || isOwner || isAssigned;
    
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
    const documents = await Document.find({ dossierId: dossierId })
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
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

    const { nom, description, categorie, dossierId } = req.body;
    const effectiveUserId = req.user.id;
    const safeCategorie = normalizeCategorie(categorie);

    console.log('📤 Données du document:', {
      userId: effectiveUserId,
      nom: nom || req.file.originalname,
      dossierId: dossierId,
      categorieRecue: categorie,
      categorieNormalisee: safeCategorie
    });

    // Stocker un chemin relatif stable pour éviter les erreurs selon le cwd du serveur
    const documentData = {
      user: effectiveUserId,
      nom: nom || req.file.originalname,
      // `nomFichier` est indexé/unique côté DB : utiliser le nom de fichier généré par multer (timestamp)
      // pour éviter les doublons lorsque l'utilisateur upload plusieurs fois le même fichier original.
      nomFichier: req.file.filename,
      cheminFichier: req.file.path, // URL Cloudinary
      typeMime: req.file.mimetype,
      taille: req.file.size,
      description: description || '',
      categorie: safeCategorie
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

// Rôles cabinet avec accès lecture à tous les documents
const isCabinetStaff = (role) =>
  role === 'admin' || role === 'superadmin' || role === 'secretaire';

// @route   GET /api/user/documents/:id/preview
// @desc    Prévisualiser un document (retourne le fichier avec headers pour affichage)
// @access  Private — auth via middleware protect (Bearer ou ?token=)
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
    
    console.log('🔐 Vérification des permissions:', {
      isOwner,
      isAdmin,
      isPartenaire,
      isTransmittedToPartenaire,
      documentUserId,
      currentUserId,
      userRole: user.role,
      dossierId: document.dossierId?._id || document.dossierId
    });

    if (!isOwner && !isAdmin && !isTransmittedToPartenaire) {
      console.error('❌ Accès refusé - Pas propriétaire, pas admin/secrétaire, et pas partenaire autorisé');
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce document'
      });
    }

    // Gérer Cloudinary (URL http/https) ET stockage local (chemin disque)
    const fileUrl = document.cheminFichier;
    let contentType = document.typeMime || 'application/octet-stream';
    if (!document.typeMime && (document.nom || '').toLowerCase().endsWith('.pdf')) {
      contentType = 'application/pdf';
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.nom)}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (fileUrl && fileUrl.startsWith('http')) {
      // Récupérer le fichier depuis Cloudinary et le streamer
      const https = require('https');
      const http = require('http');
      const protocol = fileUrl.startsWith('https') ? https : http;
      console.log('✅ Prévisualisation — stream Cloudinary:', fileUrl);
      protocol.get(fileUrl, (stream) => {
        stream.pipe(res);
      }).on('error', (err) => {
        console.error('❌ Erreur stream Cloudinary:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Erreur lecture du fichier' });
        }
      });
      return;
    }

    // Fichier local
    const localPath = await resolveDocumentPhysicalPath(document);
    if (!localPath) {
      return res.status(404).json({
        success: false,
        code: 'FILE_NOT_FOUND',
        message: 'Fichier non trouvé'
      });
    }
    console.log('✅ Prévisualisation — fichier local:', localPath);
    return res.sendFile(localPath);
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
    const isOwner = document.user.toString() === effectiveUserId.toString();
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
    
    if (!isOwner && !isAdmin && !hasAccessViaTransmission) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce document'
      });
    }

    const fileUrl = document.cheminFichier;
    if (fileUrl && fileUrl.startsWith('http')) {
      console.log('✅ Téléchargement — redirect Cloudinary:', fileUrl);
      return res.redirect(fileUrl);
    }

    const localPath = await resolveDocumentPhysicalPath(document);
    if (!localPath) {
      return res.status(404).json({
        success: false,
        code: 'FILE_NOT_FOUND',
        message: 'Fichier non trouvé'
      });
    }

    console.log('✅ Téléchargement — fichier local:', localPath);
    return res.download(localPath, document.nom || document.nomFichier || 'document');
  } catch (error) {
    console.error('Erreur lors du téléchargement du document:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// @route   DELETE /api/user/documents/:id
// @desc    Supprimer un document
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate('user', 'firstName lastName email')
      .populate('dossierId', 'titre numero');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document non trouvé'
      });
    }

    // Vérifier les permissions
    const effectiveUserId = req.user.id;
    if (document.user.toString() !== effectiveUserId.toString() && 
        req.user.role !== 'admin' && 
        req.user.role !== 'superadmin') {
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
        originalOwner: document.user._id || document.user,
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

// Suppression sur Cloudinary
if (document.cheminFichier && document.cheminFichier.startsWith('http')) {
  try {
    const urlParts = document.cheminFichier.split('/');
    const publicIdWithExt = urlParts.slice(-2).join('/'); // folder/filename
    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, ''); // sans extension
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    console.log('✅ Fichier supprimé sur Cloudinary:', publicId);
  } catch (cloudErr) {
    console.warn('⚠️ Suppression Cloudinary échouée:', cloudErr.message);
  }
}

    // Supprimer le document de la base de données
    await document.deleteOne();

    // Logger l'action
    try {
      const effectiveUserId = req.user.id;
      const effectiveUser = req.user;
      await Log.create({
        user: effectiveUserId,
        userEmail: effectiveUser?.email || req.user.email,
        action: 'document_deleted',
        description: `${effectiveUser?.email || req.user.email} a supprimé le document "${document.nom}"`,
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
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

module.exports = router;


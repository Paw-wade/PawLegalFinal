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

const searchFileInUploads = (targetNames = []) => {
  try {
    if (!fs.existsSync(UPLOADS_ROOT)) return null;
    const normalizedTargets = targetNames
      .filter(Boolean)
      .map((n) => path.basename(String(n)).toLowerCase());
    if (normalizedTargets.length === 0) return null;

    // Recherche récursive pour récupérer des fichiers migrés/manuellement déplacés
    const entries = fs.readdirSync(UPLOADS_ROOT, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const entryName = entry.name.toLowerCase();
      if (normalizedTargets.includes(entryName)) {
        const parent = entry.parentPath || UPLOADS_ROOT;
        const candidate = path.join(parent, entry.name);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ Recherche fallback uploads échouée:', e.message);
  }
  return null;
};

const resolveExistingDocumentPath = (storedPath, fileName) => {
  if (!storedPath) return null;

  const rawPath = String(storedPath).trim();
  if (!rawPath) return null;

  const normalized = rawPath.replace(/[\\/]+/g, path.sep);
  const withoutLeadingSep = normalized.replace(new RegExp(`^\\${path.sep}+`), '');
  const uploadsRelative = withoutLeadingSep.replace(/^uploads[\\/]+documents[\\/]+/i, '');
  const filenameOnly = fileName || path.basename(normalized);

  const candidates = [
    path.isAbsolute(normalized) ? normalized : null,
    path.resolve(BACKEND_ROOT, normalized),
    path.resolve(BACKEND_ROOT, withoutLeadingSep),
    path.resolve(BACKEND_ROOT, 'uploads', 'documents', uploadsRelative),
    path.resolve(BACKEND_ROOT, 'uploads', 'documents', filenameOnly),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (e) {
      // ignore and continue
    }
  }

  // Fallback final: scanner tous les fichiers uploads par nom
  const foundByName = searchFileInUploads([fileName, path.basename(normalized)]);
  if (foundByName) return foundByName;

  return null;
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
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/documents');
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Générer un nom de fichier unique avec timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, name + '-' + uniqueSuffix + ext);
  }
});

// Filtre pour accepter seulement certains types de fichiers
const fileFilter = (req, file, cb) => {
  // Types de fichiers autorisés
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Types acceptés: PDF, images (JPG, PNG), Word, Excel'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB max
  },
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
    const relativeStoredPath = path.relative(BACKEND_ROOT, req.file.path);

    const documentData = {
      user: effectiveUserId,
      nom: nom || req.file.originalname,
      nomFichier: req.file.filename,
      cheminFichier: relativeStoredPath || req.file.path,
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
    if (req.file && req.file.path) {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log('🗑️ Fichier temporaire supprimé:', req.file.path);
        }
      } catch (unlinkError) {
        console.error('⚠️ Erreur lors de la suppression du fichier temporaire:', unlinkError);
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

// @route   GET /api/user/documents/:id/preview
// @desc    Prévisualiser un document (retourne le fichier avec headers pour affichage)
// @access  Private (peut accepter token en query param pour iframe)
router.get('/:id/preview', async (req, res) => {
  try {
    console.log('📄 Prévisualisation demandée pour le document:', req.params.id);
    console.log('📄 Headers Authorization:', req.headers.authorization ? 'Présent' : 'Absent');
    console.log('📄 Query token:', req.query.token ? 'Présent' : 'Absent');
    
    // Vérifier l'authentification manuellement pour permettre le token en query param
    const jwt = require('jsonwebtoken');
    let token;
    
    // Priorité 1: Token dans les headers Authorization
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('✅ Token récupéré depuis les headers');
    } 
    // Priorité 2: Token en query parameter
    else if (req.query.token) {
      token = req.query.token;
      console.log('✅ Token récupéré depuis query parameter');
    }
    
    if (!token) {
      console.log('❌ Aucun token fourni pour la prévisualisation');
      return res.status(401).json({
        success: false,
        message: 'Non autorisé, token manquant'
      });
    }
    
    // Vérifier le token
    let decoded;
    try {
      const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-here';
      console.log('🔑 Vérification du token avec JWT_SECRET:', jwtSecret ? 'Défini' : 'Non défini (utilisation de la valeur par défaut)');
      decoded = jwt.verify(token, jwtSecret);
      console.log('✅ Token valide, utilisateur ID:', decoded.id);
    } catch (jwtError) {
      console.error('❌ Erreur de vérification JWT:', jwtError.name, jwtError.message);
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expiré, veuillez vous reconnecter'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Token invalide'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Erreur d\'authentification'
      });
    }
    
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      console.error('❌ Utilisateur non trouvé pour le token:', decoded.id);
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    if (!user.isActive) {
      console.error('❌ Utilisateur inactif:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Compte utilisateur désactivé'
      });
    }
    
    console.log('✅ Utilisateur authentifié:', user.email, 'Rôle:', user.role);
    
    const document = await Document.findById(req.params.id)
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
      console.error('❌ Document non trouvé:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Document non trouvé'
      });
    }

    console.log('📄 Document trouvé:', document.nom, 'Propriétaire:', document.user?.email || 'N/A');

    // Vérifier les permissions
    const documentUserId = document.user?._id?.toString() || document.user?.toString() || document.user?.toString();
    const currentUserId = user._id.toString();
    
    const isOwner = documentUserId === currentUserId;
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
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
      console.error('❌ Accès refusé - Pas propriétaire, pas admin, et pas partenaire autorisé');
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce document'
      });
    }

    // Vérifier que le fichier existe
    const filePath = resolveExistingDocumentPath(document.cheminFichier, document.nomFichier);
    console.log('📁 Chemin du fichier résolu:', filePath, 'chemin stocké:', document.cheminFichier);
    
    if (!filePath) {
      console.error('❌ Fichier non trouvé sur le serveur. chemin stocké:', document.cheminFichier);
      return res.status(404).json({
        success: false,
        message: 'Fichier non trouvé sur le serveur'
      });
    }

    console.log('✅ Fichier trouvé, envoi en cours...');

    // Déterminer le Content-Type correct
    let contentType = document.typeMime || 'application/octet-stream';
    if (contentType === 'application/octet-stream' && document.nom.toLowerCase().endsWith('.pdf')) {
      contentType = 'application/pdf';
    }

    // Définir les headers pour la prévisualisation (pas le téléchargement)
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.nom)}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache pour 1 heure
    res.setHeader('X-Content-Type-Options', 'nosniff'); // Empêcher le sniffing de type
    
    // Pour les PDF, ajouter des headers supplémentaires pour une meilleure compatibilité
    if (contentType === 'application/pdf') {
      res.setHeader('Accept-Ranges', 'bytes');
    }
    
    // Envoyer le fichier
    res.sendFile(filePath, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(document.nom)}"`,
      }
    }, (err) => {
      if (err) {
        console.error('❌ Erreur lors de l\'envoi du fichier:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Erreur lors de la prévisualisation du fichier',
            error: err.message
          });
        }
      } else {
        console.log('✅ Fichier envoyé avec succès');
      }
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
    const isOwner = document.user.toString() === effectiveUserId.toString();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
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

    // Vérifier que le fichier existe
    const filePath = resolveExistingDocumentPath(document.cheminFichier, document.nomFichier);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: 'Fichier non trouvé sur le serveur'
      });
    }

    // Déterminer le Content-Type correct
    let contentType = document.typeMime || 'application/octet-stream';
    if (contentType === 'application/octet-stream' && document.nom.toLowerCase().endsWith('.pdf')) {
      contentType = 'application/pdf';
    }

    // Définir les headers pour le téléchargement
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.nom)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Envoyer le fichier tel quel (binaire intact)
    res.sendFile(filePath, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(document.nom)}"`,
      }
    }, (err) => {
      if (err) {
        console.error('Erreur lors du téléchargement:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Erreur lors du téléchargement du fichier'
          });
        }
      }
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

    // Supprimer le fichier du système de fichiers
    const filePath = resolveExistingDocumentPath(document.cheminFichier, document.nomFichier);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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


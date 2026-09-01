const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadDocumentToRemoteStorage, removeLocalUploadTempFile } = require('./documentRemoteUpload');
const { resolveCabinetForUser } = require('./cabinetResolver');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const localDir = path.join(BACKEND_ROOT, 'uploads', 'documents');
if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, localDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${(file.originalname || 'document').replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * Persiste un fichier téléversé comme Document rattaché au dossier
 * (stockage distant + création du Document). Retourne le Document créé.
 */
async function persistDocumentForDossier(file, { dossierId, ownerUserId, contributorName, nom, reason }) {
  const cabinet = await resolveCabinetForUser(ownerUserId);
  let cheminFichier;
  try {
    cheminFichier = await uploadDocumentToRemoteStorage(file, {
      backendRoot: BACKEND_ROOT, s3Prefix: cabinet?.s3Prefix || null, uploadToCloudinary: () => null,
    });
  } catch (e) {
    removeLocalUploadTempFile(file);
    throw e;
  }
  const Document = require('../models/Document');
  const docNom = String(nom || file.originalname || 'Document').trim().slice(0, 500);
  return Document.create({
    user: ownerUserId, nom: docNom, nomFichier: file.filename, originalName: file.originalname,
    cheminFichier, typeMime: file.mimetype, taille: file.size, dossierId,
    cabinetId: cabinet?._id || null, visibleToClient: false,
    confidentialReason: reason || 'Pièce déposée pour la constitution — en attente de validation.',
    uploadedViaGuestLink: true, guestContributorName: String(contributorName || '').slice(0, 200),
  });
}

module.exports = { upload, persistDocumentForDossier, BACKEND_ROOT };

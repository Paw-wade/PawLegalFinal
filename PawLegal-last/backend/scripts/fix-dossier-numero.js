/**
 * Script de migration pour corriger les numéros de dossiers
 * Ce script :
 * 1. Supprime l'ancien index unique sur numero s'il existe
 * 2. Génère des numéros pour les dossiers qui n'en ont pas
 * 3. Crée un nouvel index sparse unique sur numero
 */

const mongoose = require('mongoose');
require('dotenv').config();

const DossierSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  clientNom: String,
  clientPrenom: String,
  clientEmail: String,
  clientTelephone: String,
  numero: String,
  titre: String,
  description: String,
  categorie: String,
  type: String,
  statut: String,
  priorite: String,
  dateEcheance: Date,
  documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  rendezVous: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RendezVous' }],
  notes: String,
  motifRefus: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: Date,
  updatedAt: Date
}, { collection: 'dossiers' });

const Dossier = mongoose.model('Dossier', DossierSchema);

async function fixDossierNumero() {
  try {
    // Connexion à MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    // Supprimer l'ancien index unique sur numero s'il existe
    try {
      await Dossier.collection.dropIndex('numero_1');
      console.log('✅ Ancien index numero_1 supprimé');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️  L\'index numero_1 n\'existe pas, on continue');
      } else {
        throw error;
      }
    }

    // Trouver tous les dossiers sans numéro
    const dossiersSansNumero = await Dossier.find({ 
      $or: [
        { numero: null },
        { numero: { $exists: false } }
      ]
    }).sort({ createdAt: 1 });

    console.log(`📋 ${dossiersSansNumero.length} dossiers sans numéro trouvés`);

    // Générer des numéros pour chaque dossier
    for (let i = 0; i < dossiersSansNumero.length; i++) {
      const dossier = dossiersSansNumero[i];
      const date = dossier.createdAt || new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const prefix = `DOS-${year}${month}${day}-`;

      // Trouver le dernier numéro du jour
      const lastDossier = await Dossier.findOne({
        numero: { $regex: `^${prefix}` }
      }).sort({ numero: -1 });

      let sequence = 1;
      if (lastDossier && lastDossier.numero) {
        const lastSequence = parseInt(lastDossier.numero.split('-')[2] || '0');
        sequence = lastSequence + 1;
      }

      // Vérifier que le numéro n'existe pas déjà
      let numero = `${prefix}${String(sequence).padStart(4, '0')}`;
      let exists = await Dossier.findOne({ numero });
      let attempts = 0;
      while (exists && attempts < 100) {
        sequence++;
        numero = `${prefix}${String(sequence).padStart(4, '0')}`;
        exists = await Dossier.findOne({ numero });
        attempts++;
      }

      dossier.numero = numero;
      await dossier.save();
      console.log(`✅ Dossier ${dossier._id} : numéro ${numero} assigné`);
    }

    // Créer le nouvel index sparse unique
    await Dossier.collection.createIndex({ numero: 1 }, { unique: true, sparse: true });
    console.log('✅ Nouvel index sparse unique sur numero créé');

    console.log('✅ Migration terminée avec succès');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    process.exit(1);
  }
}

fixDossierNumero();


const mongoose = require('mongoose');
const path = require('path');

const documentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  nom: {
    type: String,
    required: [true, 'Le nom du document est requis'],
    trim: true
  },
  nomFichier: {
    type: String,
    required: true
  },
  cheminFichier: {
    type: String,
    required: true
  },
  typeMime: {
    type: String,
    required: true
  },
  taille: {
    type: Number,
    required: true // Taille en octets
  },
  description: {
    type: String,
    trim: true
  },
  categorie: {
    type: String,
    enum: ['identite', 'titre_sejour', 'contrat', 'facture', 'autre'],
    default: 'autre'
  },
  dossierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Mettre à jour updatedAt avant de sauvegarder
documentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index pour améliorer les performances
documentSchema.index({ user: 1, createdAt: -1 });
documentSchema.index({ categorie: 1 });
documentSchema.index({ dossierId: 1 });

module.exports = mongoose.model('Document', documentSchema);



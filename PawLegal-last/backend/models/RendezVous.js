const mongoose = require('mongoose');

const rendezVousSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Optionnel pour les rendez-vous publics (non connectés)
  },
  nom: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true
  },
  prenom: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Veuillez entrer un email valide']
  },
  telephone: {
    type: String,
    required: [true, 'Le téléphone est requis'],
    trim: true
  },
  date: {
    type: Date,
    required: [true, 'La date est requise']
  },
  heure: {
    type: String,
    required: [true, 'L\'heure est requise'],
    trim: true
  },
  motif: {
    type: String,
    required: [true, 'Le motif est requis'],
    trim: true
    // Suppression de l'enum pour accepter tous les motifs du formulaire
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères']
  },
  statut: {
    type: String,
    enum: ['en_attente', 'confirme', 'annule', 'termine'],
    default: 'en_attente'
  },
  notes: {
    type: String,
    trim: true
  },
  effectue: {
    type: Boolean,
    default: false
  },
  dateEffectue: {
    type: Date
  },
  archived: {
    type: Boolean,
    default: false,
    index: true
  },
  archivedAt: {
    type: Date
  },
  dossierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier',
    required: false
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
rendezVousSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('RendezVous', rendezVousSchema);



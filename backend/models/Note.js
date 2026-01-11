const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  titre: {
    type: String,
    required: [true, 'Le titre de la note est requis'],
    trim: true
  },
  contenu: {
    type: String,
    required: [true, 'Le contenu de la note est requis'],
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Le créateur de la note est requis'],
  },
  destinataires: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    default: [] // Si vide, la note est pour toute l'équipe
  },
  // Si destinataires est vide, la note est pour toute l'équipe
  // Sinon, elle est pour les utilisateurs spécifiés
  priorite: {
    type: String,
    enum: ['basse', 'normale', 'haute', 'urgente'],
    default: 'normale'
  },
  lu: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    date: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index pour améliorer les performances
noteSchema.index({ createdAt: -1 });
noteSchema.index({ createdBy: 1 });
noteSchema.index({ 'lu.user': 1 });

// Mettre à jour updatedAt avant de sauvegarder
noteSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Note', noteSchema);


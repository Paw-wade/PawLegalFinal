const mongoose = require('mongoose');

const creneauSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'La date est requise'],
    index: true
  },
  heure: {
    type: String,
    required: [true, 'L\'heure est requise'],
    trim: true
  },
  ferme: {
    type: Boolean,
    default: false
  },
  motifFermeture: {
    type: String,
    trim: true
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

// Index composé pour améliorer les performances
creneauSchema.index({ date: 1, heure: 1 }, { unique: true });
creneauSchema.index({ date: 1, ferme: 1 });

// Mettre à jour updatedAt avant de sauvegarder
creneauSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Creneau', creneauSchema);



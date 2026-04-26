const mongoose = require('mongoose');

const temoignageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'utilisateur est requis']
  },
  nom: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true
  },
  role: {
    type: String,
    default: 'Client',
    trim: true
  },
  texte: {
    type: String,
    required: [true, 'Le texte du témoignage est requis'],
    trim: true,
    maxlength: [500, 'Le témoignage ne peut pas dépasser 500 caractères']
  },
  note: {
    type: Number,
    required: [true, 'La note est requise'],
    min: [1, 'La note doit être au moins 1'],
    max: [5, 'La note ne peut pas dépasser 5']
  },
  valide: {
    type: Boolean,
    default: false
  },
  validePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  dateValidation: {
    type: Date
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
temoignageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Temoignage', temoignageSchema);




const mongoose = require('mongoose');

const documentRequestSchema = new mongoose.Schema({
  dossier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier',
    required: true
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  documentType: {
    type: String,
    required: true,
    enum: ['identite', 'titre_sejour', 'contrat', 'facture', 'passeport', 'justificatif_domicile', 'avis_imposition', 'autre'],
    default: 'autre'
  },
  documentTypeLabel: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    trim: true
  },
  isUrgent: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'received'],
    default: 'pending'
  },
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    default: null
  },
  sentAt: {
    type: Date,
    default: null
  },
  receivedAt: {
    type: Date,
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
documentRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index pour améliorer les performances
documentRequestSchema.index({ dossier: 1, status: 1 });
documentRequestSchema.index({ requestedFrom: 1, status: 1 });
documentRequestSchema.index({ requestedBy: 1 });
documentRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DocumentRequest', documentRequestSchema);




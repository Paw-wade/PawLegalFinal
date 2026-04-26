const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'login',
      'logout',
      'user_created',
      'user_updated',
      'user_deleted',
      'user_activated',
      'user_deactivated',
      'profile_updated',
      'password_changed',
      'appointment_created',
      'appointment_updated',
      'appointment_deleted',
      'dossier_created',
      'dossier_updated',
      'dossier_deleted',
      'document_uploaded',
      'document_deleted',
      'message_sent',
      'temoignage_created',
      'temoignage_validated',
      'temoignage_deleted',
      'other'
    ]
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetUserEmail: {
    type: String
  },
  description: {
    type: String,
    required: true
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index pour améliorer les performances des requêtes
logSchema.index({ createdAt: -1 });
logSchema.index({ user: 1, createdAt: -1 });
logSchema.index({ action: 1, createdAt: -1 });
logSchema.index({ targetUser: 1, createdAt: -1 });

module.exports = mongoose.model('Log', logSchema);



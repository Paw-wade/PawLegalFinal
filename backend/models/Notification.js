const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'dossier_created',
      'dossier_updated',
      'dossier_deleted',
      'dossier_status_changed',
      'dossier_assigned',
      'dossier_transmitted',
      'dossier_acknowledged',
      'document_uploaded',
      'appointment_created',
      'appointment_updated',
      'appointment_cancelled',
      'message_received',
      'message_read',
      'message_sent',
      'account_created',
      'other'
    ]
  },
  titre: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  lien: {
    type: String // URL vers la ressource concernée
  },
  lu: {
    type: Boolean,
    default: false
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

// Index pour améliorer les performances
notificationSchema.index({ user: 1, lu: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);



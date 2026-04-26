const mongoose = require('mongoose');
const { sendPushToUser } = require('../utils/pushService');

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
      'draft_access_granted',
      'document_request',
      'document_received',
      'forum_thread_created',
      'forum_reply_created',
      'tarification_choice_requested',
      'tarification_payment_reminder',
      'other'
    ]
  },
  titre: {
    type: String,
    required: true
  },
  // Compatibilité legacy (anciens appels backend)
  title: {
    type: String
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
  // Compatibilité legacy (anciens appels backend)
  data: {
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

notificationSchema.pre('validate', function (next) {
  // Compatibilité legacy: certains appels utilisent encore title/data.
  if (!this.titre && this.title) {
    this.titre = this.title;
  }
  if ((!this.metadata || Object.keys(this.metadata || {}).length === 0) && this.data) {
    this.metadata = this.data;
  }
  next();
});

notificationSchema.pre('save', function (next) {
  this._wasNew = this.isNew;
  next();
});

notificationSchema.post('save', async function (doc) {
  if (!this._wasNew) return;
  try {
    await sendPushToUser(doc.user, {
      title: doc.titre || 'Nouvelle notification',
      body: doc.message || '',
      url: doc.lien || '/client/notifications',
      icon: '/ada-papers-logo.png',
      badge: '/ada-papers-logo.png',
      tag: `notif-${doc._id}`,
      metadata: {
        notificationId: String(doc._id),
        type: doc.type,
      },
    });
  } catch (error) {
    console.error('Erreur envoi push sur création notification:', error?.message || error);
  }
});

module.exports = mongoose.model('Notification', notificationSchema);



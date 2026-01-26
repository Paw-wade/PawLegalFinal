const mongoose = require('mongoose');

const smsHistorySchema = new mongoose.Schema({
  to: {
    type: String,
    required: [true, 'Le numéro de téléphone est requis'],
    trim: true,
    index: true
  },
  message: {
    type: String,
    required: [true, 'Le message est requis']
  },
  templateCode: {
    type: String,
    trim: true,
    index: true
  },
  templateName: {
    type: String,
    trim: true
  },
  variables: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed', 'undelivered'],
    default: 'pending',
    index: true
  },
  twilioSid: {
    type: String,
    trim: true,
    index: true
  },
  twilioStatus: {
    type: String,
    trim: true
  },
  error: {
    type: String,
    trim: true
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  sentToUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  context: {
    type: String,
    enum: ['appointment', 'dossier', 'message', 'account', 'task', 'otp', 'manual', 'other'],
    default: 'other'
  },
  contextId: {
    type: String,
    trim: true
  },
  cost: {
    type: Number,
    default: 0
  },
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  deliveredAt: {
    type: Date
  }
});

// Index pour faciliter les recherches
smsHistorySchema.index({ sentAt: -1 });
smsHistorySchema.index({ to: 1, sentAt: -1 });
smsHistorySchema.index({ sentToUser: 1, sentAt: -1 });
smsHistorySchema.index({ status: 1, sentAt: -1 });
smsHistorySchema.index({ context: 1, contextId: 1 });

module.exports = mongoose.model('SmsHistory', smsHistorySchema);


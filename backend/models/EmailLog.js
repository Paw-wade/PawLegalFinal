const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  eventKey: {
    type: String,
    default: 'manual',
    trim: true,
    index: true,
  },
  to: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  toName: {
    type: String,
    default: '',
    trim: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
  },
  htmlContent: {
    type: String,
    default: '',
  },
  textContent: {
    type: String,
    default: '',
  },
  templateCode: {
    type: String,
    default: '',
    trim: true,
    index: true,
  },
  variables: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  status: {
    type: String,
    enum: ['sent', 'failed'],
    default: 'sent',
    index: true,
  },
  provider: {
    type: String,
    default: 'brevo',
  },
  providerMessageId: {
    type: String,
    default: '',
  },
  error: {
    type: String,
    default: '',
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

emailLogSchema.index({ createdAt: -1, status: 1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);


const mongoose = require('mongoose');

const emailEventSettingSchema = new mongoose.Schema({
  eventKey: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  label: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  category: {
    type: String,
    enum: ['account', 'dossier', 'message', 'payment', 'task', 'system', 'other'],
    default: 'other',
  },
  templateCode: {
    type: String,
    required: true,
    trim: true,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  cooldownSec: {
    type: Number,
    default: 0,
    min: 0,
  },
  conditions: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

emailEventSettingSchema.index({ enabled: 1, category: 1 });

emailEventSettingSchema.pre('save', function saveHook(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('EmailEventSetting', emailEventSettingSchema);


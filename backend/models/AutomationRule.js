'use strict';
const mongoose = require('mongoose');

const actionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['notification_inapp', 'email', 'sms'],
    required: true,
  },
  destinataire: {
    type: String,
    enum: ['client', 'admin_assigne'],
    required: true,
  },
  titre: { type: String, trim: true },
  message: { type: String, trim: true, required: true },
}, { _id: false });

const automationRuleSchema = new mongoose.Schema({
  statutDeclencheur: {
    type: String,
    trim: true,
    required: true,
  },
  actions: {
    type: [actionSchema],
    validate: {
      validator: (v) => Array.isArray(v) && v.length > 0,
      message: 'Au moins une action est requise.',
    },
  },
  actif: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

automationRuleSchema.index({ statutDeclencheur: 1, actif: 1 });

module.exports = mongoose.model('AutomationRule', automationRuleSchema);

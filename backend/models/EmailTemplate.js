const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Le code du template est requis'],
    unique: true,
    trim: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Le nom du template est requis'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  subject: {
    type: String,
    required: [true, 'Le sujet est requis'],
    trim: true,
  },
  htmlContent: {
    type: String,
    required: [true, 'Le contenu HTML est requis'],
  },
  textContent: {
    type: String,
    default: '',
  },
  variables: [{
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    example: { type: String, default: '', trim: true },
  }],
  category: {
    type: String,
    enum: ['account', 'dossier', 'message', 'payment', 'task', 'system', 'other'],
    default: 'other',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isSystem: {
    type: Boolean,
    default: false,
  },
  version: {
    type: Number,
    default: 1,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

emailTemplateSchema.index({ code: 1, isActive: 1 });
emailTemplateSchema.index({ category: 1 });

emailTemplateSchema.pre('save', function saveHook(next) {
  this.updatedAt = Date.now();
  if (!this.isNew) this.version += 1;
  next();
});

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);


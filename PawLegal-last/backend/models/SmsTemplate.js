const mongoose = require('mongoose');

const smsTemplateSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Le code du template est requis'],
    unique: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Le nom du template est requis'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Le message est requis'],
    trim: true
  },
  variables: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    example: {
      type: String,
      trim: true
    }
  }],
  category: {
    type: String,
    enum: ['appointment', 'dossier', 'message', 'account', 'task', 'other'],
    default: 'other'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isSystem: {
    type: Boolean,
    default: false // Templates système ne peuvent pas être supprimés
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

// Index pour faciliter la recherche
smsTemplateSchema.index({ code: 1, isActive: 1 });
smsTemplateSchema.index({ category: 1 });

// Mettre à jour updatedAt avant de sauvegarder
smsTemplateSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('SmsTemplate', smsTemplateSchema);


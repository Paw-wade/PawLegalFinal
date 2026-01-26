const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    required: [true, 'Le sujet est requis'],
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Le message est requis'],
    trim: true
  },
  documents: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    }
  }],
  lu: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false // Rendre optionnel pour éviter les erreurs avec les anciens messages
    },
    luAt: {
      type: Date,
      default: Date.now
    }
  }],
  repondu: {
    type: Boolean,
    default: false
  },
  reponse: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index pour améliorer les performances
messageSchema.index({ email: 1, createdAt: -1 });
messageSchema.index({ lu: 1, createdAt: -1 });
messageSchema.index({ repondu: 1, createdAt: -1 });

// Mettre à jour updatedAt avant de sauvegarder
messageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Message', messageSchema);



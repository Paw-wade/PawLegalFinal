const mongoose = require('mongoose');

const messageInterneSchema = new mongoose.Schema({
  expediteur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Destinataire principal (un seul pour les messages admin, tous les admins pour les messages utilisateur)
  destinataires: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  // Copie (CC) - pour les messages admin uniquement
  copie: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Type de message: 'user_to_admins' ou 'admin_to_user' ou 'admin_to_admin' ou 'professional_to_admin'
  typeMessage: {
    type: String,
    enum: ['user_to_admins', 'admin_to_user', 'admin_to_admin', 'professional_to_admin'],
    default: 'user_to_admins'
  },
  // Dossier auquel le message est lié (optionnel pour les réponses)
  dossierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier',
    required: false, // Rendre optionnel pour permettre les réponses sans dossier
    index: true
  },
  // Thread ID (identifiant unique du fil de discussion) - OBLIGATOIRE
  threadId: {
    type: String,
    required: [true, 'Le threadId est requis'],
    index: true
  },
  // Message parent (pour les fils de discussion)
  messageParent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MessageInterne',
    required: false,
    index: true
  },
  sujet: {
    type: String,
    required: [true, 'Le sujet est requis'],
    trim: true
  },
  contenu: {
    type: String,
    required: [true, 'Le contenu est requis'],
    trim: true
  },
  piecesJointes: [{
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
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  lu: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    luAt: {
      type: Date,
      default: Date.now
    }
  }],
  archive: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    archiveAt: {
      type: Date,
      default: Date.now
    }
  }],
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
messageInterneSchema.index({ expediteur: 1, createdAt: -1 });
messageInterneSchema.index({ destinataires: 1, createdAt: -1 });
messageInterneSchema.index({ 'lu.user': 1 });

// Middleware pour mettre à jour updatedAt
messageInterneSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('MessageInterne', messageInterneSchema);


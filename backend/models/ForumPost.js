const mongoose = require('mongoose');

const forumPostSchema = new mongoose.Schema({
  thread: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ForumThread',
    required: true,
  },
  parentPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ForumPost',
    default: null,
  },
  body: {
    type: String,
    required: [true, 'Le contenu est requis'],
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  guestName: {
    type: String,
    trim: true,
    maxlength: [120, 'Le nom ne peut pas dépasser 120 caractères'],
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isRejected: {
    type: Boolean,
    default: false,
  },
  verifiedAt: {
    type: Date,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  rejectedAt: {
    type: Date,
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // Liste des utilisateurs qui ont aimé cette réponse
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  likedByKeys: [{
    type: String,
    trim: true,
  }],
});

forumPostSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('ForumPost', forumPostSchema);


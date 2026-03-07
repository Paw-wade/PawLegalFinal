const mongoose = require('mongoose');

const forumThreadSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Le titre est requis'],
    trim: true,
    maxlength: [200, 'Le titre ne peut pas dépasser 200 caractères'],
  },
  body: {
    type: String,
    required: [true, 'Le contenu est requis'],
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  tags: [{
    type: String,
    trim: true,
  }],
  status: {
    type: String,
    enum: ['open', 'closed', 'archived', 'resolved'],
    default: 'open',
  },
  viewsCount: {
    type: Number,
    default: 0,
  },
  repliesCount: {
    type: Number,
    default: 0,
  },
  lastReplyAt: {
    type: Date,
  },
  lastReplyBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  isPinned: {
    type: Boolean,
    default: false,
  },
});

forumThreadSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('ForumThread', forumThreadSchema);


const mongoose = require('mongoose');

const standaloneTarificationRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    adminSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    motif: {
      type: String,
      trim: true,
      required: true,
      maxlength: 1000,
    },
    amount: {
      type: Number,
      min: 0,
      required: false,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'refused', 'cancelled', 'expired'],
      default: 'pending',
      index: true,
    },
    respondedAt: {
      type: Date,
      required: false,
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    lastReminderAt: {
      type: Date,
      required: false,
    },
    reminderCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    cancelledAt: {
      type: Date,
      required: false,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

standaloneTarificationRequestSchema.index({ user: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('StandaloneTarificationRequest', standaloneTarificationRequestSchema);


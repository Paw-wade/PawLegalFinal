const mongoose = require('mongoose');

const lexiaPawAiAttachmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    threadId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 260,
    },
    mimeType: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    size: {
      type: Number,
      default: 0,
    },
    storagePath: {
      type: String,
      required: true,
      trim: true,
    },
    extractedText: {
      type: String,
      default: '',
    },
    extractionNote: {
      type: String,
      default: '',
      maxlength: 500,
    },
    empty: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

lexiaPawAiAttachmentSchema.index({ user: 1, threadId: 1, createdAt: 1 });

module.exports = mongoose.model('LexiaPawAiAttachment', lexiaPawAiAttachmentSchema);

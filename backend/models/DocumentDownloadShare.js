const mongoose = require('mongoose');

const documentDownloadShareSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true, maxlength: 64 },
    resourceType: {
      type: String,
      enum: ['document', 'recours_template'],
      required: true,
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipientEmail: { type: String, trim: true, lowercase: true, default: '' },
    message: { type: String, trim: true, maxlength: 2000, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    downloadCount: { type: Number, default: 0, min: 0 },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DocumentDownloadShare', documentDownloadShareSchema);

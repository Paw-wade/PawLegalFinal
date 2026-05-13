const mongoose = require('mongoose');

const dossierGuestUploadInviteSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true, maxlength: 64 },
    dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipientEmail: { type: String, trim: true, lowercase: true, required: true },
    message: { type: String, trim: true, maxlength: 2000, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    uploadsCount: { type: Number, default: 0, min: 0 },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DossierGuestUploadInvite', dossierGuestUploadInviteSchema);

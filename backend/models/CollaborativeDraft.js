const mongoose = require('mongoose');

const collaborativeDraftSchema = new mongoose.Schema(
  {
    dossier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dossier',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      // Contenu riche (JSON TipTap/Slate ou HTML string)
      type: mongoose.Schema.Types.Mixed,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Visibilité & permissions
    visibleToAdmins: {
      type: Boolean,
      default: true,
    },
    excludedAdminIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Accès partenaire: visibilité + édition
    partnerAccess: [
      {
        partner: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        canEdit: {
          type: Boolean,
          default: false,
        },
      },
    ],
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

collaborativeDraftSchema.index({ dossier: 1, createdAt: -1 });

module.exports = mongoose.model('CollaborativeDraft', collaborativeDraftSchema);


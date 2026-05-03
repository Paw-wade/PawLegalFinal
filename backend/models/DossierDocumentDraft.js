const mongoose = require('mongoose');

/** Brouillon « document en préparation » lié à un dossier (entité dédiée, distincte des pièces jointes `Document`). */
const dossierDocumentDraftSchema = new mongoose.Schema(
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
    /** Contenu rédactionnel (HTML simple ou texte). */
    body: {
      type: String,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Date d’échéance souhaitée (rappel / pilotage), optionnelle. */
    dueDate: {
      type: Date,
      default: null,
    },
    /** Marqué comme terminé par l’équipe (pilotage). */
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

dossierDocumentDraftSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('DossierDocumentDraft', dossierDocumentDraftSchema);

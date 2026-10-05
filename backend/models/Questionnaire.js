const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['texte_court', 'texte_long', 'choix_unique', 'choix_multiple', 'date', 'fichier', 'section'],
      required: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 500 },
    requis: { type: Boolean, default: false },
    options: [{ type: String, trim: true }],
    typesAcceptes: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const questionnaireSchema = new mongoose.Schema(
  {
    titre: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    questions: [questionSchema],
    token: { type: String, required: true, unique: true, index: true },
    statut: {
      type: String,
      enum: ['brouillon', 'actif', 'clos'],
      default: 'brouillon',
    },
    dossier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dossier',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Questionnaire', questionnaireSchema);

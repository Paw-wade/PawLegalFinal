const mongoose = require('mongoose');

const fichierReponseSchema = new mongoose.Schema(
  {
    nomOriginal: { type: String, trim: true },
    nomStocke: { type: String },
    url: { type: String },
    taille: { type: Number },
    typeMime: { type: String, default: 'application/octet-stream' },
    rattacheCommeDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      default: null,
    },
  },
  { _id: true }
);

const reponseItemSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    valeur: { type: mongoose.Schema.Types.Mixed, default: null },
    fichiers: [fichierReponseSchema],
  },
  { _id: false }
);

const questionnaireReponseSchema = new mongoose.Schema(
  {
    questionnaire: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Questionnaire',
      required: true,
      index: true,
    },
    reponses: [reponseItemSchema],
    expediteur: {
      nom: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, default: '' },
      tel: { type: String, trim: true, default: '' },
    },
    dossierRattache: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dossier',
      default: null,
    },
    lu: { type: Boolean, default: false },
    ipSoumission: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('QuestionnaireReponse', questionnaireReponseSchema);

const mongoose = require('mongoose');

const dossierPawAiRunSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    prompt: { type: String, required: true },
    isDefaultPrompt: { type: Boolean, default: false },
    outputMarkdown: { type: String, default: '' },
    provider: { type: String, default: '' },
    resolvedProvider: { type: String, default: '' },
    sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const dossierPawAiStateSchema = new mongoose.Schema(
  {
    dossierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dossier',
      required: true,
      unique: true,
      index: true,
    },
    extractionStatus: {
      type: String,
      enum: ['idle', 'running', 'ready', 'error'],
      default: 'idle',
    },
    extractionError: { type: String, default: '' },
    extractedAt: { type: Date },
    documentFingerprints: {
      type: [
        {
          documentId: String,
          updatedAt: Date,
          charCount: Number,
          fileName: String,
        },
      ],
      default: [],
    },
    corpusText: { type: String, default: '' },
    corpusMeta: {
      type: {
        documentCount: Number,
        totalChars: Number,
        filesProcessed: Number,
        filesSkipped: Number,
      },
      default: () => ({}),
    },
    runs: { type: [dossierPawAiRunSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DossierPawAiState', dossierPawAiStateSchema);

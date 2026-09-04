const mongoose = require('mongoose');

/**
 * Historique Paw AI (Lexia) par compte - synchronisation multi-appareils.
 * Tableau `threads` validé côté route avant écriture (taille / forme).
 */
const lexiaPawAiStateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    threads: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LexiaPawAiState', lexiaPawAiStateSchema);

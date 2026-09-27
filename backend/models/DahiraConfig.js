const mongoose = require('mongoose');

const DahiraConfigSchema = new mongoose.Schema(
  {
    reglementUrl: { type: String, default: '' },
    reglementNom: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DahiraConfig', DahiraConfigSchema);

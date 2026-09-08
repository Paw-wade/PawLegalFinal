const mongoose = require('mongoose');

const parrainageSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true, trim: true },
    prenom: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    banque: { type: String, default: 'BNP Paribas', trim: true },
    traite: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Parrainage', parrainageSchema);

const mongoose = require('mongoose');

/** Une fiche de constitution remplie (données + type), rattachée à un dossier. */
const ficheConstitutionSchema = new mongoose.Schema({
  dossier: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  typeFiche: { type: String, required: true, trim: true }, // ex. 'sarl'
  titre: { type: String, trim: true, default: '' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  filledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // client connecté (si compte)
  viaGuestLink: { type: Boolean, default: false }, // rempli via le lien de suivi (sans compte)
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ficheConstitutionSchema.pre('save', function (next) { this.updatedAt = Date.now(); next(); });

module.exports = mongoose.model('FicheConstitution', ficheConstitutionSchema);

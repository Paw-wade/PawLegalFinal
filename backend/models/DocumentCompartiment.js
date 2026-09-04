const mongoose = require('mongoose');

const documentCompartimentSchema = new mongoose.Schema({
  dossier: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true },
  nom: { type: String, required: true, trim: true, maxlength: 100 },
  ordre: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

documentCompartimentSchema.index({ dossier: 1, ordre: 1 });

module.exports = mongoose.model('DocumentCompartiment', documentCompartimentSchema);

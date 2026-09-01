const mongoose = require('mongoose');

/** Pièce à fournir (document à téléverser) dans la checklist de constitution. */
const pieceRequestSchema = new mongoose.Schema({
  dossier: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  libelle: { type: String, required: true, trim: true },
  nature: { type: String, enum: ['identite', 'casier', 'statuts', 'procuration', 'autre'], default: 'autre' },
  pourPersonne: { type: String, trim: true, default: '' },
  note: { type: String, trim: true, default: '' },
  statut: { type: String, enum: ['a_fournir', 'fourni', 'annulee'], default: 'a_fournir', index: true },
  document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
  fourniAt: { type: Date, default: null },
});

module.exports = mongoose.model('PieceRequest', pieceRequestSchema);

const mongoose = require('mongoose');

/** Demande faite par l'équipe au demandeur de remplir une fiche (ex. SARL). */
const ficheRequestSchema = new mongoose.Schema({
  dossier: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  typeFiche: { type: String, required: true, trim: true }, // ex. 'sarl'
  titre: { type: String, trim: true, default: '' },        // libellé lisible (ex. « Fiche SARL »)
  pourPersonne: { type: String, trim: true, default: '' },  // état civil : nom de la personne concernée
  message: { type: String, trim: true, default: '' },       // consigne éventuelle
  statut: { type: String, enum: ['a_remplir', 'remplie', 'annulee'], default: 'a_remplir', index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  fiche: { type: mongoose.Schema.Types.ObjectId, ref: 'FicheConstitution', default: null }, // fiche remplie liée
  createdAt: { type: Date, default: Date.now },
  remplieAt: { type: Date, default: null },
});

module.exports = mongoose.model('FicheRequest', ficheRequestSchema);

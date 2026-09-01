const mongoose = require('mongoose');

/**
 * Invitation ciblée : le demandeur invite une personne (associé/gérant) à remplir
 * une/des fiche(s) précise(s) et/ou déposer un document, via un lien qui ne donne
 * accès QU'À ces éléments (pas au reste du dossier).
 */
const ficheInviteSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  dossier: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  personne: { type: String, trim: true, default: '' },
  ficheRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FicheRequest' }],
  allowUpload: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdViaGuest: { type: Boolean, default: false }, // généré depuis le lien de suivi
  revokedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('FicheInvite', ficheInviteSchema);

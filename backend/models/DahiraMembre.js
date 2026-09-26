const mongoose = require('mongoose');

const DahiraMembreSchema = new mongoose.Schema(
  {
    photo: { type: String }, // base64 data-URL redimensionnee
    nom: { type: String, required: true, trim: true, maxlength: 100 },
    prenom: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    telephone: { type: String, trim: true, maxlength: 30 },
    adresse: { type: String, trim: true, maxlength: 300 },
    situationProfessionnelle: { type: String, trim: true, maxlength: 200 },
    niveauEtudes: { type: String, trim: true, maxlength: 100 },
    intituleFormation: { type: String, trim: true, maxlength: 200 },
    categorieMembre: {
      type: String,
      enum: ['actif', 'adherent', 'sympathisant'],
      required: true,
    },
    statutAnciennete: {
      type: String,
      enum: ['nouveau', '1_3_ans', 'plus_3_ans'],
      required: true,
    },
    dateAdhesionApprox: { type: String, maxlength: 10 },
    commissions: {
      type: [String],
      validate: {
        validator: (v) => v.length <= 8,
        message: 'Maximum 8 commissions',
      },
    },
    competences: { type: String, trim: true, maxlength: 1000 },
    disponibilite: { type: String, trim: true, maxlength: 300 },
    engagementCommission: { type: Boolean, required: true },
    consentementDonnees: { type: Boolean, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DahiraMembre', DahiraMembreSchema);

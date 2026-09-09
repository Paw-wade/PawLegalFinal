const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const banqueOptionSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true, trim: true },
    type: { type: String, enum: ['formulaire', 'lien'], required: true },
    url: { type: String, trim: true, default: '' },
    label: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const stepSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    titre: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    deadline: { type: String, trim: true, default: '' },
    cost: { type: String, trim: true, default: '' },
    links: { type: [linkSchema], default: [] },
    warningNote: { type: String, trim: true, default: '' },
    promoNote: { type: String, trim: true, default: '' },
    special: { type: String, enum: ['banque', ''], default: '' },
    banqueOptions: { type: [banqueOptionSchema], default: [] },
  },
  { _id: false }
);

const bonPlanSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    titre: { type: String, required: true, trim: true },
    categorie: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    lien: { type: String, trim: true, default: null },
    portee_geographique: { type: String, trim: true, default: 'national' },
    date_verification: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const guideConfigSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    titre: { type: String, required: true, trim: true },
    intro: { type: String, trim: true, default: '' },
    steps: { type: [stepSchema], default: [] },
    bonsPlans: { type: [bonPlanSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GuideConfig', guideConfigSchema);

const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    /** @deprecated Préférer `domains` — conservé pour compatibilité */
    domain: {
      type: String,
      trim: true,
      lowercase: true,
    },
    domains: {
      type: [String],
      default: [],
      index: true,
    },
    mongoUri: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['trial', 'active', 'suspended'],
      default: 'trial',
      index: true,
    },
    organizationType: {
      type: String,
      enum: ['law_firm', 'consulting', 'association', 'institutional', 'other'],
      default: 'law_firm',
      index: true,
    },
    organizationTypeOther: { type: String, trim: true, default: '' },
    branding: {
      name: { type: String, required: true, trim: true },
      logo: { type: String, default: '' },
      primaryColor: { type: String, default: '#2A4DD0' },
      favicon: { type: String, default: '' },
    },
    email: {
      from: { type: String, default: '' },
      brevoApiKey: { type: String, default: '' },
      replyTo: { type: String, default: '' },
    },
    landingPage: {
      headline: { type: String, default: '' },
      subheadline: { type: String, default: '' },
      cta: { type: String, default: 'Accéder à mon espace' },
    },
    limits: {
      maxUsers: { type: Number, default: 50 },
      maxStorageGb: { type: Number, default: 20 },
      modules: {
        type: [String],
        default: ['dossiers', 'messagerie', 'documents', 'rendez-vous'],
      },
    },
  },
  { timestamps: true }
);

organizationSchema.index({ domains: 1, status: 1 });

/**
 * Modèle Organization — uniquement sur la connexion base maître.
 */
function getOrganizationModel() {
  const { getMasterConnection } = require('../lib/db/master');
  const conn = getMasterConnection();
  if (!conn.models.Organization) {
    conn.model('Organization', organizationSchema);
  }
  return conn.models.Organization;
}

module.exports = {
  organizationSchema,
  getOrganizationModel,
};

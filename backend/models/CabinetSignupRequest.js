const mongoose = require('mongoose');

const ORGANIZATION_TYPES = [
  'law_firm',
  'consulting',
  'association',
  'institutional',
  'other',
];

const STATUS_VALUES = ['pending', 'in_review', 'approved', 'rejected'];

const cabinetSignupRequestSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: 'pending',
      index: true,
    },
    organizationType: {
      type: String,
      enum: ORGANIZATION_TYPES,
      required: true,
      index: true,
    },
    organizationTypeOther: { type: String, trim: true, default: '' },
    structureName: { type: String, required: true, trim: true },
    contactName: { type: String, required: true, trim: true },
    contactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    phone: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    barreau: { type: String, trim: true, default: '' },
    siret: { type: String, trim: true, default: '' },
    teamSize: { type: String, trim: true, default: '' },
    practiceArea: { type: String, trim: true, default: '' },
    desiredSlug: { type: String, trim: true, lowercase: true, default: '' },
    desiredDomains: { type: String, trim: true, default: '' },
    message: { type: String, trim: true, default: '' },
    gdprConsent: { type: Boolean, required: true },
    source: { type: String, trim: true, default: 'web_onboarding' },
    organizationSlug: { type: String, trim: true, lowercase: true, default: '' },
    reviewedBy: { type: String, trim: true, default: '' },
    reviewedAt: { type: Date },
    rejectReason: { type: String, trim: true, default: '' },
    internalNotes: { type: String, trim: true, default: '' },
    meta: {
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

cabinetSignupRequestSchema.index({ createdAt: -1 });

function getCabinetSignupRequestModel() {
  const { getMasterConnection } = require('../lib/db/master');
  const conn = getMasterConnection();
  if (!conn.models.CabinetSignupRequest) {
    conn.model('CabinetSignupRequest', cabinetSignupRequestSchema);
  }
  return conn.models.CabinetSignupRequest;
}

module.exports = {
  ORGANIZATION_TYPES,
  STATUS_VALUES,
  cabinetSignupRequestSchema,
  getCabinetSignupRequestModel,
};

const ORGANIZATION_TYPES = ['law_firm', 'consulting', 'association', 'institutional', 'other'];

const { ORGANIZATION_TYPE_LABELS } = require('./cabinetSignupLabels');

function organizationTypeLabel(type, typeOther) {
  if (!type) return '';
  if (type === 'other' && typeOther?.trim()) return typeOther.trim();
  return ORGANIZATION_TYPE_LABELS[type] || type;
}

function validateOrganizationType(body) {
  const organizationType = String(body.organizationType || '').trim();
  if (!organizationType) {
    return { ok: false, message: 'organizationType requis' };
  }
  if (!ORGANIZATION_TYPES.includes(organizationType)) {
    return { ok: false, message: 'Type d\'organisation invalide' };
  }
  const organizationTypeOther = String(body.organizationTypeOther || '').trim();
  if (organizationType === 'other' && !organizationTypeOther) {
    return { ok: false, message: 'Précisez le type lorsque « Autre » est sélectionné' };
  }
  return { ok: true, organizationType, organizationTypeOther };
}

module.exports = {
  ORGANIZATION_TYPES,
  organizationTypeLabel,
  validateOrganizationType,
};

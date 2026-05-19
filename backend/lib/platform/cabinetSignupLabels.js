const ORGANIZATION_TYPE_LABELS = {
  law_firm: "Cabinet d'avocats",
  consulting: 'Cabinet de conseil / accompagnement',
  association: 'Association / ONG',
  institutional: 'Structure institutionnelle',
  other: 'Autre',
};

const STATUS_LABELS = {
  pending: 'En attente',
  in_review: 'En cours',
  approved: 'Acceptée',
  rejected: 'Refusée',
};

const TEAM_SIZE_LABELS = {
  '1-5': '1 à 5 personnes',
  '6-20': '6 à 20 personnes',
  '21+': 'Plus de 20 personnes',
};

function toSignupRequestDto(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id),
    status: o.status,
    statusLabel: STATUS_LABELS[o.status] || o.status,
    organizationType: o.organizationType,
    organizationTypeLabel:
      o.organizationType === 'other' && o.organizationTypeOther
        ? o.organizationTypeOther
        : ORGANIZATION_TYPE_LABELS[o.organizationType] || o.organizationType,
    organizationTypeOther: o.organizationTypeOther || '',
    structureName: o.structureName,
    contactName: o.contactName,
    contactEmail: o.contactEmail,
    phone: o.phone || '',
    city: o.city || '',
    barreau: o.barreau || '',
    siret: o.siret || '',
    teamSize: o.teamSize || '',
    teamSizeLabel: TEAM_SIZE_LABELS[o.teamSize] || o.teamSize || '',
    practiceArea: o.practiceArea || '',
    desiredSlug: o.desiredSlug || '',
    desiredDomains: o.desiredDomains || '',
    message: o.message || '',
    organizationSlug: o.organizationSlug || '',
    reviewedBy: o.reviewedBy || '',
    reviewedAt: o.reviewedAt || null,
    rejectReason: o.rejectReason || '',
    internalNotes: o.internalNotes || '',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

module.exports = {
  ORGANIZATION_TYPE_LABELS,
  STATUS_LABELS,
  TEAM_SIZE_LABELS,
  toSignupRequestDto,
};

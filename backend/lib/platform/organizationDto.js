function maskMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/:([^:@/]+)@/, ':***@');
}

function normalizeDomains(org) {
  if (org.domains?.length) {
    return org.domains.map((d) => String(d).trim().toLowerCase()).filter(Boolean);
  }
  if (org.domain) {
    return [String(org.domain).trim().toLowerCase()];
  }
  return [];
}

/**
 * @param {object} org — document lean ou mongoose
 * @param {{ maskSecrets?: boolean }} [opts]
 */
function toOrganizationDto(org, opts = {}) {
  const maskSecrets = opts.maskSecrets !== false;
  const o = org.toObject ? org.toObject() : org;
  const domains = normalizeDomains(o);
  return {
    id: String(o._id),
    slug: o.slug,
    status: o.status,
    domains,
    domain: domains[0] || '',
    mongoUri: maskSecrets ? maskMongoUri(o.mongoUri) : o.mongoUri,
    hasMongoUri: Boolean(o.mongoUri),
    branding: o.branding || {},
    email: maskSecrets
      ? {
          from: o.email?.from || '',
          replyTo: o.email?.replyTo || '',
          hasBrevoApiKey: Boolean(o.email?.brevoApiKey),
        }
      : o.email || {},
    landingPage: o.landingPage || {},
    limits: o.limits || {},
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s || !SLUG_PATTERN.test(s)) {
    return 'Slug invalide (lettres minuscules, chiffres et tirets uniquement).';
  }
  return null;
}

module.exports = {
  maskMongoUri,
  normalizeDomains,
  toOrganizationDto,
  validateSlug,
  SLUG_PATTERN,
};

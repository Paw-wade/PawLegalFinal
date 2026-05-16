const { getOrganizationModel } = require('../../models/Organization');

/** Cache court pour éviter un hit maître à chaque requête */
const orgCache = new Map();
const ORG_CACHE_TTL_MS = Number(process.env.TENANT_ORG_CACHE_TTL_MS) || 60_000;

function normalizeHost(raw) {
  if (!raw) return '';
  const host = String(raw).trim().toLowerCase();
  const colon = host.indexOf(':');
  return colon > -1 ? host.slice(0, colon) : host;
}

function cacheKey(host, slug) {
  return slug ? `slug:${slug}` : `host:${host}`;
}

function getCached(key) {
  const entry = orgCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > ORG_CACHE_TTL_MS) {
    orgCache.delete(key);
    return null;
  }
  return entry.org;
}

function setCached(key, org) {
  orgCache.set(key, { org, at: Date.now() });
}

function toPublicOrg(org) {
  if (!org) return null;
  const o = org.toObject ? org.toObject() : org;
  return {
    id: o._id.toString(),
    slug: o.slug,
    status: o.status,
    branding: o.branding,
    landingPage: o.landingPage,
    limits: {
      modules: o.limits?.modules || [],
      maxUsers: o.limits?.maxUsers,
      maxStorageGb: o.limits?.maxStorageGb,
    },
    domains: o.domains?.length ? o.domains : o.domain ? [o.domain] : [],
  };
}

/**
 * @param {import('express').Request} req
 */
async function resolveOrganizationFromRequest(req) {
  const Organization = getOrganizationModel();
  const host = normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);
  const allowSlugHeader =
    process.env.NODE_ENV !== 'production' ||
    process.env.MULTI_TENANT_ALLOW_SLUG_HEADER === 'true' ||
    process.env.MULTI_TENANT_ALLOW_SLUG_HEADER === '1';
  const slugHeader = allowSlugHeader
    ? (req.headers['x-tenant-slug'] || '').toString().trim()
    : '';

  if (slugHeader) {
    const ck = cacheKey('', slugHeader);
    const hit = getCached(ck);
    if (hit) return hit;
    const bySlug = await Organization.findOne({ slug: slugHeader.toLowerCase(), status: 'active' }).lean();
    if (bySlug) {
      setCached(ck, bySlug);
      return bySlug;
    }
  }

  if (host) {
    const ck = cacheKey(host, '');
    const hit = getCached(ck);
    if (hit) return hit;

    let org = await Organization.findOne({ domains: host, status: 'active' }).lean();
    if (!org) {
      org = await Organization.findOne({ domain: host, status: 'active' }).lean();
    }
    if (org) {
      setCached(ck, org);
      return org;
    }
  }

  const defaultSlug = (process.env.DEFAULT_ORG_SLUG || '').trim().toLowerCase();
  if (
    defaultSlug &&
    (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost'))
  ) {
    const ck = cacheKey('default', defaultSlug);
    const hit = getCached(ck);
    if (hit) return hit;
    const org = await Organization.findOne({ slug: defaultSlug, status: 'active' }).lean();
    if (org) {
      setCached(ck, org);
      return org;
    }
  }

  return null;
}

function clearOrganizationCache() {
  orgCache.clear();
}

module.exports = {
  normalizeHost,
  resolveOrganizationFromRequest,
  toPublicOrg,
  clearOrganizationCache,
};

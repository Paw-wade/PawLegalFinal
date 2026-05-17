const {
  getFrontendOriginsList,
  isLocalDevBrowserOrigin,
} = require('../../utils/frontendOrigins');
const { isMultiTenantEnabled, connectMaster } = require('../db/master');
const { getOrganizationModel } = require('../../models/Organization');

const TTL_MS = Number(process.env.TENANT_CORS_CACHE_TTL_MS) || 120_000;

/** @type {{ origins: Set<string>, loadedAt: number } | null} */
let cache = null;

function normalizeOrigin(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  try {
    if (!/^https?:\/\//i.test(s)) {
      return normalizeOrigin(`https://${s}`);
    }
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function domainsToOrigins(domains) {
  const out = new Set();
  for (const d of domains || []) {
    const host = String(d || '').trim().toLowerCase();
    if (!host) continue;
    const withPort = host.includes(':') ? host : host;
    for (const proto of ['https', 'http']) {
      const o = normalizeOrigin(`${proto}://${withPort}`);
      if (o) out.add(o);
    }
  }
  return out;
}

async function loadTenantCorsOrigins(force = false) {
  const now = Date.now();
  if (!force && cache && now - cache.loadedAt < TTL_MS) {
    return cache.origins;
  }

  const origins = new Set(getFrontendOriginsList().map(normalizeOrigin).filter(Boolean));

  if (isMultiTenantEnabled()) {
    try {
      await connectMaster();
      const Organization = getOrganizationModel();
      const orgs = await Organization.find({ status: { $in: ['active', 'trial'] } })
        .select('domains domain')
        .lean();
      for (const org of orgs) {
        const list = org.domains?.length ? org.domains : org.domain ? [org.domain] : [];
        for (const o of domainsToOrigins(list)) {
          origins.add(o);
        }
      }
    } catch (err) {
      console.warn('⚠️ CORS : impossible de charger les domaines tenants:', err.message);
    }
  }

  cache = { origins, loadedAt: now };
  return origins;
}

function isTenantCorsOriginAllowed(origin) {
  if (!origin) return true;
  if (isLocalDevBrowserOrigin(origin)) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (!cache) return getFrontendOriginsList().includes(origin);
  return cache.origins.has(normalized) || cache.origins.has(origin);
}

function startTenantCorsRefreshLoop() {
  if (!isMultiTenantEnabled()) return;
  const interval = Math.max(TTL_MS, 60_000);
  setInterval(() => {
    loadTenantCorsOrigins(true).catch((err) => {
      console.warn('⚠️ CORS refresh:', err.message);
    });
  }, interval).unref?.();
}

module.exports = {
  loadTenantCorsOrigins,
  isTenantCorsOriginAllowed,
  startTenantCorsRefreshLoop,
  normalizeOrigin,
};

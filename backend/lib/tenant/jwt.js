const jwt = require('jsonwebtoken');
const { isMultiTenantEnabled } = require('../db/master');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'your-secret-key-here';
}

function getDefaultExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '90d';
}

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {{ orgId?: string, expiresIn?: string }} [opts]
 */
function signAuthToken(userId, opts = {}) {
  const payload = { id: String(userId) };
  if (opts.orgId) {
    payload.orgId = String(opts.orgId);
  }
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: opts.expiresIn || getDefaultExpiresIn(),
  });
}

/**
 * Jeton court pour activation / inscription (sans orgId obligatoire).
 */
function signSignupActivationToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

/**
 * Vérifie que le JWT correspond au cabinet de la requête.
 * @returns {string|null} message d'erreur ou null si OK
 */
function assertTokenMatchesTenant(decoded, req) {
  if (!isMultiTenantEnabled()) {
    return null;
  }
  const path = req.originalUrl || req.url || req.path || '';
  if (path.includes('/api/platform')) {
    return null;
  }
  if (!req.tenant?.orgId) {
    return null;
  }
  if (!decoded.orgId) {
    return 'Session expirée ou cabinet non associé — veuillez vous reconnecter sur ce domaine.';
  }
  if (String(decoded.orgId) !== String(req.tenant.orgId)) {
    return 'Ce jeton d’accès n’est pas valide pour ce cabinet.';
  }
  return null;
}

function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret());
}

module.exports = {
  getJwtSecret,
  signAuthToken,
  signSignupActivationToken,
  assertTokenMatchesTenant,
  verifyAuthToken,
};

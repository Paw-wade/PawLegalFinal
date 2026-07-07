const Cabinet = require('../models/Cabinet');
const User = require('../models/User');
const { slugifyCabinetName, buildCabinetS3Prefix, slugFromS3Prefix } = require('./cabinetSlug');
const { normalizePrefix } = require('./s3DocumentStorage');

let defaultCabinetCache = null;
let defaultCabinetCacheAt = 0;
const CACHE_MS = 60_000;

function getEnvDefaultPrefix() {
  return normalizePrefix(process.env.AWS_S3_PREFIX || 'Cabinet-adapapers/');
}

async function findCabinetById(cabinetId) {
  if (!cabinetId) return null;
  return Cabinet.findOne({ _id: cabinetId, active: { $ne: false } }).lean();
}

async function getDefaultCabinet({ refresh = false } = {}) {
  if (!refresh && defaultCabinetCache && Date.now() - defaultCabinetCacheAt < CACHE_MS) {
    return defaultCabinetCache;
  }

  const slug = String(process.env.DEFAULT_CABINET_SLUG || '').trim().toLowerCase();
  let cabinet = null;

  if (slug) {
    cabinet = await Cabinet.findOne({ slug, active: { $ne: false } }).lean();
  }
  if (!cabinet) {
    const prefix = getEnvDefaultPrefix();
    const fromPrefix = slugFromS3Prefix(prefix.replace(/\/$/, ''));
    cabinet = await Cabinet.findOne({ slug: fromPrefix, active: { $ne: false } }).lean();
  }
  if (!cabinet) {
    cabinet = await Cabinet.findOne({ active: { $ne: false } }).sort({ createdAt: 1 }).lean();
  }

  defaultCabinetCache = cabinet;
  defaultCabinetCacheAt = Date.now();
  return cabinet;
}

async function resolveCabinetForUser(userOrId) {
  let user = userOrId;
  if (!user) return getDefaultCabinet();
  if (typeof user === 'string' || user._id === undefined && !user.cabinetId) {
    user = await User.findById(userOrId).select('cabinetId role').lean();
  }
  if (!user) return getDefaultCabinet();

  if (user.cabinetId) {
    const cabinet = await findCabinetById(user.cabinetId);
    if (cabinet) return cabinet;
  }

  return getDefaultCabinet();
}

async function resolveS3PrefixForUser(userOrId) {
  const cabinet = await resolveCabinetForUser(userOrId);
  if (cabinet?.s3Prefix) return normalizePrefix(cabinet.s3Prefix);
  return getEnvDefaultPrefix();
}

async function ensureDefaultCabinet() {
  const prefix = getEnvDefaultPrefix();
  const slug =
    String(process.env.DEFAULT_CABINET_SLUG || '').trim().toLowerCase() ||
    slugFromS3Prefix(prefix.replace(/\/$/, ''));
  const name = String(process.env.DEFAULT_CABINET_NAME || 'Ada Papers').trim() || 'Ada Papers';

  let cabinet = await Cabinet.findOne({ slug }).lean();
  if (!cabinet) {
    cabinet = (
      await Cabinet.create({
        name,
        slug,
        s3Prefix: prefix,
        active: true,
      })
    ).toObject();
    console.log(`✅ Cabinet par défaut créé: ${name} (${slug}) → ${prefix}`);
  }

  defaultCabinetCache = cabinet;
  defaultCabinetCacheAt = Date.now();
  return cabinet;
}

function invalidateCabinetCache() {
  defaultCabinetCache = null;
  defaultCabinetCacheAt = 0;
}

async function makeUniqueSlug(baseName, excludeId = null) {
  let slug = slugifyCabinetName(baseName);
  let candidate = slug;
  let n = 2;
  while (true) {
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    const exists = await Cabinet.findOne(q).select('_id').lean();
    if (!exists) return candidate;
    candidate = `${slug}-${n}`;
    n += 1;
  }
}

module.exports = {
  getEnvDefaultPrefix,
  findCabinetById,
  getDefaultCabinet,
  resolveCabinetForUser,
  resolveS3PrefixForUser,
  ensureDefaultCabinet,
  invalidateCabinetCache,
  makeUniqueSlug,
  buildCabinetS3Prefix,
  slugifyCabinetName,
};

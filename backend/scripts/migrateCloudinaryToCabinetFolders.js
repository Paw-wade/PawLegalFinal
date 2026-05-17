/**
 * Renomme sur Cloudinary orgs/{orgId}/… et pawlegal/… → cabinets/{slug}/…
 * et met à jour les URLs en base tenant.
 *
 * Usage :
 *   node scripts/migrateCloudinaryToCabinetFolders.js
 *   node scripts/migrateCloudinaryToCabinetFolders.js --dry-run
 *   npm run migrate:cloudinary-cabinets
 */
require('dotenv').config();
const { connectMaster, disconnectMaster, isMultiTenantEnabled } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');
const { getTenantConnection, closeAllTenantConnections } = require('../lib/db/tenants');
const { runWithTenantStore } = require('../lib/tenant/asyncContext');
const { preloadDefaultModels } = require('../lib/models/registerTenantModels');
const { applyCloudinaryConfig } = require('../lib/cloudinaryConfig');
const {
  cloudinaryPublicIdFromUrl,
  cloudinaryResourceTypeFromUrl,
  remapCloudinaryPublicId,
  rewriteCloudinaryUrl,
} = require('../lib/cloudinaryPaths');

const cloudinary = require('cloudinary').v2;
applyCloudinaryConfig(cloudinary);

const DRY_RUN = process.argv.includes('--dry-run');
const DEFAULT_WADEPAW_SLUG = 'cabinet-wadepaw';

async function buildOrgIdToSlugMap() {
  const Organization = getOrganizationModel();
  const orgs = await Organization.find({ status: 'active' }).lean();
  const map = new Map();
  for (const org of orgs) {
    map.set(org._id.toString(), org.slug);
  }
  return map;
}

async function migrateOneUrl(url, orgIdToSlug, dryRun) {
  if (!url || !String(url).includes('res.cloudinary.com')) {
    return { url, changed: false };
  }
  const publicId = cloudinaryPublicIdFromUrl(url);
  if (!publicId) return { url, changed: false };

  const newPublicId = remapCloudinaryPublicId(publicId, orgIdToSlug, DEFAULT_WADEPAW_SLUG);
  if (!newPublicId) return { url, changed: false };

  const resourceType = cloudinaryResourceTypeFromUrl(url);

  if (!dryRun) {
    try {
      await cloudinary.uploader.rename(publicId, newPublicId, {
        resource_type: resourceType,
        invalidate: true,
      });
    } catch (err) {
      if (err?.http_code === 404) {
        console.warn(`   ⚠️ Introuvable sur Cloudinary : ${publicId}`);
        return { url, changed: false, error: err.message };
      }
      if (String(err.message || '').includes('already exists')) {
        console.warn(`   ⚠️ Déjà présent : ${newPublicId}`);
      } else {
        throw err;
      }
    }
  }

  const newUrl = rewriteCloudinaryUrl(url, newPublicId, resourceType);
  return { url: newUrl, changed: true, from: publicId, to: newPublicId };
}

async function migrateTenantModels(conn, slug, orgIdToSlug) {
  const Document = conn.model('Document');
  const MessageInterne = conn.model('MessageInterne');
  const User = conn.model('User');
  let updated = 0;

  const docs = await Document.find({
    cheminFichier: /res\.cloudinary\.com/,
  }).lean();

  for (const doc of docs) {
    const result = await migrateOneUrl(doc.cheminFichier, orgIdToSlug, DRY_RUN);
    if (result.changed) {
      if (!DRY_RUN) {
        await Document.updateOne({ _id: doc._id }, { $set: { cheminFichier: result.url } });
      }
      console.log(`   📄 Document ${doc._id}: ${result.from} → ${result.to}`);
      updated += 1;
    }
  }

  const users = await User.find({
    profilePhoto: /res\.cloudinary\.com/,
  }).lean();

  for (const user of users) {
    const result = await migrateOneUrl(user.profilePhoto, orgIdToSlug, DRY_RUN);
    if (result.changed) {
      if (!DRY_RUN) {
        await User.updateOne({ _id: user._id }, { $set: { profilePhoto: result.url } });
      }
      console.log(`   👤 User ${user.email}: avatar migré`);
      updated += 1;
    }
  }

  if (conn.models.Message) {
    const contactMessages = await conn.model('Message').find({
      'documents.path': /res\.cloudinary\.com/,
    }).lean();
    for (const msg of contactMessages) {
      let dirty = false;
      const documents = (msg.documents || []).map((d) => ({ ...d }));
      for (let i = 0; i < documents.length; i++) {
        const result = await migrateOneUrl(documents[i].path, orgIdToSlug, DRY_RUN);
        if (result.changed) {
          documents[i].path = result.url;
          dirty = true;
          updated += 1;
        }
      }
      if (dirty && !DRY_RUN) {
        await conn.model('Message').updateOne({ _id: msg._id }, { $set: { documents } });
      }
    }
  }

  const messages = await MessageInterne.find({
    'piecesJointes.path': /res\.cloudinary\.com/,
  }).lean();

  for (const msg of messages) {
    let dirty = false;
    const pieces = (msg.piecesJointes || []).map((pj) => ({ ...pj }));
    for (let i = 0; i < pieces.length; i++) {
      const result = await migrateOneUrl(pieces[i].path, orgIdToSlug, DRY_RUN);
      if (result.changed) {
        pieces[i].path = result.url;
        dirty = true;
        updated += 1;
      }
    }
    if (dirty && !DRY_RUN) {
      await MessageInterne.updateOne({ _id: msg._id }, { $set: { piecesJointes: pieces } });
    }
  }

  return updated;
}

async function main() {
  if (!isMultiTenantEnabled()) {
    console.error('❌ MULTI_TENANT doit être activé.');
    process.exit(1);
  }

  applyCloudinaryConfig(cloudinary);
  const ping = await cloudinary.api.ping();
  console.log(`\n☁️  Cloudinary : ${ping.status || 'ok'}${DRY_RUN ? ' (dry-run)' : ''}\n`);

  await connectMaster();
  preloadDefaultModels();

  const orgIdToSlug = await buildOrgIdToSlugMap();
  console.log('📋 Cabinets :');
  for (const [id, s] of orgIdToSlug) {
    console.log(`   ${s} → orgs/${id} → cabinets/${s}/`);
  }
  console.log(`   pawlegal/* → cabinets/${DEFAULT_WADEPAW_SLUG}/*\n`);

  const Organization = getOrganizationModel();
  const orgs = await Organization.find({ status: 'active' }).lean();
  let total = 0;

  for (const org of orgs) {
    const orgId = org._id.toString();
    const conn = await getTenantConnection(org.mongoUri, orgId);
    console.log(`\n🏢 ${org.slug} (${orgId})`);

    const n = await runWithTenantStore(
      { connection: conn, orgId, slug: org.slug },
      () => migrateTenantModels(conn, org.slug, orgIdToSlug)
    );
    console.log(`   → ${n} entrée(s) migrée(s)`);
    total += n;
  }

  await closeAllTenantConnections();
  await disconnectMaster();

  console.log(`\n✅ Terminé : ${total} entrée(s)${DRY_RUN ? ' (simulation)' : ''}.`);
  console.log('   Nouveaux uploads : cabinets/{slug}/documents|avatars|…\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});

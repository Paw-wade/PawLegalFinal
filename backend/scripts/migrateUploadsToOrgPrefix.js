/**
 * Déplace les fichiers legacy uploads/{subdir}/ vers uploads/{orgId}/{subdir}/.
 *
 * Usage :
 *   node scripts/migrateUploadsToOrgPrefix.js [slug]
 *   npm run migrate:uploads -- cabinet-dupont
 *
 * Variables : MULTI_TENANT, MASTER_MONGODB_URI, DEFAULT_ORG_SLUG
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectMaster, disconnectMaster } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');
const { UPLOADS_ROOT, TENANT_UPLOAD_SUBDIRS } = require('../lib/tenant/uploads');

function moveDirContents(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`   ⏭️  Absent : ${src}`);
    return 0;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  let moved = 0;
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.existsSync(to)) {
      console.log(`   ⚠️  Déjà présent, ignoré : ${name}`);
      continue;
    }
    fs.renameSync(from, to);
    moved += 1;
  }
  const remaining = fs.readdirSync(src);
  if (remaining.length === 0) {
    try {
      fs.rmdirSync(src);
    } catch {
      /* non vide ou verrouillé */
    }
  }
  return moved;
}

async function main() {
  const slug = (process.argv[2] || process.env.DEFAULT_ORG_SLUG || 'cabinet-dupont').toLowerCase();
  process.env.MULTI_TENANT = 'true';

  await connectMaster();
  const Organization = getOrganizationModel();
  const org = await Organization.findOne({ slug }).lean();
  if (!org) {
    console.error(`❌ Organisation "${slug}" introuvable. Lancez npm run seed:master-orgs`);
    process.exit(1);
  }

  const orgId = org._id.toString();
  console.log(`\n📦 Migration uploads → org ${slug} (${orgId})\n`);

  let total = 0;
  for (const sub of TENANT_UPLOAD_SUBDIRS) {
    const src = path.join(UPLOADS_ROOT, sub);
    const dest = path.join(UPLOADS_ROOT, orgId, sub);
    console.log(`📁 ${sub}`);
    const n = moveDirContents(src, dest);
    console.log(`   → ${n} fichier(s) déplacé(s) vers ${dest}`);
    total += n;
  }

  console.log(`\n✅ Terminé : ${total} fichier(s) déplacé(s).`);
  console.log('   Redémarrez le backend. Les nouveaux uploads iront directement sous uploads/{orgId}/.\n');

  await disconnectMaster();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

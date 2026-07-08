/**
 * Applique les presets de permissions aux membres du staff sans fiche Permission.
 * Usage: node scripts/backfill-staff-permissions.js
 *        node scripts/backfill-staff-permissions.js --apply
 *        node scripts/backfill-staff-permissions.js --apply --force
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Permission = require('../models/Permission');
const { STAFF_ROLES, applyRolePresetForUser } = require('../utils/rolePresets');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

async function main() {
  const uri = process.env.TENANT_WADEPAW_MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const staffUsers = await User.find({ role: { $in: STAFF_ROLES } }).select('_id email role firstName lastName').lean();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const user of staffUsers) {
    const existing = await Permission.findOne({ user: user._id }).lean();
    if (existing && !FORCE) {
      skipped++;
      continue;
    }
    if (!APPLY) {
      console.log(`[dry-run] ${user.email || user._id} (${user.role}) → preset ${user.role}`);
      if (existing && FORCE) updated++;
      else created++;
      continue;
    }
    await applyRolePresetForUser(user._id, user.role, { force: FORCE });
    if (existing && FORCE) {
      updated++;
      console.log(`✅ Mis à jour: ${user.email || user._id} (${user.role})`);
    } else {
      created++;
      console.log(`✅ Créé: ${user.email || user._id} (${user.role})`);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? 'apply' : 'dry-run',
        force: FORCE,
        staffTotal: staffUsers.length,
        created,
        updated,
        skipped,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

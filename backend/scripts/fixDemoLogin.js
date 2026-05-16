/**
 * Aligne la base maître + compte admin démo (cabinet-dupont) avec le .env, puis teste le mot de passe.
 * Usage : npm run fix:demo-login
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectMaster, disconnectMaster } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');
const { clearOrganizationCache } = require('../lib/tenant/resolveOrganization');

const SLUG = 'cabinet-dupont';
const DEMO = {
  firstName: 'Admin',
  lastName: 'Dupont',
  email: 'admin@cabinet-dupont.fr',
  password: 'Dupont2025!',
  phone: '+33600000001',
  role: 'admin',
};

function maskUri(uri) {
  return String(uri || '').replace(/:[^:@/]+@/, ':***@');
}

function getUserModel(conn) {
  if (!mongoose.models.User) {
    require('../models/User');
  }
  if (!conn.models.User) {
    conn.model('User', mongoose.models.User.schema);
  }
  return conn.models.User;
}

async function main() {
  const tenantUri = (
    process.env.TENANT_DUPONT_MONGODB_URI ||
    process.env.TENANT_DUPONT_URI ||
    process.env.MONGODB_URI ||
    ''
  ).trim();

  if (!tenantUri) {
    console.error('❌ TENANT_DUPONT_MONGODB_URI ou MONGODB_URI requis.');
    process.exit(1);
  }

  process.env.MULTI_TENANT = 'true';
  await connectMaster();
  const Organization = getOrganizationModel();

  let org = await Organization.findOne({ slug: SLUG });
  if (!org) {
    console.error(`❌ Organisation "${SLUG}" absente. Lancez : npm run seed:master-orgs`);
    process.exit(1);
  }

  const prevUri = org.mongoUri;
  org.mongoUri = tenantUri;
  org.status = 'active';
  await org.save();
  clearOrganizationCache();

  console.log(`\n🏢 ${SLUG}`);
  console.log(`   mongoUri maître : ${maskUri(org.mongoUri)}`);
  if (prevUri !== tenantUri) {
    console.log('   ↻ mongoUri mis à jour depuis le .env');
  }

  const conn = await mongoose.createConnection(tenantUri).asPromise();
  const User = getUserModel(conn);
  const email = DEMO.email.toLowerCase();

  let user = await User.findOne({ email }).select('+password');
  if (!user) {
    user = await User.create({
      ...DEMO,
      email,
      isActive: true,
      profilComplete: true,
    });
    console.log(`   ✓ Compte créé : ${email}`);
  } else {
    user.password = DEMO.password;
    user.isActive = true;
    user.firstName = DEMO.firstName;
    user.lastName = DEMO.lastName;
    user.role = DEMO.role;
    user.phone = DEMO.phone;
    await user.save();
    console.log(`   ↻ Compte mis à jour (mot de passe réinitialisé) : ${email}`);
  }

  const check = await User.findOne({ email }).select('+password');
  const ok =
    typeof check.comparePassword === 'function'
      ? await check.comparePassword(DEMO.password)
      : await bcrypt.compare(DEMO.password, check.password || '');

  console.log(`\n🔐 Test mot de passe : ${ok ? '✅ OK' : '❌ ÉCHEC'}`);
  console.log(`   Base Mongo : ${conn.name}`);
  console.log('\n→ Redémarrez le serveur backend (port 3005), puis retestez le login.\n');

  await conn.close();
  await disconnectMaster();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Vérifie que l’org maître pointe vers la bonne base et que le compte démo peut se connecter.
 * Usage : node scripts/verifyTenantLogin.js [slug] [email] [password]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectMaster, disconnectMaster } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');

const slug = (process.argv[2] || 'cabinet-dupont').toLowerCase();
const email = (process.argv[3] || 'admin@cabinet-dupont.fr').toLowerCase();
const password = process.argv[4] || 'Dupont2025!';

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
  process.env.MULTI_TENANT = 'true';
  await connectMaster();
  const Organization = getOrganizationModel();
  const org = await Organization.findOne({ slug, status: 'active' }).lean();
  if (!org) {
    console.error(`❌ Organisation "${slug}" introuvable dans la base maître.`);
    console.error('   → npm run seed:master-orgs');
    process.exit(1);
  }

  console.log(`\n🏢 Organisation : ${org.slug}`);
  console.log(`   mongoUri (maître) : ${maskUri(org.mongoUri)}`);

  const envBySlug = {
    'cabinet-dupont': process.env.TENANT_DUPONT_MONGODB_URI || process.env.TENANT_DUPONT_URI,
    'cabinet-martin': process.env.TENANT_MARTIN_MONGODB_URI || process.env.TENANT_MARTIN_URI,
    'cabinet-wadepaw':
      process.env.TENANT_WADEPAW_MONGODB_URI || process.env.TENANT_WADEPAW_URI,
  };
  const envUri = envBySlug[slug]?.trim();

  if (envUri && org.mongoUri?.trim() !== envUri) {
    console.warn('\n⚠️  mongoUri en base maître ≠ variable .env pour ce cabinet');
    console.warn(`   .env : ${maskUri(envUri)}`);
    console.warn(`   → node scripts/syncTenantMongoFromEnv.js ${slug}`);
  }

  let connectUri = org.mongoUri;
  let conn;
  try {
    conn = await mongoose.createConnection(connectUri).asPromise();
  } catch (err) {
    const authFailed = /authentication failed|bad auth/i.test(String(err.message || ''));
    if (authFailed && envUri && envUri !== org.mongoUri?.trim()) {
      console.warn('\n⚠️  Échec avec l’URI en base maître — nouvel essai avec le .env…');
      connectUri = envUri;
      conn = await mongoose.createConnection(connectUri).asPromise();
    } else {
      throw err;
    }
  }
  const User = getUserModel(conn);
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    console.error(`\n❌ Utilisateur "${email}" absent dans cette base tenant.`);
    console.error('   → npm run seed:tenants');
    await conn.close();
    await disconnectMaster();
    process.exit(1);
  }

  const ok = await user.comparePassword(password);
  console.log(`\n👤 Utilisateur : ${user.email} (role=${user.role}, actif=${user.isActive})`);
  console.log(`   Mot de passe testé : ${ok ? '✅ valide' : '❌ invalide'}`);
  if (!ok) {
    console.error('   → npm run seed:tenants  (réinitialise les mots de passe démo par défaut)');
  }

  await conn.close();
  await disconnectMaster();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

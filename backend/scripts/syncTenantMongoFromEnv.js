/**
 * Réaligne le mongoUri d’un cabinet (base maître) sur le .env et teste la connexion Atlas.
 *
 * Usage :
 *   node scripts/syncTenantMongoFromEnv.js cabinet-martin
 *   node scripts/syncTenantMongoFromEnv.js cabinet-martin --from-dupont
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectMaster, disconnectMaster } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');
const { clearOrganizationCache } = require('../lib/tenant/resolveOrganization');
const { evictTenantConnection } = require('../lib/db/tenants');

const slug = (process.argv[2] || '').toLowerCase();
const fromDupont = process.argv.includes('--from-dupont');

const ENV_URI_BY_SLUG = {
  'cabinet-dupont': () =>
    process.env.TENANT_DUPONT_MONGODB_URI || process.env.TENANT_DUPONT_URI,
  'cabinet-martin': () =>
    process.env.TENANT_MARTIN_MONGODB_URI || process.env.TENANT_MARTIN_URI,
  'cabinet-wadepaw': () =>
    process.env.TENANT_WADEPAW_MONGODB_URI || process.env.TENANT_WADEPAW_URI,
};

function maskUri(uri) {
  return String(uri || '').replace(/:[^:@/]+@/, ':***@');
}

/** Indice pour comparer user + longueur du mot de passe sans l’afficher. */
function authFingerprint(uri) {
  const m = String(uri || '').match(/\/\/([^:]+):([^@]+)@/);
  if (!m) return '(pas d’auth dans l’URI)';
  return `user=${m[1]}, passLen=${m[2].length}`;
}

function martinUriFromDupontEnv() {
  const dupont =
    process.env.TENANT_DUPONT_MONGODB_URI || process.env.TENANT_DUPONT_URI || '';
  const martinDb = process.env.TENANT_MARTIN_DB_NAME || 'tenant_cabinet_martin';
  if (!dupont) return '';
  return dupont.replace(/tenant_cabinet_dupont/gi, martinDb);
}

async function testUri(label, uri) {
  if (!uri?.trim()) {
    console.log(`   ${label} : (vide)`);
    return false;
  }
  console.log(`   ${label} : ${maskUri(uri)}`);
  console.log(`   ${label} auth : ${authFingerprint(uri)}`);
  try {
    const conn = await mongoose.createConnection(uri.trim()).asPromise();
    await conn.db.admin().command({ ping: 1 });
    console.log(`   ✅ Connexion OK (db=${conn.name})`);
    await conn.close();
    return true;
  } catch (err) {
    console.log(`   ❌ ${err.message || err}`);
    return false;
  }
}

async function main() {
  if (!slug) {
    console.error('Usage: node scripts/syncTenantMongoFromEnv.js <slug> [--from-dupont]');
    process.exit(1);
  }

  process.env.MULTI_TENANT = 'true';
  await connectMaster();

  const Organization = getOrganizationModel();
  const org = await Organization.findOne({ slug });
  if (!org) {
    console.error(`❌ Organisation "${slug}" introuvable. → npm run seed:master-orgs`);
    process.exit(1);
  }

  const envResolver = ENV_URI_BY_SLUG[slug];
  let targetUri = fromDupont ? martinUriFromDupontEnv() : envResolver?.() || '';
  targetUri = String(targetUri || '').trim();

  console.log(`\n🔧 Sync mongoUri — ${slug}\n`);
  console.log('Actuel (base maître) :', maskUri(org.mongoUri));
  console.log('Actuel auth        :', authFingerprint(org.mongoUri));
  console.log('MASTER_MONGODB_URI auth :', authFingerprint(process.env.MASTER_MONGODB_URI));

  if (!targetUri) {
    console.error(`\n❌ Pas d’URI cible dans .env pour ${slug}`);
    process.exit(1);
  }

  console.log('\n── Tests de connexion ──');
  const okMasterCluster = await testUri('MASTER_MONGODB_URI', process.env.MASTER_MONGODB_URI);
  const okDupont = await testUri(
    'TENANT_DUPONT_MONGODB_URI',
    process.env.TENANT_DUPONT_MONGODB_URI || process.env.TENANT_DUPONT_URI
  );
  const okEnvTarget = await testUri(fromDupont ? 'URI dérivée Dupont→Martin' : 'URI .env cible', targetUri);
  const okCurrent = await testUri('URI actuelle (maître)', org.mongoUri);

  if (!okEnvTarget) {
    console.error(
      '\n❌ L’URI .env ne se connecte pas non plus → mot de passe Atlas invalide dans .env.'
    );
    console.error('   Atlas → Database Access → réinitialiser le mot de passe de wadepaw_db_user');
    console.error('   Puis mettre à jour MASTER_MONGODB_URI, TENANT_DUPONT_*, TENANT_MARTIN_*');
    await disconnectMaster();
    process.exit(1);
  }

  if (org.mongoUri === targetUri && okCurrent) {
    console.log('\n✅ Déjà aligné et connexion OK.');
    await disconnectMaster();
    process.exit(0);
  }

  org.mongoUri = targetUri;
  await org.save();
  clearOrganizationCache();
  evictTenantConnection(String(org._id));

  console.log('\n✅ mongoUri mis à jour en base maître :', maskUri(targetUri));
  if (!okDupont && slug !== 'cabinet-dupont') {
    console.warn('⚠️  Dupont ne se connecte pas non plus — vérifiez Atlas pour tout le cluster.');
  } else if (okDupont && !okCurrent) {
    console.log('   (L’ancienne URI en base maître avait probablement un mauvais mot de passe.)');
  }

  console.log('\n→ Redémarrez le backend, puis :');
  console.log(`   node scripts/verifyTenantLogin.js ${slug} admin@... motdepasse`);
  console.log('   npm run seed:tenants   (si utilisateurs absents)\n');

  await disconnectMaster();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

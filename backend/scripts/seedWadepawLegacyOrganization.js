/**
 * Étape 1 — Enregistre le cabinet legacy (données production historiques) dans la base maître.
 *
 * Cluster : pawlegalnew.zeenzkp.mongodb.net
 * Compte superadmin historique : wadepaw@mail.com (ou wadepaw@gmail.com selon la base)
 *
 * Usage (depuis backend/) :
 *   npm run seed:wadepaw-org
 *
 * Variables (.env) :
 *   TENANT_WADEPAW_MONGODB_URI  — URI complète (recommandé)
 *   TENANT_WADEPAW_DB_NAME      — défaut test (base production historique sur pawlegalnew)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectMaster, disconnectMaster, getMasterMongoUri } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');
const { ensureMongoUriDatabase, mongoUriHasDatabase } = require('../lib/db/mongoUri');
const { clearOrganizationCache } = require('../lib/tenant/resolveOrganization');

const SLUG = 'cabinet-wadepaw';
const LEGACY_EMAILS = ['wadepaw@mail.com', 'wadepaw@gmail.com', 'pawadmin@pawlegal.fr', 'admin@pawlegal.com'];

function maskUri(uri) {
  return String(uri || '').replace(/:[^:@/]+@/, ':***@');
}

const WADEPAW_DEFAULT_DB = 'test';

function resolveWadepawMongoUri() {
  const explicit = (process.env.TENANT_WADEPAW_MONGODB_URI || process.env.TENANT_WADEPAW_URI || '').trim();
  const base =
    explicit ||
    'mongodb+srv://ablaye:Pawlegal25@pawlegalnew.zeenzkp.mongodb.net/?appName=Pawlegalnew';
  const dbName = (process.env.TENANT_WADEPAW_DB_NAME || WADEPAW_DEFAULT_DB).trim();
  let uri = ensureMongoUriDatabase(base, dbName);
  if (!uri.includes('retryWrites=')) {
    const sep = uri.includes('?') ? '&' : '?';
    uri = `${uri}${sep}retryWrites=true&w=majority`;
  }
  return uri;
}

async function upsertOrg(Organization, doc) {
  const existing = await Organization.findOne({ slug: doc.slug });
  if (existing) {
    Object.assign(existing, doc);
    await existing.save();
    console.log(`  ↻ Mis à jour : ${doc.slug}`);
    return existing;
  }
  const created = await Organization.create(doc);
  console.log(`  ✓ Créé : ${doc.slug}`);
  return created;
}

async function verifyTenantData(mongoUri) {
  let conn;
  try {
    conn = await mongoose.createConnection(mongoUri).asPromise();
    const dbName = conn.name;
    const collections = await conn.db.listCollections().toArray();
    const names = collections.map((c) => c.name);

    let user = null;
    let matchedEmail = null;
    if (names.includes('users')) {
      const User = conn.model(
        'User',
        new mongoose.Schema({ email: String, role: String }, { strict: false }),
        'users'
      );
      for (const email of LEGACY_EMAILS) {
        user = await User.findOne({ email: email.toLowerCase() }).lean();
        if (user) {
          matchedEmail = email;
          break;
        }
      }
    }

    let dossierCount = null;
    if (names.includes('dossiers')) {
      const Dossier = conn.model('Dossier', new mongoose.Schema({}, { strict: false }), 'dossiers');
      dossierCount = await Dossier.countDocuments();
    }

    console.log(`\n🔍 Vérification tenant (${dbName}) :`);
    console.log(`   Collections : ${names.slice(0, 12).join(', ')}${names.length > 12 ? '…' : ''}`);
    if (user) {
      console.log(`   ✓ Utilisateur trouvé : ${matchedEmail} (rôle=${user.role || '?'})`);
    } else {
      console.warn(`   ⚠️  Aucun compte legacy parmi : ${LEGACY_EMAILS.join(', ')}`);
      console.warn('      Vérifiez TENANT_WADEPAW_DB_NAME ou l’URI complète.');
    }
    if (dossierCount !== null) {
      console.log(`   📁 Dossiers : ${dossierCount}`);
    }
  } catch (e) {
    console.warn(`\n⚠️  Vérification tenant impossible : ${e.message}`);
  } finally {
    if (conn) await conn.close();
  }
}

async function main() {
  process.env.MULTI_TENANT = 'true';
  const mongoUri = resolveWadepawMongoUri();

  console.log('📦 Base maître :', maskUri(getMasterMongoUri()));
  console.log('📦 Cabinet Wadepaw (legacy) :', maskUri(mongoUri));
  if (!mongoUriHasDatabase(mongoUri)) {
    console.error('❌ mongoUri sans nom de base — définissez TENANT_WADEPAW_DB_NAME=test');
    process.exit(1);
  }

  await connectMaster();
  const Organization = getOrganizationModel();

  await upsertOrg(Organization, {
    slug: SLUG,
    domain: 'wadepaw.localhost',
    domains: ['wadepaw.localhost', 'www.wadepaw.localhost', 'app.wadepaw.localhost'],
    mongoUri,
    status: 'active',
    branding: {
      name: 'Ada Papers — Cabinet Wadepaw',
      logo: '',
      primaryColor: '#2A4DD0',
    },
    email: {
      from: process.env.BREVO_SENDER_EMAIL || 'contact@adapapers.fr',
      brevoApiKey: '',
      replyTo: process.env.BREVO_SENDER_EMAIL || 'contact@adapapers.fr',
    },
    landingPage: {
      headline: 'Ada Papers — Votre espace juridique',
      subheadline: 'Cabinet historique (données production migrées)',
      cta: 'Accéder à mon espace',
    },
    limits: {
      maxUsers: 100,
      maxStorageGb: 50,
      modules: ['dossiers', 'messagerie', 'documents', 'rendez-vous', 'lexia'],
    },
  });

  clearOrganizationCache();

  console.log('\n✅ Organisation enregistrée dans la base maître.');
  console.log(`   Slug : ${SLUG}`);
  console.log('   Connexion API : X-Tenant-Slug: cabinet-wadepaw');
  console.log('   Dev hosts     : 127.0.0.1 wadepaw.localhost (optionnel)');
  console.log('\n   Prochaines étapes :');
  console.log('   2. DEFAULT_ORG_SLUG=cabinet-wadepaw (ou domaine dédié)');
  console.log('   3. Se connecter avec wadepaw@mail.com sur ce tenant');
  console.log('   4. npm run migrate:uploads -- cabinet-wadepaw (fichiers locaux si besoin)\n');

  await verifyTenantData(mongoUri);
  await disconnectMaster();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

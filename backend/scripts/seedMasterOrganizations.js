/**
 * Initialise la base maître et 2 organisations de développement.
 *
 * Usage (depuis backend/) :
 *   node scripts/seedMasterOrganizations.js
 *
 * Variables :
 *   MASTER_MONGODB_URI ou MONGODB_URI + MASTER_DB_NAME (défaut adapapers_master)
 *   TENANT_DUPONT_DB_NAME (défaut tenant_cabinet_dupont)
 *   TENANT_MARTIN_DB_NAME (défaut tenant_cabinet_martin)
 *   TENANT_WADEPAW_MONGODB_URI (cabinet legacy pawlegalnew — voir seed:wadepaw-org)
 */
require('dotenv').config();
const { connectMaster, disconnectMaster, getMasterMongoUri } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');
const { resolveMongoUriWithDatabase, ensureMongoUriDatabase } = require('../lib/db/mongoUri');
const { clearOrganizationCache } = require('../lib/tenant/resolveOrganization');

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

async function main() {
  process.env.MULTI_TENANT = 'true';

  const baseUri = process.env.MONGODB_URI;
  if (!baseUri && !process.env.MASTER_MONGODB_URI) {
    console.error('❌ MONGODB_URI ou MASTER_MONGODB_URI requis.');
    process.exit(1);
  }

  const dupontDb = process.env.TENANT_DUPONT_DB_NAME || 'tenant_cabinet_dupont';
  const martinDb = process.env.TENANT_MARTIN_DB_NAME || 'tenant_cabinet_martin';
  const dupontUri =
    process.env.TENANT_DUPONT_MONGODB_URI || resolveMongoUriWithDatabase(baseUri, dupontDb);
  const martinUri =
    process.env.TENANT_MARTIN_MONGODB_URI || resolveMongoUriWithDatabase(baseUri, martinDb);
  const wadepawRaw = (process.env.TENANT_WADEPAW_MONGODB_URI || process.env.TENANT_WADEPAW_URI || '').trim();
  const wadepawDb = process.env.TENANT_WADEPAW_DB_NAME || 'test';
  const wadepawUri = wadepawRaw ? ensureMongoUriDatabase(wadepawRaw, wadepawDb) : '';

  console.log('📦 Base maître :', getMasterMongoUri().replace(/:[^:@/]+@/, ':***@'));
  console.log('📦 Tenant Dupont :', dupontUri?.replace(/:[^:@/]+@/, ':***@'));
  console.log('📦 Tenant Martin :', martinUri?.replace(/:[^:@/]+@/, ':***@'));
  if (wadepawUri) {
    console.log('📦 Tenant Wadepaw (legacy) :', wadepawUri.replace(/:[^:@/]+@/, ':***@'));
  }

  await connectMaster();
  const Organization = getOrganizationModel();

  await upsertOrg(Organization, {
    slug: 'cabinet-dupont',
    domain: 'dupont.localhost',
    domains: ['dupont.localhost', 'www.dupont.localhost'],
    mongoUri: dupontUri,
    status: 'active',
    branding: {
      name: 'Cabinet Dupont',
      logo: '',
      primaryColor: '#2A4DD0',
    },
    email: {
      from: 'contact@cabinet-dupont.dev',
      brevoApiKey: '',
      replyTo: 'contact@cabinet-dupont.dev',
    },
    landingPage: {
      headline: 'Cabinet Dupont — Votre recours, simplifié.',
      subheadline: 'Espace client et suivi de dossier.',
      cta: 'Déposer mon dossier',
    },
    limits: {
      maxUsers: 25,
      maxStorageGb: 20,
      modules: ['dossiers', 'messagerie', 'documents', 'rendez-vous'],
    },
  });

  await upsertOrg(Organization, {
    slug: 'cabinet-martin',
    domain: 'martin.localhost',
    domains: ['martin.localhost', 'www.martin.localhost'],
    mongoUri: martinUri,
    status: 'active',
    branding: {
      name: 'Cabinet Martin & Associés',
      logo: '',
      primaryColor: '#0D9488',
    },
    email: {
      from: 'contact@cabinet-martin.dev',
      brevoApiKey: '',
      replyTo: 'contact@cabinet-martin.dev',
    },
    landingPage: {
      headline: 'Cabinet Martin — Accompagnement juridique.',
      subheadline: 'Consultez l’avancement de votre dossier en ligne.',
      cta: 'Accéder à mon espace',
    },
    limits: {
      maxUsers: 15,
      maxStorageGb: 10,
      modules: ['dossiers', 'messagerie', 'documents'],
    },
  });

  if (wadepawUri) {
    await upsertOrg(Organization, {
      slug: 'cabinet-wadepaw',
      domain: 'wadepaw.localhost',
      domains: ['wadepaw.localhost', 'www.wadepaw.localhost', 'app.wadepaw.localhost'],
      mongoUri: wadepawUri,
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
        subheadline: 'Cabinet historique (production)',
        cta: 'Accéder à mon espace',
      },
      limits: {
        maxUsers: 100,
        maxStorageGb: 50,
        modules: ['dossiers', 'messagerie', 'documents', 'rendez-vous', 'lexia'],
      },
    });
  }

  clearOrganizationCache();
  console.log('\n✅ Seed terminé.');
  console.log('   Dev : ajoutez dans le fichier hosts (optionnel) :');
  console.log('     127.0.0.1 dupont.localhost martin.localhost wadepaw.localhost');
  console.log('   Ou utilisez X-Tenant-Slug: cabinet-dupont | cabinet-martin | cabinet-wadepaw');
  console.log('   localhost → DEFAULT_ORG_SLUG (voir .env)');
  if (!wadepawUri) {
    console.log('   Legacy Wadepaw : npm run seed:wadepaw-org (après TENANT_WADEPAW_MONGODB_URI dans .env)');
  }

  await disconnectMaster();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

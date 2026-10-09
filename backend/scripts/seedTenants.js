/**
 * Peuple chaque base tenant avec un admin + utilisateurs de démo.
 * Usage : npm run seed:tenants
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { resolveMongoUriWithDatabase } = require('../lib/db/mongoUri');

dotenv.config();

function resolveTenantUri(explicitUri, dbName) {
  if (explicitUri && String(explicitUri).trim()) {
    return String(explicitUri).trim();
  }
  const base =
    process.env.MONGODB_URI ||
    'mongodb+srv://wadepaw_db_user:Pawlegal25@cluster0.wxel8ap.mongodb.net/?appName=Cluster0';
  if (dbName) {
    return resolveMongoUriWithDatabase(base, dbName);
  }
  return null;
}

const TENANT_DUPONT_URI = resolveTenantUri(
  process.env.TENANT_DUPONT_MONGODB_URI || process.env.TENANT_DUPONT_URI,
  process.env.TENANT_DUPONT_DB_NAME || 'tenant_cabinet_dupont'
);

const TENANT_MARTIN_URI = resolveTenantUri(
  process.env.TENANT_MARTIN_MONGODB_URI || process.env.TENANT_MARTIN_URI,
  process.env.TENANT_MARTIN_DB_NAME || 'tenant_cabinet_martin'
);

const TENANTS = [
  {
    name: 'Cabinet Dupont',
    uri: TENANT_DUPONT_URI,
    admin: {
      firstName: 'Admin',
      lastName: 'Dupont',
      email: 'admin@cabinet-dupont.fr',
      password: 'Dupont2025!',
      phone: '+33600000001',
      role: 'admin',
    },
    users: [
      {
        firstName: 'Sophie',
        lastName: 'Dupont',
        email: 'sophie.dupont@cabinet-dupont.fr',
        password: 'User2025!',
        phone: '+33600000002',
        role: 'juriste',
      },
      {
        firstName: 'Marc',
        lastName: 'Leroy',
        email: 'marc.leroy@cabinet-dupont.fr',
        password: 'User2025!',
        phone: '+33600000003',
        role: 'assistant',
      },
    ],
  },
  {
    name: 'Cabinet Martin',
    uri: TENANT_MARTIN_URI,
    admin: {
      firstName: 'Admin',
      lastName: 'Martin',
      email: 'admin@cabinet-martin.fr',
      password: 'Martin2025!',
      phone: '+33600000011',
      role: 'admin',
    },
    users: [
      {
        firstName: 'Julie',
        lastName: 'Martin',
        email: 'julie.martin@cabinet-martin.fr',
        password: 'User2025!',
        phone: '+33600000012',
        role: 'juriste',
      },
      {
        firstName: 'Paul',
        lastName: 'Renaud',
        email: 'paul.renaud@cabinet-martin.fr',
        password: 'User2025!',
        phone: '+33600000013',
        role: 'assistant',
      },
    ],
  },
];

function getUserModel(conn) {
  if (!mongoose.models.User) {
    require('../models/User');
  }
  if (!conn.models.User) {
    conn.model('User', mongoose.models.User.schema);
  }
  return conn.models.User;
}

async function seedTenant(tenant) {
  if (!tenant.uri) {
    console.warn(`⚠️  URI manquante pour ${tenant.name} — vérifiez votre .env`);
    return;
  }

  const safeUri = tenant.uri.replace(/:[^:@/]+@/, ':***@');
  console.log(`\n🔌 Connexion à ${tenant.name}…`);
  console.log(`   ${safeUri}`);

  const conn = await mongoose.createConnection(tenant.uri).asPromise();
  console.log(`✅ Connecté : ${conn.name}`);

  const User = getUserModel(conn);
  const toCreate = [tenant.admin, ...tenant.users];

  const resetPasswords = process.env.SEED_TENANTS_RESET_PASSWORDS !== 'false';

  for (const userData of toCreate) {
    const email = userData.email.toLowerCase();
    const exists = await User.findOne({ email });
    if (exists) {
      if (resetPasswords) {
        exists.password = userData.password;
        exists.isActive = true;
        exists.firstName = userData.firstName;
        exists.lastName = userData.lastName;
        exists.role = userData.role;
        await exists.save();
        console.log(`   ↻ Mot de passe réinitialisé : ${email}`);
      } else {
        console.log(`   ⏭️  Déjà existant : ${email}`);
      }
      continue;
    }
    await User.create({
      ...userData,
      email: userData.email.toLowerCase(),
      isActive: true,
      profilComplete: true,
    });
    console.log(`   ✓ Créé [${userData.role}] : ${userData.email}`);
  }

  await conn.close();
  console.log(`🔒 Connexion fermée : ${tenant.name}`);
}

async function main() {
  try {
    for (const tenant of TENANTS) {
      await seedTenant(tenant);
    }

    console.log('\n🎉 Seed tenants terminé.\n');
    console.log('📋 Comptes créés (mots de passe en clair pour les tests uniquement) :\n');
    TENANTS.forEach((t) => {
      console.log(`  ${t.name}`);
      console.log(`    Admin        : ${t.admin.email} / ${t.admin.password}`);
      t.users.forEach((u) => {
        console.log(`    ${u.role.padEnd(12)}: ${u.email} / ${u.password}`);
      });
      console.log('');
    });

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Erreur seed tenants :', err.message);
    if (err.errors) {
      Object.values(err.errors).forEach((e) => console.error('   -', e.message));
    }
    process.exit(1);
  }
}

main();

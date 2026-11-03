/**
 * Cree les comptes de demo pour cabinet-martin sur le cluster accessible
 * et met a jour le mongoUri dans la base maitre.
 *
 * Usage (depuis backend/) :
 *   node scripts/seedMartinTenant.js
 */
require('dotenv').config();
process.env.MULTI_TENANT = 'true';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectMaster, getMasterConnection, disconnectMaster } = require('../lib/db/master');
const { organizationSchema } = require('../models/Organization');
const { resolveMongoUriWithDatabase } = require('../lib/db/mongoUri');

const MARTIN_DB = 'tenant_cabinet_martin';
const MARTIN_EMAILS = ['admin@cabinet-martin.fr', 'julie.martin@cabinet-martin.fr', 'paul.renaud@cabinet-martin.fr'];

function buildMartinUri() {
  const base = process.env.MONGODB_URI ||
    'mongodb+srv://ablaye:Pawlegal25@pawlegalnew.zeenzkp.mongodb.net/?appName=Pawlegalnew';
  let uri = resolveMongoUriWithDatabase(base, MARTIN_DB);
  if (!uri.includes('retryWrites=')) {
    uri += (uri.includes('?') ? '&' : '?') + 'retryWrites=true&w=majority';
  }
  return uri;
}

const USERS = [
  {
    firstName: 'Admin',
    lastName: 'Martin',
    email: 'admin@cabinet-martin.fr',
    password: 'Martin2025!',
    phone: '+33600000011',
    role: 'admin',
  },
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
];

async function main() {
  const martinUri = buildMartinUri();
  console.log('URI tenant martin :', martinUri.replace(/:[^:@/]+@/, ':***@'));

  await connectMaster();
  const masterConn = getMasterConnection();
  const Organization = masterConn.models.Organization ||
    masterConn.model('Organization', organizationSchema);

  const org = await Organization.findOne({ slug: 'cabinet-martin' });
  if (!org) {
    console.error('cabinet-martin introuvable dans la base maitre');
    process.exit(1);
  }

  const oldUri = org.mongoUri;
  org.mongoUri = martinUri;
  await org.save();
  console.log('mongoUri mis a jour dans la base maitre');
  console.log('  avant :', oldUri.replace(/:[^:@/]+@/, ':***@'));
  console.log('  apres :', martinUri.replace(/:[^:@/]+@/, ':***@'));

  const legacyUri = process.env.MONGODB_URI;
  if (legacyUri) {
    console.log('\nNettoyage des comptes martin crees par erreur dans test...');
    const legacyConn = await mongoose.createConnection(legacyUri).asPromise();
    if (!mongoose.models.User) require('../models/User');
    const LegacyUser = legacyConn.models.User ||
      legacyConn.model('User', mongoose.models.User.schema);
    const del = await LegacyUser.deleteMany({ email: { $in: MARTIN_EMAILS } });
    console.log('  supprime', del.deletedCount, 'compte(s) de test dans la base wadepaw');
    await legacyConn.close();
  }

  const tenantConn = await mongoose.createConnection(martinUri).asPromise();
  console.log('\nConnecte a tenant_cabinet_martin');

  if (!mongoose.models.User) {
    require('../models/User');
  }
  const User = tenantConn.models.User ||
    tenantConn.model('User', mongoose.models.User.schema);

  for (const u of USERS) {
    const exists = await User.findOne({ email: u.email });
    if (exists) {
      console.log('  = existe deja :', u.email);
      continue;
    }
    const hashed = await bcrypt.hash(u.password, 10);
    await User.create({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      password: hashed,
      phone: u.phone,
      role: u.role,
      profilComplete: true,
    });
    console.log('  + cree :', u.email, '/', u.password, '(role:', u.role + ')');
  }

  await tenantConn.close();
  await disconnectMaster();
  console.log('\nDone.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

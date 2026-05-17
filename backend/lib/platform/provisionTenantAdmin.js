const mongoose = require('mongoose');
const { getTenantConnection } = require('../db/tenants');

function getUserModel(conn) {
  if (!mongoose.models.User) {
    require('../../models/User');
  }
  if (!conn.models.User) {
    conn.model('User', mongoose.models.User.schema);
  }
  return conn.models.User;
}

/**
 * Crée ou met à jour le premier admin d’un cabinet sur sa base MongoDB.
 * @param {{ mongoUri: string, orgId: string, email: string, password: string, firstName?: string, lastName?: string, role?: string }} params
 */
async function provisionTenantAdmin(params) {
  const {
    mongoUri,
    orgId,
    email,
    password,
    firstName = 'Admin',
    lastName = 'Cabinet',
    role = 'admin',
  } = params;

  if (!mongoUri?.trim()) {
    throw new Error('mongoUri manquant pour ce cabinet');
  }
  if (!email?.trim() || !password?.trim()) {
    throw new Error('Email et mot de passe requis');
  }

  const conn = await getTenantConnection(mongoUri, orgId);
  const User = getUserModel(conn);
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    existing.password = password;
    existing.isActive = true;
    existing.firstName = firstName;
    existing.lastName = lastName;
    existing.role = role;
    existing.profilComplete = true;
    await existing.save();
    return { created: false, email: normalizedEmail, userId: String(existing._id) };
  }

  const created = await User.create({
    email: normalizedEmail,
    password,
    firstName,
    lastName,
    role,
    isActive: true,
    profilComplete: true,
  });

  return { created: true, email: normalizedEmail, userId: String(created._id) };
}

module.exports = { provisionTenantAdmin };

const { getTenantConnection } = require('../db/tenants');
const { getTenantUserModel } = require('./tenantUserModel');

function toTenantUserDto(doc) {
  const u = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(u._id),
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    email: u.email || '',
    phone: u.phone || '',
    role: u.role || 'client',
    isActive: u.isActive !== false,
    profilComplete: Boolean(u.profilComplete),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/**
 * Liste les utilisateurs d’un cabinet (base Mongo tenant).
 * @param {{ mongoUri: string, orgId: string, search?: string, role?: string, page?: number, limit?: number }} params
 */
async function listTenantUsers(params) {
  const { mongoUri, orgId, search, role } = params;
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(params.limit) || 100));

  if (!mongoUri?.trim()) {
    throw new Error('mongoUri manquant pour ce cabinet');
  }

  const conn = await getTenantConnection(mongoUri, orgId);
  const User = getTenantUserModel(conn);

  const filter = {};
  if (role && role !== 'all') {
    filter.role = role;
  }
  if (search?.trim()) {
    const q = search.trim();
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { email: re },
      { firstName: re },
      { lastName: re },
      { phone: re },
    ];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select('firstName lastName email phone role isActive profilComplete createdAt updatedAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    users: users.map(toTenantUserDto),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

module.exports = { listTenantUsers, toTenantUserDto };

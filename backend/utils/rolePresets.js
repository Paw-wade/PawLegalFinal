const Permission = require('../models/Permission');

const STAFF_ROLES = [
  'admin',
  'superadmin',
  'assistant',
  'comptable',
  'secretaire',
  'juriste',
  'stagiaire',
  'visiteur',
];

const CLIENT_ROLES = ['client'];
const PARTNER_ROLES = ['partenaire'];

function isStaffRole(role) {
  return STAFF_ROLES.includes(String(role || '').trim());
}

function isClientRole(role) {
  const r = String(role || 'client').trim();
  return !r || r === 'client';
}

function isPartenaireRole(role) {
  return String(role || '').trim() === 'partenaire';
}

function getInterfaceGroup(role) {
  if (isPartenaireRole(role)) return 'partenaire';
  if (isStaffRole(role)) return 'staff';
  return 'client';
}

const ROLE_PRESETS = {
  client: {
    roles: ['client'],
    permissions: [
      { domaine: 'dossiers', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
    ],
  },
  admin: {
    roles: ['admin'],
    permissions: [
      { domaine: 'tableau_de_bord', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'utilisateurs', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'dossiers', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      // Dossiers tarification : inaccessible par défaut. Réservé au superadmin,
      // le superadmin peut l'accorder explicitement à un admin si nécessaire.
      { domaine: 'tarification', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'taches', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'creneaux', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'messages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'temoignages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'notifications', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'sms', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'cms', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'corbeille', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
    ],
  },
  superadmin: {
    roles: ['superadmin'],
    permissions: [
      { domaine: 'tableau_de_bord', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'utilisateurs', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'dossiers', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'tarification', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'taches', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'creneaux', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'messages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'temoignages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'notifications', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'sms', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'cms', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
      { domaine: 'logs', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'corbeille', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: true },
    ],
  },
  assistant: {
    roles: ['assistant'],
    permissions: [
      { domaine: 'tableau_de_bord', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'dossiers', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'taches', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'messages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
    ],
  },
  comptable: {
    roles: ['comptable'],
    permissions: [
      { domaine: 'tableau_de_bord', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'dossiers', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'taches', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'messages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
    ],
  },
  secretaire: {
    roles: ['secretaire'],
    permissions: [
      { domaine: 'tableau_de_bord', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'dossiers', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'taches', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'rendez_vous', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'creneaux', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'messages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
    ],
  },
  juriste: {
    roles: ['juriste'],
    permissions: [
      { domaine: 'tableau_de_bord', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'dossiers', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'documents', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'taches', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
      { domaine: 'messages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
    ],
  },
  stagiaire: {
    roles: ['stagiaire'],
    permissions: [
      { domaine: 'tableau_de_bord', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'dossiers', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'documents', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'taches', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'messages', consulter: true, modifier: true, nePasConsulter: false, nePasModifier: false, supprimer: false },
    ],
  },
  visiteur: {
    roles: ['visiteur'],
    permissions: [
      { domaine: 'tableau_de_bord', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'dossiers', consulter: true, modifier: false, nePasConsulter: false, nePasModifier: true, supprimer: false },
      { domaine: 'utilisateurs', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'taches', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'rendez_vous', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'creneaux', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'messages', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'documents', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'temoignages', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'notifications', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'sms', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'cms', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'logs', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
      { domaine: 'corbeille', consulter: false, modifier: false, nePasConsulter: true, nePasModifier: true, supprimer: false },
    ],
  },
};

function getPresetForRole(role) {
  const key = String(role || 'client').trim();
  return ROLE_PRESETS[key] || ROLE_PRESETS.client;
}

async function applyRolePresetForUser(userId, role, { force = false } = {}) {
  if (!userId) return null;
  const preset = getPresetForRole(role);
  if (!preset || !isStaffRole(role)) {
    return null;
  }

  let permission = await Permission.findOne({ user: userId });
  if (permission && !force) {
    return permission;
  }

  const payload = {
    user: userId,
    roles: preset.roles,
    permissions: preset.permissions,
  };

  if (permission) {
    permission.roles = payload.roles;
    permission.permissions = payload.permissions;
    await permission.save();
    return permission;
  }

  return Permission.create(payload);
}

module.exports = {
  STAFF_ROLES,
  CLIENT_ROLES,
  PARTNER_ROLES,
  ROLE_PRESETS,
  isStaffRole,
  isClientRole,
  isPartenaireRole,
  getInterfaceGroup,
  getPresetForRole,
  applyRolePresetForUser,
};

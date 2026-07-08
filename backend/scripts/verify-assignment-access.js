/**
 * Vérifie le scénario : super-admin retire les permissions dossiers/tâches/documents
 * mais assigne un dossier → l'admin doit voir uniquement ce dossier et pouvoir le modifier (mode restreint).
 *
 * Usage: node scripts/verify-assignment-access.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const User = require('../models/User');
const Dossier = require('../models/Dossier');
const Permission = require('../models/Permission');
const Task = require('../models/Task');
const { getPresetForRole } = require('../utils/rolePresets');

const API = process.env.API_BASE_URL || 'http://localhost:3005/api';
const ADMIN_ID = process.env.TEST_ADMIN_ID || '6a4db2f9cfc59aea6a0042cd';

function tokenFor(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'your-secret-key-here', {
    expiresIn: '1h',
  });
}

function authHeaders(userId) {
  return { Authorization: `Bearer ${tokenFor(userId)}` };
}

async function runStep(label, fn) {
  try {
    const result = await fn();
    console.log(`✅ ${label}`);
    if (result !== undefined) console.log('   ', typeof result === 'string' ? result : JSON.stringify(result));
    return { ok: true, result };
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message;
    console.log(`❌ ${label}`);
    console.log(`    ${status ? `HTTP ${status} — ` : ''}${msg}`);
    return { ok: false, status, msg };
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔗 MongoDB connecté\n');

  const admin = await User.findById(ADMIN_ID);
  if (!admin) {
    console.error('Admin de test introuvable:', ADMIN_ID);
    process.exit(1);
  }

  const assignedDossier = await Dossier.findOne({
    $or: [
      { assignedTo: admin._id },
      { teamMembers: admin._id },
      { teamLeader: admin._id },
    ],
  }).sort({ updatedAt: -1 });

  const otherDossier = await Dossier.findOne({
    _id: { $ne: assignedDossier?._id },
    assignedTo: { $ne: admin._id },
    teamMembers: { $ne: admin._id },
  }).sort({ updatedAt: -1 });

  if (!assignedDossier) {
    console.error('Aucun dossier assigné à l\'admin de test.');
    process.exit(1);
  }

  console.log(`👤 Admin test : ${admin.email} (${admin._id})`);
  console.log(`📁 Dossier assigné : ${assignedDossier.numero || assignedDossier.titre} (${assignedDossier._id})`);
  if (otherDossier) {
    console.log(`📁 Dossier non assigné : ${otherDossier.numero || otherDossier.titre} (${otherDossier._id})`);
  }
  console.log('');

  // 1. Retirer les permissions dossiers / tâches / documents (comme le ferait le super-admin)
  const preset = getPresetForRole(admin.role);
  const strippedPermissions = (preset.permissions || []).map((p) => {
    if (['dossiers', 'taches', 'documents'].includes(p.domaine)) {
      return {
        ...p,
        consulter: false,
        modifier: false,
        nePasConsulter: true,
        nePasModifier: true,
        supprimer: false,
      };
    }
    return p;
  });

  await Permission.findOneAndUpdate(
    { user: admin._id },
    { user: admin._id, roles: [admin.role], permissions: strippedPermissions },
    { upsert: true, new: true }
  );
  console.log('🔧 Permissions dossiers/tâches/documents retirées pour l\'admin de test\n');

  const headers = authHeaders(admin._id);

  // 2. GET /permissions/me
  await runStep('GET /permissions/me — assignedDossierCount > 0', async () => {
    const res = await axios.get(`${API}/permissions/me`, { headers });
    const count = res.data.assignedDossierCount;
    if (!count || count < 1) throw new Error(`assignedDossierCount=${count}`);
    return `assignedDossierCount=${count}`;
  });

  // 3. Liste dossiers (client endpoint) — uniquement assignés
  await runStep('GET /user/dossiers — liste filtrée aux dossiers assignés', async () => {
    const res = await axios.get(`${API}/user/dossiers`, { headers });
    const ids = (res.data.dossiers || []).map((d) => d._id);
    if (!ids.includes(assignedDossier._id.toString())) {
      throw new Error('Dossier assigné absent de la liste');
    }
    if (otherDossier && ids.includes(otherDossier._id.toString())) {
      throw new Error('Dossier non assigné présent dans la liste');
    }
    return `${ids.length} dossier(s) visible(s)`;
  });

  // 3b. Liste dossiers ADMIN (endpoint utilisé par la page /admin/dossiers) — uniquement assignés
  await runStep('GET /user/dossiers/admin — liste filtrée aux dossiers assignés', async () => {
    const res = await axios.get(`${API}/user/dossiers/admin`, { headers });
    const ids = (res.data.dossiers || []).map((d) => d._id);
    if (!ids.includes(assignedDossier._id.toString())) {
      throw new Error('Dossier assigné absent de la liste');
    }
    if (otherDossier && ids.includes(otherDossier._id.toString())) {
      throw new Error('Dossier non assigné présent dans la liste admin');
    }
    return `${ids.length} dossier(s) visible(s)`;
  });

  // 4. Détail dossier assigné
  await runStep('GET /user/dossiers/:id — accès au dossier assigné', async () => {
    const res = await axios.get(`${API}/user/dossiers/${assignedDossier._id}`, { headers });
    if (!res.data.dossier) throw new Error('Pas de dossier dans la réponse');
    return res.data.dossier.titre || res.data.dossier.numero;
  });

  // 5. Détail dossier non assigné — doit échouer
  if (otherDossier) {
    const r = await runStep('GET /user/dossiers/:id — refus sur dossier non assigné', async () => {
      await axios.get(`${API}/user/dossiers/${otherDossier._id}`, { headers });
      throw new Error('Accès inattendu à un dossier non assigné');
    });
    if (r.ok) {
      console.log('    (échec attendu transformé en succès du test)');
    } else if (r.status !== 403) {
      console.log('    ⚠️  Attendu HTTP 403');
    } else {
      console.log('✅ GET /user/dossiers/:id — refus sur dossier non assigné (403 attendu)');
    }
  }

  // 6. Modification restreinte — notes
  const testNote = `[test-permissions] ${new Date().toISOString()}`;
  await runStep('PUT /user/dossiers/:id — modification notes (mode restreint)', async () => {
    const res = await axios.put(
      `${API}/user/dossiers/${assignedDossier._id}`,
      { notes: testNote },
      { headers }
    );
    if (!res.data.success) throw new Error(res.data.message);
    return 'notes mises à jour';
  });

  // 7. Modification interdite — titre (hors périmètre restreint)
  {
    const r = await runStep('PUT /user/dossiers/:id — refus modification titre (hors périmètre)', async () => {
      await axios.put(
        `${API}/user/dossiers/${assignedDossier._id}`,
        { titre: 'Titre modifié sans permission' },
        { headers }
      );
      throw new Error('Modification titre autorisée à tort');
    });
    if (!r.ok && r.status === 403) {
      console.log('✅ PUT /user/dossiers/:id — refus modification titre (403 attendu)');
    }
  }

  // 8. Tâches — liste scoped
  await runStep('GET /tasks — liste des tâches assignées / dossier assigné', async () => {
    const res = await axios.get(`${API}/tasks`, { headers });
    return `${res.data.count ?? res.data.tasks?.length ?? 0} tâche(s)`;
  });

  // 9. Documents admin — liste scoped
  await runStep('GET /user/documents/admin — documents du dossier assigné uniquement', async () => {
    const res = await axios.get(`${API}/user/documents/admin`, { headers });
    const docs = res.data.documents || [];
    const bad = docs.filter(
      (d) => d.dossierId && String(d.dossierId._id || d.dossierId) !== String(assignedDossier._id)
    );
    if (bad.length) throw new Error(`${bad.length} document(s) hors dossier assigné`);
    return `${docs.length} document(s)`;
  });

  // 10. Tâche assignée — mise à jour statut si une tâche existe
  const task = await Task.findOne({
    $or: [{ assignedTo: admin._id }, { dossier: assignedDossier._id }],
  }).sort({ updatedAt: -1 });

  if (task) {
    await runStep(`PUT /tasks/:id — mise à jour statut tâche (${task._id})`, async () => {
      const res = await axios.put(
        `${API}/tasks/${task._id}`,
        { statut: task.statut === 'en_cours' ? 'a_faire' : 'en_cours' },
        { headers }
      );
      if (!res.data.success) throw new Error(res.data.message);
      return `statut → ${res.data.task?.statut}`;
    });
  } else {
    console.log('ℹ️  Aucune tâche liée — étape tâche ignorée');
  }

  console.log('\n🏁 Vérification terminée.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

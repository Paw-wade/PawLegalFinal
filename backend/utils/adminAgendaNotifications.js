const Dossier = require('../models/Dossier');
const Task = require('../models/Task');
const DossierDocumentDraft = require('../models/DossierDocumentDraft');
const User = require('../models/User');
const Notification = require('../models/Notification');

const DEFAULT_HORIZON_DAYS = 15;

function toStartOfDay(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isDossierExcluded(d) {
  const s = String(d?.statut || '');
  return !!(
    d?.estCloture ||
    d?.estArchive ||
    s === 'annule' ||
    s === 'refuse' ||
    s === 'cloture' ||
    s === 'decision_favorable' ||
    s === 'decision_defavorable' ||
    s === 'gain_cause' ||
    s === 'rejet'
  );
}

function isTaskOpen(task) {
  return !!task && !task.archived && !task.effectue && task.statut !== 'termine' && task.statut !== 'annule';
}

function classify(dayMs, todayMs, lastDayMs) {
  if (dayMs < todayMs) return 'overdue';
  if (dayMs <= lastDayMs) return 'upcoming';
  return null;
}

function dateFr(ms) {
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function checkAdminAgendaNotifications() {
  try {
    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const last = new Date(now);
    last.setDate(last.getDate() + (DEFAULT_HORIZON_DAYS - 1));
    const lastDayMs = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
    const dayStart = new Date(todayMs);
    const dayEnd = new Date(todayMs + 24 * 60 * 60 * 1000);

    const [dossiers, admins] = await Promise.all([
      Dossier.find({})
        .select('_id titre numero statut estCloture estArchive dateEcheance etapesSupplementaires')
        .lean(),
      User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } })
        .select('_id')
        .lean(),
    ]);

    if (!admins.length) return { success: true, sent: 0 };

    const active = (dossiers || []).filter((d) => !isDossierExcluded(d));
    const ids = active.map((d) => d._id).filter(Boolean);

    const [tasks, drafts] = await Promise.all([
      Task.find({ dossier: { $in: ids }, dateEcheance: { $exists: true, $ne: null } })
        .select('dossier titre dateEcheance statut archived effectue')
        .lean(),
      DossierDocumentDraft.find({ dossier: { $in: ids }, dueDate: { $exists: true, $ne: null }, completedAt: null })
        .select('dossier title dueDate')
        .lean(),
    ]);

    const items = [];
    for (const d of active) {
      const dossierId = String(d._id || '');
      if (!dossierId) continue;
      const ref = String(d.numero || '').trim() || dossierId.slice(-8);
      const title = String(d.titre || d.numero || 'Dossier').trim() || 'Dossier';
      const link = `/admin/dossiers/${dossierId}`;

      const dd = toStartOfDay(d.dateEcheance);
      if (dd != null) {
        const bucket = classify(dd, todayMs, lastDayMs);
        if (bucket) items.push({
          key: `${dossierId}:dossier_echeance:${dd}`,
          lien: link,
          bucket,
          titre: bucket === 'overdue' ? 'Dossier en retard' : 'Dossier à échéance proche',
          message: `${ref} — ${title} : échéance dossier ${dateFr(dd)}.`,
        });
      }

      const etapes = Array.isArray(d.etapesSupplementaires) ? d.etapesSupplementaires : [];
      etapes.forEach((e, idx) => {
        const sd = toStartOfDay(e?.date);
        if (sd == null) return;
        const bucket = classify(sd, todayMs, lastDayMs);
        if (!bucket) return;
        const label = String(e?.label || e?.id || `Étape ${idx + 1}`).trim() || `Étape ${idx + 1}`;
        items.push({
          key: `${dossierId}:etape:${idx}:${sd}`,
          lien: link,
          bucket,
          titre: bucket === 'overdue' ? 'Jalon en retard' : 'Jalon à venir',
          message: `${ref} — ${title} : jalon "${label}" (${dateFr(sd)}).`,
        });
      });
    }

    for (const t of tasks || []) {
      if (!isTaskOpen(t)) continue;
      const td = toStartOfDay(t.dateEcheance);
      if (td == null) continue;
      const bucket = classify(td, todayMs, lastDayMs);
      if (!bucket) continue;
      const dossierId = String(t.dossier || '');
      const label = String(t.titre || '').trim() || 'Tâche sans titre';
      items.push({
        key: `${dossierId}:tache:${String(t._id)}:${td}`,
        lien: '/admin/taches',
        bucket,
        titre: bucket === 'overdue' ? 'Tâche en retard' : 'Tâche à échéance proche',
        message: `Tâche "${label}" (${dateFr(td)}).`,
      });
    }

    for (const doc of drafts || []) {
      const dd = toStartOfDay(doc.dueDate);
      if (dd == null) continue;
      const bucket = classify(dd, todayMs, lastDayMs);
      if (!bucket) continue;
      const dossierId = String(doc.dossier || '');
      const label = String(doc.title || '').trim() || 'Document en préparation';
      items.push({
        key: `${dossierId}:doc_preparation:${String(doc._id)}:${dd}`,
        lien: `/admin/dossiers/${dossierId}/documents-en-preparation`,
        bucket,
        titre: bucket === 'overdue' ? 'Document en préparation en retard' : 'Document en préparation à échéance proche',
        message: `"${label}" (${dateFr(dd)}).`,
      });
    }

    let sent = 0;
    for (const admin of admins) {
      for (const item of items) {
        const existing = await Notification.findOne({
          user: admin._id,
          type: 'other',
          'metadata.adminAgendaKey': item.key,
          createdAt: { $gte: dayStart, $lt: dayEnd },
        }).select('_id').lean();
        if (existing) continue;

        await Notification.create({
          user: admin._id,
          type: 'other',
          titre: item.titre,
          message: item.message,
          lien: item.lien,
          metadata: {
            adminAgendaKey: item.key,
            adminAgendaBucket: item.bucket,
            autoAgendaReminder: true,
          },
        });
        sent += 1;
      }
    }

    if (sent > 0) {
      console.log(`🔔 Rappels agenda admin envoyés: ${sent}`);
    }
    return { success: true, sent };
  } catch (error) {
    console.error('❌ Erreur rappels agenda admin:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { checkAdminAgendaNotifications };

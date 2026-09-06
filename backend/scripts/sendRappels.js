/**
 * sendRappels.js — Envoie les rappels calendrier configures.
 *
 * A lancer toutes les 5 minutes via PM2 cron ou crontab :
 *   ecosystem.config.js :
 *     { name: 'send-rappels', script: 'scripts/sendRappels.js',
 *       cron_restart: '* /5 * * * *', autorestart: false, watch: false }
 *   crontab : * /5 * * * * cd /app/backend && node scripts/sendRappels.js
 *
 * Ce script :
 * - Cherche les rappels dont triggerAt <= maintenant + 6 min et sent = false
 * - Envoie email + notification in-app (toujours)
 * - Envoie SMS si 'sms' dans canaux et utilisateur a un telephone
 * - Fonctionne pour CalendarEvent ET Task
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const CalendarEvent = require('../models/CalendarEvent');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { sendTransactionalEmail } = require('../utils/emailNotifications');

let sendSMS;
try {
  sendSMS = require('../sendSMS').sendSMS;
} catch (e) {
  sendSMS = null;
  console.warn('sendSMS non disponible, les rappels SMS seront ignores');
}

const WINDOW_MS = 6 * 60 * 1000; // fenetre de 6 minutes
const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3004';

function formatDate(date) {
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function buildRappelHtml({ titre, dateStr, heureStr, lien, description }) {
  const descBlock = description
    ? `<p style="color:#6b7280;font-size:14px;margin:8px 0;">${description}</p>`
    : '';
  const lienBlock = lien
    ? `<div style="margin-top:20px;"><a href="${frontendUrl}${lien}" style="background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Voir le detail</a></div>`
    : '';
  return `
<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;">
  <div style="background:#f97316;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Rappel : ${titre}</h2>
  </div>
  <p style="font-size:15px;color:#374151;"><strong>${dateStr}</strong>${heureStr ? ' a ' + heureStr : ''}</p>
  ${descBlock}
  ${lienBlock}
  <p style="color:#9ca3af;font-size:11px;margin-top:24px;">Ada Papers - rappel automatique</p>
</div>`;
}

async function sendRappelForRecipients({ recipients, titre, dateStr, heureStr, lien, description, canaux }) {
  const html = buildRappelHtml({ titre, dateStr, heureStr, lien, description });
  const subject = `Rappel : ${titre}`;
  const smsText = `[Ada Papers] Rappel : ${titre} - ${dateStr}${heureStr ? ' a ' + heureStr : ''}`;

  for (const user of recipients) {
    if (!user || !user._id) continue;

    // Email (toujours)
    if (user.email) {
      try {
        await sendTransactionalEmail({
          to: user.email,
          toName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          subject,
          htmlContent: html,
        });
      } catch (e) {
        console.error('Erreur email rappel a', user.email, ':', e.message);
      }
    }

    // In-app (toujours)
    try {
      await Notification.create({
        user: user._id,
        type: 'calendar_rappel',
        titre: `Rappel : ${titre}`,
        message: `${dateStr}${heureStr ? ' a ' + heureStr : ''}`,
        lien: lien || '/admin/calendrier',
      });
    } catch (e) {
      console.error('Erreur notif in-app rappel pour', user._id, ':', e.message);
    }

    // SMS (si canal active + telephone disponible)
    if (canaux.includes('sms') && sendSMS && user.phone) {
      try {
        await sendSMS(user.phone, smsText);
      } catch (e) {
        console.error('Erreur SMS rappel a', user.phone, ':', e.message);
      }
    }
  }
}

async function processEventRappels(now, windowEnd) {
  const events = await CalendarEvent.find({
    'rappels.sent': false,
    'rappels.triggerAt': { $lte: windowEnd },
  })
    .populate('createdBy', 'firstName lastName email phone')
    .populate('participants', 'firstName lastName email phone')
    .lean();

  let processed = 0;

  for (const ev of events) {
    for (const rappel of ev.rappels) {
      if (rappel.sent || new Date(rappel.triggerAt) > windowEnd) continue;

      const recipients = [];
      if (ev.createdBy && ev.createdBy._id) recipients.push(ev.createdBy);
      for (const p of ev.participants || []) {
        if (p && p._id && !recipients.find((r) => r._id.toString() === p._id.toString())) {
          recipients.push(p);
        }
      }

      const dateStr = formatDate(ev.date);
      const heureStr = ev.heureDebut || '';
      const lien = ev.dossierId ? `/admin/dossiers/${ev.dossierId}` : '/admin/calendrier';

      await sendRappelForRecipients({
        recipients,
        titre: ev.titre,
        dateStr,
        heureStr,
        lien,
        description: ev.description || '',
        canaux: rappel.canaux || ['email', 'inapp'],
      });

      await CalendarEvent.updateOne(
        { _id: ev._id, 'rappels._id': rappel._id },
        { $set: { 'rappels.$.sent': true, 'rappels.$.sentAt': new Date() } }
      );
      processed++;
    }
  }

  return processed;
}

async function processTaskRappels(now, windowEnd) {
  const tasks = await Task.find({
    'rappels.sent': false,
    'rappels.triggerAt': { $lte: windowEnd },
    archived: { $ne: true },
  })
    .populate('createdBy', 'firstName lastName email phone')
    .populate('assignedTo', 'firstName lastName email phone')
    .populate('dossier', 'titre numero _id')
    .lean();

  let processed = 0;

  for (const task of tasks) {
    for (const rappel of task.rappels) {
      if (rappel.sent || new Date(rappel.triggerAt) > windowEnd) continue;

      const recipients = [];
      if (task.createdBy && task.createdBy._id) recipients.push(task.createdBy);
      for (const u of task.assignedTo || []) {
        if (u && u._id && !recipients.find((r) => r._id.toString() === u._id.toString())) {
          recipients.push(u);
        }
      }

      const dateStr = task.dateEcheance ? formatDate(task.dateEcheance) : 'Echeance a definir';
      const lien = task.dossier ? `/admin/dossiers/${task.dossier._id}` : '/admin/taches';

      await sendRappelForRecipients({
        recipients,
        titre: task.titre || 'Tache',
        dateStr,
        heureStr: '',
        lien,
        description: task.description || '',
        canaux: rappel.canaux || ['email', 'inapp'],
      });

      await Task.updateOne(
        { _id: task._id, 'rappels._id': rappel._id },
        { $set: { 'rappels.$.sent': true, 'rappels.$.sentAt': new Date() } }
      );
      processed++;
    }
  }

  return processed;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connexion MongoDB OK');

  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_MS);

  const evCount = await processEventRappels(now, windowEnd);
  const taskCount = await processTaskRappels(now, windowEnd);

  console.log(`Rappels envoyes : ${evCount} evenements, ${taskCount} taches.`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('Erreur sendRappels:', e);
  process.exit(1);
});

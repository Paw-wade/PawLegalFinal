/**
 * Script d'alertes calendrier - a lancer quotidiennement via PM2 cron ou cron systeme.
 *
 * Exemple ecosystem.config.js :
 *   { name: 'calendar-alerts', script: 'scripts/sendCalendarAlerts.js',
 *     cron_restart: '0 8 * * *', autorestart: false, watch: false }
 *
 * Ou via crontab : 0 8 * * * cd /app/backend && node scripts/sendCalendarAlerts.js
 *
 * Ce script :
 * - Envoie un digest quotidien aux admins (echeances, titres, taches, RDV)
 * - Envoie des rappels personnels (createur + participants) pour les evenements du lendemain
 * - Envoie automatiquement les emails programmes dont la date est aujourd'hui
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Dossier = require('../models/Dossier');
const Task = require('../models/Task');
const RendezVous = require('../models/RendezVous');
const CalendarEvent = require('../models/CalendarEvent');
const { sendTransactionalEmail } = require('../utils/emailNotifications');

const ALERT_DAYS = [1, 3, 7, 14, 30];
const ADMIN_ROLES = ['admin', 'superadmin', 'assistant', 'juriste', 'secretaire'];

function daysUntil(date) {
  return Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
}

function shouldAlert(date) {
  if (!date) return false;
  const d = daysUntil(date);
  return ALERT_DAYS.includes(d);
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function tomorrowRange() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(0, 0, 0, 0);
  const end = new Date(t);
  end.setHours(23, 59, 59, 999);
  return { start: t, end };
}

function todayRange() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const end = new Date(t);
  end.setHours(23, 59, 59, 999);
  return { start: t, end };
}

const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3004';

function buildDigestHtml(alerts) {
  const lignes = alerts.map((a) => {
    const lienHtml = a.lien
      ? `<a href="${frontendUrl}${a.lien}" style="color:#d97706;font-size:12px;">Voir &rarr;</a>`
      : '';
    return `<tr>
      <td style="padding:8px 4px;font-size:22px;width:32px;">${a.emoji}</td>
      <td style="padding:8px 4px;font-size:14px;">${a.texte}<br><span style="color:#6b7280;font-size:12px;">${a.date}</span></td>
      <td style="padding:8px 4px;text-align:right;">${lienHtml}</td>
    </tr>`;
  }).join('');

  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;">
  <div style="background:#f97316;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
    <h1 style="color:#fff;margin:0;font-size:20px;">Rappels du jour - Ada Papers</h1>
    <p style="color:#fff;opacity:0.85;margin:4px 0 0;font-size:14px;">${alerts.length} element(s) necessitent votre attention</p>
  </div>
  <table style="width:100%;border-collapse:collapse;">${lignes}</table>
  <div style="margin-top:24px;text-align:center;">
    <a href="${frontendUrl}/admin/calendrier" style="background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
      Voir le calendrier
    </a>
  </div>
  <p style="color:#9ca3af;font-size:11px;margin-top:24px;text-align:center;">
    Ada Papers &bull; Email automatique quotidien
  </p>
</div>`;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connexion MongoDB OK');

  const alerts = [];

  // ── Echeances dossiers ────────────────────────────────────────────────────
  const dossiers = await Dossier.find({ dateEcheance: { $gte: new Date() } })
    .select('titre numero dateEcheance statut priorite').lean();

  for (const d of dossiers) {
    if (shouldAlert(d.dateEcheance)) {
      const dl = daysUntil(d.dateEcheance);
      alerts.push({
        emoji: dl <= 3 ? '🔴' : '🟠',
        texte: `Echeance dossier dans ${dl} j - <strong>${d.titre || d.numero || 'N/A'}</strong>`,
        date: formatDate(d.dateEcheance),
        lien: `/admin/dossiers/${d._id}`,
      });
    }
  }

  // ── Expirations titres de sejour ──────────────────────────────────────────
  const clients = await User.find({ dateExpiration: { $gte: new Date() }, role: 'client' })
    .select('firstName lastName dateExpiration typeTitre').lean();

  for (const u of clients) {
    if (shouldAlert(u.dateExpiration)) {
      const dl = daysUntil(u.dateExpiration);
      alerts.push({
        emoji: '🔴',
        texte: `Titre de sejour expirant dans ${dl} j - <strong>${u.firstName || ''} ${u.lastName || ''}</strong>`,
        date: formatDate(u.dateExpiration),
        lien: null,
      });
    }
  }

  // ── Echeances taches ──────────────────────────────────────────────────────
  const tasks = await Task.find({
    dateEcheance: { $gte: new Date() },
    archived: { $ne: true },
    statut: { $nin: ['termine', 'annule'] },
  }).populate('dossier', 'titre numero').lean();

  for (const t of tasks) {
    if (shouldAlert(t.dateEcheance)) {
      const dl = daysUntil(t.dateEcheance);
      alerts.push({
        emoji: t.priorite === 'urgente' ? '🔴' : '🟡',
        texte: `Tache echue dans ${dl} j - <strong>${t.titre || 'Sans titre'}</strong>`,
        date: formatDate(t.dateEcheance),
        lien: t.dossier ? `/admin/dossiers/${t.dossier._id}` : '/admin/taches',
      });
    }
  }

  // ── RDV du lendemain ──────────────────────────────────────────────────────
  const { start: tomorrowStart, end: tomorrowEnd } = tomorrowRange();

  const rdvsJour = await RendezVous.find({
    date: { $gte: tomorrowStart, $lte: tomorrowEnd },
    statut: { $in: ['en_attente', 'confirme'] },
  }).lean();

  for (const rdv of rdvsJour) {
    alerts.push({
      emoji: '🔵',
      texte: `RDV demain ${rdv.heure || ''} - <strong>${rdv.prenom || ''} ${rdv.nom || ''}</strong>`,
      date: formatDate(rdv.date),
      lien: '/admin/appointments',
    });
  }

  // ── Rappels J-1 pour evenements personnalises ─────────────────────────────
  const evtsVeille = await CalendarEvent.find({
    rappelVeille: true,
    rappelVeilleSent: false,
    date: { $gte: tomorrowStart, $lte: tomorrowEnd },
  })
    .populate('createdBy', 'email firstName lastName')
    .populate('participants', 'email firstName lastName')
    .lean();

  for (const ev of evtsVeille) {
    alerts.push({
      emoji: ev.type === 'email_programme' ? '📧' : '📌',
      texte: `Evenement demain - <strong>${ev.titre}</strong>`,
      date: formatDate(ev.date),
      lien: '/admin/calendrier',
    });

    // Rappel personnel au createur et aux participants
    const destPersonnels = [];
    if (ev.createdBy && ev.createdBy.email) destPersonnels.push(ev.createdBy);
    for (const p of ev.participants || []) {
      if (p.email && !destPersonnels.find((r) => r.email === p.email)) {
        destPersonnels.push(p);
      }
    }

    const heureStr = ev.heureDebut ? ` a ${ev.heureDebut}` : '';
    const dureeStr = ev.heureFin ? ` - ${ev.heureFin}` : '';
    const descStr = ev.description ? `<p style="color:#6b7280;font-size:14px;">${ev.description}</p>` : '';

    for (const dest of destPersonnels) {
      try {
        await sendTransactionalEmail({
          to: dest.email,
          toName: dest.firstName || dest.email,
          subject: `Rappel demain : ${ev.titre}`,
          htmlContent: `
<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;">
  <div style="background:#6366f1;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Rappel - ${ev.titre}</h2>
  </div>
  <p style="font-size:15px;color:#374151;"><strong>Demain</strong> ${formatDate(ev.date)}${heureStr}${dureeStr}</p>
  ${descStr}
  <div style="margin-top:20px;">
    <a href="${frontendUrl}/admin/calendrier" style="background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;">
      Voir le calendrier
    </a>
  </div>
</div>`,
        });
        console.log('Rappel personnel envoye a', dest.email, 'pour', ev.titre);
      } catch (e) {
        console.error('Erreur rappel personnel:', dest.email, e.message);
      }
    }

    await CalendarEvent.updateOne({ _id: ev._id }, { rappelVeilleSent: true });
  }

  // ── Envoi des emails programmes du jour ───────────────────────────────────
  const { start: todayStart, end: todayEnd } = todayRange();

  const emailsAEnvoyer = await CalendarEvent.find({
    type: 'email_programme',
    emailEnvoye: false,
    date: { $gte: todayStart, $lte: todayEnd },
  }).populate('createdBy', 'email firstName').lean();

  for (const ev of emailsAEnvoyer) {
    if (!ev.emailTo) continue;
    try {
      await sendTransactionalEmail({
        to: ev.emailTo,
        toName: '',
        subject: ev.emailSujet || ev.titre,
        htmlContent: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;">${ev.emailCorps.replace(/\n/g, '<br>')}</div>`,
        textContent: ev.emailCorps,
      });
      await CalendarEvent.updateOne({ _id: ev._id }, { emailEnvoye: true, emailEnvoyeAt: new Date() });
      console.log('Email programme envoye a', ev.emailTo, '-', ev.titre);
    } catch (e) {
      console.error('Erreur envoi email programme:', ev._id, e.message);
    }
  }

  // ── Digest quotidien aux admins ───────────────────────────────────────────
  if (alerts.length === 0) {
    console.log('Aucune alerte a envoyer aujourd\'hui.');
    await mongoose.disconnect();
    return;
  }

  const admins = await User.find({ role: { $in: ADMIN_ROLES }, isActive: true })
    .select('email firstName').lean();

  const htmlContent = buildDigestHtml(alerts);
  let sent = 0;

  for (const admin of admins) {
    if (!admin.email) continue;
    try {
      await sendTransactionalEmail({
        to: admin.email,
        toName: admin.firstName || admin.email,
        subject: `${alerts.length} rappel(s) Ada Papers - ${new Date().toLocaleDateString('fr-FR')}`,
        htmlContent,
      });
      sent++;
      console.log('Digest envoye a', admin.email);
    } catch (e) {
      console.error('Erreur envoi digest a', admin.email, e.message);
    }
  }

  console.log(`Alertes : ${sent}/${admins.length} admins, ${alerts.length} alertes, ${emailsAEnvoyer.length} emails programmes, ${evtsVeille.length} rappels evenements.`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('Erreur sendCalendarAlerts:', e);
  process.exit(1);
});

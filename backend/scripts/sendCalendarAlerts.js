/**
 * Script d'alertes calendrier - a lancer quotidiennement via PM2 cron ou cron systeme.
 *
 * Exemple ecosystem.config.js :
 *   { name: 'calendar-alerts', script: 'scripts/sendCalendarAlerts.js',
 *     cron_restart: '0 8 * * *', autorestart: false, watch: false }
 *
 * Ou via crontab : 0 8 * * * cd /app/backend && node scripts/sendCalendarAlerts.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Dossier = require('../models/Dossier');
const Task = require('../models/Task');
const RendezVous = require('../models/RendezVous');
const { sendTransactionalEmail } = require('../utils/emailNotifications');

const ALERT_DAYS = [1, 3, 7, 14, 30]; // envoyer si l'echeance tombe dans X jours
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

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connexion MongoDB OK');

  const alerts = [];

  // ── Echeances dossiers ────────────────────────────────────────────────────
  const dossiers = await Dossier.find({
    dateEcheance: { $gte: new Date() },
  }).select('titre numero dateEcheance statut priorite').lean();

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
  const clients = await User.find({
    dateExpiration: { $gte: new Date() },
    role: 'client',
  }).select('firstName lastName dateExpiration typeTitre').lean();

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
        lien: t.dossier ? `/admin/dossiers/${t.dossier._id}` : '/admin/tasks',
      });
    }
  }

  // ── RDV du lendemain ──────────────────────────────────────────────────────
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);
  tomorrow.setHours(0, 0, 0, 0);

  const rdvsJour = await RendezVous.find({
    date: { $gte: tomorrow, $lte: tomorrowEnd },
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

  if (alerts.length === 0) {
    console.log('Aucune alerte a envoyer aujourd\'hui.');
    await mongoose.disconnect();
    return;
  }

  // ── Envoi aux admins ──────────────────────────────────────────────────────
  const admins = await User.find({ role: { $in: ADMIN_ROLES }, isActive: true })
    .select('email firstName').lean();

  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3004';

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

  const htmlContent = `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;">
  <div style="background:#f97316;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
    <h1 style="color:#fff;margin:0;font-size:20px;">📅 Rappels du jour - PawLegal</h1>
    <p style="color:#fff;opacity:0.85;margin:4px 0 0;font-size:14px;">${alerts.length} element(s) necessitent votre attention</p>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    ${lignes}
  </table>
  <div style="margin-top:24px;text-align:center;">
    <a href="${frontendUrl}/admin/calendrier" style="background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
      Voir le calendrier
    </a>
  </div>
  <p style="color:#9ca3af;font-size:11px;margin-top:24px;text-align:center;">
    PawLegal - Ada Papers &bull; Email automatique quotidien
  </p>
</div>`;

  let sent = 0;
  for (const admin of admins) {
    if (!admin.email) continue;
    try {
      await sendTransactionalEmail({
        to: admin.email,
        toName: admin.firstName || admin.email,
        subject: `📅 ${alerts.length} rappel(s) PawLegal - ${new Date().toLocaleDateString('fr-FR')}`,
        htmlContent,
      });
      sent++;
      console.log('Email envoye a', admin.email);
    } catch (e) {
      console.error('Erreur envoi email a', admin.email, e.message);
    }
  }

  console.log(`Alertes envoyees : ${sent}/${admins.length} admins, ${alerts.length} alertes.`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('Erreur sendCalendarAlerts:', e);
  process.exit(1);
});

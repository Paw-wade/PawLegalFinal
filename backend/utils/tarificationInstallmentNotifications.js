const Dossier = require('../models/Dossier');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendTransactionalEmail, escapeHtml } = require('./emailNotifications');

function normalizeMontantTarificationFixe(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
  if (typeof v === 'object' && typeof v?.toString === 'function') {
    const s = String(v.toString()).replace(/\s/g, '').replace(',', '.');
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toStartOfDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

async function resolveClientUserId(dossier) {
  if (dossier.user) return dossier.user.toString();
  if (!dossier.clientEmail) return null;
  const userByEmail = await User.findOne({
    email: String(dossier.clientEmail).toLowerCase(),
  }).select('_id');
  return userByEmail ? userByEmail._id.toString() : null;
}

/**
 * Notifie le client 3 jours avant chaque échéance de tarification non réglée.
 */
async function checkTarificationInstallmentReminders() {
  try {
    const today = toStartOfDay(new Date());
    if (!today) return { success: true, sent: 0 };

    const dossiers = await Dossier.find({
      fraisExoneres: { $ne: true },
      paiementTarificationEffectue: { $ne: true },
      tarificationEcheances: { $exists: true, $ne: [] },
    }).select('_id titre numero user clientEmail tarificationEcheances');

    let sent = 0;

    for (const dossier of dossiers) {
      const echeances = Array.isArray(dossier.tarificationEcheances) ? dossier.tarificationEcheances : [];
      if (!echeances.length) continue;

      const clientUserId = await resolveClientUserId(dossier);
      if (!clientUserId) continue;

      const dossierTitle = dossier.titre || dossier.numero || 'votre dossier';
      const dossierRef = dossier.numero || String(dossier._id || '').slice(-8);
      let dossierChanged = false;

      for (const echeance of echeances) {
        if (String(echeance?.statut || 'a_regler') === 'reglee') continue;
        if (!echeance?.dateEcheance) continue;

        const dueDate = toStartOfDay(echeance.dateEcheance);
        if (!dueDate) continue;

        const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        if (daysUntil !== 3) continue;
        if (echeance.notifiedAvantEcheanceAt) continue;

        const montant = normalizeMontantTarificationFixe(echeance.montant);
        const amountText = montant.toLocaleString('fr-FR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const dueLabel = dueDate.toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        const label = String(echeance.label || 'Échéance').trim() || 'Échéance';
        const titre = 'Échéance de tarification dans 3 jours';
        const message = `Pour le dossier « ${dossierTitle} » (${dossierRef}), l’échéance « ${label} » de ${amountText} EUR arrive le ${dueLabel}.`;

        await Notification.create({
          user: clientUserId,
          type: 'tarification_installment_reminder',
          titre,
          message,
          lien: '/client/tarification',
          metadata: {
            dossierId: String(dossier._id),
            echeanceId: String(echeance._id || ''),
            dueDate: dueDate.toISOString(),
            amount: montant,
          },
        });

        const clientUser = await User.findById(clientUserId).select('email firstName lastName');
        if (clientUser?.email) {
          try {
            await sendTransactionalEmail({
              to: clientUser.email,
              subject: 'Rappel : échéance de tarification dans 3 jours — Ada Papers',
              html: `<p>Bonjour ${escapeHtml(clientUser.firstName || '')},</p><p>${escapeHtml(message)}</p><p><a href="${process.env.FRONTEND_URL || 'https://adapapers.fr'}/client/tarification">Voir la tarification</a></p>`,
            });
          } catch (mailErr) {
            console.error('⚠️ Email rappel échéance tarification:', mailErr);
          }
        }

        echeance.notifiedAvantEcheanceAt = new Date();
        dossierChanged = true;
        sent += 1;
      }

      if (dossierChanged) {
        await dossier.save();
      }
    }

    if (sent > 0) {
      console.log(`✅ Rappels échéances tarification envoyés: ${sent}`);
    }

    return { success: true, sent };
  } catch (error) {
    console.error('❌ Erreur rappels échéances tarification:', error);
    return { success: false, sent: 0, error: error.message };
  }
}

module.exports = { checkTarificationInstallmentReminders };

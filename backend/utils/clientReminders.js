const RendezVous = require('../models/RendezVous');
const DocumentRequest = require('../models/DocumentRequest');
const Dossier = require('../models/Dossier');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendTransactionalEmail, escapeHtml } = require('./emailNotifications');
const { getPrimaryFrontendUrl } = require('./frontendOrigins');

/**
 * Rappel J-1 : rendez-vous demain.
 * - Si `user` est renseigné sur le RDV → notif à cet utilisateur.
 * - Sinon → même email qu’un compte inscrit : notif (et push) à ce compte.
 * Sans compte correspondant à l’email, aucune push (pas d’abonnement Web Push stocké).
 */
async function checkAppointmentTomorrowReminders() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const rdvs = await RendezVous.find({
    statut: { $in: ['en_attente', 'confirme'] },
    archived: { $ne: true },
    date: { $gte: tomorrow, $lt: dayAfter },
    $or: [
      { user: { $exists: true, $ne: null } },
      { email: { $exists: true, $nin: [null, ''] } },
    ],
  })
    .select('user date heure nom prenom email _id')
    .lean();

  const emailsToResolve = [
    ...new Set(
      rdvs
        .filter((r) => !r.user && r.email && String(r.email).trim())
        .map((r) => String(r.email).trim().toLowerCase())
    ),
  ];
  const emailToUserId = new Map();
  if (emailsToResolve.length > 0) {
    const users = await User.find({ email: { $in: emailsToResolve } }).select('_id email').lean();
    for (const u of users) {
      if (u.email) emailToUserId.set(String(u.email).trim().toLowerCase(), u._id.toString());
    }
  }

  let sent = 0;
  for (const rv of rdvs) {
    let userId = null;
    if (rv.user) {
      userId = rv.user.toString();
    } else if (rv.email && String(rv.email).trim()) {
      const key = String(rv.email).trim().toLowerCase();
      userId = emailToUserId.get(key) || null;
    }
    if (!userId) continue;

    const existing = await Notification.findOne({
      user: userId,
      type: 'appointment_reminder',
      'metadata.rendezVousId': rv._id.toString(),
      createdAt: { $gte: tomorrow, $lt: dayAfter },
    })
      .select('_id')
      .lean();
    if (existing) continue;

    const dateStr = new Date(rv.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const heurePart = rv.heure ? ` à ${rv.heure}` : '';
    const msgBody = `Vous avez un rendez-vous le ${dateStr}${heurePart}.`;
    await Notification.create({
      user: userId,
      type: 'appointment_reminder',
      titre: 'Rappel : rendez-vous demain',
      message: msgBody,
      lien: '/client/rendez-vous',
      metadata: {
        rendezVousId: rv._id.toString(),
        reminderKind: 'day_before',
        resolvedFromEmail: !rv.user && !!rv.email,
      },
    });
    try {
      const uMail = await User.findById(userId).select('email firstName').lean();
      if (uMail?.email && String(uMail.email).trim()) {
        const appUrl = getPrimaryFrontendUrl();
        await sendTransactionalEmail({
          to: uMail.email,
          toName: uMail.firstName || '',
          subject: 'Rappel : rendez-vous demain - Ada Papers',
          htmlContent: `<p>Bonjour ${escapeHtml(uMail.firstName || '')},</p><p>${escapeHtml(msgBody)}</p><p><a href="${appUrl}/client/rendez-vous">Mes rendez-vous</a></p>`,
          textContent: `${msgBody}\n${appUrl}/client/rendez-vous`,
        });
      }
    } catch (mailErr) {
      console.error('⚠️ Email rappel RDV J-1:', mailErr);
    }
    sent += 1;
  }

  if (sent > 0) {
    console.log(`📅 Rappels RDV (J-1) : ${sent} notification(s) client`);
  }
  return { success: true, sent };
}

/**
 * Relance documents : demandes pending depuis au moins 48h, au plus une notif par jour et par demande.
 */
async function checkPendingDocumentRequestReminders() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const requests = await DocumentRequest.find({
    status: 'pending',
    createdAt: { $lte: cutoff },
  })
    .populate('dossier', 'titre numero _id')
    .select('requestedFrom documentTypeLabel dossier createdAt _id')
    .limit(300)
    .lean();

  let sent = 0;
  for (const dr of requests) {
    const requestedFrom = dr.requestedFrom?._id || dr.requestedFrom;
    if (!requestedFrom) continue;
    const userId = requestedFrom.toString();

    const existing = await Notification.findOne({
      user: userId,
      type: 'document_request_reminder',
      'metadata.documentRequestId': dr._id.toString(),
      createdAt: { $gte: todayStart, $lt: todayEnd },
    })
      .select('_id')
      .lean();
    if (existing) continue;

    const dossierTitle = dr.dossier?.titre || dr.dossier?.numero || 'votre dossier';
    const dossierId = dr.dossier?._id?.toString();
    await Notification.create({
      user: userId,
      type: 'document_request_reminder',
      titre: 'Documents en attente',
      message: `Merci d'envoyer les pièces demandées (« ${dr.documentTypeLabel} ») pour le dossier « ${dossierTitle} ».`,
      lien: dossierId ? `/client/dossiers/${dossierId}` : '/client/dossiers',
      metadata: {
        documentRequestId: dr._id.toString(),
        dossierId: dossierId || undefined,
      },
    });
    sent += 1;
  }

  if (sent > 0) {
    console.log(`📄 Relances demandes de documents : ${sent} notification(s) client`);
  }
  return { success: true, sent };
}

/**
 * Rappel hebdomadaire : dossiers avec montant fixe dû et paiement non enregistré (client inscrit).
 * Au plus une notif par dossier et par fenêtre de 7 jours.
 */
async function checkTarificationPaymentDueReminders() {
  const dossiers = await Dossier.find({
    user: { $exists: true, $ne: null },
    paiementTarificationEffectue: { $ne: true },
    montantTarificationFixe: { $gt: 0 },
  })
    .select('user titre numero montantTarificationFixe tarificationDevise')
    .limit(200)
    .lean();

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let sent = 0;

  for (const d of dossiers) {
    if (!d.user) continue;
    const userId = d.user.toString();
    const existing = await Notification.findOne({
      user: userId,
      type: 'tarification_payment_reminder',
      'metadata.dossierId': d._id.toString(),
      createdAt: { $gte: since },
    })
      .select('_id')
      .lean();
    if (existing) continue;

    const montant = Number(d.montantTarificationFixe || 0);
    const titre = d.titre || d.numero || 'votre dossier';
    await Notification.create({
      user: userId,
      type: 'tarification_payment_reminder',
      titre: 'Rappel : tarification en attente',
      message: `Un paiement de ${montant} ${d.tarificationDevise || 'EUR'} est attendu pour le dossier « ${titre} ». Consultez la page Tarification.`,
      lien: '/client/tarification',
      metadata: { dossierId: d._id.toString(), autoWeekly: true },
    });
    sent += 1;
  }

  if (sent > 0) {
    console.log(`💶 Rappels tarification (hebdo) : ${sent} notification(s) client`);
  }
  return { success: true, sent };
}

module.exports = {
  checkAppointmentTomorrowReminders,
  checkPendingDocumentRequestReminders,
  checkTarificationPaymentDueReminders,
};

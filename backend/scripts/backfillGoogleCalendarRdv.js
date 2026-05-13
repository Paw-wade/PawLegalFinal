/**
 * Envoie vers Google Calendar tous les RDV non annulés encore absents du calendrier
 * (ou met à jour si googleCalendarEventId est déjà défini).
 *
 * Usage : depuis backend/ → npm run sync:google-calendar
 */
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const RendezVous = require('../models/RendezVous');
const {
  syncAppointmentGoogleCalendar,
  isWriteConfigured,
  describeCalendarAuthHelp,
  verifyGoogleCalendarTargetReady,
} = require('../services/googleCalendarSync');

async function main() {
  if (!isWriteConfigured()) {
    console.error('❌ Google Calendar : aucune authentification d’écriture détectée.');
    console.error(describeCalendarAuthHelp());
    process.exit(1);
  }

  const calCheck = await verifyGoogleCalendarTargetReady();
  if (!calCheck.ok) {
    console.error('❌ Google Calendar : calendrier cible inaccessible.');
    console.error(calCheck.message);
    process.exit(1);
  }
  console.log(`✓ Calendrier cible : ${calCheck.calendarId}`);

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI manquant.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const getMotif = (m) => String(m || '').trim() || '—';

  const query = { statut: { $ne: 'annule' } };
  const total = await RendezVous.countDocuments(query);
  console.log(`📅 ${total} rendez-vous à synchroniser (hors annulés)…`);

  const cursor = RendezVous.find(query).cursor();
  let n = 0;
  for await (const doc of cursor) {
    n += 1;
    await syncAppointmentGoogleCalendar(doc, getMotif);
    if (n % 20 === 0) console.log(`   … ${n}/${total}`);
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`✅ Terminé : ${n} rendez-vous traités.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

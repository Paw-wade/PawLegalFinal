/**
 * Nettoie le caractere tiret long (U+2014) dans les champs texte des dossiers.
 * Remplace chaque occurrence par " - " (espace-tiret-espace).
 *
 * Usage : node backend/scripts/clean-emdash.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const EMDASH = '—';
const REPLACEMENT = ' - ';

const TEXT_FIELDS = [
  'tarificationLastNotifySummary',
  'titre',
  'description',
  'tarificationClientMessage',
  'notes',
  'motifRefus',
  'fraisExoneresMotif',
  'standbyReason',
];

function cleanEmdash(value) {
  if (typeof value !== 'string') return value;
  return value.split(EMDASH).join(REPLACEMENT);
}

/** Nettoie recursivement tous les strings d'un objet/tableau Mixed. */
function deepClean(value) {
  if (typeof value === 'string') return cleanEmdash(value);
  if (Array.isArray(value)) return value.map(deepClean);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = deepClean(value[k]);
    return out;
  }
  return value;
}

/** Retourne true si un objet contient au moins un tiret long. */
function containsEmdash(value) {
  if (typeof value === 'string') return value.includes(EMDASH);
  if (Array.isArray(value)) return value.some(containsEmdash);
  if (value !== null && typeof value === 'object') return Object.values(value).some(containsEmdash);
  return false;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant dans .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connecte a MongoDB.');

  const db = mongoose.connection.db;
  const collection = db.collection('dossiers');

  const total = await collection.countDocuments();
  console.log(`${total} dossiers trouves. Scan en cours...`);

  let modified = 0;
  const cursor = collection.find({});

  for await (const doc of cursor) {
    const update = {};

    for (const field of TEXT_FIELDS) {
      const val = doc[field];
      if (typeof val === 'string' && val.includes(EMDASH)) {
        update[field] = cleanEmdash(val);
      }
    }

    // Champ tarificationPrestations (tableau avec label)
    if (Array.isArray(doc.tarificationPrestations)) {
      const cleaned = doc.tarificationPrestations.map((p) =>
        p && typeof p.label === 'string' && p.label.includes(EMDASH)
          ? { ...p, label: cleanEmdash(p.label) }
          : p
      );
      const changed = cleaned.some((p, i) => p !== doc.tarificationPrestations[i]);
      if (changed) update.tarificationPrestations = cleaned;
    }

    if (Object.keys(update).length > 0) {
      await collection.updateOne({ _id: doc._id }, { $set: update });
      modified++;
      console.log(`  Dossier ${doc.numero || doc._id} mis a jour (${Object.keys(update).join(', ')})`);
    }
  }

  console.log(`\nDossiers : ${modified} nettoye(s).`);

  // --- FicheConstitution ---
  const fiches = db.collection('ficheconstitutions');
  const totalFiches = await fiches.countDocuments();
  console.log(`\n${totalFiches} fiches de constitution trouvees. Scan en cours...`);

  let modifiedFiches = 0;
  const fichesCursor = fiches.find({});

  for await (const doc of fichesCursor) {
    const update = {};

    for (const field of ['titre', 'typeFiche']) {
      const val = doc[field];
      if (typeof val === 'string' && val.includes(EMDASH)) {
        update[field] = cleanEmdash(val);
      }
    }

    if (containsEmdash(doc.data)) {
      update.data = deepClean(doc.data);
    }

    if (Object.keys(update).length > 0) {
      await fiches.updateOne({ _id: doc._id }, { $set: update });
      modifiedFiches++;
      console.log(`  Fiche ${doc._id} (dossier ${doc.dossier}) mise a jour (${Object.keys(update).join(', ')})`);
    }
  }

  // --- FicheRequest ---
  const ficheRequests = db.collection('ficherequests');
  const totalFR = await ficheRequests.countDocuments();
  console.log(`\n${totalFR} fiche-requests trouvees. Scan en cours...`);

  let modifiedFR = 0;
  const frCursor = ficheRequests.find({});

  for await (const doc of frCursor) {
    const update = {};
    for (const field of ['titre', 'pourPersonne', 'message', 'validationMotif']) {
      const val = doc[field];
      if (typeof val === 'string' && val.includes(EMDASH)) {
        update[field] = cleanEmdash(val);
      }
    }
    if (Object.keys(update).length > 0) {
      await ficheRequests.updateOne({ _id: doc._id }, { $set: update });
      modifiedFR++;
      console.log(`  FicheRequest ${doc._id} mise a jour (${Object.keys(update).join(', ')})`);
    }
  }

  // --- Collections suivi ---
  const suivi = [
    { name: 'documentrequests',  fields: ['documentTypeLabel', 'message', 'status'] },
    { name: 'piecerequests',     fields: ['libelle', 'nature', 'pourPersonne', 'note', 'validationMotif'] },
    { name: 'notifications',     fields: ['titre', 'message'] },
    { name: 'messageinternes',   fields: ['sujet', 'contenu'] },
    { name: 'documents',         fields: ['nom', 'description'] },
  ];

  const suiviCounts = {};
  for (const { name, fields } of suivi) {
    const col = db.collection(name);
    const total2 = await col.countDocuments();
    console.log(`\n${total2} ${name} trouves. Scan en cours...`);
    let count2 = 0;
    for await (const doc of col.find({})) {
      const update = {};
      for (const field of fields) {
        const val = doc[field];
        if (typeof val === 'string' && val.includes(EMDASH)) update[field] = cleanEmdash(val);
      }
      if (Object.keys(update).length > 0) {
        await col.updateOne({ _id: doc._id }, { $set: update });
        count2++;
        console.log(`  ${name} ${doc._id} mis a jour (${Object.keys(update).join(', ')})`);
      }
    }
    suiviCounts[name] = count2;
  }

  console.log(`\nTermine.`);
  console.log(`  Dossiers         : ${modified} nettoye(s)`);
  console.log(`  Fiches           : ${modifiedFiches} nettoyee(s)`);
  console.log(`  FicheRequests    : ${modifiedFR} nettoyee(s)`);
  for (const [name, c] of Object.entries(suiviCounts)) {
    console.log(`  ${name.padEnd(20)}: ${c} nettoye(s)`);
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Erreur :', err);
  process.exit(1);
});

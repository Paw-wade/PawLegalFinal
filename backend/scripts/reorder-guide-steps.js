'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const GuideConfig = require('../models/GuideConfig');

// Mapping : nouvel ordre -> ancien ordre (numero de l'etape actuelle)
// 1 -> 1  VLS-TS
// 2 -> 6  Logement
// 3 -> 4  Banque
// 4 -> 10 Transport
// 5 -> 11 Fraudes
// 6 -> 2  CVEC
// 7 -> 7  Inscription administrative
// 8 -> 3  Securite sociale
// 9 -> 5  Mutuelle
// 10 -> 9 Numero fiscal
// 11 -> 8 Renouvellement
const NEW_ORDER = [1, 6, 4, 10, 11, 2, 7, 3, 5, 9, 8];

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MASTER_MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI manquant'); process.exit(1); }
  await mongoose.connect(uri);

  const guide = await GuideConfig.findOne({ slug: 'nouvel-arrivant' });
  if (!guide) { console.error('Guide non trouve'); process.exit(1); }

  const stepsByOrder = {};
  for (const step of guide.steps) {
    stepsByOrder[step.order] = step.toObject();
  }

  guide.steps = NEW_ORDER.map((oldOrder, idx) => ({
    ...stepsByOrder[oldOrder],
    order: idx + 1,
  }));

  guide.markModified('steps');
  await guide.save();

  console.log('Etapes reordonnees :');
  guide.steps.forEach(s => console.log(`  ${s.order}. ${s.titre}`));

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

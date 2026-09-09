'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const GuideConfig = require('../models/GuideConfig');

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MASTER_MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI manquant'); process.exit(1); }
  await mongoose.connect(uri);

  const guide = await GuideConfig.findOne({ slug: 'nouvel-arrivant' });
  if (!guide) { console.error('Guide non trouve'); process.exit(1); }

  guide.bonsPlans.push({
    id: 'mistigriff',
    titre: 'Mistigriff',
    categorie: 'habillement',
    description: 'Mistigriff est un reseau de boutiques de vetements de seconde main gere par Le Relais, une entreprise de l\'economie solidaire. Les vetements, chaussures et accessoires sont vendus a des prix tres bas, parfois au kilo ou a la piece a partir de quelques euros. Aucune condition de statut ou de revenus. Il suffit de se rendre en boutique muni de son sac pour faire ses achats. Mistigriff est particulierement bien represente dans le nord de la France, notamment dans la region lilloise. Consultez le site pour trouver la boutique la plus proche de chez vous.',
    lien: 'https://www.mistigriff.fr',
    portee_geographique: 'national (forte presence dans le nord de la France)',
    date_verification: '2026-09',
  });

  guide.markModified('bonsPlans');
  await guide.save();
  console.log('Mistigriff ajoute. Total bons plans : ' + guide.bonsPlans.length);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

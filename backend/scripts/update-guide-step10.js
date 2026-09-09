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

  const step10 = guide.steps.find(s => s.order === 10);
  if (!step10) { console.error('Etape 10 non trouvee'); process.exit(1); }

  step10.description = `Un abonnement de transport en commun est indispensable pour se deplacer au quotidien. Chaque ville dispose de son propre reseau et de ses propres tarifs : renseignez-vous aupres de l'operateur local des votre arrivee.

Exemple a Lille (ville d'Ada Papers) :
Le reseau [Ilevia](https://www.ilevia.fr) dessert la metropole lilloise (metro, tramway, bus). Les abonnements sont disponibles a la semaine, au mois ou a l'annee. Plusieurs tarifs reduits existent selon votre situation.

En Ile-de-France :
- Pass Navigo Mensuel ou Annuel : zones 1 a 5, valable sur metro, RER, bus, tramway. S'achete en ligne sur [iledefrance-mobilites.fr](https://www.iledefrance-mobilites.fr) ou dans les agences RATP.
- [Imagine'R](https://www.imaginer.fr) : abonnement annuel a tarif tres reduit pour les moins de 26 ans scolarises en Ile-de-France. A demander des la rentree universitaire.

Principaux reseaux dans les grandes villes :
TCL a Lyon, TBM a Bordeaux, Tiseo a Toulouse, STAR a Rennes, Ilevia a Lille, Astuce a Rouen, Tan a Nantes, RTM a Marseille. Recherchez le reseau de votre ville pour connaitre les tarifs et les modalites d'inscription.

Categories de tarifs reduits et exonerations :
La plupart des reseaux proposent des reductions selon plusieurs criteres cumulables. Renseignez-vous aupres de votre operateur local, les conditions varient d'une ville a l'autre.

- Jeunes et etudiants : tarif reduit en general jusqu'a 26 ans sur presentation d'un justificatif d'inscription. Certains reseaux proposent des abonnements annuels fortement subventionnes pour les etudiants.
- Mineurs : gratuite ou tarif tres reduit dans de nombreuses metropoles pour les moins de 18 ans (parfois moins de 12 ou 14 ans selon le reseau), sur presentation d'un justificatif d'age.
- Beneficiaires CAF : les titulaires de la CSS (Complementaire Sante Solidaire) ou d'aides de la CAF (APL, RSA, AAH) beneficient souvent d'une reduction ou d'une gratuite sur le reseau local. Un justificatif CAF a jour est demande.
- Avis d'imposition : un avis d'imposition indiquant un revenu fiscal de reference faible (ou nul pour les etudiants sans revenus) peut ouvrir droit a des tarifs sociaux. Le seuil varie selon le reseau.
- Demandeurs d'emploi : tarif reduit ou gratuite possible sur presentation d'une attestation Pole Emploi (France Travail).
- Personnes en situation de handicap : gratuite ou tarif reduit sur presentation de la carte d'invalidite ou de la RQTH.
- Seniors : certains reseaux proposent une reduction a partir de 60 ou 65 ans.

Bons reflexes :
- Privilegiez l'abonnement annuel plutot que mensuel : il est toujours moins cher et souvent fractionnable en paiement.
- Conservez toujours votre titre de transport valide lors de vos deplacements. En cas de controle sans titre valable, une amende de 50 euros (majoree si non regularisee) peut etre appliquee.
- Renseignez-vous en agence ou sur le site de votre reseau pour connaitre precis ement les justificatifs a fournir : les conditions evoluent chaque annee.`;

  step10.cost = "Variable selon la ville, le reseau et votre situation. A Lille (Ilevia), l'abonnement mensuel etudiant est aux alentours de 30-40 euros/mois. En IDF, le Navigo mensuel zones 1-5 est a 86,40 euros/mois ; Imagine'R annuel environ 350 euros/an.";

  guide.markModified('steps');
  await guide.save();
  console.log('Etape 10 mise a jour.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

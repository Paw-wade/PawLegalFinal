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

  const step9 = guide.steps.find(s => s.order === 9);
  if (!step9) { console.error('Etape 9 non trouvee'); process.exit(1); }

  step9.description = `Le numero fiscal permet d'etre identifie par l'administration fiscale francaise. Il est necessaire pour effectuer une declaration de revenus (obligatoire si vous travaillez en France), creer une entreprise, acceder a certains services bancaires ou demander certaines aides sociales.

Comment l'obtenir :
- En vous rendant personnellement au [centre des impots](https://www.impots.gouv.fr/contacts) de votre lieu de residence, muni d'une piece d'identite valide, d'un justificatif de domicile en France et d'une copie de votre titre de sejour ou visa.
- En ligne sur [impots.gouv.fr](https://www.impots.gouv.fr/accueil) en creant votre espace personnel, si vous residez en France depuis plus de 2 ans ou si vous avez deja un numero de securite sociale.

Une fois obtenu, votre numero fiscal est permanent. Il apparait sur tous vos documents fiscaux (avis d'imposition, declaration de revenus...).

Calendrier de la declaration des revenus :
La declaration en ligne ouvre chaque annee a la mi-avril et se cloture par departement selon ce calendrier indicatif :
- Departements 01 a 19 : fin mai (vers le 22-25 mai)
- Departements 20 a 54 : debut juin (vers le 1er-5 juin)
- Departements 55 a 976 : mi-juin (vers le 8-12 juin)
La declaration papier ferme generalement fin mai, quelle que soit la localisation.

Avantages de la declaration de revenus :
L'avis d'imposition delivre apres la declaration est un document cle. Il permet notamment de beneficier de :
- Tarifs reduits sur les transports en commun (pass Navigo Solidarites, Imagine'R conditionne aux ressources, reductions dans certaines villes)
- Bourses CROUS et aides sociales conditionnees aux revenus du foyer fiscal
- Dossier de logement social (HLM) et aides CAF (APL, ALS)
- Justificatif de ressources exige par les organismes de credit ou les bailleurs`;

  guide.markModified('steps');
  await guide.save();
  console.log('Etape 9 mise a jour.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

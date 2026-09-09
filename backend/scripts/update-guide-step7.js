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

  const step7 = guide.steps.find(s => s.order === 7);
  if (!step7) { console.error('Etape 7 non trouvee'); process.exit(1); }

  step7.description = `L'inscription administrative a l'etablissement est l'etape qui officialise votre statut d'etudiant pour l'annee en cours. Elle conditionne la delivrance de la carte etudiante, l'acces aux services universitaires et la validite de votre visa etudiant.

Documents generalement demandes :
- Attestation CVEC (numerotee, obtenue sur cvec.etudiant.gouv.fr)
- VLS-TS valide ou recepisse de titre de sejour
- Justificatif de domicile en France
- Releves de notes et diplomes selon le niveau d'inscription
- Photo d'identite

Exoneration des frais d'inscription :
Les droits d'inscription dans les universites publiques peuvent representer plusieurs centaines d'euros. Des exonerations totales ou partielles existent selon votre situation. En general, les categories suivantes peuvent en beneficier : boursiers CROUS, etudiants en situation de handicap, pupilles de la nation, refugies ou beneficiaires de la protection subsidiaire.

Exemple a l'Universite de Lille :
L'Universite de Lille propose un service dedie aux demandes d'exoneration via son portail TEDI : [tedi.univ-lille.fr](https://tedi.univ-lille.fr/etudiant/menu.php).

Calendrier des demandes d'exoneration 2026-2027 a Lille :
- Licence, BUT, DEUST, Licence Professionnelle, Cycle Ingenieur, Master : jusqu'au 31 octobre 2026
- Doctorat : jusqu'au 16 janvier 2027

Pour tout renseignement sur les exonerations a l'Universite de Lille : [info-exo@univ-lille.fr](mailto:info-exo@univ-lille.fr)

Dans les autres universites :
Chaque etablissement fixe ses propres dates limites et modalites de demande. Quelques reperes generaux :
- Renseignez-vous aupres du service de la scolarite ou des affaires etudiantes de votre etablissement des la pre-inscription.
- La demande d'exoneration est distincte de l'inscription : elle s'effectue generalement via un formulaire en ligne ou en agence, avec justificatifs a l'appui (avis de bourse CROUS, avis d'imposition, notification de protection internationale...).
- Ne depassez pas les dates limites : une demande hors delai est systematiquement rejetee.
- Si vous etes boursier CROUS, l'exoneration totale des droits d'inscription est automatique dans la plupart des universites publiques. Verifiez aupres de votre etablissement que le transfert d'information est bien effectif.`;

  guide.markModified('steps');
  await guide.save();
  console.log('Etape 7 mise a jour avec exonerations inscription.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

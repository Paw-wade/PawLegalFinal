'use client';

import { useState } from 'react';

type VisaRow = {
  categorie: string;
  pieces: string;
  vfs: string;
};

const longSejour: VisaRow[] = [
  {
    categorie: 'Etudes - etudiant, mobilite intra-europeenne, stage etudiant',
    pieces: 'Attestation d\'acceptation/inscription (Campus France), diplomes, relevés de notes, justificatifs de ressources (877,50 EUR/mois), logement, convention de stage',
    vfs: 'Visa de court et Long Sejour Etude Campus France (etudiants hors Campus France : Visa court séjour étudiant, court et long séjour stages, formations, stagiaire associe, mineur scolarise)',
  },
  {
    categorie: 'Etudes - mineur scolarise (sejour individuel ou organise)',
    pieces: 'Inscription ou admission, autorisation parentale, piece d\'identite des parents, acte de naissance, hebergement et prise en charge, ressources',
    vfs: 'Visa court séjour etudiant, court et long séjour stages, formations, stagiaire associe, mineur scolarise',
  },
  {
    categorie: 'Travailler - embauche ou detachement de salarie, ICT salarie ou stagiaire',
    pieces: 'Contrat de travail, autorisation de travail (DDETS/OFII), diplomes ou qualifications, hebergement, identite de l\'entreprise',
    vfs: 'Visa long sejour PROFESSIONNEL (salarie OFII, salarie ICT, saisonnier, passeport talent)',
  },
  {
    categorie: 'Travailler - entrepreneur, profession liberale ou independante, exploitant agricole',
    pieces: 'Business plan, preuves d\'inscription ou d\'autorisation d\'exercer, justificatifs de ressources et d\'investissement, diplomes',
    vfs: 'Meme sous-categorie professionnelle (a confirmer aupres de VFS pour les independants)',
  },
  {
    categorie: 'Travailler - recherche d\'emploi ou creation d\'entreprise, congregation religieuse',
    pieces: 'Diplome obtenu en France, projet professionnel, attestation de la communaute d\'accueil (congregation)',
    vfs: 'Meme sous-categorie professionnelle (a confirmer)',
  },
  {
    categorie: 'Stage salarie (stage professionnel salarie)',
    pieces: 'Convention de stage, autorisation de travail, hebergement, ressources',
    vfs: 'Visa court séjour etudiant, court et long séjour stages, formations, stagiaire associe, mineur scolarise (a confirmer)',
  },
  {
    categorie: 'Cartes Talent - chercheur, salarie qualifie, createur d\'entreprise, investisseur, artiste, medecin, projet innovant, CBE...',
    pieces: 'Contrat ou convention d\'accueil, autorisation ou validation de la categorie, diplomes, preuve du seuil de remuneration ou de l\'investissement',
    vfs: 'Visa long sejour PROFESSIONNEL (salarie OFII, salarie ICT, saisonnier, passeport talent)',
  },
  {
    categorie: 'Installation familiale - conjoint de Francais (majeur)',
    pieces: 'Acte de mariage (transcrit si celébré a l\'etranger), preuve nationalite francaise du conjoint, preuve communaute de vie, hebergement',
    vfs: 'Visa de long sejour Conjoint de Francais',
  },
  {
    categorie: 'Installation familiale - ascendant a charge ou non, enfant majeur moins de 21 ans ou a charge de Francais, parent d\'enfant francais mineur',
    pieces: 'Actes de naissance, preuve de nationalite francaise, preuve de la charge ou contribution a l\'education, ressources, assurance, hebergement',
    vfs: 'Famille de Francais enfant, enfant du conjoint, ascendant, ascendant du conjoint',
  },
  {
    categorie: 'Installation familiale - enfant mineur de Francais, adoption (mineur)',
    pieces: 'Acte de naissance, preuve de filiation, jugement d\'adoption, preuve nationalite du parent, autorisation du parent reste a l\'etranger',
    vfs: 'Famille de Francais enfant, enfant du conjoint, ascendant, ascendant du conjoint',
  },
  {
    categorie: 'Installation familiale - regroupement familial (majeur ou mineur)',
    pieces: 'Decision d\'autorisation de regroupement familial (OFII), actes d\'etat civil, preuve du lien',
    vfs: 'Aucune sous-categorie dediee evidente : a confirmer avec VFS',
  },
  {
    categorie: 'Installation familiale - famille de refugie, protege subsidiaire ou apatride',
    pieces: 'Attestation OFPRA, actes d\'etat civil, preuve du lien familial',
    vfs: 'Visa long sejour pour reunification familiale (OFPRA)',
  },
  {
    categorie: 'Installation familiale - famille accompagnante ICT ou passeport talent',
    pieces: 'Titre ou visa du titulaire, actes d\'etat civil, preuve du lien familial',
    vfs: 'Visa long sejour PROFESSIONNEL (a confirmer)',
  },
  {
    categorie: 'Visiteur - visiteur majeur ou mineur, ayant-droit d\'une rente d\'accident du travail',
    pieces: 'Justificatifs de ressources stables, hebergement, assurance maladie, engagement ecrit de ne pas exercer d\'activite professionnelle',
    vfs: 'Visa Long Sejour VISITEUR',
  },
  {
    categorie: 'Visa de retour',
    pieces: 'Ancien titre de sejour, justificatifs de residence passee en France, motif du retour',
    vfs: 'Visa long sejour dit de retour',
  },
  {
    categorie: 'Autre - ancien combattant, jeune au pair, volontariat',
    pieces: 'Convention de volontariat ou d\'accueil au pair, agrement de l\'organisme, ressources',
    vfs: 'A confirmer : Visa long sejour PROFESSIONNEL ou categorie la plus proche',
  },
];

const courtSejour: VisaRow[] = [
  {
    categorie: 'Tourisme (visite privee) et Visite familiale ou privee - parent ou enfant etranger de Francais',
    pieces: 'Reservation d\'hotel ou justificatif d\'hebergement + piece d\'identite hebergeant, billet ou reservation, assurance, releves bancaires, preuves d\'attaches au Senegal (emploi, famille)',
    vfs: 'Premiere demande : PREMIERE DEMANDE DE VISA DE COURT SEJOUR SCHENGEN. Deja titulaire : Visa court sejour FAMILIAL, PRIVE, TOURISME. Parent/enfant d\'un Francais : Famille de Francais enfant...',
  },
  {
    categorie: 'Visite privee - conjoint de Francais, famille de ressortissant UE/EEE/Suisse, en vue de mariage avec un Francais',
    pieces: 'Acte de mariage ou preuve du lien, preuve nationalite du conjoint, hebergement ; pour mariage : publication des bans, dossier de mariage',
    vfs: 'Conjoint de Francais ou mariage : Famille de Francais... ou Visa de long sejour Conjoint de Francais selon le cas. Famille UE : Visa court sejour etablissement familial membre de famille UE',
  },
  {
    categorie: 'Visite familiale - congregation religieuse',
    pieces: 'Attestation de la communaute d\'accueil',
    vfs: 'PREMIERE DEMANDE DE VISA DE COURT SEJOUR SCHENGEN (a confirmer)',
  },
  {
    categorie: 'Etudes - etudiant ou etudiant-concours, stage etudiant',
    pieces: 'Convocation au concours, attestation d\'inscription ou convention de stage, ressources, hebergement',
    vfs: 'Visa court sejour etudiant, court et long sejour stages, formations, stagiaire associe, mineur scolarise',
  },
  {
    categorie: 'Travailler - voyage professionnel, manifestation culturelle/artistique/scientifique/sportive, scientifique ou chercheur, stage salarie, embauche ou detachement, employe au service d\'un Francais, mannequin',
    pieces: 'Invitation de l\'entreprise ou de l\'organisateur, attestation de l\'employeur au Senegal, registre de commerce, contrat ou autorisation de travail si activite remuneree, assurance',
    vfs: 'Premiere demande : PREMIERE DEMANDE DE VISA DE COURT SEJOUR SCHENGEN. Deja titulaire d\'un visa : Visa court sejour PROFESSIONNEL',
  },
  {
    categorie: 'Travailler - marin',
    pieces: 'Contrat d\'engagement, livret de marin, attestation de l\'armateur',
    vfs: 'Visa de court sejour professionnel pour les marins',
  },
  {
    categorie: 'Raisons medicales - soins medicaux',
    pieces: 'Certificat medical, accord ou devis de l\'etablissement francais, preuve de prise en charge financiere, hebergement',
    vfs: 'Visa pour motif medical et accompagnant',
  },
  {
    categorie: 'Visite officielle (diplomate et organisation internationale, passeport ordinaire)',
    pieces: 'Note verbale ou invitation officielle',
    vfs: 'Aucune sous-categorie evidente : a confirmer aupres du consulat',
  },
  {
    categorie: 'Etablissement familial ou prive (rente d\'accident du travail) et Visa d\'entree pour beneficiaire de l\'accord de retrait',
    pieces: 'Justificatif du statut, actes d\'etat civil, preuve de la charge ou du menage commun',
    vfs: 'Visa court sejour etablissement familial membre de famille UE (a confirmer)',
  },
  {
    categorie: 'Transit aeroportuaire',
    pieces: 'Billets pour la destination finale, visa du pays de destination',
    vfs: 'Visa de transit aeroportuaire de moins de 24 h sans changement d\'aeroport',
  },
];

const piecesCommunes = [
  'Formulaire France-Visas imprime et signe, avec recepisse',
  'Passeport en cours de validite (moins de 10 ans, 2 pages vierges, valable 3 mois apres fin du visa), anciens passeports',
  'Photos d\'identite aux normes OACI',
  'Acte de naissance (etat civil)',
  'Justificatif de domicile',
  'Preuve des moyens de subsistance',
  'Justificatif d\'hebergement en France',
  'Pour court sejour : assurance medicale de voyage',
];

export default function CorrespondanceVisa() {
  const [onglet, setOnglet] = useState<'long' | 'court'>('long');

  const rows = onglet === 'long' ? longSejour : courtSejour;

  return (
    <section id="tableau-visa" className="py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground">Tableau de correspondance des visas</h2>
            <p className="text-muted-foreground mt-2">
              Chaque motif de voyage correspond a une categorie France-Visas et a une sous-categorie VFS Global.
              Les pieces indiquees sont indicatives ; la liste officielle varie selon votre profil.
            </p>
          </div>

          {/* Onglets */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setOnglet('long')}
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
                onglet === 'long'
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'border border-border bg-background text-foreground hover:bg-accent'
              }`}
            >
              Visa long sejour (&gt; 90 jours)
            </button>
            <button
              onClick={() => setOnglet('court')}
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
                onglet === 'court'
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'border border-border bg-background text-foreground hover:bg-accent'
              }`}
            >
              Visa court sejour (≤ 90 jours)
            </button>
          </div>

          {onglet === 'long' && (
            <p className="text-xs text-muted-foreground bg-orange-50 border border-orange-100 rounded-lg px-4 py-2.5 mb-4">
              Pour tous les dossiers long sejour : formulaire France-Visas imprime avec recepisse, passeport,
              photos OACI, etat civil, justificatif de domicile, preuve des moyens de subsistance et de
              l&apos;hebergement, plus les pieces propres a la categorie.
            </p>
          )}

          {onglet === 'court' && (
            <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 mb-4">
              Pieces communes court sejour : formulaire + recepisse, passeport, photos, assurance voyage,
              billet ou itineraire, hebergement, ressources. Si vous avez deja obtenu un visa Schengen,
              la sous-categorie VFS change (voir la colonne VFS).
            </p>
          )}

          {/* Tableau */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-secondary/40 text-left">
                  <th className="px-4 py-3 font-semibold text-foreground border-b border-border w-[32%]">
                    Categorie France-Visas (projet / motif)
                  </th>
                  <th className="px-4 py-3 font-semibold text-foreground border-b border-border w-[40%]">
                    Pieces specifiques au depot (indicatif)
                  </th>
                  <th className="px-4 py-3 font-semibold text-foreground border-b border-border w-[28%]">
                    Sous-categorie VFS a choisir
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-secondary/10'}>
                    <td className="px-4 py-3 text-foreground align-top border-b border-border/40 font-medium leading-snug">
                      {row.categorie}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top border-b border-border/40 leading-snug">
                      {row.pieces}
                    </td>
                    <td className="px-4 py-3 align-top border-b border-border/40 leading-snug">
                      <span className="inline-block rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
                        {row.vfs}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pieces communes */}
          <div className="mt-8 rounded-xl border border-border bg-card p-6">
            <h3 className="font-bold text-foreground mb-4">Pieces communes a tous les dossiers</h3>
            <ul className="space-y-2">
              {piecesCommunes.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-0.5 text-orange-400 shrink-0">•</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Deroulement */}
          <div className="mt-6 rounded-xl border border-border bg-card p-6">
            <h3 className="font-bold text-foreground mb-4">Deroulement du depot</h3>
            <ol className="space-y-2">
              {[
                'Remplir le formulaire en ligne sur France-Visas et imprimer le formulaire + le recepisse',
                'Reunir toutes les pieces selon votre motif (liste officielle dans l\'assistant France-Visas)',
                'Prendre rendez-vous chez VFS Global Dakar en choisissant la bonne sous-categorie',
                'Deposer le dossier classe dans l\'ordre de la liste avec les moyens de paiement des droits (99 EUR, env. 65 000 FCFA ; 50 EUR pour les etudes)',
                'Faire traduire les documents en langue etrangere par un traducteur assermante',
                'Apres obtention : valider le visa long sejour valant titre de sejour (VLS-TS) aupres de l\'OFII dans les 3 mois suivant l\'arrivee',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Source : France-Visas et VFS Global Dakar (novembre 2026). Les sous-categories VFS notees
            « a confirmer » sont des rapprochements : aucune page officielle ne precise exactement quelle
            sous-categorie correspond a quel motif. La liste exacte des pieces depend de votre nationalite,
            pays de depot, motif et situation personnelle.
          </p>
        </div>
      </div>
    </section>
  );
}

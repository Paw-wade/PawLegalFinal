'use client';

import { useState } from 'react';

/**
 * Guide explicatif (repliable) du flux de constitution de société côté admin :
 * les 3 interfaces (cabinet / demandeur / associés), le parcours, et la
 * circulation des documents. Purement informatif - aucune donnée du dossier.
 */
const LANES = [
  {
    role: 'Administrateur', title: 'Back-office cabinet', who: 'Le juriste / l’équipe',
    route: '/admin/dossiers/[id] → onglet Documents', ring: 'border-teal-500', tag: 'bg-teal-50 text-teal-700',
    items: [
      'Demande les fiches à remplir (SARL, SAS…)',
      'Voit le panneau groupé par associé : fiches + pièces de chacun, avec statut',
      'Valide / refuse chaque fiche et pièce fournie',
      'Retrouve tous les fichiers dans « Documents du dossier »',
      'Voit « ✉️ invité le… » et peut renvoyer l’invitation',
    ],
  },
  {
    role: 'Demandeur', title: 'Page de suivi', who: 'Le client porteur du projet',
    route: '/suivi/[token]', ring: 'border-indigo-500', tag: 'bg-indigo-50 text-indigo-700',
    items: [
      'Remplit la fiche société (dénomination, capital, associés…)',
      'Saisit le nom + e-mail de chaque associé',
      'Voit le récap des documents demandés, groupé par personne',
      'Dépose ses propres pièces ; suit les statuts de validation',
      'Peut aussi inviter un associé manuellement (lien copiable)',
    ],
  },
  {
    role: 'Associé', title: 'Lien d’invitation', who: 'Chaque associé / gérant',
    route: '/invitation/[token]', ring: 'border-amber-500', tag: 'bg-amber-50 text-amber-700',
    items: [
      'Accès limité à ses seuls documents (pas au reste du dossier)',
      'Remplit sa fiche d’état civil (+ procuration si absent)',
      'Dépose sa pièce d’identité (et casier s’il est gérant)',
      'Reçoit le lien par e-mail automatiquement à la validation',
    ],
  },
];

const STEPS = [
  { n: '01', dot: 'bg-teal-500', title: 'Le cabinet demande la fiche', body: 'L’admin sélectionne la ou les fiches (ex. SARL) → crée des FicheRequest. Le demandeur est notifié (in-app + e-mail).' },
  { n: '02', dot: 'bg-indigo-500', title: 'Le demandeur remplit la fiche société', body: 'Il renseigne la société et la liste des associés - nom + e-mail pour chacun - puis valide.' },
  { n: '03', dot: 'bg-violet-500', title: 'Le système génère tout automatiquement', body: 'Le PDF de la fiche est rattaché au dossier (Document). La checklist crée, par associé : fiche d’état civil + pièce d’identité + procuration (et casier/déclaration pour les gérants).' },
  { n: '04', dot: 'bg-violet-500', title: 'Invitations envoyées par e-mail', body: 'Chaque associé dont l’e-mail est renseigné reçoit son lien personnel /invitation/[token] (une seule fois). Un FicheInvite ne donne accès qu’à ses documents.' },
  { n: '05', dot: 'bg-amber-500', title: 'L’associé complète ses documents', body: 'Il remplit sa fiche (→ PDF Document) et dépose sa pièce d’identité (→ Document). Sa fiche passe « remplie », sa pièce « fournie ».' },
  { n: '06', dot: 'bg-teal-500', title: 'Le cabinet vérifie et valide', body: 'L’admin retrouve chaque document dans le panneau groupé par associé et dans « Documents du dossier », puis valide ou refuse. Le statut redescend au demandeur et à l’associé.' },
];

const DOCS = [
  { doc: 'Fiche société (SARL, SAS…)', by: 'Demandeur - sur le suivi', byCls: 'bg-indigo-50 text-indigo-700', obj: 'FicheConstitution → Document (PDF)', vis: 'Admin : valide · « Documents du dossier »' },
  { doc: 'Fiche d’état civil (par associé)', by: 'Associé - via son invitation', byCls: 'bg-amber-50 text-amber-700', obj: 'FicheRequest + Document (PDF)', vis: 'Admin : valide · Demandeur : suit le statut' },
  { doc: 'Procuration (par associé)', by: 'Associé - si absent à la signature', byCls: 'bg-amber-50 text-amber-700', obj: 'FicheRequest + Document', vis: 'Admin : valide · facultative' },
  { doc: 'Pièce d’identité (par associé)', by: 'Associé - dépôt de fichier', byCls: 'bg-amber-50 text-amber-700', obj: 'PieceRequest → Document', vis: 'Admin : valide · « Documents du dossier »' },
  { doc: 'Casier / déclaration (par gérant)', by: 'Associé-gérant', byCls: 'bg-amber-50 text-amber-700', obj: 'PieceRequest / FicheRequest', vis: 'Admin : valide' },
  { doc: 'Lien d’invitation', by: 'Système (à la validation) ou manuel', byCls: 'bg-violet-50 text-violet-700', obj: 'FicheInvite (token + e-mail)', vis: 'Admin : « invité le… » + Renvoyer' },
];

export function ConstitutionFluxGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5">
        <span className="flex items-center gap-2">
          <span className="text-lg">🔗</span>
          <span className="text-base font-bold text-foreground">Comment fonctionne la constitution - 3 interfaces</span>
        </span>
        <span className="text-sm text-muted-foreground">{open ? '▲ Masquer' : '▼ Afficher'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 sm:p-6">
          <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
            L’administrateur (cabinet), le demandeur (page de suivi) et chaque associé (lien d’invitation) agissent sur
            les <strong>mêmes objets</strong> rattachés au dossier. Les documents produits par les uns deviennent visibles
            chez les autres, selon le rôle.
          </p>

          {/* Les 3 interfaces */}
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Qui voit quoi</p>
          <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            {LANES.map((l) => (
              <div key={l.role} className={`rounded-xl border border-gray-200 border-t-4 ${l.ring} bg-gray-50/50 p-4`}>
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${l.tag}`}>{l.role}</span>
                <h4 className="mt-2 text-base font-bold text-foreground">{l.title}</h4>
                <p className="text-xs text-muted-foreground">{l.who}</p>
                <p className="mt-1 break-all border-b border-dashed border-gray-200 pb-2 font-mono text-[11px] text-gray-500">{l.route}</p>
                <ul className="mt-3 space-y-1.5">
                  {l.items.map((it, i) => (
                    <li key={i} className="text-xs text-foreground">• {it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Le parcours */}
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Le parcours - de bout en bout</p>
          <ol className="mb-6 ml-1 space-y-3 border-l-2 border-gray-200 pl-5">
            {STEPS.map((s) => (
              <li key={s.n} className="relative">
                <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full ${s.dot} ring-4 ring-white`} />
                <p className="text-sm font-semibold text-foreground"><span className="mr-2 font-mono text-xs text-muted-foreground">{s.n}</span>{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>

          {/* Circulation des documents */}
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Circulation des documents</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b border-gray-200 p-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Document</th>
                  <th className="border-b border-gray-200 p-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Créé par / où</th>
                  <th className="border-b border-gray-200 p-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Objet en base</th>
                  <th className="border-b border-gray-200 p-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Visible / action</th>
                </tr>
              </thead>
              <tbody>
                {DOCS.map((d, i) => (
                  <tr key={i}>
                    <td className="border-b border-gray-100 p-3 text-sm font-medium text-foreground">{d.doc}</td>
                    <td className="border-b border-gray-100 p-3 text-sm">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${d.byCls}`}>{d.by}</span>
                    </td>
                    <td className="border-b border-gray-100 p-3 font-mono text-xs text-gray-500">{d.obj}</td>
                    <td className="border-b border-gray-100 p-3 text-sm text-muted-foreground">{d.vis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 max-w-3xl text-xs text-muted-foreground">
            <strong>Clé de voûte :</strong> tout fichier déposé ou généré devient un <span className="font-mono">Document</span> rattaché
            au dossier (marqué « déposé via lien », non visible client par défaut). C’est ce qui le fait apparaître à la fois dans le
            suivi de chaque personne <em>et</em> dans « Documents du dossier » côté admin. Le champ <span className="font-mono">pourPersonne</span> sur
            chaque fiche/pièce permet le regroupement par associé dans les trois interfaces.
          </p>
        </div>
      )}
    </div>
  );
}

export default ConstitutionFluxGuide;

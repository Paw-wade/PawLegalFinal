/** Schéma fiche SAS (Société par Actions Simplifiée) — Sénégal. */
const { TXT, VAL_NOMINALE, LIBRE_CONDITIONS, sectionObjet, sectionIdentite, sectionPublication, staticSection } = require('../common');

const VAL_NOMINALE_SAS = [...VAL_NOMINALE, { value: 'autre', label: 'Autre (à préciser)' }];

module.exports = {
  type: 'sas',
  titre: 'Fiche de renseignements — SAS',
  sousTitre: 'Société par Actions Simplifiée',
  associesSource: { section: 'repartition', field: 'nom' },
  gerantsSource: { fields: ['president_nom', 'dg_nom'] },
  sections: [
    sectionObjet(),
    sectionIdentite(),
    {
      id: 'capital', titre: 'Capital social (librement fixé)',
      fields: [
        { name: 'capital_social', label: 'Capital social (montant cumulé des apports)', type: 'montant', required: true, fullWidth: true },
        { name: 'apport_numeraire', label: 'Apports en numéraire', type: 'montant' },
        { name: 'apport_nature', label: 'Apports en nature', type: 'text', placeholder: 'Description / valeur estimée' },
        { name: 'nombre_actions', label: 'Divisé en (nombre d’actions)', type: 'number', suffix: 'actions' },
        { name: 'valeur_nominale', label: 'Valeur nominale de l’action', type: 'radio', options: VAL_NOMINALE_SAS },
        { name: 'valeur_nominale_autre', label: 'Si « Autre », préciser la valeur nominale', type: 'montant' },
        { name: 'alienabilite', label: 'Actions', type: 'radio', options: [{ value: 'alienable', label: 'Aliénables' }, { value: 'inalienable', label: 'Inaliénables' }] },
        { name: 'inalienabilite_duree', label: 'Si inaliénables, pendant combien d’années', type: 'text', placeholder: 'Ex. 10 ans' },
      ],
    },
    {
      id: 'nb_actionnaires', titre: '',
      fields: [{ name: 'nombre_actionnaires', label: 'Nombre d’actionnaires', type: 'number', sizesSection: 'repartition' }],
    },
    {
      id: 'repartition', titre: 'Actionnaires et répartition du capital',
      note: 'Ajoutez une ligne par actionnaire : chacun recevra sa fiche d’identité à remplir et devra fournir sa pièce d’identité.',
      repeatable: { itemLabel: 'Actionnaire', fields: [{ name: 'nom', label: 'Nom de l’actionnaire', type: 'text', required: true }, { name: 'pourcentage', label: 'Part (%)', type: 'percent', required: true }, { name: 'email', label: 'E-mail (pour l’inviter)', type: 'text', required: false, placeholder: 'email@exemple.com' }] },
    },
    {
      id: 'cession', titre: 'Cession d’actions ou de valeurs mobilières',
      fields: [
        { name: 'cession_entre_associes', label: 'Entre associés', type: 'radio', options: LIBRE_CONDITIONS },
        { name: 'cession_conjoints', label: 'Entre conjoints, ascendants et descendants', type: 'radio', options: LIBRE_CONDITIONS },
        { name: 'cession_conditions', label: 'Préciser les conditions de transmission', type: 'textarea', fullWidth: true },
        { name: 'cession_tiers', label: 'À des tiers', type: 'checkboxes', options: [{ value: 'libre', label: 'Libre' }, { value: 'agrement', label: 'Soumise à agrément' }, { value: 'preemption', label: 'Droit de préemption au profit des actionnaires' }] },
        { name: 'cession_forcee', label: 'Conditions dans lesquelles un associé est tenu de céder ses actions', type: 'textarea', fullWidth: true, placeholder: 'Ex. violation grave des statuts, activité concurrente, perte de la qualité justifiant l’entrée, condamnation pénale…' },
        { name: 'suspension_droits', label: 'Suspendre les droits non pécuniaires de l’associé tant qu’il n’a pas cédé', type: 'radio', options: [{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }] },
      ],
      note: TXT.agrementSas,
    },
    staticSection('exercices', 'Exercices sociaux', TXT.exercices),
    {
      id: 'direction', titre: 'Direction de la société',
      fields: [
        { name: 'direction_structure', label: 'Structure de direction', type: 'radio', options: [{ value: 'president', label: 'SAS avec Président de société' }, { value: 'president_dg', label: 'SAS avec Président et Directeur Général' }] },
        { name: 'president_nom', label: 'Président — identité', type: 'text' },
        { name: 'dg_nom', label: 'Directeur Général — identité (le cas échéant)', type: 'text' },
        { name: 'pouvoirs', label: 'Pouvoirs à l’égard des tiers', type: 'radio', options: [{ value: 'plenitude', label: 'Plénitude de pouvoirs' }, { value: 'limitation', label: 'Limitation de pouvoirs' }] },
        { name: 'pouvoirs_limitation', label: 'Préciser en cas de limitation de pouvoirs', type: 'textarea', fullWidth: true },
      ],
    },
    sectionPublication(),
    staticSection('pieces', 'Pièces à fournir', TXT.piecesDirigeants),
    staticSection('formalites', 'Formalités administratives et fiscales', TXT.formalites),
  ],
  signature: true,
};

export type DossierCategorie =
  | 'sejour_titres'
  | 'contentieux_administratif'
  | 'asile'
  | 'regroupement_familial'
  | 'nationalite_francaise'
  | 'eloignement_urgence'
  | 'autre';

export interface SuggestedStep {
  id: string;
  label: string;
}

export const SUGGESTED_STEPS_BY_CATEGORY: Record<DossierCategorie, SuggestedStep[]> = {
  sejour_titres: [
    { id: 'analyse_situation', label: 'Analyse de la situation' },
    { id: 'collecte_pieces', label: 'Collecte des pièces' },
    { id: 'dossier_complet_interne', label: 'Dossier complet (interne)' },
    { id: 'depot_prefecture', label: 'Dépôt en préfecture / consulat' },
    { id: 'instruction_en_cours', label: 'Instruction en cours' },
    { id: 'decision_recue', label: 'Décision reçue' },
    { id: 'suivi_post_decision', label: 'Suivi post-décision' },
  ],
  asile: [
    { id: 'premier_contact', label: 'Premier contact / récit' },
    { id: 'preparation_dossier_ofpra', label: 'Préparation du dossier OFPRA' },
    { id: 'depot_demande_asile', label: 'Dépôt de la demande d’asile' },
    { id: 'convocation_ofpra', label: 'Convocation OFPRA' },
    { id: 'audience_ofpra', label: 'Audience OFPRA' },
    { id: 'decision_ofpra', label: 'Décision OFPRA' },
    { id: 'recours_cnda', label: 'Recours CNDA (si nécessaire)' },
    { id: 'decision_cnda', label: 'Décision CNDA' },
  ],
  regroupement_familial: [
    { id: 'verification_conditions', label: 'Vérification des conditions (logement, ressources)' },
    { id: 'collecte_pieces', label: 'Collecte des pièces' },
    { id: 'depot_dossier', label: 'Dépôt du dossier de regroupement' },
    { id: 'instruction_prefecture', label: 'Instruction préfecture' },
    { id: 'decision_regroupement', label: 'Décision de regroupement' },
    { id: 'formalites_visa', label: 'Formalités de visa' },
    { id: 'arrivee_famille', label: 'Arrivée de la famille' },
  ],
  contentieux_administratif: [
    { id: 'analyse_decision', label: 'Analyse de la décision attaquée' },
    { id: 'redaction_recours', label: 'Rédaction du recours' },
    { id: 'depot_recours', label: 'Dépôt du recours' },
    { id: 'echange_memoires', label: 'Échange de mémoires / instruction' },
    { id: 'audience', label: 'Audience' },
    { id: 'decision_tribunal', label: 'Décision du tribunal' },
    { id: 'execution_suites', label: 'Exécution / suites (appel, référé...)' },
  ],
  nationalite_francaise: [
    { id: 'verification_criteres', label: 'Vérification des critères (résidence, intégration, etc.)' },
    { id: 'collecte_pieces', label: 'Collecte des pièces' },
    { id: 'depot_dossier', label: 'Dépôt du dossier de nationalité' },
    { id: 'entretien_enquete', label: 'Entretien / enquête' },
    { id: 'decision_naturalisation', label: 'Décision de naturalisation / rejet' },
    { id: 'recours_eventuel', label: 'Recours éventuel' },
  ],
  eloignement_urgence: [
    { id: 'analyse_situation', label: 'Analyse de la situation d’éloignement' },
    { id: 'mesures_urgence', label: 'Mesures d’urgence (référé, recours)' },
    { id: 'suivi_execution', label: 'Suivi de l’exécution / suspension' },
  ],
  autre: [
    { id: 'analyse_situation', label: 'Analyse de la situation' },
    { id: 'collecte_pieces', label: 'Collecte des pièces' },
    { id: 'instruction', label: 'Instruction du dossier' },
    { id: 'decision', label: 'Décision / clôture' },
  ],
};


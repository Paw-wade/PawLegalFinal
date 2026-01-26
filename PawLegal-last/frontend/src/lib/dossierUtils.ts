// Utilitaires pour les statuts de dossiers

export const getStatutColor = (statut: string): string => {
  const colors: { [key: string]: string } = {
    recu: 'bg-gray-100 text-gray-800',
    accepte: 'bg-green-100 text-green-800',
    refuse: 'bg-red-100 text-red-800',
    en_attente_onboarding: 'bg-yellow-100 text-yellow-800',
    en_cours_instruction: 'bg-blue-100 text-blue-800',
    pieces_manquantes: 'bg-orange-100 text-orange-800',
    dossier_complet: 'bg-teal-100 text-teal-800',
    depose: 'bg-indigo-100 text-indigo-800',
    reception_confirmee: 'bg-cyan-100 text-cyan-800',
    complement_demande: 'bg-amber-100 text-amber-800',
    decision_defavorable: 'bg-red-100 text-red-800',
    communication_motifs: 'bg-pink-100 text-pink-800',
    recours_preparation: 'bg-purple-100 text-purple-800',
    refere_mesures_utiles: 'bg-violet-100 text-violet-800',
    refere_suspension_rep: 'bg-fuchsia-100 text-fuchsia-800',
    gain_cause: 'bg-emerald-100 text-emerald-800',
    rejet: 'bg-red-200 text-red-900',
    decision_favorable: 'bg-green-200 text-green-900',
    autre: 'bg-slate-100 text-slate-800',
    // Anciens statuts pour compatibilité
    en_attente: 'bg-yellow-100 text-yellow-800',
    en_cours: 'bg-blue-100 text-blue-800',
    en_revision: 'bg-purple-100 text-purple-800',
    termine: 'bg-green-100 text-green-800',
    annule: 'bg-red-100 text-red-800',
  };
  return colors[statut] || 'bg-gray-100 text-gray-800';
};

export const getStatutLabel = (statut: string): string => {
  const labels: { [key: string]: string } = {
    recu: 'Reçu',
    accepte: 'Accepté',
    refuse: 'Refusé',
    en_attente_onboarding: 'En attente d\'onboarding (RDV)',
    en_cours_instruction: 'En cours d\'instruction (constitution dossier)',
    pieces_manquantes: 'Pièces manquantes (relance client)',
    dossier_complet: 'Dossier Complet',
    depose: 'Déposé',
    reception_confirmee: 'Réception confirmée',
    complement_demande: 'Complément demandé (avec date limite)',
    decision_defavorable: 'Décision défavorable',
    communication_motifs: 'Communication des Motifs',
    recours_preparation: 'Recours en préparation',
    refere_mesures_utiles: 'Référé Mesures Utiles',
    refere_suspension_rep: 'Référé suspension et REP',
    gain_cause: 'Gain de cause',
    rejet: 'Rejet',
    decision_favorable: 'Décision favorable',
    autre: 'Autre (statut non prévu)',
    // Anciens statuts pour compatibilité
    en_attente: 'En attente',
    en_cours: 'En cours',
    en_revision: 'En révision',
    termine: 'Terminé',
    annule: 'Annulé',
  };
  return labels[statut] || statut;
};

export const getPrioriteColor = (priorite: string): string => {
  const colors: { [key: string]: string } = {
    urgente: 'bg-red-100 text-red-800',
    haute: 'bg-orange-100 text-orange-800',
    normale: 'bg-blue-100 text-blue-800',
    basse: 'bg-gray-100 text-gray-800',
  };
  return colors[priorite] || 'bg-gray-100 text-gray-800';
};

export const getPrioriteLabel = (priorite: string): string => {
  const labels: { [key: string]: string } = {
    urgente: 'Urgente',
    haute: 'Haute',
    normale: 'Normale',
    basse: 'Basse',
  };
  return labels[priorite] || priorite;
};

// Calculer le pourcentage de progression basé sur le statut
// Utilise toutes les étapes pour un calcul précis
export const getDossierProgress = (statut: string): number => {
  // Si le dossier est refusé ou annulé, progression à 0
  if (statut === 'refuse' || statut === 'annule') {
    return 0;
  }
  
  // Obtenir l'ordre du statut actuel
  const currentOrder = getStepOrder(statut);
  
  // Le dernier ordre possible (gain_cause ou decision_favorable)
  const maxOrder = Math.max(
    getStepOrder('decision_favorable'),
    getStepOrder('gain_cause'),
    getStepOrder('rejet')
  );
  
  // Calculer le pourcentage basé sur la position dans toutes les étapes
  // On considère que la progression va de 0% (recu) à 100% (décision finale)
  if (currentOrder === 0) return 0;
  
  // Pourcentage basé sur la position dans le processus
  // Les premières étapes représentent moins de progression que les dernières
  const progressMap: { [key: string]: number } = {
    recu: 5,
    en_attente_onboarding: 10,
    accepte: 15,
    en_cours_instruction: 25,
    pieces_manquantes: 30,
    dossier_complet: 40,
    depose: 50,
    reception_confirmee: 55,
    complement_demande: 60,
    decision_favorable: 100,
    decision_defavorable: 70,
    communication_motifs: 75,
    recours_preparation: 80,
    refere_mesures_utiles: 85,
    refere_suspension_rep: 90,
    gain_cause: 100,
    rejet: 95,
    autre: 20,
  };
  
  // Si on a une valeur spécifique, l'utiliser
  if (progressMap[statut] !== undefined) {
    return progressMap[statut];
  }
  
  // Sinon, calculer basé sur l'ordre
  const progress = Math.min(100, Math.round((currentOrder / maxOrder) * 100));
  return progress;
};

// Calculer le nombre de jours depuis une date
export const calculateDaysSince = (date: Date | string | null | undefined): number => {
  if (!date) return 0;
  const now = new Date();
  const then = new Date(date);
  const diffTime = Math.abs(now.getTime() - then.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// Calculer le nombre de jours jusqu'à une date
export const calculateDaysUntil = (date: Date | string | null | undefined): number => {
  if (!date) return Infinity;
  const now = new Date();
  const then = new Date(date);
  const diffTime = then.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// Vérifier si l'échéance approche (dans les 7 prochains jours)
export const isDeadlineApproaching = (dateEcheance: Date | string | null | undefined): boolean => {
  if (!dateEcheance) return false;
  const daysUntil = calculateDaysUntil(dateEcheance);
  return daysUntil >= 0 && daysUntil <= 7;
};

// Formater le temps relatif
export const formatRelativeTime = (date: Date | string | null | undefined): string => {
  if (!date) return 'Jamais';
  const now = new Date();
  const then = new Date(date);
  const diffTime = now.getTime() - then.getTime();
  const diffMinutes = Math.floor(diffTime / (1000 * 60));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'À l\'instant';
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaines`;
  if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`;
  return `Il y a ${Math.floor(diffDays / 365)} ans`;
};

// Obtenir la prochaine action basée sur le statut
export const getNextAction = (statut: string): string | null => {
  const actionsMap: { [key: string]: string } = {
    recu: 'Attente de traitement initial',
    en_attente_onboarding: 'Planifier un rendez-vous avec le client',
    en_cours_instruction: 'Constituer le dossier complet',
    pieces_manquantes: 'Relancer le client pour les pièces manquantes',
    dossier_complet: 'Préparer le dépôt du dossier',
    depose: 'Attendre la confirmation de réception',
    complement_demande: 'Fournir les compléments demandés',
    recours_preparation: 'Préparer le recours',
    communication_motifs: 'Analyser les motifs et préparer la réponse',
  };
  return actionsMap[statut] || null;
};

// Toutes les étapes possibles du dossier dans l'ordre chronologique
const ALL_DOSSIER_STEPS = [
  { key: 'recu', label: 'Reçu', order: 1 },
  { key: 'en_attente_onboarding', label: 'En attente d\'onboarding', order: 2 },
  { key: 'accepte', label: 'Accepté', order: 3 },
  { key: 'en_cours_instruction', label: 'En cours d\'instruction', order: 4 },
  { key: 'pieces_manquantes', label: 'Pièces manquantes', order: 5 },
  { key: 'dossier_complet', label: 'Dossier complet', order: 6 },
  { key: 'depose', label: 'Déposé', order: 7 },
  { key: 'reception_confirmee', label: 'Réception confirmée', order: 8 },
  { key: 'complement_demande', label: 'Complément demandé', order: 9 },
  { key: 'decision_favorable', label: 'Décision favorable', order: 10 },
  { key: 'decision_defavorable', label: 'Décision défavorable', order: 11 },
  { key: 'communication_motifs', label: 'Communication des motifs', order: 12 },
  { key: 'recours_preparation', label: 'Recours en préparation', order: 13 },
  { key: 'refere_mesures_utiles', label: 'Référé mesures utiles', order: 14 },
  { key: 'refere_suspension_rep', label: 'Référé suspension et REP', order: 15 },
  { key: 'gain_cause', label: 'Gain de cause', order: 16 },
  { key: 'rejet', label: 'Rejet', order: 17 },
  { key: 'refuse', label: 'Refusé', order: 18 },
  { key: 'annule', label: 'Annulé', order: 19 },
  { key: 'autre', label: 'Autre', order: 20 },
];

// Obtenir l'ordre d'une étape
const getStepOrder = (statut: string): number => {
  const step = ALL_DOSSIER_STEPS.find(s => s.key === statut);
  return step?.order || 0;
};

// Obtenir les étapes de la timeline basées sur le statut
// Retourne toutes les étapes principales du processus
export const getTimelineSteps = (statut: string) => {
  const currentOrder = getStepOrder(statut);
  
  // Définir les étapes principales à toujours afficher (processus standard)
  const mainSteps = [
    'recu',
    'en_attente_onboarding',
    'accepte',
    'en_cours_instruction',
    'pieces_manquantes',
    'dossier_complet',
    'depose',
    'reception_confirmee',
    'complement_demande',
    'decision_favorable',
    'decision_defavorable',
    'communication_motifs',
    'recours_preparation',
    'refere_mesures_utiles',
    'refere_suspension_rep',
    'gain_cause',
    'rejet',
  ];
  
  // Filtrer pour obtenir uniquement les étapes principales
  const relevantSteps = ALL_DOSSIER_STEPS.filter(step => 
    mainSteps.includes(step.key)
  );

  // Marquer les étapes comme complétées jusqu'au statut actuel
  return relevantSteps.map(step => ({
    key: step.key,
    label: step.label,
    completed: step.order <= currentOrder,
    order: step.order,
    isCurrent: step.order === currentOrder
  }));
};


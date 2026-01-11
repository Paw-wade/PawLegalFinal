// Utilitaires pour les statuts de tâches

export const getStatutColor = (statut: string): string => {
  const colors: { [key: string]: string } = {
    a_faire: 'bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 border border-slate-200/50',
    en_cours: 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-200/50',
    en_attente: 'bg-gradient-to-r from-amber-50 to-amber-100 text-amber-700 border border-amber-200/50',
    termine: 'bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 border border-emerald-200/50',
    annule: 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 border border-red-200/50',
  };
  return colors[statut] || 'bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 border border-slate-200/50';
};

export const getStatutLabel = (statut: string): string => {
  const labels: { [key: string]: string } = {
    a_faire: 'À faire',
    en_cours: 'En cours',
    en_attente: 'En attente',
    termine: 'Terminé',
    annule: 'Annulé',
  };
  return labels[statut] || statut;
};

export const getPrioriteColor = (priorite: string): string => {
  const colors: { [key: string]: string } = {
    urgente: 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 border border-red-200/50',
    haute: 'bg-gradient-to-r from-orange-50 to-orange-100 text-orange-700 border border-orange-200/50',
    normale: 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-200/50',
    basse: 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-600 border border-gray-200/50',
  };
  return colors[priorite] || 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-600 border border-gray-200/50';
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


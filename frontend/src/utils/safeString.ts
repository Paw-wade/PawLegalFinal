/**
 * Fonction utilitaire pour convertir une valeur en string de manière sécurisée
 * Évite les erreurs "Objects are not valid as a React child"
 * 
 * @param value - La valeur à convertir
 * @returns Une chaîne de caractères sécurisée
 */
export const safeString = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  // Si c'est un objet, ne pas le convertir, retourner une chaîne vide
  if (typeof value === 'object') {
    console.warn('Tentative de convertir un objet en string:', value);
    return '';
  }
  return '';
};

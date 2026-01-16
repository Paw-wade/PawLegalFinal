'use client';

import { useEffect, useState } from 'react';
import { cmsAPI } from './api';

/**
 * Hook client pour récupérer un texte CMS avec une valeur de secours.
 * - Utilise la clé CMS (ex: "home.hero.title")
 * - Si la clé n'existe pas encore côté backend, on garde le fallback passé en argument
 */
export function useCmsText(key: string, fallback: string): string {
  const [text, setText] = useState<string>(fallback);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const value = await cmsAPI.getText(key);
        if (isMounted && typeof value === 'string' && value.trim() !== '') {
          // Si le texte du CMS contient "juridique" et que le fallback ne le contient pas,
          // utiliser le fallback pour éviter le flash avec l'ancien texte
          if (value.includes('juridique') && !fallback.includes('juridique')) {
            // Ne pas mettre à jour avec l'ancien texte du CMS
            return;
          }
          setText(value);
        }
      } catch (error: any) {
        // En cas d'erreur 404 (clé non trouvée) ou erreur CMS silencieuse, c'est normal - on garde le fallback silencieusement
        // Pour les autres erreurs, on peut logger si nécessaire
        const isCmsNotFound = error?.response?.status === 404 || error?.isCmsNotFound;
        if (!isCmsNotFound) {
          console.error(`Erreur CMS pour la clé "${key}":`, error);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [key, fallback]);

  return text;
}




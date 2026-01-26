'use client';

import { useEffect, useRef, RefObject } from 'react';

interface AutoFillDetectionOptions {
  /**
   * Refs des inputs à surveiller
   */
  inputRefs: Record<string, RefObject<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>>;
  
  /**
   * État actuel du formulaire
   */
  formData: Record<string, any>;
  
  /**
   * Fonction pour mettre à jour l'état du formulaire
   */
  setFormData: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
  
  /**
   * Si true, active la détection (par défaut: true)
   */
  enabled?: boolean;
  
  /**
   * Intervalle de vérification en ms (par défaut: 500)
   */
  checkInterval?: number;
  
  /**
   * Délai initial avant la première vérification en ms (par défaut: 2000)
   */
  initialDelay?: number;
}

/**
 * Hook pour détecter l'auto-remplissage du navigateur dans les formulaires
 * 
 * @example
 * ```tsx
 * const nomInputRef = useRef<HTMLInputElement>(null);
 * const emailInputRef = useRef<HTMLInputElement>(null);
 * 
 * useAutoFillDetection({
 *   inputRefs: { nom: nomInputRef, email: emailInputRef },
 *   formData,
 *   setFormData,
 *   enabled: isFormOpen
 * });
 * ```
 */
export function useAutoFillDetection({
  inputRefs,
  formData,
  setFormData,
  enabled = true,
  checkInterval = 500,
  initialDelay = 2000,
}: AutoFillDetectionOptions) {
  useEffect(() => {
    if (!enabled) return;

    const checkAutoFill = () => {
      const updates: Record<string, any> = {};
      let hasChanges = false;

      // Vérifier chaque input pour détecter les valeurs auto-remplies
      Object.entries(inputRefs).forEach(([key, ref]) => {
        if (ref.current) {
          const currentValue = ref.current.value;
          const formValue = formData[key];

          // Comparer les valeurs (en ignorant les espaces pour les strings)
          const normalizedCurrent = typeof currentValue === 'string' ? currentValue.trim() : currentValue;
          const normalizedForm = typeof formValue === 'string' ? formValue.trim() : formValue;

          if (normalizedCurrent !== normalizedForm && normalizedCurrent !== '') {
            updates[key] = normalizedCurrent;
            hasChanges = true;
          }
        }
      });

      // Mettre à jour l'état si des changements ont été détectés
      if (hasChanges) {
        // Utiliser setTimeout pour éviter les mises à jour pendant le rendu
        setTimeout(() => {
          setFormData(prev => ({ ...prev, ...updates }));
        }, 0);
      }
    };

    // Vérifier après le rendu initial (utiliser setTimeout pour éviter les mises à jour pendant le rendu)
    const initialCheck = setTimeout(checkAutoFill, 0);

    // Vérifier périodiquement (l'auto-remplissage peut se produire avec un délai)
    const interval = setInterval(checkAutoFill, checkInterval);

    // Vérifier aussi après un délai plus long (certains navigateurs remplissent après plusieurs secondes)
    const timeout = setTimeout(checkAutoFill, initialDelay);

    return () => {
      clearTimeout(initialCheck);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [enabled, checkInterval, initialDelay, inputRefs, formData, setFormData]);
}

/**
 * Fonction utilitaire pour récupérer les valeurs réelles des inputs DOM avant la soumission
 * 
 * @example
 * ```tsx
 * const handleSubmit = async (e: React.FormEvent) => {
 *   e.preventDefault();
 *   
 *   const realValues = getRealInputValues({
 *     inputRefs: { nom: nomInputRef, email: emailInputRef },
 *     formData
 *   });
 *   
 *   // Utiliser realValues pour la validation et l'envoi
 * };
 * ```
 */
export function getRealInputValues<T extends Record<string, any>>(
  inputRefs: Record<string, RefObject<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>>,
  formData: T
): T {
  const realValues = { ...formData };

  Object.entries(inputRefs).forEach(([key, ref]) => {
    if (ref.current) {
      const value = ref.current.value;
      // Pour les strings, trimmer les espaces
      realValues[key] = typeof value === 'string' ? value.trim() : value;
    }
  });

  return realValues;
}


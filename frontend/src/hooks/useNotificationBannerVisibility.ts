'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'notificationBannerVisible';
const STORAGE_EVENT = 'notificationBannerVisibilityChange';

export function useNotificationBannerVisibility() {
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    // Écouter les changements de localStorage depuis d'autres onglets/pages
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setIsVisible(e.newValue === 'true');
      }
    };

    // Écouter les événements personnalisés pour la synchronisation dans le même onglet
    const handleCustomStorageChange = () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      setIsVisible(stored === null ? true : stored === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(STORAGE_EVENT, handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(STORAGE_EVENT, handleCustomStorageChange);
    };
  }, []);

  const toggleVisibility = (newValue?: boolean) => {
    const valueToSet = newValue !== undefined ? newValue : !isVisible;
    setIsVisible(valueToSet);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, valueToSet.toString());
      // Déclencher un événement personnalisé pour synchroniser dans le même onglet
      window.dispatchEvent(new Event(STORAGE_EVENT));
    }
  };

  return { isVisible, toggleVisibility };
}

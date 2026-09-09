'use client';

import { useState, useEffect } from 'react';

interface ReservationBadgeProps {
  onOpen: () => void;
  alwaysVisible?: boolean; // Si true, toujours visible même sans scroll
}

export function ReservationBadge({ onOpen, alwaysVisible = false }: ReservationBadgeProps) {
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setHasScrolled(true);
      } else {
        setHasScrolled(false);
      }
    };

    // Vérifier immédiatement si on est déjà scrollé
    handleScroll();

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Toujours visible si alwaysVisible est true, sinon seulement après scroll
  const shouldShow = alwaysVisible || hasScrolled;

  if (!shouldShow) {
    return null;
  }

  return (
    <button
      onClick={onOpen}
      className="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-1.5 px-3 py-2 animate-in fade-in slide-in-from-bottom-4"
      aria-label="Prendre un rendez-vous"
    >
      <span className="text-sm">📅</span>
      <span className="font-medium text-xs">Prendre RDV</span>
    </button>
  );
}


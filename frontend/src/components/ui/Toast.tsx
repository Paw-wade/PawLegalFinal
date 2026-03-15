'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  visible: boolean;
  duration?: number;
  onClose?: () => void;
}

/**
 * Message éphémère centré au milieu de la page (confirmation d'enregistrement, etc.).
 */
export function Toast({ message, visible, duration = 3000, onClose }: ToastProps) {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible && message) {
      setMounted(true);
      const t = requestAnimationFrame(() => setShow(true));
      const timer = setTimeout(() => {
        setShow(false);
        setTimeout(() => {
          setMounted(false);
          onClose?.();
        }, 300);
      }, duration);
      return () => {
        cancelAnimationFrame(t);
        clearTimeout(timer);
      };
    } else {
      setShow(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [visible, message, duration, onClose]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4"
      aria-live="polite"
      role="status"
    >
      <div
        className={`
          pointer-events-auto rounded-xl shadow-lg border-2 border-green-300 bg-gradient-to-br from-green-50 to-green-100/90 px-6 py-4
          flex items-center gap-3 min-w-[280px] max-w-[90vw]
          transition-all duration-300 ease-out
          ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        `}
      >
        <span className="text-2xl shrink-0" aria-hidden>✅</span>
        <p className="text-sm font-semibold text-green-900">{message}</p>
      </div>
    </div>
  );
}

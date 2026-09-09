'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const STORAGE_KEY = 'ada_guide_float_dismissed';

export function GuideFloatingButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch { /* rien */ }
    setVisible(true);
  }, []);

  if (!visible || pathname === '/guides/nouvel-arrivant') return null;

  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* rien */ }
  };

  return (
    <div
      className="fixed bottom-20 right-4 z-40 md:bottom-20 md:right-6 flex items-center animate-in fade-in slide-in-from-bottom-3 duration-300"
      style={{ filter: 'drop-shadow(0 2px 10px rgba(234,88,12,0.25))' }}
    >
      <button
        type="button"
        onClick={() => router.push('/guides/nouvel-arrivant')}
        className="inline-flex items-center gap-1.5 text-white text-xs font-semibold pl-3 pr-2.5 py-2 rounded-l-full transition-all hover:pr-3"
        style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
        aria-label="Consulter le guide nouvel arrivant"
      >
        <svg className="w-3 h-3 flex-shrink-0 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="tracking-tight">Guide arrivant</span>
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer"
        className="text-white/80 hover:text-white px-1.5 py-2 rounded-r-full transition-colors"
        style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

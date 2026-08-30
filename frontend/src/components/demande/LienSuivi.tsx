'use client';

import { useState } from 'react';

/**
 * Affiche le lien de suivi public d'un dossier (pour un demandeur sans compte)
 * avec un bouton « Copier ». Réservé à l'affichage admin.
 */
export function LienSuivi({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}/suivi/${token}`;

  const copy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-w-0 rounded-xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-blue-900">Lien de suivi du dossier</h3>
      <p className="mb-3 text-xs text-blue-900/80">
        À partager : ce lien permet de suivre l'avancement du dossier et de déposer les documents demandés, sans se connecter.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          {copied ? '✓ Lien copié' : 'Copier le lien de suivi'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-blue-300 bg-white px-4 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
        >
          Ouvrir
        </a>
      </div>
    </div>
  );
}

export default LienSuivi;

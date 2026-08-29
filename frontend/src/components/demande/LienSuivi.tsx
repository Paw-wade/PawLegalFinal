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
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-blue-900">Lien de suivi (demandeur sans compte)</h3>
      <p className="mb-3 text-xs text-blue-900/80">
        Ce lien permet au demandeur de suivre son dossier et de déposer les documents demandés, sans créer de compte.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-gray-700"
        />
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {copied ? '✓ Copié' : 'Copier le lien'}
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
    </div>
  );
}

export default LienSuivi;

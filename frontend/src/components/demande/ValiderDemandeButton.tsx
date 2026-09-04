'use client';

import { useState } from 'react';
import { dossiersAPI } from '@/lib/api';

/**
 * Bouton « Prendre en compte » pour une demande publique en attente de validation.
 * Appelle l'API de validation (statut → en cours + e-mail de confirmation au demandeur),
 * puis recharge la vue.
 */
export function ValiderDemandeButton({ dossierId }: { dossierId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      await dossiersAPI.validerDemande(dossierId);
      setDone(true);
      setTimeout(() => window.location.reload(), 1000);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Erreur lors de la prise en compte.');
      setLoading(false);
    }
  };

  if (done) {
    return <span className="text-sm font-medium text-green-700">✓ Demande prise en compte - e-mail envoyé au demandeur</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Validation…' : 'Prendre en compte la demande'}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

export default ValiderDemandeButton;

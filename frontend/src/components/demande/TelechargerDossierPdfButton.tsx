'use client';

import { useState } from 'react';
import { dossiersAPI } from '@/lib/api';

/**
 * Bouton de téléchargement du dossier complet en PDF (récapitulatif : identité,
 * type, statut, description, toutes les rubriques du formulaire, pièces jointes…).
 */
export function TelechargerDossierPdfButton({
  dossierId,
  numero,
  className = '',
}: {
  dossierId: string;
  numero?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await dossiersAPI.downloadDossierRecapPDF(dossierId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Dossier_${numero || dossierId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Échec du téléchargement du PDF du dossier:', e);
      alert('Le téléchargement du PDF a échoué. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      title="Télécharger le dossier complet en PDF"
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-md bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      <span aria-hidden>⬇</span>
      {loading ? 'Génération…' : 'Télécharger le dossier (PDF)'}
    </button>
  );
}

export default TelechargerDossierPdfButton;

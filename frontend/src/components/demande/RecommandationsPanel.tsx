'use client';

import { useState } from 'react';
import { dossiersAPI } from '@/lib/api';

interface Recommandation {
  _id?: string;
  id?: string;
  formeJuridiqueRecommandee?: string;
  demarcheRecommandee?: string;
  motif?: string;
  statut?: 'en_attente' | 'acceptee' | 'refusee';
  motifRefus?: string;
  createdAt?: string;
  decidedAt?: string | null;
}

interface Props {
  dossierId: string;
  categorie: string;
  variant: 'client' | 'admin' | 'partenaire';
  recommandations?: Recommandation[];
}

const statutBadge = (s?: string) => {
  if (s === 'acceptee') return { label: '✓ Acceptée', cls: 'bg-green-100 text-green-800' };
  if (s === 'refusee') return { label: '✕ Refusée', cls: 'bg-red-100 text-red-700' };
  return { label: 'En attente', cls: 'bg-amber-100 text-amber-800' };
};

export function RecommandationsPanel({ dossierId, categorie, variant, recommandations }: Props) {
  const [forme, setForme] = useState('');
  const [demarche, setDemarche] = useState('');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le dispositif ne concerne que les dossiers de création d'entreprise.
  if (categorie !== 'constitution_societe') return null;

  const recs = Array.isArray(recommandations) ? recommandations : [];
  const isAdmin = variant === 'admin';

  const handleCreate = async () => {
    if (!forme.trim() && !demarche.trim()) {
      setError('Indiquez au moins une forme juridique ou une démarche recommandée.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await dossiersAPI.createRecommandation(dossierId, {
        formeJuridiqueRecommandee: forme.trim(),
        demarcheRecommandee: demarche.trim(),
        motif: motif.trim(),
      });
      window.location.reload();
    } catch (e: any) {
      setError(e?.response?.data?.message || "L'envoi de la recommandation a échoué.");
      setBusy(false);
    }
  };

  const handleDecision = async (recId: string, decision: 'acceptee' | 'refusee') => {
    let motifRefus = '';
    if (decision === 'refusee') {
      const saisie = window.prompt('Souhaitez-vous préciser la raison du refus ? (facultatif)', '');
      if (saisie === null) return; // annulé
      motifRefus = saisie.trim();
    } else if (!window.confirm('Accepter cette recommandation ? La description de votre dossier sera mise à jour en conséquence.')) {
      return;
    }
    setDecidingId(recId);
    setError(null);
    try {
      await dossiersAPI.decideRecommandation(dossierId, recId, decision, motifRefus);
      window.location.reload();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'La décision n\'a pas pu être enregistrée.');
      setDecidingId(null);
    }
  };

  return (
    <div className="min-w-0 rounded-xl border border-purple-200 bg-purple-50/50 p-4 sm:p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-purple-900">
        Recommandations de l&apos;équipe
      </h3>
      <p className="mb-3 text-xs text-purple-900/70">
        {isAdmin
          ? "Conseillez une forme juridique et une démarche lorsque la demande n'est pas adaptée. Le demandeur pourra les accepter ou les refuser."
          : 'Notre équipe peut vous conseiller sur la forme juridique et la démarche. Vous pouvez accepter ou refuser chaque recommandation.'}
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {/* Liste des recommandations */}
      {recs.length > 0 ? (
        <ul className="mb-4 space-y-3">
          {recs.map((r, i) => {
            const rid = String(r._id || r.id || i);
            const b = statutBadge(r.statut);
            return (
              <li key={rid} className="rounded-lg border border-purple-100 bg-white p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
                  {r.createdAt && (
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </div>
                {r.formeJuridiqueRecommandee && (
                  <p className="text-sm text-foreground">
                    <span className="font-medium">Forme juridique conseillée :</span> {r.formeJuridiqueRecommandee}
                  </p>
                )}
                {r.demarcheRecommandee && (
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                    <span className="font-medium">Démarche :</span> {r.demarcheRecommandee}
                  </p>
                )}
                {r.motif && (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                    <span className="font-medium">Pourquoi :</span> {r.motif}
                  </p>
                )}
                {r.statut === 'refusee' && r.motifRefus && (
                  <p className="mt-0.5 text-xs text-red-700">Motif du refus : {r.motifRefus}</p>
                )}

                {/* Décision (demandeur connecté) */}
                {!isAdmin && r.statut === 'en_attente' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleDecision(rid, 'acceptee')}
                      disabled={decidingId === rid}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      {decidingId === rid ? '…' : 'Accepter'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision(rid, 'refusee')}
                      disabled={decidingId === rid}
                      className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      Refuser
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-4 text-xs text-muted-foreground">Aucune recommandation pour l&apos;instant.</p>
      )}

      {/* Formulaire de création (équipe) */}
      {isAdmin && (
        <div className="rounded-lg border border-purple-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-purple-900">Nouvelle recommandation</p>
          <input
            type="text"
            value={forme}
            onChange={(e) => setForme(e.target.value)}
            placeholder="Forme juridique conseillée (ex. SARL, SAS…)"
            className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <textarea
            value={demarche}
            onChange={(e) => setDemarche(e.target.value)}
            rows={2}
            placeholder="Démarche à suivre conseillée…"
            className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <textarea
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            rows={2}
            placeholder="Motif : pourquoi la demande initiale n'est pas adaptée (facultatif)"
            className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {busy ? 'Envoi…' : 'Envoyer au demandeur'}
          </button>
        </div>
      )}
    </div>
  );
}

export default RecommandationsPanel;

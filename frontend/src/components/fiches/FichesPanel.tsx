'use client';

import { useCallback, useEffect, useState } from 'react';
import { dossiersAPI } from '@/lib/api';
import { FicheForm } from '@/components/fiches/FicheForm';

interface Props {
  dossierId: string;
  categorie: string;
  variant: 'client' | 'admin' | 'partenaire';
}

interface FRequest { _id: string; typeFiche: string; titre: string; statut: string; fiche?: string | null; message?: string; pourPersonne?: string }
interface Fiche { _id: string; typeFiche: string; titre: string; createdAt: string }

const statutBadge = (s: string) =>
  s === 'remplie'
    ? { label: '✓ Remplie', cls: 'bg-green-100 text-green-800' }
    : s === 'annulee'
    ? { label: 'Annulée', cls: 'bg-gray-100 text-gray-600' }
    : { label: 'À remplir', cls: 'bg-amber-100 text-amber-800' };

export function FichesPanel({ dossierId, categorie, variant }: Props) {
  const [requests, setRequests] = useState<FRequest[]>([]);
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [types, setTypes] = useState<Array<{ type: string; titre: string }>>([]);
  const [selType, setSelType] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fillingReqId, setFillingReqId] = useState<string | null>(null);
  const [fillingType, setFillingType] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrls, setInviteUrls] = useState<Record<string, string>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const isAdmin = variant === 'admin';

  const load = useCallback(async () => {
    try {
      const res = await dossiersAPI.getDossierFiches(dossierId);
      if (res.data?.success) {
        setRequests(res.data.requests || []);
        setFiches(res.data.fiches || []);
      }
    } catch (e) { /* silencieux */ }
  }, [dossierId]);

  useEffect(() => {
    if (categorie === 'constitution_societe') load();
  }, [categorie, load]);

  useEffect(() => {
    if (isAdmin && categorie === 'constitution_societe') {
      dossiersAPI.getFicheTypes().then((r) => {
        if (r.data?.success) { setTypes(r.data.types || []); setSelType(r.data.types?.[0]?.type || ''); }
      }).catch(() => {});
    }
  }, [isAdmin, categorie]);

  if (categorie !== 'constitution_societe') return null;

  const requestFiche = async () => {
    if (!selType) return;
    setBusy(true); setMsg(null);
    try {
      await dossiersAPI.requestFiche(dossierId, selType);
      setMsg('Fiche demandée au demandeur.');
      await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || 'La demande a échoué.');
    } finally { setBusy(false); }
  };

  const downloadPdf = async (ficheId: string, typeFiche: string) => {
    try {
      const res = await dossiersAPI.downloadFichePdf(dossierId, ficheId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = `fiche-${typeFiche}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setMsg('Le téléchargement a échoué.'); }
  };

  const addPerson = async () => {
    const nom = window.prompt('Nom de la personne (associé / gérant) dont il faut la fiche d’identification :', '');
    if (nom === null) return;
    setBusy(true); setMsg(null);
    try {
      await dossiersAPI.addEtatCivilRequest(dossierId, nom.trim());
      setMsg('Fiche d’identification ajoutée.');
      await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "L'ajout a échoué.");
    } finally { setBusy(false); }
  };

  const inviter = async (reqId: string, personne?: string) => {
    setInvitingId(reqId); setMsg(null);
    try {
      const res = await dossiersAPI.createFicheInvite(dossierId, [reqId], personne || '', true);
      if (res.data?.success) setInviteUrls((m) => ({ ...m, [reqId]: res.data.url }));
      else setMsg("La génération du lien a échoué.");
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "La génération du lien a échoué.");
    } finally { setInvitingId(null); }
  };

  const submitFill = async (data: any) => {
    if (!fillingReqId) return;
    setSubmitting(true); setMsg(null);
    try {
      await dossiersAPI.remplirFiche(dossierId, fillingReqId, data);
      setMsg('Fiche enregistrée. Le document a été généré.');
      setFillingReqId(null); setFillingType('');
      await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "L'enregistrement a échoué.");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-w-0 rounded-xl border border-teal-200 bg-teal-50/40 p-4 sm:p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-teal-900">Fiches de constitution</h3>
      <p className="mb-3 text-xs text-teal-900/70">
        {isAdmin
          ? 'Demandez au demandeur de remplir la fiche correspondant à la forme juridique.'
          : 'Remplissez les fiches demandées par notre équipe ; le document est généré automatiquement.'}
      </p>

      {msg && <div className="mb-3 rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs text-teal-800">{msg}</div>}

      {/* Demande (admin) */}
      {isAdmin && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-teal-200 bg-white p-3">
          <select value={selType} onChange={(e) => setSelType(e.target.value)} className="h-9 rounded-md border border-gray-300 px-3 text-sm">
            {types.map((t) => <option key={t.type} value={t.type}>{t.titre}</option>)}
          </select>
          <button type="button" onClick={requestFiche} disabled={busy || !selType}
            className="inline-flex h-9 items-center rounded-md bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
            {busy ? '…' : 'Demander cette fiche'}
          </button>
        </div>
      )}

      {/* Liste des demandes */}
      {requests.length > 0 ? (
        <ul className="space-y-2">
          {requests.map((r) => {
            const b = statutBadge(r.statut);
            const canFill = !isAdmin && r.statut === 'a_remplir';
            return (
              <li key={r._id} className="rounded-lg border border-teal-100 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">{r.titre}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
                    {r.message && <p className="mt-0.5 text-xs text-muted-foreground">{r.message}</p>}
                  </div>
                  <div className="flex flex-none gap-2">
                    {canFill && (
                      <button type="button" onClick={() => { setFillingReqId(r._id); setFillingType(r.typeFiche); setMsg(null); }}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">Remplir</button>
                    )}
                    {r.statut === 'remplie' && r.fiche && (
                      <button type="button" onClick={() => downloadPdf(String(r.fiche), r.typeFiche)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">PDF</button>
                    )}
                  </div>
                </div>

                {/* Inviter une autre personne à remplir cette fiche (état civil) */}
                {!isAdmin && r.typeFiche === 'etat_civil' && r.statut !== 'remplie' && (
                  <div className="mt-2">
                    {inviteUrls[r._id] ? (
                      <div className="rounded-md border border-teal-200 bg-teal-50 p-2">
                        <p className="mb-1 text-[11px] text-teal-900">Lien à envoyer à cette personne (accès à cette fiche uniquement) :</p>
                        <div className="flex items-center gap-2">
                          <input readOnly value={inviteUrls[r._id]} className="w-full rounded border border-teal-200 bg-white px-2 py-1 text-[11px]" onFocus={(e) => e.currentTarget.select()} />
                          <button type="button" onClick={() => navigator.clipboard?.writeText(inviteUrls[r._id])} className="rounded bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-700">Copier</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => inviter(r._id, r.pourPersonne || r.titre)} disabled={invitingId === r._id}
                        className="text-xs font-medium text-teal-700 hover:underline disabled:opacity-60">
                        {invitingId === r._id ? '…' : '🔗 Inviter cette personne à remplir'}
                      </button>
                    )}
                  </div>
                )}

                {/* Formulaire de remplissage inline (client) */}
                {canFill && fillingReqId === r._id && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
                    <FicheForm type={fillingType} submitting={submitting} onSubmit={submitFill} onCancel={() => setFillingReqId(null)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Aucune fiche demandée pour l’instant.</p>
      )}

      {/* Ajouter une personne (état civil) — côté demandeur */}
      {!isAdmin && requests.length > 0 && (
        <button type="button" onClick={addPerson} disabled={busy}
          className="mt-2 text-xs font-medium text-teal-700 hover:underline disabled:opacity-60">
          + Ajouter une fiche d’identification (autre associé / gérant)
        </button>
      )}

      {/* Fiches remplies (téléchargement direct) */}
      {fiches.length > 0 && (
        <div className="mt-4 border-t border-teal-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-teal-900">Fiches remplies</p>
          <ul className="space-y-1">
            {fiches.map((f) => (
              <li key={f._id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-foreground">📄 {f.titre}</span>
                <button type="button" onClick={() => downloadPdf(f._id, f.typeFiche)}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Télécharger</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default FichesPanel;

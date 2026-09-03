'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dossiersAPI } from '@/lib/api';
import { FicheForm } from '@/components/fiches/FicheForm';

interface Props {
  dossierId: string;
  categorie: string;
  variant: 'client' | 'admin' | 'partenaire';
}

interface FRequest { _id: string; typeFiche: string; titre: string; statut: string; fiche?: string | null; message?: string; pourPersonne?: string; validationStatus?: string; validationMotif?: string }
interface Fiche { _id: string; typeFiche: string; titre: string; createdAt: string }
interface Piece { _id: string; libelle: string; nature: string; pourPersonne?: string; note?: string; statut: string; validationStatus?: string; validationMotif?: string; document?: string }

// Catalogue standard des pièces à fournir (documents à téléverser).
const PIECES_CATALOG: Array<{ libelle: string; nature: string }> = [
  { libelle: "Pièce d'identité de chaque associé (personne physique)", nature: 'identite' },
  { libelle: 'Associé personne morale : statuts + registre de commerce + PV autorisant la prise de participation', nature: 'statuts' },
  { libelle: "Pièce d'identité du gérant / des cogérants", nature: 'identite' },
  { libelle: "Casier judiciaire du gérant / des cogérants (ou déclaration sur l'honneur)", nature: 'casier' },
  { libelle: "Procuration de l'associé absent le jour de la signature", nature: 'procuration' },
];

const valBadge = (s?: string) =>
  s === 'valide' ? { label: '✓ Validé', cls: 'bg-emerald-100 text-emerald-800' }
    : s === 'refuse' ? { label: '✕ Refusé', cls: 'bg-red-100 text-red-700' }
    : { label: 'En vérification', cls: 'bg-slate-100 text-slate-700' };

const statutBadge = (s: string) =>
  s === 'remplie'
    ? { label: '✓ Remplie', cls: 'bg-green-100 text-green-800' }
    : s === 'annulee'
    ? { label: 'Annulée', cls: 'bg-gray-100 text-gray-600' }
    : { label: 'À remplir', cls: 'bg-amber-100 text-amber-800' };

export function FichesPanel({ dossierId, categorie, variant }: Props) {
  const [requests, setRequests] = useState<FRequest[]>([]);
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [uploadingPiece, setUploadingPiece] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [selPieces, setSelPieces] = useState<number[]>([]);
  const [otherPiece, setOtherPiece] = useState('');
  const pieceInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [types, setTypes] = useState<Array<{ type: string; titre: string }>>([]);
  const [selTypes, setSelTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fillingReqId, setFillingReqId] = useState<string | null>(null);
  const [fillingType, setFillingType] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrls, setInviteUrls] = useState<Record<string, string>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [invites, setInvites] = useState<Array<{ _id: string; personne?: string; personneEmail?: string; invitationEmailSentAt?: string; token?: string }>>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const isAdmin = variant === 'admin';

  const load = useCallback(async () => {
    try {
      const res = await dossiersAPI.getDossierFiches(dossierId);
      if (res.data?.success) {
        setRequests(res.data.requests || []);
        setFiches(res.data.fiches || []);
        setPieces(res.data.pieces || []);
        setInvites(res.data.invites || []);
      }
    } catch (e) { /* silencieux */ }
  }, [dossierId]);

  useEffect(() => {
    if (categorie === 'constitution_societe') load();
  }, [categorie, load]);

  useEffect(() => {
    if (isAdmin && categorie === 'constitution_societe') {
      dossiersAPI.getFicheTypes().then((r) => {
        if (r.data?.success) { setTypes(r.data.types || []); }
      }).catch(() => {});
    }
  }, [isAdmin, categorie]);

  if (categorie !== 'constitution_societe') return null;

  const toggleType = (t: string) =>
    setSelTypes((arr) => (arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]));

  const requestFiche = async () => {
    if (selTypes.length === 0) return;
    setBusy(true); setMsg(null);
    try {
      await dossiersAPI.requestFiches(dossierId, selTypes);
      setMsg(selTypes.length > 1 ? 'Fiches demandées au demandeur.' : 'Fiche demandée au demandeur.');
      setSelTypes([]);
      await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || 'La demande a échoué.');
    } finally { setBusy(false); }
  };

  const openPdf = async (ficheId: string) => {
    const win = window.open('', '_blank');
    try {
      const res = await dossiersAPI.downloadFichePdf(dossierId, ficheId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (win) { win.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); }
    } catch (e) { if (win) win.close(); setMsg('La visualisation a échoué.'); }
  };

  const openPiece = async (documentId: string) => {
    const win = window.open('', '_blank');
    try {
      const res = await dossiersAPI.downloadDocument(documentId);
      const mime = (res.headers as any)['content-type'] || 'application/octet-stream';
      const url = URL.createObjectURL(new Blob([res.data], { type: mime }));
      if (win) { win.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); }
    } catch (e) { if (win) win.close(); setMsg('La visualisation a échoué.'); }
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
      if (res.data?.success) {
        const token = res.data.token;
        const url = token ? `${window.location.origin}/invitation/${token}` : res.data.url;
        setInviteUrls((m) => ({ ...m, [reqId]: url }));
      } else setMsg("La génération du lien a échoué.");
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "La génération du lien a échoué.");
    } finally { setInvitingId(null); }
  };

  const cancelFicheRequest = async (reqId: string) => {
    if (!window.confirm('Annuler cette demande de fiche ?')) return;
    setMsg(null);
    try { await dossiersAPI.cancelFicheRequest(dossierId, reqId); setMsg('Demande de fiche annulée.'); await load(); }
    catch (e: any) { setMsg(e?.response?.data?.message || "L'annulation a échoué."); }
  };

  const cancelPieceRequest = async (pieceId: string) => {
    if (!window.confirm('Annuler cette demande de pièce ?')) return;
    setMsg(null);
    try { await dossiersAPI.cancelPieceRequest(dossierId, pieceId); setMsg('Demande de pièce annulée.'); await load(); }
    catch (e: any) { setMsg(e?.response?.data?.message || "L'annulation a échoué."); }
  };

  const validerFiche = async (reqId: string, statut: 'valide' | 'refuse') => {
    let motif = '';
    if (statut === 'refuse') { const s = window.prompt('Motif du refus (communiqué au demandeur) :', ''); if (s === null) return; motif = s.trim(); }
    setMsg(null);
    try { await dossiersAPI.validerFicheRemplie(dossierId, reqId, statut, motif); setMsg(statut === 'valide' ? 'Fiche validée.' : 'Fiche refusée.'); await load(); }
    catch (e: any) { setMsg(e?.response?.data?.message || 'Action impossible.'); }
  };
  const validerPieceAdmin = async (pieceId: string, statut: 'valide' | 'refuse') => {
    let motif = '';
    if (statut === 'refuse') { const s = window.prompt('Motif du refus (communiqué au demandeur) :', ''); if (s === null) return; motif = s.trim(); }
    setMsg(null);
    try { await dossiersAPI.validerPiece(dossierId, pieceId, statut, motif); setMsg(statut === 'valide' ? 'Pièce validée.' : 'Pièce refusée.'); await load(); }
    catch (e: any) { setMsg(e?.response?.data?.message || 'Action impossible.'); }
  };

  const uploadPiece = async (pieceId: string, file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setMsg('Fichier trop volumineux (10 Mo max).'); return; }
    setUploadingPiece(pieceId); setMsg(null);
    try {
      const fd = new FormData(); fd.append('document', file);
      await dossiersAPI.fournirPiece(dossierId, pieceId, fd);
      setMsg('Pièce transmise.'); await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || 'Le dépôt a échoué.');
    } finally { setUploadingPiece(null); if (pieceInputs.current[pieceId]) pieceInputs.current[pieceId]!.value = ''; }
  };

  const toggleCatalog = (i: number) =>
    setSelPieces((arr) => (arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i]));

  const addSelectedPieces = async () => {
    const toAdd = selPieces.map((i) => ({ libelle: PIECES_CATALOG[i].libelle, nature: PIECES_CATALOG[i].nature }));
    if (otherPiece.trim()) toAdd.push({ libelle: otherPiece.trim(), nature: 'autre' });
    if (toAdd.length === 0) return;
    setBusy(true); setMsg(null);
    try {
      await dossiersAPI.addPieces(dossierId, toAdd);
      setMsg(toAdd.length > 1 ? 'Pièces ajoutées.' : 'Pièce ajoutée.');
      setSelPieces([]); setOtherPiece(''); setShowCatalog(false);
      await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "L'ajout a échoué.");
    } finally { setBusy(false); }
  };

  const submitFill = async (data: any) => {
    if (!fillingReqId) return;
    setSubmitting(true); setMsg(null);
    try {
      const res = await dossiersAPI.remplirFiche(dossierId, fillingReqId, data);
      const n = res.data?.invitationsSent || 0;
      setMsg('Fiche enregistrée. Le document a été généré.' + (n > 0 ? ` ${n} invitation${n > 1 ? 's' : ''} envoyée${n > 1 ? 's' : ''} par e-mail aux associés.` : ''));
      setFillingReqId(null); setFillingType('');
      await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "L'enregistrement a échoué.");
    } finally { setSubmitting(false); }
  };

  const renvoyerInvite = async (inviteId: string) => {
    setResendingId(inviteId); setMsg(null);
    try {
      await dossiersAPI.resendFicheInvite(dossierId, inviteId);
      setMsg('Invitation renvoyée par e-mail.');
      await load();
    } catch (e: any) { setMsg(e?.response?.data?.message || 'Le renvoi a échoué.'); }
    finally { setResendingId(null); }
  };

  // Regroupe demandes de fiches (hors annulées) + pièces par personne : société/demandeur d'abord.
  const personLabel = (key: string) => (key === '__societe__' ? 'Société / demandeur' : `👤 ${key}`);
  const inviteForPerson = (key: string) => invites.find((i) => (i.personne || '').trim() === key);
  const groupByPerson = (): Array<[string, { reqs: FRequest[]; pcs: Piece[] }]> => {
    const keyOf = (n?: string) => (n && n.trim() ? n.trim() : '__societe__');
    const map = new Map<string, { reqs: FRequest[]; pcs: Piece[] }>();
    const ensure = (k: string) => { if (!map.has(k)) map.set(k, { reqs: [], pcs: [] }); return map.get(k)!; };
    requests.forEach((r) => { if (r.statut !== 'annulee') ensure(keyOf(r.pourPersonne)).reqs.push(r); });
    pieces.forEach((p) => ensure(keyOf(p.pourPersonne)).pcs.push(p));
    const entries = Array.from(map.entries());
    entries.sort(([a], [b]) => (a === '__societe__' ? -1 : b === '__societe__' ? 1 : a.localeCompare(b)));
    return entries;
  };

  // Une demande de fiche (Remplir côté demandeur, Valider/Refuser + PDF côté admin, invitation).
  const renderRequestItem = (r: FRequest) => {
    const b = statutBadge(r.statut);
    const canFill = !isAdmin && r.statut === 'a_remplir';
    return (
      <li key={`r_${r._id}`} className="rounded-lg border border-teal-100 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-sm font-medium text-foreground">📝 {r.titre}</span>
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
            {r.message && <p className="mt-0.5 text-xs text-muted-foreground">{r.message}</p>}
          </div>
          <div className="flex flex-none gap-2">
            {canFill && (
              <button type="button" onClick={() => { setFillingReqId(r._id); setFillingType(r.typeFiche); setMsg(null); }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">Remplir</button>
            )}
            {r.statut === 'remplie' && r.fiche && (
              <button type="button" onClick={() => openPdf(String(r.fiche))}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Voir PDF</button>
            )}
            {isAdmin && (
              <button type="button" onClick={() => cancelFicheRequest(r._id)} title="Annuler cette demande"
                className="rounded-md border border-red-200 bg-white px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">✕</button>
            )}
          </div>
        </div>

        {/* Validation (fiche remplie) */}
        {r.statut === 'remplie' && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${valBadge(r.validationStatus).cls}`}>{valBadge(r.validationStatus).label}</span>
            {r.validationStatus === 'refuse' && r.validationMotif && <span className="text-[11px] text-red-700">Motif : {r.validationMotif}</span>}
            {isAdmin && r.validationStatus !== 'valide' && (
              <button type="button" onClick={() => validerFiche(r._id, 'valide')} className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100">✓ Valider</button>
            )}
            {isAdmin && r.validationStatus !== 'refuse' && (
              <button type="button" onClick={() => validerFiche(r._id, 'refuse')} className="rounded border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100">✕ Refuser</button>
            )}
          </div>
        )}

        {/* Inviter une autre personne à remplir cette fiche (état civil) — côté demandeur */}
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
  };

  // Une pièce à fournir (dépôt côté demandeur, Valider/Refuser côté admin).
  const renderPieceItem = (p: Piece) => (
    <li key={`p_${p._id}`} className="rounded-lg border border-teal-100 bg-white p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm text-foreground">📎 {p.libelle}</span>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.statut === 'fourni' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            {p.statut === 'fourni' ? '✓ Fourni' : 'À fournir'}
          </span>
          {p.note && <p className="text-[11px] text-muted-foreground">{p.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          {p.document && (
            <button type="button" onClick={() => openPiece(p.document!)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Voir</button>
          )}
          {!isAdmin && p.statut !== 'fourni' && (
            <input ref={(el) => { pieceInputs.current[p._id] = el; }} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx"
              disabled={uploadingPiece === p._id} onChange={(e) => uploadPiece(p._id, e.target.files?.[0])}
              className="text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-teal-600 file:px-2 file:py-1 file:text-xs file:text-white hover:file:bg-teal-700" />
          )}
          {isAdmin && (
            <button type="button" onClick={() => cancelPieceRequest(p._id)} title="Annuler cette demande"
              className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">✕</button>
          )}
        </div>
      </div>
      {p.statut === 'fourni' && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${valBadge(p.validationStatus).cls}`}>{valBadge(p.validationStatus).label}</span>
          {p.validationStatus === 'refuse' && p.validationMotif && <span className="text-[11px] text-red-700">Motif : {p.validationMotif}</span>}
          {isAdmin && p.validationStatus !== 'valide' && (
            <button type="button" onClick={() => validerPieceAdmin(p._id, 'valide')} className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100">✓ Valider</button>
          )}
          {isAdmin && p.validationStatus !== 'refuse' && (
            <button type="button" onClick={() => validerPieceAdmin(p._id, 'refuse')} className="rounded border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100">✕ Refuser</button>
          )}
        </div>
      )}
    </li>
  );

  return (
    <div className="min-w-0 rounded-xl border border-teal-200 bg-teal-50/40 p-4 sm:p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-teal-900">Fiches de constitution</h3>
      <p className="mb-3 text-xs text-teal-900/70">
        {isAdmin
          ? 'Demandez au demandeur de remplir la fiche correspondant à la forme juridique.'
          : 'Remplissez les fiches demandées par notre équipe ; le document est généré automatiquement.'}
      </p>

      {msg && <div className="mb-3 rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs text-teal-800">{msg}</div>}

      {/* Demande (admin) — sélection multiple, une seule demande */}
      {isAdmin && (
        <div className="mb-4 rounded-lg border border-teal-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-teal-900">Sélectionnez la ou les fiches à demander :</p>
          <div className="mb-3 grid max-h-48 grid-cols-1 gap-1 overflow-auto sm:grid-cols-2">
            {types.map((t) => (
              <label key={t.type} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-teal-50 cursor-pointer">
                <input type="checkbox" checked={selTypes.includes(t.type)} onChange={() => toggleType(t.type)} className="h-4 w-4" />
                <span>{t.titre}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={requestFiche} disabled={busy || selTypes.length === 0}
              className="inline-flex h-9 items-center rounded-md bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
              {busy ? '…' : `Demander ${selTypes.length > 1 ? `les ${selTypes.length} fiches` : 'la fiche'}`}
            </button>
            {selTypes.length > 0 && (
              <button type="button" onClick={() => setSelTypes([])} className="text-xs text-muted-foreground hover:underline">Tout décocher</button>
            )}
          </div>
        </div>
      )}

      {/* Fiches à remplir + pièces à joindre, regroupées par personne */}
      {(() => {
        const entries = groupByPerson();
        if (entries.length === 0) return <p className="text-xs text-muted-foreground">Aucune fiche ni pièce demandée pour l’instant.</p>;
        return (
          <div className="space-y-3">
            {entries.map(([key, g]) => (
              <div key={key} className="rounded-lg border border-teal-100 bg-white/50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-teal-900">{personLabel(key)}</p>
                  {isAdmin && key !== '__societe__' && (() => {
                    const inv = inviteForPerson(key);
                    if (!inv || !inv.personneEmail) return null;
                    return (
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {inv.invitationEmailSentAt
                          ? `✉️ Invité le ${new Date(inv.invitationEmailSentAt).toLocaleDateString('fr-FR')} (${inv.personneEmail})`
                          : `E-mail : ${inv.personneEmail} (non encore invité)`}
                        <button type="button" disabled={resendingId === inv._id} onClick={() => renvoyerInvite(inv._id)}
                          className="rounded border border-teal-300 bg-teal-50 px-2 py-0.5 font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-60">
                          {resendingId === inv._id ? '…' : 'Renvoyer'}
                        </button>
                      </span>
                    );
                  })()}
                </div>
                <ul className="space-y-2">
                  {g.reqs.map((r) => renderRequestItem(r))}
                  {g.pcs.map((p) => renderPieceItem(p))}
                </ul>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Ajouter une fiche d’identification (état civil) — côté demandeur */}
      {!isAdmin && requests.length > 0 && (
        <button type="button" onClick={addPerson} disabled={busy}
          className="mt-3 block text-xs font-medium text-teal-700 hover:underline disabled:opacity-60">
          + Ajouter une fiche d’identification (autre associé / gérant)
        </button>
      )}

      {/* Ajouter des pièces à fournir */}
      <div className="mt-4 border-t border-teal-100 pt-3">
        <button type="button" onClick={() => setShowCatalog((v) => !v)} className="text-xs font-medium text-teal-700 hover:underline">
          + Ajouter des pièces à fournir
        </button>
        {showCatalog && (
          <div className="mt-2 rounded-lg border border-teal-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold text-teal-900">Cochez les pièces à demander :</p>
            <div className="space-y-1">
              {PIECES_CATALOG.map((p, i) => (
                <label key={i} className="flex items-start gap-2 rounded px-1 py-0.5 text-sm hover:bg-teal-50 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={selPieces.includes(i)} onChange={() => toggleCatalog(i)} />
                  <span>{p.libelle}</span>
                </label>
              ))}
            </div>
            <input type="text" value={otherPiece} onChange={(e) => setOtherPiece(e.target.value)}
              placeholder="Autre pièce (facultatif)…"
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={addSelectedPieces} disabled={busy || (selPieces.length === 0 && !otherPiece.trim())}
                className="inline-flex h-9 items-center rounded-md bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                {busy ? '…' : 'Ajouter'}
              </button>
              <button type="button" onClick={() => { setShowCatalog(false); setSelPieces([]); setOtherPiece(''); }} className="text-xs text-muted-foreground hover:underline">Annuler</button>
            </div>
          </div>
        )}
      </div>

      {/* Fiches remplies (téléchargement direct) */}
      {fiches.length > 0 && (
        <div className="mt-4 border-t border-teal-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-teal-900">Fiches remplies</p>
          <ul className="space-y-1">
            {fiches.map((f) => (
              <li key={f._id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-foreground">📄 {f.titre}</span>
                <button type="button" onClick={() => openPdf(f._id)}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Voir PDF</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default FichesPanel;

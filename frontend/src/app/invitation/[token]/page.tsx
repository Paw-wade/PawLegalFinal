'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { dossiersAPI } from '@/lib/api';
import { FicheForm } from '@/components/fiches/FicheForm';

interface InvData {
  societe: string;
  personne: string;
  allowUpload: boolean;
  requests: Array<{ id: string; typeFiche: string; titre: string; statut: string; ficheId: string | null }>;
  pieces?: Array<{ id: string; libelle: string; note?: string; statut: string }>;
}

type Tab = 'fiches' | 'pieces';

export default function InvitationPage() {
  const params = useParams();
  const token = String((params as any)?.token || '');
  const [data, setData] = useState<InvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [fillingId, setFillingId] = useState<string | null>(null);
  const [fillingType, setFillingType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingPieceId, setUploadingPieceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('fiches');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await dossiersAPI.getInvitation(token);
      if (res.data?.success) { setData(res.data); setError(null); }
      else setError('Invitation introuvable.');
    } catch (e: any) {
      setError(e?.response?.data?.message || (e?.response?.status === 410 ? 'Ce lien n\'est plus actif.' : 'Invitation introuvable ou expiree.'));
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const flash = (ok: string | null, ko: string | null = null) => { setMsg(ok); setErrMsg(ko); };

  const submitFill = async (formData: any) => {
    if (!fillingId) return;
    setSubmitting(true); flash(null, null);
    try {
      const res = await dossiersAPI.remplirInvitationFiche(token, fillingId, formData);
      if (res.data?.success) { flash('Fiche enregistree. Merci.'); setFillingId(null); setFillingType(''); await load(); }
      else flash(null, "L'enregistrement a echoue.");
    } catch (e: any) {
      flash(null, e?.response?.data?.message || "L'enregistrement a echoue.");
    } finally { setSubmitting(false); }
  };

  const handleUploadPiece = async (pieceId: string, file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { flash(null, 'Fichier trop volumineux (10 Mo max).'); return; }
    setUploadingPieceId(pieceId); flash(null, null);
    try {
      const fd = new FormData(); fd.append('document', file);
      const res = await dossiersAPI.fournirInvitationPiece(token, pieceId, fd);
      if (res.data?.success) { flash('Piece transmise. Merci.'); await load(); }
      else flash(null, 'Le depot a echoue.');
    } catch (e: any) { flash(null, e?.response?.data?.message || 'Le depot a echoue.'); }
    finally { setUploadingPieceId(null); }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { flash(null, 'Fichier trop volumineux (10 Mo max).'); return; }
    setUploading(true); flash(null, null);
    try {
      const fd = new FormData(); fd.append('document', file);
      const res = await dossiersAPI.uploadInvitationDocument(token, fd);
      if (res.data?.success) flash('Document transmis. Merci.');
      else flash(null, 'Le depot a echoue.');
    } catch (e: any) {
      flash(null, e?.response?.data?.message || 'Le depot a echoue.');
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const fichesDone = (data?.requests || []).filter(r => r.statut === 'remplie').length;
  const fichesTotal = (data?.requests || []).length;
  const piecesDone = (data?.pieces || []).filter(p => p.statut === 'fourni').length;
  const piecesTotal = (data?.pieces || []).length;
  const tabCount = (tab: Tab) => {
    if (tab === 'fiches') return fichesTotal > 0 ? ` (${fichesTotal})` : '';
    if (tab === 'pieces') return piecesTotal > 0 ? ` (${piecesTotal})` : '';
    return '';
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <Header variant="home" />

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-24">
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-4 py-24">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      ) : data ? (
        <main className="flex flex-1 flex-col">
          {/* Header dossier */}
          <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
            <div className="mx-auto max-w-5xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{data.societe}</p>
              <h1 className="mt-0.5 text-lg font-bold text-gray-900">
                {data.personne ? `${data.personne}` : 'Votre invitation'}
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                Remplissez les fiches{piecesTotal > 0 ? ' et fournissez les pieces' : ''} demandees pour votre dossier.
              </p>

              {/* Progression */}
              {(fichesTotal > 0 || piecesTotal > 0) && (
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                  {fichesTotal > 0 && (
                    <span>{fichesDone}/{fichesTotal} fiche{fichesTotal > 1 ? 's' : ''} remplie{fichesDone > 1 ? 's' : ''}</span>
                  )}
                  {piecesTotal > 0 && (
                    <span>{piecesDone}/{piecesTotal} piece{piecesTotal > 1 ? 's' : ''} fournie{piecesDone > 1 ? 's' : ''}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 bg-white px-4 sm:px-6">
            <div className="mx-auto max-w-5xl">
              <nav className="-mb-px flex gap-0">
                {(['fiches', 'pieces'] as Tab[]).filter(t => t !== 'pieces' || piecesTotal > 0).map((tab) => (
                  <button key={tab} type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`border-b-2 px-4 py-3 text-sm font-medium capitalize transition-colors ${
                      activeTab === tab
                        ? 'border-orange-500 text-orange-500'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    {tab === 'fiches' ? 'Fiches' : 'Pieces'}{tabCount(tab)}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Notifications */}
          {(msg || errMsg) && (
            <div className="border-b border-gray-200 px-4 py-2 sm:px-6">
              <div className="mx-auto max-w-5xl">
                {msg && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}
                {errMsg && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{errMsg}</div>}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">

            {/* FICHES TAB */}
            {activeTab === 'fiches' && (
              <div>
                {fichesTotal === 0 ? (
                  <p className="py-12 text-center text-sm text-gray-400">Aucune fiche a remplir pour l'instant.</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {data.requests.map((r) => {
                      const isDone = r.statut === 'remplie';
                      const isActive = fillingId === r.id;
                      return (
                        <div key={r.id} className={`rounded-xl border bg-white p-4 shadow-sm transition-colors ${
                          isActive ? 'border-orange-300 ring-1 ring-orange-200' :
                          isDone ? 'border-green-200' : 'border-gray-200'
                        }`}>
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              isDone ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isDone ? '✓ Remplie' : 'A remplir'}
                            </span>
                          </div>
                          <div className="mb-2">
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                              {data.personne || 'Vous'}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900">{r.titre}</p>

                          {isActive && (
                            <div className="mt-3 rounded-lg border border-gray-200 p-3">
                              <FicheForm type={fillingType} submitting={submitting} onSubmit={submitFill} onCancel={() => setFillingId(null)} />
                            </div>
                          )}

                          {!isDone && !isActive && (
                            <button type="button"
                              onClick={() => { setFillingId(r.id); setFillingType(r.typeFiche); flash(null, null); }}
                              className="mt-3 w-full rounded-lg bg-gray-100 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-200">
                              Remplir
                            </button>
                          )}
                          {!isDone && isActive && (
                            <button type="button"
                              onClick={() => setFillingId(null)}
                              className="mt-2 w-full rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50">
                              Replier
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* PIECES TAB */}
            {activeTab === 'pieces' && (
              <div>
                {piecesTotal === 0 ? (
                  <p className="py-12 text-center text-sm text-gray-400">Aucune piece demandee pour l'instant.</p>
                ) : (
                  <ul className="space-y-0 rounded-xl border border-gray-200 bg-white px-4">
                    {(data.pieces || []).map((p) => (
                      <li key={p.id} className="border-b border-gray-100 py-3 last:border-0">
                        <p className="text-sm font-medium leading-snug text-gray-900">📎 {p.libelle}</p>
                        {p.note && <p className="mt-0.5 text-[11px] text-gray-400">{p.note}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.statut === 'fourni' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                            {p.statut === 'fourni' ? '✓ Fourni' : 'A fournir'}
                          </span>
                          <div className="flex-1" />
                          {p.statut !== 'fourni' && (
                            <label className={`inline-flex cursor-pointer items-center rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-gray-900 hover:bg-teal-700 ${uploadingPieceId === p.id ? 'pointer-events-none opacity-60' : ''}`}>
                              <input
                                type="file"
                                className="sr-only"
                                accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx"
                                disabled={uploadingPieceId === p.id}
                                onChange={(e) => handleUploadPiece(p.id, e.target.files?.[0])}
                              />
                              {uploadingPieceId === p.id ? '...' : '+ Joindre'}
                            </label>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Deposer un autre document */}
                {data.allowUpload && (
                  <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Ajouter un document</p>
                    <p className="mb-3 text-xs text-gray-400">Vous pouvez deposer un autre document si besoin.</p>
                    <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" disabled={uploading}
                      onChange={(e) => handleUpload(e.target.files?.[0])}
                      className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-orange-500 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-orange-600" />
                    {uploading && <span className="mt-1 block text-xs text-gray-400">Envoi...</span>}
                    <p className="mt-1 text-[11px] text-gray-400">10 Mo maximum par fichier.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      ) : null}

      <Footer />
    </div>
  );
}

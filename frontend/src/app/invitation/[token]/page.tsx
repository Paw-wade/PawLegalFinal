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
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await dossiersAPI.getInvitation(token);
      if (res.data?.success) { setData(res.data); setError(null); }
      else setError('Invitation introuvable.');
    } catch (e: any) {
      setError(e?.response?.data?.message || (e?.response?.status === 410 ? 'Ce lien n\'est plus actif.' : 'Invitation introuvable ou expirée.'));
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const flash = (ok: string | null, ko: string | null = null) => { setMsg(ok); setErrMsg(ko); };

  const submitFill = async (formData: any) => {
    if (!fillingId) return;
    setSubmitting(true); flash(null, null);
    try {
      const res = await dossiersAPI.remplirInvitationFiche(token, fillingId, formData);
      if (res.data?.success) { flash('Fiche enregistrée. Merci.'); setFillingId(null); setFillingType(''); await load(); }
      else flash(null, "L'enregistrement a échoué.");
    } catch (e: any) {
      flash(null, e?.response?.data?.message || "L'enregistrement a échoué.");
    } finally { setSubmitting(false); }
  };

  const [uploadingPieceId, setUploadingPieceId] = useState<string | null>(null);
  const handleUploadPiece = async (pieceId: string, file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { flash(null, 'Fichier trop volumineux (10 Mo max).'); return; }
    setUploadingPieceId(pieceId); flash(null, null);
    try {
      const fd = new FormData(); fd.append('document', file);
      const res = await dossiersAPI.fournirInvitationPiece(token, pieceId, fd);
      if (res.data?.success) { flash('Pièce transmise. Merci.'); await load(); }
      else flash(null, 'Le dépôt a échoué.');
    } catch (e: any) { flash(null, e?.response?.data?.message || 'Le dépôt a échoué.'); }
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
      else flash(null, 'Le dépôt a échoué.');
    } catch (e: any) {
      flash(null, e?.response?.data?.message || 'Le dépôt a échoué.');
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-secondary/10">
      <Header variant="home" />
      <main className="container mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        {loading ? (
          <p className="py-16 text-center text-muted-foreground">Chargement…</p>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center"><p className="text-red-700">{error}</p></div>
        ) : data ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invitation — {data.societe}</p>
              <h1 className="mt-1 text-xl font-bold text-foreground">
                {data.personne ? `${data.personne}, ` : ''}vous avez été invité(e) à compléter votre fiche d'identification
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Remplissez la ou les fiche(s) ci-dessous{data.allowUpload ? ' et, si besoin, déposez le document demandé' : ''}. Ce lien ne donne accès qu'à ces éléments.
              </p>
            </div>

            {msg && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{msg}</div>}
            {errMsg && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errMsg}</div>}

            {data.requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{r.titre}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.statut === 'remplie' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    {r.statut === 'remplie' ? '✓ Remplie' : 'À remplir'}
                  </span>
                </div>
                {r.statut !== 'remplie' && fillingId !== r.id && (
                  <button type="button" onClick={() => { setFillingId(r.id); setFillingType(r.typeFiche); flash(null, null); }}
                    className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">Remplir la fiche</button>
                )}
                {r.statut !== 'remplie' && fillingId === r.id && (
                  <div className="mt-3 rounded-lg border border-gray-200 p-3">
                    <FicheForm type={fillingType} submitting={submitting} onSubmit={submitFill} onCancel={() => setFillingId(null)} />
                  </div>
                )}
              </div>
            ))}

            {data.pieces && data.pieces.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Documents à fournir</h2>
                <ul className="space-y-2">
                  {data.pieces.map((p) => (
                    <li key={p.id} className="rounded-lg border border-gray-100 p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-sm text-foreground">{p.libelle}</span>
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.statut === 'fourni' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                            {p.statut === 'fourni' ? '✓ Fourni' : 'À fournir'}
                          </span>
                          {p.note && <p className="text-[11px] text-muted-foreground">{p.note}</p>}
                        </div>
                        {p.statut !== 'fourni' && (
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" disabled={uploadingPieceId === p.id}
                            onChange={(e) => handleUploadPiece(p.id, e.target.files?.[0])}
                            className="text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:text-white hover:file:bg-primary/90" />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.allowUpload && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Déposer un autre document</h2>
                <p className="mb-2 text-xs text-muted-foreground">Ex. copie de votre pièce d'identité ou passeport.</p>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" disabled={uploading}
                  onChange={(e) => handleUpload(e.target.files?.[0])}
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-primary/90" />
                {uploading && <span className="text-xs text-muted-foreground">Envoi…</span>}
                <p className="mt-1 text-[11px] text-muted-foreground">10 Mo maximum par fichier.</p>
              </div>
            )}
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}

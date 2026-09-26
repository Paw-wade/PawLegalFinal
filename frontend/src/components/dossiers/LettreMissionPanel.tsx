'use client';

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

type Version = {
  numero: number;
  type: 'initiale' | 'avenant';
  motifAvenant?: string;
  titre?: string;
  contenuHtml: string;
  statut: 'envoyee' | 'acceptee' | 'remplacee';
  envoyeeAt?: string;
  accepteeAt?: string;
  accepteeNom?: string;
};

type Payload = {
  statut: 'non_envoyee' | 'en_attente' | 'acceptee';
  versions: Version[];
  brouillon?: { titre: string; contenuHtml: string } | null;
};

const STATUT_BADGE: Record<Payload['statut'], { label: string; cls: string }> = {
  non_envoyee: { label: 'Non envoyee', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  en_attente: { label: "En attente d'acceptation", cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  acceptee: { label: 'Acceptee', cls: 'bg-green-50 text-green-800 border-green-200' },
};

const dateFr = (d?: string) =>
  d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : '';

function LettreContent({ html }: { html: string }) {
  return (
    <div
      className="text-gray-900 leading-relaxed text-sm [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_a]:text-blue-600 [&_a]:underline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function RichEditor({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={12}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-orange-400"
    />
  );
}

export function LettreMissionPanel({
  dossierId,
  variant,
  clientName = '',
}: {
  dossierId: string;
  variant: 'admin' | 'client';
  clientName?: string;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const [versionOpen, setVersionOpen] = useState<Record<number, boolean>>({});
  const [pdfBusy, setPdfBusy] = useState<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [titre, setTitre] = useState('');
  const [contenu, setContenu] = useState('');
  const [motifAvenant, setMotifAvenant] = useState('');

  const [nomSignature, setNomSignature] = useState('');
  const [consent, setConsent] = useState(false);

  const baseUrl = `${API_BASE}/user/dossiers/${dossierId}/lettre-mission`;

  const load = useCallback(async () => {
    try {
      const res = await axios.get(baseUrl, { withCredentials: true });
      setData(res.data?.data || null);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Impossible de charger la lettre de mission.');
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => { load(); }, [load]);

  if (loading) return null;
  if (!data) return error ? <p className="text-sm text-red-600">{error}</p> : null;

  const last = data.versions.length ? data.versions[data.versions.length - 1] : null;
  const badge = STATUT_BADGE[data.statut];
  const isAccepted = last?.statut === 'acceptee';
  const isPending = last?.statut === 'envoyee';
  const isAdmin = variant === 'admin';

  if (!isAdmin && !last) return null;

  const open = panelOpen ?? (isPending && !isAdmin);
  const isVersionOpen = (v: Version) => versionOpen[v.numero] ?? (v.statut === 'envoyee' && !isAdmin);

  const downloadPdf = async (v: Version) => {
    setPdfBusy(v.numero);
    setError('');
    try {
      const res = await axios.get(`${baseUrl}/${v.numero}/pdf`, { responseType: 'blob', withCredentials: true });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      const disposition = String(res.headers?.['content-disposition'] || '');
      const serverName = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
      a.download = serverName || `${v.type === 'avenant' ? 'avenant' : 'lettre-de-mission'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Impossible de telecharger le PDF.');
    } finally {
      setPdfBusy(null);
    }
  };

  const startEditing = () => {
    setTitre(data.brouillon?.titre || (isPending ? last?.titre || '' : ''));
    setContenu(data.brouillon?.contenuHtml || (isPending ? last?.contenuHtml || '' : ''));
    setMotifAvenant('');
    setEditing(true);
    setInfo('');
    setError('');
  };

  const run = async (fn: () => Promise<any>, okMsg: string) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      setInfo(okMsg);
      await load();
      return true;
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Une erreur est survenue.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () =>
    run(
      () => axios.put(`${baseUrl}/brouillon`, { titre, contenuHtml: contenu }, { withCredentials: true }),
      'Brouillon enregistre.'
    );

  const send = async () => {
    const ok = await run(
      () => axios.post(`${baseUrl}/envoyer`, { titre, contenuHtml: contenu, motifAvenant }, { withCredentials: true }),
      isAccepted ? 'Avenant envoye au client.' : 'Lettre de mission envoyee au client.'
    );
    if (ok) setEditing(false);
  };

  const accept = () =>
    run(
      () => axios.post(`${baseUrl}/accepter`, { nomSignature, consentement: consent, numero: last!.numero }, { withCredentials: true }),
      'Merci, la lettre de mission est acceptee.'
    );

  const expanded = open || editing;
  const activeCount = data.versions.filter((v) => v.statut !== 'remplacee').length;

  return (
    <section id="lettre-mission" className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 mb-6 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPanelOpen(!open)}
          aria-expanded={expanded}
          className="flex items-center gap-2 text-left"
        >
          <span className={`inline-block text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9656;</span>
          <h2 className="text-base font-bold text-gray-900">Lettre de mission</h2>
          {activeCount > 1 && <span className="text-xs text-gray-400">({activeCount} documents)</span>}
        </button>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {info && <p className="mt-3 text-sm text-green-700">{info}</p>}

      {expanded && (
        <div className="mt-4">
          {isAdmin && !editing && (
            <div className="mb-4">
              <button
                type="button"
                onClick={startEditing}
                className="px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600"
              >
                {isAccepted ? 'Creer un avenant' : isPending ? 'Modifier et renvoyer' : 'Rediger la lettre de mission'}
              </button>
              {!last && data.brouillon && <span className="ml-3 text-xs text-gray-400">Un brouillon est enregistre.</span>}
            </div>
          )}

          {isAdmin && editing && (
            <div className="mb-6 space-y-3 rounded-lg border border-orange-200 bg-orange-50/30 p-4">
              <input
                type="text"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Titre (optionnel)"
                maxLength={200}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              {isAccepted && (
                <input
                  type="text"
                  value={motifAvenant}
                  onChange={(e) => setMotifAvenant(e.target.value)}
                  placeholder="Objet de l'avenant (obligatoire)"
                  maxLength={500}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              )}
              <p className="text-xs text-gray-500">
                Collez votre texte ou saisissez directement. Le HTML basique (gras, listes, tableaux) est conserve.
              </p>
              <RichEditor value={contenu} onChange={setContenu} placeholder="Contenu de la lettre de mission" />
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={send}
                  className="px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
                >
                  {isAccepted ? "Envoyer l'avenant" : 'Envoyer au client'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={saveDraft}
                  className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Enregistrer le brouillon
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 rounded-md text-sm text-gray-500 hover:bg-gray-100"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {isAdmin && !last && !editing && (
            <p className="text-sm text-gray-400">Aucune lettre n'a ete envoyee pour ce dossier.</p>
          )}

          {[...data.versions].reverse().map((v) => {
            const superseded = v.statut === 'remplacee';
            if (superseded && !isAdmin) return null;
            const vOpen = isVersionOpen(v);
            return (
              <article
                key={v.numero}
                className={`mb-3 rounded-lg border border-gray-200 p-3 sm:p-4 ${superseded ? 'opacity-50' : ''}`}
              >
                <header className="flex flex-wrap items-start justify-between gap-2 text-xs text-gray-500">
                  <button
                    type="button"
                    onClick={() => setVersionOpen((prev) => ({ ...prev, [v.numero]: !vOpen }))}
                    className="flex items-start gap-2 text-left"
                  >
                    <span className={`mt-0.5 inline-block text-gray-400 transition-transform ${vOpen ? 'rotate-90' : ''}`}>&#9656;</span>
                    <span>
                      <span className="block text-sm font-semibold text-gray-800">
                        {v.type === 'avenant' ? 'Avenant' : 'Lettre de mission'}
                        {v.titre ? ` : ${v.titre}` : ''}
                        {superseded ? ' (remplacee)' : ''}
                      </span>
                      <span className="block">
                        Envoyee le {dateFr(v.envoyeeAt)}
                        {v.accepteeAt ? ` · Acceptee le ${dateFr(v.accepteeAt)} par ${v.accepteeNom || ''}` : ''}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={pdfBusy === v.numero}
                    onClick={() => downloadPdf(v)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {pdfBusy === v.numero ? 'Generation...' : 'Telecharger le PDF'}
                  </button>
                </header>
                {vOpen && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {v.motifAvenant && <p className="mb-2 text-sm text-gray-600">Objet de l'avenant : {v.motifAvenant}</p>}
                    <LettreContent html={v.contenuHtml} />
                  </div>
                )}
              </article>
            );
          })}

          {!isAdmin && isPending && last && (
            <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50/40 p-4 space-y-3">
              <label className="flex items-start gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
                <span>J'ai lu et j'accepte les termes de cette lettre de mission.</span>
              </label>
              <input
                type="text"
                value={nomSignature}
                onChange={(e) => setNomSignature(e.target.value)}
                placeholder={clientName ? `Saisissez votre nom complet (${clientName})` : 'Saisissez votre nom complet'}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy || !consent || !nomSignature.trim()}
                onClick={accept}
                className="px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
              >
                Accepter la lettre de mission
              </button>
              <p className="text-xs text-gray-400">
                Votre acceptation est enregistree avec la date, l'heure et votre identite.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { lettreMissionAPI } from '@/lib/api';
import { RichTextEditor } from '@/components/RichTextEditor';

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

const STATUT_UI: Record<Payload['statut'], { label: string; className: string }> = {
  non_envoyee: { label: 'Lettre de mission non envoyée', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  en_attente: { label: "En attente d'acceptation du client", className: 'bg-amber-50 text-amber-800 border-amber-200' },
  acceptee: { label: 'Lettre de mission acceptée', className: 'bg-green-50 text-green-800 border-green-200' },
};

const dateFr = (d?: string) =>
  d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : '';

/** Rendu fidèle du texte collé par l'admin (HTML déjà nettoyé côté serveur). */
function LettreContent({ html }: { html: string }) {
  return (
    <div
      className="max-w-none break-words text-gray-900 leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_a]:text-blue-600 [&_a]:underline"
      dangerouslySetInnerHTML={{ __html: html }}
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

  // Repli / dépli : panneau entier + texte de chaque version (par numéro)
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const [versionOpen, setVersionOpen] = useState<Record<number, boolean>>({});
  const [pdfBusy, setPdfBusy] = useState<number | null>(null);

  // Édition (admin)
  const [editing, setEditing] = useState(false);
  const [titre, setTitre] = useState('');
  const [contenu, setContenu] = useState('');
  const [motifAvenant, setMotifAvenant] = useState('');

  // Acceptation (client)
  const [nomSignature, setNomSignature] = useState('');
  const [consent, setConsent] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await lettreMissionAPI.get(dossierId);
      setData(res.data?.data || null);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Impossible de charger la lettre de mission.');
    } finally {
      setLoading(false);
    }
  }, [dossierId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  if (!data) return error ? <p className="text-sm text-red-600">{error}</p> : null;

  const last = data.versions.length ? data.versions[data.versions.length - 1] : null;
  const ui = STATUT_UI[data.statut];
  const isAccepted = last?.statut === 'acceptee';
  const isPending = last?.statut === 'envoyee';
  const isAdmin = variant === 'admin';

  // Le client ne voit rien tant que rien n'a été envoyé.
  if (!isAdmin && !last) return null;

  // Par défaut : déplié seulement si une action est attendue (client : accepter ; admin : édition en cours).
  const open = panelOpen ?? (isPending && !isAdmin);
  const isVersionOpen = (v: Version) => versionOpen[v.numero] ?? (v.statut === 'envoyee' && !isAdmin);

  const downloadPdf = async (v: Version) => {
    setPdfBusy(v.numero);
    setError('');
    try {
      const res = await lettreMissionAPI.pdf(dossierId, v.numero);
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
      setError('Impossible de télécharger le PDF.');
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
    run(() => lettreMissionAPI.saveBrouillon(dossierId, { titre, contenuHtml: contenu }), 'Brouillon enregistré.');

  const send = async () => {
    const ok = await run(
      () => lettreMissionAPI.envoyer(dossierId, { titre, contenuHtml: contenu, motifAvenant }),
      isAccepted ? 'Avenant envoyé au client.' : 'Lettre de mission envoyée au client.'
    );
    if (ok) setEditing(false);
  };

  const accept = () =>
    run(
      () => lettreMissionAPI.accepter(dossierId, { nomSignature, consentement: consent, numero: last!.numero }),
      'Merci, la lettre de mission est acceptée.'
    );

  const expanded = open || editing;
  const activeCount = data.versions.filter((v) => v.statut !== 'remplacee').length;

  const PdfButton = ({ v }: { v: Version }) => (
    <button
      type="button"
      disabled={pdfBusy === v.numero}
      onClick={() => downloadPdf(v)}
      className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {pdfBusy === v.numero ? 'Génération...' : 'Télécharger le PDF'}
    </button>
  );

  return (
    <section id="lettre-mission" className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 mb-6 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPanelOpen(!open)}
          aria-expanded={expanded}
          aria-controls="lettre-mission-body"
          className="flex items-center gap-2 text-left"
        >
          <span className={`inline-block text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9656;</span>
          <h2 className="text-lg font-bold text-gray-900">Lettre de mission</h2>
          {activeCount > 1 && <span className="text-xs text-gray-500">({activeCount} documents)</span>}
        </button>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${ui.className}`}>{ui.label}</span>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {info && <p className="mt-3 text-sm text-green-700">{info}</p>}

      {expanded && (
        <div id="lettre-mission-body" className="mt-3">
          {isAdmin && !editing && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startEditing}
                className="px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600"
              >
                {isAccepted ? 'Créer un avenant' : isPending ? 'Modifier et renvoyer' : 'Rédiger la lettre de mission'}
              </button>
              {!last && data.brouillon && <span className="text-xs text-gray-500">Un brouillon est enregistré.</span>}
            </div>
          )}

          {isAdmin && editing && (
            <div className="mb-6 space-y-3 rounded-lg border border-orange-200 bg-orange-50/40 p-3 sm:p-4">
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
              <p className="text-xs text-gray-600">
                Collez votre texte : la mise en forme (titres, gras, listes, tableaux) est conservée et sera affichée telle quelle au client.
              </p>
              <RichTextEditor value={contenu} onChange={setContenu} placeholder="Collez ou rédigez la lettre de mission ici" />
              <div className="flex flex-wrap gap-2">
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
                  className="px-4 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-100"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {isAdmin && !last && !editing && (
            <p className="text-sm text-gray-500">
              Aucune lettre n'a été envoyée pour ce dossier. Cela ne bloque pas le traitement du dossier.
            </p>
          )}

          {/* Versions, la plus récente en premier */}
          {[...data.versions].reverse().map((v) => {
            const superseded = v.statut === 'remplacee';
            if (superseded && !isAdmin) return null;
            const vOpen = isVersionOpen(v);
            return (
              <article
                key={v.numero}
                className={`mb-3 rounded-lg border border-gray-200 p-3 sm:p-4 ${superseded ? 'opacity-60' : ''}`}
              >
                <header className="flex flex-wrap items-start justify-between gap-2 text-xs text-gray-500">
                  <button
                    type="button"
                    onClick={() => setVersionOpen((prev) => ({ ...prev, [v.numero]: !vOpen }))}
                    aria-expanded={vOpen}
                    className="flex items-start gap-2 text-left"
                  >
                    <span className={`mt-0.5 inline-block text-gray-500 transition-transform ${vOpen ? 'rotate-90' : ''}`}>&#9656;</span>
                    <span>
                      <span className="block text-sm font-semibold text-gray-800">
                        {v.type === 'avenant' ? 'Avenant' : 'Lettre de mission'}
                        {v.titre ? ` : ${v.titre}` : ''}
                        {superseded ? ' (remplacée)' : ''}
                      </span>
                      <span className="block">
                        Envoyée le {dateFr(v.envoyeeAt)}
                        {v.accepteeAt ? ` · Acceptée le ${dateFr(v.accepteeAt)} par ${v.accepteeNom || ''}` : ''}
                      </span>
                    </span>
                  </button>
                  <PdfButton v={v} />
                </header>
                {vOpen && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {v.motifAvenant && <p className="mb-2 text-sm text-gray-700">Objet de l'avenant : {v.motifAvenant}</p>}
                    <LettreContent html={v.contenuHtml} />
                  </div>
                )}
              </article>
            );
          })}

          {!isAdmin && isPending && last && (
            <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50/50 p-4 space-y-3">
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
              <p className="text-xs text-gray-500">
                Votre acceptation est enregistrée avec la date, l'heure et votre identité. Pour toute question, écrivez-nous via la messagerie du dossier.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

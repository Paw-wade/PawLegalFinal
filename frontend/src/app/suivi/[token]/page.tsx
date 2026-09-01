'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { dossiersAPI } from '@/lib/api';
import { getStatutColor, getStatutLabelWithEtapes } from '@/lib/dossierUtils';
import { FicheForm } from '@/components/fiches/FicheForm';

interface SuiviData {
  dossier: {
    id: string;
    titre: string;
    numero: string | null;
    statut: string;
    etapesSupplementaires: any[];
    prochaineEtape: string | null;
    categorie: string;
    description: string;
    champsFormulaire: Array<{ libelle: string; valeur: string }>;
    recommandations: Array<{
      id: string;
      formeJuridiqueRecommandee: string;
      demarcheRecommandee: string;
      motif: string;
      statut: 'en_attente' | 'acceptee' | 'refusee';
      motifRefus: string;
      createdAt: string;
      decidedAt: string | null;
    }>;
    createdAt: string;
    updatedAt: string;
    clientPrenom: string;
  };
  cabinet?: { nom: string; telephone: string; email: string };
  compte?: { existe: boolean; email: string };
  documents: Array<{ id: string; nom: string; createdAt: string }>;
  mesDocuments: Array<{
    id: string;
    nom: string;
    createdAt: string;
    taille?: number;
    validationStatus?: 'en_attente' | 'valide' | 'refuse';
    validationMotif?: string;
  }>;
  documentRequests: Array<{
    id: string;
    libelle: string;
    description: string;
    message?: string;
    isUrgent?: boolean;
    status: string;
  }>;
  ficheRequests?: Array<{
    id: string;
    typeFiche: string;
    titre: string;
    message?: string;
    statut: 'a_remplir' | 'remplie' | 'annulee';
    ficheId: string | null;
  }>;
  fiches?: Array<{ id: string; typeFiche: string; titre: string; createdAt: string }>;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo (aligné sur le back)
const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx';

const CATEGORIE_LABELS: Record<string, string> = {
  constitution_societe: 'Création de société',
  titre_sejour: 'Titre de séjour',
  sejour_titres: 'Titre de séjour',
  sejour: 'Titre de séjour',
  oqtf: 'Recours OQTF',
  visa: 'Recours visa',
  naturalisation: 'Naturalisation',
  regroupement_familial: 'Regroupement familial',
  autre: 'Autre demande',
};

function categorieLabel(c: string): string {
  if (!c) return 'Demande';
  if (CATEGORIE_LABELS[c]) return CATEGORIE_LABELS[c];
  return c.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
}

function humanSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function SuiviDossierPage() {
  const params = useParams();
  const token = String((params as any)?.token || '');
  const [data, setData] = useState<SuiviData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingRecap, setDownloadingRecap] = useState(false);
  const [contactText, setContactText] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTel, setContactTel] = useState('');
  const [sendingContact, setSendingContact] = useState(false);
  const [decidingRecId, setDecidingRecId] = useState<string | null>(null);
  const [fillingFicheReqId, setFillingFicheReqId] = useState<string | null>(null);
  const [fillingFicheType, setFillingFicheType] = useState<string>('');
  const [submittingFiche, setSubmittingFiche] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      const res = await dossiersAPI.getSuivi(token);
      if (res.data?.success) {
        setData(res.data);
        setError(null);
      } else {
        setError('Lien de suivi introuvable.');
      }
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          (e?.response?.status === 404 ? 'Lien de suivi introuvable ou expiré.' : 'Impossible de charger le suivi.')
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return '';
    }
  };

  const flash = (ok: string | null, ko: string | null = null) => {
    setMessage(ok);
    setErrorMsg(ko);
  };

  const handleUpload = async (file: File | undefined, requestId: string | null, key: string) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      flash(null, `« ${file.name} » dépasse la taille maximale de 10 Mo.`);
      if (fileInputs.current[key]) fileInputs.current[key]!.value = '';
      return;
    }
    setUploadingId(key);
    flash(null, null);
    try {
      const fd = new FormData();
      fd.append('document', file);
      if (requestId) fd.append('requestId', requestId);
      const res = await dossiersAPI.uploadSuiviDocument(token, fd);
      if (res.data?.success) {
        flash('Document transmis avec succès. Merci.');
        await load();
      } else {
        flash(null, 'Le dépôt a échoué. Veuillez réessayer.');
      }
    } catch {
      flash(null, 'Le dépôt a échoué. Veuillez réessayer.');
    } finally {
      setUploadingId(null);
      if (fileInputs.current[key]) fileInputs.current[key]!.value = '';
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Retirer ce document ? Cette action est définitive.')) return;
    setDeletingId(docId);
    flash(null, null);
    try {
      const res = await dossiersAPI.deleteSuiviDocument(token, docId);
      if (res.data?.success) {
        flash('Document retiré.');
        await load();
      } else {
        flash(null, 'Le retrait a échoué.');
      }
    } catch (e: any) {
      flash(null, e?.response?.data?.message || 'Le retrait a échoué.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (docId: string, nom: string) => {
    try {
      const res = await dossiersAPI.downloadSuiviDocument(token, docId);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nom || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      flash(null, 'Le téléchargement a échoué. Veuillez réessayer.');
    }
  };

  const handleDownloadRecap = async () => {
    setDownloadingRecap(true);
    flash(null, null);
    try {
      const res = await dossiersAPI.downloadSuiviRecapPdf(token);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'accuse-reception.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      flash(null, 'Le téléchargement du récapitulatif a échoué.');
    } finally {
      setDownloadingRecap(false);
    }
  };

  const handleSendContact = async () => {
    const contenu = contactText.trim();
    if (contenu.length < 2) {
      flash(null, 'Veuillez saisir votre message.');
      return;
    }
    setSendingContact(true);
    flash(null, null);
    try {
      const res = await dossiersAPI.sendSuiviMessage(token, {
        contenu,
        email: contactEmail.trim() || undefined,
        telephone: contactTel.trim() || undefined,
      });
      if (res.data?.success) {
        flash('Votre message a bien été transmis à notre équipe.');
        setContactText('');
      } else {
        flash(null, "L'envoi du message a échoué.");
      }
    } catch (e: any) {
      flash(null, e?.response?.data?.message || "L'envoi du message a échoué.");
    } finally {
      setSendingContact(false);
    }
  };

  const handleDecideRecommandation = async (recId: string, decision: 'acceptee' | 'refusee') => {
    let motifRefus = '';
    if (decision === 'refusee') {
      const s = window.prompt('Souhaitez-vous préciser la raison du refus ? (facultatif)', '');
      if (s === null) return;
      motifRefus = s.trim();
    } else if (!window.confirm('Accepter cette recommandation ? La description de votre dossier sera mise à jour en conséquence.')) {
      return;
    }
    setDecidingRecId(recId);
    flash(null, null);
    try {
      const res = await dossiersAPI.decideSuiviRecommandation(token, recId, decision, motifRefus);
      if (res.data?.success) {
        flash(decision === 'acceptee' ? 'Recommandation acceptée. Merci.' : 'Recommandation refusée.');
        await load();
      } else {
        flash(null, 'La décision n\'a pas pu être enregistrée.');
      }
    } catch (e: any) {
      flash(null, e?.response?.data?.message || 'La décision n\'a pas pu être enregistrée.');
    } finally {
      setDecidingRecId(null);
    }
  };

  const handleFillFiche = async (data: any) => {
    if (!fillingFicheReqId) return;
    setSubmittingFiche(true);
    flash(null, null);
    try {
      const res = await dossiersAPI.remplirSuiviFiche(token, fillingFicheReqId, data);
      if (res.data?.success) {
        flash('Fiche enregistrée. Le document a été généré.');
        setFillingFicheReqId(null);
        setFillingFicheType('');
        await load();
      } else {
        flash(null, "L'enregistrement de la fiche a échoué.");
      }
    } catch (e: any) {
      flash(null, e?.response?.data?.message || "L'enregistrement de la fiche a échoué.");
    } finally {
      setSubmittingFiche(false);
    }
  };

  const handleDownloadFiche = async (ficheId: string, typeFiche: string) => {
    try {
      const res = await dossiersAPI.downloadSuiviFichePdf(token, ficheId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `fiche-${typeFiche}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch {
      flash(null, 'Le téléchargement a échoué.');
    }
  };

  const ficheBadge = (s?: string) =>
    s === 'remplie' ? { label: '✓ Remplie', cls: 'bg-green-100 text-green-800' }
      : s === 'annulee' ? { label: 'Annulée', cls: 'bg-gray-100 text-gray-600' }
      : { label: 'À remplir', cls: 'bg-amber-100 text-amber-800' };

  const recBadge = (s?: string) => {
    if (s === 'acceptee') return { label: '✓ Acceptée', cls: 'bg-green-100 text-green-800' };
    if (s === 'refusee') return { label: '✕ Refusée', cls: 'bg-red-100 text-red-700' };
    return { label: 'En attente de votre décision', cls: 'bg-amber-100 text-amber-800' };
  };

  const etapes = data
    ? [...(data.dossier.etapesSupplementaires || [])].sort((a: any, b: any) => (a?.ordre ?? 0) - (b?.ordre ?? 0))
    : [];
  const fmtDate = (v: any) => {
    if (!v) return '';
    try {
      return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return '';
    }
  };

  const nbDemandes = data?.documentRequests.length || 0;

  const validationBadge = (statut?: string) => {
    if (statut === 'valide') return { label: '✓ Validé par notre équipe', cls: 'bg-green-100 text-green-800' };
    if (statut === 'refuse') return { label: '✕ Refusé', cls: 'bg-red-100 text-red-700' };
    return { label: 'En cours de vérification', cls: 'bg-amber-100 text-amber-800' };
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-secondary/10">
      <Header variant="home" />

      <main className="container mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        {loading ? (
          <p className="py-16 text-center text-muted-foreground">Chargement du suivi…</p>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* En-tête dossier */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suivi de votre demande</p>
              <h1 className="mt-1 text-2xl font-bold text-foreground">{data.dossier.titre || 'Votre dossier'}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatutColor(data.dossier.statut)}`}>
                  Statut : {getStatutLabelWithEtapes(data.dossier.statut, data.dossier.etapesSupplementaires)}
                </span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  {categorieLabel(data.dossier.categorie)}
                </span>
                {data.dossier.numero && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    Dossier n° {data.dossier.numero}
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Demande déposée le {formatDate(data.dossier.createdAt)}
              </p>
              <button
                type="button"
                onClick={handleDownloadRecap}
                disabled={downloadingRecap}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {downloadingRecap ? 'Génération…' : '⤓ Accusé de réception (PDF)'}
              </button>
            </div>

            {message && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>
            )}
            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
            )}

            {/* Bandeau action requise */}
            {nbDemandes > 0 && (
              <a
                href="#documents-demandes"
                className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-amber-400 text-white">!</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    Action requise : {nbDemandes} document{nbDemandes > 1 ? 's' : ''} à fournir
                  </p>
                  <p className="text-xs text-amber-800">
                    Notre équipe attend {nbDemandes > 1 ? 'des documents' : 'un document'} pour faire avancer votre dossier. Cliquez pour les déposer.
                  </p>
                </div>
              </a>
            )}

            {/* Nature de la demande */}
            {(data.dossier.description || data.dossier.champsFormulaire.length > 0) && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Votre demande</h2>
                {data.dossier.description && (
                  <p className="mb-3 whitespace-pre-wrap text-sm text-foreground">{data.dossier.description}</p>
                )}
                {data.dossier.champsFormulaire.length > 0 && (
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                    {data.dossier.champsFormulaire.map((c, i) => (
                      <div key={i} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{c.libelle}</dt>
                        <dd className="text-sm font-medium text-foreground">{c.valeur}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}

            {/* Recommandations de l'équipe (création d'entreprise) */}
            {data.dossier.recommandations && data.dossier.recommandations.length > 0 && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-5 shadow-sm sm:p-6">
                <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-purple-900">Recommandations de notre équipe</h2>
                <p className="mb-3 text-xs text-purple-900/70">
                  Nous vous conseillons sur la forme juridique et la démarche. Vous pouvez accepter ou refuser chaque recommandation.
                </p>
                <ul className="space-y-3">
                  {data.dossier.recommandations.map((r) => {
                    const b = recBadge(r.statut);
                    return (
                      <li key={r.id} className="rounded-lg border border-purple-100 bg-white p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
                          {r.createdAt && (
                            <span className="text-[11px] text-muted-foreground">{formatDate(r.createdAt)}</span>
                          )}
                        </div>
                        {r.formeJuridiqueRecommandee && (
                          <p className="text-sm text-foreground"><span className="font-medium">Forme juridique conseillée :</span> {r.formeJuridiqueRecommandee}</p>
                        )}
                        {r.demarcheRecommandee && (
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground"><span className="font-medium">Démarche :</span> {r.demarcheRecommandee}</p>
                        )}
                        {r.motif && (
                          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground"><span className="font-medium">Pourquoi :</span> {r.motif}</p>
                        )}
                        {r.statut === 'refusee' && r.motifRefus && (
                          <p className="mt-0.5 text-xs text-red-700">Motif du refus : {r.motifRefus}</p>
                        )}
                        {r.statut === 'en_attente' && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleDecideRecommandation(r.id, 'acceptee')}
                              disabled={decidingRecId === r.id}
                              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                            >
                              {decidingRecId === r.id ? '…' : 'Accepter'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDecideRecommandation(r.id, 'refusee')}
                              disabled={decidingRecId === r.id}
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
              </div>
            )}

            {/* Fiches de constitution à remplir (création d'entreprise) */}
            {((data.ficheRequests && data.ficheRequests.length > 0) || (data.fiches && data.fiches.length > 0)) && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-5 shadow-sm sm:p-6">
                <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-teal-900">Fiches à remplir</h2>
                <p className="mb-3 text-xs text-teal-900/70">
                  Remplissez la fiche demandée par notre équipe ; le document est généré automatiquement et rattaché à votre dossier.
                </p>
                <ul className="space-y-2">
                  {(data.ficheRequests || []).map((r) => {
                    const b = ficheBadge(r.statut);
                    const canFill = r.statut === 'a_remplir';
                    return (
                      <li key={r.id} className="rounded-lg border border-teal-100 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-foreground">{r.titre}</span>
                            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
                            {r.message && <p className="mt-0.5 text-xs text-muted-foreground">{r.message}</p>}
                          </div>
                          <div className="flex flex-none gap-2">
                            {canFill && (
                              <button type="button" onClick={() => { setFillingFicheReqId(r.id); setFillingFicheType(r.typeFiche); flash(null, null); }}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">Remplir</button>
                            )}
                            {r.statut === 'remplie' && r.ficheId && (
                              <button type="button" onClick={() => handleDownloadFiche(r.ficheId as string, r.typeFiche)}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">PDF</button>
                            )}
                          </div>
                        </div>
                        {canFill && fillingFicheReqId === r.id && (
                          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
                            <FicheForm type={fillingFicheType} submitting={submittingFiche} onSubmit={handleFillFiche} onCancel={() => setFillingFicheReqId(null)} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {data.fiches && data.fiches.length > 0 && (
                  <div className="mt-3 border-t border-teal-100 pt-3">
                    <p className="mb-2 text-xs font-semibold text-teal-900">Documents générés</p>
                    <ul className="space-y-1">
                      {data.fiches.map((f) => (
                        <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-foreground">📄 {f.titre}</span>
                          <button type="button" onClick={() => handleDownloadFiche(f.id, f.typeFiche)}
                            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Télécharger</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Avancement */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">Avancement</h2>
              <div className="mb-4 flex items-center gap-3 rounded-lg bg-primary/5 p-3">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary text-white">✓</span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Statut actuel</p>
                  <p className="text-sm font-semibold text-foreground">
                    {getStatutLabelWithEtapes(data.dossier.statut, data.dossier.etapesSupplementaires)}
                  </p>
                </div>
              </div>
              {etapes.length > 0 ? (
                <ol className="ml-1 space-y-4 border-l-2 border-primary/20 pl-5">
                  {etapes.map((e: any, i: number) => (
                    <li key={e.id || e._id || i} className="relative">
                      <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-white" />
                      <p className="text-sm font-medium text-foreground">{e.label}</p>
                      {e.date && <p className="text-xs text-muted-foreground">{fmtDate(e.date)}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Votre demande est bien enregistrée. Son avancement s'affichera ici au fur et à mesure du traitement.
                </p>
              )}
              {data.dossier.prochaineEtape && (
                <div className="mt-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">Prochaine étape</p>
                  <p className="text-sm font-medium text-foreground">{data.dossier.prochaineEtape}</p>
                </div>
              )}
            </div>

            {/* Documents demandés */}
            <div id="documents-demandes" className="scroll-mt-24 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">Documents demandés</h2>
              {data.documentRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun document n'est demandé pour l'instant.</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {data.documentRequests.map((r) => (
                    <li key={r.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{r.libelle}</p>
                        {r.isUrgent && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Urgent</span>
                        )}
                      </div>
                      {r.description && <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>}
                      {r.message && (
                        <p className="mt-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">💬 {r.message}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          ref={(el) => { fileInputs.current[r.id] = el; }}
                          type="file"
                          accept={ACCEPTED_FILES}
                          disabled={uploadingId === r.id}
                          onChange={(e) => handleUpload(e.target.files?.[0], r.id, r.id)}
                          className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-primary/90"
                        />
                        {uploadingId === r.id && <span className="text-xs text-muted-foreground">Envoi…</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Dépôt libre (document supplémentaire) */}
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="mb-2 text-xs text-muted-foreground">Vous pouvez aussi ajouter un autre document :</p>
                <input
                  ref={(el) => { fileInputs.current['__free'] = el; }}
                  type="file"
                  accept={ACCEPTED_FILES}
                  disabled={uploadingId === '__free'}
                  onChange={(e) => handleUpload(e.target.files?.[0], null, '__free')}
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-50"
                />
                {uploadingId === '__free' && <span className="text-xs text-muted-foreground">Envoi…</span>}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Formats acceptés : PDF, images, Word, Excel · 10 Mo maximum par fichier.
                </p>
              </div>
            </div>

            {/* Vos documents transmis */}
            {data.mesDocuments.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Vos documents transmis</h2>
                <ul className="space-y-3">
                  {data.mesDocuments.map((d) => {
                    const b = validationBadge(d.validationStatus);
                    return (
                      <li key={d.id} className="rounded-lg border border-gray-100 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm text-foreground">📎 {d.nom}</span>
                          <div className="flex flex-none items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownload(d.id, d.nom)}
                              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Télécharger
                            </button>
                            {d.validationStatus !== 'valide' && (
                              <button
                                type="button"
                                onClick={() => handleDelete(d.id)}
                                disabled={deletingId === d.id}
                                className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                              >
                                {deletingId === d.id ? '…' : 'Retirer'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDate(d.createdAt)}{d.taille ? ` · ${humanSize(d.taille)}` : ''}
                          </span>
                        </div>
                        {d.validationStatus === 'refuse' && d.validationMotif && (
                          <p className="mt-1 text-xs text-red-700">Motif : {d.validationMotif}. Merci de déposer un nouveau document.</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Documents partagés */}
            {data.documents.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Documents partagés par notre équipe</h2>
                <ul className="space-y-2">
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-foreground">📄 {d.nom}</span>
                      <div className="flex flex-none items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatDate(d.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => handleDownload(d.id, d.nom)}
                          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Télécharger
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Contacter l'équipe + coordonnées */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Une question ? Contactez notre équipe</h2>
              {data.cabinet && (
                <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span className="font-medium text-foreground">{data.cabinet.nom}</span>
                  {data.cabinet.telephone && (
                    <a href={`tel:${data.cabinet.telephone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      📞 {data.cabinet.telephone}
                    </a>
                  )}
                  {data.cabinet.email && (
                    <a href={`mailto:${data.cabinet.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      ✉️ {data.cabinet.email}
                    </a>
                  )}
                </div>
              )}
              <textarea
                value={contactText}
                onChange={(e) => setContactText(e.target.value)}
                rows={3}
                placeholder="Votre message ou votre question au sujet de ce dossier…"
                className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Votre e-mail (facultatif)"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="tel"
                  value={contactTel}
                  onChange={(e) => setContactTel(e.target.value)}
                  placeholder="Votre téléphone (facultatif)"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                type="button"
                onClick={handleSendContact}
                disabled={sendingContact}
                className="mt-3 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {sendingContact ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>

            {/* Invitation compte / connexion */}
            {data.compte && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center sm:p-6">
                {data.compte.existe ? (
                  <>
                    <p className="text-sm font-medium text-foreground">Vous avez déjà un compte Ada Papers.</p>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Connectez-vous pour retrouver votre dossier et un suivi complet dans votre espace personnel.
                    </p>
                    <a
                      href={`/auth/signin${data.compte.email ? `?email=${encodeURIComponent(data.compte.email)}` : ''}`}
                      className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                    >
                      Se connecter
                    </a>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">Suivez votre dossier en permanence.</p>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Créez votre compte avec la même adresse e-mail : votre dossier y sera automatiquement rattaché.
                    </p>
                    <a
                      href={`/auth/signup${data.compte.email ? `?email=${encodeURIComponent(data.compte.email)}` : ''}`}
                      className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                    >
                      Créer mon compte
                    </a>
                  </>
                )}
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Vous serez prévenu par e-mail à chaque évolution de votre dossier. Conservez ce lien : il vous permet de suivre votre dossier et de déposer vos documents à tout moment.
            </p>
          </div>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}

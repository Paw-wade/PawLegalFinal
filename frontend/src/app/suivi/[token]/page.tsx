'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { dossiersAPI } from '@/lib/api';
import { getStatutColor, getStatutLabelWithEtapes } from '@/lib/dossierUtils';
import { FicheForm } from '@/components/fiches/FicheForm';
import { Download, Eye, X, Trash2, Send } from 'lucide-react';

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
    pourPersonne?: string;
    message?: string;
    statut: 'a_remplir' | 'remplie' | 'annulee';
    validationStatus?: string;
    validationMotif?: string;
    ficheId: string | null;
    draftData?: any;
    draftStep?: number;
  }>;
  fiches?: Array<{ id: string; typeFiche: string; titre: string; createdAt: string }>;
  pieceRequests?: Array<{ id: string; libelle: string; nature: string; pourPersonne?: string; note?: string; statut: string; validationStatus?: string; validationMotif?: string; documentId?: string | null }>;
  tarification?: {
    fraisExoneres: boolean;
    formuleTarifaire?: 'standard' | 'premium' | null;
    montantTarificationFixe?: number | null;
    tarificationPrestations?: Array<{ label: string; montant: number; statut: string }>;
    paiementTarificationEffectue: boolean;
    tarificationPaiementEnPlusieursFoisAutorise: boolean;
    tarificationEcheances?: Array<{ id: string; label?: string | null; montant: number; dateEcheance: string; statut: string }>;
    tarificationLastNotifySummary?: string | null;
    tarificationDevise?: string;
  } | null;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo (aligné sur le back)
const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx';

const CATEGORIE_LABELS: Record<string, string> = {
  constitution_societe: 'Création de société',
  constitution_societe_senegal: 'Création de société - Sénégal',
  constitution_societe_france: 'Création de société - France',
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
  const [inviteUrls, setInviteUrls] = useState<Record<string, string>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [uploadingPieceId, setUploadingPieceId] = useState<string | null>(null);
  const [personModal, setPersonModal] = useState<{
    open: boolean;
    nom: string;
    ficheTypes: string[];
    pieces: Array<{ libelle: string; nature: string }>;
    creerInvitation: boolean;
    customLabel: string;
  }>({ open: false, nom: '', ficheTypes: ['etat_civil'], pieces: [{ libelle: "Piece d'identite (carte nationale ou passeport)", nature: 'identite' }], creerInvitation: true, customLabel: '' });
  const [associeResult, setAssocieResult] = useState<{ nom: string; inviteUrl: string } | null>(null);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; titre: string } | null>(null);
  const [addingPiece, setAddingPiece] = useState(false);
  const [newPieceLibelle, setNewPieceLibelle] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'fiches' | 'pieces' | 'documents' | 'recap' | 'messages'>('fiches');
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
        const n = res.data?.invitationsSent || 0;
        flash('Fiche enregistrée. Le document a été généré.' + (n > 0 ? ` ${n} invitation${n > 1 ? 's' : ''} envoyée${n > 1 ? 's' : ''} par e-mail aux associés.` : ''));
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

  const handleUploadPiece = async (pieceId: string, file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { flash(null, 'Fichier trop volumineux (10 Mo max).'); return; }
    setUploadingPieceId(pieceId); flash(null, null);
    try {
      const fd = new FormData(); fd.append('document', file);
      const res = await dossiersAPI.fournirSuiviPiece(token, pieceId, fd);
      if (res.data?.success) { flash('Pièce transmise. Merci.'); await load(); }
      else flash(null, 'Le dépôt a échoué.');
    } catch (e: any) {
      flash(null, e?.response?.data?.message || 'Le dépôt a échoué.');
    } finally { setUploadingPieceId(null); if (fileInputs.current[`piece_${pieceId}`]) fileInputs.current[`piece_${pieceId}`]!.value = ''; }
  };

  const handleAddPieceSuivi = async () => {
    const libelle = newPieceLibelle.trim();
    if (!libelle) return;
    setAddBusy(true); flash(null, null);
    try {
      const res = await dossiersAPI.addSuiviPiece(token, libelle);
      if (res.data?.success) { flash('Pièce ajoutée.'); setNewPieceLibelle(''); setAddingPiece(false); await load(); }
      else flash(null, "L'ajout a échoué.");
    } catch (e: any) { flash(null, e?.response?.data?.message || "L'ajout a échoué."); }
    finally { setAddBusy(false); }
  };

  const inviterSuivi = async (reqId: string, personne?: string) => {
    setInvitingId(reqId); flash(null, null);
    try {
      const res = await dossiersAPI.createSuiviFicheInvite(token, [reqId], personne || '', true);
      if (res.data?.success) {
        const invToken = res.data.token;
        const url = invToken ? `${window.location.origin}/invitation/${invToken}` : res.data.url;
        setInviteUrls((m) => ({ ...m, [reqId]: url }));
      } else flash(null, "La génération du lien a échoué.");
    } catch (e: any) {
      flash(null, e?.response?.data?.message || "La génération du lien a échoué.");
    } finally { setInvitingId(null); }
  };

  const INIT_PERSON_MODAL = { open: false, nom: '', ficheTypes: ['etat_civil' as string], pieces: [{ libelle: "Piece d'identite (carte nationale ou passeport)", nature: 'identite' }], creerInvitation: true, customLabel: '' };

  const handleAddAssocie = async () => {
    const nom = personModal.nom.trim();
    if (!nom || personModal.ficheTypes.length === 0) return;
    setAddBusy(true); flash(null, null);
    try {
      const res = await dossiersAPI.ajouterSuiviAssocie(token, {
        nom,
        ficheTypes: personModal.ficheTypes,
        pieces: personModal.pieces,
        creerInvitation: personModal.creerInvitation,
      });
      if (res.data?.success) {
        flash('Associe ajoute avec succes.');
        setPersonModal(INIT_PERSON_MODAL);
        if (res.data.inviteUrl) setAssocieResult({ nom, inviteUrl: res.data.inviteUrl });
        await load();
      } else flash(null, "L'ajout a echoue.");
    } catch (e: any) {
      flash(null, e?.response?.data?.message || "L'ajout a echoue.");
    } finally { setAddBusy(false); }
  };

  const handleViewPiece = async (pieceId: string) => {
    flash(null, null);
    const win = window.open('', '_blank');
    try {
      const res = await dossiersAPI.viewSuiviPiece(token, pieceId);
      const mime = (res.headers as any)['content-type'] || 'application/octet-stream';
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      if (win && !win.closed) {
        win.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch {
      if (win && !win.closed) win.close();
      flash(null, 'La visualisation a échoué.');
    }
  };

  const handleViewFiche = async (ficheId: string, titre: string) => {
    flash(null, null);
    try {
      const res = await dossiersAPI.downloadSuiviFichePdf(token, ficheId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setViewingPdf({ url, titre });
    } catch {
      flash(null, 'La visualisation a echoue. Veuillez reessayer.');
    }
  };

  const handleDownloadFiche = async (ficheId: string, titre: string) => {
    flash(null, null);
    try {
      const res = await dossiersAPI.downloadSuiviFichePdf(token, ficheId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = titre ? `${titre}.pdf` : 'fiche.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      flash(null, 'Le téléchargement du PDF a échoué.');
    }
  };

  const valBadgeSuivi = (s?: string) =>
    s === 'valide' ? { label: '✓ Validé', cls: 'bg-emerald-100 text-emerald-800' }
      : s === 'refuse' ? { label: '✕ Refusé', cls: 'bg-red-100 text-red-700' }
      : { label: 'En vérif.', cls: 'bg-slate-100 text-slate-700' };

  const ficheBadge = (s?: string) =>
    s === 'remplie' ? { label: '✓ Remplie', cls: 'bg-green-100 text-green-800' }
      : s === 'annulee' ? { label: 'Annulée', cls: 'bg-gray-100 text-gray-600' }
      : { label: 'À remplir', cls: 'bg-amber-100 text-amber-800' };

  // Statut combiné (à faire → en vérif. → validé/refusé) pour le récap par personne.
  const ficheStatusBadge = (r: { statut?: string; validationStatus?: string }) =>
    r.statut !== 'remplie' ? ficheBadge(r.statut) : valBadgeSuivi(r.validationStatus);
  const pieceStatusBadge = (p: { statut?: string; validationStatus?: string }) =>
    p.statut !== 'fourni' ? { label: 'À fournir', cls: 'bg-amber-100 text-amber-800' } : valBadgeSuivi(p.validationStatus);

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

  const CONSTITUTION_STEPS = [
    { id: 1, label: 'Demande recue' },
    { id: 2, label: 'Fiches et pieces' },
    { id: 3, label: "Verification par l'equipe" },
    { id: 4, label: 'Constitution de la societe' },
    { id: 5, label: 'Dossier finalise' },
  ];
  const getConstitutionCurrentStep = (statut: string): number => {
    const s = (statut || '').toLowerCase();
    if (['finalise', 'livre', 'cloture', 'termine'].some(k => s.includes(k))) return 5;
    if (['constitution', 'immatriculation'].some(k => s.includes(k))) return 4;
    if (['verification', 'controle'].some(k => s.includes(k))) return 3;
    return 2;
  };
  const isConstitution = ((data?.dossier?.categorie) || '').startsWith('constitution');
  const currentStep = isConstitution ? getConstitutionCurrentStep(data?.dossier?.statut || '') : 0;
  const nbFichesTotal = (data?.ficheRequests || []).filter(r => r.statut !== 'annulee').length;
  const nbFichesRemplies = (data?.ficheRequests || []).filter(r => r.statut === 'remplie').length;
  const nbAFaire = (data?.ficheRequests || []).filter(r => r.statut === 'a_remplir').length;
  const ficheTimeEst = (typeFiche: string): string => {
    if (typeFiche === 'declaration_honneur') return '3 min';
    if (typeFiche === 'renseignements_societe') return '10 min';
    return '5 min';
  };
  const ficheSubtitleText = (r: NonNullable<SuiviData['ficheRequests']>[number]): string => {
    if (r.typeFiche === 'declaration_honneur') return 'La societe - vous';
    if (r.typeFiche === 'renseignements_societe') return "Choisissez d'abord la forme de la societe";
    if (r.typeFiche === 'procuration_speciale') return 'Pour constituer la societe - a signer ensuite';
    if (r.pourPersonne) return `${r.pourPersonne} - associe, personne physique`;
    return 'La societe - vous';
  };
  const personInitials = (name: string): string => {
    const parts = (name || '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (name || '').substring(0, 2).toUpperCase();
  };
  const allFiches = (data?.ficheRequests || []).filter(r => r.statut !== 'annulee');
  const firstToFill = allFiches.find(r => r.statut === 'a_remplir');
  const circRadius = 28;
  const circCirc = 2 * Math.PI * circRadius;
  const circOffset = nbFichesTotal > 0 ? circCirc * (1 - nbFichesRemplies / nbFichesTotal) : circCirc;

  const validationBadge = (statut?: string) => {
    if (statut === 'valide') return { label: '✓ Validé par notre équipe', cls: 'bg-green-100 text-green-800' };
    if (statut === 'refuse') return { label: '✕ Refusé', cls: 'bg-red-100 text-red-700' };
    return { label: 'En cours de vérification', cls: 'bg-amber-100 text-amber-800' };
  };

  // Regroupe fiches (hors annulées) + pièces par personne : société/demandeur d'abord,
  // puis les personnes par ordre alphabétique. Partagé par le récap et les listes actionnables.
  const groupRequestsByPerson = (): Array<[string, { fiches: NonNullable<SuiviData['ficheRequests']>; pieces: NonNullable<SuiviData['pieceRequests']> }]> => {
    if (!data) return [];
    const keyOf = (n?: string) => (n && n.trim() ? n.trim() : '__societe__');
    const groups = new Map<string, { fiches: NonNullable<SuiviData['ficheRequests']>; pieces: NonNullable<SuiviData['pieceRequests']> }>();
    const ensure = (k: string) => { if (!groups.has(k)) groups.set(k, { fiches: [], pieces: [] }); return groups.get(k)!; };
    (data.ficheRequests || []).forEach((r) => { if (r.statut !== 'annulee') ensure(keyOf(r.pourPersonne)).fiches.push(r); });
    (data.pieceRequests || []).forEach((p) => ensure(keyOf(p.pourPersonne)).pieces.push(p));
    const entries = Array.from(groups.entries());
    entries.sort(([a], [b]) => (a === '__societe__' ? -1 : b === '__societe__' ? 1 : a.localeCompare(b)));
    return entries;
  };
  const personLabel = (key: string) => (key === '__societe__' ? 'Société / demandeur (vous)' : `👤 ${key}`);

  // Récapitulatif (lecture seule) des documents demandés, groupés par personne.
  // Rendu à la fois dans la barre latérale fixe (grand écran) et en ligne (petit écran).
  const renderRecapInner = () => {
    const entries = groupRequestsByPerson();
    if (entries.length === 0) return null;
    return (
      <div className="space-y-3">
        {entries.map(([key, g]) => (
          <div key={key} className="rounded-md bg-teal-50/60 p-2.5">
            <p className="mb-1.5 text-xs font-bold text-teal-900">
              {key === '__societe__' ? 'Société / demandeur (vous)' : `👤 ${key}`}
            </p>
            <ul className="space-y-1">
              {g.fiches.map((r) => {
                const b = ficheStatusBadge(r);
                return (
                  <li key={`f_${r.id}`} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">📝 {r.titre}</span>
                    <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
                  </li>
                );
              })}
              {g.pieces.map((p) => {
                const b = pieceStatusBadge(p);
                return (
                  <li key={`p_${p.id}`} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">📎 {p.libelle}</span>
                    <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  // Une fiche a remplir : nom sur sa propre ligne, badges+actions sur la ligne dessous.
  const renderFicheItem = (r: NonNullable<SuiviData['ficheRequests']>[number]) => {
    const b = ficheBadge(r.statut);
    const canFill = r.statut === 'a_remplir';
    const val = valBadgeSuivi(r.validationStatus);
    return (
      <li key={`f_${r.id}`} className="py-2.5 border-b border-teal-100/60 last:border-0">
        <p className="text-sm font-medium leading-snug text-foreground">📝 {r.titre}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
          {r.statut === 'remplie' && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${val.cls}`}>{val.label}</span>
          )}
          <div className="flex-1" />
          {r.statut === 'remplie' && r.ficheId && (
            <button type="button" title="Visualiser le PDF" onClick={() => handleViewFiche(r.ficheId as string, r.titre)}
              className="rounded-md border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50">
              <Eye size={14} />
            </button>
          )}
          {canFill && (
            <button type="button" onClick={() => { setFillingFicheReqId(fillingFicheReqId === r.id ? null : r.id); setFillingFicheType(r.typeFiche); flash(null, null); }}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-gray-900 hover:bg-primary/90">
              {fillingFicheReqId === r.id ? 'Replier' : 'Remplir'}
            </button>
          )}
          {r.typeFiche === 'etat_civil' && canFill && !inviteUrls[r.id] && (
            <button type="button" onClick={() => inviterSuivi(r.id, r.pourPersonne || r.titre)} disabled={invitingId === r.id}
              className="rounded-md border border-teal-300 bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-60">
              {invitingId === r.id ? '...' : '🔗 Inviter'}
            </button>
          )}
        </div>
        {r.validationStatus === 'refuse' && r.validationMotif && (
          <p className="mt-0.5 text-[11px] text-red-600">Motif : {r.validationMotif}. Merci de refaire la fiche.</p>
        )}
        {r.message && <p className="mt-0.5 text-[11px] text-muted-foreground">{r.message}</p>}
        {inviteUrls[r.id] && (
          <div className="mt-1.5 flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 p-2">
            <input readOnly value={inviteUrls[r.id]} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded border border-teal-200 bg-white px-2 py-1 text-[11px]" />
            <button type="button" onClick={() => navigator.clipboard?.writeText(inviteUrls[r.id])} className="flex-none rounded bg-teal-600 px-2 py-1 text-[11px] font-medium text-gray-900 hover:bg-teal-700">Copier</button>
          </div>
        )}
        {canFill && fillingFicheReqId === r.id && (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
            <FicheForm
              type={fillingFicheType}
              submitting={submittingFiche}
              onSubmit={handleFillFiche}
              onCancel={() => setFillingFicheReqId(null)}
              ficheRequestId={r.id}
              token={token}
              draftData={r.draftData}
              draftStep={r.draftStep}
            />
          </div>
        )}
      </li>
    );
  };

  // Une piece a fournir : nom sur sa propre ligne, badges+actions sur la ligne dessous.
  const renderPieceItem = (p: NonNullable<SuiviData['pieceRequests']>[number]) => {
    const val = valBadgeSuivi(p.validationStatus);
    return (
      <li key={`p_${p.id}`} className="py-2.5 border-b border-teal-100/60 last:border-0">
        <p className="text-sm font-medium leading-snug text-foreground">📎 {p.libelle}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.statut === 'fourni' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            {p.statut === 'fourni' ? '✓ Fourni' : 'A fournir'}
          </span>
          {p.statut === 'fourni' && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${val.cls}`}>{val.label}</span>
          )}
          <div className="flex-1" />
          {p.documentId && (
            <button type="button" title="Visualiser" onClick={() => handleViewPiece(p.id)}
              className="rounded-md border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50">
              <Eye size={14} />
            </button>
          )}
          {p.statut !== 'fourni' && (
            <label className={`inline-flex cursor-pointer items-center rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-gray-900 hover:bg-teal-700 ${uploadingPieceId === p.id ? 'pointer-events-none opacity-60' : ''}`}>
              <input
                ref={(el) => { fileInputs.current[`piece_${p.id}`] = el; }}
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
        {p.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{p.note}</p>}
        {p.validationStatus === 'refuse' && p.validationMotif && (
          <p className="mt-0.5 text-[11px] text-red-600">Motif : {p.validationMotif}. Merci de redeposer.</p>
        )}
      </li>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <Header variant="home" />

      {/* Loading state */}
      {loading && (
        <div className="flex flex-1 items-center justify-center py-24">
          <p className="text-gray-500">Chargement du suivi...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-1 items-center justify-center px-4 py-24">
          <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Main content */}
      {!loading && !error && data && (
        <>
          {/* Dossier header bar */}
          <div className="border-b border-gray-200 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
                    {data.dossier.numero && <span>N&#176; {data.dossier.numero}</span>}
                    {data.dossier.numero && <span>&#183;</span>}
                    <span>Depose le {formatDate(data.dossier.createdAt)}</span>
                  </div>
                  <h1 className="text-lg font-bold leading-tight text-gray-900">
                    {categorieLabel(data.dossier.categorie)} de{' '}
                    <span className="text-orange-400">{data.dossier.titre || 'votre societe'}</span>
                  </h1>
                </div>
                <div className="flex flex-none items-center gap-3">
                  <span className="rounded-full bg-orange-500/20 px-3 py-1 text-xs font-semibold text-orange-400">
                    {getStatutLabelWithEtapes(data.dossier.statut, data.dossier.etapesSupplementaires)}
                  </span>
                  {isConstitution && nbFichesTotal > 0 && (
                    <div className="relative flex h-14 w-14 items-center justify-center">
                      <svg className="absolute inset-0" width="56" height="56" viewBox="0 0 72 72">
                        <circle cx="36" cy="36" r={circRadius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
                        <circle
                          cx="36" cy="36" r={circRadius}
                          fill="none" stroke="#f97316" strokeWidth="6"
                          strokeDasharray={circCirc}
                          strokeDashoffset={circOffset}
                          strokeLinecap="round"
                          transform="rotate(-90 36 36)"
                        />
                      </svg>
                      <span className="relative text-xs font-bold text-gray-900">
                        {nbFichesRemplies}/{nbFichesTotal}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {/* Tabs */}
              <div className="-mb-px mt-4 flex gap-1 border-b border-gray-200">
                {(
                  [
                    { id: 'fiches' as const, label: nbAFaire > 0 ? `Fiches (${nbAFaire})` : 'Fiches' },
                    { id: 'pieces' as const, label: (() => { const n = (data.pieceRequests || []).filter(p => p.statut === 'a_fournir' || p.statut === 'a_redeposer').length; return n > 0 ? `Pieces (${n})` : 'Pieces'; })() },
                    { id: 'documents' as const, label: 'Documents' },
                    { id: 'recap' as const, label: 'Recapitulatif' },
                    { id: 'messages' as const, label: 'Messages' },
                  ]
                ).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'border-orange-500 text-orange-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main layout: left stepper + right content */}
          <div className="mx-auto max-w-6xl flex-1 px-4 py-6">
            <div className={isConstitution ? 'lg:grid lg:grid-cols-[220px_1fr] lg:gap-6' : ''}>

              {/* Left stepper - constitution only, desktop */}
              {isConstitution && (
                <aside className="hidden lg:block">
                  <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-4">
                    <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Avancement</p>
                    <ol className="space-y-4">
                      {CONSTITUTION_STEPS.map(step => (
                        <li key={step.id} className="flex items-start gap-3">
                          <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
                            step.id < currentStep
                              ? 'bg-green-500 text-white'
                              : step.id === currentStep
                              ? 'bg-orange-500 text-white'
                              : 'border border-gray-300 text-gray-400'
                          }`}>
                            {step.id < currentStep ? '✓' : step.id}
                          </span>
                          <span className={`text-sm leading-snug ${step.id <= currentStep ? 'text-gray-900' : 'text-gray-400'}`}>
                            {step.label}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </aside>
              )}

              {/* Right: tab content */}
              <div className="min-w-0">

                {/* FICHES TAB */}
                {activeTab === 'fiches' && (
                  <div>
                    {allFiches.length === 0 ? (
                      <p className="py-12 text-center text-sm text-gray-400">Aucune fiche demandee pour l'instant.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {allFiches.map((r, i) => {
                          const isHighlighted = i === 0 && r.statut === 'a_remplir';
                          const canFillCard = r.statut === 'a_remplir' || r.statut === 'en_cours';
                          return (
                            <div key={r.id} className={`flex flex-col rounded-xl border p-4 transition-all ${
                              isHighlighted
                                ? 'border-orange-500/60 bg-orange-500/10'
                                : 'border-gray-200 bg-white'
                            }`}>
                              <div className="mb-3 flex items-center justify-between">
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  r.statut === 'remplie'
                                    ? 'bg-green-500/20 text-green-400'
                                    : r.statut === 'refuse'
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-orange-500/20 text-orange-400'
                                }`}>
                                  {r.statut === 'remplie' ? 'Remplie' : r.statut === 'refuse' ? 'Refusee' : 'A remplir'}
                                </span>
                                <span className="text-[11px] text-gray-400">{ficheTimeEst(r.typeFiche)}</span>
                              </div>
                              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                                {r.pourPersonne ? personInitials(r.pourPersonne) : 'STE'}
                              </div>
                              <p className="text-sm font-semibold text-gray-900">{r.titre || r.typeFiche}</p>
                              <p className="mb-3 mt-0.5 flex-1 text-xs text-gray-400">{ficheSubtitleText(r)}</p>
                              {inviteUrls[r.id] && (
                                <div className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                                  <input readOnly value={inviteUrls[r.id]} onFocus={(e) => e.currentTarget.select()}
                                    className="min-w-0 flex-1 rounded border border-gray-200 bg-transparent px-2 py-0.5 text-[11px] text-gray-600" />
                                  <button type="button"
                                    onClick={() => navigator.clipboard?.writeText(inviteUrls[r.id])}
                                    className="flex-none rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200">
                                    Copier
                                  </button>
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                {r.statut === 'remplie' && r.ficheId && (
                                  <button type="button" title="Voir le PDF"
                                    onClick={() => handleViewFiche(r.ficheId as string, r.titre)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
                                    <Eye size={13} /> Voir
                                  </button>
                                )}
                                {canFillCard && (
                                  <button type="button"
                                    onClick={() => { setFillingFicheReqId(fillingFicheReqId === r.id ? null : r.id); setFillingFicheType(r.typeFiche); flash(null, null); }}
                                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                                      isHighlighted
                                        ? 'bg-orange-500 text-white hover:bg-orange-600'
                                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                                    }`}>
                                    {fillingFicheReqId === r.id ? 'Replier' : 'Remplir'}
                                  </button>
                                )}
                                {r.typeFiche === 'etat_civil' && canFillCard && !inviteUrls[r.id] && (
                                  <button type="button" onClick={() => inviterSuivi(r.id, r.pourPersonne || r.titre)}
                                    disabled={invitingId === r.id}
                                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-40">
                                    {invitingId === r.id ? '...' : 'Inviter'}
                                  </button>
                                )}
                              </div>
                              {r.validationStatus === 'refuse' && r.validationMotif && (
                                <p className="mt-2 text-[11px] text-red-400">Motif : {r.validationMotif}. Merci de refaire la fiche.</p>
                              )}
                              {r.message && <p className="mt-1 text-[11px] text-gray-400">{r.message}</p>}
                              {canFillCard && fillingFicheReqId === r.id && (
                                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                                  <FicheForm
                                    type={fillingFicheType}
                                    submitting={submittingFiche}
                                    onSubmit={handleFillFiche}
                                    onCancel={() => setFillingFicheReqId(null)}
                                    ficheRequestId={r.id}
                                    token={token}
                                    draftData={r.draftData}
                                    draftStep={r.draftStep}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Ajouter personne / piece */}
                    <div className="mt-6 flex flex-wrap gap-3">
                      {(data.ficheRequests && data.ficheRequests.length > 0) && (
                        <button type="button" onClick={() => setPersonModal(m => ({ ...m, open: true }))}
                          className="text-xs font-medium text-orange-400 hover:underline">
                          + Ajouter un associe / gerant
                        </button>
                      )}
                    </div>
                    {/* Documents PDF generes */}
                    {data.fiches && data.fiches.length > 0 && (
                      <div className="mt-6">
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Documents generes</h3>
                        <ul className="space-y-2">
                          {data.fiches.map(f => (
                            <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                              <span className="min-w-0 truncate text-gray-700">&#128196; {f.titre}</span>
                              <div className="flex flex-none items-center gap-1">
                                <button type="button" title="Visualiser" onClick={() => handleViewFiche(f.id, f.titre)}
                                  className="rounded border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100">
                                  <Eye size={14} />
                                </button>
                                <button type="button" title="Telecharger" onClick={() => handleDownloadFiche(f.id, f.titre)}
                                  className="rounded border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100">
                                  <Download size={14} />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* PIECES TAB */}
                {activeTab === 'pieces' && (
                  <div>
                    {(data.pieceRequests || []).filter(p => p.statut !== 'annulee').length === 0 ? (
                      <p className="py-12 text-center text-sm text-gray-400">Aucune piece demandee pour l'instant.</p>
                    ) : (
                      <ul className="space-y-2">
                        {(data.pieceRequests || []).filter(p => p.statut !== 'annulee').map(p => renderPieceItem(p))}
                      </ul>
                    )}
                    {/* Ajouter une piece */}
                    <div className="mt-6">
                      {addingPiece ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="text" autoFocus value={newPieceLibelle}
                            onChange={(e) => setNewPieceLibelle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddPieceSuivi(); }}
                            placeholder="Intitule de la piece (ex. Statuts + RC + PV...)"
                            className="h-9 min-w-[220px] flex-1 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none" />
                          <button type="button" onClick={handleAddPieceSuivi} disabled={addBusy || !newPieceLibelle.trim()}
                            className="inline-flex h-9 items-center rounded-md bg-orange-500 px-3 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-60">
                            {addBusy ? '...' : 'Ajouter'}
                          </button>
                          <button type="button" onClick={() => { setAddingPiece(false); setNewPieceLibelle(''); }}
                            className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setAddingPiece(true)}
                          className="text-xs font-medium text-orange-400 hover:underline">
                          + Ajouter une piece (associe personne morale, procuration...)
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* DOCUMENTS TAB */}
                {activeTab === 'documents' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Documents demandes</h3>
                      {data.documentRequests.length === 0 ? (
                        <p className="text-sm text-gray-400">Aucun document demande pour l'instant.</p>
                      ) : (
                        <ul className="space-y-3">
                          {data.documentRequests.map(r => (
                            <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-gray-900">{r.libelle}</p>
                                {r.isUrgent && (
                                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-400">Urgent</span>
                                )}
                              </div>
                              {r.description && <p className="mt-0.5 text-xs text-gray-400">{r.description}</p>}
                              {r.message && <p className="mt-1 rounded bg-blue-500/10 px-2 py-1 text-xs text-blue-400">&#128172; {r.message}</p>}
                              <div className="mt-3 flex items-center gap-2">
                                <input
                                  ref={(el) => { fileInputs.current[r.id] = el; }}
                                  type="file"
                                  accept={ACCEPTED_FILES}
                                  disabled={uploadingId === r.id}
                                  onChange={(e) => handleUpload(e.target.files?.[0], r.id, r.id)}
                                  className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-orange-500 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-orange-600"
                                />
                                {uploadingId === r.id && <span className="text-xs text-gray-400">Envoi...</span>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                        <p className="mb-2 text-xs text-gray-400">Vous pouvez aussi ajouter un autre document :</p>
                        <input
                          ref={(el) => { fileInputs.current['__free'] = el; }}
                          type="file"
                          accept={ACCEPTED_FILES}
                          disabled={uploadingId === '__free'}
                          onChange={(e) => handleUpload(e.target.files?.[0], null, '__free')}
                          className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                        />
                        {uploadingId === '__free' && <span className="text-xs text-gray-400">Envoi...</span>}
                        <p className="mt-1 text-[11px] text-gray-400">Formats acceptes : PDF, images, Word, Excel - 10 Mo maximum par fichier.</p>
                      </div>
                    </div>
                    {data.mesDocuments.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Vos documents transmis</h3>
                        <ul className="space-y-2">
                          {data.mesDocuments.map(d => {
                            const b = validationBadge(d.validationStatus);
                            return (
                              <li key={d.id} className="rounded-xl border border-gray-200 bg-white p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="min-w-0 truncate text-sm text-gray-700">&#128206; {d.nom}</span>
                                  <div className="flex flex-none items-center gap-2">
                                    <button type="button" title="Telecharger" onClick={() => handleDownload(d.id, d.nom)}
                                      className="rounded border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100">
                                      <Download size={14} />
                                    </button>
                                    {d.validationStatus !== 'valide' && (
                                      <button type="button" title="Retirer" onClick={() => handleDelete(d.id)}
                                        disabled={deletingId === d.id}
                                        className="rounded border border-red-500/30 p-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-60">
                                        {deletingId === d.id ? <span className="text-xs">...</span> : <Trash2 size={14} />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
                                  <span className="text-[11px] text-gray-400">{formatDate(d.createdAt)}{d.taille ? ` - ${humanSize(d.taille)}` : ''}</span>
                                </div>
                                {d.validationStatus === 'refuse' && d.validationMotif && (
                                  <p className="mt-1 text-xs text-red-400">Motif : {d.validationMotif}. Merci de deposer un nouveau document.</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {data.documents.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Documents partages par notre equipe</h3>
                        <ul className="space-y-2">
                          {data.documents.map(d => (
                            <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                              <span className="min-w-0 truncate text-gray-700">&#128196; {d.nom}</span>
                              <div className="flex flex-none items-center gap-2">
                                <span className="text-xs text-gray-400">{formatDate(d.createdAt)}</span>
                                <button type="button" title="Telecharger" onClick={() => handleDownload(d.id, d.nom)}
                                  className="rounded border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100">
                                  <Download size={14} />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* RECAP TAB */}
                {activeTab === 'recap' && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Recapitulatif du dossier</h2>
                      <button type="button" onClick={handleDownloadRecap} disabled={downloadingRecap}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                        <Download size={13} />
                        {downloadingRecap ? 'Generation...' : 'Accuse de reception (PDF)'}
                      </button>
                    </div>
                    {renderRecapInner() || <p className="text-sm text-gray-400">Aucun element de recapitulatif disponible.</p>}
                  </div>
                )}

                {/* MESSAGES TAB */}
                {activeTab === 'messages' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-5">
                      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">Contacter notre equipe</h2>
                      {data.cabinet && (data.cabinet.telephone || data.cabinet.email) && (
                        <div className="mb-4 flex flex-wrap gap-4 text-sm">
                          {data.cabinet.telephone && (
                            <a href={`tel:${data.cabinet.telephone.replace(/\s/g, '')}`}
                              className="inline-flex items-center gap-1.5 text-orange-400 hover:underline">
                              &#128222; {data.cabinet.telephone}
                            </a>
                          )}
                          {data.cabinet.email && (
                            <a href={`mailto:${data.cabinet.email}`}
                              className="inline-flex items-center gap-1.5 text-orange-400 hover:underline">
                              &#9993;&#65039; {data.cabinet.email}
                            </a>
                          )}
                        </div>
                      )}
                      <textarea
                        value={contactText}
                        onChange={(e) => setContactText(e.target.value)}
                        rows={4}
                        placeholder="Votre message ou votre question au sujet de ce dossier..."
                        className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                          placeholder="Votre e-mail (facultatif)"
                          className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none" />
                        <input type="tel" value={contactTel} onChange={(e) => setContactTel(e.target.value)}
                          placeholder="Votre telephone (facultatif)"
                          className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none" />
                      </div>
                      <button type="button" onClick={handleSendContact} disabled={sendingContact}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
                        <Send size={14} />
                        {sendingContact ? 'Envoi...' : 'Envoyer'}
                      </button>
                    </div>
                    {data.compte && (
                      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5 text-center">
                        {data.compte.existe ? (
                          <>
                            <p className="text-sm font-medium text-gray-900">Vous avez deja un compte Ada Papers.</p>
                            <p className="mb-3 text-xs text-gray-500">Connectez-vous pour retrouver votre dossier dans votre espace personnel.</p>
                            <a href={`/auth/signin${data.compte.email ? `?email=${encodeURIComponent(data.compte.email)}` : ''}`}
                              className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
                              Se connecter
                            </a>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-gray-900">Suivez votre dossier en permanence.</p>
                            <p className="mb-3 text-xs text-gray-500">Creez votre compte avec la meme adresse e-mail : votre dossier y sera rattache automatiquement.</p>
                            <a href={`/auth/signup${data.compte.email ? `?email=${encodeURIComponent(data.compte.email)}` : ''}`}
                              className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
                              Creer mon compte
                            </a>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Contact footer bar */}
          <div className="border-t border-gray-200 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                  {data.cabinet?.telephone && (
                    <a href={`tel:${data.cabinet.telephone.replace(/\s/g, '')}`} className="hover:text-orange-400">
                      &#128222; {data.cabinet.telephone}
                    </a>
                  )}
                  {data.cabinet?.email && (
                    <a href={`mailto:${data.cabinet.email}`} className="hover:text-orange-400">
                      &#9993; {data.cabinet.email}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setActiveTab('messages')}
                    className="rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">
                    Ecrire a l'equipe
                  </button>
                  <button type="button"
                    onClick={() => { try { navigator.clipboard?.writeText(window.location.href).then(() => flash('Lien copie !', null)); } catch (_) {} }}
                    className="rounded-lg border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100">
                    Copier le lien de suivi
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer Ada Papers */}
      <div className="border-t border-gray-100 bg-gray-50 px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-gray-300">
          <span>&#169; {new Date().getFullYear()} Ada Papers. Tous droits reserves.</span>
          <div className="flex gap-4">
            <a href="/mentions-legales" className="hover:text-gray-400">Mentions legales</a>
            <a href="/contact" className="hover:text-gray-400">Contact</a>
          </div>
        </div>
      </div>

      {viewingPdf && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
          <div className="flex flex-none items-center justify-between gap-3 bg-white px-4 py-2 shadow">
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{viewingPdf.titre}</span>
            <div className="flex flex-none items-center gap-2">
              <a
                href={viewingPdf.url}
                download={`${viewingPdf.titre}.pdf`}
                title="Telecharger"
                className="rounded p-1.5 text-gray-600 hover:bg-gray-100"
              >
                <Download size={16} />
              </a>
              <button
                type="button"
                title="Fermer"
                onClick={() => { URL.revokeObjectURL(viewingPdf.url); setViewingPdf(null); }}
                className="rounded p-1.5 text-gray-600 hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <iframe
            src={viewingPdf.url}
            className="flex-1 w-full border-0"
            title={viewingPdf.titre}
          />
        </div>
      )}

      {/* Banner lien d'invitation associe */}
      {associeResult && (
        <div className="fixed bottom-6 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-orange-200 bg-white px-5 py-4 shadow-2xl">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-900">Lien d'invitation pour {associeResult.nom}</span>
            <button type="button" onClick={() => setAssocieResult(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <p className="mb-3 text-xs text-gray-500">Partagez ce lien avec l'associe pour qu'il remplisse ses fiches et fournisse ses pieces.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={associeResult.inviteUrl}
              className="h-8 flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700" />
            <button type="button"
              onClick={() => { try { navigator.clipboard.writeText(associeResult!.inviteUrl); } catch {} flash('Lien copie !'); }}
              className="inline-flex h-8 items-center rounded-md bg-orange-500 px-3 text-xs font-medium text-white hover:bg-orange-600">
              Copier
            </button>
          </div>
        </div>
      )}

      {/* Modale ajout associe/gerant */}
      {personModal.open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) setPersonModal(m => ({ ...m, open: false })); }}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">Ajouter un associe / gerant</h2>
              <button type="button" onClick={() => setPersonModal(m => ({ ...m, open: false }))} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Nom complet</label>
                <input autoFocus value={personModal.nom}
                  onChange={e => setPersonModal(m => ({ ...m, nom: e.target.value }))}
                  placeholder="Prenom Nom"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500">Fiches a remplir</p>
                {[
                  { type: 'etat_civil', label: "Fiche d'etat civil" },
                  { type: 'declaration_honneur', label: "Declaration sur l'honneur" },
                  { type: 'procuration', label: 'Procuration speciale' },
                ].map(({ type, label }) => (
                  <label key={type} className="mb-1 flex cursor-pointer items-center gap-2">
                    <input type="checkbox" className="accent-orange-500 h-4 w-4"
                      checked={personModal.ficheTypes.includes(type)}
                      onChange={e => setPersonModal(m => ({
                        ...m, ficheTypes: e.target.checked ? [...m.ficheTypes, type] : m.ficheTypes.filter(t => t !== type),
                      }))} />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500">Documents a fournir</p>
                {[
                  { libelle: "Piece d'identite (carte nationale ou passeport)", nature: 'identite' },
                  { libelle: 'Casier judiciaire B3 (moins de 3 mois)', nature: 'casier' },
                  { libelle: 'Justificatif de domicile (moins de 3 mois)', nature: 'autre' },
                  { libelle: 'Attestation de regularite fiscale', nature: 'autre' },
                ].map((p, i) => {
                  const checked = personModal.pieces.some(pp => pp.libelle === p.libelle);
                  return (
                    <label key={i} className="mb-1 flex cursor-pointer items-center gap-2">
                      <input type="checkbox" className="accent-orange-500 h-4 w-4"
                        checked={checked}
                        onChange={e => setPersonModal(m => ({
                          ...m, pieces: e.target.checked ? [...m.pieces, p] : m.pieces.filter(pp => pp.libelle !== p.libelle),
                        }))} />
                      <span className="text-sm text-gray-700">{p.libelle}</span>
                    </label>
                  );
                })}
                <div className="mt-2 flex gap-2">
                  <input value={personModal.customLabel}
                    onChange={e => setPersonModal(m => ({ ...m, customLabel: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && personModal.customLabel.trim()) {
                        setPersonModal(m => ({ ...m, pieces: [...m.pieces, { libelle: m.customLabel.trim(), nature: 'autre' }], customLabel: '' }));
                      }
                    }}
                    placeholder="Autre document..."
                    className="h-8 flex-1 rounded-md border border-gray-200 px-2 text-xs text-gray-700 placeholder-gray-400 focus:border-orange-500 focus:outline-none" />
                  <button type="button"
                    disabled={!personModal.customLabel.trim()}
                    onClick={() => setPersonModal(m => ({ ...m, pieces: [...m.pieces, { libelle: m.customLabel.trim(), nature: 'autre' }], customLabel: '' }))}
                    className="inline-flex h-8 items-center rounded-md border border-orange-300 px-2 text-xs text-orange-500 hover:bg-orange-50 disabled:opacity-40">
                    + Ajouter
                  </button>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" className="accent-orange-500 h-4 w-4"
                  checked={personModal.creerInvitation}
                  onChange={e => setPersonModal(m => ({ ...m, creerInvitation: e.target.checked }))} />
                <span className="text-sm text-gray-700">Generer un lien d'invitation pour cette personne</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
              <button type="button" onClick={() => setPersonModal(m => ({ ...m, open: false }))} className="text-sm text-gray-500 hover:text-gray-700">Annuler</button>
              <button type="button" onClick={handleAddAssocie}
                disabled={addBusy || !personModal.nom.trim() || personModal.ficheTypes.length === 0}
                className="inline-flex h-9 items-center rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60">
                {addBusy ? 'Ajout en cours...' : "Ajouter l'associe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

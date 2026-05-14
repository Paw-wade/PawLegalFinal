'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  FileText,
  MoreHorizontal,
  Search,
  Send,
  X,
} from 'lucide-react';
import { dossiersAPI, userAPI } from '@/lib/api';
import { normalizeMontantTarificationFixe } from '@/lib/montantTarification';
import { tarificationFormules, type TarifFormuleId } from '@/data/tarificationConfig';
import {
  getTarificationEcheances,
  getTarificationReferenceAmount,
  isTarificationInstallmentAuthorized,
  isTarificationInstallmentEligible,
} from '@/lib/tarificationInstallments';
import { Button } from '@/components/ui/Button';

type TarificationTab = 'todo' | 'dossiers' | 'standalone' | 'exonerations';
type DossierChipFilter = 'all' | 'unpaid' | 'openPrestations' | 'pendingChoice';
type DossierSort = 'due' | 'notification' | 'client';
type StandaloneStatusFilter = 'all' | 'pending' | 'accepted' | 'refused' | 'cancelled';

const TABS: { id: TarificationTab; label: string }[] = [
  { id: 'todo', label: 'À traiter' },
  { id: 'dossiers', label: 'Dossiers' },
  { id: 'standalone', label: 'Sans dossier' },
  { id: 'exonerations', label: 'Exonérations' },
];

const CHIP_FILTERS: { id: DossierChipFilter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'unpaid', label: 'Impayés' },
  { id: 'openPrestations', label: 'Prestations ouvertes' },
  { id: 'pendingChoice', label: 'Choix en attente' },
];

const STANDALONE_STATUS_FILTERS: { id: StandaloneStatusFilter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'pending', label: 'En attente' },
  { id: 'accepted', label: 'Acceptés' },
  { id: 'refused', label: 'Refusés' },
  { id: 'cancelled', label: 'Annulés' },
];

function getFormuleTarificationDisplay(dossier: any) {
  const formuleId = dossier?.formuleTarifaire as TarifFormuleId | undefined;
  if (!formuleId) return null;
  const config = tarificationFormules.find((formule) => formule.id === formuleId);
  const name = formuleId === 'premium' ? 'Tawfekh' : 'Standard';
  return {
    name,
    prix: config?.prix || null,
    label: config?.prix ? `${name} · ${config.prix}` : name,
  };
}

function getClientName(dossier: any) {
  const userName = [dossier?.user?.firstName, dossier?.user?.lastName].filter(Boolean).join(' ').trim();
  if (userName) return userName;
  const fallback = [dossier?.clientPrenom, dossier?.clientNom].filter(Boolean).join(' ').trim();
  if (fallback) return fallback;
  return dossier?.user?.email || dossier?.clientEmail || 'Client non renseigné';
}

function fold(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatEuro(value: number) {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getPrestationsARegler(dossier: any) {
  const prestations = Array.isArray(dossier?.tarificationPrestations) ? dossier.tarificationPrestations : [];
  return prestations.filter((p: any) => String(p?.statut || 'a_regler') === 'a_regler');
}

function getTotalPrestationsARegler(dossier: any) {
  return getPrestationsARegler(dossier).reduce((acc: number, p: any) => {
    const n = Number(p?.montant || 0);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function getDossierDueAmount(dossier: any) {
  const fixedAmount = Number(dossier?.montantTarificationFixe || 0);
  const paymentDone = !!dossier?.paiementTarificationEffectue;
  const fixedDue = fixedAmount > 0 && !paymentDone ? fixedAmount : 0;
  return fixedDue + getTotalPrestationsARegler(dossier);
}

function canTogglePayment(dossier: any) {
  if (!dossier || dossier?.fraisExoneres) return false;
  return Number(dossier?.montantTarificationFixe || 0) > 0 || !!dossier?.formuleTarifaire;
}

function canRetractTarificationRequest(dossier: any) {
  return (
    !!dossier?.tarificationNotificationSentAt &&
    !dossier?.formuleTarifaire &&
    normalizeMontantTarificationFixe(dossier?.montantTarificationFixe) <= 0 &&
    !dossier?.paiementTarificationEffectue
  );
}

function dossierNeedsAction(dossier: any) {
  if (!dossier || dossier?.fraisExoneres) return false;
  if (getPrestationsARegler(dossier).length > 0) return true;
  if (canTogglePayment(dossier) && !dossier?.paiementTarificationEffectue) return true;
  if (canRetractTarificationRequest(dossier)) return true;
  if (dossier?.tarificationNotificationSentAt && !dossier?.formuleTarifaire && normalizeMontantTarificationFixe(dossier?.montantTarificationFixe) <= 0) {
    return true;
  }
  return false;
}

function matchesDossierSearch(dossier: any, filterText: string) {
  const raw = filterText.trim();
  if (!raw) return true;
  const haystack = fold(
    [
      dossier?.numero,
      dossier?.titre,
      getClientName(dossier),
      dossier?.user?.email,
      dossier?.clientEmail,
      dossier?.tarificationLastNotifySummary,
    ]
      .map((v) => String(v || ''))
      .join(' ')
  );
  const tokens = fold(raw).split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

function matchesStandaloneSearch(req: any, filterText: string) {
  const raw = filterText.trim();
  if (!raw) return true;
  const user = req?.user || {};
  const admin = req?.adminSender || {};
  const statusLabel = req?.status === 'accepted' ? 'accepte' : req?.status === 'refused' ? 'refuse' : 'en attente';
  const haystack = fold(
    [
      req?._id,
      req?.motif,
      req?.amount,
      req?.status,
      statusLabel,
      user?.firstName,
      user?.lastName,
      user?.email,
      user?.phone,
      admin?.firstName,
      admin?.lastName,
      admin?.email,
    ]
      .map((v) => String(v || ''))
      .join(' ')
  );
  const tokens = fold(raw).split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

function matchesChipFilter(dossier: any, chip: DossierChipFilter) {
  if (chip === 'all') return true;
  if (chip === 'unpaid') return canTogglePayment(dossier) && !dossier?.paiementTarificationEffectue;
  if (chip === 'openPrestations') return getPrestationsARegler(dossier).length > 0;
  if (chip === 'pendingChoice') {
    return (
      !!dossier?.tarificationNotificationSentAt &&
      !dossier?.formuleTarifaire &&
      normalizeMontantTarificationFixe(dossier?.montantTarificationFixe) <= 0
    );
  }
  return true;
}

function sortDossiers(items: any[], sortBy: DossierSort) {
  const next = [...items];
  next.sort((a, b) => {
    if (sortBy === 'due') return getDossierDueAmount(b) - getDossierDueAmount(a);
    if (sortBy === 'notification') {
      const aTime = a?.tarificationNotificationSentAt ? new Date(a.tarificationNotificationSentAt).getTime() : 0;
      const bTime = b?.tarificationNotificationSentAt ? new Date(b.tarificationNotificationSentAt).getTime() : 0;
      return bTime - aTime;
    }
    return getClientName(a).localeCompare(getClientName(b), 'fr', { sensitivity: 'base' });
  });
  return next;
}

function getStandaloneReminderState(req: any) {
  const anchor = req?.lastReminderAt || req?.createdAt;
  if (!anchor) return { canRemind: true, hint: '' };
  const elapsed = Date.now() - new Date(anchor).getTime();
  const minMs = 48 * 60 * 60 * 1000;
  if (elapsed >= minMs) return { canRemind: true, hint: '' };
  const remainingHours = Math.ceil((minMs - elapsed) / (60 * 60 * 1000));
  return { canRemind: false, hint: `Disponible dans ~${remainingHours}h` };
}

type InstallmentDraftRow = {
  localId: string;
  serverId?: string;
  label: string;
  date: string;
  amount: string;
  statut: 'a_regler' | 'reglee';
};

const createInstallmentDraftRow = (partial?: Partial<InstallmentDraftRow>): InstallmentDraftRow => ({
  localId: partial?.localId || `echeance-${Math.random().toString(36).slice(2, 9)}`,
  serverId: partial?.serverId,
  label: partial?.label || '',
  date: partial?.date || '',
  amount: partial?.amount || '',
  statut: partial?.statut || 'a_regler',
});

const toDateInputValue = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const buildDefaultInstallmentRows = (dossier: any): InstallmentDraftRow[] => {
  const referenceAmount = getTarificationReferenceAmount(dossier);
  const half = referenceAmount > 0 ? referenceAmount / 2 : 0;
  const firstDate = new Date();
  firstDate.setMonth(firstDate.getMonth() + 1);
  const secondDate = new Date();
  secondDate.setMonth(secondDate.getMonth() + 2);
  return [
    createInstallmentDraftRow({
      label: 'Échéance 1',
      date: toDateInputValue(firstDate.toISOString()),
      amount: half > 0 ? half.toFixed(2) : '',
    }),
    createInstallmentDraftRow({
      label: 'Échéance 2',
      date: toDateInputValue(secondDate.toISOString()),
      amount: half > 0 ? half.toFixed(2) : '',
    }),
  ];
};

export default function AdminDossiersTarificationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [filterText, setFilterText] = useState('');
  const [activeTab, setActiveTab] = useState<TarificationTab>('todo');
  const [chipFilter, setChipFilter] = useState<DossierChipFilter>('all');
  const [sortBy, setSortBy] = useState<DossierSort>('due');
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
  const [updatingInstallmentId, setUpdatingInstallmentId] = useState<string | null>(null);
  const [installmentModalDossier, setInstallmentModalDossier] = useState<any | null>(null);
  const [installmentRows, setInstallmentRows] = useState<InstallmentDraftRow[]>([]);
  const [installmentSaving, setInstallmentSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  const [updatingPrestationKey, setUpdatingPrestationKey] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [retractingId, setRetractingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [manualMotif, setManualMotif] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualSending, setManualSending] = useState(false);
  const [manualUserFilter, setManualUserFilter] = useState('');
  const [standaloneRequests, setStandaloneRequests] = useState<any[]>([]);
  const [showManualTarificationModal, setShowManualTarificationModal] = useState(false);
  const [standaloneStatusFilter, setStandaloneStatusFilter] = useState<StandaloneStatusFilter>('all');
  const [remindingStandaloneId, setRemindingStandaloneId] = useState<string | null>(null);
  const [cancellingStandaloneId, setCancellingStandaloneId] = useState<string | null>(null);
  const [expandedDossierIds, setExpandedDossierIds] = useState<Set<string>>(new Set());
  const [openMenuDossierId, setOpenMenuDossierId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, usersRes, standaloneRes] = await Promise.all([
        dossiersAPI.getAllDossiers(),
        userAPI.getAllUsers(),
        dossiersAPI.getStandaloneTarificationRequests({ limit: 150 }),
      ]);
      const list = res?.data?.dossiers || res?.data?.data || [];
      const usersList = usersRes?.data?.users || usersRes?.data?.data || usersRes?.data || [];
      const standaloneList = standaloneRes?.data?.requests || standaloneRes?.data?.data || [];
      setDossiers(Array.isArray(list) ? list : []);
      setUsers(Array.isArray(usersList) ? usersList : []);
      setStandaloneRequests(Array.isArray(standaloneList) ? standaloneList : []);
    } catch (e) {
      console.error('Erreur chargement tarification dossiers:', e);
      setDossiers([]);
      setUsers([]);
      setStandaloneRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const role = (session?.user as any)?.role;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated' && role !== 'admin' && role !== 'superadmin') {
      router.push('/');
      return;
    }
    if (status === 'authenticated') load();
  }, [status, session, router, load]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const { withPayment, withoutPayment, exonerated } = useMemo(() => {
    const exo = dossiers.filter((d) => !!d?.fraisExoneres);
    const hasRequestedPrestations = (d: any) => getPrestationsARegler(d).length > 0;
    const withPay = dossiers.filter(
      (d) =>
        !d?.fraisExoneres &&
        (Number(d?.montantTarificationFixe || 0) > 0 || !!d?.formuleTarifaire || hasRequestedPrestations(d))
    );
    const withoutPay = dossiers.filter(
      (d) =>
        !d?.fraisExoneres &&
        !d?.formuleTarifaire &&
        Number(d?.montantTarificationFixe || 0) <= 0 &&
        !hasRequestedPrestations(d)
    );
    return { withPayment: withPay, withoutPayment: withoutPay, exonerated: exo };
  }, [dossiers]);

  const filteredStandaloneRequests = useMemo(() => {
    const byStatus =
      standaloneStatusFilter === 'all'
        ? standaloneRequests
        : standaloneRequests.filter((req: any) => String(req?.status || 'pending') === standaloneStatusFilter);
    return byStatus.filter((req: any) => matchesStandaloneSearch(req, filterText));
  }, [standaloneRequests, filterText, standaloneStatusFilter]);

  const filteredUsers = useMemo(() => {
    const q = fold(manualUserFilter);
    const base = users.filter((u: any) => u && (u._id || u.id));
    if (!q) return base;
    return base.filter((u: any) => fold([u.firstName, u.lastName, u.email, u.phone, u.role].join(' ')).includes(q));
  }, [users, manualUserFilter]);

  const applyDossierFilters = useCallback(
    (items: any[]) => {
      const filtered = items.filter((dossier) => matchesDossierSearch(dossier, filterText) && matchesChipFilter(dossier, chipFilter));
      return sortDossiers(filtered, sortBy);
    },
    [chipFilter, filterText, sortBy]
  );

  const todoDossiers = useMemo(
    () => applyDossierFilters(dossiers.filter((d) => dossierNeedsAction(d))),
    [applyDossierFilters, dossiers]
  );

  const dossierCatalog = useMemo(
    () => applyDossierFilters([...withPayment, ...withoutPayment]),
    [applyDossierFilters, withPayment, withoutPayment]
  );

  const filteredExonerated = useMemo(
    () => sortDossiers(exonerated.filter((d) => matchesDossierSearch(d, filterText)), sortBy),
    [exonerated, filterText, sortBy]
  );

  const stats = useMemo(() => {
    const unpaid = dossiers.filter((d) => !d?.fraisExoneres && canTogglePayment(d) && !d?.paiementTarificationEffectue).length;
    const openPrestations = dossiers.filter((d) => !d?.fraisExoneres && getPrestationsARegler(d).length > 0).length;
    const pendingChoice = dossiers.filter(
      (d) =>
        !d?.fraisExoneres &&
        !!d?.tarificationNotificationSentAt &&
        !d?.formuleTarifaire &&
        normalizeMontantTarificationFixe(d?.montantTarificationFixe) <= 0
    ).length;
    const standalonePending = standaloneRequests.filter((req) => String(req?.status || 'pending') === 'pending').length;
    return {
      unpaid,
      openPrestations,
      pendingChoice,
      standalonePending,
      exonerated: exonerated.length,
      todo: dossiers.filter((d) => dossierNeedsAction(d)).length + standalonePending,
    };
  }, [dossiers, exonerated.length, standaloneRequests]);

  const showFeedback = (type: 'success' | 'error', text: string) => setFeedback({ type, text });

  const handleTogglePayment = async (dossier: any) => {
    const id = String(dossier?._id || dossier?.id || '');
    if (!id || !canTogglePayment(dossier)) return;
    const nextValue = !dossier?.paiementTarificationEffectue;
    setUpdatingPaymentId(id);
    try {
      await dossiersAPI.updateDossier(id, { paiementTarificationEffectue: nextValue });
      setDossiers((prev) =>
        prev.map((d) => {
          const did = String(d?._id || d?.id || '');
          if (did !== id) return d;
          return { ...d, paiementTarificationEffectue: nextValue };
        })
      );
      showFeedback('success', nextValue ? 'Paiement enregistré comme effectué.' : 'Paiement marqué comme non effectué.');
    } catch (e: any) {
      showFeedback('error', e?.response?.data?.message || e?.message || 'Erreur lors de la mise à jour du paiement.');
    } finally {
      setUpdatingPaymentId(null);
    }
  };

  const openInstallmentModal = (dossier: any) => {
    const existing = getTarificationEcheances(dossier);
    const rows =
      existing.length > 0
        ? existing.map((row, index) =>
            createInstallmentDraftRow({
              serverId: row._id,
              label: row.label || `Échéance ${index + 1}`,
              date: toDateInputValue(row.dateEcheance),
              amount: row.montant > 0 ? row.montant.toFixed(2) : '',
              statut: row.statut,
            })
          )
        : buildDefaultInstallmentRows(dossier);
    setInstallmentModalDossier(dossier);
    setInstallmentRows(rows);
  };

  const closeInstallmentModal = () => {
    setInstallmentModalDossier(null);
    setInstallmentRows([]);
    setInstallmentSaving(false);
  };

  const updateInstallmentRow = (localId: string, patch: Partial<InstallmentDraftRow>) => {
    setInstallmentRows((prev) => prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  };

  const addInstallmentRow = () => {
    setInstallmentRows((prev) => [
      ...prev,
      createInstallmentDraftRow({ label: `Échéance ${prev.length + 1}` }),
    ]);
  };

  const removeInstallmentRow = (localId: string) => {
    setInstallmentRows((prev) => prev.filter((row) => row.localId !== localId));
  };

  const saveInstallmentPlan = async () => {
    if (!installmentModalDossier) return;
    const dossierId = String(installmentModalDossier?._id || installmentModalDossier?.id || '');
    if (!dossierId) return;

    const payloadRows = installmentRows
      .map((row, index) => {
        const amount = Number(String(row.amount || '').replace(',', '.').trim());
        if (!row.date || !Number.isFinite(amount) || amount <= 0) return null;
        return {
          _id: row.serverId,
          label: row.label.trim() || `Échéance ${index + 1}`,
          montant: amount,
          dateEcheance: row.date,
          statut: row.statut,
        };
      })
      .filter(Boolean);

    if (payloadRows.length < 2) {
      showFeedback('error', 'Ajoutez au moins deux échéances valides.');
      return;
    }

    setInstallmentSaving(true);
    try {
      const res = await dossiersAPI.updateDossier(dossierId, {
        tarificationPaiementEnPlusieursFoisAutorise: true,
        tarificationEcheances: payloadRows,
      });
      const updated = res?.data?.dossier || res?.data?.data;
      setDossiers((prev) =>
        prev.map((d) => {
          const did = String(d?._id || d?.id || '');
          if (did !== dossierId) return d;
          return updated || {
            ...d,
            tarificationPaiementEnPlusieursFoisAutorise: true,
            tarificationEcheances: payloadRows,
          };
        })
      );
      showFeedback('success', 'Échéances enregistrées. Le client est notifié dans sa rubrique Tarification.');
      closeInstallmentModal();
    } catch (e: any) {
      showFeedback(
        'error',
        e?.response?.data?.message || e?.message || 'Erreur lors de l’enregistrement des échéances.'
      );
    } finally {
      setInstallmentSaving(false);
    }
  };

  const handleMarkEcheancePaid = async (dossier: any, echeanceId: string) => {
    const dossierId = String(dossier?._id || dossier?.id || '');
    if (!dossierId || !echeanceId) return;
    const key = `${dossierId}:${echeanceId}`;
    setUpdatingInstallmentId(key);
    try {
      const res = await dossiersAPI.markTarificationEcheancePaid(dossierId, echeanceId);
      const updated = res.data?.dossier;
      setDossiers((prev) =>
        prev.map((d) => {
          const did = String(d?._id || d?.id || '');
          if (did !== dossierId) return d;
          return updated || d;
        })
      );
      if (installmentModalDossier && String(installmentModalDossier?._id || installmentModalDossier?.id || '') === dossierId) {
        openInstallmentModal(updated || dossier);
      }
      showFeedback('success', res.data?.message || 'Échéance marquée comme réglée.');
    } catch (e: any) {
      showFeedback('error', e?.response?.data?.message || e?.message || 'Erreur lors du marquage de l’échéance.');
    } finally {
      setUpdatingInstallmentId(null);
    }
  };

  const handleMarkPrestationPaid = async (dossier: any, prestation: any) => {
    const dossierId = String(dossier?._id || dossier?.id || '');
    const prestationId = String(prestation?._id || '');
    if (!dossierId || !prestationId) return;
    const key = `${dossierId}:${prestationId}`;
    setUpdatingPrestationKey(key);
    try {
      const res = await dossiersAPI.markTarificationPrestationPaid(dossierId, prestationId);
      if (!res.data?.success) throw new Error(res.data?.message || 'Échec de la mise à jour.');
      const updated = res.data?.dossier;
      setDossiers((prev) =>
        prev.map((d) => {
          const did = String(d?._id || d?.id || '');
          if (did !== dossierId) return d;
          return updated || d;
        })
      );
      showFeedback('success', res.data?.message || 'Prestation marquée comme réglée.');
    } catch (e: any) {
      showFeedback('error', e?.response?.data?.message || e?.message || 'Erreur lors du marquage de la prestation.');
    } finally {
      setUpdatingPrestationKey(null);
    }
  };

  const handleRetractTarificationRequest = async (dossier: any) => {
    const id = String(dossier?._id || dossier?.id || '');
    if (!id || !canRetractTarificationRequest(dossier)) return;
    if (
      !confirm(
        `Rétracter la demande tarification pour « ${dossier?.titre || dossier?.numero || id} » ?\n\nLe client sera notifié in-app que la demande est retirée.`
      )
    ) {
      return;
    }
    setRetractingId(id);
    try {
      const res = await dossiersAPI.retractTarificationChoiceRequest(id);
      if (res.data?.success) {
        showFeedback('success', res.data.message || 'Demande rétractée.');
        setDossiers((prev) =>
          prev.map((item: any) =>
            String(item?._id || item?.id || '') === id
              ? { ...item, tarificationNotificationSentAt: undefined, tarificationLastNotifySummary: undefined }
              : item
          )
        );
      } else {
        showFeedback('error', res.data?.message || 'Rétractation refusée.');
      }
    } catch (e: any) {
      showFeedback('error', e?.response?.data?.message || e?.message || 'Erreur lors de la rétractation.');
    } finally {
      setRetractingId(null);
    }
  };

  const handlePaymentReminder = async (dossier: any) => {
    const id = String(dossier?._id || dossier?.id || '');
    if (!id || !canTogglePayment(dossier) || dossier?.paiementTarificationEffectue) return;
    setRemindingId(id);
    try {
      const res = await dossiersAPI.sendTarificationPaymentReminder(id);
      if (res.data?.success) showFeedback('success', res.data.message || 'Relance envoyée.');
      else showFeedback('error', res.data?.message || 'Échec de la relance.');
    } catch (e: any) {
      showFeedback('error', e?.response?.data?.message || e?.message || 'Erreur lors de la relance.');
    } finally {
      setRemindingId(null);
    }
  };

  const handleManualNotify = async () => {
    if (!selectedUserId) {
      showFeedback('error', 'Veuillez sélectionner un utilisateur.');
      return;
    }
    if (manualMotif.trim().length < 3) {
      showFeedback('error', 'Veuillez saisir un motif (minimum 3 caractères).');
      return;
    }
    const hasAmountInput = manualAmount.trim().length > 0;
    let amountValue: number | null = null;
    if (hasAmountInput) {
      const parsedAmountValue = Number(manualAmount.trim().replace(',', '.'));
      if (!Number.isFinite(parsedAmountValue) || parsedAmountValue < 0) {
        showFeedback('error', 'Montant invalide.');
        return;
      }
      amountValue = parsedAmountValue;
    }

    setManualSending(true);
    try {
      const res = await dossiersAPI.notifyTarificationUserStandalone({
        userId: selectedUserId,
        motif: manualMotif.trim(),
        amount: amountValue,
      });
      if (res.data?.success) {
        const infos = [
          'In-app: OK',
          'Push: OK',
          res.data?.emailSent ? 'Email: OK' : `Email: non envoyé${res.data?.emailSkipped ? ` (${res.data.emailSkipped})` : ''}`,
          res.data?.smsSent ? 'SMS: OK' : `SMS: non envoyé${res.data?.smsSkipped ? ` (${res.data.smsSkipped})` : ''}`,
        ];
        showFeedback('success', `${res.data?.message || 'Notification envoyée.'} ${infos.join(' · ')}`);
        setManualMotif('');
        setManualAmount('');
        setShowManualTarificationModal(false);
        await load();
      } else {
        showFeedback('error', res.data?.message || 'Échec de l’envoi.');
      }
    } catch (e: any) {
      if (e?.response?.status === 409 && e?.response?.data?.code === 'standalone_pending_exists') {
        const ex = e?.response?.data?.existingRequest;
        showFeedback(
          'error',
          `Une demande est déjà en attente pour cet utilisateur (créée le ${
            ex?.createdAt ? new Date(ex.createdAt).toLocaleString('fr-FR') : 'date inconnue'
          }).`
        );
        return;
      }
      showFeedback('error', e?.response?.data?.message || e?.message || 'Erreur lors de l’envoi.');
    } finally {
      setManualSending(false);
    }
  };

  const handleStandaloneReminder = async (requestId: string) => {
    if (!requestId) return;
    setRemindingStandaloneId(requestId);
    try {
      const res = await dossiersAPI.remindStandaloneTarificationRequest(requestId);
      if (res.data?.success) {
        showFeedback('success', res.data?.message || 'Relance standalone envoyée.');
        await load();
      } else {
        showFeedback('error', res.data?.message || 'Échec de la relance standalone.');
      }
    } catch (e: any) {
      showFeedback('error', e?.response?.data?.message || e?.message || 'Erreur lors de la relance standalone.');
    } finally {
      setRemindingStandaloneId(null);
    }
  };

  const handleStandaloneCancel = async (req: any) => {
    const requestId = String(req?._id || '');
    if (!requestId) return;
    if (!confirm('Annuler cette demande de paiement sans dossier ?')) return;
    setCancellingStandaloneId(requestId);
    try {
      const res = await dossiersAPI.cancelStandaloneTarificationRequest(requestId);
      if (res.data?.success) {
        showFeedback('success', res.data?.message || 'Demande annulée.');
        await load();
      } else {
        showFeedback('error', res.data?.message || 'Échec de l’annulation.');
      }
    } catch (e: any) {
      showFeedback('error', e?.response?.data?.message || e?.message || 'Erreur lors de l’annulation.');
    } finally {
      setCancellingStandaloneId(null);
    }
  };

  const toggleDossierExpanded = (id: string) => {
    setExpandedDossierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const focusStat = (tab: TarificationTab, chip: DossierChipFilter = 'all') => {
    setActiveTab(tab);
    setChipFilter(chip);
  };

  const renderBadges = (dossier: any) => {
    const badges: { label: string; className: string }[] = [];
    const paymentDone = !!dossier?.paiementTarificationEffectue;
    const fixedAmount = Number(dossier?.montantTarificationFixe || 0);
    const prestationsARegler = getPrestationsARegler(dossier);

    if (dossier?.fraisExoneres) badges.push({ label: 'Exonéré', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' });
    if (canTogglePayment(dossier)) {
      badges.push(
        paymentDone
          ? { label: 'Payé', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
          : { label: 'À encaisser', className: 'bg-amber-100 text-amber-900 border-amber-200' }
      );
    }
    if (dossier?.formuleTarifaire) {
      const formuleDisplay = getFormuleTarificationDisplay(dossier);
      badges.push({
        label: formuleDisplay?.label || 'Formule',
        className: 'bg-sky-100 text-sky-900 border-sky-200',
      });
    }
    if (fixedAmount > 0) badges.push({ label: 'Montant fixe', className: 'bg-violet-100 text-violet-900 border-violet-200' });
    if (prestationsARegler.length > 0) {
      badges.push({
        label: `Prestations (${prestationsARegler.length})`,
        className: 'bg-indigo-100 text-indigo-900 border-indigo-200',
      });
    }
    if (dossier?.tarificationNotificationSentAt) {
      badges.push({ label: 'Notifié', className: 'bg-slate-100 text-slate-800 border-slate-200' });
    }
    if (isTarificationInstallmentAuthorized(dossier)) {
      badges.push({
        label: 'Paiement en plusieurs fois',
        className: 'bg-teal-100 text-teal-900 border-teal-200',
      });
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {badges.map((badge) => (
          <span
            key={badge.label}
            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
          >
            {badge.label}
          </span>
        ))}
      </div>
    );
  };

  const renderDossierCard = (dossier: any, opts?: { showPaymentReminder?: boolean; showRetractTarification?: boolean }) => {
    const id = String(dossier?._id || dossier?.id || '');
    const fixedAmount = Number(dossier?.montantTarificationFixe || 0);
    const paymentDone = !!dossier?.paiementTarificationEffectue;
    const paymentToggleAllowed = canTogglePayment(dossier);
    const prestationsARegler = getPrestationsARegler(dossier);
    const totalPrestationsARegler = getTotalPrestationsARegler(dossier);
    const dueAmount = getDossierDueAmount(dossier);
    const showRelance = !!opts?.showPaymentReminder && paymentToggleAllowed && !paymentDone;
    const showRetract = !!opts?.showRetractTarification && canRetractTarificationRequest(dossier);
    const expanded = expandedDossierIds.has(id);
    const menuOpen = openMenuDossierId === id;

    let primaryLabel = 'Ouvrir le dossier';
    let primaryAction: (() => void) | null = null;
    let primaryDisabled = false;

    if (paymentToggleAllowed && !paymentDone) {
      primaryLabel = updatingPaymentId === id ? 'Mise à jour…' : 'Marquer payé';
      primaryAction = () => void handleTogglePayment(dossier);
      primaryDisabled = updatingPaymentId === id;
    } else if (prestationsARegler.length > 0) {
      const first = prestationsARegler[0];
      const prestationKey = `${id}:${String(first?._id || '')}`;
      primaryLabel = updatingPrestationKey === prestationKey ? 'Enregistrement…' : 'Marquer 1re prestation réglée';
      primaryAction = () => void handleMarkPrestationPaid(dossier, first);
      primaryDisabled = updatingPrestationKey === prestationKey || !first?._id;
    } else if (showRelance) {
      primaryLabel = remindingId === id ? 'Envoi…' : 'Relancer';
      primaryAction = () => void handlePaymentReminder(dossier);
      primaryDisabled = remindingId === id;
    } else if (showRetract) {
      primaryLabel = retractingId === id ? 'Rétractation…' : 'Rétracter';
      primaryAction = () => void handleRetractTarificationRequest(dossier);
      primaryDisabled = retractingId === id;
    }

    return (
      <article key={id} className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-orange-300/70">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <Link href={`/admin/dossiers/${id}`} className="text-sm font-semibold text-foreground hover:text-orange-700">
                {dossier?.numero || id} · {getClientName(dossier)}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{dossier?.titre || 'Sans titre'}</p>
            </div>
            {renderBadges(dossier)}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <CreditCard className="h-3.5 w-3.5" aria-hidden />
                {dueAmount > 0 ? `${formatEuro(dueAmount)} EUR dus` : 'Aucun montant dû'}
              </span>
              {dossier?.tarificationNotificationSentAt ? (
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden />
                  Notifié le{' '}
                  {new Date(dossier.tarificationNotificationSentAt).toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              ) : null}
            </div>
            {fixedAmount > 0 ? (
              <p className="text-xs text-muted-foreground">Montant fixé : {formatEuro(fixedAmount)} EUR</p>
            ) : dossier?.formuleTarifaire ? (
              <p className="text-xs text-muted-foreground">
                Formule : {getFormuleTarificationDisplay(dossier)?.label || '—'}
              </p>
            ) : dossier?.tarificationNotificationSentAt ? (
              <p className="text-xs text-muted-foreground">En attente de réponse client sur la tarification.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Tarification non définie.</p>
            )}
            {isTarificationInstallmentEligible(dossier) && !paymentDone ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => openInstallmentModal(dossier)}
              >
                {getTarificationEcheances(dossier).length > 0 ? 'Modifier les échéances' : 'Configurer les échéances'}
              </Button>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {primaryAction ? (
              <Button size="sm" disabled={primaryDisabled} onClick={primaryAction}>
                {primaryLabel}
              </Button>
            ) : (
              <Link
                href={`/admin/dossiers/${id}`}
                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Ouvrir
              </Link>
            )}
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                className="px-2.5"
                aria-label="Plus d’actions"
                onClick={() => setOpenMenuDossierId(menuOpen ? null : id)}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
              {menuOpen ? (
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-card p-1 shadow-lg">
                  <Link
                    href={`/admin/dossiers/${id}`}
                    className="block rounded-md px-3 py-2 text-xs font-medium hover:bg-muted"
                    onClick={() => setOpenMenuDossierId(null)}
                  >
                    Ouvrir le dossier
                  </Link>
                  {paymentToggleAllowed ? (
                    <button
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-muted disabled:opacity-50"
                      disabled={updatingPaymentId === id}
                      onClick={() => {
                        setOpenMenuDossierId(null);
                        void handleTogglePayment(dossier);
                      }}
                    >
                      {paymentDone ? 'Marquer non payé' : 'Marquer payé'}
                    </button>
                  ) : null}
                  {showRelance ? (
                    <button
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-muted disabled:opacity-50"
                      disabled={remindingId === id}
                      onClick={() => {
                        setOpenMenuDossierId(null);
                        void handlePaymentReminder(dossier);
                      }}
                    >
                      Relance app + SMS
                    </button>
                  ) : null}
                  {showRetract ? (
                    <button
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-muted disabled:opacity-50"
                      disabled={retractingId === id}
                      onClick={() => {
                        setOpenMenuDossierId(null);
                        void handleRetractTarificationRequest(dossier);
                      }}
                    >
                      Rétracter la demande
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {prestationsARegler.length > 0 ? (
          <div className="mt-3 rounded-lg border border-indigo-200/80 bg-indigo-50/50">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-indigo-950"
              onClick={() => toggleDossierExpanded(id)}
            >
              <span>
                Prestations à régler ({prestationsARegler.length}) · {formatEuro(totalPrestationsARegler)} EUR
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {expanded ? (
              <div className="space-y-2 border-t border-indigo-200/80 px-3 py-2">
                {prestationsARegler.map((p: any, idx: number) => {
                  const m = Number(p?.montant || 0);
                  const label = String(p?.label || `Prestation ${idx + 1}`).trim();
                  const prestationId = String(p?._id || '');
                  const prestationKey = `${id}:${prestationId}`;
                  return (
                    <div key={prestationId || `${label}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span>
                        {label} · {formatEuro(Number.isFinite(m) ? m : 0)} EUR
                      </span>
                      <button
                        type="button"
                        disabled={!prestationId || updatingPrestationKey === prestationKey}
                        onClick={() => void handleMarkPrestationPaid(dossier, p)}
                        className="rounded-md border border-emerald-600 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {updatingPrestationKey === prestationKey ? 'Enregistrement…' : 'Marquer réglée'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {dossier?.tarificationLastNotifySummary ? (
          <p className="mt-3 max-h-24 overflow-y-auto rounded-lg border border-border/70 bg-muted/30 p-2 text-[11px] text-foreground whitespace-pre-wrap">
            {dossier.tarificationLastNotifySummary}
          </p>
        ) : null}
      </article>
    );
  };

  const renderDossierList = (
    items: any[],
    emptyText: string,
    opts?: { showPaymentReminder?: boolean; showRetractTarification?: boolean }
  ) => {
    if (!items.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

    return (
      <>
        <div className="hidden lg:block overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Dossier</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Montant dû</th>
                <th className="px-4 py-3 font-semibold">Dernière notif.</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((dossier) => {
                const id = String(dossier?._id || dossier?.id || '');
                const dueAmount = getDossierDueAmount(dossier);
                const paymentDone = !!dossier?.paiementTarificationEffectue;
                const paymentToggleAllowed = canTogglePayment(dossier);
                const showRelance = !!opts?.showPaymentReminder && paymentToggleAllowed && !paymentDone;
                return (
                  <tr key={`table-${id}`} className="border-t border-border/70">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/admin/dossiers/${id}`} className="font-semibold text-foreground hover:text-orange-700">
                        {dossier?.numero || id}
                      </Link>
                      <p className="text-xs text-muted-foreground">{getClientName(dossier)}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{dossier?.titre || 'Sans titre'}</p>
                    </td>
                    <td className="px-4 py-3 align-top">{renderBadges(dossier)}</td>
                    <td className="px-4 py-3 align-top font-medium">{dueAmount > 0 ? `${formatEuro(dueAmount)} EUR` : '—'}</td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                      {dossier?.tarificationNotificationSentAt
                        ? new Date(dossier.tarificationNotificationSentAt).toLocaleString('fr-FR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {paymentToggleAllowed ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 whitespace-nowrap px-2.5 text-xs"
                            disabled={updatingPaymentId === id}
                            onClick={() => void handleTogglePayment(dossier)}
                          >
                            {paymentDone ? 'Payé' : 'Marquer payé'}
                          </Button>
                        ) : null}
                        {showRelance ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 whitespace-nowrap px-2.5 text-xs"
                            disabled={remindingId === id}
                            onClick={() => void handlePaymentReminder(dossier)}
                          >
                            Relancer
                          </Button>
                        ) : null}
                        {isTarificationInstallmentEligible(dossier) && !paymentDone ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 whitespace-nowrap px-2.5 text-xs"
                            onClick={() => openInstallmentModal(dossier)}
                          >
                            Échéances
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 lg:hidden">{items.map((dossier) => renderDossierCard(dossier, opts))}</div>
      </>
    );
  };

  const renderStandaloneList = (onlyPending = false) => {
    const requests = onlyPending
      ? filteredStandaloneRequests.filter((req) => String(req?.status || 'pending') === 'pending')
      : filteredStandaloneRequests;

    if (!requests.length) {
      return <p className="text-sm text-muted-foreground">Aucune demande sans dossier trouvée.</p>;
    }

    return (
      <div className="space-y-3">
        {requests.map((req: any) => {
          const user = req?.user || {};
          const statusValue = String(req?.status || 'pending');
          const reminderState = getStandaloneReminderState(req);
          const statusUi =
            statusValue === 'accepted'
              ? { label: 'Accepté', classes: 'border-emerald-300 bg-emerald-50 text-emerald-800' }
              : statusValue === 'refused'
              ? { label: 'Refusé', classes: 'border-rose-300 bg-rose-50 text-rose-800' }
              : statusValue === 'cancelled'
              ? { label: 'Annulé', classes: 'border-gray-300 bg-gray-100 text-gray-700' }
              : { label: 'En attente', classes: 'border-amber-300 bg-amber-50 text-amber-800' };
          const displayName =
            [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || 'Utilisateur';
          const amountText =
            req?.amount != null && Number.isFinite(Number(req.amount))
              ? `${formatEuro(Number(req.amount))} EUR`
              : 'Montant non précisé';

          return (
            <article key={String(req?._id)} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email || 'Email non renseigné'}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusUi.classes}`}>
                  {statusUi.label}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">{amountText}</p>
              <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{String(req?.motif || '').slice(0, 400)}</p>
              {statusValue === 'pending' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={remindingStandaloneId === String(req?._id) || !reminderState.canRemind}
                    onClick={() => void handleStandaloneReminder(String(req?._id))}
                  >
                    {remindingStandaloneId === String(req?._id) ? 'Relance…' : 'Relancer'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cancellingStandaloneId === String(req?._id)}
                    onClick={() => void handleStandaloneCancel(req)}
                  >
                    {cancellingStandaloneId === String(req?._id) ? 'Annulation…' : 'Annuler'}
                  </Button>
                  {!reminderState.canRemind ? <span className="text-[11px] text-amber-700">{reminderState.hint}</span> : null}
                </div>
              ) : null}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Envoyé le{' '}
                {req?.createdAt
                  ? new Date(req.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                  : '-'}
                {req?.lastReminderAt
                  ? ` · Dernière relance ${new Date(req.lastReminderAt).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}`
                  : ''}
                {req?.respondedAt
                  ? ` · Répondu le ${new Date(req.respondedAt).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}`
                  : ''}
              </p>
            </article>
          );
        })}
      </div>
    );
  };

  if (status === 'loading' || loading) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-6xl items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          <p className="text-sm text-muted-foreground">Chargement du suivi tarification…</p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      {feedback ? (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-md rounded-xl border px-4 py-3 text-sm shadow-lg ${
            feedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <p className="flex-1">{feedback.text}</p>
            <button type="button" className="text-xs underline" onClick={() => setFeedback(null)}>
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">Administration</p>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Suivi tarification</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Priorisez les encaissements, les prestations ouvertes et les demandes sans dossier depuis une file d’attente unique.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'À traiter', value: stats.todo, tab: 'todo' as const, chip: 'all' as const },
          { label: 'À encaisser', value: stats.unpaid, tab: 'dossiers' as const, chip: 'unpaid' as const },
          { label: 'Prestations', value: stats.openPrestations, tab: 'dossiers' as const, chip: 'openPrestations' as const },
          { label: 'Choix en attente', value: stats.pendingChoice, tab: 'dossiers' as const, chip: 'pendingChoice' as const },
          { label: 'Sans dossier', value: stats.standalonePending, tab: 'standalone' as const, chip: 'all' as const },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => focusStat(item.tab, item.chip)}
            className="rounded-xl border border-border bg-card px-3 py-3 text-left shadow-sm transition-colors hover:border-orange-300/70 hover:bg-muted/30"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{item.value}</p>
          </button>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="tarification-filter"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Rechercher client, dossier, email, motif…"
              className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as DossierSort)}
              className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
              aria-label="Trier les dossiers"
            >
              <option value="due">Montant dû</option>
              <option value="notification">Dernière notification</option>
              <option value="client">Client A-Z</option>
            </select>
            {filterText.trim() ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setFilterText('')}>
                Réinitialiser
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'border border-border bg-card text-foreground hover:bg-muted/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'dossiers' || activeTab === 'todo' ? (
          <div className="flex flex-wrap gap-2">
            {CHIP_FILTERS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setChipFilter(chip.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  chipFilter === chip.id
                    ? 'border-orange-400 bg-orange-50 text-orange-900'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {activeTab === 'todo' ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-orange-600" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">Dossiers à traiter ({todoDossiers.length})</h2>
          </div>
          {renderDossierList(todoDossiers, 'Aucun dossier ne nécessite une action pour le moment.', {
            showPaymentReminder: true,
            showRetractTarification: true,
          })}
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Demandes sans dossier en attente ({filteredStandaloneRequests.filter((r) => String(r?.status || 'pending') === 'pending').length})
            </h3>
            {renderStandaloneList(true)}
          </div>
        </section>
      ) : null}

      {activeTab === 'dossiers' ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Catalogue dossiers ({dossierCatalog.length})</h2>
          <p className="text-xs text-muted-foreground">
            Vue complète des dossiers avec ou sans paiement défini. Les relances envoient une notification in-app et un SMS court si un numéro est enregistré.
          </p>
          {renderDossierList(dossierCatalog, 'Aucun dossier ne correspond aux filtres.', {
            showPaymentReminder: true,
            showRetractTarification: true,
          })}
        </section>
      ) : null}

      {activeTab === 'standalone' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Tarification sans dossier</h2>
              <p className="text-xs text-muted-foreground">Historique des demandes standalone et envoi manuel.</p>
            </div>
            <Button type="button" onClick={() => setShowManualTarificationModal(true)}>
              <Send className="mr-2 h-4 w-4" aria-hidden />
              Envoyer une tarification
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {STANDALONE_STATUS_FILTERS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStandaloneStatusFilter(opt.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  standaloneStatusFilter === opt.id
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {renderStandaloneList()}
        </section>
      ) : null}

      {activeTab === 'exonerations' ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Dossiers exonérés ({filteredExonerated.length})</h2>
          {renderDossierList(filteredExonerated, 'Aucun dossier exonéré actuellement.', { showRetractTarification: true })}
        </section>
      ) : null}

      {showManualTarificationModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-tarification-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="manual-tarification-title" className="text-lg font-semibold text-foreground">
                  Envoyer une tarification sans dossier
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Canaux : in-app, push, email. SMS uniquement si le numéro est en +33.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-border p-1.5 text-muted-foreground hover:bg-muted"
                onClick={() => setShowManualTarificationModal(false)}
                aria-label="Fermer"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recherche utilisateur
                </label>
                <input
                  type="text"
                  value={manualUserFilter}
                  onChange={(e) => setManualUserFilter(e.target.value)}
                  placeholder="Nom, email, téléphone, rôle…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Utilisateur</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                >
                  <option value="">-- Sélectionner --</option>
                  {filteredUsers.map((u: any) => {
                    const userId = String(u._id || u.id || '');
                    const label = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || userId;
                    return (
                      <option key={userId} value={userId}>
                        {label} {u.email ? `- ${u.email}` : ''} {u.role ? `(${u.role})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motif *</label>
                <textarea
                  value={manualMotif}
                  onChange={(e) => setManualMotif(e.target.value)}
                  rows={4}
                  placeholder="Ex : Merci de régulariser la tarification pour prise en charge administrative…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Montant (optionnel)
                </label>
                <input
                  type="text"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="Ex : 250"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowManualTarificationModal(false)}>
                Annuler
              </Button>
              <Button type="button" disabled={manualSending} onClick={() => void handleManualNotify()}>
                {manualSending ? 'Envoi…' : 'Envoyer'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isMounted && installmentModalDossier
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4 lg:pl-64"
              onClick={closeInstallmentModal}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="installment-plan-title"
                className="max-h-[min(90dvh,100dvh-1.5rem)] w-full min-w-0 max-w-md overflow-y-auto rounded-2xl border border-border bg-background p-4 shadow-2xl sm:max-w-xl sm:p-5"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 pr-2">
                    <h2 id="installment-plan-title" className="text-base font-semibold text-foreground sm:text-lg">
                      Échéances de tarification
                    </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {getClientName(installmentModalDossier)} · montant tarifaire{' '}
                  {formatEuro(getTarificationReferenceAmount(installmentModalDossier))} EUR. Le client est notifié 3
                  jours avant chaque échéance.
                </p>
              </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground hover:bg-muted"
                    onClick={closeInstallmentModal}
                    aria-label="Fermer"
                  >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

                <div className="space-y-3">
                  {installmentRows.map((row) => {
                    const dossierId = String(installmentModalDossier?._id || installmentModalDossier?.id || '');
                    const echeanceKey = row.serverId ? `${dossierId}:${row.serverId}` : '';
                    return (
                      <div
                        key={row.localId}
                        className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]"
                      >
                        <div className="space-y-1 sm:col-span-2 xl:col-span-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Libellé
                      </label>
                      <input
                        type="text"
                        value={row.label}
                        disabled={row.statut === 'reglee'}
                        onChange={(event) => updateInstallmentRow(row.localId, { label: event.target.value })}
                        className="w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Date
                      </label>
                      <input
                        type="date"
                        value={row.date}
                        disabled={row.statut === 'reglee'}
                        onChange={(event) => updateInstallmentRow(row.localId, { date: event.target.value })}
                        className="w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Montant (EUR)
                      </label>
                      <input
                        type="text"
                        value={row.amount}
                        disabled={row.statut === 'reglee'}
                        onChange={(event) => updateInstallmentRow(row.localId, { amount: event.target.value })}
                        className="w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-3">
                      {row.statut === 'reglee' ? (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                          Réglée
                        </span>
                      ) : row.serverId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          disabled={updatingInstallmentId === echeanceKey}
                          onClick={() => void handleMarkEcheancePaid(installmentModalDossier, row.serverId!)}
                        >
                          Marquer réglée
                        </Button>
                      ) : null}
                      {row.statut !== 'reglee' && installmentRows.length > 2 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => removeInstallmentRow(row.localId)}
                        >
                          Retirer
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={addInstallmentRow}>
                    Ajouter une échéance
                  </Button>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={closeInstallmentModal}>
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={installmentSaving}
                      onClick={() => void saveInstallmentPlan()}
                    >
                      {installmentSaving ? 'Enregistrement…' : 'Enregistrer les échéances'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </main>
  );
}

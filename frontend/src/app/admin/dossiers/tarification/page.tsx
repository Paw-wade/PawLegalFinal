'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { dossiersAPI, userAPI } from '@/lib/api';
import { normalizeMontantTarificationFixe } from '@/lib/montantTarification';

function getClientName(dossier: any) {
  const userName = [dossier?.user?.firstName, dossier?.user?.lastName].filter(Boolean).join(' ').trim();
  if (userName) return userName;
  const fallback = [dossier?.clientPrenom, dossier?.clientNom].filter(Boolean).join(' ').trim();
  if (fallback) return fallback;
  return dossier?.user?.email || dossier?.clientEmail || 'Client non renseigné';
}

export default function AdminDossiersTarificationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [filterText, setFilterText] = useState('');
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
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
  const [showManualTarificationPanel, setShowManualTarificationPanel] = useState(false);
  const [standaloneStatusFilter, setStandaloneStatusFilter] = useState<
    'all' | 'pending' | 'accepted' | 'refused' | 'cancelled'
  >('all');
  const [remindingStandaloneId, setRemindingStandaloneId] = useState<string | null>(null);
  const [cancellingStandaloneId, setCancellingStandaloneId] = useState<string | null>(null);
  const [showWithoutPaymentSection, setShowWithoutPaymentSection] = useState(false);

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

  const { withPayment, withoutPayment, exonerated } = useMemo(() => {
    const exo = dossiers.filter((d) => !!d?.fraisExoneres);
    const hasRequestedPrestations = (d: any) =>
      Array.isArray(d?.tarificationPrestations) &&
      d.tarificationPrestations.some((p: any) => String(p?.statut || 'a_regler') === 'a_regler');
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

  const normalize = (value: any) => String(value || '').toLowerCase().trim();

  /** Recherche insensible aux accents (ex. « traore » trouve « Traoré »). */
  const fold = (value: any) =>
    normalize(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const matchesFilter = useCallback(
    (dossier: any) => {
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
      const tokens = raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/\s+/)
        .filter(Boolean);
      return tokens.every((t) => haystack.includes(t));
    },
    [filterText]
  );

  const filteredWithPayment = useMemo(() => withPayment.filter(matchesFilter), [withPayment, matchesFilter]);
  const filteredWithoutPayment = useMemo(() => withoutPayment.filter(matchesFilter), [withoutPayment, matchesFilter]);
  const filteredExonerated = useMemo(() => exonerated.filter(matchesFilter), [exonerated, matchesFilter]);
  const filteredStandaloneRequests = useMemo(() => {
    const raw = filterText.trim();
    const byStatus =
      standaloneStatusFilter === 'all'
        ? standaloneRequests
        : standaloneRequests.filter((req: any) => String(req?.status || 'pending') === standaloneStatusFilter);
    if (!raw) return byStatus;
    const tokens = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    return byStatus.filter((req: any) => {
      const user = req?.user || {};
      const admin = req?.adminSender || {};
      const statusLabel =
        req?.status === 'accepted' ? 'accepte' : req?.status === 'refused' ? 'refuse' : 'en attente';
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
      return tokens.every((t) => haystack.includes(t));
    });
  }, [standaloneRequests, filterText, standaloneStatusFilter]);

  const canTogglePayment = (dossier: any) => {
    if (!dossier || dossier?.fraisExoneres) return false;
    return Number(dossier?.montantTarificationFixe || 0) > 0 || !!dossier?.formuleTarifaire;
  };

  const filteredUsers = useMemo(() => {
    const q = fold(manualUserFilter);
    const base = users.filter((u: any) => u && (u._id || u.id));
    if (!q) return base;
    return base.filter((u: any) => {
      const h = fold([u.firstName, u.lastName, u.email, u.phone, u.role].join(' '));
      return h.includes(q);
    });
  }, [users, manualUserFilter]);

  const handleTogglePayment = async (dossier: any) => {
    const id = String(dossier?._id || dossier?.id || '');
    if (!id || !canTogglePayment(dossier)) return;
    const nextValue = !dossier?.paiementTarificationEffectue;
    setUpdatingPaymentId(id);
    try {
      await dossiersAPI.updateDossier(id, { paiementTarificationEffectue: nextValue });
      setDossiers((prev) =>
        prev.map((item: any) =>
          String(item?._id || item?.id || '') === id
            ? {
                ...item,
                paiementTarificationEffectue: nextValue,
                paiementTarificationEffectueAt: nextValue ? new Date().toISOString() : null,
              }
            : item
        )
      );
    } catch (e) {
      console.error('Erreur mise à jour paiement tarification:', e);
    } finally {
      setUpdatingPaymentId(null);
    }
  };

  const canRetractTarificationRequest = (dossier: any) =>
    !!dossier?.tarificationNotificationSentAt &&
    !dossier?.formuleTarifaire &&
    normalizeMontantTarificationFixe(dossier?.montantTarificationFixe) <= 0 &&
    !dossier?.paiementTarificationEffectue;

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
    setFeedback(null);
    try {
      const res = await dossiersAPI.retractTarificationChoiceRequest(id);
      if (res.data?.success) {
        setFeedback({ type: 'success', text: res.data.message || 'Demande rétractée.' });
        setDossiers((prev) =>
          prev.map((item: any) =>
            String(item?._id || item?.id || '') === id
              ? {
                  ...item,
                  tarificationNotificationSentAt: undefined,
                  tarificationLastNotifySummary: undefined,
                }
              : item
          )
        );
      } else {
        setFeedback({ type: 'error', text: res.data?.message || 'Rétractation refusée.' });
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        text: e?.response?.data?.message || e?.message || 'Erreur lors de la rétractation.',
      });
    } finally {
      setRetractingId(null);
    }
  };

  const handlePaymentReminder = async (dossier: any) => {
    const id = String(dossier?._id || dossier?.id || '');
    if (!id || !canTogglePayment(dossier) || dossier?.paiementTarificationEffectue) return;
    setRemindingId(id);
    setFeedback(null);
    try {
      const res = await dossiersAPI.sendTarificationPaymentReminder(id);
      if (res.data?.success) {
        setFeedback({ type: 'success', text: res.data.message || 'Relance envoyée.' });
      } else {
        setFeedback({ type: 'error', text: res.data?.message || 'Échec de la relance.' });
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        text: e?.response?.data?.message || e?.message || 'Erreur lors de la relance.',
      });
    } finally {
      setRemindingId(null);
    }
  };

  const handleManualNotify = async () => {
    if (!selectedUserId) {
      setFeedback({ type: 'error', text: 'Veuillez sélectionner un utilisateur.' });
      return;
    }
    if (manualMotif.trim().length < 3) {
      setFeedback({ type: 'error', text: 'Veuillez saisir un motif (minimum 3 caractères).' });
      return;
    }
    const hasAmountInput = manualAmount.trim().length > 0;
    let amountValue: number | null = null;
    if (hasAmountInput) {
      const parsedAmountValue = Number(manualAmount.trim().replace(',', '.'));
      if (!Number.isFinite(parsedAmountValue) || parsedAmountValue < 0) {
        setFeedback({ type: 'error', text: 'Montant invalide.' });
        return;
      }
      amountValue = parsedAmountValue;
    }

    setManualSending(true);
    setFeedback(null);
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
        setFeedback({
          type: 'success',
          text: `${res.data?.message || 'Notification envoyée.'} ${infos.join(' · ')}`,
        });
        setManualMotif('');
        setManualAmount('');
        await load();
      } else {
        setFeedback({ type: 'error', text: res.data?.message || 'Échec de l’envoi.' });
      }
    } catch (e: any) {
      if (e?.response?.status === 409 && e?.response?.data?.code === 'standalone_pending_exists') {
        const ex = e?.response?.data?.existingRequest;
        setFeedback({
          type: 'error',
          text: `Une demande est déjà en attente pour cet utilisateur (créée le ${
            ex?.createdAt ? new Date(ex.createdAt).toLocaleString('fr-FR') : 'date inconnue'
          }).`,
        });
        return;
      }
      setFeedback({
        type: 'error',
        text: e?.response?.data?.message || e?.message || 'Erreur lors de l’envoi.',
      });
    } finally {
      setManualSending(false);
    }
  };

  const getStandaloneReminderState = (req: any) => {
    const anchor = req?.lastReminderAt || req?.createdAt;
    if (!anchor) return { canRemind: true, hint: '' };
    const elapsed = Date.now() - new Date(anchor).getTime();
    const minMs = 48 * 60 * 60 * 1000;
    if (elapsed >= minMs) return { canRemind: true, hint: '' };
    const remainingHours = Math.ceil((minMs - elapsed) / (60 * 60 * 1000));
    return { canRemind: false, hint: `Disponible dans ~${remainingHours}h` };
  };

  const handleStandaloneReminder = async (requestId: string) => {
    if (!requestId) return;
    setRemindingStandaloneId(requestId);
    setFeedback(null);
    try {
      const res = await dossiersAPI.remindStandaloneTarificationRequest(requestId);
      if (res.data?.success) {
        setFeedback({ type: 'success', text: res.data?.message || 'Relance standalone envoyée.' });
        await load();
      } else {
        setFeedback({ type: 'error', text: res.data?.message || 'Échec de la relance standalone.' });
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        text: e?.response?.data?.message || e?.message || 'Erreur lors de la relance standalone.',
      });
    } finally {
      setRemindingStandaloneId(null);
    }
  };

  const handleStandaloneCancel = async (req: any) => {
    const requestId = String(req?._id || '');
    if (!requestId) return;
    if (!confirm('Annuler cette demande de paiement sans dossier ?')) return;
    setCancellingStandaloneId(requestId);
    setFeedback(null);
    try {
      const res = await dossiersAPI.cancelStandaloneTarificationRequest(requestId);
      if (res.data?.success) {
        setFeedback({ type: 'success', text: res.data?.message || 'Demande annulée.' });
        await load();
      } else {
        setFeedback({ type: 'error', text: res.data?.message || 'Échec de l’annulation.' });
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        text: e?.response?.data?.message || e?.message || 'Erreur lors de l’annulation.',
      });
    } finally {
      setCancellingStandaloneId(null);
    }
  };

  const renderList = (
    items: any[],
    emptyText: string,
    opts?: { showPaymentReminder?: boolean; showRetractTarification?: boolean }
  ) => {
    if (!items.length) {
      return <p className="text-sm text-gray-500">{emptyText}</p>;
    }
    return (
      <div className="space-y-2">
        {items.map((dossier: any) => {
          const id = dossier?._id || dossier?.id;
          const fixedAmount = Number(dossier?.montantTarificationFixe || 0);
          const paymentDone = !!dossier?.paiementTarificationEffectue;
          const paymentToggleAllowed = canTogglePayment(dossier);
          const prestations = Array.isArray(dossier?.tarificationPrestations) ? dossier.tarificationPrestations : [];
          const prestationsARegler = prestations.filter(
            (p: any) => String(p?.statut || 'a_regler') === 'a_regler'
          );
          const totalPrestationsARegler = prestationsARegler.reduce((acc: number, p: any) => {
            const n = Number(p?.montant || 0);
            return acc + (Number.isFinite(n) ? n : 0);
          }, 0);
          const showRelance =
            !!opts?.showPaymentReminder && paymentToggleAllowed && !paymentDone;
          const showRetract = !!opts?.showRetractTarification && canRetractTarificationRequest(dossier);
          return (
            <div
              key={String(id)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-orange-300 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Link href={`/admin/dossiers/${id}`} className="min-w-0 flex-1 hover:text-orange-700">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {dossier?.numero || id} - {getClientName(dossier)}
                  </p>
                  <span className="text-xs text-gray-600">{dossier?.titre || 'Sans titre'}</span>
                </Link>
                <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
                  {showRetract && (
                    <button
                      type="button"
                      disabled={retractingId === String(id)}
                      onClick={() => handleRetractTarificationRequest(dossier)}
                      className="rounded-md px-3 py-1.5 text-xs font-semibold border border-amber-600 bg-amber-50 text-amber-950 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Effacer la demande notifiée tant que le client n’a pas choisi de formule (notification in-app au client)"
                    >
                      {retractingId === String(id) ? 'Rétractation…' : 'Rétracter la demande'}
                    </button>
                  )}
                  {showRelance && (
                    <button
                      type="button"
                      disabled={remindingId === String(id)}
                      onClick={() => handlePaymentReminder(dossier)}
                      className="rounded-md px-3 py-1.5 text-xs font-semibold border border-blue-600 bg-blue-50 text-blue-900 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Notification dans l’app client + SMS court (1 segment) si un numéro est enregistré"
                    >
                      {remindingId === String(id) ? 'Envoi…' : 'Relance app + SMS'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!paymentToggleAllowed || updatingPaymentId === String(id)}
                    onClick={() => handleTogglePayment(dossier)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${
                      paymentDone
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={
                      paymentToggleAllowed
                        ? 'Basculer le statut paiement effectué / non effectué'
                        : 'Paiement non applicable (pas de formule ni montant fixé)'
                    }
                  >
                    {updatingPaymentId === String(id)
                      ? 'Mise à jour...'
                      : paymentDone
                      ? 'Paiement effectué'
                      : 'Paiement non effectué'}
                  </button>
                </div>
              </div>
              <div className="mt-1 text-xs text-gray-700 space-y-1">
                {dossier?.fraisExoneres
                  ? 'Exonération active'
                  : fixedAmount > 0
                  ? `Montant fixé: ${fixedAmount.toLocaleString('fr-FR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} EUR`
                  : dossier?.formuleTarifaire
                  ? `Formule choisie: ${dossier.formuleTarifaire === 'premium' ? 'Premium' : 'Standard'}`
                  : dossier?.tarificationNotificationSentAt
                  ? 'Notification tarification déjà envoyée au client (voir détail ci-dessous).'
                  : 'En attente de décision tarification'}
                {prestationsARegler.length > 0 ? (
                  <div className="rounded border border-indigo-200 bg-indigo-50/60 px-2 py-1.5 text-[11px] text-indigo-900">
                    <p className="font-semibold">
                      Prestations à régler ({prestationsARegler.length}) :{' '}
                      {totalPrestationsARegler.toLocaleString('fr-FR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      EUR
                    </p>
                    <div className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                      {prestationsARegler.map((p: any, idx: number) => {
                        const m = Number(p?.montant || 0);
                        const label = String(p?.label || `Prestation ${idx + 1}`).trim();
                        return (
                          <p key={`${label}-${idx}`}>
                            - {label} :{' '}
                            {Number.isFinite(m)
                              ? m.toLocaleString('fr-FR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                              : '0.00'}{' '}
                            EUR
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {dossier?.tarificationNotificationSentAt && (
                  <p className="text-[11px] text-gray-500">
                    Envoyée le{' '}
                    {new Date(dossier.tarificationNotificationSentAt).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
                {dossier?.tarificationLastNotifySummary ? (
                  <p className="text-[11px] text-gray-800 whitespace-pre-wrap border border-gray-100 rounded bg-gray-50/80 p-2 max-h-28 overflow-y-auto">
                    {dossier.tarificationLastNotifySummary}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (status === 'loading' || loading) {
    return <div className="p-6 text-sm text-gray-600">Chargement des dossiers de tarification...</div>;
  }

  return (
    <main className="w-full px-4 py-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dossiers - suivi tarification</h1>
        <p className="text-sm text-gray-600 mt-1">
          Vue dédiée aux dossiers avec paiement, sans paiement défini et avec exonération. Les noms des personnes concernées sont affichés.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <label htmlFor="tarification-filter" className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
          Filtre
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="tarification-filter"
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Rechercher par nom client, numéro dossier, titre ou email..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
          />
          {filterText.trim() && (
            <button
              type="button"
              onClick={() => setFilterText('')}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-indigo-900">Tarification sans dossier</h2>
          <button
            type="button"
            onClick={() => setShowManualTarificationPanel((prev) => !prev)}
            className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold hover:bg-indigo-700"
          >
            {showManualTarificationPanel ? 'Fermer' : 'Envoyer une tarification'}
          </button>
        </div>

        {showManualTarificationPanel && (
          <>
            <p className="text-xs text-indigo-900/80">
              Sélectionnez un utilisateur de la plateforme et envoyez une demande avec motif. Canaux: in-app + push +
              email. SMS uniquement si numéro en <strong>+33</strong>.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Recherche utilisateur
                </label>
                <input
                  type="text"
                  value={manualUserFilter}
                  onChange={(e) => setManualUserFilter(e.target.value)}
                  placeholder="Nom, email, téléphone, rôle..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Utilisateur
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white"
                >
                  <option value="">-- Sélectionner --</option>
                  {filteredUsers.map((u: any) => {
                    const id = String(u._id || u.id || '');
                    const label = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || id;
                    return (
                      <option key={id} value={id}>
                        {label} {u.email ? `- ${u.email}` : ''} {u.role ? `(${u.role})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2 space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Motif *</label>
                <textarea
                  value={manualMotif}
                  onChange={(e) => setManualMotif(e.target.value)}
                  rows={3}
                  placeholder="Ex: Merci de régulariser la tarification pour prise en charge administrative..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Montant (optionnel)
                </label>
                <input
                  type="text"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="Ex: 250"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={handleManualNotify}
                  disabled={manualSending}
                  className="w-full rounded-lg bg-indigo-600 text-white px-3 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {manualSending ? 'Envoi…' : 'Envoyer tarification'}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Paiement requis ({filteredWithPayment.length})</h2>
        <p className="text-xs text-gray-600 mb-3">
          Pour les dossiers avec paiement non effectué : bouton <strong>Relance app + SMS</strong> — notification
          in-app et SMS court (un segment) vers le numéro du compte client, si Twilio est configuré.
        </p>
        {feedback && (
          <div
            className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-red-300 bg-red-50 text-red-800'
            }`}
          >
            {feedback.text}
            <button
              type="button"
              className="ml-2 underline text-xs"
              onClick={() => setFeedback(null)}
            >
              Fermer
            </button>
          </div>
        )}
        {renderList(filteredWithPayment, 'Aucun dossier avec paiement enregistré pour le moment.', {
          showPaymentReminder: true,
        })}

        <div className="mt-5 border-t border-gray-200 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
            Paiement requis sans dossier ({filteredStandaloneRequests.length})
            </h3>
            <div className="flex flex-wrap gap-1">
              {[
                { id: 'all', label: 'Tous' },
                { id: 'pending', label: 'En attente' },
                { id: 'accepted', label: 'Acceptés' },
                { id: 'refused', label: 'Refusés' },
                { id: 'cancelled', label: 'Annulés' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStandaloneStatusFilter(opt.id as any)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                    standaloneStatusFilter === opt.id
                      ? 'border-indigo-500 bg-indigo-100 text-indigo-900'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-3">
            Historique des demandes standalone avec statut client. Relance possible toutes les 48h.
          </p>
          {filteredStandaloneRequests.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune demande standalone trouvée.</p>
          ) : (
            <div className="space-y-2">
              {filteredStandaloneRequests.slice(0, 30).map((req: any) => {
                const user = req?.user || {};
                const status = String(req?.status || 'pending');
                const reminderState = getStandaloneReminderState(req);
                const statusUi =
                  status === 'accepted'
                    ? {
                        label: 'Accepté',
                        classes: 'border-emerald-300 bg-emerald-50 text-emerald-800',
                      }
                    : status === 'refused'
                    ? {
                        label: 'Refusé',
                        classes: 'border-rose-300 bg-rose-50 text-rose-800',
                      }
                    : status === 'cancelled'
                    ? {
                        label: 'Annulé',
                        classes: 'border-gray-300 bg-gray-100 text-gray-700',
                      }
                    : {
                        label: 'En attente',
                        classes: 'border-amber-300 bg-amber-50 text-amber-800',
                      };
                const displayName =
                  [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
                  user?.email ||
                  'Utilisateur';
                const amountText =
                  req?.amount != null && Number.isFinite(Number(req.amount))
                    ? `${Number(req.amount).toLocaleString('fr-FR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} EUR`
                    : 'Montant non précisé';
                return (
                  <div
                    key={String(req?._id)}
                    className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusUi.classes}`}>
                        {statusUi.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 mt-1">{amountText}</p>
                    <p className="text-xs text-gray-800 mt-1 whitespace-pre-wrap">{String(req?.motif || '').slice(0, 400)}</p>
                    {status === 'pending' ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={
                            remindingStandaloneId === String(req?._id) || !reminderState.canRemind
                          }
                          onClick={() => handleStandaloneReminder(String(req?._id))}
                          className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold border border-blue-600 bg-blue-50 text-blue-900 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {remindingStandaloneId === String(req?._id) ? 'Relance…' : 'Relancer'}
                        </button>
                        <button
                          type="button"
                          disabled={cancellingStandaloneId === String(req?._id)}
                          onClick={() => handleStandaloneCancel(req)}
                          className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold border border-gray-500 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cancellingStandaloneId === String(req?._id) ? 'Annulation…' : 'Annuler'}
                        </button>
                        {!reminderState.canRemind ? (
                          <span className="text-[11px] text-amber-700">{reminderState.hint}</span>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="text-[11px] text-gray-500 mt-1">
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-amber-900">
            Sans paiement défini ({filteredWithoutPayment.length})
          </h2>
          <button
            type="button"
            onClick={() => setShowWithoutPaymentSection((prev) => !prev)}
            className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            {showWithoutPaymentSection ? 'Replier' : 'Déplier'}
          </button>
        </div>
        {showWithoutPaymentSection ? (
          renderList(filteredWithoutPayment, 'Aucun dossier en attente de décision tarification.', {
            showRetractTarification: true,
          })
        ) : (
          <p className="text-xs text-amber-800/90">Bloc replié par défaut.</p>
        )}
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
        <h2 className="text-sm font-semibold text-emerald-900 mb-3">Exonération ({filteredExonerated.length})</h2>
        {renderList(filteredExonerated, 'Aucun dossier exonéré actuellement.', { showRetractTarification: true })}
      </section>
    </main>
  );
}

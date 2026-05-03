'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { dossiersAPI } from '@/lib/api';

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
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dossiersAPI.getAllDossiers();
      const list = res.data?.dossiers || res.data?.data || [];
      setDossiers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Erreur chargement tarification dossiers:', e);
      setDossiers([]);
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
    const withPay = dossiers.filter(
      (d) => !d?.fraisExoneres && (Number(d?.montantTarificationFixe || 0) > 0 || !!d?.formuleTarifaire)
    );
    const withoutPay = dossiers.filter(
      (d) => !d?.fraisExoneres && !d?.formuleTarifaire && Number(d?.montantTarificationFixe || 0) <= 0
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

  const canTogglePayment = (dossier: any) => {
    if (!dossier || dossier?.fraisExoneres) return false;
    return Number(dossier?.montantTarificationFixe || 0) > 0 || !!dossier?.formuleTarifaire;
  };

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

  const renderList = (items: any[], emptyText: string, opts?: { showPaymentReminder?: boolean }) => {
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
          const showRelance =
            !!opts?.showPaymentReminder && paymentToggleAllowed && !paymentDone;
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
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <h2 className="text-sm font-semibold text-amber-900 mb-3">Sans paiement défini ({filteredWithoutPayment.length})</h2>
        {renderList(filteredWithoutPayment, 'Aucun dossier en attente de décision tarification.')}
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
        <h2 className="text-sm font-semibold text-emerald-900 mb-3">Exonération ({filteredExonerated.length})</h2>
        {renderList(filteredExonerated, 'Aucun dossier exonéré actuellement.')}
      </section>
    </main>
  );
}

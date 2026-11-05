'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { assistantAPI } from '@/lib/api';

type TaskItem = {
  _id: string;
  titre?: string;
  priorite?: string;
  statut?: string;
  dateEcheance?: string;
  updatedAt?: string;
  dossier?: { _id?: string; clientNom?: string; clientPrenom?: string; titre?: string };
  assignedTo?: { firstName?: string; lastName?: string }[];
};

type DossierItem = {
  _id: string;
  clientNom?: string;
  clientPrenom?: string;
  titre?: string;
  statut?: string;
  updatedAt?: string;
  numero?: string;
};

type RdvItem = {
  _id: string;
  date: string;
  type?: string;
  statut?: string;
  user?: { firstName?: string; lastName?: string };
  clientNom?: string;
};

type AssistantData = {
  tachesUrgentes: TaskItem[];
  tachesEnRetard: TaskItem[];
  tachesAujourdhui: TaskItem[];
  tachesEnCoursSansMaj: TaskItem[];
  tachesTermineesAujourdhui: TaskItem[];
  rdvAujourdhui: RdvItem[];
  rdvDemain: RdvItem[];
  rdvEnAttente: RdvItem[];
  dossiersInactifs: DossierItem[];
  dossiersActifsCount: number;
  messagesNonLus: number;
};

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function fmtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function clientLabel(item: { clientNom?: string; clientPrenom?: string; titre?: string }): string {
  const n = `${item.clientNom || ''} ${item.clientPrenom || ''}`.trim();
  return n || item.titre || 'Anonyme';
}

function ago(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "a l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  return `il y a ${Math.floor(mins / 60)}h`;
}

// --- SUB-COMPONENTS ---

function TaskRow({ task }: { task: TaskItem }) {
  const late = task.dateEcheance ? daysAgo(task.dateEcheance) : null;
  const client = task.dossier ? clientLabel(task.dossier) : null;
  return (
    <div className="px-4 py-2.5 border-b border-gray-50 last:border-0">
      <p className="text-sm font-medium text-gray-900 truncate">{task.titre || 'Sans titre'}</p>
      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
        {client && <span className="text-xs text-gray-500 truncate max-w-[180px]">{client}</span>}
        {late !== null && late > 0 ? (
          <span className="text-xs font-medium text-red-500">{late}j de retard</span>
        ) : task.dateEcheance ? (
          <span className="text-xs text-gray-400">{fmtDate(task.dateEcheance)}</span>
        ) : null}
      </div>
    </div>
  );
}

function StuckTaskRow({ task }: { task: TaskItem }) {
  const sinceMaj = task.updatedAt ? daysAgo(task.updatedAt) : null;
  const client = task.dossier ? clientLabel(task.dossier) : null;
  return (
    <div className="px-4 py-2.5 border-b border-gray-50 last:border-0">
      <p className="text-sm font-medium text-gray-900 truncate">{task.titre || 'Sans titre'}</p>
      <div className="flex items-center gap-3 mt-0.5">
        {client && <span className="text-xs text-gray-500">{client}</span>}
        {sinceMaj !== null && (
          <span className="text-xs font-medium text-amber-600">sans maj depuis {sinceMaj}j</span>
        )}
      </div>
    </div>
  );
}

function RdvRow({ rdv }: { rdv: RdvItem }) {
  const name = rdv.user
    ? `${rdv.user.firstName || ''} ${rdv.user.lastName || ''}`.trim()
    : rdv.clientNom || 'Client';
  return (
    <div className="px-4 py-2.5 border-b border-gray-50 last:border-0 flex items-start gap-3">
      <span className="text-xs font-mono text-orange-600 w-10 shrink-0 pt-0.5 tabular-nums">
        {fmtTime(rdv.date)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
        <p className="text-xs text-gray-400">{rdv.type || 'Rendez-vous'}</p>
      </div>
      {rdv.statut === 'en_attente' && (
        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded shrink-0">
          A confirmer
        </span>
      )}
    </div>
  );
}

function DossierRow({ dossier }: { dossier: DossierItem }) {
  const name = clientLabel(dossier);
  const inactive = dossier.updatedAt ? daysAgo(dossier.updatedAt) : null;
  return (
    <div className="px-4 py-2.5 border-b border-gray-50 last:border-0">
      <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
      <div className="flex items-center gap-3 mt-0.5">
        {dossier.statut && (
          <span className="text-xs text-gray-400 capitalize">
            {dossier.statut.replace(/_/g, ' ')}
          </span>
        )}
        {inactive !== null && (
          <span className="text-xs font-medium text-amber-600">{inactive}j sans activite</span>
        )}
      </div>
    </div>
  );
}

function SectionCard({
  title, icon, accentClass, badgeClass, items, maxShow = 7, viewAllHref, renderItem,
}: {
  title: string;
  icon: string;
  accentClass: string;
  badgeClass: string;
  items: TaskItem[] | RdvItem[] | DossierItem[];
  maxShow?: number;
  viewAllHref?: string;
  renderItem: (item: any) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, maxShow);
  const extra = items.length - maxShow;
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 ${accentClass} overflow-hidden`}>
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none" aria-hidden="true">{icon}</span>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
          {items.length}
        </span>
      </div>
      <div>
        {shown.map((item) => renderItem(item))}
      </div>
      {(extra > 0 || viewAllHref) && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          {extra > 0 && (
            <span className="text-xs text-gray-500">+{extra} autres</span>
          )}
          {viewAllHref && (
            <Link href={viewAllHref} className="text-xs text-orange-600 hover:text-orange-700 font-medium ml-auto">
              Voir tout
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-12 bg-gray-100 border-b border-gray-100" />
      <div className="p-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3.5 bg-gray-100 rounded w-4/5" />
            <div className="h-3 bg-gray-50 rounded w-2/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- PAGE ---

export default function AdminAssistantPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<AssistantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    else if (session) {
      const role = (session.user as any)?.role;
      if (role !== 'admin' && role !== 'superadmin') router.push('/client');
    }
  }, [session, status, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await assistantAPI.getContext();
      setData(res.data.data as AssistantData);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Erreur reseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || fetchedRef.current) return;
    const role = (session?.user as any)?.role;
    if (role !== 'admin' && role !== 'superadmin') return;
    fetchedRef.current = true;
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [status, session, fetchData]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
      </div>
    );
  }

  const now = new Date();
  const dateLabel = now.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const totalAlertes = data
    ? data.tachesUrgentes.length + data.tachesEnRetard.length
    : 0;

  const allClear = data !== null
    && totalAlertes === 0
    && data.rdvAujourdhui.length === 0
    && data.messagesNonLus === 0
    && data.tachesAujourdhui.length === 0;

  return (
    <div className="min-h-screen bg-gray-50/40">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Assistant</h1>
            <p className="text-sm text-gray-500 capitalize">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastRefresh && (
              <span className="text-xs text-gray-400 hidden sm:block">
                {ago(lastRefresh)}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              <svg
                className={loading ? 'animate-spin' : ''}
                width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"
              >
                <path d="M7.5 1a6.5 6.5 0 1 0 6.5 6.5h-1a5.5 5.5 0 1 1-5.5-5.5V4L10 1.5 7.5 0V1Z" fill="currentColor" />
              </svg>
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Alert banner */}
      {totalAlertes > 0 && !loading && (
        <div className="bg-red-50 border-b border-red-100 px-4 sm:px-6 py-2.5">
          <p className="text-sm font-medium text-red-700">
            {totalAlertes} alerte{totalAlertes > 1 ? 's' : ''} critique{totalAlertes > 1 ? 's' : ''} necessite{totalAlertes > 1 ? 'nt' : ''} votre attention
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-b border-red-100 px-4 sm:px-6 py-2.5">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="px-4 sm:px-6 py-5">
        {loading && !data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : data ? (
          <>
            {/* All clear state */}
            {allClear && (
              <div className="mb-5 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-green-500 shrink-0">
                  <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.5-9.5-4 4-2-2 1-1 1 1 3-3 1 1Z" fill="currentColor" />
                </svg>
                <p className="text-sm font-medium text-green-700">
                  Aucune alerte critique. Tout est en ordre.
                </p>
              </div>
            )}

            {/* Main grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SectionCard
                title="Urgentes"
                icon="🔴"
                accentClass="border-l-red-500"
                badgeClass="bg-red-100 text-red-700"
                items={data.tachesUrgentes}
                viewAllHref="/admin/taches"
                renderItem={(t: TaskItem) => <TaskRow key={t._id} task={t} />}
              />
              <SectionCard
                title="RDV aujourd'hui"
                icon="📅"
                accentClass="border-l-blue-500"
                badgeClass="bg-blue-100 text-blue-700"
                items={data.rdvAujourdhui}
                viewAllHref="/admin/rendez-vous"
                renderItem={(r: RdvItem) => <RdvRow key={r._id} rdv={r} />}
              />
              <SectionCard
                title="En retard"
                icon="🟠"
                accentClass="border-l-orange-500"
                badgeClass="bg-orange-100 text-orange-700"
                items={data.tachesEnRetard}
                viewAllHref="/admin/taches"
                renderItem={(t: TaskItem) => <TaskRow key={t._id} task={t} />}
              />
              <SectionCard
                title="Dossiers inactifs (7j+)"
                icon="📁"
                accentClass="border-l-gray-400"
                badgeClass="bg-gray-100 text-gray-700"
                items={data.dossiersInactifs}
                viewAllHref="/admin/dossiers"
                renderItem={(d: DossierItem) => <DossierRow key={d._id} dossier={d} />}
              />
              <SectionCard
                title="A faire aujourd'hui"
                icon="📋"
                accentClass="border-l-amber-500"
                badgeClass="bg-amber-100 text-amber-700"
                items={data.tachesAujourdhui}
                viewAllHref="/admin/taches"
                renderItem={(t: TaskItem) => <TaskRow key={t._id} task={t} />}
              />
              <SectionCard
                title="RDV demain"
                icon="🗓"
                accentClass="border-l-indigo-400"
                badgeClass="bg-indigo-100 text-indigo-700"
                items={data.rdvDemain}
                viewAllHref="/admin/rendez-vous"
                renderItem={(r: RdvItem) => <RdvRow key={r._id} rdv={r} />}
              />
              <SectionCard
                title="En suspens (48h+)"
                icon="⏸"
                accentClass="border-l-yellow-500"
                badgeClass="bg-yellow-100 text-yellow-700"
                items={data.tachesEnCoursSansMaj}
                viewAllHref="/admin/taches"
                renderItem={(t: TaskItem) => <StuckTaskRow key={t._id} task={t} />}
              />
              <SectionCard
                title="RDV a confirmer"
                icon="⏳"
                accentClass="border-l-purple-400"
                badgeClass="bg-purple-100 text-purple-700"
                items={data.rdvEnAttente}
                viewAllHref="/admin/rendez-vous"
                renderItem={(r: RdvItem) => <RdvRow key={r._id} rdv={r} />}
              />
            </div>

            {/* Full-width rows */}
            <div className="mt-4 space-y-3">
              {data.messagesNonLus > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-violet-500 px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-base shrink-0" aria-hidden="true">✉️</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">Messages non lus</p>
                      <p className="text-xs text-gray-500">
                        {data.messagesNonLus} message{data.messagesNonLus > 1 ? 's' : ''} en attente
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/admin/messages"
                    className="text-sm font-medium text-violet-600 hover:text-violet-700 shrink-0"
                  >
                    Voir les messages
                  </Link>
                </div>
              )}

              {data.tachesTermineesAujourdhui.length > 0 && (
                <SectionCard
                  title="Terminees aujourd'hui"
                  icon="✅"
                  accentClass="border-l-green-500"
                  badgeClass="bg-green-100 text-green-700"
                  items={data.tachesTermineesAujourdhui}
                  viewAllHref="/admin/taches"
                  renderItem={(t: TaskItem) => <TaskRow key={t._id} task={t} />}
                />
              )}
            </div>

            {/* Footer */}
            <p className="mt-6 text-center text-xs text-gray-400">
              {data.dossiersActifsCount} dossiers actifs
              {lastRefresh && ` · Actualise ${ago(lastRefresh)}`}
              {' · '}Rafraichissement automatique toutes les 5 min
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

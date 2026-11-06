'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { assistantAPI, tasksAPI, appointmentsAPI } from '@/lib/api';

type Toast = { id: number; msg: string; type: 'success' | 'error' };

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

// --- COMPACT ROWS ---

function DismissBtn({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDismiss(); }}
      title="Masquer aujourd'hui"
      className="shrink-0 w-4 h-4 flex items-center justify-center opacity-20 hover:opacity-70 transition-opacity ml-0.5"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
        <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function CheckBtn({ pending, onDone }: { pending: boolean; onDone: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDone(); }}
      disabled={pending}
      title="Marquer comme termine"
      className="shrink-0 w-5 h-5 rounded-full border border-gray-200 hover:border-green-400 hover:bg-green-50 flex items-center justify-center transition-colors disabled:opacity-30 ml-1"
    >
      {pending ? (
        <div className="w-2.5 h-2.5 border border-gray-300 border-t-green-500 rounded-full animate-spin" />
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2 5l2.5 2.5L8 3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function TaskRow({ task, onDone, pendingIds, onDismiss }: {
  task: TaskItem;
  onDone?: (id: string) => void;
  pendingIds?: Set<string>;
  onDismiss?: () => void;
}) {
  const late = task.dateEcheance ? daysAgo(task.dateEcheance) : null;
  const isLate = late !== null && late > 0 && task.statut !== 'termine';
  const client = task.dossier ? clientLabel(task.dossier) : null;
  const isDone = task.statut === 'termine';
  const pending = pendingIds?.has(task._id) ?? false;
  return (
    <div className="px-3 py-2 border-b border-gray-50 last:border-0 flex items-center gap-1 group">
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-medium truncate leading-snug ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {task.titre || 'Sans titre'}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {client && <span className="text-[10px] text-gray-400 truncate max-w-[130px]">{client}</span>}
          {isLate ? (
            <span className="text-[10px] font-semibold text-red-500 shrink-0">{late}j de retard</span>
          ) : task.dateEcheance ? (
            <span className="text-[10px] text-gray-400">{fmtDate(task.dateEcheance)}</span>
          ) : null}
        </div>
      </div>
      {onDone && !isDone && (
        <CheckBtn pending={pending} onDone={() => onDone(task._id)} />
      )}
      {onDismiss && <DismissBtn onDismiss={onDismiss} />}
    </div>
  );
}

function StuckRow({ task, onDone, pendingIds, onDismiss }: {
  task: TaskItem;
  onDone?: (id: string) => void;
  pendingIds?: Set<string>;
  onDismiss?: () => void;
}) {
  const since = task.updatedAt ? daysAgo(task.updatedAt) : null;
  const client = task.dossier ? clientLabel(task.dossier) : null;
  const pending = pendingIds?.has(task._id) ?? false;
  return (
    <div className="px-3 py-2 border-b border-gray-50 last:border-0 flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-900 truncate leading-snug">{task.titre || 'Sans titre'}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {client && <span className="text-[10px] text-gray-400">{client}</span>}
          {since !== null && <span className="text-[10px] font-semibold text-amber-600">{since}j sans maj</span>}
        </div>
      </div>
      {onDone && (
        <CheckBtn pending={pending} onDone={() => onDone(task._id)} />
      )}
      {onDismiss && <DismissBtn onDismiss={onDismiss} />}
    </div>
  );
}

function RdvRow({ rdv, onConfirm, pendingIds, onDismiss }: {
  rdv: RdvItem;
  onConfirm?: (id: string) => void;
  pendingIds?: Set<string>;
  onDismiss?: () => void;
}) {
  const name = rdv.user
    ? `${rdv.user.firstName || ''} ${rdv.user.lastName || ''}`.trim()
    : rdv.clientNom || 'Client';
  const pending = pendingIds?.has(rdv._id) ?? false;
  const isEnAttente = rdv.statut === 'en_attente';
  return (
    <div className="px-3 py-2 border-b border-gray-50 last:border-0 flex items-start gap-2">
      <span className="text-[10px] font-mono text-orange-500 w-9 shrink-0 pt-px tabular-nums">{fmtTime(rdv.date)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-900 truncate leading-snug">{name}</p>
        <p className="text-[10px] text-gray-400">{rdv.type || 'Rendez-vous'}</p>
      </div>
      {isEnAttente && onConfirm ? (
        <button
          onClick={() => onConfirm(rdv._id)}
          disabled={pending}
          className="text-[10px] bg-amber-50 hover:bg-green-50 text-amber-700 hover:text-green-700 border border-amber-200 hover:border-green-300 px-1.5 py-0.5 rounded shrink-0 transition-colors disabled:opacity-40 font-medium"
        >
          {pending ? '...' : 'Confirmer'}
        </button>
      ) : isEnAttente ? (
        <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded shrink-0">
          A confirmer
        </span>
      ) : null}
      {onDismiss && <DismissBtn onDismiss={onDismiss} />}
    </div>
  );
}

function DossierRow({ dossier, onDismiss }: { dossier: DossierItem; onDismiss?: () => void }) {
  const name = clientLabel(dossier);
  const inactive = dossier.updatedAt ? daysAgo(dossier.updatedAt) : null;
  const href = dossier._id ? `/admin/dossiers/${dossier._id}` : '/admin/dossiers';
  return (
    <div className="border-b border-gray-50 last:border-0 flex items-center group">
      <Link href={href} className="px-3 py-2 flex items-center gap-2 hover:bg-gray-50/50 transition-colors min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-900 group-hover:text-orange-600 truncate leading-snug transition-colors">{name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {dossier.statut && (
              <span className="text-[10px] text-gray-400 capitalize">{dossier.statut.replace(/_/g, ' ')}</span>
            )}
            {inactive !== null && (
              <span className="text-[10px] font-semibold text-amber-600">{inactive}j</span>
            )}
          </div>
        </div>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <path d="M3 2l4 3-4 3" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      {onDismiss && (
        <div className="pr-2">
          <DismissBtn onDismiss={onDismiss} />
        </div>
      )}
    </div>
  );
}

// --- CARD SECTION ---

type CardProps = {
  title: string;
  dot: string;
  badgeBg: string;
  badgeText: string;
  items: any[];
  maxShow?: number;
  viewAllHref?: string;
  renderItem: (item: any) => React.ReactNode;
};

function CardSection({ title, dot, badgeBg, badgeText, items, maxShow = 6, viewAllHref, renderItem }: CardProps) {
  if (items.length === 0) return null;
  const shown = items.slice(0, maxShow);
  const extra = items.length - maxShow;
  return (
    <div className="bg-white flex flex-col">
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden="true" />
          <span className="text-xs font-semibold text-gray-800 truncate">{title}</span>
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${badgeBg} ${badgeText}`}>
          {items.length}
        </span>
      </div>
      <div>{shown.map((item) => renderItem(item))}</div>
      {(extra > 0 || viewAllHref) && (
        <div className="px-3 py-1.5 bg-gray-50/70 mt-auto border-t border-gray-50">
          {extra > 0 && <span className="text-[11px] text-gray-400">+{extra} autres </span>}
          {viewAllHref && (
            <Link href={viewAllHref} className="text-[11px] text-orange-500 hover:text-orange-600">
              Voir tout →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// --- SKELETON ---

function Skeleton() {
  return (
    <div className="bg-gray-100 rounded-xl overflow-hidden animate-pulse">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-px">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white py-3 px-3 text-center">
            <div className="h-5 bg-gray-100 rounded w-7 mx-auto mb-1" />
            <div className="h-2.5 bg-gray-50 rounded w-12 mx-auto" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px mt-px">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white p-3 space-y-2.5">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
              <div className="w-2 h-2 rounded-full bg-gray-100" />
              <div className="h-3 bg-gray-100 rounded w-20" />
            </div>
            {[0, 1, 2].map((j) => (
              <div key={j} className="space-y-1.5">
                <div className="h-3 bg-gray-100 rounded w-4/5" />
                <div className="h-2.5 bg-gray-50 rounded w-2/5" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- TOASTS ---

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <>
      <style>{`
        @keyframes _tin{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
        ._ta{animation:_tin 0.18s ease-out}
      `}</style>
      <div
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`_ta flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border ${
              t.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {t.type === 'success' ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
            {t.msg}
          </div>
        ))}
      </div>
    </>
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
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const fetchedRef = useRef(false);

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const stored = localStorage.getItem(`assistant_dismissed_${today}`);
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });

  const dismissItem = useCallback((id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev).add(id);
      try {
        const today = new Date().toISOString().slice(0, 10);
        localStorage.setItem(`assistant_dismissed_${today}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  const resetDismissed = useCallback(() => {
    setDismissedIds(new Set());
    try {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.removeItem(`assistant_dismissed_${today}`);
    } catch {}
  }, []);

  const addToast = useCallback((msg: string, type: Toast['type'] = 'success') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

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

  const handleMarkTaskDone = useCallback(async (taskId: string) => {
    if (!data) return;
    const originalTask = [
      ...data.tachesEnRetard, ...data.tachesUrgentes, ...data.tachesAujourdhui,
      ...data.tachesEnCoursSansMaj,
    ].find(t => t._id === taskId);
    setPendingIds(prev => new Set(prev).add(taskId));
    setData(prev => {
      if (!prev) return prev;
      const done = originalTask ? { ...originalTask, statut: 'termine', updatedAt: new Date().toISOString() } : null;
      return {
        ...prev,
        tachesEnRetard: prev.tachesEnRetard.filter(t => t._id !== taskId),
        tachesUrgentes: prev.tachesUrgentes.filter(t => t._id !== taskId),
        tachesAujourdhui: prev.tachesAujourdhui.filter(t => t._id !== taskId),
        tachesEnCoursSansMaj: prev.tachesEnCoursSansMaj.filter(t => t._id !== taskId),
        tachesTermineesAujourdhui: done
          ? [done, ...prev.tachesTermineesAujourdhui]
          : prev.tachesTermineesAujourdhui,
      };
    });
    addToast('Tache marquee comme terminee');
    try {
      await tasksAPI.updateTask(taskId, { effectue: true, statut: 'termine' });
    } catch {
      addToast('Erreur. La tache n\'a pas ete mise a jour.', 'error');
      fetchData();
    } finally {
      setPendingIds(prev => { const s = new Set(prev); s.delete(taskId); return s; });
    }
  }, [data, fetchData, addToast]);

  const handleConfirmRdv = useCallback(async (rdvId: string) => {
    setPendingIds(prev => new Set(prev).add(rdvId));
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        rdvEnAttente: prev.rdvEnAttente.filter(r => r._id !== rdvId),
        rdvAujourdhui: prev.rdvAujourdhui.map(r => r._id === rdvId ? { ...r, statut: 'confirme' } : r),
        rdvDemain: prev.rdvDemain.map(r => r._id === rdvId ? { ...r, statut: 'confirme' } : r),
      };
    });
    addToast('RDV confirme');
    try {
      await appointmentsAPI.updateAppointment(rdvId, { statut: 'confirme' });
    } catch {
      addToast('Erreur. Le RDV n\'a pas ete confirme.', 'error');
      fetchData();
    } finally {
      setPendingIds(prev => { const s = new Set(prev); s.delete(rdvId); return s; });
    }
  }, [fetchData, addToast]);

  useEffect(() => {
    if (status !== 'authenticated' || fetchedRef.current) return;
    const role = (session?.user as any)?.role;
    if (role !== 'admin' && role !== 'superadmin') return;
    fetchedRef.current = true;
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [status, session, fetchData]);

  const filteredData = useMemo(() => {
    if (!data) return null;
    const f = <T extends { _id: string }>(arr: T[]) => arr.filter(item => !dismissedIds.has(item._id));
    return {
      ...data,
      tachesEnRetard: f(data.tachesEnRetard),
      tachesUrgentes: f(data.tachesUrgentes),
      tachesAujourdhui: f(data.tachesAujourdhui),
      tachesEnCoursSansMaj: f(data.tachesEnCoursSansMaj),
      tachesTermineesAujourdhui: f(data.tachesTermineesAujourdhui),
      rdvAujourdhui: f(data.rdvAujourdhui),
      rdvDemain: f(data.rdvDemain),
      rdvEnAttente: f(data.rdvEnAttente),
      dossiersInactifs: f(data.dossiersInactifs),
    };
  }, [data, dismissedIds]);

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

  const totalAlertes = filteredData ? filteredData.tachesUrgentes.length + filteredData.tachesEnRetard.length : 0;

  const statStrip = filteredData
    ? [
        { n: filteredData.tachesEnRetard.length, label: "En retard", cls: filteredData.tachesEnRetard.length > 0 ? "text-red-600" : "text-gray-300" },
        { n: filteredData.tachesUrgentes.length, label: "Urgentes", cls: filteredData.tachesUrgentes.length > 0 ? "text-orange-600" : "text-gray-300" },
        { n: filteredData.tachesAujourdhui.length, label: "Aujourd'hui", cls: filteredData.tachesAujourdhui.length > 0 ? "text-amber-600" : "text-gray-300" },
        { n: filteredData.rdvAujourdhui.length, label: "RDV auj.", cls: filteredData.rdvAujourdhui.length > 0 ? "text-blue-600" : "text-gray-300" },
        { n: filteredData.dossiersInactifs.length, label: "Inactifs", cls: filteredData.dossiersInactifs.length > 0 ? "text-gray-600" : "text-gray-300" },
        { n: data!.messagesNonLus, label: "Messages", cls: data!.messagesNonLus > 0 ? "text-purple-600" : "text-gray-300" },
      ]
    : [];

  const hasCards = filteredData && [
    filteredData.tachesEnRetard, filteredData.tachesUrgentes, filteredData.dossiersInactifs,
    filteredData.tachesAujourdhui, filteredData.rdvAujourdhui, filteredData.rdvDemain,
    filteredData.tachesEnCoursSansMaj, filteredData.rdvEnAttente, filteredData.tachesTermineesAujourdhui,
  ].some((arr) => arr.length > 0);

  return (
    <div className="min-h-screen bg-white relative">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Assistant</h1>
            <p className="text-sm text-gray-400 capitalize">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastRefresh && (
              <span className="text-xs text-gray-400 hidden sm:block">{ago(lastRefresh)}</span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              <svg
                className={loading ? 'animate-spin' : ''}
                width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"
              >
                <path d="M7.5 1a6.5 6.5 0 1 0 6.5 6.5h-1a5.5 5.5 0 1 1-5.5-5.5V4L10 1.5 7.5 0V1Z" fill="currentColor" />
              </svg>
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Alert strip */}
      {totalAlertes > 0 && !loading && (
        <div className="bg-red-50 border-b border-red-100 px-4 sm:px-6 py-2">
          <p className="text-xs font-medium text-red-700">
            {totalAlertes} alerte{totalAlertes > 1 ? 's' : ''} critique{totalAlertes > 1 ? 's' : ''} necessite{totalAlertes > 1 ? 'nt' : ''} votre attention
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-b border-red-100 px-4 sm:px-6 py-2">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="px-4 sm:px-6 py-5">
        {loading && !data ? (
          <Skeleton />
        ) : filteredData ? (
          <div className="bg-gray-100 rounded-xl overflow-hidden">

            {/* Stats strip */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-px">
              {statStrip.map((s) => (
                <div key={s.label} className="bg-white py-3 px-2 text-center">
                  <div className={`text-lg font-semibold leading-none tabular-nums ${s.cls}`}>{s.n}</div>
                  <div className="text-[10px] text-gray-400 mt-1 leading-tight">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Cards grid */}
            {hasCards ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px mt-px">
                <CardSection
                  title="En retard"
                  dot="bg-orange-500"
                  badgeBg="bg-orange-50"
                  badgeText="text-orange-700"
                  items={filteredData.tachesEnRetard}
                  viewAllHref="/admin/taches"
                  renderItem={(t: TaskItem) => <TaskRow key={t._id} task={t} onDone={handleMarkTaskDone} pendingIds={pendingIds} onDismiss={() => dismissItem(t._id)} />}
                />
                <CardSection
                  title="Urgentes"
                  dot="bg-red-500"
                  badgeBg="bg-red-50"
                  badgeText="text-red-700"
                  items={filteredData.tachesUrgentes}
                  viewAllHref="/admin/taches"
                  renderItem={(t: TaskItem) => <TaskRow key={t._id} task={t} onDone={handleMarkTaskDone} pendingIds={pendingIds} onDismiss={() => dismissItem(t._id)} />}
                />
                <CardSection
                  title="Dossiers inactifs (7j+)"
                  dot="bg-gray-400"
                  badgeBg="bg-gray-100"
                  badgeText="text-gray-600"
                  items={filteredData.dossiersInactifs}
                  viewAllHref="/admin/dossiers"
                  renderItem={(d: DossierItem) => <DossierRow key={d._id} dossier={d} onDismiss={() => dismissItem(d._id)} />}
                />
                <CardSection
                  title="A faire aujourd'hui"
                  dot="bg-amber-500"
                  badgeBg="bg-amber-50"
                  badgeText="text-amber-700"
                  items={filteredData.tachesAujourdhui}
                  viewAllHref="/admin/taches"
                  renderItem={(t: TaskItem) => <TaskRow key={t._id} task={t} onDone={handleMarkTaskDone} pendingIds={pendingIds} onDismiss={() => dismissItem(t._id)} />}
                />
                <CardSection
                  title="RDV aujourd'hui"
                  dot="bg-blue-500"
                  badgeBg="bg-blue-50"
                  badgeText="text-blue-700"
                  items={filteredData.rdvAujourdhui}
                  viewAllHref="/admin/rendez-vous"
                  renderItem={(r: RdvItem) => <RdvRow key={r._id} rdv={r} onDismiss={() => dismissItem(r._id)} />}
                />
                <CardSection
                  title="RDV demain"
                  dot="bg-indigo-400"
                  badgeBg="bg-indigo-50"
                  badgeText="text-indigo-700"
                  items={filteredData.rdvDemain}
                  viewAllHref="/admin/rendez-vous"
                  renderItem={(r: RdvItem) => <RdvRow key={r._id} rdv={r} onDismiss={() => dismissItem(r._id)} />}
                />
                <CardSection
                  title="En suspens (48h+)"
                  dot="bg-yellow-400"
                  badgeBg="bg-yellow-50"
                  badgeText="text-yellow-700"
                  items={filteredData.tachesEnCoursSansMaj}
                  viewAllHref="/admin/taches"
                  renderItem={(t: TaskItem) => <StuckRow key={t._id} task={t} onDone={handleMarkTaskDone} pendingIds={pendingIds} onDismiss={() => dismissItem(t._id)} />}
                />
                <CardSection
                  title="RDV a confirmer"
                  dot="bg-purple-400"
                  badgeBg="bg-purple-50"
                  badgeText="text-purple-700"
                  items={filteredData.rdvEnAttente}
                  viewAllHref="/admin/rendez-vous"
                  renderItem={(r: RdvItem) => <RdvRow key={r._id} rdv={r} onConfirm={handleConfirmRdv} pendingIds={pendingIds} onDismiss={() => dismissItem(r._id)} />}
                />
                <CardSection
                  title="Terminees aujourd'hui"
                  dot="bg-green-500"
                  badgeBg="bg-green-50"
                  badgeText="text-green-700"
                  items={filteredData.tachesTermineesAujourdhui}
                  viewAllHref="/admin/taches"
                  renderItem={(t: TaskItem) => <TaskRow key={t._id} task={t} />}
                />
              </div>
            ) : (
              <div className="bg-white mt-px px-4 py-10 text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-50 mb-3">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.5-9.5-4 4-2-2 1-1 1 1 3-3 1 1Z" fill="#22c55e" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700">Tout est en ordre</p>
                <p className="text-xs text-gray-400 mt-1">Aucune alerte critique pour le moment.</p>
              </div>
            )}

            {/* Footer row */}
            <div className="bg-white mt-px px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
              <span className="text-xs text-gray-400">
                {data!.dossiersActifsCount} dossiers actifs
                {lastRefresh && ` · ${ago(lastRefresh)}`}
                {' · auto 5 min'}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                {dismissedIds.size > 0 && (
                  <button
                    onClick={resetDismissed}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Reinitialiser ({dismissedIds.size})
                  </button>
                )}
                {data!.messagesNonLus > 0 && (
                  <Link href="/admin/messages" className="text-xs font-medium text-purple-600 hover:text-purple-700">
                    {data!.messagesNonLus} message{data!.messagesNonLus > 1 ? 's' : ''} non lu{data!.messagesNonLus > 1 ? 's' : ''} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  );
}

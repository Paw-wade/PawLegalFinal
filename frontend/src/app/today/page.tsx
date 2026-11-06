'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { tasksAPI } from '@/lib/api';

type Task = {
  _id: string;
  titre: string;
  priorite?: string;
  statut?: string;
  dateEcheance?: string;
  dossier?: { _id?: string; clientNom?: string; clientPrenom?: string; titre?: string };
  assignedTo?: { _id?: string; firstName?: string; lastName?: string }[];
};

function fmtDay(d: string) {
  const date = new Date(d);
  const today = new Date(); today.setHours(0,0,0,0);
  const dd = new Date(d); dd.setHours(0,0,0,0);
  const diff = Math.round((dd.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}j de retard`, red: true };
  if (diff === 0) return { label: "aujourd'hui", red: false };
  return { label: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), red: false };
}

function clientLabel(t: Task) {
  if (!t.dossier) return null;
  const n = `${t.dossier.clientNom || ''} ${t.dossier.clientPrenom || ''}`.trim();
  return n || t.dossier.titre || null;
}

function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "a l'instant";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h`;
}

function TaskRow({
  task,
  pending,
  onDone,
  onEdit,
}: {
  task: Task;
  pending: boolean;
  onDone: (id: string) => void;
  onEdit: (task: Task) => void;
}) {
  const date = task.dateEcheance ? fmtDay(task.dateEcheance) : null;
  const client = clientLabel(task);
  const isUrgent = task.priorite === 'urgente';
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
      <button
        onClick={() => onDone(task._id)}
        disabled={pending}
        aria-label="Marquer comme terminee"
        className="shrink-0 w-6 h-6 rounded-full border-2 border-gray-200 hover:border-orange-400 active:bg-orange-50 flex items-center justify-center transition-colors disabled:opacity-30"
      >
        {pending && (
          <div className="w-3 h-3 border border-gray-300 border-t-orange-500 rounded-full animate-spin" />
        )}
      </button>
      <button
        onClick={() => onEdit(task)}
        className="min-w-0 flex-1 text-left"
        aria-label="Modifier la tache"
      >
        <p className={`text-sm font-medium truncate leading-snug ${isUrgent ? 'text-red-700' : 'text-gray-900'}`}>
          {isUrgent && <span className="text-[10px] font-bold text-red-500 mr-1 uppercase tracking-wide">Urgent</span>}
          {task.titre}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {client && <span className="text-[11px] text-gray-400 truncate max-w-[140px]">{client}</span>}
          {date && (
            <span className={`text-[11px] font-semibold shrink-0 ${date.red ? 'text-red-500' : 'text-gray-400'}`}>
              {date.label}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function EditRow({
  task,
  onSave,
  onCancel,
}: {
  task: Task;
  onSave: (id: string, titre: string, date: string) => void;
  onCancel: () => void;
}) {
  const [titre, setTitre] = useState(task.titre);
  const [date, setDate] = useState(task.dateEcheance ? task.dateEcheance.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="px-4 py-3 border-b border-orange-100 bg-orange-50/30">
      <input
        ref={inputRef}
        type="text"
        value={titre}
        onChange={e => setTitre(e.target.value)}
        className="w-full text-sm text-gray-800 bg-white border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400 transition-colors"
        onKeyDown={e => { if (e.key === 'Enter') onSave(task._id, titre, date); if (e.key === 'Escape') onCancel(); }}
      />
      <div className="flex items-center gap-2 mt-2">
        <label className="text-[11px] text-gray-400 shrink-0">Date :</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-xs text-gray-700 bg-white border border-orange-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400 transition-colors"
        />
        <div className="ml-auto flex gap-2">
          <button
            onClick={onCancel}
            className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(task._id, titre, date)}
            disabled={!titre.trim()}
            className="text-[11px] font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 px-3 py-1 rounded-lg transition-colors"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function InstallBanner({ onInstall, onDismiss }: { onInstall: () => void; onDismiss: () => void }) {
  return (
    <div className="mx-4 mb-3 p-3 bg-orange-50 border border-orange-100 rounded-xl flex items-center gap-3">
      <div className="shrink-0 w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 1v10M5 7l4 4 4-4M2 13v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800">Installer sur l'ecran d'accueil</p>
        <p className="text-[11px] text-gray-500">Acces rapide, fonctionne comme une app</p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={onInstall} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 px-2 py-1 rounded-lg">
          Installer
        </button>
        <button onClick={onDismiss} className="text-[11px] text-gray-400 text-center">
          Ignorer
        </button>
      </div>
    </div>
  );
}

export default function TodayPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formExpanded, setFormExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auth guard
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin?callbackUrl=/today');
  }, [status, router]);

  // Listen for PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      try {
        const dismissed = localStorage.getItem('today_install_dismissed');
        if (!dismissed) setShowInstall(true);
      } catch {}
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tasksAPI.getMyTasks();
      const rawData = res.data?.data ?? res.data?.tasks ?? res.data;
      const all: Task[] = Array.isArray(rawData) ? rawData : [];
      const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);

      const filtered = all.filter((t) => {
        if (t.statut === 'termine' || t.statut === 'annule') return false;
        if (t.priorite === 'urgente' && !t.dateEcheance) return true;
        if (!t.dateEcheance) return false;
        return new Date(t.dateEcheance) <= endOfDay;
      });

      filtered.sort((a, b) => {
        const da = a.dateEcheance ? new Date(a.dateEcheance).getTime() : Infinity;
        const db = b.dateEcheance ? new Date(b.dateEcheance).getTime() : Infinity;
        return da - db;
      });

      setTasks(filtered);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchTasks();
    const iv = setInterval(fetchTasks, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [status, fetchTasks]);

  const handleDone = useCallback(async (taskId: string) => {
    setPendingIds(prev => new Set(prev).add(taskId));
    setTasks(prev => {
      const task = prev.find(t => t._id === taskId);
      if (task) setDoneTasks(d => [...d, task]);
      return prev.filter(t => t._id !== taskId);
    });
    try {
      await tasksAPI.updateTask(taskId, { effectue: true, statut: 'termine' });
    } catch {
      setDoneTasks(prev => prev.filter(t => t._id !== taskId));
      fetchTasks();
    } finally {
      setPendingIds(prev => { const s = new Set(prev); s.delete(taskId); return s; });
    }
  }, [fetchTasks]);

  const handleSaveEdit = useCallback(async (taskId: string, titre: string, date: string) => {
    const dueDate = new Date(date); dueDate.setHours(23, 59, 59, 999);
    setTasks(prev => prev.map(t => t._id === taskId ? { ...t, titre, dateEcheance: dueDate.toISOString() } : t));
    setEditingId(null);
    try {
      await tasksAPI.updateTask(taskId, { titre, dateEcheance: dueDate.toISOString() });
    } catch {
      fetchTasks();
    }
  }, [fetchTasks]);

  const handleAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const userId = (session?.user as any)?.id;
    if (!userId) return;

    const dueDate = new Date(newDate);
    dueDate.setHours(23, 59, 59, 999);

    const optimisticId = `tmp_${Date.now()}`;
    const optimistic: Task = {
      _id: optimisticId,
      titre: title,
      statut: 'en_cours',
      priorite: 'normale',
      dateEcheance: dueDate.toISOString(),
    };

    setTasks(prev => [...prev, optimistic]);
    setNewTitle('');
    setNewDate(new Date().toISOString().slice(0, 10));
    setFormExpanded(false);

    try {
      const res = await tasksAPI.createTask({
        titre: title,
        statut: 'en_cours',
        priorite: 'normale',
        assignedTo: userId,
        dateEcheance: dueDate.toISOString(),
      });
      const created: Task = res.data.data || res.data;
      if (created?._id) {
        setTasks(prev => prev.map(t => t._id === optimisticId ? { ...optimistic, _id: created._id } : t));
      }
    } catch {
      setTasks(prev => prev.filter(t => t._id !== optimisticId));
      setNewTitle(title);
    } finally {
      setAdding(false);
    }
  }, [newTitle, session]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstall(false);
  };

  const dismissInstall = () => {
    setShowInstall(false);
    try { localStorage.setItem('today_install_dismissed', '1'); } catch {}
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
      </div>
    );
  }

  const today = new Date();
  const dateLabel = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const overdue = tasks.filter(t => t.dateEcheance && new Date(t.dateEcheance) < new Date(today.setHours(0,0,0,0)));
  const todayTasks = tasks.filter(t => !t.dateEcheance || new Date(t.dateEcheance) >= new Date(new Date().setHours(0,0,0,0)));

  return (
    <div className="flex flex-col h-dvh bg-white max-w-lg mx-auto select-none">

      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 pt-safe-top pb-3 flex items-center justify-between gap-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}>
        <div>
          <div className="flex items-center gap-2">
            <img src="/ada-papers-feuillet.png" alt="Ada Papers" className="w-12 h-12 object-contain shrink-0" />
            <h1 className="text-base font-semibold text-gray-900">Ma journee</h1>
          </div>
          <p className="text-xs text-gray-400 capitalize mt-0.5">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && !loading && (
            <span className="text-[11px] text-gray-300">{ago(lastRefresh)}</span>
          )}
          <button
            onClick={fetchTasks}
            disabled={loading}
            aria-label="Actualiser"
            className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-orange-500 hover:border-orange-200 transition-colors disabled:opacity-30"
          >
            <svg className={loading ? 'animate-spin' : ''} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7.5 1a6.5 6.5 0 1 0 6.5 6.5h-1a5.5 5.5 0 1 1-5.5-5.5V4L10 1.5 7.5 0V1Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {!loading && (tasks.length > 0 || doneTasks.length > 0) && (
        <div className="shrink-0 flex border-b border-gray-50">
          {overdue.length > 0 && (
            <div className="flex-1 py-2 text-center border-r border-gray-50">
              <div className="text-lg font-semibold text-red-500 leading-none">{overdue.length}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">En retard</div>
            </div>
          )}
          {todayTasks.length > 0 && (
            <div className="flex-1 py-2 text-center border-r border-gray-50">
              <div className="text-lg font-semibold text-orange-500 leading-none">{todayTasks.length}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Aujourd'hui</div>
            </div>
          )}
          {doneTasks.length > 0 && (
            <div className="flex-1 py-2 text-center">
              <div className="text-lg font-semibold text-green-500 leading-none">{doneTasks.length}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Effectuees</div>
            </div>
          )}
        </div>
      )}

      {/* Install banner */}
      {showInstall && (
        <div className="shrink-0 pt-3">
          <InstallBanner onInstall={handleInstall} onDismiss={dismissInstall} />
        </div>
      )}

      {/* iOS install hint (only shown in standalone-capable context) */}
      {!showInstall && !loading && (
        <IOSInstallHint />
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-orange-500" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full pb-20 text-center px-6">
            <p className="text-sm font-medium text-red-600">{error}</p>
            <button onClick={fetchTasks} className="mt-3 text-xs text-orange-500 underline">Reessayer</button>
          </div>
        ) : tasks.length === 0 && doneTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pb-20 text-center px-6">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                <path d="M5 13l5 5L21 7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700">Tout est fait !</p>
            <p className="text-sm text-gray-400 mt-1">Aucune tache en attente pour aujourd'hui.</p>
          </div>
        ) : (
          <div>
            {overdue.length > 0 && (
              <>
                <div className="px-4 py-2 flex items-center gap-2 bg-red-50/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" aria-hidden="true" />
                  <span className="text-[11px] font-semibold text-red-500 uppercase tracking-wide">En retard</span>
                </div>
                {overdue.map(t => editingId === t._id
                  ? <EditRow key={t._id} task={t} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} />
                  : <TaskRow key={t._id} task={t} pending={pendingIds.has(t._id)} onDone={handleDone} onEdit={t => setEditingId(t._id)} />
                )}
              </>
            )}
            {todayTasks.length > 0 && (
              <>
                {overdue.length > 0 && (
                  <div className="px-4 py-2 flex items-center gap-2 bg-orange-50/40">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" aria-hidden="true" />
                    <span className="text-[11px] font-semibold text-orange-500 uppercase tracking-wide">Aujourd'hui</span>
                  </div>
                )}
                {todayTasks.map(t => editingId === t._id
                  ? <EditRow key={t._id} task={t} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} />
                  : <TaskRow key={t._id} task={t} pending={pendingIds.has(t._id)} onDone={handleDone} onEdit={t => setEditingId(t._id)} />
                )}
              </>
            )}
            {doneTasks.length > 0 && (
              <>
                <div className="px-4 py-2 flex items-center gap-2 bg-green-50/40 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" aria-hidden="true" />
                  <span className="text-[11px] font-semibold text-green-600 uppercase tracking-wide">Effectuees</span>
                </div>
                {doneTasks.map(t => (
                  <div key={t._id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 opacity-50">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-green-100 border-2 border-green-300 flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                        <path d="M2 5l2.5 2.5L8 2.5" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-400 line-through truncate">{t.titre}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick-add form */}
      <form
        onSubmit={handleAdd}
        className="shrink-0 px-4 pt-3 border-t border-gray-100 bg-white"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onFocus={() => setFormExpanded(true)}
            placeholder="+ Ajouter une tache..."
            className="flex-1 min-w-0 text-sm text-gray-800 placeholder-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 focus:outline-none focus:border-orange-300 focus:bg-white transition-colors"
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || adding}
            aria-label="Ajouter"
            className="shrink-0 w-9 h-9 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-gray-100 disabled:text-gray-300 text-white flex items-center justify-center transition-colors"
          >
            {adding ? (
              <div className="w-4 h-4 border border-white/50 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
        {formExpanded && (
          <div className="flex items-center gap-2 mt-2 pb-1">
            <label className="text-[11px] text-gray-400 shrink-0">Date :</label>
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-300 focus:bg-white transition-colors"
            />
            <button
              type="button"
              onClick={() => { setFormExpanded(false); setNewTitle(''); setNewDate(new Date().toISOString().slice(0, 10)); }}
              className="ml-auto text-[11px] text-gray-400 hover:text-gray-600"
            >
              Annuler
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

// iOS doesn't support beforeinstallprompt — show a manual hint once
function IOSInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!isIOS || isStandalone) return;
    try {
      if (localStorage.getItem('today_ios_hint_shown')) return;
    } catch {}
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="mx-4 mt-3 mb-0 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0 mt-0.5" aria-hidden="true">
        <path d="M9 1v10M5 7l4 4 4-4" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="2" y="12" width="14" height="4" rx="2" fill="#3b82f6" fillOpacity=".15" stroke="#3b82f6" strokeWidth="1.3"/>
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-blue-800">Ajouter a l'ecran d'accueil</p>
        <p className="text-[11px] text-blue-600 mt-0.5">
          Appuyez sur <strong>Partager</strong> puis <strong>"Sur l'ecran d'accueil"</strong>
        </p>
      </div>
      <button
        onClick={() => {
          setShow(false);
          try { localStorage.setItem('today_ios_hint_shown', '1'); } catch {}
        }}
        className="text-[11px] text-blue-400 font-medium shrink-0"
      >
        OK
      </button>
    </div>
  );
}

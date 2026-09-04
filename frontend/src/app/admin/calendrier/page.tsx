'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isDossierStaffRole } from '@/lib/dossierAccess';
import { tasksAPI, getApiBaseUrl } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'rdv' | 'echeance_dossier' | 'expiration_titre' | 'tache' | 'dossier_cree';

interface CalEvent {
  id: string;
  type: EventType;
  date: string;
  heure: string | null;
  titre: string;
  details: string;
  couleur: string;
  lien: string | null;
  statut: string | null;
  urgence: boolean;
  priorite?: string;
}

// ─── Couleurs ─────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  red:    { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500' },
  amber:  { bg: 'bg-amber-100',  text: 'text-amber-800',  dot: 'bg-amber-500' },
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-500' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500' },
  green:  { bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500' },
};

const TYPE_LABEL: Record<EventType, string> = {
  rdv:              'RDV',
  echeance_dossier: 'Echeance',
  expiration_titre: 'Titre',
  tache:            'Tache',
  dossier_cree:     'Ouverture',
};

const TYPE_EMOJI: Record<EventType, string> = {
  rdv:              '📅',
  echeance_dossier: '⏰',
  expiration_titre: '🔴',
  tache:            '✅',
  dossier_cree:     '📁',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = (first.getDay() + 6) % 7; // Monday = 0
  const days: Date[] = [];
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(first);
    d.setDate(d.getDate() - i - 1);
    days.push(d);
  }
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1];
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    days.push(next);
  }
  return days;
}

function groupByDate(events: CalEvent[]) {
  const map: Record<string, CalEvent[]> = {};
  for (const e of events) {
    const key = isoDate(new Date(e.date));
    if (!map[key]) map[key] = [];
    map[key].push(e);
  }
  return map;
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function fetchEvents(start: Date, end: Date): Promise<CalEvent[]> {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('token') || '') : '';
  const url = `${getApiBaseUrl()}/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Erreur API calendrier (${res.status})`);
  const json = await res.json();
  return json.events || [];
}

// Normalise les liens backend selon le type (resilient aux anciennes URL)
function resolveEventLink(event: CalEvent): string | null {
  if (!event.lien) return null;
  if (event.type === 'expiration_titre') {
    // ancien format: /admin/users?client=<id>  ou  /admin/utilisateurs/<id>
    const m = event.lien.match(/[?&]client=([a-f0-9]+)/i) || event.lien.match(/utilisateurs\/([a-f0-9]+)/i);
    return m ? `/admin/utilisateurs/${m[1]}` : null;
  }
  if (event.lien === '/admin/tasks') return '/admin/taches';
  return event.lien;
}

// ─── Composants locaux ────────────────────────────────────────────────────────

function Pill({ event, onClick }: { event: CalEvent; onClick: () => void }) {
  const c = COLOR_MAP[event.couleur] || COLOR_MAP.amber;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full text-left text-[10px] leading-tight rounded px-1 py-0.5 truncate font-medium ${c.bg} ${c.text} hover:opacity-80 transition`}
      title={event.titre}
    >
      {event.urgence && <span className="mr-0.5">!</span>}
      {event.titre}
    </button>
  );
}

function EventDetail({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const c = COLOR_MAP[event.couleur] || COLOR_MAP.amber;
  const navLink = resolveEventLink(event);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4 ${c.bg} ${c.text}`}>
          <span>{TYPE_EMOJI[event.type]}</span>
          <span>{TYPE_LABEL[event.type]}</span>
          {event.urgence && <span className="ml-1 font-bold">URGENT</span>}
        </div>
        <h3 className="font-bold text-lg text-gray-900 mb-1 break-words">{event.titre}</h3>
        {event.details && <p className="text-sm text-gray-500 mb-1 break-words">{event.details}</p>}
        <p className="text-xs text-gray-400 mb-4">
          {new Date(event.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {event.heure && ` a ${event.heure}`}
        </p>
        {event.statut && (
          <p className="text-xs text-gray-500 mb-4">Statut : <span className="font-medium">{event.statut}</span></p>
        )}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Fermer
          </button>
          {navLink && (
            <Link
              href={navLink}
              onClick={onClose}
              className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600"
            >
              {event.type === 'expiration_titre' ? 'Voir le client' : event.type === 'rdv' ? 'Voir les RDV' : 'Voir le dossier'}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

interface CreateTaskModalProps {
  date: Date;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}

function CreateTaskModal({ date, userId, onClose, onCreated }: CreateTaskModalProps) {
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [priorite, setPriorite] = useState('normale');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim()) { setError('Le titre est requis'); return; }
    setSaving(true);
    setError(null);
    try {
      await tasksAPI.createTask({
        titre: titre.trim(),
        description: description.trim() || undefined,
        priorite,
        dateEcheance: date.toISOString(),
        statut: 'a_faire',
        assignedTo: userId,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erreur lors de la creation de la tache');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg text-gray-900 mb-1">Nouvelle tache</h3>
        <p className="text-sm text-gray-400 mb-5">
          {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Titre *</label>
            <input
              autoFocus
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="Intitule de la tache..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              rows={2}
              placeholder="Details optionnels..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Priorite</label>
            <select
              value={priorite}
              onChange={(e) => setPriorite(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="basse">Basse</option>
              <option value="normale">Normale</option>
              <option value="haute">Haute</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Creer la tache'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Legende ─────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { couleur: 'blue',   label: 'Rendez-vous' },
    { couleur: 'orange', label: 'Echeance dossier' },
    { couleur: 'red',    label: 'Titre expirant / Urgent' },
    { couleur: 'purple', label: 'Tache' },
    { couleur: 'green',  label: 'Dossier ouvert' },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-gray-600">
      {items.map((it) => {
        const c = COLOR_MAP[it.couleur];
        return (
          <span key={it.couleur} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full inline-block ${c.dot}`} />
            {it.label}
          </span>
        );
      })}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function CalendrierPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    if (status === 'loading') return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (status === 'unauthenticated' && !token) { router.push('/auth/signin'); return; }
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role;
      if (!isDossierStaffRole(role)) { router.push('/client'); return; }
    }
  }, [session, status, router]);

  const loadEvents = useCallback(async () => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchEvents(start, end);
      setEvents(data);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger le calendrier');
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const grid = buildGrid(year, month);

  const filteredEvents = filterType === 'all' ? events : events.filter((e) => e.type === filterType);
  const byDate = groupByDate(filteredEvents);

  const todayStr = isoDate(today);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));

  // Compteurs pour le resumé
  const urgentCount = events.filter((e) => e.urgence).length;
  const rdvCount = events.filter((e) => e.type === 'rdv').length;
  const tacheCount = events.filter((e) => e.type === 'tache').length;
  const titreCount = events.filter((e) => e.type === 'expiration_titre').length;

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📅 Calendrier d'equipe</h1>
            <p className="text-sm text-gray-500 mt-0.5">Suivi unifie des dossiers, taches et echeances</p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={goToday} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 font-medium">
              Aujourd'hui
            </button>
            <button onClick={prevMonth} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[120px] text-center">
              {MOIS[month]} {year}
            </span>
            <button onClick={nextMonth} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              ›
            </button>
          </div>
        </div>

        {/* Cartes resume */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'RDV ce mois', val: rdvCount, couleur: 'blue', emoji: '📅' },
            { label: 'Echeances', val: events.filter((e) => e.type === 'echeance_dossier').length, couleur: 'orange', emoji: '⏰' },
            { label: 'Titres expirants', val: titreCount, couleur: 'red', emoji: '🔴' },
            { label: 'Taches', val: tacheCount, couleur: 'purple', emoji: '✅' },
          ].map((s) => {
            const c = COLOR_MAP[s.couleur];
            return (
              <div key={s.label} className={`rounded-xl p-4 ${c.bg} border border-white/60`}>
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{s.emoji}</span>
                  <span className={`text-2xl font-bold ${c.text}`}>{s.val}</span>
                </div>
                <p className={`text-xs font-medium mt-1 ${c.text}`}>{s.label}</p>
              </div>
            );
          })}
        </div>

        {urgentCount > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
            <span className="text-red-600 font-bold text-sm">🔴 {urgentCount} element(s) urgent(s) ce mois</span>
          </div>
        )}

        {/* Filtre type */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { val: 'all', label: 'Tout' },
            { val: 'rdv', label: 'RDV' },
            { val: 'echeance_dossier', label: 'Echeances' },
            { val: 'expiration_titre', label: 'Titres' },
            { val: 'tache', label: 'Taches' },
            { val: 'dossier_cree', label: 'Ouvertures' },
          ].map((f) => (
            <button
              key={f.val}
              onClick={() => setFilterType(f.val)}
              className={`px-3 py-1 text-xs rounded-full font-medium border transition ${
                filterType === f.val
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Legende */}
        <div className="mb-4">
          <Legend />
        </div>

        {/* Grille calendrier */}
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">{error}</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
            {/* En-tetes jours */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {JOURS.map((j) => (
                <div key={j} className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {j}
                </div>
              ))}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {grid.map((day, idx) => {
                  const dayStr = isoDate(day);
                  const isCurrentMonth = day.getMonth() === month;
                  const isToday = dayStr === todayStr;
                  const dayEvents = byDate[dayStr] || [];

                  return (
                    <div
                      key={idx}
                      onClick={() => { setCreateDate(day); }}
                      className={`min-h-[90px] sm:min-h-[110px] p-1.5 border-b border-r border-gray-50 cursor-pointer hover:bg-orange-50/40 transition group ${
                        !isCurrentMonth ? 'bg-gray-50/60' : ''
                      }`}
                    >
                      {/* Numero du jour */}
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                            isToday
                              ? 'bg-orange-500 text-white'
                              : isCurrentMonth
                              ? 'text-gray-700'
                              : 'text-gray-300'
                          }`}
                        >
                          {day.getDate()}
                        </span>
                        {/* Bouton + visible au survol */}
                        <span className="opacity-0 group-hover:opacity-100 text-gray-300 text-xs transition">+</span>
                      </div>

                      {/* Evenements */}
                      <div className="space-y-0.5 overflow-hidden">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <Pill key={ev.id} event={ev} onClick={() => setSelectedEvent(ev)} />
                        ))}
                        {dayEvents.length > 3 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); /* TODO: expand */ }}
                            className="text-[9px] text-gray-400 hover:text-gray-600 pl-1"
                          >
                            +{dayEvents.length - 3} autre(s)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Liste evenements urgents en bas */}
        {urgentCount > 0 && (
          <div className="mt-6 bg-white rounded-2xl shadow-md border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-3 text-base">🔴 Urgences du mois</h2>
            <div className="space-y-2">
              {events.filter((e) => e.urgence).map((e) => {
                const c = COLOR_MAP[e.couleur] || COLOR_MAP.red;
                return (
                  <div key={e.id} className={`flex items-start gap-3 p-3 rounded-lg ${c.bg}`}>
                    <span className="text-lg flex-shrink-0">{TYPE_EMOJI[e.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold break-words ${c.text}`}>{e.titre}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(e.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                        {e.details && ` - ${e.details}`}
                      </p>
                    </div>
                    {resolveEventLink(e) && (
                      <Link href={resolveEventLink(e)!} className="text-xs font-semibold text-orange-600 hover:underline shrink-0">
                        Voir
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Note email alerts */}
        <div className="mt-4 text-xs text-gray-400 text-center">
          Les alertes email sont envoyees quotidiennement a 8h via le script <code>sendCalendarAlerts.js</code>.
        </div>
      </div>

      {/* Modals */}
      {selectedEvent && (
        <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
      {createDate && (
        <CreateTaskModal
          date={createDate}
          userId={(session?.user as any)?.id || ''}
          onClose={() => setCreateDate(null)}
          onCreated={() => { setCreateDate(null); loadEvents(); }}
        />
      )}
    </div>
  );
}

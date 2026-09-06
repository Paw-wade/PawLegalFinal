'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isDossierStaffRole } from '@/lib/dossierAccess';
import { tasksAPI, getApiBaseUrl } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType =
  | 'rdv'
  | 'echeance_dossier'
  | 'expiration_titre'
  | 'tache'
  | 'dossier_cree'
  | 'evenement'
  | 'email_programme';

type ViewType = 'mois' | 'semaine' | 'jour' | 'membre';

interface CalEvent {
  id: string;
  type: EventType;
  date: string;
  heure: string | null;
  heureFin?: string | null;
  titre: string;
  details: string;
  couleur: string;
  lien: string | null;
  statut: string | null;
  urgence: boolean;
  priorite?: string;
  customId?: string;
  deletable?: boolean;
  visibilite?: string;
  participants?: string[];
  createdByName?: string;
  assignedToNames?: string[];
  emailTo?: string;
  emailEnvoye?: boolean;
}

interface StaffMember {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

// ─── Couleurs ─────────────────────────────────────────────────────────────────

const COLORS_CONFIG = [
  { id: 'blue',   tw: 'bg-blue-500',   bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-500' },
  { id: 'green',  tw: 'bg-green-500',  bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500' },
  { id: 'purple', tw: 'bg-purple-500', bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500' },
  { id: 'orange', tw: 'bg-orange-500', bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500' },
  { id: 'red',    tw: 'bg-red-500',    bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500' },
  { id: 'indigo', tw: 'bg-indigo-500', bg: 'bg-indigo-100', text: 'text-indigo-800', dot: 'bg-indigo-500' },
  { id: 'pink',   tw: 'bg-pink-500',   bg: 'bg-pink-100',   text: 'text-pink-800',   dot: 'bg-pink-500' },
  { id: 'amber',  tw: 'bg-amber-400',  bg: 'bg-amber-100',  text: 'text-amber-800',  dot: 'bg-amber-400' },
];

const COLOR_MAP: Record<string, { bg: string; text: string; dot: string }> = {};
for (const c of COLORS_CONFIG) {
  COLOR_MAP[c.id] = { bg: c.bg, text: c.text, dot: c.dot };
}

const TYPE_LABEL: Record<string, string> = {
  rdv:              'RDV',
  echeance_dossier: 'Echeance',
  expiration_titre: 'Titre',
  tache:            'Tache',
  dossier_cree:     'Ouverture',
  evenement:        'Evenement',
  email_programme:  'Email',
};

const TYPE_EMOJI: Record<string, string> = {
  rdv:              '📅',
  echeance_dossier: '⏰',
  expiration_titre: '🔴',
  tache:            '✅',
  dossier_cree:     '📁',
  evenement:        '📌',
  email_programme:  '📧',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
const MOIS_SHORT = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];

function getWeekMonday(d: Date): Date {
  const day = new Date(d);
  const dow = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - dow);
  day.setHours(0, 0, 0, 0);
  return day;
}

function getWeekDays(anchor: Date): Date[] {
  const mon = getWeekMonday(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function eventBelongsToMember(ev: CalEvent, name: string): boolean {
  if (ev.createdByName === name) return true;
  if (Array.isArray(ev.participants) && ev.participants.includes(name)) return true;
  if (Array.isArray(ev.assignedToNames) && ev.assignedToNames.includes(name)) return true;
  return false;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = (first.getDay() + 6) % 7;
  const days: Date[] = [];
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(first);
    d.setDate(d.getDate() - i - 1);
    days.push(d);
  }
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) {
    const next = new Date(days[days.length - 1]);
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

function resolveEventLink(event: CalEvent): string | null {
  if (!event.lien) return null;
  if (event.type === 'expiration_titre') {
    const m = event.lien.match(/[?&]client=([a-f0-9]+)/i) || event.lien.match(/utilisateurs\/([a-f0-9]+)/i);
    return m ? `/admin/utilisateurs/${m[1]}` : null;
  }
  if (event.lien === '/admin/tasks') return '/admin/taches';
  return event.lien;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('token') || '') : '';
  return { Authorization: `Bearer ${token}` };
}

async function fetchEvents(start: Date, end: Date): Promise<CalEvent[]> {
  const url = `${getApiBaseUrl()}/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`;
  const res = await fetch(url, { headers: authHeader(), credentials: 'omit' });
  if (!res.ok) throw new Error(`Erreur API calendrier (${res.status})`);
  const json = await res.json();
  return json.events || [];
}

async function fetchStaff(): Promise<StaffMember[]> {
  const url = `${getApiBaseUrl()}/calendar/members`;
  const res = await fetch(url, { headers: authHeader(), credentials: 'omit' });
  if (!res.ok) return [];
  const json = await res.json();
  return json.members || [];
}

async function createCustomEvent(payload: Record<string, unknown>): Promise<void> {
  const url = `${getApiBaseUrl()}/calendar/custom-events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as any).message || 'Erreur creation');
  }
}

async function deleteCustomEvent(id: string): Promise<void> {
  const url = `${getApiBaseUrl()}/calendar/custom-events/${id}`;
  const res = await fetch(url, { method: 'DELETE', headers: authHeader(), credentials: 'omit' });
  if (!res.ok) throw new Error('Erreur suppression');
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({ event, onClick }: { event: CalEvent; onClick: () => void }) {
  const c = COLOR_MAP[event.couleur] || COLOR_MAP.amber;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full text-left text-[10px] leading-tight rounded px-1 py-0.5 truncate font-medium ${c.bg} ${c.text} hover:opacity-80 transition`}
      title={event.titre}
    >
      {event.urgence && <span className="mr-0.5">!</span>}
      <span className="mr-0.5">{TYPE_EMOJI[event.type] || ''}</span>
      {event.titre}
    </button>
  );
}

// ─── EventDetail ──────────────────────────────────────────────────────────────

function EventDetail({
  event,
  onClose,
  onDeleted,
}: {
  event: CalEvent;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const c = COLOR_MAP[event.couleur] || COLOR_MAP.amber;
  const navLink = resolveEventLink(event);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState('');

  const handleDelete = async () => {
    if (!event.customId) return;
    if (!window.confirm('Supprimer cet evenement ?')) return;
    setDeleting(true);
    setDelError('');
    try {
      await deleteCustomEvent(event.customId);
      onDeleted();
      onClose();
    } catch {
      setDelError('Impossible de supprimer');
      setDeleting(false);
    }
  };

  const navLabel =
    event.type === 'expiration_titre' ? 'Voir le client'
    : event.type === 'rdv' ? 'Voir les RDV'
    : 'Voir le dossier';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4 ${c.bg} ${c.text}`}>
          <span>{TYPE_EMOJI[event.type] || ''}</span>
          <span>{TYPE_LABEL[event.type] || event.type}</span>
          {event.urgence && <span className="ml-1 font-bold">URGENT</span>}
        </div>

        <h3 className="font-bold text-lg text-gray-900 mb-1 break-words">{event.titre}</h3>
        {event.details && <p className="text-sm text-gray-500 mb-2 break-words">{event.details}</p>}

        <p className="text-xs text-gray-400 mb-2">
          {new Date(event.date).toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
          {event.heure && ` a ${event.heure}`}
          {event.heureFin && ` - ${event.heureFin}`}
        </p>

        {event.statut && (
          <p className="text-xs text-gray-500 mb-2">
            Statut : <span className="font-medium">{event.statut}</span>
          </p>
        )}

        {event.visibilite && (
          <p className="text-xs text-gray-400 mb-2">
            Visibilite :{' '}
            {event.visibilite === 'prive' ? 'Prive (vous seul)'
              : event.visibilite === 'equipe' ? 'Equipe'
              : 'Tous'}
          </p>
        )}

        {event.createdByName && (
          <p className="text-xs text-gray-400 mb-2">Cree par : {event.createdByName}</p>
        )}

        {event.participants && event.participants.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-gray-500 mb-1">Participants</p>
            <div className="flex flex-wrap gap-1">
              {event.participants.map((p, i) => (
                <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs">{p}</span>
              ))}
            </div>
          </div>
        )}

        {delError && <p className="text-xs text-red-600 mb-2">{delError}</p>}

        <div className="flex items-center justify-between gap-2 mt-4">
          <div>
            {event.deletable && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? '...' : 'Supprimer'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Fermer
            </button>
            {navLink && (
              <Link
                href={navLink}
                onClick={onClose}
                className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600"
              >
                {navLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CreateEventModal ─────────────────────────────────────────────────────────

type TabType = 'evenement' | 'tache' | 'email';

interface CreateEventModalProps {
  date: Date;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}

// ─── Types rappels ────────────────────────────────────────────────────────────

interface RappelEntry {
  id: string;
  preset: '15m' | '1h' | '2h' | '1j' | '1s' | 'custom';
  customDateTime: string;
  sms: boolean;
}

const RAPPEL_PRESETS = [
  { value: '15m', label: '15 min avant' },
  { value: '1h',  label: '1 heure avant' },
  { value: '2h',  label: '2 heures avant' },
  { value: '1j',  label: '1 jour avant' },
  { value: '1s',  label: '1 semaine avant' },
  { value: 'custom', label: 'Date et heure precises' },
] as const;

const PRESET_OFFSET_MIN: Record<string, number> = {
  '15m': -15,
  '1h':  -60,
  '2h':  -120,
  '1j':  -24 * 60,
  '1s':  -7 * 24 * 60,
};

function computeTriggerAt(preset: string, customDateTime: string, eventDate: string, heureDebut: string): string {
  if (preset === 'custom') return customDateTime;
  const timeStr = heureDebut || '09:00';
  const eventDT = new Date(`${eventDate}T${timeStr}:00`);
  const offsetMs = (PRESET_OFFSET_MIN[preset] ?? -24 * 60) * 60 * 1000;
  return new Date(eventDT.getTime() + offsetMs).toISOString();
}

function newRappel(): RappelEntry {
  return { id: Math.random().toString(36).slice(2), preset: '1j', customDateTime: '', sms: false };
}

// ─── RappelsSection ───────────────────────────────────────────────────────────

function RappelsSection({
  rappels,
  setRappels,
  eventDate,
  heureDebut,
  inputCls,
}: {
  rappels: RappelEntry[];
  setRappels: React.Dispatch<React.SetStateAction<RappelEntry[]>>;
  eventDate: string;
  heureDebut: string;
  inputCls: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-gray-600">Rappels</label>
        <button
          type="button"
          onClick={() => setRappels((r) => [...r, newRappel()])}
          className="text-xs text-orange-600 hover:text-orange-800 font-semibold px-2 py-0.5 rounded hover:bg-orange-50"
        >
          + Ajouter
        </button>
      </div>

      {rappels.length === 0 && (
        <p className="text-xs text-gray-400 italic">Aucun rappel configure. Email + notification in-app seront envoyes si vous en ajoutez.</p>
      )}

      <div className="space-y-2">
        {rappels.map((r) => (
          <div key={r.id} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-1.5">
                <select
                  value={r.preset}
                  onChange={(e) =>
                    setRappels((list) =>
                      list.map((x) => x.id === r.id ? { ...x, preset: e.target.value as RappelEntry['preset'] } : x)
                    )
                  }
                  className={inputCls}
                >
                  {RAPPEL_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>

                {r.preset === 'custom' && (
                  <input
                    type="datetime-local"
                    value={r.customDateTime}
                    onChange={(e) =>
                      setRappels((list) =>
                        list.map((x) => x.id === r.id ? { ...x, customDateTime: e.target.value } : x)
                      )
                    }
                    className={inputCls}
                  />
                )}

                <div className="flex items-center gap-4 mt-1">
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <span>📧</span> Email
                    <span className="ml-0.5 text-gray-400">(toujours)</span>
                  </span>
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <span>🔔</span> In-app
                    <span className="ml-0.5 text-gray-400">(toujours)</span>
                  </span>
                  <label className="flex items-center gap-1 cursor-pointer text-[11px] text-gray-600">
                    <input
                      type="checkbox"
                      checked={r.sms}
                      onChange={(e) =>
                        setRappels((list) =>
                          list.map((x) => x.id === r.id ? { ...x, sms: e.target.checked } : x)
                        )
                      }
                      className="accent-orange-500"
                    />
                    <span>📱 SMS</span>
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRappels((list) => list.filter((x) => x.id !== r.id))}
                className="text-gray-400 hover:text-red-500 text-lg leading-none pt-0.5 shrink-0"
                title="Supprimer ce rappel"
              >
                &times;
              </button>
            </div>

            {r.preset !== 'custom' && eventDate && (
              <p className="text-[10px] text-gray-400 mt-1.5">
                Envoi prevu le{' '}
                {new Date(computeTriggerAt(r.preset, '', eventDate, heureDebut)).toLocaleString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CreateEventModal ─────────────────────────────────────────────────────────

function CreateEventModal({ date, userId, onClose, onCreated }: CreateEventModalProps) {
  const [tab, setTab] = useState<TabType>('evenement');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(isoDate(date));
  const [rappels, setRappels] = useState<RappelEntry[]>([]);

  const [evForm, setEvForm] = useState({
    titre: '',
    description: '',
    heureDebut: '',
    heureFin: '',
    couleur: 'blue',
    visibilite: 'equipe',
    participants: [] as string[],
  });

  const [tForm, setTForm] = useState({ titre: '', description: '', priorite: 'normale' });

  const [emForm, setEmForm] = useState({
    emailTo: '',
    emailSujet: '',
    emailCorps: '',
    visibilite: 'equipe',
  });

  useEffect(() => { fetchStaff().then(setStaff); }, []);

  const toggleParticipant = (id: string) => {
    setEvForm((f) => ({
      ...f,
      participants: f.participants.includes(id)
        ? f.participants.filter((p) => p !== id)
        : [...f.participants, id],
    }));
  };

  const filteredStaff = staff
    .filter((m) => m._id !== userId)
    .filter((m) => {
      const q = staffSearch.toLowerCase();
      return (
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
      );
    });

  const buildRappelPayload = (eventDate: string, heureDebut: string) =>
    rappels
      .filter((r) => r.preset !== 'custom' || r.customDateTime)
      .map((r) => ({
        triggerAt: computeTriggerAt(r.preset, r.customDateTime, eventDate, heureDebut),
        canaux: ['email', 'inapp', ...(r.sms ? ['sms'] : [])],
      }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (tab === 'tache') {
        if (!tForm.titre.trim()) { setError('Le titre est requis'); setSaving(false); return; }
        await tasksAPI.createTask({
          titre: tForm.titre.trim(),
          description: tForm.description.trim() || undefined,
          priorite: tForm.priorite,
          dateEcheance: new Date(selectedDate).toISOString(),
          statut: 'a_faire',
          assignedTo: userId,
          rappels: buildRappelPayload(selectedDate, ''),
        });
      } else if (tab === 'evenement') {
        if (!evForm.titre.trim()) { setError('Le titre est requis'); setSaving(false); return; }
        await createCustomEvent({
          type: 'evenement',
          titre: evForm.titre.trim(),
          description: evForm.description.trim(),
          date: selectedDate,
          heureDebut: evForm.heureDebut,
          heureFin: evForm.heureFin,
          couleur: evForm.couleur,
          visibilite: evForm.visibilite,
          participants: evForm.participants,
          rappels: buildRappelPayload(selectedDate, evForm.heureDebut),
        });
      } else {
        if (!emForm.emailTo.trim()) { setError('Le destinataire est requis'); setSaving(false); return; }
        if (!emForm.emailSujet.trim()) { setError("L'objet est requis"); setSaving(false); return; }
        if (!emForm.emailCorps.trim()) { setError('Le corps du message est requis'); setSaving(false); return; }
        await createCustomEvent({
          type: 'email_programme',
          titre: emForm.emailSujet.trim(),
          date: selectedDate,
          couleur: 'indigo',
          visibilite: emForm.visibilite,
          emailTo: emForm.emailTo.trim(),
          emailSujet: emForm.emailSujet.trim(),
          emailCorps: emForm.emailCorps.trim(),
          rappels: buildRappelPayload(selectedDate, ''),
        });
      }
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la creation');
      setSaving(false);
    }
  };

  const tabBtn = (t: TabType, emoji: string, label: string) => (
    <button
      type="button"
      onClick={() => { setTab(t); setError(''); }}
      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
        tab === t ? 'bg-orange-500 text-white shadow' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {emoji} {label}
    </button>
  );

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-lg text-gray-900">Nouvel element</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        {/* Date partagee */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-gray-50 p-1 rounded-xl">
          {tabBtn('evenement', '📌', 'Evenement')}
          {tabBtn('tache', '✅', 'Tache')}
          {tabBtn('email', '📧', 'Email')}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Evenement ─────────────────────────────────────────────────────── */}
          {tab === 'evenement' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Titre *</label>
                <input
                  autoFocus
                  value={evForm.titre}
                  onChange={(e) => setEvForm((f) => ({ ...f, titre: e.target.value }))}
                  className={inputCls}
                  placeholder="Titre de l'evenement..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                <textarea
                  value={evForm.description}
                  onChange={(e) => setEvForm((f) => ({ ...f, description: e.target.value }))}
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="Details..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Heure debut</label>
                  <input
                    type="time"
                    value={evForm.heureDebut}
                    onChange={(e) => setEvForm((f) => ({ ...f, heureDebut: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Heure fin</label>
                  <input
                    type="time"
                    value={evForm.heureFin}
                    onChange={(e) => setEvForm((f) => ({ ...f, heureFin: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Couleur */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Couleur</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS_CONFIG.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEvForm((f) => ({ ...f, couleur: c.id }))}
                      className={`w-7 h-7 rounded-full ${c.tw} transition-transform ${
                        evForm.couleur === c.id
                          ? 'ring-2 ring-offset-2 ring-gray-500 scale-110'
                          : 'opacity-60 hover:opacity-100 hover:scale-105'
                      }`}
                      title={c.id}
                    />
                  ))}
                </div>
              </div>

              {/* Visibilite */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Visibilite</label>
                <div className="flex flex-wrap gap-4">
                  {[
                    { val: 'prive', label: 'Prive (moi seul)' },
                    { val: 'equipe', label: 'Equipe' },
                    { val: 'tous', label: 'Tous' },
                  ].map((v) => (
                    <label key={v.val} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
                      <input
                        type="radio"
                        value={v.val}
                        checked={evForm.visibilite === v.val}
                        onChange={() => setEvForm((f) => ({ ...f, visibilite: v.val }))}
                        className="accent-orange-500"
                      />
                      {v.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Participants */}
              {staff.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Participants</label>
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    placeholder="Rechercher un membre..."
                    className={`${inputCls} mb-2`}
                  />
                  <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                    {filteredStaff.map((m) => {
                      const isSelected = evForm.participants.includes(m._id);
                      return (
                        <button
                          key={m._id}
                          type="button"
                          onClick={() => toggleParticipant(m._id)}
                          className={`w-full text-left px-3 py-2 text-sm transition flex items-center justify-between ${
                            isSelected ? 'bg-orange-50 text-orange-700' : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <span>{m.firstName} {m.lastName}</span>
                          {isSelected
                            ? <span className="text-orange-500 text-xs font-bold">Inclus</span>
                            : <span className="text-gray-300 text-xs">+</span>
                          }
                        </button>
                      );
                    })}
                    {filteredStaff.length === 0 && (
                      <p className="text-xs text-gray-400 px-3 py-2">Aucun membre trouve</p>
                    )}
                  </div>
                  {evForm.participants.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {evForm.participants.map((pid) => {
                        const m = staff.find((s) => s._id === pid);
                        return m ? (
                          <span key={pid} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs flex items-center gap-1">
                            {m.firstName} {m.lastName}
                            <button
                              type="button"
                              onClick={() => toggleParticipant(pid)}
                              className="text-orange-400 hover:text-orange-700 ml-0.5"
                            >
                              &times;
                            </button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              )}

              <RappelsSection
                rappels={rappels}
                setRappels={setRappels}
                eventDate={selectedDate}
                heureDebut={evForm.heureDebut}
                inputCls={inputCls}
              />
            </>
          )}

          {/* ── Tache ─────────────────────────────────────────────────────────── */}
          {tab === 'tache' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Titre *</label>
                <input
                  autoFocus
                  value={tForm.titre}
                  onChange={(e) => setTForm((f) => ({ ...f, titre: e.target.value }))}
                  className={inputCls}
                  placeholder="Intitule de la tache..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                <textarea
                  value={tForm.description}
                  onChange={(e) => setTForm((f) => ({ ...f, description: e.target.value }))}
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="Details..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Priorite</label>
                <select
                  value={tForm.priorite}
                  onChange={(e) => setTForm((f) => ({ ...f, priorite: e.target.value }))}
                  className={inputCls}
                >
                  <option value="basse">Basse</option>
                  <option value="normale">Normale</option>
                  <option value="haute">Haute</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <RappelsSection
                rappels={rappels}
                setRappels={setRappels}
                eventDate={selectedDate}
                heureDebut=""
                inputCls={inputCls}
              />
            </>
          )}

          {/* ── Email programme ────────────────────────────────────────────────── */}
          {tab === 'email' && (
            <>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-700">
                L'email sera envoye automatiquement a la date selectionnee ci-dessus par le serveur (cron 8h).
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Destinataire *</label>
                <input
                  autoFocus
                  type="email"
                  value={emForm.emailTo}
                  onChange={(e) => setEmForm((f) => ({ ...f, emailTo: e.target.value }))}
                  className={inputCls}
                  placeholder="email@exemple.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Objet *</label>
                <input
                  value={emForm.emailSujet}
                  onChange={(e) => setEmForm((f) => ({ ...f, emailSujet: e.target.value }))}
                  className={inputCls}
                  placeholder="Objet de l'email..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Corps du message *</label>
                <textarea
                  value={emForm.emailCorps}
                  onChange={(e) => setEmForm((f) => ({ ...f, emailCorps: e.target.value }))}
                  className={`${inputCls} resize-none`}
                  rows={5}
                  placeholder="Contenu de l'email..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Visibilite dans le calendrier</label>
                <div className="flex gap-4">
                  {[
                    { val: 'prive', label: 'Prive' },
                    { val: 'equipe', label: 'Equipe' },
                  ].map((v) => (
                    <label key={v.val} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
                      <input
                        type="radio"
                        value={v.val}
                        checked={emForm.visibilite === v.val}
                        onChange={() => setEmForm((f) => ({ ...f, visibilite: v.val }))}
                        className="accent-orange-500"
                      />
                      {v.label}
                    </label>
                  ))}
                </div>
              </div>
              <RappelsSection
                rappels={rappels}
                setRappels={setRappels}
                eventDate={selectedDate}
                heureDebut=""
                inputCls={inputCls}
              />
            </>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{error}</p>}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : tab === 'email' ? 'Planifier l\'email' : 'Creer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── WeekView ────────────────────────────────────────────────────────────────

function WeekView({
  days,
  byDate,
  todayStr,
  onEventClick,
  onDayClick,
  isLoading,
}: {
  days: Date[];
  byDate: Record<string, CalEvent[]>;
  todayStr: string;
  onEventClick: (e: CalEvent) => void;
  onDayClick: (d: Date) => void;
  isLoading: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {days.map((day) => {
          const isToday = isoDate(day) === todayStr;
          return (
            <div key={isoDate(day)} className="px-1 py-3 text-center border-r border-gray-50 last:border-r-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{JOURS[(day.getDay() + 6) % 7]}</p>
              <span
                className={`mt-1 text-sm font-bold w-8 h-8 mx-auto flex items-center justify-center rounded-full ${
                  isToday ? 'bg-orange-500 text-white' : 'text-gray-700'
                }`}
              >
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>
      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : (
        <div className="grid grid-cols-7 min-h-[350px]">
          {days.map((day) => {
            const ds = isoDate(day);
            const dayEvents = byDate[ds] || [];
            const isToday = ds === todayStr;
            return (
              <div
                key={ds}
                onClick={() => onDayClick(day)}
                className={`p-1.5 border-r border-gray-50 last:border-r-0 cursor-pointer hover:bg-orange-50/30 transition min-h-[350px] ${
                  isToday ? 'bg-orange-50/20' : ''
                }`}
              >
                <div className="space-y-0.5">
                  {dayEvents.map((ev) => (
                    <Pill key={ev.id} event={ev} onClick={() => onEventClick(ev)} />
                  ))}
                  {dayEvents.length === 0 && (
                    <p className="text-[9px] text-gray-300 text-center pt-4">Vide</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── DayView ──────────────────────────────────────────────────────────────────

const DAY_HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7h-21h

function DayView({
  date,
  events,
  todayStr,
  onEventClick,
  onAddAtHour,
  isLoading,
}: {
  date: Date;
  events: CalEvent[];
  todayStr: string;
  onEventClick: (e: CalEvent) => void;
  onAddAtHour: (d: Date) => void;
  isLoading: boolean;
}) {
  const allDay = events.filter((ev) => !ev.heure);
  const timed = events.filter((ev) => ev.heure);
  const isToday = isoDate(date) === todayStr;

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      {/* All-day strip */}
      {allDay.length > 0 && (
        <div className="border-b border-gray-100 px-4 py-2 bg-gray-50">
          <p className="text-[10px] text-gray-400 uppercase mb-1 font-semibold">Toute la journee</p>
          <div className="flex flex-wrap gap-1">
            {allDay.map((ev) => (
              <Pill key={ev.id} event={ev} onClick={() => onEventClick(ev)} />
            ))}
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : (
        <div>
          {DAY_HOURS.map((h) => {
            const hourEvents = timed.filter((ev) => {
              const evH = ev.heure ? parseInt(ev.heure.split(':')[0], 10) : -1;
              return evH === h;
            });
            const isNowHour = isToday && new Date().getHours() === h;
            const addDate = new Date(date);
            addDate.setHours(h, 0, 0, 0);
            return (
              <div
                key={h}
                className={`flex border-b border-gray-50 group cursor-pointer hover:bg-orange-50/20 transition ${
                  isNowHour ? 'bg-orange-50/30' : ''
                }`}
                onClick={() => onAddAtHour(addDate)}
              >
                <div className="w-16 shrink-0 text-[11px] text-gray-400 pt-3 pl-4 select-none">
                  {String(h).padStart(2, '0')}:00
                </div>
                <div className="flex-1 px-2 py-2 min-h-[52px]">
                  <div className="flex flex-wrap gap-1">
                    {hourEvents.map((ev) => (
                      <div key={ev.id} onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}>
                        <Pill event={ev} onClick={() => onEventClick(ev)} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-6 shrink-0 flex items-center opacity-0 group-hover:opacity-40 pr-2">
                  <span className="text-orange-500 font-bold text-sm">+</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MemberView ───────────────────────────────────────────────────────────────

function MemberView({
  days,
  events,
  staff,
  todayStr,
  onEventClick,
  onDayClick,
  isLoading,
}: {
  days: Date[];
  events: CalEvent[];
  staff: StaffMember[];
  todayStr: string;
  onEventClick: (e: CalEvent) => void;
  onDayClick: (d: Date) => void;
  isLoading: boolean;
}) {
  const byDate = groupByDate(events);

  if (staff.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden overflow-x-auto">
      <div className="min-w-max">
        {/* Header: empty corner + member columns */}
        <div className="flex border-b border-gray-100 bg-gray-50 sticky top-0">
          <div className="w-24 shrink-0 px-3 py-3" />
          {staff.map((m) => (
            <div key={m._id} className="w-44 shrink-0 border-l border-gray-100 px-2 py-3 text-center">
              <p className="text-xs font-bold text-gray-700 truncate">{m.firstName} {m.lastName}</p>
              <p className="text-[10px] text-gray-400 capitalize">{m.role}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : (
          days.map((day) => {
            const ds = isoDate(day);
            const dayEvents = byDate[ds] || [];
            const isToday = ds === todayStr;
            return (
              <div key={ds} className={`flex border-b border-gray-50 ${isToday ? 'bg-orange-50/20' : ''}`}>
                {/* Date label */}
                <div className="w-24 shrink-0 px-3 py-2 border-r border-gray-50">
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? 'text-orange-500' : 'text-gray-400'}`}>
                    {JOURS[(day.getDay() + 6) % 7]}
                  </p>
                  <p className={`text-sm font-bold ${isToday ? 'text-orange-500' : 'text-gray-700'}`}>{day.getDate()}</p>
                </div>

                {/* Member columns */}
                {staff.map((m) => {
                  const memberName = `${m.firstName} ${m.lastName}`.trim();
                  const memberEvents = dayEvents.filter((ev) => eventBelongsToMember(ev, memberName));
                  return (
                    <div
                      key={m._id}
                      className="w-44 shrink-0 border-l border-gray-50 px-1 py-1.5 min-h-[52px] cursor-pointer hover:bg-orange-50/30 transition"
                      onClick={() => onDayClick(day)}
                    >
                      {memberEvents.map((ev) => (
                        <div key={ev.id} className="mb-0.5" onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}>
                          <Pill event={ev} onClick={() => onEventClick(ev)} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { couleur: 'blue',   emoji: '📅', label: 'RDV' },
    { couleur: 'orange', emoji: '⏰', label: 'Echeance dossier' },
    { couleur: 'red',    emoji: '🔴', label: 'Titre expirant' },
    { couleur: 'purple', emoji: '✅', label: 'Tache' },
    { couleur: 'green',  emoji: '📁', label: 'Dossier ouvert' },
    { couleur: 'blue',   emoji: '📌', label: 'Evenement (couleur libre)' },
    { couleur: 'indigo', emoji: '📧', label: 'Email programme' },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-gray-600">
      {items.map((it) => {
        const c = COLOR_MAP[it.couleur];
        return (
          <span key={it.label} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full inline-block ${c.dot}`} />
            {it.emoji} {it.label}
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
  const todayStr = isoDate(today);

  const [view, setView] = useState<ViewType>('mois');
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
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

  // Charger les membres quand on passe en vue membre
  useEffect(() => {
    if (view === 'membre' && staff.length === 0) {
      fetchStaff().then(setStaff);
    }
  }, [view]);

  const loadEvents = useCallback(async () => {
    let start: Date, end: Date;
    if (view === 'mois') {
      const y = currentDate.getFullYear(), m = currentDate.getMonth();
      start = new Date(y, m, 1);
      end = new Date(y, m + 1, 0, 23, 59, 59);
    } else if (view === 'semaine' || view === 'membre') {
      const mon = getWeekMonday(currentDate);
      start = new Date(mon);
      end = new Date(mon);
      end.setDate(mon.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
    }
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
  }, [currentDate, view]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate);
    if (view === 'mois') { d.setMonth(d.getMonth() + dir); d.setDate(1); }
    else if (view === 'semaine' || view === 'membre') { d.setDate(d.getDate() + dir * 7); }
    else { d.setDate(d.getDate() + dir); }
    setCurrentDate(d);
  };

  const goToday = () => {
    const d = new Date();
    if (view === 'mois') { d.setDate(1); }
    setCurrentDate(d);
  };

  const navLabel = (): string => {
    if (view === 'mois') {
      return `${MOIS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (view === 'semaine' || view === 'membre') {
      const days = getWeekDays(currentDate);
      const s = days[0], e = days[6];
      if (s.getMonth() === e.getMonth()) {
        return `${s.getDate()}-${e.getDate()} ${MOIS_SHORT[s.getMonth()]} ${s.getFullYear()}`;
      }
      return `${s.getDate()} ${MOIS_SHORT[s.getMonth()]} - ${e.getDate()} ${MOIS_SHORT[e.getMonth()]} ${e.getFullYear()}`;
    }
    return `${JOURS[(currentDate.getDay() + 6) % 7]} ${currentDate.getDate()} ${MOIS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  };

  // Derivees mois
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const grid = buildGrid(year, month);
  const weekDays = getWeekDays(currentDate);

  const filteredEvents = filterType === 'all' ? events : events.filter((e) => e.type === filterType);
  const byDate = groupByDate(filteredEvents);

  const urgentCount = events.filter((e) => e.urgence).length;
  const rdvCount = events.filter((e) => e.type === 'rdv').length;
  const tacheCount = events.filter((e) => e.type === 'tache').length;
  const titreCount = events.filter((e) => e.type === 'expiration_titre').length;
  const customCount = events.filter((e) => e.type === 'evenement' || e.type === 'email_programme').length;

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendrier d'equipe</h1>
            <p className="text-sm text-gray-500 mt-0.5">Evenements, taches, echeances et rappels</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={goToday} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 font-medium">
              Aujourd'hui
            </button>
            <button onClick={() => navigate(-1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              &lsaquo;
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[140px] text-center">
              {navLabel()}
            </span>
            <button onClick={() => navigate(1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              &rsaquo;
            </button>
          </div>
        </div>

        {/* Selecteur de vue */}
        <div className="flex gap-1 mb-5 bg-white border border-gray-200 rounded-xl p-1 shadow-sm w-fit">
          {([
            { v: 'mois', label: 'Mois' },
            { v: 'semaine', label: 'Semaine' },
            { v: 'jour', label: 'Jour' },
            { v: 'membre', label: 'Membre' },
          ] as { v: ViewType; label: string }[]).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition ${
                view === v
                  ? 'bg-orange-500 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Cartes resume */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          {[
            { label: 'RDV', val: rdvCount, couleur: 'blue', emoji: '📅' },
            { label: 'Echeances', val: events.filter((e) => e.type === 'echeance_dossier').length, couleur: 'orange', emoji: '⏰' },
            { label: 'Titres expirants', val: titreCount, couleur: 'red', emoji: '🔴' },
            { label: 'Taches', val: tacheCount, couleur: 'purple', emoji: '✅' },
            { label: 'Mes evenements', val: customCount, couleur: 'indigo', emoji: '📌' },
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

        {/* Filtres */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { val: 'all', label: 'Tout' },
            { val: 'rdv', label: 'RDV' },
            { val: 'echeance_dossier', label: 'Echeances' },
            { val: 'expiration_titre', label: 'Titres' },
            { val: 'tache', label: 'Taches' },
            { val: 'evenement', label: 'Evenements' },
            { val: 'email_programme', label: 'Emails' },
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
        <div className="mb-4"><Legend /></div>

        {/* Calendrier */}
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">{error}</div>
        ) : (
          <>
            {/* Vue Mois */}
            {view === 'mois' && (
              <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
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
                          onClick={() => setCreateDate(day)}
                          className={`min-h-[90px] sm:min-h-[110px] p-1.5 border-b border-r border-gray-50 cursor-pointer hover:bg-orange-50/40 transition group ${
                            !isCurrentMonth ? 'bg-gray-50/60' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                                isToday ? 'bg-orange-500 text-white'
                                : isCurrentMonth ? 'text-gray-700'
                                : 'text-gray-300'
                              }`}
                            >
                              {day.getDate()}
                            </span>
                            <span className="opacity-0 group-hover:opacity-100 text-orange-300 text-xs transition font-bold">+</span>
                          </div>
                          <div className="space-y-0.5 overflow-hidden">
                            {dayEvents.slice(0, 3).map((ev) => (
                              <Pill key={ev.id} event={ev} onClick={() => setSelectedEvent(ev)} />
                            ))}
                            {dayEvents.length > 3 && (
                              <span className="text-[9px] text-gray-400 pl-1">+{dayEvents.length - 3} autre(s)</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Vue Semaine */}
            {view === 'semaine' && (
              <WeekView
                days={weekDays}
                byDate={byDate}
                todayStr={todayStr}
                onEventClick={(ev) => setSelectedEvent(ev)}
                onDayClick={(d) => setCreateDate(d)}
                isLoading={isLoading}
              />
            )}

            {/* Vue Jour */}
            {view === 'jour' && (
              <DayView
                date={currentDate}
                events={filteredEvents.filter((ev) => isoDate(new Date(ev.date)) === isoDate(currentDate))}
                todayStr={todayStr}
                onEventClick={(ev) => setSelectedEvent(ev)}
                onAddAtHour={(d) => setCreateDate(d)}
                isLoading={isLoading}
              />
            )}

            {/* Vue Membre */}
            {view === 'membre' && (
              <MemberView
                days={weekDays}
                events={filteredEvents}
                staff={staff}
                todayStr={todayStr}
                onEventClick={(ev) => setSelectedEvent(ev)}
                onDayClick={(d) => setCreateDate(d)}
                isLoading={isLoading}
              />
            )}
          </>
        )}

        {/* Urgences du mois */}
        {urgentCount > 0 && (
          <div className="mt-6 bg-white rounded-2xl shadow-md border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-3 text-base">🔴 Urgences du mois</h2>
            <div className="space-y-2">
              {events.filter((e) => e.urgence).map((e) => {
                const c = COLOR_MAP[e.couleur] || COLOR_MAP.red;
                return (
                  <div key={e.id} className={`flex items-start gap-3 p-3 rounded-lg ${c.bg}`}>
                    <span className="text-lg flex-shrink-0">{TYPE_EMOJI[e.type] || ''}</span>
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

        <div className="mt-4 text-xs text-gray-400 text-center">
          Rappels email envoyes quotidiennement a 8h &bull; Emails programmes envoyes automatiquement a leur date
        </div>
      </div>

      {/* Modals */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDeleted={() => { setSelectedEvent(null); loadEvents(); }}
        />
      )}
      {createDate && (
        <CreateEventModal
          date={createDate}
          userId={(session?.user as any)?.id || ''}
          onClose={() => setCreateDate(null)}
          onCreated={() => { setCreateDate(null); loadEvents(); }}
        />
      )}
    </div>
  );
}

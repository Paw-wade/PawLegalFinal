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

function CreateEventModal({ date, userId, onClose, onCreated }: CreateEventModalProps) {
  const [tab, setTab] = useState<TabType>('evenement');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(isoDate(date));

  const [evForm, setEvForm] = useState({
    titre: '',
    description: '',
    heureDebut: '',
    heureFin: '',
    couleur: 'blue',
    visibilite: 'equipe',
    participants: [] as string[],
    rappelVeille: true,
  });

  const [tForm, setTForm] = useState({ titre: '', description: '', priorite: 'normale' });

  const [emForm, setEmForm] = useState({
    emailTo: '',
    emailSujet: '',
    emailCorps: '',
    visibilite: 'equipe',
    rappelVeille: true,
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
          rappelVeille: evForm.rappelVeille,
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
          rappelVeille: emForm.rappelVeille,
          emailTo: emForm.emailTo.trim(),
          emailSujet: emForm.emailSujet.trim(),
          emailCorps: emForm.emailCorps.trim(),
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

              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={evForm.rappelVeille}
                  onChange={(e) => setEvForm((f) => ({ ...f, rappelVeille: e.target.checked }))}
                  className="accent-orange-500"
                />
                Rappel email la veille (createur + participants)
              </label>
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
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={emForm.rappelVeille}
                  onChange={(e) => setEmForm((f) => ({ ...f, rappelVeille: e.target.checked }))}
                  className="accent-orange-500"
                />
                Rappel veille (notification a l'equipe)
              </label>
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendrier d'equipe</h1>
            <p className="text-sm text-gray-500 mt-0.5">Evenements, taches, echeances et rappels</p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={goToday} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 font-medium">
              Aujourd'hui
            </button>
            <button onClick={prevMonth} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              &lsaquo;
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[120px] text-center">
              {MOIS[month]} {year}
            </span>
            <button onClick={nextMonth} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              &rsaquo;
            </button>
          </div>
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

        {/* Grille calendrier */}
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">{error}</div>
        ) : (
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
                            isToday
                              ? 'bg-orange-500 text-white'
                              : isCurrentMonth
                              ? 'text-gray-700'
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
                          <span className="text-[9px] text-gray-400 pl-1">
                            +{dayEvents.length - 3} autre(s)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

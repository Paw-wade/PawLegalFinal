'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tasksAPI, userAPI, dossiersAPI, getApiBaseUrl } from '@/lib/api';
import { TaskListItem } from '@/components/tasks/TaskListItem';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';

// ---- Types calendrier ----
interface CalEvent {
  id: string;
  type: string;
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
  editable?: boolean;
  createdByName?: string;
  assignedToNames?: string[];
  participants?: string[];
}

interface CalStaff {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

const CAL_MOIS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
const CAL_JOURS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

const CAL_TYPE_STYLE: Record<string, string> = {
  rdv:              'bg-blue-100 text-blue-800 border-blue-200',
  echeance_dossier: 'bg-amber-100 text-amber-800 border-amber-200',
  expiration_titre: 'bg-red-100 text-red-800 border-red-200',
  tache:            'bg-orange-100 text-orange-800 border-orange-200',
  dossier_cree:     'bg-gray-100 text-gray-600 border-gray-200',
  evenement:        'bg-purple-100 text-purple-800 border-purple-200',
  email_programme:  'bg-teal-100 text-teal-800 border-teal-200',
};

const CAL_COLOR_DOT: Record<string, string> = {
  blue: 'bg-blue-500', green: 'bg-green-500', purple: 'bg-purple-500',
  orange: 'bg-orange-500', red: 'bg-red-500', indigo: 'bg-indigo-500',
  pink: 'bg-pink-500', amber: 'bg-amber-400',
};

function calIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function calAuthHeader(): Record<string, string> {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('token') || '') : '';
  return { Authorization: `Bearer ${token}` };
}

async function calFetchEvents(start: Date, end: Date): Promise<CalEvent[]> {
  try {
    const url = `${getApiBaseUrl()}/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`;
    const res = await fetch(url, { headers: calAuthHeader(), credentials: 'omit' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.events || [];
  } catch {
    return [];
  }
}

async function calFetchStaff(): Promise<CalStaff[]> {
  try {
    const url = `${getApiBaseUrl()}/calendar/members`;
    const res = await fetch(url, { headers: calAuthHeader(), credentials: 'omit' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.members || [];
  } catch {
    return [];
  }
}

function calBuildMonthGrid(year: number, month: number): Date[] {
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

function Button({ children, variant = 'default', size = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses: Record<string, string> = {
    default: 'bg-orange-500 text-white hover:bg-orange-600',
    outline: 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-700',
    ghost: 'hover:bg-gray-100 text-gray-700',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
  };
  const sizeClasses: Record<string, string> = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
  };
  return (
    <button className={`${baseClasses} ${variantClasses[variant] || variantClasses.default} ${sizeClasses[size] || sizeClasses.default} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Input({ className = '', type, value, onChange, ...props }: any) {
  if (type === 'date') {
    return (
      <DateInputComponent
        value={value || ''}
        onChange={(newValue: string) => {
          if (onChange) {
            const syntheticEvent = { target: { value: newValue }, currentTarget: { value: newValue } } as React.ChangeEvent<HTMLInputElement>;
            onChange(syntheticEvent);
          }
        }}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
    );
  }
  return (
    <input
      type={type}
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function Label({ htmlFor, children, className = '' }: any) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>
      {children}
    </label>
  );
}

function Textarea({ className = '', ...props }: any) {
  return (
    <textarea
      className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

const KANBAN_COLUMNS = [
  { key: 'a_faire',    label: 'A faire',    color: '#9CA3AF', bgClass: 'bg-gray-50/70',   dotClass: 'bg-gray-400',    pillBg: 'bg-gray-100',   pillText: 'text-gray-600',   pillBorder: 'border-gray-200' },
  { key: 'en_cours',   label: 'En cours',   color: '#F97316', bgClass: 'bg-amber-50/60',  dotClass: 'bg-amber-400',   pillBg: 'bg-amber-100',  pillText: 'text-amber-800',  pillBorder: 'border-amber-200' },
  { key: 'en_attente', label: 'En attente', color: '#3B82F6', bgClass: 'bg-blue-50/60',   dotClass: 'bg-blue-400',    pillBg: 'bg-blue-100',   pillText: 'text-blue-800',   pillBorder: 'border-blue-200' },
  { key: 'termine',    label: 'Terminees',  color: '#10B981', bgClass: 'bg-emerald-50/60', dotClass: 'bg-emerald-400', pillBg: 'bg-emerald-100', pillText: 'text-emerald-800', pillBorder: 'border-emerald-200' },
] as const;

const CUSTOM_GROUP_PALETTES = [
  { pillBg: 'bg-purple-100', pillText: 'text-purple-800', pillBorder: 'border-purple-200', bgClass: 'bg-purple-50/60', dotClass: 'bg-purple-400' },
  { pillBg: 'bg-pink-100',   pillText: 'text-pink-800',   pillBorder: 'border-pink-200',   bgClass: 'bg-pink-50/60',   dotClass: 'bg-pink-400' },
  { pillBg: 'bg-indigo-100', pillText: 'text-indigo-800', pillBorder: 'border-indigo-200', bgClass: 'bg-indigo-50/60', dotClass: 'bg-indigo-400' },
  { pillBg: 'bg-teal-100',   pillText: 'text-teal-800',   pillBorder: 'border-teal-200',   bgClass: 'bg-teal-50/60',   dotClass: 'bg-teal-400' },
  { pillBg: 'bg-cyan-100',   pillText: 'text-cyan-800',   pillBorder: 'border-cyan-200',   bgClass: 'bg-cyan-50/60',   dotClass: 'bg-cyan-400' },
];

const STATUT_CONFIG: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  a_faire:    { label: 'A faire',    bg: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
  en_cours:   { label: 'En cours',   bg: '#FFF7ED', color: '#C2410C', dot: '#F97316' },
  en_attente: { label: 'En attente', bg: '#EFF6FF', color: '#1E40AF', dot: '#3B82F6' },
  termine:    { label: 'Termine',    bg: '#ECFDF5', color: '#065F46', dot: '#10B981' },
  annule:     { label: 'Annule',     bg: '#FEF2F2', color: '#991B1B', dot: '#EF4444' },
};

const AVATAR_PALETTES = [
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
];

function getAvatarPalette(id: string): string {
  const hash = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

function getInitials(user: any): string {
  const first = (user?.firstName || '').charAt(0).toUpperCase();
  const last = (user?.lastName || '').charAt(0).toUpperCase();
  return (first + last) || '?';
}

function getDueLabel(dateEcheance: string | undefined): { label: string; cls: string } | null {
  if (!dateEcheance) return null;
  const due = new Date(dateEcheance);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff < 0) return { label: 'En retard', cls: 'text-red-500 font-medium' };
  if (diff === 0) return { label: "Aujourd'hui", cls: 'text-orange-500 font-medium' };
  const parts = dateEcheance.split('-');
  if (parts.length === 3) return { label: `${parts[2]}/${parts[1]}`, cls: 'text-gray-400' };
  return null;
}

const PRIO_BORDER: Record<string, string> = {
  urgente: 'border-l-[3px] border-l-red-500',
  haute: 'border-l-[3px] border-l-orange-500',
  normale: '',
  basse: '',
};

const PRIO_DOT: Record<string, string> = {
  urgente: 'bg-red-500',
  haute: 'bg-orange-500',
  normale: 'bg-blue-400',
  basse: 'bg-gray-300',
};

export default function AdminTachesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background">Chargement...</div>}>
      <AdminTachesPageContent />
    </Suspense>
  );
}

function AdminTachesPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkHandledRef = useRef<string | null>(null);

  const [tasks, setTasks] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'a_faire' | 'en_cours' | 'en_attente' | 'termine' | 'annule'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'basse' | 'normale' | 'haute' | 'urgente'>('all');
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<'all' | 'my' | 'others'>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'planning' | 'calendrier' | 'intake' | 'ma-journee'>('kanban');
  const [maJourneeCompleteExpanded, setMaJourneeCompleteExpanded] = useState(false);
  const [maJourneeAddMode, setMaJourneeAddMode] = useState(false);
  const [maJourneeNewTitle, setMaJourneeNewTitle] = useState('');
  const [kanbanGroupLabels, setKanbanGroupLabels] = useState<Record<string,string>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('kanbanGroupLabels') || '{}'); } catch { return {}; }
  });
  const [customKanbanGroups, setCustomKanbanGroups] = useState<Array<{key:string;label:string;colorIdx:number}>>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('customKanbanGroups') || '[]'); } catch { return []; }
  });
  const [renamingGroupKey, setRenamingGroupKey] = useState<string|null>(null);
  const [renamingGroupVal, setRenamingGroupVal] = useState('');
  const [addingKanbanGroup, setAddingKanbanGroup] = useState(false);
  const [newKanbanGroupName, setNewKanbanGroupName] = useState('');

  // ---- Planning / Calendrier ----
  const [plannerDate, setPlannerDate] = useState<Date>(new Date());
  const [plannerEvents, setPlannerEvents] = useState<CalEvent[]>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [calAnchor, setCalAnchor] = useState<Date>(new Date());
  const [calView, setCalView] = useState<'mois' | 'semaine' | 'membre'>('mois');
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [calStaff, setCalStaff] = useState<CalStaff[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [calSelectedDay, setCalSelectedDay] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    statut: 'a_faire',
    priorite: 'normale',
    assignedTo: [] as string[],
    dateEcheance: '',
    dateDebut: '',
    dossier: '',
    notes: '',
  });
  const [isMounted, setIsMounted] = useState(false);

  // Sous-taches
  const [sousTaches, setSousTaches] = useState<any[]>([]);
  const [newSousTacheTitle, setNewSousTacheTitle] = useState('');
  const [sousTacheLoading, setSousTacheLoading] = useState(false);

  // Fichiers et liens
  const [editPiecesJointes, setEditPiecesJointes] = useState<any[]>([]);
  const [editLiens, setEditLiens] = useState<any[]>([]);
  const [newLienUrl, setNewLienUrl] = useState('');
  const [newLienLabel, setNewLienLabel] = useState('');
  const [uploadingFichier, setUploadingFichier] = useState(false);

  // Commentaires
  const [commentaires, setCommentaires] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [activeCommentTab, setActiveCommentTab] = useState<'commentaire' | 'publication'>('commentaire');

  // Navigation panneau mobile
  const [mobilePanelTab, setMobilePanelTab] = useState<'champs' | 'commentaires'>('champs');

  // Expansion inline des sous-taches sur les cartes kanban
  const [expandedSousTaches, setExpandedSousTaches] = useState<Set<string>>(new Set());
  const [cardMenuId, setCardMenuId] = useState<string|null>(null);
  const [cardMenuPos, setCardMenuPos] = useState<{x:number;y:number}>({x:0,y:0});

  // Task Intake
  const [intakeTitle, setIntakeTitle] = useState('');
  const [intakePriority, setIntakePriority] = useState('normale');
  const [intakeDossier, setIntakeDossier] = useState('');
  const [intakeDate, setIntakeDate] = useState('');
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeTriageOpen, setIntakeTriageOpen] = useState<string | null>(null);
  const [intakePage, setIntakePage] = useState(0);
  const [dossierFilter, setDossierFilter] = useState('');
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  useEffect(() => { setIsMounted(true); }, []);

  const loadPlannerEvents = useCallback(async (date: Date) => {
    setPlannerLoading(true);
    const start = new Date(date); start.setHours(0,0,0,0);
    const end = new Date(date); end.setHours(23,59,59,999);
    const evts = await calFetchEvents(start, end);
    setPlannerEvents(evts);
    setPlannerLoading(false);
  }, []);

  const loadCalEvents = useCallback(async (anchor: Date, view: 'mois' | 'semaine' | 'membre') => {
    setCalLoading(true);
    let start: Date, end: Date;
    if (view === 'semaine') {
      start = new Date(anchor); const dow = (start.getDay()+6)%7; start.setDate(start.getDate()-dow); start.setHours(0,0,0,0);
      end = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
    } else {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      end = new Date(anchor.getFullYear(), anchor.getMonth()+1, 0, 23, 59, 59, 999);
    }
    const [evts, staff] = await Promise.all([calFetchEvents(start, end), calFetchStaff()]);
    setCalEvents(evts);
    if (staff.length) setCalStaff(staff);
    setCalLoading(false);
  }, []);

  useEffect(() => {
    if (viewMode === 'planning') loadPlannerEvents(plannerDate);
  }, [viewMode, plannerDate, loadPlannerEvents]);

  useEffect(() => {
    if (viewMode === 'calendrier') loadCalEvents(calAnchor, calView);
  }, [viewMode, calAnchor, calView, loadCalEvents]);

  const resetTaskForm = () => {
    setIsCreating(false);
    setEditingTask(null);
    setFormData({ titre: '', description: '', statut: 'a_faire', priorite: 'normale', assignedTo: [], dateEcheance: '', dateDebut: '', dossier: '', notes: '' });
    setSousTaches([]);
    setNewSousTacheTitle('');
    setCommentaires([]);
    setNewCommentText('');
    setCommentLoading(false);
    setActiveCommentTab('commentaire');
    setMobilePanelTab('champs');
  };

  useEffect(() => {
    if (!cardMenuId) return;
    const handler = (e: MouseEvent) => { setCardMenuId(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [cardMenuId]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session) {
      const userRole = (session.user as any)?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') router.push('/client');
    }
  }, [session, status, router]);

  useEffect(() => {
    if (status === 'authenticated' && ((session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin')) {
      loadTasks();
      loadTeamMembers();
      loadDossiers();
    }
  }, [session, status]);

  useEffect(() => {
    const taskId = searchParams.get('taskId')?.trim();
    if (!taskId || isLoading || tasks.length === 0) return;
    if (deepLinkHandledRef.current === taskId) return;
    const match = tasks.find((t: any) => String(t._id || t.id) === taskId);
    if (!match) return;
    deepLinkHandledRef.current = taskId;
    setStatusFilter('all');
    setPriorityFilter('all');
    setTaskCategoryFilter('all');
    setSearchTerm('');
    setExpandedTasks(new Set([taskId]));
    setHighlightedTaskId(taskId);
    setIsCreating(false);
    setEditingTask(null);
    requestAnimationFrame(() => {
      document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const clearHighlight = window.setTimeout(() => setHighlightedTaskId(null), 4000);
    return () => window.clearTimeout(clearHighlight);
  }, [searchParams, tasks, isLoading]);

  const loadTasks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await tasksAPI.getAllTasks();
      if (response.data.success) setTasks(response.data.tasks || []);
      else setError('Erreur lors du chargement des taches');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des taches');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const response = await userAPI.getAllUsers();
      if (response.data.success) {
        setTeamMembers((response.data.users || []).filter((u: any) => u.role === 'admin' || u.role === 'superadmin'));
      }
    } catch {}
  };

  const loadDossiers = async () => {
    try {
      const response = await dossiersAPI.getAllDossiers();
      if (response.data.success) setDossiers(response.data.dossiers || []);
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const taskData: any = {
        description: formData.description?.trim() || '',
        statut: formData.statut || 'a_faire',
        priorite: formData.priorite || 'normale',
        notes: formData.notes?.trim() || '',
      };
      if (formData.titre?.trim()) taskData.titre = formData.titre.trim();
      if (formData.assignedTo?.length > 0) taskData.assignedTo = formData.assignedTo;
      if (formData.dateEcheance) taskData.dateEcheance = formData.dateEcheance;
      if (formData.dateDebut) taskData.dateDebut = formData.dateDebut;
      if (formData.dossier) taskData.dossier = formData.dossier;

      let response;
      if (editingTask) {
        response = await tasksAPI.updateTask(editingTask._id || editingTask.id, taskData);
      } else {
        response = await tasksAPI.createTask(taskData);
      }
      if (response.data.success) {
        await loadTasks();
        resetTaskForm();
      }
    } catch (err: any) {
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        const msgs = err.response.data.errors.map((e: any) => `${e.param || e.field || 'Champ'}: ${e.msg || e.message}`).join(', ');
        setError(`Erreurs de validation: ${msgs}`);
      } else {
        setError(err.response?.data?.message || 'Erreur lors de la creation/modification de la tache');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditTask = (task: any) => {
    setEditingTask(task);
    const assignedToArray = Array.isArray(task.assignedTo)
      ? task.assignedTo.map((u: any) => u._id || u)
      : [task.assignedTo?._id || task.assignedTo].filter(Boolean);
    setFormData({
      titre: task.titre || '',
      description: task.description || '',
      statut: task.statut || 'a_faire',
      priorite: task.priorite || 'normale',
      assignedTo: assignedToArray,
      dateEcheance: task.dateEcheance ? new Date(task.dateEcheance).toISOString().split('T')[0] : '',
      dateDebut: task.dateDebut ? new Date(task.dateDebut).toISOString().split('T')[0] : '',
      dossier: task.dossier?._id || task.dossier || '',
      notes: task.notes || '',
    });
    setSousTaches(Array.isArray(task.sousTaches) ? task.sousTaches : []);
    setNewSousTacheTitle('');
    setEditPiecesJointes(Array.isArray(task.piecesJointes) ? task.piecesJointes : []);
    setEditLiens(Array.isArray(task.liens) ? task.liens : []);
    setNewLienUrl('');
    setNewLienLabel('');
    setCommentaires(Array.isArray(task.commentaires) ? task.commentaires : []);
    setNewCommentText('');
    setCommentLoading(false);
    setActiveCommentTab('commentaire');
    setIsCreating(true);
  };

  const handleAddSousTache = async () => {
    if (!editingTask || !newSousTacheTitle.trim() || sousTacheLoading) return;
    setSousTacheLoading(true);
    try {
      const res = await tasksAPI.addSousTache(editingTask._id || editingTask.id, { titre: newSousTacheTitle.trim() });
      if (res.data?.success) {
        setSousTaches(res.data.sousTaches || []);
        setNewSousTacheTitle('');
        await loadTasks();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de l\'ajout de la sous-tache');
    } finally {
      setSousTacheLoading(false);
    }
  };

  const handleToggleSousTache = async (stId: string, current: boolean) => {
    if (!editingTask || sousTacheLoading) return;
    setSousTacheLoading(true);
    try {
      const res = await tasksAPI.updateSousTache(editingTask._id || editingTask.id, stId, { complete: !current });
      if (res.data?.success) {
        setSousTaches(res.data.sousTaches || []);
        await loadTasks();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur');
    } finally {
      setSousTacheLoading(false);
    }
  };

  const handleDeleteSousTache = async (stId: string) => {
    if (!editingTask || sousTacheLoading) return;
    setSousTacheLoading(true);
    try {
      const res = await tasksAPI.deleteSousTache(editingTask._id || editingTask.id, stId);
      if (res.data?.success) {
        setSousTaches(res.data.sousTaches || []);
        await loadTasks();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur');
    } finally {
      setSousTacheLoading(false);
    }
  };

  const handleAddCommentaire = async () => {
    if (!editingTask || !newCommentText.trim() || commentLoading) return;
    setCommentLoading(true);
    try {
      const res = await tasksAPI.addNoteToTask(editingTask._id || editingTask.id, { contenu: newCommentText.trim() });
      if (res.data?.success) {
        setCommentaires(res.data.task?.commentaires || []);
        setNewCommentText('');
        await loadTasks();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de l\'ajout du commentaire');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDeleteCommentaire = async (noteId: string) => {
    if (!editingTask || commentLoading) return;
    setCommentLoading(true);
    try {
      const res = await tasksAPI.deleteNoteFromTask(editingTask._id || editingTask.id, noteId);
      if (res.data?.success) {
        setCommentaires(res.data.commentaires || []);
        await loadTasks();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la suppression');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleIntakeCreate = async () => {
    if (!intakeTitle.trim() || intakeLoading) return;
    setIntakeLoading(true);
    try {
      const payload: any = { titre: intakeTitle.trim(), statut: 'a_faire', priorite: intakePriority };
      if (intakeDossier) payload.dossier = intakeDossier;
      if (intakeDate) payload.dateEcheance = intakeDate;
      const res = await tasksAPI.createTask(payload);
      if (res.data.success) {
        setIntakeTitle('');
        setIntakeDate('');
        await loadTasks();
      }
    } catch {
      // ignore
    } finally {
      setIntakeLoading(false);
    }
  };

  const toggleCardSousTaches = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSousTaches(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleToggleCardSousTache = async (taskId: string, stId: string, currentComplete: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await tasksAPI.updateSousTache(taskId, stId, { complete: !currentComplete });
      await loadTasks();
    } catch {
      // silently ignore
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await tasksAPI.deleteTask(taskId);
      if (response.data.success) { await loadTasks(); setShowDeleteConfirm(null); }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la suppression');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRenameKanbanGroup = (key: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) { setRenamingGroupKey(null); return; }
    const updated = { ...kanbanGroupLabels, [key]: trimmed };
    setKanbanGroupLabels(updated);
    try { localStorage.setItem('kanbanGroupLabels', JSON.stringify(updated)); } catch {}
    setRenamingGroupKey(null);
  };

  const handleAddKanbanGroup = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) { setAddingKanbanGroup(false); setNewKanbanGroupName(''); return; }
    const key = `cg_${Date.now()}`;
    const colorIdx = customKanbanGroups.length % CUSTOM_GROUP_PALETTES.length;
    const updated = [...customKanbanGroups, { key, label: trimmed, colorIdx }];
    setCustomKanbanGroups(updated);
    try { localStorage.setItem('customKanbanGroups', JSON.stringify(updated)); } catch {}
    setAddingKanbanGroup(false);
    setNewKanbanGroupName('');
  };

  const handleDeleteKanbanGroup = (key: string) => {
    const updated = customKanbanGroups.filter(g => g.key !== key);
    setCustomKanbanGroups(updated);
    try { localStorage.setItem('customKanbanGroups', JSON.stringify(updated)); } catch {}
    const { [key]: _, ...rest } = kanbanGroupLabels;
    setKanbanGroupLabels(rest);
    try { localStorage.setItem('kanbanGroupLabels', JSON.stringify(rest)); } catch {}
  };

  const handleCardMenuDuplicate = async (task: any) => {
    setCardMenuId(null);
    try {
      await tasksAPI.createTask({
        titre: `${task.titre || 'Tache'} (copie)`,
        description: task.description,
        statut: task.statut || 'a_faire',
        priorite: task.priorite || 'normale',
        assignedTo: (task.assignedTo || []).map((a: any) => a?._id || a?.id || a).filter(Boolean),
        dateEcheance: task.dateEcheance,
        dossier: task.dossier?._id || task.dossier?.id || (typeof task.dossier === 'string' ? task.dossier : undefined),
        notes: task.notes,
      });
      await loadTasks();
    } catch {}
  };

  const handleCardMenuArchive = async (task: any) => {
    setCardMenuId(null);
    try {
      await tasksAPI.updateTask(task._id || task.id, { archived: true });
      await loadTasks();
    } catch {}
  };

  const handleCardMenuAddToMaJournee = async (task: any) => {
    setCardMenuId(null);
    try {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      await tasksAPI.updateTask(task._id || task.id, { dateEcheance: today.toISOString() });
      await loadTasks();
    } catch {}
  };

  const handleCardMenuMove = async (task: any, statut: string) => {
    setCardMenuId(null);
    try {
      await tasksAPI.updateTask(task._id || task.id, { statut, kanbanGroup: null });
      await loadTasks();
    } catch {}
  };

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      const task = tasks.find((t: any) => (t._id || t.id) === taskId);
      const upd: any = { statut: newStatus };
      if (task?.kanbanGroup) upd.kanbanGroup = null;
      const response = await tasksAPI.updateTask(taskId, upd);
      if (response.data.success) await loadTasks();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise a jour du statut');
    }
  };

  const handleUpdatePriority = async (taskId: string, newPriority: string) => {
    try {
      const response = await tasksAPI.updateTask(taskId, { priorite: newPriority });
      if (response.data.success) await loadTasks();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise a jour de la priorite');
    }
  };

  const handleUpdateAssignment = async (taskId: string, assignedTo: string[]) => {
    try {
      const response = await tasksAPI.updateTask(taskId, { assignedTo });
      if (response.data.success) await loadTasks();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise a jour de l\'assignation');
    }
  };

  const handleMarkAsDone = async (taskId: string, done: boolean) => {
    try {
      const response = await tasksAPI.updateTask(taskId, { effectue: done, statut: done ? 'termine' : 'a_faire' });
      if (response.data.success) await loadTasks();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise a jour');
    }
  };

  const toggleAssignee = (userId: string) => {
    setFormData(prev => {
      const current = prev.assignedTo || [];
      return current.includes(userId)
        ? { ...prev, assignedTo: current.filter(id => id !== userId) }
        : { ...prev, assignedTo: [...current, userId] };
    });
  };

  const openCreateForColumn = (colKey: string) => {
    setEditingTask(null);
    setFormData({ titre: '', description: '', statut: colKey, priorite: 'normale', assignedTo: [], dateEcheance: '', dateDebut: '', dossier: '', notes: '' });
    setIsCreating(true);
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!session || ((session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin')) {
    return null;
  }

  const filteredTasks = tasks.filter((task: any) => {
    if (taskCategoryFilter === 'my') {
      const arr = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo].filter(Boolean);
      const uid = (session?.user as any)?._id || (session?.user as any)?.id;
      const mine = arr.some((a: any) => (a?._id || a?.id || a)?.toString() === uid?.toString());
      if (!mine) return false;
    } else if (taskCategoryFilter === 'others') {
      const arr = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo].filter(Boolean);
      const uid = (session?.user as any)?._id || (session?.user as any)?.id;
      const mine = arr.some((a: any) => (a?._id || a?.id || a)?.toString() === uid?.toString());
      if (mine) return false;
    }
    if (viewMode === 'list' && statusFilter !== 'all' && task.statut !== statusFilter) return false;
    if (priorityFilter !== 'all' && task.priorite !== priorityFilter) return false;
    if (dossierFilter) {
      const dosId = task.dossier?._id || task.dossier?.id || (typeof task.dossier === 'string' ? task.dossier : null);
      if (!dosId || String(dosId) !== dossierFilter) return false;
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!task.titre?.toLowerCase().includes(s) && !task.description?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const activeTasks = tasks.filter((t: any) => t.statut === 'a_faire' || t.statut === 'en_cours');

  return (
    <div className="min-h-screen bg-gray-50/40">
      <main className="w-full px-3 sm:px-4 lg:px-6 py-6">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div>
            <h1 className="text-2xl font-medium text-gray-900">Taches</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Toutes les taches de l'equipe
              {activeTasks.length > 0 && (
                <span className="ml-2 text-orange-600 font-medium">({activeTasks.length} actives)</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle vue */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${viewMode === 'kanban' ? 'bg-orange-50 text-orange-600 font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="1" y="1" width="4" height="14" rx="1" fill="currentColor" opacity=".9"/>
                  <rect x="6" y="1" width="4" height="14" rx="1" fill="currentColor" opacity=".6"/>
                  <rect x="11" y="1" width="4" height="14" rx="1" fill="currentColor" opacity=".3"/>
                </svg>
                Kanban
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 text-sm flex items-center gap-1.5 border-l border-gray-200 transition-colors ${viewMode === 'list' ? 'bg-orange-50 text-orange-600 font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="1" y="2" width="14" height="2" rx="1" fill="currentColor"/>
                  <rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor" opacity=".6"/>
                  <rect x="1" y="12" width="14" height="2" rx="1" fill="currentColor" opacity=".3"/>
                </svg>
                Liste
              </button>
              <button
                onClick={() => setViewMode('planning')}
                className={`px-3 py-2 text-sm flex items-center gap-1.5 border-l border-gray-200 transition-colors ${viewMode === 'planning' ? 'bg-orange-50 text-orange-600 font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Planning
              </button>
              <button
                onClick={() => setViewMode('ma-journee')}
                className={`px-3 py-2 text-sm flex items-center gap-1.5 border-l border-gray-200 transition-colors ${viewMode === 'ma-journee' ? 'bg-orange-50 text-orange-600 font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Ma journee
              </button>
              <button
                onClick={() => setViewMode('calendrier')}
                className={`px-3 py-2 text-sm flex items-center gap-1.5 border-l border-gray-200 transition-colors ${viewMode === 'calendrier' ? 'bg-orange-50 text-orange-600 font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="1.5" y="3" width="13" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Calendrier
              </button>
              <button
                onClick={() => setViewMode('intake')}
                className={`px-3 py-2 text-sm flex items-center gap-1.5 border-l border-gray-200 transition-colors relative ${viewMode === 'intake' ? 'bg-orange-50 text-orange-600 font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1v9M8 10l-3-3M8 10l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1.5 12v1.5A1 1 0 0 0 2.5 14.5h11a1 1 0 0 0 1-1V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Intake
                {(() => {
                  const n = tasks.filter((t: any) => (!Array.isArray(t.assignedTo) || t.assignedTo.length === 0) && t.statut !== 'termine' && t.statut !== 'annule').length;
                  return n > 0 ? (
                    <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                      {n > 99 ? '99+' : n}
                    </span>
                  ) : null;
                })()}
              </button>
            </div>
            <Button onClick={() => { setEditingTask(null); setFormData({ titre: '', description: '', statut: 'a_faire', priorite: 'normale', assignedTo: [], dateEcheance: '', dateDebut: '', dossier: '', notes: '' }); setIsCreating(true); }} className="h-9 px-4 text-sm">
              + Nouvelle tache
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="text-gray-400 flex-shrink-0">
              <path d="M10 6.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Zm-.826 3.674a4.5 4.5 0 1 1 .707-.707l3.173 3.173a.5.5 0 0 1-.707.707L9.174 10.174Z" fill="currentColor"/>
            </svg>
            <input
              type="text"
              placeholder="Chercher une tache, un client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border-none bg-transparent text-sm outline-none w-full text-gray-900 placeholder:text-gray-400"
            />
          </div>
          <select
            value={taskCategoryFilter}
            onChange={(e) => setTaskCategoryFilter(e.target.value as any)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
          >
            <option value="all">Tous les membres</option>
            <option value="my">Mes taches</option>
            <option value="others">Autres taches</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
          >
            <option value="all">Toutes les priorites</option>
            <option value="urgente">Urgente</option>
            <option value="haute">Haute</option>
            <option value="normale">Normale</option>
            <option value="basse">Basse</option>
          </select>
          <select
            value={dossierFilter}
            onChange={(e) => setDossierFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 max-w-[200px]"
          >
            <option value="">Tous les dossiers</option>
            {dossiers.map((d: any) => {
              const cn = d.user ? `${d.user.firstName || ''} ${d.user.lastName || ''}`.trim() : `${d.clientPrenom || ''} ${d.clientNom || ''}`.trim();
              const lbl = [d.numero || d.titre, cn].filter(Boolean).join(' - ');
              return <option key={d._id||d.id} value={d._id||d.id}>{lbl || String(d._id).slice(-6)}</option>;
            })}
          </select>
          {viewMode === 'list' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
            >
              <option value="all">Tous les statuts</option>
              <option value="a_faire">A faire</option>
              <option value="en_cours">En cours</option>
              <option value="en_attente">En attente</option>
              <option value="termine">Termine</option>
              <option value="annule">Annule</option>
            </select>
          )}
          <button
            onClick={loadTasks}
            className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-500 hover:bg-gray-50 transition-colors"
            title="Actualiser"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path d="M7.5 1a6.5 6.5 0 1 0 6.5 6.5h-1a5.5 5.5 0 1 1-5.5-5.5V4L10 1.5 7.5 0V1Z" fill="currentColor"/>
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">&#x26A0;</span>
            <span>{error}</span>
          </div>
        )}

        {/* ---- Vue Kanban ---- */}
        {viewMode === 'kanban' && (
          <div className="overflow-x-auto pb-4 -mx-1 px-1 min-h-[calc(100dvh-280px)]">
            {isLoading ? (
              <div className="text-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Chargement des taches...</p>
              </div>
            ) : (
              <div className="flex gap-3 min-w-[860px] items-start">
                {[
                  ...KANBAN_COLUMNS.map(c => ({ ...c, isCustom: false as const })),
                  ...customKanbanGroups.map(g => {
                    const p = CUSTOM_GROUP_PALETTES[g.colorIdx % CUSTOM_GROUP_PALETTES.length];
                    return { key: g.key, label: g.label, isCustom: true as const, ...p };
                  }),
                ].map((col) => {
                  const effectiveLabel = kanbanGroupLabels[col.key] || col.label;
                  const colTasks = filteredTasks.filter((t: any) => {
                    if (col.isCustom) return t.kanbanGroup === col.key;
                    if (t.kanbanGroup) return false;
                    return col.key === 'termine'
                      ? t.statut === 'termine' || t.statut === 'annule'
                      : t.statut === col.key;
                  }).sort((a: any, b: any) => {
                    const prioOrder: {[k:string]:number} = { urgente: 0, haute: 1, normale: 2, basse: 3 };
                    return (prioOrder[a.priorite] ?? 2) - (prioOrder[b.priorite] ?? 2);
                  });

                  const dropTarget = col.isCustom ? col.key : (col.key === 'termine' ? 'termine' : col.key);

                  const colIcon = col.isCustom
                    ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M2 2h5l4 4.5L7 11H2V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                    : col.key === 'a_faire'
                    ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.4"/></svg>
                    : col.key === 'en_cours'
                    ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="8 6"/></svg>
                    : col.key === 'en_attente'
                    ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6.5 3.5v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3.5 6.5l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;

                  const prioCls: {[k:string]:string} = {
                    urgente: 'text-red-500',
                    haute:   'text-orange-500',
                    normale: 'text-blue-400',
                    basse:   'text-gray-400',
                  };
                  const prioLabel: {[k:string]:string} = {
                    urgente: 'Urgente',
                    haute:   'Elevee',
                    normale: 'Normale',
                    basse:   'Basse',
                  };

                  return (
                    <div
                      key={col.key}
                      className={`rounded-xl ${col.bgClass} border border-gray-200/60 p-3 flex flex-col transition-all flex-1 min-w-[200px] ${dragTaskId ? 'ring-1 ring-dashed ring-gray-300' : ''}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragTaskId) {
                          if (col.isCustom) {
                            tasksAPI.updateTask(dragTaskId, { kanbanGroup: col.key }).then(() => loadTasks()).catch(() => {});
                          } else {
                            const task = tasks.find((t: any) => (t._id || t.id) === dragTaskId);
                            if (task) {
                              const upd: any = { statut: dropTarget };
                              if (task.kanbanGroup) upd.kanbanGroup = null;
                              tasksAPI.updateTask(dragTaskId, upd).then(() => loadTasks()).catch(() => {});
                            }
                          }
                          setDragTaskId(null);
                        }
                      }}
                    >
                      {/* Column header */}
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border tracking-wide flex-1 min-w-0 ${col.pillBg} ${col.pillText} ${col.pillBorder}`}>
                          {colIcon}
                          {renamingGroupKey === col.key ? (
                            <input
                              autoFocus
                              value={renamingGroupVal}
                              onChange={e => setRenamingGroupVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); handleRenameKanbanGroup(col.key, renamingGroupVal); }
                                if (e.key === 'Escape') setRenamingGroupKey(null);
                              }}
                              onBlur={() => handleRenameKanbanGroup(col.key, renamingGroupVal)}
                              onClick={e => e.stopPropagation()}
                              className="bg-transparent border-b border-current outline-none w-20 min-w-0"
                            />
                          ) : (
                            <button
                              onClick={() => { setRenamingGroupKey(col.key); setRenamingGroupVal(effectiveLabel); }}
                              className="truncate hover:opacity-70 transition-opacity text-left"
                              title="Cliquer pour renommer"
                            >
                              {effectiveLabel.toUpperCase()}
                            </button>
                          )}
                          <span className="font-bold ml-0.5 shrink-0">{colTasks.length}</span>
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {col.isCustom && (
                            <button
                              onClick={() => handleDeleteKanbanGroup(col.key)}
                              className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors text-sm"
                              title="Supprimer ce groupe"
                            >
                              &times;
                            </button>
                          )}
                          <button
                            onClick={() => openCreateForColumn(col.isCustom ? 'a_faire' : (col.key === 'termine' ? 'termine' : col.key))}
                            className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors text-lg leading-none shadow-sm"
                            title={`Ajouter dans ${effectiveLabel}`}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Cards */}
                      <div className="flex flex-col gap-2 flex-1">
                        {colTasks.length === 0 ? (
                          <div className="flex-1 flex items-center justify-center py-8">
                            <p className="text-xs text-gray-400 text-center">Aucune tache</p>
                          </div>
                        ) : (
                          colTasks.map((task: any) => {
                            const taskId = task._id || task.id;
                            const isHighlighted = highlightedTaskId === taskId;
                            const assignees = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo].filter(Boolean);
                            const due = getDueLabel(task.dateEcheance ? new Date(task.dateEcheance).toISOString().split('T')[0] : undefined);
                            const dossierRef = task.dossier?.numero || task.dossier?.titre || null;
                            const isDone = task.statut === 'termine' || task.statut === 'annule';

                            return (
                              <div
                                key={taskId}
                                id={`task-${taskId}`}
                                draggable
                                onDragStart={() => setDragTaskId(taskId)}
                                onDragEnd={() => setDragTaskId(null)}
                                className={`bg-white rounded-xl border shadow-sm p-3 cursor-grab active:cursor-grabbing transition-all ${isHighlighted ? 'ring-2 ring-orange-400 border-orange-300' : 'border-gray-100 hover:border-gray-300 hover:shadow-md'} ${isDone ? 'opacity-55' : ''} ${dragTaskId === taskId ? 'opacity-40 scale-95' : ''}`}
                                onClick={() => handleEditTask(task)}
                              >
                                {/* Title */}
                                <p className={`text-sm font-medium text-gray-800 leading-snug mb-2.5 ${isDone ? 'line-through text-gray-400' : ''}`}>
                                  {task.titre || task.description?.slice(0, 80) || 'Tache sans titre'}
                                </p>

                                {/* Dossier chip */}
                                {dossierRef && (
                                  <span className="inline-block text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-md px-2 py-0.5 font-medium mb-2">
                                    {dossierRef}
                                  </span>
                                )}

                                {/* Sous-taches */}
                                {Array.isArray(task.sousTaches) && task.sousTaches.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => toggleCardSousTaches(taskId, e)}
                                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2.5"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                      <path d="M2 3h10M5 7h7M7 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                    </svg>
                                    {task.sousTaches.filter((s: any) => s.complete).length}/{task.sousTaches.length} sous-taches
                                  </button>
                                )}

                                {/* Footer: avatars | date | priority | edit */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  {assignees.slice(0, 3).map((a: any, i: number) => {
                                    const uid = a?._id || a?.id || a;
                                    const member = teamMembers.find((m) => (m._id || m.id) === uid) || a;
                                    const palette = getAvatarPalette(String(uid || i));
                                    return (
                                      <span
                                        key={i}
                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${palette}`}
                                        title={`${member?.firstName || ''} ${member?.lastName || ''}`.trim()}
                                      >
                                        {getInitials(member)}
                                      </span>
                                    );
                                  })}
                                  {assignees.length > 3 && (
                                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-medium">
                                      +{assignees.length - 3}
                                    </span>
                                  )}

                                  {due && (
                                    <span className={`flex items-center gap-1 text-xs ${due.cls} ml-auto`}>
                                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                        <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                                        <path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                      </svg>
                                      {due.label}
                                    </span>
                                  )}

                                  <span className={`flex items-center gap-1 text-xs font-medium ${prioCls[task.priorite] || 'text-gray-400'}`}>
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                      <path d="M2 10V2h8l-3 4 3 4H2Z" fill="currentColor" opacity=".15" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                                    </svg>
                                    {prioLabel[task.priorite] || 'Normale'}
                                  </span>

                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleEditTask(task); }}
                                    className="ml-auto w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                                    title="Modifier"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                      <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                                    </svg>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                      setCardMenuPos({ x: rect.left, y: rect.top });
                                      setCardMenuId(cardMenuId === taskId ? null : taskId);
                                    }}
                                    className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                                    title="Plus d'options"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                      <circle cx="6" cy="2" r="1" fill="currentColor"/>
                                      <circle cx="6" cy="6" r="1" fill="currentColor"/>
                                      <circle cx="6" cy="10" r="1" fill="currentColor"/>
                                    </svg>
                                  </button>
                                </div>

                                {/* Sous-taches depliees */}
                                {expandedSousTaches.has(taskId) && Array.isArray(task.sousTaches) && task.sousTaches.length > 0 && (
                                  <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                                    {task.sousTaches.map((st: any) => (
                                      <div key={st._id} className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={(e) => handleToggleCardSousTache(taskId, st._id, st.complete, e)}
                                          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${st.complete ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-orange-400'}`}
                                        >
                                          {st.complete && (
                                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
                                              <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                          )}
                                        </button>
                                        <span className={`text-xs flex-1 min-w-0 truncate ${st.complete ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                                          {st.titre}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Add button bottom */}
                      <button
                        onClick={() => openCreateForColumn(col.key === 'termine' ? 'termine' : col.key)}
                        className="mt-3 flex items-center gap-1.5 w-full px-3 py-2 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 hover:text-gray-600 hover:bg-white/70 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        Ajouter une tache
                      </button>
                    </div>
                  );
                })}

                {/* Bouton ajout de groupe */}
                {!addingKanbanGroup ? (
                  <button
                    onClick={() => setAddingKanbanGroup(true)}
                    className="shrink-0 flex flex-col items-center justify-center gap-2 w-10 self-stretch rounded-xl border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
                    title="Ajouter un groupe"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                ) : (
                  <div className="shrink-0 w-52 bg-white rounded-xl border border-gray-200 p-3 shadow-sm self-start">
                    <p className="text-xs font-medium text-gray-600 mb-2">Nouveau groupe</p>
                    <input
                      autoFocus
                      value={newKanbanGroupName}
                      onChange={e => setNewKanbanGroupName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleAddKanbanGroup(newKanbanGroupName); }
                        if (e.key === 'Escape') { setAddingKanbanGroup(false); setNewKanbanGroupName(''); }
                      }}
                      placeholder="Nom du groupe..."
                      className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-orange-400 focus:outline-none mb-2"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleAddKanbanGroup(newKanbanGroupName)} className="flex-1 text-xs py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors font-medium">Creer</button>
                      <button onClick={() => { setAddingKanbanGroup(false); setNewKanbanGroupName(''); }} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---- Vue Liste ---- */}
        {viewMode === 'list' && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-6">
            {isLoading ? (
              <div className="text-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500 mx-auto mb-3" />
                <p className="text-gray-500">Chargement des taches...</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-gray-400">
                    <rect x="4" y="6" width="20" height="3" rx="1.5" fill="currentColor" opacity=".3"/>
                    <rect x="4" y="12" width="20" height="3" rx="1.5" fill="currentColor" opacity=".5"/>
                    <rect x="4" y="18" width="14" height="3" rx="1.5" fill="currentColor" opacity=".7"/>
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">
                  {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all'
                    ? 'Aucune tache ne correspond aux filtres'
                    : 'Aucune tache trouvee'}
                </p>
                {!searchTerm && statusFilter === 'all' && priorityFilter === 'all' && (
                  <p className="text-sm text-gray-400 mt-1">Creez votre premiere tache</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task) => {
                  const taskId = task._id || task.id;
                  const isExpanded = expandedTasks.has(taskId);
                  return (
                    <TaskListItem
                      key={taskId}
                      task={task}
                      mode="admin"
                      variant="full"
                      expanded={isExpanded}
                      highlighted={highlightedTaskId === taskId}
                      disabled={isLoading}
                      teamMembers={teamMembers}
                      dossierBasePath="/admin/dossiers"
                      onToggleExpand={() => {
                        const next = new Set(expandedTasks);
                        if (next.has(taskId)) next.delete(taskId);
                        else next.add(taskId);
                        setExpandedTasks(next);
                      }}
                      onMarkDone={(done) => handleMarkAsDone(taskId, done)}
                      onEdit={() => handleEditTask(task)}
                      onDelete={() => setShowDeleteConfirm(taskId)}
                      onUpdateStatus={(statut) => handleUpdateStatus(taskId, statut)}
                      onUpdatePriority={(priorite) => handleUpdatePriority(taskId, priorite)}
                      onUpdateAssignees={(ids) => handleUpdateAssignment(taskId, ids)}
                    />
                  );
                })}
              </div>
            )}
            {!isLoading && filteredTasks.length > 0 && (
              <div className="mt-5 pt-4 border-t flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Total: <span className="font-medium text-gray-900">{filteredTasks.length}</span> tache{filteredTasks.length > 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---- Vue Daily Planner ---- */}
        {viewMode === 'planning' && (() => {
          const todayTasks = tasks.filter((t: any) => {
            const due = t.dateEcheance ? calIsoDate(new Date(t.dateEcheance)) : null;
            return due === calIsoDate(plannerDate) && t.statut !== 'annule';
          });
          const HOURS = Array.from({length: 15}, (_, i) => i + 7);
          const dayLabel = plannerDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const isToday = calIsoDate(plannerDate) === calIsoDate(new Date());
          const prevDay = () => { const d = new Date(plannerDate); d.setDate(d.getDate()-1); setPlannerDate(d); };
          const nextDay = () => { const d = new Date(plannerDate); d.setDate(d.getDate()+1); setPlannerDate(d); };
          const eventsWithTime = plannerEvents.filter(e => e.heure);
          const eventsAllDay = plannerEvents.filter(e => !e.heure);
          const getHour = (h: string) => parseInt(h.split(':')[0], 10);
          return (
            <div className="flex gap-4">
              {/* Panel principal : grille horaire */}
              <div className="flex-1 min-w-0 bg-white rounded-xl border border-gray-100 overflow-hidden">
                {/* En-tete date */}
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button onClick={prevDay} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <h2 className="text-sm font-semibold text-gray-800 capitalize">{dayLabel}</h2>
                    <button onClick={nextDay} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 11l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isToday && (
                      <button onClick={() => setPlannerDate(new Date())} className="text-xs px-3 py-1 rounded-full border border-orange-200 text-orange-600 hover:bg-orange-50">Aujourd'hui</button>
                    )}
                    {isToday && <span className="text-xs px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">Aujourd'hui</span>}
                    {plannerLoading && <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin"/>}
                  </div>
                </div>

                {/* Section tout-le-jour */}
                {(eventsAllDay.length > 0 || todayTasks.length > 0) && (
                  <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 font-semibold">Toute la journee</p>
                    <div className="flex flex-col gap-1.5">
                      {todayTasks.map((t: any) => {
                        const cfg = STATUT_CONFIG[t.statut] || STATUT_CONFIG.a_faire;
                        return (
                          <button key={t._id||t.id} onClick={() => handleEditTask(t)} className="text-left flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-white border border-transparent hover:border-gray-200 transition-colors group">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background: cfg.dot}}/>
                            <span className="flex-1 min-w-0 truncate font-medium text-gray-700">{t.titre || 'Tache sans titre'}</span>
                            <span className="text-gray-400 text-[10px] opacity-0 group-hover:opacity-100">Tache</span>
                          </button>
                        );
                      })}
                      {eventsAllDay.map(e => (
                        <div key={e.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs border ${CAL_TYPE_STYLE[e.type] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          <span className="flex-1 min-w-0 truncate font-medium">{e.titre}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grille horaire */}
                <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
                  {HOURS.map(h => {
                    const hStr = `${String(h).padStart(2,'0')}:00`;
                    const slotEvents = eventsWithTime.filter(e => getHour(e.heure || '') === h);
                    const nowH = new Date().getHours();
                    const isCurrentHour = isToday && nowH === h;
                    return (
                      <div
                        key={h}
                        className={`flex min-h-[52px] border-b border-gray-50 cursor-pointer group/slot ${isCurrentHour ? 'bg-orange-50/40' : 'hover:bg-gray-50/60'}`}
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            titre: '',
                            statut: 'a_faire',
                            priorite: 'normale',
                            assignedTo: [],
                            dateEcheance: calIsoDate(plannerDate),
                            dateDebut: calIsoDate(plannerDate),
                            dossier: '',
                            notes: '',
                          }));
                          setEditingTask(null);
                          setIsCreating(true);
                        }}
                      >
                        <div className="w-14 flex-shrink-0 px-3 pt-2">
                          <span className={`text-[11px] font-medium ${isCurrentHour ? 'text-orange-500' : 'text-gray-300'}`}>{hStr}</span>
                        </div>
                        <div className="flex-1 pr-3 pt-1.5 pb-1 flex flex-col gap-1">
                          {slotEvents.map(e => (
                            <div key={e.id} className={`rounded-lg px-2.5 py-1.5 text-xs border ${CAL_TYPE_STYLE[e.type] || 'bg-blue-100 text-blue-800 border-blue-200'}`}>
                              <span className="font-semibold">{e.heure}{e.heureFin ? ` - ${e.heureFin}` : ''}</span>
                              <span className="ml-2">{e.titre}</span>
                              {e.details && <p className="text-[10px] mt-0.5 opacity-75 truncate">{e.details}</p>}
                            </div>
                          ))}
                          {isCurrentHour && slotEvents.length === 0 && (
                            <div className="h-0.5 bg-orange-400 rounded-full opacity-60 mt-1"/>
                          )}
                          {!isCurrentHour && slotEvents.length === 0 && (
                            <span className="text-[10px] text-gray-300 opacity-0 group-hover/slot:opacity-100 transition-opacity">+ Ajouter une tache</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Panel lateral : mini calendrier + taches a faire */}
              <div className="w-72 shrink-0 flex flex-col gap-3 hidden lg:flex">
                {/* Mini calendrier du mois */}
                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => { const d = new Date(plannerDate); d.setMonth(d.getMonth()-1); setPlannerDate(d); }} className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 text-gray-400">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <span className="text-xs font-semibold text-gray-700">{CAL_MOIS[plannerDate.getMonth()]} {plannerDate.getFullYear()}</span>
                    <button onClick={() => { const d = new Date(plannerDate); d.setMonth(d.getMonth()+1); setPlannerDate(d); }} className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 text-gray-400">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-0 mb-1">
                    {CAL_JOURS.map(j => <div key={j} className="text-[9px] text-gray-400 text-center font-medium py-0.5">{j[0]}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {calBuildMonthGrid(plannerDate.getFullYear(), plannerDate.getMonth()).map((d, i) => {
                      const iso = calIsoDate(d);
                      const isSelected = iso === calIsoDate(plannerDate);
                      const isT = iso === calIsoDate(new Date());
                      const inMonth = d.getMonth() === plannerDate.getMonth();
                      const hasTasks = tasks.some((t: any) => t.dateEcheance && calIsoDate(new Date(t.dateEcheance)) === iso);
                      return (
                        <button key={i} onClick={() => setPlannerDate(new Date(d))} className={`w-full aspect-square rounded-md text-[11px] font-medium flex flex-col items-center justify-center relative transition-colors ${isSelected ? 'bg-orange-500 text-white' : isT ? 'text-orange-600 font-bold' : inMonth ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-gray-50'}`}>
                          {d.getDate()}
                          {hasTasks && !isSelected && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-orange-400"/>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Taches a faire */}
                <div className="bg-white rounded-xl border border-gray-100 p-3 flex-1">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Taches en cours</p>
                  <div className="flex flex-col gap-1.5 overflow-y-auto max-h-48">
                    {tasks.filter((t: any) => t.statut === 'a_faire' || t.statut === 'en_cours').slice(0, 10).map((t: any) => {
                      const cfg = STATUT_CONFIG[t.statut] || STATUT_CONFIG.a_faire;
                      return (
                        <button key={t._id||t.id} onClick={() => { setViewMode('kanban'); handleEditTask(t); }} className="text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group text-xs">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background: cfg.dot}}/>
                          <span className="flex-1 min-w-0 truncate text-gray-700">{t.titre || 'Sans titre'}</span>
                        </button>
                      );
                    })}
                    {tasks.filter((t: any) => t.statut === 'a_faire' || t.statut === 'en_cours').length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Aucune tache active</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ---- Vue Calendrier equipe ---- */}
        {viewMode === 'calendrier' && (() => {
          const year = calAnchor.getFullYear();
          const month = calAnchor.getMonth();
          const byDate: Record<string, CalEvent[]> = {};
          for (const e of calEvents) {
            const k = calIsoDate(new Date(e.date));
            if (!byDate[k]) byDate[k] = [];
            byDate[k].push(e);
          }
          const selectedDayEvents = calSelectedDay ? (byDate[calSelectedDay] || []) : [];
          const todayIso = calIsoDate(new Date());

          const prevPeriod = () => {
            const d = new Date(calAnchor);
            if (calView === 'semaine') d.setDate(d.getDate()-7);
            else d.setMonth(d.getMonth()-1);
            setCalAnchor(d);
          };
          const nextPeriod = () => {
            const d = new Date(calAnchor);
            if (calView === 'semaine') d.setDate(d.getDate()+7);
            else d.setMonth(d.getMonth()+1);
            setCalAnchor(d);
          };

          const weekDays = (() => {
            const mon = new Date(calAnchor);
            const dow = (mon.getDay()+6)%7;
            mon.setDate(mon.getDate()-dow);
            return Array.from({length:7}, (_,i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return d; });
          })();

          return (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {/* Header calendrier */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <button onClick={prevPeriod} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <h2 className="text-sm font-semibold text-gray-800 min-w-[160px] text-center">
                    {calView === 'semaine'
                      ? `Sem. ${weekDays[0].getDate()} - ${weekDays[6].getDate()} ${CAL_MOIS[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
                      : `${CAL_MOIS[month]} ${year}`}
                  </h2>
                  <button onClick={nextPeriod} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 11l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <button onClick={() => setCalAnchor(new Date())} className="ml-1 text-xs px-3 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50">Aujourd'hui</button>
                  {calLoading && <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin ml-1"/>}
                </div>
                <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                  {(['mois','semaine','membre'] as const).map((v, i) => (
                    <button key={v} onClick={() => setCalView(v)} className={`px-3 py-1.5 text-xs transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${calView === v ? 'bg-orange-50 text-orange-600 font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {v.charAt(0).toUpperCase()+v.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vue Mois */}
              {calView === 'mois' && (
                <div className="flex">
                  <div className="flex-1 min-w-0">
                    {/* Jours de la semaine */}
                    <div className="grid grid-cols-7 border-b border-gray-100">
                      {CAL_JOURS.map(j => (
                        <div key={j} className="py-2 text-center text-xs font-medium text-gray-400">{j}</div>
                      ))}
                    </div>
                    {/* Grille mois */}
                    <div className="grid grid-cols-7">
                      {calBuildMonthGrid(year, month).map((d, i) => {
                        const iso = calIsoDate(d);
                        const evts = byDate[iso] || [];
                        const inMonth = d.getMonth() === month;
                        const isT = iso === todayIso;
                        const isSel = iso === calSelectedDay;
                        return (
                          <div key={i} onClick={() => setCalSelectedDay(iso === calSelectedDay ? null : iso)} className={`min-h-[80px] border-b border-r border-gray-50 p-1.5 cursor-pointer transition-colors ${isSel ? 'bg-orange-50' : 'hover:bg-gray-50'} ${!inMonth ? 'opacity-40' : ''}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mb-1 ${isT ? 'bg-orange-500 text-white' : 'text-gray-600'}`}>{d.getDate()}</div>
                            {evts.slice(0,3).map(e => (
                              <div key={e.id} className={`text-[10px] rounded px-1 py-0.5 mb-0.5 truncate border ${CAL_TYPE_STYLE[e.type] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>{e.titre}</div>
                            ))}
                            {evts.length > 3 && <div className="text-[10px] text-gray-400 pl-1">+{evts.length-3}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Panel detail jour */}
                  {calSelectedDay && (
                    <div className="w-64 shrink-0 border-l border-gray-100 p-3 overflow-y-auto max-h-[600px]">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-gray-700">{new Date(calSelectedDay+'T12:00:00').toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'})}</p>
                        <button onClick={() => setCalSelectedDay(null)} className="w-5 h-5 text-gray-400 hover:text-gray-600">&times;</button>
                      </div>
                      {selectedDayEvents.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">Aucun evenement</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {selectedDayEvents.sort((a,b) => (a.heure||'').localeCompare(b.heure||'')).map(e => (
                            <div key={e.id} className={`rounded-lg p-2 border ${CAL_TYPE_STYLE[e.type] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                              {e.heure && <p className="text-[10px] font-semibold mb-0.5">{e.heure}{e.heureFin ? ` - ${e.heureFin}` : ''}</p>}
                              <p className="text-xs font-medium truncate">{e.titre}</p>
                              {e.details && <p className="text-[10px] opacity-75 mt-0.5 truncate">{e.details}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Vue Semaine */}
              {calView === 'semaine' && (
                <div>
                  <div className="grid grid-cols-7 border-b border-gray-100">
                    {weekDays.map((d, i) => {
                      const iso = calIsoDate(d);
                      const isT = iso === todayIso;
                      return (
                        <div key={i} className={`py-2 text-center border-r border-gray-50 last:border-0 ${isT ? 'bg-orange-50' : ''}`}>
                          <div className="text-[10px] text-gray-400">{CAL_JOURS[i]}</div>
                          <div className={`text-sm font-semibold mt-0.5 ${isT ? 'text-orange-600' : 'text-gray-700'}`}>{d.getDate()}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-7 min-h-[300px]">
                    {weekDays.map((d, i) => {
                      const iso = calIsoDate(d);
                      const evts = byDate[iso] || [];
                      const isT = iso === todayIso;
                      return (
                        <div key={i} className={`border-r border-gray-50 last:border-0 p-1.5 ${isT ? 'bg-orange-50/30' : ''}`}>
                          {evts.map(e => (
                            <div key={e.id} className={`rounded-md px-1.5 py-1 mb-1 text-[10px] border ${CAL_TYPE_STYLE[e.type] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                              {e.heure && <span className="font-semibold mr-1">{e.heure}</span>}
                              <span className="truncate block">{e.titre}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Vue Membres */}
              {calView === 'membre' && (
                <div className="overflow-x-auto">
                  {calLoading ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                      <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin"/>
                      <p className="text-sm">Chargement des membres...</p>
                    </div>
                  ) : calStaff.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="text-gray-400">
                          <circle cx="11" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M4 19c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500 font-medium">Aucun membre trouve</p>
                      <p className="text-xs text-gray-400 mt-1">Verifie les droits d'acces au calendrier</p>
                    </div>
                  ) : (
                    <div>
                      <div className="grid border-b border-gray-100" style={{gridTemplateColumns: `140px repeat(${calStaff.length}, minmax(100px, 1fr))`}}>
                        <div className="py-2 px-3 text-xs text-gray-400 font-medium">Membre</div>
                        {calStaff.map(m => (
                          <div key={m._id} className="py-2 text-center text-xs font-medium text-gray-600 border-l border-gray-50">{m.firstName} {m.lastName[0]}.</div>
                        ))}
                      </div>
                      {calBuildMonthGrid(year, month).filter(d => d.getMonth() === month).slice(0, 7).map((d, ri) => {
                        const iso = calIsoDate(d);
                        const isT = iso === todayIso;
                        const evts = byDate[iso] || [];
                        return (
                          <div key={ri} className={`grid border-b border-gray-50 ${isT ? 'bg-orange-50/20' : ''}`} style={{gridTemplateColumns: `140px repeat(${calStaff.length}, minmax(100px, 1fr))`}}>
                            <div className={`px-3 py-2 text-xs ${isT ? 'text-orange-600 font-semibold' : 'text-gray-500'}`}>
                              {CAL_JOURS[(d.getDay()+6)%7]} {d.getDate()}
                            </div>
                            {calStaff.map(m => {
                              const name = `${m.firstName} ${m.lastName}`;
                              const memberEvts = evts.filter(e =>
                                (e.createdByName === name) ||
                                (Array.isArray(e.assignedToNames) && e.assignedToNames.includes(name)) ||
                                (Array.isArray(e.participants) && e.participants.includes(name))
                              );
                              return (
                                <div key={m._id} className="border-l border-gray-50 p-1 min-h-[40px]">
                                  {memberEvts.map(e => (
                                    <div key={e.id} className={`rounded px-1 py-0.5 text-[10px] mb-0.5 truncate border ${CAL_TYPE_STYLE[e.type] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>{e.titre}</div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ---- Vue Task Intake ---- */}
        {viewMode === 'intake' && (() => {
          const intakeTasks = tasks.filter((t: any) =>
            (!Array.isArray(t.assignedTo) || t.assignedTo.length === 0) &&
            t.statut !== 'termine' && t.statut !== 'annule'
          );
          const allUntriagedCount = intakeTasks.length;
          const urgentCount = intakeTasks.filter((t: any) => t.priorite === 'urgente').length;
          const overdue = intakeTasks.filter((t: any) => t.dateEcheance && new Date(t.dateEcheance) < new Date());
          const INTAKE_PAGE_SIZE = 10;
          const prioOrd: any = {urgente:0,haute:1,normale:2,basse:3};
          const sortedIntake = [...intakeTasks].sort((a: any, b: any) => ((prioOrd[a.priorite]??2)-(prioOrd[b.priorite]??2)));
          const intakeTotalPages = Math.ceil(sortedIntake.length / INTAKE_PAGE_SIZE);
          const intakeSafePage = Math.min(intakePage, Math.max(0, intakeTotalPages - 1));
          const intakePageItems = sortedIntake.slice(intakeSafePage * INTAKE_PAGE_SIZE, (intakeSafePage + 1) * INTAKE_PAGE_SIZE);

          return (
            <div className="flex flex-col gap-4">
              {/* Stats rapides */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">A trier</p>
                  <p className="text-2xl font-bold text-gray-800">{allUntriagedCount}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">Urgentes</p>
                  <p className="text-2xl font-bold text-red-600">{urgentCount}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">En retard</p>
                  <p className="text-2xl font-bold text-orange-600">{overdue.length}</p>
                </div>
              </div>

              {/* Capture rapide */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Capture rapide</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={intakeTitle}
                    onChange={e => setIntakeTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleIntakeCreate(); }}
                    placeholder="Titre de la tache... (Entree pour ajouter)"
                    className="flex-1 min-w-0 h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                  />
                  {/* Priorite rapide */}
                  <div className="flex gap-1">
                    {(['basse','normale','haute','urgente'] as const).map(p => {
                      const colors: {[k:string]:string} = { basse:'bg-gray-100 text-gray-500', normale:'bg-blue-100 text-blue-700', haute:'bg-amber-100 text-amber-700', urgente:'bg-red-100 text-red-700' };
                      return (
                        <button key={p} type="button" onClick={() => setIntakePriority(p)}
                          className={`px-2.5 py-1 text-xs rounded-lg capitalize font-medium transition-all ${intakePriority === p ? colors[p] + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  {/* Date echeance rapide */}
                  <input
                    type="date"
                    value={intakeDate}
                    onChange={e => setIntakeDate(e.target.value)}
                    className="h-9 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-600 bg-white w-36"
                    title="Echeance"
                  />
                  {/* Dossier rapide */}
                  <select value={intakeDossier} onChange={e => setIntakeDossier(e.target.value)} className="h-9 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-600 bg-white max-w-[200px]">
                    <option value="">Pas de dossier</option>
                    {dossiers.map((d: any) => {
                      const clientName = d.user
                        ? `${d.user.firstName || ''} ${d.user.lastName || ''}`.trim()
                        : `${d.clientPrenom || ''} ${d.clientNom || ''}`.trim();
                      const label = [d.numero || d.titre, clientName].filter(Boolean).join(' - ');
                      return (
                        <option key={d._id||d.id} value={d._id||d.id}>{label || String(d._id).slice(-6)}</option>
                      );
                    })}
                  </select>
                  <button onClick={handleIntakeCreate} disabled={!intakeTitle.trim() || intakeLoading}
                    className="h-9 px-4 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-1.5 shrink-0">
                    {intakeLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                    Ajouter
                  </button>
                </div>
              </div>

              {/* File de triage */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">File d'attente</p>
                    <p className="text-xs text-gray-400 mt-0.5">Taches sans assignation, a trier et distribuer</p>
                  </div>
                  {allUntriagedCount > 0 && (
                    <span className="text-xs font-semibold bg-orange-100 text-orange-700 rounded-full px-2.5 py-1">{allUntriagedCount} en attente</span>
                  )}
                </div>
                {intakeTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="text-green-600"><path d="M4 11l5 5L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <p className="text-sm font-medium text-gray-700">Tout est trie !</p>
                    <p className="text-xs text-gray-400 mt-1">Aucune tache en attente d'assignation</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {/* En-tete colonne */}
                    <div className="grid items-center gap-3 px-4 py-2 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:grid" style={{gridTemplateColumns:'1fr 110px 90px 120px 120px 80px'}}>
                      <span>Tache</span>
                      <span>Dossier</span>
                      <span>Priorite</span>
                      <span>Statut</span>
                      <span>Assigner a</span>
                      <span>Echeance</span>
                    </div>
                    {intakePageItems.map((task: any) => {
                      const taskId = task._id || task.id;
                      const due = task.dateEcheance ? new Date(task.dateEcheance) : null;
                      const isOverdue = due && due < new Date();
                      const prio = task.priorite || 'normale';
                      const prioCls: {[k:string]:string} = { basse:'bg-gray-100 text-gray-500', normale:'bg-blue-100 text-blue-700', haute:'bg-amber-100 text-amber-700', urgente:'bg-red-100 text-red-700' };
                      const isTriageOpen = intakeTriageOpen === taskId;
                      return (
                        <div key={taskId} className="px-4 py-3">
                          <div className="flex flex-col sm:grid items-start sm:items-center gap-2 sm:gap-3" style={{gridTemplateColumns:'1fr 110px 90px 120px 120px 80px'}}>
                            {/* Titre */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIO_DOT[prio] || 'bg-gray-300'}`}/>
                              <button onClick={() => handleEditTask(task)} className="text-sm font-medium text-gray-800 hover:text-orange-600 truncate text-left transition-colors">
                                {task.titre || task.description?.slice(0,60) || 'Sans titre'}
                              </button>
                            </div>

                            {/* Dossier */}
                            <div className="min-w-0">
                              {task.dossier?.numero ? (
                                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 truncate block max-w-[100px]" title={task.dossier.numero}>{task.dossier.numero}</span>
                              ) : (
                                <span className="text-gray-300 text-xs">-</span>
                              )}
                            </div>

                            {/* Priorite inline */}
                            <div className="relative">
                              <button
                                onClick={() => setIntakeTriageOpen(isTriageOpen ? null : `prio-${taskId}`)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${prioCls[prio]}`}
                              >
                                {prio}
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                              </button>
                              {intakeTriageOpen === `prio-${taskId}` && (
                                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1 min-w-[100px]" onMouseLeave={() => setIntakeTriageOpen(null)}>
                                  {(['basse','normale','haute','urgente'] as const).map(p => (
                                    <button key={p} onClick={() => { handleUpdatePriority(taskId, p); setIntakeTriageOpen(null); }}
                                      className={`w-full text-left px-3 py-1.5 text-xs capitalize hover:bg-gray-50 ${prio === p ? 'font-semibold text-orange-600' : 'text-gray-700'}`}>{p}</button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Statut inline */}
                            <div className="relative">
                              <button
                                onClick={() => setIntakeTriageOpen(isTriageOpen ? null : `status-${taskId}`)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                                style={{ background: STATUT_CONFIG[task.statut]?.bg || '#F3F4F6', color: STATUT_CONFIG[task.statut]?.color || '#374151' }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUT_CONFIG[task.statut]?.dot || '#9CA3AF' }}/>
                                {STATUT_CONFIG[task.statut]?.label || task.statut}
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                              </button>
                              {intakeTriageOpen === `status-${taskId}` && (
                                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1 min-w-[120px]" onMouseLeave={() => setIntakeTriageOpen(null)}>
                                  {Object.entries(STATUT_CONFIG).map(([k, cfg]) => (
                                    <button key={k} onClick={() => { handleUpdateStatus(taskId, k); setIntakeTriageOpen(null); }}
                                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${task.statut === k ? 'font-semibold' : 'text-gray-700'}`}>
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{background: cfg.dot}}/>
                                      {cfg.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Assigner */}
                            <div className="relative">
                              <button
                                onClick={() => setIntakeTriageOpen(isTriageOpen ? null : `assign-${taskId}`)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 10.5c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                                Assigner
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                              </button>
                              {intakeTriageOpen === `assign-${taskId}` && (
                                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1 min-w-[160px] max-h-48 overflow-y-auto" onMouseLeave={() => setIntakeTriageOpen(null)}>
                                  {teamMembers.map((m: any) => {
                                    const uid = m._id || m.id;
                                    return (
                                      <button key={uid} onClick={() => { handleUpdateAssignment(taskId, [uid]); setIntakeTriageOpen(null); }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-medium flex-shrink-0 ${getAvatarPalette(String(uid))}`}>
                                          {(m.firstName?.[0] || '').toUpperCase()}{(m.lastName?.[0] || '').toUpperCase()}
                                        </span>
                                        {m.firstName} {m.lastName}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Echeance */}
                            <div className={`text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                              {due ? due.toLocaleDateString('fr-FR', {day:'2-digit', month:'short'}) : <span className="text-gray-300">-</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {intakeTotalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                        <p className="text-xs text-gray-400">{sortedIntake.length} taches - page {intakeSafePage + 1}/{intakeTotalPages}</p>
                        <div className="flex gap-1">
                          <button
                            disabled={intakeSafePage === 0}
                            onClick={() => setIntakePage(p => Math.max(0, p - 1))}
                            className="h-7 px-3 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:bg-gray-100"
                          >Precedent</button>
                          <button
                            disabled={intakeSafePage >= intakeTotalPages - 1}
                            onClick={() => setIntakePage(p => Math.min(intakeTotalPages - 1, p + 1))}
                            className="h-7 px-3 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:bg-gray-100"
                          >Suivant</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {viewMode === 'ma-journee' && (() => {
          const currentUserId = (session?.user as any)?._id || (session?.user as any)?.id || '';
          const todayStart = new Date(); todayStart.setHours(0,0,0,0);
          const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);

          const maJourneeTasks = tasks.filter((t: any) => {
            if (!t.dateEcheance) return false;
            const due = new Date(t.dateEcheance);
            if (due > todayEnd) return false;
            if (t.statut === 'termine' || t.statut === 'annule') return false;
            const assigned: string[] = (t.assignedTo || []).map((a: any) => (typeof a === 'object' ? (a._id || a.id) : a));
            return assigned.includes(currentUserId);
          });

          const maJourneeTerminees = tasks.filter((t: any) => {
            if (!t.dateEcheance) return false;
            const due = new Date(t.dateEcheance);
            if (due > todayEnd) return false;
            if (t.statut !== 'termine') return false;
            const assigned: string[] = (t.assignedTo || []).map((a: any) => (typeof a === 'object' ? (a._id || a.id) : a));
            return assigned.includes(currentUserId);
          });

          const jourFr = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
          const moisFr = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
          const now = new Date();
          const dateLabel = `${jourFr[now.getDay()]} ${now.getDate()} ${moisFr[now.getMonth()]}`;

          const handleToggleComplete = async (task: any) => {
            const taskId = task._id || task.id;
            const newStatut = (task.statut === 'termine') ? 'a_faire' : 'termine';
            try {
              await tasksAPI.updateTask(taskId, { statut: newStatut });
              if (newStatut === 'termine') setMaJourneeCompleteExpanded(true);
              await loadTasks();
            } catch {}
          };

          const handleMaJourneeAdd = async () => {
            if (!maJourneeNewTitle.trim()) return;
            try {
              await tasksAPI.createTask({
                titre: maJourneeNewTitle.trim(),
                statut: 'a_faire',
                priorite: 'normale',
                assignedTo: [currentUserId],
                dateEcheance: new Date().toISOString(),
              });
              setMaJourneeNewTitle('');
              setMaJourneeAddMode(false);
              await loadTasks();
            } catch {}
          };

          return (
            <div className="flex-1 min-h-0 overflow-y-auto bg-white">
              <div className="max-w-xl mx-auto px-4 pt-10 pb-20">
                <h1 className="text-2xl font-semibold text-gray-900">Ma journee</h1>
                <p className="text-sm text-gray-400 mt-0.5 mb-8 capitalize">{dateLabel}</p>

                <div className="space-y-1">
                  {maJourneeTasks.length === 0 && (
                    <p className="text-sm text-gray-400 py-4">Aucune tache pour aujourd&apos;hui.</p>
                  )}
                  {maJourneeTasks.map((task: any) => {
                    const taskId = task._id || task.id;
                    const dueDate = task.dateEcheance ? new Date(task.dateEcheance) : null;
                    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
                    const isOverdue = dueDate ? dueDate < todayMidnight : false;
                    const dueFmt = dueDate ? dueDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null;
                    return (
                      <div key={taskId} className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-gray-50 group">
                        <button
                          onClick={() => handleToggleComplete(task)}
                          aria-label="Marquer comme terminee"
                          className="shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-orange-400 transition-colors flex items-center justify-center group-hover:border-orange-400"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-800 truncate block">{task.titre}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            {dueFmt && (
                              <span className={`text-[11px] font-medium flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                                {isOverdue ? `En retard - ${dueFmt}` : dueFmt}
                              </span>
                            )}
                            {task.priorite && task.priorite !== 'normale' && (
                              <span className={`text-[11px] font-medium ${task.priorite === 'urgente' ? 'text-red-600' : task.priorite === 'haute' ? 'text-orange-500' : 'text-gray-400'}`}>
                                {task.priorite === 'urgente' ? 'Urgente' : task.priorite === 'haute' ? 'Haute' : task.priorite === 'basse' ? 'Basse' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        {task.dossier && (
                          <span className="shrink-0 text-[11px] text-gray-400 truncate max-w-[100px]">
                            {typeof task.dossier === 'object' ? (task.dossier.nom || task.dossier.reference || '') : ''}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {maJourneeTerminees.length > 0 && (
                  <div className="mt-6">
                    <button
                      onClick={() => setMaJourneeCompleteExpanded(v => !v)}
                      className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors mb-2"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className={`transition-transform ${maJourneeCompleteExpanded ? 'rotate-90' : ''}`}>
                        <path d="M4 2l6 5-6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Terminees {maJourneeTerminees.length}
                    </button>
                    {maJourneeCompleteExpanded && (
                      <div className="space-y-1">
                        {maJourneeTerminees.map((task: any) => {
                          const taskId = task._id || task.id;
                          return (
                            <div key={taskId} className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-gray-50 group">
                              <button
                                onClick={() => handleToggleComplete(task)}
                                aria-label="Rouvrir la tache"
                                className="shrink-0 w-5 h-5 rounded-full border-2 border-orange-400 bg-orange-400 hover:bg-orange-300 hover:border-orange-300 transition-colors flex items-center justify-center"
                              >
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                                  <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <span className="flex-1 text-sm text-gray-400 line-through truncate">{task.titre}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-8">
                  {maJourneeAddMode ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                      <input
                        autoFocus
                        type="text"
                        value={maJourneeNewTitle}
                        onChange={e => setMaJourneeNewTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); handleMaJourneeAdd(); }
                          if (e.key === 'Escape') { setMaJourneeAddMode(false); setMaJourneeNewTitle(''); }
                        }}
                        placeholder="Titre de la tache..."
                        className="flex-1 text-sm border-0 border-b border-gray-300 focus:border-orange-400 focus:outline-none py-1 bg-transparent text-gray-800 placeholder-gray-400"
                      />
                      <button onClick={handleMaJourneeAdd} className="text-xs px-3 py-1 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors">Ajouter</button>
                      <button onClick={() => { setMaJourneeAddMode(false); setMaJourneeNewTitle(''); }} className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Annuler</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setMaJourneeAddMode(true)}
                      className="flex items-center gap-2 text-sm text-gray-400 hover:text-orange-500 transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Ajoutez une tache
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </main>

      {/* Modal formulaire creation/edition - style panneau ClickUp */}
      {isMounted && isCreating && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) resetTaskForm(); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full sm:max-w-5xl sm:rounded-xl shadow-2xl max-h-[100dvh] sm:max-h-[min(92dvh,860px)] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-xl">

            {/* Barre de navigation superieure */}
            <div className="shrink-0 border-b border-gray-100 px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3 bg-white">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 rounded px-2 py-0.5 font-medium">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <rect x="1" y="1.5" width="9" height="1.8" rx="0.5" fill="currentColor"/>
                    <rect x="1" y="4.5" width="9" height="1.8" rx="0.5" fill="currentColor" opacity=".6"/>
                    <rect x="1" y="7.5" width="6" height="1.8" rx="0.5" fill="currentColor" opacity=".3"/>
                  </svg>
                  Tache
                </span>
                {editingTask && sousTaches.length > 0 && (
                  <span className="flex items-center gap-1 text-gray-400">
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M2 3h10M5 7h7M7 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    {sousTaches.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={resetTaskForm}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xl leading-none transition-colors"
                aria-label="Fermer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">

              {/* Onglets de navigation mobile (masques sur desktop) */}
              <div className="sm:hidden flex border-b border-gray-100 px-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobilePanelTab('champs')}
                  className={`py-2.5 text-sm font-medium border-b-2 mr-5 transition-colors ${mobilePanelTab === 'champs' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400'}`}
                >
                  Champs
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePanelTab('commentaires')}
                  className={`py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${mobilePanelTab === 'commentaires' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400'}`}
                >
                  Commentaires
                  {commentaires.length > 0 && (
                    <span className="text-[10px] bg-orange-100 text-orange-600 rounded-full px-1.5 py-0.5 font-semibold">{commentaires.length}</span>
                  )}
                </button>
              </div>

              {/* Corps a deux panneaux */}
              <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* PANNEAU GAUCHE : contenu principal */}
                <div className={`${mobilePanelTab === 'champs' ? 'flex' : 'hidden'} sm:flex flex-1 min-h-0 overflow-y-auto overscroll-contain flex-col`}>

                  {/* Grand titre editable */}
                  <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-2 sm:pb-3">
                    <input
                      id="task-title-input"
                      value={formData.titre}
                      onChange={(e: any) => setFormData({ ...formData, titre: e.target.value })}
                      placeholder="Titre de la tache"
                      autoFocus={!editingTask}
                      className="w-full text-xl sm:text-2xl font-semibold text-gray-900 placeholder:text-gray-300 bg-transparent border-none outline-none focus:ring-0 leading-snug"
                    />
                  </div>

                  {/* Champs en lignes cle/valeur */}
                  <div className="px-4 sm:px-6 pb-3 space-y-0 border-b border-gray-100">

                    {/* Statut */}
                    <div className="flex items-start gap-3 py-1.5">
                      <div className="flex items-center gap-1.5 w-28 text-xs text-gray-400 shrink-0 pt-0.5">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M4 6l1.4 1.4L8.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Statut
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(STATUT_CONFIG).map(([key, cfg]) => {
                          const selected = formData.statut === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setFormData({ ...formData, statut: key })}
                              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer"
                              style={{
                                background: selected ? cfg.bg : '#F9FAFB',
                                color: selected ? cfg.color : '#9CA3AF',
                                outline: selected ? `2px solid ${cfg.dot}` : '2px solid transparent',
                                outlineOffset: '1px',
                              }}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0 transition-all"
                                style={{ background: selected ? cfg.dot : '#D1D5DB' }}
                              />
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Assignes */}
                    <div className="flex items-start gap-3 py-1 min-h-[36px]">
                      <div className="flex items-center gap-1.5 w-28 text-xs text-gray-400 shrink-0 pt-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <circle cx="6" cy="4" r="2.2" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M1.5 10.5c0-2.5 2-3.5 4.5-3.5s4.5 1 4.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        Assignes
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {teamMembers.map((member) => {
                          const uid = member._id || member.id;
                          const selected = formData.assignedTo.includes(uid);
                          const palette = getAvatarPalette(String(uid));
                          return (
                            <button
                              key={uid}
                              type="button"
                              onClick={() => toggleAssignee(uid)}
                              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs transition-colors ${selected ? 'bg-orange-50 border border-orange-200 text-orange-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                              title={`${member.firstName} ${member.lastName}`}
                            >
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${palette}`}>
                                {getInitials(member)}
                              </span>
                              {member.firstName}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-1.5 w-28 shrink-0 text-xs text-gray-400 pt-1.5">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <rect x="1" y="2" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M1 5h10" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M3.5 1v2M8.5 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        Dates
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 flex-1 min-w-0">
                        <Input
                          type="date"
                          value={formData.dateDebut}
                          onChange={(e: any) => setFormData({ ...formData, dateDebut: e.target.value })}
                          className="h-7 text-xs px-2 py-1 w-full sm:w-36 border-gray-200"
                        />
                        <span className="hidden sm:block text-gray-300 text-xs">-&gt;</span>
                        <Input
                          type="date"
                          value={formData.dateEcheance}
                          onChange={(e: any) => setFormData({ ...formData, dateEcheance: e.target.value })}
                          className="h-7 text-xs px-2 py-1 w-full sm:w-36 border-gray-200"
                        />
                      </div>
                    </div>

                    {/* Priorite */}
                    <div className="flex items-center gap-3 h-9">
                      <div className="flex items-center gap-1.5 w-28 text-xs text-gray-400 shrink-0">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M3 2v8M3 2l6.5 3L3 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Priorite
                      </div>
                      <select
                        value={formData.priorite}
                        onChange={(e) => setFormData({ ...formData, priorite: e.target.value })}
                        className="text-xs rounded-full px-2.5 py-1 border-0 cursor-pointer outline-none focus:ring-1 focus:ring-orange-300 font-medium"
                        style={{
                          background: formData.priorite === 'urgente' ? '#FEF2F2' : formData.priorite === 'haute' ? '#FFF7ED' : formData.priorite === 'basse' ? '#F0FDF4' : '#F3F4F6',
                          color: formData.priorite === 'urgente' ? '#DC2626' : formData.priorite === 'haute' ? '#EA580C' : formData.priorite === 'basse' ? '#16A34A' : '#374151',
                        }}
                      >
                        <option value="basse">Basse</option>
                        <option value="normale">Normale</option>
                        <option value="haute">Haute</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </div>

                    {/* Dossier */}
                    <div className="flex items-center gap-3 h-9">
                      <div className="flex items-center gap-1.5 w-28 text-xs text-gray-400 shrink-0">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M1 4.5h10v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-5ZM1 4.5V3a1 1 0 0 1 1-1h2.5l1 1.5H1Z" stroke="currentColor" strokeWidth="1.2"/>
                        </svg>
                        Dossier
                      </div>
                      <select
                        value={formData.dossier}
                        onChange={(e) => setFormData({ ...formData, dossier: e.target.value })}
                        className="text-xs rounded px-2 py-1 border border-gray-200 bg-white outline-none focus:ring-1 focus:ring-orange-300 max-w-[280px] text-gray-700"
                      >
                        <option value="">-- Aucun dossier --</option>
                        {dossiers.map((dossier) => (
                          <option key={dossier._id || dossier.id} value={dossier._id || dossier.id}>
                            {dossier.titre} -{' '}
                            {dossier.user
                              ? `${dossier.user.firstName} ${dossier.user.lastName}`
                              : `${dossier.clientPrenom} ${dossier.clientNom}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
                    <Textarea
                      value={formData.description}
                      onChange={(e: any) => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                      placeholder="Ajouter une description ou des details..."
                      className="border-0 resize-none bg-transparent text-sm text-gray-700 placeholder:text-gray-300 focus:ring-0 p-0 w-full min-h-[48px]"
                    />
                  </div>

                  {/* Notes internes */}
                  <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Notes internes</p>
                    <Textarea
                      value={formData.notes}
                      onChange={(e: any) => setFormData({ ...formData, notes: e.target.value })}
                      rows={2}
                      placeholder="Notes pour l'equipe uniquement..."
                      className="border border-gray-100 resize-none bg-gray-50/60 text-sm placeholder:text-gray-300 focus:ring-1 focus:ring-orange-300 w-full rounded-md"
                    />
                  </div>

                  {/* Sous-taches */}
                  {editingTask && (
                    <div className="px-4 sm:px-6 py-3 sm:py-4 flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-gray-400 shrink-0">
                          <path d="M2 3h10M5 7h7M7 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Sous-taches</span>
                        {sousTaches.length > 0 && (
                          <span className="text-xs text-gray-400">
                            {sousTaches.filter((s: any) => !s.complete).length} ouvert{sousTaches.filter((s: any) => !s.complete).length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {sousTaches.length > 1 && (
                          <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full bg-orange-400 rounded-full transition-all"
                              style={{ width: `${Math.round((sousTaches.filter((s: any) => s.complete).length / sousTaches.length) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {sousTaches.length > 0 && (
                        <div className="mb-3 rounded-lg border border-gray-100 overflow-hidden">
                          <div className="grid text-[10px] text-gray-400 font-semibold uppercase tracking-wide px-3 py-1.5 bg-gray-50 border-b border-gray-100" style={{ gridTemplateColumns: '1fr 80px 28px' }}>
                            <span>Nom</span>
                            <span className="text-right">Statut</span>
                            <span />
                          </div>
                          {sousTaches.map((st: any) => (
                            <div key={st._id} className="grid items-center px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/70 group" style={{ gridTemplateColumns: '1fr 80px 28px' }}>
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={!!st.complete}
                                  onChange={() => handleToggleSousTache(st._id, !!st.complete)}
                                  disabled={sousTacheLoading}
                                  className="w-3.5 h-3.5 accent-orange-500 shrink-0 cursor-pointer rounded"
                                />
                                <span className={`text-sm truncate ${st.complete ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                  {st.titre}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${st.complete ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {st.complete ? 'Terminee' : 'Ouverte'}
                                </span>
                              </div>
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSousTache(st._id)}
                                  disabled={sousTacheLoading}
                                  className="w-6 h-6 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all text-base leading-none"
                                  title="Supprimer"
                                >
                                  &times;
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newSousTacheTitle}
                          onChange={(e) => setNewSousTacheTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSousTache(); } }}
                          placeholder="+ Ajouter une sous-tache..."
                          disabled={sousTacheLoading}
                          className="flex-1 h-7 rounded border border-dashed border-gray-200 bg-transparent px-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-300"
                        />
                        {newSousTacheTitle.trim() && (
                          <button
                            type="button"
                            onClick={handleAddSousTache}
                            disabled={sousTacheLoading}
                            className="h-7 px-3 rounded bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors shrink-0"
                          >
                            Ajouter
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Fichiers joints */}
                  {editingTask && (
                    <div className="px-4 sm:px-6 py-3 border-t border-gray-50">
                      <div className="flex items-center gap-2 mb-3">
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-gray-400 shrink-0">
                          <path d="M8 1.5H3.5A1.5 1.5 0 002 3v8a1.5 1.5 0 001.5 1.5h7A1.5 1.5 0 0012 11V5.5L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 1.5V5.5H12" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Fichiers</span>
                        {editPiecesJointes.length > 0 && (
                          <span className="text-xs text-gray-400">{editPiecesJointes.length}</span>
                        )}
                      </div>

                      {editPiecesJointes.length > 0 && (
                        <div className="mb-3 space-y-1">
                          {editPiecesJointes.map((f: any) => (
                            <div key={f._id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-100 bg-gray-50/60 group">
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-gray-400 shrink-0">
                                <path d="M8 1.5H3.5A1.5 1.5 0 002 3v8a1.5 1.5 0 001.5 1.5h7A1.5 1.5 0 0012 11V5.5L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                              </svg>
                              <a
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-xs text-blue-600 hover:underline truncate"
                              >
                                {f.nom}
                              </a>
                              {f.taille && (
                                <span className="text-[10px] text-gray-400 shrink-0">
                                  {f.taille < 1024 * 1024 ? `${Math.round(f.taille / 1024)} Ko` : `${(f.taille / (1024 * 1024)).toFixed(1)} Mo`}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await tasksAPI.deleteTaskFichier(editingTask._id || editingTask.id, f._id);
                                    setEditPiecesJointes(prev => prev.filter((p: any) => p._id !== f._id));
                                    await loadTasks();
                                  } catch {}
                                }}
                                className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 transition-all text-base leading-none shrink-0"
                                title="Supprimer"
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <label className={`flex items-center gap-2 h-7 px-3 rounded border border-dashed border-gray-200 bg-transparent text-sm text-gray-400 cursor-pointer hover:border-orange-300 hover:text-orange-400 transition-colors ${uploadingFichier ? 'opacity-50 pointer-events-none' : ''}`}>
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        {uploadingFichier ? 'Envoi...' : 'Joindre un fichier'}
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingFichier}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !editingTask) return;
                            setUploadingFichier(true);
                            try {
                              const res = await tasksAPI.uploadTaskFichier(editingTask._id || editingTask.id, file);
                              if (res.data?.piecesJointes) setEditPiecesJointes(res.data.piecesJointes);
                              await loadTasks();
                            } catch {} finally {
                              setUploadingFichier(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}

                  {/* Liens */}
                  {editingTask && (
                    <div className="px-4 sm:px-6 py-3 border-t border-gray-50">
                      <div className="flex items-center gap-2 mb-3">
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-gray-400 shrink-0">
                          <path d="M5.5 8.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5L6.25 2.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M8.5 5.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5L7.75 11.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Liens</span>
                        {editLiens.length > 0 && <span className="text-xs text-gray-400">{editLiens.length}</span>}
                      </div>

                      {editLiens.length > 0 && (
                        <div className="mb-3 space-y-1">
                          {editLiens.map((l: any) => (
                            <div key={l._id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-100 bg-gray-50/60 group">
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-blue-400 shrink-0">
                                <path d="M5.5 8.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5L6.25 2.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                              </svg>
                              <a
                                href={l.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-xs text-blue-600 hover:underline truncate"
                              >
                                {l.label || l.url}
                              </a>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await tasksAPI.deleteTaskLien(editingTask._id || editingTask.id, l._id);
                                    setEditLiens(prev => prev.filter((p: any) => p._id !== l._id));
                                    await loadTasks();
                                  } catch {}
                                }}
                                className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 transition-all text-base leading-none shrink-0"
                                title="Supprimer"
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <input
                          type="url"
                          value={newLienUrl}
                          onChange={(e) => setNewLienUrl(e.target.value)}
                          placeholder="https://..."
                          className="h-7 rounded border border-dashed border-gray-200 bg-transparent px-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-300"
                        />
                        {newLienUrl.trim() && (
                          <>
                            <input
                              type="text"
                              value={newLienLabel}
                              onChange={(e) => setNewLienLabel(e.target.value)}
                              placeholder="Libelle (optionnel)"
                              className="h-7 rounded border border-dashed border-gray-200 bg-transparent px-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-300"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (!newLienUrl.trim() || !editingTask) return;
                                try {
                                  const res = await tasksAPI.addTaskLien(editingTask._id || editingTask.id, { url: newLienUrl.trim(), label: newLienLabel.trim() || undefined });
                                  if (res.data?.liens) setEditLiens(res.data.liens);
                                  setNewLienUrl('');
                                  setNewLienLabel('');
                                  await loadTasks();
                                } catch {}
                              }}
                              className="h-7 px-3 rounded bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 transition-colors self-start"
                            >
                              Ajouter
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {!editingTask && <div className="flex-1" />}
                </div>

                {/* PANNEAU DROIT : commentaires */}
                <div className={`${mobilePanelTab === 'commentaires' ? 'flex' : 'hidden'} sm:flex flex-1 sm:flex-none sm:w-72 shrink-0 flex-col border-l border-gray-100`}>
                  {/* En-tete */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">Commentaires</span>
                    {commentaires.length > 0 && (
                      <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium">{commentaires.length}</span>
                    )}
                    {editingTask?.createdAt && (
                      <span className="ml-auto text-[10px] text-gray-400">
                        {new Date(editingTask.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>

                  {/* Liste des commentaires */}
                  <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3">
                    {commentaires.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="text-gray-400">
                            <path d="M3 14V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6l-3 3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Aucun commentaire</p>
                        <p className="text-[11px] text-gray-400 leading-relaxed">Soyez le premier a commenter.</p>
                      </div>
                    ) : (
                      commentaires.map((c: any) => {
                        const user = c.utilisateur;
                        const palette = getAvatarPalette(String(user?._id || user?.id || c._id));
                        const name = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Inconnu';
                        const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
                        const currentUserId = (session?.user as any)?._id || (session?.user as any)?.id;
                        const currentUserRole = (session?.user as any)?.role;
                        const canDelete = currentUserRole === 'admin' || currentUserRole === 'superadmin' || String(user?._id || user?.id) === String(currentUserId);
                        return (
                          <div key={c._id} className="group flex gap-2">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${palette}`}>
                              {getInitials(user)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-xs font-semibold text-gray-700 truncate">{name}</span>
                                <span className="text-[10px] text-gray-400 shrink-0">{date}</span>
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCommentaire(c._id)}
                                    disabled={commentLoading}
                                    className="ml-auto opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all text-base leading-none shrink-0"
                                    title="Supprimer"
                                  >
                                    &times;
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap break-words">{c.contenu}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Zone de saisie */}
                  <div className="shrink-0 border-t border-gray-100 p-3 space-y-2">
                    <div className="flex gap-3 text-xs border-b border-gray-100 pb-2">
                      <button
                        type="button"
                        onClick={() => setActiveCommentTab('commentaire')}
                        className={`pb-1.5 -mb-[calc(0.5rem+1px)] font-semibold transition-colors ${activeCommentTab === 'commentaire' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        Commentaire
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCommentTab('publication')}
                        className={`pb-1.5 -mb-[calc(0.5rem+1px)] font-semibold transition-colors ${activeCommentTab === 'publication' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        Note interne
                      </button>
                    </div>
                    {editingTask ? (
                      <>
                        <textarea
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCommentaire();
                            }
                          }}
                          placeholder={activeCommentTab === 'commentaire' ? 'Ecrire un commentaire... (Ctrl+Entree)' : 'Note interne pour l\'equipe...'}
                          rows={3}
                          disabled={commentLoading}
                          className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-2 resize-none placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-300"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-400">Ctrl + Entree pour envoyer</span>
                          <button
                            type="button"
                            onClick={handleAddCommentaire}
                            disabled={!newCommentText.trim() || commentLoading}
                            className="h-7 px-3 rounded-md bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors"
                          >
                            {commentLoading ? '...' : 'Envoyer'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-gray-400 text-center py-2">Sauvegardez la tache d'abord.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Pied de page */}
              <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-3 flex items-center justify-between gap-3">
                {editingTask ? (
                  <button
                    type="button"
                    onClick={() => { setShowDeleteConfirm(editingTask._id || editingTask.id); }}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    Supprimer
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={resetTaskForm} disabled={isLoading} size="sm">
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isLoading} size="sm">
                    {isLoading
                      ? (editingTask ? 'Sauvegarde...' : 'Creation...')
                      : (editingTask ? 'Sauvegarder' : 'Creer la tache')}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Menu contextuel carte kanban */}
      {isMounted && cardMenuId && createPortal(
        (() => {
          const menuTask = tasks.find((t: any) => (t._id || t.id) === cardMenuId);
          if (!menuTask) return null;
          const isDone = menuTask.statut === 'termine';
          const moveTargets = [
            { key: 'a_faire', label: 'A faire' },
            { key: 'en_cours', label: 'En cours' },
            { key: 'en_attente', label: 'En attente' },
            { key: 'termine', label: 'Termine' },
          ].filter(t => t.key !== menuTask.statut);
          return (
            <div
              style={(() => {
                const menuH = 350;
                const menuW = 210;
                const spaceBelow = window.innerHeight - (cardMenuPos.y + 28);
                const top = spaceBelow >= menuH ? cardMenuPos.y + 28 : Math.max(cardMenuPos.y - menuH, 10);
                const left = Math.min(cardMenuPos.x, window.innerWidth - menuW);
                return { position: 'fixed' as const, left, top, zIndex: 9999 };
              })()}
              className="bg-white rounded-xl border border-gray-200 shadow-lg py-1 w-52"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setCardMenuId(null); handleEditTask(menuTask); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                Renommer
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCardMenuAddToMaJournee(menuTask); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Ajouter a Ma journee
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCardMenuMove(menuTask, isDone ? 'a_faire' : 'termine'); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {isDone ? 'Rouvrir' : 'Marquer comme termine'}
              </button>
              <div className="my-1 border-t border-gray-100"/>
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Deplacer vers</p>
                {moveTargets.map(t => (
                  <button
                    key={t.key}
                    onClick={(e) => { e.stopPropagation(); handleCardMenuMove(menuTask, t.key); }}
                    className="w-full text-left px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-md flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0"/>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="my-1 border-t border-gray-100"/>
              <button
                onClick={(e) => { e.stopPropagation(); handleCardMenuDuplicate(menuTask); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Dupliquer
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCardMenuArchive(menuTask); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 4l1.5-2h9L13 4M5.5 7.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                Archiver
              </button>
              <div className="my-1 border-t border-gray-100"/>
              <button
                onClick={(e) => { e.stopPropagation(); setCardMenuId(null); setShowDeleteConfirm(menuTask._id || menuTask.id); }}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 4h10M5 4V2.5h4V4M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.5a1 1 0 001 .9h4.6a1 1 0 001-.9L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Supprimer
              </button>
            </div>
          );
        })(),
        document.body
      )}

      {/* Modal confirmation suppression */}
      {isMounted && showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-medium text-gray-900 mb-2">Confirmer la suppression</h3>
            <p className="text-sm text-gray-500 mb-6">
              Etes-vous sur de vouloir supprimer cette tache ? Cette action est irreversible.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} disabled={isLoading} className="w-full sm:w-auto">
                Annuler
              </Button>
              <Button variant="destructive" onClick={() => handleDeleteTask(showDeleteConfirm)} disabled={isLoading} className="w-full sm:w-auto">
                {isLoading ? 'Suppression...' : 'Supprimer'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

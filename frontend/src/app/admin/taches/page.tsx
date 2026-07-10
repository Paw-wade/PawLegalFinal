'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tasksAPI, userAPI, dossiersAPI } from '@/lib/api';
import { TaskListItem } from '@/components/tasks/TaskListItem';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';

function Button({ children, variant = 'default', size = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-primary text-white hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
  };
  const sizeClasses = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>{children}</button>;
}

function Input({ className = '', type, value, onChange, ...props }: any) {
  if (type === 'date') {
    return (
      <DateInputComponent
        value={value || ''}
        onChange={(newValue: string) => {
          if (onChange) {
            const syntheticEvent = {
              target: { value: newValue },
              currentTarget: { value: newValue }
            } as React.ChangeEvent<HTMLInputElement>;
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

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const resetTaskForm = () => {
    setIsCreating(false);
    setEditingTask(null);
    setFormData({
      titre: '',
      description: '',
      statut: 'a_faire',
      priorite: 'normale',
      assignedTo: [],
      dateEcheance: '',
      dateDebut: '',
      dossier: '',
      notes: '',
    });
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session) {
      const userRole = (session.user as any)?.role;
      const isAuthorized = userRole === 'admin' || userRole === 'superadmin';
      if (!isAuthorized) {
        router.push('/client');
      }
    }
  }, [session, status, router]);

  useEffect(() => {
    if (status === 'authenticated' && ((session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin')) {
      loadTasks();
      loadTeamMembers();
      loadDossiers();
    }
  }, [session, status]);

  // Deep-link depuis la bannière « À traiter » : afficher la tâche exacte (sans ouvrir le formulaire)
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

  // Les tâches sont pliées par défaut (expandedTasks reste vide)

  const loadTasks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await tasksAPI.getAllTasks();
      if (response.data.success) {
        setTasks(response.data.tasks || []);
      } else {
        setError('Erreur lors du chargement des tâches');
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des tâches:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement des tâches');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const response = await userAPI.getAllUsers();
      if (response.data.success) {
        const members = (response.data.users || []).filter(
          (user: any) => user.role === 'admin' || user.role === 'superadmin'
        );
        setTeamMembers(members);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des membres de l\'équipe:', err);
    }
  };

  const loadDossiers = async () => {
    try {
      const response = await dossiersAPI.getAllDossiers();
      if (response.data.success) {
        setDossiers(response.data.dossiers || []);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des dossiers:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Aucune validation obligatoire - tous les champs sont optionnels

      console.log('📤 Envoi des données de tâche:', {
        titre: formData.titre,
        assignedTo: formData.assignedTo,
        statut: formData.statut,
        priorite: formData.priorite
      });

      const taskData: any = {
        description: formData.description?.trim() || '',
        statut: formData.statut || 'a_faire',
        priorite: formData.priorite || 'normale',
        notes: formData.notes?.trim() || '',
      };

      // Ajouter le titre seulement s'il est fourni (optionnel)
      if (formData.titre && formData.titre.trim()) {
        taskData.titre = formData.titre.trim();
      }

      // Ajouter assignedTo seulement s'il y a des assignés (optionnel)
      if (formData.assignedTo && formData.assignedTo.length > 0) {
        taskData.assignedTo = formData.assignedTo;
      }

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
        setIsCreating(false);
        setEditingTask(null);
        setFormData({
          titre: '',
          description: '',
          statut: 'a_faire',
          priorite: 'normale',
          assignedTo: [],
          dateEcheance: '',
          dateDebut: '',
          dossier: '',
          notes: '',
        });
      }
    } catch (err: any) {
      console.error('Erreur lors de la création/modification de la tâche:', err);
      console.error('Détails de l\'erreur:', {
        status: err.response?.status,
        data: err.response?.data,
        errors: err.response?.data?.errors
      });
      
      // Afficher les détails de l'erreur
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        // Erreurs de validation express-validator
        const errorMessages = err.response.data.errors.map((e: any) => 
          `${e.param || e.field || 'Champ'}: ${e.msg || e.message || 'Erreur de validation'}`
        ).join(', ');
        setError(`Erreurs de validation: ${errorMessages}`);
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Erreur lors de la création/modification de la tâche. Vérifiez que tous les champs sont remplis correctement.');
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
    setIsCreating(true);
  };

  const handleDeleteTask = async (taskId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await tasksAPI.deleteTask(taskId);
      if (response.data.success) {
        await loadTasks();
        setShowDeleteConfirm(null);
      }
    } catch (err: any) {
      console.error('Erreur lors de la suppression de la tâche:', err);
      setError(err.response?.data?.message || 'Erreur lors de la suppression de la tâche');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await tasksAPI.updateTask(taskId, { statut: newStatus });
      if (response.data.success) {
        await loadTasks();
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour du statut:', err);
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour du statut');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePriority = async (taskId: string, newPriority: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await tasksAPI.updateTask(taskId, { priorite: newPriority });
      if (response.data.success) {
        await loadTasks();
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour de la priorité:', err);
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour de la priorité');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateAssignment = async (taskId: string, assignedTo: string[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await tasksAPI.updateTask(taskId, { assignedTo });
      if (response.data.success) {
        await loadTasks();
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour de l\'assignation:', err);
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour de l\'assignation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsDone = async (taskId: string, done: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await tasksAPI.updateTask(taskId, { effectue: done });
      if (response.data.success) {
        await loadTasks();
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour de la tâche:', err);
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour de la tâche');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAssignee = (userId: string) => {
    setFormData(prev => {
      const current = prev.assignedTo || [];
      if (current.includes(userId)) {
        return { ...prev, assignedTo: current.filter(id => id !== userId) };
      } else {
        return { ...prev, assignedTo: [...current, userId] };
      }
    });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!session || ((session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin')) {
    return null;
  }

  // Filtrer les tâches
  const filteredTasks = tasks.filter((task: any) => {
    // Filtre par catégorie (mes tâches / autres tâches)
    if (taskCategoryFilter === 'my') {
      const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo].filter(Boolean);
      const currentUserId = (session?.user as any)?._id || (session?.user as any)?.id;
      const isAssignedToMe = assignedToArray.some((assigned: any) => {
        const assignedId = assigned?._id || assigned?.id || assigned;
        return assignedId?.toString() === currentUserId?.toString();
      });
      if (!isAssignedToMe) return false;
    } else if (taskCategoryFilter === 'others') {
      const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo].filter(Boolean);
      const currentUserId = (session?.user as any)?._id || (session?.user as any)?.id;
      const isAssignedToMe = assignedToArray.some((assigned: any) => {
        const assignedId = assigned?._id || assigned?.id || assigned;
        return assignedId?.toString() === currentUserId?.toString();
      });
      if (isAssignedToMe) return false;
    }

    // Filtre par statut
    if (statusFilter !== 'all' && task.statut !== statusFilter) return false;

    // Filtre par priorité
    if (priorityFilter !== 'all' && task.priorite !== priorityFilter) return false;

    // Filtre par recherche
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const titleMatch = task.titre?.toLowerCase().includes(searchLower);
      const descriptionMatch = task.description?.toLowerCase().includes(searchLower);
      if (!titleMatch && !descriptionMatch) return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-3 sm:px-4 py-6 sm:py-8">
        <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold mb-1 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Gestion des Tâches
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Gérez toutes les tâches de l'équipe
              {tasks.filter((t: any) => t.statut === 'a_faire' || t.statut === 'en_cours').length > 0 && (
                <span className="ml-2 text-primary font-semibold">
                  ({tasks.filter((t: any) => t.statut === 'a_faire' || t.statut === 'en_cours').length} en cours)
                </span>
              )}
            </p>
          </div>
          <Button onClick={() => setIsCreating(true)} className="shadow-md hover:shadow-lg transition-shadow w-full sm:w-auto shrink-0">
            + Créer une tâche
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Formulaire de création/modification — portal au-dessus de la sidebar (z-70) et du header (z-80) */}
        {isMounted &&
          isCreating &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
              onClick={(e) => {
                if (e.target === e.currentTarget) resetTaskForm();
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="task-form-title"
            >
              <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl shadow-2xl max-h-[100dvh] sm:max-h-[min(90dvh,880px)] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-xl">
                <div className="shrink-0 border-b px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 bg-white">
                  <h2 id="task-form-title" className="text-lg sm:text-xl font-bold text-foreground truncate">
                    {editingTask ? 'Modifier la tâche' : 'Créer une nouvelle tâche'}
                  </h2>
                  <button
                    type="button"
                    onClick={resetTaskForm}
                    className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 text-2xl leading-none transition-colors"
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
                  <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4">
                    <div>
                      <Label htmlFor="titre">Titre de la tâche (optionnel)</Label>
                      <Input
                        id="titre"
                        value={formData.titre}
                        onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                        className="mt-1"
                        placeholder="Ex: Préparer le dossier de demande de titre de séjour"
                      />
                    </div>

                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="mt-1"
                        rows={3}
                        placeholder="Description détaillée de la tâche..."
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="statut">Statut</Label>
                        <select
                          id="statut"
                          value={formData.statut}
                          onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                        >
                          <option value="a_faire">À faire</option>
                          <option value="en_cours">En cours</option>
                          <option value="en_attente">En attente</option>
                          <option value="termine">Terminé</option>
                          <option value="annule">Annulé</option>
                        </select>
                      </div>

                      <div>
                        <Label htmlFor="priorite">Priorité</Label>
                        <select
                          id="priorite"
                          value={formData.priorite}
                          onChange={(e) => setFormData({ ...formData, priorite: e.target.value })}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                        >
                          <option value="basse">Basse</option>
                          <option value="normale">Normale</option>
                          <option value="haute">Haute</option>
                          <option value="urgente">Urgente</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="assignedTo">Assigner à {!editingTask && '*'}</Label>
                      <div className="mt-2 space-y-1 max-h-36 sm:max-h-44 overflow-y-auto border border-gray-200 rounded-md p-2">
                        {teamMembers.map((member) => (
                          <label
                            key={member._id || member.id}
                            className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={formData.assignedTo.includes(member._id || member.id)}
                              onChange={() => toggleAssignee(member._id || member.id)}
                              className="mt-0.5 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary shrink-0"
                            />
                            <span className="text-sm min-w-0 break-words">
                              <span className="font-medium">
                                {member.firstName} {member.lastName}
                              </span>
                              <span className="block sm:inline text-muted-foreground sm:before:content-['_('] sm:after:content-[')']">
                                {member.email}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="dateDebut">Date de début</Label>
                        <Input
                          id="dateDebut"
                          type="date"
                          value={formData.dateDebut}
                          onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="dateEcheance">Date d'échéance</Label>
                        <Input
                          id="dateEcheance"
                          type="date"
                          value={formData.dateEcheance}
                          onChange={(e) => setFormData({ ...formData, dateEcheance: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="dossier">Lier à un dossier (optionnel)</Label>
                      <select
                        id="dossier"
                        value={formData.dossier}
                        onChange={(e) => setFormData({ ...formData, dossier: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
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

                    <div>
                      <Label htmlFor="notes">Notes internes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="mt-1"
                        rows={2}
                        placeholder="Notes internes pour l'équipe..."
                      />
                    </div>
                  </div>

                  <div className="shrink-0 border-t bg-white px-4 sm:px-6 py-3 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end safe-bottom">
                    <Button type="button" variant="outline" onClick={resetTaskForm} disabled={isLoading} className="w-full sm:w-auto">
                      Annuler
                    </Button>
                    <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                      {isLoading
                        ? editingTask
                          ? 'Mise à jour...'
                          : 'Création...'
                        : editingTask
                          ? 'Mettre à jour'
                          : 'Créer la tâche'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

        {/* Liste des tâches */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-3 sm:p-6">
          {/* Barre de recherche et filtres */}
          <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:max-w-md">
              <input
                type="text"
                placeholder="Rechercher une tâche..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-background px-3 sm:px-4 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>
            <div className="flex gap-2 flex-wrap w-full sm:w-auto">
              <select
                value={taskCategoryFilter}
                onChange={(e) => setTaskCategoryFilter(e.target.value as any)}
                className="flex h-9 sm:h-10 min-w-0 flex-1 sm:flex-none rounded-lg border border-gray-300 bg-background px-2 sm:px-3 py-2 text-xs sm:text-sm"
              >
                <option value="all">Toutes les tâches</option>
                <option value="my">Mes tâches</option>
                <option value="others">Autres tâches</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="flex h-9 sm:h-10 min-w-0 flex-1 sm:flex-none rounded-lg border border-gray-300 bg-background px-2 sm:px-3 py-2 text-xs sm:text-sm"
              >
                <option value="all">Tous les statuts</option>
                <option value="a_faire">À faire</option>
                <option value="en_cours">En cours</option>
                <option value="en_attente">En attente</option>
                <option value="termine">Terminé</option>
                <option value="annule">Annulé</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as any)}
                className="flex h-9 sm:h-10 min-w-0 flex-1 sm:flex-none rounded-lg border border-gray-300 bg-background px-2 sm:px-3 py-2 text-xs sm:text-sm"
              >
                <option value="all">Toutes les priorités</option>
                <option value="urgente">Urgente</option>
                <option value="haute">Haute</option>
                <option value="normale">Normale</option>
                <option value="basse">Basse</option>
              </select>
              <Button onClick={loadTasks} variant="outline" size="sm" className="whitespace-nowrap">
                🔄 Actualiser
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Chargement des tâches...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📋</span>
              </div>
              <p className="text-muted-foreground text-lg font-medium mb-2">
                {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all' 
                  ? 'Aucune tâche ne correspond aux filtres' 
                  : 'Aucune tâche trouvée'}
              </p>
              {!searchTerm && statusFilter === 'all' && priorityFilter === 'all' && (
                <p className="text-sm text-muted-foreground">Commencez par créer votre première tâche</p>
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
            <div className="mt-6 pt-4 border-t flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{filteredTasks.length}</span> tâche{filteredTasks.length > 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Modal de confirmation de suppression */}
      {isMounted &&
        showDeleteConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-2xl">
              <h3 className="text-lg font-semibold mb-4">Confirmer la suppression</h3>
              <p className="text-muted-foreground mb-6">
                Êtes-vous sûr de vouloir supprimer cette tâche ? Cette action est irréversible.
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

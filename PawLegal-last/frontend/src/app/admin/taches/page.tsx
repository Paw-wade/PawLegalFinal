'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { tasksAPI, userAPI, dossiersAPI } from '@/lib/api';
import { getStatutColor, getStatutLabel, getPrioriteColor, getPrioriteLabel } from '@/lib/taskUtils';
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
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session && (session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin') {
      router.push('/client');
    }
  }, [session, status, router]);

  useEffect(() => {
    if (status === 'authenticated' && ((session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin')) {
      loadTasks();
      loadTeamMembers();
      loadDossiers();
    }
  }, [session, status]);

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

  const getDaysUntilDeadline = (dateEcheance: string | Date) => {
    if (!dateEcheance) return null;
    const deadline = new Date(dateEcheance);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    deadline.setHours(0, 0, 0, 0);
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">Gestion des Tâches</h1>
            <p className="text-muted-foreground text-sm">
              Gérez toutes les tâches de l'équipe
              {tasks.filter((t: any) => t.statut === 'a_faire' || t.statut === 'en_cours').length > 0 && (
                <span className="ml-2 text-primary font-semibold">
                  ({tasks.filter((t: any) => t.statut === 'a_faire' || t.statut === 'en_cours').length} en cours)
                </span>
              )}
            </p>
          </div>
          <Button onClick={() => setIsCreating(true)} className="shadow-md hover:shadow-lg transition-shadow">
            + Créer une tâche
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Formulaire de création/modification - Modal */}
        {isCreating && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
                <h2 className="text-2xl font-bold text-foreground">
                  {editingTask ? 'Modifier la tâche' : 'Créer une nouvelle tâche'}
                </h2>
                <button
                  onClick={() => {
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
                  }}
                  className="text-muted-foreground hover:text-foreground text-2xl leading-none transition-colors"
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div>
                  <Label htmlFor="titre">Titre de la tâche (optionnel)</Label>
                  <Input
                    id="titre"
                    value={formData.titre}
                    onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                    className="mt-1"
                    placeholder="Ex: Préparer le dossier de demande de titre de séjour (optionnel)"
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

                <div className="grid grid-cols-2 gap-4">
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
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-3">
                    {teamMembers.map((member) => (
                      <label key={member._id || member.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                        <input
                          type="checkbox"
                          checked={formData.assignedTo.includes(member._id || member.id)}
                          onChange={() => toggleAssignee(member._id || member.id)}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <span className="text-sm">
                          {member.firstName} {member.lastName} ({member.email})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                        {dossier.titre} - {dossier.user ? `${dossier.user.firstName} ${dossier.user.lastName}` : `${dossier.clientPrenom} ${dossier.clientNom}`}
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

                <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3 justify-end mt-6">
                  <Button type="button" variant="outline" onClick={() => {
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
                  }} disabled={isLoading}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (editingTask ? 'Mise à jour...' : 'Création...') : (editingTask ? 'Mettre à jour' : 'Créer la tâche')}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Liste des tâches */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          {/* Barre de recherche et filtres */}
          <div className="mb-5 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:max-w-md">
              <input
                type="text"
                placeholder="🔍 Rechercher une tâche..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-background px-4 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <select
                value={taskCategoryFilter}
                onChange={(e) => setTaskCategoryFilter(e.target.value as any)}
                className="flex h-10 rounded-lg border border-gray-300 bg-background px-3 py-2 text-sm"
              >
                <option value="all">Toutes les tâches</option>
                <option value="my">Mes tâches</option>
                <option value="others">Autres tâches</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="flex h-10 rounded-lg border border-gray-300 bg-background px-3 py-2 text-sm"
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
                className="flex h-10 rounded-lg border border-gray-300 bg-background px-3 py-2 text-sm"
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
            <div className="space-y-4">
              {filteredTasks.map((task) => {
                const assignedToArray = Array.isArray(task.assignedTo) 
                  ? task.assignedTo 
                  : [task.assignedTo].filter(Boolean);
                const daysUntilDeadline = getDaysUntilDeadline(task.dateEcheance);
                const isUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 2 && daysUntilDeadline >= 0;
                const isOverdue = daysUntilDeadline !== null && daysUntilDeadline < 0;
                const taskId = task._id || task.id;
                const isExpanded = expandedTasks.has(taskId);

                // Couleurs de bordure selon le statut
                const statusBorderColors = {
                  'a_faire': 'border-l-[5px] border-l-slate-400',
                  'en_cours': 'border-l-[5px] border-l-blue-500',
                  'en_attente': 'border-l-[5px] border-l-amber-500',
                  'termine': 'border-l-[5px] border-l-emerald-500',
                  'annule': 'border-l-[5px] border-l-red-500',
                };

                return (
                  <div
                    key={taskId}
                    className={`group bg-white rounded-2xl shadow-sm border border-gray-100/80 p-6 hover:shadow-lg hover:border-gray-200 transition-all duration-300 w-full ${statusBorderColors[task.statut as keyof typeof statusBorderColors] || statusBorderColors.a_faire} ${isUrgent || isOverdue ? 'ring-2 ring-red-200/60 ring-offset-1' : ''}`}
                  >
                    {/* En-tête de la carte avec bouton de pliage/dépliage */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-start gap-3 mb-2">
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedTasks);
                              if (newExpanded.has(taskId)) {
                                newExpanded.delete(taskId);
                              } else {
                                newExpanded.add(taskId);
                              }
                              setExpandedTasks(newExpanded);
                            }}
                            className="mt-0.5 p-1.5 rounded-lg hover:bg-gray-50 transition-all duration-200 text-gray-400 hover:text-gray-600 flex-shrink-0 group-hover:bg-gray-50"
                            title={isExpanded ? 'Plier la tâche' : 'Déplier la tâche'}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4 mb-1">
                              <h3 className="font-semibold text-lg text-gray-900 line-clamp-2 leading-snug flex-1 min-w-0">
                                {task.titre || <span className="text-gray-400 italic">Tâche sans titre</span>}
                              </h3>
                              {/* Échéance sur la même ligne à droite */}
                              {task.dateEcheance && (
                                <div className="flex-shrink-0 text-right">
                                  <div className={`text-[10px] font-medium whitespace-nowrap ${isUrgent || (daysUntilDeadline !== null && daysUntilDeadline < 0) ? 'text-red-600' : daysUntilDeadline !== null && daysUntilDeadline <= 3 ? 'text-amber-600' : 'text-blue-600'}`}>
                                    {new Date(task.dateEcheance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                  </div>
                                  {daysUntilDeadline !== null && (
                                    <div className={`text-[9px] font-semibold mt-0.5 whitespace-nowrap ${isUrgent || daysUntilDeadline < 0 ? 'text-red-600' : daysUntilDeadline <= 3 ? 'text-amber-600' : 'text-blue-600'}`}>
                                      {daysUntilDeadline < 0 
                                        ? `⚠️ ${Math.abs(daysUntilDeadline)}j`
                                        : daysUntilDeadline === 0 
                                        ? "Aujourd'hui"
                                        : daysUntilDeadline === 1 
                                        ? 'Demain'
                                        : `${daysUntilDeadline}j`
                                      }
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* Résumé quand plié */}
                            {!isExpanded && (
                              <div className="mt-2.5 space-y-2">
                                <div className="flex items-center gap-3 flex-wrap">
                                  {assignedToArray.length > 0 && (
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                      </svg>
                                      <span className="text-xs font-medium text-gray-700">{assignedToArray.length}</span>
                                    </div>
                                  )}
                                  {task.dossier && (
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-md">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                      </svg>
                                      <span className="text-xs font-medium text-blue-700 truncate max-w-[140px]">{task.dossier.titre || 'Dossier lié'}</span>
                                    </div>
                                  )}
                                  {task.createdBy && (
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 rounded-md">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                      <span className="text-xs font-medium text-purple-700 truncate max-w-[90px]">{task.createdBy.firstName || ''}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        {isExpanded && task.description && (
                          <div className="mt-3 ml-10 pr-4">
                            <div className="text-xs font-medium text-gray-500 mb-1.5">Description</div>
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                              {task.description}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm ${getStatutColor(task.statut)}`}>
                          {getStatutLabel(task.statut)}
                        </span>
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm ${getPrioriteColor(task.priorite)}`}>
                          {getPrioriteLabel(task.priorite)}
                        </span>
                      </div>
                    </div>

                    {/* Informations détaillées (affichées uniquement si la tâche est dépliée) */}
                    {isExpanded && (
                      <>
                    {/* Informations de la tâche */}
                    <div className="space-y-3 mb-4 ml-10">
                      {assignedToArray.length > 0 && (
                        <div className="flex items-start gap-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-500 mb-1.5">Assigné à</div>
                            <div className="flex flex-wrap gap-2">
                              {assignedToArray.map((assigned: any, idx: number) => {
                                const name = assigned?.firstName && assigned?.lastName
                                  ? `${assigned.firstName} ${assigned.lastName}`
                                  : assigned?.email || 'Utilisateur';
                                const initials = assigned?.firstName && assigned?.lastName
                                  ? `${assigned.firstName[0]}${assigned.lastName[0]}`
                                  : assigned?.email?.[0].toUpperCase() || 'U';
                                return (
                                  <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[10px] font-semibold">
                                      {initials}
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">{name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {task.dossier && (
                        <div className="flex items-center gap-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-500 mb-0.5">Dossier lié</div>
                            <span className="text-sm font-medium text-blue-600 truncate">{task.dossier.titre || 'Dossier lié'}</span>
                          </div>
                        </div>
                      )}

                      {task.dateEcheance && (
                        <div className="flex items-start gap-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 flex-shrink-0 mt-0.5 ${isUrgent || (daysUntilDeadline !== null && daysUntilDeadline < 0) ? 'text-red-500' : daysUntilDeadline !== null && daysUntilDeadline <= 3 ? 'text-amber-500' : 'text-blue-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-600 mb-1.5">📅 Date d'échéance</div>
                            <div className={`text-base font-semibold mb-1 ${isUrgent || (daysUntilDeadline !== null && daysUntilDeadline < 0) ? 'text-red-600' : daysUntilDeadline !== null && daysUntilDeadline <= 3 ? 'text-amber-600' : 'text-blue-600'}`}>
                              {new Date(task.dateEcheance).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                            {daysUntilDeadline !== null && (
                              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold ${
                                daysUntilDeadline < 0 
                                  ? 'bg-red-100 text-red-700 border border-red-300' 
                                  : daysUntilDeadline === 0 
                                  ? 'bg-red-100 text-red-700 border border-red-300'
                                  : daysUntilDeadline === 1 
                                  ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                  : daysUntilDeadline <= 3
                                  ? 'bg-orange-100 text-orange-700 border border-orange-300'
                                  : 'bg-blue-100 text-blue-700 border border-blue-300'
                              }`}>
                                <span>
                                  {daysUntilDeadline < 0 
                                    ? `⚠️ En retard de ${Math.abs(daysUntilDeadline)} jour${Math.abs(daysUntilDeadline) > 1 ? 's' : ''}`
                                    : daysUntilDeadline === 0 
                                    ? "🔴 Aujourd'hui"
                                    : daysUntilDeadline === 1 
                                    ? '🟡 Demain'
                                    : `⏳ ${daysUntilDeadline} jour${daysUntilDeadline > 1 ? 's' : ''} restant${daysUntilDeadline > 1 ? 's' : ''}`
                                  }
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {task.createdBy && (
                        <div className="flex items-center gap-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-500 mb-0.5">Créée par</div>
                            <span className="text-sm font-medium text-gray-700">
                              {task.createdBy.firstName} {task.createdBy.lastName}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Informations de complétion */}
                    {task.effectue && task.completedBy && task.dateEffectue && (
                      <div className="flex items-center gap-3 mb-4 ml-10 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-emerald-700 mb-0.5">Tâche effectuée</div>
                          <div className="text-sm text-emerald-800">
                            Par <span className="font-semibold">
                              {task.completedBy?.firstName} {task.completedBy?.lastName}
                            </span> le {new Date(task.dateEffectue).toLocaleDateString('fr-FR', { 
                              day: 'numeric', 
                              month: 'long', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pt-4 border-t border-gray-100 space-y-3 ml-10">
                      <div className="flex gap-2">
                        {!task.effectue && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleMarkAsDone(task._id || task.id, true)}
                            className="flex-1 text-xs h-9 font-medium shadow-sm hover:shadow bg-emerald-500 hover:bg-emerald-600 text-white"
                            disabled={isLoading}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Marquer comme effectuée
                          </Button>
                        )}
                        {task.effectue && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkAsDone(task._id || task.id, false)}
                            className="flex-1 text-xs h-9 font-medium shadow-sm hover:shadow"
                            disabled={isLoading}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Marquer comme non effectuée
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditTask(task)}
                          className="text-xs h-9 px-3 font-medium shadow-sm hover:shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(task._id || task.id)}
                          className="text-xs h-9 px-3 shadow-sm hover:shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1.5 block flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Statut
                          </label>
                          <select
                            value={task.statut}
                            onChange={(e) => handleUpdateStatus(task._id || task.id, e.target.value)}
                            className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all w-full shadow-sm hover:border-gray-300"
                            disabled={isLoading}
                          >
                            <option value="a_faire">À faire</option>
                            <option value="en_cours">En cours</option>
                            <option value="en_attente">En attente</option>
                            <option value="termine">Terminé</option>
                            <option value="annule">Annulé</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1.5 block flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Priorité
                          </label>
                          <select
                            value={task.priorite}
                            onChange={(e) => handleUpdatePriority(task._id || task.id, e.target.value)}
                            className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all w-full shadow-sm hover:border-gray-300"
                            disabled={isLoading}
                          >
                            <option value="basse">Basse</option>
                            <option value="normale">Normale</option>
                            <option value="haute">Haute</option>
                            <option value="urgente">Urgente</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1.5 block flex items-center gap-1.5">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          Assigner à
                        </label>
                        <details className="relative">
                          <summary
                            className="list-none cursor-pointer text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all w-full flex items-center justify-between gap-2 shadow-sm"
                            onClick={(e) => {
                              // empêcher le clic sur certains éléments enfants de fermer/ouvrir involontairement
                              e.stopPropagation();
                            }}
                          >
                            <span className="truncate text-gray-700">
                              {assignedToArray.length === 0
                                ? <span className="text-gray-400">Choisir...</span>
                                : assignedToArray.length === 1
                                ? (() => {
                                    const a: any = assignedToArray[0];
                                    const m = teamMembers.find((u) => (u._id || u.id) === (a?._id || a));
                                    return m ? `${m.firstName} ${m.lastName}` : '1 sélectionné';
                                  })()
                                : `${assignedToArray.length} sélectionnés`}
                            </span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>

                          <div
                            className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-xl p-3 max-h-64 overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {teamMembers.length === 0 ? (
                              <p className="text-sm text-gray-500 p-2 text-center">
                                Aucun membre disponible
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {teamMembers.map((member) => {
                                  const memberId = (member._id || member.id)?.toString();
                                  const currentIds = assignedToArray.map((a: any) => (a?._id || a)?.toString()).filter(Boolean);
                                  const isChecked = currentIds.includes(memberId);
                                  const initials = member.firstName && member.lastName
                                    ? `${member.firstName[0]}${member.lastName[0]}`
                                    : member.email?.[0].toUpperCase() || 'U';

                                  return (
                                    <label
                                      key={memberId}
                                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={isLoading}
                                        onChange={() => {
                                          const next = isChecked
                                            ? currentIds.filter((id) => id !== memberId)
                                            : [...currentIds, memberId];

                                          handleUpdateAssignment(task._id || task.id, next);
                                        }}
                                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-2 focus:ring-primary/20 cursor-pointer"
                                      />
                                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                                        {initials}
                                      </div>
                                      <span className="text-sm text-gray-700 font-medium flex-1">
                                        {member.firstName} {member.lastName}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    </div>
                    </>
                    )}
                  </div>
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
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirmer la suppression</h3>
            <p className="text-muted-foreground mb-6">
              Êtes-vous sûr de vouloir supprimer cette tâche ? Cette action est irréversible.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} disabled={isLoading}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={() => handleDeleteTask(showDeleteConfirm)} disabled={isLoading}>
                {isLoading ? 'Suppression...' : 'Supprimer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

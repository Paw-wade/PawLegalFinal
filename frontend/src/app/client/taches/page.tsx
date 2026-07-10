'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { tasksAPI } from '@/lib/api';
import { TaskListItem } from '@/components/tasks/TaskListItem';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

function Textarea({ className = '', ...props }: any) {
  return (
    <textarea
      className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function MesTachesPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkHandledRef = useRef<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    loadTasks();
  }, [session, status, router]);

  useEffect(() => {
    const taskId = searchParams.get('taskId')?.trim();
    if (!taskId || isLoading || tasks.length === 0) return;
    if (deepLinkHandledRef.current === taskId) return;

    const match = tasks.find((t: any) => String(t._id || t.id) === taskId);
    if (!match) return;

    deepLinkHandledRef.current = taskId;
    setExpandedTasks(new Set([taskId]));
    setHighlightedTaskId(taskId);
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
      const response = await tasksAPI.getMyTasks();
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

  const handleMarkAsDone = async (task: any, effectue: boolean) => {
    setIsUpdating(true);
    try {
      const updateData: any = {
        effectue: effectue,
      };

      if (commentaire.trim()) {
        updateData.commentaireEffectue = commentaire.trim();
      }

      const response = await tasksAPI.updateTask(task._id || task.id, updateData);
      if (response.data.success) {
        await loadTasks();
        setShowModal(false);
        setSelectedTask(null);
        setCommentaire('');
      } else {
        setError('Erreur lors de la mise à jour de la tâche');
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour:', err);
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour');
    } finally {
      setIsUpdating(false);
    }
  };

  const openModal = (task: any) => {
    setSelectedTask(task);
    setCommentaire(task.commentaireEffectue || '');
    setShowModal(true);
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement des tâches...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-1">Mes Tâches</h1>
          <p className="text-sm text-muted-foreground">Gérez les tâches qui vous ont été assignées</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <div className="text-4xl mb-3">📋</div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Aucune tâche assignée</h2>
            <p className="text-sm text-muted-foreground">Vous n'avez actuellement aucune tâche assignée.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task: any) => {
              const taskId = String(task._id || task.id);
              const isExpanded = expandedTasks.has(taskId);
              return (
                <TaskListItem
                  key={taskId}
                  task={task}
                  mode="client"
                  variant="full"
                  expanded={isExpanded}
                  highlighted={highlightedTaskId === taskId}
                  disabled={isUpdating}
                  dossierBasePath="/client/dossiers"
                  onToggleExpand={() => {
                    const next = new Set(expandedTasks);
                    if (next.has(taskId)) next.delete(taskId);
                    else next.add(taskId);
                    setExpandedTasks(next);
                  }}
                  onOpenCompleteModal={() => openModal(task)}
                />
              );
            })}
          </div>
        )}

        {showModal && selectedTask && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-foreground mb-1">
                  {selectedTask.effectue ? 'Modifier le statut de la tâche' : 'Marquer la tâche comme effectuée'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  <strong>{selectedTask.titre || 'Sans titre'}</strong>
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Statut</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="effectue"
                        checked={!selectedTask.effectue}
                        onChange={() => setSelectedTask({ ...selectedTask, effectue: false })}
                        className="w-4 h-4 text-primary"
                      />
                      <span>Non effectuée</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="effectue"
                        checked={!!selectedTask.effectue}
                        onChange={() => setSelectedTask({ ...selectedTask, effectue: true })}
                        className="w-4 h-4 text-primary"
                      />
                      <span>Effectuée</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Commentaire (optionnel)
                  </label>
                  <Textarea
                    value={commentaire}
                    onChange={(e: any) => setCommentaire(e.target.value)}
                    placeholder="Ajoutez un commentaire..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="outline" onClick={() => setShowModal(false)} disabled={isUpdating}>
                    Annuler
                  </Button>
                  <Button
                    onClick={() => handleMarkAsDone(selectedTask, !!selectedTask.effectue)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function MesTachesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background">Chargement...</div>}>
      <MesTachesPageContent />
    </Suspense>
  );
}

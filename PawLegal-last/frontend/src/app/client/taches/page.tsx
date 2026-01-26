'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { tasksAPI } from '@/lib/api';

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

export default function MesTachesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    loadTasks();
  }, [session, status, router]);

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

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case 'termine':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'en_cours':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'en_attente':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'annule':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      default:
        return 'bg-orange-100 text-orange-700 border-orange-300';
    }
  };

  const getStatutLabel = (statut: string) => {
    const labels: { [key: string]: string } = {
      'a_faire': 'À faire',
      'en_cours': 'En cours',
      'en_attente': 'En attente',
      'termine': 'Terminé',
      'annule': 'Annulé'
    };
    return labels[statut] || statut;
  };

  const getPrioriteColor = (priorite: string) => {
    switch (priorite) {
      case 'urgente':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'haute':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'normale':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'basse':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
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
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <main className="w-full px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Mes Tâches</h1>
            <p className="text-muted-foreground">Gérez les tâches qui vous ont été assignées</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-8 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Aucune tâche assignée</h2>
            <p className="text-muted-foreground">Vous n'avez actuellement aucune tâche assignée.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.map((task: any) => {
              const isUrgent = task.dateEcheance && new Date(task.dateEcheance) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
              const isOverdue = task.dateEcheance && new Date(task.dateEcheance) < new Date();
              
              return (
                <div
                  key={task._id || task.id}
                  className={`bg-white rounded-xl border-2 p-6 hover:shadow-lg transition-all duration-200 ${
                    task.effectue
                      ? 'border-green-300 bg-green-50/50'
                      : isOverdue
                      ? 'border-red-300 bg-red-50/50'
                      : isUrgent
                      ? 'border-orange-300 bg-orange-50/50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-foreground mb-2">{task.titre}</h3>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{task.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatutColor(task.statut)}`}>
                      {getStatutLabel(task.statut)}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPrioriteColor(task.priorite)}`}>
                      {task.priorite}
                    </span>
                    {task.effectue && (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300">
                        ✅ Effectuée
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 mb-4 text-sm text-muted-foreground">
                    {task.dateEcheance && (
                      <div className="flex items-center gap-2">
                        <span>📅</span>
                        <span className={isOverdue && !task.effectue ? 'text-red-600 font-semibold' : ''}>
                          Échéance: {new Date(task.dateEcheance).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    )}
                    {task.createdBy && typeof task.createdBy === 'object' && (
                      <div className="flex items-center gap-2">
                        <span>👤</span>
                        <span>
                          Créée par: {task.createdBy.firstName} {task.createdBy.lastName}
                        </span>
                      </div>
                    )}
                    {task.effectue && task.dateEffectue && (
                      <div className="flex items-center gap-2 text-green-600">
                        <span>✅</span>
                        <span>
                          Effectuée le: {new Date(task.dateEffectue).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    )}
                  </div>

                  {task.commentaireEffectue && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-semibold text-blue-700 mb-1">Commentaire:</p>
                      <p className="text-sm text-blue-900">{task.commentaireEffectue}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => openModal(task)}
                      className={`flex-1 ${
                        task.effectue
                          ? 'bg-gray-500 hover:bg-gray-600'
                          : 'bg-green-500 hover:bg-green-600'
                      } text-white`}
                    >
                      {task.effectue ? 'Modifier le statut' : 'Marquer comme effectuée'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal pour marquer comme effectué */}
        {showModal && selectedTask && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {selectedTask.effectue ? 'Modifier le statut de la tâche' : 'Marquer la tâche comme effectuée'}
                </h2>
                <p className="text-muted-foreground">
                  <strong>{selectedTask.titre}</strong>
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Statut
                  </label>
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
                        checked={selectedTask.effectue}
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
                    onChange={(e) => setCommentaire(e.target.value)}
                    placeholder="Ajoutez un commentaire sur l'état d'avancement ou les résultats..."
                    rows={4}
                  />
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedTask(null);
                    setCommentaire('');
                  }}
                  disabled={isUpdating}
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => handleMarkAsDone(selectedTask, selectedTask.effectue)}
                  disabled={isUpdating}
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  {isUpdating ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


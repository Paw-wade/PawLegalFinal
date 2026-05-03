'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tasksAPI } from '@/lib/api';
import { useSession } from 'next-auth/react';

interface TaskNotificationBannerProps {
  userRole: 'admin' | 'client' | 'partenaire';
  userId?: string;
}

interface TaskBannerItem {
  id: string;
  taskId: string;
  message: string;
  link: string;
  priority: 'high' | 'normal';
}

const STORAGE_KEY = 'taskNotificationBannerVisible';
const STORAGE_EVENT = 'taskNotificationBannerVisibilityChange';

export function TaskNotificationBanner({ userRole, userId }: TaskNotificationBannerProps) {
  const { data: session } = useSession();
  const [bannerItems, setBannerItems] = useState<TaskBannerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    // Écouter les changements de localStorage
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setIsVisible(e.newValue === 'true');
      }
    };

    const handleCustomStorageChange = () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      setIsVisible(stored === null ? true : stored === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(STORAGE_EVENT, handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(STORAGE_EVENT, handleCustomStorageChange);
    };
  }, []);

  useEffect(() => {
    // Chargement unique au montage / changement de rôle pour éviter les sursauts de page
    loadTaskNotifications();
  }, [userRole, userId, session]);

  const toggleVisibility = (newValue?: boolean) => {
    const valueToSet = newValue !== undefined ? newValue : !isVisible;
    setIsVisible(valueToSet);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, valueToSet.toString());
      window.dispatchEvent(new Event(STORAGE_EVENT));
    }
  };

  const loadTaskNotifications = async () => {
    setIsLoading(true);
    try {
      const items: TaskBannerItem[] = [];

      // Pour les admins : tâches créées par les partenaires ou assignées à l'admin
      if (userRole === 'admin' && userId) {
        try {
          const response = await tasksAPI.getAllTasks();
          if (response.data.success) {
            const tasks = response.data.tasks || [];
            
            // Normaliser l'ID utilisateur pour la comparaison
            const normalizedUserId = userId.toString();
            
            // Filtrer les tâches non terminées créées par des partenaires ou assignées à l'admin
            const relevantTasks = tasks.filter((task: any) => {
              const isNotDone = task.statut !== 'termine' && task.statut !== 'annule' && !task.effectue;
              if (!isNotDone) return false;
              
              // Vérifier si la tâche est assignée à l'admin
              const isAssignedToMe = task.assignedTo?.some((user: any) => {
                const assignedUserId = user._id?.toString() || user?.toString() || user;
                return assignedUserId === normalizedUserId;
              });
              
              // Vérifier si la tâche est créée par un partenaire et liée à un dossier
              const isCreatedByPartenaire = task.createdBy?.role === 'partenaire' || 
                                           (task.createdBy && typeof task.createdBy === 'object' && 
                                            (task.createdBy.role === 'partenaire' || 
                                             (task.createdBy._id && task.createdBy.role === 'partenaire')));
              const hasDossier = task.dossier;
              
              return isAssignedToMe || (isCreatedByPartenaire && hasDossier);
            });

            relevantTasks.slice(0, 5).forEach((task: any) => {
              const taskId = task._id?.toString() || task.id;
              const dossierId = task.dossier?._id?.toString() || task.dossier?.toString() || task.dossier;
              const creatorName = task.createdBy?.firstName && task.createdBy?.lastName
                ? `${task.createdBy.firstName} ${task.createdBy.lastName}`
                : task.createdBy?.email || 'Un utilisateur';
              
              const isAssignedToMe = task.assignedTo?.some((user: any) => {
                const assignedUserId = user._id?.toString() || user?.toString() || user;
                return assignedUserId === normalizedUserId;
              });

              let message = '';
              let link = '/admin/taches';
              
              if (isAssignedToMe) {
                message = `Nouvelle tâche assignée : "${task.titre || 'Sans titre'}"`;
                link = '/admin/taches';
              } else if (dossierId) {
                message = `${creatorName} (partenaire) a créé une tâche : "${task.titre || 'Sans titre'}"`;
                link = `/admin/dossiers/${dossierId}`;
              }

              if (message) {
                items.push({
                  id: `task-${taskId}`,
                  taskId: taskId || '',
                  message,
                  link,
                  priority: task.priorite === 'urgente' || task.priorite === 'haute' ? 'high' : 'normal'
                });
              }
            });
          }
        } catch (error) {
          console.error('Erreur lors du chargement des tâches pour admin:', error);
        }
      }

      // Pour les partenaires : tâches assignées à eux
      if (userRole === 'partenaire' && userId) {
        try {
          const response = await tasksAPI.getMyTasks({ statut: 'a_faire' });
          if (response.data.success) {
            const tasks = response.data.tasks || [];
            
            // Filtrer les tâches non terminées
            const relevantTasks = tasks.filter((task: any) => {
              return task.statut !== 'termine' && task.statut !== 'annule' && !task.effectue;
            });

            relevantTasks.slice(0, 5).forEach((task: any) => {
              const taskId = task._id?.toString() || task.id;
              const dossierId = task.dossier?._id?.toString() || task.dossier?.toString();
              
              items.push({
                id: `task-${taskId}`,
                taskId: taskId || '',
                message: `Nouvelle tâche assignée : "${task.titre || 'Sans titre'}"`,
                link: dossierId ? `/partenaire/dossiers/${dossierId}` : '/partenaire/dossiers',
                priority: task.priorite === 'urgente' || task.priorite === 'haute' ? 'high' : 'normal'
              });
            });
          }
        } catch (error) {
          console.error('Erreur lors du chargement des tâches pour partenaire:', error);
        }
      }

      // Pour les clients : tâches assignées à eux (si applicable)
      if (userRole === 'client' && userId) {
        try {
          const response = await tasksAPI.getMyTasks({ statut: 'a_faire' });
          if (response.data.success) {
            const tasks = response.data.tasks || [];
            
            const relevantTasks = tasks.filter((task: any) => {
              return task.statut !== 'termine' && task.statut !== 'annule' && !task.effectue;
            });

            relevantTasks.slice(0, 5).forEach((task: any) => {
              const taskId = task._id?.toString() || task.id;
              const dossierId = task.dossier?._id?.toString() || task.dossier?.toString();
              
              items.push({
                id: `task-${taskId}`,
                taskId: taskId || '',
                message: `Nouvelle tâche assignée : "${task.titre || 'Sans titre'}"`,
                link: dossierId ? `/client/dossiers/${dossierId}` : '/client/taches',
                priority: task.priorite === 'urgente' || task.priorite === 'haute' ? 'high' : 'normal'
              });
            });
          }
        } catch (error) {
          console.error('Erreur lors du chargement des tâches pour client:', error);
        }
      }

      setBannerItems(items);
    } catch (error) {
      console.error('Erreur lors du chargement des notifications de tâches:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Ne rien afficher si on charge ou s'il n'y a pas d'éléments
  if (isLoading || bannerItems.length === 0) {
    return null;
  }

  // Si la bannière est fermée, afficher une petite barre pour la rouvrir
  if (!isVisible) {
    return (
      <div className="w-full bg-gradient-to-r from-blue-500/5 via-blue-500/3 to-blue-500/5 border-b border-blue-500/10 shadow-sm">
        <div className="flex items-center justify-center py-2">
          <button
            onClick={() => toggleVisibility(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            aria-label="Afficher la bannière de notifications de tâches"
          >
            <span>✅</span>
            <span>Nouvelles tâches</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-blue-500/10 border-b border-blue-500/20 shadow-sm relative">
      <button
        onClick={() => toggleVisibility(false)}
        className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-muted-foreground hover:text-foreground transition-all shadow-sm"
        aria-label="Fermer la bannière de notifications de tâches"
        title="Fermer"
      >
        <span className="text-sm">×</span>
      </button>
      <div className="px-4 py-3 pr-12">
        <ul className="flex flex-col gap-2 list-none m-0 p-0">
          {bannerItems.map((item) => (
            <li key={item.id}>
              <Link
                href={item.link}
                className={`flex items-start sm:items-center gap-2 px-4 py-2.5 rounded-lg transition-all border ${
                  item.priority === 'high'
                    ? 'bg-red-50 border-red-200 hover:bg-red-50/90'
                    : 'bg-white/50 border-transparent hover:bg-blue-500/20 hover:border-blue-500/20'
                }`}
              >
                <span className="text-lg shrink-0" aria-hidden>✅</span>
                <span
                  className={`text-sm font-medium text-left flex-1 min-w-0 break-words ${
                    item.priority === 'high' ? 'text-red-900' : 'text-foreground'
                  }`}
                >
                  {item.message}
                </span>
                <span className="text-xs text-muted-foreground shrink-0" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

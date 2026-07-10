'use client';

import Link from 'next/link';
import { getStatutColor, getStatutLabel, getPrioriteColor, getPrioriteLabel } from '@/lib/taskUtils';

export function getDaysUntilDeadline(dateEcheance?: string | Date | null): number | null {
  if (!dateEcheance) return null;
  const deadline = new Date(dateEcheance);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function initialsFromUser(user: any): string {
  if (user?.firstName && user?.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  return (user?.email?.[0] || 'U').toUpperCase();
}

function displayName(user: any, short = false): string {
  if (user?.firstName || user?.lastName) {
    if (short) return user.firstName || user.lastName || '';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  }
  return user?.email || 'Utilisateur';
}

const STATUS_ACCENT: Record<string, string> = {
  a_faire: 'border-l-slate-400',
  en_cours: 'border-l-blue-500',
  en_attente: 'border-l-amber-500',
  termine: 'border-l-emerald-500',
  annule: 'border-l-red-400',
};

const TAG =
  'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium leading-5 border-0 shadow-none';

export type TaskListItemProps = {
  task: any;
  variant?: 'full' | 'compact';
  mode?: 'admin' | 'client' | 'readonly';
  expanded?: boolean;
  highlighted?: boolean;
  onToggleExpand?: () => void;
  teamMembers?: any[];
  disabled?: boolean;
  dossierBasePath?: string;
  onMarkDone?: (effectue: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onUpdateStatus?: (statut: string) => void;
  onUpdatePriority?: (priorite: string) => void;
  onUpdateAssignees?: (ids: string[]) => void;
  onOpenCompleteModal?: () => void;
};

export function TaskListItem({
  task,
  variant = 'full',
  mode = 'readonly',
  expanded = false,
  highlighted = false,
  onToggleExpand,
  teamMembers = [],
  disabled = false,
  dossierBasePath = '/admin/dossiers',
  onMarkDone,
  onEdit,
  onDelete,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateAssignees,
  onOpenCompleteModal,
}: TaskListItemProps) {
  const assignedToArray = Array.isArray(task.assignedTo)
    ? task.assignedTo.filter(Boolean)
    : task.assignedTo
      ? [task.assignedTo]
      : [];
  const daysUntilDeadline = getDaysUntilDeadline(task.dateEcheance);
  const isUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 2 && daysUntilDeadline >= 0;
  const isOverdue = daysUntilDeadline !== null && daysUntilDeadline < 0;
  const isDone = !!task.effectue || task.statut === 'termine';
  const isCompact = variant === 'compact';
  const canManage = mode === 'admin';
  const canComplete = mode === 'admin' || mode === 'client';
  const showActions = canComplete || canManage;

  const dossierId =
    task.dossier?._id || task.dossier?.id || (typeof task.dossier === 'string' ? task.dossier : null);
  const dossierTitle = task.dossier?.titre || (dossierId ? 'Dossier lié' : null);

  const deadlineLabel =
    daysUntilDeadline === null
      ? null
      : daysUntilDeadline < 0
        ? `−${Math.abs(daysUntilDeadline)}j`
        : daysUntilDeadline === 0
          ? "Auj."
          : daysUntilDeadline === 1
            ? 'Demain'
            : `${daysUntilDeadline}j`;

  const deadlineClass =
    isOverdue || isUrgent
      ? 'text-red-700 bg-red-50'
      : daysUntilDeadline !== null && daysUntilDeadline <= 3
        ? 'text-amber-700 bg-amber-50'
        : 'text-slate-600 bg-slate-100';

  const actions = showActions ? (
    <div className="flex items-center gap-1.5">
      {canComplete && !isDone && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => (onOpenCompleteModal ? onOpenCompleteModal() : onMarkDone?.(true))}
          className="h-7 sm:h-8 px-2 sm:px-2.5 rounded-md text-[11px] sm:text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          title="Marquer comme effectuée"
        >
          ✓ <span className="sm:inline">Fait</span>
        </button>
      )}
      {canComplete && isDone && mode === 'client' && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOpenCompleteModal?.()}
          className="h-7 sm:h-8 px-2 rounded-md text-[11px] font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Modifier
        </button>
      )}
      {canManage && onEdit && (
        <button
          type="button"
          disabled={disabled}
          onClick={onEdit}
          className="h-7 w-7 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
          title="Modifier"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}
      {canManage && onDelete && (
        <button
          type="button"
          disabled={disabled}
          onClick={onDelete}
          className="h-7 w-7 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md border border-red-100 text-red-500 hover:bg-red-50 disabled:opacity-50"
          title="Supprimer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  ) : null;

  const taskDomId = String(task._id || task.id || '');

  return (
    <article
      id={taskDomId ? `task-${taskDomId}` : undefined}
      className={`group bg-white border border-slate-200/80 border-l-[3px] ${
        STATUS_ACCENT[task.statut] || STATUS_ACCENT.a_faire
      } ${isCompact ? 'rounded-lg px-2.5 py-2' : 'rounded-lg sm:rounded-xl px-3 py-2.5 sm:px-4 sm:py-3'} ${
        isOverdue && !isDone ? 'bg-red-50/30' : isDone ? 'bg-emerald-50/20' : ''
      } ${highlighted ? 'ring-2 ring-primary/50 border-primary/40 shadow-md' : ''} hover:border-slate-300 hover:shadow-sm transition-all`}
    >
      {/* Ligne 1 : titre (+ actions desktop) */}
      <div className="flex items-start gap-1.5 sm:gap-2">
        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="mt-0.5 shrink-0 p-1 -ml-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-expanded={expanded}
            title={expanded ? 'Réduire' : 'Développer'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3
              className={`min-w-0 flex-1 font-semibold text-slate-900 leading-snug break-words ${
                isCompact ? 'text-sm' : 'text-sm sm:text-[15px]'
              } ${isDone ? 'line-through decoration-slate-300 text-slate-500' : ''}`}
            >
              {task.titre || <span className="italic text-slate-400 font-normal">Sans titre</span>}
            </h3>
            {/* Actions à droite uniquement dès sm */}
            {actions && <div className="hidden sm:flex shrink-0">{actions}</div>}
          </div>

          {/* Tags compacts */}
          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
            <span className={`${TAG} ${getStatutColor(task.statut)}`}>{getStatutLabel(task.statut)}</span>
            {task.priorite && (
              <span className={`${TAG} ${getPrioriteColor(task.priorite)}`}>
                {getPrioriteLabel(task.priorite)}
              </span>
            )}
            {task.dateEcheance && deadlineLabel && (
              <span className={`${TAG} tabular-nums ${deadlineClass}`}>
                {new Date(task.dateEcheance).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
                <span className="opacity-70"> · {deadlineLabel}</span>
              </span>
            )}
          </div>

          {!expanded && task.description && (
            <p className="mt-1 text-xs sm:text-sm text-slate-500 line-clamp-2 sm:line-clamp-1">
              {task.description}
            </p>
          )}

          {/* Méta : une ligne fluide, sans max-width trop agressifs */}
          <div className="mt-1.5 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 text-[11px] sm:text-xs text-slate-500">
            {assignedToArray.length > 0 && (
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="flex -space-x-1.5 shrink-0">
                  {assignedToArray.slice(0, 3).map((assigned: any, idx: number) => (
                    <div
                      key={assigned?._id || assigned?.id || idx}
                      title={displayName(assigned)}
                      className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-slate-700 text-white text-[8px] sm:text-[9px] font-semibold flex items-center justify-center ring-1 ring-white"
                    >
                      {initialsFromUser(assigned)}
                    </div>
                  ))}
                </div>
                <span className="truncate text-slate-600">
                  {assignedToArray.length === 1
                    ? (
                      <>
                        <span className="sm:hidden">{displayName(assignedToArray[0], true)}</span>
                        <span className="hidden sm:inline">{displayName(assignedToArray[0])}</span>
                      </>
                    )
                    : `${assignedToArray.length} assignés`}
                </span>
              </div>
            )}

            {dossierTitle &&
              (dossierId ? (
                <Link
                  href={`${dossierBasePath}/${dossierId}`}
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline min-w-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span aria-hidden className="shrink-0">
                    📁
                  </span>
                  <span className="truncate">{dossierTitle}</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 min-w-0">
                  <span aria-hidden className="shrink-0">
                    📁
                  </span>
                  <span className="truncate">{dossierTitle}</span>
                </span>
              ))}

            {task.createdBy && typeof task.createdBy === 'object' && (
              <span className="truncate text-slate-400">
                <span className="sm:hidden">par {task.createdBy.firstName}</span>
                <span className="hidden sm:inline">
                  par {task.createdBy.firstName} {task.createdBy.lastName}
                </span>
              </span>
            )}

            {isDone && task.dateEffectue && (
              <span className="text-emerald-700 font-medium">
                Effectuée le {new Date(task.dateEffectue).toLocaleDateString('fr-FR')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions mobile : barre dédiée sous le contenu */}
      {actions && (
        <div className="sm:hidden mt-2.5 pt-2 border-t border-slate-100 flex justify-end">{actions}</div>
      )}

      {/* Panneau développé */}
      {expanded && (
        <div className={`mt-2.5 pt-2.5 border-t border-slate-100 ${onToggleExpand ? 'sm:ml-6' : ''} space-y-2.5`}>
          {task.description && (
            <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {task.description}
            </p>
          )}

          {task.commentaireEffectue && (
            <div className="rounded-lg bg-blue-50/80 border border-blue-100 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 mb-0.5">
                Commentaire
              </p>
              <p className="text-xs sm:text-sm text-blue-900">{task.commentaireEffectue}</p>
            </div>
          )}

          {isDone && task.completedBy && (
            <p className="text-[11px] sm:text-xs text-emerald-700">
              Validée par {task.completedBy.firstName} {task.completedBy.lastName}
              {task.dateEffectue
                ? ` le ${new Date(task.dateEffectue).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
            </p>
          )}

          {canManage && (onUpdateStatus || onUpdatePriority || onUpdateAssignees) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {onUpdateStatus && (
                <label className="block">
                  <span className="text-[10px] font-medium text-slate-500 mb-1 block">Statut</span>
                  <select
                    value={task.statut}
                    onChange={(e) => onUpdateStatus(e.target.value)}
                    disabled={disabled}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="a_faire">À faire</option>
                    <option value="en_cours">En cours</option>
                    <option value="en_attente">En attente</option>
                    <option value="termine">Terminé</option>
                    <option value="annule">Annulé</option>
                  </select>
                </label>
              )}
              {onUpdatePriority && (
                <label className="block">
                  <span className="text-[10px] font-medium text-slate-500 mb-1 block">Priorité</span>
                  <select
                    value={task.priorite}
                    onChange={(e) => onUpdatePriority(e.target.value)}
                    disabled={disabled}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="basse">Basse</option>
                    <option value="normale">Normale</option>
                    <option value="haute">Haute</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </label>
              )}
              {onUpdateAssignees && teamMembers.length > 0 && (
                <label className="block">
                  <span className="text-[10px] font-medium text-slate-500 mb-1 block">Assignés</span>
                  <details className="relative">
                    <summary className="h-9 list-none cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 text-sm flex items-center justify-between gap-2">
                      <span className="truncate text-slate-700">
                        {assignedToArray.length === 0
                          ? 'Choisir…'
                          : assignedToArray.length === 1
                            ? displayName(assignedToArray[0])
                            : `${assignedToArray.length} sélectionnés`}
                      </span>
                      <span className="text-slate-400">▾</span>
                    </summary>
                    <div className="absolute z-20 mt-1 w-full min-w-[200px] left-0 right-0 sm:left-auto sm:right-0 bg-white border border-slate-200 rounded-lg shadow-lg p-2 max-h-52 overflow-y-auto">
                      {teamMembers.map((member) => {
                        const memberId = String(member._id || member.id);
                        const currentIds = assignedToArray
                          .map((a: any) => String(a?._id || a?.id || a))
                          .filter(Boolean);
                        const isChecked = currentIds.includes(memberId);
                        return (
                          <label
                            key={memberId}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={disabled}
                              onChange={() => {
                                const next = isChecked
                                  ? currentIds.filter((id) => id !== memberId)
                                  : [...currentIds, memberId];
                                onUpdateAssignees(next);
                              }}
                              className="rounded border-slate-300 text-primary focus:ring-primary"
                            />
                            <span className="truncate">
                              {member.firstName} {member.lastName}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                </label>
              )}
            </div>
          )}

          {canManage && isDone && onMarkDone && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onMarkDone(false)}
              className="text-[11px] sm:text-xs font-medium text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
            >
              Marquer comme non effectuée
            </button>
          )}
        </div>
      )}
    </article>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CalendarDays, CheckSquare, ChevronRight, FileText, X } from 'lucide-react';
import { dossiersAPI } from '@/lib/api';
import {
  countDashboardTodoBannerItems,
  loadDashboardTodoBannerItems,
  notificationsHubHref,
  type DashboardTodoPayload,
  type DashboardTodoUserRole,
} from '@/lib/loadDashboardTodoBannerItems';
import { NOTIFICATIONS_UPDATED_EVENT } from '@/lib/notificationsEvents';
import { useNotificationBannerVisibility } from '@/hooks/useNotificationBannerVisibility';

interface NotificationBannerProps {
  userRole: DashboardTodoUserRole;
  userId?: string;
}

export function NotificationBanner({ userRole, userId }: NotificationBannerProps) {
  const router = useRouter();
  const [payload, setPayload] = useState<DashboardTodoPayload>({
    appointments: [],
    items: [],
    transmissions: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [processingDossiers, setProcessingDossiers] = useState<Set<string>>(new Set());
  const { isVisible, toggleVisibility } = useNotificationBannerVisibility();

  const refreshBanner = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await loadDashboardTodoBannerItems(userRole, userId);
      setPayload(next);
    } catch (error) {
      console.error('Erreur lors du chargement de la bannière À traiter:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userRole, userId]);

  useEffect(() => {
    void refreshBanner();
  }, [refreshBanner]);

  useEffect(() => {
    const onNotificationsUpdated = () => {
      void refreshBanner();
    };
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, onNotificationsUpdated);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, onNotificationsUpdated);
  }, [refreshBanner]);

  const totalCount = countDashboardTodoBannerItems(payload);

  const handleAcceptTransmission = async (dossierId: string) => {
    if (!dossierId || processingDossiers.has(dossierId)) return;
    setProcessingDossiers((prev) => new Set(prev).add(dossierId));
    try {
      const response = await dossiersAPI.acknowledgeDossier(dossierId, 'accept');
      if (response.data.success) {
        await refreshBanner();
        router.push(`/partenaire/dossiers/${dossierId}`);
      } else {
        alert(response.data.message || "Erreur lors de l'acceptation du dossier");
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      alert(err.response?.data?.message || "Erreur lors de l'acceptation du dossier");
    } finally {
      setProcessingDossiers((prev) => {
        const next = new Set(prev);
        next.delete(dossierId);
        return next;
      });
    }
  };

  const handleRefuseTransmission = async (dossierId: string) => {
    if (!dossierId || processingDossiers.has(dossierId)) return;
    if (!window.confirm('Êtes-vous sûr de vouloir refuser ce dossier ?')) return;
    setProcessingDossiers((prev) => new Set(prev).add(dossierId));
    try {
      const response = await dossiersAPI.acknowledgeDossier(dossierId, 'refuse');
      if (response.data.success) {
        await refreshBanner();
      } else {
        alert(response.data.message || 'Erreur lors du refus du dossier');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      alert(err.response?.data?.message || 'Erreur lors du refus du dossier');
    } finally {
      setProcessingDossiers((prev) => {
        const next = new Set(prev);
        next.delete(dossierId);
        return next;
      });
    }
  };

  if (isLoading || totalCount === 0) {
    return null;
  }

  if (!isVisible) {
    return (
      <div className="w-full border-b border-border/70 bg-muted/30">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-3 py-2">
          <button
            type="button"
            onClick={() => toggleVisibility(true)}
            className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Afficher les éléments à traiter"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden />
            <span>À traiter ({totalCount})</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full border-b border-primary/15 bg-gradient-to-r from-primary/8 via-background to-primary/5">
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-3 py-2.5 sm:px-4">
        <div className="hidden shrink-0 sm:block">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">À traiter</p>
          <p className="text-lg font-semibold leading-none text-foreground">{totalCount}</p>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {payload.appointments.map((group) => (
            <div
              key={group.key}
              className="rounded-lg border border-border/80 bg-card/80 px-3 py-2 shadow-sm"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <p className="truncate text-sm font-semibold text-foreground">{group.label}</p>
                </div>
                <Link
                  href={group.listLink}
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  Agenda
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.slots.map((slot) => (
                  <Link
                    key={slot.id}
                    href={slot.link}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-primary/10"
                  >
                    <span className="tabular-nums text-primary">{slot.time}</span>
                    <span className="truncate">{slot.name}</span>
                  </Link>
                ))}
                {group.overflow > 0 ? (
                  <Link
                    href={group.listLink}
                    className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  >
                    +{group.overflow} autre{group.overflow > 1 ? 's' : ''}
                  </Link>
                ) : null}
              </div>
            </div>
          ))}

          {payload.transmissions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {payload.transmissions.map((item) => {
                const isProcessing = processingDossiers.has(item.dossierId);
                return (
                  <div
                    key={item.id}
                    className="min-w-[min(100%,18rem)] flex-1 rounded-lg border border-orange-200/80 bg-orange-50/70 px-3 py-2 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Link
                        href={item.link}
                        className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-border hover:bg-muted/50"
                      >
                        Ouvrir
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleAcceptTransmission(item.dossierId)}
                        disabled={isProcessing}
                        className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRefuseTransmission(item.dossierId)}
                        disabled={isProcessing}
                        className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {payload.items.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {payload.items.map((item) => {
                const Icon = item.kind === 'task' ? CheckSquare : item.kind === 'dossier' ? FileText : Bell;
                return (
                  <Link
                    key={item.id}
                    href={item.link}
                    className={`inline-flex min-w-[min(100%,16rem)] flex-1 items-start gap-2 rounded-lg border px-3 py-2 shadow-sm transition-colors hover:bg-muted/40 ${
                      item.priority === 'high'
                        ? 'border-red-200/80 bg-red-50/60'
                        : 'border-border/80 bg-card/80'
                    }`}
                  >
                    <Icon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        item.priority === 'high' ? 'text-red-600' : 'text-primary'
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-snug text-foreground">{item.title}</span>
                      {item.subtitle ? (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                      ) : null}
                    </span>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <button
            type="button"
            onClick={() => toggleVisibility(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
            aria-label="Masquer la bannière À traiter"
            title="Masquer"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <Link
            href={notificationsHubHref(userRole)}
            className="hidden text-xs font-medium text-primary hover:underline sm:inline"
          >
            Tout voir
          </Link>
        </div>
      </div>
    </div>
  );
}

import { appointmentsAPI, dossiersAPI, notificationsAPI, tasksAPI } from '@/lib/api';

export type DashboardTodoUserRole = 'admin' | 'client' | 'partenaire';

export type DashboardTodoAppointmentSlot = {
  id: string;
  time: string;
  name: string;
  link: string;
};

export type DashboardTodoAppointmentGroup = {
  key: 'today' | 'tomorrow';
  label: string;
  slots: DashboardTodoAppointmentSlot[];
  overflow: number;
  listLink: string;
};

export type DashboardTodoTransmission = {
  id: string;
  dossierId: string;
  title: string;
  subtitle: string;
  link: string;
};

export type DashboardTodoItem = {
  id: string;
  kind: 'task' | 'dossier' | 'custom';
  title: string;
  subtitle?: string;
  link: string;
  priority: 'high' | 'normal';
};

export type DashboardTodoPayload = {
  appointments: DashboardTodoAppointmentGroup[];
  items: DashboardTodoItem[];
  transmissions: DashboardTodoTransmission[];
};

const safeString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return '';
  return '';
};

const agendaLink = (userRole: DashboardTodoUserRole, date: string) =>
  userRole === 'partenaire' ? `/partenaire/rendez-vous?date=${date}` : `/admin/rendez-vous?date=${date}`;

async function loadAppointmentGroups(userRole: DashboardTodoUserRole): Promise<DashboardTodoAppointmentGroup[]> {
  if (userRole !== 'admin' && userRole !== 'partenaire') return [];

  try {
    const appointmentsResponse = await appointmentsAPI.getAllAppointments();
    if (!appointmentsResponse.data.success) return [];

    const appointments = appointmentsResponse.data.data || appointmentsResponse.data.appointments || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isActive = (apt: { statut?: string }) => {
      const statut = safeString(apt.statut).toLowerCase();
      return statut !== 'annule' && statut !== 'annulé';
    };

    const matchDay = (apt: { date?: string }, day: Date) => {
      if (!apt.date) return false;
      const aptDate = new Date(apt.date);
      aptDate.setHours(0, 0, 0, 0);
      return aptDate.getTime() === day.getTime();
    };

    const toSlot = (apt: Record<string, unknown>): DashboardTodoAppointmentSlot => {
      const aptId = safeString(apt._id) || safeString(apt.id) || '';
      const clientName = `${safeString(apt.prenom)} ${safeString(apt.nom)}`.trim() || 'Client';
      const heure = safeString(apt.heure).slice(0, 5);
      const aptDate = safeString(apt.date);
      return {
        id: aptId || `apt-${Math.random()}`,
        time: heure || '—',
        name: clientName,
        link: agendaLink(userRole, aptDate),
      };
    };

    const todayApps = appointments.filter((apt: Record<string, unknown>) => isActive(apt) && matchDay(apt, today));
    const tomorrowApps = appointments.filter((apt: Record<string, unknown>) => isActive(apt) && matchDay(apt, tomorrow));

    const groups: DashboardTodoAppointmentGroup[] = [];
    const todayDate = today.toISOString().split('T')[0];
    const tomorrowDate = tomorrow.toISOString().split('T')[0];

    if (todayApps.length > 0) {
      const slots = todayApps.slice(0, 3).map(toSlot);
      groups.push({
        key: 'today',
        label: "Aujourd'hui",
        slots,
        overflow: Math.max(0, todayApps.length - slots.length),
        listLink: agendaLink(userRole, todayDate),
      });
    }

    if (tomorrowApps.length > 0) {
      const slots = tomorrowApps.slice(0, 3).map(toSlot);
      groups.push({
        key: 'tomorrow',
        label: 'Demain',
        slots,
        overflow: Math.max(0, tomorrowApps.length - slots.length),
        listLink: agendaLink(userRole, tomorrowDate),
      });
    }

    return groups;
  } catch (error) {
    console.error('Erreur lors du chargement des rendez-vous pour la bannière:', error);
    return [];
  }
}

async function loadClientNotificationItems(userId: string): Promise<DashboardTodoItem[]> {
  try {
    const notificationsResponse = await notificationsAPI.getNotifications({ lu: false, limit: 10 });
    if (!notificationsResponse.data.success) return [];

    const notifications = notificationsResponse.data.notifications || [];
    const importantNotifications = notifications.filter((notif: Record<string, unknown>) => {
      const type = safeString(notif.type).toLowerCase();
      const isDocument = type === 'document_request' || type.includes('document');
      const isTransmission = type.includes('transmis') || type.includes('transmission');
      const isClosureOrArchive =
        type.includes('cloture') || type.includes('clôture') || type.includes('closed') || type.includes('archive');
      const isTarification = type === 'tarification_choice_requested' || type.includes('tarification');
      return isDocument || isTransmission || isClosureOrArchive || isTarification;
    });

    const items: DashboardTodoItem[] = [];

    importantNotifications.slice(0, 4).forEach((notif: Record<string, unknown>) => {
      const notifType = safeString(notif.type);
      const lowerType = notifType.toLowerCase();
      const data = (notif.data || notif.metadata || {}) as Record<string, unknown>;
      const id = safeString(notif._id) || safeString(notif.id) || `notif-${Math.random()}`;

      if (notifType === 'document_request') {
        const dossierId = safeString(data.dossierId);
        const dossierNumero = safeString(data.dossierNumero);
        const label =
          safeString(data.documentTypeLabel) || safeString(data.documentType) || 'document';
        const isUrgent = Boolean(data.isUrgent);
        items.push({
          id: `notification-${id}`,
          kind: 'dossier',
          title: isUrgent ? 'Document urgent demandé' : 'Document demandé',
          subtitle: `${label}${dossierNumero ? ` · dossier ${dossierNumero}` : ''}`.trim(),
          link: dossierId ? `/client/dossiers/${dossierId}` : '/client/documents',
          priority: isUrgent ? 'high' : 'normal',
        });
        return;
      }

      if (notifType === 'tarification_choice_requested' || lowerType.includes('tarification')) {
        items.push({
          id: `notification-${id}`,
          kind: 'custom',
          title: 'Tarification',
          subtitle: safeString(notif.message) || safeString(notif.titre) || 'Information disponible sur votre dossier.',
          link: '/client/tarification',
          priority: 'high',
        });
        return;
      }

      let title = safeString(notif.titre) || 'Notification dossier';
      let subtitle = safeString(notif.message) || undefined;
      let link = '/client/notifications';
      let priority: 'high' | 'normal' = lowerType.includes('urgent') ? 'high' : 'normal';

      if (lowerType.includes('document')) {
        title = 'Document';
        const dossierId = safeString(notif.dossierId) || safeString((notif.metadata as Record<string, unknown>)?.dossierId);
        if (dossierId) link = `/client/dossiers/${dossierId}`;
      } else if (lowerType.includes('transmis') || lowerType.includes('transmission')) {
        title = 'Dossier transmis';
        const dossierId =
          safeString(notif.dossierId) ||
          safeString((notif.metadata as Record<string, unknown>)?.dossierId) ||
          safeString(data.dossierId);
        if (dossierId) link = `/client/dossiers/${dossierId}`;
        if (!subtitle) subtitle = 'Votre dossier a été transmis.';
      } else if (
        lowerType.includes('cloture') ||
        lowerType.includes('clôture') ||
        lowerType.includes('closed') ||
        lowerType.includes('archive')
      ) {
        title = 'Statut du dossier';
        const dossierId =
          safeString(notif.dossierId) ||
          safeString((notif.metadata as Record<string, unknown>)?.dossierId) ||
          safeString(data.dossierId);
        if (dossierId) link = `/client/dossiers/${dossierId}`;
        if (!subtitle) subtitle = 'Le statut de votre dossier a été mis à jour.';
      }

      items.push({
        id: `notification-${id}`,
        kind: 'dossier',
        title,
        subtitle,
        link,
        priority,
      });
    });

    return items;
  } catch (error) {
    console.error('Erreur lors du chargement des notifications client:', error);
    return [];
  }
}

async function loadTaskItems(userRole: DashboardTodoUserRole, userId: string): Promise<DashboardTodoItem[]> {
  const items: DashboardTodoItem[] = [];

  try {
    if (userRole === 'admin') {
      const response = await tasksAPI.getAllTasks();
      if (!response.data.success) return items;

      const tasks = response.data.tasks || [];
      const normalizedUserId = userId.toString();

      tasks
        .filter((task: Record<string, unknown>) => {
          const statut = safeString(task.statut);
          if (statut === 'termine' || statut === 'annule' || task.effectue) return false;
          const assignedTo = Array.isArray(task.assignedTo) ? task.assignedTo : [];
          const isAssignedToMe = assignedTo.some((user: unknown) => {
            const assignedUserId =
              typeof user === 'object' && user !== null && '_id' in user
                ? safeString((user as { _id?: unknown })._id)
                : safeString(user);
            return assignedUserId === normalizedUserId;
          });
          const createdBy = task.createdBy as Record<string, unknown> | undefined;
          const isCreatedByPartenaire = safeString(createdBy?.role) === 'partenaire';
          return isAssignedToMe || (isCreatedByPartenaire && Boolean(task.dossier));
        })
        .slice(0, 4)
        .forEach((task: Record<string, unknown>) => {
          const taskId = safeString(task._id) || safeString(task.id);
          const dossierId = safeString((task.dossier as Record<string, unknown> | undefined)?._id) || safeString(task.dossier);
          const titre = safeString(task.titre) || 'Sans titre';
          const createdBy = task.createdBy as Record<string, unknown> | undefined;
          const creatorName =
            createdBy?.firstName && createdBy?.lastName
              ? `${safeString(createdBy.firstName)} ${safeString(createdBy.lastName)}`
              : safeString(createdBy?.email) || 'Un utilisateur';
          const assignedTo = Array.isArray(task.assignedTo) ? task.assignedTo : [];
          const isAssignedToMe = assignedTo.some((user: unknown) => {
            const assignedUserId =
              typeof user === 'object' && user !== null && '_id' in user
                ? safeString((user as { _id?: unknown })._id)
                : safeString(user);
            return assignedUserId === normalizedUserId;
          });

          items.push({
            id: `task-${taskId}`,
            kind: 'task',
            title: isAssignedToMe ? 'Tâche assignée' : 'Tâche partenaire',
            subtitle: isAssignedToMe ? titre : `${creatorName} · ${titre}`,
            link: dossierId ? `/admin/dossiers/${dossierId}` : '/admin/taches',
            priority:
              safeString(task.priorite) === 'urgente' || safeString(task.priorite) === 'haute' ? 'high' : 'normal',
          });
        });
    } else if (userRole === 'partenaire' || userRole === 'client') {
      const response = await tasksAPI.getMyTasks({ statut: 'a_faire' });
      if (!response.data.success) return items;

      const tasks = (response.data.tasks || []).filter((task: Record<string, unknown>) => {
        const statut = safeString(task.statut);
        return statut !== 'termine' && statut !== 'annule' && !task.effectue;
      });

      tasks.slice(0, 4).forEach((task: Record<string, unknown>) => {
        const taskId = safeString(task._id) || safeString(task.id);
        const dossierId = safeString((task.dossier as Record<string, unknown> | undefined)?._id) || safeString(task.dossier);
        const titre = safeString(task.titre) || 'Sans titre';
        const base = userRole === 'partenaire' ? '/partenaire' : '/client';
        items.push({
          id: `task-${taskId}`,
          kind: 'task',
          title: 'Tâche à faire',
          subtitle: titre,
          link: dossierId ? `${base}/dossiers/${dossierId}` : `${base}/taches`,
          priority:
            safeString(task.priorite) === 'urgente' || safeString(task.priorite) === 'haute' ? 'high' : 'normal',
        });
      });
    }
  } catch (error) {
    console.error('Erreur lors du chargement des tâches pour la bannière:', error);
  }

  return items;
}

async function loadTransmissionItems(userRole: DashboardTodoUserRole, userId: string): Promise<DashboardTodoTransmission[]> {
  if (userRole !== 'partenaire' || !userId) return [];

  try {
    const response = await dossiersAPI.getMyDossiers();
    if (!response.data.success) return [];

    const dossiers = response.data.dossiers || [];
    const userIdStr = userId.toString();

    return dossiers
      .filter((dossier: Record<string, unknown>) => {
        const transmittedTo = Array.isArray(dossier.transmittedTo) ? dossier.transmittedTo : [];
        return transmittedTo.some((trans: Record<string, unknown>) => {
          const transPartenaireId =
            safeString((trans.partenaire as Record<string, unknown> | undefined)?._id) || safeString(trans.partenaire);
          return transPartenaireId === userIdStr && safeString(trans.status) === 'pending';
        });
      })
      .slice(0, 4)
      .map((dossier: Record<string, unknown>) => {
        const dossierId = safeString(dossier._id) || safeString(dossier.id);
        const dossierNumero = safeString(dossier.numero) || safeString(dossier.numeroDossier) || 'Sans numéro';
        const dossierTitre = safeString(dossier.titre) || 'Sans titre';
        return {
          id: `transmission-${dossierId}`,
          dossierId: dossierId || '',
          title: 'Dossier transmis',
          subtitle: `${dossierNumero} · ${dossierTitre}`,
          link: `/partenaire/dossiers/${dossierId}`,
        };
      });
  } catch (error) {
    console.error('Erreur lors du chargement des transmissions pour la bannière:', error);
    return [];
  }
}

export async function loadDashboardTodoBannerItems(
  userRole: DashboardTodoUserRole,
  userId?: string
): Promise<DashboardTodoPayload> {
  const [appointments, clientItems, taskItems, transmissions] = await Promise.all([
    loadAppointmentGroups(userRole),
    userRole === 'client' && userId ? loadClientNotificationItems(userId) : Promise.resolve([]),
    userId ? loadTaskItems(userRole, userId) : Promise.resolve([]),
    userId ? loadTransmissionItems(userRole, userId) : Promise.resolve([]),
  ]);

  const items = [...taskItems, ...clientItems]
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
      return 0;
    })
    .slice(0, 6);

  return {
    appointments,
    items,
    transmissions,
  };
}

export function countDashboardTodoBannerItems(payload: DashboardTodoPayload): number {
  const appointmentCount = payload.appointments.reduce(
    (sum, group) => sum + group.slots.length + group.overflow,
    0
  );
  return appointmentCount + payload.items.length + payload.transmissions.length;
}

export function notificationsHubHref(userRole: DashboardTodoUserRole): string {
  if (userRole === 'admin') return '/admin/notifications';
  if (userRole === 'partenaire') return '/partenaire/notifications';
  return '/client/notifications';
}

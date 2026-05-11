/** Dispatched when in-app notifications change (read / delete / mark-all) so the header badge can refetch. */
export const NOTIFICATIONS_UPDATED_EVENT = 'pawlegal:notifications-updated';

export function emitNotificationsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
}

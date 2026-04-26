self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { title: 'Notification', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Ada Papers';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/ada-papers-logo.png',
    badge: payload.badge || '/ada-papers-logo.png',
    tag: payload.tag || undefined,
    data: {
      url: payload.url || '/client/notifications',
      metadata: payload.metadata || {},
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});


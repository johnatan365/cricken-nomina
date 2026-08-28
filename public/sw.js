// Service worker de Cricken: recibe las notificaciones push en la version web.
//
// El navegador lo mantiene vivo aunque la pestana este cerrada, asi que el aviso
// (por ejemplo "falta el pedido de hoy") llega igual que en el telefono.
//
// En iPhone esto SOLO funciona si la persona agrego Cricken a la pantalla de
// inicio ("Compartir -> Agregar a inicio"). Safari no permite notificaciones web
// de otra forma.

self.addEventListener('install', () => {
  // Empieza a funcionar de inmediato, sin esperar a que se cierren las
  // pestanas viejas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Cricken', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Cricken';
  const options = {
    body: payload.body || '',
    icon: '/icon-Cricken.png',
    badge: '/icon-Cricken.png',
    tag: 'cricken-pedido',
    renotify: true,
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const target = data.url || '/admin';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si Cricken ya esta abierto, se reutiliza esa ventana en vez de abrir otra.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/admin');
    })
  );
});

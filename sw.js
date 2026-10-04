// Byhnex service worker: only shows Signaux notifications and reopens the page on tap.
// No fetch handler on purpose: market data must never be served from a cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('signaux-crypto.html', self.registration.scope).href;
  event.waitUntil((async () => {
    for (const client of await self.clients.matchAll({type: 'window', includeUncontrolled: true})) {
      if (client.url.split('#')[0].split('?')[0] === target && 'focus' in client) return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});

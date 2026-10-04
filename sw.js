// Byhnex service worker: shows Signaux notifications (page or robot push) and reopens the page on tap.
// No fetch handler on purpose: market data must never be served from a cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// Push from the GitHub robot (Web Push, encrypted end to end).
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Byhnex', {
    body: d.body || '', tag: d.tag || 'byhnex', renotify: true,
    icon: 'icon-192.png?v=20261004-fav', badge: 'favicon.png?v=20261004-fav',
    data: { url: d.url || 'signaux-crypto.html' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || 'signaux-crypto.html', self.registration.scope).href;
  event.waitUntil((async () => {
    for (const client of await self.clients.matchAll({type: 'window', includeUncontrolled: true})) {
      if (client.url.split('#')[0].split('?')[0] === target && 'focus' in client) return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});

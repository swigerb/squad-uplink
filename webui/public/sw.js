// Minimal service worker for PWA installability.
// No offline caching — the portal requires a live connection.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

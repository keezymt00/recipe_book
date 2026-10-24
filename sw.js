// sw.js – Service Worker: macht die App offline-fähig.
//
// Strategie "Network first mit Timeout":
//  - Online: immer die frische Version laden (und im Cache aktualisieren).
//  - Offline oder Netz langsamer als 3 s (Supermarkt!): sofort aus dem Cache.
// Bei neuen Dateien VERSION erhöhen und die Liste ASSETS ergänzen.

const VERSION = 'v4';
const CACHE = `kochbuch-${VERSION}`;

// App-Hülle, die beim Installieren vorab gecacht wird (relative Pfade → funktioniert auch unter /repo-name/)
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.json',
  'js/app.js',
  'js/state.js',
  'js/db.js',
  'js/ui.js',
  'js/units.js',
  'js/aisles.js',
  'js/parser.js',
  'js/seed.js',
  'js/backup.js',
  'js/plan.js',
  'js/shopping.js',
  'js/views/list.js',
  'js/views/detail.js',
  'js/views/form.js',
  'js/views/importer.js',
  'js/views/cook.js',
  'js/views/more.js',
  'js/views/planner.js',
  'js/views/shopping.js',
  'js/views/sheets.js',
  'js/views/pantry.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Alte Cache-Versionen aufräumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('kochbuch-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Nur eigene GET-Anfragen behandeln
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);

  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  network.catch(() => {}); // verhindert "unhandled rejection", wenn der Timeout gewinnt

  const fromCache = async () =>
    (await cache.match(req, { ignoreSearch: true })) ||
    (req.mode === 'navigate' ? await cache.match('index.html') : undefined);

  try {
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
  } catch {
    // Offline oder zu langsam → Cache; gibt es nichts im Cache, doch noch aufs Netz warten
    return (await fromCache()) || network.catch(() => Response.error());
  }
}

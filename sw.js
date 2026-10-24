// sw.js – Service Worker: macht die App offline-fähig.
//
// Strategie "Network first mit Timeout":
//  - Online: immer die frische Version laden (und im Cache aktualisieren). "no-cache" fragt den
//    Server bei jeder Datei, ob sie sich geändert hat (ETag) – so umgehen wir die 10 Minuten,
//    die GitHub Pages Dateien sonst im Browser zwischenspeichern lässt. Unveränderte Dateien
//    kosten dabei nur eine kurze 304-Antwort.
//  - Offline oder Netz langsamer als 3 s (Supermarkt!): sofort aus dem Cache.
// Bei neuen Dateien VERSION erhöhen und die Liste ASSETS ergänzen.

const VERSION = 'v6';
const CACHE = `kochbuch-${VERSION}`;

// App-Hülle, die beim Installieren vorab gecacht wird (relative Pfade → funktioniert auch unter /repo-name/)
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.json',
  'js/app.js',
  'js/version.js',
  'js/update.js',
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
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Versions-Abfrage der App (update.js) immer direkt ans Netz, nie in den Cache
  if (url.searchParams.has('check')) return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);

  // Über die URL statt das Request-Objekt: Navigations-Requests lassen sich nicht mit Optionen kopieren
  const network = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
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

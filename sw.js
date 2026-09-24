// Service Worker fuer das PV Matrix Tool.
// * macht die App am Handy installierbar und oeffnet sie auch ohne Netz
// * index.html und config.js kommen immer zuerst frisch aus dem Netz, damit
//   Updates sofort ankommen – nur ohne Verbindung aus dem Zwischenspeicher
// * Anfragen an Supabase (Anmeldung, Projekte, Messwerte) werden NIE
//   zwischengespeichert
const VERSION = 'pv-matrix-v19';   // bei Aenderungen an dieser Datei hochzaehlen
const HUELLE = ['./', './index.html', './config.js', './manifest.webmanifest',
  './css/app.css?v=20260922b', './css/pro.css?v=20260924c', './js/app.js?v=20260924c', './js/fotos.js?v=20260924c', './js/sw-registrierung.js?v=20260923b',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.all(HUELLE.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(namen => Promise.all(namen.filter(n => n !== VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  // Daten und Anmeldung immer live
  if (/(^|\.)supabase\.(co|in)$/.test(url.hostname)) return;

  const eigene = url.origin === self.location.origin;
  const istSeite = req.mode === 'navigate' ||
    (eigene && (url.pathname.endsWith('/') || /\.(html|css|js)$/.test(url.pathname)));

  if (istSeite) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(antwort => {
          if (antwort && antwort.ok) {
            const kopie = antwort.clone();
            caches.open(VERSION).then(cache => cache.put(req, kopie));
          }
          return antwort;
        })
        .catch(() => caches.match(req).then(treffer => treffer || caches.match('./index.html')))
    );
    return;
  }

  // Bibliotheken, Schriften, Icons: sofort aus dem Speicher, im Hintergrund auffrischen
  event.respondWith(
    caches.open(VERSION).then(cache =>
      cache.match(req).then(treffer => {
        const netz = fetch(req)
          .then(antwort => {
            if (antwort && (antwort.ok || antwort.type === 'opaque')) cache.put(req, antwort.clone());
            return antwort;
          })
          .catch(() => treffer);
        return treffer || netz;
      })
    )
  );
});

/* Service worker: precarga los recursos de la aplicación para su uso sin conexión. */
const CACHE = 'astratime-v2';
const ASSETS = [
  './', 'index.html', 'manifest.json', 'css/styles.css',
  'fonts/space-grotesk-latin-wght-normal.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'js/boot.js', 'js/main.js', 'js/audio.js', 'js/backup.js', 'js/badges.js', 'js/bus.js', 'js/calendar.js',
  'js/closing.js', 'js/data.js', 'js/dialogs.js', 'js/drive.js', 'js/icons.js', 'js/music.js', 'js/panel.js',
  'js/plans.js', 'js/settings.js', 'js/stats.js', 'js/storage.js', 'js/tasks.js', 'js/theme.js',
  'js/fx.js', 'js/timer-ui.js', 'js/timer.js', 'js/util.js', 'js/wake.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* Estrategia cache-first para recursos propios. Las peticiones a otros orígenes (Google, YouTube) no se interceptan. */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
      return res;
    }).catch(() => (request.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});

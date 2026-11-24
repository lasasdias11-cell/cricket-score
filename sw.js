const CACHE_NAME = 'cricket-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './effects.css',
  './app.js',
  './assets/logo.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
});

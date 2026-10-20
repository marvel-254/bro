/* eslint-disable no-undef */
// Bump this whenever the shell or its caching behaviour changes. A new name
// makes `activate` drop the old cache, so returning visitors stop seeing a
// pinned copy of a page that has since been redeployed.
const CACHE_NAME = 'bro-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/download.html',
  '/vapor.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Let the browser handle cross-origin requests (fonts, the APK blob, the
  // release manifest) directly; only the same-origin shell is ours.
  if (url.origin !== self.location.origin) return;

  const acceptsHtml = (request.headers.get('accept') || '').includes('text/html');

  // Network-first for documents: a deploy is visible on the next visit, and
  // the precached copy is only a fallback when the network is unavailable.
  // Cache-first here (the previous behaviour) pinned every page until the
  // service worker itself changed.
  if (request.mode === 'navigate' || acceptsHtml) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/download.html'))
        )
    );
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

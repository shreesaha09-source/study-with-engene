const CACHE_NAME = 'engene-studyverse-shell-v46';
const APP_SHELL = [
  './',
  './index.html',
  './404.html',
  './manifest.json',
  './studyverse-icon.svg',
  './youtube-bridge.html',
  './enhypen_bg_1000x700.png',
  './member-sunoo.png',
  './member-sunghoon.png',
  './member-niki.png',
  './member-jungwon.png',
  './member-jay.png',
  './member-jake.png',
  './member-heeseung.png',
  './member-group.png',
  './study-ai-config.js',
  './supabase-config.js',
  './study-ai.css',
  './time-architect.css?v=20261126-ecosystem-links',
  './calendar-enhancements.css?v=20261126-ecosystem-links',
  './study-ai.js',
  './mini-desk.js?v=20261127-shared-timer',
  './time-architect.js?v=20261127-timer-desk-integration',
  './calendar-enhancements.js?v=20261126-ecosystem-links',
  './firebase-config.js',
  './firebase-cloud-sync.js',
  './studyverse-cloud.js',
  './community.css',
  './community.js'
];

function cacheResponse(request, response) {
  if (!response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('engene-studyverse-') && key !== CACHE_NAME)
      .map(key => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => cacheResponse(request, response)).catch(async () => (await caches.match(request)) || (await caches.match('./index.html'))));
    return;
  }

  event.respondWith(caches.match(request).then(cached => {
    const fresh = fetch(request).then(response => cacheResponse(request, response));
    return cached || fresh;
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const view = event.notification.data?.view;
  const targetUrl = new URL('./', self.location.href);
  if (view === 'timer' || view === 'water') targetUrl.searchParams.set('view', view);

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      if (view) client.postMessage({ type: 'studyverse-open-view', view });
      return;
    }
    await self.clients.openWindow(targetUrl.href);
  })());
});

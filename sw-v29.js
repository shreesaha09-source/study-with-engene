const CACHE_NAME = 'engene-studyverse-shell-v29';
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
  './member-group.png'
];

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
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match('./index.html'))));
    return;
  }

  event.respondWith(caches.match(request).then(cached => {
    const fresh = fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    });
    return cached || fresh;
  }));
});

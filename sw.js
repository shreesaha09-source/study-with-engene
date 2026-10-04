const CACHE='engene-studyverse-github-v4';
const ASSETS=[
 './','./index.html','./manifest.json','./youtube-bridge.html','./enhypen_bg_1000x700.png',
 './member-jungwon.png','./member-heeseung.png','./member-jay.png','./member-jake.png',
 './member-sunghoon.png','./member-sunoo.png','./member-niki.png','./member-group.png'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin){return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match('./'))));
});

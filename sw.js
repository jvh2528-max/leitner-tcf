
const CACHE='leitner-tcf-v1';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  event.respondWith(
    fetch(event.request).then(resp=>{
      const copy=resp.clone();
      caches.open(CACHE).then(c=>c.put(event.request,copy));
      return resp;
    }).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html')))
  );
});

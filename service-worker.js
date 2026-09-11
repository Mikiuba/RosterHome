const CACHE='rosterhome-v0.3.5';
const FALLBACKS=['./index.html','./styles.css','./roster-parser.js','./ftl-engine.js','./app.js','./enhancements.js','./storage.js','./manifest.webmanifest'];

self.addEventListener('install',event=>{
  // Do not use cache.addAll(): one transient 404 during GitHub Pages deployment
  // must never prevent a new service worker from installing.
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('rosterhome-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const fresh=await fetch(event.request,{cache:'no-store'});
      if(fresh && fresh.ok) cache.put(event.request,fresh.clone()).catch(()=>{});
      return fresh;
    }catch(err){
      const cached=await cache.match(event.request,{ignoreSearch:true});
      if(cached) return cached;
      if(event.request.mode==='navigate'){
        const index=await cache.match('./index.html',{ignoreSearch:true});
        if(index) return index;
      }
      throw err;
    }
  })());
});

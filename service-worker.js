const CACHE='rosterhome-v1.1.1';
const CORE=[
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './storage.js',
  './roster-parser.js',
  './roster-history.js',
  './ftl-engine.js',
  './app.js',
  './enhancements.js',
  './calendar-export.js',
  './calendar-subscriptions.js',
  './auto-sync.js',
  './crewlink-changes.js',
  './crewlink-sync.js'
];

async function cacheCore(){
  const cache=await caches.open(CACHE);
  for(const url of CORE){
    try{
      const response=await fetch(url,{cache:'reload'});
      if(response && response.ok) await cache.put(url,response.clone());
    }catch(err){
      // A missing optional asset must not block SW installation.
      console.warn('[RosterHome SW] No se pudo precachear',url,err);
    }
  }
  // index.html is the one critical offline asset.
  const index=await cache.match('./index.html',{ignoreSearch:true});
  if(!index) throw new Error('No se pudo preparar RosterHome para uso offline.');
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    await cacheCore();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('rosterhome-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

function isStaticAsset(request,url){
  return request.destination==='script' ||
    request.destination==='style' ||
    request.destination==='manifest' ||
    /\.(?:js|css|webmanifest|png|jpg|jpeg|svg|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;

  const url=new URL(request.url);

  // API/CrewLink always requires internet; never fake a cached API response.
  if(url.origin===self.location.origin && (url.pathname.startsWith('/api/')||url.pathname.startsWith('/calendar/'))) return;

  // Same-origin navigation: network first so updates arrive promptly, offline shell as fallback.
  if(url.origin===self.location.origin && request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const fresh=await fetch(request,{cache:'no-store'});
        if(fresh && fresh.ok) await cache.put('./index.html',fresh.clone());
        return fresh;
      }catch(_){
        return (await cache.match('./index.html',{ignoreSearch:true})) ||
               (await cache.match('./',{ignoreSearch:true})) ||
               new Response('RosterHome no está disponible offline todavía.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());
    return;
  }

  // Same-origin static assets: cache first -> instant offline startup, revalidate in background.
  if(url.origin===self.location.origin && isStaticAsset(request,url)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const cached=await cache.match(request,{ignoreSearch:false});
      const refresh=fetch(request,{cache:'no-store'}).then(async response=>{
        if(response && response.ok) await cache.put(request,response.clone());
        return response;
      }).catch(()=>null);

      if(cached){
        event.waitUntil(refresh);
        return cached;
      }
      const fresh=await refresh;
      if(fresh) return fresh;
      throw new Error('Recurso no disponible offline');
    })());
    return;
  }

  // Other same-origin GETs: network first, then cache.
  if(url.origin===self.location.origin){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const fresh=await fetch(request,{cache:'no-store'});
        if(fresh && fresh.ok) await cache.put(request,fresh.clone());
        return fresh;
      }catch(err){
        const cached=await cache.match(request,{ignoreSearch:false});
        if(cached)return cached;
        throw err;
      }
    })());
  }
});

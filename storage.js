/* RosterHome v0.3.2.1 · resilient durable local storage */
(function(){
  const DB_NAME='rosterhome-db';
  const DB_VERSION=1;
  const STORE='app';
  const STATE_KEY='state';
  let dbPromise=null;

  function supported(){ return 'indexedDB' in window; }

  function openDb(){
    if(!supported()) return Promise.reject(new Error('IndexedDB no disponible'));
    if(dbPromise) return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      let settled=false;
      const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error('IndexedDB tardó demasiado en responder'));}},2500);
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess=()=>{if(settled){try{req.result.close();}catch(_){ }return;}settled=true;clearTimeout(timer);resolve(req.result);};
      req.onerror=()=>{if(settled)return;settled=true;clearTimeout(timer);reject(req.error||new Error('No se pudo abrir IndexedDB'));};
      req.onblocked=()=>console.warn('[RosterHome] IndexedDB bloqueada; RosterHome seguirá usando la copia local.');
    });
    return dbPromise;
  }

  async function get(key){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).get(key);
      req.onsuccess=()=>resolve(req.result??null);
      req.onerror=()=>reject(req.error);
    });
  }

  async function put(key,value){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(value,key);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Error guardando en IndexedDB'));
      tx.onabort=()=>reject(tx.error||new Error('Guardado abortado'));
    });
  }

  async function loadState(){
    try{return await get(STATE_KEY);}catch(err){console.warn('[RosterHome] No se pudo leer IndexedDB',err);return null;}
  }

  let pendingTimer=null;
  let pendingState=null;
  function saveState(state,{immediate=false}={}){
    pendingState=JSON.parse(JSON.stringify(state));
    if(pendingTimer) clearTimeout(pendingTimer);
    const commit=async()=>{
      pendingTimer=null;
      const snapshot=pendingState; pendingState=null;
      if(!snapshot)return;
      try{await put(STATE_KEY,snapshot);window.dispatchEvent(new CustomEvent('rh-storage-saved'));}
      catch(err){console.error('[RosterHome] No se pudo guardar en IndexedDB',err);window.dispatchEvent(new CustomEvent('rh-storage-error',{detail:err}));}
    };
    if(immediate) return commit().catch(err=>{console.warn('[RosterHome] Guardado durable en fallback',err);});
    pendingTimer=setTimeout(commit,120);
  }

  async function flush(){
    if(pendingTimer){clearTimeout(pendingTimer);pendingTimer=null;}
    const snapshot=pendingState; pendingState=null;
    if(snapshot) await put(STATE_KEY,snapshot);
  }

  async function requestPersistence(){
    const out={supported:false,persisted:false,granted:false,usage:null,quota:null};
    try{
      if(navigator.storage?.persisted){out.supported=true;out.persisted=await navigator.storage.persisted();}
      if(!out.persisted && navigator.storage?.persist){out.granted=await navigator.storage.persist();out.persisted=out.granted || (navigator.storage.persisted?await navigator.storage.persisted():false);}
      if(navigator.storage?.estimate){const e=await navigator.storage.estimate();out.usage=e.usage??null;out.quota=e.quota??null;}
    }catch(err){console.warn('[RosterHome] Storage Persistence API no disponible/completa',err);}
    return out;
  }

  async function status(){
    const out={indexedDB:supported(),persisted:false,usage:null,quota:null};
    try{if(navigator.storage?.persisted)out.persisted=await navigator.storage.persisted();}catch(_){ }
    try{if(navigator.storage?.estimate){const e=await navigator.storage.estimate();out.usage=e.usage??null;out.quota=e.quota??null;}}catch(_){ }
    return out;
  }

  function backupEnvelope(state){
    return {
      app:'RosterHome',
      format:'rosterhome-backup',
      backupVersion:1,
      appVersion:'0.3.2.1',
      exportedAt:new Date().toISOString(),
      state:JSON.parse(JSON.stringify(state))
    };
  }

  function validateBackup(payload){
    if(!payload || typeof payload!=='object') throw new Error('El archivo no contiene JSON válido de RosterHome.');
    const candidate=payload.format==='rosterhome-backup'?payload.state:payload;
    if(!candidate || typeof candidate!=='object') throw new Error('La copia no contiene un estado válido.');
    if(!Array.isArray(candidate.people) || candidate.people.length<2) throw new Error('La copia no contiene los dos perfiles de RosterHome.');
    if(!candidate.rules || typeof candidate.rules!=='object') throw new Error('La copia no contiene las reglas de RosterHome.');
    return candidate;
  }

  function downloadBackup(state){
    const payload=backupEnvelope(state);
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const a=document.createElement('a');
    const day=new Date().toISOString().slice(0,10);
    a.href=URL.createObjectURL(blob);
    a.download=`RosterHome-backup-${day}.json`;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }

  async function readBackupFile(file){
    const text=await file.text();
    let payload;
    try{payload=JSON.parse(text);}catch(_){throw new Error('No se puede leer la copia: JSON inválido.');}
    return validateBackup(payload);
  }

  window.RosterStorage={supported,loadState,saveState,flush,requestPersistence,status,downloadBackup,readBackupFile,validateBackup};
})();

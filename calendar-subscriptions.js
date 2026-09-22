/* RosterHome v1.1.0 · subscribed Apple calendars */
(()=>{
  const $=id=>document.getElementById(id);
  const KEY_STORE='rosterhome_cloud_access_key';
  const TOKEN_STORE='rosterhome_calendar_feed_token';
  const ENABLED_STORE='rosterhome_calendar_sync_enabled';
  const PROFILE_STORE='rosterhome_calendar_profile';
  let publishing=false,timer=null;

  function status(text,kind=''){
    const el=$('calendarExportStatus');if(!el)return;
    el.textContent=text||'';el.dataset.kind=kind;
  }
  function randomToken(){
    const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
    let s='';for(const b of bytes)s+=String.fromCharCode(b);
    return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function token(){
    let t='';
    try{t=localStorage.getItem(TOKEN_STORE)||'';}catch{}
    if(!/^[A-Za-z0-9_-]{40,96}$/.test(t)){
      t=randomToken();
      try{localStorage.setItem(TOKEN_STORE,t);}catch{}
    }
    return t;
  }
  function key(){
    return $('calendarSyncKey')?.value?.trim()||'';
  }
  function enabled(){
    try{return localStorage.getItem(ENABLED_STORE)==='1';}catch{return false;}
  }
  function setEnabled(v){
    try{localStorage.setItem(ENABLED_STORE,v?'1':'0');}catch{}
  }
  function syncProfile(){
    const select=$('calendarExportPerson');
    if(!select)return;
    try{
      const saved=localStorage.getItem(PROFILE_STORE);
      if(saved==='0'||saved==='1')select.value=saved;
    }catch{}
  }
  function saveProfile(){
    try{localStorage.setItem(PROFILE_STORE,$('calendarExportPerson')?.value||'0');}catch{}
  }
  function feedUrl(kind){
    return `${location.origin}/calendar/${token()}/${kind}.ics`;
  }
  function webcalUrl(kind){
    return feedUrl(kind).replace(/^https:/i,'webcal:').replace(/^http:/i,'webcal:');
  }
  function updateInstallButtons(){
    const on=enabled();
    if($('installBriefingsCalendar'))$('installBriefingsCalendar').disabled=!on;
    if($('installFlightsCalendar'))$('installFlightsCalendar').disabled=!on;
  }
  function buildFeeds(){
    const api=window.RosterHomeCalendarExport;
    if(!api?.build||!api?.makeIcs)throw Error('El generador de calendarios todavía no está cargado.');
    const briefings=api.build('briefing'),flights=api.build('flight');
    if(!briefings.events.length&&!flights.events.length)throw Error('No hay vuelos ni briefings para el perfil seleccionado.');
    return {briefings:api.makeIcs(briefings),flights:api.makeIcs(flights),counts:{briefings:briefings.events.length,flights:flights.events.length}};
  }
  async function publish({silent=false}={}){
    if(publishing||!navigator.onLine)return false;
    const accessKey=key();
    if(accessKey.length<32){
      if(!silent)status('Introduce la clave privada de RosterHome para activar la sincronización.','error');
      return false;
    }
    publishing=true;
    if(!silent)status('Publicando calendarios privados…');
    try{
      saveProfile();
      const feeds=buildFeeds();
      const r=await fetch('/api/calendar/publish',{
        method:'POST',
        headers:{'Content-Type':'application/json','X-RosterHome-Key':accessKey},
        body:JSON.stringify({token:token(),profile:Number($('calendarExportPerson')?.value||0),briefings:feeds.briefings,flights:feeds.flights})
      });
      const body=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(body.error||`HTTP ${r.status}`);
      setEnabled(true);
      try{localStorage.setItem(KEY_STORE,accessKey);}catch{}
      updateInstallButtons();
      if(!silent)status(`✓ Calendarios actualizados · ${feeds.counts.briefings} briefings · ${feeds.counts.flights} vuelos`,'ok');
      return true;
    }catch(err){
      if(!silent)status(`No se pudo sincronizar: ${err?.message||err}`,'error');
      return false;
    }finally{publishing=false;}
  }
  function install(kind){
    if(!enabled()){status('Activa primero la sincronización.','error');return;}
    // iOS recognizes webcal:// as a calendar subscription URL.
    location.href=webcalUrl(kind);
  }
  function scheduleAutoPublish(){
    if(!enabled()||!navigator.onLine)return;
    clearTimeout(timer);
    timer=setTimeout(()=>publish({silent:true}),4500);
  }

  // Restore the same private key already used by CrewLink, if available.
  try{if($('calendarSyncKey'))$('calendarSyncKey').value=localStorage.getItem(KEY_STORE)||'';}catch{}
  syncProfile();
  updateInstallButtons();

  $('calendarEnableSync')?.addEventListener('click',()=>publish());
  $('installBriefingsCalendar')?.addEventListener('click',()=>install('briefings'));
  $('installFlightsCalendar')?.addEventListener('click',()=>install('flights'));
  $('calendarExportPerson')?.addEventListener('change',async()=>{saveProfile();if(enabled())await publish();});
  window.addEventListener('online',()=>{if(enabled())publish({silent:true});});
  window.addEventListener('rh-storage-saved',scheduleAutoPublish);
})();

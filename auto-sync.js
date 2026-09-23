/* RosterHome v1.1.4 · daily CrewLink Auto Sync */
(()=>{
  const $=id=>document.getElementById(id);if(!$('autoSyncCard'))return;
  const KEY_STORE='rosterhome_cloud_access_key',TOKEN_STORE='rosterhome_calendar_feed_token',APPLIED='rosterhome_autosync_applied_';
  let jobs={},busy=false,metadataTimer=null;

  function status(text,kind=''){const el=$('autoSyncStatus');if(el){el.textContent=text||'';el.dataset.kind=kind;}}
  function randomToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function token(){let t='';try{t=localStorage.getItem(TOKEN_STORE)||'';}catch{}if(!/^[A-Za-z0-9_-]{40,96}$/.test(t)){t=randomToken();try{localStorage.setItem(TOKEN_STORE,t);}catch{}}return t;}
  function accessKey(){return $('autoSyncKey')?.value?.trim()||'';}
  function headers(json=false){const h={'X-RosterHome-Key':accessKey()};if(json)h['Content-Type']='application/json';return h;}
  function selected(){return Number($('autoSyncPerson')?.value||0);}
  function personName(i){return state?.people?.[i]?.name||`Perfil ${i+1}`;}
  function lead(i){return Number(state?.rules?.[`briefingLead${i}`]??105);}
  function fmtWhen(v){if(!v)return 'nunca';try{return new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v));}catch{return String(v);}}
  function configured(i){return !!jobs?.[String(i)]?.enabled;}
  function lock(v){busy=v;for(const id of ['autoSyncEnable','autoSyncRun','autoSyncDisable'])if($(id))$(id).disabled=v||(id!=='autoSyncEnable'&&!configured(selected()));}
  function syncNames(){const s=$('autoSyncPerson');if(!s)return;if(s.options[0])s.options[0].textContent=personName(0);if(s.options[1])s.options[1].textContent=personName(1);}
  function syncUser(){const i=selected(),code=state?.people?.[i]?.crewCode||jobs?.[String(i)]?.crewCode||'';$('autoSyncUser').value=code;$('autoSyncRun').disabled=busy||!configured(i);$('autoSyncDisable').disabled=busy||!configured(i);}
  function renderJobs(){
    const box=$('autoSyncProfiles'),active=Object.values(jobs||{}).filter(j=>j?.enabled);
    if($('autoSyncBadge')){$('autoSyncBadge').className='storage-badge '+(active.length?'ok':'checking');$('autoSyncBadge').textContent=active.length?`${active.length} activo${active.length>1?'s':''}`:'Desactivado';}
    if(!box)return;
    box.innerHTML=active.length?active.sort((a,b)=>a.profile-b.profile).map(j=>`<div class="auto-sync-row"><div><b>${escapeHtml(j.name||j.crewCode||`Perfil ${j.profile+1}`)}</b><span>${escapeHtml(j.crewCode||'')} · diario</span></div><div><b>${j.lastError?'⚠️ Último intento falló':'✓ Activo'}</b><span>${j.lastSuccessAt?`último OK ${fmtWhen(j.lastSuccessAt)}`:'pendiente de primera sincronización'}</span>${j.lastError?`<small>${escapeHtml(j.lastError)}</small>`:''}</div></div>`).join(''):'<p class="muted">No hay perfiles configurados para actualización automática.</p>';
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function reviveParsed(parsed){if(parsed?.period){if(typeof parsed.period.start==='string')parsed.period.start=new Date(parsed.period.start);if(typeof parsed.period.end==='string')parsed.period.end=new Date(parsed.period.end);}return parsed;}

  async function api(path,{method='GET',body=null}={}){
    const opts={method,headers:headers(!!body)};if(body)opts.body=JSON.stringify(body);const r=await fetch(path,opts),data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||`HTTP ${r.status}`);return data;
  }
  async function refreshStatus({silent=false}={}){
    if(accessKey().length<32){if(!silent)status('Introduce la clave privada de RosterHome para consultar Auto Sync.');return;}
    try{const data=await api(`/api/autosync/status?token=${encodeURIComponent(token())}`);jobs=data.jobs||{};renderJobs();syncNames();syncUser();return data;}catch(err){if(!silent)status(`No se pudo consultar Auto Sync: ${err.message}`,'error');}
  }
  async function pullRoster(i,{silent=false}={}){
    if(!configured(i)||accessKey().length<32||!navigator.onLine)return false;
    try{
      const data=await api(`/api/autosync/roster?token=${encodeURIComponent(token())}&profile=${i}`);if(!data?.parsed||!data.syncedAt)return false;
      let applied='';try{applied=localStorage.getItem(APPLIED+i)||'';}catch{}if(applied&&applied>=data.syncedAt)return false;
      const parsed=reviveParsed(data.parsed);if(typeof validateBeforeMerge==='function')validateBeforeMerge(parsed);if(typeof mergeParsed!=='function')throw Error('El importador local aún no está listo.');
      mergeParsed(i,parsed,`CrewLink Auto Sync · ${data.range?.start||''}–${data.range?.end||''}`);try{localStorage.setItem(APPLIED+i,data.syncedAt);}catch{}
      if(!silent)status(`✓ ${personName(i)} actualizado desde Auto Sync · ${fmtWhen(data.syncedAt)}`,'ok');return true;
    }catch(err){if(!silent)status(`Roster recibido pero no se pudo aplicar: ${err.message}`,'error');return false;}
  }
  async function configure(){
    if(busy)return;const i=selected(),user=$('autoSyncUser').value.trim(),password=$('autoSyncPassword').value,key=accessKey();
    if(key.length<32){status('Introduce la clave privada de RosterHome.','error');return;}if(!user||!password){status('Introduce usuario y contraseña de CrewLink.','error');return;}if(!$('autoSyncHttp').checked){status('Marca la autorización de acceso automático a CrewLink.','error');return;}
    lock(true);status('Guardando credenciales cifradas…');
    try{
      try{localStorage.setItem(KEY_STORE,key);}catch{}
      await api('/api/autosync/config',{method:'POST',body:{token:token(),profile:i,username:user,password,name:personName(i),briefingLead:lead(i)}});
      $('autoSyncPassword').value='';jobs[String(i)]={...(jobs[String(i)]||{}),profile:i,enabled:true,crewCode:user.toUpperCase(),name:personName(i)};renderJobs();syncUser();
      status('✓ Auto Sync activado. Haciendo la primera actualización…','ok');
      try{
        await api('/api/autosync/run',{method:'POST',body:{token:token(),profile:i}});await refreshStatus({silent:true});await pullRoster(i);
        status(`✓ Auto Sync activado para ${personName(i)} y primera actualización completada.`,'ok');
      }catch(syncErr){
        await refreshStatus({silent:true});
        status(`✓ Auto Sync está activado para ${personName(i)}. La primera actualización falló: ${syncErr.message} Se reintentará automáticamente mañana y puedes pulsar “Actualizar ahora”.`,'warn');
      }
    }catch(err){status(`No se pudo guardar la configuración de Auto Sync: ${err.message}`,'error');await refreshStatus({silent:true});}
    finally{$('autoSyncPassword').value='';lock(false);syncUser();}
  }
  async function runNow(){
    if(busy||!configured(selected()))return;const i=selected();lock(true);status(`Actualizando ${personName(i)} desde CrewLink…`);
    try{await api('/api/autosync/run',{method:'POST',body:{token:token(),profile:i}});await refreshStatus({silent:true});await pullRoster(i);status(`✓ ${personName(i)} actualizado ahora mismo.`,'ok');}
    catch(err){status(`Actualización fallida: ${err.message}`,'error');await refreshStatus({silent:true});}finally{lock(false);syncUser();}
  }
  async function disable(){
    if(busy||!configured(selected()))return;const i=selected();lock(true);
    try{await api('/api/autosync/disable',{method:'POST',body:{token:token(),profile:i}});delete jobs[String(i)];renderJobs();syncUser();status(`Auto Sync desactivado para ${personName(i)}.`,'ok');}
    catch(err){status(`No se pudo desactivar: ${err.message}`,'error');}finally{lock(false);syncUser();}
  }
  async function syncMetadata(){
    if(!navigator.onLine||accessKey().length<32)return;for(const i of [0,1])if(configured(i)){try{await api('/api/autosync/metadata',{method:'POST',body:{token:token(),profile:i,name:personName(i),briefingLead:lead(i)}});}catch{}}
  }
  function queueMetadata(){clearTimeout(metadataTimer);metadataTimer=setTimeout(syncMetadata,4000);}
  async function startup(){
    try{$('autoSyncKey').value=localStorage.getItem(KEY_STORE)||'';}catch{}syncNames();syncUser();if(accessKey().length<32){renderJobs();status('Auto Sync listo para configurar.');return;}
    await refreshStatus({silent:true});for(const i of [0,1])if(configured(i))await pullRoster(i,{silent:true});renderJobs();syncUser();
  }

  $('autoSyncPerson')?.addEventListener('change',syncUser);
  $('autoSyncEnable')?.addEventListener('click',configure);
  $('autoSyncRun')?.addEventListener('click',runNow);
  $('autoSyncDisable')?.addEventListener('click',disable);
  $('autoSyncKey')?.addEventListener('change',()=>refreshStatus());
  window.addEventListener('online',async()=>{await refreshStatus({silent:true});for(const i of [0,1])if(configured(i))await pullRoster(i,{silent:true});});
  window.addEventListener('rh-storage-saved',queueMetadata);
  window.addEventListener('pagehide',()=>{if($('autoSyncPassword'))$('autoSyncPassword').value='';});
  setTimeout(startup,1200);
})();

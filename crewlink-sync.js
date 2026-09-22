/* RosterHome v1.1.1 — Hybrid CrewLink import.
 * Desktop Chrome: uses the local RosterHome Bridge when present.
 * iPhone/Safari or any browser without the extension: uses a temporary Cloudflare Browser Run session.
 */
(()=>{
  const $=id=>document.getElementById(id),host=$('crewlinkConnection');if(!host)return;
  const BRIDGE_REQ='ROSTERHOME_CREWLINK_REQUEST',BRIDGE_RES='ROSTERHOME_CREWLINK_RESPONSE',BRIDGE_PING='ROSTERHOME_CREWLINK_PING',BRIDGE_READY='ROSTERHOME_CREWLINK_READY';
  const KEY_STORE='rosterhome_cloud_access_key';
  let bridgeVersion=null,cloudInfo=null,busy=false,pending=new Map();

  host.innerHTML=`<h3>Conectar CrewLink · Corendon</h3>
    <p id="clAvailable" class="muted">Comprobando métodos de importación…</p>
    <div id="clInstall" class="notice" hidden>La importación directa no está disponible ahora mismo. Puedes seguir importando PDF/TXT manualmente debajo.</div>
    <form id="clForm" hidden autocomplete="off">
      <div class="fieldrow">
        <div><label for="clPerson">Importar en</label><select id="clPerson"><option value="0">Perfil 1</option><option value="1">Perfil 2</option></select></div>
        <div><label for="clUser">Usuario CrewLink</label><input id="clUser" required maxlength="16" autocomplete="username" autocapitalize="none"></div>
      </div>
      <label for="clPassword">Contraseña CrewLink</label><input id="clPassword" type="password" required maxlength="256" autocomplete="current-password">
      <div class="fieldrow"><div><label for="clStart">Desde</label><input id="clStart" type="date" required></div><div><label for="clEnd">Hasta</label><input id="clEnd" type="date" required></div></div>
      <div id="clCloudAuth" hidden>
        <label for="clAccessKey">Clave privada de RosterHome</label><input id="clAccessKey" type="password" maxlength="256" autocomplete="off" placeholder="ROSTERHOME_ACCESS_KEY">
        <label class="crewlink-check"><input id="clRememberKey" type="checkbox" checked> Recordar esta clave en este dispositivo.</label>
        <p class="muted">Protege el navegador remoto de Cloudflare frente a usos ajenos. No es tu contraseña de CrewLink.</p>
      </div>
      <p id="clPrivacy" class="notice">Preparando importación directa…</p>
      <label class="crewlink-check"><input id="clHttp" type="checkbox" required> Entiendo y acepto acceder al portal HTTP de CrewLink para realizar esta importación.</label>
      <div class="actions">
        <button id="clProbe" class="btn" type="button">Comprobar conexión</button>
        <button id="clSubmit" class="btn primary" type="submit">Actualizar desde CrewLink</button>
      </div>
      <div id="clProgress" class="cl-progress" hidden>
        <div class="cl-progress-head"><b id="clProgressLabel">Preparando…</b><span id="clProgressPct">0%</span></div>
        <div class="cl-progress-track" role="progressbar" aria-label="Progreso de importación" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="clProgressBar"></span></div>
      </div>
      <p class="muted">La contraseña se usa solo durante esta importación y se vacía al terminar.</p>
    </form>
    <p id="clResult" role="status" aria-live="polite"></p><p id="clDiff"></p>`;

  const now=new Date(),month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  $('clStart').value=month+'-01';$('clEnd').value=month+'-'+new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  try{$('clAccessKey').value=localStorage.getItem(KEY_STORE)||'';}catch{}

  function mode(){return bridgeVersion?'bridge':(cloudInfo?.cloudBrowser?'cloud':null);}
  function updateAvailability(){
    if(!navigator.onLine){
      $('clAvailable').textContent='Sin conexión · los rosters guardados siguen disponibles.';
      $('clInstall').hidden=false;
      $('clInstall').textContent='Para actualizar desde CrewLink necesitas conexión a internet. Puedes seguir consultando todo lo ya importado.';
      $('clForm').hidden=true;
      return;
    }
    const m=mode();
    if(m==='bridge'){
      $('clAvailable').textContent=`Bridge local detectado · v${bridgeVersion}. CrewLink se ejecutará en este ordenador.`;
      $('clCloudAuth').hidden=true;$('clPrivacy').innerHTML='CrewLink se abre y procesa <b>en tu propio Chrome</b>. Usuario y contraseña no pasan por Cloudflare.';
      $('clInstall').hidden=true;$('clForm').hidden=false;return;
    }
    if(m==='cloud'){
      $('clAvailable').textContent=`Importación directa disponible · RosterHome v${cloudInfo.version}. Compatible con iPhone/Safari sin PC.`;
      $('clCloudAuth').hidden=false;$('clPrivacy').innerHTML='RosterHome abrirá un <b>navegador temporal en Cloudflare</b>. No se abrirá ninguna pestaña en tu iPhone. Las credenciales se usan solo durante la sesión y no se guardan.';
      $('clInstall').hidden=true;$('clForm').hidden=false;return;
    }
    $('clAvailable').textContent='No hay un método de importación directa disponible.';$('clInstall').hidden=false;$('clForm').hidden=true;
  }
  function lock(v){busy=v;$('clProbe').disabled=v;$('clSubmit').disabled=v;}
  window.addEventListener('online',updateAvailability);window.addEventListener('offline',updateAvailability);
  function setProgress(value,message,state='running'){
    const box=$('clProgress'),pct=Math.max(0,Math.min(100,Math.round(value||0)));
    box.hidden=false;box.dataset.state=state;$('clProgressLabel').textContent=message;$('clProgressPct').textContent=`${pct}%`;$('clProgressBar').style.width=`${pct}%`;
    box.querySelector('[role="progressbar"]').setAttribute('aria-valuenow',String(pct));
  }
  function resetProgress(){const box=$('clProgress');box.hidden=true;box.dataset.state='';$('clProgressBar').style.width='0%';}
  function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
  function callBridge(type,payload={},timeoutMs=90000){
    return new Promise((resolve,reject)=>{
      if(!bridgeVersion){reject(Error('No detecto RosterHome CrewLink Bridge en este Chrome.'));return;}
      const requestId=uid(),timer=setTimeout(()=>{pending.delete(requestId);reject(Error('El Bridge no respondió a tiempo.'));},timeoutMs);
      pending.set(requestId,{resolve,reject,timer});
      window.postMessage({source:'rosterhome-page',kind:BRIDGE_REQ,requestId,type,payload},location.origin);
    });
  }
  function b64ToBlob(base64,type='application/pdf'){
    const bin=atob(base64),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return new Blob([out],{type});
  }
  function cloudKey(){return $('clAccessKey').value.trim();}
  function requireCloudKey(){const key=cloudKey();if(key.length<32)throw Error('Introduce la clave privada de RosterHome (mínimo 32 caracteres).');return key;}
  function rememberCloudKey(){
    try{if($('clRememberKey').checked)localStorage.setItem(KEY_STORE,cloudKey());else localStorage.removeItem(KEY_STORE);}catch{}
  }
  async function cloudProbe(){
    const key=requireCloudKey();rememberCloudKey();setProgress(15,'Iniciando navegador remoto…');
    const r=await fetch('/api/crewlink/cloud/probe',{method:'POST',headers:{'X-RosterHome-Key':key}});
    const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||`Cloudflare respondió HTTP ${r.status}.`);setProgress(100,'Conexión comprobada','done');return data;
  }
  async function cloudSync(payload){
    const key=requireCloudKey();rememberCloudKey();setProgress(3,'Enviando solicitud segura…');
    const r=await fetch('/api/crewlink/cloud/sync',{method:'POST',headers:{'Content-Type':'application/json','X-RosterHome-Key':key},body:JSON.stringify(payload)});
    if(!r.ok){const data=await r.json().catch(()=>({}));throw Error(data.error||`Cloudflare respondió HTTP ${r.status}.`);}
    if(!r.body)throw Error('Cloudflare no devolvió un flujo de importación.');
    const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='',result=null;
    while(true){
      const {done,value}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
      const lines=buffer.split('\n');buffer=lines.pop()||'';
      for(const line of lines){
        if(!line.trim())continue;const msg=JSON.parse(line);
        if(msg.type==='progress')setProgress(msg.progress,msg.message);
        else if(msg.type==='error')throw Error(msg.error||'No se pudo importar desde CrewLink.');
        else if(msg.type==='result')result=msg;
      }
      if(done)break;
    }
    if(buffer.trim()){const msg=JSON.parse(buffer);if(msg.type==='error')throw Error(msg.error);if(msg.type==='result')result=msg;}
    if(!result?.pdfBase64)throw Error('La importación terminó sin devolver el PDF.');
    return result;
  }
  async function mergePdfResult(r,{person,start,end,username,before,input}){
    setProgress(93,'Procesando el PDF en RosterHome…');
    const blob=b64ToBlob(r.pdfBase64,'application/pdf');
    const parsed=RosterParser.parseCrewLinkText(await extractPdfText(new File([blob],'CrewLink.pdf',{type:'application/pdf'})));
    validateBeforeMerge(parsed);
    if(parsed.crew?.crewCode?.toUpperCase()!==username.toUpperCase())throw Error('El PDF no corresponde al usuario solicitado.');
    if(parsed.period?.start?.toISOString().slice(0,10)!==start||parsed.period?.end?.toISOString().slice(0,10)!==end)throw Error('El PDF no corresponde al periodo solicitado.');
    if(!parsed.coverage?.complete)throw Error('Totales no reconciliados. Revisa el archivo mediante la importación manual.');
    if(before!==JSON.stringify(state.people[person]))throw Error('El perfil cambió durante la descarga. Repite la importación.');
    setProgress(97,'Actualizando calendario y FTL…');
    const diff=CrewLinkChanges.compare(state.people[person].duties,parsed.duties,start,end);
    const n=mergeParsed(person,parsed,`CrewLink-${start}-${end}.pdf`);renderImportAudit(person,parsed);
    setProgress(100,'Importación completada','done');
    $('clResult').textContent=`✓ ${n} servicios importados · totales reconciliados · otros meses conservados.`;
    $('clDiff').textContent=diff.initial?'Primera importación del periodo.':`${diff.added.length} añadidos · ${diff.removed.length} eliminados · ${diff.modified.length} modificados`;
  }

  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||!event.data)return;const m=event.data;if(m.source!=='rosterhome-bridge')return;
    if(m.kind===BRIDGE_READY){bridgeVersion=m.version||'desconocida';updateAvailability();return;}
    if(m.kind===BRIDGE_RES&&m.requestId){const p=pending.get(m.requestId);if(!p)return;clearTimeout(p.timer);pending.delete(m.requestId);if(m.ok)p.resolve(m.result);else p.reject(Error(m.error||'El Bridge no pudo completar la operación.'));}
  });

  $('clProbe').addEventListener('click',async()=>{
    if(busy)return;lock(true);$('clResult').textContent='';$('clDiff').textContent='';resetProgress();
    try{
      let r;if(mode()==='bridge'){setProgress(20,'Comprobando Bridge local…');r=await callBridge('probe',{},30000);setProgress(100,'Conexión comprobada','done');}
      else if(mode()==='cloud')r=await cloudProbe();else throw Error('No hay método de importación disponible.');
      $('clResult').textContent=r?.message||'✓ Conexión correcta.';
    }catch(e){setProgress(100,'La comprobación ha fallado','error');$('clResult').textContent=e.message;}finally{lock(false);}
  });

  $('clForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!$('clHttp').checked)return;
    const person=Number($('clPerson').value),input=$('file'+person),start=$('clStart').value,end=$('clEnd').value,username=$('clUser').value.trim(),password=$('clPassword').value;
    if(end<start){$('clResult').textContent='Revisa el periodo seleccionado.';return;}if(input.disabled){$('clResult').textContent='Espera a que termine la otra importación.';return;}
    const before=JSON.stringify(state.people[person]);input.disabled=true;lock(true);$('clResult').textContent='';$('clDiff').textContent='';resetProgress();
    try{
      let r;
      if(mode()==='bridge'){
        setProgress(10,'Conectando con el Bridge local…');setProgress(25,'Chrome está gestionando CrewLink…');r=await callBridge('sync',{username,password,start,end},120000);setProgress(88,'PDF recibido del Bridge…');
      }else if(mode()==='cloud')r=await cloudSync({username,password,start,end});
      else throw Error('No hay método de importación disponible.');
      await mergePdfResult(r,{person,start,end,username,before,input});
    }catch(e){setProgress(100,'Importación detenida','error');$('clResult').textContent=e.message;}
    finally{input.disabled=false;lock(false);$('clPassword').value='';}
  });

  window.addEventListener('pagehide',()=>{$('clPassword').value='';});
  window.postMessage({source:'rosterhome-page',kind:BRIDGE_PING},location.origin);
  fetch('/api/crewlink/status',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(info=>{cloudInfo=info;updateAvailability();}).catch(()=>{cloudInfo={cloudBrowser:false};updateAvailability();});
  setTimeout(updateAvailability,1300);
})();

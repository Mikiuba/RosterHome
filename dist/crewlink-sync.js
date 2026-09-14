/* RosterHome v0.6.0 — CrewLink runs locally in Chrome via the RosterHome Bridge extension.
 * Credentials never transit Cloudflare. The extension opens CrewLink in the user's browser,
 * performs the same browser navigation as a manual download, and returns the PDF to this page.
 */
(()=>{
  const $=id=>document.getElementById(id),host=$('crewlinkConnection');if(!host)return;
  const BRIDGE_REQ='ROSTERHOME_CREWLINK_REQUEST';
  const BRIDGE_RES='ROSTERHOME_CREWLINK_RESPONSE';
  const BRIDGE_PING='ROSTERHOME_CREWLINK_PING';
  const BRIDGE_READY='ROSTERHOME_CREWLINK_READY';
  let bridgeVersion=null,busy=false,pending=new Map();

  host.innerHTML=`<h3>Conectar CrewLink · Corendon</h3>
    <p id="clAvailable" class="muted">Buscando RosterHome CrewLink Bridge en este Chrome…</p>
    <div id="clInstall" class="notice" hidden>
      Para la importación directa, instala una vez la extensión local <b>RosterHome CrewLink Bridge</b>.
      Mientras tanto puedes seguir importando PDF/TXT manualmente debajo.
    </div>
    <form id="clForm" hidden autocomplete="off">
      <div class="fieldrow">
        <div><label for="clPerson">Importar en</label><select id="clPerson"><option value="0">Perfil 1</option><option value="1">Perfil 2</option></select></div>
        <div><label for="clUser">Usuario CrewLink</label><input id="clUser" required maxlength="16" autocomplete="off"></div>
      </div>
      <label for="clPassword">Contraseña CrewLink</label><input id="clPassword" type="password" required maxlength="256" autocomplete="off">
      <div class="fieldrow"><div><label for="clStart">Desde</label><input id="clStart" type="date" required></div><div><label for="clEnd">Hasta</label><input id="clEnd" type="date" required></div></div>
      <p class="notice">CrewLink se abre y procesa <b>en tu propio Chrome</b>. Usuario y contraseña no pasan por Cloudflare y no se guardan en RosterHome.</p>
      <label class="crewlink-check"><input id="clHttp" type="checkbox" required> Entiendo y acepto abrir CrewLink mediante HTTP desde este dispositivo.</label>
      <div class="actions">
        <button id="clProbe" class="btn" type="button">Comprobar Bridge</button>
        <button id="clSubmit" class="btn primary" type="submit">Actualizar desde CrewLink</button>
      </div>
      <p class="muted">Actualización manual: solo actúa cuando pulsas el botón. La contraseña se vacía al terminar.</p>
    </form>
    <p id="clResult" role="status" aria-live="polite"></p><p id="clDiff"></p>`;

  const now=new Date(),month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  $('clStart').value=month+'-01';$('clEnd').value=month+'-'+new Date(now.getFullYear(),now.getMonth()+1,0).getDate();

  function lock(v){busy=v;$('clProbe').disabled=v;$('clSubmit').disabled=v;}
  function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
  function callBridge(type,payload={},timeoutMs=90000){
    return new Promise((resolve,reject)=>{
      if(!bridgeVersion){reject(Error('No detecto RosterHome CrewLink Bridge en este Chrome.'));return;}
      const requestId=uid(),timer=setTimeout(()=>{
        pending.delete(requestId);reject(Error('El Bridge no respondió a tiempo.'));
      },timeoutMs);
      pending.set(requestId,{resolve,reject,timer});
      window.postMessage({source:'rosterhome-page',kind:BRIDGE_REQ,requestId,type,payload},location.origin);
    });
  }
  function b64ToBlob(base64,type='application/pdf'){
    const bin=atob(base64),out=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
    return new Blob([out],{type});
  }

  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||!event.data)return;
    const m=event.data;
    if(m.source!=='rosterhome-bridge')return;
    if(m.kind===BRIDGE_READY){
      bridgeVersion=m.version||'desconocida';
      $('clAvailable').textContent=`Bridge local detectado · v${bridgeVersion}. CrewLink se ejecutará en este PC.`;
      $('clInstall').hidden=true;$('clForm').hidden=false;
      return;
    }
    if(m.kind===BRIDGE_RES&&m.requestId){
      const p=pending.get(m.requestId);if(!p)return;
      clearTimeout(p.timer);pending.delete(m.requestId);
      if(m.ok)p.resolve(m.result);else p.reject(Error(m.error||'El Bridge no pudo completar la operación.'));
    }
  });

  $('clProbe').addEventListener('click',async()=>{
    if(busy)return;lock(true);$('clResult').textContent='Comprobando que Chrome puede abrir CrewLink…';
    try{
      const r=await callBridge('probe',{},30000);
      $('clResult').textContent=r?.message||'✓ Bridge y CrewLink accesibles.';
    }catch(e){$('clResult').textContent=e.message;}finally{lock(false);}
  });

  $('clForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!$('clHttp').checked)return;
    const person=Number($('clPerson').value),input=$('file'+person),start=$('clStart').value,end=$('clEnd').value,username=$('clUser').value.trim(),password=$('clPassword').value;
    if(end<start){$('clResult').textContent='Revisa el periodo seleccionado.';return;}
    if(input.disabled){$('clResult').textContent='Espera a que termine la otra importación.';return;}
    const before=JSON.stringify(state.people[person]);input.disabled=true;lock(true);$('clResult').textContent='Abriendo CrewLink en Chrome y generando el PDF…';$('clDiff').textContent='';
    try{
      const r=await callBridge('sync',{username,password,start,end},120000);
      if(!r?.pdfBase64)throw Error('El Bridge no devolvió el PDF.');
      const blob=b64ToBlob(r.pdfBase64,'application/pdf');
      const parsed=RosterParser.parseCrewLinkText(await extractPdfText(new File([blob],'CrewLink.pdf',{type:'application/pdf'})));
      validateBeforeMerge(parsed);
      if(parsed.crew?.crewCode?.toUpperCase()!==username.toUpperCase())throw Error('El PDF no corresponde al usuario solicitado.');
      if(parsed.period?.start?.toISOString().slice(0,10)!==start||parsed.period?.end?.toISOString().slice(0,10)!==end)throw Error('El PDF no corresponde al periodo solicitado.');
      if(!parsed.coverage?.complete)throw Error('Totales no reconciliados. Revisa el archivo mediante la importación manual.');
      if(before!==JSON.stringify(state.people[person]))throw Error('El perfil cambió durante la descarga. Repite la importación.');
      const diff=CrewLinkChanges.compare(state.people[person].duties,parsed.duties,start,end);
      const n=mergeParsed(person,parsed,`CrewLink-${start}-${end}.pdf`);renderImportAudit(person,parsed);
      $('clResult').textContent=`✓ ${n} servicios importados · totales reconciliados · otros meses conservados.`;
      $('clDiff').textContent=diff.initial?'Primera importación del periodo.':`${diff.added.length} añadidos · ${diff.removed.length} eliminados · ${diff.modified.length} modificados`;
    }catch(e){$('clResult').textContent=e.message;}
    finally{input.disabled=false;lock(false);$('clPassword').value='';}
  });

  window.addEventListener('pagehide',()=>{$('clPassword').value='';});
  window.postMessage({source:'rosterhome-page',kind:BRIDGE_PING},location.origin);
  setTimeout(()=>{
    if(!bridgeVersion){$('clAvailable').textContent='Bridge local no detectado.';$('clInstall').hidden=false;}
  },1200);
})();

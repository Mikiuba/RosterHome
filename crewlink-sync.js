/* Manual Cloudflare connector. No timers or credential persistence. */
(()=>{
  const $=id=>document.getElementById(id),host=$('crewlinkConnection');if(!host)return;
  host.innerHTML=`<h3>Conectar CrewLink · Corendon</h3><p id="clAvailable" class="muted">Comprobando conector…</p>
    <form id="clForm" hidden autocomplete="off">
    <label for="clKey">Clave de acceso a RosterHome</label><input id="clKey" type="password" required minlength="32" maxlength="256" autocomplete="off">
    <p class="muted">Es la clave privada configurada en Cloudflare, distinta de tu contraseña CrewLink.</p>
    <button id="clProbe" class="btn" type="button">Comprobar conexión sin iniciar sesión</button>
    <div class="fieldrow"><div><label for="clPerson">Importar en</label><select id="clPerson"><option value="0">Perfil 1</option><option value="1">Perfil 2</option></select></div><div><label for="clUser">Usuario CrewLink</label><input id="clUser" required maxlength="16" autocomplete="off"></div></div>
    <label for="clPassword">Contraseña CrewLink</label><input id="clPassword" type="password" required maxlength="256" autocomplete="off">
    <div class="fieldrow"><div><label for="clStart">Desde</label><input id="clStart" type="date" required></div><div><label for="clEnd">Hasta</label><input id="clEnd" type="date" required></div></div>
    <p class="notice">Tu dispositivo conecta con Cloudflare por HTTPS. El tramo de Cloudflare a CrewLink usa HTTP sin cifrar. La contraseña solo se usa durante la descarga y no se guarda en el servidor.</p>
    <label class="crewlink-check"><input id="clHttp" type="checkbox" required> Entiendo y acepto usar el acceso HTTP de CrewLink.</label>
    <div class="actions"><button id="clSubmit" class="btn primary" type="submit">Actualizar desde CrewLink</button></div>
    <p class="muted">Actualización manual: solo consulta al pulsar el botón. Las claves se vacían al enviar.</p></form>
    <p id="clResult" role="status" aria-live="polite"></p><p id="clDiff"></p>`;
  const now=new Date(),month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  $('clStart').value=month+'-01';$('clEnd').value=month+'-'+new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  let busy=false;
  function lock(value){busy=value;$('clProbe').disabled=value;$('clSubmit').disabled=value;}
  async function request(path,data){
    const key=$('clKey').value;if(key.length<32)throw Error('Introduce la clave de acceso a RosterHome (mínimo 32 caracteres).');
    const pending=fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-RosterHome-Key':key},body:JSON.stringify(data)});
    $('clKey').value='';$('clPassword').value='';
    const r=await pending;if(!r.ok){let msg='No se pudo contactar con el conector.';try{msg=(await r.json()).error||msg;}catch(_){}throw Error(msg);}return r;
  }
  $('clProbe').addEventListener('click',async()=>{
    if(busy)return;lock(true);$('clResult').textContent='Comprobando acceso a CrewLink sin enviar usuario ni contraseña…';
    try{const r=await request('/api/crewlink/probe',{});$('clResult').textContent=(await r.json()).message;}
    catch(e){$('clResult').textContent=e.message;}finally{lock(false);}
  });
  $('clForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!$('clHttp').checked)return;
    const person=Number($('clPerson').value),input=$('file'+person),start=$('clStart').value,end=$('clEnd').value,username=$('clUser').value.trim();
    if(end<start){$('clResult').textContent='Revisa el periodo seleccionado.';return;}
    if(input.disabled){$('clResult').textContent='Espera a que termine la otra importación.';return;}
    const before=JSON.stringify(state.people[person]);input.disabled=true;lock(true);$('clResult').textContent='Solicitando roster a CrewLink…';$('clDiff').textContent='';
    try{
      const r=await request('/api/crewlink/sync',{username,password:$('clPassword').value,start,end,allowHttp:true});
      const blob=await r.blob();if(!blob.type.includes('application/pdf'))throw Error('El conector no devolvió un PDF.');
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
    finally{input.disabled=false;lock(false);$('clKey').value='';$('clPassword').value='';}
  });
  window.addEventListener('pagehide',()=>{$('clKey').value='';$('clPassword').value='';});
  (async()=>{try{const r=await fetch('/api/crewlink/status',{cache:'no-store'}),info=await r.json();if(!r.ok||info.mode!=='cloud')throw Error();
    $('clAvailable').textContent=info.configured?'Conector disponible. Puedes comprobar la conexión antes de importar.':'Falta configurar el secreto ROSTERHOME_ACCESS_KEY en Cloudflare y volver a desplegar.';$('clForm').hidden=false;
  }catch(_){$('clAvailable').textContent='Abre la dirección de Cloudflare para conectar con CrewLink. Aquí sigue disponible la importación manual de PDF/TXT.';}})();
})();

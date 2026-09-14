const START='http://crewlink.corendonairlines.com:8090/crewlink/crewlink.jsp?crewlinkOperation=crewlinkForCrew&resetSession=Y';
const DUTY='http://crewlink.corendonairlines.com:8090/crewlink/clApp?crewlinkService=individualDutyPlan&crewlinkOperation=default&crewlinkSourcePage=spCrew';
const ORIGIN='http://crewlink.corendonairlines.com:8090';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function dateForm(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))throw Error('Fecha inválida.');
  const d=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(+d))throw Error('Fecha inválida.');
  return `${String(d.getUTCDate()).padStart(2,'0')}${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(-2)}`;
}
function validate(payload){
  if(!payload||!/^[a-z0-9]{2,16}$/i.test(payload.username||'')||!payload.password)throw Error('Completa usuario y contraseña.');
  const a=new Date(payload.start+'T00:00:00Z'),b=new Date(payload.end+'T00:00:00Z');
  if(!Number.isFinite(+a)||!Number.isFinite(+b)||b<a||(b-a)/86400000>365)throw Error('Selecciona un periodo válido de hasta 366 días.');
}
function waitInitialComplete(tabId,timeout=45000){
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(err,tab)=>{
      if(done)return;done=true;clearTimeout(timer);chrome.tabs.onUpdated.removeListener(onUpdated);err?reject(err):resolve(tab);
    };
    const onUpdated=(id,info,tab)=>{if(id===tabId&&info.status==='complete')finish(null,tab);};
    const timer=setTimeout(()=>finish(Error('CrewLink tardó demasiado en cargar.')),timeout);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId,tab=>{
      if(chrome.runtime.lastError)return;
      if(tab?.status==='complete')finish(null,tab);
    });
  });
}
function waitNextNavigation(tabId,timeout=45000){
  return new Promise((resolve,reject)=>{
    let done=false,sawLoading=false;
    const finish=(err,tab)=>{
      if(done)return;done=true;clearTimeout(timer);chrome.tabs.onUpdated.removeListener(onUpdated);err?reject(err):resolve(tab);
    };
    const onUpdated=(id,info,tab)=>{
      if(id!==tabId)return;
      if(info.status==='loading'||info.url)sawLoading=true;
      if(sawLoading&&info.status==='complete')finish(null,tab);
    };
    const timer=setTimeout(()=>finish(Error('CrewLink tardó demasiado en completar la navegación.')),timeout);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}
async function navigate(tabId,url,timeout=45000){
  const wait=waitNextNavigation(tabId,timeout);
  await chrome.tabs.update(tabId,{url});
  await wait;
}
async function exec(tabId,func,args=[]){
  const r=await chrome.scripting.executeScript({target:{tabId},func,args});
  if(!r?.length)throw Error('No pude ejecutar la automatización dentro de CrewLink.');
  return r[0].result;
}
async function submitLogin(tabId,username,password){
  const wait=waitNextNavigation(tabId,45000);
  const r=await exec(tabId,(u,p)=>{
    const f=[...document.forms].find(x=>x.elements?.crewlinkPassword);
    if(!f)return {ok:false,reason:'No encuentro el formulario de acceso.'};
    const set=(n,v)=>{const e=f.elements[n];if(e)e.value=v;};
    set('crewlinkUserName',u);set('crewlinkPassword',p);
    const btn=[...f.elements].find(e=>e.type==='submit');
    if(btn)btn.click();else f.submit();
    return {ok:true};
  },[username,password]);
  if(!r?.ok)throw Error(r?.reason||'No encuentro el formulario de acceso.');
  await wait;
}
async function assertLoggedIn(tabId){
  const r=await exec(tabId,()=>({
    login:!![...document.forms].find(x=>x.elements?.crewlinkPassword),
    text:(document.body?.innerText||'').replace(/\s+/g,' ').slice(0,300)
  }));
  if(r?.login)throw Error('CrewLink ha vuelto a la pantalla de acceso. Revisa usuario y contraseña.');
}
async function submitReport(tabId,start,end){
  const wait=waitNextNavigation(tabId,60000);
  const r=await exec(tabId,(b,e)=>{
    const f=[...document.forms].find(x=>x.elements?.crewlinkOperation?.value==='makeReport');
    if(!f)return {ok:false,reason:'No encuentro el formulario de Individual Duty Plan.'};
    const set=(n,v)=>{const el=f.elements[n];if(el)el.value=v;};
    set('buddyName','');set('beginDate',b);set('endDate',e);
    const btn=f.elements.selectBtn||[...f.elements].find(el=>el.type==='submit');
    if(btn)btn.click();else f.submit();
    return {ok:true};
  },[dateForm(start),dateForm(end)]);
  if(!r?.ok)throw Error(r?.reason||'No encuentro el formulario de Individual Duty Plan.');
  await wait;
}
async function findPdf(tabId){
  for(let i=0;i<30;i++){
    const r=await exec(tabId,()=>{
      const text=(document.body?.innerText||'').replace(/\s+/g,' ').trim();
      if(/Internal processing error/i.test(text))return {error:'CrewLink devolvió un error interno al generar el roster.'};
      const el=document.querySelector('iframe[src*="viewer.html?file="],frame[src*="viewer.html?file="],embed[src*="viewer.html?file="]');
      if(el){
        try{
          const u=new URL(el.getAttribute('src'),location.href),f=u.searchParams.get('file');
          if(f)return {pdf:new URL(f,location.href).href};
        }catch{}
      }
      const html=document.documentElement?.innerHTML||'';
      const m=html.match(/\/crewlink\/temp\/[^"'<>\\\s]+\.pdf/i);
      return m?{pdf:new URL(m[0],location.href).href}:{};
    });
    if(r?.error)throw Error(r.error);
    if(r?.pdf)return r.pdf;
    await sleep(400);
  }
  throw Error('CrewLink terminó la navegación pero no publicó el PDF.');
}
function arrayBufferToBase64(buf){
  const bytes=new Uint8Array(buf);let out='',step=0x8000;
  for(let i=0;i<bytes.length;i+=step)out+=String.fromCharCode(...bytes.subarray(i,i+step));
  return btoa(out);
}
async function fetchPdf(url){
  if(!url.startsWith(`${ORIGIN}/crewlink/temp/`))throw Error('CrewLink devolvió una ruta de PDF inesperada.');
  const r=await fetch(url,{credentials:'include',cache:'no-store'});
  if(!r.ok)throw Error(`No pude descargar el PDF de CrewLink (HTTP ${r.status}).`);
  const buf=await r.arrayBuffer();
  const head=new TextDecoder().decode(buf.slice(0,5));
  if(head!=='%PDF-')throw Error('CrewLink no devolvió un PDF válido.');
  if(buf.byteLength>10*1024*1024)throw Error('El PDF de CrewLink supera el tamaño permitido.');
  return arrayBufferToBase64(buf);
}
async function probe(){
  const tab=await chrome.tabs.create({url:START,active:false});
  try{
    await waitInitialComplete(tab.id,30000);await sleep(300);
    const r=await exec(tab.id,()=>({login:!![...document.forms].find(x=>x.elements?.crewlinkPassword)}));
    if(!r?.login)throw Error('CrewLink abre, pero no reconozco su formulario de acceso.');
    return {message:'✓ Chrome abre CrewLink correctamente. No se han enviado credenciales.'};
  }finally{try{await chrome.tabs.remove(tab.id);}catch{}}
}
async function sync(payload){
  validate(payload);
  const tab=await chrome.tabs.create({url:START,active:false});
  try{
    await waitInitialComplete(tab.id,30000);
    await submitLogin(tab.id,payload.username,payload.password);
    await sleep(1800);
    await assertLoggedIn(tab.id);
    await navigate(tab.id,DUTY,45000);
    await sleep(1800);
    await submitReport(tab.id,payload.start,payload.end);
    const pdfUrl=await findPdf(tab.id);
    const pdfBase64=await fetchPdf(pdfUrl);
    return {pdfBase64};
  }finally{
    payload.password='';
    try{await chrome.tabs.remove(tab.id);}catch{}
  }
}

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.kind!=='crewlink')return;
  (async()=>{
    try{
      let result;
      if(message.type==='probe')result=await probe();
      else if(message.type==='sync')result=await sync({...message.payload});
      else throw Error('Operación no soportada.');
      sendResponse({ok:true,result});
    }catch(e){sendResponse({ok:false,error:e?.message||'No se pudo completar CrewLink.'});}
  })();
  return true;
});

const VERSION='1.1.1';
const START='http://crewlink.corendonairlines.com:8090/crewlink/crewlink.jsp?crewlinkOperation=crewlinkForCrew&resetSession=Y';
const DUTY='http://crewlink.corendonairlines.com:8090/crewlink/clApp?crewlinkService=individualDutyPlan&crewlinkOperation=default&crewlinkSourcePage=spCrew';
const ORIGIN='http://crewlink.corendonairlines.com:8090';
const MAX_PDF=10*1024*1024;

function json(body,status=200,extraHeaders={}){
  return new Response(JSON.stringify(body),{status,headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extraHeaders
  }});
}
function sameOrigin(request){const u=new URL(request.url);return u.protocol==='https:'&&request.headers.get('Origin')===u.origin;}
async function authorized(request,secret){
  const key=request.headers.get('X-RosterHome-Key')||'';
  if(typeof secret!=='string'||secret.length<32||key.length<32||key.length>256)return false;
  const digest=async v=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
  const a=await digest(key),b=await digest(secret);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
function dateForm(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))throw Error('Fecha inválida.');
  const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(+d))throw Error('Fecha inválida.');
  return `${String(d.getUTCDate()).padStart(2,'0')}${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(-2)}`;
}
function validatePayload(payload){
  if(!payload||!/^[a-z0-9]{2,16}$/i.test(payload.username||'')||typeof payload.password!=='string'||!payload.password||payload.password.length>256)throw Error('Completa usuario y contraseña.');
  const a=new Date(payload.start+'T00:00:00Z'),b=new Date(payload.end+'T00:00:00Z');
  if(!Number.isFinite(+a)||!Number.isFinite(+b)||b<a||(b-a)/86400000>365)throw Error('Selecciona un periodo válido de hasta 366 días.');
}
function safeCrewlinkError(error){
  const message=String(error?.message||error||'No se pudo completar CrewLink.').replace(/\s+/g,' ').trim();
  if(/parser remoto|lector PDF|PDF de CrewLink/i.test(message)&&/timeout|timed out/i.test(message))return 'El procesamiento del PDF tardó demasiado. El roster guardado sigue intacto y Auto Sync volverá a intentarlo.';
  if(/timeout|timed out/i.test(message))return 'CrewLink tardó demasiado en responder. El roster guardado sigue intacto y Auto Sync volverá a intentarlo.';
  if(/429|browser time limit/i.test(message))return 'Se ha agotado el tiempo diario de navegador de Cloudflare. Auto Sync volverá a intentarlo en la siguiente ejecución.';
  if(/Internal processing error/i.test(message))return 'CrewLink devolvió un error interno al generar el roster. Auto Sync volverá a intentarlo.';
  return message.slice(0,500);
}


const CAL_TOKEN_RE=/^[A-Za-z0-9_-]{40,96}$/;
const MAX_ICS=768*1024;

function calendarText(body,status=200){
  return new Response(body,{status,headers:{
    'Content-Type':'text/calendar; charset=utf-8',
    'Cache-Control':'public, max-age=300, stale-while-revalidate=3600',
    'Content-Disposition':'inline',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer'
  }});
}
function validIcs(value){
  return typeof value==='string'&&value.length>40&&value.length<=MAX_ICS&&/^BEGIN:VCALENDAR\r?\n/.test(value)&&/\r?\nEND:VCALENDAR\r?\n?$/.test(value);
}


const AUTO_REGISTRY_ID='__rosterhome_auto_sync_registry_v1__';
const AUTO_CRON='17 4 * * *';
const PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';

function bytesToB64(bytes){
  let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);
}
function b64ToBytes(value){const s=atob(value);const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
async function credentialKey(secret){
  if(typeof secret!=='string'||secret.length<32)throw Error('ROSTERHOME_ACCESS_KEY no está configurada.');
  const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('RosterHome AutoSync v1|'+secret));
  return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function sealCredentials(secret,credentials){
  const key=await credentialKey(secret),iv=crypto.getRandomValues(new Uint8Array(12));
  const clear=new TextEncoder().encode(JSON.stringify(credentials));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,clear));
  return `v1.${bytesToB64(iv)}.${bytesToB64(encrypted)}`;
}
async function openCredentials(secret,value){
  const parts=String(value||'').split('.');if(parts.length!==3||parts[0]!=='v1')throw Error('Credenciales cifradas no válidas.');
  const key=await credentialKey(secret),iv=b64ToBytes(parts[1]),encrypted=b64ToBytes(parts[2]);
  const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,encrypted);
  return JSON.parse(new TextDecoder().decode(clear));
}
function autoRange(now=new Date()){
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
  const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+3,0));
  return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
function icsEscape(value){return String(value??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function icsStamp(value){return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function icsUid(parts){return parts.map(x=>String(x??'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')).filter(Boolean).join('.')+'@rosterhome.local';}
function buildIcs(title,events){
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RosterHome//Auto Sync Calendar//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${icsEscape(title)}`,'X-WR-TIMEZONE:UTC'];
  const now=icsStamp(new Date());
  for(const e of events||[])lines.push('BEGIN:VEVENT',`UID:${e.uid}`,`DTSTAMP:${now}`,`DTSTART:${icsStamp(e.start)}`,`DTEND:${icsStamp(e.end)}`,`SUMMARY:${icsEscape(e.summary)}`,`DESCRIPTION:${icsEscape(e.description||'')}`,`LOCATION:${icsEscape(e.location||'')}`,'END:VEVENT');
  lines.push('END:VCALENDAR');return lines.join('\r\n')+'\r\n';
}
function calendarBundle(profileName,briefings,flights){
  const suffix=profileName?` · ${profileName}`:'';
  return {
    briefings:buildIcs(`RosterHome · Briefings${suffix}`,briefings),
    flights:buildIcs(`RosterHome · Vuelos${suffix}`,flights)
  };
}
function sanitizedJobs(jobs){
  const out={};
  for(const [k,j] of Object.entries(jobs||{}))out[k]={profile:j.profile,enabled:!!j.enabled,crewCode:j.crewCode||'',name:j.name||'',briefingLead:j.briefingLead,lastAttemptAt:j.lastAttemptAt||null,lastSuccessAt:j.lastSuccessAt||null,lastError:j.lastError||null,lastRange:j.lastRange||null,configuredAt:j.configuredAt||null};
  return out;
}

class CalendarStore{
  constructor(state){this.state=state;}
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    if(request.method==='POST'&&path==='/publish'){
      let payload;try{payload=await request.json();}catch{return json({error:'JSON inválido.'},400);}
      if(!validIcs(payload?.briefings)||!validIcs(payload?.flights))return json({error:'Calendario inválido o demasiado grande.'},400);
      const values={briefings:payload.briefings,flights:payload.flights,updatedAt:new Date().toISOString()};
      if(payload.profile===0||payload.profile===1)values.calendarProfile=payload.profile;
      await this.state.storage.put(values);return json({ok:true,updatedAt:values.updatedAt});
    }
    if(request.method==='GET'&&/^\/feed\/(briefings|flights)$/.test(path)){
      const kind=path.split('/').pop(),value=await this.state.storage.get(kind);
      if(!value)return calendarText('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//RosterHome//Empty//ES\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n',200);
      return calendarText(value);
    }
    if(request.method==='POST'&&path==='/autosync/set'){
      const payload=await request.json(),jobs=(await this.state.storage.get('autoJobs'))||{};
      jobs[String(payload.profile)]={...(jobs[String(payload.profile)]||{}),...payload,updatedAt:new Date().toISOString()};
      await this.state.storage.put('autoJobs',jobs);return json({ok:true,jobs:sanitizedJobs(jobs)});
    }
    if(request.method==='POST'&&path==='/autosync/metadata'){
      const payload=await request.json(),jobs=(await this.state.storage.get('autoJobs'))||{},key=String(payload.profile),job=jobs[key];
      if(!job)return json({error:'Auto Sync no configurado para ese perfil.'},404);
      jobs[key]={...job,name:payload.name||job.name,briefingLead:Number.isFinite(Number(payload.briefingLead))?Number(payload.briefingLead):job.briefingLead,updatedAt:new Date().toISOString()};
      await this.state.storage.put('autoJobs',jobs);return json({ok:true});
    }
    if(request.method==='POST'&&path==='/autosync/remove'){
      const payload=await request.json(),jobs=(await this.state.storage.get('autoJobs'))||{};delete jobs[String(payload.profile)];
      await this.state.storage.put('autoJobs',jobs);return json({ok:true,jobs:sanitizedJobs(jobs)});
    }
    if(request.method==='GET'&&path==='/autosync/jobs'){
      const jobs=(await this.state.storage.get('autoJobs'))||{},calendarProfile=await this.state.storage.get('calendarProfile');
      return json({jobs,calendarProfile:calendarProfile===0||calendarProfile===1?calendarProfile:null});
    }
    if(request.method==='GET'&&path==='/autosync/status'){
      const jobs=(await this.state.storage.get('autoJobs'))||{},calendarProfile=await this.state.storage.get('calendarProfile');
      return json({jobs:sanitizedJobs(jobs),calendarProfile:calendarProfile===0||calendarProfile===1?calendarProfile:null,calendarUpdatedAt:(await this.state.storage.get('updatedAt'))||null});
    }
    if(request.method==='POST'&&path==='/autosync/result'){
      const payload=await request.json(),profile=Number(payload.profile),jobs=(await this.state.storage.get('autoJobs'))||{},key=String(profile),job=jobs[key];
      if(!job)return json({error:'Auto Sync no configurado.'},404);
      const now=new Date().toISOString();
      jobs[key]={...job,lastAttemptAt:now,lastSuccessAt:now,lastError:null,lastRange:payload.range||null};
      const values={autoJobs:jobs,[`remoteRoster:${profile}`]:{parsed:payload.parsed,syncedAt:now,range:payload.range||null}};
      if(validIcs(payload.briefings)&&validIcs(payload.flights)){values.briefings=payload.briefings;values.flights=payload.flights;values.updatedAt=now;}
      await this.state.storage.put(values);return json({ok:true,syncedAt:now});
    }
    if(request.method==='POST'&&path==='/autosync/fail'){
      const payload=await request.json(),profile=Number(payload.profile),jobs=(await this.state.storage.get('autoJobs'))||{},key=String(profile),job=jobs[key];
      if(job){jobs[key]={...job,lastAttemptAt:new Date().toISOString(),lastError:String(payload.error||'Error desconocido').slice(0,500)};await this.state.storage.put('autoJobs',jobs);}
      return json({ok:true});
    }
    if(request.method==='GET'&&/^\/autosync\/roster\/[01]$/.test(path)){
      const profile=path.split('/').pop(),value=await this.state.storage.get(`remoteRoster:${profile}`);return json(value||{parsed:null,syncedAt:null,range:null});
    }
    if(request.method==='POST'&&path==='/registry/add'){
      const {token}=await request.json();let tokens=(await this.state.storage.get('registryTokens'))||[];
      if(CAL_TOKEN_RE.test(String(token||''))&&!tokens.includes(token)){tokens.push(token);await this.state.storage.put('registryTokens',tokens);}return json({ok:true,count:tokens.length});
    }
    if(request.method==='POST'&&path==='/registry/remove'){
      const {token}=await request.json();let tokens=(await this.state.storage.get('registryTokens'))||[];tokens=tokens.filter(x=>x!==token);await this.state.storage.put('registryTokens',tokens);return json({ok:true,count:tokens.length});
    }
    if(request.method==='GET'&&path==='/registry/list')return json({tokens:(await this.state.storage.get('registryTokens'))||[]});
    return json({error:'Ruta no encontrada.'},404);
  }
}

async function calendarPublish(request,env){
  if(request.method!=='POST')return json({error:'Método no permitido.'},405);
  if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);
  if(!(await authorized(request,env.ROSTERHOME_ACCESS_KEY)))return json({error:'Clave de acceso a RosterHome incorrecta.'},401);
  if(!env.CALENDAR_STORE)return json({error:'Almacenamiento de calendarios no configurado.'},503);
  let payload;
  try{payload=await request.json();}catch{return json({error:'JSON inválido.'},400);}
  if(!CAL_TOKEN_RE.test(String(payload?.token||'')))return json({error:'Token de calendario inválido.'},400);
  if(!validIcs(payload?.briefings)||!validIcs(payload?.flights))return json({error:'Calendario inválido o demasiado grande.'},400);
  const id=env.CALENDAR_STORE.idFromName(payload.token);
  const stub=env.CALENDAR_STORE.get(id);
  return stub.fetch('https://calendar-store/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({briefings:payload.briefings,flights:payload.flights,profile:payload.profile})});
}
async function calendarFeed(pathname,env){
  if(!env.CALENDAR_STORE)return calendarText('Calendar storage unavailable',503);
  const m=pathname.match(/^\/calendar\/([A-Za-z0-9_-]{40,96})\/(briefings|flights)\.ics$/);
  if(!m)return null;
  const [,token,kind]=m,id=env.CALENDAR_STORE.idFromName(token);
  return env.CALENDAR_STORE.get(id).fetch(`https://calendar-store/feed/${kind}`);
}

class CdpClient{
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.waiters=[];this.binaryChunks=[];
    ws.addEventListener('message',e=>this.onMessage(e.data));
    ws.addEventListener('close',()=>this.failAll(Error('El navegador remoto cerró la conexión.')));
    ws.addEventListener('error',()=>this.failAll(Error('Error de conexión con el navegador remoto.')));
  }
  failAll(error){for(const p of this.pending.values())p.reject(error);this.pending.clear();for(const w of this.waiters)w.reject(error);this.waiters=[];}
  decodeLegacyChunk(data){
    const u=data instanceof ArrayBuffer?new Uint8Array(data):data instanceof Uint8Array?data:null;if(!u)return null;
    this.binaryChunks.push(u);if(!this.binaryChunks.length)return null;
    const first=this.binaryChunks[0];if(first.byteLength<4)return null;
    const expected=new DataView(first.buffer,first.byteOffset,first.byteLength).getUint32(0,true);
    let total=-4;for(const c of this.binaryChunks)total+=c.byteLength;if(total<expected)return null;if(total>expected){this.binaryChunks=[];throw Error('Respuesta CDP inválida.');}
    const out=new Uint8Array(expected);let offset=0;for(let i=0;i<this.binaryChunks.length;i++){const c=i===0?this.binaryChunks[i].subarray(4):this.binaryChunks[i];out.set(c,offset);offset+=c.byteLength;}this.binaryChunks=[];return new TextDecoder().decode(out);
  }
  async onMessage(data){
    try{
      let text;if(typeof data==='string')text=data;else if(data instanceof Blob)text=new TextDecoder().decode(await data.arrayBuffer());else text=this.decodeLegacyChunk(data);
      if(!text)return;const msg=JSON.parse(text);
      if(msg.id&&this.pending.has(msg.id)){const p=this.pending.get(msg.id);this.pending.delete(msg.id);if(msg.error)p.reject(Error(msg.error.message||'Error CDP.'));else p.resolve(msg.result||{});return;}
      if(msg.method){const keep=[];for(const w of this.waiters){if(w.method===msg.method&&(!w.sessionId||w.sessionId===msg.sessionId)){clearTimeout(w.timer);w.resolve(msg.params||{});}else keep.push(w);}this.waiters=keep;}
    }catch(error){this.failAll(error);}
  }
  send(method,params={},sessionId=null,timeout=30000){
    const id=++this.id,msg={id,method,params};if(sessionId)msg.sessionId=sessionId;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`Timeout CDP: ${method}`));},timeout);this.pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});this.ws.send(JSON.stringify(msg));});
  }
  waitEvent(method,sessionId=null,timeout=45000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==w);reject(Error(`Timeout esperando ${method}`));},timeout);const w={method,sessionId,resolve,reject,timer};this.waiters.push(w);});}
  close(){try{this.ws.close(1000,'done');}catch{}}
}
async function acquireCdp(env){
  if(!env.BROWSER?.fetch)throw Error('Browser Run no está disponible en este deployment.');
  // Browser Run exposes its Worker binding as a Fetcher. These are the same
  // endpoints used by Cloudflare's current @cloudflare/puppeteer transport.
  const host='https://fake.host';
  const acquire=await env.BROWSER.fetch(`${host}/v1/devtools/browser?`,{method:'POST'});
  if(!acquire.ok)throw Error(`Cloudflare Browser Run respondió HTTP ${acquire.status}.`);
  const info=await acquire.json();if(!info?.sessionId)throw Error('Cloudflare no devolvió una sesión de navegador.');
  const upgrade=await env.BROWSER.fetch(`${host}/v1/devtools/browser/${encodeURIComponent(info.sessionId)}`,{headers:{Upgrade:'websocket','cf-brapi-client':'RosterHome/1.1.1'}});
  if(!upgrade.webSocket)throw Error(`No se pudo abrir el canal de control del navegador remoto (HTTP ${upgrade.status}).`);
  const ws=upgrade.webSocket;ws.accept();const cdp=new CdpClient(ws);
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
  const attached=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  const sessionId=attached.sessionId;if(!sessionId)throw Error('No se pudo controlar la pestaña remota.');
  await Promise.all([cdp.send('Page.enable',{},sessionId),cdp.send('Runtime.enable',{},sessionId),cdp.send('Network.enable',{},sessionId)]);
  return {cdp,sessionId};
}
async function navigate(cdp,sessionId,url,timeout=75000){
  const loaded=cdp.waitEvent('Page.loadEventFired',sessionId,timeout);const r=await cdp.send('Page.navigate',{url},sessionId,timeout);if(r.errorText)throw Error(`No se pudo abrir CrewLink: ${r.errorText}`);await loaded;
}
async function evaluate(cdp,sessionId,expression,timeout=45000){
  const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId,timeout);
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text||r.exceptionDetails.exception?.description||'Error ejecutando CrewLink.');return r.result?.value;
}
async function submitAndWait(cdp,sessionId,expression,timeout=75000){
  const loaded=cdp.waitEvent('Page.loadEventFired',sessionId,timeout);const result=await evaluate(cdp,sessionId,expression,10000);if(!result?.ok){loaded.catch(()=>{});throw Error(result?.reason||'No se pudo enviar el formulario de CrewLink.');}await loaded;
}
async function submitWithoutLoadWait(cdp,sessionId,expression){
  const result=await evaluate(cdp,sessionId,expression,15000);
  if(!result?.ok)throw Error(result?.reason||'No se pudo enviar el formulario de CrewLink.');
}
async function browserProbe(env){
  const {cdp,sessionId}=await acquireCdp(env);try{await navigate(cdp,sessionId,START,60000);const ok=await evaluate(cdp,sessionId,`!![...document.forms].find(f=>f.elements?.crewlinkPassword)`);if(!ok)throw Error('CrewLink abre, pero no reconozco su formulario de acceso.');return {message:'✓ Cloudflare abre CrewLink correctamente. No se han enviado credenciales.'};}finally{try{await cdp.send('Browser.close',{},null,3000);}catch{}cdp.close();}
}
async function browserSync(env,payload,progress){
  validatePayload(payload);progress(8,'Iniciando navegador seguro en Cloudflare…');const {cdp,sessionId}=await acquireCdp(env);
  try{
    progress(18,'Abriendo CrewLink…');await navigate(cdp,sessionId,START,60000);
    const loginForm=await evaluate(cdp,sessionId,`!![...document.forms].find(f=>f.elements?.crewlinkPassword)`);if(!loginForm)throw Error('CrewLink abre, pero no reconozco su formulario de acceso.');
    progress(32,'Iniciando sesión en CrewLink…');
    const loginExpr=`(()=>{const f=[...document.forms].find(x=>x.elements?.crewlinkPassword);if(!f)return {ok:false,reason:'No encuentro el formulario de acceso.'};const set=(n,v)=>{const e=f.elements[n];if(e)e.value=v;};set('crewlinkUserName',${JSON.stringify(payload.username)});set('crewlinkPassword',${JSON.stringify(payload.password)});const btn=[...f.elements].find(e=>e.type==='submit');if(btn)btn.click();else f.submit();return {ok:true};})()`;
    await submitAndWait(cdp,sessionId,loginExpr,75000);await new Promise(r=>setTimeout(r,700));
    if(await evaluate(cdp,sessionId,`!![...document.forms].find(f=>f.elements?.crewlinkPassword)`))throw Error('CrewLink ha vuelto a la pantalla de acceso. Revisa usuario y contraseña.');
    progress(48,'Abriendo Individual Duty Plan…');await navigate(cdp,sessionId,DUTY,75000);await new Promise(r=>setTimeout(r,500));
    const hasReport=await evaluate(cdp,sessionId,`!![...document.forms].find(f=>f.elements?.crewlinkOperation?.value==='makeReport')`);if(!hasReport)throw Error('No se pudo acceder a Individual Duty Plan.');
    progress(64,'Generando el roster…');
    const reportExpr=`(()=>{const f=[...document.forms].find(x=>x.elements?.crewlinkOperation?.value==='makeReport');if(!f)return {ok:false,reason:'No encuentro el formulario de Individual Duty Plan.'};const set=(n,v)=>{const el=f.elements[n];if(el)el.value=v;};set('buddyName','');set('beginDate',${JSON.stringify(dateForm(payload.start))});set('endDate',${JSON.stringify(dateForm(payload.end))});const btn=f.elements.selectBtn||[...f.elements].find(el=>el.type==='submit');if(btn)btn.click();else f.submit();return {ok:true};})()`;
    await submitWithoutLoadWait(cdp,sessionId,reportExpr);await new Promise(r=>setTimeout(r,900));
    progress(76,'Localizando el PDF generado…');let pdfUrl=null;
    for(let i=0;i<90&&!pdfUrl;i++){
      const r=await evaluate(cdp,sessionId,`(()=>{const text=(document.body?.innerText||'').replace(/\\s+/g,' ').trim();if(/Internal processing error/i.test(text))return {error:'CrewLink devolvió un error interno al generar el roster.'};const el=document.querySelector('iframe[src*="viewer.html?file="],frame[src*="viewer.html?file="],embed[src*="viewer.html?file="]');if(el){try{const u=new URL(el.getAttribute('src'),location.href),f=u.searchParams.get('file');if(f)return {pdf:new URL(f,location.href).href};}catch{}}const html=document.documentElement?.innerHTML||'';const m=html.match(/\\/crewlink\\/temp\\/[^"'<>\\\\\\s]+\\.pdf/i);return m?{pdf:new URL(m[0],location.href).href}:{};})()`);
      if(r?.error)throw Error(r.error);if(r?.pdf)pdfUrl=r.pdf;else await new Promise(x=>setTimeout(x,500));
    }
    if(!pdfUrl)throw Error('CrewLink terminó la navegación pero no publicó el PDF.');if(!pdfUrl.startsWith(`${ORIGIN}/crewlink/temp/`))throw Error('CrewLink devolvió una ruta de PDF inesperada.');
    progress(86,'Descargando el PDF…');
    const fetchExpr=`(async()=>{const r=await fetch(${JSON.stringify(pdfUrl)},{credentials:'include',cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const buf=await r.arrayBuffer();if(buf.byteLength>${MAX_PDF})throw new Error('PDF demasiado grande');const bytes=new Uint8Array(buf);if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('PDF inválido');let binary='';const step=32768;for(let i=0;i<bytes.length;i+=step)binary+=String.fromCharCode(...bytes.subarray(i,i+step));return btoa(binary);})()`;
    const pdfBase64=await evaluate(cdp,sessionId,fetchExpr,60000);if(!pdfBase64)throw Error('CrewLink no devolvió el PDF.');progress(91,'PDF recibido. Enviándolo a RosterHome…');return {pdfBase64};
  }finally{payload.password='';try{await cdp.send('Browser.close',{},null,3000);}catch{}cdp.close();}
}

async function parserAssetSource(env){
  const r=await env.ASSETS.fetch(new Request('https://rosterhome-assets.invalid/roster-parser.js'));
  if(!r.ok)throw Error('No se pudo cargar el parser de roster del deployment.');return r.text();
}
async function parsePdfForAutoSync(env,pdfBase64,{profileName='',briefingLead=105}={}){
  const {cdp,sessionId}=await acquireCdp(env);
  try{
    const loaded=await evaluate(cdp,sessionId,`(async()=>{if(window.pdfjsLib)return true;await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=${JSON.stringify(PDFJS_URL)};s.onload=resolve;s.onerror=()=>reject(new Error('No se pudo cargar PDF.js'));document.head.appendChild(s);});return !!window.pdfjsLib;})()`,45000);
    if(!loaded)throw Error('No se pudo inicializar el lector PDF remoto.');
    const extractExpr=`(async()=>{const bin=atob(${JSON.stringify(pdfBase64)}),data=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)data[i]=bin.charCodeAt(i);const pdf=await pdfjsLib.getDocument({data,disableWorker:true}).promise;let out='';for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),viewport=page.getViewport({scale:1}),tc=await page.getTextContent();const items=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>{const t=pdfjsLib.Util.transform(viewport.transform,i.transform),width=Number(i.width||0);return {str:i.str.trim(),x:t[4],cx:t[4]+width/2,y:t[5]};});const mid=viewport.width*.5;const build=xs=>{const rows=[];xs.sort((a,b)=>a.y-b.y||a.x-b.x);for(const it of xs){let row=rows.find(r=>Math.abs(r.y-it.y)<2.4);if(!row){row={y:it.y,items:[]};rows.push(row);}row.items.push(it);}rows.sort((a,b)=>a.y-b.y);return rows.map(r=>r.items.sort((a,b)=>a.x-b.x).map(x=>x.str).join(' ')).join('\\n');};out+='\\n'+build([...items]).split('\\n').filter(line=>/Local\\s+times\\s+at\\s+event\\s+airport|Individual duty plan|^Period:/i.test(line)).join('\\n')+'\\n';out+='\\n[[PAGE '+p+' LEFT]]\\n'+build(items.filter(i=>i.cx<mid))+'\\n[[PAGE '+p+' RIGHT]]\\n'+build(items.filter(i=>i.cx>=mid));}return out;})()`;
    const text=await evaluate(cdp,sessionId,extractExpr,120000);if(!text||text.length<100)throw Error('El PDF de CrewLink no contiene texto utilizable.');
    const parserSource=await parserAssetSource(env);await evaluate(cdp,sessionId,parserSource+'\\n;!!globalThis.RosterParser',30000);
    const buildExpr=`(()=>{const parsed=RosterParser.parseCrewLinkText(${JSON.stringify(text)});const addDays=(d,n)=>new Date(d.getTime()+Number(n||0)*86400000);const dp=d=>({y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate()});const tp=v=>{const s=String(v||'').replace(':','').padStart(4,'0');return {h:+s.slice(0,2),min:+s.slice(2,4)}};const off=(date,tz)=>{const ps=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date),o=Object.fromEntries(ps.map(p=>[p.type,p.value]));return Date.UTC(+o.year,+o.month-1,+o.day,+o.hour,+o.minute,+o.second)-date.getTime()};const zoned=(y,m,d,h,mi,tz)=>{let g=new Date(Date.UTC(y,m-1,d,h,mi,0)),a=off(g,tz);g=new Date(g.getTime()-a);const b=off(g,tz);if(a!==b)g=new Date(Date.UTC(y,m-1,d,h,mi,0)-b);return g};const wall=(date,hhmm,tz)=>{const a=dp(date),b=tp(hhmm);return tz==='UTC'?new Date(Date.UTC(a.y,a.m-1,a.d,b.h,b.min,0)):zoned(a.y,a.m,a.d,b.h,b.min,tz)};const instants=duty=>{if(duty?.kind!=='duty'||duty.serviceType!=='flight'||!(duty.flights||[]).length)return [];const key=duty.sourceCheckInDate||duty.date;if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(key||'')))return [];const base=new Date(key+'T00:00:00Z');let prev=null,out=[];for(const f of duty.flights){let dd=addDays(base,f.depDayOffset||0),ad=addDays(base,f.arrDayOffset||0),dz=duty.timeBasis==='local_event'?(RosterParser.airportTimeZone(f.dep)||'UTC'):'UTC',az=duty.timeBasis==='local_event'?(RosterParser.airportTimeZone(f.arr)||'UTC'):'UTC',start=wall(dd,f.depTime,dz);while(prev&&start<prev){dd=addDays(dd,1);start=wall(dd,f.depTime,dz)}let end=wall(ad,f.arrTime,az);while(end<=start){ad=addDays(ad,1);end=wall(ad,f.arrTime,az)}out.push({flight:f,start,end});prev=end;}return out};const flights=[],briefings=[],lead=${Number(briefingLead)||105},person=${JSON.stringify(profileName)};for(const d of parsed.duties||[]){const xs=instants(d);if(!xs.length)continue;const first=xs[0],bs=new Date(first.start.getTime()-lead*60000);briefings.push({uid:['briefing',d.date,d.route,bs.toISOString()].join('.').replace(/[^A-Za-z0-9.@_-]/g,'-')+'@rosterhome.local',start:bs.toISOString(),end:new Date(bs.getTime()+15*60000).toISOString(),summary:'Briefing · '+(d.route||first.flight.dep+'–'+first.flight.arr),description:person+' · '+lead+' min antes del primer vuelo',location:d.base||first.flight.dep||''});for(const x of xs){const f=x.flight,no=(f.carrier||'')+(f.number||'');flights.push({uid:['flight',d.date,no,f.dep,f.arr,x.start.toISOString()].join('.').replace(/[^A-Za-z0-9.@_-]/g,'-')+'@rosterhome.local',start:x.start.toISOString(),end:x.end.toISOString(),summary:(no||'Vuelo')+' · '+f.dep+' → '+f.arr,description:person+(d.route?' · duty '+d.route:'')+(f.aircraft?' · '+f.aircraft:''),location:f.dep+' → '+f.arr});}}return JSON.stringify({parsed,briefings,flights});})()`;
    const packed=await evaluate(cdp,sessionId,buildExpr,90000);if(!packed)throw Error('El parser remoto no devolvió datos.');return JSON.parse(packed);
  }finally{try{await cdp.send('Browser.close',{},null,3000);}catch{}cdp.close();}
}
function registryStub(env){const id=env.CALENDAR_STORE.idFromName(AUTO_REGISTRY_ID);return env.CALENDAR_STORE.get(id);}
async function registryAdd(env,token){return registryStub(env).fetch('https://calendar-store/registry/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});}
async function registryRemove(env,token){return registryStub(env).fetch('https://calendar-store/registry/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});}
async function tokenStore(env,token){const id=env.CALENDAR_STORE.idFromName(token);return env.CALENDAR_STORE.get(id);}
async function runAutoSyncProfile(env,token,profile){
  const stub=await tokenStore(env,token),jobsData=await (await stub.fetch('https://calendar-store/autosync/jobs')).json(),job=jobsData.jobs?.[String(profile)];
  if(!job?.enabled)return {ok:false,skipped:true};
  const range=autoRange(),attempt=new Date().toISOString();
  let lastError=null;
  for(let tryNo=1;tryNo<=2;tryNo++){
    try{
      const creds=await openCredentials(env.ROSTERHOME_ACCESS_KEY,job.encryptedCredentials),username=String(creds.username||'').toUpperCase();
      let sync;
      try{sync=await browserSync(env,{username:creds.username,password:creds.password,start:range.start,end:range.end},()=>{});}
      catch(error){throw Error('CrewLink: '+String(error?.message||error));}
      let processed;
      try{processed=await parsePdfForAutoSync(env,sync.pdfBase64,{profileName:job.name||job.crewCode,briefingLead:job.briefingLead});}
      catch(error){throw Error('Parser remoto: '+String(error?.message||error));}
      const parsed=processed.parsed;
      if(parsed?.crew?.crewCode?.toUpperCase()!==username)throw Error('CrewLink devolvió un roster de otro usuario.');
      if(!parsed?.coverage?.complete)throw Error('El roster diario no reconcilia sus totales; se conserva el último roster válido.');
      let calendars={briefings:null,flights:null};
      if(jobsData.calendarProfile===Number(profile))calendars=calendarBundle(job.name||job.crewCode,processed.briefings,processed.flights);
      const result=await stub.fetch('https://calendar-store/autosync/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:Number(profile),parsed,range,...calendars})});
      if(!result.ok)throw Error('No se pudo guardar el roster automático.');
      return {ok:true,profile:Number(profile),range,attempt,tries:tryNo};
    }catch(error){
      lastError=error;
      const message=String(error?.message||error);
      const retryable=/timeout|timed out|cerró la conexión|Error de conexión|HTTP 5\d\d|no publicó el PDF/i.test(message);
      if(tryNo<2&&retryable){await new Promise(r=>setTimeout(r,1800));continue;}
      break;
    }
  }
  const message=safeCrewlinkError(lastError);await stub.fetch('https://calendar-store/autosync/fail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:Number(profile),error:message})});throw Error(message);
}
async function runAllAutoSync(env){
  if(!env.CALENDAR_STORE||!env.BROWSER)return;
  const list=await (await registryStub(env).fetch('https://calendar-store/registry/list')).json();
  for(const token of list.tokens||[]){
    try{const stub=await tokenStore(env,token),data=await (await stub.fetch('https://calendar-store/autosync/jobs')).json();for(const [profile,job] of Object.entries(data.jobs||{}))if(job?.enabled){try{await runAutoSyncProfile(env,token,Number(profile));}catch(error){console.error('Auto Sync',token.slice(0,8),profile,error?.message||error);}}}catch(error){console.error('Auto Sync token',token.slice(0,8),error?.message||error);}
  }
}
async function autoSyncApi(request,env,path){
  if(!env.CALENDAR_STORE)return json({error:'Almacenamiento Auto Sync no configurado.'},503);
  if(!(await authorized(request,env.ROSTERHOME_ACCESS_KEY)))return json({error:'Clave de acceso a RosterHome incorrecta.'},401);
  const u=new URL(request.url),token=String(u.searchParams.get('token')||'');
  if(request.method!=='GET'&&!sameOrigin(request))return json({error:'Origen no permitido.'},403);
  if(path==='/api/autosync/config'&&request.method==='POST'){
    let payload;try{payload=await request.json();}catch{return json({error:'JSON inválido.'},400);}const t=String(payload.token||'');
    if(!CAL_TOKEN_RE.test(t))return json({error:'Token Auto Sync inválido.'},400);const profile=Number(payload.profile);
    if(![0,1].includes(profile)||!/^[a-z0-9]{2,16}$/i.test(payload.username||'')||typeof payload.password!=='string'||!payload.password)return json({error:'Completa perfil, usuario y contraseña de CrewLink.'},400);
    const encryptedCredentials=await sealCredentials(env.ROSTERHOME_ACCESS_KEY,{username:payload.username,password:payload.password});
    const job={profile,enabled:true,crewCode:String(payload.username).toUpperCase(),name:String(payload.name||`Perfil ${profile+1}`).slice(0,80),briefingLead:Math.max(0,Math.min(360,Number(payload.briefingLead)||105)),encryptedCredentials,configuredAt:new Date().toISOString(),lastError:null};
    const stub=await tokenStore(env,t);await stub.fetch('https://calendar-store/autosync/set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(job)});await registryAdd(env,t);
    return json({ok:true,job:sanitizedJobs({[profile]:job})[profile]});
  }
  if(path==='/api/autosync/metadata'&&request.method==='POST'){
    let payload;try{payload=await request.json();}catch{return json({error:'JSON inválido.'},400);}const t=String(payload.token||'');if(!CAL_TOKEN_RE.test(t))return json({error:'Token Auto Sync inválido.'},400);
    const stub=await tokenStore(env,t);return stub.fetch('https://calendar-store/autosync/metadata',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:Number(payload.profile),name:String(payload.name||'').slice(0,80),briefingLead:Number(payload.briefingLead)})});
  }
  if(path==='/api/autosync/disable'&&request.method==='POST'){
    let payload;try{payload=await request.json();}catch{return json({error:'JSON inválido.'},400);}const t=String(payload.token||'');if(!CAL_TOKEN_RE.test(t))return json({error:'Token Auto Sync inválido.'},400);
    const stub=await tokenStore(env,t),res=await stub.fetch('https://calendar-store/autosync/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:Number(payload.profile)})}),body=await res.clone().json();
    if(!Object.keys(body.jobs||{}).length)await registryRemove(env,t);return res;
  }
  if(path==='/api/autosync/run'&&request.method==='POST'){
    let payload;try{payload=await request.json();}catch{return json({error:'JSON inválido.'},400);}const t=String(payload.token||'');if(!CAL_TOKEN_RE.test(t))return json({error:'Token Auto Sync inválido.'},400);
    try{return json(await runAutoSyncProfile(env,t,Number(payload.profile)));}catch(error){return json({error:safeCrewlinkError(error)},502);}
  }
  if(path==='/api/autosync/status'&&request.method==='GET'){
    if(!CAL_TOKEN_RE.test(token))return json({error:'Token Auto Sync inválido.'},400);return (await tokenStore(env,token)).fetch('https://calendar-store/autosync/status');
  }
  if(path==='/api/autosync/roster'&&request.method==='GET'){
    const profile=Number(u.searchParams.get('profile'));if(!CAL_TOKEN_RE.test(token)||![0,1].includes(profile))return json({error:'Solicitud inválida.'},400);return (await tokenStore(env,token)).fetch(`https://calendar-store/autosync/roster/${profile}`);
  }
  return json({error:'Ruta Auto Sync no encontrada.'},404);
}

function ndjsonStream(env,payload){
  const encoder=new TextEncoder();return new ReadableStream({async start(controller){const send=o=>controller.enqueue(encoder.encode(JSON.stringify(o)+'\n'));const progress=(p,m)=>send({type:'progress',progress:p,message:m});try{send({type:'progress',progress:3,message:'Solicitud recibida…'});const result=await browserSync(env,payload,progress);send({type:'result',...result});}catch(error){send({type:'error',error:safeCrewlinkError(error)});}finally{controller.close();}}});
}

export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(u.pathname.startsWith('/calendar/')){const feed=await calendarFeed(u.pathname,env);if(feed)return feed;}
    if(u.pathname==='/api/calendar/publish')return calendarPublish(request,env);
    if(u.pathname.startsWith('/api/autosync/'))return autoSyncApi(request,env,u.pathname);
    if(u.pathname==='/api/crewlink/status'&&request.method==='GET')return json({available:true,mode:'hybrid',configured:typeof env.ROSTERHOME_ACCESS_KEY==='string'&&env.ROSTERHOME_ACCESS_KEY.length>=32,cloudBrowser:!!env.BROWSER,autoSync:true,version:VERSION,transport:'cloud-browser+local-bridge',requiresAccessKey:true});
    if(u.pathname==='/api/crewlink/cloud/probe'){
      if(request.method!=='POST')return json({error:'Método no permitido.'},405);if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);if(!(await authorized(request,env.ROSTERHOME_ACCESS_KEY)))return json({error:'Clave de acceso a RosterHome incorrecta.'},401);
      try{return json(await browserProbe(env));}catch(error){return json({error:safeCrewlinkError(error)},502);}
    }
    if(u.pathname==='/api/crewlink/cloud/sync'){
      if(request.method!=='POST')return json({error:'Método no permitido.'},405);if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);if(!(await authorized(request,env.ROSTERHOME_ACCESS_KEY)))return json({error:'Clave de acceso a RosterHome incorrecta.'},401);
      if(!String(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return json({error:'Formato no permitido.'},415);
      let payload;try{payload=await request.json();validatePayload(payload);}catch(error){return json({error:safeCrewlinkError(error)},400);}
      return new Response(ndjsonStream(env,payload),{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
    }
    if(u.pathname.startsWith('/api/'))return json({error:'Ruta no encontrada.'},404);return env.ASSETS.fetch(request);
  },
  async scheduled(controller,env,ctx){ctx.waitUntil(runAllAutoSync(env));}
};


export { CalendarStore };

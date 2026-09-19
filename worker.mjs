const VERSION='1.0.0';
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
  if(/timeout|timed out/i.test(message))return 'CrewLink tardó demasiado en responder. Vuelve a intentarlo.';
  if(/429|browser time limit/i.test(message))return 'Se ha agotado el tiempo diario de navegador de Cloudflare. Prueba más tarde o usa el Bridge del PC.';
  if(/Internal processing error/i.test(message))return 'CrewLink devolvió un error interno al generar el roster.';
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

export class CalendarStore{
  constructor(state){this.state=state;}
  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/publish'){
      let payload;
      try{payload=await request.json();}catch{return json({error:'JSON inválido.'},400);}
      if(!validIcs(payload?.briefings)||!validIcs(payload?.flights))return json({error:'Calendario inválido o demasiado grande.'},400);
      await this.state.storage.put({
        briefings:payload.briefings,
        flights:payload.flights,
        updatedAt:new Date().toISOString()
      });
      return json({ok:true,updatedAt:new Date().toISOString()});
    }
    if(request.method==='GET'&&/^\/feed\/(briefings|flights)$/.test(url.pathname)){
      const kind=url.pathname.split('/').pop();
      const value=await this.state.storage.get(kind);
      if(!value)return calendarText('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//RosterHome//Empty//ES\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n',200);
      return calendarText(value);
    }
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
  return stub.fetch('https://calendar-store/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({briefings:payload.briefings,flights:payload.flights})});
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
  const upgrade=await env.BROWSER.fetch(`${host}/v1/devtools/browser/${encodeURIComponent(info.sessionId)}`,{headers:{Upgrade:'websocket','cf-brapi-client':'RosterHome/1.0.0'}});
  if(!upgrade.webSocket)throw Error(`No se pudo abrir el canal de control del navegador remoto (HTTP ${upgrade.status}).`);
  const ws=upgrade.webSocket;ws.accept();const cdp=new CdpClient(ws);
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
  const attached=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  const sessionId=attached.sessionId;if(!sessionId)throw Error('No se pudo controlar la pestaña remota.');
  await Promise.all([cdp.send('Page.enable',{},sessionId),cdp.send('Runtime.enable',{},sessionId),cdp.send('Network.enable',{},sessionId)]);
  return {cdp,sessionId};
}
async function navigate(cdp,sessionId,url,timeout=45000){
  const loaded=cdp.waitEvent('Page.loadEventFired',sessionId,timeout);const r=await cdp.send('Page.navigate',{url},sessionId,timeout);if(r.errorText)throw Error(`No se pudo abrir CrewLink: ${r.errorText}`);await loaded;
}
async function evaluate(cdp,sessionId,expression,timeout=30000){
  const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId,timeout);
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text||r.exceptionDetails.exception?.description||'Error ejecutando CrewLink.');return r.result?.value;
}
async function submitAndWait(cdp,sessionId,expression,timeout=45000){
  const loaded=cdp.waitEvent('Page.loadEventFired',sessionId,timeout);const result=await evaluate(cdp,sessionId,expression,10000);if(!result?.ok){loaded.catch(()=>{});throw Error(result?.reason||'No se pudo enviar el formulario de CrewLink.');}await loaded;
}
async function browserProbe(env){
  const {cdp,sessionId}=await acquireCdp(env);try{await navigate(cdp,sessionId,START,30000);const ok=await evaluate(cdp,sessionId,`!![...document.forms].find(f=>f.elements?.crewlinkPassword)`);if(!ok)throw Error('CrewLink abre, pero no reconozco su formulario de acceso.');return {message:'✓ Cloudflare abre CrewLink correctamente. No se han enviado credenciales.'};}finally{try{await cdp.send('Browser.close',{},null,3000);}catch{}cdp.close();}
}
async function browserSync(env,payload,progress){
  validatePayload(payload);progress(8,'Iniciando navegador seguro en Cloudflare…');const {cdp,sessionId}=await acquireCdp(env);
  try{
    progress(18,'Abriendo CrewLink…');await navigate(cdp,sessionId,START,30000);
    const loginForm=await evaluate(cdp,sessionId,`!![...document.forms].find(f=>f.elements?.crewlinkPassword)`);if(!loginForm)throw Error('CrewLink abre, pero no reconozco su formulario de acceso.');
    progress(32,'Iniciando sesión en CrewLink…');
    const loginExpr=`(()=>{const f=[...document.forms].find(x=>x.elements?.crewlinkPassword);if(!f)return {ok:false,reason:'No encuentro el formulario de acceso.'};const set=(n,v)=>{const e=f.elements[n];if(e)e.value=v;};set('crewlinkUserName',${JSON.stringify(payload.username)});set('crewlinkPassword',${JSON.stringify(payload.password)});const btn=[...f.elements].find(e=>e.type==='submit');if(btn)btn.click();else f.submit();return {ok:true};})()`;
    await submitAndWait(cdp,sessionId,loginExpr,45000);await new Promise(r=>setTimeout(r,700));
    if(await evaluate(cdp,sessionId,`!![...document.forms].find(f=>f.elements?.crewlinkPassword)`))throw Error('CrewLink ha vuelto a la pantalla de acceso. Revisa usuario y contraseña.');
    progress(48,'Abriendo Individual Duty Plan…');await navigate(cdp,sessionId,DUTY,45000);await new Promise(r=>setTimeout(r,500));
    const hasReport=await evaluate(cdp,sessionId,`!![...document.forms].find(f=>f.elements?.crewlinkOperation?.value==='makeReport')`);if(!hasReport)throw Error('No se pudo acceder a Individual Duty Plan.');
    progress(64,'Generando el roster…');
    const reportExpr=`(()=>{const f=[...document.forms].find(x=>x.elements?.crewlinkOperation?.value==='makeReport');if(!f)return {ok:false,reason:'No encuentro el formulario de Individual Duty Plan.'};const set=(n,v)=>{const el=f.elements[n];if(el)el.value=v;};set('buddyName','');set('beginDate',${JSON.stringify(dateForm(payload.start))});set('endDate',${JSON.stringify(dateForm(payload.end))});const btn=f.elements.selectBtn||[...f.elements].find(el=>el.type==='submit');if(btn)btn.click();else f.submit();return {ok:true};})()`;
    await submitAndWait(cdp,sessionId,reportExpr,55000);
    progress(76,'Localizando el PDF generado…');let pdfUrl=null;
    for(let i=0;i<35&&!pdfUrl;i++){
      const r=await evaluate(cdp,sessionId,`(()=>{const text=(document.body?.innerText||'').replace(/\\s+/g,' ').trim();if(/Internal processing error/i.test(text))return {error:'CrewLink devolvió un error interno al generar el roster.'};const el=document.querySelector('iframe[src*="viewer.html?file="],frame[src*="viewer.html?file="],embed[src*="viewer.html?file="]');if(el){try{const u=new URL(el.getAttribute('src'),location.href),f=u.searchParams.get('file');if(f)return {pdf:new URL(f,location.href).href};}catch{}}const html=document.documentElement?.innerHTML||'';const m=html.match(/\\/crewlink\\/temp\\/[^"'<>\\\\\\s]+\\.pdf/i);return m?{pdf:new URL(m[0],location.href).href}:{};})()`);
      if(r?.error)throw Error(r.error);if(r?.pdf)pdfUrl=r.pdf;else await new Promise(x=>setTimeout(x,300));
    }
    if(!pdfUrl)throw Error('CrewLink terminó la navegación pero no publicó el PDF.');if(!pdfUrl.startsWith(`${ORIGIN}/crewlink/temp/`))throw Error('CrewLink devolvió una ruta de PDF inesperada.');
    progress(86,'Descargando el PDF…');
    const fetchExpr=`(async()=>{const r=await fetch(${JSON.stringify(pdfUrl)},{credentials:'include',cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const buf=await r.arrayBuffer();if(buf.byteLength>${MAX_PDF})throw new Error('PDF demasiado grande');const bytes=new Uint8Array(buf);if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('PDF inválido');let binary='';const step=32768;for(let i=0;i<bytes.length;i+=step)binary+=String.fromCharCode(...bytes.subarray(i,i+step));return btoa(binary);})()`;
    const pdfBase64=await evaluate(cdp,sessionId,fetchExpr,30000);if(!pdfBase64)throw Error('CrewLink no devolvió el PDF.');progress(91,'PDF recibido. Enviándolo a RosterHome…');return {pdfBase64};
  }finally{payload.password='';try{await cdp.send('Browser.close',{},null,3000);}catch{}cdp.close();}
}
function ndjsonStream(env,payload){
  const encoder=new TextEncoder();return new ReadableStream({async start(controller){const send=o=>controller.enqueue(encoder.encode(JSON.stringify(o)+'\n'));const progress=(p,m)=>send({type:'progress',progress:p,message:m});try{send({type:'progress',progress:3,message:'Solicitud recibida…'});const result=await browserSync(env,payload,progress);send({type:'result',...result});}catch(error){send({type:'error',error:safeCrewlinkError(error)});}finally{controller.close();}}});
}

export default {async fetch(request,env){
  const u=new URL(request.url);
  if(u.pathname.startsWith('/calendar/')){
    const feed=await calendarFeed(u.pathname,env);
    if(feed)return feed;
  }
  if(u.pathname==='/api/calendar/publish')return calendarPublish(request,env);
  if(u.pathname==='/api/crewlink/status'&&request.method==='GET')return json({available:true,mode:'hybrid',configured:typeof env.ROSTERHOME_ACCESS_KEY==='string'&&env.ROSTERHOME_ACCESS_KEY.length>=32,cloudBrowser:!!env.BROWSER,version:VERSION,transport:'cloud-browser+local-bridge',requiresAccessKey:true});
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
}};

const REMOTE='http://crewlink.corendonairlines.com:8090';
const START=REMOTE+'/crewlink/crewlink.jsp?crewlinkOperation=crewlinkForCrew&resetSession=Y';
const MAX_PDF=10*1024*1024,MAX_HTML=512*1024;
class SafeError extends Error{}
export function remoteUrl(path,base=REMOTE+'/crewlink/'){
  const u=new URL(path,base);
  if(u.origin!==REMOTE||u.username||u.password||!u.pathname.startsWith('/crewlink/'))throw new SafeError('CrewLink devolvió una dirección inesperada.');
  return u;
}
function decode(s){return s.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,x=>{const t=x.slice(1,-1).toLowerCase();if(t.startsWith('#')){const n=t.startsWith('#x')?parseInt(t.slice(2),16):Number(t.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[t];});}
function attrs(tag){return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));}
export function forms(html){
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)].map(m=>({action:attrs(m[1]).action||'clApp',fields:Object.fromEntries([...m[2].matchAll(/<input\b[^>]*>/gi)].map(x=>attrs(x[0])).filter(a=>a.name).map(a=>[a.name,a.value||'']))}));
}
function diagnosticSummary(html,username=''){
  let normalized=decode(String(html||'')).replace(/\\\//g,'/');
  const redact=(value)=>{
    let out=String(value||'');
    if(username){
      const esc=username.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      out=out.replace(new RegExp(esc,'gi'),'[USER]');
    }
    out=out
      .replace(/(crewlinkPassword(?:%3D|=))[^^&\s"'<>]*/gi,'$1[REDACTED]')
      .replace(/(crewlinkUserName(?:%3D|=))[^^&\s"'<>]*/gi,'$1[USER]')
      .replace(/(password\s*[:=]\s*)[^&\s"'<>]+/gi,'$1[REDACTED]');
    return out;
  };
  normalized=redact(normalized);

  const formInfo=forms(normalized).slice(0,6).map(f=>{
    let action='';
    try{action=new URL(f.action,REMOTE+'/crewlink/').pathname;}catch{action=String(f.action||'').split('?')[0];}
    return `${action||'-'}[${Object.keys(f.fields).slice(0,12).join('|')||'-'}]`;
  });
  const hrefs=[...normalized.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)]
    .map(m=>m[1]||m[2]||m[3]||'')
    .filter(Boolean)
    .slice(0,12)
    .map(v=>{
      try{const u=new URL(v,REMOTE+'/crewlink/');return u.pathname+(u.searchParams.has('crewlinkOperation')?`?crewlinkOperation=${u.searchParams.get('crewlinkOperation')}`:'');}
      catch{return String(v).split('?')[0].slice(0,120);}
    });
  const redirects=[...normalized.matchAll(/(?:document|window)?\.?location(?:\.href)?\s*=\s*["']([^"']+)["']/gi)]
    .map(m=>m[1]).slice(0,6).map(v=>String(v).split('?')[0].slice(0,120));

  const text=redact(normalized
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/\s+/g,' ')
    .trim()).slice(0,900);

  return {
    len:String(html||'').length,
    text:text||'-',
    forms:formInfo.join(';')||'-',
    refs:hrefs.join(';')||'-',
    redirects:redirects.join(';')||'-'
  };
}

export function pdfUrl(html){
  const normalized=decode(html).replace(/\\\//g,'/');

  // Formato tradicional: PDF.js dentro de iframe/frame/embed.
  for(const tag of normalized.matchAll(/<(?:iframe|frame|embed)\b[^>]*>/gi)){
    const src=attrs(tag[0]).src;
    if(!src)continue;
    try{
      const path=new URL(src,REMOTE+'/crewlink/').searchParams.get('file');
      if(path){
        const u=remoteUrl(path);
        if(u.pathname.startsWith('/crewlink/temp/')&&u.pathname.toLowerCase().endsWith('.pdf'))return u;
      }
    }catch{}
  }

  // CrewLink puede devolver directamente la ruta temporal al PDF en el HTML.
  for(const match of normalized.matchAll(/\/crewlink\/temp\/[^\"'<>\\\s]+\.pdf(?:[?#][^\"'<>\\\s]*)?/gi)){
    try{
      const u=remoteUrl(match[0]);
      if(u.pathname.startsWith('/crewlink/temp/')&&u.pathname.toLowerCase().endsWith('.pdf'))return u;
    }catch{}
  }

  // O puede ocultarla dentro de un parámetro file= fuera de un iframe.
  for(const match of normalized.matchAll(/[?&]file=([^\"'<>\\\s&]+)/gi)){
    try{
      const raw=decodeURIComponent(match[1]);
      const u=remoteUrl(raw);
      if(u.pathname.startsWith('/crewlink/temp/')&&u.pathname.toLowerCase().endsWith('.pdf'))return u;
    }catch{}
  }

  if(/crewlinkPassword/i.test(normalized))throw new SafeError('CrewLink devolvió de nuevo la pantalla de acceso. Revisa usuario y contraseña.');
  throw new SafeError('CrewLink respondió al generar el roster, pero no pude localizar el PDF.');
}
export async function limitedBody(response,max){
  if(!response.body)return new Uint8Array();
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new SafeError('La respuesta supera el tamaño permitido.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const out=new Uint8Array(total);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
}
// One jar per request; only the fixed CrewLink host is ever contacted.
export class CookieJar{
  constructor(){this.cookies=new Map();}
  receive(headers,address){
    const values=headers.getSetCookie?.()||(headers.getAll?headers.getAll('Set-Cookie'):[]);
    for(const value of values){
      const [first,...rest]=value.split(';'),pos=first.indexOf('=');if(pos<=0)continue;
      const name=first.slice(0,pos).trim(),v=first.slice(pos+1).trim(),a={};
      for(const part of rest){const i=part.indexOf('=');a[(i<0?part:part.slice(0,i)).trim().toLowerCase()]=i<0?true:part.slice(i+1).trim();}
      if(a.domain){const domain=String(a.domain).replace(/^\./,'').toLowerCase();if(domain!==address.hostname&&!address.hostname.endsWith('.'+domain))continue;}
      const path=typeof a.path==='string'&&a.path.startsWith('/')?a.path:address.pathname.slice(0,address.pathname.lastIndexOf('/')+1);
      const key=name+'|'+path;
      const age=a['max-age']===undefined?null:Number(a['max-age']);
      let expires=age!==null&&Number.isFinite(age)?Date.now()+age*1000:(a.expires?Date.parse(a.expires):Infinity);
      if(Number.isNaN(expires))expires=Infinity;
      if(expires<=Date.now()){this.cookies.delete(key);continue;}
      this.cookies.set(key,{name,value:v,path,secure:!!a.secure,expires});
    }
  }
  header(address){return [...this.cookies.values()].filter(c=>c.expires>Date.now()&&!c.secure&&(address.pathname===c.path||address.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/'))).sort((a,b)=>b.path.length-a.path.length).map(c=>`${c.name}=${c.value}`).join('; ');}
}
function dateValue(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new SafeError('Fecha inválida.');
  const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value)throw new SafeError('Fecha inválida.');return d;
}
export function validate(data){
  if(!data||typeof data!=='object')throw new SafeError('Solicitud inválida.');
  if(typeof data.username!=='string'||!/^[a-z0-9]{2,16}$/i.test(data.username)||typeof data.password!=='string'||!data.password||data.password.length>256)throw new SafeError('Completa usuario y contraseña.');
  if(data.allowHttp!==true)throw new SafeError('Acepta el aviso de conexión HTTP.');
  const start=dateValue(data.start),end=dateValue(data.end);
  if(end<start||(end-start)/86400000>365)throw new SafeError('Selecciona un periodo de hasta 366 días.');
}
function dateForm(value){const d=dateValue(value);return `${String(d.getUTCDate()).padStart(2,'0')}${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(-2)}`;}
export async function crewlink(data,probe=false,transport=fetch){
  if(!probe)validate(data);
  const jar=new CookieJar(),controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),60000);
  async function exchange(path,fields=null,pdf=false,referer=null){
    let u=remoteUrl(path);
    for(let i=0;i<5;i++){
      const headers=new Headers({
        'Accept':pdf?'*/*':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language':'en-GB,en;q=0.9',
        'Cache-Control':'no-cache',
        'Pragma':'no-cache',
        'Upgrade-Insecure-Requests':'1',
        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
      }),cookie=jar.header(u);
      if(referer)headers.set('Referer',remoteUrl(referer).href);
      if(fields)headers.set('Origin',REMOTE);
      if(cookie)headers.set('Cookie',cookie);
      if(fields)headers.set('Content-Type','application/x-www-form-urlencoded');
      const r=await transport(u.href,{method:fields?'POST':'GET',headers,body:fields?new URLSearchParams(fields).toString():undefined,redirect:'manual',signal:controller.signal});
      jar.receive(r.headers,u);
      if([301,302,303,307,308].includes(r.status)){
        const loc=r.headers.get('Location');await r.body?.cancel();if(!loc)throw new SafeError('Redirección de CrewLink incompleta.');
        u=remoteUrl(loc,u.href);if([301,302,303].includes(r.status))fields=null;continue;
      }
      if(!r.ok){await r.body?.cancel();throw new SafeError(`CrewLink respondió HTTP ${r.status}.`);}
      const bytes=await limitedBody(r,pdf?MAX_PDF:MAX_HTML);
      return pdf?bytes:new TextDecoder('iso-8859-1').decode(bytes);
    }
    throw new SafeError('Demasiadas redirecciones de CrewLink.');
  }
  try{
    if(probe){
      const landing=await exchange(START),login=forms(landing).find(f=>'crewlinkPassword' in f.fields);
      if(!login)throw new SafeError('El portal responde, pero no se reconoce el formulario de acceso.');
      return {ok:true,message:'Cloudflare alcanza CrewLink y reconoce el formulario de acceso. No se han enviado credenciales.'};
    }

    // Replica el flujo observado en el HAR del navegador: el login real es un POST
    // directo a clApp y es ese POST el que crea el contexto de sesión.
    const loginFields={
      crewlinkService:'crewlinkForCrew',
      crewlinkOperation:'loadMainFrameSet',
      crewlinkSourcePage:'spStartup',
      crewlinkUserName:data.username,
      crewlinkPassword:data.password
    };
    const loginPage=await exchange('clApp',loginFields,false,START);
    if(/crewlinkPassword/i.test(loginPage))throw new SafeError('CrewLink devolvió de nuevo la pantalla de acceso. Revisa usuario y contraseña.');

    // El navegador carga estas páginas del frameset inmediatamente después del login.
    // Algunas instalaciones antiguas de CrewLink mantienen estado en ese contexto.
    const crewHome='clApp?crewlinkService=crewlinkForCrew&crewlinkOperation=default';
    await exchange(`HeaderPage.jsp?user=${encodeURIComponent(data.username)}`,null,false,'clApp');
    await exchange(crewHome,null,false,'clApp');
    await exchange('MessagePage.jsp',null,false,'clApp');
    await exchange('ResultFrame.html',null,false,'clApp');
    await exchange('Status.html',null,false,'clApp');
    await exchange('Info.html',null,false,'clApp');
    await exchange('Clock.html',null,false,'clApp');

    const dutyPage='clApp?crewlinkService=individualDutyPlan&crewlinkOperation=default&crewlinkSourcePage=spCrew';
    const page=await exchange(dutyPage,null,false,crewHome);
    const form=forms(page).find(f=>f.fields.crewlinkOperation==='makeReport');
    if(!form)throw new SafeError('No se pudo acceder al roster. Revisa el login o los mensajes del portal.');

    // El HAR muestra exactamente estos cinco campos en el POST makeReport.
    const reportFields={
      crewlinkService:'individualDutyPlan',
      crewlinkOperation:'makeReport',
      buddyName:'',
      beginDate:dateForm(data.start),
      endDate:dateForm(data.end)
    };
    let report=await exchange('clApp',reportFields,false,dutyPage);
    let pdf;
    try{pdf=pdfUrl(report);}catch{
      // Un único reintento después de volver a abrir la pantalla del IDP. Evita
      // reutilizar una respuesta intermedia de CrewLink como si fuera el informe.
      const refreshed=await exchange(dutyPage,null,false,crewHome);
      if(!forms(refreshed).some(f=>f.fields.crewlinkOperation==='makeReport'))throw new SafeError('CrewLink perdió el contexto del roster antes de generar el PDF.');
      report=await exchange('clApp',reportFields,false,dutyPage);
      try{pdf=pdfUrl(report);}catch{
        const d=diagnosticSummary(report,data.username);
        throw new SafeError(`CrewLink devolvió una página inesperada tras generar el roster. DIAG len=${d.len}; text=${JSON.stringify(d.text)}; forms=${JSON.stringify(d.forms)}; refs=${JSON.stringify(d.refs)}; redirects=${JSON.stringify(d.redirects)}.`);
      }
    }

    const viewerRef=`js/pdfjs/web/viewer.html?file=${pdf.pathname}`;
    const bytes=await exchange(pdf.href,null,true,viewerRef);
    if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new SafeError('La respuesta no es un PDF; puede haber caducado la sesión.');
    return bytes;
  }finally{clearTimeout(timeout);jar.cookies.clear();if(data)data.password='';}
}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
async function authorized(request,secret){
  const key=request.headers.get('X-RosterHome-Key')||'';if(key.length<32||key.length>256)return false;
  const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const a=await digest(key),b=await digest(secret);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
    if(u.pathname==='/api/crewlink/status'&&request.method==='GET')return json({available:true,mode:'cloud',configured:typeof env.ROSTERHOME_ACCESS_KEY==='string'&&env.ROSTERHOME_ACCESS_KEY.length>=32,version:'0.5.5'});
    if(!['/api/crewlink/probe','/api/crewlink/sync'].includes(u.pathname))return json({error:'Ruta no encontrada.'},404);
    if(request.method!=='POST')return json({error:'Método no permitido.'},405);
    if(u.protocol!=='https:'||request.headers.get('Origin')!==u.origin)return json({error:'Origen no permitido.'},403);
    const secret=env.ROSTERHOME_ACCESS_KEY;
    if(typeof secret!=='string'||secret.length<32)return json({error:'Configura el secreto ROSTERHOME_ACCESS_KEY en Cloudflare (mínimo 32 caracteres).'},503);
    if(!(await authorized(request,secret)))return json({error:'Clave de acceso a RosterHome incorrecta.'},401);
    if(request.headers.get('Content-Type')!=='application/json')return json({error:'Formato no permitido.'},415);
    try{
      const raw=await limitedBody(request,4096),data=JSON.parse(new TextDecoder().decode(raw));
      if(u.pathname.endsWith('/probe'))return json(await crewlink(null,true));
      const bytes=await crewlink(data);
      return new Response(bytes,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
    }catch(e){return json({error:e instanceof SafeError?e.message:'No se pudo completar la conexión con CrewLink. Prueba la conexión sin credenciales.'},502);}
  }
};

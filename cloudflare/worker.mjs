const REMOTE='http://crewlink.corendonairlines.com:8090';
const START=REMOTE+'/crewlink/crewlink.jsp?crewlinkOperation=crewlinkForCrew';
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
export function pdfUrl(html){
  for(const tag of html.matchAll(/<(?:iframe|frame|embed)\b[^>]*>/gi)){
    const src=attrs(tag[0]).src;if(!src)continue;
    const path=new URL(src,REMOTE+'/crewlink/').searchParams.get('file');if(!path)continue;
    const u=remoteUrl(path);if(u.pathname.startsWith('/crewlink/temp/')&&u.pathname.endsWith('.pdf'))return u;
  }
  throw new SafeError('CrewLink no generó un PDF. Comprueba que el periodo está publicado.');
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
  async function exchange(path,fields=null,pdf=false){
    let u=remoteUrl(path);
    for(let i=0;i<5;i++){
      const headers=new Headers({'Accept':pdf?'application/pdf':'text/html','User-Agent':'RosterHome/0.5.0'}),cookie=jar.header(u);
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
      return pdf?bytes:new TextDecoder().decode(bytes);
    }
    throw new SafeError('Demasiadas redirecciones de CrewLink.');
  }
  try{
    const landing=await exchange(START),login=forms(landing).find(f=>'crewlinkPassword' in f.fields);
    if(!login)throw new SafeError('El portal responde, pero no se reconoce el formulario de acceso.');
    if(probe)return {ok:true,message:'Cloudflare alcanza CrewLink y reconoce el formulario de acceso. No se han enviado credenciales.'};
    const loginFields=Object.fromEntries(['crewlinkService','crewlinkOperation','crewlinkSourcePage'].filter(k=>k in login.fields).map(k=>[k,login.fields[k]]));
    await exchange(login.action,{...loginFields,crewlinkUserName:data.username,crewlinkPassword:data.password});
    const page=await exchange('clApp?crewlinkService=individualDutyPlan&crewlinkOperation=default&crewlinkSourcePage=spCrew');
    const form=forms(page).find(f=>f.fields.crewlinkOperation==='makeReport');
    if(!form)throw new SafeError('No se pudo acceder al roster. Revisa el login o los mensajes del portal.');
    const report=await exchange(form.action,{crewlinkService:'individualDutyPlan',crewlinkOperation:'makeReport',buddyName:'',beginDate:dateForm(data.start),endDate:dateForm(data.end)});
    const bytes=await exchange(pdfUrl(report).href,null,true);
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
    if(u.pathname==='/api/crewlink/status'&&request.method==='GET')return json({available:true,mode:'cloud',configured:typeof env.ROSTERHOME_ACCESS_KEY==='string'&&env.ROSTERHOME_ACCESS_KEY.length>=32,version:'0.5.1'});
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

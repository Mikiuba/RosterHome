import { connect } from 'cloudflare:sockets';

const HOST='crewlink.corendonairlines.com';
const PORT=8090;
const REMOTE=`http://${HOST}:${PORT}`;
const START='/crewlink/crewlink.jsp?crewlinkOperation=crewlinkForCrew&resetSession=Y';
const MAX_PDF=10*1024*1024, MAX_HTML=512*1024;
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
class SafeError extends Error{}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function decodeEntities(s){return String(s||'').replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,x=>{const t=x.slice(1,-1).toLowerCase();if(t.startsWith('#')){const n=t.startsWith('#x')?parseInt(t.slice(2),16):Number(t.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[t]||'';});}
function attrs(tag){return Object.fromEntries([...String(tag).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decodeEntities(m[2]??m[3]??m[4])]));}
function forms(html){return [...String(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)].map(m=>({action:attrs(m[1]).action||'clApp',fields:Object.fromEntries([...m[2].matchAll(/<input\b[^>]*>/gi)].map(x=>attrs(x[0])).filter(a=>a.name).map(a=>[a.name,a.value||'']))}));}
function dateValue(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new SafeError('Fecha inválida.');const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value)throw new SafeError('Fecha inválida.');return d;}
function dateForm(value){const d=dateValue(value);return `${String(d.getUTCDate()).padStart(2,'0')}${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(-2)}`;}
function validate(data){if(!data||typeof data!=='object')throw new SafeError('Solicitud inválida.');if(typeof data.username!=='string'||!/^[a-z0-9]{2,16}$/i.test(data.username)||typeof data.password!=='string'||!data.password||data.password.length>256)throw new SafeError('Completa usuario y contraseña.');if(data.allowHttp!==true)throw new SafeError('Acepta el aviso de conexión HTTP.');const a=dateValue(data.start),b=dateValue(data.end);if(b<a||(b-a)/86400000>365)throw new SafeError('Selecciona un periodo de hasta 366 días.');}

function indexOfBytes(buf,needle){outer:for(let i=0;i<=buf.length-needle.length;i++){for(let j=0;j<needle.length;j++)if(buf[i+j]!==needle[j])continue outer;return i;}return -1;}
function concat(a,b){const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out;}
class RawHttp {
  constructor(){this.socket=null;this.reader=null;this.writer=null;this.buf=new Uint8Array();this.cookies=new Map();}
  async open(){this.socket=connect({hostname:HOST,port:PORT},{secureTransport:'off',allowHalfOpen:true});await this.socket.opened;this.reader=this.socket.readable.getReader();this.writer=this.socket.writable.getWriter();}
  async close(){try{this.reader?.releaseLock();}catch{}try{this.writer?.releaseLock();}catch{}try{await this.socket?.close();}catch{}}
  async more(){const {done,value}=await this.reader.read();if(done)throw new SafeError('CrewLink cerró la conexión antes de completar la respuesta.');this.buf=concat(this.buf,value);}
  async take(n){while(this.buf.length<n)await this.more();const out=this.buf.slice(0,n);this.buf=this.buf.slice(n);return out;}
  async line(){const crlf=new Uint8Array([13,10]);while(true){const i=indexOfBytes(this.buf,crlf);if(i>=0){const out=this.buf.slice(0,i);this.buf=this.buf.slice(i+2);return new TextDecoder('iso-8859-1').decode(out);}await this.more();}}
  receiveCookies(headers){for(const raw of headers.get('set-cookie')||[]){const parts=raw.split(';');const p=parts[0].indexOf('=');if(p<=0)continue;const name=parts[0].slice(0,p).trim(),value=parts[0].slice(p+1).trim();let path='/';let expired=false;for(const item of parts.slice(1)){const [k,...rv]=item.trim().split('=');const key=k.toLowerCase(),v=rv.join('=');if(key==='path'&&v.startsWith('/'))path=v;if(key==='max-age'&&Number(v)<=0)expired=true;}const key=name+'|'+path;if(expired)this.cookies.delete(key);else this.cookies.set(key,{name,value,path});}}
  cookie(path){return [...this.cookies.values()].filter(c=>path===c.path||path.startsWith(c.path.endsWith('/')?c.path:c.path+'/')).sort((a,b)=>b.path.length-a.path.length).map(c=>`${c.name}=${c.value}`).join('; ');}
  async request(method,path,{body='',referer=null,pdf=false}={}){
    const bodyBytes=new TextEncoder().encode(body);
    const lines=[`${method} ${path} HTTP/1.1`,`Host: ${HOST}:${PORT}`,'Connection: keep-alive','Cache-Control: max-age=0','Upgrade-Insecure-Requests: 1',`User-Agent: ${UA}`,`Accept: ${pdf?'*/*':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'}`,'Accept-Encoding: identity','Accept-Language: es-ES,es;q=0.9,en;q=0.8'];
    const cookie=this.cookie(path);if(cookie)lines.push(`Cookie: ${cookie}`);
    if(referer)lines.push(`Referer: ${REMOTE}${referer}`);
    if(method==='POST'){lines.push(`Origin: ${REMOTE}`,'Content-Type: application/x-www-form-urlencoded',`Content-Length: ${bodyBytes.length}`);}
    const head=new TextEncoder().encode(lines.join('\r\n')+'\r\n\r\n');
    await this.writer.write(concat(head,bodyBytes));
    const statusLine=await this.line();const m=statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/);if(!m)throw new SafeError('Respuesta HTTP inválida de CrewLink.');const status=Number(m[1]);
    const headers=new Map();while(true){const l=await this.line();if(!l)break;const p=l.indexOf(':');if(p<0)continue;const k=l.slice(0,p).trim().toLowerCase(),v=l.slice(p+1).trim();if(!headers.has(k))headers.set(k,[]);headers.get(k).push(v);}
    this.receiveCookies(headers);
    let bytes;
    const te=(headers.get('transfer-encoding')||[]).join(',').toLowerCase();const cl=Number((headers.get('content-length')||[])[0]);
    if(te.includes('chunked')){const chunks=[];let total=0;while(true){const sizeLine=await this.line();const size=parseInt(sizeLine.split(';')[0].trim(),16);if(!Number.isFinite(size))throw new SafeError('CrewLink devolvió una respuesta chunked inválida.');if(size===0){while((await this.line())!==''){}break;}const c=await this.take(size);chunks.push(c);total+=c.length;await this.take(2);if(total>(pdf?MAX_PDF:MAX_HTML))throw new SafeError('La respuesta supera el tamaño permitido.');}bytes=new Uint8Array(total);let o=0;for(const c of chunks){bytes.set(c,o);o+=c.length;}}
    else if(Number.isFinite(cl)&&cl>=0){if(cl>(pdf?MAX_PDF:MAX_HTML))throw new SafeError('La respuesta supera el tamaño permitido.');bytes=await this.take(cl);}
    else throw new SafeError('CrewLink devolvió una respuesta sin longitud conocida.');
    if(status<200||status>=300)throw new SafeError(`CrewLink respondió HTTP ${status}.`);
    return {status,headers,bytes,text:pdf?null:new TextDecoder('iso-8859-1').decode(bytes)};
  }
}
function pathFromAction(action){const u=new URL(action,REMOTE+'/crewlink/');if(u.origin!==REMOTE||!u.pathname.startsWith('/crewlink/'))throw new SafeError('CrewLink devolvió una dirección inesperada.');return u.pathname+u.search;}
function pdfPath(html){const normalized=decodeEntities(html).replace(/\\\//g,'/');for(const tag of normalized.matchAll(/<(?:iframe|frame|embed)\b[^>]*>/gi)){const src=attrs(tag[0]).src;if(!src)continue;try{const f=new URL(src,REMOTE+'/crewlink/').searchParams.get('file');if(f&&f.startsWith('/crewlink/temp/')&&f.toLowerCase().endsWith('.pdf'))return f;}catch{}}const m=normalized.match(/\/crewlink\/temp\/[^"'<>\\\s]+\.pdf/gi);if(m)return m[0];throw new SafeError('CrewLink respondió, pero no incluyó el PDF generado.');}
function diagnostic(html){const text=String(html||'').replace(/<!--[\s\S]*?-->/g,' ').replace(/<script\b[\s\S]*?<\/script\s*>/gi,' ').replace(/<style\b[\s\S]*?<\/style\s*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();return text.slice(0,500)||'-';}

async function rawCrewlink(data,probe=false){if(!probe)validate(data);const c=new RawHttp();await c.open();try{
  const landing=(await c.request('GET',START)).text;const loginForm=forms(landing).find(f=>'crewlinkPassword' in f.fields);if(!loginForm)throw new SafeError('El portal responde, pero no se reconoce el formulario de acceso.');if(probe)return {ok:true,message:'Cloudflare alcanza CrewLink por TCP y reconoce el formulario de acceso. No se han enviado credenciales.'};
  const loginBody=new URLSearchParams({crewlinkService:'crewlinkForCrew',crewlinkOperation:'loadMainFrameSet',crewlinkSourcePage:'spStartup',crewlinkUserName:data.username,crewlinkPassword:data.password}).toString();
  const login=(await c.request('POST',pathFromAction(loginForm.action),{body:loginBody,referer:START})).text;if(/crewlinkPassword/i.test(login))throw new SafeError('CrewLink devolvió la pantalla de acceso. Revisa usuario y contraseña.');
  await sleep(250);
  const crewHome='/crewlink/clApp?crewlinkService=crewlinkForCrew&crewlinkOperation=default';
  await c.request('GET',`/crewlink/HeaderPage.jsp?user=${encodeURIComponent(data.username)}`,{referer:'/crewlink/clApp'});
  await c.request('GET',crewHome,{referer:'/crewlink/clApp'});
  await c.request('GET','/crewlink/MessagePage.jsp',{referer:'/crewlink/clApp'});
  await c.request('GET','/crewlink/ResultFrame.html',{referer:'/crewlink/clApp'});
  await c.request('GET','/crewlink/Status.html',{referer:'/crewlink/clApp'});
  await c.request('GET','/crewlink/Info.html',{referer:'/crewlink/clApp'});
  await c.request('GET','/crewlink/Clock.html',{referer:'/crewlink/clApp'});
  await sleep(350);
  const duty='/crewlink/clApp?crewlinkService=individualDutyPlan&crewlinkOperation=default&crewlinkSourcePage=spCrew';
  const dutyHtml=(await c.request('GET',duty,{referer:crewHome})).text;const form=forms(dutyHtml).find(f=>f.fields.crewlinkOperation==='makeReport');if(!form)throw new SafeError('No se pudo acceder al Duty Plan después del login.');
  await sleep(900);
  const body=new URLSearchParams({crewlinkService:'individualDutyPlan',crewlinkOperation:'makeReport',buddyName:'',beginDate:dateForm(data.start),endDate:dateForm(data.end)}).toString();
  const report=(await c.request('POST','/crewlink/clApp',{body,referer:duty})).text;
  if(/Internal processing error/i.test(report))throw new SafeError(`CrewLink rechazó la generación incluso por una única conexión HTTP/1.1 persistente. Respuesta: ${diagnostic(report)}`);
  const pdf=pdfPath(report);const pdfRes=await c.request('GET',pdf,{referer:`/crewlink/js/pdfjs/web/viewer.html?file=${pdf}`,pdf:true});if(new TextDecoder().decode(pdfRes.bytes.slice(0,5))!=='%PDF-')throw new SafeError('CrewLink respondió al PDF con contenido no válido.');return pdfRes.bytes;
}finally{await c.close();if(data)data.password='';}}

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
async function authorized(request,secret){const key=request.headers.get('X-RosterHome-Key')||'';if(key.length<32||key.length>256)return false;const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));const a=await digest(key),b=await digest(secret);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
export default {async fetch(request,env){const u=new URL(request.url);if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);if(u.pathname==='/api/crewlink/status'&&request.method==='GET')return json({available:true,mode:'cloud-tcp',configured:typeof env.ROSTERHOME_ACCESS_KEY==='string'&&env.ROSTERHOME_ACCESS_KEY.length>=32,version:'0.5.8',transport:'single-tcp-http11'});if(!['/api/crewlink/probe','/api/crewlink/sync'].includes(u.pathname))return json({error:'Ruta no encontrada.'},404);if(request.method!=='POST')return json({error:'Método no permitido.'},405);if(u.protocol!=='https:'||request.headers.get('Origin')!==u.origin)return json({error:'Origen no permitido.'},403);const secret=env.ROSTERHOME_ACCESS_KEY;if(typeof secret!=='string'||secret.length<32)return json({error:'Configura el secreto ROSTERHOME_ACCESS_KEY en Cloudflare.'},503);if(!(await authorized(request,secret)))return json({error:'Clave de acceso a RosterHome incorrecta.'},401);if(request.headers.get('Content-Type')!=='application/json')return json({error:'Formato no permitido.'},415);try{const raw=new Uint8Array(await request.arrayBuffer());if(raw.length>4096)throw new SafeError('Solicitud demasiado grande.');const data=JSON.parse(new TextDecoder().decode(raw));if(u.pathname.endsWith('/probe'))return json(await rawCrewlink(null,true));const bytes=await rawCrewlink(data,false);return new Response(bytes,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}catch(e){return json({error:e instanceof SafeError?e.message:'No se pudo completar la conexión con CrewLink.'},502);}}};

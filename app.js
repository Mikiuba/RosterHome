const DEFAULT_STATE = {
  people:[
    {name:'Miguel', duties:[], source:null},
    {name:'Nicole', duties:[], source:null}
  ],
  rules:{
    homeTz:'Europe/Athens', sleepHours:8, quietLead:30, commuteOut:0, commuteHome:0,
    longDuty:10, veryLongDuty:12, partialRecovery:6, fullRecovery:12,
    lunchTime:'14:00', dinnerTime:'20:30', mealFlex:60
  },
  month:new Date().toISOString().slice(0,7)
};

let state = loadState();
function loadState(){ try{ return {...structuredClone(DEFAULT_STATE), ...JSON.parse(localStorage.getItem('rosterhome-state')||'{}')}; }catch(e){ return structuredClone(DEFAULT_STATE); } }
function saveState(){ localStorage.setItem('rosterhome-state', JSON.stringify(state)); }
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function ms(h){ return h*3600000; }
function minMs(m){ return m*60000; }

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function fmt(date, opts={}){
  return new Intl.DateTimeFormat('es-ES',{timeZone:state.rules.homeTz,...opts}).format(new Date(date));
}
function dayKey(date){
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:state.rules.homeTz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(date));
  const o=Object.fromEntries(p.map(x=>[x.type,x.value])); return `${o.year}-${o.month}-${o.day}`;
}
function hourLocal(date){ return Number(new Intl.DateTimeFormat('en-GB',{timeZone:state.rules.homeTz,hour:'2-digit',hour12:false}).format(new Date(date))); }
function timeLocal(date){ return fmt(date,{hour:'2-digit',minute:'2-digit',hour12:false}); }
function monthLabel(ym){ const [y,m]=ym.split('-').map(Number); return new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)); }

function tzOffsetMillis(date, timeZone){
  const parts = new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const asUTC=Date.UTC(+o.year,+o.month-1,+o.day,+o.hour,+o.minute,+o.second); return asUTC-date.getTime();
}
function zonedToUtc(y,m,d,h,min,timeZone){
  let guess=new Date(Date.UTC(y,m-1,d,h,min,0));
  let off=tzOffsetMillis(guess,timeZone); guess=new Date(guess.getTime()-off);
  const off2=tzOffsetMillis(guess,timeZone); if(off2!==off) guess=new Date(Date.UTC(y,m-1,d,h,min,0)-off2); return guess;
}
function utcForLocalDayTime(key, hhmm){ const [y,m,d]=key.split('-').map(Number), [h,mi]=hhmm.split(':').map(Number); return zonedToUtc(y,m,d,h,mi,state.rules.homeTz); }

function dutyLabel(d){
  if(d.kind==='status') return d.status;
  const route=d.route || d.base || 'Duty'; return `${route} · ${timeLocal(d.checkIn)}–${d.checkout?timeLocal(d.checkout):'?'}`;
}

function recoveryForDuty(d){
  if(d.kind!=='duty' || !d.checkout) return null;
  let score=0; const hrs=Number(d.dutyHours||0), type=String(d.type||'').toUpperCase();
  if(hrs>=state.rules.veryLongDuty) score+=2; else if(hrs>=state.rules.longDuty) score+=1;
  if(type.includes('NIGHT')) score+=2; else if(type.includes('EARLY')||type.includes('LATE')) score+=1;
  const coH=hourLocal(d.checkout), ciH=hourLocal(d.checkIn);
  if(coH>=0 && coH<5) score+=2;
  if(ciH>=0 && ciH<5) score+=1;
  if(score===0) return null;
  const full=score>=3;
  const start=new Date(new Date(d.checkout).getTime()+minMs(state.rules.commuteHome));
  const dur=full?state.rules.fullRecovery:state.rules.partialRecovery;
  return {start,end:new Date(start.getTime()+ms(dur)),level:full?'full':'partial',score};
}
function sleepForDuty(d){
  if(d.kind!=='duty' || !d.checkIn) return null;
  const wake=new Date(new Date(d.checkIn).getTime()-minMs(state.rules.commuteOut));
  const start=new Date(wake.getTime()-ms(state.rules.sleepHours));
  return {start,end:wake,quietStart:new Date(start.getTime()-minMs(state.rules.quietLead))};
}

function allDerived(){
  const events=[];
  state.people.forEach((p,pi)=>p.duties.forEach(d=>{
    if(d.kind==='duty'){
      events.push({kind:'duty',person:pi,start:new Date(d.checkIn),end:d.checkout?new Date(d.checkout):new Date(new Date(d.checkIn).getTime()+ms(8)),label:dutyLabel(d),raw:d});
      const s=sleepForDuty(d); if(s){ events.push({kind:'sleep',person:pi,start:s.start,end:s.end,label:`Sueño ${state.rules.sleepHours} h`,raw:d}); if(state.rules.quietLead>0) events.push({kind:'quiet',person:pi,start:s.quietStart,end:s.start,label:'Quiet hours',raw:d}); }
      const r=recoveryForDuty(d); if(r) events.push({kind:'recovery',person:pi,start:r.start,end:r.end,label:r.level==='full'?'Recovery completo':'Recovery parcial',level:r.level,raw:d});
    }
  }));
  return events;
}

function mergeIntervals(intervals){
  const xs=intervals.filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start); if(!xs.length) return [];
  const out=[{start:new Date(xs[0].start),end:new Date(xs[0].end)}];
  for(const x of xs.slice(1)){ const last=out[out.length-1]; if(x.start<=last.end){ if(x.end>last.end)last.end=new Date(x.end); } else out.push({start:new Date(x.start),end:new Date(x.end)}); }
  return out;
}
function overlap(a,b,start,end){ const s=new Date(Math.max(a.start,start)), e=new Date(Math.min(a.end,end)); return e>s?{start:s,end:e}:null; }
function coupleWindowForDay(key, derived){
  if(!state.people[0].duties.length || !state.people[1].duties.length) return null;
  const start=utcForLocalDayTime(key,'08:00'), end=utcForLocalDayTime(key,'23:00');
  const blocks=derived.filter(e=>['duty','sleep'].includes(e.kind)).map(e=>overlap(e,{start,end},start,end)).filter(Boolean);
  const merged=mergeIntervals(blocks); let cursor=start, best=null;
  for(const b of merged){ if(b.start>cursor){ const gap={start:new Date(cursor),end:new Date(b.start)}; if(!best||gap.end-gap.start>best.end-best.start)best=gap; } if(b.end>cursor)cursor=b.end; }
  if(cursor<end){const gap={start:new Date(cursor),end:new Date(end)}; if(!best||gap.end-gap.start>best.end-best.start)best=gap;}
  return best && (best.end-best.start)>=ms(2) ? best : null;
}

function renderCalendar(){
  $('monthTitle').textContent=monthLabel(state.month); $('legendP1').textContent=state.people[0].name||'Perfil 1'; $('legendP2').textContent=state.people[1].name||'Perfil 2';
  const [year,month]=state.month.split('-').map(Number); const first=new Date(year,month-1,1); const days=new Date(year,month,0).getDate(); const lead=(first.getDay()+6)%7;
  const names=['L','M','X','J','V','S','D']; let html=names.map(x=>`<div class="dow">${x}</div>`).join('');
  const derived=allDerived();
  for(let i=0;i<lead;i++) html+='<div class="day other"></div>';
  const todayKey=dayKey(new Date());
  for(let d=1;d<=days;d++){
    const key=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let ev=[];
    for(const e of derived){ if(dayKey(e.start)===key || dayKey(new Date(e.end.getTime()-1))===key){ ev.push(e); } }
    const statuses=[]; state.people.forEach((p,pi)=>p.duties.filter(x=>x.kind==='status'&&x.date===key).forEach(x=>statuses.push({kind:'status',person:pi,label:x.status})));
    const cw=coupleWindowForDay(key,derived);
    html+=`<div class="day ${key===todayKey?'today':''}"><div class="daynum">${d}</div>`;
    [...statuses,...ev].slice(0,5).forEach(e=>{
      if(e.kind==='status') html+=`<div class="event ${e.person===1?'p2':''}">${esc(state.people[e.person].name)} · ${esc(e.label)}</div>`;
      else if(e.kind==='duty') html+=`<div class="event ${e.person===1?'p2':''}">${esc(state.people[e.person].name)} · ${esc(e.label)}</div>`;
      else if(e.kind==='sleep') html+=`<div class="event sleep">🌙 ${esc(state.people[e.person].name)} ${timeLocal(e.start)}–${timeLocal(e.end)}</div>`;
      else if(e.kind==='recovery') html+=`<div class="event recovery ${e.level==='full'?'full':''}">${e.level==='full'?'🔴':'🟡'} ${esc(state.people[e.person].name)} recovery</div>`;
    });
    if(cw) html+=`<div class="event couple">❤️ ${timeLocal(cw.start)}–${timeLocal(cw.end)}</div>`;
    html+='</div>';
  }
  $('calendar').innerHTML=html;
  renderSummary();
}

function renderSummary(){
  const [y,m]=state.month.split('-').map(Number); const days=new Date(y,m,0).getDate(); const derived=allDerived(); let windows=[];
  for(let d=1;d<=days;d++){const key=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const w=coupleWindowForDay(key,derived); if(w) windows.push({key,...w,h:(w.end-w.start)/3600000});}
  const recs=derived.filter(e=>e.kind==='recovery' && dayKey(e.start).startsWith(state.month));
  const duties=derived.filter(e=>e.kind==='duty' && dayKey(e.start).startsWith(state.month));
  const sleepConflicts=derived.filter(e=>e.kind==='sleep'&&dayKey(e.start).startsWith(state.month));
  const togetherH=windows.reduce((s,w)=>s+w.h,0);
  $('stats').innerHTML=[['✈️ Duties',duties.length],['🟡/🔴 Recovery',recs.length],['❤️ Ventanas ≥2 h',windows.length],['🕒 Tiempo potencial',`${togetherH.toFixed(0)} h`]].map(([a,b])=>`<div class="stat"><span class="muted">${a}</span><b>${b}</b></div>`).join('');
  windows.sort((a,b)=>b.h-a.h); $('bestWindows').innerHTML=windows.slice(0,8).map(w=>`<div class="summary-row"><span>${fmt(utcForLocalDayTime(w.key,'12:00'),{weekday:'short',day:'numeric',month:'short'})}</span><b>${timeLocal(w.start)}–${timeLocal(w.end)} · ${w.h.toFixed(1)} h</b></div>`).join('') || '<div class="muted">Importa ambos rosters para calcularlo.</div>';
  const issues=[];
  for(const e of recs){issues.push({date:dayKey(e.start),txt:`${state.people[e.person].name}: ${e.level==='full'?'recovery completo':'recovery parcial'}`});}
  sleepConflicts.forEach(e=>{
    const key=dayKey(e.start); const dinner=utcForLocalDayTime(key,state.rules.dinnerTime); const flex=minMs(state.rules.mealFlex); if(dinner>=new Date(e.start.getTime()-flex)&&dinner<=new Date(e.end.getTime()+flex)) issues.push({date:key,txt:`${state.people[e.person].name}: la cena preferida cae cerca/dentro del sueño protegido`});
  });
  issues.sort((a,b)=>a.date.localeCompare(b.date)); $('coordination').innerHTML=issues.slice(0,12).map(i=>`<div class="summary-row"><span>${i.date.slice(8,10)}/${i.date.slice(5,7)}</span><b>${esc(i.txt)}</b></div>`).join('') || '<div class="muted">No hay conflictos destacados en este mes.</div>';
}

async function extractPdfText(file){
  if(!window.pdfjsLib) throw new Error('No se pudo cargar el lector PDF. Comprueba la conexión e inténtalo de nuevo.');
  const data=new Uint8Array(await file.arrayBuffer()); const pdf=await pdfjsLib.getDocument({data}).promise; let out='';
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p); const viewport=page.getViewport({scale:1}); const tc=await page.getTextContent();
    const items=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>{ const t=pdfjsLib.Util.transform(viewport.transform,i.transform); return {str:i.str.trim(),x:t[4],y:t[5]}; });
    const mid=viewport.width*0.52;
    const build=(xs)=>{ const rows=[]; xs.sort((a,b)=>a.y-b.y||a.x-b.x); for(const it of xs){ let row=rows.find(r=>Math.abs(r.y-it.y)<2.4); if(!row){row={y:it.y,items:[]};rows.push(row);} row.items.push(it); } rows.sort((a,b)=>a.y-b.y); return rows.map(r=>r.items.sort((a,b)=>a.x-b.x).map(x=>x.str).join(' ')).join('\n'); };
    out+='\n'+build(items.filter(i=>i.x<mid))+'\n'+build(items.filter(i=>i.x>=mid));
  }
  return out;
}

function mergeParsed(personIndex, parsed, source){
  const old=state.people[personIndex].duties||[]; const incoming=parsed.duties||[];
  const map=new Map(); [...old,...incoming].forEach(d=>{const k=d.kind==='duty'?`${d.kind}|${d.checkIn}|${d.checkout||''}|${d.route||''}`:`${d.kind}|${d.date}|${d.status}`; map.set(k,d);});
  state.people[personIndex].duties=[...map.values()].sort((a,b)=>(a.checkIn||a.date).localeCompare(b.checkIn||b.date)); state.people[personIndex].source=source;
  if(parsed.crew?.name && !state.people[personIndex].name) state.people[personIndex].name=parsed.crew.name;
  if(parsed.period){const s=parsed.period.start; state.month=`${s.getUTCFullYear()}-${String(s.getUTCMonth()+1).padStart(2,'0')}`;}
  saveState(); syncInputs(); renderCalendar();
  return incoming.filter(x=>x.kind==='duty').length;
}

async function handleFile(personIndex,file){
  const box=$(`status${personIndex}`); box.className='status'; box.textContent='Leyendo roster…';
  try{
    const text=file.name.toLowerCase().endsWith('.pdf')?await extractPdfText(file):await file.text();
    const parsed=RosterParser.parseCrewLinkText(text); const count=mergeParsed(personIndex,parsed,file.name);
    if(!count) throw new Error('No he encontrado ningún C/I/C/O reconocible. Prueba el fallback de texto o pásame este formato para añadirlo.');
    box.className='status ok'; box.textContent=`✓ ${count} duties importados · ${parsed.period?parsed.period.start.toISOString().slice(0,7):'periodo detectado'} · ${file.name}`;
  }catch(e){box.className='status err';box.textContent='⚠️ '+e.message;}
}

function syncInputs(){
  $('name0').value=state.people[0].name||''; $('name1').value=state.people[1].name||'';
  Object.keys(state.rules).forEach(k=>{if($(k))$(k).value=state.rules[k];});
}
function readRules(){
  ['homeTz','lunchTime','dinnerTime'].forEach(k=>state.rules[k]=$(k).value.trim());
  ['sleepHours','quietLead','commuteOut','commuteHome','longDuty','veryLongDuty','partialRecovery','fullRecovery','mealFlex'].forEach(k=>state.rules[k]=Number($(k).value));
  saveState(); renderCalendar();
}

function shiftMonth(delta){let [y,m]=state.month.split('-').map(Number);m+=delta;while(m<1){m+=12;y--}while(m>12){m-=12;y++}state.month=`${y}-${String(m).padStart(2,'0')}`;saveState();renderCalendar();}
function icsStamp(d){return new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function exportIcs(){
  const derived=allDerived().filter(e=>['sleep','recovery','quiet'].includes(e.kind)); const [y,m]=state.month.split('-').map(Number); const days=new Date(y,m,0).getDate();
  const couple=[]; for(let d=1;d<=days;d++){const key=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const w=coupleWindowForDay(key,allDerived());if(w)couple.push({kind:'couple',person:null,start:w.start,end:w.end,label:'❤️ Ventana juntos'});}
  const events=[...derived,...couple]; let ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//RosterHome//ES\r\nCALSCALE:GREGORIAN\r\n';
  events.forEach((e,i)=>{const p=e.person==null?'':` · ${state.people[e.person].name}`;ics+=`BEGIN:VEVENT\r\nUID:${Date.now()}-${i}@rosterhome\r\nDTSTAMP:${icsStamp(new Date())}\r\nDTSTART:${icsStamp(e.start)}\r\nDTEND:${icsStamp(e.end)}\r\nSUMMARY:${icsEscape(e.label+p)}\r\nEND:VEVENT\r\n`;}); ics+='END:VCALENDAR\r\n';
  const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`RosterHome-${state.month}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// UI wiring
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.view).classList.add('active'); if(b.dataset.view==='summaryView')renderSummary();}));
[0,1].forEach(i=>{$(`file${i}`).addEventListener('change',e=>e.target.files[0]&&handleFile(i,e.target.files[0]));$(`name${i}`).addEventListener('change',e=>{state.people[i].name=e.target.value.trim()||`Perfil ${i+1}`;saveState();renderCalendar();});});
document.querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.clear);state.people[i].duties=[];state.people[i].source=null;saveState();$(`status${i}`).textContent='Roster borrado.';renderCalendar();}));
$('importText').addEventListener('click',()=>{try{const i=Number($('pastePerson').value),parsed=RosterParser.parseCrewLinkText($('pasteText').value);const n=mergeParsed(i,parsed,'texto pegado');if(!n)throw new Error('No se han detectado duties.');$('pasteText').value='';alert(`${n} duties importados.`);}catch(e){alert(e.message);}});
$('saveRules').addEventListener('click',()=>{try{new Intl.DateTimeFormat('es',{timeZone:$('homeTz').value}).format();readRules();alert('Reglas guardadas.');}catch(e){alert('Zona horaria no válida. Usa, por ejemplo, Europe/Athens o Europe/Madrid.');}});
$('prevMonth').addEventListener('click',()=>shiftMonth(-1));$('nextMonth').addEventListener('click',()=>shiftMonth(1));$('exportIcs').addEventListener('click',exportIcs);

syncInputs(); renderCalendar();
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});

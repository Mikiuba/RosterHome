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
  month:new Date().toISOString().slice(0,7),
  calendarMode:'month',
  focusDate:new Date().toISOString().slice(0,10)
};

let state = loadState();
let renderedEvents = new Map();
let eventCounter = 0;

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem('rosterhome-state')||'{}');
    const base=clone(DEFAULT_STATE);
    const people=[0,1].map(i=>({...base.people[i], ...(saved.people?.[i]||{})}));
    const rules={...base.rules, ...(saved.rules||{})};
    const month=saved.month || base.month;
    return {
      ...base,
      ...saved,
      people,
      rules,
      month,
      calendarMode:['month','week','day'].includes(saved.calendarMode)?saved.calendarMode:'month',
      focusDate:saved.focusDate || `${month}-01`
    };
  }catch(e){ return clone(DEFAULT_STATE); }
}
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
function localDateTime(date){ return fmt(date,{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}); }
function utcDateTime(date){ return new Intl.DateTimeFormat('es-ES',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(date))+' UTC'; }

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

function addDaysKey(key,days){
  const [y,m,d]=key.split('-').map(Number); const x=new Date(Date.UTC(y,m-1,d+days));
  return x.toISOString().slice(0,10);
}
function mondayKey(key){
  const [y,m,d]=key.split('-').map(Number); const x=new Date(Date.UTC(y,m-1,d));
  const delta=(x.getUTCDay()+6)%7; return addDaysKey(key,-delta);
}
function localDayLabel(key, opts={weekday:'long',day:'numeric',month:'long'}){
  return fmt(utcForLocalDayTime(key,'12:00'),opts);
}
function shortWeekTitle(startKey){
  const endKey=addDaysKey(startKey,6);
  const a=localDayLabel(startKey,{day:'numeric',month:'short'});
  const b=localDayLabel(endKey,{day:'numeric',month:'short',year:'numeric'});
  return `${a} – ${b}`;
}

function dutyLabel(d){
  if(d.kind==='status') return d.status;
  const route=d.route || d.base || 'Duty'; return `${route} · ${timeLocal(d.checkIn)}–${d.checkout?timeLocal(d.checkout):'?'}`;
}

function recoveryForDuty(d){
  if(d.kind!=='duty' || !d.checkout) return null;
  let score=0; const reasons=[]; const hrs=Number(d.dutyHours||0), type=String(d.type||'').toUpperCase();
  if(hrs>=state.rules.veryLongDuty){ score+=2; reasons.push(`duty muy largo (${hrs.toFixed(1)} h)`); }
  else if(hrs>=state.rules.longDuty){ score+=1; reasons.push(`duty largo (${hrs.toFixed(1)} h)`); }
  if(type.includes('NIGHT')){ score+=2; reasons.push('duty NIGHT'); }
  else if(type.includes('EARLY')){ score+=1; reasons.push('duty EARLY'); }
  else if(type.includes('LATE')){ score+=1; reasons.push('duty LATE'); }
  const coH=hourLocal(d.checkout), ciH=hourLocal(d.checkIn);
  if(coH>=0 && coH<5){ score+=2; reasons.push('C/O entre 00:00 y 05:00 local'); }
  if(ciH>=0 && ciH<5){ score+=1; reasons.push('C/I entre 00:00 y 05:00 local'); }
  if(score===0) return null;
  const full=score>=3;
  const start=new Date(new Date(d.checkout).getTime()+minMs(state.rules.commuteHome));
  const dur=full?state.rules.fullRecovery:state.rules.partialRecovery;
  return {start,end:new Date(start.getTime()+ms(dur)),level:full?'full':'partial',score,reasons};
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
      const s=sleepForDuty(d);
      if(s){
        events.push({kind:'sleep',person:pi,start:s.start,end:s.end,label:`Sueño ${state.rules.sleepHours} h`,raw:d});
        if(state.rules.quietLead>0) events.push({kind:'quiet',person:pi,start:s.quietStart,end:s.start,label:'Quiet hours',raw:d});
      }
      const r=recoveryForDuty(d);
      if(r) events.push({kind:'recovery',person:pi,start:r.start,end:r.end,label:r.level==='full'?'Recovery completo':'Recovery parcial',level:r.level,reasons:r.reasons,score:r.score,raw:d});
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

function eventOverlapsDay(e,key){
  if(!e.start || !e.end) return false;
  const start=utcForLocalDayTime(key,'00:00');
  const end=utcForLocalDayTime(addDaysKey(key,1),'00:00');
  return e.start<end && e.end>start;
}
function eventsForDay(key, derived, includeQuiet=true){
  const out=[];
  state.people.forEach((p,pi)=>p.duties.filter(x=>x.kind==='status'&&x.date===key).forEach(x=>out.push({kind:'status',person:pi,label:x.status,raw:x,date:key})));
  derived.filter(e=>eventOverlapsDay(e,key) && (includeQuiet || e.kind!=='quiet')).forEach(e=>out.push(e));
  const cw=coupleWindowForDay(key,derived);
  if(cw) out.push({kind:'couple',person:null,start:cw.start,end:cw.end,label:'Ventana juntos',date:key});
  const order={status:0,quiet:1,sleep:2,duty:3,recovery:4,couple:5};
  out.sort((a,b)=>{
    const ta=a.start?+new Date(a.start):-Infinity, tb=b.start?+new Date(b.start):-Infinity;
    if(ta!==tb) return ta-tb; return (order[a.kind]??9)-(order[b.kind]??9);
  });
  return out;
}

function registerEvent(e){ const id=`ev-${++eventCounter}`; renderedEvents.set(id,e); return id; }
function eventClass(e){
  if(e.kind==='duty'||e.kind==='status') return e.person===1?'p2':'';
  if(e.kind==='sleep') return 'sleep';
  if(e.kind==='quiet') return 'quiet';
  if(e.kind==='recovery') return `recovery ${e.level==='full'?'full':''}`;
  if(e.kind==='couple') return 'couple';
  return '';
}
function eventText(e){
  if(e.kind==='status') return `${state.people[e.person].name} · ${e.label}`;
  if(e.kind==='duty') return `${state.people[e.person].name} · ${e.label}`;
  if(e.kind==='sleep') return `🌙 ${state.people[e.person].name} ${timeLocal(e.start)}–${timeLocal(e.end)}`;
  if(e.kind==='quiet') return `🔇 ${state.people[e.person].name} · ${timeLocal(e.start)}–${timeLocal(e.end)}`;
  if(e.kind==='recovery') return `${e.level==='full'?'🔴':'🟡'} ${state.people[e.person].name} recovery · ${timeLocal(e.start)}–${timeLocal(e.end)}`;
  if(e.kind==='couple') return `❤️ ${timeLocal(e.start)}–${timeLocal(e.end)}`;
  return e.label||'Evento';
}
function renderEventButton(e,extraClass=''){
  const id=registerEvent(e);
  return `<button type="button" class="event ${eventClass(e)} ${extraClass}" data-event-id="${id}" aria-label="Ver detalle de ${esc(eventText(e))}">${esc(eventText(e))}</button>`;
}

function syncCalendarModeButtons(){
  document.querySelectorAll('[data-calendar-mode]').forEach(b=>b.classList.toggle('active',b.dataset.calendarMode===state.calendarMode));
}
function renderCalendar(){
  renderedEvents=new Map(); eventCounter=0;
  $('legendP1').textContent=state.people[0].name||'Perfil 1'; $('legendP2').textContent=state.people[1].name||'Perfil 2';
  syncCalendarModeButtons();
  const derived=allDerived();
  if(state.calendarMode==='week') renderWeekCalendar(derived);
  else if(state.calendarMode==='day') renderDayCalendar(derived);
  else renderMonthCalendar(derived);
  renderSummary();
}

function renderMonthCalendar(derived){
  const [year,month]=state.month.split('-').map(Number); const first=new Date(year,month-1,1); const days=new Date(year,month,0).getDate(); const lead=(first.getDay()+6)%7;
  $('monthTitle').textContent=monthLabel(state.month);
  $('calendar').className='calendar month-view';
  const names=['L','M','X','J','V','S','D']; let html=names.map(x=>`<div class="dow">${x}</div>`).join('');
  for(let i=0;i<lead;i++) html+='<div class="day other"></div>';
  const todayKey=dayKey(new Date());
  for(let d=1;d<=days;d++){
    const key=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const ev=eventsForDay(key,derived,false);
    html+=`<div class="day ${key===todayKey?'today':''}"><button type="button" class="daynum daynum-btn" data-open-day="${key}" aria-label="Abrir ${esc(localDayLabel(key))}">${d}</button>`;
    const max=6;
    ev.slice(0,max).forEach(e=>{ html+=renderEventButton(e); });
    if(ev.length>max) html+=`<button type="button" class="more-events" data-open-day="${key}">+${ev.length-max} más</button>`;
    html+='</div>';
  }
  $('calendar').innerHTML=html;
}

function renderWeekCalendar(derived){
  const start=mondayKey(state.focusDate), todayKey=dayKey(new Date());
  $('monthTitle').textContent=shortWeekTitle(start);
  $('calendar').className='calendar week-view';
  let html='<div class="week-grid">';
  for(let i=0;i<7;i++){
    const key=addDaysKey(start,i); const ev=eventsForDay(key,derived,true);
    const weekday=localDayLabel(key,{weekday:'short'}); const date=localDayLabel(key,{day:'numeric',month:'short'});
    html+=`<section class="week-day ${key===todayKey?'today':''}"><button type="button" class="week-day-head" data-open-day="${key}"><span>${esc(weekday)}</span><b>${esc(date)}</b></button><div class="week-events">`;
    html+=ev.length?ev.map(e=>renderEventButton(e,'week-event')).join(''):'<div class="empty-day">Sin eventos</div>';
    html+='</div></section>';
  }
  html+='</div>';
  $('calendar').innerHTML=html;
}

function renderDayCalendar(derived){
  const key=state.focusDate; const ev=eventsForDay(key,derived,true); const todayKey=dayKey(new Date());
  $('monthTitle').textContent=localDayLabel(key,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  $('calendar').className='calendar day-view';
  let html=`<div class="day-agenda ${key===todayKey?'today':''}"><div class="day-agenda-head"><span>${ev.length} ${ev.length===1?'evento':'eventos'}</span><b>${esc(state.rules.homeTz)}</b></div>`;
  if(!ev.length) html+='<div class="empty-agenda"><strong>Día despejado</strong><span>No hay duties, sueño, recovery ni ventanas calculadas para este día.</span></div>';
  else {
    html+='<div class="agenda-list">';
    ev.forEach(e=>{
      const id=registerEvent(e); const timed=e.start&&e.end;
      const when=e.kind==='status'?'Todo el día':timed?`${timeLocal(e.start)}–${timeLocal(e.end)}`:'';
      html+=`<button type="button" class="agenda-item ${eventClass(e)}" data-event-id="${id}"><span class="agenda-time">${esc(when)}</span><span class="agenda-main"><b>${esc(eventTitle(e))}</b><small>${esc(eventSubtitle(e))}</small></span><span class="agenda-chevron">›</span></button>`;
    });
    html+='</div>';
  }
  html+='</div>';
  $('calendar').innerHTML=html;
}

function eventTitle(e){
  if(e.kind==='duty') return `${state.people[e.person].name} · ${e.raw?.route||e.raw?.base||'Duty'}`;
  if(e.kind==='status') return `${state.people[e.person].name} · ${e.label}`;
  if(e.kind==='sleep') return `🌙 Sueño protegido · ${state.people[e.person].name}`;
  if(e.kind==='quiet') return `🔇 Quiet hours · ${state.people[e.person].name}`;
  if(e.kind==='recovery') return `${e.level==='full'?'🔴':'🟡'} ${e.label} · ${state.people[e.person].name}`;
  if(e.kind==='couple') return '❤️ Ventana juntos';
  return e.label||'Evento';
}
function eventSubtitle(e){
  if(e.kind==='duty'){
    const raw=e.raw||{}; const bits=[]; if(raw.type&&raw.type!=='N/A')bits.push(raw.type); if(raw.dt)bits.push(`DT ${raw.dt}`); if(raw.ft)bits.push(`FT ${raw.ft}`); return bits.join(' · ')||'Duty CrewLink';
  }
  if(e.kind==='status') return 'Estado del roster';
  if(e.kind==='sleep') return `${state.rules.sleepHours} h antes del report`;
  if(e.kind==='quiet') return `${state.rules.quietLead} min antes del sueño protegido`;
  if(e.kind==='recovery') return e.reasons?.length?e.reasons.join(' · '):'Recovery calculado por las reglas de casa';
  if(e.kind==='couple') return `${((e.end-e.start)/3600000).toFixed(1)} h potenciales juntos`;
  return '';
}

function detailRow(label,value){ return `<div class="detail-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`; }
function openEventDetails(id){
  const e=renderedEvents.get(id); if(!e)return;
  $('eventModalKicker').textContent=eventKicker(e);
  $('eventModalTitle').textContent=eventTitle(e);
  $('eventModalBody').innerHTML=eventDetailHtml(e);
  $('eventModal').classList.remove('hidden'); $('eventModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
}
function closeEventDetails(){ $('eventModal').classList.add('hidden'); $('eventModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
function eventKicker(e){
  return ({duty:'Duty',status:'Roster',sleep:'Descanso',quiet:'Convivencia',recovery:'Recovery',couple:'Tiempo juntos'})[e.kind]||'Detalle';
}
function eventDetailHtml(e){
  if(e.kind==='duty'){
    const d=e.raw||{}; const dur=d.dt || (e.end&&e.start?`${((e.end-e.start)/3600000).toFixed(1)} h`:'—');
    let html='<div class="detail-section"><h3>Resumen</h3>';
    html+=detailRow('Persona',state.people[e.person].name);
    html+=detailRow('Ruta',d.route||d.base||'Duty');
    html+=detailRow('Tipo',d.type||'N/A');
    html+=detailRow('C/I · hora de casa',localDateTime(e.start));
    html+=detailRow('C/O · hora de casa',d.checkout?localDateTime(e.end):'Sin C/O detectado');
    html+=detailRow('C/I · roster',utcDateTime(e.start));
    html+=detailRow('C/O · roster',d.checkout?utcDateTime(e.end):'Sin C/O detectado');
    html+=detailRow('Duty time',dur);
    if(d.fdp)html+=detailRow('FDP',d.fdp);
    if(d.ft)html+=detailRow('Flight time',d.ft);
    html+='</div>';
    if(d.flights?.length){
      html+='<div class="detail-section"><h3>Sectores</h3><div class="sector-list">';
      d.flights.forEach(f=>{html+=`<div class="sector"><b>${esc(`${f.carrier} ${f.number}`)}</b><span>${esc(`${f.dep} ${f.depTime.slice(0,2)}:${f.depTime.slice(2)} → ${f.arr} ${f.arrTime.slice(0,2)}:${f.arrTime.slice(2)} UTC`)}</span><small>${esc(f.aircraft||'')}</small></div>`;});
      html+='</div></div>';
    }
    return html;
  }
  if(e.kind==='status'){
    return `<div class="detail-section"><h3>Resumen</h3>${detailRow('Persona',state.people[e.person].name)}${detailRow('Estado',e.label)}${detailRow('Fecha',localDayLabel(e.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}<p class="detail-note">Este código procede directamente del roster importado.</p></div>`;
  }
  if(e.kind==='sleep'){
    const report=e.raw?.checkIn?localDateTime(e.raw.checkIn):'—';
    return `<div class="detail-section"><h3>Qué indica</h3><p class="detail-explainer">Bloque de sueño protegido calculado hacia atrás desde el report para asegurar el objetivo de descanso configurado.</p>${detailRow('Persona',state.people[e.person].name)}${detailRow('Desde',localDateTime(e.start))}${detailRow('Hasta',localDateTime(e.end))}${detailRow('Objetivo',`${state.rules.sleepHours} h`)}${detailRow('Report relacionado',report)}${detailRow('Ruta relacionada',e.raw?.route||'Duty')}</div>`;
  }
  if(e.kind==='quiet'){
    return `<div class="detail-section"><h3>Qué indica</h3><p class="detail-explainer">Periodo previo al sueño protegido en el que conviene reducir ruido, llamadas, luces y actividad doméstica.</p>${detailRow('Persona',state.people[e.person].name)}${detailRow('Desde',localDateTime(e.start))}${detailRow('Hasta',localDateTime(e.end))}${detailRow('Duración',`${state.rules.quietLead} min`)}</div>`;
  }
  if(e.kind==='recovery'){
    let html=`<div class="detail-section"><h3>Qué indica</h3><p class="detail-explainer">${e.level==='full'?'Recovery completo':'Recovery parcial'} generado por vuestras reglas de convivencia después de este duty. No es un cálculo EASA FTL.</p>${detailRow('Persona',state.people[e.person].name)}${detailRow('Desde',localDateTime(e.start))}${detailRow('Hasta',localDateTime(e.end))}${detailRow('Duración',`${((e.end-e.start)/3600000).toFixed(1)} h`)}`;
    if(e.reasons?.length) html+=`<div class="reason-box"><b>Por qué se ha activado</b><ul>${e.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>`;
    html+='</div>'; return html;
  }
  if(e.kind==='couple'){
    return `<div class="detail-section"><h3>Qué indica</h3><p class="detail-explainer">Es la mejor ventana continua del día, entre 08:00 y 23:00, en la que ninguno está bloqueado por duty o sueño protegido.</p>${detailRow('Desde',localDateTime(e.start))}${detailRow('Hasta',localDateTime(e.end))}${detailRow('Tiempo potencial',`${((e.end-e.start)/3600000).toFixed(1)} h`)}</div>`;
  }
  return '<div class="muted">Sin más información para este evento.</div>';
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
  if(parsed.period){const s=parsed.period.start; state.month=`${s.getUTCFullYear()}-${String(s.getUTCMonth()+1).padStart(2,'0')}`; state.focusDate=parsed.period.start.toISOString().slice(0,10);}
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

function shiftPeriod(delta){
  if(state.calendarMode==='month'){
    let [y,m]=state.month.split('-').map(Number);m+=delta;while(m<1){m+=12;y--}while(m>12){m-=12;y++}
    state.month=`${y}-${String(m).padStart(2,'0')}`; state.focusDate=`${state.month}-01`;
  }else{
    state.focusDate=addDaysKey(state.focusDate,delta*(state.calendarMode==='week'?7:1)); state.month=state.focusDate.slice(0,7);
  }
  saveState(); renderCalendar();
}
function setCalendarMode(mode){
  if(!['month','week','day'].includes(mode))return;
  if(state.calendarMode==='month' && mode!=='month'){
    const today=dayKey(new Date()); state.focusDate=today.startsWith(state.month)?today:`${state.month}-01`;
  }
  state.calendarMode=mode; state.month=state.focusDate.slice(0,7); saveState(); renderCalendar();
}
function goToday(){ state.focusDate=dayKey(new Date()); state.month=state.focusDate.slice(0,7); saveState(); renderCalendar(); }
function openDay(key){ state.focusDate=key; state.month=key.slice(0,7); state.calendarMode='day'; saveState(); renderCalendar(); }

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
document.querySelectorAll('[data-calendar-mode]').forEach(b=>b.addEventListener('click',()=>setCalendarMode(b.dataset.calendarMode)));
[0,1].forEach(i=>{$(`file${i}`).addEventListener('change',e=>e.target.files[0]&&handleFile(i,e.target.files[0]));$(`name${i}`).addEventListener('change',e=>{state.people[i].name=e.target.value.trim()||`Perfil ${i+1}`;saveState();renderCalendar();});});
document.querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.clear);state.people[i].duties=[];state.people[i].source=null;saveState();$(`status${i}`).textContent='Roster borrado.';renderCalendar();}));
$('importText').addEventListener('click',()=>{try{const i=Number($('pastePerson').value),parsed=RosterParser.parseCrewLinkText($('pasteText').value);const n=mergeParsed(i,parsed,'texto pegado');if(!n)throw new Error('No se han detectado duties.');$('pasteText').value='';alert(`${n} duties importados.`);}catch(e){alert(e.message);}});
$('saveRules').addEventListener('click',()=>{try{new Intl.DateTimeFormat('es',{timeZone:$('homeTz').value}).format();readRules();alert('Reglas guardadas.');}catch(e){alert('Zona horaria no válida. Usa, por ejemplo, Europe/Athens o Europe/Madrid.');}});
$('prevMonth').addEventListener('click',()=>shiftPeriod(-1)); $('nextMonth').addEventListener('click',()=>shiftPeriod(1)); $('todayBtn').addEventListener('click',goToday); $('exportIcs').addEventListener('click',exportIcs);
$('calendar').addEventListener('click',e=>{const eventBtn=e.target.closest('[data-event-id]');if(eventBtn){openEventDetails(eventBtn.dataset.eventId);return;}const dayBtn=e.target.closest('[data-open-day]');if(dayBtn)openDay(dayBtn.dataset.openDay);});
document.querySelectorAll('[data-close-modal]').forEach(x=>x.addEventListener('click',closeEventDetails));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('eventModal').classList.contains('hidden'))closeEventDetails();});

syncInputs(); renderCalendar();
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});

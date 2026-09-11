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
  calendarDensity:'simple',
  focusDate:new Date().toISOString().slice(0,10)
};

let BOOT_LOCAL_RAW=null;
try{BOOT_LOCAL_RAW=localStorage.getItem('rosterhome-state');}catch(_){ }
const BOOT_HAD_LOCAL_STATE = !!BOOT_LOCAL_RAW;
const STATE_SCHEMA_VERSION = 6;
let durableStorageReady = false;
let state = loadState();
let renderedEvents = new Map();
let eventCounter = 0;
let calendarRenderFrame = 0;

function dutyIdentity(d){
  if(!d) return '';
  if(d.kind==='status') return `status|${d.date||''}|${d.status||''}`;
  // Same report time + same route/base is the same roster duty even if a later
  // import changes C/O or metadata. Keep the latest/richest copy.
  return `duty|${d.checkIn||''}|${d.route||d.base||''}`;
}
function dutyRichness(d){
  if(!d) return 0;
  return [d.checkout,d.route,d.type,d.dt,d.fdp,d.ft].filter(Boolean).length + ((d.flights||[]).length*2);
}
function dedupeDuties(list){
  const map=new Map();
  for(const d of (list||[])){
    const k=dutyIdentity(d); if(!k) continue;
    const prev=map.get(k);
    if(!prev || dutyRichness(d)>=dutyRichness(prev)) map.set(k,d);
  }
  return [...map.values()].sort((a,b)=>(a.checkIn||a.date||'').localeCompare(b.checkIn||b.date||''));
}

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function normalizeState(saved={}){
  const base=clone(DEFAULT_STATE);
  const people=[0,1].map(i=>{
    const person={...base.people[i], ...(saved.people?.[i]||{})};
    person.duties=dedupeDuties(person.duties||[]);
    return person;
  });
  const rules={...base.rules, ...(saved.rules||{})};
  const month=saved.month || base.month;
  return {
    ...base,
    ...saved,
    schemaVersion:STATE_SCHEMA_VERSION,
    people,
    rules,
    month,
    calendarMode:['month','week','day'].includes(saved.calendarMode)?saved.calendarMode:'month',
    calendarDensity:['simple','full'].includes(saved.calendarDensity)?saved.calendarDensity:'simple',
    focusDate:saved.focusDate || `${month}-01`
  };
}
function loadState(){
  try{return normalizeState(JSON.parse(localStorage.getItem('rosterhome-state')||'{}'));}
  catch(e){ return normalizeState({}); }
}
function saveState(options={}){
  state.schemaVersion=STATE_SCHEMA_VERSION;
  if(durableStorageReady && !options.preserveTimestamp) state.lastSavedAt=new Date().toISOString();
  try{localStorage.setItem('rosterhome-state', JSON.stringify(state));}catch(err){console.warn('[RosterHome] localStorage no disponible',err);}
  if(durableStorageReady && window.RosterStorage) window.RosterStorage.saveState(state,{immediate:!!options.immediate});
}
async function initializeDurableStorage(){
  if(!window.RosterStorage){
    window.dispatchEvent(new CustomEvent('rh-storage-ready',{detail:{restored:false,fallback:true}}));
    return {restored:false,fallback:true};
  }
  let dbState=null;
  try{dbState=await window.RosterStorage.loadState();}catch(_){ }
  let restored=false;
  if(dbState){
    const localTs=state.lastSavedAt?Date.parse(state.lastSavedAt):0;
    const dbTs=dbState.lastSavedAt?Date.parse(dbState.lastSavedAt):0;
    // If Safari cleared localStorage, IndexedDB is authoritative. If both exist,
    // prefer the newest durable snapshot rather than silently replacing newer edits.
    if(!BOOT_HAD_LOCAL_STATE || (dbTs && dbTs>localTs)){
      state=normalizeState(dbState);
      restored=true;
    }
  }
  durableStorageReady=true;
  state.storageMigratedAt=state.storageMigratedAt||new Date().toISOString();
  saveState({immediate:true});
  // Persistence is an enhancement, never a prerequisite for using the app.
  try{await Promise.race([window.RosterStorage.requestPersistence(),new Promise(r=>setTimeout(()=>r(null),1800))]);}catch(_){ }
  if(restored){
    try{syncInputs();}catch(_){ }
    try{renderCalendar();}catch(_){ }
    try{if(document.getElementById('summaryView')?.classList.contains('active'))renderSummary();}catch(_){ }
    window.dispatchEvent(new CustomEvent('rh-storage-restored'));
  }
  window.dispatchEvent(new CustomEvent('rh-storage-ready',{detail:{restored}}));
  return {restored};
}
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function ms(h){ return h*3600000; }
function minMs(m){ return m*60000; }

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const formatterCache=new Map();
function cachedFormatter(locale,opts){
  const key=locale+'|'+JSON.stringify(opts);
  let f=formatterCache.get(key); if(!f){f=new Intl.DateTimeFormat(locale,opts);formatterCache.set(key,f);} return f;
}
function fmt(date, opts={}){
  return cachedFormatter('es-ES',{timeZone:state.rules.homeTz,...opts}).format(new Date(date));
}
function dayKey(date){
  const p=cachedFormatter('en-CA',{timeZone:state.rules.homeTz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(date));
  const o=Object.fromEntries(p.map(x=>[x.type,x.value])); return `${o.year}-${o.month}-${o.day}`;
}
function hourLocal(date){ return Number(cachedFormatter('en-GB',{timeZone:state.rules.homeTz,hour:'2-digit',hour12:false}).format(new Date(date))); }
function timeLocal(date){ return fmt(date,{hour:'2-digit',minute:'2-digit',hour12:false}); }
function monthLabel(ym){ const [y,m]=ym.split('-').map(Number); return cachedFormatter('es-ES',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)); }
function localDateTime(date){ return fmt(date,{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}); }
function utcDateTime(date){ return cachedFormatter('es-ES',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(date))+' UTC'; }
function hhmmDisplay(v){ const s=String(v||'').replace(/\D/g,'').slice(0,4).padStart(4,'0'); return `${s.slice(0,2)}:${s.slice(2,4)}`; }
function sourceDateDisplay(key){ if(!key)return '—'; const [y,m,d]=String(key).split('-'); return `${d}/${m}/${y}`; }
function sourceRosterTime(d,which){
  const isIn=which==='in';
  const date=isIn?d.sourceCheckInDate:d.sourceCheckOutDate;
  const time=isIn?d.sourceCheckInTime:d.sourceCheckOutTime;
  const airport=isIn?d.sourceCheckInAirport:d.sourceCheckOutAirport;
  if(!time){ const instant=isIn?d.checkIn:d.checkout; return instant?utcDateTime(instant):'—'; }
  if(d.timeBasis==='local_event') return `${sourceDateDisplay(date)} ${hhmmDisplay(time)} ${airport||''} · hora local del aeropuerto`;
  return `${sourceDateDisplay(date)} ${hhmmDisplay(time)} UTC`;
}

function tzOffsetMillis(date, timeZone){
  const parts = cachedFormatter('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
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
  state.people.forEach((p,pi)=>dedupeDuties(p.duties).forEach(d=>{
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
  // Safety invariant: never present a sleep block as normal if it truly overlaps
  // one of that person's duties. This should not happen in a coherent roster; if it
  // does, make the conflict explicit instead of implying the person can sleep at work.
  const dutyEvents=events.filter(x=>x.kind==='duty');
  for(const sleep of events.filter(x=>x.kind==='sleep')){
    const conflicts=dutyEvents.filter(d=>d.person===sleep.person && new Date(d.start)<new Date(sleep.end) && new Date(d.end)>new Date(sleep.start));
    if(conflicts.length){ sleep.sleepConflict=true; sleep.conflictDuties=conflicts.map(x=>x.raw?.route||x.label||'Duty'); }
  }

  // Final rendering guard: identical derived blocks should never appear twice,
  // even if old localStorage data contained duplicates from an earlier parser.
  const seen=new Map();
  for(const e of events){
    const k=[e.kind,e.person,e.start?.toISOString?.()||'',e.end?.toISOString?.()||'',e.raw?.route||'',e.label||''].join('|');
    seen.set(k,e);
  }
  return [...seen.values()];
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
  if(e.kind==='sleep') return e.sleepConflict?'sleep conflict':'sleep';
  if(e.kind==='quiet') return 'quiet';
  if(e.kind==='recovery') return `recovery ${e.level==='full'?'full':''}`;
  if(e.kind==='couple') return 'couple';
  return '';
}
function personLaneClass(e){
  return e.person===0?'owner-p0':e.person===1?'owner-p1':'owner-shared';
}
function eventTimeRange(e){
  if(e.kind==='status') return 'Todo el día';
  if(e.start&&e.end) return `${timeLocal(e.start)}–${timeLocal(e.end)}`;
  return '';
}
function eventBlockTitle(e, compact=false){
  const person=e.person==null?'':state.people[e.person].name;
  const initial=person ? person.trim().charAt(0).toUpperCase() : '';
  if(compact){
    if(e.kind==='duty') return e.raw?.route||e.raw?.base||'Duty';
    if(e.kind==='status') return e.label;
    if(e.kind==='sleep') return `🌙 ${initial}`;
    if(e.kind==='quiet') return `🔕 ${initial}`;
    if(e.kind==='recovery') return `${e.level==='full'?'🔴':'🟡'} Rec · ${initial}`;
    if(e.kind==='couple') return '❤️ Juntos';
  }
  if(e.kind==='duty') return `${person} · ${e.raw?.route||e.raw?.base||'Duty'}`;
  if(e.kind==='status') return `${person} · ${e.label}`;
  if(e.kind==='sleep') return e.sleepConflict?`⚠️ Sueño en conflicto · ${person}`:`🌙 Sueño · ${person}`;
  if(e.kind==='quiet') return `🔕 Quiet · ${person}`;
  if(e.kind==='recovery') return `${e.level==='full'?'🔴':'🟡'} Recovery · ${person}`;
  if(e.kind==='couple') return '❤️ Tiempo juntos';
  return e.label||'Evento';
}
function eventBlockMeta(e){
  const when=eventTimeRange(e);
  if(e.kind==='duty'){
    const raw=e.raw||{}; const bits=[when];
    if(raw.type&&raw.type!=='N/A') bits.push(raw.type);
    if(state.calendarDensity==='full' && raw.dt) bits.push(`DT ${raw.dt}`);
    return bits.filter(Boolean).join(' · ');
  }
  if(e.kind==='recovery') return `${when}${e.level==='full'?' · completo':' · parcial'}`;
  if(e.kind==='couple') return `${when} · ${((e.end-e.start)/3600000).toFixed(1)} h`;
  return when;
}
function eventText(e){
  const meta=eventBlockMeta(e);
  return `${eventBlockTitle(e)}${meta?' · '+meta:''}`;
}
function renderEventButton(e,extraClass='',context='month'){
  const id=registerEvent(e);
  return `<button type="button" class="event calendar-block ${eventClass(e)} ${personLaneClass(e)} ${extraClass}" data-event-id="${id}" aria-label="Ver detalle de ${esc(eventText(e))}"><span class="event-block-title">${esc(eventBlockTitle(e,context==='month'))}</span><span class="event-block-meta">${esc(eventBlockMeta(e))}</span></button>`;
}

function syncCalendarModeButtons(){
  document.querySelectorAll('[data-calendar-mode]').forEach(b=>b.classList.toggle('active',b.dataset.calendarMode===state.calendarMode));
}
function syncCalendarDensityButtons(){
  document.querySelectorAll('[data-calendar-density]').forEach(b=>b.classList.toggle('active',b.dataset.calendarDensity===state.calendarDensity));
  const hint=$('clarityHint');
  if(hint) hint.textContent=state.calendarDensity==='simple'?'Solo lo importante para planificar el día':'Muestra también Quiet hours y ventanas juntos';
}
function calendarVisibleEvents(events, mode){
  if(state.calendarDensity==='full') return events;
  const allowed=mode==='month' ? new Set(['status','duty','recovery']) : new Set(['status','duty','sleep','recovery']);
  return events.filter(e=>allowed.has(e.kind));
}
function simpleDayInsight(key,derived){
  if(state.calendarDensity!=='simple') return '';
  const sleeps=derived.filter(e=>e.kind==='sleep'&&eventOverlapsDay(e,key));
  const cw=coupleWindowForDay(key,derived);
  const bits=[];
  if(sleeps.length) bits.push(`<span class="insight-pill sleep-insight">🌙 ${sleeps.length>1?sleeps.length+' sueños':'sueño'}</span>`);
  if(cw) bits.push(`<span class="insight-pill couple-insight">❤️ ${timeLocal(cw.start)}–${timeLocal(cw.end)}</span>`);
  return bits.length?`<div class="simple-insights">${bits.join('')}</div>`:'';
}
function renderCalendar(){
  window.__rhRenderVersion=(window.__rhRenderVersion||0)+1;
  renderedEvents=new Map(); eventCounter=0;
  if($('legendP1')) $('legendP1').textContent=state.people[0].name||'Perfil 1'; if($('legendP2')) $('legendP2').textContent=state.people[1].name||'Perfil 2';
  if($('legendGuideP1')) $('legendGuideP1').textContent=state.people[0].name||'Perfil 1';
  if($('legendGuideP2')) $('legendGuideP2').textContent=state.people[1].name||'Perfil 2';
  syncCalendarModeButtons();
  syncCalendarDensityButtons();
  const derived=allDerived();
  if(state.calendarMode==='week') renderWeekCalendar(derived);
  else if(state.calendarMode==='day') renderDayCalendar(derived);
  else renderMonthCalendar(derived);
  const cal=$('calendar'); if(cal) cal.classList.remove('view-switching');
}

function queueCalendarRender(){
  // v0.3.2.2: never disable pointer interaction while changing view.
  // On iOS/PWA a delayed rAF could leave the calendar in a non-interactive
  // state if the app was backgrounded mid-frame. Rendering synchronously here
  // is cheap enough with the existing caches and is substantially more robust.
  try{ syncCalendarModeButtons(); }catch(_){ }
  try{ syncCalendarDensityButtons(); }catch(_){ }
  const cal=$('calendar'); if(cal) cal.classList.remove('view-switching');
  if(calendarRenderFrame){ try{cancelAnimationFrame(calendarRenderFrame);}catch(_){ } calendarRenderFrame=0; }
  try{ renderCalendar(); }
  catch(err){
    console.error('[RosterHome] Error renderizando calendario',err);
    if(cal) cal.classList.remove('view-switching');
  }
}

function renderMonthCalendar(derived){
  const [year,month]=state.month.split('-').map(Number); const first=new Date(year,month-1,1); const days=new Date(year,month,0).getDate(); const lead=(first.getDay()+6)%7;
  $('monthTitle').textContent=monthLabel(state.month);
  $('calendar').className='calendar month-view split-people';
  const names=['L','M','X','J','V','S','D']; let html=names.map(x=>`<div class="dow">${x}</div>`).join('');
  for(let i=0;i<lead;i++) html+='<div class="day other"></div>';
  const todayKey=dayKey(new Date());
  for(let d=1;d<=days;d++){
    const key=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const ev=calendarVisibleEvents(eventsForDay(key,derived,false),'month');
    const p0=ev.filter(e=>e.person===0), p1=ev.filter(e=>e.person===1), shared=ev.filter(e=>e.person==null);
    html+=`<div class="day ${key===todayKey?'today':''}"><button type="button" class="daynum daynum-btn" data-open-day="${key}" aria-label="Abrir ${esc(localDayLabel(key))}">${d}</button>`;
    html+='<div class="month-person-lanes">';
    for(const [pi,list] of [[0,p0],[1,p1]]){
      const max=4;
      html+=`<div class="month-person-lane person-${pi}" aria-label="${esc(state.people[pi].name)}">`;
      list.slice(0,max).forEach(e=>{ html+=renderEventButton(e,'month-person-event','month'); });
      if(list.length>max) html+=`<button type="button" class="more-events lane-more" data-open-day="${key}">+${list.length-max}</button>`;
      html+='</div>';
    }
    html+='</div>';
    if(shared.length) html+=`<div class="shared-events">${shared.map(e=>renderEventButton(e,'shared-event','month')).join('')}</div>`;
    html+=simpleDayInsight(key,derived);
    html+='</div>';
  }
  $('calendar').innerHTML=html;
}

function renderWeekCalendar(derived){
  const start=mondayKey(state.focusDate), todayKey=dayKey(new Date());
  $('monthTitle').textContent=shortWeekTitle(start);
  $('calendar').className='calendar week-view split-people';
  let html='<div class="week-grid">';
  for(let i=0;i<7;i++){
    const key=addDaysKey(start,i); const ev=calendarVisibleEvents(eventsForDay(key,derived,true),'week');
    const p0=ev.filter(e=>e.person===0), p1=ev.filter(e=>e.person===1), shared=ev.filter(e=>e.person==null);
    const weekday=localDayLabel(key,{weekday:'short'}); const date=localDayLabel(key,{day:'numeric',month:'short'});
    html+=`<section class="week-day ${key===todayKey?'today':''}"><button type="button" class="week-day-head" data-open-day="${key}"><span>${esc(weekday)}</span><b>${esc(date)}</b></button>`;
    html+=`<div class="week-person-head"><span>${esc(state.people[0].name)}</span><span>${esc(state.people[1].name)}</span></div>`;
    html+='<div class="week-events person-split">';
    for(const [pi,list] of [[0,p0],[1,p1]]){
      html+=`<div class="week-person-lane person-${pi}">`;
      html+=list.length?list.map(e=>renderEventButton(e,'week-event','week')).join(''):'<div class="empty-person-lane">—</div>';
      html+='</div>';
    }
    html+='</div>';
    if(shared.length) html+=`<div class="week-shared">${shared.map(e=>renderEventButton(e,'week-event shared-event','week')).join('')}</div>`;
    html+=simpleDayInsight(key,derived);
    html+='</section>';
  }
  html+='</div>';
  $('calendar').innerHTML=html;
}

function localMinuteOfDay(date){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:state.rules.homeTz,hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(date));
  const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return Number(o.hour)*60+Number(o.minute);
}
function timelineSegment(e,key){
  // Position events from their *actual overlap* with this local calendar day.
  // Using elapsed milliseconds instead of the formatted clock time avoids Safari/
  // timezone edge cases that could pin a late-night event at 00:00 and make it
  // look as if sleep and a duty were happening simultaneously.
  const dayStart=utcForLocalDayTime(key,'00:00');
  const dayEnd=utcForLocalDayTime(addDaysKey(key,1),'00:00');
  const eventStart=+new Date(e.start), eventEnd=+new Date(e.end);
  const startMs=Math.max(eventStart,+dayStart), endMs=Math.min(eventEnd,+dayEnd);
  if(endMs<=startMs) return null;
  const dayMs=+dayEnd-(+dayStart);
  const startMin=((startMs-(+dayStart))/dayMs)*1440;
  const endMin=((endMs-(+dayStart))/dayMs)*1440;
  return {
    e,
    start:new Date(startMs),
    end:new Date(endMs),
    startMin:Math.max(0,Math.min(1440,startMin)),
    endMin:Math.max(startMin+1,Math.min(1440,endMin)),
    startsBeforeDay:eventStart < +dayStart,
    endsAfterDay:eventEnd > +dayEnd,
    lane:0,laneCount:1
  };
}
function segmentTimeRange(seg){
  if(seg.startsBeforeDay && seg.endsAfterDay) return '00:00–24:00 · continúa';
  if(seg.startsBeforeDay) return `00:00–${timeLocal(seg.end)} · desde ayer`;
  if(seg.endsAfterDay) return `${timeLocal(seg.start)}–24:00 · sigue mañana`;
  return `${timeLocal(seg.start)}–${timeLocal(seg.end)}`;
}
function segmentBlockMeta(seg){
  const e=seg.e, when=segmentTimeRange(seg);
  if(e.kind==='duty'){
    const raw=e.raw||{}, bits=[when];
    if(raw.type&&raw.type!=='N/A') bits.push(raw.type);
    if(state.calendarDensity==='full'&&raw.dt) bits.push(`DT ${raw.dt}`);
    return bits.filter(Boolean).join(' · ');
  }
  if(e.kind==='recovery') return `${when}${e.level==='full'?' · completo':' · parcial'}`;
  return when;
}
function assignTimelineLanes(segments){
  const xs=[...segments].sort((a,b)=>a.startMin-b.startMin||a.endMin-b.endMin);
  let active=[], group=[], groupId=0;
  const groups=new Map();
  for(const seg of xs){
    active=active.filter(a=>a.endMin>seg.startMin);
    if(!active.length){ group=[]; groupId++; }
    const used=new Set(active.map(a=>a.lane)); let lane=0; while(used.has(lane)) lane++;
    seg.lane=lane; seg.groupId=groupId; active.push(seg); group.push(seg);
    groups.set(groupId,Math.max(groups.get(groupId)||1,lane+1));
  }
  xs.forEach(s=>s.laneCount=groups.get(s.groupId)||1);
  return xs;
}
function assignPersonTimelineLanes(segments){
  const result=[];
  for(const pi of [0,1]){
    const own=segments.filter(s=>s.e.person===pi);
    assignTimelineLanes(own);
    result.push(...own);
  }
  const shared=segments.filter(s=>s.e.person==null);
  assignTimelineLanes(shared);
  result.push(...shared);
  return result.sort((a,b)=>a.startMin-b.startMin||a.endMin-b.endMin);
}

function renderDayCalendar(derived){
  const key=state.focusDate; const ev=calendarVisibleEvents(eventsForDay(key,derived,true),'day'); const todayKey=dayKey(new Date());
  $('monthTitle').textContent=localDayLabel(key,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  $('calendar').className='calendar day-view split-people';
  const allDay=ev.filter(e=>e.kind==='status');
  const rawSegments=ev.filter(e=>e.kind!=='status'&&e.start&&e.end).map(e=>timelineSegment(e,key)).filter(Boolean);
  const segments=assignPersonTimelineLanes(rawSegments);
  const H=64, dayHeight=24*H;
  let html=`<div class="day-agenda ${key===todayKey?'today':''}"><div class="day-agenda-head"><span>${ev.length} ${ev.length===1?'evento':'eventos'}</span><b>${esc(state.rules.homeTz)}</b></div>`;
  if(state.calendarDensity==='simple'){
    const cw=coupleWindowForDay(key,derived);
    if(cw) html+=`<div class="day-opportunity"><span>❤️ Mejor ventana juntos</span><b>${timeLocal(cw.start)}–${timeLocal(cw.end)}</b></div>`;
  }
  html+=`<div class="day-person-head"><span>${esc(state.people[0].name)}</span><span>${esc(state.people[1].name)}</span></div>`;
  if(allDay.length){
    const a0=allDay.filter(e=>e.person===0), a1=allDay.filter(e=>e.person===1), ash=allDay.filter(e=>e.person==null);
    html+='<div class="all-day-row split-all-day"><span class="all-day-label">Todo el día</span><div class="all-day-people">';
    for(const [pi,list] of [[0,a0],[1,a1]]){
      html+=`<div class="all-day-person person-${pi}">${list.map(e=>renderEventButton(e,'all-day-event','day')).join('')||'<span class="empty-person-lane">—</span>'}</div>`;
    }
    html+='</div></div>';
    if(ash.length) html+=`<div class="all-day-shared">${ash.map(e=>renderEventButton(e,'all-day-event shared-event','day')).join('')}</div>`;
  }
  if(!segments.length && !allDay.length){
    html+='<div class="empty-agenda"><strong>Día despejado</strong><span>No hay duties, sueño, recovery ni ventanas calculadas para este día.</span></div>';
  }else if(segments.length){
    html+=`<div class="timeline-scroll"><div class="timeline-canvas split-timeline" style="height:${dayHeight}px">`;
    for(let h=0;h<24;h++){
      html+=`<div class="timeline-hour-label" style="top:${h*H-8}px">${String(h).padStart(2,'0')}:00</div><div class="timeline-hour-line" style="top:${h*H}px"></div>`;
    }
    html+='<div class="timeline-person-divider" aria-hidden="true"></div>';
    if(key===todayKey){
      const nowMin=localMinuteOfDay(new Date());
      html+=`<div class="timeline-now" style="top:${nowMin/60*H}px"><span></span></div>`;
    }
    for(const seg of segments){
      const e=seg.e, id=registerEvent(e), top=seg.startMin/60*H, rawHeight=(seg.endMin-seg.startMin)/60*H, height=Math.max(rawHeight,30);
      let leftPct,widthPct;
      if(e.person==null){
        leftPct=0; widthPct=100;
      }else{
        const sideBase=e.person===0?0:50;
        const subWidth=50/seg.laneCount;
        leftPct=sideBase+seg.lane*subWidth;
        widthPct=subWidth;
      }
      const compact=height<48?' compact':'';
      html+=`<button type="button" class="timeline-event ${eventClass(e)} ${personLaneClass(e)}${compact}" data-event-id="${id}" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 5px);width:calc(${widthPct}% - 9px)" aria-label="Ver detalle de ${esc(eventText(e))}"><span class="timeline-event-title">${esc(eventBlockTitle(e))}</span><span class="timeline-event-meta">${esc(segmentBlockMeta(seg))}</span>${height>=72?`<span class="timeline-event-sub">${esc(eventSubtitle(e))}</span>`:''}</button>`;
    }
    html+='</div></div>';
  }
  html+='</div>';
  $('calendar').innerHTML=html;
  const scroll=$('calendar').querySelector('.timeline-scroll');
  if(scroll&&segments.length){
    const first=Math.min(...segments.map(s=>s.startMin));
    requestAnimationFrame(()=>{ scroll.scrollTop=Math.max(0,(first/60)*H-H); });
  }
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
    const raw=e.raw||{}; const bits=[];
    if(raw.type&&raw.type!=='N/A') bits.push(raw.type);
    if(state.calendarDensity==='full'){ if(raw.dt)bits.push(`DT ${raw.dt}`); if(raw.ft)bits.push(`FT ${raw.ft}`); }
    return bits.join(' · ');
  }
  if(e.kind==='status') return 'Estado del roster';
  if(e.kind==='sleep') return e.sleepConflict?'Coincide realmente con un duty · revisar roster':`${state.rules.sleepHours} h antes del report`;
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
    const d=e.raw||{};
    const localRange=`${timeLocal(e.start)}–${d.checkout?timeLocal(e.end):'?'}`;
    let html='<div class="detail-section detail-summary"><h3>En pocas palabras</h3>';
    html+=detailRow('Persona',state.people[e.person].name);
    html+=detailRow('Ruta',d.route||d.base||'Duty');
    html+=detailRow('Horario en casa',localRange);
    if(d.type&&d.type!=='N/A') html+=detailRow('Tipo',d.type);
    if(d.ft) html+=detailRow('Tiempo de vuelo',d.ft);
    html+='</div>';
    if(d.flights?.length){
      html+='<div class="detail-section"><h3>Sectores</h3><div class="sector-list">';
      d.flights.forEach(f=>{
        const depOff=f.depDayOffset?`+${f.depDayOffset}`:''; const arrOff=f.arrDayOffset?`+${f.arrDayOffset}`:'';
        const basis=d.timeBasis==='local_event'?'hora local de cada aeropuerto':'UTC';
        html+=`<div class="sector"><b>${esc(`${f.dep} → ${f.arr}`)}</b><span>${esc(`${f.carrier} ${f.number} · ${hhmmDisplay(f.depTime)}${depOff}–${hhmmDisplay(f.arrTime)}${arrOff} · ${basis}`)}</span><small>${esc(f.aircraft||'')}</small></div>`;
      });
      html+='</div></div>';
    }
    html+='<details class="technical-details"><summary>Datos CrewLink / técnicos</summary><div class="technical-details-body">';
    html+=detailRow('C/I · hora de casa',localDateTime(e.start));
    html+=detailRow('C/O · hora de casa',d.checkout?localDateTime(e.end):'Sin C/O detectado');
    html+=detailRow('Base horaria del roster',d.timeBasis==='local_event'?'Horas locales en cada aeropuerto':'UTC');
    html+=detailRow('C/I · roster',sourceRosterTime(d,'in'));
    html+=detailRow('C/O · roster',d.checkout?sourceRosterTime(d,'out'):'Sin C/O detectado');
    if(d.dt) html+=detailRow('DT',d.dt);
    if(d.fdt) html+=detailRow('FDT',d.fdt);
    if(d.fdp) html+=detailRow('FDP',d.fdp);
    if(d.sdt) html+=detailRow('SDT',d.sdt);
    if(d.max) html+=detailRow('max',d.max);
    if(d.rt) html+=detailRow('RT',d.rt);
    if(d.brk) html+=detailRow('BRK',d.brk);
    html+='</div></details>';
    return html;
  }
  if(e.kind==='status'){
    return `<div class="detail-section"><h3>Resumen</h3>${detailRow('Persona',state.people[e.person].name)}${detailRow('Estado',e.label)}${detailRow('Fecha',localDayLabel(e.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}<p class="detail-note">Este código procede directamente del roster importado.</p></div>`;
  }
  if(e.kind==='sleep'){
    const report=e.raw?.checkIn?localDateTime(e.raw.checkIn):'—';
    const warning=e.sleepConflict?`<div class="warning-box"><b>⚠️ Conflicto real detectado</b><br>Este bloque de sueño se solapa temporalmente con ${esc((e.conflictDuties||[]).join(', ')||'un duty')}. RosterHome no lo considera una ventana de descanso válida; revisa la importación o las reglas.</div>`:'';
    return `${warning}<div class="detail-section"><h3>Qué indica</h3><p class="detail-explainer">Bloque de sueño protegido calculado hacia atrás desde el report para asegurar el objetivo de descanso configurado.</p>${detailRow('Persona',state.people[e.person].name)}${detailRow('Desde',localDateTime(e.start))}${detailRow('Hasta',localDateTime(e.end))}${detailRow('Objetivo',`${state.rules.sleepHours} h`)}${detailRow('Report relacionado',report)}${detailRow('Ruta relacionada',e.raw?.route||'Duty')}</div>`;
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


function renderFtl(){
  const all=state.people.flatMap(p=>p.duties||[]);
  const duties=all.filter(d=>d.kind==='duty');
  const withRoster=state.people.filter(p=>(p.duties||[]).length>0).length;
  if($('ftlDuties')) $('ftlDuties').textContent=String(duties.length);
  if($('ftlPeople')) $('ftlPeople').textContent=`${withRoster}/2`;
  if($('ftlPeriod')){
    const dates=duties.map(d=>String(d.date||d.checkIn||'').slice(0,10)).filter(Boolean).sort();
    $('ftlPeriod').textContent=dates.length?`${dates[0].slice(8,10)}/${dates[0].slice(5,7)} – ${dates.at(-1).slice(8,10)}/${dates.at(-1).slice(5,7)}`:'—';
  }
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
    const items=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>{ const t=pdfjsLib.Util.transform(viewport.transform,i.transform); const width=Number(i.width||0); return {str:i.str.trim(),x:t[4],cx:t[4]+width/2,y:t[5]}; });
    // CrewLink landscape pages contain two independent duty columns. Split exactly at
    // the page centre and assign by text-centre so date labels near the gutter do not
    // get detached from their C/I/C/O row.
    const mid=viewport.width*0.5;
    const build=(xs)=>{ const rows=[]; xs.sort((a,b)=>a.y-b.y||a.x-b.x); for(const it of xs){ let row=rows.find(r=>Math.abs(r.y-it.y)<2.4); if(!row){row={y:it.y,items:[]};rows.push(row);} row.items.push(it); } rows.sort((a,b)=>a.y-b.y); return rows.map(r=>r.items.sort((a,b)=>a.x-b.x).map(x=>x.str).join(' ')).join('\n'); };
    out+=`\n[[PAGE ${p} LEFT]]\n`+build(items.filter(i=>i.cx<mid))+`\n[[PAGE ${p} RIGHT]]\n`+build(items.filter(i=>i.cx>=mid));
  }
  return out;
}

function mergeParsed(personIndex, parsed, source){
  const old=dedupeDuties(state.people[personIndex].duties||[]);
  const incoming=dedupeDuties(parsed.duties||[]);

  // A roster import is authoritative for the period printed in that roster.
  // Older versions appended to localStorage, so stale/misparsed copies survived
  // every re-import and generated duplicated duty/sleep/recovery blocks.
  let preserved=old;
  if(parsed.period){
    const startKey=parsed.period.start.toISOString().slice(0,10);
    const endKey=parsed.period.end.toISOString().slice(0,10);
    preserved=old.filter(d=>{
      const key=d.kind==='duty' ? (d.date || String(d.checkIn||'').slice(0,10)) : d.date;
      return !key || key<startKey || key>endKey;
    });
  }

  state.people[personIndex].duties=dedupeDuties([...preserved,...incoming]);
  state.people[personIndex].source=source;
  if(parsed.crew?.name && !state.people[personIndex].name) state.people[personIndex].name=parsed.crew.name;
  if(parsed.period){const s=parsed.period.start; state.month=`${s.getUTCFullYear()}-${String(s.getUTCMonth()+1).padStart(2,'0')}`; state.focusDate=parsed.period.start.toISOString().slice(0,10);}
  saveState({immediate:true}); syncInputs(); renderCalendar();
  return incoming.filter(x=>x.kind==='duty').length;
}


function gapLabel(minutes){
  if(minutes==null || !Number.isFinite(minutes)) return '—';
  const m=Math.max(0,Math.round(minutes)); return `${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')} min`;
}
function renderImportAudit(personIndex, parsed){
  const el=$(`audit${personIndex}`); if(!el) return;
  const v=parsed?.validation; if(!v){el.innerHTML='';return;}
  const s=v.stats||{};
  const chips=[
    `${s.duties||0} duties detectados`,
    parsed.timeBasis==='local_event'?'horario CrewLink: local por aeropuerto':'horario CrewLink: UTC',
    `${s.overlaps||0} solapamientos`,
    `${s.brkMatches||0} continuidades BRK verificadas`,
    `${s.inferredDates||0} fechas reconstruidas`,
    `intervalo mínimo ${gapLabel(s.minGapMinutes)}`
  ];
  let html=`<div class="audit-title">${v.ok?'✓ Importación coherente':'⚠️ Importación detenida'}</div><div class="audit-chips">${chips.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`;
  if(v.errors?.length) html+=`<div class="audit-errors"><b>Errores:</b><ul>${v.errors.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
  if(v.warnings?.length) html+=`<details class="audit-warnings"><summary>${v.warnings.length} aviso${v.warnings.length===1?'':'s'} de coherencia</summary><ul>${v.warnings.slice(0,6).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`;
  el.className='import-audit '+(v.ok?'ok':'bad'); el.innerHTML=html;
}
function validateBeforeMerge(parsed){
  const n=(parsed?.duties||[]).filter(x=>x.kind==='duty').length;
  if(!n) throw new Error('No he encontrado ningún C/I/C/O reconocible. Prueba el fallback de texto o pásame este formato para añadirlo.');
  if(parsed.validation && !parsed.validation.ok){
    const first=parsed.validation.errors?.[0]||'La secuencia temporal no es coherente.';
    throw new Error(`No he guardado este roster porque el importador detectó una incoherencia: ${first}`);
  }
  return n;
}

async function handleFile(personIndex,file){
  const box=$(`status${personIndex}`); box.className='status'; box.textContent='Leyendo y validando roster…';
  const audit=$(`audit${personIndex}`); if(audit){audit.className='import-audit';audit.innerHTML='';}
  try{
    const text=file.name.toLowerCase().endsWith('.pdf')?await extractPdfText(file):await file.text();
    const parsed=RosterParser.parseCrewLinkText(text);
    renderImportAudit(personIndex,parsed);
    const detected=validateBeforeMerge(parsed);
    const count=mergeParsed(personIndex,parsed,file.name);
    box.className='status ok'; box.textContent=`✓ ${count} duties importados y validados · periodo reemplazado · ${parsed.period?parsed.period.start.toISOString().slice(0,7):'periodo detectado'} · ${file.name}`;
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
  if(!['month','week','day'].includes(mode) || state.calendarMode===mode)return;
  if(state.calendarMode==='month' && mode!=='month'){
    const today=dayKey(new Date()); state.focusDate=today.startsWith(state.month)?today:`${state.month}-01`;
  }
  state.calendarMode=mode; state.month=state.focusDate.slice(0,7); saveState(); queueCalendarRender();
}
function goToday(){ state.focusDate=dayKey(new Date()); state.month=state.focusDate.slice(0,7); saveState(); queueCalendarRender(); }
function openDay(key){ state.focusDate=key; state.month=key.slice(0,7); state.calendarMode='day'; saveState(); queueCalendarRender(); }

function icsStamp(d){return new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function exportIcs(){
  const derived=allDerived().filter(e=>['sleep','recovery','quiet'].includes(e.kind)); const [y,m]=state.month.split('-').map(Number); const days=new Date(y,m,0).getDate();
  const couple=[]; for(let d=1;d<=days;d++){const key=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const w=coupleWindowForDay(key,allDerived());if(w)couple.push({kind:'couple',person:null,start:w.start,end:w.end,label:'❤️ Ventana juntos'});}
  const events=[...derived,...couple]; let ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//RosterHome//ES\r\nCALSCALE:GREGORIAN\r\n';
  events.forEach((e,i)=>{const p=e.person==null?'':` · ${state.people[e.person].name}`;ics+=`BEGIN:VEVENT\r\nUID:${Date.now()}-${i}@rosterhome\r\nDTSTAMP:${icsStamp(new Date())}\r\nDTSTART:${icsStamp(e.start)}\r\nDTEND:${icsStamp(e.end)}\r\nSUMMARY:${icsEscape(e.label+p)}\r\nEND:VEVENT\r\n`;}); ics+='END:VCALENDAR\r\n';
  const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`RosterHome-${state.month}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// UI wiring — v0.4.0
function on(el,event,handler,options){
  if(el && typeof el.addEventListener==='function') el.addEventListener(event,handler,options);
}

document.querySelectorAll('.tab').forEach(b=>on(b,'click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const target=$(b.dataset.view); if(target) target.classList.add('active');
  if(b.dataset.view==='summaryView' && typeof renderSummary==='function') setTimeout(()=>{try{renderSummary();}catch(e){console.error(e)}},0);
  if(b.dataset.view==='ftlView' && typeof renderFtl==='function') setTimeout(()=>{try{renderFtl();}catch(e){console.error(e)}},0);
}));
document.querySelectorAll('[data-calendar-mode]').forEach(b=>on(b,'click',()=>{try{setCalendarMode(b.dataset.calendarMode);}catch(e){console.error(e)}}));
document.querySelectorAll('[data-calendar-density]').forEach(b=>on(b,'click',()=>{
  try{if(state.calendarDensity===b.dataset.calendarDensity)return;state.calendarDensity=b.dataset.calendarDensity;saveState();queueCalendarRender();}catch(e){console.error(e)}
}));
[0,1].forEach(i=>{
  on($(`file${i}`),'change',e=>e.target.files?.[0]&&handleFile(i,e.target.files[0]));
  on($(`name${i}`),'change',e=>{try{state.people[i].name=e.target.value.trim()||`Perfil ${i+1}`;saveState();renderCalendar();}catch(err){console.error(err)}});
});
document.querySelectorAll('[data-clear]').forEach(b=>on(b,'click',()=>{try{const i=Number(b.dataset.clear);state.people[i].duties=[];state.people[i].source=null;saveState();if($(`status${i}`))$(`status${i}`).textContent='Roster borrado.';if($(`audit${i}`))$(`audit${i}`).innerHTML='';renderCalendar();}catch(e){console.error(e)}}));
on($('importText'),'click',()=>{try{const i=Number($('pastePerson').value),parsed=RosterParser.parseCrewLinkText($('pasteText').value);renderImportAudit(i,parsed);validateBeforeMerge(parsed);const n=mergeParsed(i,parsed,'texto pegado');$('pasteText').value='';alert(`${n} duties importados y validados.`);}catch(e){alert(e.message);}});
on($('saveRules'),'click',()=>{try{new Intl.DateTimeFormat('es',{timeZone:$('homeTz').value}).format();readRules();alert('Reglas guardadas.');}catch(e){alert('Zona horaria no válida. Usa, por ejemplo, Europe/Athens o Europe/Madrid.');}});
on($('prevMonth'),'click',()=>{try{shiftPeriod(-1)}catch(e){console.error(e)}});
on($('nextMonth'),'click',()=>{try{shiftPeriod(1)}catch(e){console.error(e)}});
on($('todayBtn'),'click',()=>{try{goToday()}catch(e){console.error(e)}});
on($('exportIcs'),'click',()=>{try{exportIcs()}catch(e){console.error(e)}});
on($('calendar'),'click',e=>{try{const eventBtn=e.target.closest('[data-event-id]');if(eventBtn){openEventDetails(eventBtn.dataset.eventId);return;}const dayBtn=e.target.closest('[data-open-day]');if(dayBtn)openDay(dayBtn.dataset.openDay);}catch(err){console.error(err)}});
document.querySelectorAll('[data-close-modal]').forEach(x=>on(x,'click',closeEventDetails));
on(document,'keydown',e=>{if(e.key==='Escape'&&$('eventModal')&&!$('eventModal').classList.contains('hidden'))closeEventDetails();});

// Navigation is bound once above. Keep a single source of truth for taps.
try{syncInputs();}catch(err){console.error('[RosterHome] No se pudieron sincronizar inputs',err);}
try{renderCalendar();}catch(err){console.error('[RosterHome] Render inicial en fallback',err);}
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js?v=0.4.0').catch(()=>{});

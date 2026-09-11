/* RosterHome v0.3.2.1 · briefing/recovery + resilient persistence */
(function(){
  // New per-person planning defaults. Existing users keep their saved values.
  if(state.rules.briefingLead0 == null) state.rules.briefingLead0=105;
  if(state.rules.briefingLead1 == null) state.rules.briefingLead1=105;
  if(state.rules.prepMinutes0 == null) state.rules.prepMinutes0=20;
  if(state.rules.prepMinutes1 == null) state.rules.prepMinutes1=40;
  saveState();

  let selectedSummaryMetric='togetherDays';
  let derivedCacheSignature='';
  let derivedCacheValue=null;
  let summaryCacheSignature='';
  let summaryCacheValue=null;
  const dayStatusCache=new WeakMap();
  const mealCache=new WeakMap();
  const coupleWindowCache=new WeakMap();
  const eventsDayCache=new WeakMap();

  function derivedStateSignature(){
    const dutyBits=state.people.map(p=>(p.duties||[]).map(d=>[d.kind,d.date,d.checkIn,d.checkout,d.route,d.status,d.type,d.dt,d.ft,(d.flights||[]).map(f=>[f.flightNo,f.dep,f.arr,f.depTime,f.arrTime,f.depDayOffset,f.arrDayOffset]) ]));
    return JSON.stringify([dutyBits,state.rules]);
  }

  function numericPersonRule(base,pi,fallback=0){
    const v=Number(state.rules[`${base}${pi}`]);
    return Number.isFinite(v)?v:fallback;
  }
  function hhmmParts(hhmm){
    const s=String(hhmm||'').replace(/\D/g,'').slice(0,4).padStart(4,'0');
    return {h:Number(s.slice(0,2)),m:Number(s.slice(2,4))};
  }
  function tzOffsetMillisRh(date,timeZone){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return Date.UTC(+o.year,+o.month-1,+o.day,+o.hour,+o.minute,+o.second)-date.getTime();
  }
  function wallTimeToInstantRh(dateKey,hhmm,timeZone){
    const [y,mo,d]=dateKey.split('-').map(Number),{h,m}=hhmmParts(hhmm);
    let guess=new Date(Date.UTC(y,mo-1,d,h,m,0));
    let off=tzOffsetMillisRh(guess,timeZone);
    guess=new Date(Date.UTC(y,mo-1,d,h,m,0)-off);
    const off2=tzOffsetMillisRh(guess,timeZone);
    if(off2!==off) guess=new Date(Date.UTC(y,mo-1,d,h,m,0)-off2);
    return guess;
  }
  // The briefing is anchored to the FIRST FLIGHT'S OFF-BLOCK / CHOCKS-OUT time,
  // never to CrewLink C/I. Example: flight 20:45Z with 105 min lead => briefing 19:00Z,
  // even if the duty/report itself starts at 19:45Z.
  function firstFlightDepartureInstant(d){
    const f=d?.flights?.[0];
    if(!f?.depTime || !d?.checkIn) return null;
    let dateKey=d.sourceCheckInDate || d.date || String(d.checkIn).slice(0,10);
    if(f.depDayOffset) dateKey=addDaysKey(dateKey,Number(f.depDayOffset));
    const build=()=>{
      if(d.timeBasis==='local_event'){
        const tz=window.RosterParser?.airportTimeZone?.(f.dep);
        return tz?wallTimeToInstantRh(dateKey,f.depTime,tz):null;
      }
      const {h,m}=hhmmParts(f.depTime);
      return new Date(`${dateKey}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`);
    };
    let dep=build(); if(!dep) return null;
    const ci=new Date(d.checkIn); let guard=0;
    // A first sector cannot depart before its own report. The loop only resolves a
    // midnight/date ambiguity; it does NOT derive departure from the report time.
    while(dep<ci && guard<2){ dateKey=addDaysKey(dateKey,1); dep=build(); guard++; }
    return dep;
  }
  function briefingForDuty(d,pi){
    if(d?.kind!=='duty') return null;
    const lead=numericPersonRule('briefingLead',pi,0);
    if(lead<=0) return null;
    const departure=firstFlightDepartureInstant(d);
    if(!departure) return null;
    const start=new Date(departure.getTime()-minMs(lead));
    const checkIn=new Date(d.checkIn);
    // Visually the briefing/pre-flight block runs only until C/I when it starts
    // before report, so it does not misleadingly sit on top of the whole duty.
    // The briefing *time* itself is always `departure - lead`.
    const end=checkIn>start ? checkIn : new Date(start.getTime()+minMs(1));
    return {start,end,briefingAt:start,departure,checkIn,lead,flight:d.flights?.[0]||null,insideDuty:start>=checkIn};
  }

  // Sleep now includes each person's own preparation time before leaving home.
  sleepForDuty=function(d,pi=0){
    if(d.kind!=='duty' || !d.checkIn) return null;
    const prep=numericPersonRule('prepMinutes',pi,0);
    const reportReady=new Date(new Date(d.checkIn).getTime()-minMs(Number(state.rules.commuteOut||0)));
    const briefing=briefingForDuty(d,pi);
    // Never let a configured briefing overlap the protected sleep window. If the
    // personal briefing starts before the normal leave-for-report time, it becomes
    // the earlier commitment that determines when preparation must begin.
    const firstCommitment=briefing && briefing.start<reportReady ? briefing.start : reportReady;
    const wake=new Date(firstCommitment.getTime()-minMs(prep));
    const start=new Date(wake.getTime()-ms(state.rules.sleepHours));
    return {start,end:wake,quietStart:new Date(start.getTime()-minMs(state.rules.quietLead)),prep,firstCommitment};
  };

  allDerived=function(){
    const sig=derivedStateSignature();
    if(derivedCacheValue && sig===derivedCacheSignature) return derivedCacheValue;
    const events=[];
    state.people.forEach((p,pi)=>dedupeDuties(p.duties).forEach(d=>{
      if(d.kind==='duty'){
        events.push({kind:'duty',person:pi,start:new Date(d.checkIn),end:d.checkout?new Date(d.checkout):new Date(new Date(d.checkIn).getTime()+ms(8)),label:dutyLabel(d),raw:d});
        const b=briefingForDuty(d,pi);
        if(b) events.push({kind:'briefing',person:pi,start:b.start,end:b.end,label:'Briefing',lead:b.lead,flight:b.flight,departure:b.departure,briefingAt:b.briefingAt,checkIn:b.checkIn,insideDuty:b.insideDuty,raw:d});
        const s=sleepForDuty(d,pi);
        if(s){
          events.push({kind:'sleep',person:pi,start:s.start,end:s.end,label:`Sueño ${state.rules.sleepHours} h`,prep:s.prep,raw:d});
          if(state.rules.quietLead>0) events.push({kind:'quiet',person:pi,start:s.quietStart,end:s.start,label:'Quiet hours',raw:d});
        }
        const r=recoveryForDuty(d);
        if(r) events.push({kind:'recovery',person:pi,start:r.start,end:r.end,label:r.level==='full'?'Recovery completo':'Recovery parcial',level:r.level,reasons:r.reasons,score:r.score,raw:d});
      }
    }));
    const dutyEvents=events.filter(x=>x.kind==='duty');
    for(const sleep of events.filter(x=>x.kind==='sleep')){
      const conflicts=dutyEvents.filter(d=>d.person===sleep.person && new Date(d.start)<new Date(sleep.end) && new Date(d.end)>new Date(sleep.start));
      if(conflicts.length){ sleep.sleepConflict=true; sleep.conflictDuties=conflicts.map(x=>x.raw?.route||x.label||'Duty'); }
    }
    const seen=new Map();
    for(const e of events){
      const k=[e.kind,e.person,e.start?.toISOString?.()||'',e.end?.toISOString?.()||'',e.raw?.route||'',e.label||''].join('|');
      seen.set(k,e);
    }
    derivedCacheSignature=sig;
    derivedCacheValue=[...seen.values()];
    summaryCacheSignature=''; summaryCacheValue=null;
    return derivedCacheValue;
  };

  function operationalStatusOnDay(key){
    const busy=new Set(['STBY','RES','SIM','TRG']);
    return state.people.some(p=>(p.duties||[]).some(d=>d.kind==='status'&&d.date===key&&busy.has(String(d.status||'').toUpperCase())));
  }
  function sharedFreeIntervalsForDay(key,derived,minMinutes=0){
    if(!state.people[0].duties.length || !state.people[1].duties.length) return [];
    // Until timed STBY/RES parsing is added, be conservative on these days.
    if(operationalStatusOnDay(key)) return [];
    const start=utcForLocalDayTime(key,'08:00'),end=utcForLocalDayTime(key,'23:00');
    const busyKinds=new Set(['duty','sleep','briefing']);
    // Recovery means the person is available at home for couple-planning purposes.
    // It remains a visible overlay, but it must not remove time from shared availability.
    const blocks=derived.filter(e=>busyKinds.has(e.kind)).map(e=>overlap(e,{start,end},start,end)).filter(Boolean);
    const merged=mergeIntervals(blocks),gaps=[]; let cursor=start;
    for(const b of merged){
      if(b.start>cursor) gaps.push({start:new Date(cursor),end:new Date(b.start)});
      if(b.end>cursor) cursor=b.end;
    }
    if(cursor<end) gaps.push({start:new Date(cursor),end:new Date(end)});
    return gaps.filter(g=>(g.end-g.start)>=minMs(minMinutes));
  }
  coupleWindowForDay=function(key,derived){
    let cache=coupleWindowCache.get(derived); if(!cache){cache=new Map();coupleWindowCache.set(derived,cache);} if(cache.has(key))return cache.get(key);
    const gaps=sharedFreeIntervalsForDay(key,derived,120),result=gaps.sort((a,b)=>(b.end-b.start)-(a.end-a.start))[0]||null;
    cache.set(key,result); return result;
  };
  function recoveryOverlaysForInterval(interval,derived){
    if(!interval) return [];
    return derived.filter(e=>e.kind==='recovery' && new Date(e.start)<new Date(interval.end) && new Date(e.end)>new Date(interval.start)).map(e=>{
      const start=new Date(Math.max(+new Date(e.start),+new Date(interval.start)));
      const end=new Date(Math.min(+new Date(e.end),+new Date(interval.end)));
      return {...e,overlapStart:start,overlapEnd:end,overlapHours:(end-start)/3600000};
    }).filter(e=>e.overlapHours>0);
  }
  function recoveryOverlayLabel(interval,derived){
    const recs=recoveryOverlaysForInterval(interval,derived);
    if(!recs.length) return '';
    const names=[...new Set(recs.map(r=>state.people[r.person]?.name||`Perfil ${r.person+1}`))];
    const hasFull=recs.some(r=>r.level==='full'),hasPartial=recs.some(r=>r.level==='partial');
    const type=hasFull&&hasPartial?'recovery parcial/completo':hasFull?'recovery completo':'recovery parcial';
    return `Incluye ${type} de ${names.join(' y ')}`;
  }
  function dayPlanStatus(key,derived){
    let cache=dayStatusCache.get(derived); if(!cache){cache=new Map();dayStatusCache.set(derived,cache);} if(cache.has(key))return cache.get(key);
    let result;
    if(!state.people[0].duties.length || !state.people[1].duties.length) result={level:'unknown',label:'Falta un roster',emoji:'＋',detail:'Importa los dos rosters para comparar el día.',best:null,totalHours:0};
    else{
      const gaps=sharedFreeIntervalsForDay(key,derived,30),sorted=[...gaps].sort((a,b)=>(b.end-b.start)-(a.end-a.start)),best=sorted[0]||null;
      const bestH=best?(best.end-best.start)/3600000:0,totalHours=gaps.reduce((sum,g)=>sum+(g.end-g.start)/3600000,0),recoveryOverlays=best?recoveryOverlaysForInterval(best,derived):[];
      if(bestH>=6) result={level:'together',label:'Día para pasar juntos',emoji:'❤️',detail:`Mejor ventana ${timeLocal(best.start)}–${timeLocal(best.end)}`,best,totalHours,recoveryOverlays};
      else if(bestH>=2) result={level:'partial',label:'Coincidimos un rato',emoji:'🫶',detail:`Mejor ventana ${timeLocal(best.start)}–${timeLocal(best.end)}`,best,totalHours,recoveryOverlays};
      else result={level:'busy',label:'Día ocupado',emoji:'🔒',detail:operationalStatusOnDay(key)?'Hay standby/reserva u otra actividad que condiciona el día.':'No aparece una ventana continua de 2 h para los dos.',best,totalHours,recoveryOverlays:[]};
    }
    cache.set(key,result); return result;
  }
  function mealWindowForDay(key,time,derived){
    let cache=mealCache.get(derived); if(!cache){cache=new Map();mealCache.set(derived,cache);} const ck=`${key}|${time}`; if(cache.has(ck))return cache.get(ck);
    let result=null;
    if(state.people[0].duties.length && state.people[1].duties.length && !operationalStatusOnDay(key)){
      const center=utcForLocalDayTime(key,time),flex=minMs(state.rules.mealFlex),start=new Date(center.getTime()-flex),end=new Date(center.getTime()+flex);
      const busyKinds=new Set(['duty','sleep','briefing']);
      // A recovery block does not make lunch/dinner incompatible by itself: the
      // person is at home, although recovery still has priority and stays visible.
      const blocks=mergeIntervals(derived.filter(e=>busyKinds.has(e.kind)).map(e=>overlap(e,{start,end},start,end)).filter(Boolean));
      let cursor=start;
      for(const b of blocks){
        if(b.start-cursor>=minMs(60)){result={start:new Date(cursor),end:new Date(cursor.getTime()+minMs(60))};break;}
        if(b.end>cursor)cursor=b.end;
      }
      if(!result && end-cursor>=minMs(60))result={start:new Date(cursor),end:new Date(cursor.getTime()+minMs(60))};
    }
    cache.set(ck,result); return result;
  }


  eventsForDay=function(key,derived,includeQuiet=true){
    let cache=eventsDayCache.get(derived); if(!cache){cache=new Map();eventsDayCache.set(derived,cache);} const ck=`${key}|${includeQuiet?'q':'nq'}`; if(cache.has(ck))return cache.get(ck);
    const out=[];
    state.people.forEach((p,pi)=>p.duties.filter(x=>x.kind==='status'&&x.date===key).forEach(x=>out.push({kind:'status',person:pi,label:x.status,raw:x,date:key})));
    derived.filter(e=>eventOverlapsDay(e,key)&&(includeQuiet||e.kind!=='quiet')).forEach(e=>out.push(e));
    const cw=coupleWindowForDay(key,derived); if(cw)out.push({kind:'couple',person:null,start:cw.start,end:cw.end,label:'Ventana juntos',date:key,recoveryOverlays:recoveryOverlaysForInterval(cw,derived)});
    const order={status:0,quiet:1,sleep:2,briefing:3,duty:4,recovery:5,couple:6};
    out.sort((a,b)=>{const ta=a.start?+new Date(a.start):-Infinity,tb=b.start?+new Date(b.start):-Infinity;return ta!==tb?ta-tb:(order[a.kind]??9)-(order[b.kind]??9);});
    cache.set(ck,out); return out;
  };


  const baseEventClass=eventClass,baseEventBlockTitle=eventBlockTitle,baseEventBlockMeta=eventBlockMeta,baseEventTitle=eventTitle,baseEventSubtitle=eventSubtitle,baseEventKicker=eventKicker,baseEventDetailHtml=eventDetailHtml;
  eventClass=function(e){ return e.kind==='briefing'?'briefing':baseEventClass(e); };
  eventBlockTitle=function(e,compact=false){
    if(e.kind!=='briefing') return baseEventBlockTitle(e,compact);
    const p=state.people[e.person].name,initial=p.trim().charAt(0).toUpperCase();
    return compact?`🗂 ${initial}`:`🗂 Briefing · ${p}`;
  };
  eventBlockMeta=function(e){ return e.kind==='briefing'?`${timeLocal(e.briefingAt||e.start)} · vuelo ${timeLocal(e.departure)} · −${e.lead} min`:baseEventBlockMeta(e); };
  eventTitle=function(e){ return e.kind==='briefing'?`🗂 Briefing · ${state.people[e.person].name}`:baseEventTitle(e); };
  eventSubtitle=function(e){
    if(e.kind==='briefing') return `${e.lead} min antes de chocks del primer vuelo`;
    if(e.kind==='sleep'){
      const prep=numericPersonRule('prepMinutes',e.person,0);
      return e.sleepConflict?'Coincide realmente con un duty · revisar roster':`${state.rules.sleepHours} h · ${prep} min de preparación personal`;
    }
    return baseEventSubtitle(e);
  };
  eventKicker=function(e){ return e.kind==='briefing'?'Briefing':baseEventKicker(e); };
  eventDetailHtml=function(e){
    if(e.kind==='briefing'){
      const f=e.flight||{},sector=f.dep&&f.arr?`${f.dep} → ${f.arr}`:(e.raw?.route||'Primer sector');
      const sourceBasis=e.raw?.timeBasis==='utc'?'UTC':'hora local del aeropuerto';
      const warning=e.insideDuty?`<div class="warning-box"><b>⚠️ Briefing posterior al C/I</b><br>Con esta antelación, la hora calculada de briefing cae dentro del duty. Revisa el valor configurado si no es lo que buscas.</div>`:'';
      return `${warning}<div class="detail-section detail-summary"><h3>En pocas palabras</h3>${detailRow('Persona',state.people[e.person].name)}${detailRow('Sector',sector)}${detailRow('Hora de briefing',localDateTime(e.briefingAt||e.start))}${detailRow('Salida primer vuelo (chocks)',localDateTime(e.departure))}${detailRow('C/I CrewLink',localDateTime(e.checkIn||e.raw?.checkIn))}${detailRow('Antelación configurada',`${e.lead} min`)}${detailRow('Base horaria del roster',sourceBasis)}</div><p class="detail-note">La hora de briefing se calcula siempre desde la salida del primer vuelo: <b>chocks − antelación configurada</b>. No se calcula desde el C/I.</p>`;
    }
    if(e.kind==='sleep'){
      const report=e.raw?.checkIn?localDateTime(e.raw.checkIn):'—',prep=numericPersonRule('prepMinutes',e.person,0),warning=e.sleepConflict?`<div class="warning-box"><b>⚠️ Conflicto real detectado</b><br>Este bloque de sueño se solapa temporalmente con ${esc((e.conflictDuties||[]).join(', ')||'un duty')}. Revisa la importación o las reglas.</div>`:'';
      return `${warning}<div class="detail-section"><h3>Qué indica</h3><p class="detail-explainer">Sueño protegido calculado hacia atrás desde la primera obligación previa al vuelo (briefing o salida hacia el report) y vuestro tiempo personal de preparación.</p>${detailRow('Persona',state.people[e.person].name)}${detailRow('Desde',localDateTime(e.start))}${detailRow('Despertar objetivo',localDateTime(e.end))}${detailRow('Sueño objetivo',`${state.rules.sleepHours} h`)}${detailRow('Preparación personal',`${prep} min`)}${detailRow('Trayecto a report',`${state.rules.commuteOut} min`)}${detailRow('Report relacionado',report)}${detailRow('Ruta relacionada',e.raw?.route||'Duty')}</div>`;
    }
    if(e.kind==='recovery'){
      return `${baseEventDetailHtml(e)}<div class="detail-section recovery-couple-note"><h3>❤️ Convivencia</h3><p class="detail-explainer">Este recovery <b>sí cuenta como tiempo potencial en casa juntos</b> si la otra persona también está disponible. Se muestra como una capa superpuesta porque estar juntos no elimina la necesidad de recovery.</p></div>`;
    }
    if(e.kind==='couple'){
      const recs=e.recoveryOverlays||recoveryOverlaysForInterval(e,allDerived()),note=recs.length?`<div class="recovery-in-window"><b>↗ Esta ventana incluye recovery</b><span>${esc(recoveryOverlayLabel(e,allDerived()))}. El tiempo sigue contando como coincidencia en casa, pero el recovery mantiene prioridad.</span></div>`:'';
      return `<div class="detail-section"><h3>Qué indica</h3><p class="detail-explainer">Es la mejor ventana continua del día, entre 08:00 y 23:00, en la que ninguno está bloqueado por duty, briefing o sueño protegido. <b>Recovery parcial y completo cuentan como tiempo potencial juntos.</b></p>${detailRow('Desde',localDateTime(e.start))}${detailRow('Hasta',localDateTime(e.end))}${detailRow('Tiempo potencial',`${((e.end-e.start)/3600000).toFixed(1)} h`)}</div>${note}`;
    }
    return baseEventDetailHtml(e);
  };

  syncCalendarDensityButtons=function(){
    document.querySelectorAll('[data-calendar-density]').forEach(b=>b.classList.toggle('active',b.dataset.calendarDensity===state.calendarDensity));
    const hint=$('clarityHint'); if(hint)hint.textContent=state.calendarDensity==='simple'?'Un único resultado compartido por día':'Duty, briefing, sueño, recovery y demás detalle';
  };
  function simpleStatusHtml(key,derived,context='month'){
    const s=dayPlanStatus(key,derived),time=s.best?`${timeLocal(s.best.start)}–${timeLocal(s.best.end)}`:'',hasRecovery=!!s.recoveryOverlays?.length;
    return `<button type="button" class="simple-day-status ${s.level} ${context}" data-open-day="${key}"><span class="simple-status-main">${s.emoji} ${esc(s.label)}</span>${time?`<span class="simple-status-time">${esc(time)}</span>`:''}${hasRecovery?'<span class="simple-status-overlay">+ recovery</span>':''}</button>`;
  }

  renderMonthCalendar=function(derived){
    const [year,month]=state.month.split('-').map(Number),first=new Date(year,month-1,1),days=new Date(year,month,0).getDate(),lead=(first.getDay()+6)%7;
    $('monthTitle').textContent=monthLabel(state.month);$('calendar').className='calendar month-view split-people';
    const names=['L','M','X','J','V','S','D'];let html=names.map(x=>`<div class="dow">${x}</div>`).join('');
    for(let i=0;i<lead;i++)html+='<div class="day other"></div>';const todayKey=dayKey(new Date());
    for(let d=1;d<=days;d++){
      const key=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      html+=`<div class="day ${key===todayKey?'today':''}"><button type="button" class="daynum daynum-btn" data-open-day="${key}" aria-label="Abrir ${esc(localDayLabel(key))}">${d}</button>`;
      if(state.calendarDensity==='simple')html+=simpleStatusHtml(key,derived,'month');
      else{
        const ev=eventsForDay(key,derived,false),p0=ev.filter(e=>e.person===0),p1=ev.filter(e=>e.person===1),shared=ev.filter(e=>e.person==null);
        html+='<div class="month-person-lanes">';
        for(const [pi,list] of [[0,p0],[1,p1]]){const max=4;html+=`<div class="month-person-lane person-${pi}" aria-label="${esc(state.people[pi].name)}">`;list.slice(0,max).forEach(e=>html+=renderEventButton(e,'month-person-event','month'));if(list.length>max)html+=`<button type="button" class="more-events lane-more" data-open-day="${key}">+${list.length-max}</button>`;html+='</div>';}
        html+='</div>';if(shared.length)html+=`<div class="shared-events">${shared.map(e=>renderEventButton(e,'shared-event','month')).join('')}</div>`;
      }
      html+='</div>';
    }
    $('calendar').innerHTML=html;
  };
  renderWeekCalendar=function(derived){
    const start=mondayKey(state.focusDate),todayKey=dayKey(new Date());$('monthTitle').textContent=shortWeekTitle(start);$('calendar').className='calendar week-view split-people';let html='<div class="week-grid">';
    for(let i=0;i<7;i++){
      const key=addDaysKey(start,i),weekday=localDayLabel(key,{weekday:'short'}),date=localDayLabel(key,{day:'numeric',month:'short'});
      html+=`<section class="week-day ${key===todayKey?'today':''}"><button type="button" class="week-day-head" data-open-day="${key}"><span>${esc(weekday)}</span><b>${esc(date)}</b></button>`;
      if(state.calendarDensity==='simple')html+=`<div class="simple-week-wrap">${simpleStatusHtml(key,derived,'week')}</div>`;
      else{
        const ev=eventsForDay(key,derived,true),p0=ev.filter(e=>e.person===0),p1=ev.filter(e=>e.person===1),shared=ev.filter(e=>e.person==null);
        html+=`<div class="week-person-head"><span>${esc(state.people[0].name)}</span><span>${esc(state.people[1].name)}</span></div><div class="week-events person-split">`;
        for(const [pi,list] of [[0,p0],[1,p1]])html+=`<div class="week-person-lane person-${pi}">${list.length?list.map(e=>renderEventButton(e,'week-event','week')).join(''):'<div class="empty-person-lane">—</div>'}</div>`;
        html+='</div>';if(shared.length)html+=`<div class="week-shared">${shared.map(e=>renderEventButton(e,'week-event shared-event','week')).join('')}</div>`;
      }
      html+='</section>';
    }
    $('calendar').innerHTML=html+'</div>';
  };
  const baseSegmentBlockMeta=segmentBlockMeta;
  segmentBlockMeta=function(seg){ return seg.e.kind==='briefing'?`${timeLocal(seg.e.briefingAt||seg.e.start)} · vuelo ${timeLocal(seg.e.departure)}`:baseSegmentBlockMeta(seg); };
  renderDayCalendar=function(derived){
    const key=state.focusDate,todayKey=dayKey(new Date());$('monthTitle').textContent=localDayLabel(key,{weekday:'long',day:'numeric',month:'long',year:'numeric'});$('calendar').className='calendar day-view split-people';
    if(state.calendarDensity==='simple'){
      const s=dayPlanStatus(key,derived),lunch=mealWindowForDay(key,state.rules.lunchTime,derived),dinner=mealWindowForDay(key,state.rules.dinnerTime,derived);
      let html=`<div class="simple-day-card ${s.level} ${key===todayKey?'today':''}"><div class="simple-day-icon">${s.emoji}</div><h2>${esc(s.label)}</h2><p>${esc(s.detail)}</p>`;
      if(s.best)html+=`<div class="simple-day-window"><span>Mejor momento juntos</span><b>${timeLocal(s.best.start)}–${timeLocal(s.best.end)}</b></div>`;
      if(s.best&&s.recoveryOverlays?.length)html+=`<div class="simple-recovery-overlay-note"><b>🟡 También toca recovery</b><span>${esc(recoveryOverlayLabel(s.best,derived))}. Cuenta como tiempo juntos en casa, pero conviene mantener el día tranquilo.</span></div>`;
      html+=`<div class="simple-day-window"><span>Comida</span><b>${lunch?`Posible · ${timeLocal(lunch.start)}–${timeLocal(lunch.end)}`:'Difícil en el horario preferido'}</b></div><div class="simple-day-window"><span>Cena</span><b>${dinner?`Posible · ${timeLocal(dinner.start)}–${timeLocal(dinner.end)}`:'Difícil en el horario preferido'}</b></div><p class="simple-switch-note">Cambia a <b>Completo</b> para ver duties, briefings, sueño y recovery en capas separadas.</p></div>`;
      $('calendar').innerHTML=html;return;
    }
    const ev=eventsForDay(key,derived,true),allDay=ev.filter(e=>e.kind==='status'),rawSegments=ev.filter(e=>e.kind!=='status'&&e.start&&e.end).map(e=>timelineSegment(e,key)).filter(Boolean),segments=assignPersonTimelineLanes(rawSegments),H=64,dayHeight=24*H;
    let html=`<div class="day-agenda ${key===todayKey?'today':''}"><div class="day-agenda-head"><span>${ev.length} ${ev.length===1?'evento':'eventos'}</span><b>${esc(state.rules.homeTz)}</b></div><div class="day-person-head"><span>${esc(state.people[0].name)}</span><span>${esc(state.people[1].name)}</span></div>`;
    if(allDay.length){const a0=allDay.filter(e=>e.person===0),a1=allDay.filter(e=>e.person===1),ash=allDay.filter(e=>e.person==null);html+='<div class="all-day-row split-all-day"><span class="all-day-label">Todo el día</span><div class="all-day-people">';for(const [pi,list] of [[0,a0],[1,a1]])html+=`<div class="all-day-person person-${pi}">${list.map(e=>renderEventButton(e,'all-day-event','day')).join('')||'<span class="empty-person-lane">—</span>'}</div>`;html+='</div></div>';if(ash.length)html+=`<div class="all-day-shared">${ash.map(e=>renderEventButton(e,'all-day-event shared-event','day')).join('')}</div>`;}
    if(!segments.length&&!allDay.length)html+='<div class="empty-agenda"><strong>Día despejado</strong><span>No hay eventos calculados para este día.</span></div>';
    else if(segments.length){html+=`<div class="timeline-scroll"><div class="timeline-canvas split-timeline" style="height:${dayHeight}px">`;for(let h=0;h<24;h++)html+=`<div class="timeline-hour-label" style="top:${h*H-8}px">${String(h).padStart(2,'0')}:00</div><div class="timeline-hour-line" style="top:${h*H}px"></div>`;html+='<div class="timeline-person-divider" aria-hidden="true"></div>';if(key===todayKey){const nowMin=localMinuteOfDay(new Date());html+=`<div class="timeline-now" style="top:${nowMin/60*H}px"><span></span></div>`;}for(const seg of segments){const e=seg.e,id=registerEvent(e),top=seg.startMin/60*H,height=Math.max((seg.endMin-seg.startMin)/60*H,30);let leftPct,widthPct;if(e.person==null){leftPct=0;widthPct=100;}else{const sideBase=e.person===0?0:50,subWidth=50/seg.laneCount;leftPct=sideBase+seg.lane*subWidth;widthPct=subWidth;}const compact=height<48?' compact':'';html+=`<button type="button" class="timeline-event ${eventClass(e)} ${personLaneClass(e)}${compact}" data-event-id="${id}" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 5px);width:calc(${widthPct}% - 9px)" aria-label="Ver detalle de ${esc(eventText(e))}"><span class="timeline-event-title">${esc(eventBlockTitle(e))}</span><span class="timeline-event-meta">${esc(segmentBlockMeta(seg))}</span>${height>=72?`<span class="timeline-event-sub">${esc(eventSubtitle(e))}</span>`:''}</button>`;}html+='</div></div>';}
    html+='</div>';$('calendar').innerHTML=html;const scroll=$('calendar').querySelector('.timeline-scroll'),renderVersion=window.__rhRenderVersion;if(scroll&&segments.length){const first=Math.min(...segments.map(s=>s.startMin));requestAnimationFrame(()=>{if(scroll.isConnected&&window.__rhRenderVersion===renderVersion&&state.calendarMode==='day')scroll.scrollTop=Math.max(0,(first/60)*H-H);});}
  };

  function summaryModel(){
    const derived=allDerived();
    const sig=`${state.month}|${derivedStateSignature()}|${state.rules.lunchTime}|${state.rules.dinnerTime}|${state.rules.mealFlex}`;
    if(summaryCacheValue && summaryCacheSignature===sig)return summaryCacheValue;
    const [y,m]=state.month.split('-').map(Number),days=new Date(y,m,0).getDate(),dayRows=[];
    for(let d=1;d<=days;d++){
      const key=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const status=dayPlanStatus(key,derived),lunch=mealWindowForDay(key,state.rules.lunchTime,derived),dinner=mealWindowForDay(key,state.rules.dinnerTime,derived);
      const has0=derived.some(e=>e.kind==='duty'&&e.person===0&&eventOverlapsDay(e,key)),has1=derived.some(e=>e.kind==='duty'&&e.person===1&&eventOverlapsDay(e,key));
      dayRows.push({key,status,lunch,dinner,bothWork:has0&&has1});
    }
    const togetherDays=dayRows.filter(x=>x.status.level==='together'),partialDays=dayRows.filter(x=>x.status.level==='partial'),busyDays=dayRows.filter(x=>x.status.level==='busy'),lunchDays=dayRows.filter(x=>x.lunch),dinnerDays=dayRows.filter(x=>x.dinner),bothWorkDays=dayRows.filter(x=>x.bothWork),togetherHours=dayRows.reduce((sum,x)=>sum+x.status.totalHours,0);
    const metrics=[
      {id:'togetherDays',label:'❤️ Días para pasar juntos',value:togetherDays.length,items:togetherDays.map(x=>({key:x.key,text:x.status.detail}))},
      {id:'partialDays',label:'🫶 Coincidimos un rato',value:partialDays.length,items:partialDays.map(x=>({key:x.key,text:x.status.detail}))},
      {id:'busyDays',label:'🔒 Días ocupados',value:busyDays.length,items:busyDays.map(x=>({key:x.key,text:x.status.detail}))},
      {id:'togetherHours',label:'🕒 Horas potenciales juntos',value:`${Math.round(togetherHours)} h`,items:dayRows.filter(x=>x.status.totalHours>0).sort((a,b)=>b.status.totalHours-a.status.totalHours).map(x=>({key:x.key,text:`${x.status.totalHours.toFixed(1)} h potenciales entre 08:00 y 23:00${x.status.best&&x.status.recoveryOverlays?.length?' · incluye recovery':''}`}))},
      {id:'lunchDays',label:'🥗 Comidas compatibles',value:lunchDays.length,items:lunchDays.map(x=>({key:x.key,text:`Comida posible ${timeLocal(x.lunch.start)}–${timeLocal(x.lunch.end)}`}))},
      {id:'dinnerDays',label:'🍽️ Cenas compatibles',value:dinnerDays.length,items:dinnerDays.map(x=>({key:x.key,text:`Cena posible ${timeLocal(x.dinner.start)}–${timeLocal(x.dinner.end)}`}))},
      {id:'bothWorkDays',label:'✈️ Días trabajando los dos',value:bothWorkDays.length,items:bothWorkDays.map(x=>({key:x.key,text:'Ambos tienen duty en algún momento del día.'}))}
    ];
    summaryCacheSignature=sig; summaryCacheValue={derived,dayRows,metrics}; return summaryCacheValue;
  }
  function renderSummaryDetail(model){
    const metric=model.metrics.find(x=>x.id===selectedSummaryMetric)||model.metrics[0];selectedSummaryMetric=metric.id;
    document.querySelectorAll('[data-summary-metric]').forEach(x=>x.classList.toggle('active',x.dataset.summaryMetric===metric.id));
    if($('summaryDrillTitle'))$('summaryDrillTitle').textContent=metric.label;
    if($('summaryDrilldown'))$('summaryDrilldown').innerHTML=metric.items.length?metric.items.slice(0,31).map(i=>`<button type="button" class="summary-drill-row" data-summary-day="${i.key}"><span>${esc(localDayLabel(i.key,{weekday:'short',day:'numeric',month:'short'}))}</span><b>${esc(i.text)}</b><i>›</i></button>`).join(''):'<div class="muted">No hay días en esta categoría.</div>';
  }
  function renderWorkloadComparison(derived){
    if(!$('workloadCompare'))return;
    const rows=state.people.map((p,pi)=>{const duties=derived.filter(e=>e.kind==='duty'&&e.person===pi&&dayKey(e.start).startsWith(state.month)),recs=derived.filter(e=>e.kind==='recovery'&&e.person===pi&&dayKey(e.start).startsWith(state.month)),hours=duties.reduce((s,e)=>s+Number(e.raw?.dutyHours||0),0),nights=duties.filter(e=>String(e.raw?.type||'').toUpperCase().includes('NIGHT')).length,earlyLate=duties.filter(e=>/EARLY|LATE/.test(String(e.raw?.type||'').toUpperCase())).length;return {name:p.name,duties:duties.length,hours,recs:recs.length,nights,earlyLate};});
    $('workloadCompare').innerHTML=rows.map((r,pi)=>`<div class="workload-person p${pi}"><h4>${esc(r.name)}</h4><div><span>Duties</span><b>${r.duties}</b></div><div><span>Duty time aprox.</span><b>${r.hours.toFixed(1)} h</b></div><div><span>NIGHT</span><b>${r.nights}</b></div><div><span>EARLY/LATE</span><b>${r.earlyLate}</b></div><div><span>Recoveries</span><b>${r.recs}</b></div></div>`).join('');
  }
  renderSummary=function(){
    const model=summaryModel(),derived=model.derived;
    $('stats').innerHTML=model.metrics.map(m=>`<button type="button" class="stat stat-button ${m.id===selectedSummaryMetric?'active':''}" data-summary-metric="${m.id}"><span class="muted">${esc(m.label)}</span><b>${esc(m.value)}</b><small>Toca para ver los días</small></button>`).join('');
    renderSummaryDetail(model);
    const windows=model.dayRows.filter(x=>x.status.best).sort((a,b)=>(b.status.best.end-b.status.best.start)-(a.status.best.end-a.status.best.start));
    $('bestWindows').innerHTML=windows.slice(0,8).map(x=>`<button type="button" class="summary-row summary-row-button" data-summary-day="${x.key}"><span>${esc(localDayLabel(x.key,{weekday:'short',day:'numeric',month:'short'}))}</span><b>${timeLocal(x.status.best.start)}–${timeLocal(x.status.best.end)} · ${((x.status.best.end-x.status.best.start)/3600000).toFixed(1)} h${x.status.recoveryOverlays?.length?' · 🟡 recovery':''}</b></button>`).join('')||'<div class="muted">Importa ambos rosters para calcularlo.</div>';
    const issues=[];
    derived.filter(e=>e.kind==='recovery'&&dayKey(e.start).startsWith(state.month)).forEach(e=>issues.push({date:dayKey(e.start),txt:`${state.people[e.person].name}: ${e.level==='full'?'recovery completo':'recovery parcial'}`}));
    derived.filter(e=>e.kind==='sleep'&&e.sleepConflict&&dayKey(e.start).startsWith(state.month)).forEach(e=>issues.push({date:dayKey(e.start),txt:`${state.people[e.person].name}: conflicto entre sueño y duty`}));
    model.dayRows.filter(x=>x.status.level==='busy').forEach(x=>issues.push({date:x.key,txt:'Día ocupado: poca o ninguna coincidencia continua'}));
    issues.sort((a,b)=>a.date.localeCompare(b.date));
    $('coordination').innerHTML=issues.slice(0,12).map(i=>`<button type="button" class="summary-row summary-row-button" data-summary-day="${i.date}"><span>${i.date.slice(8,10)}/${i.date.slice(5,7)}</span><b>${esc(i.txt)}</b></button>`).join('')||'<div class="muted">No hay conflictos destacados en este mes.</div>';
    renderWorkloadComparison(derived);
  };

  function saveEnhancedRules(){
    ['homeTz','lunchTime','dinnerTime'].forEach(k=>state.rules[k]=$(k).value.trim());
    ['sleepHours','quietLead','commuteOut','commuteHome','briefingLead0','briefingLead1','prepMinutes0','prepMinutes1','longDuty','veryLongDuty','partialRecovery','fullRecovery','mealFlex'].forEach(k=>state.rules[k]=Number($(k).value));
    saveState();renderCalendar();
  }
  function exportEnhancedIcs(){
    const derived=allDerived().filter(e=>['sleep','recovery','quiet','briefing'].includes(e.kind)),[y,m]=state.month.split('-').map(Number),days=new Date(y,m,0).getDate(),couple=[];
    for(let d=1;d<=days;d++){const key=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,w=coupleWindowForDay(key,allDerived());if(w)couple.push({kind:'couple',person:null,start:w.start,end:w.end,label:'❤️ Ventana juntos'});}
    const events=[...derived,...couple];let ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//RosterHome//ES\r\nCALSCALE:GREGORIAN\r\n';
    events.forEach((e,i)=>{const p=e.person==null?'':` · ${state.people[e.person].name}`;ics+=`BEGIN:VEVENT\r\nUID:${Date.now()}-${i}@rosterhome\r\nDTSTAMP:${icsStamp(new Date())}\r\nDTSTART:${icsStamp(e.start)}\r\nDTEND:${icsStamp(e.end)}\r\nSUMMARY:${icsEscape(e.label+p)}\r\nEND:VEVENT\r\n`;});ics+='END:VCALENDAR\r\n';
    const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`RosterHome-${state.month}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  // Capture phase prevents the older handlers from saving/exporting without the new fields.
  $('saveRules')?.addEventListener('click',e=>{
    e.stopImmediatePropagation();
    try{new Intl.DateTimeFormat('es',{timeZone:$('homeTz').value}).format();saveEnhancedRules();alert('Reglas guardadas.');}
    catch(err){alert('Zona horaria no válida. Usa, por ejemplo, Europe/Athens o Europe/Madrid.');}
  },true);
  $('exportIcs')?.addEventListener('click',e=>{e.stopImmediatePropagation();exportEnhancedIcs();},true);
  $('stats')?.addEventListener('click',e=>{const b=e.target.closest('[data-summary-metric]');if(!b)return;selectedSummaryMetric=b.dataset.summaryMetric;renderSummaryDetail(summaryModel());});
  ['summaryDrilldown','bestWindows','coordination'].forEach(id=>$(id)?.addEventListener('click',e=>{const b=e.target.closest('[data-summary-day]');if(!b)return;openDay(b.dataset.summaryDay);document.querySelector('.tab[data-view="calendarView"]')?.click();}));

  function syncPersonalRuleNames(){
    if($('rulesName0')) $('rulesName0').textContent=`👨‍✈️ ${state.people[0].name||'Perfil 1'}`;
    if($('rulesName1')) $('rulesName1').textContent=`👩‍✈️ ${state.people[1].name||'Perfil 2'}`;
  }
  ['name0','name1'].forEach(id=>$(id)?.addEventListener('change',syncPersonalRuleNames));

  // Fill the new inputs after state migration and repaint using the enhanced logic.
  syncInputs();
  syncPersonalRuleNames();
  renderCalendar();

  // v0.3.2 — durable roster persistence and user-controlled backups.
  function storageDateLabel(value){
    if(!value)return 'Todavía no';
    try{return new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}
    catch(_){return value;}
  }
  async function refreshStorageStatus(){
    if(!$('storageBadge'))return;
    let st={indexedDB:false,persisted:false};
    try{st=await window.RosterStorage?.status()||st;}catch(_){ }
    const hasRoster=state.people.some(p=>(p.duties||[]).length>0);
    $('storageSaved').textContent=hasRoster?'Sí · IndexedDB + copia local':'Sin roster importado';
    $('storagePersisted').textContent=st.persisted?'Concedida ✅':(st.indexedDB?'IndexedDB activa · no garantizada':'No disponible');
    $('storageLastSaved').textContent=storageDateLabel(state.lastSavedAt);
    $('storageBadge').className=`storage-badge ${st.persisted?'ok':(st.indexedDB?'warn':'bad')}`;
    $('storageBadge').textContent=st.persisted?'Persistente':(st.indexedDB?'Guardado local':'Solo memoria local');
    if($('storageHelp')) $('storageHelp').textContent=st.persisted
      ?'iOS/Safari ha concedido almacenamiento persistente a RosterHome. Aun así, exporta una copia antes de borrar datos web o cambiar de dispositivo.'
      :'RosterHome usa IndexedDB, pero Safari no garantiza todavía que nunca pueda purgar estos datos. La copia de seguridad JSON evita tener que reimportar los rosters.';
  }
  $('backupData')?.addEventListener('click',async()=>{
    try{saveState({immediate:true});await window.RosterStorage?.flush();window.RosterStorage?.downloadBackup(state);}
    catch(err){alert('No se pudo crear la copia: '+(err?.message||err));}
  });
  $('restoreData')?.addEventListener('click',()=>{$('restoreDataFile')?.click();});
  $('restoreDataFile')?.addEventListener('change',async e=>{
    const file=e.target.files?.[0]; if(!file)return;
    try{
      const restored=await window.RosterStorage.readBackupFile(file);
      const names=(restored.people||[]).slice(0,2).map(p=>p.name||'Perfil').join(' + ');
      if(!confirm(`¿Restaurar esta copia de ${names}?\n\nReemplazará los rosters y reglas guardados actualmente en este dispositivo.`)){e.target.value='';return;}
      state=normalizeState(restored);
      durableStorageReady=true;
      saveState({immediate:true});
      await window.RosterStorage.flush();
      syncInputs();syncPersonalRuleNames();renderCalendar();
      if($('summaryView')?.classList.contains('active'))renderSummary();
      await refreshStorageStatus();
      alert('Copia restaurada correctamente.');
    }catch(err){alert(err?.message||'No se pudo restaurar la copia.');}
    finally{e.target.value='';}
  });
  window.addEventListener('rh-storage-ready',refreshStorageStatus);
  window.addEventListener('rh-storage-saved',refreshStorageStatus);
  window.addEventListener('rh-storage-restored',()=>{syncPersonalRuleNames();refreshStorageStatus();});
  window.addEventListener('rh-storage-error',()=>{if($('storageBadge')){$('storageBadge').className='storage-badge bad';$('storageBadge').textContent='Error al guardar';}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')window.RosterStorage?.flush();});
  window.addEventListener('pagehide',()=>window.RosterStorage?.flush());
  // Never let the persistence layer prevent the rest of RosterHome from starting.
  if(typeof initializeDurableStorage==='function'){
    Promise.resolve(initializeDurableStorage()).catch(err=>console.warn('[RosterHome] Persistencia en fallback local',err)).finally(refreshStorageStatus);
  }else{
    console.warn('[RosterHome] Capa durable no disponible; usando almacenamiento local.');
    refreshStorageStatus();
  }
})();

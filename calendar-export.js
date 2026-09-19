/* RosterHome v0.9.4 · standalone calendar exporter
 * Kept separate from enhancements.js so GitHub/iPhone cache issues cannot leave
 * the buttons visible without the export logic.
 */
(()=>{
  const $=id=>document.getElementById(id);
  const status=$('calendarExportStatus');

  function setStatus(text,kind=''){
    if(!status)return;
    status.textContent=text||'';
    status.dataset.kind=kind;
  }

  function esc(v){
    return String(v??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  }
  function stamp(v){
    return new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  }
  function uid(parts){
    return parts.map(x=>String(x??'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))
      .filter(Boolean).join('.')+'@rosterhome.local';
  }
  function addDays(date,days){return new Date(date.getTime()+Number(days||0)*86400000);}
  function timeParts(hhmm){
    const s=String(hhmm||'').replace(':','').padStart(4,'0');
    return {h:Number(s.slice(0,2)),min:Number(s.slice(2,4))};
  }
  function dateParts(date){return {y:date.getUTCFullYear(),m:date.getUTCMonth()+1,d:date.getUTCDate()};}
  function wallInstant(date,hhmm,tz){
    const d=dateParts(date),t=timeParts(hhmm);
    if(tz==='UTC')return new Date(Date.UTC(d.y,d.m-1,d.d,t.h,t.min,0));
    if(typeof zonedToUtc==='function')return zonedToUtc(d.y,d.m,d.d,t.h,t.min,tz);
    return new Date(Date.UTC(d.y,d.m-1,d.d,t.h,t.min,0));
  }
  function airportTz(code){
    try{return window.RosterParser?.airportTimeZone?.(code)||'UTC';}catch(_){return 'UTC';}
  }
  function selectedPeople(){
    const v=$('calendarExportPerson')?.value??'0';
    if(v==='both')return [0,1];
    const n=Number(v);
    return Number.isInteger(n)&&n>=0&&n<(state?.people?.length||0)?[n]:[0];
  }
  function peopleName(pi){return state?.people?.[pi]?.name||`Perfil ${pi+1}`;}
  function calendarTitle(kind,people){
    const base=kind==='briefing'?'RosterHome · Briefings':'RosterHome · Vuelos';
    return people.length===1?`${base} · ${peopleName(people[0])}`:base;
  }

  function flightInstants(duty){
    if(!duty || duty.kind!=='duty' || duty.serviceType!=='flight' || !(duty.flights||[]).length)return [];
    const key=duty.sourceCheckInDate||duty.date;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key||'')))return [];
    const base=new Date(`${key}T00:00:00Z`);
    const out=[];
    let previousEnd=null;

    for(const f of duty.flights){
      if(!f.depTime||!f.arrTime||!f.dep||!f.arr)continue;
      let depDate=addDays(base,f.depDayOffset||0);
      let arrDate=addDays(base,f.arrDayOffset||0);
      const depTz=duty.timeBasis==='local_event'?airportTz(f.dep):'UTC';
      const arrTz=duty.timeBasis==='local_event'?airportTz(f.arr):'UTC';
      let start=wallInstant(depDate,f.depTime,depTz);
      while(previousEnd && start<previousEnd){
        depDate=addDays(depDate,1);
        start=wallInstant(depDate,f.depTime,depTz);
      }
      let end=wallInstant(arrDate,f.arrTime,arrTz);
      while(end<=start){
        arrDate=addDays(arrDate,1);
        end=wallInstant(arrDate,f.arrTime,arrTz);
      }
      out.push({flight:f,start,end});
      previousEnd=end;
    }
    return out;
  }

  function briefingEvent(duty,pi){
    const first=flightInstants(duty)[0];
    if(!first)return null;
    const lead=Number(state?.rules?.[`briefingLead${pi}`]??105);
    if(!Number.isFinite(lead)||lead<0)return null;
    const start=new Date(first.start.getTime()-lead*60000);
    const end=new Date(start.getTime()+15*60000);
    return {
      uid:uid(['briefing',pi,duty.date,duty.route,stamp(start)]),
      start,end,
      summary:`Briefing · ${duty.route||`${first.flight.dep}–${first.flight.arr}`}`,
      description:`${peopleName(pi)} · ${lead} min antes del primer vuelo`,
      location:duty.base||first.flight.dep||''
    };
  }

  function allDuties(pi){
    const raw=state?.people?.[pi]?.duties||[];
    if(typeof dedupeDuties==='function'){
      try{return dedupeDuties(raw);}catch(_){}
    }
    const seen=new Set();
    return raw.filter(d=>{
      const k=[d.kind,d.date,d.checkIn,d.checkout,d.route].join('|');
      if(seen.has(k))return false;
      seen.add(k);return true;
    });
  }

  function build(kind){
    const people=selectedPeople(),events=[];
    for(const pi of people){
      for(const duty of allDuties(pi)){
        if(kind==='briefing'){
          const e=briefingEvent(duty,pi);
          if(e)events.push(e);
          continue;
        }
        for(const {flight,start,end} of flightInstants(duty)){
          const no=`${flight.carrier||''}${flight.number||''}`.trim();
          events.push({
            uid:uid(['flight',pi,duty.date,no,flight.dep,flight.arr,stamp(start)]),
            start,end,
            summary:`${no||'Vuelo'} · ${flight.dep} → ${flight.arr}`,
            description:`${peopleName(pi)}${duty.route?` · duty ${duty.route}`:''}${flight.aircraft?` · ${flight.aircraft}`:''}`,
            location:`${flight.dep} → ${flight.arr}`
          });
        }
      }
    }
    events.sort((a,b)=>a.start-b.start);
    return {title:calendarTitle(kind,people),events};
  }

  function makeIcs(calendar){
    const lines=[
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//RosterHome//Operational Calendar//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(calendar.title)}`,
      'X-WR-TIMEZONE:UTC'
    ];
    const now=stamp(new Date());
    for(const e of calendar.events){
      lines.push(
        'BEGIN:VEVENT',
        `UID:${e.uid}`,
        `DTSTAMP:${now}`,
        `DTSTART:${stamp(e.start)}`,
        `DTEND:${stamp(e.end)}`,
        `SUMMARY:${esc(e.summary)}`,
        `DESCRIPTION:${esc(e.description||'')}`,
        `LOCATION:${esc(e.location||'')}`,
        'END:VEVENT'
      );
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n')+'\r\n';
  }

  function safeFilename(title){
    return title.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.ics';
  }

  async function deliver(kind){
    try{
      setStatus('Preparando calendario…');
      const calendar=build(kind);
      if(!calendar.events.length){
        setStatus(kind==='briefing'
          ?'No he encontrado briefings para ese perfil.'
          :'No he encontrado vuelos para ese perfil.','error');
        return;
      }

      const ics=makeIcs(calendar);
      const filename=safeFilename(calendar.title);
      const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
      const file=typeof File==='function'?new File([blob],filename,{type:'text/calendar'}):null;

      // Best path on iPhone/iPad: native share sheet. It preserves the .ics file.
      if(file && navigator.share && navigator.canShare){
        try{
          if(navigator.canShare({files:[file]})){
            await navigator.share({files:[file],title:calendar.title});
            setStatus(`✓ ${calendar.events.length} eventos preparados. Elige Calendario o “Guardar en Archivos”.`,'ok');
            return;
          }
        }catch(err){
          if(err?.name==='AbortError'){
            setStatus('Exportación cancelada.');
            return;
          }
          console.warn('[RosterHome] Web Share falló; usando descarga .ics',err);
        }
      }

      // Universal fallback. No "download" dependency on iOS: navigate the anchor to
      // a real blob URL created inside the original tap gesture.
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=filename;
      a.rel='noopener';
      a.style.display='none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
      setStatus(`✓ ${calendar.events.length} eventos exportados · ${filename}`,'ok');
    }catch(err){
      console.error('[RosterHome] Error exportando calendario',err);
      setStatus(`No se pudo exportar: ${err?.message||err}`,'error');
    }
  }

  function syncNames(){
    const s=$('calendarExportPerson');
    if(!s||!state?.people)return;
    const n0=peopleName(0),n1=peopleName(1);
    if(s.options[0])s.options[0].textContent=n0;
    if(s.options[1])s.options[1].textContent=n1;
    if(s.options[2])s.options[2].textContent=`${n0} + ${n1}`;
  }

  // Capture phase intentionally wins over the older v0.9.2 inline exporter.
  $('exportBriefingsIcs')?.addEventListener('click',e=>{
    e.preventDefault();e.stopImmediatePropagation();deliver('briefing');
  },true);
  $('exportFlightsIcs')?.addEventListener('click',e=>{
    e.preventDefault();e.stopImmediatePropagation();deliver('flight');
  },true);

  syncNames();
  ['name0','name1'].forEach(id=>$(id)?.addEventListener('input',()=>setTimeout(syncNames,0)));
})();

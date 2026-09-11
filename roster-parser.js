(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RosterParser = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY_RE = '(Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
  const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

  // CrewLink can export at least two time bases. Miguel's sample is UTC; Nicole's
  // explicitly says "Local times at event airport". Do not treat them as the same.
  // We only need the event airport's IANA zone to turn a local wall time into an instant.
  // Unknown bases are rejected rather than silently assumed to be UTC.
  const AIRPORT_TZ = {
    HAJ:'Europe/Berlin', HER:'Europe/Athens', KGS:'Europe/Athens', RHO:'Europe/Athens', CFU:'Europe/Athens',
    HRG:'Africa/Cairo', FUE:'Atlantic/Canary', ADB:'Europe/Istanbul', ASR:'Europe/Istanbul', PMI:'Europe/Madrid',
    VIE:'Europe/Vienna', BER:'Europe/Berlin', FMO:'Europe/Berlin', NUE:'Europe/Berlin', LNZ:'Europe/Vienna',
    LGW:'Europe/London', DUS:'Europe/Berlin', MAN:'Europe/London', GRQ:'Europe/Amsterdam', CGN:'Europe/Berlin',
    AYT:'Europe/Istanbul', FRA:'Europe/Berlin', MUC:'Europe/Berlin', AMS:'Europe/Amsterdam', ATH:'Europe/Athens',
    CHQ:'Europe/Athens', SKG:'Europe/Athens', BCN:'Europe/Madrid', MAD:'Europe/Madrid', LIS:'Europe/Lisbon',
    OPO:'Europe/Lisbon', VCE:'Europe/Rome', FCO:'Europe/Rome', MXP:'Europe/Rome', ZRH:'Europe/Zurich',
    PRG:'Europe/Prague', BUD:'Europe/Budapest', WAW:'Europe/Warsaw', CPH:'Europe/Copenhagen', ARN:'Europe/Stockholm'
  };

  function cleanText(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/[\u00A0\t]+/g, ' ')
      .replace(/ +\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  function parsePeriod(text) {
    const m = text.match(/Period:\s*(\d{2})([A-Z][a-z]{2})(\d{2})\s*-\s*(\d{2})([A-Z][a-z]{2})(\d{2})/i);
    if (!m) return null;
    const sm = MONTHS[m[2][0].toUpperCase()+m[2].slice(1,3).toLowerCase()];
    const em = MONTHS[m[5][0].toUpperCase()+m[5].slice(1,3).toLowerCase()];
    if (sm == null || em == null) return null;
    let sy=2000+Number(m[3]), ey=2000+Number(m[6]);
    if (ey < sy) ey = sy;
    return { start:new Date(Date.UTC(sy,sm,Number(m[1]))), end:new Date(Date.UTC(ey,em,Number(m[4]))) };
  }

  function parseCrewName(text) {
    const m = text.match(/Individual duty plan\s+for\s+([A-Z0-9]{2,5})\s+(.+?)\s+NetLine\/Crew/i);
    if (!m) return null;
    return {crewCode:m[1].trim(), name:m[2].replace(/\s{2,}/g,' ').trim()};
  }

  function parseTimeBasis(text) {
    return /Local times at event airport/i.test(text) ? 'local_event' : 'utc';
  }

  function airportTimeZone(iata) { return AIRPORT_TZ[String(iata||'').toUpperCase()] || null; }

  function dateFromDay(period, day) {
    const base=period?period.start:new Date(); let y=base.getUTCFullYear(), mon=base.getUTCMonth();
    if (period && (period.end.getUTCFullYear()!==y || period.end.getUTCMonth()!==mon)) {
      const startDay=period.start.getUTCDate(); if(day<startDay){y=period.end.getUTCFullYear();mon=period.end.getUTCMonth();}
    }
    return new Date(Date.UTC(y,mon,day));
  }

  function plusDay(d,n=1){const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x;}
  function isoDay(d){return new Date(d).toISOString().slice(0,10);}
  function parseDuration(s){const m=String(s||'').match(/(\d{1,3}):(\d{2})/);return m?Number(m[1])+Number(m[2])/60:null;}
  function minutesBetween(a,b){return Math.round((new Date(b)-new Date(a))/60000);}
  function minutesFromHours(h){return h==null?null:Math.round(Number(h)*60);}

  function splitHHMM(hhmm){const s=String(hhmm||'').replace(/\D/g,'').slice(0,4).padStart(4,'0');return [Number(s.slice(0,2)),Number(s.slice(2,4))];}
  function setUtcWallTime(date,hhmm){const [h,mi]=splitHHMM(hhmm);const d=new Date(date);d.setUTCHours(h,mi,0,0);return d;}

  function tzOffsetMillis(date,timeZone){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return Date.UTC(+o.year,+o.month-1,+o.day,+o.hour,+o.minute,+o.second)-date.getTime();
  }
  function zonedToUtc(y,m,d,h,mi,timeZone){
    let guess=new Date(Date.UTC(y,m-1,d,h,mi,0));
    let off=tzOffsetMillis(guess,timeZone); guess=new Date(guess.getTime()-off);
    const off2=tzOffsetMillis(guess,timeZone); if(off2!==off) guess=new Date(Date.UTC(y,m-1,d,h,mi,0)-off2);
    return guess;
  }
  function wallTimeToInstant(date,hhmm,timeZone){
    const [h,mi]=splitHHMM(hhmm); const y=date.getUTCFullYear(),m=date.getUTCMonth()+1,d=date.getUTCDate();
    return timeZone==='UTC' ? new Date(Date.UTC(y,m-1,d,h,mi,0)) : zonedToUtc(y,m,d,h,mi,timeZone);
  }
  function zonedParts(date,timeZone){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date));
    return Object.fromEntries(parts.map(p=>[p.type,p.value]));
  }
  function wallClockAtInstant(date,timeZone){const p=zonedParts(date,timeZone);return `${p.hour}${p.minute}`;}
  function calendarDateAtInstant(date,timeZone){const p=zonedParts(date,timeZone);return new Date(Date.UTC(+p.year,+p.month-1,+p.day));}

  function routeFromFlights(flights){if(!flights.length)return '';const pts=[flights[0].dep];flights.forEach(f=>pts.push(f.arr));return pts.join('–');}

  function parseFlights(block){
    // Nicole's CrewLink local-time export prefixes times with ! when the event is in a
    // different timezone from the departure airport, and uses +1 for next day. Miguel's
    // UTC export has neither. Accept both without losing the markers.
    const re=new RegExp('(?:^|\\n)\\s*(?:'+DAY_RE+'\\d{2}\\s+)?([A-Z0-9]{2,3})\\s+(\\d{1,4}[A-Z]?)\\s+([A-Z]{3})\\s+(!?)(\\d{4})(?:\\+(\\d+))?\\s+(!?)(\\d{4})(?:\\+(\\d+))?\\s+([A-Z]{3})\\s+([A-Z0-9]{3,5})\\b','gmi');
    const out=[];let m;
    while((m=re.exec(block))){
      // DAY_RE contributes capture 1, therefore flight captures start at 2.
      const f={carrier:m[2],number:m[3],dep:m[4],depTime:m[6],depMarked:m[5]==='!',depDayOffset:Number(m[7]||0),arrTime:m[9],arrMarked:m[8]==='!',arrDayOffset:Number(m[10]||0),arr:m[11],aircraft:m[12]};
      const key=[f.carrier,f.number,f.dep,f.depTime,f.depDayOffset,f.arrTime,f.arrDayOffset,f.arr].join('|');
      if(!out.some(x=>x._key===key)) out.push({...f,_key:key});
    }
    return out.map(({_key,...x})=>x);
  }

  function getField(block,name){const m=block.match(new RegExp('\\['+name+'\\s+([^\\]]+)\\]','i'));return m?m[1].replace(/\s+/g,' ').trim():null;}

  function operationalDateBefore(text,pos,period){
    const prefix=text.slice(Math.max(0,pos-1800),pos);
    const re=new RegExp('(?:^|\\n)\\s*'+DAY_RE+'(\\d{2})\\s+(?=(?:C\\/I|C\\/O|[A-Z0-9]{2,3}\\s+\\d{1,4}))','gmi');
    let m,last=null;while((m=re.exec(prefix)))last=m;return last?dateFromDay(period,Number(last[2])):null;
  }

  function collectBlocks(text){
    const ci=/\bC\/I\b\s+([A-Z]{3})\s+!?([0-9]{4})/g; const starts=[];let m;
    while((m=ci.exec(text))){
      const lineStart=text.lastIndexOf('\n',m.index)+1;const before=text.slice(lineStart,m.index);
      const dm=before.match(new RegExp('^\\s*'+DAY_RE+'(\\d{2})\\b','i'));
      starts.push({index:m.index,lineStart,base:m[1],time:m[2],explicitDay:dm?Number(dm[2]):null});
    }
    return starts;
  }

  function parseStructuralBlock(text,start,end){
    const block=text.slice(start.lineStart,end);
    const coRe=new RegExp('(?:^|\\n)\\s*(?:'+DAY_RE+'(\\d{2})\\s+)?C\\/O\\s+(!?)(\\d{4})(?:\\+(\\d+))?\\s+([A-Z]{3})','im');
    const co=coRe.exec(block); const flightBlock=co?block.slice(0,co.index):block; const flights=parseFlights(flightBlock);
    return {...start,block,coDay:co&&co[2]?Number(co[2]):null,coMarked:!!(co&&co[3]==='!'),coTime:co?co[4]:null,coDayOffset:co?Number(co[5]||0):0,coBase:co?co[6]:start.base,
      flights,route:routeFromFlights(flights),type:getField(block,'TYPE')||'N/A',ft:getField(block,'FT'),dt:getField(block,'DT'),fdt:getField(block,'FDT'),max:getField(block,'max'),sdt:getField(block,'SDT'),dp:getField(block,'DP'),fdp:getField(block,'FDP'),rt:getField(block,'RT'),brk:getField(block,'BRK'),xfdp:getField(block,'xFDP'),acc:getField(block,'ACC'),ln:getField(block,'LN')};
  }

  function zoneFor(timeBasis,airport){return timeBasis==='local_event'?airportTimeZone(airport):'UTC';}

  function chooseCheckInDate(text,s,period,previous,timeBasis){
    let candidate=s.explicitDay?dateFromDay(period,s.explicitDay):null;let source=s.explicitDay?'explicit':null;
    const sourceZone=zoneFor(timeBasis,s.base);
    if(previous&&previous.checkout&&previous.brk&&sourceZone){
      const brkH=parseDuration(previous.brk);
      if(brkH!=null){
        const expected=new Date(new Date(previous.checkout).getTime()+brkH*3600000);
        const sameClock=wallClockAtInstant(expected,sourceZone)===s.time;
        if(!candidate&&sameClock){candidate=calendarDateAtInstant(expected,sourceZone);source='previous-brk';}
        if(candidate&&sameClock){
          const cand=wallTimeToInstant(candidate,s.time,sourceZone);const diff=Math.abs(cand-expected);
          if(diff>=20*3600000&&Math.abs(diff/86400000-Math.round(diff/86400000))<0.08){candidate=calendarDateAtInstant(expected,sourceZone);source='previous-brk-reconciled';}
        }
      }
    }
    if(!candidate){const nearby=operationalDateBefore(text,s.index,period);if(nearby){candidate=nearby;source='nearby-row';}}
    if(!candidate&&previous){
      const prevZone=sourceZone||'UTC'; let d=calendarDateAtInstant(previous.checkIn,prevZone); let x=wallTimeToInstant(d,s.time,prevZone);
      while(previous.checkout&&x<new Date(previous.checkout)){d=plusDay(d,1);x=wallTimeToInstant(d,s.time,prevZone);} candidate=d;source='chronological';
    }
    if(!candidate){candidate=period?new Date(period.start):new Date();source='fallback';}
    return {date:candidate,source};
  }

  function buildDuties(text,period,structures,timeBasis){
    const duties=[];let previous=null;
    for(const s of structures){
      const chosen=chooseCheckInDate(text,s,period,previous,timeBasis);const baseDate=chosen.date;
      const ciZone=zoneFor(timeBasis,s.base); const unknownZones=[]; if(!ciZone)unknownZones.push(s.base);
      const checkIn=wallTimeToInstant(baseDate,s.time,ciZone||'UTC'); let checkout=null,outDate=null;
      const coBase=s.coBase||s.base; const coZone=zoneFor(timeBasis,coBase); if(timeBasis==='local_event'&&!coZone)unknownZones.push(coBase);
      if(s.coTime){
        outDate=s.coDay?dateFromDay(period,s.coDay):plusDay(baseDate,s.coDayOffset||0);
        checkout=wallTimeToInstant(outDate,s.coTime,coZone||'UTC');
        while(checkout<=checkIn){outDate=plusDay(outDate,1);checkout=wallTimeToInstant(outDate,s.coTime,coZone||'UTC');}
      }else if(s.dt){const h=parseDuration(s.dt);if(h!=null){checkout=new Date(checkIn.getTime()+h*3600000);outDate=timeBasis==='local_event'&&coZone?calendarDateAtInstant(checkout,coZone):calendarDateAtInstant(checkout,'UTC');}}
      const duty={kind:'duty',date:isoDay(baseDate),base:s.base,checkIn:checkIn.toISOString(),checkout:checkout?checkout.toISOString():null,checkoutBase:coBase,
        type:s.type,ft:s.ft,dt:s.dt,fdt:s.fdt,max:s.max,sdt:s.sdt,dp:s.dp,fdp:s.fdp,rt:s.rt,brk:s.brk,xfdp:s.xfdp,acc:s.acc,ln:s.ln,flights:s.flights,route:s.route,dutyHours:s.dt?parseDuration(s.dt):(checkout?(checkout-checkIn)/3600000:null),parserDateSource:chosen.source,
        timeBasis,sourceCheckInDate:isoDay(baseDate),sourceCheckInTime:s.time,sourceCheckInAirport:s.base,sourceCheckInTimeZone:ciZone,
        sourceCheckOutDate:outDate?isoDay(outDate):null,sourceCheckOutTime:s.coTime,sourceCheckOutAirport:coBase,sourceCheckOutTimeZone:coZone,sourceCheckOutMarked:s.coMarked,
        parserUnknownTimeZones:[...new Set(unknownZones)]};
      duties.push(duty);previous=duty;
    }
    return duties;
  }

  function dedupe(list){
    const map=new Map();for(const d of list){const k=d.kind==='status'?`s|${d.date}|${d.status}`:`d|${d.checkIn}|${d.route||d.base||''}`;const richness=(d.checkout?3:0)+(d.route?2:0)+(d.dt?1:0)+(d.flights?.length||0);const old=map.get(k);if(!old||richness>=old.richness)map.set(k,{d,richness});}return [...map.values()].map(x=>x.d);
  }

  function validateDuties(duties,timeBasis){
    const flying=duties.filter(d=>d.kind==='duty').sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
    const operationalStatuses=duties.filter(d=>d.kind==='status'&&['STBY','RES','SIM','TRG'].includes(String(d.status||'').toUpperCase()));
    const errors=[],warnings=[];let minGapMinutes=null,overlaps=0,inferredDates=0,brkMatches=0;
    for(let i=0;i<flying.length;i++){
      const d=flying[i];if(d.parserDateSource!=='explicit')inferredDates++;
      if(timeBasis==='local_event'&&d.parserUnknownTimeZones?.length) errors.push(`No conozco la zona horaria del aeropuerto ${d.parserUnknownTimeZones.join(', ')} en un roster de horas locales.`);
      if(!d.route) warnings.push(`Duty ${d.date} ${d.base||''}: no se pudo reconstruir la ruta a partir de los sectores.`);
      if(!d.checkout) errors.push(`Duty ${d.date} ${d.route||d.base||''}: no se pudo determinar C/O.`);
      if(d.checkout&&d.dt){const actual=minutesBetween(d.checkIn,d.checkout),stated=minutesFromHours(parseDuration(d.dt));if(Math.abs(actual-stated)>10)errors.push(`Duty ${d.date} ${d.route||d.base||''}: DT ${d.dt} no coincide con C/I–C/O (${actual} min).`);}
      if(i>0){const prev=flying[i-1];if(prev.checkout){const gap=minutesBetween(prev.checkout,d.checkIn);minGapMinutes=minGapMinutes==null?gap:Math.min(minGapMinutes,gap);if(gap<0){overlaps++;errors.push(`Solapamiento: ${prev.date} ${prev.route||prev.base||''} termina después de que empiece ${d.date} ${d.route||d.base||''}.`);}else if(gap<120)warnings.push(`Intervalo muy corto (${gap} min) entre ${prev.date} y ${d.date}; conviene revisar el PDF.`);if(prev.brk){
            const hasIntermediateOperationalStatus=operationalStatuses.some(x=>x.date>prev.date&&x.date<=d.date);
            if(!hasIntermediateOperationalStatus){const expected=minutesFromHours(parseDuration(prev.brk));if(expected!=null){if(Math.abs(gap-expected)<=10)brkMatches++;else if(gap>=0&&Math.abs(gap-expected)>30)warnings.push(`BRK ${prev.brk} no coincide con el intervalo calculado (${Math.floor(gap/60)}:${String(gap%60).padStart(2,'0')}) tras ${prev.date}.`);}}
          }}}
    }
    const at=new Map();for(const d of flying){const k=d.checkIn,old=at.get(k);if(old&&(old.route||'')!==(d.route||''))errors.push(`Dos duties distintos tienen el mismo C/I: ${d.checkIn.slice(0,16)} (${old.route||'?'} / ${d.route||'?'}).`);else at.set(k,d);}
    return {ok:errors.length===0,errors:[...new Set(errors)],warnings:[...new Set(warnings)],stats:{duties:flying.length,overlaps,inferredDates,brkMatches,minGapMinutes,timeBasis}};
  }

  function parseCrewLinkText(input){
    const text=cleanText(input);const period=parsePeriod(text);const crew=parseCrewName(text);const timeBasis=parseTimeBasis(text);const starts=collectBlocks(text);
    const structures=starts.map((s,i)=>parseStructuralBlock(text,s,i+1<starts.length?starts[i+1].lineStart:Math.min(text.length,s.index+5000)));
    let duties=buildDuties(text,period,structures,timeBasis);
    const seenStatus=new Set();
    // Keep timing for STBY/RES/SIM/TRG so the FTL engine can evaluate standby,
    // reserve and cumulative duty. Same-time RES (0000-0000) is interpreted as
    // a 24 h reserve period; OFF/ROFF remain all-day status markers.
    const dayLineRe=new RegExp('(?:^|\\n)[ \t]*'+DAY_RE+'(\\d{2})[ \t]+(ROFF|OFF|RES|SBY|STBY|STAND-BY|STAND[ \t]+BY|VAC|ABS|SIM|TRG|ERRP)\\b(?:[ \t]+([A-Z]{3}))?(?:[ \t]+!?([0-9]{4})[ \t]+!?([0-9]{4}))?','gmi');
    let m;while((m=dayLineRe.exec(text))){
      const dayDate=dateFromDay(period,Number(m[2])); const date=isoDay(dayDate); let status=m[3].toUpperCase().replace(/\s+/g,'-'); if(status==='STAND-BY'||status==='STBY'||status==='SBY')status='STBY';
      const base=m[4]||null, startRaw=m[5]||null, endRaw=m[6]||null; const k=date+'|'+status; if(seenStatus.has(k))continue; seenStatus.add(k);
      const item={kind:'status',date,status,base,timeBasis};
      if(startRaw&&endRaw&&['STBY','RES','SIM','TRG','ERRP'].includes(status)){
        const z=zoneFor(timeBasis,base)||'UTC'; let st=wallTimeToInstant(dayDate,startRaw,z), en=wallTimeToInstant(dayDate,endRaw,z); if(en<=st)en=wallTimeToInstant(plusDay(dayDate,1),endRaw,z);
        item.statusStart=st.toISOString(); item.statusEnd=en.toISOString(); item.statusHours=(en-st)/3600000; item.sourceStatusStart=startRaw; item.sourceStatusEnd=endRaw;
      }
      duties.push(item);
    }
    duties=dedupe(duties).sort((a,b)=>(a.checkIn||a.date).localeCompare(b.checkIn||b.date));const validation=validateDuties(duties,timeBasis);
    return {period,crew,duties,validation,timeBasis,rawLength:text.length};
  }

  return {parseCrewLinkText,parsePeriod,parseCrewName,parseDuration,validateDuties,parseTimeBasis,airportTimeZone};
});

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RosterParser = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY_RE = '(Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
  const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

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
    return {
      start: new Date(Date.UTC(sy, sm, Number(m[1]))),
      end: new Date(Date.UTC(ey, em, Number(m[4])))
    };
  }

  function parseCrewName(text) {
    const m = text.match(/Individual duty plan\s+for\s+([A-Z0-9]{2,5})\s+(.+?)\s+NetLine\/Crew/i);
    if (!m) return null;
    return { crewCode: m[1].trim(), name: m[2].replace(/\s{2,}/g, ' ').trim() };
  }

  function dateFromDay(period, day) {
    const base = period ? period.start : new Date();
    let y = base.getUTCFullYear(), mon = base.getUTCMonth();
    if (period && (period.end.getUTCFullYear() !== y || period.end.getUTCMonth() !== mon)) {
      const startDay = period.start.getUTCDate();
      if (day < startDay) { y = period.end.getUTCFullYear(); mon = period.end.getUTCMonth(); }
    }
    return new Date(Date.UTC(y, mon, day));
  }

  function setTime(date, hhmm) {
    const s = String(hhmm).padStart(4, '0');
    const d = new Date(date);
    d.setUTCHours(Number(s.slice(0,2)), Number(s.slice(2,4)), 0, 0);
    return d;
  }
  function plusDay(d, n=1) { const x = new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; }
  function parseDuration(s) {
    const m = String(s||'').match(/(\d{1,3}):(\d{2})/);
    if (!m) return null;
    return Number(m[1]) + Number(m[2])/60;
  }
  function minutesBetween(a,b){ return Math.round((new Date(b)-new Date(a))/60000); }
  function minutesFromHours(h){ return Math.round(Number(h||0)*60); }
  function isoDay(d){ return new Date(d).toISOString().slice(0,10); }
  function hhmmUTC(d){ const x=new Date(d); return String(x.getUTCHours()).padStart(2,'0')+String(x.getUTCMinutes()).padStart(2,'0'); }

  function routeFromFlights(flights) {
    if (!flights.length) return '';
    const pts = [flights[0].dep];
    flights.forEach(f => pts.push(f.arr));
    return pts.join('–');
  }

  function parseFlights(block) {
    const re = /\b([A-Z0-9]{2,3})\s+(\d{1,4}[A-Z]?)\s+([A-Z]{3})\s+(\d{4})\s+(\d{4})\s+([A-Z]{3})\s+([A-Z0-9]{3,5})\b/g;
    const out = [];
    let m;
    while ((m = re.exec(block))) {
      const f = { carrier:m[1], number:m[2], dep:m[3], depTime:m[4], arrTime:m[5], arr:m[6], aircraft:m[7] };
      const key = [f.carrier,f.number,f.dep,f.depTime,f.arrTime,f.arr].join('|');
      if (!out.some(x => x._key === key)) out.push({...f,_key:key});
    }
    return out.map(({_key,...x}) => x);
  }

  function getField(block, name) {
    const m = block.match(new RegExp('\\['+name+'\\s+([^\\]]+)\\]','i'));
    return m ? m[1].replace(/\s+/g,' ').trim() : null;
  }

  function operationalDateBefore(text, pos, period) {
    // Only inspect actual detail rows. Never use the repeated monthly CRM header as a date anchor.
    const prefix = text.slice(Math.max(0,pos-1800), pos);
    const re = new RegExp('(?:^|\\n)\\s*'+DAY_RE+'(\\d{2})\\s+(?=(?:C\\/I|C\\/O|[A-Z0-9]{2,3}\\s+\\d{1,4}))','gmi');
    let m, last=null;
    while ((m=re.exec(prefix))) last=m;
    return last ? dateFromDay(period, Number(last[2])) : null;
  }

  function collectBlocks(text) {
    const ci = /\bC\/I\b\s+([A-Z]{3})\s+(\d{4})/g;
    const starts=[]; let m;
    while ((m=ci.exec(text))) {
      const lineStart=text.lastIndexOf('\n',m.index)+1;
      const before=text.slice(lineStart,m.index);
      const dm=before.match(new RegExp('^\\s*'+DAY_RE+'(\\d{2})\\b','i'));
      starts.push({index:m.index, lineStart, base:m[1], time:m[2], explicitDay:dm?Number(dm[2]):null});
    }
    return starts;
  }

  function parseStructuralBlock(text, start, end) {
    const block=text.slice(start.lineStart, end);
    const coRe=new RegExp('(?:^|\\n)\\s*(?:'+DAY_RE+'(\\d{2})\\s+)?C\\/O\\s+(\\d{4})\\s+([A-Z]{3})','im');
    const co=coRe.exec(block);
    const flightBlock=co ? block.slice(0,co.index) : block;
    const flights=parseFlights(flightBlock);
    return {
      ...start,
      block,
      coDay:co&&co[2]?Number(co[2]):null,
      coTime:co?co[3]:null,
      coBase:co?co[4]:start.base,
      flights,
      route:routeFromFlights(flights),
      type:getField(block,'TYPE') || 'N/A',
      ft:getField(block,'FT'),
      dt:getField(block,'DT'),
      fdt:getField(block,'FDT'),
      max:getField(block,'max'),
      sdt:getField(block,'SDT'),
      dp:getField(block,'DP'),
      fdp:getField(block,'FDP'),
      rt:getField(block,'RT'),
      brk:getField(block,'BRK'),
      xfdp:getField(block,'xFDP'),
      acc:getField(block,'ACC'),
      ln:getField(block,'LN')
    };
  }

  function chooseCheckInDate(text, s, period, previous) {
    let candidate=s.explicitDay ? dateFromDay(period,s.explicitDay) : null;
    let source=s.explicitDay ? 'explicit' : null;

    // BRK in CrewLink is an excellent continuity check for this layout: the following C/I
    // should occur exactly BRK after the previous C/O. Use it to date undated C/I rows.
    if (previous && previous.checkout && previous.brk) {
      const brkH=parseDuration(previous.brk);
      if (brkH != null) {
        const expected=new Date(new Date(previous.checkout).getTime()+brkH*3600000);
        const sameClock=hhmmUTC(expected)===s.time;
        if (!candidate && sameClock) { candidate=new Date(Date.UTC(expected.getUTCFullYear(),expected.getUTCMonth(),expected.getUTCDate())); source='previous-brk'; }
        // If an extraction artifact attached the wrong day to this C/I, trust BRK only when
        // the clock time matches exactly and the candidate is off by whole days.
        if (candidate && sameClock) {
          const cand=setTime(candidate,s.time);
          const diff=Math.abs(cand-expected);
          if (diff>=20*3600000 && Math.abs(diff/86400000-Math.round(diff/86400000))<0.03) {
            candidate=new Date(Date.UTC(expected.getUTCFullYear(),expected.getUTCMonth(),expected.getUTCDate()));
            source='previous-brk-reconciled';
          }
        }
      }
    }

    if (!candidate) {
      const nearby=operationalDateBefore(text,s.index,period);
      if (nearby) { candidate=nearby; source='nearby-row'; }
    }

    if (!candidate && previous) {
      let d=new Date(Date.UTC(new Date(previous.checkIn).getUTCFullYear(),new Date(previous.checkIn).getUTCMonth(),new Date(previous.checkIn).getUTCDate()));
      let x=setTime(d,s.time);
      // A later report on the same UTC day may be valid. If it would precede the previous C/O,
      // roll forward until the sequence is chronological.
      while (previous.checkout && x < new Date(previous.checkout)) { d=plusDay(d,1); x=setTime(d,s.time); }
      candidate=d; source='chronological';
    }

    if (!candidate) { candidate=period ? new Date(period.start) : new Date(); source='fallback'; }
    return {date:candidate, source};
  }

  function buildDuties(text, period, structures) {
    const duties=[]; let previous=null;
    for (const s of structures) {
      const chosen=chooseCheckInDate(text,s,period,previous);
      const baseDate=chosen.date;
      const checkIn=setTime(baseDate,s.time);
      let checkout=null;
      if (s.coTime) {
        const outDate=s.coDay ? dateFromDay(period,s.coDay) : new Date(baseDate);
        checkout=setTime(outDate,s.coTime);
        while (checkout<=checkIn) checkout=plusDay(checkout,1);
      } else if (s.dt) {
        const h=parseDuration(s.dt);
        if (h!=null) checkout=new Date(checkIn.getTime()+h*3600000);
      }
      const duty={
        kind:'duty', date:isoDay(checkIn), base:s.base, checkIn:checkIn.toISOString(),
        checkout:checkout?checkout.toISOString():null, checkoutBase:s.coBase||s.base,
        type:s.type, ft:s.ft, dt:s.dt, fdt:s.fdt, max:s.max, sdt:s.sdt, dp:s.dp,
        fdp:s.fdp, rt:s.rt, brk:s.brk, xfdp:s.xfdp, acc:s.acc, ln:s.ln,
        flights:s.flights, route:s.route,
        dutyHours:s.dt ? parseDuration(s.dt) : (checkout ? (checkout-checkIn)/3600000 : null),
        parserDateSource:chosen.source
      };
      duties.push(duty); previous=duty;
    }
    return duties;
  }

  function dedupe(list) {
    const map=new Map();
    for (const d of list) {
      const k=d.kind==='status' ? `s|${d.date}|${d.status}` : `d|${d.checkIn}|${d.route||d.base||''}`;
      const richness=(d.checkout?3:0)+(d.route?2:0)+(d.dt?1:0)+(d.flights?.length||0);
      const old=map.get(k);
      if (!old || richness>=old.richness) map.set(k,{d,richness});
    }
    return [...map.values()].map(x=>x.d);
  }

  function validateDuties(duties) {
    const flying=duties.filter(d=>d.kind==='duty').sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
    const errors=[], warnings=[];
    let minGapMinutes=null, overlaps=0, inferredDates=0, brkMatches=0;
    for (let i=0;i<flying.length;i++) {
      const d=flying[i];
      if (d.parserDateSource!=='explicit') inferredDates++;
      if (!d.checkout) errors.push(`Duty ${d.date} ${d.route||d.base||''}: no se pudo determinar C/O.`);
      if (d.checkout && d.dt) {
        const actual=minutesBetween(d.checkIn,d.checkout), stated=minutesFromHours(parseDuration(d.dt));
        if (Math.abs(actual-stated)>10) errors.push(`Duty ${d.date} ${d.route||d.base||''}: DT ${d.dt} no coincide con C/I–C/O (${actual} min).`);
      }
      if (i>0) {
        const prev=flying[i-1];
        if (prev.checkout) {
          const gap=minutesBetween(prev.checkout,d.checkIn);
          minGapMinutes=minGapMinutes==null?gap:Math.min(minGapMinutes,gap);
          if (gap<0) { overlaps++; errors.push(`Solapamiento: ${prev.date} ${prev.route||prev.base||''} termina después de que empiece ${d.date} ${d.route||d.base||''}.`); }
          else if (gap<120) warnings.push(`Intervalo muy corto (${gap} min) entre ${prev.date} y ${d.date}; conviene revisar el PDF.`);
          if (prev.brk) {
            const expected=minutesFromHours(parseDuration(prev.brk));
            if (expected!=null) {
              if (Math.abs(gap-expected)<=10) brkMatches++;
              else if (gap>=0 && Math.abs(gap-expected)>30) warnings.push(`BRK ${prev.brk} no coincide con el intervalo calculado (${Math.floor(gap/60)}:${String(gap%60).padStart(2,'0')}) tras ${prev.date}.`);
            }
          }
        }
      }
    }
    // Contradictory duties at the exact same report time are never silently accepted.
    const at=new Map();
    for(const d of flying){
      const k=d.checkIn; const old=at.get(k);
      if(old && (old.route||'')!==(d.route||'')) errors.push(`Dos duties distintos tienen el mismo C/I: ${d.checkIn.slice(0,16)} (${old.route||'?'} / ${d.route||'?'}).`);
      else at.set(k,d);
    }
    return {ok:errors.length===0, errors, warnings, stats:{duties:flying.length, overlaps, inferredDates, brkMatches, minGapMinutes}};
  }

  function parseCrewLinkText(input) {
    const text=cleanText(input);
    const period=parsePeriod(text);
    const crew=parseCrewName(text);
    const starts=collectBlocks(text);
    const structures=starts.map((s,i)=>parseStructuralBlock(text,s,i+1<starts.length?starts[i+1].lineStart:Math.min(text.length,s.index+5000)));
    let duties=buildDuties(text,period,structures);

    const seenStatus=new Set();
    const dayLineRe=new RegExp('(?:^|\\n)\\s*'+DAY_RE+'(\\d{2})\\s+(ROFF|OFF|RES|SBY|STBY|VAC|ABS|SIM|TRG)\\b(?:\\s+([A-Z]{3}))?','gmi');
    let m;
    while((m=dayLineRe.exec(text))){
      const date=dateFromDay(period,Number(m[2])).toISOString().slice(0,10), status=m[3].toUpperCase();
      const k=date+'|'+status; if(seenStatus.has(k)) continue; seenStatus.add(k);
      duties.push({kind:'status',date,status,base:m[4]||null});
    }

    duties=dedupe(duties).sort((a,b)=>(a.checkIn||a.date).localeCompare(b.checkIn||b.date));
    const validation=validateDuties(duties);
    return {period,crew,duties,validation,rawLength:text.length};
  }

  return {parseCrewLinkText,parsePeriod,parseCrewName,parseDuration,validateDuties};
});

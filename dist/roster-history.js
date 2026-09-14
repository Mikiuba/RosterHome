(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RosterHistory=api;})(typeof self!=='undefined'?self:this,function(){
  const DAY=86400000;
  function addDay(key,n){return new Date(Date.parse(key+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);}
  function civil(instant,zone){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;}
  function instant(date,time,zone){
    const wall=Date.parse(date+'T'+time+'Z');let guess=wall;
    for(let i=0;i<3;i++){const next=wall-(Date.parse(civil(guess,zone)+'Z')-guess);if(next===guess)break;guess=next;}
    return guess;
  }
  function replaceCoverage(old,incoming){
    if(!incoming?.start||!incoming?.end)return old||[];
    const next=[];
    for(const c of old||[]){
      if(c.end<incoming.start||c.start>incoming.end){next.push(c);continue;}
      if(c.start<incoming.start)next.push({...c,end:addDay(incoming.start,-1)});
      if(c.end>incoming.end)next.push({...c,start:addDay(incoming.end,1)});
    }
    return [...next,incoming].sort((a,b)=>a.start.localeCompare(b.start));
  }
  function gaps(coverage,start,end){
    if(end<=start)return [];
    const ranges=(coverage||[]).filter(c=>c.complete&&c.parserVersion>=2&&c.timeZone).map(c=>[instant(c.start,'00:00:00',c.timeZone),instant(addDay(c.end,1),'00:00:00',c.timeZone)]).sort((a,b)=>a[0]-b[0]);
    let cursor=start;const out=[];
    for(const [a,b] of ranges){if(b<=cursor)continue;if(a>=end)break;if(a>cursor)out.push([cursor,Math.min(a,end)]);cursor=Math.max(cursor,b);if(cursor>=end)break;}
    if(cursor<end)out.push([cursor,end]);return out;
  }
  function duration(s){const m=String(s||'').match(/^(\d+):(\d{2})$/);return m?+m[1]*60+(+m[2]):null;}
  function record(d,airportZone){
    const startMs=Date.parse(d.checkIn),endMs=Date.parse(d.checkout),elapsed=(endMs-startMs)/60000;
    const dutyMinutes=d.dutyCreditMinutes??duration(d.sdt)??duration(d.dt)??elapsed;
    const flightMinutes=duration(d.ft)||0,flightSegments=[];let cursor=startMs;
    for(const f of d.flights||[]){
      const dz=d.timeBasis==='local_event'?airportZone(f.dep):'UTC',az=d.timeBasis==='local_event'?airportZone(f.arr):'UTC';
      if(!dz||!az||!f.depTime||!f.arrTime)continue;
      const hh=s=>s.slice(0,2)+':'+s.slice(2)+':00';
      let dep=instant(addDay(d.sourceCheckInDate||d.date,f.depDayOffset||0),hh(f.depTime),dz);
      while(dep<cursor)dep+=DAY;
      let arr=instant(addDay(d.sourceCheckInDate||d.date,f.arrDayOffset||0),hh(f.arrTime),az);
      while(arr<dep)arr+=DAY;
      flightSegments.push([dep,arr]);cursor=arr;
    }
    const sum=flightSegments.reduce((n,[a,b])=>n+(b-a)/60000,0);
    const flightTimingKnown=Math.abs(sum-flightMinutes)<=1&&flightSegments.every(([a,b])=>a>=startMs&&b<=endMs);
    return {startMs,endMs,dutyMinutes,flightMinutes,flightSegments,flightTimingKnown};
  }
  function cumulative(records,index,days,zone){
    const end=records[index].endMs,day=civil(end,zone).slice(0,10),start=instant(addDay(day,1-days),'00:00:00',zone);
    let duty=0,flight=0,flightTimingKnown=true;
    const overlap=(a,b)=>Math.max(0,Math.min(b,end)-Math.max(a,start));
    for(const r of records.slice(0,index+1)){
      const hit=overlap(r.startMs,r.endMs);if(!hit)continue;
      duty+=r.dutyMinutes*hit/(r.endMs-r.startMs);
      if(r.flightTimingKnown)flight+=r.flightSegments.reduce((n,[a,b])=>n+overlap(a,b)/60000,0);
      else{flight+=r.flightMinutes;flightTimingKnown=false;}
    }
    return {start,end,duty,flight,flightTimingKnown};
  }
  return {addDay,civil,instant,replaceCoverage,gaps,record,cumulative};
});

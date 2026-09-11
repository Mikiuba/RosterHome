/* RosterHome FTL engine + UI
 * Source basis: Corendon Airlines Europe OM-A Chapter 7 (uploaded Rev 20 manual;
 * Chapter 7 pages mostly Rev 15.0, 15 Jul 2024).
 * This module deliberately returns INDETERMINATE when the roster lacks a datum
 * required by the OM-A instead of silently inventing it.
 */
(function(){
'use strict';

const FTL_VERSION='0.4.0';
const MIN=60000, HOUR=3600000, DAY=86400000;
const OM='OM-A Ch.7';

const TABLE2=[
  {label:'06:00–13:29',ranges:[[360,809]],v:['13:00','12:30','12:00','11:30','11:00','10:30','10:00','09:30','09:00']},
  {label:'13:30–13:59',ranges:[[810,839]],v:['12:45','12:15','11:45','11:15','10:45','10:15','09:45','09:15','09:00']},
  {label:'14:00–14:29',ranges:[[840,869]],v:['12:30','12:00','11:30','11:00','10:30','10:00','09:30','09:00','09:00']},
  {label:'14:30–14:59',ranges:[[870,899]],v:['12:15','11:45','11:15','10:45','10:15','09:45','09:15','09:00','09:00']},
  {label:'15:00–15:29',ranges:[[900,929]],v:['12:00','11:30','11:00','10:30','10:00','09:30','09:00','09:00','09:00']},
  {label:'15:30–15:59',ranges:[[930,959]],v:['11:45','11:15','10:45','10:15','09:45','09:15','09:00','09:00','09:00']},
  {label:'16:00–16:29',ranges:[[960,989]],v:['11:30','11:00','10:30','10:00','09:30','09:00','09:00','09:00','09:00']},
  {label:'16:30–16:59',ranges:[[990,1019]],v:['11:15','10:45','10:15','09:45','09:15','09:00','09:00','09:00','09:00']},
  {label:'17:00–04:59',ranges:[[1020,1439],[0,299]],v:['11:00','10:30','10:00','09:30','09:00','09:00','09:00','09:00','09:00']},
  {label:'05:00–05:14',ranges:[[300,314]],v:['12:00','11:30','11:00','10:30','10:00','09:30','09:00','09:00','09:00']},
  {label:'05:15–05:29',ranges:[[315,329]],v:['12:15','11:45','11:15','10:45','10:15','09:45','09:15','09:00','09:00']},
  {label:'05:30–05:44',ranges:[[330,344]],v:['12:30','12:00','11:30','11:00','10:30','10:00','09:30','09:00','09:00']},
  {label:'05:45–05:59',ranges:[[345,359]],v:['12:45','12:15','11:45','11:15','10:45','10:15','09:45','09:15','09:00']}
];
const TABLE3=['11:00','10:30','10:00','09:30','09:00','09:00','09:00'];
const TABLE4=[
  {label:'06:00–06:14',r:[360,374],v:[null,null,null,null]},
  {label:'06:15–06:29',r:[375,389],v:['13:15','12:45','12:15','11:45']},
  {label:'06:30–06:44',r:[390,404],v:['13:30','13:00','12:30','12:00']},
  {label:'06:45–06:59',r:[405,419],v:['13:45','13:15','12:45','12:15']},
  {label:'07:00–13:29',r:[420,809],v:['14:00','13:30','13:00','12:30']},
  {label:'13:30–13:59',r:[810,839],v:['13:45','13:15','12:45',null]},
  {label:'14:00–14:29',r:[840,869],v:['13:30','13:00','12:30',null]},
  {label:'14:30–14:59',r:[870,899],v:['13:15','12:45','12:15',null]},
  {label:'15:00–15:29',r:[900,929],v:['13:00','12:30','12:00',null]},
  {label:'15:30–15:59',r:[930,959],v:['12:45',null,null,null]},
  {label:'16:00–16:29',r:[960,989],v:['12:30',null,null,null]},
  {label:'16:30–16:59',r:[990,1019],v:['12:15',null,null,null]},
  {label:'17:00–17:29',r:[1020,1049],v:['12:00',null,null,null]},
  {label:'17:30–17:59',r:[1050,1079],v:['11:45',null,null,null]},
  {label:'18:00–18:29',r:[1080,1109],v:['11:30',null,null,null]},
  {label:'18:30–18:59',r:[1110,1139],v:['11:15',null,null,null]},
  {label:'19:00–03:59',r:null,v:[null,null,null,null],wrap:true},
  {label:'04:00–04:14',r:[240,254],v:[null,null,null,null]},
  {label:'04:15–04:29',r:[255,269],v:[null,null,null,null]},
  {label:'04:30–04:44',r:[270,284],v:[null,null,null,null]},
  {label:'04:45–04:59',r:[285,299],v:[null,null,null,null]},
  {label:'05:00–05:14',r:[300,314],v:[null,null,null,null]},
  {label:'05:15–05:29',r:[315,329],v:[null,null,null,null]},
  {label:'05:30–05:44',r:[330,344],v:[null,null,null,null]},
  {label:'05:45–05:59',r:[345,359],v:[null,null,null,null]}
];
const TABLE5={6:[2,2,3,3],9:[2,3,3,4],12:[2,3,4,5]};
const TABLE1={
  lt4:['B','D','D','D','D'],
  le6:['B','X','D','D','D'],
  le9:['B','X','X','D','D'],
  le12:['B','X','X','X','D']
};

function durMin(s){const m=String(s||'').match(/(\d{1,3}):(\d{2})/);return m?(+m[1]*60)+(+m[2]):null;}
function hhmm(min){if(min==null||!Number.isFinite(min))return '—';min=Math.round(min);const sign=min<0?'-':'';min=Math.abs(min);return `${sign}${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;}
function dt(v){return v?new Date(v):null;}
function clampSectors(n){return Math.max(1,Math.floor(Number(n)||0));}
function intlParts(date,tz){const ps=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date));return Object.fromEntries(ps.map(p=>[p.type,p.value]));}
function localMinute(date,tz){const p=intlParts(date,tz);return +p.hour*60 + +p.minute;}
function localKey(date,tz){const p=intlParts(date,tz);return `${p.year}-${p.month}-${p.day}`;}
function tzOffsetMs(date,tz){const p=intlParts(date,tz);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-new Date(date).getTime();}
function zonedToUtc(key,hhmmText,tz){const [y,m,d]=key.split('-').map(Number),[h,mi]=hhmmText.split(':').map(Number);let g=new Date(Date.UTC(y,m-1,d,h,mi));let o=tzOffsetMs(g,tz);g=new Date(g.getTime()-o);const o2=tzOffsetMs(g,tz);if(o2!==o)g=new Date(Date.UTC(y,m-1,d,h,mi)-o2);return g;}
function addKey(key,n){const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);}
function airportTz(code){return window.RosterParser?.airportTimeZone?.(String(code||'').trim().slice(0,3).toUpperCase())||null;}
function parseAcc(d){const m=String(d?.acc||'').match(/\b([A-Z]{3})\b/);return m?m[1]:null;}
function sectorCount(d){return Array.isArray(d?.flights)&&d.flights.length?d.flights.length:null;}
function firstLastAirport(d){const fs=d?.flights||[];return {first:fs[0]?.dep||d?.base||null,last:fs.at?.(-1)?.arr||d?.checkoutBase||d?.base||null};}
function sourcePeriod(person){const ds=(person?.duties||[]).map(x=>x.kind==='duty'?x.date:x.date).filter(Boolean).sort();return ds.length?{start:ds[0],end:ds.at(-1)}:null;}
function inferHomeBase(person){const counts={};for(const d of person?.duties||[]){if(d.kind==='duty'&&d.base)counts[d.base]=(counts[d.base]||0)+1;}return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';}

function basicTable2(reportMin,sectors){
  if(sectors<1||sectors>10)return {minutes:null,row:null,reason:'Table 2 admite 1–10 sectores'};
  const row=TABLE2.find(x=>x.ranges.some(([a,b])=>reportMin>=a&&reportMin<=b)); const col=sectors<=2?0:sectors-2;
  return row?{minutes:durMin(row.v[col]),row:row.label,value:row.v[col],col}:{minutes:null,row:null};
}
function unknownTable3(sectors){if(sectors<1||sectors>8)return {minutes:null,row:'Aclimatación desconocida',reason:'Table 3 admite 1–8 sectores'};const col=sectors<=2?0:sectors-2,v=TABLE3[col];return {minutes:durMin(v),row:'Aclimatación desconocida',value:v,col};}
function extensionTable4(reportMin,sectors){
  if(sectors<1||sectors>5)return {minutes:null,row:null,allowed:false};
  let row=TABLE4.find(x=>x.wrap?(reportMin>=1140||reportMin<=239):(x.r&&reportMin>=x.r[0]&&reportMin<=x.r[1]));
  if(!row)return {minutes:null,row:null,allowed:false}; const col=sectors<=2?0:sectors-2,v=row.v[col]; return {minutes:v?durMin(v):null,row:row.label,value:v,allowed:!!v,col};
}
function acclimTable1(diffHours,elapsedHours){
  const row=diffHours<4?TABLE1.lt4:diffHours<=6?TABLE1.le6:diffHours<=9?TABLE1.le9:TABLE1.le12;
  const col=elapsedHours<48?0:elapsedHours<72?1:elapsedHours<96?2:elapsedHours<120?3:4;return row[col];
}
function table5Nights(maxDiffHours,elapsedHours){const key=maxDiffHours<=6?6:maxDiffHours<=9?9:12;const col=elapsedHours<48?0:elapsedHours<72?1:elapsedHours<96?2:3;return TABLE5[key][col];}

function referenceContext(d,settings){
  const acc=parseAcc(d); const home=String(settings.homeBase||'').toUpperCase();
  let airport=acc||((d.base&&d.base===home)?home:null); let zone=airportTz(airport);
  let state=zone?'acclimatised':'unknown'; let basis=acc?'CrewLink ACC':(zone?'Home/Operating Base':'Sin referencia');
  const cabinOffset=settings.role==='cabin'?Math.max(0,Number(settings.cabinReportLead)||0):0;
  const reportInstant=new Date(new Date(d.checkIn).getTime()+cabinOffset*MIN);
  return {airport,zone,state,basis,reportInstant,reportMin:zone?localMinute(reportInstant,zone):null,cabinOffset};
}
function intervalOverlapsLocalWindow(start,end,tz,fromMin,toMin){
  if(!start||!end||!tz)return false;const s=new Date(start),e=new Date(end);let key=addKey(localKey(s,tz),-1);for(let i=0;i<4;i++,key=addKey(key,1)){
    const a=zonedToUtc(key,`${String(Math.floor(fromMin/60)).padStart(2,'0')}:${String(fromMin%60).padStart(2,'0')}`,tz);
    const endKey=toMin<=fromMin?addKey(key,1):key;const b=zonedToUtc(endKey,`${String(Math.floor(toMin/60)).padStart(2,'0')}:${String(toMin%60).padStart(2,'0')}`,tz);
    if(s<b&&e>a)return true;
  }return false;
}
function overlapLocalWindowMinutes(start,end,tz,fromMin,toMin){
  if(!start||!end||!tz)return 0;const s=new Date(start),e=new Date(end);let total=0,key=addKey(localKey(s,tz),-1);for(let i=0;i<5;i++,key=addKey(key,1)){
    const a=zonedToUtc(key,`${String(Math.floor(fromMin/60)).padStart(2,'0')}:${String(fromMin%60).padStart(2,'0')}`,tz);const endKey=toMin<=fromMin?addKey(key,1):key;const b=zonedToUtc(endKey,`${String(Math.floor(toMin/60)).padStart(2,'0')}:${String(toMin%60).padStart(2,'0')}`,tz);const x=Math.max(s,a),y=Math.min(e,b);if(y>x)total+=(y-x)/MIN;
  }return total;
}
function signedTimeZoneExcursion(d,ctx){
  if(!ctx.zone)return {east:0,west:0,unknown:[]};const ref=tzOffsetMs(new Date(d.checkIn),ctx.zone);let east=0,west=0,unknown=[];for(const ap of new Set([d.base,d.checkoutBase,...(d.flights||[]).flatMap(f=>[f.dep,f.arr])].filter(Boolean))){const z=airportTz(ap);if(!z){unknown.push(ap);continue;}const diff=(tzOffsetMs(new Date(d.checkIn),z)-ref)/HOUR;east=Math.max(east,diff);west=Math.min(west,diff);}return {east,west,unknown};
}

function rotationContaining(duty,allDuties,settings){
  const ds=(allDuties||[]).filter(x=>x?.kind==='duty'&&x.checkIn&&x.checkout).slice().sort((a,b)=>new Date(a.checkIn)-new Date(b.checkIn));
  const idx=ds.indexOf(duty);if(idx<0)return null;const home=String(settings.homeBase||'').toUpperCase();if(!home)return null;
  let start=idx;while(start>0&&String(ds[start].base||'').toUpperCase()!==home)start--;
  const completeStart=String(ds[start].base||'').toUpperCase()===home;
  let end=idx;while(end<ds.length-1&&String(ds[end].checkoutBase||'').toUpperCase()!==home)end++;
  const completeEnd=String(ds[end].checkoutBase||'').toUpperCase()===home;
  const first=ds[start],last=ds[end];const refCtx=referenceContext(first,settings);const refZone=refCtx.zone||airportTz(home);
  if(!refZone)return {ds,start,end,completeStart,completeEnd,first,last,maxDiff:null,east:null,west:null,unknown:['reference time zone']};
  let maxDiff=0,east=0,west=0,unknown=[];
  for(let i=start;i<=end;i++){
    const d=ds[i],instant=new Date(d.checkIn);const refOff=tzOffsetMs(instant,refZone);
    for(const ap of new Set([d.base,d.checkoutBase,...(d.flights||[]).flatMap(f=>[f.dep,f.arr])].filter(Boolean))){
      const z=airportTz(ap);if(!z){unknown.push(ap);continue;}const diff=(tzOffsetMs(instant,z)-refOff)/HOUR;maxDiff=Math.max(maxDiff,Math.abs(diff));east=Math.max(east,diff);west=Math.min(west,diff);
    }
  }
  return {ds,start,end,completeStart,completeEnd,first,last,maxDiff,east,west,unknown:[...new Set(unknown)],startTime:new Date(first.checkIn),endTime:new Date(last.checkout),elapsedHours:(new Date(last.checkout)-new Date(first.checkIn))/HOUR};
}

function classifyDuty(d,ctx){
  if(!ctx.zone||!d.checkIn||!d.checkout)return {type:'N/D',reason:'Sin zona de aclimatación o C/O'};
  const start=localMinute(d.checkIn,ctx.zone),end=localMinute(d.checkout,ctx.zone);
  if(intervalOverlapsLocalWindow(d.checkIn,d.checkout,ctx.zone,120,300))return {type:'NIGHT',reason:'Encroaches 02:00–04:59'};
  if(start>=300&&start<=359)return {type:'EARLY',reason:'Duty starts 05:00–05:59'};
  if(end>=1380||end<=119)return {type:'LATE',reason:'Duty finishes 23:00–01:59'};
  return {type:'N/A',reason:'No disruptive window'};
}
function maxTimeZoneDiffHours(d,ctx){
  if(!ctx.zone)return null;const refOff=tzOffsetMs(new Date(d.checkIn),ctx.zone);let max=0,unknown=[];
  const aps=new Set([d.base,d.checkoutBase,...(d.flights||[]).flatMap(f=>[f.dep,f.arr])].filter(Boolean));
  for(const ap of aps){const z=airportTz(ap);if(!z){unknown.push(ap);continue;}max=Math.max(max,Math.abs(tzOffsetMs(new Date(d.checkIn),z)-refOff)/HOUR);}
  return {hours:max,unknown};
}
function fullLocalNights(start,end,tz){
  // OM-A defines a local night as ANY continuous 8 h falling inside 22:00–08:00,
  // not necessarily the fixed 22:00–06:00 interval. Count a local night when the
  // rest overlaps that 10 h night window for at least 8 continuous hours.
  if(!start||!end||!tz)return 0;const s=new Date(start),e=new Date(end);let count=0,key=addKey(localKey(s,tz),-1);for(let i=0;i<45;i++,key=addKey(key,1)){
    const a=zonedToUtc(key,'22:00',tz),b=zonedToUtc(addKey(key,1),'08:00',tz);const x=Math.max(s,a),y=Math.min(e,b);if(y>x&&(y-x)>=8*HOUR)count++;if(a>e)break;
  }return count;
}
function fullLocalDays(start,end,tz){
  if(!start||!end||!tz)return 0;const s=new Date(start),e=new Date(end);let count=0,key=localKey(s,tz);for(let i=0;i<45;i++,key=addKey(key,1)){
    const a=zonedToUtc(key,'00:00',tz),b=zonedToUtc(addKey(key,1),'00:00',tz);if(a>=s&&b<=e)count++;if(a>e)break;
  }return count;
}
function statusInterval(s,settings){
  if(s.statusStart&&s.statusEnd)return {start:new Date(s.statusStart),end:new Date(s.statusEnd),hours:(new Date(s.statusEnd)-new Date(s.statusStart))/HOUR};
  return null;
}
function dutyInterval(d){return d.checkIn&&d.checkout?{start:new Date(d.checkIn),end:new Date(d.checkout)}:null;}
function dutyPeriodMinutes(d){return durMin(d.dt)??(d.checkIn&&d.checkout?Math.round((new Date(d.checkout)-new Date(d.checkIn))/MIN):null);}
function fdpMinutes(d){return durMin(d.fdp)??durMin(d.fdt);}
function flightMinutes(d){return durMin(d.ft);}

function analyseDuty(d,person,settings,prev,allDuties){
  const ctx=referenceContext(d,settings);const sectors=sectorCount(d);const actual=fdpMinutes(d);const crewMax=durMin(d.max);const dutyMin=dutyPeriodMinutes(d);const result={d,ctx,sectors,actual,crewMax,dutyMin,checks:[],status:'COMPLIANT',indeterminate:[]};
  if(!sectors){result.indeterminate.push('No se ha podido determinar el número de sectores.');}
  let baseMax=null,tableMax=null,table=null;
  if(sectors){
    const calc=ctx.state==='acclimatised'&&ctx.reportMin!=null?basicTable2(ctx.reportMin,sectors):unknownTable3(sectors);tableMax=calc.minutes;table=calc;
    // OM-A 7.1.7.3: cabin crew maximum is based on flight-crew report time,
    // while cabin FDP starts at cabin report. Therefore the permissible cabin
    // FDP duration can be longer by the (max 60 min) reporting-time difference.
    baseMax=tableMax==null?null:tableMax+(settings.role==='cabin'?ctx.cabinOffset:0);
    if(baseMax==null)result.indeterminate.push(calc.reason||'No hay valor aplicable en la tabla de FDP.');
  }
  result.tableMax=tableMax; result.baseMax=baseMax; result.table=table;
  result.ext=sectors&&ctx.reportMin!=null?extensionTable4(ctx.reportMin,sectors):{allowed:false};
  result.extEffectiveMinutes=result.ext.minutes==null?null:result.ext.minutes+(settings.role==='cabin'?ctx.cabinOffset:0);
  result.plannedExtension=!!(baseMax!=null&&crewMax!=null&&crewMax>baseMax+1&&result.ext.allowed&&Math.abs(crewMax-result.extEffectiveMinutes)<=1);
  const independentLimit=result.plannedExtension?result.extEffectiveMinutes:(baseMax!=null&&crewMax!=null?Math.min(baseMax,crewMax):(baseMax??crewMax));
  result.independentLimit=independentLimit;
  if(actual==null) result.indeterminate.push('CrewLink no aporta FDP/FDT utilizable.');
  if(baseMax!=null&&actual!=null){
    if(actual>baseMax){
      if(result.plannedExtension&&actual<=result.extEffectiveMinutes)result.checks.push({state:'ok',label:'FDP con planned extension',detail:`${hhmm(actual)} / ${hhmm(result.extEffectiveMinutes)} (Table 4${ctx.cabinOffset?' + cabin report':''})`,ref:'7.1.9'});
      else if(result.ext.allowed&&result.ext.minutes!=null&&actual<=result.extEffectiveMinutes)result.indeterminate.push('El FDP supera Table 2 y cabe en Table 4, pero CrewLink no confirma de forma inequívoca la planned extension.');
      else result.checks.push({state:'bad',label:'FDP máximo',detail:`${hhmm(actual)} > ${hhmm(baseMax)}`,ref:'7.1.7.2'});
    }else result.checks.push({state:'ok',label:'FDP básico',detail:`${hhmm(actual)} / ${hhmm(baseMax)}`,ref:'7.1.7.2'});
  }
  if(result.plannedExtension){
    result.checks.push({state:'ok',label:'Planned extension detectada',detail:`CrewLink MAX ${hhmm(crewMax)} coincide con límite efectivo ${hhmm(result.extEffectiveMinutes)}${ctx.cabinOffset?` (Table 4 ${hhmm(result.ext.minutes)} + ${ctx.cabinOffset} min cabin)`:''}`,ref:'7.1.9'});
    const fdpEnd=actual!=null?new Date(new Date(d.checkIn).getTime()+actual*MIN):null;const wocl=fdpEnd&&ctx.zone?overlapLocalWindowMinutes(d.checkIn,fdpEnd,ctx.zone,120,360):null;result.woclMinutes=wocl;
    if(wocl!=null){const maxS=wocl===0?5:wocl<=120?4:2;result.checks.push({state:(sectors||0)<=maxS?'ok':'bad',label:'Sectores con extensión / WOCL',detail:`WOCL ${hhmm(wocl)} · ${sectors} sectores / máx ${maxS}`,ref:'7.1.9(c)'});}
  }else if(crewMax!=null&&baseMax!=null){const delta=crewMax-baseMax;const stateAudit=Math.abs(delta)<=1?'ok':(crewMax<baseMax?'ok':'warn');result.checks.push({state:stateAudit,label:'Auditoría CrewLink MAX',detail:`CrewLink ${hhmm(crewMax)} · RosterHome ${hhmm(baseMax)}${Math.abs(delta)<=1?' · coincide':crewMax<baseMax?' · CrewLink más restrictivo':' · diferencia'}`,ref:'7.1.7.2'});if(crewMax>baseMax+1)result.indeterminate.push('CrewLink MAX supera el básico y no encaja claramente con Table 4; puede existir split duty, standby u otra condición no visible en el PDF.');}
  if(settings.role==='cabin'&&ctx.cabinOffset){result.checks.push({state:ctx.cabinOffset<=60?'ok':'bad',label:'Cabin vs flight crew report',detail:`Cabin report ${ctx.cabinOffset} min antes · Table MAX ${hhmm(tableMax)} → límite efectivo ${hhmm(baseMax)}`,ref:'7.1.7.3'});}
  const cls=classifyDuty(d,ctx);result.classification=cls;const crewType=String(d.type||'N/A').toUpperCase();if(cls.type!=='N/D')result.checks.push({state:crewType===cls.type?'ok':'warn',label:'EARLY / LATE / NIGHT',detail:`CrewLink ${crewType} · RosterHome ${cls.type}`,ref:'7.1.3 / 7.1.8'});
  if(cls.type==='NIGHT'&&sectors>4) result.checks.push({state:'warn',label:'Night duty',detail:`${sectors} sectores; el límite de 4 aplica cuando los night duties son consecutivos.`,ref:'7.1.8'});
  const tz=maxTimeZoneDiffHours(d,ctx);result.timeZone=tz;result.timeZoneSigned=signedTimeZoneExcursion(d,ctx);if(tz?.unknown?.length)result.indeterminate.push(`Zona horaria desconocida para: ${tz.unknown.join(', ')}.`);
  if(prev&&prev.checkout&&d.checkIn){
    const rest=Math.round((new Date(d.checkIn)-new Date(prev.checkout))/MIN);const home=String(d.base||'').toUpperCase()===String(settings.homeBase||'').toUpperCase();let required=Math.max(dutyPeriodMinutes(prev)||0,home?720:600);let restRef=home?'7.1.17.1':'7.1.17.2';const prevCtx=referenceContext(prev,settings),prevTz=maxTimeZoneDiffHours(prev,prevCtx);
    if(prevTz?.hours>=4&&!home){required=Math.max(required,840);restRef='7.1.17.6(1)(ii)';}
    const state=rest>=required?'ok':'bad';result.rest={minutes:rest,required,home,state,ref:restRef,localNights:ctx.zone?fullLocalNights(prev.checkout,d.checkIn,ctx.zone):null};result.checks.push({state,label:'Descanso previo',detail:`${hhmm(rest)} / mínimo ${hhmm(required)}${home?' · base':' · fuera de base'}`,ref:restRef});
    const prevClass=classifyDuty(prev,prevCtx);if(home&&(prevClass.type==='LATE'||prevClass.type==='NIGHT')&&cls.type==='EARLY'){
      const ln=result.rest.localNights;result.checks.push({state:ln>=1?'ok':'bad',label:'Transición disruptive',detail:`${prevClass.type} → EARLY · ${ln??'?'} local night`,ref:'7.1.17.5'});
    }
    if(home&&ctx.zone){
      const rot=rotationContaining(prev,allDuties||[prev,d],settings);
      if(rot?.completeStart&&rot?.completeEnd&&rot.maxDiff>=4){const reqN=table5Nights(rot.maxDiff,rot.elapsedHours);const got=fullLocalNights(rot.endTime,d.checkIn,ctx.zone);result.checks.push({state:got>=reqN?'ok':'bad',label:'Time-zone recovery',detail:`${got} local nights / ${reqN} requeridas (rotation Δ ${rot.maxDiff.toFixed(1)} h · ${rot.elapsedHours.toFixed(1)} h)`,ref:'7.1.17.6 Table 5'});}
      else if(rot&&rot.maxDiff>=4)result.indeterminate.push('La rotation previa cruza ≥4 h pero no están cargados sus dos bordes; Table 5 no puede validarse con seguridad.');
    }
  }
  if(result.checks.some(x=>x.state==='bad'))result.status='NON_COMPLIANT';else if(result.indeterminate.length||result.checks.some(x=>x.state==='warn'))result.status='INDETERMINATE';
  result.margin=actual!=null&&independentLimit!=null?independentLimit-actual:null;return result;
}

function eventOverlapMinutes(start,end,winStart,winEnd){const a=Math.max(new Date(start).getTime(),winStart),b=Math.min(new Date(end).getTime(),winEnd);return Math.max(0,(b-a)/MIN);}
function cumulativeEvents(person,settings){
  const out=[];for(const x of person.duties||[]){
    if(x.kind==='duty'&&x.checkIn&&x.checkout)out.push({kind:'duty',start:new Date(x.checkIn),end:new Date(x.checkout),dutyMinutes:dutyPeriodMinutes(x)||0,flightMinutes:flightMinutes(x)||0,raw:x});
    else if(x.kind==='status'&&x.status==='STBY'){const iv=statusInterval(x,settings);if(iv)out.push({kind:'standby',start:iv.start,end:iv.end,dutyMinutes:iv.hours*60*.25,flightMinutes:0,raw:x});}
    else if(x.kind==='status'&&['SIM','TRG'].includes(x.status)){const iv=statusInterval(x,settings);if(iv)out.push({kind:'other-duty',start:iv.start,end:iv.end,dutyMinutes:iv.hours*60,flightMinutes:0,raw:x});}
  }return out.sort((a,b)=>a.start-b.start);
}
function rollingMax(person,settings,days,metric){
  const es=cumulativeEvents(person,settings);if(!es.length)return {max:0,end:null};let earliest=Math.min(...es.map(e=>e.start.getTime())),latest=Math.max(...es.map(e=>e.end.getTime())),best={max:0,end:null};
  for(let t=earliest;t<=latest+DAY;t+=DAY){const ws=t-days*DAY,we=t;let total=0;for(const e of es){if(metric==='duty'){const duration=Math.max(1,e.end-e.start);const overlap=eventOverlapMinutes(e.start,e.end,ws,we);total+=(e.dutyMinutes||0)*(overlap/(duration/MIN));}else if(e.start.getTime()>=ws&&e.start.getTime()<we)total+=e.flightMinutes||0;}if(total>best.max)best={max:total,end:new Date(we)};}
  return best;
}
function designatedDaysOff(person,month){return (person.duties||[]).filter(x=>x.kind==='status'&&['OFF','ROFF'].includes(x.status)&&String(x.date||'').startsWith(month)).length;}
function consecutiveReserveIssues(person){const rs=(person.duties||[]).filter(x=>x.kind==='status'&&x.status==='RES').map(x=>x.date).sort();let run=1,issues=[];for(let i=1;i<rs.length;i++){if(addKey(rs[i-1],1)===rs[i])run++;else run=1;if(run>3)issues.push(`Más de 3 reserve days consecutivos terminando ${rs[i]}.`);}return issues;}
function standbyIssues(person){const out=[];for(const s of (person.duties||[]).filter(x=>x.kind==='status'&&x.status==='STBY')){const iv=statusInterval(s);if(!iv){out.push({state:'ind',text:`${s.date}: STBY sin horas estructuradas; no puedo determinar airport/home standby.`});continue;}if(iv.hours>16)out.push({state:'bad',text:`${s.date}: standby ${iv.hours.toFixed(1)} h > 16 h (máximo even para standby no-aeropuerto).`});else out.push({state:'ind',text:`${s.date}: standby ${iv.hours.toFixed(1)} h; CrewLink no identifica si es airport standby (máx. 6 h) o standby no-aeropuerto (máx. 16 h).`});}return out;}
function recoveryCandidates(duties,settings){const tz=airportTz(settings.homeBase)||state.rules.homeTz;const ds=duties.filter(x=>x.kind==='duty'&&x.checkIn&&x.checkout).sort((a,b)=>new Date(a.checkIn)-new Date(b.checkIn));const gaps=[];for(let i=0;i<ds.length-1;i++){const a=ds[i],b=ds[i+1],start=new Date(a.checkout),end=new Date(b.checkIn),hours=(end-start)/HOUR,nights=fullLocalNights(start,end,tz),days=fullLocalDays(start,end,tz);if(hours>=36&&nights>=2)gaps.push({after:a,before:b,start,end,hours,nights,days,index:i});}return gaps;}
function sequenceAnalysis(person,settings,dutyResults){
  const issues=[],notes=[];const ds=dutyResults.map(r=>r.d).sort((a,b)=>new Date(a.checkIn)-new Date(b.checkIn));
  const exts=dutyResults.filter(r=>r.plannedExtension).sort((a,b)=>new Date(a.d.checkIn)-new Date(b.d.checkIn));
  for(const r of exts){const t=new Date(r.d.checkIn).getTime(),n=exts.filter(x=>{const q=new Date(x.d.checkIn).getTime();return q>t-7*DAY&&q<=t;}).length;if(n>2)issues.push({state:'bad',title:'Planned extensions',text:`Más de 2 planned extensions dentro de 7 días alrededor de ${r.d.date}.`,ref:'7.1.9(a)'});}
  for(let i=0;i<dutyResults.length;i++){const r=dutyResults[i];if(!r.plannedExtension)continue;const pre=r.rest,post=dutyResults[i+1]?.rest;if(!pre||!post){issues.push({state:'ind',title:'Descanso de planned extension',text:`${r.d.date}: falta duty anterior o posterior para comprobar los descansos adicionales.`,ref:'7.1.9(a)'});continue;}const optionA=pre.minutes>=pre.required+120&&post.minutes>=post.required+120,optionB=post.minutes>=post.required+240;if(!optionA&&!optionB)issues.push({state:'bad',title:'Descanso de planned extension',text:`${r.d.date}: no se cumple (+2 h pre y post) ni (+4 h post).`,ref:'7.1.9(a)'});else notes.push(`${r.d.date}: descansos adicionales de planned extension compatibles con ${optionA?'opción +2h pre/post':'+4h post'}.`);}
  for(let i=1;i<dutyResults.length;i++){
    const prev=dutyResults[i-1],cur=dutyResults[i];if(cur.rest?.state==='bad')issues.push({state:'bad',title:'Descanso mínimo',text:`${cur.d.date} ${cur.d.route||cur.d.base}: ${hhmm(cur.rest.minutes)} disponibles, ${hhmm(cur.rest.required)} requeridos.`,ref:cur.rest.ref});
    if((prev.classification.type==='NIGHT')&&cur.classification.type==='NIGHT'){
      for(const r of [prev,cur])if((r.sectors||0)>4)issues.push({state:'bad',title:'Consecutive night duties',text:`${r.d.date}: ${r.sectors} sectores en una secuencia de night duties.`,ref:'7.1.8'});
    }
    if(cur.rest?.home){
      const pRot=rotationContaining(prev.d,ds,settings),cRot=rotationContaining(cur.d,ds,settings);
      if(pRot&&cRot&&pRot.completeStart&&pRot.completeEnd&&cRot.completeStart&&cRot.completeEnd&&pRot.endTime<=cRot.startTime){
        const opposite=(pRot.east>=6&&cRot.west<=-4)||(pRot.west<=-6&&cRot.east>=4);if(opposite){const z=airportTz(settings.homeBase)||cur.ctx.zone,n=z?fullLocalNights(pRot.endTime,cRot.startTime,z):null;issues.push({state:n==null?'ind':n>=3?'ok':'bad',title:'East/West transition',text:`${n??'?'} local nights entre rotaciones opuestas; mínimo 3.`,ref:'7.1.17.6(2)'});}
      }
    }
  }
  const gaps=recoveryCandidates(ds,settings);for(let i=1;i<gaps.length;i++){const active=(gaps[i].start-gaps[i-1].end)/HOUR;if(active>168)issues.push({state:'bad',title:'Extended recovery',text:`${active.toFixed(1)} h entre el final de un extended recovery inferido y el inicio del siguiente (>168 h).`,ref:'7.1.17.4'});}
  // 4+ disruptive duties between two inferred extended recovery rests -> next must be 60 h.
  for(let i=1;i<gaps.length;i++){const from=gaps[i-1].end,to=gaps[i].start;const disruptive=dutyResults.filter(r=>new Date(r.d.checkIn)>=from&&new Date(r.d.checkout)<=to&&['NIGHT','EARLY','LATE'].includes(r.classification.type));if(disruptive.length>=4&&gaps[i].hours<60)issues.push({state:'bad',title:'4+ disruptive duties',text:`${disruptive.length} duties disruptivos antes del recovery de ${gaps[i].hours.toFixed(1)} h; debería ser ≥60 h.`,ref:'7.1.17.5'});}
  if(!gaps.length)notes.push('No se ha podido inferir ningún recurrent extended recovery (≥36 h + 2 local nights) dentro del periodo cargado.');
  const monthGaps=gaps.filter(g=>localKey(g.start,airportTz(settings.homeBase)||state.rules.homeTz).startsWith(state.month));const twoLocalDays=monthGaps.filter(g=>g.days>=2).length;if(twoLocalDays<2)issues.push({state:'ind',title:'2 local days ×2/mes',text:`Solo se infieren ${twoLocalDays} extended recoveries con 2 local days dentro del mes. Los bordes del roster pueden ocultar un recovery.`,ref:'7.1.17.4'});
  for(const t of consecutiveReserveIssues(person))issues.push({state:'bad',title:'Reserve',text:t,ref:'7.1.16'});
  for(const s of standbyIssues(person))issues.push({state:s.state==='bad'?'bad':'ind',title:'Standby',text:s.text,ref:'7.1.15'});
  return {issues,notes,gaps};
}
function sumFlightBetween(person,start,end){let n=0;for(const d of person.duties||[]){if(d.kind!=='duty'||!d.checkIn)continue;const t=new Date(d.checkIn);if(t>=start&&t<end)n+=flightMinutes(d)||0;}return n;}
function annualOffCount(person,year){return (person.duties||[]).filter(x=>x.kind==='status'&&['OFF','ROFF'].includes(x.status)&&String(x.date||'').startsWith(String(year)+'-')).length;}

function analyseProfile(person,settings,month){
  const duties=(person.duties||[]).filter(x=>x.kind==='duty').sort((a,b)=>new Date(a.checkIn)-new Date(b.checkIn));const results=[];for(let i=0;i<duties.length;i++)results.push(analyseDuty(duties[i],person,settings,duties[i-1],duties));
  const seq=sequenceAnalysis(person,settings,results);const r7=rollingMax(person,settings,7,'duty'),r14=rollingMax(person,settings,14,'duty'),r28=rollingMax(person,settings,28,'duty'),f28=rollingMax(person,settings,28,'flight');
  const period=sourcePeriod(person);const coverageDays=period?((new Date(period.end+'T12:00Z')-new Date(period.start+'T12:00Z'))/DAY+1):0;const annualReady=coverageDays>=330;const off=designatedDaysOff(person,month);const [my,mm]=month.split('-').map(Number),monthLast=new Date(Date.UTC(my,mm,0)).getUTCDate(),fullMonth=!!(period&&period.start<=`${month}-01`&&period.end>=`${month}-${String(monthLast).padStart(2,'0')}`);
  let annual=null;if(annualReady){const latest=new Date(period.end+'T23:59:59Z'),yearStart=new Date(Date.UTC(latest.getUTCFullYear(),0,1)),yearEnd=new Date(Date.UTC(latest.getUTCFullYear()+1,0,1)),twelveStart=new Date(Date.UTC(latest.getUTCFullYear()-1,latest.getUTCMonth()+1,1));annual={flightYear:sumFlightBetween(person,yearStart,yearEnd),flight12:sumFlightBetween(person,twelveStart,new Date(latest.getTime()+1)),offYear:annualOffCount(person,latest.getUTCFullYear())};}
  const cumulative=[
    {label:'Duty · 7 días',value:r7.max,limit:3600,ref:'7.1.11.1'},
    {label:'Duty · 14 días',value:r14.max,limit:6600,ref:'7.1.11.1'},
    {label:'Duty · 28 días',value:r28.max,limit:11400,ref:'7.1.11.1'},
    {label:'Flight · 28 días',value:f28.max,limit:6000,ref:'7.1.11.2'}
  ];
  const violations=[...results.filter(r=>r.status==='NON_COMPLIANT').map(r=>({kind:'duty',r})),...seq.issues.filter(x=>x.state==='bad').map(x=>({kind:'sequence',x})),...cumulative.filter(x=>x.value>x.limit).map(x=>({kind:'cumulative',x}))];
  if(fullMonth&&off<7)violations.push({kind:'daysOff',x:{label:'Days off',value:off,limit:7}});if(annual&&(annual.flightYear>54000||annual.flight12>60000||annual.offYear<96))violations.push({kind:'annual',x:annual});
  const indeterminate=results.reduce((n,r)=>n+(r.status==='INDETERMINATE'),0)+seq.issues.filter(x=>x.state==='ind').length+(annualReady?0:1);
  return {person,settings,duties,results,sequence:seq,cumulative,period,coverageDays,annualReady,annual,off,fullMonth,violations,indeterminate,status:violations.length?'NON_COMPLIANT':indeterminate?'INDETERMINATE':'COMPLIANT'};
}

function ensureFtlState(){
  if(!state.ftl||typeof state.ftl!=='object')state.ftl={};if(!Array.isArray(state.ftl.profiles))state.ftl.profiles=[{},{}];
  state.ftl.profiles=[0,1].map(i=>{const old=state.ftl.profiles[i]||{},person=state.people[i];return {role:old.role|| (i===1?'cabin':'flight'),homeBase:(old.homeBase||inferHomeBase(person)||'').toUpperCase(),cabinReportLead:Number.isFinite(+old.cabinReportLead)?+old.cabinReportLead:0};});
  if(![0,1].includes(+state.ftl.selectedProfile))state.ftl.selectedProfile=0;if(!['duties','sequence','cumulative','reference'].includes(state.ftl.section))state.ftl.section='duties';
  return state.ftl;
}
function badge(status){return status==='COMPLIANT'?'<span class="ftl-badge ok">✓ COMPLIANT</span>':status==='NON_COMPLIANT'?'<span class="ftl-badge bad">✕ NON-COMPLIANT</span>':'<span class="ftl-badge ind">? INDETERMINATE</span>';}
function checkIcon(s){return s==='ok'?'✓':s==='bad'?'✕':'!';}
function esc2(v){return typeof esc==='function'?esc(v):String(v??'');}
function fmtRefTime(r){if(r.ctx.reportMin==null)return '—';return `${String(Math.floor(r.ctx.reportMin/60)).padStart(2,'0')}:${String(r.ctx.reportMin%60).padStart(2,'0')}`;}
function dutyTitle(d){return `${d.date||''} · ${d.route||d.base||'Duty'}`;}
function percentage(v,l){return Math.min(100,Math.max(0,(v/l)*100));}

function referenceHtml(activeRow=null,activeSector=null){
  const heads=['1–2','3','4','5','6','7','8','9','10'];
  const table2=`<div class="ftl-table-wrap"><table class="ftl-ref-table"><thead><tr><th>Reporting / inicio FDP<br><small>reference time</small></th>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${TABLE2.map(row=>`<tr class="${row.label===activeRow?'active-row':''}"><th>${row.label}</th>${row.v.map((v,i)=>`<td class="${row.label===activeRow&&i===(activeSector<=2?0:activeSector-2)?'active-cell':''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const t1=`<div class="ftl-table-wrap"><table class="ftl-ref-table compact"><thead><tr><th>Δ zona</th><th>&lt;48</th><th>48–71:59</th><th>72–95:59</th><th>96–119:59</th><th>≥120</th></tr></thead><tbody><tr><th>&lt;4h</th>${TABLE1.lt4.map(x=>`<td>${x}</td>`).join('')}</tr><tr><th>≤6h</th>${TABLE1.le6.map(x=>`<td>${x}</td>`).join('')}</tr><tr><th>≤9h</th>${TABLE1.le9.map(x=>`<td>${x}</td>`).join('')}</tr><tr><th>≤12h</th>${TABLE1.le12.map(x=>`<td>${x}</td>`).join('')}</tr></tbody></table></div>`;
  const t3=`<div class="ftl-table-wrap"><table class="ftl-ref-table compact"><thead><tr><th>Sectores</th>${['1–2','3','4','5','6','7','8'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody><tr><th>MAX FDP</th>${TABLE3.map(x=>`<td>${x}</td>`).join('')}</tr></tbody></table></div>`;
  const t4=`<div class="ftl-table-wrap"><table class="ftl-ref-table"><thead><tr><th>Inicio FDP</th><th>1–2</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody>${TABLE4.map(r=>`<tr><th>${r.label}</th>${r.v.map(x=>`<td>${x||'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const t5=`<div class="ftl-table-wrap"><table class="ftl-ref-table compact"><thead><tr><th>Δ máx.</th><th>&lt;48h</th><th>48–71:59</th><th>72–95:59</th><th>≥96h</th></tr></thead><tbody>${Object.entries(TABLE5).map(([k,v])=>`<tr><th>≤${k}h</th>${v.map(x=>`<td>${x} noches</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return `<div class="ftl-reference">
    <details open><summary>📊 Table 2 · Maximum daily FDP vs reporting time</summary><p class="ftl-ref-note">Tripulación aclimatada. El eje izquierdo es el <b>inicio del FDP / reporting en reference time</b>; las columnas son sectores.</p>${table2}<p class="ftl-source">OM-A 7.1.7.2.1 · Table 2</p></details>
    <details><summary>🌍 Table 1 · Aclimatación</summary>${t1}<p class="ftl-ref-note">B = aclimatado a reference time; D = aclimatado al lugar donde empieza el siguiente duty; X = estado desconocido.</p><p class="ftl-source">OM-A 7.1.3 · Table 1</p></details>
    <details><summary>❓ Table 3 · Aclimatación desconocida</summary>${t3}<p class="ftl-source">OM-A 7.1.7.2.2 · Table 3</p></details>
    <details><summary>➕ Table 4 · Planned extension sin in-flight rest</summary>${t4}<p class="ftl-ref-note">Hasta +1 h, máximo 2 veces en 7 días; sujeta a límites de sectores/WOCL y descansos adicionales. No combinable con split duty.</p><p class="ftl-source">OM-A 7.1.9 · Table 4</p></details>
    <details><summary>🕓 Table 5 · Recuperación por cambio de zona</summary>${t5}<p class="ftl-source">OM-A 7.1.17.6 · Table 5</p></details>
    <details><summary>📚 Límites y definiciones rápidas</summary><div class="ftl-rule-list">
      <div><b>EARLY</b><span>Inicio 05:00–05:59 aclimatado.</span></div><div><b>LATE</b><span>Fin 23:00–01:59 aclimatado.</span></div><div><b>NIGHT</b><span>Encroacha 02:00–04:59 aclimatado.</span></div><div><b>WOCL</b><span>02:00–05:59 aclimatado.</span></div>
      <div><b>Rest en base</b><span>max(duty anterior, 12 h).</span></div><div><b>Rest fuera de base</b><span>max(duty anterior, 10 h); 14 h si FDP implica ≥4 h de diferencia horaria.</span></div>
      <div><b>Duty 7/14/28</b><span>60 / 110 / 190 h.</span></div><div><b>Flight 28d/año/12m</b><span>100 / 900 / 1000 h.</span></div>
      <div><b>Extended recovery</b><span>≥36 h + 2 local nights; ≤168 h entre recoveries. Con 4+ disruptive duties, siguiente ≥60 h.</span></div><div><b>Days off</b><span>≥7 local days/mes y ≥96/año.</span></div>
      <div><b>Airport standby</b><span>Máx. 6 h; combinado con FDP ≤16 h.</span></div><div><b>Other standby</b><span>Máx. 16 h; 25% cuenta para duty acumulado; awake time combinado ≤18 h.</span></div>
      <div><b>Reserve</b><span>Máx. 24 h; máx. 3 días consecutivos; no cuenta como duty.</span></div><div><b>Commander discretion</b><span>Solo unforeseen circumstances desde/al report; hasta +2 h FDP y rest nunca &lt;10 h.</span></div>
    </div></details>
    <details><summary>⏰ Delayed reporting · 7.1.18</summary><div class="ftl-rule-list single">
      <div><b>1ª notificación · delay &lt;4 h</b><span>MAX FDP calculado con el report original; el FDP empieza en el report retrasado.</span></div>
      <div><b>1ª notificación · delay ≥4 h y &lt;10 h</b><span>MAX FDP según el más limitante entre report original y retrasado; FDP empieza en el retrasado.</span></div>
      <div><b>2ª modificación</b><span>FDP empieza 1 h después de la segunda notificación o en el report retrasado anterior, lo que ocurra antes.</span></div>
      <div><b>Delay ≥10 h</b><span>Si no hay más interrupciones, cuenta como rest period y el FDP se calcula desde el nuevo report.</span></div>
    </div><p class="ftl-ref-note">El PDF de roster no contiene las horas de las llamadas/notificaciones. Por eso RosterHome no puede validar automáticamente delayed reporting sin esos datos.</p></details>
    <details><summary>🛌 Split duty, positioning y standby</summary><div class="ftl-rule-list single">
      <div><b>Split duty</b><span>Break mínimo 3 h; cuenta en FDP; el MAX puede aumentar hasta el 50% del break elegible. Requiere condiciones de accommodation y no se combina con in-flight rest.</span></div>
      <div><b>Positioning</b><span>Todo positioning cuenta como duty; si ocurre tras report y antes de operar, también cuenta como FDP pero no como sector.</span></div>
      <div><b>Airport standby</b><span>Máx. 6 h; el tiempo sobre 4 h reduce MAX FDP minuto por minuto; standby + FDP ≤16 h.</span></div>
      <div><b>Other standby</b><span>Máx. 16 h; si termina después de 6 h reduce MAX FDP por el exceso; 25% cuenta para acumulados y standby + FDP no debe generar &gt;18 h awake.</span></div>
    </div><p class="ftl-ref-note">CrewLink no siempre distingue en el PDF el tipo de standby ni expone todos los datos del break. En esos casos el motor devuelve INDETERMINATE.</p></details>
    <details><summary>🧠 SAFE / Fatigue · referencia</summary><div class="ftl-safe-bands">
      <div class="safe-green"><b>&lt;82</b><span>Green · OK</span></div><div class="safe-yellow"><b>83–89</b><span>Yellow · close follow-up</span></div><div class="safe-orange"><b>90–100</b><span>Orange · action to reduce fatigue</span></div><div class="safe-red"><b>&gt;101</b><span>Red · operation not permissible</span></div>
    </div><p class="ftl-ref-note">El OM-A describe las bandas y el uso de SAFE en NetLine, pero no publica el algoritmo biomatemático. RosterHome <b>no inventa una puntuación SAFE</b>; solo podrá evaluarla si se importa un valor oficial.</p><p class="ftl-source">OM-A 7.3.2.1</p></details>
    <details><summary>⚠️ Commander’s discretion</summary><p class="ftl-ref-note">Aplicable únicamente a unforeseen circumstances que comienzan en o después del report. El MAX FDP puede aumentar hasta 2 h; el rest posterior puede reducirse, pero nunca por debajo de 10 h. No convierte en legal un roster que ya era previsiblemente no-compliant antes del report.</p><p class="ftl-source">OM-A 7.2.2.1</p></details>
  </div>`;
}

function renderDutySection(a){
  const month=state.month;const rows=a.results.filter(r=>String(r.d.date||'').startsWith(month));if(!rows.length)return '<div class="ftl-empty">No hay duties en el mes visible.</div>';
  return `<div class="ftl-duty-list">${rows.map((r,idx)=>`<details class="ftl-duty-card ${r.status.toLowerCase().replace('_','-')}"><summary><div><span class="ftl-duty-date">${esc2(r.d.date)}</span><b>${esc2(r.d.route||r.d.base||'Duty')}</b><small>Report ref ${fmtRefTime(r)} · ${r.sectors??'?'} sectores · FDP ${hhmm(r.actual)} / MAX ${hhmm(r.baseMax)}</small></div>${badge(r.status)}</summary><div class="ftl-duty-body">
    <div class="ftl-duty-kpis"><div><span>FDP</span><b>${hhmm(r.actual)}</b></div><div><span>MAX básico</span><b>${hhmm(r.baseMax)}</b></div><div><span>Margen</span><b class="${(r.margin??0)<0?'bad-text':''}">${r.margin==null?'—':(r.margin>=0?'+':'')+hhmm(r.margin)}</b></div><div><span>Tipo</span><b>${esc2(r.classification.type)}</b></div></div>
    <div class="ftl-checks">${r.checks.map(c=>`<div class="ftl-check ${c.state}"><i>${checkIcon(c.state)}</i><div><b>${esc2(c.label)}</b><span>${esc2(c.detail)}</span><small>${esc2(c.ref)}</small></div></div>`).join('')}</div>
    ${r.indeterminate.length?`<div class="ftl-indeterminate"><b>Datos/condiciones no determinables</b><ul>${r.indeterminate.map(x=>`<li>${esc2(x)}</li>`).join('')}</ul></div>`:''}
    <div class="ftl-used-rule"><span>${r.ctx.state==='unknown'?'Table 3':'Table 2'}</span><b>${esc2(r.table?.row||'—')} × ${r.sectors??'?'} sectores → ${hhmm(r.tableMax)}${r.ctx.cabinOffset?` + ${r.ctx.cabinOffset} min cabin = ${hhmm(r.baseMax)}`:''}</b><small>Abre “Referencia” para ver la tabla completa.</small></div>
  </div></details>`).join('')}</div>`;
}
function renderSequenceSection(a){
  const issues=a.sequence.issues;const gaps=a.sequence.gaps;return `<div class="ftl-section-grid"><div class="ftl-panel"><h3>Descanso y secuencias</h3>${issues.length?issues.map(x=>`<div class="ftl-seq-row ${x.state}"><i>${x.state==='bad'?'✕':'?'}</i><div><b>${esc2(x.title)}</b><span>${esc2(x.text)}</span><small>${esc2(x.ref)}</small></div></div>`).join(''):'<div class="ftl-good-callout">✓ No se detectan incumplimientos determinables de descanso/secuencia en los datos cargados.</div>'}${a.sequence.notes.map(x=>`<div class="ftl-note">${esc2(x)}</div>`).join('')}</div>
  <div class="ftl-panel"><h3>Extended recovery inferido</h3>${gaps.length?gaps.map(g=>`<div class="ftl-recovery-row"><span>${esc2(g.after.date)} → ${esc2(g.before.date)}</span><b>${g.hours.toFixed(1)} h</b><small>${g.nights} local nights · ${g.days} local days</small></div>`).join(''):'<div class="muted">Sin gaps ≥36 h + 2 local nights dentro del periodo.</div>'}</div></div>`;
}
function renderCumulativeSection(a){
  const period=a.period;return `<div class="ftl-cumulative-list">${a.cumulative.map(x=>`<div class="ftl-cum-card ${x.value>x.limit?'bad':''}"><div class="ftl-cum-head"><span>${esc2(x.label)}</span><b>${hhmm(x.value)} / ${hhmm(x.limit)}</b></div><div class="ftl-progress"><i style="width:${percentage(x.value,x.limit)}%"></i></div><small>${Math.round(x.value/x.limit*100)}% · ${esc2(x.ref)}</small></div>`).join('')}</div>
  <div class="ftl-section-grid"><div class="ftl-panel"><h3>Días libres · ${esc2(state.month)}</h3><div class="ftl-big-number ${a.fullMonth&&a.off<7?'warn':''}">${a.off}</div><p>OFF/ROFF designados detectados. Referencia mensual: <b>≥7 local days</b>.</p><small>OM-A 7.1.12. Un rest period puede formar parte de un single day free of duty.</small></div>
  <div class="ftl-panel"><h3>Histórico anual</h3>${a.annualReady&&a.annual?`<div class="ftl-annual-grid"><div><span>Flight año</span><b>${hhmm(a.annual.flightYear)} / 900:00</b></div><div><span>Flight 12 meses</span><b>${hhmm(a.annual.flight12)} / 1000:00</b></div><div><span>Days off año</span><b>${a.annual.offYear} / 96</b></div></div>`:`<div class="ftl-indeterminate"><b>N/D</b><p>Periodo cargado: ${Math.round(a.coverageDays)} días. Para 900 h/año, 1000 h/12 meses y 96 días libres/año necesitamos mantener varios meses de roster.</p></div>`}<small>${period?`${period.start} → ${period.end}`:'Sin datos'}</small></div></div>`;
}

function renderFtlFull(){
  const f=ensureFtlState(),pi=+f.selectedProfile,person=state.people[pi],settings=f.profiles[pi],analysis=analyseProfile(person,settings,state.month);window.__lastFtlAnalysis=analysis;
  const duties=state.people.flatMap(p=>p.duties||[]).filter(d=>d.kind==='duty');const withRoster=state.people.filter(p=>(p.duties||[]).length>0).length;const dates=duties.map(d=>String(d.date||'')).filter(Boolean).sort();
  const statusEl=document.getElementById('ftlOverallStatus');if(statusEl){statusEl.className='ftl-status-live '+analysis.status.toLowerCase().replace('_','-');statusEl.innerHTML=badge(analysis.status);}
  if(document.getElementById('ftlDuties'))document.getElementById('ftlDuties').textContent=String(duties.length);if(document.getElementById('ftlPeople'))document.getElementById('ftlPeople').textContent=`${withRoster}/2`;if(document.getElementById('ftlPeriod'))document.getElementById('ftlPeriod').textContent=dates.length?`${dates[0].slice(8,10)}/${dates[0].slice(5,7)} – ${dates.at(-1).slice(8,10)}/${dates.at(-1).slice(5,7)}`:'—';
  document.querySelectorAll('[data-ftl-profile]').forEach(b=>{const bi=+b.dataset.ftlProfile;b.classList.toggle('active',bi===pi);if(state.people[bi])b.textContent=state.people[bi].name||`Perfil ${bi+1}`;});document.querySelectorAll('[data-ftl-section]').forEach(b=>b.classList.toggle('active',b.dataset.ftlSection===f.section));
  const role=document.getElementById('ftlRole'),base=document.getElementById('ftlHomeBase'),lead=document.getElementById('ftlCabinLead'),leadWrap=document.getElementById('ftlCabinLeadWrap');if(role)role.value=settings.role;if(base)base.value=settings.homeBase||'';if(lead)lead.value=settings.cabinReportLead||0;if(leadWrap)leadWrap.hidden=settings.role!=='cabin';
  const profTitle=document.getElementById('ftlProfileTitle');if(profTitle)profTitle.textContent=person.name;
  const body=document.getElementById('ftlBody');if(!body)return;body.innerHTML=f.section==='duties'?renderDutySection(analysis):f.section==='sequence'?renderSequenceSection(analysis):f.section==='cumulative'?renderCumulativeSection(analysis):referenceHtml();
  const quick=document.getElementById('ftlQuick');if(quick){const monthRows=analysis.results.filter(r=>String(r.d.date||'').startsWith(state.month));quick.innerHTML=`<div><span>Duties mes</span><b>${monthRows.length}</b></div><div><span>Non-compliant</span><b class="bad-text">${monthRows.filter(r=>r.status==='NON_COMPLIANT').length}</b></div><div><span>Indeterminate</span><b>${monthRows.filter(r=>r.status==='INDETERMINATE').length}</b></div><div><span>OM-A</span><b>Ch. 7</b></div>`;}
}

function bindFtl(){
  const root=document.getElementById('ftlView');if(!root||root.dataset.ftlBound)return;root.dataset.ftlBound='1';
  root.addEventListener('click',e=>{const pb=e.target.closest('[data-ftl-profile]');if(pb){ensureFtlState().selectedProfile=+pb.dataset.ftlProfile;saveState();renderFtlFull();return;}const sb=e.target.closest('[data-ftl-section]');if(sb){ensureFtlState().section=sb.dataset.ftlSection;saveState();renderFtlFull();return;}const save=e.target.closest('#saveFtlSettings');if(save){const f=ensureFtlState(),pi=+f.selectedProfile,s=f.profiles[pi];s.role=document.getElementById('ftlRole').value;s.homeBase=document.getElementById('ftlHomeBase').value.trim().toUpperCase();s.cabinReportLead=Math.max(0,+document.getElementById('ftlCabinLead').value||0);saveState({immediate:true});renderFtlFull();return;}});
  root.addEventListener('change',e=>{if(e.target.id==='ftlRole'){document.getElementById('ftlCabinLeadWrap').hidden=e.target.value!=='cabin';}});
}

// Replace the placeholder renderer from app.js.
window.RosterFTL={analyseProfile,analyseDuty,basicTable2,unknownTable3,extensionTable4,acclimTable1,table5Nights,TABLE2,TABLE3,TABLE4,TABLE5,version:FTL_VERSION};
renderFtl=function(){bindFtl();renderFtlFull();};
try{bindFtl();}catch(e){console.error('[RosterHome FTL] bind',e);}
})();

/*
 * RosterHome FTL engine — Corendon Airlines Europe OM-A Ch. 7 core rules.
 * Version 0.3.4
 *
 * Implemented here:
 * - Disruptive schedules (EARLY TYPE): EARLY 05:00-05:59, LATE 23:00-01:59,
 *   NIGHT encroaches 02:00-04:59.
 * - Local night definition: 8 continuous hours falling between 22:00 and 08:00.
 * - Late finish/night duty -> early start at Home/Operating Base requires 1 local night.
 * - Minimum rest: Home/Operating Base max(previous duty, 12h); away max(previous duty, 10h).
 * - Basic maximum daily FDP Table 2 for acclimatised crew (1-10 sectors).
 * - Cumulative duty limits 60h/7d, 110h/14d, 190h/28d.
 * - Flight time limit 100h/28d (annual windows require more history than a monthly roster).
 *
 * All civil datetime inputs are timezone-neutral YYYY-MM-DDTHH:mm[:ss] strings.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.RosterHomeFTL=Object.assign(root.RosterHomeFTL||{},api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const MIN=60000,HOUR=60*MIN,DAY=24*HOUR;
  const pad2=n=>String(n).padStart(2,'0');

  function parseCivil(value){
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(value instanceof Date)return value.getTime();
    if(typeof value!=='string')throw new TypeError('Expected civil datetime');
    const m=value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if(!m)throw new Error(`Invalid civil datetime: ${value}`);
    return Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
  }
  function civilParts(ms){const d=new Date(ms);return{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:d.getUTCHours(),minute:d.getUTCMinutes(),second:d.getUTCSeconds()};}
  function civilISO(ms){const p=civilParts(ms);return`${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;}
  function minuteOfDay(ms){const p=civilParts(ms);return p.hour*60+p.minute+p.second/60;}
  function startOfCivilDay(ms){const p=civilParts(ms);return Date.UTC(p.year,p.month-1,p.day);}
  function durationMinutes(a,b){const s=parseCivil(a),e=parseCivil(b);if(e<s)throw new Error('End precedes start');return(e-s)/MIN;}
  function overlap(aS,aE,bS,bE){return aS<bE&&bS<aE;}

  function classifyDisruptiveDuty(dutyStart,dutyEnd){
    const start=parseCivil(dutyStart),end=parseCivil(dutyEnd);if(end<=start)throw new Error('Duty end must be after duty start');
    const sm=minuteOfDay(start),em=minuteOfDay(end);
    const early=sm>=300&&sm<360; // 05:00-05:59
    const late=em>=1380||em<120; // 23:00-01:59
    let night=false;
    for(let d=startOfCivilDay(start)-DAY,last=startOfCivilDay(end)+DAY;d<=last&&!night;d+=DAY){
      if(overlap(start,end,d+2*HOUR,d+5*HOUR))night=true; // 02:00-04:59
    }
    let primaryType='NORMAL';if(night)primaryType='NIGHT';else if(early)primaryType='EARLY';else if(late)primaryType='LATE';
    return{early,late,night,disruptive:early||late||night,primaryType};
  }

  function countLocalNights(restStart,restEnd){
    const start=parseCivil(restStart),end=parseCivil(restEnd);if(end<=start)return 0;
    let count=0;
    for(let d=startOfCivilDay(start)-DAY,last=startOfCivilDay(end)+DAY;d<=last;d+=DAY){
      const envelopeStart=d+22*HOUR,envelopeEnd=d+DAY+8*HOUR;
      if(Math.min(end,envelopeEnd)-Math.max(start,envelopeStart)>=8*HOUR)count++;
    }
    return count;
  }

  function validateDisruptiveTransition(previousDuty,nextDuty,options={}){
    const home=options.atHomeOrOperatingBase!==false;
    const previous=classifyDisruptiveDuty(previousDuty.start,previousDuty.end);
    const next=classifyDisruptiveDuty(nextDuty.start,nextDuty.end);
    const localNights=countLocalNights(previousDuty.end,nextDuty.start);
    const requiresLocalNight=home&&(previous.late||previous.night)&&next.early;
    return{
      compliant:!requiresLocalNight||localNights>=1,
      rule:'OM-A 7.1.17.5(1)',previous,next,localNights,requiresLocalNight,
      reason:!requiresLocalNight?'No late/night → early transition; rule not applicable.':localNights>=1?'Required local night is present.':'Late/night → early at Home/Operating Base without 1 local night.'
    };
  }

  function minimumRestMinutes(previousDutyMinutes,atHomeOrOperatingBase=true){return Math.max(atHomeOrOperatingBase?720:600,Number(previousDutyMinutes)||0);}
  function validateMinimumRest(previousDutyEnd,nextDutyStart,previousDutyMinutes,atHomeOrOperatingBase=true){
    const actual=durationMinutes(previousDutyEnd,nextDutyStart),required=minimumRestMinutes(previousDutyMinutes,atHomeOrOperatingBase);
    return{compliant:actual>=required,actualMinutes:actual,requiredMinutes:required,rule:atHomeOrOperatingBase?'OM-A 7.1.17.1':'OM-A 7.1.17.2'};
  }

  const TABLE2=[
    [0,299,[660,630,600,570,540,540,540,540,540]],
    [300,314,[720,690,660,630,600,570,540,540,540]],
    [315,329,[735,705,675,645,615,585,555,540,540]],
    [330,344,[750,720,690,660,630,600,570,540,540]],
    [345,359,[765,735,705,675,645,615,585,555,540]],
    [360,809,[780,750,720,690,660,630,600,570,540]],
    [810,839,[765,735,705,675,645,615,585,555,540]],
    [840,869,[750,720,690,660,630,600,570,540,540]],
    [870,899,[735,705,675,645,615,585,555,540,540]],
    [900,929,[720,690,660,630,600,570,540,540,540]],
    [930,959,[705,675,645,615,585,555,540,540,540]],
    [960,989,[690,660,630,600,570,540,540,540,540]],
    [990,1019,[675,645,615,585,555,540,540,540,540]],
    [1020,1439,[660,630,600,570,540,540,540,540,540]]
  ];
  function table2MaxFdpMinutes(reportMinuteOfDay,sectors){
    const s=Math.max(1,Math.min(10,Math.trunc(Number(sectors)||1))),idx=s<=2?0:s-2;
    const m=((Number(reportMinuteOfDay)%1440)+1440)%1440;
    const row=TABLE2.find(r=>m>=r[0]&&m<=r[1]);return row?row[2][idx]:null;
  }
  function table2MaxForCivil(civil,sectors){return table2MaxFdpMinutes(minuteOfDay(parseCivil(civil)),sectors);}
  function formatMinutes(minutes){if(minutes==null||!Number.isFinite(minutes))return'—';const m=Math.round(minutes);return`${Math.floor(m/60)}:${pad2(Math.abs(m%60))}`;}

  function rollingTotal(records,index,days,valueKey='minutes'){
    if(!records[index])return 0;const end=records[index].endMs,start=end-days*DAY;let total=0;
    for(let i=0;i<=index;i++){const r=records[i];if(r.endMs>start&&r.endMs<=end)total+=Number(r[valueKey]||0);}return total;
  }
  function cumulativeAt(records,index){
    return{duty7:rollingTotal(records,index,7,'dutyMinutes'),duty14:rollingTotal(records,index,14,'dutyMinutes'),duty28:rollingTotal(records,index,28,'dutyMinutes'),flight28:rollingTotal(records,index,28,'flightMinutes')};
  }
  function validateCumulative(c){return{
    compliant:c.duty7<=3600&&c.duty14<=6600&&c.duty28<=11400&&c.flight28<=6000,
    checks:[
      {label:'Duty 7d',actual:c.duty7,limit:3600,rule:'OM-A 7.1.11.1(a)'},
      {label:'Duty 14d',actual:c.duty14,limit:6600,rule:'OM-A 7.1.11.1(b)'},
      {label:'Duty 28d',actual:c.duty28,limit:11400,rule:'OM-A 7.1.11.1(c)'},
      {label:'Flight 28d',actual:c.flight28,limit:6000,rule:'OM-A 7.1.11.2(a)'}
    ].map(x=>({...x,compliant:x.actual<=x.limit}))
  };}

  return{parseCivil,civilISO,durationMinutes,classifyDisruptiveDuty,countLocalNights,validateDisruptiveTransition,minimumRestMinutes,validateMinimumRest,table2MaxFdpMinutes,table2MaxForCivil,formatMinutes,cumulativeAt,validateCumulative};
});

const assert=require('assert');
const f=require('../ftl-engine.js');
function c(start,end){return f.classifyDisruptiveDuty(start,end)}
assert.equal(c('2026-09-10T03:00','2026-09-10T12:04').primaryType,'NIGHT');
assert.equal(c('2026-09-10T04:59','2026-09-10T12:00').night,true);
assert.equal(c('2026-09-10T05:00','2026-09-10T12:00').early,true);
assert.equal(c('2026-09-10T05:59','2026-09-10T12:00').early,true);
assert.equal(c('2026-09-10T06:00','2026-09-10T12:00').early,false);
assert.equal(c('2026-09-08T13:30','2026-09-09T01:40').late,true);
let t=f.validateDisruptiveTransition({start:'2026-09-08T13:30',end:'2026-09-09T01:40'},{start:'2026-09-10T03:00',end:'2026-09-10T12:04'},{atHomeOrOperatingBase:true});
assert.equal(t.requiresLocalNight,false); assert.equal(t.compliant,true);
let r=f.validateMinimumRest('2026-09-09T01:40','2026-09-10T03:00',730,true);
assert.equal(Math.round(r.actualMinutes),1520); assert.equal(r.requiredMinutes,730); assert.equal(r.compliant,true);
assert.equal(f.table2MaxForCivil('2026-09-10T03:00',2),660);
assert.equal(f.table2MaxForCivil('2026-09-08T13:30',2),765);
// Regression: a roster saved by an older build can lack source wall-clock
// fields. Its persisted instant renders as 05:00 in Berlin, but CrewLink's
// official TYPE NIGHT must remain authoritative for the transition rule.
const staleCalculated=c('2026-09-10T05:00','2026-09-10T14:04');
const persistedNight=f.resolveDisruptiveFlags('NIGHT',staleCalculated);
assert.equal(staleCalculated.early,true);
assert.equal(persistedNight.primaryType,'NIGHT');
assert.equal(persistedNight.early,false);
assert.equal(persistedNight.night,true);
const previousLate=f.resolveDisruptiveFlags('LATE',c('2026-09-08T15:30','2026-09-09T03:40'));
assert.equal((previousLate.late||previousLate.night)&&persistedNight.early,false);
let bad=f.validateDisruptiveTransition({start:'2026-09-08T13:30',end:'2026-09-09T01:40'},{start:'2026-09-09T05:30',end:'2026-09-09T12:00'},{atHomeOrOperatingBase:true});
assert.equal(bad.requiresLocalNight,true); assert.equal(bad.compliant,false);
console.log('FTL engine tests passed');

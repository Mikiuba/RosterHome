const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const parser=require('../roster-parser'),history=require('../roster-history'),engine=require('../ftl-engine');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
async function main(){
  const upload=process.argv[2];if(!upload)throw Error('Pass the directory containing the four original PDFs');
  const pdfjs=await import(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
  const nodes=new Map(),storage=new Map();
  const c={window:{pdfjsLib:pdfjs,RosterHomeFTL:engine,RosterHistory:history},pdfjsLib:pdfjs,Uint8Array,Intl,Date,console,
    RosterParser:parser,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    $:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)},esc:x=>String(x??''),gapLabel:String,
    saveState:()=>{},syncInputs:()=>{},renderCalendar:()=>{}};
  vm.createContext(c);
  // Actual state normalization, merge and FTL render functions, not copies.
  vm.runInContext(app.slice(0,app.indexOf('function saveState(')),c);
  vm.runInContext('state.month="2026-09"; state.rules.sleepHours=9;',c);
  vm.runInContext(app.slice(app.indexOf('async function extractPdfText'),app.indexOf('function gapLabel')),c);
  vm.runInContext(app.slice(app.indexOf('function ftlMinutes'),app.indexOf('function renderSummary')),c);
  const byCode={MTR:{},ENJ:{}};
  for(const name of fs.readdirSync(upload).filter(n=>n.endsWith('.pdf'))){
    if(!(/12207|19646|3571|ENJ SEP\(1\)/.test(name)))continue;
    const text=await c.extractPdfText({arrayBuffer:async()=>fs.readFileSync(path.join(upload,name))});
    const r=parser.parseCrewLinkText(text);
    assert.equal(r.validation.ok,true,JSON.stringify(r.validation));
    assert.equal(r.coverage.complete,true,JSON.stringify(r.coverage));
    const code=r.crew.crewCode,month=r.coverage.start.slice(0,7);
    byCode[code][month]=r;
    c.mergeParsed(code==='MTR'?0:1,r,name);
    console.log(code,month,r.validation.stats.duties+' services',JSON.stringify(r.coverage.actual));
  }
  assert.equal(Object.keys(byCode.MTR).length,2);assert.equal(Object.keys(byCode.ENJ).length,2);
  const mtr=byCode.MTR['2026-09'].duties.filter(d=>d.kind==='duty');
  assert.deepEqual(mtr.slice(0,3).map(d=>[d.serviceType,d.checkIn.slice(11,16),d.checkout.slice(11,16),d.dutyCreditMinutes]),[
    ['positioning','07:10','16:40',570],['training','11:30','17:30',360],['training_positioning','07:15','18:00',645]]);
  assert.equal(mtr.slice(0,3).reduce((n,d)=>n+d.dutyCreditMinutes,0),1575);
  assert.equal(mtr.slice(0,3).reduce((n,d)=>n+history.record(d,parser.airportTimeZone).flightMinutes,0),0);
  const standby=byCode.ENJ['2026-08'].duties.filter(d=>d.serviceType==='standby');
  assert.equal(standby.length,3);assert.deepEqual(standby.map(d=>d.dutyCreditMinutes),[105,105,104]);
  assert.ok(standby.every(d=>d.standbyType==='other'));
  c.renderFtl();
  assert.equal(nodes.get('ftlSummaryLine').textContent,'23 compliant · 0 review · 0 non-compliant · 23 duties');
  let html=nodes.get('ftlDutyResults').innerHTML;
  assert.ok(html.includes('03:00–12:04'));assert.ok(html.includes('Crédito duty 9:30'));
  assert.ok(html.includes('Jornada: COMPLIANT · Acumulados: COMPLIANT'));
  assert.ok(html.includes('RES: 2026-09-28'));
  // Import order / reimport must retain both months and user preferences.
  const before=vm.runInContext('state.people[0].duties.length',c);
  c.mergeParsed(0,byCode.MTR['2026-08'],'repeat.pdf');
  assert.equal(vm.runInContext('state.people[0].duties.length',c),before);
  assert.equal(vm.runInContext('state.people[0].coverage.length',c),2);
  assert.equal(vm.runInContext('state.month',c),'2026-09');
  assert.equal(vm.runInContext('state.rules.sleepHours',c),9);
  assert.throws(()=>c.mergeParsed(0,byCode.ENJ['2026-08'],'wrong.pdf'),/otro perfil/);
  // Simulate durable restore/backup roundtrip using production normalization.
  vm.runInContext('state=normalizeState(JSON.parse(JSON.stringify(state)));',c);
  c.renderFtl();assert.equal(nodes.get('ftlDutyResults').innerHTML,html);
  // Omitted month must not be silently treated as zero time.
  vm.runInContext('state.people[1].coverage=state.people[1].coverage.filter(c=>c.start.startsWith("2026-09"));',c);
  c.renderFtl();assert.ok(nodes.get('ftlDutyResults').innerHTML.includes('falta cobertura 2026-08'));
  // An unparsed or missing service invalidates the whole claimed source period.
  const badText='Period: 01Sep26 - 30Sep26\nFlight time 10:00 Duty time 12:00\nDuty time special 12:00';
  assert.equal(parser.parseCrewLinkText(badText).coverage.complete,false);
  const coverage=[{start:'2026-08-01',end:'2026-08-31',timeZone:'UTC',complete:true,parserVersion:2},{start:'2026-10-01',end:'2026-10-31',timeZone:'UTC',complete:true,parserVersion:2}];
  assert.deepEqual(history.gaps(coverage,Date.parse('2026-08-20Z'),Date.parse('2026-10-02Z')),
    [[Date.parse('2026-09-01Z'),Date.parse('2026-10-01Z')]]);
  const replaced=history.replaceCoverage([{start:'2026-08-01',end:'2026-09-30',timeZone:'UTC',complete:true,parserVersion:2}],{start:'2026-09-01',end:'2026-09-30',timeZone:'UTC',complete:false,parserVersion:2});
  assert.equal(history.gaps(replaced,Date.parse('2026-09-01Z'),Date.parse('2026-09-02Z')).length,1);
  // Duty crossing the boundary contributes only its portion inside the window.
  const records=[{startMs:Date.parse('2026-09-01T23:00Z'),endMs:Date.parse('2026-09-02T01:00Z'),dutyMinutes:120,flightMinutes:0,flightSegments:[],flightTimingKnown:true},
    {startMs:Date.parse('2026-09-08T10:00Z'),endMs:Date.parse('2026-09-08T11:00Z'),dutyMinutes:60,flightMinutes:0,flightSegments:[],flightTimingKnown:true}];
  assert.equal(history.cumulative(records,1,7,'UTC').duty,120);
  // Local midnight conversion follows DST, not a fixed +2/+3 offset.
  assert.equal(history.instant('2026-10-25','00:00:00','Europe/Berlin'),Date.parse('2026-10-24T22:00Z'));
  assert.equal(history.instant('2026-10-26','00:00:00','Europe/Berlin'),Date.parse('2026-10-25T23:00Z'));
  console.log('PASS: four PDFs, full services, totals, rolling windows, missing-month gaps, profile isolation, merge and restore, rendered September results.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

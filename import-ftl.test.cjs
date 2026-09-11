const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const parser=require('../roster-parser');
const engine=require('../ftl-engine');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
async function main(){
  const pdfPath=process.argv[2];
  if(!pdfPath)throw Error('Pass the original ENJ SEP.pdf as the first argument');
  const pdfjs=await import(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
  const ctx={window:{pdfjsLib:pdfjs},pdfjsLib:pdfjs,Uint8Array};
  vm.createContext(ctx);
  vm.runInContext(app.slice(app.indexOf('async function extractPdfText'),app.indexOf('function mergeParsed')),ctx);
  const text=await ctx.extractPdfText({arrayBuffer:async()=>fs.readFileSync(pdfPath)});
  assert.equal(parser.parseTimeBasis(text),'local_event');
  const parsed=parser.parseCrewLinkText(text);
  assert.equal(parsed.validation.ok,true,JSON.stringify(parsed.validation));
  const duties=parsed.duties.filter(d=>d.kind==='duty');
  assert.equal(duties.length,10);
  assert.equal(parsed.validation.stats.brkMatches,9);
  const legacy=duties.map(d=>({...d,timeBasis:'utc',sourceCheckInTimeZone:'UTC',sourceCheckOutTimeZone:'UTC',
    checkIn:d.sourceCheckInDate+'T'+d.sourceCheckInTime.slice(0,2)+':'+d.sourceCheckInTime.slice(2)+':00.000Z',
    checkout:d.sourceCheckOutDate+'T'+d.sourceCheckOutTime.slice(0,2)+':'+d.sourceCheckOutTime.slice(2)+':00.000Z'}));
  legacy.forEach((d,i)=>{
    const fixed=parser.repairLegacyDuty(d);
    assert.equal(fixed.checkIn,duties[i].checkIn);
    assert.equal(fixed.checkout,duties[i].checkout);
    assert.deepEqual(parser.repairLegacyDuty(fixed),fixed,'Migration must be idempotent');
  });
  const utc={...legacy[0],sourceCheckOutMarked:false,flights:[]};
  assert.deepEqual(parser.repairLegacyDuty(utc),utc,'Never shift a genuine UTC roster');
  assert.equal(parser.repairLegacyDuty({...legacy[0],sourceCheckInTime:null}).timeRepairRequired,true);
  assert.equal(parser.parseTimeBasis('Local times at\n[[PAGE RIGHT]]\nevent airport'),'local_event');
  const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);};
  const renderContext={window:{RosterHomeFTL:engine},RosterParser:parser,Intl,Date,console,$,
    state:{people:[{name:'Test',duties:[...parsed.duties.filter(d=>d.kind!=='duty'),...legacy]}],rules:{homeTz:'Europe/Athens'}},
    dedupeDuties:x=>x,esc:x=>String(x??''),gapLabel:String};
  vm.createContext(renderContext);
  vm.runInContext(app.slice(app.indexOf('function ftlMinutes'),app.indexOf('function renderSummary')),renderContext);
  renderContext.renderFtl();
  const html=$('ftlDutyResults').innerHTML;
  assert.ok(html.includes('03:00–12:04'));
  assert.ok(html.includes('13:30–01:55'));
  assert.ok(!html.includes('05:00–14:04'));
  assert.ok(!html.includes('CrewLink max'));
  assert.ok(!html.includes('TYPE CrewLink'));
  assert.ok(!html.includes('NON-COMPLIANT'));
  assert.ok(html.includes('LATE → NIGHT · no exige Local Night'));
  assert.ok(html.includes('Historial incompleto'));
  assert.equal($('ftlSummaryLine').textContent,'1 compliant · 9 review · 0 non-compliant · 10 duties');
  renderContext.state.people[0].duties=parsed.duties;
  renderContext.renderFtl();
  assert.equal($('ftlDutyResults').innerHTML,html,'Fresh import and legacy repair must render identically');
  for(const d of duties){
    const civil=renderContext.ftlCivilAt(d.checkIn,'Europe/Berlin');
    const max=engine.table2MaxForCivil(civil,d.flights.length);
    assert.equal(engine.formatMinutes(max),d.max.replace(/^0/,''));
    console.log(d.date,civil.slice(11,16),d.type,'max',engine.formatMinutes(max));
  }
  console.log('PASS: real PDF extraction → parser → legacy migration → FTL HTML; all 10 maxima match CrewLink.');
  console.log('Status:', $('ftlSummaryLine').textContent);
}
main().catch(e=>{console.error(e);process.exitCode=1;});

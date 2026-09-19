import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('v0.9.2 exposes separate briefing and flight calendar exports',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../enhancements.js',import.meta.url),'utf8');

  assert.match(html,/id="exportBriefingsIcs"/);
  assert.match(html,/id="exportFlightsIcs"/);
  assert.match(html,/id="calendarExportPerson"/);

  assert.match(js,/X-WR-CALNAME/);
  assert.match(js,/RosterHome · Briefings/);
  assert.match(js,/RosterHome · Vuelos/);
  assert.match(js,/rhFlightInstants/);
  assert.match(js,/e\.kind==='briefing'/);
  assert.doesNotMatch(js,/rhBuildCalendar\(kind\)[\s\S]{0,3500}recovery/i);
});

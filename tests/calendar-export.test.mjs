import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('v0.9.4 calendar export is standalone and operational',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../calendar-export.js',import.meta.url),'utf8');
  assert.match(html,/id="exportBriefingsIcs"/);
  assert.match(html,/id="exportFlightsIcs"/);
  assert.match(html,/calendar-export\.js\?v=0\.9\.4/);
  assert.match(js,/function flightInstants/);
  assert.match(js,/function briefingEvent/);
  assert.match(js,/navigator\.share/);
  assert.match(js,/URL\.createObjectURL/);
});

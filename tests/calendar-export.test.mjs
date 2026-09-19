import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('calendar generator builds separate briefing and flight feeds',()=>{
  const js=fs.readFileSync(new URL('../calendar-export.js',import.meta.url),'utf8');
  assert.match(js,/function flightInstants/);
  assert.match(js,/function briefingEvent/);
  assert.match(js,/RosterHomeCalendarExport/);
  assert.match(js,/makeIcs/);
});

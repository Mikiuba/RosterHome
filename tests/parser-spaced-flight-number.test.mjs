import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const parser = require('../roster-parser.js');

test('CrewLink: flight number with separated suffix is one sector', () => {
  const text = `
Individual duty plan for MTR ESPARCIA CASTRO, MIGUEL NetLine/Crew(COR)
Period: 14Sep26 - 30Sep26
Tue29 C/I HER 1100
CXI 2210 HER 1200 1420 GRZ 738M
CXI 22 P GRZ 1510 1605 DRS 738M
CXI 449 DRS 1655 1955 HER 738M
C/O 2025 HER [FT 06:15]
[DT 09:25]
[FDT 08:55]
[max 12:00]
[FDP 08:55]
[ACC HER]
[TYPE LATE]
`;
  const result = parser.parseCrewLinkText(text);
  const duty = result.duties.find(d => d.date === '2026-09-29');

  assert.ok(duty);
  assert.equal(duty.flights.length, 3);
  assert.equal(duty.route, 'HER–GRZ–DRS–HER');
  assert.deepEqual(duty.flights.map(f => f.number), ['2210', '22P', '449']);
  assert.equal(duty.ft, '06:15');
  assert.equal(duty.dt, '09:25');
  assert.equal(duty.fdp, '08:55');
  assert.equal(duty.max, '12:00');
});

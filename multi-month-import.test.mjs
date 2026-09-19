import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const parser=require('../roster-parser.js');

test('3-month CrewLink export resolves repeated day numbers to the correct month',()=>{
  const text=`
HERCOR/CREW/MTR/no crew box
Individual duty plan for MTR TEST, MIGUEL NetLine/Crew(COR)
Period: 01Aug26 - 31Oct26

Fri14 C/I HER 0300
CXI 9370 HER 0400 0600 RZE 738M
CXI 9369 RZE 0700 0900 HER 738M
C/O 0930 HER [FT 04:00]
[DT 06:30]
[FDT 06:00]
[max 13:00]
[FDP 06:00]
[BRK 743:30]
[ACC HER]
[TYPE N/A]

Mon14 C/I HER 1100
CXI 458 HER 1200 1500 BER 738M
CXI 457 BER 1600 1900 HER 738M
C/O 1930 HER [FT 06:00]
[DT 08:30]
[FDT 08:00]
[max 12:30]
[FDP 08:00]
[BRK 711:30]
[ACC HER]
[TYPE N/A]

Wed14 C/I HER 1200
CXI 2210 HER 1300 1530 GRZ 738M
CXI 2209 GRZ 1630 1900 HER 738M
C/O 1930 HER [FT 05:00]
[DT 07:30]
[FDT 07:00]
[max 12:00]
[FDP 07:00]
[ACC HER]
[TYPE LATE]

Flight time 15:00 Duty time 22:30
Duty time special 22:30
`;
  const result=parser.parseCrewLinkText(text);
  const duties=result.duties.filter(d=>d.kind==='duty');
  assert.deepEqual(duties.map(d=>d.date),['2026-08-14','2026-09-14','2026-10-14']);
  assert.equal(result.validation.stats.overlaps,0);
});

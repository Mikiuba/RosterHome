import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../crewlink-sync.js',import.meta.url),'utf8');

test('Auto Sync reads CrewLink begin/end using resilient field extraction',()=>{
  assert.match(worker,/const crewlinkWindow=await evaluate/);
  assert.match(worker,/pick\('beginDate'\)/);
  assert.match(worker,/pick\('endDate'\)/);
  assert.match(worker,/e\.value\|\|e\.defaultValue\|\|e\.getAttribute/);
  assert.match(worker,/payload\.useCrewlinkWindow===true/);
});

test('Auto Sync still requires the live CrewLink window',()=>{
  assert.match(worker,/periodo seleccionable para Auto Sync/);
  assert.match(worker,/selectedStart=availableStart/);
  assert.match(worker,/selectedEnd=availableEnd/);
});

test('manual cloud import can continue when CrewLink hides its upper-bound fields',()=>{
  assert.match(client,/Elige desde hoy/);
  assert.match(worker,/Manual import already has explicit dates selected by the user/);
  assert.match(worker,/Otherwise submit the user's dates and let CrewLink answer/);
});

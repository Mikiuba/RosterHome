import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../crewlink-sync.js',import.meta.url),'utf8');

test('Auto Sync reads the live CrewLink begin/end dates from makeReport form',()=>{
  assert.match(worker,/const crewlinkWindow=await evaluate/);
  assert.match(worker,/elements\?\.beginDate\?\.value/);
  assert.match(worker,/elements\?\.endDate\?\.value/);
  assert.match(worker,/payload\.useCrewlinkWindow===true/);
  assert.match(worker,/selectedRange=\{start:selectedStart,end:selectedEnd\}/);
});

test('Auto Sync no longer guesses end-of-month plus two months',()=>{
  assert.doesNotMatch(worker,/getUTCMonth\(\)\+3,0/);
  assert.doesNotMatch(worker,/function autoRange/);
  assert.match(worker,/useCrewlinkWindow:true/);
});

test('manual cloud import delegates the real upper bound to CrewLink',()=>{
  assert.doesNotMatch(client,/crewlinkSelectableWindow/);
  assert.match(client,/CrewLink validará el último día realmente disponible/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as runtime from '../cloudflare/roster-parser-runtime.mjs';

const require=createRequire(import.meta.url);
const browser=require('../roster-parser.js');

test('Worker and browser parser agree on period parsing',()=>{
  const sample='Individual duty plan for MTR TEST NetLine/Crew\nPeriod: 24Sep26 - 30Sep26\n';
  const a=browser.parseCrewLinkText(sample);
  const b=runtime.parseCrewLinkText(sample);
  assert.equal(a.period.start.toISOString(),b.period.start.toISOString());
  assert.equal(a.period.end.toISOString(),b.period.end.toISOString());
  assert.equal(a.crew.crewCode,b.crew.crewCode);
  assert.equal(a.timeBasis,b.timeBasis);
});

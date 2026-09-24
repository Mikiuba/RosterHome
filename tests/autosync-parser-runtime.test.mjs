import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../cloudflare/roster-parser-runtime.mjs',import.meta.url),'utf8');

test('Auto Sync parses roster text in the Worker instead of injecting parser source into Browser Run',()=>{
  assert.match(worker,/import \* as RosterParserRuntime from '\.\/roster-parser-runtime\.mjs'/);
  assert.match(worker,/RosterParserRuntime\.parseCrewLinkText\(text\)/);
  assert.doesNotMatch(worker,/parserAssetSource/);
  assert.doesNotMatch(worker,/parserSource\+'\\n;!!globalThis\.RosterParser'/);
});

test('Worker parser exports the same public parser functions needed by Auto Sync',()=>{
  assert.match(runtime,/export \{[^}]*parseCrewLinkText/);
  assert.match(runtime,/airportTimeZone/);
  assert.match(runtime,/validateDuties/);
});

test('CDP exceptions preserve the actual exception description instead of only Uncaught',()=>{
  assert.match(worker,/exception\?\.description\|\|r\.exceptionDetails\.exception\?\.value/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');

test('CrewLink PDF discovery checks the current page and popup targets',()=>{
  assert.match(worker,/function crewlinkPdfFromCandidate/);
  assert.match(worker,/async function locateCrewlinkPdf/);
  assert.match(worker,/Target\.getTargets/);
  assert.match(worker,/performance\.getEntriesByType\('resource'\)/);
  assert.match(worker,/document\.querySelectorAll\('iframe\[src\],frame\[src\],embed\[src\],object\[data\],a\[href\]/);
});

test('viewer URLs can expose the real PDF through file/src/url query params',()=>{
  assert.match(worker,/searchParams\.get\('file'\)/);
  assert.match(worker,/searchParams\.get\('src'\)/);
  assert.match(worker,/searchParams\.get\('url'\)/);
  assert.match(worker,/\/crewlink\\\/temp\\\/[^/]+/);
});

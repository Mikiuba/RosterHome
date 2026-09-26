import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');

test('manual CrewLink import does not fail when date widgets hide their values',()=>{
  assert.match(worker,/Manual import already has explicit dates selected by the user/);
  assert.match(worker,/if\(availableStart&&availableEnd&&\(selectedStart<availableStart\|\|selectedEnd>availableEnd\)\)/);
  assert.doesNotMatch(worker,/if\(!availableStart\|\|!availableEnd\)throw Error\('CrewLink no publicó correctamente su periodo seleccionable\.'\)/);
});

test('Auto Sync still requires CrewLink live selectable dates',()=>{
  assert.match(worker,/payload\.useCrewlinkWindow===true/);
  assert.match(worker,/periodo seleccionable para Auto Sync/);
});

test('CrewLink date extraction also checks defaultValue and value attribute',()=>{
  assert.match(worker,/e\.value\|\|e\.defaultValue\|\|e\.getAttribute/);
});

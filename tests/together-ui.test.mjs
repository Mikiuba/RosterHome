import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {readEnhancementsSource} from './_enhancements-source.mjs';
test('v1.1.8 Together UI exposes concise metrics and overlay sheet',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=readEnhancementsSource();
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

  assert.match(html,/data-view="summaryView">Juntos</);
  assert.match(html,/id="summarySheet"/);
  assert.match(html,/id="dateNightLatestStart"/);
  assert.match(html,/id="dateNightUntil"/);

  for(const id of ['dateNights','qualityDays','togetherHours','mornings','dinners','sleepTogether','fullDays','getaways','difficult','workload']){
    assert.match(js,new RegExp(`id:'${id}'`));
  }
  assert.match(js,/rhUniqueItems/);
  assert.match(js,/rhCoverageVerified/);
  assert.match(css,/env\(safe-area-inset-top/);
  assert.match(css,/\.summary-sheet-card/);
  assert.match(css,/\.together-stats/);
});

test('date night requires verified next-day coverage and is local-time based',()=>{
  const js=readEnhancementsSource();
  assert.match(js,/rhCoveredPair\(key,true\)/);
  assert.match(js,/utcForLocalDayTime\(key,'19:00'\)/);
  assert.match(js,/utcForLocalDayTime\(next,state\.rules\.dateNightUntil/);
  assert.match(js,/g\.start<=latestStart&&g\.end>=end/);
});

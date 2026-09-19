import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {readEnhancementsSource} from './_enhancements-source.mjs';
test('sleep detail explicitly exposes the first commitment used by the calculation', () => {
  const source = readEnhancementsSource();
  assert.match(source, /firstCommitmentKind:usesBriefing\?'briefing':'report-departure'/);
  assert.match(source, /detailRow\('Primera obligación',firstKind\)/);
  assert.match(source, /detailRow\('Hora primera obligación',firstAt\)/);
  assert.match(source, /detailRow\('Salida hacia el report',reportReady\)/);
  assert.match(source, /detailRow\('Report CrewLink',report\)/);
});

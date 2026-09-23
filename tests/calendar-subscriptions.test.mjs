import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('v1.1.2 exposes private subscribed calendar UI and client',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../calendar-subscriptions.js',import.meta.url),'utf8');
  assert.match(html,/id="calendarEnableSync"/);
  assert.match(html,/id="installBriefingsCalendar"/);
  assert.match(html,/id="installFlightsCalendar"/);
  assert.match(html,/calendar-subscriptions\.js\?v=1\.1\.2/);
  assert.match(js,/\/api\/calendar\/publish/);
  assert.match(js,/webcal:/);
  assert.match(js,/rh-storage-saved/);
});

test('worker stores calendar feeds in a Durable Object',()=>{
  const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');
  const cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.match(worker,/class CalendarStore/);
  assert.match(worker,/\/api\/calendar\/publish/);
  assert.match(worker,/\/calendar\\\//);
  assert.equal(cfg.durable_objects.bindings[0].name,'CALENDAR_STORE');
  assert.ok(cfg.assets.run_worker_first.includes('/calendar/*'));
  assert.equal(cfg.exports.CalendarStore.type,'durable-object');
  assert.equal(cfg.exports.CalendarStore.storage,'sqlite');
  assert.match(worker,/export \{ CalendarStore \};/);
});

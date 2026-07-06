// DoomBreaker meter tests — node built-in assert, no deps.
// Run: node test/meter.test.mjs

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DBMeter = require('../meter.js');

const { BUDGET_PX, VIDEO_HIT, HEAL_PER_SEC, IDLE_MS } = DBMeter.CFG;

function approx(actual, expected, msg, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps, `${msg}: got ${actual}, want ${expected}`);
}

let t = 1_000_000; // arbitrary base timestamp (ms)

// --- create ---
{
  const s = DBMeter.create(t);
  assert.equal(s.d, 0, 'create: d starts at 0');
  assert.equal(s.last, t, 'create: last = now');
}

// --- wheel accumulation ---
{
  const s = DBMeter.create(t);
  DBMeter.addWheel(s, 10000, t + 100, 1);
  approx(s.d, 10000 / BUDGET_PX, 'wheel: 10000px at sens 1');
  assert.equal(s.last, t + 100, 'wheel: last updated');

  DBMeter.addWheel(s, -10000, t + 200, 1); // negative deltas count via |px|
  approx(s.d, 20000 / BUDGET_PX, 'wheel: |px| accumulates for negative delta');

  // accumulate to exactly full budget
  DBMeter.addWheel(s, 20000, t + 300, 1);
  approx(s.d, 1, 'wheel: full budget reaches d=1');

  // clamp at 1
  DBMeter.addWheel(s, 50000, t + 400, 1);
  assert.equal(s.d, 1, 'wheel: clamped at 1');
}

// --- no heal before IDLE_MS ---
{
  const s = DBMeter.create(t);
  DBMeter.addWheel(s, 20000, t, 1); // d = 0.5, last = t
  const d0 = s.d;

  DBMeter.tick(s, t + IDLE_MS - 1); // 1ms short of idle
  assert.equal(s.d, d0, 'tick: no heal before IDLE_MS');

  DBMeter.tick(s, t + IDLE_MS - 1 + 250); // still... now - last = IDLE_MS + 249 >= IDLE_MS, heals
}

// --- heal rate after idle ---
{
  const s = DBMeter.create(t);
  DBMeter.addWheel(s, 20000, t, 1); // d = 0.5
  DBMeter.tick(s, t + IDLE_MS);     // exactly idle boundary: heals for elapsed-since-lastTick
  // lastTick was t (create), elapsed = IDLE_MS ms = 3 s
  approx(s.d, 0.5 - HEAL_PER_SEC * (IDLE_MS / 1000), 'tick: heal at IDLE_MS boundary uses elapsed since previous tick');

  const dBefore = s.d;
  DBMeter.tick(s, t + IDLE_MS + 1000); // 1s later, still idle
  approx(s.d, dBefore - HEAL_PER_SEC * 1, 'tick: heals HEAL_PER_SEC per second');

  // new input resets idle — next tick within IDLE_MS of input must not heal
  DBMeter.addWheel(s, 4000, t + IDLE_MS + 2000, 1);
  const dAfterInput = s.d;
  DBMeter.tick(s, t + IDLE_MS + 3000); // only 1s since input
  assert.equal(s.d, dAfterInput, 'tick: input resets idle window, no heal within IDLE_MS');
}

// --- addVideo hit size ---
{
  const s = DBMeter.create(t);
  DBMeter.addVideo(s, t + 10, 1);
  approx(s.d, VIDEO_HIT, 'video: one hit = VIDEO_HIT at sens 1');
  assert.equal(s.last, t + 10, 'video: last updated');

  for (let i = 0; i < 100; i++) DBMeter.addVideo(s, t + 20 + i, 1);
  assert.equal(s.d, 1, 'video: many hits clamp at 1');
}

// --- sensitivity scaling ---
{
  const s = DBMeter.create(t);
  DBMeter.addWheel(s, 10000, t, 2);
  approx(s.d, (10000 * 2) / BUDGET_PX, 'sens: wheel scales with sensitivity 2');

  const s2 = DBMeter.create(t);
  DBMeter.addWheel(s2, 10000, t, 0.5);
  approx(s2.d, (10000 * 0.5) / BUDGET_PX, 'sens: wheel scales with sensitivity 0.5');

  const s3 = DBMeter.create(t);
  DBMeter.addVideo(s3, t, 2);
  approx(s3.d, VIDEO_HIT * 2, 'sens: video scales with sensitivity 2');
}

// --- d never below 0 ---
{
  const s = DBMeter.create(t);
  DBMeter.addWheel(s, 400, t, 1); // d = 0.01
  DBMeter.tick(s, t + IDLE_MS + 1_000_000); // massive idle heal, way past zero
  assert.equal(s.d, 0, 'heal: d clamps at 0, never negative');

  DBMeter.tick(s, t + IDLE_MS + 1_100_000); // keep healing at 0
  assert.equal(s.d, 0, 'heal: stays at 0');
}

console.log('meter.test.mjs: all tests passed');

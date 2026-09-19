// DoomBreaker cat tests — node built-in assert, no deps.
// Run: node test/cat.test.mjs

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DBCat = require('../cat.js');

// --- stage(): pure damage -> stage mapping ---
assert.equal(DBCat.stage(0), 0, 'zero damage hides the cat');
assert.equal(DBCat.stage(-1), 0, 'negative damage clamps to hidden');
assert.equal(DBCat.stage(NaN), 0, 'NaN clamps to hidden');
assert.equal(DBCat.stage('x'), 0, 'garbage clamps to hidden');

const S = DBCat.STAGES;
for (let i = 0; i < S.length; i++) {
  const below = i === 0 ? S[i] - 0.01 : S[i] - 0.001;
  if (below > (i === 0 ? -1 : S[i - 1])) {
    // just below a threshold stays at the previous stage
    const expected = i; // previous stage index (0 for first threshold)
    assert.equal(DBCat.stage(below), expected,
      `damage ${below} (just below stage ${i + 1} threshold) is stage ${expected}`);
  }
  assert.equal(DBCat.stage(S[i]), i + 1,
    `exactly at threshold ${S[i]} fires stage ${i + 1}`);
}
assert.equal(DBCat.stage(1), 4, 'full damage caps at stage 4');
assert.equal(DBCat.stage(2), 4, 'over-1 damage still caps at stage 4');
assert.equal(DBCat.stage(0.65), 2, 'damage between thresholds 2 and 3 sits at stage 2');
assert.equal(DBCat.stage(0.85), 3, 'damage between thresholds 3 and 4 sits at stage 3');

// --- svg(): deterministic markup per stage ---
assert.equal(DBCat.svg(0), '', 'stage 0 renders nothing');
for (let s = 1; s <= 4; s++) {
  const a = DBCat.svg(s);
  const b = DBCat.svg(s);
  assert.ok(a.length > 40, `stage ${s} has real SVG markup`);
  assert.equal(a, b, `stage ${s} SVG is deterministic`);
  assert.match(a, /<svg/, `stage ${s} is an svg`);
  assert.doesNotMatch(a, /Math\.random|Date\.now/, `stage ${s} has no render-time randomness`);
}
assert.match(DBCat.svg(4), /FEED BLOCKED/, 'block wall shows the blocked message');
assert.match(DBCat.svg(4), /PET THE CAT/i, 'block wall explains pet-to-continue');

// --- create(): DOM behavior in a minimal fake DOM is out of scope here
// (covered by E2E against real Chromium); guard the API shape instead.
assert.equal(typeof DBCat.create, 'function', 'create exists');

console.log('cat.test OK');

// --- Gatekeeper mode (gatekeeper.js): pure helpers ---
const DBGate = require('../gatekeeper.js');
assert.equal(DBGate.breakMs(1), 60000, '1 min break');
assert.equal(DBGate.breakMs(5), 300000, '5 min break');
assert.equal(DBGate.breakMs(3), 120000, 'unknown choice falls back to default 2 min');
assert.equal(DBGate.breakMs('junk'), 120000, 'garbage falls back to default');
assert.equal(DBGate.remaining(10000, 4000), 6000, 'remaining counts down');
assert.equal(DBGate.remaining(10000, 20000), 0, 'remaining never negative');
assert.equal(DBGate.remaining(0, 5), 0, 'no break = nothing remaining');
assert.equal(DBGate.fmt(120000), '2:00', 'formats whole minutes');
assert.equal(DBGate.fmt(61000), '1:01', 'pads seconds');
assert.equal(DBGate.fmt(500), '0:01', 'rounds up so it never shows 0:00 early');
assert.equal(DBGate.fmt(0), '0:00', 'zero is 0:00');
assert.equal(DBGate.TRIGGER, DBCat.STAGES[3], 'gatekeeper fires at the same damage as the companion wall');
const g = DBGate.svg();
assert.equal(g, DBGate.svg(), 'gatekeeper SVG is deterministic');
assert.match(g, /dbg-tail/, 'tail is animatable');
assert.match(g, /dbg-eyes/, 'eyes are animatable');
assert.equal(typeof DBGate.create, 'function', 'create exists');
console.log('gatekeeper.test OK');

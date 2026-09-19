// DoomBreaker ship verification — automated E2E against the real unpacked
// extension in Chromium. Run BEFORE recording the demo video / cutting a
// release. Usage: requires the repo served on :8377 (python3 -m http.server
// 8377 from the repo root), then:
//   node ship/verify.mjs
// Exits non-zero on any failure.

import { chromium } from 'playwright';
import { rmSync } from 'node:fs';

const PROFILE = '/tmp/db-verify-profile';
rmSync(PROFILE, { recursive: true, force: true }); // deterministic: no stale storage/state between runs

const EXT = new URL('..', import.meta.url).pathname;
const results = [];
const ok = (name, pass, extra = '') => {
  results.push({ name, pass, extra });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`);
};

const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1217/chrome-linux/chrome',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-gpu'],
});

// ---- service worker -------------------------------------------------------
let sw = null;
for (let i = 0; i < 20 && !sw; i++) {
  sw = ctx.serviceWorkers().find((w) => w.url().includes('background.js')) || null;
  if (!sw) await new Promise((r) => setTimeout(r, 500));
}
ok('service worker boots', !!sw, sw ? sw.url() : 'no SW');

if (!sw) {
  await ctx.close();
  console.log('ABORT: no service worker, extension did not load');
  process.exit(1);
}

const extId = new URL(sw.url()).host;
ok('extension id resolvable', !!extId, extId);

// ---- config + manifest ----------------------------------------------------
const cfg = await sw.evaluate(async () => {
  const res = await chrome.storage.local.get('dbConfig');
  return {
    version: chrome.runtime.getManifest().version,
    hasConfig: !!(res.dbConfig && res.dbConfig.data),
    configSites: res.dbConfig ? res.dbConfig.data.sites.length : 0,
  };
});
ok('manifest version matches release', cfg.version === '0.5.0', cfg.version);
// The fetch is async after install; poll storage for it (up to 30s — the
// GitHub raw fetch can be slow/flaky from some networks).
let configSites = cfg.configSites;
for (let i = 0; i < 60 && configSites === 0; i++) {
  await new Promise((r) => setTimeout(r, 500));
  configSites = await sw.evaluate(async () => {
    const res = await chrome.storage.local.get('dbConfig');
    return res.dbConfig && res.dbConfig.data ? res.dbConfig.data.sites.length : 0;
  });
}
ok('remote config fetched + cached', configSites > 0, `sites=${configSites}`);

// ---- real-site injection --------------------------------------------------
const wiki = await ctx.newPage();
await wiki.goto('https://en.wikipedia.org/wiki/History_of_the_Internet', { waitUntil: 'domcontentloaded' });
await wiki.waitForTimeout(2000);
await wiki.evaluate(() => {
  for (let i = 0; i < 20; i++) {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 1000, deltaMode: 0, bubbles: true, cancelable: true }));
  }
});
await wiki.waitForTimeout(800);
const inj = await wiki.evaluate(() => ({
  overlay: !!(document.getElementById('db-overlay') && document.getElementById('db-overlay').isConnected),
  d: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--d').trim()) || 0,
}));
ok('content script injects on real site', inj.overlay, `d=${inj.d.toFixed(3)}`);
ok('wheel damage drives meter', inj.d > 0.4, `d=${inj.d.toFixed(3)}`);

// ---- feed-kill on/off cycle (e2e page: localhost = generic 'other' host) ---
// The e2e page runs exactly one content copy (the extension's isolated one),
// so messaging reaches the real service worker.
const E2E = 'http://localhost:8377/test/e2e.html';
const wheel = (page, ticks, px) => page.evaluate(([t, p]) => {
  for (let i = 0; i < t; i++) {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: p, deltaMode: 0, bubbles: true, cancelable: true }));
  }
}, [ticks, px]);

const e2e = await ctx.newPage();
await e2e.goto(E2E, { waitUntil: 'load' });
await e2e.waitForTimeout(1200);

await wheel(e2e, 25, 2000); // 50000px > BUDGET 40000 -> d=1
await e2e.waitForTimeout(2500); // loop fires kill within ~250ms
const killOn = await sw.evaluate(async () => {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  return { count: rules.length, filters: rules.map((r) => r.condition.urlFilter) };
});
ok('feed-kill adds DNR rule at full damage', killOn.count >= 1, JSON.stringify(killOn.filters));

// Force damage low through storage; the content copy adopts via onChanged and
// the loop sends kill-off, which must remove the generic rule.
await sw.evaluate(() => chrome.storage.local.set({ damage: { all: { d: 0.1, t: Date.now() } } }));
await e2e.waitForTimeout(2500);
const killOff = await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length);
ok('feed-kill removes DNR rule on heal', killOff === 0, `rules=${killOff}`);

// ---- multi-tab damage sync ------------------------------------------------
const e2eB = await ctx.newPage();
await e2eB.goto(E2E, { waitUntil: 'load' });
await e2eB.waitForTimeout(1200);
// Reset the shared pool to 0 so the expected synced value is exactly 0.5.
await sw.evaluate(() => chrome.storage.local.set({ damage: { all: { d: 0, t: Date.now() } } }));
await e2eB.waitForTimeout(1200);
await wheel(e2e, 10, 2000); // 20000px -> d=0.5
await e2eB.waitForTimeout(2000);
const synced = await e2eB.evaluate(() =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--d').trim()) || 0
);
ok('damage syncs across tabs', Math.abs(synced - 0.5) < 0.15, `tabB d=${synced.toFixed(3)}`);

// ---- per-site toggle disables the generic fallback -------------------------
await sw.evaluate(() => chrome.storage.local.set({ settings: { sites: { other: false } } }));
await e2eB.waitForTimeout(1200);
await wheel(e2eB, 20, 1000); // should add nothing while disabled
await e2eB.waitForTimeout(800);
const toggled = await e2eB.evaluate(() => ({
  d: getComputedStyle(document.documentElement).getPropertyValue('--d').trim(),
  overlay: !!(document.getElementById('db-overlay') && document.getElementById('db-overlay').isConnected),
}));
ok('disabled site: no damage, no overlay', toggled.d === '' && !toggled.overlay, JSON.stringify(toggled));
await sw.evaluate(() => chrome.storage.local.set({ settings: { sites: { other: true } } }));

// ---- daily time limit: counting, enforcement, release ----------------------
const today = () => new Date().toLocaleDateString('en-CA');

// counting: enabled with a huge budget, wheel, active time must accumulate
await sw.evaluate((dk) => chrome.storage.local.set({
  settings: { sites: { other: true }, timeLimit: { enabled: true, minutes: 720 } },
  usage: { date: dk, seconds: {} },
}), today());
await e2eB.waitForTimeout(1200);
await wheel(e2eB, 5, 1000);
await e2eB.waitForTimeout(7000); // active window is 10s after input; flush every 5s
const counted = await sw.evaluate(async () => {
  const u = (await chrome.storage.local.get('usage')).usage;
  return u && u.seconds ? (u.seconds.other || 0) : 0;
});
ok('time limit counts active scrolling', counted > 0, `seconds=${counted}`);

// enforcement: budget exhausted -> full break visuals + feed-kill rules
await sw.evaluate((dk) => chrome.storage.local.set({
  settings: { sites: { other: true }, timeLimit: { enabled: true, minutes: 1 } },
  usage: { date: dk, seconds: { other: 60 } },
}), today());
await e2eB.waitForTimeout(2500);
const forced = await e2eB.evaluate(() => ({
  d: getComputedStyle(document.documentElement).getPropertyValue('--d').trim(),
  overlay: !!(document.getElementById('db-overlay') && document.getElementById('db-overlay').isConnected),
}));
const forcedRules = await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length);
ok('time limit pins full break', forced.d === '1' && forced.overlay, JSON.stringify(forced));
ok('time limit fires feed-kill', forcedRules >= 1, `rules=${forcedRules}`);

// release: fresh budget + low damage -> kill rules removed
await sw.evaluate((dk) => chrome.storage.local.set({
  usage: { date: dk, seconds: {} },
  damage: { all: { d: 0.1, t: Date.now() } },
}), today());
await e2eB.waitForTimeout(2500);
const released = await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length);
ok('time limit releases after budget reset', released === 0, `rules=${released}`);

// restore defaults so the popup test sees a clean slate
await sw.evaluate(() => chrome.storage.local.set({
  settings: { sites: { other: true }, sensitivity: 1, timeLimit: { enabled: false, minutes: 60 } },
}));

// ---- effect toggles: cracks off + network block off ------------------------
await sw.evaluate(() => chrome.storage.local.set({
  settings: {
    sites: { other: true }, sensitivity: 1, timeLimit: { enabled: false, minutes: 60 },
    effects: { blur: true, cracks: false, glitch: true, shake: true, kill: false },
  },
}));
await e2eB.waitForTimeout(1500);
await wheel(e2eB, 25, 2000); // d -> 1 (well past every threshold)
await e2eB.waitForTimeout(2500); // clearCracks fade + loop settle
const effOff = await e2eB.evaluate(() => ({
  overlay: !!(document.getElementById('db-overlay') && document.getElementById('db-overlay').isConnected),
  crackPaths: document.querySelectorAll('#db-cracks path').length,
  d: getComputedStyle(document.documentElement).getPropertyValue('--d').trim(),
}));
const effRules = await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length);
ok('cracks toggle disables cracks', effOff.overlay && effOff.crackPaths === 0, JSON.stringify(effOff));
ok('network-block toggle disables feed-kill', effRules === 0, `rules=${effRules}`);

// restore everything and drop damage for the popup test
await sw.evaluate(() => chrome.storage.local.set({
  settings: { sites: { other: true }, sensitivity: 1, timeLimit: { enabled: false, minutes: 60 }, effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true }, healSpeed: 1 },
  damage: { all: { d: 0.1, t: Date.now() } },
}));
await e2eB.waitForTimeout(1500);

// ---- companion cat: appear -> wall the feed -> pet-to-heal -> toggle off ---
await sw.evaluate((dk) => chrome.storage.local.set({
  settings: {
    sites: { other: true }, sensitivity: 1, timeLimit: { enabled: false, minutes: 60 },
    effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true },
    healSpeed: 1, cat: { enabled: true, block: true, heal: true },
  },
  usage: { date: dk, seconds: {} },
}), today());
await e2eB.waitForTimeout(1200);

// stage 1: peeking cat shows up at modest damage
await sw.evaluate(() => chrome.storage.local.set({ damage: { all: { d: 0.3, t: Date.now() } } }));
await e2eB.waitForTimeout(1500);
const catLow = await e2eB.evaluate(() => {
  const c = document.getElementById('db-cat');
  return { present: !!c, stage: c ? c.getAttribute('data-stage') : null, blocked: !!(c && c.classList.contains('db-cat-block')) };
});
ok('cat appears at low damage', catLow.present && catLow.stage === '1' && !catLow.blocked, JSON.stringify(catLow));

// stage 4: full damage puts the cat wall over the feed
await sw.evaluate(() => chrome.storage.local.set({ damage: { all: { d: 1, t: Date.now() } } }));
await e2eB.waitForTimeout(1500);
const catWall = await e2eB.evaluate(() => {
  const c = document.getElementById('db-cat');
  return {
    stage: c ? c.getAttribute('data-stage') : null,
    blocked: !!(c && c.classList.contains('db-cat-block')),
    wallText: c ? /FEED BLOCKED/i.test(c.textContent) : false,
  };
});
ok('cat walls the feed at full damage', catWall.stage === '4' && catWall.blocked && catWall.wallText, JSON.stringify(catWall));

// pet x3 (spaced past the cooldown) -> heals ~0.35 and drops out of block
await e2eB.click('#db-cat');
await e2eB.waitForTimeout(350);
await e2eB.click('#db-cat');
await e2eB.waitForTimeout(350);
await e2eB.click('#db-cat');
await e2eB.waitForTimeout(1000);
const catHealed = await e2eB.evaluate(() => ({
  d: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--d').trim()) || 0,
  stage: (document.getElementById('db-cat') || {}).getAttribute
    ? document.getElementById('db-cat').getAttribute('data-stage')
    : null,
  blocked: !!(document.getElementById('db-cat') && document.getElementById('db-cat').classList.contains('db-cat-block')),
}));
ok('petting the cat thrice heals damage', catHealed.d > 0.45 && catHealed.d < 0.8, `d=${catHealed.d.toFixed(3)}`);
ok('heal releases the cat wall', !catHealed.blocked && catHealed.stage !== '4', JSON.stringify(catHealed));

// cat disabled -> widget removed entirely
await sw.evaluate(() => chrome.storage.local.set({
  settings: {
    sites: { other: true }, sensitivity: 1, timeLimit: { enabled: false, minutes: 60 },
    effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true },
    healSpeed: 1, cat: { enabled: false },
  },
}));
await e2eB.waitForTimeout(1200);
const catOff = await e2eB.evaluate(() => !!document.getElementById('db-cat'));
ok('cat toggle removes the widget', !catOff);

// restore defaults so the popup test sees a clean slate
await sw.evaluate(() => chrome.storage.local.set({
  settings: {
    sites: { other: true }, sensitivity: 1, timeLimit: { enabled: false, minutes: 60 },
    effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true },
    healSpeed: 1, cat: { enabled: true, block: true, heal: true },
  },
}));
await e2eB.waitForTimeout(1200);

// ---- SW usage accumulator: both tabs' time is kept, no lost updates ---------
await sw.evaluate((dk) => chrome.storage.local.set({
  settings: { sites: { other: true }, timeLimit: { enabled: true, minutes: 720 }, healSpeed: 1, effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true } },
  usage: { date: dk, seconds: {} },
}), today());
await e2e.waitForTimeout(1200);
await wheel(e2e, 5, 1000);
await e2eB.waitForTimeout(1200);
await wheel(e2eB, 5, 1000);
await e2e.waitForTimeout(9000); // both tabs report through the SW (active window is 10s)
const both = await sw.evaluate(async () => (await chrome.storage.local.get('usage')).usage.seconds.other || 0);
ok('usage accumulates from both tabs (SW single writer)', both >= 12, `seconds=${both}`);

// ---- per-site limit override -----------------------------------------------
await sw.evaluate((dk) => chrome.storage.local.set({
  settings: { sites: { other: true }, timeLimit: { enabled: true, minutes: 720, perSite: { other: 1 } }, healSpeed: 1, effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true } },
  usage: { date: dk, seconds: { other: 60 } },
}), today());
await e2eB.waitForTimeout(2000);
const psForced = await e2eB.evaluate(() => ({
  d: getComputedStyle(document.documentElement).getPropertyValue('--d').trim(),
  overlay: !!(document.getElementById('db-overlay') && document.getElementById('db-overlay').isConnected),
}));
ok('per-site limit overrides the global budget', psForced.d === '1' && psForced.overlay, JSON.stringify(psForced));

await sw.evaluate((dk) => chrome.storage.local.set({
  settings: { sites: { other: true }, timeLimit: { enabled: true, minutes: 720, perSite: { other: 720 } }, healSpeed: 1, effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true } },
  usage: { date: dk, seconds: { other: 60 } },
  damage: { all: { d: 0.1, t: Date.now() } },
}), today());
await e2eB.waitForTimeout(2000);
const psFree = await e2eB.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--d').trim()
);
ok('per-site limit respects its own budget', psFree !== '1', `d=${psFree}`);

// reset settings for the popup test
await sw.evaluate(() => chrome.storage.local.set({
  settings: { sites: { other: true }, sensitivity: 1, timeLimit: { enabled: false, minutes: 60, perSite: {} }, effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true }, healSpeed: 1 },
  damage: { all: { d: 0.1, t: Date.now() } },
}));
await e2eB.waitForTimeout(1200);

// ---- popup binds and saves -------------------------------------------------
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
await popup.waitForTimeout(600);
const popupState = await popup.evaluate(() => ({
  hasOther: !!document.getElementById('site-other'),
  otherChecked: document.getElementById('site-other').checked,
  hasSlider: !!document.getElementById('sensitivity'),
  hasTimeEnabled: !!document.getElementById('time-enabled'),
  hasTimeMinutes: !!document.getElementById('time-minutes'),
  hasEffKill: !!document.getElementById('eff-kill'),
  hasEffCracks: !!document.getElementById('eff-cracks'),
  hasPresets: !!document.getElementById('preset-brutal'),
  hasHealSpeed: !!document.getElementById('heal-speed'),
  hasPerSite: !!document.getElementById('tl-other'),
  hasReset: !!document.getElementById('btn-reset'),
  hasCatEnabled: !!document.getElementById('cat-enabled'),
  hasCatBlock: !!document.getElementById('cat-block'),
  hasCatHeal: !!document.getElementById('cat-heal'),
}));
ok('popup renders all toggles', popupState.hasOther && popupState.hasSlider && popupState.hasTimeEnabled && popupState.hasTimeMinutes && popupState.hasEffKill && popupState.hasEffCracks && popupState.hasPresets && popupState.hasHealSpeed && popupState.hasPerSite && popupState.hasReset && popupState.hasCatEnabled && popupState.hasCatBlock && popupState.hasCatHeal, JSON.stringify(popupState));
// Toggle through the real input event (switches hide the checkbox visually,
// so drive the element directly rather than Playwright's actionability check).
await popup.evaluate(() => {
  const el = document.getElementById('site-other');
  el.checked = false;
  el.dispatchEvent(new Event('change'));
});
await popup.waitForTimeout(600);
const saved = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings.sites.other);
ok('popup toggle persists to storage', saved === false, `other=${saved}`);
await popup.evaluate(() => {
  const el = document.getElementById('site-other');
  el.checked = true;
  el.dispatchEvent(new Event('change'));
});
await popup.waitForTimeout(400);

// cat toggle persists to storage
await popup.evaluate(() => {
  const el = document.getElementById('cat-enabled');
  el.checked = false;
  el.dispatchEvent(new Event('change'));
});
await popup.waitForTimeout(600);
const catSaved = await sw.evaluate(async () => {
  const s = (await chrome.storage.local.get('settings')).settings;
  return s.cat && s.cat.enabled === false && s.cat.block !== undefined;
});
ok('popup cat toggle persists to storage', catSaved === true);
await popup.evaluate(() => {
  const el = document.getElementById('cat-enabled');
  el.checked = true;
  el.dispatchEvent(new Event('change'));
});
await popup.waitForTimeout(400);

// presets apply sensitivity + effects + heal speed
await popup.evaluate(() => document.getElementById('preset-brutal').click());
await popup.waitForTimeout(600);
const preset = await sw.evaluate(async () => {
  const s = (await chrome.storage.local.get('settings')).settings;
  return { sens: s.sensitivity, kill: s.effects.kill, heal: s.healSpeed };
});
ok('preset brutal applies', preset.sens === 2 && preset.kill === true && preset.heal === 0.5, JSON.stringify(preset));
await popup.evaluate(() => document.getElementById('preset-gentle').click());
await popup.waitForTimeout(600);
const presetG = await sw.evaluate(async () => {
  const s = (await chrome.storage.local.get('settings')).settings;
  return { sens: s.sensitivity, kill: s.effects.kill, heal: s.healSpeed };
});
ok('preset gentle applies', presetG.sens === 0.5 && presetG.kill === false && presetG.heal === 1.5, JSON.stringify(presetG));

// reset damage zeroes the shared meter
await sw.evaluate(() => chrome.storage.local.set({ damage: { all: { d: 0.5, t: Date.now() } } }));
await popup.evaluate(() => document.getElementById('btn-reset').click());
await popup.waitForTimeout(600);
const resetD = await sw.evaluate(async () => (await chrome.storage.local.get('damage')).damage.all.d);
ok('reset damage zeroes the meter', resetD === 0, `d=${resetD}`);

await ctx.close();
const fails = results.filter((r) => !r.pass).length;
console.log(fails === 0 ? `SHIP-VERIFY-PASS (${results.length} checks)` : `${fails}/${results.length} FAILURES`);
process.exit(fails ? 1 : 0);

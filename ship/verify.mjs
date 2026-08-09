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
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
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
ok('manifest version matches release', cfg.version === '0.2.0', cfg.version);
// The fetch is async after install; poll storage for it (up to 10s).
let configSites = cfg.configSites;
for (let i = 0; i < 20 && configSites === 0; i++) {
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
  usage: { date: dk, seconds: 0 },
}), today());
await e2eB.waitForTimeout(1200);
await wheel(e2eB, 5, 1000);
await e2eB.waitForTimeout(7000); // active window is 10s after input; flush every 5s
const counted = await sw.evaluate(async () => (await chrome.storage.local.get('usage')).usage.seconds);
ok('time limit counts active scrolling', counted > 0, `seconds=${counted}`);

// enforcement: budget exhausted -> full break visuals + feed-kill rules
await sw.evaluate((dk) => chrome.storage.local.set({
  settings: { sites: { other: true }, timeLimit: { enabled: true, minutes: 1 } },
  usage: { date: dk, seconds: 60 },
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
  usage: { date: dk, seconds: 0 },
  damage: { all: { d: 0.1, t: Date.now() } },
}), today());
await e2eB.waitForTimeout(2500);
const released = await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length);
ok('time limit releases after budget reset', released === 0, `rules=${released}`);

// restore defaults so the popup test sees a clean slate
await sw.evaluate(() => chrome.storage.local.set({
  settings: { sites: { other: true }, sensitivity: 1, timeLimit: { enabled: false, minutes: 60 } },
}));

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
}));
ok('popup renders all toggles', popupState.hasOther && popupState.hasSlider && popupState.hasTimeEnabled && popupState.hasTimeMinutes, JSON.stringify(popupState));
await popup.uncheck('#site-other');
await popup.waitForTimeout(600);
const saved = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings.sites.other);
ok('popup toggle persists to storage', saved === false, `other=${saved}`);
await popup.check('#site-other');
await popup.waitForTimeout(400);

await ctx.close();
const fails = results.filter((r) => !r.pass).length;
console.log(fails === 0 ? `SHIP-VERIFY-PASS (${results.length} checks)` : `${fails}/${results.length} FAILURES`);
process.exit(fails ? 1 : 0);

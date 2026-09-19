// Gatekeeper mode E2E: real unpacked extension in Chromium.
// Requires the repo served on :8377. Usage: node ship/gate-e2e.mjs [shotDir]
import { chromium } from 'playwright';
import { rmSync } from 'node:fs';

const PROFILE = '/tmp/db-gate-profile';
rmSync(PROFILE, { recursive: true, force: true });
const EXT = new URL('..', import.meta.url).pathname;
const SHOTS = process.argv[2] || '/tmp';
let fails = 0;
const ok = (n, p, x = '') => { if (!p) fails++; console.log(`${p ? 'PASS' : 'FAIL'} ${n}${x ? ' | ' + x : ''}`); };

const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1217/chrome-linux/chrome',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-gpu'],
});
let sw = null;
for (let i = 0; i < 20 && !sw; i++) {
  sw = ctx.serviceWorkers().find((w) => w.url().includes('background.js')) || null;
  if (!sw) await new Promise((r) => setTimeout(r, 500));
}
await sw.evaluate(() => chrome.storage.local.set({
  settings: { cat: { enabled: true, mode: 'gatekeeper', breakMin: 1 } },
}));

const page = await ctx.newPage();
await page.goto('http://localhost:8377/test/e2e.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);
for (let i = 0; i < 25; i++) { await page.mouse.wheel(0, 2000); await page.waitForTimeout(30); }
await page.waitForTimeout(2200);

const st = await page.evaluate(() => {
  const g = document.getElementById('db-gate');
  const c = document.getElementById('db-cat');
  return {
    shown: !!g && g.classList.contains('dbg-show'),
    clock: g && g.querySelector('.dbg-clock').textContent,
    locked: document.documentElement.classList.contains('db-gate-on'),
    companionStage: c ? c.getAttribute('data-stage') : 'none',
  };
});
ok('gatekeeper cat appears at wall damage', st.shown);
ok('countdown shows ~1 minute', /^0:5\d|^1:00$/.test(st.clock || ''), st.clock);
ok('page scroll locked', st.locked);
ok('companion cat hidden while gatekeeper sits', st.companionStage === '0' || st.companionStage === 'none', st.companionStage);
await page.screenshot({ path: `${SHOTS}/gate-sitting.png` });

// Clicking through does not dismiss it.
await page.mouse.click(640, 500); await page.mouse.click(640, 500); await page.mouse.click(640, 500);
await page.waitForTimeout(400);
ok('petting/clicking does not dismiss', await page.evaluate(() => document.getElementById('db-gate').classList.contains('dbg-show')));

// Reload does not escape (break end is in storage).
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
ok('reload does not escape the cat', await page.evaluate(() => { const g = document.getElementById('db-gate'); return !!g && g.classList.contains('dbg-show'); }));

// Fast-forward: end the break 1s from now.
await sw.evaluate(() => chrome.storage.local.set({ catBreak: { until: Date.now() + 1000 } }));
await page.waitForTimeout(3200);
const end = await page.evaluate(() => ({
  shown: document.getElementById('db-gate').classList.contains('dbg-show'),
  locked: document.documentElement.classList.contains('db-gate-on'),
}));
ok('cat leaves when timer ends', !end.shown);
ok('scroll unlocked after break', !end.locked);
const dmg = await sw.evaluate(() => chrome.storage.local.get(['damage', 'catBreak']));
ok('damage fully healed after break', (dmg.damage.all.d || 0) < 0.05, String(dmg.damage.all.d));
ok('break cleared in storage', dmg.catBreak.until === 0);

// Companion mode unchanged: wall is the pet-x3 cat, no gatekeeper.
await sw.evaluate(() => chrome.storage.local.set({ settings: { cat: { enabled: true, mode: 'companion' } } }));
for (let i = 0; i < 25; i++) { await page.mouse.wheel(0, 2000); await page.waitForTimeout(30); }
await page.waitForTimeout(1500);
const comp = await page.evaluate(() => ({
  gate: !!document.getElementById('db-gate'),
  stage: document.getElementById('db-cat')?.getAttribute('data-stage'),
}));
ok('companion mode still walls with pet cat', comp.stage === '4' && !comp.gate, JSON.stringify(comp));

await ctx.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);

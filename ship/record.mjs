// DoomBreaker demo recorder — drives the real extension through every damage
// stage on a real site and records a video, then screenshots the popup.
// Run AFTER ship/verify.mjs passes. Requires the repo served on :8377 for the
// popup screenshot step (popup page itself is extension://, but keep the
// server up for the harness checks). Usage:
//   node ship/record.mjs
// Output: /tmp/db-video/doombreaker-demo.mp4 + /tmp/db-video/popup.png

import { chromium } from 'playwright';
import { rmSync } from 'node:fs';

const PROFILE = '/tmp/db-ship-profile';
rmSync(PROFILE, { recursive: true, force: true }); // deterministic recording

const EXT = new URL('..', import.meta.url).pathname;

const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1217/chrome-linux/chrome',
  headless: true,
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: '/tmp/db-video', size: { width: 1280, height: 800 } },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const page = await ctx.newPage();
await page.goto('https://en.wikipedia.org/wiki/History_of_the_Internet', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const wheelPx = async (px) => {
  await page.evaluate((total) => {
    const step = 2000;
    for (let i = 0; i < Math.ceil(total / step); i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.min(step, total - i * step), deltaMode: 0, bubbles: true, cancelable: true }));
    }
  }, px);
  await page.waitForTimeout(300);
};

await page.waitForTimeout(1500);               // stage 1: clean
await wheelPx(14000); await page.waitForTimeout(2500);  // stage 2: blur + vignette
await wheelPx(12000); await page.waitForTimeout(3500);  // stage 3: glitch + cracks draw in
await wheelPx(11000); await page.waitForTimeout(2500);  // stage 4: shake joins
await wheelPx(4000);  await page.waitForTimeout(3500);  // stage 5: full break

const vpath = await page.video().path();
await ctx.close();

// Popup screenshot: relaunch so the popup page can be captured (it is an
// extension page, needs the extension context alive).
const ctx2 = await chromium.launchPersistentContext(PROFILE, {
  executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1217/chrome-linux/chrome',
  headless: true,
  viewport: { width: 300, height: 400 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let sw2 = null;
for (let i = 0; i < 20 && !sw2; i++) {
  sw2 = ctx2.serviceWorkers().find((w) => w.url().includes('background.js')) || null;
  if (!sw2) await new Promise((r) => setTimeout(r, 500));
}
const popup = await ctx2.newPage();
await popup.goto(`chrome-extension://${new URL(sw2.url()).host}/popup.html`, { waitUntil: 'load' });
await popup.waitForTimeout(800);
await popup.screenshot({ path: '/tmp/db-video/popup.png' });
await ctx2.close();
console.log('VIDEO', vpath);
console.log('POPUP /tmp/db-video/popup.png');

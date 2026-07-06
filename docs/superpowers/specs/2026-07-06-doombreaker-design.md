# DoomBreaker — design spec (2026-07-06)

Chrome MV3 extension. The page visually *breaks* as you doom-scroll — blur, grayscale, vignette, procedural cracks, glitch, shake — and at full damage the feed genuinely stops paginating (DNR block). Damage **heals when you stop scrolling**. Soft wall: never a lockout modal.

Approved decisions:
- Recovery model: **heal-when-idle** (no daily budget, no midnight reset).
- Full damage: **soft wall** + feed-kill via declarativeNetRequest dynamic rules.
- Shorts/Reels break ~3× faster (per-video hits).
- Sites (manifest matches = the whitelist): x.com, twitter.com, *.reddit.com, instagram.com (feed `/` + `/reel*` only), youtube.com (`/shorts/*` only), linkedin.com (`/feed*` only). Regular YouTube untouched.
- Glitch = pure CSS keyframes (no PowerGlitch vendor — fewer files, same vibe).

## Files (each file has ONE owner)

```
manifest.json      background.js      popup.html  popup.js
meter.js           content.js         effects.css
test/meter.test.mjs  test/harness.html
```

## Contracts (all owners MUST follow exactly)

### Damage meter — `meter.js` (pure logic, no chrome/DOM APIs)
Global `DBMeter` (content scripts share isolated world; also `module.exports = DBMeter` guarded by `typeof module !== 'undefined'` for node tests).

```js
DBMeter.CFG = { BUDGET_PX: 40000, VIDEO_HIT: 0.06, HEAL_PER_SEC: 0.008, IDLE_MS: 3000 };
DBMeter.create(now)              // -> {d:0, last:now}   last = ts of last input
DBMeter.addWheel(s, px, now, sens) // s.d += (|px| * sens)/BUDGET_PX ; s.last=now; clamp 0..1
DBMeter.addVideo(s, now, sens)     // s.d += VIDEO_HIT * sens ; s.last=now; clamp
DBMeter.tick(s, now)               // if now-s.last >= IDLE_MS: s.d -= HEAL_PER_SEC*(elapsed since previous tick, sec); clamp
```
`sens` = sensitivity multiplier from settings (0.5 gentle, 1 default, 2 brutal). tick needs to track its own previous-call time inside the state (`s.lastTick`).

### Visual layer — `effects.css` + DOM created by `content.js`
- `content.js` sets `--d` (0..1, string) on `document.documentElement.style` and toggles classes **on `<html>`**: `db-blur` at d≥0.30, `db-glitch` at d≥0.60, `db-shake` at d≥0.90. Remove below threshold.
- Overlay: `content.js` appends `<div id="db-overlay">` to `document.documentElement` (NOT body — body gets filtered, overlay must stay crisp). Inside: `<div class="db-vignette"></div>` and `<svg id="db-cracks"></svg>` (full-viewport).
- `effects.css` rules:
  - `#db-overlay{position:fixed;inset:0;pointer-events:none;z-index:2147483647}`
  - Blur/grayscale on **body**: `html.db-blur body{filter:blur(calc((var(--d,0) - .3)/.7*5px)) grayscale(calc((var(--d,0) - .3)/.7))}` (containing-block reparenting of fixed elements is accepted intentional breakage).
  - Vignette `.db-vignette`: radial-gradient transparent center → rgba(0,0,0,.95) edges, `opacity:calc((var(--d,0) - .25)*1.4)`.
  - `html.db-glitch body` → CSS keyframes glitch: brief `hue-rotate`/`invert`/`clip-path` slice flickers, `steps(1)`, cycle ~2.5s.
  - `html.db-shake body` → `@keyframes db-shake` small ±px translate, duration ~.15s infinite; amplitude via `calc(var(--d)*6px)` where possible.
  - `@media (prefers-reduced-motion: reduce){ shake+glitch animations: none }`.
- Cracks: `content.js` owns `spawnCrack(x,y)` — draws 5–8 jagged SVG polylines radiating from (x,y) into `#db-cracks`, white `rgba(255,255,255,.75)` stroke ~1.5px + a wider faint stroke behind. One new crack each time d crosses 0.60/0.70/0.80/0.90/0.97 upward (track fired thresholds; clear all cracks + fired-set when d heals below 0.5). Impact point: random x, y near viewport center ± jitter.

### Sites — `content.js`
```js
const SITES = [
  {key:'x',        host:/(^|\.)(x|twitter)\.com$/, active:()=>true,                       mode:()=> 'wheel'},
  {key:'reddit',   host:/(^|\.)reddit\.com$/,      active:()=>true,                       mode:()=> 'wheel'},
  {key:'instagram',host:/(^|\.)instagram\.com$/,   active:p=>p==='/'||p.startsWith('/reel'), mode:p=> p.startsWith('/reel')?'video':'wheel'},
  {key:'youtube',  host:/(^|\.)youtube\.com$/,     active:p=>p.startsWith('/shorts'),     mode:()=> 'video'},
  {key:'linkedin', host:/(^|\.)linkedin\.com$/,    active:p=>p.startsWith('/feed'),       mode:()=> 'wheel'},
];
```
- Wheel mode: `addEventListener('wheel', e=>…, {passive:true, capture:true})` accumulate `|deltaY|` (normalize deltaMode: 1→×16, 2→×innerHeight). Plus clamped `scroll` fallback: add `|scrollY-lastY|` only when 0 < dy < 2000.
- Video mode: each SPA route change to a **different** `/shorts/<id>` or `/reel…` path → `addVideo`.
- SPA routing: patch `history.pushState`/`replaceState` + `popstate` at document_start → dispatch `db:nav`. On nav: re-evaluate active/mode; damage persists (never reset on nav).
- Loop: `setInterval` 250ms → `tick`, write `--d`/classes, flush storage if changed, spawn cracks on threshold crossings, feed-kill messaging.

### Persistence & cross-tab — `chrome.storage.local`
- Key `damage`: `{ [siteKey]: {d, t} }` (t = Date.now of write). Content flushes ≤4×/sec only when changed. On startup, load and apply heal for elapsed time since `t`. `chrome.storage.onChanged`: if incoming `t` newer than our last write, adopt `d`.
- Key `settings`: `{ sites:{x:true,reddit:true,instagram:true,youtube:true,linkedin:true}, sensitivity:1 }`. Content reads at start + onChanged; disabled site → remove all classes/overlay, no listeners work.

### Feed-kill — `background.js` (service worker) + DNR
- Content sends `chrome.runtime.sendMessage({type:'db-feedkill', on:true})` when d≥0.995 (once), `{on:false}` when d<0.85 (once). Background adds/removes **dynamic** DNR block rules (resourceTypes `["xmlhttprequest"]`), ids 101–106:
  - 101 `||x.com/i/api/graphql` 102 `||twitter.com/i/api/graphql`
  - 103 `||reddit.com/svc/shreddit/` 104 `||instagram.com/graphql/query`
  - 105 `||youtube.com/youtubei/v1/reel/` 106 `||linkedin.com/voyager/api/feed`
- Verify exact DNR dynamic-rule API shapes against Context7 chrome-extension docs before writing.

### `manifest.json`
MV3. `permissions: ["storage","declarativeNetRequest"]`. content_scripts: matches the six host patterns above (whole-host matches; path scoping happens in content.js), `js:["meter.js","content.js"]`, `css:["effects.css"]`, `run_at:"document_start"`. background service_worker. action popup. No host_permissions needed (block-only DNR + content matches). No icons (dev).

### Popup — `popup.html`/`popup.js`
5 site checkboxes + sensitivity range (0.5–2, step .25) bound to `settings`. Dark, tiny (~200px). No frameworks.

### Tests / verification
- `test/meter.test.mjs`: node built-in `assert` — wheel accumulation reaches 1 and clamps; heal only after IDLE_MS and at right rate; video hits; sensitivity scaling. Run: `node test/meter.test.mjs`.
- `test/harness.html`: standalone page stubbing `window.chrome` (storage.local get/set/onChanged no-ops, runtime.sendMessage log), loading `../meter.js`, `../effects.css`, `../content.js`, with a fake tall feed of posts. Buttons: "+wheel 5000px", "set d=0.65", "set d=1.0", "heal" (dispatches real wheel events / manipulates exposed hook `window.__db.set(d)` which content.js exposes **only when** `location.protocol==='file:'` or host is empty — never on real sites). Used for browser screenshot verification.

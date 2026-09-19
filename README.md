# DoomBreaker

The page breaks as you doom-scroll. Blur creeps in, color drains, darkness closes from the edges, the glass cracks, and everything shakes. At full damage the feed stops loading (a network-level block). Stop scrolling and the page heals.

No lockouts. No guilt modals. The discomfort does the work.

## Sites
- x.com / twitter.com (everywhere)
- reddit.com (everywhere)
- instagram.com (home feed + reels only)
- youtube.com (**Shorts only**; regular videos untouched)
- linkedin.com (feed only)
- every other website (full page, wheel-scroll based)

Shorts/Reels damage per *video watched* (~3× faster than scrolling).

## Install (dev)
1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Toolbar popup: per-site toggles + sensitivity (0.5 gentle → 2 brutal)

## How it works
One shared damage meter `d` (0→1), fed by wheel distance (or videos advanced), healing ~0.8%/sec when idle. `d` drives a CSS variable; thresholds add effect classes:
`0.30` blur+grayscale+vignette → `0.60` procedural SVG cracks + glitch → `0.90` shake → `0.995` declarativeNetRequest rules block the feed until you heal below `0.85`. Known sites get precise API-path blocks (x.com/i/api/graphql, reddit svc/shreddit, etc.); any other site gets a generic block of all XHR on that host, so the kill works everywhere without per-site maintenance.

Per-site rules (host regex, active/video path prefixes, kill filters) live in the remote `config/sites.json` in this repo, not in the code. The service worker fetches it on install/startup and every 6h, caches it in storage, and falls back to the bundled copy when offline — the same remote-asset pattern uBlock Origin uses for its filter lists. When a site changes its URLs or API paths, edit `config/sites.json` and every installed copy picks it up within the refresh window; no store release needed.

Optional daily time limit (off by default): set minutes per day in the popup, plus optional per-site overrides (blank = use the global budget). Active scrolling time is counted per site by the service worker — the single writer, so multi-tab usage cannot lose time. When the budget runs out the page pins at full break with the feed-kill until the local day rolls over. Every effect can be toggled individually in the popup (blur, cracks, glitch, shake, network block), all on by default, plus one-click presets (Gentle / Normal / Brutal), a heal-speed selector, and a reset-damage button.

Companion cat (on by default): as damage rises the cat peeks in (`0.25`), stares you down (`0.55`), sits on your feed (`0.75`), and at `0.92` plants a full "FEED BLOCKED" wall over the page. Pet it three times to heal a chunk of damage and keep scrolling — reflection instead of guilt. Popup toggles: cat on/off, block-the-feed on/off, pet-to-heal on/off.

**Gatekeeper mode** (popup → Cat mode). The viral "cat stops your doomscrolling" meme. At `0.92` a giant orange cat walks onto the page, sits in the middle, and a countdown starts (1, 2 or 5 min). You cannot pet it away. Clicks, wheel and scroll keys do nothing while it sits. The break end time is stored in `chrome.storage.local` (`catBreak`), so a reload, a new tab or another site shows the same cat. When the timer ends the cat walks off and damage resets to 0. The small companion cat still peeks, stares and sits on the way up.

`prefers-reduced-motion` disables shake/glitch. Damage syncs across tabs via `chrome.storage.local`. Permissions: `storage`, `declarativeNetRequest`, `alarms`.

## Dev
- Unit tests: `npm test` (meter, sites, cat + gatekeeper)
- Gatekeeper E2E: serve on :8377, then `node ship/gate-e2e.mjs`
- Visual harness: serve the repo root (`python -m http.server 8377`) and open `http://localhost:8377/test/harness.html`. Buttons drive damage levels through the real pipeline.
- Website: serve the repo root and open `http://localhost:8377/site/index.html` — landing page with live damage demo (custom elements, SEO metadata).

Spec: `docs/superpowers/specs/2026-07-06-doombreaker-design.md`

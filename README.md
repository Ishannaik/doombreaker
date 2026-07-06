# DoomBreaker

The page breaks as you doom-scroll. Blur creeps in, color drains, darkness closes from the edges, the glass cracks, everything shakes — and at full damage the feed *genuinely stops loading* (network-level block). Stop scrolling and the page slowly heals.

No lockouts, no guilt modals. The discomfort is the wall.

## Sites
- x.com / twitter.com (everywhere)
- reddit.com (everywhere)
- instagram.com (home feed + reels only)
- youtube.com (**Shorts only** — regular videos untouched)
- linkedin.com (feed only)

Shorts/Reels damage per *video watched* (~3× faster than scrolling).

## Install (dev)
1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Toolbar popup: per-site toggles + sensitivity (0.5 gentle → 2 brutal)

## How it works
One damage meter `d` (0→1) per site, fed by wheel distance (or videos advanced), healing ~0.8%/sec when idle. `d` drives a CSS variable; thresholds add effect classes:
`0.30` blur+grayscale+vignette → `0.60` procedural SVG cracks + glitch → `0.90` shake → `0.995` declarativeNetRequest rules block the feed's pagination API until you heal below `0.85`.

`prefers-reduced-motion` disables shake/glitch. Damage syncs across tabs via `chrome.storage.local`. Permissions: `storage`, `declarativeNetRequest` only.

## Dev
- Unit tests: `node test/meter.test.mjs`
- Visual harness: serve the repo root (`python -m http.server 8377`) and open `http://localhost:8377/test/harness.html` — buttons drive damage levels through the real pipeline.

Spec: `docs/superpowers/specs/2026-07-06-doombreaker-design.md`

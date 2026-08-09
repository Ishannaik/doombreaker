# DoomBreaker ship checklist

The verification loop has four layers. Layers 1-3 are automated; layer 4 is
the only human step, and it is narrowed to aesthetics — not behavior.

## Layer 0 — one-time setup
```bash
npm install   # pulls playwright (browsers already cached at ~/.cache/ms-playwright)
```

## Layer 1 — logic tests (every commit, seconds)
```bash
npm test      # node test/meter.test.mjs && node test/sites.test.mjs
```

## Layer 2 — automated E2E (every ship, ~40s, headless)
```bash
python3 -m http.server 8377 &   # from repo root, for the harness
npm run verify                  # node ship/verify.mjs
```
Asserts: SW boots · config fetched · real-site injection · wheel→damage ·
feed-kill DNR rule added at d=1 and removed on heal · damage syncs across
tabs · per-site toggle disables the generic fallback · popup renders and
persists toggles.

## Layer 3 — demo capture (every ship, ~30s)
```bash
npm run record   # node ship/record.mjs
```
Records /tmp/db-video/doombreaker-demo.mp4 (real site, damage through all
stages) and /tmp/db-video/popup.png.

## Layer 4 — human check (the only manual step, ~2 min)
Watch the demo video and confirm, with your own eyes:
- [ ] Cracks look like cracks, not scribbles (aesthetic call)
- [ ] Glitch reads as tearing, not a strobe (aesthetic call)
- [ ] Shake ramps up with damage instead of a constant jolt
- [ ] Popup screenshot shows all 6 toggles + sensitivity slider
- [ ] If anything looks off, fix it, re-run layers 1-3, re-record.

Then ship: bump version in manifest.json, rebuild the zip
(`zip -r /tmp/doombreaker-X.Y.Z.zip manifest.json background.js content.js
meter.js sites.js popup.html popup.js effects.css`), `git push`, create the
GitHub release, and upload to the Web Store using `store/store-listing.md`.

## Why the loop is shaped this way
- The video is evidence, not the verification. Layer 2 asserts behavior with
  real DOM/storage/DNR state; a video alone cannot prove the kill rules were
  added and removed, or that damage syncs between tabs.
- The human step is deliberately small: taste. Everything judgeable by code
  is judged by code, so "verify the video" is just "does it look right".
- The record script and the verify script use the same loaded-extension
  path, so what you see in the video is what the tests measured.

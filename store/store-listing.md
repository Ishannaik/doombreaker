# DoomBreaker — Chrome Web Store listing kit (v0.2.0)

Everything needed for the Web Store upload. Screenshots are 1280x800 (store
requirement: 1280x800 or 640x400), taken from the real extension running live.

## Upload checklist
1. Go to https://chrome.google.com/webstore/devconsole → **Add new item**
2. Upload `doombreaker-0.2.0.zip` (from the GitHub release:
   https://github.com/Ishannaik/doombreaker/releases/tag/v0.2.0)
3. Fill in the fields below
4. Upload the 4 screenshots
5. Submit for review

## Fields

**Name:** DoomBreaker

**Short description** (max 132 chars):
The page breaks as you doom-scroll. Blur, cracks, and shaking — the discomfort is the wall. Heals when you stop.

**Detailed description:**
DoomBreaker turns your doom-scrolling feed into a breaking screen. The more you scroll, the more the page falls apart: blur and color drain in, glass cracks spider across the screen, the page starts to shake — and at full damage, the feed genuinely stops loading until you stop scrolling.

No lockouts. No guilt modals. No tracking. The discomfort is the wall.

Features:
- Works on every website, not just a hardcoded list
- Per-site toggles in the toolbar popup (X/Twitter, Reddit, Instagram, YouTube Shorts, LinkedIn, and every other site)
- Sensitivity slider: 0.5 gentle → 2 brutal
- Shorts/Reels count ~3x faster than scrolling
- One shared damage meter across all sites — hopping from X to Reddit doesn't reset your damage
- Damage heals slowly when you stop scrolling (~1 hour for a full heal)
- Prefers reduced motion: shake and glitch are disabled automatically
- Per-site rules update automatically from a remote config, so the extension keeps working when sites change their internals

Permissions:
- storage: saves your settings and damage across tabs
- declarativeNetRequest: blocks the feed's network requests at full damage
- alarms: refreshes the per-site config every 6 hours

The extension sends no data anywhere. No analytics, no network calls except the config refresh from the project's GitHub repo.

Open source: https://github.com/Ishannaik/doombreaker

**Category:** Productivity
**Language:** English (United States)

## Screenshots (drag in this order)
1. `shot-clean.jpg` — the page before any damage
2. `shot-blur.jpg` — d ~0.4: blur + grayscale + vignette
3. `frame-glitch.jpg` — d ~0.65: glitch + first cracks drawing in
4. `frame-full.jpg` — d 1.0: all cracks, shake, full break

Screenshot files live at: /tmp/db-video/ (re-export from the release video if
they are not in the repo).

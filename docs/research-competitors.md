# Competitor feature research — doomscroll / focus blockers

Deep research pass (2026-08-09) across the doomscroll-blocking and focus space.
Sources: live landing pages (OneSec, Opal, ScreenZen, ClearSpace, Cold Turkey,
Freedom, Forest, Unhook) and READMEs of the direct open-source extension
competitors (DoomGuard, Doomscroll Blocker, Great Wall of Doom, why-am-i-here,
LeechBlock, Minimal Twitter).

## DoomBreaker today (0.3.0)

- Shared damage meter d 0→1, single-writer in the service worker, synced across tabs
- Wheel-scroll feeds damage; Shorts/Reels hit ~3× per video
- Effects by threshold: 0.30 blur+grayscale+vignette, 0.60 procedural SVG cracks +
  glitch, 0.90 shake, 0.995 network-level feed kill
- Per-site toggles (X, Reddit, Instagram, YouTube Shorts, LinkedIn, every other site)
- Sensitivity 0.5→2, presets Gentle/Normal/Brutal, heal speed, reset button
- Daily time limit (global + per-site) pins full break when the budget runs out
- Remote per-site config refresh every 6h (uBlock filter-list pattern), bundled fallback
- MV3; permissions storage, declarativeNetRequest, alarms; zero data leaves the device
- prefers-reduced-motion support

## Feature matrix (competitor feature → who has it)

| Feature | DoomBreaker | DoomGuard | Doomscroll Blocker | OneSec | Opal | ScreenZen | Cold Turkey | Freedom | Forest | why-am-i-here |
|---|---|---|---|---|---|---|---|---|---|---|
| Scroll/video damage trigger | ✅ | ✅ | ✅ | – | – | – | – | – | – | – |
| Visual breaking mechanic | ✅ | – | – | – | – | – | – | – | – | – |
| Network feed block | ✅ | – | – | – | – | – | – | – | – | – |
| Time limits (daily) | ✅ | roadmap | ✅ scroll+shorts | ✅ | ✅ | ✅ | ✅ | ✅ | – | ✅ |
| Per-site toggles | ✅ | ✅ | ✅ | – | – | – | – | – | – | – |
| Remote config updates | ✅ | – | – | – | – | – | – | – | – | – |
| Schedules / time-of-day rules | – | 2.5× late-night mult | – | ✅ | ✅ | ✅ | ✅ | ✅ | – | – |
| Behavioural detection (velocity, loops) | – | ✅ | – | – | – | – | – | – | – | – |
| Stats / insights / dashboard | – | ✅ | – | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Streak / clean-day counter | – | ✅ | – | – | ✅ | – | – | – | ✅ | – |
| XP / levels / badges | – | ✅ | – | – | ✅ gems | – | – | – | ✅ trees | – |
| Intervention choice (breath/pomodoro/redirect) | – | ✅ | ✅ msg | ✅ | – | – | – | – | – | – |
| Intention gate ("why am I here") | – | – | – | ✅ | – | – | – | – | – | ✅ |
| Master on/off switch | – | – | ✅ | – | – | – | – | – | – | – |
| Custom alert text / sounds | – | – | ✅ | – | – | – | – | – | – | – |
| In-page HUD widget | – | ✅ | – | – | – | – | – | – | – | ✅ |
| Allow/whitelist mode | – | roadmap | ✅ exclusions | – | ✅ | – | ✅ | ✅ | – | – |
| Focus timer / pomodoro | – | ✅ | – | – | ✅ | – | – | – | ✅ | ✅ |
| Weekly report notification | – | roadmap | – | – | – | – | – | – | – | – |
| Lock/uninstall protection | – | – | – | – | – | ✅ | ✅ | ✅ | – | – |
| Cross-device sync | – | – | – | ✅ | ✅ | – | – | ✅ | ✅ | – |
| Science/peer-reviewed backing | – | – | – | ✅ | – | – | – | – | – | – |

## Gap analysis — ranked by fit with "the page breaks" positioning

### Tier 1 — fits the mechanic, highest value

1. **Stats / insights panel** — every serious player has one (DoomGuard: weekly doom
   score, 24h heatmap, per-platform breakdown; ScreenZen: "track your wins"; Forest:
   forest as visible record). DoomBreaker owns the damage meter but shows no history.
   A "damage report" (saved sessions, per-site breakdown, worst days) is the natural
   extension and the strongest missing feature. Privacy-safe: keep it in storage.local.
2. **Schedules / time-of-day rules** — OneSec, Opal, ScreenZen, Cold Turkey, Freedom
   all let you tighten blocking by time. DoomGuard's 2.5× late-night multiplier is the
   cheapest concrete version: break faster after hours, gentler in work hours.
3. **Master on/off switch** — trivial, high utility (Doomscroll Blocker has it).
4. **Custom alert message + optional chime** — cheap popup settings (Doomscroll Blocker).
5. **In-page HUD pill** — a tiny minimizable damage indicator on tracked pages
   (DoomGuard HUD, why-am-i-here pill). Fits the meter concept; must stay subtle.

### Tier 2 — good but opt-in or larger

6. **Streak / clean-day counter** — light gamification. Fits the heal mechanic
   ("X days under 20% damage"). Clash risk with the no-guilt ethos — keep opt-in.
7. **Intention gate ("why am I here")** — why-am-i-here + OneSec intention tracking.
   A one-line intention before the feed loads, shown back when the page breaks.
   Uniquely fits our no-shame angle (it is reflection, not a lockout).
8. **Weekly summary notification** — DoomGuard roadmap; a Monday "your doom report".
9. **Allow/whitelist mode** — inverse of today's model: track only chosen sites,
   ignore the rest (DoomGuard roadmap, Freedom allow lists).
10. **Intervention variety** — breathing prompt on the feed-kill screen ("breathe to
    heal faster"), redirect to a productive site after break (DoomGuard: Wikipedia,
    Khan Academy, GitHub, Duolingo). Pick one, keep it optional.

### Tier 3 — skip

- Pomodoro/focus timer (Forest, Opal, DoomGuard): a different product; our mechanic is
  reactive discomfort, not proactive timing.
- Lock/uninstall protection (ScreenZen, Cold Turkey): poor fit for a browser extension,
  low trust.
- Porn-blocking (ClearSpace), real-tree planting (Forest), teams tiers (Freedom):
  different niches/costs.
- XP/badges beyond a streak: gamification theater; clashes with the ethos.

## What we already have that competitors don't

- The visual breaking mechanic itself (no competitor breaks the page; they warn,
  hide, or redirect).
- Network-level feed kill (declarativeNetRequest) — the strongest enforcement in the
  space; DoomGuard/Doomscroll Blocker only overlay warnings.
- Remote per-site config with bundled fallback — competitors hardcode their site
  rules; ours survives site redesigns without a store release.
- One shared meter across tabs/sites — competitors track per-page or per-app.

## Suggested next features (in order)

1. Damage report / stats panel (per-site, daily, worst hours)
2. Master on/off + custom alert message + chime
3. Time-of-day sensitivity multiplier (late-night ×2.5)
4. Clean-day streak (opt-in)
5. Intention gate (opt-in)
6. Weekly summary notification

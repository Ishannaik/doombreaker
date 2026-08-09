// DoomBreaker — content.js (integration glue)
// Runs at document_start in the isolated world. Everything is wrapped so an
// exception here can never break the host page. No DOM writes happen in event
// handlers — all DOM mutation lives in the 250ms loop.
(() => {
  'use strict';
  try {
    if (typeof DBMeter === 'undefined') return;
    if (typeof DBSites === 'undefined') return;

    // ---- Site config -----------------------------------------------------
    // Remote config/sites.json is the source of truth; DEFAULT_CONFIG is the
    // offline fallback. loadStorage() replaces CONFIG when the fetch lands.
    let CONFIG = DBSites.DEFAULT_CONFIG;

    // localhost included so the harness can be served over http for automated
    // browser tests; manifest matches never inject this script on localhost,
    // so the hook still can't exist on real sites.
    const isFileHarness = location.protocol === 'file:' || location.hostname === 'localhost';
    // Site-agnostic: known sites keep their tuned rules from the config; every
    // other host gets the generic always-active wheel fallback. The file://
    // and localhost harness lands in the same fallback.
    let site = DBSites.matchSite(CONFIG, location.hostname);

    const CFG = DBMeter.CFG;
    // One shared damage pool across ALL sites: breaking X and hopping to
    // Reddit must not hand you a fresh budget. (settings.sites stays per-site.)
    const DMG_KEY = 'all';
    const THRESHOLDS = [0.60, 0.70, 0.80, 0.90, 0.97];
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const clamp01 = v => Math.min(1, Math.max(0, Number(v) || 0));
    const cr = (typeof chrome !== 'undefined') ? chrome : null;

    // ---- State ------------------------------------------------------------
    const state = DBMeter.create(Date.now());
    let settings = {
      sites: { x: true, reddit: true, instagram: true, youtube: true, linkedin: true, other: true },
      sensitivity: 1,
    };
    let enabled = true;           // settings.sites[site.key]
    let active = false;           // site.active(pathname)
    let mode = 'wheel';           // 'wheel' | 'video'
    let lastVideoPath = location.pathname;
    let lastHref = location.href;
    let lastScrollY = window.scrollY || 0;
    let lastWheelAt = 0;          // ts of last wheel input (scroll listener is fallback-only)

    let overlay = null;           // #db-overlay
    let cracksSvg = null;         // svg#db-cracks
    const fired = new Set();      // crack thresholds already fired

    let killOn = false;           // feed-kill message state

    let damageCache = {};         // full {damage:{[siteKey]:{d,t}}} value
    let lastWriteT = 0;           // t of our last storage write (or newest adopted)
    let lastFlushedD = state.d;
    let lastFlushAt = 0;
    let storageLoaded = false;    // block flushes until the initial get() resolves,
                                  // so we never write a damageCache missing other sites

    // ---- Settings ---------------------------------------------------------
    function applySettings(s) {
      if (!s || typeof s !== 'object') return;
      settings = {
        sites: Object.assign({}, settings.sites, s.sites || {}),
        sensitivity: (typeof s.sensitivity === 'number') ? s.sensitivity : settings.sensitivity,
      };
      enabled = settings.sites[site.key] !== false;
    }

    function applyConfig(c) {
      if (DBSites.validConfig(c)) CONFIG = c;
      site = DBSites.matchSite(CONFIG, location.hostname);
      enabled = settings.sites[site.key] !== false;
    }

    // ---- SPA routing ------------------------------------------------------
    function fireNav() {
      try { window.dispatchEvent(new Event('db:nav')); } catch (e) { /* ignore */ }
    }
    try {
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      history.pushState = function (...args) {
        const r = origPush.apply(this, args);
        fireNav();
        return r;
      };
      history.replaceState = function (...args) {
        const r = origReplace.apply(this, args);
        fireNav();
        return r;
      };
    } catch (e) { /* ignore */ }
    window.addEventListener('popstate', fireNav);

    function onNav() {
      try {
        const p = location.pathname;
        site = DBSites.matchSite(CONFIG, location.hostname); // config may have refreshed
        active = DBSites.siteActive(site, p);
        mode = DBSites.siteMode(site, p);
        if (enabled && active && mode === 'video' && p !== lastVideoPath && DBSites.isVideoPath(site, p)) {
          DBMeter.addVideo(state, Date.now(), settings.sensitivity);
        }
        lastVideoPath = p;
      } catch (e) { /* ignore */ }
    }
    window.addEventListener('db:nav', onNav);
    onNav(); // initial evaluation (no video hit: lastVideoPath === pathname)

    // ---- Input (state mutation only, never DOM) ---------------------------
    window.addEventListener('wheel', (e) => {
      try {
        if (!enabled || !active || mode !== 'wheel') return;
        let px = Math.abs(e.deltaY);
        if (e.deltaMode === 1) px *= 16;
        else if (e.deltaMode === 2) px *= window.innerHeight;
        if (px > 0) {
          lastWheelAt = Date.now();
          DBMeter.addWheel(state, px, lastWheelAt, settings.sensitivity);
        }
      } catch (err) { /* ignore */ }
    }, { passive: true, capture: true });

    window.addEventListener('scroll', () => {
      try {
        const y = window.scrollY;
        const dy = Math.abs(y - lastScrollY);
        lastScrollY = y;
        if (!enabled || !active || mode !== 'wheel') return;
        const now = Date.now();
        // Fallback only: a wheel scroll fires both 'wheel' and 'scroll'.
        // Skip scroll deltas shortly after a wheel input so one physical
        // scroll isn't counted twice; touch/keyboard scrolls still count.
        if (now - lastWheelAt < 300) return;
        if (dy > 0 && dy < 2000) DBMeter.addWheel(state, dy, now, settings.sensitivity);
      } catch (err) { /* ignore */ }
    }, { passive: true, capture: true });

    // ---- Overlay + cracks -------------------------------------------------
    // Deterministic crack set: a seeded PRNG builds the geometry once per page
    // session; damage thresholds only reveal it. SVG paths draw themselves in
    // via stroke-dashoffset transitions, so there is no per-frame random
    // spawning (pattern copied from kossik/cracked-glass: geometry is a pure
    // function of a seed, no clock, no Math.random at render time).
    function mulberry32(seed) {
      return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    let crackNodes = []; // [{threshold, back, line, revealed}]
    let cracksBuilt = false;

    function ensureOverlay() {
      if (overlay && overlay.isConnected) return true;
      if (!document.documentElement || !document.body) return false;
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'db-overlay';
        const vignette = document.createElement('div');
        vignette.className = 'db-vignette';
        cracksSvg = document.createElementNS(SVG_NS, 'svg');
        cracksSvg.id = 'db-cracks';
        cracksSvg.style.width = '100%';
        cracksSvg.style.height = '100%';
        cracksSvg.style.display = 'block';
        overlay.appendChild(vignette);
        overlay.appendChild(cracksSvg);
      }
      document.documentElement.appendChild(overlay);
      return true;
    }

    function buildCracks() {
      if (cracksBuilt || !cracksSvg) return;
      cracksBuilt = true;
      const rnd = mulberry32((Date.now() >>> 0) ^ Math.imul(window.innerWidth | 0, 2654435761));
      const raw = [];
      const impacts = 3;
      for (let i = 0; i < impacts; i++) {
        const x = rnd() * window.innerWidth;
        const y = window.innerHeight * (0.25 + rnd() * 0.5);
        const rays = 4 + Math.floor(rnd() * 3); // 4..6 per impact
        for (let r = 0; r < rays; r++) {
          let ang = (r / rays) * Math.PI * 2 + (rnd() - 0.5) * 1.5;
          let px = x, py = y;
          const pts = [[px, py]];
          const segs = 3 + Math.floor(rnd() * 3); // 3..5
          for (let s = 0; s < segs; s++) {
            ang += (rnd() - 0.5) * 1.2; // per-segment jitter
            const len = 22 + rnd() * 45;
            px += Math.cos(ang) * len;
            py += Math.sin(ang) * len;
            pts.push([px, py]);
          }
          raw.push(pts);
        }
      }
      // Spread cracks evenly across thresholds: first ones at 0.60, more
      // appear at each higher threshold.
      const total = raw.length;
      raw.forEach((pts, i) => {
        const t = THRESHOLDS[Math.min(THRESHOLDS.length - 1, Math.floor((i / total) * THRESHOLDS.length))];
        const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
        const back = document.createElementNS(SVG_NS, 'path');
        back.setAttribute('d', d);
        back.setAttribute('fill', 'none');
        back.setAttribute('stroke', 'rgba(255,255,255,.18)');
        back.setAttribute('stroke-width', '4');
        back.setAttribute('stroke-linecap', 'round');
        const line = document.createElementNS(SVG_NS, 'path');
        line.setAttribute('d', d);
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', 'rgba(255,255,255,.75)');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-linecap', 'round');
        // Draw-in setup: dash array = full length, offset starts at length,
        // revealed by animating offset to 0. Hidden until its threshold fires.
        const len = Math.max(1, back.getTotalLength());
        for (const el of [back, line]) {
          el.style.opacity = '0';
          el.style.strokeDasharray = String(len);
          el.style.strokeDashoffset = String(len);
          el.style.transition = 'stroke-dashoffset 0.7s ease-out, opacity 0.6s ease-out';
        }
        cracksSvg.appendChild(back);
        cracksSvg.appendChild(line);
        crackNodes.push({ threshold: t, back: back, line: line, revealed: false });
      });
    }

    function revealCrack(node, idx) {
      node.revealed = true;
      const delay = Math.min(600, idx * 45) + 'ms';
      for (const el of [node.back, node.line]) {
        el.style.transitionDelay = delay;
        el.style.opacity = '1';
        // rAF so the browser sees the initial dashoffset before animating.
        requestAnimationFrame(() => { el.style.strokeDashoffset = '0'; });
      }
    }

    function clearCracks() {
      fired.clear();
      crackNodes = [];
      if (cracksSvg && cracksSvg.firstChild) {
        const kids = Array.from(cracksSvg.children);
        kids.forEach(k => {
          k.style.transition = 'opacity 0.45s ease-out';
          k.style.opacity = '0';
        });
        // Don't yank nodes mid re-fire: only clear if no threshold fired since.
        setTimeout(() => {
          if (!fired.size) { while (cracksSvg.firstChild) cracksSvg.removeChild(cracksSvg.firstChild); }
        }, 500);
      }
      cracksBuilt = false; // next cycle gets a fresh, different crack set
    }

    function crackTick() {
      if (state.d < 0.5) {
        if (fired.size || (cracksSvg && cracksSvg.firstChild)) clearCracks();
        return;
      }
      if (state.d >= THRESHOLDS[0] && !cracksBuilt) buildCracks();
      for (const t of THRESHOLDS) {
        if (state.d >= t && !fired.has(t)) {
          fired.add(t);
          let idx = 0;
          for (const node of crackNodes) {
            if (node.threshold <= t && !node.revealed) revealCrack(node, idx++);
          }
        }
      }
    }

    // ---- Visual application (loop only) -----------------------------------
    function setClass(el, cls, on) {
      if (on) el.classList.add(cls);
      else el.classList.remove(cls);
    }

    function applyVisuals() {
      const de = document.documentElement;
      if (!de) return;
      const show = enabled && active;
      if (show) {
        de.style.setProperty('--d', String(state.d));
        setClass(de, 'db-blur', state.d >= 0.30);
        setClass(de, 'db-glitch', state.d >= 0.60);
        setClass(de, 'db-shake', state.d >= 0.90);
        if (ensureOverlay()) crackTick();
      } else {
        de.style.removeProperty('--d');
        de.classList.remove('db-blur', 'db-glitch', 'db-shake');
        if (overlay && overlay.isConnected) overlay.remove();
      }
    }

    // ---- Persistence ------------------------------------------------------
    function flushStorage(now) {
      lastFlushedD = state.d;
      lastFlushAt = now;
      lastWriteT = now;
      damageCache[DMG_KEY] = { d: state.d, t: now };
      try {
        if (cr && cr.storage && cr.storage.local) {
          cr.storage.local.set({ damage: damageCache });
        }
      } catch (e) { /* ignore */ }
    }

    function loadStorage() {
      if (!(cr && cr.storage && cr.storage.local)) { storageLoaded = true; return; }
      try {
        cr.storage.local.get(['damage', 'settings', DBSites.CONFIG_KEY], (res) => {
          try {
            res = res || {};
            if (res.settings) applySettings(res.settings);
            if (res[DBSites.CONFIG_KEY]) applyConfig(res[DBSites.CONFIG_KEY].data);
            damageCache = (res.damage && typeof res.damage === 'object') ? res.damage : {};
            const entry = damageCache[DMG_KEY];
            // Skip if onChanged already adopted a newer cross-tab write.
            if (entry && typeof entry.d === 'number' && (entry.t || 0) > lastWriteT) {
              const elapsedSec = Math.max(0, (Date.now() - (entry.t || 0)) / 1000);
              // Merge: keep any damage accumulated between injection and this
              // callback instead of overwriting it with the stored value.
              state.d = clamp01(state.d + clamp01(entry.d - CFG.HEAL_PER_SEC * elapsedSec));
              lastFlushedD = state.d;
              lastWriteT = entry.t || 0;
            }
          } catch (err) { /* ignore */ }
          storageLoaded = true;
        });
      } catch (e) { storageLoaded = true; }
    }

    if (cr && cr.storage && cr.storage.onChanged) {
      try {
        cr.storage.onChanged.addListener((changes, area) => {
          try {
            if (area !== 'local') return;
            if (changes.settings && changes.settings.newValue) {
              applySettings(changes.settings.newValue);
            }
            if (changes[DBSites.CONFIG_KEY] && changes[DBSites.CONFIG_KEY].newValue) {
              applyConfig(changes[DBSites.CONFIG_KEY].newValue.data);
            }
            if (changes.damage && changes.damage.newValue) {
              damageCache = changes.damage.newValue;
              const entry = damageCache[DMG_KEY];
              if (entry && typeof entry.t === 'number' && entry.t > lastWriteT) {
                state.d = clamp01(entry.d);
                lastWriteT = entry.t;
                lastFlushedD = state.d;
              }
            }
          } catch (err) { /* ignore */ }
        });
      } catch (e) { /* ignore */ }
    }
    loadStorage();

    // ---- Feed-kill messaging ----------------------------------------------
    function sendFeedKill(on) {
      try {
        if (!(cr && cr.runtime && cr.runtime.sendMessage)) return;
        // host lets the worker add a generic block-all-XHR rule for unknown
        // sites; known sites keep their precise API-path rules.
        const p = cr.runtime.sendMessage({ type: 'db-feedkill', on: on, host: location.hostname });
        if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
      } catch (e) { /* ignore */ }
    }

    // ---- Main loop (all DOM writes happen here) ----------------------------
    function loop() {
      try {
        const now = Date.now();
        // Safety net for SPA navs the isolated-world history patch can't see
        // (page-world pushState on YouTube/Instagram): detect href changes.
        if (location.href !== lastHref) {
          lastHref = location.href;
          onNav();
        }
        DBMeter.tick(state, now);
        applyVisuals();
        if (state.d >= 0.995 && !killOn) {
          killOn = true;
          sendFeedKill(true);
        } else if (state.d < 0.85 && killOn) {
          killOn = false;
          sendFeedKill(false);
        }
        if (storageLoaded && state.d !== lastFlushedD && now - lastFlushAt >= 250) {
          flushStorage(now);
        }
      } catch (e) { /* ignore — never break the host page */ }
    }
    setInterval(loop, 250);

    // ---- Test hook (file:// harness only, never real sites) ----------------
    if (isFileHarness) {
      window.__db = {
        set(d) { state.d = clamp01(d); },
        state,
      };
      // Cross-world bridge: the harness page (page world) dispatches db:set
      // with a damage value; this isolated copy (which owns the real
      // chrome/storage/messaging) applies it. DOM events flow between worlds,
      // JS globals do not.
      window.addEventListener('db:set', (e) => {
        try {
          if (typeof e.detail === 'number') state.d = clamp01(e.detail);
        } catch (err) { /* ignore */ }
      });
    }
  } catch (e) { /* never break the host page */ }
})();

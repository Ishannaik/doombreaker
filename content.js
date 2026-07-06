// DoomBreaker — content.js (integration glue)
// Runs at document_start in the isolated world. Everything is wrapped so an
// exception here can never break the host page. No DOM writes happen in event
// handlers — all DOM mutation lives in the 250ms loop.
(() => {
  'use strict';
  try {
    if (typeof DBMeter === 'undefined') return;

    // ---- Sites (contract) -------------------------------------------------
    const SITES = [
      { key: 'x',         host: /(^|\.)(x|twitter)\.com$/, active: () => true,                                mode: () => 'wheel' },
      { key: 'reddit',    host: /(^|\.)reddit\.com$/,      active: () => true,                                mode: () => 'wheel' },
      { key: 'instagram', host: /(^|\.)instagram\.com$/,   active: p => p === '/' || p.startsWith('/reel'),   mode: p => p.startsWith('/reel') ? 'video' : 'wheel' },
      { key: 'youtube',   host: /(^|\.)youtube\.com$/,     active: p => p.startsWith('/shorts'),              mode: () => 'video' },
      { key: 'linkedin',  host: /(^|\.)linkedin\.com$/,    active: p => p.startsWith('/feed'),                mode: () => 'wheel' },
    ];

    // localhost included so the harness can be served over http for automated
    // browser tests; manifest matches never inject this script on localhost,
    // so the hook still can't exist on real sites.
    const isFileHarness = location.protocol === 'file:' || location.hostname === 'localhost';
    let site = SITES.find(s => s.host.test(location.hostname)) || null;
    // The file:// test harness has no matching host; use a synthetic
    // always-active wheel site so the harness exercises the real pipeline.
    if (!site && isFileHarness) {
      site = { key: 'x', host: /$^/, active: () => true, mode: () => 'wheel' };
    }
    if (!site) return;

    const CFG = DBMeter.CFG;
    const THRESHOLDS = [0.60, 0.70, 0.80, 0.90, 0.97];
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const clamp01 = v => Math.min(1, Math.max(0, Number(v) || 0));
    const cr = (typeof chrome !== 'undefined') ? chrome : null;

    // ---- State ------------------------------------------------------------
    const state = DBMeter.create(Date.now());
    let settings = {
      sites: { x: true, reddit: true, instagram: true, youtube: true, linkedin: true },
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

    function isVideoPath(p) {
      return /^\/shorts\/[^/]+/.test(p) || p.startsWith('/reel');
    }

    function onNav() {
      try {
        const p = location.pathname;
        active = !!site.active(p);
        mode = site.mode(p);
        if (enabled && active && mode === 'video' && p !== lastVideoPath && isVideoPath(p)) {
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

    function spawnCrack(x, y) {
      if (!cracksSvg) return;
      const lines = 5 + Math.floor(Math.random() * 4); // 5..8
      for (let i = 0; i < lines; i++) {
        const segs = 4 + Math.floor(Math.random() * 4); // 4..7
        // Radiate around the impact point with random angular spread.
        let ang = (i / lines) * Math.PI * 2 + (Math.random() - 0.5) * 1.5;
        let px = x, py = y;
        const pts = [Math.round(px) + ',' + Math.round(py)];
        for (let j = 0; j < segs; j++) {
          ang += (Math.random() - 0.5) * 1.2; // per-segment jitter
          const len = 25 + Math.random() * 55;
          px += Math.cos(ang) * len;
          py += Math.sin(ang) * len;
          pts.push(Math.round(px) + ',' + Math.round(py));
        }
        const points = pts.join(' ');
        const back = document.createElementNS(SVG_NS, 'polyline');
        back.setAttribute('points', points);
        back.setAttribute('fill', 'none');
        back.setAttribute('stroke', 'rgba(255,255,255,.18)');
        back.setAttribute('stroke-width', '4');
        back.setAttribute('stroke-linecap', 'round');
        cracksSvg.appendChild(back);
        const line = document.createElementNS(SVG_NS, 'polyline');
        line.setAttribute('points', points);
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', 'rgba(255,255,255,.75)');
        line.setAttribute('stroke-width', '1.5');
        cracksSvg.appendChild(line);
      }
    }

    function clearCracks() {
      fired.clear();
      if (cracksSvg) {
        while (cracksSvg.firstChild) cracksSvg.removeChild(cracksSvg.firstChild);
      }
    }

    function crackTick() {
      if (state.d < 0.5) {
        if (fired.size || (cracksSvg && cracksSvg.firstChild)) clearCracks();
        return;
      }
      for (const t of THRESHOLDS) {
        if (state.d >= t && !fired.has(t)) {
          fired.add(t);
          const x = Math.random() * window.innerWidth;
          const y = window.innerHeight / 2 + (Math.random() - 0.5) * window.innerHeight * 0.4;
          spawnCrack(x, y);
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
      damageCache[site.key] = { d: state.d, t: now };
      try {
        if (cr && cr.storage && cr.storage.local) {
          cr.storage.local.set({ damage: damageCache });
        }
      } catch (e) { /* ignore */ }
    }

    function loadStorage() {
      if (!(cr && cr.storage && cr.storage.local)) { storageLoaded = true; return; }
      try {
        cr.storage.local.get(['damage', 'settings'], (res) => {
          try {
            res = res || {};
            if (res.settings) applySettings(res.settings);
            damageCache = (res.damage && typeof res.damage === 'object') ? res.damage : {};
            const entry = damageCache[site.key];
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
            if (changes.damage && changes.damage.newValue) {
              damageCache = changes.damage.newValue;
              const entry = damageCache[site.key];
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
        const p = cr.runtime.sendMessage({ type: 'db-feedkill', on });
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
    }
  } catch (e) { /* never break the host page */ }
})();

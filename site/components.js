// ============================================================
// DoomBreaker landing page — components
// Custom elements, light DOM (content stays crawlable for SEO).
// The demo engine ports the extension's real logic from
// meter.js + content.js (mulberry32 crack geometry) with
// demo-tuned constants so the break/heal cycle is visible.
// ============================================================

(() => {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- tiny helpers ---------- */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ---------- db-meter: damage bar ---------- */
  // Usage: <db-meter d="0" label="DAMAGE"></db-meter>
  class DbMeter extends HTMLElement {
    static observedAttributes = ['d'];

    connectedCallback() {
      this.innerHTML = '';
      this._head = el('div', 'meter-head');
      this._label = el('span', 'meter-label', this.getAttribute('label') || 'DAMAGE');
      this._value = el('span', 'meter-value', '0%');
      this._head.append(this._label, this._value);
      this._track = el('div', 'meter-track');
      this._fill = el('div', 'meter-fill');
      this._track.appendChild(this._fill);
      this._ticks = el('div', 'meter-ticks');
      for (const t of [0.3, 0.6, 0.9, 1]) {
        const s = el('span', '', String(t).padEnd(4, '0'));
        s.style.left = (t * 100) + '%';
        this._ticks.appendChild(s);
      }
      this.append(this._head, this._track, this._ticks);
      this._render(parseFloat(this.getAttribute('d')) || 0);
    }

    attributeChangedCallback(name, _, next) {
      if (name === 'd' && this._fill) this._render(parseFloat(next) || 0);
    }

    _render(d) {
      const pct = Math.round(d * 100);
      this._fill.style.width = pct + '%';
      this._value.textContent = pct + '%';
      this._value.style.color = d >= 0.9 ? 'var(--accent)' : '';
    }
  }

  /* ---------- db-threshold: stage card ---------- */
  // <db-threshold at="0.30" name="BLUR"><p>…</p></db-threshold>
  class DbThreshold extends HTMLElement {
    connectedCallback() {
      const at = el('p', 'threshold-at', this.getAttribute('at'));
      const name = el('span', 'threshold-name', this.getAttribute('name'));
      this.prepend(at, name);
    }
  }

  /* ---------- db-effect-card ---------- */
  // <db-effect-card name="BLUR" code="d ≥ 0.30"><p>…</p></db-effect-card>
  class DbEffectCard extends HTMLElement {
    connectedCallback() {
      const name = el('h3', 'effect-name', this.getAttribute('name'));
      const code = el('p', 'effect-code', this.getAttribute('code'));
      this.prepend(name, code);
    }
  }

  /* ---------- db-site-tag ---------- */
  // <db-site-tag name="X / Twitter" note="everywhere"></db-site-tag>
  class DbSiteTag extends HTMLElement {
    connectedCallback() {
      const name = el('span', 'site-tag-name', this.getAttribute('name'));
      const note = el('span', 'site-tag-note', this.getAttribute('note'));
      this.append(name, note);
    }
  }

  /* ---------- db-nav: mobile toggle ---------- */
  class DbNav extends HTMLElement {
    connectedCallback() {
      const toggle = this.querySelector('.nav-toggle');
      const nav = this.querySelector('#nav-links');
      if (!toggle || !nav) return;
      toggle.addEventListener('click', () => {
        const open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
      nav.querySelectorAll('a').forEach((a) =>
        a.addEventListener('click', () => {
          nav.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        })
      );
    }
  }

  /* ---------- db-demo: the live breaking feed ---------- */
  // Ports DBMeter (meter.js) + buildCracks (content.js) with demo
  // constants: BUDGET_PX 40000 (same), heal 0.035/s (product: 1/3600),
  // idle 1.5s (product: 20s) — otherwise a full heal takes an hour.
  class DbDemo extends HTMLElement {
    connectedCallback() {
      if (this._ready) return;
      this._ready = true;

      this._frame = this.querySelector('.demo-frame');
      this._feed = this.querySelector('.demo-feed');
      this._svg = this.querySelector('.demo-cracks');
      this._slider = this.querySelector('input[type="range"]');
      this._meter = this.querySelector('db-meter');
      this._blocked = this.querySelector('.demo-blocked');

      const THRESH = { BLUR: 0.3, CRACKS: 0.6, GLITCH: 0.6, SHAKE: 0.9, KILL: 0.995 };
      const CFG = { BUDGET_PX: 40000, SENS: 1, HEAL_PER_SEC: 0.035, IDLE_MS: 1500 };
      const CRACK_THRESH = [0.6, 0.72, 0.84, 0.96];

      const state = { d: 0, last: performance.now(), lastTick: performance.now() };
      let crackNodes = [];
      let cracksBuilt = false;
      const fired = new Set();
      let dragging = false;

      const setD = (v) => {
        state.d = clamp(v, 0, 1);
        state.last = performance.now();
      };

      // --- crack geometry (port of content.js buildCracks) ---
      function mulberry32(seed) {
        return function () {
          seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
          let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      function buildCracks() {
        if (cracksBuilt) return;
        cracksBuilt = true;
        const NS = 'http://www.w3.org/2000/svg';
        const w = this._frame.clientWidth, h = this._frame.clientHeight;
        const rnd = mulberry32((Date.now() >>> 0) ^ Math.imul(w | 0, 2654435761));
        const raw = [];
        const impacts = 3;
        for (let i = 0; i < impacts; i++) {
          const x = rnd() * w;
          const y = h * (0.2 + rnd() * 0.6);
          const rays = 4 + Math.floor(rnd() * 3);
          for (let r = 0; r < rays; r++) {
            let ang = (r / rays) * Math.PI * 2 + (rnd() - 0.5) * 1.5;
            let px = x, py = y;
            const pts = [[px, py]];
            const segs = 3 + Math.floor(rnd() * 3);
            for (let s = 0; s < segs; s++) {
              ang += (rnd() - 0.5) * 1.2;
              const len = 22 + rnd() * 45;
              px += Math.cos(ang) * len;
              py += Math.sin(ang) * len;
              pts.push([px, py]);
            }
            raw.push(pts);
          }
        }
        const total = raw.length;
        raw.forEach((pts, i) => {
          const t = CRACK_THRESH[Math.min(CRACK_THRESH.length - 1, Math.floor((i / total) * CRACK_THRESH.length))];
          const d = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
          const mk = (stroke, width) => {
            const p = document.createElementNS(NS, 'path');
            p.setAttribute('d', d);
            p.setAttribute('fill', 'none');
            p.setAttribute('stroke', stroke);
            p.setAttribute('stroke-width', String(width));
            p.setAttribute('stroke-linecap', 'round');
            return p;
          };
          const back = mk('rgba(255,255,255,.18)', 4);
          const line = mk('rgba(255,255,255,.75)', 1.5);
          const len = Math.max(1, back.getTotalLength());
          for (const e of [back, line]) {
            e.style.opacity = '0';
            e.style.strokeDasharray = String(len);
            e.style.strokeDashoffset = String(len);
            e.style.transition = 'stroke-dashoffset 0.7s ease-out, opacity 0.6s ease-out';
          }
          this._svg.appendChild(back);
          this._svg.appendChild(line);
          crackNodes.push({ threshold: t, back, line, revealed: false });
        });
      }

      function clearCracks() {
        fired.clear();
        crackNodes = [];
        if (this._svg.firstChild) {
          Array.from(this._svg.children).forEach((k) => {
            k.style.transition = 'opacity 0.45s ease-out';
            k.style.opacity = '0';
          });
          setTimeout(() => {
            if (!fired.size) while (this._svg.firstChild) this._svg.removeChild(this._svg.firstChild);
          }, 500);
        }
        cracksBuilt = false;
      }

      function crackTick(d) {
        if (d < 0.5) {
          if (fired.size || this._svg.firstChild) clearCracks.call(this);
          return;
        }
        if (d >= CRACK_THRESH[0] && !cracksBuilt) buildCracks.call(this);
        for (const t of CRACK_THRESH) {
          if (d >= t && !fired.has(t)) {
            fired.add(t);
            let idx = 0;
            for (const node of crackNodes) {
              if (node.threshold <= t && !node.revealed) {
                node.revealed = true;
                const delay = Math.min(600, idx * 45) + 'ms';
                for (const e of [node.back, node.line]) {
                  e.style.transitionDelay = delay;
                  e.style.opacity = '1';
                  requestAnimationFrame(() => { e.style.strokeDashoffset = '0'; });
                }
                idx++;
              }
            }
          }
        }
      }

      // --- apply damage state to the frame ---
      const apply = () => {
        const d = state.d;
        this._frame.style.setProperty('--d', String(d));
        this._frame.classList.toggle('dmg-blur', d >= THRESH.BLUR);
        this._frame.classList.toggle('dmg-cracks', d >= THRESH.CRACKS);
        this._frame.classList.toggle('dmg-glitch', d >= THRESH.GLITCH && !REDUCED);
        this._frame.classList.toggle('dmg-shake', d >= THRESH.SHAKE && !REDUCED);
        this._frame.classList.toggle('dmg-blocked', d >= THRESH.KILL);
        if (this._meter) this._meter.setAttribute('d', String(d));
        if (this._slider && !dragging) this._slider.value = String(Math.round(d * 100));
      };

      // --- main loop, 250ms like the extension ---
      const loop = () => {
        const now = performance.now();
        if (!dragging && now - state.last >= CFG.IDLE_MS) {
          const elapsedSec = (now - state.lastTick) / 1000;
          state.d = clamp(state.d - CFG.HEAL_PER_SEC * elapsedSec, 0, 1);
        }
        state.lastTick = now;
        crackTick.call(this, state.d);
        apply();
      };
      this._timer = setInterval(loop, 250);

      // --- input: wheel over the frame ---
      this._frame.addEventListener('wheel', (e) => {
        e.preventDefault();
        setD(state.d + (Math.abs(e.deltaY) * CFG.SENS) / CFG.BUDGET_PX);
      }, { passive: false });

      // --- input: keyboard (accessibility) ---
      this._frame.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowDown' || e.key === 'PageDown' ? 0.08 : e.key === 'ArrowUp' || e.key === 'PageUp' ? -0.08 : 0;
        if (step) {
          e.preventDefault();
          setD(state.d + step);
        }
      });

      // --- input: slider ---
      this._slider.addEventListener('pointerdown', () => { dragging = true; });
      this._slider.addEventListener('input', () => {
        setD(parseInt(this._slider.value, 10) / 100);
      });
      this._slider.addEventListener('change', () => { dragging = false; });
      this._slider.addEventListener('pointerup', () => { dragging = false; });

      apply();
    }

    disconnectedCallback() {
      if (this._timer) clearInterval(this._timer);
    }
  }

  /* ---------- register ---------- */
  customElements.define('db-meter', DbMeter);
  customElements.define('db-threshold', DbThreshold);
  customElements.define('db-effect-card', DbEffectCard);
  customElements.define('db-site-tag', DbSiteTag);
  customElements.define('db-nav', DbNav);
  customElements.define('db-demo', DbDemo);
})();

// DoomBreaker — gatekeeper.js (Gatekeeper cat mode)
// The viral "cat stops your doomscrolling" meme: when damage hits the wall, a
// giant orange cat walks on screen, sits down in the middle of the page, and
// a countdown runs. No petting, no dismiss button. When the timer ends the cat
// leaves and the damage is fully healed.
//
// Same split as cat.js: pure helpers (breakMs/remaining/fmt/svg) are unit
// tested in node; create() owns the DOM and is only called by content.js
// inside its guarded environment.
//
// Top-level const: content scripts share lexical globals across files.
const DBGate = {
  TRIGGER: 0.92,            // same damage as the companion cat's wall
  BREAK_CHOICES: [1, 2, 5], // minutes offered in the popup
  DEFAULT_MIN: 2,

  // Pure: minutes setting -> break length in ms (clamped to the choices).
  breakMs(min) {
    const m = Number(min);
    const ok = this.BREAK_CHOICES.indexOf(m) !== -1 ? m : this.DEFAULT_MIN;
    return ok * 60000;
  },

  // Pure: ms left in a break ending at `until` (0 when over or invalid).
  remaining(until, now) {
    const u = Number(until) || 0;
    return Math.max(0, u - (Number(now) || 0));
  },

  // Pure: ms -> "m:ss", rounding up so the clock never shows 0:00 early.
  fmt(ms) {
    const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  },

  // Pure: deterministic SVG of the big orange cat, sitting, facing you.
  // Parts carry classes so CSS can breathe/blink/swish them.
  svg() {
    const O = '#f5a04a', D = '#d9782b', L = '#fde2c4', K = '#2a1a10';
    return [
      '<svg viewBox="0 0 320 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
      '<ellipse cx="160" cy="286" rx="118" ry="12" fill="rgba(0,0,0,.35)"/>',
      // tail (behind body)
      '<g class="dbg-tail"><path d="M236 262 Q300 254 296 204 Q292 170 268 176" stroke="' + D + '" stroke-width="22" fill="none" stroke-linecap="round"/></g>',
      // body
      '<g class="dbg-body">',
      '<path d="M58 284 Q44 150 160 146 Q276 150 262 284 Z" fill="' + O + '" stroke="' + K + '" stroke-width="3" stroke-linejoin="round"/>',
      '<path d="M112 284 Q108 196 160 192 Q212 196 208 284 Z" fill="' + L + '"/>',
      '<path d="M76 196 Q92 190 100 200 M70 226 Q88 220 98 232 M244 196 Q228 190 220 200 M250 226 Q232 220 222 232" stroke="' + D + '" stroke-width="7" fill="none" stroke-linecap="round"/>',
      // front paws
      '<ellipse cx="128" cy="280" rx="22" ry="12" fill="' + L + '" stroke="' + K + '" stroke-width="3"/>',
      '<ellipse cx="192" cy="280" rx="22" ry="12" fill="' + L + '" stroke="' + K + '" stroke-width="3"/>',
      '</g>',
      // head
      '<g class="dbg-head">',
      '<path class="dbg-ear-l" d="M92 92 L82 30 L136 70 Z" fill="' + O + '" stroke="' + K + '" stroke-width="3" stroke-linejoin="round"/>',
      '<path d="M98 82 L94 48 L122 70 Z" fill="#f7b7a3"/>',
      '<path class="dbg-ear-r" d="M228 92 L238 30 L184 70 Z" fill="' + O + '" stroke="' + K + '" stroke-width="3" stroke-linejoin="round"/>',
      '<path d="M222 82 L226 48 L198 70 Z" fill="#f7b7a3"/>',
      '<ellipse cx="160" cy="112" rx="86" ry="70" fill="' + O + '" stroke="' + K + '" stroke-width="3"/>',
      '<path d="M140 50 L144 74 M160 46 L160 72 M180 50 L176 74" stroke="' + D + '" stroke-width="6" stroke-linecap="round"/>',
      '<ellipse cx="160" cy="136" rx="42" ry="30" fill="' + L + '"/>',
      // eyes (half-lidded, unimpressed)
      '<g class="dbg-eyes">',
      '<ellipse cx="126" cy="108" rx="13" ry="11" fill="' + K + '"/><ellipse cx="194" cy="108" rx="13" ry="11" fill="' + K + '"/>',
      '<circle cx="130" cy="104" r="3.5" fill="#fff"/><circle cx="198" cy="104" r="3.5" fill="#fff"/>',
      '<path d="M110 100 L142 100 M178 100 L210 100" stroke="' + O + '" stroke-width="9"/>',
      '</g>',
      '<path d="M153 126 L167 126 L160 134 Z" fill="#e0707a" stroke="' + K + '" stroke-width="2" stroke-linejoin="round"/>',
      '<path d="M160 134 Q160 144 150 146 M160 134 Q160 144 170 146" stroke="' + K + '" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      '<path d="M118 132 L76 124 M118 140 L76 144 M202 132 L244 124 M202 140 L244 144" stroke="' + K + '" stroke-width="2" stroke-linecap="round"/>',
      '</g>',
      '</svg>'].join('');
  },

  // Build the live overlay. Returns a controller; content.js owns the
  // lifetime and drives it with show(until)/hide() from its loop.
  create() {
    const reduced = (typeof matchMedia === 'function')
      && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!document.getElementById('db-gate-style')) {
      const st = document.createElement('style');
      st.id = 'db-gate-style';
      st.textContent =
        'html.db-gate-on,html.db-gate-on body{overflow:hidden!important}' +
        '#db-gate{position:fixed;inset:0;z-index:2147483647;display:none;' +
        'align-items:flex-end;justify-content:center;background:rgba(10,8,6,.55);' +
        'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
        'font-family:ui-monospace,Menlo,Consolas,monospace;color:#fff;cursor:default;' +
        'overscroll-behavior:contain;touch-action:none}' +
        '#db-gate.dbg-show{display:flex}' +
        '#db-gate .dbg-cat{width:min(78vw,640px);margin-bottom:-2vh}' +
        '#db-gate .dbg-cat svg{width:100%;height:auto;display:block}' +
        '#db-gate .dbg-hud{position:absolute;top:8vh;left:0;right:0;text-align:center;' +
        'text-shadow:0 2px 12px rgba(0,0,0,.6)}' +
        '#db-gate .dbg-clock{font-size:clamp(44px,9vw,96px);font-weight:700;letter-spacing:.04em}' +
        '#db-gate .dbg-msg{font-size:clamp(13px,1.6vw,17px);opacity:.85;margin-top:6px}' +
        '#db-gate.dbg-walk .dbg-cat{animation:dbg-walk 1.8s cubic-bezier(.3,.7,.3,1) both}' +
        '#db-gate.dbg-leave .dbg-cat{animation:dbg-leave 1.2s ease-in both}' +
        '#db-gate .dbg-body{transform-origin:160px 284px;animation:dbg-breathe 3.2s ease-in-out infinite}' +
        '#db-gate .dbg-eyes{transform-origin:160px 108px;animation:dbg-blink 4.6s infinite}' +
        '#db-gate .dbg-tail{transform-origin:236px 262px;animation:dbg-swish 2.4s ease-in-out infinite}' +
        '#db-gate .dbg-ear-r{transform-origin:228px 92px;animation:dbg-ear 7s infinite}' +
        '@keyframes dbg-walk{0%{transform:translateX(90vw) translateY(0)}' +
        '20%{transform:translateX(66vw) translateY(-10px)}40%{transform:translateX(44vw) translateY(0)}' +
        '60%{transform:translateX(22vw) translateY(-10px)}80%{transform:translateX(4vw) translateY(0)}' +
        '100%{transform:translateX(0)}}' +
        '@keyframes dbg-leave{to{transform:translateX(-100vw)}}' +
        '@keyframes dbg-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.02,1.035)}}' +
        '@keyframes dbg-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}' +
        '@keyframes dbg-swish{0%,100%{transform:rotate(0)}50%{transform:rotate(-14deg)}}' +
        '@keyframes dbg-ear{0%,88%,100%{transform:rotate(0)}91%{transform:rotate(-12deg)}94%{transform:rotate(0)}}' +
        '@media (prefers-reduced-motion: reduce){#db-gate *{animation:none!important}}';
      (document.head || document.documentElement).appendChild(st);
    }

    const el = document.createElement('div');
    el.id = 'db-gate';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Scroll break. The cat is sitting on your feed until the timer ends.');
    el.innerHTML =
      '<div class="dbg-hud"><div class="dbg-clock" aria-live="off">0:00</div>' +
      '<div class="dbg-msg">the cat is sitting here now. take a break.</div></div>' +
      '<div class="dbg-cat">' + DBGate.svg() + '</div>';
    const clock = el.querySelector('.dbg-clock');

    let until = 0;
    let leaveTimer = null;

    // Swallow every scroll/click attempt while the cat sits.
    const eat = (e) => { if (until) { e.preventDefault(); e.stopPropagation(); } };
    el.addEventListener('wheel', eat, { passive: false });
    el.addEventListener('touchmove', eat, { passive: false });
    el.addEventListener('click', eat, true);
    const SCROLL_KEYS = { ' ': 1, PageDown: 1, PageUp: 1, ArrowDown: 1, ArrowUp: 1, Home: 1, End: 1, j: 1, k: 1 };
    const onKey = (e) => { if (until && SCROLL_KEYS[e.key]) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('keydown', onKey, true);

    (document.documentElement || document).appendChild(el);

    return {
      el: el,
      get active() { return until > 0; },
      // Idempotent: calling every tick with the same `until` only updates the clock.
      show(u, now) {
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; el.classList.remove('dbg-leave'); }
        if (!until) {
          el.classList.add('dbg-show');
          if (!reduced) el.classList.add('dbg-walk');
          document.documentElement.classList.add('db-gate-on');
        }
        until = u;
        const txt = DBGate.fmt(DBGate.remaining(u, now));
        if (clock.textContent !== txt) clock.textContent = txt;
      },
      hide() {
        if (!until) return;
        until = 0;
        document.documentElement.classList.remove('db-gate-on');
        el.classList.remove('dbg-walk');
        if (reduced) { el.classList.remove('dbg-show'); return; }
        el.classList.add('dbg-leave');
        leaveTimer = setTimeout(() => {
          leaveTimer = null;
          el.classList.remove('dbg-show', 'dbg-leave');
        }, 1200);
      },
      destroy() {
        if (leaveTimer) clearTimeout(leaveTimer);
        window.removeEventListener('keydown', onKey, true);
        try { document.documentElement.classList.remove('db-gate-on'); } catch (e) { /* ignore */ }
        try { el.remove(); } catch (e) { /* ignore */ }
      },
    };
  },
};

if (typeof module !== 'undefined') module.exports = DBGate;

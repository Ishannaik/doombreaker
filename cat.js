// DoomBreaker — cat.js (companion cat)
// The viral-maker pattern: as doom-damage rises, a cat shows up. It peeks,
// stares, sits down, and finally physically blocks the feed. Petting the cat
// in block stage three times heals a chunk of damage and releases the wall.
//
// Pure logic lives in stage()/svg(); create() owns DOM and is only called by
// content.js inside its guarded environment. An exception here can never
// break the host page (content.js wraps every call).
//
// Top-level const (like meter.js): content scripts in one isolated world
// share global lexical bindings across files, so content.js sees DBCat.
const DBCat = {
    // Damage thresholds for stages 1..4 (stage 0 = hidden).
    STAGES: [0.25, 0.55, 0.75, 0.92],

    // Pure: damage -> stage number (0..4).
    stage(d) {
      const v = Number(d) || 0;
      let s = 0;
      for (let i = 0; i < this.STAGES.length; i++) {
        if (v >= this.STAGES[i]) s = i + 1;
      }
      return s;
    },

    // Pure: SVG markup per stage. Deterministic strings so unit tests can
    // assert on them without a DOM.
    svg(stage) {
      switch (stage) {
        case 1: return [
          '<svg viewBox="0 0 150 84" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
          '<g stroke="rgba(255,255,255,.8)" stroke-width="2" fill="#14141b" stroke-linejoin="round" stroke-linecap="round">',
          '<path d="M96 82 L96 46 Q96 26 116 24 L138 22 M96 52 L74 50"/>',
          '<path d="M104 34 L98 16 L114 28 Z"/><path d="M128 30 L134 12 L142 32 Z"/>',
          '</g>',
          '<circle cx="112" cy="40" r="2.4" fill="#fff"/><circle cx="132" cy="38" r="2.4" fill="#fff"/>',
          '<path d="M118 48 Q121 51 124 48" stroke="rgba(255,255,255,.8)" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
          '<path d="M88 44 L70 40 M88 48 L70 50" stroke="rgba(255,255,255,.45)" stroke-width="1.2"/>',
          '<text x="10" y="76" font-family="monospace" font-size="13" fill="rgba(255,255,255,.85)">psst.</text>',
          '</svg>'].join('');
        case 2: return [
          '<svg width="170" height="130" viewBox="0 0 170 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
          '<ellipse cx="85" cy="118" rx="58" ry="9" fill="rgba(0,0,0,.35)"/>',
          '<path d="M42 108 Q40 62 85 60 Q130 62 128 108 Z" stroke="rgba(255,255,255,.8)" stroke-width="2" fill="#14141b" stroke-linejoin="round"/>',
          '<path d="M56 44 L48 14 L76 36 Z" stroke="rgba(255,255,255,.8)" stroke-width="2" fill="#14141b" stroke-linejoin="round"/>',
          '<path d="M114 44 L122 14 L94 36 Z" stroke="rgba(255,255,255,.8)" stroke-width="2" fill="#14141b" stroke-linejoin="round"/>',
          '<circle cx="85" cy="66" r="34" stroke="rgba(255,255,255,.8)" stroke-width="2" fill="#14141b"/>',
          '<circle cx="72" cy="60" r="3" fill="#fff"/><circle cx="98" cy="60" r="3" fill="#fff"/>',
          '<path d="M80 74 L90 74" stroke="rgba(255,255,255,.8)" stroke-width="2" stroke-linecap="round"/>',
          '<path d="M64 70 L44 66 M64 76 L44 78 M106 70 L126 66 M106 76 L126 78" stroke="rgba(255,255,255,.45)" stroke-width="1.2"/>',
          '<text x="24" y="20" font-family="monospace" font-size="12" fill="rgba(255,255,255,.85)">still scrolling?</text>',
          '</svg>'].join('');
        case 3: return [
          '<svg width="190" height="160" viewBox="0 0 190 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
          '<ellipse cx="95" cy="148" rx="62" ry="8" fill="rgba(0,0,0,.35)"/>',
          '<path d="M62 146 Q54 96 95 94 Q136 96 128 146 Z" stroke="rgba(255,255,255,.8)" stroke-width="2" fill="#14141b" stroke-linejoin="round"/>',
          '<path d="M128 140 Q158 138 152 116 Q148 102 134 106" stroke="rgba(255,255,255,.8)" stroke-width="2" fill="none" stroke-linecap="round"/>',
          '<path d="M72 66 L66 40 L88 58 Z" stroke="rgba(255,255,255,.8)" stroke-width="2" fill="#14141b" stroke-linejoin="round"/>',
          '<path d="M118 66 L124 40 L102 58 Z" stroke="rgba(255,255,255,.8)" stroke-width="2" fill="#14141b" stroke-linejoin="round"/>',
          '<circle cx="95" cy="82" r="27" stroke="rgba(255,255,255,.8)" stroke-width="2" fill="#14141b"/>',
          '<circle cx="85" cy="78" r="2.6" fill="#fff"/><circle cx="105" cy="78" r="2.6" fill="#fff"/>',
          '<path d="M91 89 Q95 92 99 89" stroke="rgba(255,255,255,.8)" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
          '<path d="M76 84 L62 82 M76 89 L62 91 M114 84 L128 82 M114 89 L128 91" stroke="rgba(255,255,255,.45)" stroke-width="1.1"/>',
          '<path d="M84 110 L95 118 L106 110" stroke="#ff3b30" stroke-width="3" fill="none" stroke-linecap="round"/>',
          '<text x="47" y="30" font-family="monospace" font-size="12" fill="rgba(255,255,255,.85)">go touch grass</text>',
          '</svg>'].join('');
        case 4: return [
          '<svg width="340" height="240" viewBox="0 0 340 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
          '<rect x="14" y="120" width="312" height="104" rx="14" fill="#101018" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>',
          '<line x1="14" y1="146" x2="326" y2="146" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/>',
          '<text x="170" y="176" text-anchor="middle" font-family="monospace" font-size="21" font-weight="bold" fill="#ff3b30">FEED BLOCKED</text>',
          '<text x="170" y="204" text-anchor="middle" font-family="monospace" font-size="13" fill="rgba(255,255,255,.8)">PET THE CAT x3 TO CONTINUE</text>',
          '<ellipse cx="170" cy="116" rx="64" ry="8" fill="rgba(0,0,0,.4)"/>',
          '<path d="M138 114 Q132 66 170 64 Q208 66 202 114 Z" stroke="rgba(255,255,255,.85)" stroke-width="2.5" fill="#14141b" stroke-linejoin="round"/>',
          '<path d="M206 110 Q238 108 232 88 Q228 74 214 78" stroke="rgba(255,255,255,.85)" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
          '<path d="M148 42 L142 16 L164 36 Z" stroke="rgba(255,255,255,.85)" stroke-width="2.5" fill="#14141b" stroke-linejoin="round"/>',
          '<path d="M192 42 L198 16 L176 36 Z" stroke="rgba(255,255,255,.85)" stroke-width="2.5" fill="#14141b" stroke-linejoin="round"/>',
          '<circle cx="170" cy="60" r="28" stroke="rgba(255,255,255,.85)" stroke-width="2.5" fill="#14141b"/>',
          '<circle cx="159" cy="55" r="3" fill="#fff"/><circle cx="181" cy="55" r="3" fill="#fff"/>',
          '<path d="M164 68 Q170 73 176 68" stroke="rgba(255,255,255,.85)" stroke-width="2" fill="none" stroke-linecap="round"/>',
          '<path d="M149 62 L133 59 M149 68 L133 71 M191 62 L207 59 M191 68 L207 71" stroke="rgba(255,255,255,.5)" stroke-width="1.3"/>',
          '<path d="M158 90 L170 98 L182 90" stroke="#ff3b30" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
          '<g fill="rgba(255,255,255,.8)"><circle cx="30" cy="30" r="3"/><circle cx="310" cy="30" r="3"/></g>',
          '</svg>'].join('');
        default: return '';
      }
    },

    // Build the live widget. Returns a controller; callers own the lifetime.
    // opts.onHeal  — called once per successful block-release burst.
    // opts.bursts  — heal fraction removed from the meter on release.
    create(opts) {
      const o = opts || {};
      const PETS_NEEDED = 3;
      const PET_WINDOW_MS = 4000;
      const PET_COOLDOWN_MS = 180;

      const reduced = (typeof matchMedia === 'function')
        && matchMedia('(prefers-reduced-motion: reduce)').matches;

      // One shared stylesheet (create may be called once per page, but stay
      // idempotent in case a future caller races).
      if (!document.getElementById('db-cat-style')) {
        const st = document.createElement('style');
        st.id = 'db-cat-style';
        st.textContent =
          '#db-cat{position:fixed;right:18px;bottom:14px;z-index:2147483647;' +
          'pointer-events:none;opacity:0;transform:translateY(14px);' +
          'transition:opacity .45s ease,transform .45s ease;width:auto}' +
          '#db-cat.db-cat-on{opacity:1;transform:translateY(0);pointer-events:auto;cursor:pointer}' +
          '#db-cat.db-cat-block{right:auto;left:50%;bottom:6vh;transform:translate(-50%,0)}' +
          '@media (prefers-reduced-motion: reduce){#db-cat{transition:opacity .3s ease}}';
        document.head.appendChild(st);
      }

      const el = document.createElement('div');
      el.id = 'db-cat';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', 'DoomBreaker cat');

      let cur = 0;
      let pets = 0;
      let firstPetAt = 0;
      let lastPetAt = 0;
      let expireTimer = null;

      function render(stage) {
        const on = stage >= 1;
        el.classList.toggle('db-cat-on', on);
        el.classList.toggle('db-cat-block', stage === 4);
        el.setAttribute('data-stage', String(stage));
        el.setAttribute('data-pets', String(pets));
        const label = stage === 4
          ? 'Feed blocked. Pet the cat three times to continue.'
          : (on ? 'DoomBreaker cat is watching you scroll.' : 'DoomBreaker cat');
        el.setAttribute('aria-label', label);
        const html = DBCat.svg(stage);
        if (el.innerHTML !== html) el.innerHTML = html;
      }

      function clearPets() {
        pets = 0;
        firstPetAt = 0;
        if (expireTimer) { clearTimeout(expireTimer); expireTimer = null; }
        el.setAttribute('data-pets', '0');
      }

      function pet() {
        if (cur < 1) return { healed: false, pets: 0, stage: cur };
        const now = Date.now();
        if (now - lastPetAt < PET_COOLDOWN_MS) return { healed: false, pets: pets, stage: cur };
        lastPetAt = now;
        if (cur !== 4) { pets = Math.min(PETS_NEEDED, pets + 1); el.setAttribute('data-pets', String(pets)); return { healed: false, pets: pets, stage: cur }; }
        if (!firstPetAt || now - firstPetAt > PET_WINDOW_MS) { firstPetAt = now; pets = 1; }
        else pets += 1;
        el.setAttribute('data-pets', String(pets));
        if (pets >= PETS_NEEDED) {
          const healedAt = now;
          pets = 0;
          firstPetAt = 0;
          if (expireTimer) { clearTimeout(expireTimer); expireTimer = null; }
          if (typeof o.onHeal === 'function') { try { o.onHeal(); } catch (e) { /* ignore */ } }
          return { healed: true, pets: PETS_NEEDED, stage: cur, at: healedAt };
        }
        if (!expireTimer) {
          expireTimer = setTimeout(() => { expireTimer = null; if (pets > 0 && pets < PETS_NEEDED) clearPets(); }, PET_WINDOW_MS);
        }
        return { healed: false, pets: pets, stage: cur };
      }

      el.addEventListener('click', (e) => { try { e.preventDefault(); pet(); } catch (err) { /* ignore */ } });
      el.addEventListener('keydown', (e) => {
        try {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pet(); }
        } catch (err) { /* ignore */ }
      });

      (document.documentElement || document).appendChild(el);
      render(0);

      return {
        el: el,
        get stage() { return cur; },
        get petCount() { return pets; },
        setStage(s) {
          const n = Math.max(0, Math.min(4, Number(s) | 0));
          if (n === cur) return;
          const wasBlock = cur === 4;
          cur = n;
          if (n < 4 && wasBlock) clearPets();
          render(cur);
        },
        pet: pet,
        destroy() {
          if (expireTimer) clearTimeout(expireTimer);
          try { el.remove(); } catch (e) { /* ignore */ }
        },
      };
    },
};

if (typeof module !== 'undefined') module.exports = DBCat;
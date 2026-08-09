// DoomBreaker damage meter — pure logic, no chrome/DOM APIs.
// Shared by content scripts (isolated world global) and node tests (module.exports).

const DBMeter = {
  // IDLE_MS 20s: pausing to read a post is still doomscrolling — healing only
  // starts after you've genuinely stopped. HEAL_PER_SEC 1/3600 = full heal in 1hr.
  CFG: { BUDGET_PX: 40000, VIDEO_HIT: 0.06, HEAL_PER_SEC: 1 / 3600, IDLE_MS: 20000 },

  // Fresh state. `last` = timestamp of last input; `lastTick` = previous tick() call time.
  create(now) {
    return { d: 0, last: now, lastTick: now };
  },

  clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  },

  addWheel(s, px, now, sens) {
    s.d = this.clamp(s.d + (Math.abs(px) * sens) / this.CFG.BUDGET_PX);
    s.last = now;
    return s;
  },

  addVideo(s, now, sens) {
    s.d = this.clamp(s.d + this.CFG.VIDEO_HIT * sens);
    s.last = now;
    return s;
  },

  tick(s, now, healMult) {
    if (s.lastTick === undefined) s.lastTick = now;
    if (now - s.last >= this.CFG.IDLE_MS) {
      const elapsedSec = (now - s.lastTick) / 1000;
      const mult = (typeof healMult === 'number' && healMult > 0) ? healMult : 1;
      s.d = this.clamp(s.d - this.CFG.HEAL_PER_SEC * mult * elapsedSec);
    }
    s.lastTick = now;
    return s;
  },

  // Local-date key used to roll the daily time budget over at midnight.
  dateKey(d) {
    const x = d || new Date();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return x.getFullYear() + '-' + m + '-' + day;
  },
};

if (typeof module !== 'undefined') module.exports = DBMeter;

// DoomBreaker damage meter — pure logic, no chrome/DOM APIs.
// Shared by content scripts (isolated world global) and node tests (module.exports).

const DBMeter = {
  CFG: { BUDGET_PX: 40000, VIDEO_HIT: 0.06, HEAL_PER_SEC: 0.008, IDLE_MS: 3000 },

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

  tick(s, now) {
    if (s.lastTick === undefined) s.lastTick = now;
    if (now - s.last >= this.CFG.IDLE_MS) {
      const elapsedSec = (now - s.lastTick) / 1000;
      s.d = this.clamp(s.d - this.CFG.HEAL_PER_SEC * elapsedSec);
    }
    s.lastTick = now;
    return s;
  },
};

if (typeof module !== 'undefined') module.exports = DBMeter;

// Chicago Bois – shared constants and small helpers.
'use strict';
window.CB = window.CB || {};

(function (CB) {
  // City layout: an N x N grid of blocks. Roads run along every grid line.
  const N = 8, P = 74, ROAD = 14;
  CB.C = {
    N, P, ROAD,
    HALF: N * P / 2,          // 296 – outermost road centre line
    BLOCK: P - ROAD,          // 60 – block width incl. sidewalk
    SIDE: 3.2,                // sidewalk width
    CURB: 0.15,               // sidewalk height
    LANE: 2.5,                // driving lane offset from centre line
    PARK: 5.6,                // curb-side parking offset
    STOP: 11.5,               // stop line distance from intersection centre
    SHORE: 334,               // lake starts here (x)
    PIER: { x0: 334, x1: 470, z0: -9, z1: 9 },
    WORLD: { x0: -306, x1: 334, z0: -306, z1: 306 },
  };
  CB.road = (i) => i * P - CB.C.HALF;

  // Deterministic RNG (mulberry32) so the city is the same every time.
  CB.rng = function (seed) {
    let s = seed >>> 0;
    const f = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    return f;
  };

  CB.M = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + (b - a) * Math.random(),
    randInt: (a, b) => Math.floor(a + (b - a + 1) * Math.random()),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    dist: (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz),
    dist2: (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz),
    wrap: (a) => {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    },
    // Move angle a toward b by at most step.
    turn: (a, b, step) => {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) <= step) return b;
      return a + Math.sign(d) * step;
    },
    damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
    smoothstep: (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    },
    hex: (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255],
  };

  CB.fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  };
  CB.fmtMoney = (n) => '$' + Math.floor(n).toLocaleString('en-US');

  // Settings (persisted per browser; works without storage too).
  const DEFAULTS = {
    quality: 'medium', master: 0.8, music: 0.6, sens: 1, invertY: false,
    dayLength: 10, showFps: false,
  };
  CB.settings = Object.assign({}, DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem('chicago-bois-settings') || '{}');
    Object.assign(CB.settings, saved);
  } catch (e) { /* storage blocked */ }
  CB.saveSettings = () => {
    try { localStorage.setItem('chicago-bois-settings', JSON.stringify(CB.settings)); } catch (e) { /* ignore */ }
  };
})(window.CB);

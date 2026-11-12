// Player profile persisted to localStorage.

const KEY = 'stuntrider3d_save_v1';

export const DEFAULT_SETTINGS = {
  quality: 'medium', // low | medium | high
  shadows: true,
  drawDistance: 900,
  fov: 70,
  camera: 0,
  units: 'kmh',
  master: 0.8,
  music: 0.55,
  sfx: 0.85,
  gameMusic: true,
  traffic: true,
  minimap: true,
  invertY: false,
};

function defaults() {
  return {
    points: 0,
    totalEarned: 0,
    unlocked: { mx: true },
    selectedBike: 'mx',
    paint: {},
    suit: 2,
    upgrades: {},
    best: { stunt: 0, rampJump: 0, rampJumpScore: 0, timeTrial: {}, medals: {}, bestCombo: 0 },
    challenges: {},
    stars: [],
    settings: { ...DEFAULT_SETTINGS },
    stats: { flips: 0, crashes: 0, airTime: 0, distance: 0 },
  };
}

function merge(base, extra) {
  for (const k of Object.keys(extra || {})) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k])) {
      merge(base[k], extra[k]);
    } else if (extra[k] !== undefined) {
      base[k] = extra[k];
    }
  }
  return base;
}

export function loadProfile() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) {
    data = null;
  }
  return merge(defaults(), data || {});
}

export class Profile {
  constructor() {
    try {
      this.firstRun = !localStorage.getItem(KEY);
    } catch (e) {
      this.firstRun = true;
    }
    this.data = loadProfile();
    this.listeners = [];
  }
  get settings() {
    return this.data.settings;
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      /* storage unavailable (private mode) – keep playing without saving */
    }
    for (const fn of this.listeners) fn(this.data);
  }
  onChange(fn) {
    this.listeners.push(fn);
  }
  addPoints(n) {
    n = Math.max(0, Math.round(n));
    if (!n) return;
    this.data.points += n;
    this.data.totalEarned += n;
    this.save();
  }
  spend(n) {
    if (this.data.points < n) return false;
    this.data.points -= n;
    this.save();
    return true;
  }
  upgrades(bikeId) {
    if (!this.data.upgrades[bikeId]) this.data.upgrades[bikeId] = { engine: 0, suspension: 0, tires: 0 };
    return this.data.upgrades[bikeId];
  }
  paint(bikeId) {
    return this.data.paint[bikeId] ?? 0;
  }
  reset() {
    const settings = this.data.settings;
    this.data = defaults();
    this.data.settings = settings;
    this.save();
  }
}

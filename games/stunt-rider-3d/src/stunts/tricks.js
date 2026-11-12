// Trick detection and scoring: rotations, style tricks, wheelies, gaps, combos and streaks.
import { Emitter, TAU } from '../core/math.js';

export const STYLE = {
  superman: { name: 'Superman', base: 550, rate: 450, key: 'E' },
  nohander: { name: 'No-Hander', base: 420, rate: 350, key: 'E + A' },
  nofooter: { name: 'No-Footer', base: 380, rate: 330, key: 'E + S' },
  tailwhip: { name: 'Tailwhip', base: 950, rate: 0, key: 'E + D' },
  heartattack: { name: 'Heart Attack', base: 650, rate: 450, key: 'E + W' },
};

const FLIP_PREFIX = ['', '', 'Double ', 'Triple ', 'Quad ', 'Quint '];
const FLIP_MULT = [0, 1, 2.6, 4.6, 7, 10];
export const LINK_TIME = 1.7;

export class TrickSystem {
  constructor(physicsEvents, gaps) {
    this.out = new Emitter();
    this.gaps = gaps;
    this.entries = [];
    this.streak = 0;
    this.linkT = 0;
    this.bestCombo = 0;
    this.enabled = true;
    const on = (n, fn) => physicsEvents.on(n, (d) => this.enabled && fn(d));
    on('takeoff', (d) => this.onTakeoff(d));
    on('land', (d) => this.onLand(d));
    on('crash', (d) => this.onCrash(d));
    on('wheelieEnd', (d) => this.onWheelie(d));
    on('stoppieEnd', (d) => this.onStoppie(d));
    on('loop', () => this.add({ name: 'Loop the Loop', pts: 1500, kind: 'loop' }, true));
    on('styleTrick', (d) => this.out.emit('styleDone', d));
    on('whip', (d) => this.out.emit('whipDone', d));
    on('respawn', () => this.reset(false));
  }

  reset(keepStreak = false) {
    this.entries = [];
    this.linkT = 0;
    if (!keepStreak) this.streak = 0;
    this.out.emit('combo', this.state());
  }

  get mult() {
    const n = this.entries.filter((e) => !e.noMult).length;
    return Math.max(1, Math.min(12, n));
  }
  get streakMult() {
    return 1 + Math.min(10, this.streak) * 0.1;
  }
  get sum() {
    return this.entries.reduce((a, e) => a + e.pts, 0);
  }
  get total() {
    return Math.round(this.sum * this.mult * this.streakMult);
  }

  state() {
    return { entries: this.entries, sum: this.sum, mult: this.mult, streak: this.streak, streakMult: this.streakMult, total: this.total, link: this.entries.length ? this.linkT / LINK_TIME : 0 };
  }

  add(e, keepAlive = false) {
    // repeating the same trick in one combo is worth less
    const reps = this.entries.filter((x) => x.name === e.name).length;
    if (reps) {
      e.pts = Math.round(e.pts * Math.pow(0.7, reps));
      e.repeat = reps;
    }
    e.pts = Math.round(e.pts);
    this.entries.push(e);
    if (keepAlive) this.linkT = LINK_TIME;
    this.out.emit('trick', e);
    this.out.emit('combo', this.state());
  }

  onTakeoff() {
    this.inAir = true;
    this.linkT = LINK_TIME;
  }

  // names of rotations in progress, for the live HUD
  pending(physics) {
    if (physics.mode !== 'air') return [];
    const out = [];
    const p = physics.rot.pitch;
    const n = Math.floor((Math.abs(p) + 0.6) / TAU);
    if (n >= 1) out.push(FLIP_PREFIX[Math.min(n, 5)] + (p > 0 ? 'Backflip' : 'Frontflip'));
    const halves = Math.floor((Math.abs(physics.rot.yaw) + 0.5) / Math.PI);
    const shown = physics.vertAir ? halves - 1 : halves;
    if (shown >= 2) out.push(shown * 180 + '');
    if (physics.style && physics.style.blend > 0.5) out.push(STYLE[physics.style.id].name);
    for (const t of physics.airTricks) out.push(t.id === 'tailwhip' ? (t.count > 1 ? t.count + 'x ' : '') + 'Tailwhip' : STYLE[t.id].name);
    return out;
  }

  onLand(d) {
    this.inAir = false;
    if (d.short && !d.tricks.length) {
      if (this.entries.length) this.linkT = Math.max(this.linkT, 0.6);
      return;
    }
    const air = [];
    const p = d.rot.pitch;
    const flips = Math.round(p / TAU);
    let flipName = '';
    let flipPts = 0;
    if (Math.abs(flips) >= 1) {
      const n = Math.min(5, Math.abs(flips));
      flipName = FLIP_PREFIX[n] + (flips > 0 ? 'Backflip' : 'Frontflip');
      flipPts = (flips > 0 ? 1000 : 1250) * FLIP_MULT[n];
    }
    const halves = Math.round(Math.abs(d.rot.yaw) / Math.PI);
    const spinHalves = d.vert ? halves - 1 : halves;
    let spinDeg = 0;
    if (spinHalves >= 2) {
      spinDeg = spinHalves * 180;
      air.push({ name: spinDeg + (spinHalves >= 4 ? ' Spin' : ''), pts: 380 * spinHalves * (spinHalves >= 4 ? 1.3 : 1), kind: 'spin', deg: spinDeg });
    }
    const styles = [];
    for (const t of d.tricks) {
      const info = STYLE[t.id];
      if (t.id === 'tailwhip') styles.push({ name: (t.count > 1 ? t.count + 'x ' : '') + 'Tailwhip', pts: info.base * t.count * (t.count > 1 ? 1.25 : 1), kind: 'style', id: t.id, count: t.count });
      else styles.push({ name: info.name, pts: info.base + info.rate * Math.min(3, t.hold), kind: 'style', id: t.id, hold: t.hold });
    }
    if (flipName) {
      if (styles.length) {
        // style trick performed during a flip: combined name and bonus
        const st = styles.shift();
        air.push({ name: st.name + ' ' + flipName, pts: (flipPts + st.pts) * 1.25, kind: 'flip', flips, id: st.id, combined: true });
      } else air.push({ name: flipName, pts: flipPts, kind: 'flip', flips });
    }
    air.push(...styles);
    if (d.vert) air.push({ name: 'Vert Air', pts: 300 + 70 * d.maxHeight, kind: 'vert' });
    // gaps
    const fromTag = d.takeoffSolid && d.takeoffSolid.tag;
    const toTag = d.landSolid && d.landSolid.tag;
    for (const g of this.gaps) {
      const inRect = g.toRect && d.pos && d.pos.x >= g.toRect[0] && d.pos.x <= g.toRect[2] && d.pos.z >= g.toRect[1] && d.pos.z <= g.toRect[3];
      if (fromTag && g.from.includes(fromTag) && ((toTag && g.to.includes(toTag)) || inRect)) air.push({ name: g.name, pts: g.points, kind: 'gap', noMult: false });
    }
    if (d.airTime > 1.0) air.push({ name: 'Big Air ' + d.airTime.toFixed(1) + 's', pts: 140 * Math.pow(d.airTime, 1.7) + 30 * d.maxHeight, kind: 'air', noMult: true });
    const qm = d.quality === 'perfect' ? 1.5 : d.quality === 'good' ? 1.15 : d.quality === 'sketchy' ? 0.7 : 1;
    for (const e of air) {
      e.pts *= qm;
      this.add(e);
    }
    const realTricks = air.filter((e) => e.kind !== 'air').length;
    if (realTricks) {
      if (d.quality === 'sketchy') this.streak = Math.max(0, this.streak - 1);
      else this.streak++;
    }
    if (!d.short) this.out.emit('landing', { quality: d.quality, impact: d.impact, hadTricks: realTricks > 0 });
    this.out.emit('landed', { entries: air, quality: d.quality, airTime: d.airTime, flips, spinDeg, styles: d.tricks, vert: d.vert, maxHeight: d.maxHeight, speed: d.speed, pos: d.pos, takeoffPos: d.takeoffPos });
    if (this.entries.length) this.linkT = LINK_TIME;
  }

  onWheelie(d) {
    if (d.time >= 1) {
      const sweet = d.sweet / d.time;
      this.add({ name: 'Wheelie ' + d.time.toFixed(1) + 's', pts: 160 * d.time * (1 + sweet * 0.6), kind: 'wheelie', time: d.time }, true);
    }
    this.out.emit('wheelie', d);
  }

  onStoppie(d) {
    if (d.time >= 0.6) this.add({ name: 'Stoppie ' + d.time.toFixed(1) + 's', pts: 280 * d.time, kind: 'stoppie', time: d.time }, true);
    this.out.emit('stoppie', d);
  }

  onCrash(d) {
    if (this.entries.length) this.out.emit('lost', { total: this.total, reason: d.reason });
    this.entries = [];
    this.linkT = 0;
    this.streak = 0;
    this.out.emit('combo', this.state());
  }

  update(dt, physics) {
    if (!this.entries.length) return;
    const busy = physics.mode === 'air' || physics.mode === 'loop' || physics.wheelieTime > 0 || physics.stoppieTime > 0;
    if (!busy) {
      this.linkT -= dt;
      if (this.linkT <= 0) this.bank();
    }
    this.out.emit('link', this.linkT / LINK_TIME);
  }

  bank() {
    const total = this.total;
    const data = { total, entries: this.entries.slice(), mult: this.mult, streak: this.streak, count: this.entries.filter((e) => !e.noMult).length };
    this.entries = [];
    this.linkT = 0;
    if (total > this.bestCombo) this.bestCombo = total;
    if (total > 0) this.out.emit('banked', data);
    this.out.emit('combo', this.state());
  }

  // bank immediately (end of a timed mode)
  flush() {
    if (this.entries.length) this.bank();
  }
}

// Game modes. Each mode places the bike, listens to trick events and drives the HUD panel.
import { COURSES, CHALLENGES, MEDAL_REWARD } from './data.js';
import { formatTime, formatPoints, TAU } from '../core/math.js';
import { RAMP_JUMP } from '../world/airfield.js';

const EOJ = () => globalThis.EOJ;
const GAME = 'Stunt Rider 3D';

// Daily Challenge: everyone gets the same spot today.
const DAILY_SPOTS = ['park', 'kickers', 'halfpipe', 'loop', 'mxtrack', 'rooftop', 'plaza', 'mall', 'airfield', 'industrial', 'containers', 'quarry', 'lake'];
export function dailySpot() {
  const e = EOJ();
  const i = e ? e.dailySeed('stunt-rider') % DAILY_SPOTS.length : new Date().getDate() % DAILY_SPOTS.length;
  return DAILY_SPOTS[i];
}

class Mode {
  constructor(game, opts = {}) {
    this.game = game;
    this.opts = opts;
    this.time = 0;
    this.score = 0;
    this.earned = 0;
    this.finished = false;
    this.offs = [];
  }
  on(emitter, name, fn) {
    this.offs.push(emitter.on(name, fn));
  }
  start() {
    const g = this.game;
    this.on(g.tricks.out, 'banked', (d) => this.onBanked(d));
  }
  onBanked(d) {
    this.score += d.total;
    this.earned += d.total;
    this.game.profile.addPoints(d.total);
  }
  update() {}
  respawn() {
    this.game.bike.physics.respawnSafe();
  }
  manualReset() {
    const P = this.game.bike.physics;
    if (P.mode === 'ground' && !this.game.world.wallAt(P.pos.x, P.pos.z, P.pos.y, 1.2)) P.reset(P.pos.x, P.pos.z, P.heading, P.pos.y + 0.3);
    else P.respawnSafe();
  }
  place(sp) {
    this.game.placeBike(sp.x, sp.z, sp.yaw);
  }
  panel() {
    return { title: this.title, timer: '', lines: [] };
  }
  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
  }
  finish(results) {
    if (this.finished) return;
    this.finished = true;
    this.game.tricks.flush();
    this.game.endMode(results);
  }
}

// ---------------------------------------------------------------------------
export class FreeRide extends Mode {
  get title() {
    return 'FREE RIDE';
  }
  start() {
    super.start();
    this.place(this.game.world.spawns[this.opts.spawn || 'park']);
  }
  panel() {
    const p = this.game.profile.data;
    return { title: this.title, timer: '', lines: [`Stars ${p.stars.length} / ${this.game.stars.count}`, `Session ${formatPoints(this.score)} pts`] };
  }
}

// ---------------------------------------------------------------------------
export class StuntMode extends Mode {
  get title() {
    return 'STUNT MODE';
  }
  start() {
    super.start();
    this.limit = 180;
    this.best = 0;
    this.tricksLanded = 0;
    this.on(this.game.tricks.out, 'trick', (e) => e.kind !== 'air' && this.tricksLanded++);
    this.place(this.game.world.spawns.park);
    this.game.countdown();
  }
  onBanked(d) {
    super.onBanked(d);
    this.best = Math.max(this.best, d.total);
  }
  update(dt) {
    if (this.game.frozen) return;
    this.time += dt;
    if (this.time >= this.limit) this.end();
  }
  end() {
    this.game.tricks.flush();
    const prof = this.game.profile;
    const prev = prof.data.best.stunt;
    const newBest = this.score > prev;
    if (newBest) prof.data.best.stunt = this.score;
    prof.data.best.bestCombo = Math.max(prof.data.best.bestCombo, this.best);
    prof.save();
    this.finish({
      title: newBest ? 'NEW HIGH SCORE!' : 'TIME UP',
      big: formatPoints(this.score),
      bigLabel: 'POINTS',
      rows: [
        ['Best combo', formatPoints(this.best)],
        ['Tricks landed', this.tricksLanded],
        ['High score', formatPoints(Math.max(prev, this.score))],
      ],
      earned: this.earned,
      share: {
        game: GAME,
        board: 'stunt-rider:stunt',
        score: Math.round(this.score),
        format: (n) => formatPoints(n) + ' pts',
        shareText: `🏍️ I scored ${formatPoints(this.score)} points in Stunt Rider 3D (best combo ${formatPoints(this.best)}). Can you beat me?`,
      },
    });
  }
  panel() {
    const left = Math.max(0, this.limit - this.time);
    return { title: this.title, timer: formatTime(left).replace(/\.\d+$/, ''), urgent: left < 15, lines: [`Score ${formatPoints(this.score)}`, `Best ${formatPoints(this.game.profile.data.best.stunt)}`] };
  }
}

// ---------------------------------------------------------------------------
export class DailyChallenge extends StuntMode {
  get title() {
    return 'DAILY CHALLENGE';
  }
  start() {
    super.start();
    this.limit = 90;
    this.spot = dailySpot();
    this.place(this.game.world.spawns[this.spot]);
  }
  end() {
    this.game.tricks.flush();
    const prof = this.game.profile;
    const day = EOJ() ? EOJ().today() : '';
    const daily = prof.data.best.daily || (prof.data.best.daily = {});
    const prev = daily.day === day ? daily.score : 0;
    const newBest = this.score > prev;
    if (newBest) Object.assign(daily, { day, score: this.score });
    prof.data.best.bestCombo = Math.max(prof.data.best.bestCombo, this.best);
    prof.save();
    const where = this.game.world.spawns[this.spot].name;
    this.finish({
      title: newBest ? "NEW BEST TODAY!" : 'TIME UP',
      big: formatPoints(this.score),
      bigLabel: 'POINTS • ' + where.toUpperCase(),
      rows: [
        ['Best combo', formatPoints(this.best)],
        ['Tricks landed', this.tricksLanded],
        ['Your best today', formatPoints(Math.max(prev, this.score))],
      ],
      earned: this.earned,
      share: {
        game: GAME,
        board: 'stunt-rider:daily',
        daily: true,
        score: Math.round(this.score),
        format: (n) => formatPoints(n) + ' pts',
        shareText: `📅 Stunt Rider 3D daily challenge (${where}): ${formatPoints(this.score)} points. Same spot for everyone today – can you beat me?`,
        url: 'https://edhb15.github.io/EoJ-spel/games/stunt-rider-3d/index.html?daily',
      },
    });
  }
  panel() {
    const p = super.panel();
    const d = this.game.profile.data.best.daily;
    const today = EOJ() ? EOJ().today() : '';
    p.title = this.title;
    p.lines = [`Score ${formatPoints(this.score)}`, `Today's best ${formatPoints(d && d.day === today ? d.score : 0)}`];
    return p;
  }
}

// ---------------------------------------------------------------------------
export function buildCourse(world, c) {
  if (c.cps) return { start: c.start, cps: c.cps.map((p) => ({ x: p[0], z: p[1], yaw: p[2], w: c.width })) };
  let pts;
  if (c.path === 'mx') pts = world.mxTrack.concat([world.mxTrack[0]]);
  else pts = world.paths.find((p) => p.id === c.path).points;
  const cps = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const last = i === pts.length - 1;
    if ((acc >= c.spacing && i > 3) || last) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const p = last && c.path === 'mx' ? pts[i - 2] : pts[i];
      cps.push({ x: p[0], z: p[1], yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), w: c.width });
      acc = 0;
    }
  }
  const s0 = pts[0];
  const s1 = pts[3];
  const yaw = Math.atan2(s1[0] - s0[0], s1[1] - s0[1]);
  return { start: { x: s0[0] + Math.sin(yaw) * 2, z: s0[1] + Math.cos(yaw) * 2, yaw }, cps };
}

export function courseLength(course) {
  let d = 0;
  let px = course.start.x;
  let pz = course.start.z;
  for (const c of course.cps) {
    d += Math.hypot(c.x - px, c.z - pz);
    px = c.x;
    pz = c.z;
  }
  return d;
}

export function medalTimes(world, c) {
  const course = buildCourse(world, c);
  const gold = Math.round(courseLength(course) / c.goldSpeed);
  return { gold, silver: Math.round(gold * 1.15), bronze: Math.round(gold * 1.35) };
}

export class TimeTrial extends Mode {
  get title() {
    return 'TIME TRIAL';
  }
  start() {
    super.start();
    const def = COURSES.find((c) => c.id === this.opts.course) || COURSES[0];
    this.def = def;
    this.course = buildCourse(this.game.world, def);
    this.medals = medalTimes(this.game.world, def);
    this.cp = 0;
    this.splits = [];
    this.running = false;
    this.game.gates.setCourse(this.course.cps);
    this.game.gates.setActive(0);
    this.place(this.course.start);
    this.lastPos = { x: this.course.start.x, z: this.course.start.z };
    this.game.countdown(() => {
      this.running = true;
    });
  }
  update(dt) {
    if (!this.running || this.finished) return;
    this.time += dt;
    const P = this.game.bike.physics;
    const pos = P.mode === 'crash' ? P.cb.pos : P.root;
    const g = this.course.cps[this.cp];
    // crossing test against the gate line
    const fx = Math.sin(g.yaw);
    const fz = Math.cos(g.yaw);
    const a0 = (this.lastPos.x - g.x) * fx + (this.lastPos.z - g.z) * fz;
    const a1 = (pos.x - g.x) * fx + (pos.z - g.z) * fz;
    const side = Math.abs((pos.x - g.x) * -fz + (pos.z - g.z) * fx);
    if (a0 < 0 && a1 >= 0 && side < g.w / 2 + 3 && pos.y < 30 + this.game.world.terrain.height(g.x, g.z)) this.passCheckpoint();
    this.lastPos = { x: pos.x, z: pos.z };
  }
  passCheckpoint() {
    const g = this.game;
    this.splits.push(this.time);
    this.cp++;
    if (this.cp >= this.course.cps.length) return this.end();
    g.audio.play('checkpoint');
    const best = g.profile.data.best.timeTrial[this.def.id];
    g.hud.flash(`CHECKPOINT ${this.cp}/${this.course.cps.length}`, formatTime(this.time), 'cp');
    void best;
    g.gates.setActive(this.cp);
  }
  respawn() {
    const P = this.game.bike.physics;
    if (this.cp === 0) {
      P.reset(this.course.start.x, this.course.start.z, this.course.start.yaw);
    } else {
      const c = this.course.cps[this.cp - 1];
      P.reset(c.x + Math.sin(c.yaw) * 3, c.z + Math.cos(c.yaw) * 3, c.yaw);
    }
    this.lastPos = { x: P.root.x, z: P.root.z };
  }
  manualReset() {
    const P = this.game.bike.physics;
    if (P.mode === 'ground' && !this.game.world.wallAt(P.pos.x, P.pos.z, P.pos.y, 1.2)) P.reset(P.pos.x, P.pos.z, P.heading, P.pos.y + 0.3);
    else this.respawn();
    this.lastPos = { x: P.root.x, z: P.root.z };
  }
  end() {
    const g = this.game;
    const prof = g.profile;
    g.audio.play('finish');
    g.gates.clear();
    const t = this.time;
    const id = this.def.id;
    const prev = prof.data.best.timeTrial[id];
    const newBest = !prev || t < prev;
    if (newBest) prof.data.best.timeTrial[id] = t;
    const medal = t <= this.medals.gold ? 'gold' : t <= this.medals.silver ? 'silver' : t <= this.medals.bronze ? 'bronze' : null;
    const order = ['bronze', 'silver', 'gold'];
    const prevMedal = prof.data.best.medals[id] || null;
    let reward = 0;
    if (medal && order.indexOf(medal) > order.indexOf(prevMedal)) {
      reward = MEDAL_REWARD[medal] - (prevMedal ? MEDAL_REWARD[prevMedal] : 0);
      prof.data.best.medals[id] = medal;
    }
    prof.save();
    if (reward) prof.addPoints(reward);
    this.earned += reward;
    this.running = false;
    this.finish({
      title: medal ? medal.toUpperCase() + ' MEDAL!' : 'FINISHED',
      medal,
      big: formatTime(t),
      bigLabel: this.def.name.toUpperCase(),
      rows: [
        ['Best time', formatTime(Math.min(t, prev || t)) + (newBest ? '  NEW!' : '')],
        ['Gold / Silver / Bronze', `${formatTime(this.medals.gold)} / ${formatTime(this.medals.silver)} / ${formatTime(this.medals.bronze)}`],
        ['Medal reward', reward ? '+' + formatPoints(reward) : '-'],
      ],
      earned: this.earned,
      share: {
        game: GAME,
        board: 'stunt-rider:trial-' + id,
        score: Math.round(t * 100) / 100,
        lowerIsBetter: true,
        format: (n) => formatTime(n),
        shareText: `⏱ ${this.def.name} in ${formatTime(t)}${medal ? ' ' + { gold: '🥇', silver: '🥈', bronze: '🥉' }[medal] : ''} in Stunt Rider 3D. Can you go faster?`,
      },
    });
  }
  panel() {
    const best = this.game.profile.data.best.timeTrial[this.def.id];
    return {
      title: this.def.name.toUpperCase(),
      timer: formatTime(this.time),
      lines: [`Checkpoint ${Math.min(this.cp + 1, this.course.cps.length)} / ${this.course.cps.length}`, `Best ${best ? formatTime(best) : '--'}   Gold ${formatTime(this.medals.gold)}`],
    };
  }
  target() {
    const c = this.course.cps[this.cp];
    return c ? { x: c.x, z: c.z } : null;
  }
  dispose() {
    super.dispose();
    this.game.gates.clear();
  }
}

// ---------------------------------------------------------------------------
export class Challenge extends Mode {
  get title() {
    return 'CHALLENGE';
  }
  start() {
    super.start();
    this.def = CHALLENGES.find((c) => c.id === this.opts.challenge) || CHALLENGES[0];
    this.progress = 0;
    this.done = false;
    this.got = new Set();
    const t = this.game.tricks.out;
    this.on(t, 'landed', (d) => this.onLanded(d));
    this.on(t, 'wheelie', (d) => this.def.type === 'wheelie' && this.set(d.time));
    this.on(t, 'stoppie', (d) => this.def.type === 'stoppie' && this.set(d.time));
    this.on(t, 'trick', (e) => {
      if (this.def.type === 'loop' && e.kind === 'loop') this.complete();
      if (this.def.type === 'gap' && e.kind === 'gap' && e.name === this.def.gap) this.complete();
    });
    this.on(t, 'banked', (d) => {
      if (this.def.type === 'comboCount') this.set(d.count);
    });
    this.place(this.game.world.spawns[this.def.spawn]);
    this.game.countdown();
  }
  onBanked(d) {
    super.onBanked(d);
    if (this.def.type === 'score') this.progress = this.score;
    if (this.def.type === 'score' && this.score >= this.def.target) this.complete();
  }
  set(v) {
    this.progress = Math.max(this.progress, v);
    if (this.progress >= this.def.target) this.complete();
  }
  onLanded(d) {
    if (d.quality === 'none') return;
    const def = this.def;
    if (def.type === 'flip' && Math.sign(d.flips) === def.dir) this.set(Math.abs(d.flips));
    if (def.type === 'spin') this.set(d.spinDeg);
    if (def.type === 'air') this.set(d.airTime);
    if (def.type === 'vert' && d.vert) this.set(this.progress + 1);
    for (const st of d.styles) {
      if (def.type === 'style' && st.id === def.trick) this.complete();
      if (def.type === 'styles' && def.tricks.includes(st.id)) {
        this.got.add(st.id);
        this.progress = this.got.size;
        if (this.got.size >= def.tricks.length) this.complete();
      }
    }
  }
  update(dt) {
    if (this.game.frozen || this.finished) return;
    this.time += dt;
    const P = this.game.bike.physics;
    if (this.def.type === 'speed') this.set(P.speed * 3.6);
    if (this.def.type === 'wheelie' && P.wheelieTime > 0) this.progress = Math.max(this.progress, P.wheelieTime);
    if (this.def.type === 'stoppie' && P.stoppieTime > 0) this.progress = Math.max(this.progress, P.stoppieTime);
    if (this.def.type === 'wheelie' && P.wheelieTime >= this.def.target) this.complete();
    if (this.def.type === 'stoppie' && P.stoppieTime >= this.def.target) this.complete();
    if (this.def.type === 'air' && P.mode === 'air' && P.airTime > this.progress) this.progress = P.airTime;
    if (this.time >= this.def.time && !this.done) this.fail();
  }
  complete() {
    if (this.done || this.finished) return;
    this.done = true;
    const g = this.game;
    const prof = g.profile;
    const first = !prof.data.challenges[this.def.id];
    const reward = first ? this.def.reward : Math.round(this.def.reward * 0.2);
    prof.data.challenges[this.def.id] = true;
    prof.save();
    prof.addPoints(reward);
    this.earned += reward;
    g.audio.play('unlock');
    g.hud.flash('CHALLENGE COMPLETE!', this.def.name, 'good');
    setTimeout(() => {
      this.finish({
        title: 'CHALLENGE COMPLETE',
        big: this.def.name.toUpperCase(),
        bigLabel: formatTime(this.time),
        rows: [
          ['Reward', '+' + formatPoints(reward) + (first ? '' : ' (repeat)')],
          ['Challenges done', `${Object.keys(prof.data.challenges).length} / ${CHALLENGES.length}`],
        ],
        earned: this.earned,
        success: true,
      });
    }, 1800);
  }
  fail() {
    this.done = true;
    this.game.audio.play('lost');
    this.finish({
      title: 'CHALLENGE FAILED',
      big: this.def.name.toUpperCase(),
      bigLabel: "Time's up",
      rows: [['Goal', this.def.desc], ['Best attempt', this.progressText()]],
      earned: this.earned,
    });
  }
  progressText() {
    const d = this.def;
    const p = this.progress;
    switch (d.type) {
      case 'wheelie':
      case 'stoppie':
      case 'air':
        return `${p.toFixed(1)} / ${d.target}s`;
      case 'speed':
        return `${Math.round(p)} / ${d.target} km/h`;
      case 'score':
        return `${formatPoints(p)} / ${formatPoints(d.target)}`;
      case 'comboCount':
        return `${p} / ${d.target} tricks`;
      case 'vert':
        return `${p} / ${d.target}`;
      case 'flip':
        return `${p} / ${d.target}`;
      case 'spin':
        return `${p} / ${d.target}°`;
      case 'styles':
        return `${p} / ${d.tricks.length}`;
      default:
        return this.done ? 'Done' : 'Not yet';
    }
  }
  panel() {
    const left = Math.max(0, this.def.time - this.time);
    return { title: this.def.name.toUpperCase(), timer: formatTime(left).replace(/\.\d+$/, ''), urgent: left < 10, lines: [this.def.desc, 'Progress: ' + this.progressText()] };
  }
}

// ---------------------------------------------------------------------------
export class RampJump extends Mode {
  get title() {
    return 'RAMP JUMP';
  }
  start() {
    super.start();
    this.attempt = 0;
    this.results = [];
    this.state = 'ready';
    this.phys = this.game.bike.physics;
    this.game.bike.physics.impactBonus = 18;
    const ev = this.game.physicsEvents;
    this.on(ev, 'takeoff', (d) => {
      if (this.state === 'run' && d.solid && d.solid.tag === 'megaRamp') {
        this.state = 'flying';
        this.lipX = RAMP_JUMP.lipX;
      }
    });
    this.on(ev, 'land', (d) => {
      if (this.state === 'flying') this.landed(d.pos.x, d.quality, d.airTime);
    });
    this.on(ev, 'crash', () => {
      if (this.state === 'flying') this.landed(this.phys.cb.pos.x, 'crash', this.phys.airTime);
      else if (this.state === 'run') this.result(0, 'crash', 0);
    });
    this.nextAttempt();
  }
  nextAttempt() {
    this.attempt++;
    this.state = 'run';
    this.place({ x: RAMP_JUMP.startX, z: RAMP_JUMP.z, yaw: Math.PI / 2 });
    this.game.countdown();
    this.distance = 0;
  }
  landed(x, quality, air) {
    const dist = Math.max(0, x - RAMP_JUMP.lipX);
    this.result(dist, quality, air);
  }
  result(dist, quality, air) {
    if (this.state === 'done' || this.state === 'wait') return;
    this.state = 'wait';
    const bonus = quality === 'perfect' ? 1.5 : quality === 'good' ? 1.2 : quality === 'crash' ? 0.3 : 1;
    const pts = Math.round(dist * 30 * bonus);
    this.results.push({ dist, quality, pts, air });
    this.score += pts;
    this.earned += pts;
    this.game.profile.addPoints(pts);
    const g = this.game;
    g.hud.flash(dist.toFixed(1) + ' m', quality === 'crash' ? 'Crashed - distance x0.3' : quality.toUpperCase() + ' LANDING  +' + formatPoints(pts), quality === 'crash' ? 'bad' : 'good');
    this.waitT = 3.2;
  }
  update(dt) {
    const P = this.phys;
    if (this.state === 'flying' && P.mode !== 'crash') {
      const x = P.mode === 'air' ? P.com.x : P.root.x;
      this.distance = Math.max(0, x - RAMP_JUMP.lipX);
      this.game.hud.setDistance(this.distance.toFixed(1) + ' m');
    } else if (this.state !== 'wait') this.game.hud.setDistance(null);
    if (this.state === 'run' && P.mode === 'ground' && P.root.x > RAMP_JUMP.lipX + 5) this.result(0, 'missed', 0);
    if (this.state === 'wait') {
      this.waitT -= dt;
      if (this.waitT <= 0) {
        this.game.hud.setDistance(null);
        if (this.attempt >= 3) this.end();
        else this.nextAttempt();
      }
    }
  }
  respawn() {
    if (this.state === 'wait' || this.state === 'done') return;
    this.phys.respawnSafe();
  }
  manualReset() {
    if (this.state === 'run') this.place({ x: RAMP_JUMP.startX, z: RAMP_JUMP.z, yaw: Math.PI / 2 });
    else super.manualReset();
  }
  end() {
    this.state = 'done';
    const prof = this.game.profile;
    const best = Math.max(...this.results.map((r) => r.dist));
    const prev = prof.data.best.rampJump;
    const newBest = best > prev;
    if (newBest) prof.data.best.rampJump = best;
    prof.data.best.rampJumpScore = Math.max(prof.data.best.rampJumpScore, this.score);
    prof.save();
    this.finish({
      title: newBest ? 'NEW RECORD!' : 'RAMP JUMP COMPLETE',
      big: best.toFixed(1) + ' m',
      bigLabel: 'BEST DISTANCE',
      rows: this.results.map((r, i) => [`Attempt ${i + 1}`, `${r.dist.toFixed(1)} m  (${r.quality})  +${formatPoints(r.pts)}`]).concat([['Record', Math.max(prev, best).toFixed(1) + ' m']]),
      earned: this.earned,
      share: {
        game: GAME,
        board: 'stunt-rider:ramp',
        score: Math.round(best * 10) / 10,
        format: (n) => n.toFixed(1) + ' m',
        shareText: `🚀 I flew ${best.toFixed(1)} m off the Mega Ramp in Stunt Rider 3D. Can you fly further?`,
      },
    });
  }
  panel() {
    const rec = this.game.profile.data.best.rampJump;
    return { title: this.title, timer: `${Math.min(this.attempt, 3)} / 3`, lines: [this.state === 'run' ? 'Full throttle! Hit the Mega Ramp.' : this.state === 'flying' ? 'Flying...' : 'Next attempt...', `Record ${rec.toFixed(1)} m   Score ${formatPoints(this.score)}`] };
  }
  dispose() {
    super.dispose();
    this.game.bike.physics.impactBonus = 0;
    this.game.hud.setDistance(null);
  }
}

export const MODES = { free: FreeRide, daily: DailyChallenge, stunt: StuntMode, trial: TimeTrial, challenge: Challenge, ramp: RampJump };
export { TAU };

// Chicago Bois – wanted level, police AI (foot officers, cruisers, helicopter) and arrests.
'use strict';
(function (CB) {
  const M = CB.M, C = CB.C, hex = M.hex;

  const FOOT_TARGET = [3, 4, 6, 8, 10, 12];
  const CAR_TARGET = [2, 3, 4, 5, 6, 7];
  const RUN = [5.0, 5.4, 5.9, 6.4, 7.0, 7.5];

  // ------------------------------------------------------------------ foot officer
  class Cop extends CB.Ped {
    constructor() {
      super(CB.copLook());
      this.speed = 1.4;
      this.state = 'patrol';
      this.taserT = M.rand(1, 3);
      this.seeT = Math.random() * 0.2;
      this.sees = false;
      this.wx = 0; this.wz = 0; this.wanderT = 0;
      this.checked = null;
      this.stuckT = 0;
      this.isCop = true;
    }
  }

  const Police = CB.Police = {
    wanted: 0, mode: 'calm', lastX: 0, lastZ: 0, lastSeen: 0, searchT: 0, alertT: 0,
    alertX: 0, alertZ: 0, reports: [], foot: [], cars: [], heli: null,
    bust: 0, recog: 0, anySees: false, popT: 0, time: 0,
    get level() { return Math.min(5, Math.ceil(this.wanted / 100 - 1e-6)); },
  };

  Police.reset = function () {
    for (const c of this.foot) c.h.dispose();
    for (const c of this.cars) c.dispose();
    if (this.heli) this.heli.rig.dispose();
    Object.assign(this, { wanted: 0, mode: 'calm', reports: [], foot: [], cars: [], heli: null, bust: 0, recog: 0, anySees: false, popT: 0, time: 0, searchT: 0, alertT: 0 });
    this.flow = null;
    if (this.spot) this.spot.intensity = 0;
  };

  Police.init = function (scene) {
    this.scene = scene;
    // helicopter spotlight
    this.spot = new BABYLON.SpotLight('heliSpot', new BABYLON.Vector3(0, 40, 0), new BABYLON.Vector3(0, -1, 0), 0.45, 8, scene);
    this.spot.diffuse = new BABYLON.Color3(1, 1, 0.9);
    this.spot.specular = new BABYLON.Color3(0.3, 0.3, 0.3);
    this.spot.intensity = 0;
    this.spot.range = 120;
    this.tasers = [];
  };

  // ------------------------------------------------------------------ spawning
  Police.spawnFoot = function (pl, minD, maxD) {
    const c = new Cop();
    if (!CB.Peds.place(c, pl.x, pl.z, minD, maxD, pl.viewYaw)) { c.h.dispose(); return null; }
    this.foot.push(c);
    return c;
  };
  Police.spawnCar = function (pl, minD, maxD) {
    const car = new CB.Car('police');
    car.setDriver(true);
    car.isPolice = true;
    if (!CB.Traffic.placeTraffic(car, pl.x, pl.z, minD, maxD, pl.viewYaw)) { car.dispose(); return null; }
    car.officers = 2; car.deployT = 0; car.stuckT = 0; car.revT = 0; car.seeT = Math.random() * 0.2;
    car.onCrash = (imp) => { if (imp > 8) CB.Audio.play('crash', Math.min(1, imp / 20), car.x, car.z, 70); };
    this.cars.push(car);
    return car;
  };

  function population(dt, pl) {
    Police.popT -= dt;
    if (Police.popT > 0) return;
    Police.popT = 0.8;
    const lvl = Police.level, chasing = Police.mode === 'chase' || Police.mode === 'search';
    const minD = chasing ? 65 : 90, maxD = chasing ? 120 : 170;
    if (Police.foot.length < FOOT_TARGET[lvl]) Police.spawnFoot(pl, minD, maxD);
    if (Police.cars.length < CAR_TARGET[lvl]) Police.spawnCar(pl, minD + 10, maxD + 20);
    // despawn / recycle far units
    for (let i = Police.foot.length - 1; i >= 0; i--) {
      const c = Police.foot[i];
      const d = M.dist(c.x, c.z, pl.x, pl.z);
      if ((d > 230 && !c.sees) || (Police.foot.length > FOOT_TARGET[lvl] + 3 && d > 150)) {
        if (chasing && Police.foot.length <= FOOT_TARGET[lvl] + 3) { CB.Peds.place(c, pl.x, pl.z, minD, maxD, pl.viewYaw); c.state = 'patrol'; }
        else { c.h.dispose(); Police.foot.splice(i, 1); }
      }
    }
    for (let i = Police.cars.length - 1; i >= 0; i--) {
      const c = Police.cars[i];
      if (c === pl.car) continue;
      const d = M.dist(c.x, c.z, pl.x, pl.z);
      if (d > 260 || (c.mode === 'abandoned' && d > 150) || (Police.cars.length > CAR_TARGET[lvl] + 2 && d > 170)) {
        if (chasing && c.mode !== 'abandoned' && Police.cars.length <= CAR_TARGET[lvl] + 2) {
          CB.Traffic.placeTraffic(c, pl.x, pl.z, minD, maxD, pl.viewYaw); c.health = 100;
        } else { c.dispose(); Police.cars.splice(i, 1); }
      }
    }
  }

  // ------------------------------------------------------------------ detection
  function canSee(ux, uz, uyaw, range, fov, pl, night) {
    if (pl.hidden || pl.dead) return false;
    const dx = pl.x - ux, dz = pl.z - uz;
    const d = Math.hypot(dx, dz);
    let r = range * (1 - 0.3 * night);
    if (pl.inCover) r *= 0.45;
    if (pl.disguiseT > 0 && Police.mode !== 'chase') r *= 0.6;
    if (pl.inCar) r *= 1.15;
    if (d > r) return false;
    if (d > 4.5 && Math.abs(M.wrap(Math.atan2(dx, dz) - uyaw)) > fov / 2) return false;
    return CB.City.los(ux, uz, pl.x, pl.z);
  }

  // ------------------------------------------------------------------ flow field (BFS on nav grid)
  function computeFlow(tx, tz) {
    const NAV = CB.City.nav, n = NAV.w * NAV.h;
    let f = Police.flow;
    if (!f) { f = Police.flow = { dist: new Uint16Array(n), q: new Int32Array(n), tx: 0, tz: 0, t: 0, cell: -1 }; }
    let start = CB.City.cell(tx, tz);
    if (start < 0) return;
    if (!NAV.walk[start]) {
      // nearest walkable cell
      let best = -1, bd = 1e9;
      const ci = start % NAV.w, cj = (start / NAV.w) | 0;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= NAV.w || j >= NAV.h) continue;
        const k = j * NAV.w + i;
        if (NAV.walk[k] && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = k; }
      }
      if (best < 0) return;
      start = best;
    }
    f.cell = start; f.tx = tx; f.tz = tz;
    const dist = f.dist, q = f.q, W = NAV.w, walk = NAV.walk;
    dist.fill(65535);
    let head = 0, tail = 0;
    dist[start] = 0; q[tail++] = start;
    while (head < tail) {
      const c = q[head++], d = dist[c] + 1;
      if (d > 200) continue;
      const i = c % W;
      if (i > 0 && walk[c - 1] && dist[c - 1] > d) { dist[c - 1] = d; q[tail++] = c - 1; }
      if (i < W - 1 && walk[c + 1] && dist[c + 1] > d) { dist[c + 1] = d; q[tail++] = c + 1; }
      if (c >= W && walk[c - W] && dist[c - W] > d) { dist[c - W] = d; q[tail++] = c - W; }
      if (c + W < n && walk[c + W] && dist[c + W] > d) { dist[c + W] = d; q[tail++] = c + W; }
    }
  }
  // Direction (unit vector) to walk from (x,z) toward the flow target.
  function flowDir(x, z) {
    const f = Police.flow, NAV = CB.City.nav;
    if (!f) return null;
    let c = CB.City.cell(x, z);
    if (c < 0) return null;
    const W = NAV.w;
    // follow two greedy steps for smoother paths
    let cur = c;
    for (let step = 0; step < 2; step++) {
      let best = cur, bd = f.dist[cur];
      const i = cur % W;
      const nb = [cur - 1, cur + 1, cur - W, cur + W, cur - W - 1, cur - W + 1, cur + W - 1, cur + W + 1];
      for (let k = 0; k < 8; k++) {
        const nc = nb[k];
        if (nc < 0 || nc >= f.dist.length) continue;
        const ni = nc % W;
        if (Math.abs(ni - i) > 1) continue;
        const dv = f.dist[nc] + (k >= 4 ? 0.4 : 0);
        if (dv < bd) { bd = dv; best = nc; }
      }
      if (best === cur) break;
      cur = best;
    }
    if (cur === c) {
      if (f.dist[c] === 65535) return null;
      const dx = f.tx - x, dz = f.tz - z, d = Math.hypot(dx, dz) || 1;
      return { x: dx / d, z: dz / d };
    }
    const tx = NAV.x0 + ((cur % W) + 0.5) * NAV.cs, tz = NAV.z0 + (((cur / W) | 0) + 0.5) * NAV.cs;
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  }

  // ------------------------------------------------------------------ road route for cruisers
  function nodeTowards(car, tx, tz) {
    // score function used by traffic chooser: distance from next node to target
    return (i, j, d) => {
      const ni = i + CB.DIRS[d][0], nj = j + CB.DIRS[d][1];
      const n = CB.nodePos(ni, nj);
      return M.dist(n.x, n.z, tx, tz) + Math.random() * 20;
    };
  }
  function nearestNode(x, z) {
    const i = M.clamp(Math.round((x + C.HALF) / C.P), 0, C.N), j = M.clamp(Math.round((z + C.HALF) / C.P), 0, C.N);
    return { i, j };
  }
  // Next node position on the grid path toward a target (greedy over the grid).
  function nextRoutePoint(car, tx, tz) {
    const n = nearestNode(car.x, car.z);
    const np = CB.nodePos(n.i, n.j);
    const t = nearestNode(tx, tz);
    // if we're not near the node yet, go to it
    if (M.dist(car.x, car.z, np.x, np.z) > 9 && !(n.i === t.i && n.j === t.j)) {
      // but don't drive backwards to it if it is behind us – pick the node ahead along our axis
      const fx = Math.sin(car.h), fz = Math.cos(car.h);
      if ((np.x - car.x) * fx + (np.z - car.z) * fz > -4) return np;
    }
    if (n.i === t.i && n.j === t.j) return { x: tx, z: tz, final: true };
    // move one step along the axis with the larger difference
    const di = t.i - n.i, dj = t.j - n.j;
    let ni = n.i, nj = n.j;
    if (Math.abs(di) > Math.abs(dj)) ni += Math.sign(di); else nj += Math.sign(dj);
    return CB.nodePos(ni, nj);
  }

  // ------------------------------------------------------------------ crimes & reports
  // sev: heat percent added. Returns whether police saw it directly.
  Police.crime = function (x, z, opts, game) {
    opts = opts || {};
    const pl = game.player;
    // any officer witnessing?
    let seen = false;
    for (const c of this.foot) if (c.mode !== 'fallen' && c.mode !== 'knock' && canSee(c.x, c.z, c.yaw, 45, 2.6, pl, game.night)) { seen = true; break; }
    if (!seen) for (const c of this.cars) if (c.occupied && canSee(c.x, c.z, c.h, 50, 2.6, pl, game.night)) { seen = true; break; }
    if (this.heli && this.heli.active && M.dist(this.heli.x, this.heli.z, x, z) < 60) seen = true;
    if (seen) { this.startChase(pl, game); return true; }
    if (this.mode === 'chase' || this.mode === 'search') {
      this.lastX = x; this.lastZ = z; this.lastSeen = this.time;
      if (this.mode === 'search') { this.mode = 'chase'; }
      return false;
    }
    const caller = CB.Peds.scare(x, z, 30, opts.cower ? 'cower' : 'flee');
    const delay = opts.alarm ? M.rand(1, 2.5) : caller ? M.rand(3, 5) : M.rand(7, 11);
    this.reports.push({ x, z, at: this.time + delay });
    return false;
  };

  Police.startChase = function (pl, game) {
    const was = this.mode;
    this.mode = 'chase';
    this.lastX = pl.x; this.lastZ = pl.z; this.lastSeen = this.time;
    this.recog = 0;
    if (was !== 'chase') {
      if (was !== 'search') CB.HUD.notify('🚨 COPS ARE ON YOU!', 'Break line of sight to lose them.', 'red');
      CB.Audio.play('beepHi', 0.6);
    }
  };

  // ------------------------------------------------------------------ helicopter
  function makeHeli() {
    const P = CB.Pools;
    const r = new CB.Rig();
    const navy = hex(0x1f2f5c);
    r.add(P.shiny, { o: [0, 0, 0], s: [2.2, 2.0, 4.2], c: navy });
    r.add(P.box, { o: [0, 0.25, 1.6], s: [1.9, 1.2, 1.4], c: hex(0x7fb3d5) });
    r.add(P.box, { o: [0, 0.4, -4.2], s: [0.4, 0.5, 4.8], c: navy });
    r.add(P.box, { o: [0, 1.1, -6.4], s: [0.15, 1.6, 0.9], c: hex(0xffffff) });
    r.add(P.box, { o: [0, -1.25, 0.2], s: [0.12, 0.12, 4], c: hex(0x333333), j: [0.9, 0, 0] });
    r.add(P.box, { o: [0, -1.25, 0.2], s: [0.12, 0.12, 4], c: hex(0x333333), j: [-0.9, 0, 0] });
    const rotor = r.add(P.box, { j: [0, 1.25, 0], s: [11, 0.08, 0.35], c: hex(0x222222) });
    const rotor2 = r.add(P.box, { j: [0, 1.25, 0], s: [0.35, 0.08, 11], c: hex(0x222222) });
    const tail = r.add(P.box, { j: [0.25, 1.1, -6.4], s: [0.05, 2.2, 0.2], c: hex(0x222222) });
    r.add(P.gR, { o: [-1.12, 0, -0.5], s: [0.1, 0.2, 0.2] });
    r.add(P.gG, { o: [1.12, 0, -0.5], s: [0.1, 0.2, 0.2] });
    r.add(P.gW, { o: [0, -1.0, 1.8], s: [0.6, 0.3, 0.3] });
    return { rig: r, rotor, rotor2, tail, x: 0, y: 60, z: 0, yaw: 0, vx: 0, vz: 0, active: true, airT: 0, refuelT: 0, sees: false, poolSlot: P.headPool.alloc() };
  }

  function updateHeli(dt, pl, game) {
    const lvl = Police.level, chasing = Police.mode === 'chase' || Police.mode === 'search';
    if (lvl >= 5 && chasing && !Police.heli) {
      const h = Police.heli = makeHeli();
      h.x = pl.x - 200; h.z = pl.z - 120; h.y = 55;
      CB.HUD.notify('🚁 POLICE CHOPPER INBOUND', 'Hide in a dumpster or outrun it.', 'red');
    }
    const h = Police.heli;
    if (!h) return;
    let tx, tz, ty = 42;
    if (!chasing) h.leaving = true;
    if (h.active && !h.leaving) {
      h.airT += dt;
      if (h.airT > 75) {
        h.active = false; h.refuelT = 25; h.airT = 0;
        CB.HUD.notify('🚁 Chopper is refuelling!', 'Now is your chance to slip away.', 'yellow');
      }
      if (h.sees) { tx = pl.x; tz = pl.z; } else {
        const a = Police.time * 0.4;
        tx = Police.lastX + Math.cos(a) * 25; tz = Police.lastZ + Math.sin(a) * 25;
      }
    } else {
      tx = h.x - 300; tz = h.z; ty = 70;
      if (!h.active) { h.refuelT -= dt; if (h.refuelT <= 0 && chasing) { h.active = true; h.x = pl.x - 220; h.z = pl.z; } }
      if (h.leaving && M.dist(h.x, h.z, pl.x, pl.z) > 350) { h.rig.dispose(); CB.Pools.headPool.release(h.poolSlot); Police.heli = null; Police.spot.intensity = 0; CB.Audio.loop('heli', 0); return; }
    }
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
    const maxV = 18;
    const want = Math.min(maxV, d * 0.6);
    const ax = (d > 0.1 ? dx / d * want : 0) - h.vx, az = (d > 0.1 ? dz / d * want : 0) - h.vz;
    h.vx += M.clamp(ax, -6, 6) * dt; h.vz += M.clamp(az, -6, 6) * dt;
    h.x += h.vx * dt; h.z += h.vz * dt; h.y += (ty - h.y) * dt * 0.5;
    const sp = Math.hypot(h.vx, h.vz);
    if (sp > 1) h.yaw = M.turn(h.yaw, Math.atan2(h.vx, h.vz), dt * 1.5);
    h.rotor.yaw += dt * 30; h.rotor2.yaw = h.rotor.yaw; h.tail.pitch += dt * 40;
    h.rig.x = h.x; h.rig.y = h.y; h.rig.z = h.z; h.rig.yaw = h.yaw; h.rig.pitch = Math.min(0.25, sp * 0.012);
    h.rig.update();
    // detection from above
    const hd = M.dist(h.x, h.z, pl.x, pl.z);
    h.sees = h.active && !h.leaving && !pl.hidden && hd < (pl.inCover ? 25 : 55);
    // spotlight
    const s = Police.spot;
    if (h.active && !h.leaving) {
      const lx = h.sees ? pl.x : h.x + Math.sin(Police.time) * 8, lz = h.sees ? pl.z : h.z + Math.cos(Police.time * 1.3) * 8;
      s.position.set(h.x, h.y - 1.5, h.z);
      s.direction.set(lx - h.x, -h.y, lz - h.z).normalize();
      s.intensity = 0.6 + game.night * 2.2;
      CB.placeSlot(CB.Pools.headPool, h.poolSlot, lx, C.CURB + 0.06, lz, 9, 1, 9);
    } else { s.intensity = 0; CB.Pools.headPool.hide(h.poolSlot); }
    const a = CB.Audio.spatial(h.x, h.z, 260);
    CB.Audio.loop('heli', a ? a.v * 0.5 : 0, a ? a.pan : 0);
  }

  // ------------------------------------------------------------------ taser bolts
  function fireTaser(cop, pl, game) {
    const P = CB.Pools;
    const hit = Math.random() < (pl.sprinting ? 0.45 : 0.65);
    const slot = P.gB.alloc();
    const sx = cop.x, sy = cop.y + 1.3, sz = cop.z;
    const ex = pl.x + (hit ? 0 : M.rand(-1.5, 1.5)), ey = pl.y + 1.1, ez = pl.z + (hit ? 0 : M.rand(-1.5, 1.5));
    const dx = ex - sx, dy = ey - sy, dz = ez - sz, d = Math.hypot(dx, dy, dz);
    CB.placeSlot(P.gB, slot, (sx + ex) / 2, (sy + ey) / 2, (sz + ez) / 2, 0.05, 0.05, d, Math.atan2(dx, dz), Math.atan2(-dy, Math.hypot(dx, dz)));
    Police.tasers.push({ slot, t: 0.15 });
    CB.Audio.play('zap', 0.9, cop.x, cop.z, 50);
    if (hit) game.playerHit(14, 'taser', cop.x, cop.z);
  }

  // ------------------------------------------------------------------ main update
  Police.update = function (dt, game) {
    const pl = game.player;
    this.time += dt;
    const lvl = this.level;
    const chasing = this.mode === 'chase' || this.mode === 'search';
    population(dt, pl);

    // reports reaching dispatch
    for (let i = this.reports.length - 1; i >= 0; i--) {
      const r = this.reports[i];
      if (this.time < r.at) continue;
      this.reports.splice(i, 1);
      if (chasing) { this.lastX = r.x; this.lastZ = r.z; this.lastSeen = this.time; this.mode = 'chase'; }
      else {
        this.mode = 'alert'; this.alertX = r.x; this.alertZ = r.z; this.alertT = 28;
        CB.HUD.notify('📻 Crime reported', 'Police are responding to the area.', 'yellow');
        // dispatch the closest units
        const units = this.foot.slice().sort((a, b) => M.dist2(a.x, a.z, r.x, r.z) - M.dist2(b.x, b.z, r.x, r.z));
        units.slice(0, 2 + lvl).forEach((u) => { u.state = 'investigate'; });
        const cars = this.cars.slice().sort((a, b) => M.dist2(a.x, a.z, r.x, r.z) - M.dist2(b.x, b.z, r.x, r.z));
        cars.slice(0, 1 + Math.ceil(lvl / 2)).forEach((c) => { c.assigned = true; });
      }
    }

    // ---- detection
    let sees = false, seeCount = 0, closest = 1e9;
    const range = 34 + lvl * 6;
    for (const c of this.foot) {
      c.seeT -= dt;
      if (c.seeT <= 0) {
        c.seeT = 0.18;
        c.sees = c.mode !== 'fallen' && c.mode !== 'knock' && c.mode !== 'held' && canSee(c.x, c.z, c.yaw, range, 2.4, pl, game.night);
      }
      if (c.sees) { sees = true; seeCount++; closest = Math.min(closest, M.dist(c.x, c.z, pl.x, pl.z)); }
    }
    for (const c of this.cars) {
      if (!c.occupied) { c.sees = false; continue; }
      c.seeT -= dt;
      if (c.seeT <= 0) { c.seeT = 0.2; c.sees = canSee(c.x, c.z, c.h, range + 10, 2.6, pl, game.night); }
      if (c.sees) { sees = true; seeCount++; closest = Math.min(closest, M.dist(c.x, c.z, pl.x, pl.z)); }
    }
    if (this.heli && this.heli.sees) { sees = true; seeCount++; }
    this.anySees = sees;

    // ---- mode transitions
    if (chasing) {
      if (sees) { this.lastX = pl.x; this.lastZ = pl.z; this.lastSeen = this.time; if (this.mode === 'search') { this.mode = 'chase'; CB.HUD.notify('👀 Spotted again!', '', 'red'); } }
      if (this.mode === 'chase' && this.time - this.lastSeen > 3 + lvl * 0.7) {
        this.mode = 'search'; this.searchT = 10 + lvl * 4;
        CB.HUD.notify('🔦 Police lost sight of you', 'Stay hidden until the search ends.', 'yellow');
        for (const c of this.foot) { c.wanderT = 0; c.checked = null; }
      }
      if (this.mode === 'search') {
        this.searchT -= dt;
        if (this.searchT <= 0) { this.mode = 'calm'; this.recog = 0; game.onEscape(); }
      }
    } else {
      if (sees && game.wanted > 0) {
        if (this.time - game.crimeT < 2 || lvl >= 2) this.startChase(pl, game);
        else {
          // a drawn gun gets you noticed faster
          this.recog += dt * seeCount * (closest < 12 ? 0.9 : 0.45) * (pl.disguiseT > 0 ? 0.5 : 1) * (pl.weapon === 'pistol' ? 1.5 : 1);
          if (this.recog >= 1) this.startChase(pl, game);
        }
      } else this.recog = Math.max(0, this.recog - dt * 0.25);
      if (this.mode === 'alert') { this.alertT -= dt; if (this.alertT <= 0) { this.mode = 'calm'; for (const c of this.foot) c.state = 'patrol'; for (const c of this.cars) c.assigned = false; } }
    }
    const nowChasing = this.mode === 'chase' || this.mode === 'search';

    // ---- flow field toward the point officers care about
    if (nowChasing || this.mode === 'alert') {
      const tx = this.mode === 'alert' ? this.alertX : this.lastX, tz = this.mode === 'alert' ? this.alertZ : this.lastZ;
      const f = this.flow;
      this.flowT = (this.flowT || 0) - dt;
      if (!f || (this.flowT <= 0 && M.dist(f.tx, f.tz, tx, tz) > 3)) { computeFlow(tx, tz); this.flowT = 0.4; }
    }

    // ---- foot officers
    const run = RUN[lvl];
    let near = 0;
    for (const c of this.foot) {
      if (c.mode === 'knock' || c.mode === 'fallen' || c.mode === 'held') {
        c.update(dt);
        if (c.mode === 'flee') { c.mode = 'walk'; c.reroute(); }
        continue;
      }
      const dPl = M.dist(c.x, c.z, pl.x, pl.z);
      let goal = null, spd = 0, pose = 'walk';
      if (nowChasing) {
        if (c.sees && !pl.hidden) {
          // run straight at the player (lead a moving car a bit)
          goal = { x: pl.x + (pl.vx || 0) * 0.3, z: pl.z + (pl.vz || 0) * 0.3 };
          spd = dPl < 2.5 ? Math.min(run, dPl * 2) : run;
          if (lvl >= 4 && dPl > 3 && dPl < 14 && !pl.inCar) {
            c.taserT -= dt;
            if (c.taserT <= 0) { c.taserT = M.rand(2.2, 3.8); fireTaser(c, pl, game); c.poseT = 0.4; }
          }
        } else if (this.mode === 'search' && M.dist(c.x, c.z, this.lastX, this.lastZ) < 14) {
          // poke around the last known position
          c.wanderT -= dt;
          if (c.wanderT <= 0 || M.dist(c.x, c.z, c.wx, c.wz) < 1.2) {
            for (let k = 0; k < 8; k++) {
              const a = Math.random() * 6.28, r = M.rand(5, 30);
              const wx = this.lastX + Math.cos(a) * r, wz = this.lastZ + Math.sin(a) * r;
              if (CB.City.walkable(wx, wz)) { c.wx = wx; c.wz = wz; break; }
            }
            c.wanderT = M.rand(3, 6);
          }
          goal = { x: c.wx, z: c.wz }; spd = run * 0.55;
        } else {
          const fd = flowDir(c.x, c.z);
          if (fd) goal = { x: c.x + fd.x * 3, z: c.z + fd.z * 3 };
          spd = this.mode === 'search' ? run * 0.8 : run;
        }
        // check dumpsters while searching
        if (this.mode === 'search' && pl.hidden && pl.hideSpot && c.checked !== pl.hideSpot && M.dist(c.x, c.z, pl.hideSpot.x, pl.hideSpot.z) < 3) {
          c.checked = pl.hideSpot;
          if (Math.random() < 0.3) { game.foundHiding(c); }
          else CB.HUD.notify('😅 A cop checked your dumpster…', 'and walked on.', 'yellow');
        }
      } else if (this.mode === 'alert' && c.state === 'investigate') {
        const fd = flowDir(c.x, c.z);
        if (fd && M.dist(c.x, c.z, this.alertX, this.alertZ) > 4) { goal = { x: c.x + fd.x * 3, z: c.z + fd.z * 3 }; spd = 3.2; }
      }
      if (c.poseT > 0) { c.poseT -= dt; pose = 'taser'; }
      if (goal) {
        const dx = goal.x - c.x, dz = goal.z - c.z, d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const m = Math.min(d, spd * dt);
          c.x += dx / d * m; c.z += dz / d * m;
          c.yaw = M.turn(c.yaw, Math.atan2(dx, dz), dt * 9);
        }
        const hit = CB.City.resolve(c, 0.35, c.y, 0.3);
        if (hit && spd > 0) {
          c.stuckT += dt;
          if (c.stuckT > 1.5) { c.wanderT = 0; c.stuckT = 0; }
        } else c.stuckT = 0;
        c.y = CB.City.groundY(c.x, c.z);
        if (c.sees && dPl < 6) c.yaw = M.turn(c.yaw, Math.atan2(pl.x - c.x, pl.z - c.z), dt * 10);
        const lean = c.h.animate(dt, spd, pose);
        c.h.place(c.x, c.y, c.z, c.yaw, 0, lean);
      } else {
        c.update(dt);
      }
      // arrest range (on foot, or pulled out of a stopped car)
      if (nowChasing && !pl.hidden && ((!pl.inCar && dPl < 1.7) || (pl.inCar && pl.car && pl.car.speed < 2.5 && dPl < 3.2))) near++;
    }

    // ---- cruisers
    for (const car of this.cars) {
      if (car === pl.car || car.mode === 'abandoned') continue;
      if (car.mode === 'parked') continue;
      const dPl = M.dist(car.x, car.z, pl.x, pl.z);
      car.siren = nowChasing || (this.mode === 'alert' && car.assigned);
      if (nowChasing && dPl < 260) {
        // switch to physics driving
        if (car.mode === 'traffic') { car.mode = 'ai'; car.vf = car.v; }
        let tx, tz, aggressive = lvl >= 4 && pl.inCar;
        if (car.sees && dPl < 80) {
          tx = pl.x + (pl.vx || 0) * (aggressive ? 0.6 : 0.3); tz = pl.z + (pl.vz || 0) * (aggressive ? 0.6 : 0.3);
        } else {
          const tgt = this.mode === 'search' && M.dist(car.x, car.z, this.lastX, this.lastZ) < 30
            ? { x: this.lastX + Math.cos(this.time * 0.3 + car.x) * 40, z: this.lastZ + Math.sin(this.time * 0.3 + car.z) * 40 }
            : { x: this.lastX, z: this.lastZ };
          const np = nextRoutePoint(car, tgt.x, tgt.z);
          tx = np.x; tz = np.z;
        }
        const dx = tx - car.x, dz = tz - car.z, dist = Math.hypot(dx, dz);
        const ang = M.wrap(Math.atan2(dx, dz) - car.h);
        let thr = 1, steer = M.clamp(ang * 2.2, -1, 1), hand = false;
        const maxV = car.T.maxV * (0.72 + lvl * 0.06);
        const vf = car.vf;
        if (Math.abs(ang) > 1.4 && vf > 8) { thr = -0.6; }
        if (vf > maxV) thr = 0;
        // close to an on-foot player: stop and let officers out
        if (!pl.inCar && car.sees && dist < 14) { thr = vf > 1 ? -1 : 0; }
        if (pl.inCar && !aggressive && car.sees && dist < 9) thr = Math.min(thr, 0.2);
        // reverse out when stuck
        if (car.revT > 0) { car.revT -= dt; thr = -1; steer = -steer; }
        else if (thr > 0.5 && Math.abs(vf) < 1.2) { car.stuckT += dt; if (car.stuckT > 1.2) { car.revT = 1.1; car.stuckT = 0; } }
        else car.stuckT = 0;
        car.drive(dt, thr, steer, hand);
        car.brakeLight = thr < 0;
        // deploy officers
        car.deployT -= dt;
        if (!pl.inCar && dist < 25 && Math.abs(car.vf) < 3 && car.officers > 0 && car.deployT <= 0 && lvl >= 2) {
          const d = car.doorPos();
          const c = new Cop();
          c.x = d.x; c.z = d.z; c.y = CB.City.groundY(d.x, d.z); c.yaw = car.h; c.sees = true; c.reroute();
          this.foot.push(c);
          car.officers--; car.deployT = 3.5;
          CB.Audio.play('door', 0.8, d.x, d.z, 40);
          if (car.officers <= 0) { car.mode = 'abandoned'; car.setDriver(false); car.siren = true; car.vx = car.vz = 0; }
        }
        if (pl.inCar && pl.car && dist < 5 && pl.car.speed < 2.5) near++;
      } else if (car.mode === 'ai') {
        // chase over: go back to patrolling
        CB.rejoinTraffic(car);
        car.assigned = false;
      } else if (car.mode === 'traffic') {
        if (this.mode === 'alert' && car.assigned) car.steerTo = nodeTowards(car, this.alertX, this.alertZ);
        else car.steerTo = null;
        CB.trafficStep(car, dt, game.time, game.obstacles, car.siren);
      }
    }

    // render every cruiser (including one the player stole)
    for (const car of this.cars) {
      if (car.mode === 'abandoned' && car !== pl.car && car.speed > 0.05) car.drive(dt, 0, 0, true);
      if (M.dist2(car.x, car.z, pl.x, pl.z) < 320 * 320 || car === pl.car) car.update(dt, game.night, this.time);
    }

    // ---- arrest meter
    if (near > 0 && !pl.dead) {
      if (this.bust === 0) CB.HUD.notify('🚔 They\'re grabbing you!', 'Move away or shove them (click / F).', 'red');
      this.bust += dt * (0.32 + 0.14 * near + 0.03 * lvl);
    } else this.bust = Math.max(0, this.bust - dt * 0.45);
    if (this.bust >= 1) { this.bust = 1; game.busted('arrest'); }

    // taser bolts fade
    for (let i = this.tasers.length - 1; i >= 0; i--) {
      const t = this.tasers[i]; t.t -= dt;
      if (t.t <= 0) { CB.Pools.gB.release(t.slot); this.tasers.splice(i, 1); }
    }

    updateHeli(dt, pl, game);

    // ---- siren audio from the nearest active cruiser
    let sd = 1e9, sc = null;
    for (const c of this.cars) if (c.siren && c !== pl.car) { const d = M.dist(c.x, c.z, pl.x, pl.z); if (d < sd) { sd = d; sc = c; } }
    if (sc && sd < 220) {
      const a = CB.Audio.spatial(sc.x, sc.z, 220);
      CB.Audio.loop('siren', a ? a.v * 0.14 : 0, a ? a.pan : 0);
      CB.Audio.sirenTone(this.time, lvl >= 3 ? 'yelp' : 'wail');
    } else CB.Audio.loop('siren', 0);
  };

  // Player shoves officers in front of them.
  Police.shove = function (pl, game) {
    let hit = false;
    const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
    for (const c of this.foot) {
      if (c.mode === 'knock' || c.mode === 'fallen') continue;
      const dx = c.x - pl.x, dz = c.z - pl.z, d = Math.hypot(dx, dz);
      if (d > 2.2 || (dx * fx + dz * fz) < -0.3) continue;
      c.knock(fx * 5, fz * 5, 3);
      hit = true;
    }
    if (hit) { this.bust = Math.max(0, this.bust - 0.4); }
    return hit;
  };

  Police.hasActive = function () { return this.mode === 'chase' || this.mode === 'search'; };
  CB.Cop = Cop;
})(window.CB);

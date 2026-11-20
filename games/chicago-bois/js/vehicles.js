// Chicago Bois – cars: models, arcade driving physics, traffic AI on the street grid.
'use strict';
(function (CB) {
  const M = CB.M, C = CB.C, hex = M.hex;

  const TYPES = {
    sedan: { L: 4.5, W: 1.9, H: 0.68, cabH: 0.56, cabL: 0.5, cabZ: -0.15, maxV: 33, acc: 10, grip: 10, mass: 1, label: 'sedan' },
    taxi: { L: 4.6, W: 1.9, H: 0.7, cabH: 0.56, cabL: 0.5, cabZ: -0.15, maxV: 32, acc: 10, grip: 10, mass: 1, label: 'taxi' },
    sports: { L: 4.4, W: 2.0, H: 0.52, cabH: 0.44, cabL: 0.42, cabZ: -0.3, maxV: 46, acc: 16, grip: 12, mass: 0.9, label: 'sports car' },
    pickup: { L: 5.2, W: 2.05, H: 0.82, cabH: 0.66, cabL: 0.3, cabZ: 0.55, maxV: 30, acc: 9, grip: 9, mass: 1.3, bed: true, label: 'pickup' },
    van: { L: 5.0, W: 2.05, H: 1.55, cabH: 0, cabL: 0, cabZ: 0, maxV: 28, acc: 8, grip: 8, mass: 1.4, van: true, label: 'van' },
    police: { L: 4.7, W: 1.95, H: 0.7, cabH: 0.56, cabL: 0.48, cabZ: -0.15, maxV: 38, acc: 13, grip: 11, mass: 1.2, police: true, label: 'police cruiser' },
    armored: { L: 6.2, W: 2.35, H: 2.0, cabH: 0, cabL: 0, cabZ: 0, maxV: 27, acc: 7, grip: 9, mass: 3, van: true, armored: true, label: 'armored truck' },
  };
  CB.CAR_TYPES = TYPES;

  // ------------------------------------------------------------------ Car
  class Car {
    constructor(type, color) {
      const T = this.T = TYPES[type];
      this.type = type;
      const P = CB.Pools;
      const r = this.rig = new CB.Rig();
      const col = color || (type === 'taxi' ? hex(0xf4c20d) : type === 'police' ? hex(0xf2f3f4) : type === 'armored' ? hex(0x5d6d5a) : M.pick(CB.City.PAL.car));
      this.color = col;
      const L = T.L, W = T.W;
      const glass = hex(0x22313f);
      const base = 0.32;
      if (T.van) {
        r.add(P.shiny, { o: [0, base + T.H / 2, 0], s: [W, T.H, L], c: col });
        r.add(P.box, { o: [0, base + T.H * 0.72, L / 2 - 0.02], s: [W * 0.86, T.H * 0.34, 0.06], c: glass });
        r.add(P.box, { o: [W / 2 + 0.01, base + T.H * 0.72, L * 0.36], s: [0.04, T.H * 0.3, L * 0.18], c: glass });
        r.add(P.box, { o: [-W / 2 - 0.01, base + T.H * 0.72, L * 0.36], s: [0.04, T.H * 0.3, L * 0.18], c: glass });
        if (T.armored) {
          r.add(P.box, { o: [0, base + T.H + 0.05, -0.3], s: [W * 0.9, 0.1, L * 0.7], c: CB.shade(col, 0.7) });
          r.add(P.box, { o: [W / 2 + 0.02, base + T.H * 0.5, -0.5], s: [0.04, 0.4, 1.4], c: hex(0xf1c40f) });
          r.add(P.box, { o: [-W / 2 - 0.02, base + T.H * 0.5, -0.5], s: [0.04, 0.4, 1.4], c: hex(0xf1c40f) });
        }
      } else {
        r.add(P.shiny, { o: [0, base + T.H / 2, 0], s: [W, T.H, L], c: col });
        r.add(P.box, { o: [0, base + T.H + T.cabH / 2, T.cabZ], s: [W * 0.84, T.cabH, L * T.cabL], c: glass });
        r.add(P.shiny, { o: [0, base + T.H + T.cabH + 0.03, T.cabZ - 0.05], s: [W * 0.86, 0.07, L * T.cabL * 0.9], c: col });
        // pillars
        r.add(P.box, { o: [0, base + T.H + T.cabH / 2, T.cabZ + L * T.cabL / 2 - 0.05], s: [W * 0.85, T.cabH, 0.08], c: col });
        if (T.bed) {
          r.add(P.box, { o: [W / 2 - 0.08, base + T.H + 0.25, -L * 0.25], s: [0.12, 0.5, L * 0.48], c: col });
          r.add(P.box, { o: [-W / 2 + 0.08, base + T.H + 0.25, -L * 0.25], s: [0.12, 0.5, L * 0.48], c: col });
          r.add(P.box, { o: [0, base + T.H + 0.25, -L / 2 + 0.08], s: [W, 0.5, 0.12], c: col });
        }
      }
      // side mirrors
      if (!T.van) for (const sx of [-1, 1]) r.add(P.box, { o: [sx * (W / 2 + 0.08), base + T.H + 0.12, T.cabZ + L * T.cabL / 2 - 0.1], s: [0.16, 0.12, 0.08], c: col });
      // bumpers
      r.add(P.box, { o: [0, base + 0.12, L / 2 + 0.04], s: [W * 0.98, 0.22, 0.12], c: hex(0x2d2d2d) });
      r.add(P.box, { o: [0, base + 0.12, -L / 2 - 0.04], s: [W * 0.98, 0.22, 0.12], c: hex(0x2d2d2d) });
      if (type === 'police') {
        r.add(P.box, { o: [W / 2 + 0.01, base + T.H * 0.45, 0], s: [0.03, 0.18, L * 0.8], c: hex(0x1a3e8c) });
        r.add(P.box, { o: [-W / 2 - 0.01, base + T.H * 0.45, 0], s: [0.03, 0.18, L * 0.8], c: hex(0x1a3e8c) });
        r.add(P.box, { o: [0, base + T.H + 0.02, L * 0.3], s: [W * 0.9, 0.05, L * 0.28], c: hex(0x111111) });
        r.add(P.box, { o: [0, base + T.H + T.cabH + 0.12, T.cabZ], s: [W * 0.7, 0.12, 0.35], c: hex(0x222222) });
        this.barR = r.add(P.gR, { o: [-W * 0.2, base + T.H + T.cabH + 0.22, T.cabZ], s: [W * 0.28, 0.14, 0.3] });
        this.barB = r.add(P.gB, { o: [W * 0.2, base + T.H + T.cabH + 0.22, T.cabZ], s: [W * 0.28, 0.14, 0.3] });
        this.barRoff = r.add(P.box, { o: [-W * 0.2, base + T.H + T.cabH + 0.22, T.cabZ], s: [W * 0.28, 0.14, 0.3], c: hex(0x6b1010) });
        this.barBoff = r.add(P.box, { o: [W * 0.2, base + T.H + T.cabH + 0.22, T.cabZ], s: [W * 0.28, 0.14, 0.3], c: hex(0x10206b) });
        this.sirenPool = P.sirenPool.alloc();
      }
      if (type === 'taxi') r.add(P.gY, { o: [0, base + T.H + T.cabH + 0.17, T.cabZ], s: [0.7, 0.22, 0.25] });
      // wheels
      this.wheels = [];
      const wz = L * 0.32, wx = W / 2 - 0.12, wr = T.armored ? 0.5 : 0.36;
      for (const [x, z] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
        const w = r.add(P.cyl, { j: [x, wr, z], s: [wr * 2, 0.28, wr * 2], roll: Math.PI / 2, c: hex(0x151515) });
        w.front = z > 0;
        this.wheels.push(w);
        const rim = r.add(P.cyl, { j: [x + Math.sign(x) * 0.02, wr, z], s: [wr * 1.15, 0.3, wr * 1.15], roll: Math.PI / 2, c: type === 'sports' ? hex(0xd4af37) : hex(0xb8bcc2) });
        rim.front = w.front;
        this.wheels.push(rim);
      }
      this.wr = wr;
      // lights
      const ly = base + T.H * 0.62;
      r.add(P.gW, { o: [-W * 0.33, ly, L / 2 + 0.01], s: [0.36, 0.14, 0.05] });
      r.add(P.gW, { o: [W * 0.33, ly, L / 2 + 0.01], s: [0.36, 0.14, 0.05] });
      this.tail = [r.add(P.gR, { o: [-W * 0.36, ly, -L / 2 - 0.01], s: [0.34, 0.14, 0.05] }),
        r.add(P.gR, { o: [W * 0.36, ly, -L / 2 - 0.01], s: [0.34, 0.14, 0.05] })];
      // driver head (visible when occupied)
      this.driverHead = r.add(P.box, { o: [-W * 0.2, base + T.H + 0.2, T.van ? L * 0.3 : T.cabZ + 0.1], s: [0.3, 0.32, 0.3], c: M.pick([0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524].map(hex)) });
      this.headPool = P.headPool.alloc();
      this.headPool2 = P.headPool.alloc();

      this.x = 0; this.z = 0; this.y = 0; this.h = 0;
      this.vx = 0; this.vz = 0; this.vy = 0; this.vf = 0;
      this.steer = 0; this.health = 100; this.wspin = 0;
      this.mode = 'parked'; this.occupied = false;
      this.siren = false; this.alarm = 0; this.smoke = 0;
      this.pitchV = 0; this.rollV = 0;
      this.airT = 0; this.rampLaunch = null;
      this.L = L; this.W = W;
      this.dead = false;
      this.honkT = 0;
      this.isCar = true;
    }
    get speed() { return Math.hypot(this.vx, this.vz); }
    setDriver(on) { this.occupied = on; this.driverHead.vis = on; }
    dispose() {
      this.rig.dispose();
      CB.Pools.headPool.release(this.headPool); CB.Pools.headPool.release(this.headPool2);
      if (this.sirenPool != null) CB.Pools.sirenPool.release(this.sirenPool);
    }

    // ---------------------------------------------------------- physics drive
    // input: throttle -1..1, steer -1..1, brake (handbrake bool)
    drive(dt, thr, steerIn, hand) {
      const T = this.T;
      const City = CB.City;
      const healthK = this.dead ? 0 : this.health < 25 ? 0.55 : 1;
      this.steer = M.damp(this.steer, steerIn, steerIn ? 5 : 8, dt);
      let fx = Math.sin(this.h), fz = Math.cos(this.h);
      let vf = this.vx * fx + this.vz * fz;
      let vl = this.vx * fz - this.vz * fx;
      const ground = City.groundY(this.x, this.z);
      const onGround = this.y <= ground + 0.06;
      if (onGround) {
        if (thr > 0) {
          if (vf < -0.5) vf += 22 * thr * dt;
          else vf += T.acc * healthK * thr * dt * Math.max(0, 1 - vf / T.maxV);
        } else if (thr < 0) {
          if (vf > 0.5) vf += 24 * thr * dt;
          else vf = Math.max(-11, vf + T.acc * 0.6 * thr * dt);
        } else {
          vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt);
        }
        if (hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 7 * dt);
        vf -= vf * Math.abs(vf) * 0.0006 * dt;
        const maxSteer = 0.62 / (1 + Math.abs(vf) * 0.05);
        const wheelbase = T.L * 0.62;
        const yawRate = vf * Math.tan(this.steer * maxSteer) / wheelbase * (hand ? 1.35 : 1);
        this.h += yawRate * dt;
        const grip = hand ? 1.6 : T.grip;
        const slip = Math.abs(vl);
        vl -= vl * Math.min(1, grip * dt);
        this.skid = slip > 3.5 ? Math.min(1, (slip - 3.5) / 6) : 0;
      } else {
        this.skid = 0;
      }
      fx = Math.sin(this.h); fz = Math.cos(this.h);
      this.vx = fx * vf + fz * vl;
      this.vz = fz * vf - fx * vl;
      this.vf = vf;
      this.integrate(dt);
    }

    // Apply velocity, ground following, ramps and collisions.
    integrate(dt) {
      const City = CB.City;
      const ox = this.x, oz = this.z;
      this.x += this.vx * dt; this.z += this.vz * dt;
      let gy = City.groundY(this.x, this.z);
      // walls taller than a curb step stop the car (e.g. driving into the back of a ramp)
      if (gy > this.y + 0.6) { this.x = ox; this.z = oz; this.vx *= -0.3; this.vz *= -0.3; gy = City.groundY(ox, oz); this.crash(8); }
      if (gy < -1) { // driving into the lake: stop at the edge
        this.x = ox; this.z = oz; this.vx = 0; this.vz = 0; gy = City.groundY(ox, oz);
      }
      const onRamp = City.rampAt(this.x, this.z);
      const airborne = this.airT > 0 || this.y > gy + 0.06 || (this.vy > 0.5 && !onRamp);
      if (airborne && !(onRamp && this.airT === 0 && this.y <= gy + 0.3)) {
        this.vy -= 20 * dt;
        this.y += this.vy * dt;
        this.airT += dt;
        if (this.y <= gy) {
          if (this.vy < -7) { this.crash(-this.vy * 0.7); this.vy = -this.vy * 0.2; }
          else this.vy = 0;
          this.y = gy;
          if (this.onLand && this.airT > 0.2) this.onLand(this.airT);
          this.airT = 0;
        }
      } else {
        // on the ground (or driving up a ramp – remember its slope for the take-off)
        if (onRamp) {
          const along = this.vx * onRamp.dx + this.vz * onRamp.dz;
          this.vy = Math.max(0, along * onRamp.h / onRamp.len);
          this.lastRamp = onRamp;
        } else this.vy = 0;
        this.y = gy;
        this.airT = 0;
      }
      // collide with buildings using three circles along the body
      const fx = Math.sin(this.h), fz = Math.cos(this.h);
      const r = this.W * 0.5;
      const off = this.L / 2 - r;
      let impact = 0;
      for (const k of [-off, 0, off]) {
        const c = { x: this.x + fx * k, z: this.z + fz * k };
        const hit = City.resolve(c, r, this.y, 0.5);
        if (hit) {
          this.x += c.x - (this.x + fx * k); this.z += c.z - (this.z + fz * k);
          const vn = this.vx * hit.x + this.vz * hit.z;
          if (vn < 0) {
            this.vx -= hit.x * vn * 1.25; this.vz -= hit.z * vn * 1.25;
            impact = Math.max(impact, -vn);
            // glancing blows twist the car a little
            this.h += (k > 0 ? 1 : k < 0 ? -1 : 0) * (fx * hit.z - fz * hit.x) * Math.min(0.3, -vn * 0.02);
          }
        }
      }
      if (impact > 0) { this.vx *= 0.92; this.vz *= 0.92; }
      if (impact > 5) this.crash(impact);
      // world bounds safety net
      this.x = M.clamp(this.x, C.WORLD.x0 + 1, C.PIER.x1 - 1);
      this.z = M.clamp(this.z, C.WORLD.z0 + 1, C.WORLD.z1 - 1);
    }

    crash(impact) {
      if (impact < 5) return;
      const dmg = (impact - 5) * (this.T.armored ? 0.8 : 2.4);
      this.health = Math.max(0, this.health - dmg);
      if (this.onCrash) this.onCrash(impact, dmg);
      else if (impact > 8) CB.Audio.play('crash', Math.min(1, impact / 20), this.x, this.z, 70);
    }

    // ---------------------------------------------------------- render
    update(dt, night, t) {
      const r = this.rig;
      r.x = this.x; r.y = this.y; r.z = this.z; r.yaw = this.h;
      // body pitch from vertical motion (nose up on ramps), roll from cornering
      const vf = this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h);
      const tp = this.y > 0.5 || this.vy !== 0 ? -Math.atan2(this.vy, Math.max(4, Math.abs(vf))) * 0.9 : 0;
      this.pitchV = M.damp(this.pitchV, tp, 6, dt);
      const lat = this.mode === 'player' || this.mode === 'ai' ? this.steer * Math.min(1, Math.abs(vf) / 20) * 0.06 : 0;
      this.rollV = M.damp(this.rollV, lat, 5, dt);
      r.pitch = this.pitchV; r.roll = this.rollV;
      this.wspin += vf * dt / this.wr;
      for (const w of this.wheels) {
        w.pitch = this.wspin;
        w.yaw = w.front ? this.steer * 0.5 : 0;
        w.roll = Math.PI / 2;
      }
      const braking = this.brakeLight || false;
      this.tail[0].sx = this.tail[1].sx = braking ? 0.42 : 0.34;
      if (this.T.police) {
        const on = this.siren;
        const flash = Math.floor(t * 6) % 2 === 0;
        this.barR.vis = on && flash; this.barB.vis = on && !flash;
        this.barRoff.vis = !this.barR.vis; this.barBoff.vis = !this.barB.vis;
        const P = CB.Pools;
        if (on) {
          const c = flash ? [1, 0.1, 0.1] : [0.1, 0.3, 1];
          void c;
          CB.placeSlot(P.sirenPool, this.sirenPool, this.x, this.y + 0.06, this.z, 11, 1, 11);
          P.matSirenPool.emissiveColor.set(flash ? 0.9 : 0.1, 0.1, flash ? 0.1 : 0.9);
        } else P.sirenPool.hide(this.sirenPool);
      }
      r.update();
      // headlight pools at night
      const P = CB.Pools;
      if (night > 0.3 && !this.dead && (this.occupied || this.mode === 'player' || this.mode === 'ai')) {
        const fx = Math.sin(this.h), fz = Math.cos(this.h);
        CB.placeSlot(P.headPool, this.headPool, this.x + fx * (this.L / 2 + 5), this.y + 0.05, this.z + fz * (this.L / 2 + 5), 5, 1, 10, this.h);
        CB.placeSlot(P.headPool, this.headPool2, this.x + fx * (this.L / 2 + 1.5), this.y + 0.05, this.z + fz * (this.L / 2 + 1.5), 3.6, 1, 4, this.h);
      } else { P.headPool.hide(this.headPool); P.headPool.hide(this.headPool2); }
    }

    // Points of the car body used for overlap tests (3 circles).
    circles() {
      const fx = Math.sin(this.h), fz = Math.cos(this.h);
      const r = this.W * 0.5, off = this.L / 2 - r;
      return [[this.x - fx * off, this.z - fz * off], [this.x, this.z], [this.x + fx * off, this.z + fz * off], r];
    }
    // Distance from a point to the car body (approx).
    distTo(x, z) {
      const fx = Math.sin(this.h), fz = Math.cos(this.h);
      const dx = x - this.x, dz = z - this.z;
      const a = M.clamp(dx * fx + dz * fz, -this.L / 2, this.L / 2);
      const b = M.clamp(dx * fz - dz * fx, -this.W / 2, this.W / 2);
      const px = this.x + fx * a + fz * b, pz = this.z + fz * a - fx * b;
      return Math.hypot(x - px, z - pz);
    }
    // Driver door position (left side).
    doorPos() {
      const fx = Math.sin(this.h), fz = Math.cos(this.h);
      return { x: this.x - fz * (this.W / 2 + 0.9), z: this.z + fx * (this.W / 2 + 0.9) };
    }
  }
  CB.Car = Car;

  // ------------------------------------------------------------------ traffic paths
  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const nodePos = (i, j) => ({ x: CB.road(i), z: CB.road(j) });
  CB.nodePos = nodePos;
  function lanePoint(i, j, d, dist, out) {
    const n = nodePos(i, j), dx = DIRS[d][0], dz = DIRS[d][1];
    // right of travel direction is (dz, -dx)
    return { x: n.x + dx * dist + dz * C.LANE * (out ? 1 : 1), z: n.z + dz * dist - dx * C.LANE };
  }
  function validDir(i, j, d) {
    const ni = i + DIRS[d][0], nj = j + DIRS[d][1];
    return ni >= 0 && nj >= 0 && ni <= C.N && nj <= C.N;
  }
  CB.validDir = validDir;
  CB.DIRS = DIRS;

  // Builds the next road segment for a kinematic car. Car state: ci,cj (target node), d (travel dir).
  function lineSeg(car) {
    // from (prev node) to stop line at target node (ci,cj)
    const pi = car.ci - DIRS[car.d][0], pj = car.cj - DIRS[car.d][1];
    const a = lanePoint(pi, pj, car.d, C.STOP);
    const b = lanePoint(car.ci, car.cj, car.d, -C.STOP);
    return { kind: 'line', ax: a.x, az: a.z, bx: b.x, bz: b.z, len: Math.hypot(b.x - a.x, b.z - a.z), stop: true };
  }
  function turnSeg(car, nd) {
    const a = lanePoint(car.ci, car.cj, car.d, -C.STOP);
    const b = lanePoint(car.ci, car.cj, nd, C.STOP);
    const dx = DIRS[car.d][0], dz = DIRS[car.d][1];
    let cx, cz;
    if (nd === car.d) { cx = (a.x + b.x) / 2; cz = (a.z + b.z) / 2; } else {
      const t = (b.x - a.x) * dx + (b.z - a.z) * dz;
      cx = a.x + dx * t; cz = a.z + dz * t;
    }
    let len = 0, px = a.x, pz = a.z;
    for (let k = 1; k <= 8; k++) {
      const q = bez(a.x, a.z, cx, cz, b.x, b.z, k / 8);
      len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z;
    }
    return { kind: 'bez', ax: a.x, az: a.z, cx, cz, bx: b.x, bz: b.z, len, turn: nd !== car.d };
  }
  function bez(ax, az, cx, cz, bx, bz, t) {
    const u = 1 - t;
    return { x: u * u * ax + 2 * u * t * cx + t * t * bx, z: u * u * az + 2 * u * t * cz + t * t * bz };
  }
  function segPoint(s, t) {
    if (s.kind === 'line') return { x: s.ax + (s.bx - s.ax) * t, z: s.az + (s.bz - s.az) * t };
    return bez(s.ax, s.az, s.cx, s.cz, s.bx, s.bz, t);
  }
  function chooseDir(i, j, d, avoidEdge) {
    const opts = [];
    const back = (d + 2) & 3;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === back || !validDir(i, j, nd)) continue;
      opts.push(nd);
    }
    if (!opts.length) return back;
    if (avoidEdge) {
      // prefer heading toward a target point
      return opts.sort((a, b) => avoidEdge(i, j, a) - avoidEdge(i, j, b))[0];
    }
    if (opts.includes(d) && Math.random() < 0.5) return d;
    return M.pick(opts);
  }

  // Put a car onto the traffic grid on edge (i,j)->(i+d) at fraction f.
  function attach(car, i, j, d, f) {
    car.ci = i + DIRS[d][0]; car.cj = j + DIRS[d][1]; car.d = d;
    car.seg = lineSeg(car);
    car.s = car.seg.len * (f || 0);
    const p = segPoint(car.seg, car.s / car.seg.len);
    car.x = p.x; car.z = p.z; car.y = 0;
    car.h = Math.atan2(DIRS[d][0], DIRS[d][1]);
    car.mode = 'traffic';
    car.cruise = M.rand(10, 14);
    car.v = car.cruise * 0.7;
    car.waitT = 0;
  }
  CB.attachTraffic = attach;

  // Re-join traffic from an arbitrary position (after a chase).
  CB.rejoinTraffic = function (car) {
    let bi = 0, bj = 0, bd = 1e9;
    for (let i = 0; i <= C.N; i++) for (let j = 0; j <= C.N; j++) {
      const n = nodePos(i, j), d = M.dist2(n.x, n.z, car.x, car.z);
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    let best = 0, bdot = -9;
    for (let d = 0; d < 4; d++) if (validDir(bi, bj, d)) { const dt = DIRS[d][0] * fx + DIRS[d][1] * fz; if (dt > bdot) { bdot = dt; best = d; } }
    attach(car, bi, bj, best, 0.1);
  };

  // Kinematic traffic step.
  function trafficStep(car, dt, t, obstacles, ignoreLights) {
    const seg = car.seg;
    // desired speed
    let want = seg.kind === 'bez' && seg.turn ? 7 : car.cruise;
    const remain = seg.len - car.s;
    // traffic lights at the end of a line segment
    if (seg.kind === 'line' && !ignoreLights) {
      const st = CB.City.signalState(car.ci, car.cj, DIRS[car.d][1] ? 'ns' : 'ew', t);
      if (st === 'r' || (st === 'y' && remain > 9)) {
        const stopV = Math.sqrt(Math.max(0, remain - 0.5) * 2 * 5);
        want = Math.min(want, stopV);
        if (remain < 1.2) want = 0;
      }
    }
    // obstacles ahead (cars, peds, player)
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    let block = 99, blockKind = null;
    for (let k = 0; k < obstacles.length; k++) {
      const o = obstacles[k];
      if (o === car) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 0.5 || ahead > 16) continue;
      const side = Math.abs(dx * fz - dz * fx);
      if (side > (o.isCar ? 2.1 : 1.6)) continue;
      const gap = ahead - (o.isCar ? (car.L + o.L) / 2 : car.L / 2 + 0.6);
      if (gap < block) { block = gap; blockKind = o; }
    }
    if (block < 12) {
      const v = Math.max(0, (block - 1.2) * 1.4);
      want = Math.min(want, v);
      if (blockKind && !blockKind.isCar && block < 5 && car.v < 1) {
        car.honkT -= dt;
        if (car.honkT < 0) { car.honkT = M.rand(2, 4); CB.Audio.play('honk', 0.8, car.x, car.z, 60); }
      }
    }
    if (want < 0.5 && blockKind && blockKind.isCar) {
      car.waitT += dt;
      if (car.waitT > 5) want = 4; // stuck: creep through
    } else car.waitT = 0;
    const acc = want > car.v ? 4 : 9;
    car.v = M.clamp(car.v + Math.sign(want - car.v) * Math.min(Math.abs(want - car.v), acc * dt), 0, 30);
    car.brakeLight = want < car.v - 0.5 || car.v < 0.3;
    car.s += car.v * dt;
    while (car.s >= car.seg.len) {
      car.s -= car.seg.len;
      if (car.seg.kind === 'line') {
        const nd = chooseDir(car.ci, car.cj, car.d, car.steerTo);
        car.seg = turnSeg(car, nd);
        car.nextD = nd;
      } else {
        car.d = car.nextD;
        car.ci += DIRS[car.d][0]; car.cj += DIRS[car.d][1];
        car.seg = lineSeg(car);
      }
    }
    const p = segPoint(car.seg, car.s / car.seg.len);
    const p2 = segPoint(car.seg, Math.min(1, (car.s + 0.6) / car.seg.len));
    const dx = p2.x - p.x, dz = p2.z - p.z;
    if (dx * dx + dz * dz > 1e-6) car.h = Math.atan2(dx, dz);
    car.x = p.x; car.z = p.z;
    car.y = 0;
    car.vx = fx * car.v; car.vz = fz * car.v;
  }
  CB.trafficStep = trafficStep;

  // ------------------------------------------------------------------ traffic manager
  CB.Traffic = {
    cars: [], parked: [], target: 26,
    init(n) {
      this.target = n;
      for (const c of this.cars.concat(this.parked)) c.dispose();
      this.cars = []; this.parked = [];
      const sp = CB.City.playerSpawn;
      for (let k = 0; k < n; k++) {
        const c = new Car(this.randomType());
        c.setDriver(true);
        this.placeTraffic(c, sp.x, sp.z, 20, 220);
        this.cars.push(c);
      }
      // armored truck
      const a = new Car('armored');
      a.setDriver(true); a.special = 'armored';
      this.placeTraffic(a, 0, 0, 0, 200);
      this.cars.push(a);
      this.armored = a;
      // parked cars
      for (const s of CB.City.parking) s.car = null;
      const spots = CB.City.parking.slice().sort(() => Math.random() - 0.5);
      for (let k = 0; k < Math.min(55, spots.length); k++) this.addParked(spots[k]);
    },
    randomType() {
      const r = Math.random();
      return r < 0.5 ? 'sedan' : r < 0.68 ? 'taxi' : r < 0.8 ? 'pickup' : r < 0.9 ? 'van' : 'sports';
    },
    addParked(s) {
      const r = Math.random();
      const c = new Car(r < 0.6 ? 'sedan' : r < 0.75 ? 'pickup' : r < 0.85 ? 'van' : r < 0.95 ? 'sports' : 'taxi');
      c.x = s.x; c.z = s.z; c.h = s.yaw + (s.curb ? 0 : M.rand(-0.05, 0.05)); c.y = CB.City.groundY(s.x, s.z);
      c.mode = 'parked'; c.spot = s; s.car = c;
      c.update(0, 0, 0);
      this.parked.push(c);
      return c;
    },
    placeTraffic(car, x, z, minD, maxD, viewYaw) {
      // only consider grid nodes within reach of (x,z)
      const span = Math.ceil(maxD / C.P) + 1;
      const ci = Math.round((x + C.HALF) / C.P), cj = Math.round((z + C.HALF) / C.P);
      const i0 = Math.max(0, ci - span), i1 = Math.min(C.N, ci + span), j0 = Math.max(0, cj - span), j1 = Math.min(C.N, cj + span);
      for (let tries = 0; tries < 60; tries++) {
        const i = M.randInt(i0, i1), j = M.randInt(j0, j1);
        const d = M.randInt(0, 3);
        if (!validDir(i, j, d)) continue;
        const f = Math.random();
        const n = nodePos(i, j);
        const px = n.x + DIRS[d][0] * C.P * f, pz = n.z + DIRS[d][1] * C.P * f;
        const dist = M.dist(px, pz, x, z);
        if (dist < minD || dist > maxD) continue;
        if (viewYaw != null && tries < 45 && Math.abs(M.wrap(Math.atan2(px - x, pz - z) - viewYaw)) < 1.0) continue;
        // don't spawn on top of another car
        let clash = false;
        for (const o of this.cars) if (o !== car && M.dist2(o.x, o.z, px, pz) < 100) { clash = true; break; }
        if (clash) continue;
        attach(car, i, j, d, f * 0.9);
        car.health = 100; car.dead = false;
        return true;
      }
      if (!car.seg) attach(car, 4, 4, 0, 0.5); // never leave a car without a road
      return false;
    },
  };
})(window.CB);

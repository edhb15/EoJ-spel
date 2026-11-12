// Arcade motorcycle physics.
// Modes: ground (follows the surface), air (free flight with rotation control),
// loop (locked to a loop track) and crash (bike and rider tumble separately).
import * as THREE from 'three';
import { SURFACES } from '../world/layout.js';
import { clamp, damp, approach, wrapAngle, TAU } from '../core/math.js';

const G = 9.81;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export const STYLE_TRICKS = ['superman', 'nohander', 'nofooter', 'tailwhip', 'heartattack'];

export class BikePhysics {
  constructor(world, events) {
    this.world = world;
    this.events = events;
    this.pos = new THREE.Vector3(); // ground contact (ground mode) / unused otherwise
    this.com = new THREE.Vector3(); // centre of mass (air, crash)
    this.root = new THREE.Vector3(); // visual root
    this.q = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.n = new THREE.Vector3(0, 1, 0);
    this.omega = new THREE.Vector3(); // x: pitch (nose up +), y: yaw (left +), z: roll (right +)
    this.rot = { pitch: 0, yaw: 0, roll: 0 };
    this._g = {};
    this._g2 = {};
    this._g3 = {};
    this._w = {};
    this.mode = 'ground';
    this.heading = 0;
    this.s = 0;
    this.vl = 0;
    this.lean = 0;
    this.steerIn = 0;
    this.pitchVis = 0;
    this.wheelie = 0;
    this.wheelieV = 0;
    this.wobble = 0;
    this.wheelieTime = 0;
    this.wheelieSweet = 0;
    this.stoppieTime = 0;
    this.jumpHeld = 0;
    this.prevJump = false;
    this.airTime = 0;
    this.groundTime = 0;
    this.boost = 1;
    this.boosting = false;
    this.style = null;
    this.whip = { angle: 0, count: 0 };
    this.airTricks = [];
    this.gear = 0;
    this.rpm = 1500;
    this.shiftT = 0;
    this.suspF = 0;
    this.suspFv = 0;
    this.suspR = 0;
    this.suspRv = 0;
    this.wheelAngF = 0;
    this.wheelAngR = 0;
    this.airWheel = 0;
    this.wheelspin = 0;
    this.slip = 0;
    this.grip = 1;
    this.surface = 0;
    this.solid = null;
    this.safe = [];
    this.safeT = 0;
    this.time = 0;
    this.impactBonus = 0;
    this.loop = null;
    this.crashT = 0;
    this.braking = false;
    this.lastImpact = 0;
    this.maxHeight = 0;
    this.vertAir = false;
  }

  setSpec(spec) {
    this.spec = spec;
    const n = spec.gears;
    this.gearTops = [];
    for (let i = 0; i < n; i++) this.gearTops.push(spec.topSpeed * (0.3 + 0.7 * Math.pow(i / (n - 1), 1.05)) * 1.02);
    this.rpm = spec.idle;
  }

  get speed() {
    return this.mode === 'ground' || this.mode === 'loop' ? Math.abs(this.s) : this.vel.length();
  }

  // ---------------------------------------------------------------------------
  reset(x, z, heading, y) {
    const g = this.world.groundAt(x, z, y !== undefined ? y : this.world.topAt(x, z) + 0.1, this._g);
    this.mode = 'ground';
    this.pos.set(x, g.h, z);
    this.heading = heading;
    this.s = 0;
    this.vl = 0;
    this.lean = 0;
    this.steerIn = 0;
    this.wheelie = 0;
    this.wheelieV = 0;
    this.wheelieTime = 0;
    this.stoppieTime = 0;
    this.vel.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    this.style = null;
    this.whip.angle = 0;
    this.airTricks = [];
    this.gear = 0;
    this.groundTime = 1;
    this.airTime = 0;
    this.crashT = 0;
    this.loop = null;
    this.suspF = this.suspR = this.suspFv = this.suspRv = 0;
    this.n.set(g.nx, g.ny, g.nz);
    this.pitchVis = 0;
    this.groundOrientation(true);
    this.safe.length = 0;
    this.events.emit('respawn', {});
  }

  respawnSafe() {
    const now = this.time;
    let pick = null;
    for (let i = this.safe.length - 1; i >= 0; i--) {
      if (now - this.safe[i].t >= 1.6) {
        pick = this.safe[i];
        break;
      }
    }
    if (!pick && this.safe.length) pick = this.safe[0];
    if (pick) this.reset(pick.x, pick.z, pick.h, pick.y + 0.3);
    else this.reset(this.root.x, this.root.z, this.heading);
  }

  // ---------------------------------------------------------------------------
  step(dt, inp) {
    this.time += dt;
    const jumpPressed = inp.jump && !this.prevJump;
    const jumpReleased = !inp.jump && this.prevJump;
    if (jumpPressed) this.jumpHeld = 0;
    if (inp.jump) this.jumpHeld += dt;
    this.prevJump = inp.jump;
    this.jumpReleased = jumpReleased;

    const canBoost = this.mode !== 'crash' && inp.boost && this.boost > 0.01 && (inp.throttle > 0.1 || this.mode === 'air');
    this.boosting = canBoost;
    if (canBoost) this.boost = Math.max(0, this.boost - dt * 0.26);
    else this.boost = Math.min(1, this.boost + dt * 0.025);

    if (this.mode === 'ground') this.stepGround(dt, inp);
    else if (this.mode === 'air') this.stepAir(dt, inp);
    else if (this.mode === 'loop') this.stepLoop(dt, inp);
    else this.stepCrash(dt);

    this.updateEngine(dt, inp);
    this.updateSuspension(dt, inp);
  }

  // ---------------------------------------------------------------------------
  stepGround(dt, inp) {
    const sp = this.spec;
    const w = this.world;
    const gs = w.groundAt(this.pos.x, this.pos.z, this.pos.y, this._g);
    const n = this.n.set(gs.nx, gs.ny, gs.nz);
    this.surface = gs.surface;
    this.solid = gs.solid;
    const surf = SURFACES[gs.surface];
    let grip = surf.grip;
    let roll = surf.roll;
    if (surf.offroad) {
      grip = grip + (1 - grip) * sp.offroad * 0.6;
      roll *= 1.6 - sp.offroad * 0.9;
    } else grip *= 1 + (1 - sp.offroad) * 0.12;
    grip *= sp.grip;
    this.grip = grip;

    this.steerIn += clamp(inp.steer - this.steerIn, -dt * 5, dt * 5);
    const h = this.heading;
    const fhx = Math.sin(h);
    const fhz = Math.cos(h);
    const rhx = -Math.cos(h);
    const rhz = Math.sin(h);
    const slopeF = -(n.x * fhx + n.z * fhz) / n.y;
    const cosT = 1 / Math.sqrt(1 + slopeF * slopeF);
    const sinT = slopeF * cosT;
    const slopeR = -(n.x * rhx + n.z * rhz) / n.y;
    const sinR = slopeR / Math.sqrt(1 + slopeR * slopeR);
    const speed = Math.abs(this.s);

    // ---- wheelie / stoppie / hop ----
    let hop = false;
    if (this.jumpReleased && this.jumpHeld < 0.28 && this.wheelie < 0.22 && this.wheelie > -0.1) hop = true;
    let target = 0;
    const stoppie = inp.jump && inp.brake > 0.3 && this.s > (this.wheelie < -0.05 ? 1.2 : 5) && this.wheelie < 0.08;
    const lifting = inp.jump && this.jumpHeld > 0.2 && this.s > 2.5 && !stoppie;
    if (stoppie) target = -0.3 - 0.16 * inp.brake;
    else if (lifting) target = 0.5 + 0.4 * inp.throttle - 0.6 * inp.brake;
    if (Math.abs(this.wheelie) > 0.15) {
      this.wobble += (Math.random() - 0.5) * dt * 9 * (1 + this.wheelieTime * 0.12 + this.stoppieTime * 0.3);
      this.wobble *= Math.exp(-dt * 1.4);
      target += this.wobble * 0.14;
    } else this.wobble = 0;
    const K = target !== 0 ? 28 : 42;
    const prevW = this.wheelie;
    this.wheelieV += ((target - this.wheelie) * K - this.wheelieV * 9) * dt;
    this.wheelie += this.wheelieV * dt;
    if (target === 0 && prevW !== 0 && prevW * this.wheelie <= 0) {
      // a wheel touches back down
      if (prevW > 0) this.suspFv += Math.min(2.5, Math.abs(this.wheelieV) * 0.4);
      else this.suspRv += Math.min(2, Math.abs(this.wheelieV) * 0.3);
      this.wheelie = 0;
      this.wheelieV = 0;
    }
    if (target > 0 && this.wheelie < 0) {
      this.wheelie = 0;
      this.wheelieV = Math.max(0, this.wheelieV);
    }
    if (this.wheelie > 1.25) return this.crash('Looped out');
    if (this.wheelie < -0.85) return this.crash('Endo');
    if (this.wheelie > 0.25) {
      this.wheelieTime += dt;
      if (this.wheelie > 0.55 && this.wheelie < 0.95) this.wheelieSweet += dt;
    } else if (this.wheelieTime > 0 && this.wheelie < 0.12) this.endWheelie();
    if (this.wheelie < -0.15) this.stoppieTime += dt;
    else if (this.stoppieTime > 0 && this.wheelie > -0.08) this.endStoppie();

    // ---- longitudinal ----
    const top = sp.topSpeed * (this.boosting ? 1.22 : 1);
    let a = 0;
    this.wheelspin = 0;
    if (inp.throttle > 0 && this.s > -0.5) {
      const x = clamp(this.s / top, 0, 1.2);
      let thrust = sp.accel * (1 - Math.pow(x, 2.4)) * inp.throttle * (this.boosting ? 1.6 : 1);
      if (this.shiftT > 0) thrust *= 0.4;
      const maxT = grip * G * 1.25;
      if (thrust > maxT) {
        this.wheelspin = (thrust - maxT) / maxT;
        thrust = maxT;
      }
      if (this.wheelie > 0.3) thrust *= 0.85;
      a += thrust;
    }
    this.braking = inp.brake > 0.1 && this.s > 0.5;
    if (inp.brake > 0) {
      if (this.s > 0.5) a -= sp.brake * inp.brake * Math.min(1, 0.45 + grip * 0.6) * (this.wheelie > 0.2 ? 0.4 : 1);
      else if (this.s > -5) {
        if (this.reverseArm > 0.25) a -= 3.5 * inp.brake;
        else if (this.s > 0) a -= 4;
      }
      if (this.s <= 0.5) this.reverseArm = (this.reverseArm || 0) + dt;
    } else this.reverseArm = 0;
    if (inp.throttle === 0 && inp.brake === 0 && Math.abs(this.s) > 1) a -= Math.sign(this.s) * 1.1;
    if (this.wheelie < -0.05) a -= 3.2;
    a -= Math.sign(this.s) * roll * G;
    a -= 0.00042 * this.s * Math.abs(this.s);
    a -= G * sinT;
    const sPrev = this.s;
    this.s += a * dt;
    if (inp.throttle === 0 && Math.abs(this.s) < 0.35 && Math.abs(sinT) < 0.1) this.s = 0;
    if (inp.brake > 0 && sPrev > 0 && this.s < 0 && this.reverseArm < 0.25) this.s = 0;

    // ---- steering ----
    let maxYaw = 0;
    if (speed > 0.2) {
      const latAcc = grip * G * 1.45 * sp.turn;
      const rMin = 2.4 / sp.turn;
      maxYaw = Math.min(speed / rMin, latAcc / Math.max(speed, 0.1));
    }
    if (Math.abs(this.wheelie) > 0.2) maxYaw *= 0.55;
    const yawRate = -this.steerIn * maxYaw * (this.s >= 0 ? 1 : -1);
    const dpsi = yawRate * dt;
    this.heading = wrapAngle(this.heading + dpsi);
    const c = Math.cos(dpsi);
    const sn = Math.sin(dpsi);
    const hs0 = this.s * cosT;
    const hs1 = hs0 * c - this.vl * sn;
    this.vl = this.vl * c + hs0 * sn;
    this.s = hs1 / cosT;
    this.vl -= G * sinR * dt;
    this.vl = approach(this.vl, 0, grip * G * 1.7 * dt);
    this.slip = Math.abs(this.vl) + (this.braking && grip < 0.8 ? speed * 0.1 : 0) + this.wheelspin * 3;
    const leanTarget = clamp(-Math.atan2(this.s * yawRate, G), -sp.maxLean, sp.maxLean) * (1 - clamp(Math.abs(this.vl) / 12, 0, 0.5));
    this.lean += (leanTarget - this.lean) * damp(9, dt);

    // ---- move ----
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const rx = -fz;
    const rz = fx;
    const hsp = this.s * cosT;
    let vx = fx * hsp + rx * this.vl;
    let vz = fz * hsp + rz * this.vl;
    const vy = this.s * sinT;
    let nx = this.pos.x + vx * dt;
    let nz = this.pos.z + vz * dt;
    // walls: probe front tip, centre and tail
    const tip = sp.wheelbase / 2 + 0.3;
    const dir = this.s >= 0 ? 1 : -1;
    const probes = [tip * dir, 0, -tip * 0.8 * dir];
    for (const off of probes) {
      const wl = w.wallAt(nx + fx * off, nz + fz * off, this.pos.y + Math.abs(off) * 1.0, 1.3, 0, this._w, gs.solid);
      if (!wl) continue;
      const into = -(vx * wl.nx + vz * wl.nz);
      if (into > 0) {
        const hv = Math.hypot(vx, vz) || 1;
        const headOn = into / hv;
        const lim = wl.solid.crashSoft ? 16 : 11.5;
        if (into > lim && headOn > 0.5) {
          this.vel.set(vx, vy, vz);
          return this.crash(wl.solid.kind === 'tree' ? 'Hit a tree' : wl.solid.kind === 'vehicle' ? 'Hit a vehicle' : 'Hit a wall');
        }
        vx += wl.nx * into * 1.15;
        vz += wl.nz * into * 1.15;
        if (into > 2) this.events.emit('bump', { speed: into });
        if (headOn > 0.7) this.wheelie = Math.min(this.wheelie, 0);
      }
      nx += wl.nx * (wl.depth + 0.03);
      nz += wl.nz * (wl.depth + 0.03);
    }
    // traffic
    const hit = w.traffic && w.traffic.hitTest(nx, this.pos.y + 0.6, nz, 0.45);
    if (hit) {
      const rel = (vx - hit.vx) * -hit.nx + (vz - hit.vz) * -hit.nz;
      if (rel > 7) {
        this.vel.set(vx, vy, vz);
        return this.crash('Hit a car');
      }
      vx += hit.nx * Math.max(rel, 0) * 1.2 + hit.vx * 0.3;
      vz += hit.nz * Math.max(rel, 0) * 1.2 + hit.vz * 0.3;
      nx += hit.nx * (hit.depth + 0.05);
      nz += hit.nz * (hit.depth + 0.05);
    }
    // re-derive speeds after collisions
    this.s = (vx * fx + vz * fz) / cosT;
    this.vl = vx * rx + vz * rz;
    // loop entry
    for (const L of w.loops) {
      const lfx = Math.sin(L.yaw);
      const lfz = Math.cos(L.yaw);
      const a0 = (this.pos.x - L.x) * lfx + (this.pos.z - L.z) * lfz;
      const a1 = (nx - L.x) * lfx + (nz - L.z) * lfz;
      const side = (nx - L.x) * -lfz + (nz - L.z) * lfx;
      if (a0 < 0 && a1 >= 0 && Math.abs(side) < 2.4 && Math.cos(this.heading - L.yaw) > 0.8 && this.s > 4) {
        this.enterLoop(L);
        return;
      }
    }

    const gn = w.groundAt(nx, nz, this.pos.y + Math.max(0, vy * dt) * 1.5, this._g2);
    const predicted = this.pos.y + vy * dt;
    const tol = 0.004 + 0.5 * G * 1.4 * dt * dt;
    if (hop || (gn.h < predicted - tol && this.groundTime > 0.02)) {
      this.vel.set(vx, vy, vz);
      if (hop) {
        const hv = 4.4 * sp.hop;
        this.vel.addScaledVector(n, hv);
        this.events.emit('hop', {});
      }
      this.pos.set(nx, Math.max(gn.h, predicted), nz);
      this.groundOrientation(false, dt);
      this.enterAir(gs);
      return;
    }
    const dh = gn.h - this.pos.y;
    if (dh / dt - vy > 2.2) {
      // stepped up a kerb or ledge
      this.suspFv += Math.min(3, (dh / dt - vy) * 0.15);
      this.suspRv += Math.min(3, (dh / dt - vy) * 0.1);
    }
    this.pos.set(nx, gn.h, nz);
    if (w.clampToWorld(this.pos)) {
      this.s *= 0.5;
      this.vl = 0;
    }
    if (w.inWater(this.pos.x, this.pos.z, this.pos.y)) return this.crash('Splash!');
    this.vel.set(vx, vy, vz);
    this.groundTime += dt;
    this.groundOrientation(false, dt);
    // remember safe places to respawn
    this.safeT += dt;
    if (this.safeT > 0.4 && this.groundTime > 0.6 && Math.abs(this.wheelie) < 0.1 && n.y > 0.9) {
      this.safeT = 0;
      const k = this.solid ? this.solid.kind : '';
      if (!k || k === 'slab' || k === 'building' || k === 'container' || k === 'prop') {
        this.safe.push({ x: this.pos.x, y: this.pos.y, z: this.pos.z, h: this.heading, t: this.time });
        if (this.safe.length > 40) this.safe.shift();
      }
    }
  }

  endWheelie() {
    if (this.wheelieTime > 0.4) this.events.emit('wheelieEnd', { time: this.wheelieTime, sweet: this.wheelieSweet });
    this.wheelieTime = 0;
    this.wheelieSweet = 0;
  }
  endStoppie() {
    if (this.stoppieTime > 0.3) this.events.emit('stoppieEnd', { time: this.stoppieTime });
    this.stoppieTime = 0;
  }

  // Build the visual orientation from heading, surface, lean and wheelie.
  groundOrientation(snap, dt = 0.016) {
    const sp = this.spec;
    const w = this.world;
    const hb = sp.wheelbase / 2;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const n = this.n;
    const slopeF = -(n.x * fx + n.z * fz) / n.y;
    const pred = slopeF * hb;
    let hF = w.groundAt(this.pos.x + fx * hb, this.pos.z + fz * hb, this.pos.y + Math.max(0, pred), this._g3).h - this.pos.y;
    hF = clamp(hF, pred - 0.2, pred + 0.5);
    let hR = w.groundAt(this.pos.x - fx * hb, this.pos.z - fz * hb, this.pos.y + Math.max(0, -pred), this._g3).h - this.pos.y;
    hR = clamp(hR, -pred - 0.2, -pred + 0.5);
    const pitch = Math.atan2(hF - hR, sp.wheelbase);
    this.pitchVis = snap ? pitch : this.pitchVis + (pitch - this.pitchVis) * damp(25, dt);
    const F = _v1.set(fx * Math.cos(this.pitchVis), Math.sin(this.pitchVis), fz * Math.cos(this.pitchVis));
    const U = _v2.copy(n).addScaledVector(F, -n.dot(F));
    if (U.lengthSq() < 1e-4) U.set(0, 1, 0);
    U.normalize();
    U.applyAxisAngle(F, this.lean);
    const R = _v3.crossVectors(F, U);
    _m.makeBasis(_v4.copy(R).negate(), U, F);
    this.q.setFromRotationMatrix(_m);
    this.root.copy(this.pos);
    this.root.y += (hF + hR) * 0.5;
    if (Math.abs(this.wheelie) > 1e-4) {
      const pivot = _v4.copy(this.root).addScaledVector(F, this.wheelie > 0 ? -hb : hb);
      _q1.setFromAxisAngle(R, this.wheelie);
      this.root.sub(pivot).applyQuaternion(_q1).add(pivot);
      this.q.premultiply(_q1);
    }
    this.com.copy(this.root).add(_v1.set(0, sp.comH, 0).applyQuaternion(this.q));
  }

  // ---------------------------------------------------------------------------
  enterAir(fromGround) {
    const sp = this.spec;
    this.mode = 'air';
    this.airTime = 0;
    this.maxHeight = 0;
    this.omega.set(0, 0, 0);
    this.rot.pitch = this.rot.yaw = this.rot.roll = 0;
    this.airTricks = [];
    this.whip.angle = 0;
    this.whip.count = 0;
    this.style = null;
    this.com.copy(this.root).add(_v1.set(0, sp.comH, 0).applyQuaternion(this.q));
    if (this.wheelieTime > 0) this.endWheelie();
    if (this.stoppieTime > 0) this.endStoppie();
    this.wheelie = 0;
    this.wheelieV = 0;
    this.arm = { up: false, down: false, left: false, right: false, t: 0 };
    this.takeoffSolid = fromGround.solid;
    this.takeoffPos = this.root.clone();
    this.vertAir = false;
    const sol = fromGround.solid;
    const sp3 = this.vel.length();
    if (sol && sol.vert && sp3 > 3 && this.vel.y / sp3 > 0.7) {
      this.vertAir = true;
      sol.toWorldDir(0, 1, this._dirTmp || (this._dirTmp = {}));
      const ax = this._dirTmp.x;
      const az = this._dirTmp.z;
      const along = this.vel.x * ax + this.vel.z * az;
      this.vel.x -= ax * along;
      this.vel.z -= az * along;
      // keep vert airs at a sensible height and drift back just inside the lip
      if (this.vel.y > 12.5) this.vel.y = 12.5;
      const T = (2 * this.vel.y) / G;
      const inward = clamp(0.7 / Math.max(T, 0.5), 0.15, 0.7);
      const nh = Math.hypot(fromGround.nx, fromGround.nz) || 1;
      this.vel.x += (fromGround.nx / nh) * inward;
      this.vel.z += (fromGround.nz / nh) * inward;
    }
    this.airWheel = this.s / sp.wheelR;
    this.takeoffEmitted = false;
    this.takeoffInfo = { solid: sol, vert: this.vertAir, speed: sp3, pos: this.takeoffPos };
  }

  stepAir(dt, inp) {
    const sp = this.spec;
    const w = this.world;
    this.airTime += dt;
    if (!this.takeoffEmitted && this.airTime > 0.1) {
      this.takeoffEmitted = true;
      this.events.emit('takeoff', this.takeoffInfo);
    }
    const arm = this.arm;
    arm.t += dt;
    for (const k of ['up', 'down', 'left', 'right']) if (!inp[k]) arm[k] = true;
    if (arm.t > 0.2 && inp.down) arm.down = true;
    if (arm.t > 0.4 && (inp.left || inp.right)) arm.left = arm.right = true;

    const trickHeld = inp.trick || !!inp.hotkeyHeld;
    const pitchIn = trickHeld ? 0 : (arm.down && inp.down ? 1 : 0) - (arm.up && inp.up ? 1 : 0);
    const yawIn = trickHeld ? 0 : (arm.left && inp.left ? 1 : 0) - (arm.right && inp.right ? 1 : 0);
    const ac = sp.air;
    const pMax = 4.3 * ac;
    const yMax = 5.4 * ac;
    const F = _v1.copy(Z).applyQuaternion(this.q);
    const U = _v2.copy(Y).applyQuaternion(this.q);
    const R = _v3.copy(X).applyQuaternion(this.q).negate();
    const om = this.omega;
    // a flip keeps turning through the upside-down part while a style trick is held
    if (pitchIn) om.x += (pitchIn * pMax - om.x) * damp(6, dt);
    else om.x *= Math.exp((trickHeld && U.y < 0.55 ? -0.7 : -3.2) * dt);
    if (yawIn) om.y += (yawIn * yMax - om.y) * damp(7, dt);
    else if (!this.vertAir) {
      // settle the spin onto the nearest full rotation so landings line up
      const rest = this.rot.yaw - Math.round(this.rot.yaw / TAU) * TAU;
      if (Math.abs(rest) < 1.3) om.y += (-rest * 4 - om.y) * damp(6, dt);
      else om.y *= Math.exp(-0.8 * dt);
    } else om.y *= Math.exp(-3 * dt);

    // roll back to level
    if (U.y > 0.15 && !this.vertAir) om.z += (R.y * 3.2 - om.z) * damp(4, dt);
    else om.z *= Math.exp(-2 * dt);
    // nose follows the trajectory when the rider is not flipping
    if (!pitchIn && ((U.y > 0.3 && !this.vertAir) || (this.vertAir && Math.abs(this.rot.yaw) > 2.5)) && Math.abs(om.x) < 3.6) {
      const vp = Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z));
      const bp = Math.asin(clamp(F.y, -1, 1));
      om.x += ((vp * 0.75 - bp) * 2.6 - om.x) * damp(U.y > 0.6 ? 4 : 2.5, dt);
    }
    // halfpipe: turn the bike around to come back in
    if (this.vertAir && !yawIn) {
      const dir = Math.sign(this.rot.yaw) || 1;
      const k = Math.max(0, Math.round((Math.abs(this.rot.yaw) - Math.PI) / TAU));
      const goal = dir * (Math.PI + k * TAU);
      const tt = Math.max(0.35, this.vel.y > 0 ? this.vel.y / G : 0.35);
      om.y += (clamp((goal - this.rot.yaw) / tt, -6, 6) - om.y) * damp(8, dt);
    }
    // apply rotation in body frame
    _v4.set(-om.x, om.y, om.z);
    const ang = _v4.length() * dt;
    if (ang > 1e-6) {
      _q1.setFromAxisAngle(_v4.normalize(), ang);
      this.q.multiply(_q1).normalize();
    }
    this.rot.pitch += om.x * dt;
    this.rot.yaw += om.y * dt;
    this.rot.roll += om.z * dt;

    this.updateStyle(dt, inp);

    // flight
    this.vel.y -= G * dt;
    const v = this.vel.length();
    this.vel.multiplyScalar(1 - 0.0013 * v * dt);
    if (this.boosting) this.vel.addScaledVector(F, 5 * dt);
    this.com.addScaledVector(this.vel, dt);
    if (w.clampToWorld(this.com)) {
      this.vel.x *= -0.3;
      this.vel.z *= -0.3;
    }
    // rear wheel spins up with throttle
    this.airWheel += ((inp.throttle ? 40 : this.airWheel * 0.4) - this.airWheel) * damp(2, dt);
    this.wheelAngF += this.s / sp.wheelF * dt * 0.98;

    // collisions
    const ch = sp.comH;
    const hb = sp.wheelbase / 2;
    this.root.copy(this.com).sub(_v4.set(0, ch, 0).applyQuaternion(this.q));
    // side impacts with walls
    const wl = w.wallAt(this.com.x, this.com.z, this.com.y - 0.55, 1.0, 0, this._w);
    if (wl) {
      const into = -(this.vel.x * wl.nx + this.vel.z * wl.nz);
      if (into > 9) return this.crash('Hit a wall');
      if (into > 0) {
        this.vel.x += wl.nx * into * 1.3;
        this.vel.z += wl.nz * into * 1.3;
      }
      this.com.x += wl.nx * (wl.depth + 0.05);
      this.com.z += wl.nz * (wl.depth + 0.05);
    }
    const hit = w.traffic && w.traffic.hitTest(this.com.x, this.com.y - 0.6, this.com.z, 0.5);
    if (hit) return this.crash('Hit a car');
    if (w.inWater(this.com.x, this.com.z, this.com.y - 0.4)) return this.crash('Splash!');
    // head hitting the ground
    const head = _v4.set(0, 1.05, -0.1).applyQuaternion(this.q).add(this.com);
    const gh = w.groundAt(head.x, head.z, head.y, this._g3);
    if (gh.h > head.y) return this.crash('Bailed');
    // track height above ground for scoring
    const gc = w.groundAt(this.com.x, this.com.z, this.com.y - 0.5, this._g3);
    this.heightAbove = this.com.y - ch - gc.h;
    this.maxHeight = Math.max(this.maxHeight, this.heightAbove);
    // wheels touching down
    let contact = null;
    let best = 0;
    for (const zoff of [hb, -hb]) {
      const p = _v4.set(0, -ch, zoff).applyQuaternion(this.q).add(this.com);
      const g = w.groundAt(p.x, p.z, p.y, zoff > 0 ? this._g : this._g2);
      const pen = g.h - p.y;
      const into = this.vel.x * g.nx + this.vel.y * g.ny + this.vel.z * g.nz;
      if (pen >= 0 && pen + 1 > best && (into < -0.4 || this.airTime > 0.3)) {
        best = pen + 1;
        contact = g;
        this.contactRear = zoff < 0;
      }
    }
    if (contact && this.airTime > 0.02) this.land(contact);
  }

  updateStyle(dt, inp) {
    const press = inp.trickEdge || inp.hotkeyEdge;
    if (!this.style && press && this.airTime > 0.12) {
      // only directions pressed after take-off count (holding the throttle through a jump still gives a Superman)
      const a = this.arm || {};
      const L = a.left && inp.left;
      const R = a.right && inp.right;
      const D = a.down && inp.down;
      const U = a.up && inp.up;
      const id = inp.hotkeyEdge ? inp.hotkey : L ? 'nohander' : R ? 'tailwhip' : D ? 'nofooter' : U ? 'heartattack' : 'superman';
      this.style = { id, blend: 0, hold: 0, held: true, full: false, done: false };
      this.events.emit('styleStart', { id });
    }
    const st = this.style;
    if (!st) return;
    st.held = inp.trick || inp.hotkeyHeld === st.id;
    if (st.id === 'tailwhip') {
      if (!st.done) {
        st.blend = Math.min(1, st.blend + dt * 6);
        this.whip.angle += dt * (TAU / 0.62) * Math.sqrt(this.spec.air);
        if (this.whip.angle >= TAU) {
          this.whip.angle -= TAU;
          this.whip.count++;
          this.events.emit('whip', { count: this.whip.count });
          if (!st.held) {
            this.whip.angle = 0;
            st.done = true;
            this.airTricks.push({ id: 'tailwhip', count: this.whip.count, hold: 0 });
          }
        }
      } else {
        st.blend = Math.max(0, st.blend - dt * 5);
        if (st.blend <= 0) this.style = null;
      }
      return;
    }
    if (st.held && !st.done) {
      st.blend = Math.min(1, st.blend + dt * 4.5);
      if (st.blend >= 1) {
        st.full = true;
        st.hold += dt;
      }
    } else {
      st.done = true;
      st.blend = Math.max(0, st.blend - dt * 4);
      if (st.blend <= 0) {
        if (st.full) {
          this.airTricks.push({ id: st.id, hold: st.hold });
          this.events.emit('styleTrick', { id: st.id, hold: st.hold });
        }
        this.style = null;
      }
    }
  }

  land(g) {
    const sp = this.spec;
    const n = _v1.set(g.nx, g.ny, g.nz);
    const F = _v2.copy(Z).applyQuaternion(this.q);
    const U = _v3.copy(Y).applyQuaternion(this.q);
    const rootNow = _v4.copy(this.com).sub(new THREE.Vector3(0, sp.comH, 0).applyQuaternion(this.q));
    const under = this.world.groundAt(rootNow.x, rootNow.z, rootNow.y + 0.4, this._g3);
    if (rootNow.y - under.h > 0.8) {
      // only one wheel caught an edge: bounce off it and keep flying
      const vn = this.vel.dot(n);
      if (vn < 0) this.vel.addScaledVector(n, -vn * 1.25);
      this.omega.x += this.contactRear ? -1.2 : 1.2;
      this.com.addScaledVector(n, 0.05);
      return;
    }
    const fg = F.clone().addScaledVector(n, -F.dot(n));
    const short = this.airTime < 0.3 && this.maxHeight < 0.7;
    if (fg.lengthSq() < 1e-4) return this.crash('Bailed');
    fg.normalize();
    const rg = new THREE.Vector3().crossVectors(fg, n);
    const pitchErr = Math.asin(clamp(F.dot(n), -1, 1));
    const rollErr = Math.asin(clamp(U.dot(rg), -1, 1));
    const upDot = U.dot(n);
    const vN = this.vel.dot(n);
    const vt = this.vel.clone().addScaledVector(n, -vN);
    const vts = vt.length();
    const yawErr = vts > 3 ? Math.atan2(vt.dot(rg), vt.dot(fg)) : 0;
    const impact = Math.max(0, -vN);
    const tol = sp.landTol || 1;
    this.lastImpact = impact;
    let reason = null;
    if (upDot < 0.25) reason = 'Bailed';
    else if (!short) {
      if (this.style && this.style.blend > 0.35) reason = 'Still in a trick!';
      else if (this.whip.angle > 0.6 && this.whip.angle < TAU - 0.6) reason = 'Tailwhip not finished';
      else if (Math.abs(rollErr) > 0.8 * tol) reason = 'Landed sideways';
      else if (pitchErr > 1.05 * tol) reason = 'Looped out';
      else if (pitchErr < -0.8 * tol) reason = 'Nose dive';
      else if (Math.abs(yawErr) > 1.05 * tol && vts > 5) reason = 'Landed sideways';
      else if (impact > sp.impact + this.impactBonus) reason = 'Too hard!';
    }
    if (reason) {
      return this.crash(reason);
    }
    const qn = Math.max(pitchErr > 0 ? pitchErr / 0.95 : -pitchErr / 0.75, Math.abs(rollErr) / 0.8, vts > 5 ? Math.abs(yawErr) / 1.05 : 0) / tol;
    const quality = short ? 'none' : qn < 0.22 ? 'perfect' : qn < 0.48 ? 'good' : 'sketchy';
    // switch to ground mode
    this.heading = Math.atan2(fg.x, fg.z);
    let s = vt.dot(fg);
    if (quality === 'sketchy') s *= 0.85;
    if (impact > 16) s *= 0.85;
    this.s = s;
    this.vl = clamp(vt.dot(rg), -10, 10);
    this.lean = clamp(rollErr * 0.8, -0.8, 0.8);
    this.wheelie = 0;
    this.wheelieV = 0;
    if (pitchErr > 0.25 && this.s > 3) this.wheelie = Math.min(pitchErr, 0.95) * 0.85;
    else if (pitchErr < -0.2 && this.s > 4) this.wheelie = Math.max(pitchErr, -0.45) * 0.7;
    this.root.copy(this.com).sub(_v4.set(0, sp.comH, 0).applyQuaternion(this.q));
    const gp = this.world.groundAt(this.root.x, this.root.z, this.root.y + 0.4, this._g3);
    this.pos.set(this.root.x, gp.h, this.root.z);
    this.n.set(gp.nx, gp.ny, gp.nz);
    const fr = clamp(-pitchErr * 2 + 0.5, 0.2, 1);
    this.suspFv += impact * 0.42 * fr;
    this.suspRv += impact * 0.42 * (1.2 - fr);
    this.mode = 'ground';
    this.groundTime = 0;
    this.omega.set(0, 0, 0);
    const data = {
      quality,
      short,
      airTime: this.airTime,
      impact,
      rot: { ...this.rot },
      maxHeight: this.maxHeight,
      takeoffSolid: this.takeoffSolid,
      takeoffPos: this.takeoffPos,
      landSolid: g.solid,
      pos: this.pos.clone(),
      vert: this.vertAir,
      tricks: this.airTricks.slice(),
      speed: Math.abs(this.s),
    };
    this.airTricks = [];
    this.style = null;
    this.whip.angle = 0;
    this.vertAir = false;
    this.groundOrientation(true);
    if (this.takeoffEmitted || data.tricks.length) this.events.emit('land', data);
  }

  // ---------------------------------------------------------------------------
  enterLoop(L) {
    this.mode = 'loop';
    this.loop = { def: L, theta: 0 };
    this.wheelie = 0;
    this.lean = 0;
    this.vl = 0;
    this.events.emit('loopStart', {});
  }

  loopPoint(L, th, out) {
    const f = _v1.set(Math.sin(L.yaw), 0, Math.cos(L.yaw));
    const r = _v2.set(-Math.cos(L.yaw), 0, Math.sin(L.yaw));
    out.set(L.x, L.y, L.z).addScaledVector(f, L.R * Math.sin(th)).addScaledVector(r, (L.shift * th) / TAU);
    out.y += L.R * (1 - Math.cos(th));
    return out;
  }

  stepLoop(dt, inp) {
    const sp = this.spec;
    const lp = this.loop;
    const L = lp.def;
    const th = lp.theta;
    if (inp.throttle > 0) this.s += sp.accel * 0.55 * (1 - this.s / sp.topSpeed) * inp.throttle * dt;
    this.s -= G * Math.sin(th) * dt + 0.015 * this.s * dt;
    const N = (this.s * this.s) / L.R + G * Math.cos(th);
    const f = new THREE.Vector3(Math.sin(L.yaw), 0, Math.cos(L.yaw));
    const r = new THREE.Vector3(-Math.cos(L.yaw), 0, Math.sin(L.yaw));
    const T = new THREE.Vector3().addScaledVector(f, Math.cos(th)).addScaledVector(Y, Math.sin(th)).addScaledVector(r, L.shift / (TAU * L.R)).normalize();
    const U = new THREE.Vector3().addScaledVector(f, -Math.sin(th)).addScaledVector(Y, Math.cos(th)).normalize();
    if ((N < 0.8 || this.s < 1) && th > 0.5 && th < TAU - 0.5) {
      // fell off the loop
      this.vel.copy(T).multiplyScalar(Math.max(this.s, 0));
      this.root.copy(this.pos);
      this.mode = 'air';
      this.airTime = 0.3;
      this.maxHeight = 0;
      this.arm = { up: true, down: true, left: true, right: true, t: 1 };
      this.airTricks = [];
      this.rot.pitch = this.rot.yaw = this.rot.roll = 0;
      this.com.copy(this.pos).addScaledVector(U, sp.comH);
      this.takeoffSolid = null;
      this.takeoffPos = this.pos.clone();
      this.vertAir = false;
      this.style = null;
      this.takeoffEmitted = true;
      this.takeoffInfo = { solid: null, vert: false, speed: this.s, pos: this.takeoffPos };
      this.events.emit('loopFail', {});
      return;
    }
    lp.theta += (this.s / L.R) * dt;
    this.loopPoint(L, lp.theta, this.pos);
    const Rv = new THREE.Vector3().crossVectors(T, U);
    _m.makeBasis(Rv.clone().negate(), U, T);
    this.q.setFromRotationMatrix(_m);
    this.root.copy(this.pos);
    this.com.copy(this.pos).addScaledVector(U, sp.comH);
    this.vel.copy(T).multiplyScalar(this.s);
    this.wheelAngF += (this.s / sp.wheelF) * dt;
    this.wheelAngR += (this.s / sp.wheelR) * dt;
    if (lp.theta >= TAU) {
      this.mode = 'ground';
      this.heading = L.yaw;
      this.loopPoint(L, TAU, this.pos);
      this.pos.y = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3, this._g).h;
      this.loop = null;
      this.groundTime = 0.5;
      this.groundOrientation(true);
      this.events.emit('loop', {});
    }
  }

  // ---------------------------------------------------------------------------
  crash(reason) {
    if (this.mode === 'crash') return;
    const prev = this.mode;
    if (prev === 'ground') this.groundOrientation(true);
    const sp = this.spec;
    this.com.copy(this.root).add(_v1.set(0, sp.comH, 0).applyQuaternion(this.q));
    this.mode = 'crash';
    this.crashT = 0;
    this.crashReason = reason;
    const v = this.vel.clone();
    const speed = v.length();
    const rnd = () => (Math.random() - 0.5) * 2;
    this.cb = {
      pos: this.com.clone(),
      vel: v.clone().multiplyScalar(0.8).add(new THREE.Vector3(rnd(), 1.5 + Math.random() * 2, rnd())),
      q: this.q.clone(),
      w: new THREE.Vector3(rnd() * 4, rnd() * 3, rnd() * 4).multiplyScalar(0.4 + speed * 0.06),
      r: 0.45,
    };
    this.rb = {
      pos: this.com.clone().add(_v2.set(0, 0.55, -0.1).applyQuaternion(this.q)),
      vel: v.clone().multiplyScalar(0.92).add(new THREE.Vector3(rnd() * 1.5, 2.5 + speed * 0.06, rnd() * 1.5)),
      q: this.q.clone(),
      w: new THREE.Vector3(rnd() * 5, rnd() * 3, rnd() * 5).multiplyScalar(0.5 + speed * 0.05),
      r: 0.35,
    };
    this.style = null;
    this.whip.angle = 0;
    this.wheelieTime = 0;
    this.stoppieTime = 0;
    this.events.emit('crash', { reason, speed });
  }

  stepCrash(dt) {
    const w = this.world;
    this.crashT += dt;
    for (const b of [this.cb, this.rb]) {
      b.vel.y -= G * dt;
      b.pos.addScaledVector(b.vel, dt);
      w.clampToWorld(b.pos);
      const gh = w.groundAt(b.pos.x, b.pos.z, b.pos.y - b.r + 0.3, this._g3).h;
      if (b.pos.y - b.r < gh) {
        b.pos.y = gh + b.r;
        if (b.vel.y < 0) {
          if (b.vel.y < -3 && b === this.cb) this.events.emit('crashBounce', { speed: -b.vel.y });
          b.vel.y *= -0.3;
        }
        const f = Math.exp(-3 * dt);
        b.vel.x *= f;
        b.vel.z *= f;
        b.w.multiplyScalar(Math.exp(-2.5 * dt));
      }
      const wl = w.wallAt(b.pos.x, b.pos.z, b.pos.y - b.r, b.r * 2, 0, this._w);
      if (wl) {
        const into = -(b.vel.x * wl.nx + b.vel.z * wl.nz);
        if (into > 0) {
          b.vel.x += wl.nx * into * 1.4;
          b.vel.z += wl.nz * into * 1.4;
        }
        b.pos.x += wl.nx * (wl.depth + 0.02);
        b.pos.z += wl.nz * (wl.depth + 0.02);
      }
      const a = b.w.length() * dt;
      if (a > 1e-6) {
        _q1.setFromAxisAngle(_v1.copy(b.w).normalize(), a);
        b.q.premultiply(_q1).normalize();
      }
    }
    this.com.copy(this.cb.pos);
    this.q.copy(this.cb.q);
    this.root.copy(this.com).sub(_v1.set(0, this.spec.comH, 0).applyQuaternion(this.q));
    this.vel.copy(this.cb.vel);
  }

  // ---------------------------------------------------------------------------
  updateEngine(dt, inp) {
    const sp = this.spec;
    const n = sp.gears;
    this.throttleIn = inp.throttle;
    if (this.shiftT > 0) this.shiftT -= dt;
    let ws;
    if (this.mode === 'ground' || this.mode === 'loop') ws = Math.abs(this.s) + this.wheelspin * 5;
    else ws = Math.abs(this.airWheel * sp.wheelR);
    if (this.mode === 'ground' || this.mode === 'loop') {
      if (this.gear < n - 1 && ws > this.gearTops[this.gear] * 0.97 && inp.throttle > 0.2 && this.shiftT <= 0) {
        this.gear++;
        this.shiftT = 0.16;
        this.events.emit('shift', { up: true });
      } else if (this.gear > 0 && ws < this.gearTops[this.gear - 1] * 0.6) {
        this.gear--;
        this.events.emit('shift', { up: false });
      }
    }
    let target = sp.idle + (sp.redline - sp.idle) * clamp(ws / this.gearTops[this.gear], 0, 1.03);
    if (ws < 2 && this.mode !== 'air') target = sp.idle + (sp.redline - sp.idle) * 0.5 * inp.throttle;
    if (this.mode === 'air') target = inp.throttle ? sp.redline * 0.95 : Math.max(sp.idle * 1.3, this.rpm * 0.9);
    if (this.mode === 'crash') target = sp.idle;
    if (this.shiftT > 0) target *= 0.8;
    this.rpm += (target - this.rpm) * damp(this.mode === 'air' ? 5 : 13, dt);
  }

  updateSuspension(dt, inp) {
    const sp = this.spec;
    const tr = sp.travel;
    let tF = -0.1 * tr;
    let tR = -0.1 * tr;
    if (this.mode === 'ground' || this.mode === 'loop') {
      tF = inp.brake * 0.3 * tr - (this.wheelie > 0 ? 0.25 * tr : 0) + 0.05 * tr;
      tR = inp.throttle * 0.12 * tr + 0.05 * tr;
      if (this.mode === 'loop') {
        tF += 0.3 * tr;
        tR += 0.3 * tr;
      }
      const bump = SURFACES[this.surface].bump * Math.min(Math.abs(this.s), 25);
      if (bump > 0) {
        this.suspFv += (Math.random() - 0.5) * bump * 3;
        this.suspRv += (Math.random() - 0.5) * bump * 3;
      }
      this.wheelAngF += (this.s / sp.wheelF) * dt;
      this.wheelAngR += ((this.s + this.wheelspin * 6) / sp.wheelR) * dt;
    } else if (this.mode === 'air') {
      this.wheelAngR += this.airWheel * dt;
    }
    const k = 170;
    const d = 15;
    this.suspFv += ((tF - this.suspF) * k - this.suspFv * d) * dt;
    this.suspRv += ((tR - this.suspR) * k - this.suspRv * d) * dt;
    this.suspF = clamp(this.suspF + this.suspFv * dt, -0.15 * tr, tr);
    this.suspR = clamp(this.suspR + this.suspRv * dt, -0.15 * tr, tr);
  }
}

// Camera modes: chase, first person, cinematic trackside, side view, plus the menu flyover.
import * as THREE from 'three';
import { clamp, damp, wrapAngle, lerp } from '../core/math.js';

export const CAM_NAMES = ['Chase Cam', 'First Person', 'Cinematic', 'Side Cam'];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.mode = 0;
    this.yaw = 0;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.zoom = 1;
    this.shakeAmp = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.fov = 70;
    this.baseFov = 70;
    this.cine = null;
    this.snap = true;
    this.invertY = false;
  }

  setMode(m) {
    this.mode = ((m % 4) + 4) % 4;
    this.snap = true;
    this.cine = null;
    this.orbitYaw = this.orbitPitch = 0;
  }

  shake(a) {
    this.shakeAmp = Math.min(1.2, Math.max(this.shakeAmp, a));
  }

  focusOf(bike) {
    const P = bike.physics;
    return P.mode === 'crash' ? P.cb.pos : P.com;
  }

  // reference heading for the camera: bike heading on the ground, travel direction in the air
  refYaw(P) {
    if (P.mode === 'ground') return P.s < -0.5 ? P.heading : P.heading;
    if (P.mode === 'loop') return P.loop.def.yaw;
    const v = P.mode === 'crash' ? P.cb.vel : P.vel;
    if (Math.hypot(v.x, v.z) > 3.5) return Math.atan2(v.x, v.z);
    return this.yaw;
  }

  update(dt, bike, mouse) {
    const P = bike.physics;
    const cam = this.camera;
    const focus = this.focusOf(bike);
    // mouse orbit
    if (mouse) {
      this.orbitYaw -= mouse.dx * 0.005;
      this.orbitPitch += mouse.dy * 0.004 * (this.invertY ? -1 : 1);
      this.orbitPitch = clamp(this.orbitPitch, -0.45, 1.1);
      if (mouse.wheel) this.zoom = clamp(this.zoom * Math.pow(1.12, mouse.wheel), 0.6, 2.4);
      if (!mouse.active) {
        this.orbitYaw *= Math.exp(-2.2 * dt);
        this.orbitPitch *= Math.exp(-2.2 * dt);
      }
      this.orbitYaw = wrapAngle(this.orbitYaw);
    }
    const speed = P.speed;
    const target = this.refYaw(P);
    const k = this.snap ? 1 : damp(P.mode === 'air' ? 2.2 : 4.5, dt);
    this.yaw = wrapAngle(this.yaw + wrapAngle(target - this.yaw) * k);
    let fovTarget = this.baseFov + clamp((speed - 10) * 0.18, 0, 16) + (P.boosting ? 7 : 0);
    let near = 0.1;
    const mode = P.mode === 'crash' && this.mode === 1 ? 0 : this.mode;
    bike.setFirstPerson(mode === 1 && P.mode !== 'crash');

    if (mode === 0) {
      const air = P.mode === 'air' ? 1 : 0;
      this.airBlend = (this.airBlend || 0) + (air - (this.airBlend || 0)) * damp(air ? 1.5 : 3, dt);
      const ab = this.airBlend;
      const dist = (5.2 + speed * 0.028 + ab * 2.6) * this.zoom;
      const height = 1.75 + speed * 0.008 + ab * 1.6;
      const yaw = this.yaw + this.orbitYaw;
      const pitch = this.orbitPitch + 0.08;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      _v.set(focus.x - fx * dist * Math.cos(pitch), focus.y + height + dist * Math.sin(pitch), focus.z - fz * dist * Math.cos(pitch));
      _look.set(focus.x + fx * Math.min(speed * 0.06, 3), focus.y + 0.75 + ab * 0.3, focus.z + fz * Math.min(speed * 0.06, 3));
      this.avoid(focus, _v);
      if (this.snap) this.pos.copy(_v);
      else {
        this.pos.x += (_v.x - this.pos.x) * damp(14, dt);
        this.pos.z += (_v.z - this.pos.z) * damp(14, dt);
        this.pos.y += (_v.y - this.pos.y) * damp(P.mode === 'air' ? 4 : 9, dt);
      }
      this.look.lerp(_look, this.snap ? 1 : damp(12, dt));
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
    } else if (mode === 1) {
      bike.eyeWorld(_v);
      cam.position.copy(_v);
      _q.copy(P.q).multiply(FLIP);
      _e.set(-0.17 - this.orbitPitch * 0.8, this.orbitYaw * 1.2, 0, 'YXZ');
      cam.quaternion.copy(_q).multiply(_q2.setFromEuler(_e));
      // partially level the horizon on the ground for comfort
      if (P.mode === 'ground') {
        const up = _v2.set(0, 1, 0).applyQuaternion(cam.quaternion);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
        const roll = Math.asin(clamp(up.dot(right), -1, 1));
        cam.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll * 0.55));
      }
      this.pos.copy(cam.position);
      this.look.copy(cam.position).add(new THREE.Vector3(0, 0, -5).applyQuaternion(cam.quaternion));
      near = 0.05;
      fovTarget += 6;
    } else if (mode === 2) {
      this.updateCinematic(dt, P, focus);
      cam.position.copy(this.pos);
      this.look.lerp(_look.copy(focus).add(_v2.set(0, 0.4, 0)), this.snap ? 1 : damp(10, dt));
      cam.lookAt(this.look);
      const d = this.pos.distanceTo(focus);
      fovTarget = clamp((2 * Math.atan(4.5 / Math.max(d, 1)) * 180) / Math.PI, 12, 62);
    } else {
      const yaw = this.yaw + this.orbitYaw + Math.PI / 2;
      const dist = 9.5 * this.zoom;
      _v.set(focus.x + Math.sin(yaw) * dist, focus.y + 1.4 + this.orbitPitch * 6, focus.z + Math.cos(yaw) * dist);
      this.avoid(focus, _v);
      if (this.snap) this.pos.copy(_v);
      else this.pos.lerp(_v, damp(6, dt));
      this.look.lerp(_look.copy(focus).add(_v2.set(0, 0.5, 0)), this.snap ? 1 : damp(10, dt));
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
      fovTarget = this.baseFov - 6;
    }
    // shake
    if (this.shakeAmp > 0.001) {
      const a = this.shakeAmp;
      cam.position.x += (Math.random() - 0.5) * a * 0.25;
      cam.position.y += (Math.random() - 0.5) * a * 0.25;
      cam.position.z += (Math.random() - 0.5) * a * 0.25;
      this.shakeAmp *= Math.exp(-6 * dt);
    }
    if (P.boosting && mode !== 2) this.shakeAmp = Math.max(this.shakeAmp, 0.08);
    this.fov = this.snap ? fovTarget : lerp(this.fov, fovTarget, damp(mode === 2 ? 3 : 5, dt));
    if (Math.abs(cam.fov - this.fov) > 0.01 || cam.near !== near) {
      cam.fov = this.fov;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
    this.snap = false;
  }

  // keep the camera out of buildings and above the ground
  avoid(focus, p) {
    const w = this.world;
    const dx = p.x - focus.x;
    const dy = p.y - focus.y;
    const dz = p.z - focus.z;
    const len = Math.hypot(dx, dy, dz);
    const steps = Math.ceil(len / 0.5);
    for (let i = 2; i <= steps; i++) {
      const t = i / steps;
      const x = focus.x + dx * t;
      const y = focus.y + dy * t;
      const z = focus.z + dz * t;
      if (w.topAt(x, z) > y - 0.2) {
        const tt = Math.max(0.15, (i - 1.5) / steps);
        p.set(focus.x + dx * tt, focus.y + dy * tt + 0.4, focus.z + dz * tt);
        break;
      }
    }
    const g = w.topAt(p.x, p.z) + 0.35;
    if (p.y < g) p.y = g;
  }

  updateCinematic(dt, P, focus) {
    const v = P.mode === 'crash' ? P.cb.vel : P.vel;
    const sp = Math.hypot(v.x, v.z);
    const c = this.cine;
    const d = c ? c.pos.distanceTo(focus) : 1e9;
    let behind = false;
    if (c) {
      _v.subVectors(c.pos, focus);
      behind = _v.x * v.x + _v.z * v.z < 0;
    }
    if (sp < 1.5) {
      // slow orbit around a parked bike
      this.orbitT = (this.orbitT || 0) + dt * 0.25;
      _v.set(focus.x + Math.cos(this.orbitT) * 7, focus.y + 1.6, focus.z + Math.sin(this.orbitT) * 7);
      this.avoid(focus, _v);
      this.pos.lerp(_v, this.snap ? 1 : damp(2, dt));
      this.cine = null;
      return;
    }
    if (!c || d > 75 || (behind && d > 28) || c.t > 9 || this.snap) {
      // place a new trackside camera ahead of the action
      const dirx = v.x / sp;
      const dirz = v.z / sp;
      const ahead = clamp(sp * 1.6, 18, 55);
      const side = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10);
      const x = focus.x + dirx * ahead - dirz * side;
      const z = focus.z + dirz * ahead + dirx * side;
      const y = Math.max(this.world.topAt(x, z) + 1.4 + Math.random() * 4, focus.y + (P.mode === 'air' ? 2 : 0.5));
      _v.set(x, y, z);
      this.avoid(focus, _v);
      this.cine = { pos: _v.clone(), t: 0 };
      this.pos.copy(_v);
      this.snap = true;
    }
    this.cine.t += dt;
    this.pos.copy(this.cine.pos);
  }

  // slow flyover for the main menu
  flyover(dt, t) {
    const a = t * 0.05 + 2.2;
    const r = 150;
    this.camera.position.set(Math.cos(a) * r + 30, 30 + Math.sin(t * 0.13) * 7, Math.sin(a) * r - 70);
    this.camera.lookAt(30, 3, -70);
    if (this.camera.fov !== 55) {
      this.camera.fov = 55;
      this.camera.near = 0.1;
      this.camera.updateProjectionMatrix();
    }
    this.snap = true;
  }
}

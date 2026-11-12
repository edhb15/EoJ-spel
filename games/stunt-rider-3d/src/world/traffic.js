// Simple AI traffic in the city grid and on the highway.
import * as THREE from 'three';
import { CITY_X, CITY_Z } from './layout.js';
import { carBodyGeo, carDetailGeo } from './props.js';
import { Rng, wrapAngle, clamp } from '../core/math.js';

export const CAR_COLORS = ['#c0392b', '#2c3e50', '#ecf0f1', '#2980b9', '#7f8c8d', '#f1c40f', '#16a085', '#8e44ad', '#d35400', '#1b1b1b'];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

export class Traffic {
  constructor(scene, vcMat) {
    this.rng = new Rng(4242);
    this.cars = [];
    const n = 36;
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.45 });
    this.body = new THREE.InstancedMesh(carBodyGeo(), bodyMat, n);
    this.detail = new THREE.InstancedMesh(carDetailGeo(), vcMat, n);
    for (const m of [this.body, this.detail]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.enabled = true;
    // city cars
    for (let i = 0; i < 20; i++) {
      const ix = this.rng.int(0, CITY_X.length - 1);
      const iz = this.rng.int(0, CITY_Z.length - 1);
      const car = { kind: 'city', node: [ix, iz], prev: null, wps: [], x: CITY_X[ix], z: CITY_Z[iz], yaw: 0, speed: 0, len: 4.4, wid: 1.85 };
      this.extend(car);
      const w = car.wps[0];
      car.x = w[0];
      car.z = w[1];
      car.yaw = Math.atan2(car.wps[1][0] - w[0], car.wps[1][1] - w[1]);
      this.cars.push(car);
    }
    // highway cars
    for (let i = 0; i < 16; i++) {
      const east = i % 2 === 0;
      const lane = this.rng.int(0, 1);
      const z = -1000 + (east ? 1 : -1) * (lane ? 7.5 : 2.5);
      const car = { kind: 'hw', east, x: this.rng.float(-940, 940), z, yaw: east ? Math.PI / 2 : -Math.PI / 2, speed: 0, cruise: this.rng.float(24, 34) - lane * 5, len: 4.4, wid: 1.85 };
      this.cars.push(car);
    }
    this.cars.forEach((c, i) => {
      this.body.setColorAt(i, _c.set(CAR_COLORS[i % CAR_COLORS.length]));
    });
    this.body.instanceColor.needsUpdate = true;
    this.updateMatrices();
  }

  setEnabled(on) {
    this.enabled = on;
    this.body.visible = this.detail.visible = on;
  }

  extend(car) {
    while (car.wps.length < 4) {
      const [ix, iz] = car.node;
      const opts = [];
      if (ix > 0) opts.push([ix - 1, iz]);
      if (ix < CITY_X.length - 1) opts.push([ix + 1, iz]);
      if (iz > 0) opts.push([ix, iz - 1]);
      if (iz < CITY_Z.length - 1) opts.push([ix, iz + 1]);
      let choices = opts.filter((o) => !car.prev || o[0] !== car.prev[0] || o[1] !== car.prev[1]);
      if (!choices.length) choices = opts;
      const next = this.rng.pick(choices);
      const ax = CITY_X[ix];
      const az = CITY_Z[iz];
      const bx = CITY_X[next[0]];
      const bz = CITY_Z[next[1]];
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      // right-hand lane: right of travel direction
      const rx = -dz;
      const rz = dx;
      const off = 3.2;
      car.wps.push([ax + dx * 13 + rx * off, az + dz * 13 + rz * off]);
      car.wps.push([bx - dx * 13 + rx * off, bz - dz * 13 + rz * off]);
      car.prev = car.node;
      car.node = next;
    }
  }

  update(dt, player) {
    if (!this.enabled) return;
    const px = player ? player.x : 1e9;
    const pz = player ? player.z : 1e9;
    for (const car of this.cars) {
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      // obstacle ahead? (player or other car)
      let block = 1e9;
      const look = (ox, oz) => {
        const dx = ox - car.x;
        const dz = oz - car.z;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 22 && side < 2.6) block = Math.min(block, ahead);
      };
      look(px, pz);
      for (const o of this.cars) if (o !== car && Math.abs(o.x - car.x) < 25 && Math.abs(o.z - car.z) < 25) look(o.x, o.z);
      let target;
      if (car.kind === 'hw') {
        target = car.cruise;
        car.x += (car.east ? 1 : -1) * car.speed * dt;
        if (car.x > 955 && car.east) car.x = -955;
        if (car.x < -955 && !car.east) car.x = 955;
      } else {
        const w = car.wps[0];
        const dx = w[0] - car.x;
        const dz = w[1] - car.z;
        const d = Math.hypot(dx, dz);
        if (d < 4) {
          car.wps.shift();
          this.extend(car);
          continue;
        }
        const want = Math.atan2(dx, dz);
        const err = wrapAngle(want - car.yaw);
        const maxTurn = (Math.max(car.speed, 2) / 7) * dt;
        car.yaw += clamp(err, -maxTurn, maxTurn);
        target = Math.abs(err) > 0.35 ? 6 : 13;
        car.x += Math.sin(car.yaw) * car.speed * dt;
        car.z += Math.cos(car.yaw) * car.speed * dt;
      }
      if (block < 22) target = Math.min(target, Math.max(0, (block - 7) * 0.9));
      const acc = target > car.speed ? 3.5 : 9;
      car.speed += clamp(target - car.speed, -acc * dt, acc * dt);
    }
    this.updateMatrices();
  }

  updateMatrices() {
    this.cars.forEach((car, i) => {
      _q.setFromAxisAngle(_up, car.yaw);
      _p.set(car.x, car.kind === 'city' ? 0.06 : 0.07, car.z);
      _m.compose(_p, _q, _s);
      this.body.setMatrixAt(i, _m);
      this.detail.setMatrixAt(i, _m);
    });
    this.body.instanceMatrix.needsUpdate = true;
    this.detail.instanceMatrix.needsUpdate = true;
  }

  // Bike vs car: returns the car hit (with velocity) or null.
  hitTest(x, y, z, r = 0.6) {
    if (!this.enabled || y > 2.2) return null;
    for (const car of this.cars) {
      const dx = x - car.x;
      const dz = z - car.z;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      const c = Math.cos(car.yaw);
      const s = Math.sin(car.yaw);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) < car.wid / 2 + r && Math.abs(lz) < car.len / 2 + r) {
        // push direction: smallest penetration axis
        const px = car.wid / 2 + r - Math.abs(lx);
        const pz = car.len / 2 + r - Math.abs(lz);
        let nx;
        let nz;
        if (px < pz) {
          nx = Math.sign(lx) * c;
          nz = -Math.sign(lx) * s;
        } else {
          nx = Math.sign(lz) * s;
          nz = Math.sign(lz) * c;
        }
        return { car, nx, nz, depth: Math.min(px, pz), vx: Math.sin(car.yaw) * car.speed, vz: Math.cos(car.yaw) * car.speed };
      }
    }
    return null;
  }
}

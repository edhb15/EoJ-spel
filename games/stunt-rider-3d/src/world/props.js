// Instanced props: trees, rocks, lamps, crowds, containers, parked vehicles...
import * as THREE from 'three';
import { mergeColored, colorize, cylBetween } from './geom.js';
import { containerTexture } from './textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

export class InstancePool {
  constructor(geometry, material, { chunk = 320, castShadow = true, receiveShadow = true } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.chunk = chunk;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.items = [];
    this.meshes = [];
  }
  add(x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, color = null) {
    this.items.push({ x, y, z, yaw, sx, sy, sz, color });
  }
  build(parent) {
    const buckets = new Map();
    for (const it of this.items) {
      const k = this.chunk ? Math.floor(it.x / this.chunk) * 1000 + Math.floor(it.z / this.chunk) : 0;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(it);
    }
    for (const list of buckets.values()) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, list.length);
      const hasColor = list.some((i) => i.color);
      list.forEach((it, i) => {
        _q.setFromAxisAngle(_up, it.yaw);
        _p.set(it.x, it.y, it.z);
        _s.set(it.sx, it.sy, it.sz);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m);
        if (hasColor) mesh.setColorAt(i, _c.set(it.color || '#ffffff'));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = this.castShadow;
      mesh.receiveShadow = this.receiveShadow;
      mesh.userData.fullCount = list.length;
      parent.add(mesh);
      this.meshes.push(mesh);
    }
    return this.meshes;
  }
  // show only a fraction of instances (quality setting)
  setDensity(f) {
    for (const m of this.meshes) m.count = Math.max(0, Math.floor(m.userData.fullCount * f));
  }
}

// ---------- geometries ----------

export function pineGeo() {
  const parts = [colorize(new THREE.CylinderGeometry(0.22, 0.35, 3, 5, 1, true).translate(0, 1.5, 0), '#5a3f28')];
  const levels = [
    [2.6, 3.6, 2.2, '#2c5628'],
    [2.0, 3.2, 4.2, '#30602c'],
    [1.35, 2.8, 6.0, '#356a30'],
  ];
  for (const [r, h, y, c] of levels) parts.push(colorize(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y + h / 2 - 0.4, 0), c));
  return mergeColored(parts);
}

export function oakGeo() {
  const parts = [colorize(new THREE.CylinderGeometry(0.25, 0.4, 3.2, 5, 1, true).translate(0, 1.6, 0), '#5b432c')];
  parts.push(colorize(new THREE.IcosahedronGeometry(2.6, 0).translate(0, 4.6, 0), '#4c7a32'));
  parts.push(colorize(new THREE.IcosahedronGeometry(1.8, 0).translate(1.2, 5.6, 0.5), '#55853a'));
  parts.push(colorize(new THREE.IcosahedronGeometry(1.7, 0).translate(-1.1, 5.2, -0.6), '#477330'));
  return mergeColored(parts);
}

export function birchGeo() {
  const parts = [colorize(new THREE.CylinderGeometry(0.15, 0.22, 5, 5, 1, true).translate(0, 2.5, 0), '#e6e1d6')];
  parts.push(colorize(new THREE.IcosahedronGeometry(1.8, 0).scale(1, 1.5, 1).translate(0, 5.8, 0), '#7fa548'));
  return mergeColored(parts);
}

export function rockGeo() {
  const g = new THREE.DodecahedronGeometry(1, 0).toNonIndexed();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * 0.65);
  g.computeVertexNormals();
  return colorize(g, '#8a857b');
}

export function bushGeo() {
  return colorize(new THREE.IcosahedronGeometry(1, 0).scale(1.2, 0.8, 1.2).translate(0, 0.5, 0), '#4a7330');
}

export function lampGeo() {
  const parts = [
    colorize(new THREE.CylinderGeometry(0.1, 0.16, 8, 6).translate(0, 4, 0), '#54585e'),
    colorize(new THREE.BoxGeometry(0.12, 0.12, 2.2).translate(0, 7.9, 1.0), '#54585e'),
    colorize(new THREE.BoxGeometry(0.5, 0.18, 0.9).translate(0, 7.8, 2.0), '#f6efd0'),
  ];
  return mergeColored(parts);
}

export function trafficLightGeo() {
  const parts = [
    colorize(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 6).translate(0, 2.1, 0), '#3b3f44'),
    colorize(new THREE.BoxGeometry(0.4, 1.2, 0.4).translate(0, 4.6, 0), '#222'),
  ];
  return mergeColored(parts);
}

export function lensGeo() {
  return new THREE.SphereGeometry(0.13, 8, 6).translate(0, 4.6, 0.21);
}

export function tireGeo() {
  return colorize(new THREE.TorusGeometry(0.45, 0.2, 6, 12).rotateX(Math.PI / 2).translate(0, 0.2, 0), '#1c1c1c');
}

export function hayGeo() {
  return colorize(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 12).rotateZ(Math.PI / 2).translate(0, 0.75, 0), '#d8b858');
}

export function barrierGeo() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.3, 0);
  shape.lineTo(0.3, 0);
  shape.lineTo(0.12, 0.3);
  shape.lineTo(0.1, 0.8);
  shape.lineTo(-0.1, 0.8);
  shape.lineTo(-0.12, 0.3);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 5.6, bevelEnabled: false });
  g.translate(0, 0, -2.8);
  g.rotateY(Math.PI / 2);
  const top = new THREE.BoxGeometry(5.6, 0.12, 0.22).translate(0, 0.8, 0);
  return mergeColored([colorize(g, '#c9c6bd'), colorize(top, '#d33a2c')]);
}

export function personBodyGeo() {
  return mergeColored([new THREE.CapsuleGeometry(0.22, 0.5, 3, 6).translate(0, 1.1, 0)]);
}
export function personRestGeo() {
  return mergeColored([
    colorize(new THREE.SphereGeometry(0.16, 8, 6).translate(0, 1.62, 0), '#d9a67e'),
    colorize(new THREE.BoxGeometry(0.32, 0.75, 0.22).translate(0, 0.42, 0), '#2a2f3a'),
  ]);
}

export function containerGeo() {
  const g = new THREE.BoxGeometry(12.2, 2.6, 2.44);
  g.translate(0, 1.3, 0);
  return g;
}

export function containerMaterial() {
  return new THREE.MeshStandardMaterial({ map: containerTexture('#e8e8e8'), roughness: 0.7, metalness: 0.3 });
}

// Car shape used for traffic and parked cars. Body (tinted) and details split.
export function carBodyGeo(len = 4.4, wid = 1.85, h = 1.45) {
  const lower = new THREE.BoxGeometry(wid, 0.7, len).translate(0, 0.65, 0);
  const cabin = new THREE.BoxGeometry(wid * 0.92, 0.55, len * 0.5).translate(0, 1.25, -len * 0.05);
  void h;
  return mergeColored([lower, cabin]);
}
export function carDetailGeo(len = 4.4, wid = 1.85) {
  const parts = [];
  const glass = new THREE.BoxGeometry(wid * 0.94, 0.42, len * 0.46).translate(0, 1.25, -len * 0.05);
  parts.push(colorize(glass, '#1e2933'));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(colorize(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10).rotateZ(Math.PI / 2).translate(sx * (wid / 2 - 0.08), 0.34, sz * len * 0.32), '#151515'));
    }
    parts.push(colorize(new THREE.BoxGeometry(0.3, 0.14, 0.05).translate(sx * (wid / 2 - 0.3), 0.75, len / 2 + 0.01), '#fff6d8'));
    parts.push(colorize(new THREE.BoxGeometry(0.3, 0.14, 0.05).translate(sx * (wid / 2 - 0.3), 0.8, -len / 2 - 0.01), '#d61f1f'));
  }
  return mergeColored(parts);
}

export function busBodyGeo() {
  return mergeColored([new THREE.BoxGeometry(2.55, 2.8, 12).translate(0, 1.75, 0)]);
}
export function busDetailGeo() {
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push(colorize(new THREE.BoxGeometry(0.04, 0.9, 10).translate(sx * 1.29, 2.3, -0.4), '#1e2933'));
    for (const sz of [-4, 4]) parts.push(colorize(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateZ(Math.PI / 2).translate(sx * 1.1, 0.5, sz), '#151515'));
  }
  parts.push(colorize(new THREE.BoxGeometry(2.3, 1.2, 0.04).translate(0, 2.2, 6.01), '#1e2933'));
  return mergeColored(parts);
}

export function truckBodyGeo() {
  return mergeColored([new THREE.BoxGeometry(2.5, 2.4, 2.4).translate(0, 1.9, 3.6), new THREE.BoxGeometry(2.5, 3.2, 7.2).translate(0, 2.4, -1.4)]);
}
export function truckDetailGeo() {
  const parts = [colorize(new THREE.BoxGeometry(2.3, 0.9, 0.04).translate(0, 2.4, 4.81), '#1e2933')];
  for (const sx of [-1, 1]) for (const sz of [-3.6, -1.6, 3.4]) parts.push(colorize(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateZ(Math.PI / 2).translate(sx * 1.1, 0.5, sz), '#151515'));
  return mergeColored(parts);
}

export function lightTowerGeo() {
  const parts = [];
  const legs = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [a, b] of legs) parts.push(colorize(cylBetween(new THREE.Vector3(a * 1.6, 0, b * 1.6), new THREE.Vector3(a * 0.5, 22, b * 0.5), 0.12, 0.12, 5), '#8a9098'));
  parts.push(colorize(new THREE.BoxGeometry(4, 2.2, 0.6).translate(0, 23, 0), '#30343a'));
  parts.push(colorize(new THREE.BoxGeometry(3.6, 1.8, 0.1).translate(0, 23, 0.32), '#fffbe6'));
  return mergeColored(parts);
}

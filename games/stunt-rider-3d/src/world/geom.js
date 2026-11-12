// Geometry helpers: batching static meshes per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// Keep only the attributes all merged geometries share.
function normalize(g, withColor) {
  if (g.index) g = g.toNonIndexed();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && !(withColor && name === 'color')) g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (withColor && !g.attributes.color) {
    const c = new Float32Array(g.attributes.position.count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  g.morphAttributes = {};
  return g;
}

export class Batcher {
  constructor() {
    this.groups = new Map();
  }
  add(key, geo, matrix) {
    if (matrix) geo.applyMatrix4(matrix);
    if (!this.groups.has(key)) this.groups.set(key, []);
    this.groups.get(key).push(geo);
  }
  // Merge all geometries of each key into a single mesh.
  build(parent, materials, { castShadow = true, receiveShadow = true, chunk = 0 } = {}) {
    const meshes = [];
    for (const [key, list] of this.groups) {
      const mat = materials[key];
      if (!mat) throw new Error('Missing material ' + key);
      const withColor = !!mat.vertexColors;
      const buckets = new Map();
      for (const g of list) {
        let bk = 0;
        if (chunk) {
          g.computeBoundingSphere();
          const c = g.boundingSphere.center;
          bk = Math.floor(c.x / chunk) * 1000 + Math.floor(c.z / chunk);
        }
        if (!buckets.has(bk)) buckets.set(bk, []);
        buckets.get(bk).push(normalize(g, withColor));
      }
      for (const arr of buckets.values()) {
        const merged = mergeGeometries(arr, false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = castShadow && mat.userData.noShadow !== true;
        mesh.receiveShadow = receiveShadow;
        mesh.matrixAutoUpdate = false;
        parent.add(mesh);
        meshes.push(mesh);
      }
    }
    this.groups.clear();
    return meshes;
  }
}

export function trsMatrix(x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromAxisAngle(_up, yaw);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Box with UVs scaled to world metres (uvScale metres per texture repeat).
export function boxGeo(w, h, d, uvScale = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale) {
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i));
      const ny = Math.abs(nrm.getY(i));
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (ny > 0.5) uv.setXY(i, x / uvScale, z / uvScale);
      else if (nx > 0.5) uv.setXY(i, z / uvScale, y / uvScale);
      else uv.setXY(i, x / uvScale, y / uvScale);
    }
  }
  return g;
}

// Cylinder spanning two points.
export function cylBetween(a, b, r0, r1 = r0, seg = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  _q.setFromUnitVectors(_up, dir.normalize());
  _m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

export function colorize(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Merge several coloured parts into one geometry (for instancing).
export function mergeColored(parts) {
  return mergeGeometries(parts.map((p) => normalize(p, true)), false);
}

export function std(opts) {
  return new THREE.MeshStandardMaterial(opts);
}

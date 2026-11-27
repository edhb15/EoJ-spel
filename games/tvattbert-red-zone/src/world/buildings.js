// Builds the building meshes from the STL footprints: flat roofs + textured walls.
import * as THREE from 'three';
import { seeded, hash2 } from '../core/util.js';
import { ZONES } from './locations.js';

const TILE = 250;
const PALETTE = [
  [0.95, 0.86, 0.70], [0.92, 0.80, 0.62], [0.85, 0.74, 0.62], [0.97, 0.94, 0.86], [0.80, 0.84, 0.80],
  [0.92, 0.78, 0.70], [0.78, 0.78, 0.76], [0.98, 0.9, 0.78], [0.86, 0.9, 0.95], [0.75, 0.70, 0.66],
];

export class Buildings {
  constructor(world, scene, tex) {
    this.world = world; this.scene = scene;
    const rng = seeded(99);
    // per building appearance
    for (const b of world.buildings) {
      const h = b.roof - b.base - 1;
      b.style = h > 14 && b.area > 400 ? (rng() < 0.6 ? 2 : 0) : h < 9 && b.area < 500 ? (rng() < 0.6 ? 3 : 0) : rng() < 0.3 ? 1 : rng() < 0.75 ? 0 : 2;
      if (b.area < 40) b.style = 2;
      b.tint = PALETTE[(rng() * PALETTE.length) | 0];
      b.burnt = rng() < 0.07 && !ZONES.some(zn => zn.type === 'safe' && Math.hypot(zn.x - b.cx, zn.z - b.cz) < zn.r + 80);
      b.collapsed = !b.burnt && h > 8 && b.area < 1500 && rng() < 0.035;
      if (b.collapsed) b.roof = b.base + 1 + h * (0.35 + rng() * 0.25);
    }
    this.wallMat = makeFacadeMaterial(tex);
    this.roofMat = new THREE.MeshStandardMaterial({ map: tex.roof, roughness: 0.95, vertexColors: true });
    this.group = new THREE.Group(); scene.add(this.group);
    this.build();
  }

  build() {
    for (const c of [...this.group.children]) { this.group.remove(c); c.geometry.dispose(); }
    const W = this.world, tiles = new Map();
    for (const b of W.buildings) {
      if (b.removed) continue;
      const key = Math.floor((b.cx + W.half) / TILE) * 100 + Math.floor((b.cz + W.half) / TILE);
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push(b);
    }
    for (const list of tiles.values()) {
      const walls = { pos: [], nor: [], uv: [], col: [], sty: [] };
      const roofs = { pos: [], nor: [], uv: [], col: [] };
      for (const b of list) this.addBuilding(b, walls, roofs);
      this.group.add(makeMesh(walls, this.wallMat, true));
      this.group.add(makeMesh(roofs, this.roofMat, false));
    }
  }

  addBuilding(b, walls, roofs) {
    const v = b.verts, t = b.tris, e = b.edges;
    const dim = b.burnt ? 0.5 : 1;
    const [r, g, bl] = b.tint;
    const roofC = b.burnt ? [0.2, 0.2, 0.2] : [0.75 + hash2(b.id, 1) * 0.25, 0.75, 0.74];
    // roof (flip winding because of mirrored Z)
    for (let i = 0; i < t.length; i += 3) {
      for (const j of [t[i], t[i + 2], t[i + 1]]) {
        const x = v[j * 2], z = v[j * 2 + 1];
        roofs.pos.push(x, b.roof, z); roofs.nor.push(0, 1, 0); roofs.uv.push(x * 0.12, z * 0.12);
        roofs.col.push(...roofC);
      }
    }
    // walls
    const floorH = 3.1, base0 = b.base + 1;
    for (let i = 0; i < e.length; i += 2) {
      const ax = v[e[i] * 2], az = v[e[i] * 2 + 1], bx = v[e[i + 1] * 2], bz = v[e[i + 1] * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.05) continue;
      // outward normal: interior is to the right of a->b in game coordinates (mirrored from STL)
      let nx = -(bz - az) / len, nz = (bx - ax) / len;
      // verify with the polygon: probe a point just outside; if it is inside the roof, flip
      if (pointInBuilding(b, (ax + bx) / 2 + nx * 0.2, (az + bz) / 2 + nz * 0.2)) { nx = -nx; nz = -nz; }
      const modules = Math.max(1, Math.round(len / 3.6));
      const y0 = b.base, y1 = b.roof;
      const v0 = (y0 - base0) / floorH, v1 = (y1 - base0) / floorH;
      // quad: A0 B0 B1 A1, winding so that normal points outwards
      const A0 = [ax, y0, az], B0 = [bx, y0, bz], B1 = [bx, y1, bz], A1 = [ax, y1, az];
      const uvA0 = [0, v0], uvB0 = [modules, v0], uvB1 = [modules, v1], uvA1 = [0, v1];
      // geometric normal of (A0,B0,B1)
      const ux = B0[0] - A0[0], uz = B0[2] - A0[2]; // horizontal edge
      // cross((B0-A0),(B1-A0)) with B1-A0 = (ux, h, uz) -> n = (-uz*h... ) compute sign directly
      const gx = -uz, gz = ux; // normal of A0->B0->B1 for upward second edge
      const ok = gx * nx + gz * nz > 0;
      const quad = ok ? [A0, B0, B1, A0, B1, A1] : [A0, B1, B0, A0, A1, B1];
      const quv = ok ? [uvA0, uvB0, uvB1, uvA0, uvB1, uvA1] : [uvA0, uvB1, uvB0, uvA0, uvA1, uvB1];
      for (let q = 0; q < 6; q++) {
        walls.pos.push(...quad[q]); walls.nor.push(nx, 0, nz); walls.uv.push(...quv[q]);
        const shade = 0.88 + hash2(b.id, i) * 0.12;
        walls.col.push(r * dim * shade, g * dim * shade, bl * dim * shade);
        walls.sty.push(b.style + (b.burnt ? 10 : 0) + (b.id % 97) / 100);
      }
    }
  }
  // nearest building whose footprint contains point (used by interiors / doors)
  buildingAt(x, z) {
    for (const b of this.world.buildings) {
      if (b.removed || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (pointInBuilding(b, x, z)) return b;
    }
    return null;
  }
}

export function pointInBuilding(b, x, z) {
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return false;
  const v = b.verts, t = b.tris;
  for (let i = 0; i < t.length; i += 3) {
    const ax = v[t[i] * 2], az = v[t[i] * 2 + 1], bx = v[t[i + 1] * 2], bz = v[t[i + 1] * 2 + 1], cx = v[t[i + 2] * 2], cz = v[t[i + 2] * 2 + 1];
    const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
    const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
    const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

function makeMesh(d, mat, styled) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
  if (styled) g.setAttribute('aStyle', new THREE.Float32BufferAttribute(d.sty, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function makeFacadeMaterial(tex) {
  const mat = new THREE.MeshStandardMaterial({ map: tex.facade, vertexColors: true, roughness: 0.88, metalness: 0.02,
    emissive: 0xffffff, emissiveMap: tex.facadeEmissive, emissiveIntensity: 1 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNight = { value: 0 };
    sh.uniforms.uTime = { value: 0 };
    mat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aStyle; varying float vStyle; varying vec2 vCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvStyle = aStyle; vCell = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vStyle; varying vec2 vCell; uniform float uNight; uniform float uTime;
float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
vec2 atlasUV(vec2 cell, float st){ float fl = floor(cell.y); vec2 f = fract(cell);
  float row = fl < 1.0 ? 0.0 : 0.5; return vec2((st + f.x) * 0.25, row + f.y * 0.5); }`)
      .replace('#include <map_fragment>', `
float stRaw = floor(vStyle); float burnt = step(9.5, stRaw); float st = mod(stRaw, 10.0);
vec2 auv = atlasUV(vCell, st);
vec2 gx = dFdx(vCell) * vec2(0.25, 0.5), gy = dFdy(vCell) * vec2(0.25, 0.5);
vec4 texel = textureGrad(map, auv, gx, gy);
float bid = fract(vStyle) * 100.0;
// broken windows: some window cells dark
float cellId = h21(floor(vCell) + bid * 13.0);
vec4 em = textureGrad(emissiveMap, auv, gx, gy);
texel.rgb = mix(texel.rgb, texel.rgb * 0.25, em.r * step(0.8, cellId));
// soot from fires
// soot plumes above windows of burnt-out buildings
float soot = burnt * clamp(smoothstep(0.35, 0.0, abs(fract(vCell.x) - 0.5) - 0.05) * (0.4 + 0.6 * fract(vCell.y)) + 0.25 * sin(vCell.x * 0.7 + vCell.y * 0.9), 0.0, 1.0);
texel.rgb *= mix(1.0, 0.25, soot);
diffuseColor *= texel;`)
      .replace('#include <emissivemap_fragment>', `
float lit = step(0.975, cellId) * step(1.0, floor(vCell.y)) * (1.0 - burnt);
float flick = 0.75 + 0.25 * sin(uTime * 7.0 + bid * 3.0 + floor(vCell.x) * 2.1);
totalEmissiveRadiance = vec3(1.0, 0.62, 0.3) * em.r * lit * uNight * flick * 1.6;`);
  };
  return mat;
}

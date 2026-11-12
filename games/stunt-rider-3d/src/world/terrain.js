// Heightfield terrain: generation, exact height queries and chunked meshes.
import * as THREE from 'three';
import { fbm, noise2, smoothstep, clamp, lerp, segDist } from '../core/math.js';
import { ZONES, LAKE, QUARRY, WORLD_HALF, zoneRectDist, inRect } from './layout.js';
import { terrainDetail } from './textures.js';

export const CELL = 6;
export const N = Math.round((WORLD_HALF * 2) / CELL) + 1; // vertices per side

function rawHeight(x, z) {
  let h = fbm(x * 0.0023 + 3.1, z * 0.0023 - 7.7, 5) * 42;
  h += (1 - Math.abs(noise2(x * 0.0042 + 9.3, z * 0.0042 + 2.1))) * 18 - 6;
  // flatten playable zones
  let flat = 0;
  for (const zn of ZONES) {
    const d = zoneRectDist(zn.rect, x, z);
    if (d < 170) flat = Math.max(flat, 1 - smoothstep(0, 170, d));
  }
  h *= 1 - flat;
  // sand dunes in the quarry
  if (inRect(QUARRY.rect, x, z, 10)) {
    const ex = Math.min(x - QUARRY.rect[0], QUARRY.rect[2] - x);
    const ez = Math.min(z - QUARRY.rect[1], QUARRY.rect[3] - z);
    const edge = smoothstep(-10, 30, Math.min(ex, ez));
    const d = Math.max(0, noise2(x * 0.03 + 4, z * 0.03 - 1) * 2.6 + Math.sin(x * 0.07) * 1.1 + 1.2);
    h += d * edge;
  }
  // lake basin
  const lx = (x - LAKE.cx) / LAKE.rx;
  const lz = (z - LAKE.cz) / LAKE.rz;
  const e = Math.sqrt(lx * lx + lz * lz);
  if (e < 1.8) {
    const lakeH = -7.2 + 6.4 * e;
    h = Math.min(h, lakeH);
  }
  // mountain rim around the world
  const d = Math.max(Math.abs(x), Math.abs(z));
  const m = smoothstep(1105, 1200, d);
  if (m > 0) h += m * (55 + 35 * fbm(x * 0.006, z * 0.006, 3));
  return h;
}

export class Terrain {
  constructor() {
    this.h = new Float32Array(N * N);
    this.meshes = [];
  }

  idx(i, j) {
    return j * N + i;
  }

  generate(roadPaths) {
    const h = this.h;
    for (let j = 0; j < N; j++) {
      const z = -WORLD_HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        h[j * N + i] = rawHeight(-WORLD_HALF + i * CELL, z);
      }
    }
    this.flattenRoads(roadPaths);
  }

  flattenRoads(paths) {
    const h = this.h;
    const bestW = new Float32Array(N * N);
    const target = new Float32Array(N * N);
    const tmp = {};
    for (const p of paths) {
      const pts = p.points;
      const n = pts.length;
      if (n < 2) continue;
      // sample heights along the road and smooth them into a drivable profile
      let prof = pts.map((q) => this.height(q[0], q[1]));
      const win = p.type === 'dirt' ? 4 : 7;
      for (let pass = 0; pass < 3; pass++) {
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
          let s = 0;
          let c = 0;
          for (let k = -win; k <= win; k++) {
            const q = clamp(i + k, 0, n - 1);
            s += prof[q];
            c++;
          }
          out[i] = s / c;
        }
        // keep endpoints pinned so roads meet flat zones cleanly
        out[0] = prof[0];
        out[n - 1] = prof[n - 1];
        prof = out;
      }
      const grade = p.type === 'dirt' ? 0.22 : 0.11;
      for (let i = 1; i < n; i++) {
        const ds = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        prof[i] = clamp(prof[i], prof[i - 1] - grade * ds, prof[i - 1] + grade * ds);
      }
      for (let i = n - 2; i >= 0; i--) {
        const ds = Math.hypot(pts[i][0] - pts[i + 1][0], pts[i][1] - pts[i + 1][1]);
        prof[i] = clamp(prof[i], prof[i + 1] - grade * ds, prof[i + 1] + grade * ds);
      }
      p.profile = prof;
      const hw = p.width / 2;
      const reach = hw + 26;
      for (let s = 0; s < n - 1; s++) {
        const ax = pts[s][0];
        const az = pts[s][1];
        const bx = pts[s + 1][0];
        const bz = pts[s + 1][1];
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + WORLD_HALF) / CELL));
        const i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + reach + WORLD_HALF) / CELL));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + WORLD_HALF) / CELL));
        const j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + reach + WORLD_HALF) / CELL));
        for (let j = j0; j <= j1; j++) {
          const z = -WORLD_HALF + j * CELL;
          for (let i = i0; i <= i1; i++) {
            const x = -WORLD_HALF + i * CELL;
            const d = segDist(x, z, ax, az, bx, bz, tmp);
            if (d > reach) continue;
            const w = 1 - smoothstep(hw + 2, reach, d);
            const k = j * N + i;
            if (w > bestW[k]) {
              bestW[k] = w;
              target[k] = lerp(prof[s], prof[s + 1], tmp.t);
            }
          }
        }
      }
    }
    for (let k = 0; k < N * N; k++) {
      if (bestW[k] > 0) h[k] = lerp(h[k], target[k], bestW[k]);
    }
  }

  // Exact height on the rendered triangle mesh.
  height(x, z) {
    let fx = (x + WORLD_HALF) / CELL;
    let fz = (z + WORLD_HALF) / CELL;
    fx = clamp(fx, 0, N - 1.0001);
    fz = clamp(fz, 0, N - 1.0001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h = this.h;
    const k = j * N + i;
    const h00 = h[k];
    const h10 = h[k + 1];
    const h01 = h[k + N];
    const h11 = h[k + N + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  normal(x, z, out) {
    const e = 1.2;
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    const inv = 1 / Math.sqrt(dx * dx + dz * dz + 4 * e * e);
    out.x = -dx * inv;
    out.y = 2 * e * inv;
    out.z = -dz * inv;
    return out;
  }

  buildMeshes(scene, colorAt) {
    const CH = 50; // cells per chunk side
    const chunks = Math.ceil((N - 1) / CH);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: terrainDetail(), roughness: 0.96, metalness: 0 });
    this.material = mat;
    const col = new THREE.Color();
    // colours per vertex computed once
    const colors = new Float32Array(N * N * 3);
    const nrm = { x: 0, y: 1, z: 0 };
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -WORLD_HALF + i * CELL;
        const z = -WORLD_HALF + j * CELL;
        this.normal(x, z, nrm);
        colorAt(x, z, this.h[j * N + i], nrm.y, col);
        const k = (j * N + i) * 3;
        colors[k] = col.r;
        colors[k + 1] = col.g;
        colors[k + 2] = col.b;
      }
    }
    for (let cj = 0; cj < chunks; cj++) {
      for (let ci = 0; ci < chunks; ci++) {
        const i0 = ci * CH;
        const j0 = cj * CH;
        const i1 = Math.min(N - 1, i0 + CH);
        const j1 = Math.min(N - 1, j0 + CH);
        const w = i1 - i0 + 1;
        const d = j1 - j0 + 1;
        const pos = new Float32Array(w * d * 3);
        const cl = new Float32Array(w * d * 3);
        const uv = new Float32Array(w * d * 2);
        const nr = new Float32Array(w * d * 3);
        for (let j = 0; j < d; j++) {
          for (let i = 0; i < w; i++) {
            const gi = i0 + i;
            const gj = j0 + j;
            const v = j * w + i;
            const x = -WORLD_HALF + gi * CELL;
            const z = -WORLD_HALF + gj * CELL;
            pos[v * 3] = x;
            pos[v * 3 + 1] = this.h[gj * N + gi];
            pos[v * 3 + 2] = z;
            const k = (gj * N + gi) * 3;
            cl[v * 3] = colors[k];
            cl[v * 3 + 1] = colors[k + 1];
            cl[v * 3 + 2] = colors[k + 2];
            uv[v * 2] = x / 9;
            uv[v * 2 + 1] = z / 9;
            const hx = this.h[gj * N + Math.min(N - 1, gi + 1)] - this.h[gj * N + Math.max(0, gi - 1)];
            const hz = this.h[Math.min(N - 1, gj + 1) * N + gi] - this.h[Math.max(0, gj - 1) * N + gi];
            const nx = -hx;
            const nz = -hz;
            const ny = 2 * CELL;
            const il = 1 / Math.hypot(nx, ny, nz);
            nr[v * 3] = nx * il;
            nr[v * 3 + 1] = ny * il;
            nr[v * 3 + 2] = nz * il;
          }
        }
        const idx = [];
        for (let j = 0; j < d - 1; j++) {
          for (let i = 0; i < w - 1; i++) {
            const a = j * w + i; // v00
            const b = a + 1; // v10
            const c = a + w; // v01
            const e = c + 1; // v11
            idx.push(a, c, b, b, c, e);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
        g.setIndex(idx);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        scene.add(m);
        this.meshes.push(m);
      }
    }
  }
}

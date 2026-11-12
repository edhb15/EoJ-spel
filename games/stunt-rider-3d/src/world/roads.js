// Road network: smoothed paths, spatial lookup and ribbon meshes.
import * as THREE from 'three';
import { catmullRom, segDist } from '../core/math.js';
import { ROADS, ROAD_TYPES, CITY_X, CITY_Z, CITY_STREET_W, IND_STREETS, SURF } from './layout.js';
import { roadTexture, intersectionTexture } from './textures.js';

const GCELL = 32;

function resampleStraight(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

// All drivable paths, used by terrain flattening, lookups and meshes.
export function buildRoadPaths() {
  const paths = [];
  for (const r of ROADS) {
    const t = ROAD_TYPES[r.type];
    const points = r.smooth ? catmullRom(r.pts, 5) : resampleStraight(r.pts, 6);
    paths.push({ id: r.id, type: r.type, width: t.width, surface: t.surface, lift: t.lift, points, mesh: true });
  }
  // city streets: one path per street line, meshed separately between intersections
  const hw = CITY_STREET_W / 2;
  for (const x of CITY_X) {
    paths.push({ id: 'cityNS' + x, type: 'city', width: CITY_STREET_W, surface: SURF.asphalt, lift: 0.06, points: resampleStraight([[x, CITY_Z[0] - hw], [x, CITY_Z[CITY_Z.length - 1] + hw]], 6), mesh: false, grid: { axis: 'z', fixed: x, stops: CITY_Z } });
  }
  for (const z of CITY_Z) {
    paths.push({ id: 'cityEW' + z, type: 'city', width: CITY_STREET_W, surface: SURF.asphalt, lift: 0.06, points: resampleStraight([[CITY_X[0] - hw, z], [CITY_X[CITY_X.length - 1] + hw, z]], 6), mesh: false, grid: { axis: 'x', fixed: z, stops: CITY_X } });
  }
  IND_STREETS.forEach((s, i) => {
    const ns = s.a[0] === s.b[0];
    paths.push({ id: 'ind' + i, type: 'city', width: 12, surface: SURF.asphalt, lift: ns ? 0.058 : 0.064, points: resampleStraight([s.a, s.b], 6), mesh: true });
  });
  return paths;
}

export class RoadNet {
  constructor(paths) {
    this.paths = paths;
    this.segs = [];
    this.grid = new Map();
    for (const p of paths) {
      const hw = p.width / 2;
      for (let i = 0; i < p.points.length - 1; i++) {
        const a = p.points[i];
        const b = p.points[i + 1];
        const seg = { ax: a[0], az: a[1], bx: b[0], bz: b[1], hw, surface: p.surface, lift: p.lift, path: p, type: p.type };
        this.segs.push(seg);
        const i0 = Math.floor((Math.min(a[0], b[0]) - hw) / GCELL);
        const i1 = Math.floor((Math.max(a[0], b[0]) + hw) / GCELL);
        const j0 = Math.floor((Math.min(a[1], b[1]) - hw) / GCELL);
        const j1 = Math.floor((Math.max(a[1], b[1]) + hw) / GCELL);
        for (let ii = i0; ii <= i1; ii++) {
          for (let jj = j0; jj <= j1; jj++) {
            const k = (ii + 1000) * 4096 + (jj + 1000);
            let arr = this.grid.get(k);
            if (!arr) this.grid.set(k, (arr = []));
            arr.push(seg);
          }
        }
      }
    }
  }
  cell(x, z) {
    return this.grid.get((Math.floor(x / GCELL) + 1000) * 4096 + (Math.floor(z / GCELL) + 1000));
  }
  // returns the road segment the point is on (closest centre), or null
  roadAt(x, z, pad = 0) {
    const arr = this.cell(x, z);
    if (!arr) return null;
    let best = null;
    let bd = 1e9;
    for (const s of arr) {
      const d = segDist(x, z, s.ax, s.az, s.bx, s.bz);
      if (d <= s.hw + pad && d - s.hw < bd) {
        bd = d - s.hw;
        best = s;
      }
    }
    return best;
  }
  // distance to the nearest road edge (negative inside), searching neighbouring cells
  edgeDist(x, z, radius = 40) {
    let best = 1e9;
    const r = Math.ceil(radius / GCELL);
    const ci = Math.floor(x / GCELL);
    const cj = Math.floor(z / GCELL);
    for (let i = ci - r; i <= ci + r; i++) {
      for (let j = cj - r; j <= cj + r; j++) {
        const arr = this.grid.get((i + 1000) * 4096 + (j + 1000));
        if (!arr) continue;
        for (const s of arr) {
          const d = segDist(x, z, s.ax, s.az, s.bx, s.bz) - s.hw;
          if (d < best) best = d;
        }
      }
    }
    return best;
  }
}

// ---------- meshes ----------

function ribbon(points, width, heightAt, lift, pos, uv, idx, vScale) {
  const n = points.length;
  const hw = width / 2;
  const base = pos.length / 3;
  let dist = 0;
  const across = width > 12 ? 4 : 2; // segments across
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    // left normal
    const nx = -tz;
    const nz = tx;
    if (i > 0) dist += Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]);
    for (let k = 0; k <= across; k++) {
      const f = k / across;
      const off = -hw + width * f;
      const x = p[0] + nx * off;
      const z = p[1] + nz * off;
      pos.push(x, heightAt(x, z) + lift, z);
      uv.push(f, dist / vScale);
    }
    if (i > 0) {
      const r0 = base + (i - 1) * (across + 1);
      const r1 = base + i * (across + 1);
      for (let k = 0; k < across; k++) {
        const a0 = r0 + k;
        const a1 = r0 + k + 1;
        const b0 = r1 + k;
        const b1 = r1 + k + 1;
        idx.push(a0, a1, b0, a1, b1, b0);
      }
    }
  }
}

function finishGeo(pos, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // ribbons can be wound either way; force normals up
  const nr = g.attributes.normal;
  let flip = false;
  if (nr.count && nr.getY(0) < 0) flip = true;
  if (flip) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  g.computeBoundingSphere();
  return g;
}

export function buildRoadMeshes(scene, paths, heightAt) {
  const byType = {};
  const add = (type) => (byType[type] ||= { pos: [], uv: [], idx: [] });
  for (const p of paths) {
    if (p.mesh) {
      const b = add(p.type);
      // separate geometry buffer per path so indices stay local
      const g = { pos: [], uv: [], idx: [] };
      ribbon(p.points, p.width, heightAt, p.lift, g.pos, g.uv, g.idx, p.width * 2);
      const off = b.pos.length / 3;
      b.pos.push(...g.pos);
      b.uv.push(...g.uv);
      for (const i of g.idx) b.idx.push(i + off);
    } else if (p.grid) {
      // city street: segments between intersections
      const b = add('city');
      const hw = p.width / 2;
      const stops = p.grid.stops;
      for (let i = 0; i < stops.length - 1; i++) {
        const s0 = stops[i] + 11;
        const s1 = stops[i + 1] - 11;
        const pts = [];
        const n = Math.max(1, Math.ceil((s1 - s0) / 10));
        for (let k = 0; k <= n; k++) {
          const s = s0 + ((s1 - s0) * k) / n;
          pts.push(p.grid.axis === 'z' ? [p.grid.fixed, s] : [s, p.grid.fixed]);
        }
        const g = { pos: [], uv: [], idx: [] };
        ribbon(pts, p.width, heightAt, p.lift, g.pos, g.uv, g.idx, p.width * 2);
        const off = b.pos.length / 3;
        b.pos.push(...g.pos);
        b.uv.push(...g.uv);
        for (const ii of g.idx) b.idx.push(ii + off);
      }
      void hw;
    }
  }
  const meshes = [];
  for (const type of Object.keys(byType)) {
    const b = byType[type];
    const mat = new THREE.MeshStandardMaterial({
      map: roadTexture(type),
      roughness: type === 'dirt' ? 1 : 0.88,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(finishGeo(b.pos, b.uv, b.idx), mat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  // intersections
  const ipos = [];
  const iuv = [];
  const iidx = [];
  const S = 11;
  for (const x of CITY_X) {
    for (const z of CITY_Z) {
      const base = ipos.length / 3;
      const y = heightAt(x, z) + 0.075;
      ipos.push(x - S, y, z - S, x + S, y, z - S, x - S, y, z + S, x + S, y, z + S);
      iuv.push(0, 0, 1, 0, 0, 1, 1, 1);
      iidx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const imat = new THREE.MeshStandardMaterial({ map: intersectionTexture(), roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const imesh = new THREE.Mesh(finishGeo(ipos, iuv, iidx), imat);
  imesh.receiveShadow = true;
  scene.add(imesh);
  meshes.push(imesh);
  return meshes;
}

// 2.5D collision: buildings, water edges, doors, vehicles and barricades are vertical
// segments with a height range; the ground is the terrain heightfield (+ floor zones).
import { CLASS } from './worldData.js';

export const F = { PLAYER: 1, ZOMBIE: 2, BULLET: 4, SIGHT: 8, ALL: 15 };

export class Collision {
  constructor(world) {
    this.world = world;
    this.cs = 8; // cell size (m)
    this.minX = -2100; this.minZ = -2100; this.maxX = 3400; this.maxZ = 2100;
    this.nx = Math.ceil((this.maxX - this.minX) / this.cs);
    this.nz = Math.ceil((this.maxZ - this.minZ) / this.cs);
    this.cells = new Array(this.nx * this.nz);
    this.stamp = 0;
    this.segCount = 0;
  }

  addSegment(ax, az, bx, bz, yMin, yMax, flags = F.ALL, owner = null) {
    const s = { ax, az, bx, bz, yMin, yMax, flags, owner, cells: [], mark: 0,
      len: Math.hypot(bx - ax, bz - az) };
    // supercover of the segment over grid cells
    const steps = Math.max(1, Math.ceil(s.len / (this.cs * 0.5)));
    const seen = new Set();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const [ox, oz] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
        const ci = this.cellIndex(x + ox, z + oz);
        if (ci < 0 || seen.has(ci)) continue;
        seen.add(ci);
        (this.cells[ci] || (this.cells[ci] = [])).push(s);
        s.cells.push(ci);
      }
    }
    this.segCount++;
    return s;
  }
  removeSegment(s) {
    for (const ci of s.cells) {
      const arr = this.cells[ci]; if (!arr) continue;
      const i = arr.indexOf(s); if (i >= 0) arr.splice(i, 1);
    }
    s.cells.length = 0; this.segCount--;
  }
  // oriented box (vehicles, crates): 4 segments
  addBox(x, z, yaw, hw, hd, y0, y1, flags = F.ALL, owner = null) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const p = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c]);
    const segs = [];
    for (let i = 0; i < 4; i++) { const A = p[i], B = p[(i + 1) % 4]; segs.push(this.addSegment(A[0], A[1], B[0], B[1], y0, y1, flags, owner)); }
    return segs;
  }
  cellIndex(x, z) {
    const i = Math.floor((x - this.minX) / this.cs), k = Math.floor((z - this.minZ) / this.cs);
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return -1;
    return k * this.nx + i;
  }

  buildStatic() {
    const W = this.world;
    for (const b of W.buildings) {
      if (b.removed) continue;
      const v = b.verts, e = b.edges;
      b.segs = [];
      for (let i = 0; i < e.length; i += 2) {
        const a = e[i] * 2, c = e[i + 1] * 2;
        b.segs.push(this.addSegment(v[a], v[a + 1], v[c], v[c + 1], b.base, b.roof, F.ALL, b));
      }
    }
    // water edges -> low invisible railing (blocks walking, not bullets/sight)
    const N = W.NC, G = W.G, H = W.half, cls = W.cls;
    const isW = (i, k) => i >= 0 && k >= 0 && i < N && k < N && cls[k * N + i] === CLASS.WATER;
    const addRun = (x0, z0, x1, z1, landX, landZ) => {
      const g = W.terrainHeight(landX, landZ);
      this.addSegment(x0, z0, x1, z1, -30, Math.max(g, 0) + 1.3, F.PLAYER | F.ZOMBIE, 'water');
    };
    for (let k = 1; k < N; k++) { // horizontal edges between rows k-1 and k
      let run = -1, runTop = false;
      for (let i = 0; i <= N; i++) {
        const e = i < N && isW(i, k) !== isW(i, k - 1);
        const top = i < N && isW(i, k - 1);
        if (run >= 0 && (!e || top !== runTop || i - run >= 12)) {
          const z = -H + k * G;
          addRun(-H + run * G, z, -H + i * G, z, -H + (run + i) * 0.5 * G, z + (runTop ? 1 : -1));
          run = -1;
        }
        if (e && run < 0) { run = i; runTop = top; }
      }
    }
    for (let i = 1; i < N; i++) { // vertical edges between cols i-1 and i
      let run = -1, runLeft = false;
      for (let k = 0; k <= N; k++) {
        const e = k < N && isW(i, k) !== isW(i - 1, k);
        const left = k < N && isW(i - 1, k);
        if (run >= 0 && (!e || left !== runLeft || k - run >= 12)) {
          const x = -H + i * G;
          addRun(x, -H + run * G, x, -H + k * G, x + (runLeft ? 1 : -1), -H + (run + k) * 0.5 * G);
          run = -1;
        }
        if (e && run < 0) { run = k; runLeft = left; }
      }
    }
    // quarantine boundary of the red zone
    const m = H - 4;
    this.addSegment(-m, -m, m, -m, -100, 500, F.PLAYER | F.ZOMBIE, 'border');
    this.addSegment(m, -m, m, m, -100, 500, F.PLAYER | F.ZOMBIE, 'border');
    this.addSegment(m, m, -m, m, -100, 500, F.PLAYER | F.ZOMBIE, 'border');
    this.addSegment(-m, m, -m, -m, -100, 500, F.PLAYER | F.ZOMBIE, 'border');
  }

  // iterate unique segments overlapping a circle's cells
  forNear(x, z, r, fn) {
    const stamp = ++this.stamp;
    const i0 = Math.floor((x - r - this.minX) / this.cs), i1 = Math.floor((x + r - this.minX) / this.cs);
    const k0 = Math.floor((z - r - this.minZ) / this.cs), k1 = Math.floor((z + r - this.minZ) / this.cs);
    for (let k = k0; k <= k1; k++) {
      if (k < 0 || k >= this.nz) continue;
      for (let i = i0; i <= i1; i++) {
        if (i < 0 || i >= this.nx) continue;
        const arr = this.cells[k * this.nx + i]; if (!arr) continue;
        for (const s of arr) { if (s.mark === stamp) continue; s.mark = stamp; if (fn(s) === false) return; }
      }
    }
  }

  // Push a circle (feet at yFeet, height h) out of blocking segments. Mutates pos.
  collideCircle(pos, r, yFeet, h, mask = F.PLAYER, step = 0.45) {
    let hit = false; let nx = 0, nz = 0, seg = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.forNear(pos.x, pos.z, r + 0.5, s => {
        if (!(s.flags & mask)) return;
        if (s.yMax <= yFeet + step || s.yMin >= yFeet + h) return;
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const L2 = dx * dx + dz * dz || 1e-9;
        let t = ((pos.x - s.ax) * dx + (pos.z - s.az) * dz) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = s.ax + dx * t, cz = s.az + dz * t;
        let ex = pos.x - cx, ez = pos.z - cz;
        let d = Math.hypot(ex, ez);
        if (d >= r) return;
        if (d < 1e-6) { ex = -dz; ez = dx; d = Math.hypot(ex, ez) || 1; ex /= d; ez /= d; d = 0; }
        else { ex /= d; ez /= d; }
        const push = r - d + 0.001;
        pos.x += ex * push; pos.z += ez * push;
        nx += ex; nz += ez; hit = moved = true; seg = s;
      });
      if (!moved) break;
    }
    return hit ? { nx, nz, seg } : null;
  }

  // Ray against segments (as vertical quads), floor-zone ceilings and terrain.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, mask = F.BULLET, ignoreTerrain = false) {
    let best = maxDist, hit = null;
    // segments: walk cells along the ray
    const stepLen = this.cs * 0.5;
    const n = Math.ceil(maxDist / stepLen) + 1;
    const stamp = ++this.stamp;
    const hd = Math.hypot(dx, dz);
    if (hd > 1e-6) {
      for (let i = 0; i <= n; i++) {
        const t = i * stepLen;
        if (t > best + stepLen) break;
        const x = ox + dx * t, z = oz + dz * t;
        for (const [ax, az] of [[0, 0], [stepLen * 0.5, 0], [-stepLen * 0.5, 0], [0, stepLen * 0.5], [0, -stepLen * 0.5]]) {
          const ci = this.cellIndex(x + ax, z + az); if (ci < 0) continue;
          const arr = this.cells[ci]; if (!arr) continue;
          for (const s of arr) {
            if (s.mark === stamp) continue; s.mark = stamp;
            if (!(s.flags & mask)) continue;
            // 2D ray/segment intersection
            const ex = s.bx - s.ax, ez = s.bz - s.az;
            const den = dx * ez - dz * ex;
            if (Math.abs(den) < 1e-9) continue;
            const qx = s.ax - ox, qz = s.az - oz;
            const tt = (qx * ez - qz * ex) / den;
            const u = (qx * dz - qz * dx) / den;
            if (tt < 0 || tt >= best || u < 0 || u > 1) continue;
            const y = oy + dy * tt;
            if (y < s.yMin || y > s.yMax) continue;
            best = tt;
            let nx = -ez, nz = ex; const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
            if (nx * dx + nz * dz > 0) { nx = -nx; nz = -nz; }
            hit = { t: tt, x: ox + dx * tt, y, z: oz + dz * tt, nx, ny: 0, nz, kind: 'wall', seg: s };
          }
        }
      }
    }
    // ceilings of floor zones (hospital/interiors)
    for (const f of this.world.floorZones) {
      if (!f.ceil || dy <= 0) continue;
      const tt = (f.ceil - oy) / dy;
      if (tt <= 0 || tt >= best) continue;
      const x = ox + dx * tt, z = oz + dz * tt;
      if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && oy < f.ceil) {
        best = tt; hit = { t: tt, x, y: f.ceil, z, nx: 0, ny: -1, nz: 0, kind: 'ceiling' };
      }
    }
    if (!ignoreTerrain) {
      // ground: march then bisect
      const W = this.world;
      let prevT = 0, prevAbove = oy - W.groundHeight(ox, oz) > -0.01;
      const st = 0.75;
      for (let t = st; t < best + st; t += st) {
        const tc = Math.min(t, best);
        const x = ox + dx * tc, y = oy + dy * tc, z = oz + dz * tc;
        const g = W.groundHeight(x, z);
        const above = y > g;
        if (prevAbove && !above) {
          let a = prevT, b = tc;
          for (let j = 0; j < 8; j++) {
            const m = (a + b) / 2;
            if (oy + dy * m > W.groundHeight(ox + dx * m, oz + dz * m)) a = m; else b = m;
          }
          if (b < best) {
            best = b;
            const hx = ox + dx * b, hz = oz + dz * b;
            const e = 0.5;
            const gx = W.groundHeight(hx + e, hz) - W.groundHeight(hx - e, hz);
            const gz = W.groundHeight(hx, hz + e) - W.groundHeight(hx, hz - e);
            let nx = -gx, ny = 2 * e, nz = -gz; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
            hit = { t: b, x: hx, y: oy + dy * b, z: hz, nx, ny, nz, kind: 'terrain' };
          }
          break;
        }
        prevAbove = above; prevT = tc;
        if (tc >= best) break;
      }
    }
    return hit;
  }

  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    if (L < 0.01) return true;
    return !this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L - 0.05, F.SIGHT);
  }
}

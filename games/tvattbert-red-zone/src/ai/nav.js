// Flow field around the player: zombies follow decreasing distance to reach the player
// through streets, doors and corridors (walls, water edges, vehicles and closed doors block).
import { F } from '../world/collision.js';

export class FlowField {
  constructor(game, cell = 1.5, N = 160) {
    this.g = game; this.cell = cell; this.N = N;
    this.block = new Uint8Array(N * N);
    this.dist = new Uint16Array(N * N).fill(65535);
    this.queue = new Int32Array(N * N);
    this.ox = 0; this.oz = 0; this.cx = 1e9; this.cz = 1e9;
    this.dirty = true; this.timer = 0; this.valid = false;
  }
  idx(x, z) {
    const i = Math.floor((x - this.ox) / this.cell), k = Math.floor((z - this.oz) / this.cell);
    if (i < 0 || k < 0 || i >= this.N || k >= this.N) return -1;
    return k * this.N + i;
  }
  rebuild(cx, cz) {
    const { N, cell } = this, W = this.g.world;
    this.cx = cx; this.cz = cz; this.ox = cx - N * cell / 2; this.oz = cz - N * cell / 2;
    this.block.fill(0);
    const half = N * cell / 2;
    this.g.collision.forNear(cx, cz, half * 1.05, s => {
      if (!(s.flags & F.ZOMBIE)) return;
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
      const gnd = W.groundHeight(mx, mz);
      if (s.yMax <= gnd + 0.5 || s.yMin >= gnd + 1.6) return;
      const steps = Math.max(1, Math.ceil(s.len / (cell * 0.4)));
      for (let j = 0; j <= steps; j++) {
        const t = j / steps; const id = this.idx(s.ax + (s.bx - s.ax) * t, s.az + (s.bz - s.az) * t);
        if (id >= 0) this.block[id] = 1;
      }
    });
    this.dirty = false;
  }
  compute(px, pz) {
    const { N } = this; const d = this.dist, q = this.queue, b = this.block;
    d.fill(65535);
    let s = this.idx(px, pz); if (s < 0) { this.valid = false; return; }
    if (b[s]) { // player standing on a rasterised wall cell: start from a free neighbour
      for (const o of [1, -1, N, -N]) if (!b[s + o]) { s = s + o; break; }
    }
    let head = 0, tail = 0; d[s] = 0; q[tail++] = s;
    while (head < tail) {
      const c = q[head++]; const i = c % N, nd = d[c] + 1;
      if (i > 0 && !b[c - 1] && d[c - 1] > nd) { d[c - 1] = nd; q[tail++] = c - 1; }
      if (i < N - 1 && !b[c + 1] && d[c + 1] > nd) { d[c + 1] = nd; q[tail++] = c + 1; }
      if (c >= N && !b[c - N] && d[c - N] > nd) { d[c - N] = nd; q[tail++] = c - N; }
      if (c < N * N - N && !b[c + N] && d[c + N] > nd) { d[c + N] = nd; q[tail++] = c + N; }
    }
    this.valid = true;
  }
  update(dt, px, pz) {
    if (this.dirty || Math.hypot(px - this.cx, pz - this.cz) > this.N * this.cell * 0.22) this.rebuild(px, pz);
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 0.3; this.compute(px, pz); }
  }
  // direction (unit) toward the player from x,z, or null
  dirAt(x, z) {
    if (!this.valid) return null;
    const { N, cell } = this; const c = this.idx(x, z); if (c < 0) return null;
    const i = c % N, k = (c / N) | 0;
    let best = this.dist[c], bi = -1, bk = -1;
    if (best === 65535) { // inside a blocked cell: look one step further
      best = 65534;
    }
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      if (!di && !dk) continue;
      const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= N || kk >= N) continue;
      // forbid diagonal corner cutting
      if (di && dk && (this.block[k * N + ii] || this.block[kk * N + i])) continue;
      const v = this.dist[kk * N + ii];
      if (v < best) { best = v; bi = ii; bk = kk; }
    }
    if (bi < 0) return null;
    const tx = this.ox + (bi + 0.5) * cell, tz = this.oz + (bk + 0.5) * cell;
    const dx = tx - x, dz = tz - z, L = Math.hypot(dx, dz) || 1;
    return { x: dx / L, z: dz / L, steps: best };
  }
  reachable(x, z) { const c = this.idx(x, z); return c >= 0 && this.dist[c] < 65535; }
}

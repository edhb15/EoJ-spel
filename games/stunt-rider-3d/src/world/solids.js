// Collision solids: oriented footprints with a height profile along local z.
// Everything the bike can ride on or crash into (buildings, ramps, halfpipes,
// containers, trees) is one of these. Ramps are profiles, buildings are flat profiles.
import * as THREE from 'three';

const CELL = 16;
const EMPTY = [];
let nextId = 1;

export class Solid {
  constructor(o) {
    this.id = nextId++;
    this.cx = o.cx;
    this.cz = o.cz;
    this.yaw = o.yaw || 0;
    this.c = Math.cos(this.yaw);
    this.s = Math.sin(this.yaw);
    this.hx = o.hx;
    this.hz = o.hz;
    this.y0 = o.y0 || 0;
    const prof = o.profile || [[0, o.h], [o.hz * 2, o.h]];
    this.pu = new Float32Array(prof.map((p) => p[0]));
    this.ph = new Float32Array(prof.map((p) => p[1]));
    this.len = this.pu[this.pu.length - 1];
    this.maxH = Math.max(...this.ph);
    this.surface = o.surface ?? 1;
    this.vert = !!o.vert;
    this.kind = o.kind || 'solid';
    this.name = o.name || '';
    this.tag = o.tag || '';
    this.crashSoft = !!o.crashSoft; // small things you bounce off
  }
  // world -> local
  local(x, z, out) {
    const dx = x - this.cx;
    const dz = z - this.cz;
    out.lx = dx * this.c - dz * this.s;
    out.lz = dx * this.s + dz * this.c;
    return out;
  }
  contains(lx, lz, pad = 0) {
    return Math.abs(lx) <= this.hx + pad && Math.abs(lz) <= this.hz + pad;
  }
  // height relative to y0 at local z, plus slope (dh/dlz)
  sample(lz, out) {
    const u = lz + this.hz;
    const pu = this.pu;
    const ph = this.ph;
    const n = pu.length;
    if (u <= pu[0]) {
      out.h = ph[0];
      out.slope = n > 1 ? (ph[1] - ph[0]) / (pu[1] - pu[0] || 1) : 0;
      return out;
    }
    if (u >= pu[n - 1]) {
      out.h = ph[n - 1];
      out.slope = n > 1 ? (ph[n - 1] - ph[n - 2]) / (pu[n - 1] - pu[n - 2] || 1) : 0;
      return out;
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pu[mid] <= u) lo = mid;
      else hi = mid;
    }
    const t = (u - pu[lo]) / (pu[hi] - pu[lo] || 1);
    out.h = ph[lo] + (ph[hi] - ph[lo]) * t;
    out.slope = (ph[hi] - ph[lo]) / (pu[hi] - pu[lo] || 1);
    return out;
  }
  // local direction -> world
  toWorldDir(lx, lz, out) {
    out.x = lx * this.c + lz * this.s;
    out.z = -lx * this.s + lz * this.c;
    return out;
  }
  toWorld(lx, lz, out) {
    out.x = this.cx + lx * this.c + lz * this.s;
    out.z = this.cz - lx * this.s + lz * this.c;
    return out;
  }
}

export class Solids {
  constructor() {
    this.grid = new Map();
    this.list = [];
  }
  key(i, j) {
    return (i + 4096) * 8192 + (j + 4096);
  }
  add(o) {
    const s = o instanceof Solid ? o : new Solid(o);
    this.list.push(s);
    const r = Math.hypot(s.hx, s.hz);
    const i0 = Math.floor((s.cx - r) / CELL);
    const i1 = Math.floor((s.cx + r) / CELL);
    const j0 = Math.floor((s.cz - r) / CELL);
    const j1 = Math.floor((s.cz + r) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.key(i, j);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(s);
      }
    }
    return s;
  }
  at(x, z) {
    return this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL))) || EMPTY;
  }
}

// ---------- Profile builders (u along the ramp, h height) ----------

// Curved kicker: circular arc tangent to the ground, ending at lipDeg.
export function kickerProfile(length, lipDeg, steps = 14) {
  const th = (lipDeg * Math.PI) / 180;
  const R = length / Math.sin(th);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = (length * i) / steps;
    pts.push([u, R - Math.sqrt(Math.max(0, R * R - u * u))]);
  }
  return pts;
}

export function kickerHeight(length, lipDeg) {
  const th = (lipDeg * Math.PI) / 180;
  const R = length / Math.sin(th);
  return R * (1 - Math.cos(th));
}

// Landing mound: up-face, flat deck, rounded knuckle, long down slope.
export function landingProfile(H, frontDeg, deck, downDeg, downLen) {
  const up = H / Math.tan((frontDeg * Math.PI) / 180);
  const drop = Math.tan((downDeg * Math.PI) / 180);
  const pts = [[0, 0], [up, H], [up + deck, H]];
  // knuckle
  const k = 3;
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    pts.push([up + deck + k * t, H - drop * k * t * t * 0.5]);
  }
  const startH = H - drop * k * 0.5;
  const rest = Math.min(downLen, startH / drop);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // ease out to a smooth transition at the bottom
    const u = up + deck + k + rest * t;
    const hh = startH - drop * rest * (t - (t > 0.75 ? ((t - 0.75) * (t - 0.75)) / 0.5 : 0));
    pts.push([u, Math.max(0, hh)]);
  }
  pts.push([pts[pts.length - 1][0] + 4, 0]);
  return pts;
}

// One-sided quarter pipe: flat run-in at u=0 rising to maxDeg, then a deck.
export function quarterProfile(R, maxDeg, deck = 3, steps = 18) {
  const th = (maxDeg * Math.PI) / 180;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (th * i) / steps;
    pts.push([R * Math.sin(a), R * (1 - Math.cos(a))]);
  }
  const lipU = R * Math.sin(th);
  const lipH = R * (1 - Math.cos(th));
  pts.push([lipU + 0.05, lipH]);
  pts.push([lipU + deck, lipH]);
  return pts;
}

export function halfpipeProfile(R, maxDeg, flat, deck = 3, steps = 18) {
  const th = (maxDeg * Math.PI) / 180;
  const lipU = R * Math.sin(th);
  const lipH = R * (1 - Math.cos(th));
  const pts = [[0, lipH], [deck - 0.05, lipH]];
  for (let i = steps; i >= 0; i--) {
    const a = (th * i) / steps;
    pts.push([deck + lipU - R * Math.sin(a), R * (1 - Math.cos(a))]);
  }
  const mid = deck + lipU + flat;
  for (let i = 0; i <= steps; i++) {
    const a = (th * i) / steps;
    pts.push([mid + R * Math.sin(a), R * (1 - Math.cos(a))]);
  }
  pts.push([mid + lipU + 0.05, lipH]);
  pts.push([mid + lipU + deck, lipH]);
  return { pts, width: mid + lipU + deck, lipH };
}

export function tabletopProfile(H, upDeg, deck, downDeg) {
  const up = H / Math.tan((upDeg * Math.PI) / 180);
  const down = H / Math.tan((downDeg * Math.PI) / 180);
  return [[0, 0], [up * 0.5, H * 0.3], [up, H], [up + deck, H], [up + deck + 2, H - 0.25], [up + deck + down, 0]];
}

export function rollersProfile(n, h, spacing) {
  const pts = [];
  const steps = 8;
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      pts.push([(i + t) * spacing, h * 0.5 * (1 - Math.cos(t * Math.PI * 2))]);
    }
  }
  pts.push([n * spacing, 0]);
  return pts;
}

export function rampProfile(len, H) {
  return [[0, 0], [len, H]];
}

// ---------- Mesh generation ----------

// Returns { top, sides } BufferGeometries in world space.
export function solidGeometry(s, { uvScale = 4, sides = true } = {}) {
  const pu = s.pu;
  const ph = s.ph;
  const n = pu.length;
  const hx = s.hx;
  const hz = s.hz;
  const y0 = s.y0;
  const top = [];
  const topUv = [];
  const idx = [];
  for (let i = 0; i < n; i++) {
    const lz = pu[i] - hz;
    // flat parts at ground level are lifted a hair so they don't z-fight with the terrain
    const y = y0 + Math.max(ph[i], 0.03);
    top.push(-hx, y, lz, hx, y, lz);
    topUv.push(0, pu[i] / uvScale, (2 * hx) / uvScale, pu[i] / uvScale);
    if (i > 0) {
      const a = (i - 1) * 2;
      const b = a + 1;
      const c = i * 2;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const gTop = new THREE.BufferGeometry();
  gTop.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  gTop.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  gTop.setIndex(idx);
  gTop.computeVertexNormals();
  // the profile is built with u increasing toward +z; ensure normals point up
  const nr = gTop.attributes.normal;
  if (nr.count && nr.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    gTop.setIndex(idx);
    gTop.computeVertexNormals();
  }
  let gSides = null;
  if (sides) {
    const p = [];
    const uv = [];
    const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, u0, v0, u1, v1, v2, v3) => {
      // a-b bottom, c-d top (c above b, d above a)
      p.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
      uv.push(u0, v0, u1, v1, u1, v2, u0, v0, u1, v2, u0, v3);
    };
    for (const side of [-1, 1]) {
      const x = hx * side;
      for (let i = 0; i < n - 1; i++) {
        const za = pu[i] - hz;
        const zb = pu[i + 1] - hz;
        const ya = y0 + ph[i];
        const yb = y0 + ph[i + 1];
        if (ph[i] < 0.005 && ph[i + 1] < 0.005) continue;
        if (side < 0) quad(x, y0, za, x, y0, zb, x, yb, zb, x, ya, za, za / uvScale, y0 / uvScale, zb / uvScale, yb / uvScale, 0, ya / uvScale);
        else quad(x, y0, zb, x, y0, za, x, ya, za, x, yb, zb, zb / uvScale, y0 / uvScale, za / uvScale, ya / uvScale, 0, yb / uvScale);
      }
    }
    // ends
    const h0 = ph[0];
    const h1 = ph[n - 1];
    if (h0 > 0.01) quad(hx, y0, -hz, -hx, y0, -hz, -hx, y0 + h0, -hz, hx, y0 + h0, -hz, 0, 0, (2 * hx) / uvScale, 0, h0 / uvScale, h0 / uvScale);
    if (h1 > 0.01) quad(-hx, y0, hz, hx, y0, hz, hx, y0 + h1, hz, -hx, y0 + h1, hz, 0, 0, (2 * hx) / uvScale, 0, h1 / uvScale, h1 / uvScale);
    if (p.length) {
      gSides = new THREE.BufferGeometry();
      gSides.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      gSides.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      gSides.computeVertexNormals();
    }
  }
  const m = new THREE.Matrix4().makeRotationY(s.yaw).setPosition(s.cx, 0, s.cz);
  gTop.applyMatrix4(m);
  if (gSides) gSides.applyMatrix4(m);
  return { top: gTop, sides: gSides };
}

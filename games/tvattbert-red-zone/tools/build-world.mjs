#!/usr/bin/env node
// TVÄTTBERT: RED ZONE – STL -> game world converter.
//
// Reads a CitySlicer STL tile of Gothenburg (binary STL, units mm) and produces
// compact game data in ./data:
//   world.json        metadata (scale, sizes, water level, building count, ...)
//   terrain.bin.gz    Int16 heights in cm on a 2 m grid (vertices), row 0 = north edge
//   classes.bin.gz    Uint8 surface class per 2 m cell (0 urban,1 lawn,2 forest/park,3 water,4 building)
//   buildings.bin.gz  building footprints (roof triangles + outline edges + heights)
//   water.bin.gz      water surface triangles (river + ponds) with their levels
//   props.json.gz     procedurally placed props (cars, barricades, lamps, trees)
//
// How the STL is interpreted (found by analysing the file, see README):
//   * The whole model is one connected mesh. Up-facing triangles separated by vertical
//     walls form "patches".
//   * The largest sloped patches are the street/ground terrain (a DEM).
//   * Park/forest areas are raised ~0.9 mm and lawns ~0.4 mm above the DEM (print layers).
//     They are lowered back to the DEM for the game.
//   * Water (river/ponds) are flat patches below the DEM.
//   * Buildings are flat patches above the DEM (flat roofs). Vertical scale is 1:1.
//
// Usage: node tools/build-world.mjs [path/to/file.stl] [--size 4000]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const stlPath = args.find(a => !a.startsWith('--')) || 'stl/gothenburg-4000x4000m.stl';
const sizeArg = args.indexOf('--size');
const WORLD_M = sizeArg >= 0 ? Number(args[sizeArg + 1]) : 4000; // real-world metres covered by the tile
const OUT = path.resolve('data');
fs.mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---------------------------------------------------------------- parse STL
const buf = fs.readFileSync(stlPath);
const nTri = buf.readUInt32LE(80);
if (84 + nTri * 50 !== buf.length) throw new Error('Only binary STL is supported');
const raw = new Float32Array(nTri * 9);
for (let i = 0; i < nTri; i++) {
  const o = 84 + i * 50 + 12;
  for (let k = 0; k < 9; k++) raw[i * 9 + k] = buf.readFloatLE(o + k * 4);
}
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (let i = 0; i < nTri * 3; i++) {
  const x = raw[i * 3], y = raw[i * 3 + 1];
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const MODEL_MM = maxX - minX;
const S = WORLD_M / MODEL_MM; // metres per mm (also used vertically: 1:1)
log(`STL ${path.basename(stlPath)}: ${nTri} triangles, ${MODEL_MM.toFixed(1)} mm -> ${WORLD_M} m (scale ${S.toFixed(3)} m/mm)`);

// ---------------------------------------------------------------- weld vertices
const vmap = new Map();
const VX = [], VY = [], VZ = [];
const F = new Uint32Array(nTri * 3);
for (let i = 0; i < nTri * 3; i++) {
  const x = raw[i * 3] - minX, y = raw[i * 3 + 1] - minY, z = raw[i * 3 + 2];
  const qx = Math.round(x * 1000), qy = Math.round(y * 1000), qz = Math.round(z * 1000);
  const key = (qx * 400003 + qy) * 20011 + qz;
  let id = vmap.get(key);
  if (id === undefined) { id = VX.length; vmap.set(key, id); VX.push(x); VY.push(y); VZ.push(z); }
  F[i] = id;
}
const nV = VX.length;
log(`welded ${nV} vertices`);

// ---------------------------------------------------------------- triangle kinds
const kind = new Int8Array(nTri); // 1 up, -1 down, 0 wall
const area = new Float64Array(nTri);
const nzArr = new Float64Array(nTri);
for (let t = 0; t < nTri; t++) {
  const a = F[t * 3], b = F[t * 3 + 1], c = F[t * 3 + 2];
  const ux = VX[b] - VX[a], uy = VY[b] - VY[a], uz = VZ[b] - VZ[a];
  const vx = VX[c] - VX[a], vy = VY[c] - VY[a], vz = VZ[c] - VZ[a];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const L = Math.hypot(nx, ny, nz);
  area[t] = L / 2;
  const n = L > 1e-12 ? nz / L : 0;
  nzArr[t] = n;
  kind[t] = n > 0.01 ? 1 : n < -0.01 ? -1 : 0;
}

// ---------------------------------------------------------------- edges + patches
const edgeMap = new Map(); // key -> [t1, t2]
const ekey = (a, b) => (a < b ? a * nV + b : b * nV + a);
for (let t = 0; t < nTri; t++) {
  for (let e = 0; e < 3; e++) {
    const a = F[t * 3 + e], b = F[t * 3 + (e + 1) % 3];
    const k = ekey(a, b);
    const ex = edgeMap.get(k);
    if (ex) ex.push(t); else edgeMap.set(k, [t]);
  }
}
const parent = new Int32Array(nTri).map((_, i) => i);
const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
for (const ts of edgeMap.values()) {
  if (ts.length < 2) continue;
  for (let i = 1; i < ts.length; i++) {
    if (kind[ts[0]] === 1 && kind[ts[i]] === 1) {
      const ra = find(ts[0]), rb = find(ts[i]);
      if (ra !== rb) parent[rb] = ra;
    }
  }
}
const pid = new Int32Array(nTri).fill(-1);
const rootToPid = new Map();
let nP = 0;
for (let t = 0; t < nTri; t++) {
  if (kind[t] !== 1) continue;
  const r = find(t);
  let p = rootToPid.get(r);
  if (p === undefined) { p = nP++; rootToPid.set(r, p); }
  pid[t] = p;
}
const pArea = new Float64Array(nP), pZmin = new Float64Array(nP).fill(Infinity), pZmax = new Float64Array(nP).fill(-Infinity);
const pFlatArea = new Float64Array(nP);
for (let t = 0; t < nTri; t++) {
  const p = pid[t]; if (p < 0) continue;
  pArea[p] += area[t];
  if (nzArr[t] > 0.99999) pFlatArea[p] += area[t];
  for (let k = 0; k < 3; k++) { const z = VZ[F[t * 3 + k]]; if (z < pZmin[p]) pZmin[p] = z; if (z > pZmax[p]) pZmax[p] = z; }
}
const pFlat = new Uint8Array(nP);
for (let p = 0; p < nP; p++) pFlat[p] = (pFlatArea[p] / pArea[p] > 0.999 && pZmax[p] - pZmin[p] < 1e-3) ? 1 : 0;
log(`${nP} surface patches`);

// ---------------------------------------------------------------- rasterize (1 m)
const R = WORLD_M; // raster size in pixels (1 m)
const pxPerMm = R / MODEL_MM;
const HM = new Float32Array(R * R).fill(NaN);
const LAB = new Int32Array(R * R).fill(-1);
for (let t = 0; t < nTri; t++) {
  if (kind[t] !== 1) continue;
  const ia = F[t * 3], ib = F[t * 3 + 1], ic = F[t * 3 + 2];
  const x0 = VX[ia] * pxPerMm, y0 = VY[ia] * pxPerMm, z0 = VZ[ia];
  const x1 = VX[ib] * pxPerMm, y1 = VY[ib] * pxPerMm, z1 = VZ[ib];
  const x2 = VX[ic] * pxPerMm, y2 = VY[ic] * pxPerMm, z2 = VZ[ic];
  const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (Math.abs(d) < 1e-12) continue;
  const ixa = Math.max(0, Math.floor(Math.min(x0, x1, x2))), ixb = Math.min(R - 1, Math.ceil(Math.max(x0, x1, x2)));
  const iya = Math.max(0, Math.floor(Math.min(y0, y1, y2))), iyb = Math.min(R - 1, Math.ceil(Math.max(y0, y1, y2)));
  const p = pid[t];
  for (let iy = iya; iy <= iyb; iy++) {
    const py = iy + 0.5;
    for (let ix = ixa; ix <= ixb; ix++) {
      const px = ix + 0.5;
      const a = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / d;
      const b = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / d;
      const c = 1 - a - b;
      if (a < -1e-6 || b < -1e-6 || c < -1e-6) continue;
      const z = a * z0 + b * z1 + c * z2;
      const idx = iy * R + ix; // iy measured northwards from the south edge
      if (!(HM[idx] >= z)) { HM[idx] = z; LAB[idx] = p; }
    }
  }
}
log('rasterized top surface at 1 m');

// ---------------------------------------------------------------- DEM inpainting
function inpaint(vals, w, h) {
  // vals: Float32Array with NaN for unknown. Pyramid fill + smoothing.
  let known = 0; for (let i = 0; i < vals.length; i++) if (!Number.isNaN(vals[i])) known++;
  if (known === vals.length) return vals;
  if (w <= 2 || h <= 2) {
    let s = 0, c = 0; for (const v of vals) if (!Number.isNaN(v)) { s += v; c++; }
    const m = c ? s / c : 0; return vals.map(v => (Number.isNaN(v) ? m : v));
  }
  const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2);
  const coarse = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    let s = 0, c = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = 2 * x + dx, yy = 2 * y + dy; if (xx >= w || yy >= h) continue;
      const v = vals[yy * w + xx]; if (!Number.isNaN(v)) { s += v; c++; }
    }
    coarse[y * w2 + x] = c ? s / c : NaN;
  }
  const filled = inpaint(coarse, w2, h2);
  let out = new Float32Array(w * h);
  const isK = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, v = vals[i];
    if (!Number.isNaN(v)) { out[i] = v; isK[i] = 1; }
    else {
      // bilinear from coarse grid
      const fx = Math.min(w2 - 1, Math.max(0, (x - 0.5) / 2)), fy = Math.min(h2 - 1, Math.max(0, (y - 0.5) / 2));
      const xa = Math.floor(fx), ya = Math.floor(fy), xb = Math.min(w2 - 1, xa + 1), yb = Math.min(h2 - 1, ya + 1);
      const tx = fx - xa, ty = fy - ya;
      out[i] = (filled[ya * w2 + xa] * (1 - tx) + filled[ya * w2 + xb] * tx) * (1 - ty) + (filled[yb * w2 + xa] * (1 - tx) + filled[yb * w2 + xb] * tx) * ty;
    }
  }
  for (let it = 0; it < 3; it++) {
    const nx = new Float32Array(out);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (isK[i]) continue;
      nx[i] = (out[i - 1] + out[i + 1] + out[i - w] + out[i + w]) * 0.25;
    }
    out = nx;
  }
  return out;
}

function patchMedianOffsets(dem) {
  // median of (HM - DEM) for each patch
  const counts = new Int32Array(nP + 1);
  for (let i = 0; i < LAB.length; i++) if (LAB[i] >= 0) counts[LAB[i] + 1]++;
  for (let p = 0; p < nP; p++) counts[p + 1] += counts[p];
  const vals = new Float32Array(counts[nP]);
  const fill = counts.slice();
  for (let i = 0; i < LAB.length; i++) { const p = LAB[i]; if (p >= 0) vals[fill[p]++] = HM[i] - dem[i]; }
  const off = new Float64Array(nP).fill(NaN);
  for (let p = 0; p < nP; p++) {
    const a = counts[p], b = counts[p + 1]; if (b <= a) continue;
    const sub = vals.subarray(a, b).sort();
    off[p] = sub[(sub.length / 2) | 0];
  }
  return off;
}

let largest = -1;
for (let p = 0; p < nP; p++) if (!pFlat[p] && (largest < 0 || pArea[p] > pArea[largest])) largest = p;
let isBase = new Uint8Array(nP); isBase[largest] = 1;
// also seed with other big sloped patches that are low (other river bank etc.)
let dem, off;
for (let pass = 0; pass < 3; pass++) {
  const known = new Float32Array(R * R).fill(NaN);
  for (let i = 0; i < LAB.length; i++) if (LAB[i] >= 0 && isBase[LAB[i]]) known[i] = HM[i];
  dem = inpaint(known, R, R);
  off = patchMedianOffsets(dem);
  const nb = new Uint8Array(nP);
  for (let p = 0; p < nP; p++) {
    if (Number.isNaN(off[p])) continue;
    if (!pFlat[p] && Math.abs(off[p]) < 0.15) nb[p] = 1;
  }
  nb[largest] = 1;
  isBase = nb;
  log(`DEM pass ${pass + 1}: ${isBase.reduce((a, b) => a + b, 0)} base patches`);
}

// ---------------------------------------------------------------- classify patches
// classes: 0 urban ground, 1 lawn, 2 park/forest, 3 water, 4 building, 5 other
const CL = { URBAN: 0, LAWN: 1, PARK: 2, WATER: 3, BUILDING: 4 };
const pClass = new Uint8Array(nP);
let waterZ = NaN, waterBest = 0;
for (let p = 0; p < nP; p++) {
  const o = Number.isNaN(off[p]) ? 0 : off[p];
  if (pFlat[p]) {
    if (o < -0.3) { pClass[p] = CL.WATER; if (pArea[p] > waterBest) { waterBest = pArea[p]; waterZ = pZmin[p]; } }
    else if (o > 0.09) pClass[p] = CL.BUILDING;
    else pClass[p] = CL.URBAN;
  } else {
    if (o >= 0.65) pClass[p] = CL.PARK;
    else if (o >= 0.2) pClass[p] = CL.LAWN;
    else pClass[p] = CL.URBAN;
  }
}
if (Number.isNaN(waterZ)) waterZ = Math.min(...pZmin);
const toM = zmm => (zmm - waterZ) * S;
const stat = [0, 0, 0, 0, 0];
for (let p = 0; p < nP; p++) stat[pClass[p]] += pArea[p] * S * S;
log(`water level ${waterZ.toFixed(3)} mm; areas km²: urban ${(stat[0] / 1e6).toFixed(2)} lawn ${(stat[1] / 1e6).toFixed(2)} park ${(stat[2] / 1e6).toFixed(2)} water ${(stat[3] / 1e6).toFixed(2)} buildings ${(stat[4] / 1e6).toFixed(2)}`);

// pond levels: each non-river water patch gets its own surface height (m)
const pWaterLevel = new Float64Array(nP).fill(NaN);
{
  const sum = new Float64Array(nP), cnt = new Int32Array(nP);
  for (let i = 0; i < LAB.length; i++) { const p = LAB[i]; if (p >= 0 && pClass[p] === CL.WATER) { sum[p] += dem[i]; cnt[p]++; } }
  for (let p = 0; p < nP; p++) if (pClass[p] === CL.WATER) {
    if (Math.abs(pZmin[p] - waterZ) < 0.01) pWaterLevel[p] = 0; // river / sea level
    else pWaterLevel[p] = cnt[p] ? toM(sum[p] / cnt[p]) - 0.8 : toM(pZmin[p]);
  }
}

// ---------------------------------------------------------------- ground height (m) at 1 m
const GROUND = new Float32Array(R * R);
for (let i = 0; i < R * R; i++) {
  const p = LAB[i];
  if (p >= 0 && pClass[p] === CL.WATER) GROUND[i] = pWaterLevel[p] === 0 ? -4.5 : pWaterLevel[p] - 1.6;
  else GROUND[i] = toM(dem[i]);
}
// lightly smooth land (removes DEM triangulation facets), keep water beds
{
  const tmp = new Float32Array(GROUND);
  for (let y = 1; y < R - 1; y++) for (let x = 1; x < R - 1; x++) {
    const i = y * R + x; const p = LAB[i];
    if (p >= 0 && pClass[p] === CL.WATER) continue;
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = i + dy * R + dx; const q = LAB[j];
      if (q >= 0 && pClass[q] === CL.WATER) continue;
      s += GROUND[j]; c++;
    }
    tmp[i] = s / c;
  }
  GROUND.set(tmp);
}
const groundAt = (xm, ym) => { // xm east, ym north (metres from SW corner)
  const x = Math.min(R - 1, Math.max(0, Math.floor(xm))), y = Math.min(R - 1, Math.max(0, Math.floor(ym)));
  return GROUND[y * R + x];
};

// ---------------------------------------------------------------- terrain export (2 m vertex grid)
const G = 2; // metres per cell
const NV = WORLD_M / G + 1; // vertices per side
const terr = new Int16Array(NV * NV);
for (let k = 0; k < NV; k++) { // k = row from north
  const ym = WORLD_M - k * G;
  for (let i = 0; i < NV; i++) {
    const xm = i * G;
    // average of up to 4 surrounding 1 m pixels
    let s = 0, c = 0;
    for (const dx of [-1, 0]) for (const dy of [-1, 0]) {
      const px = Math.floor(xm) + dx, py = Math.floor(ym) + dy;
      if (px < 0 || py < 0 || px >= R || py >= R) continue;
      s += GROUND[py * R + px]; c++;
    }
    terr[k * NV + i] = Math.round((s / c) * 100);
  }
}
// ---------------------------------------------------------------- class export (2 m cells)
const NC = WORLD_M / G;
const cls = new Uint8Array(NC * NC);
const prio = [0, 1, 2, 4, 3]; // urban<lawn<park<building<water  (index by class -> priority)
for (let k = 0; k < NC; k++) {
  for (let i = 0; i < NC; i++) {
    const votes = [0, 0, 0, 0, 0];
    for (let dy = 0; dy < G; dy++) for (let dx = 0; dx < G; dx++) {
      const px = i * G + dx, py = WORLD_M - 1 - (k * G + dy);
      const p = LAB[py * R + px];
      votes[p >= 0 ? pClass[p] : 0]++;
    }
    let best = 0;
    for (let c = 1; c < 5; c++) if (votes[c] > votes[best] || (votes[c] === votes[best] && prio[c] > prio[best])) best = c;
    // water/building need majority to be blocking; otherwise fall back to the dominant ground type
    if ((best === CL.WATER || best === CL.BUILDING) && votes[best] < 2) {
      best = votes[2] >= votes[1] && votes[2] >= votes[0] ? 2 : votes[1] > votes[0] ? 1 : 0;
    }
    cls[k * NC + i] = best;
  }
}

// ---------------------------------------------------------------- buildings
// game coordinates: X = xm - W/2 (east), Z = W/2 - ym (south)
const HALF = WORLD_M / 2;
const toGX = xmm => xmm * S - HALF;
const toGZ = ymm => HALF - ymm * S;
const patchTris = Array.from({ length: nP }, () => []);
for (let t = 0; t < nTri; t++) if (pid[t] >= 0) patchTris[pid[t]].push(t);

const buildings = [];
for (let p = 0; p < nP; p++) {
  if (pClass[p] !== CL.BUILDING) continue;
  const areaM2 = pArea[p] * S * S;
  if (areaM2 < 4) continue;
  const tris = patchTris[p];
  const local = new Map(); const verts = [];
  const li = v => { let id = local.get(v); if (id === undefined) { id = verts.length; local.set(v, id); verts.push(v); } return id; };
  const idx = [];
  const inPatch = new Set(tris);
  const edges = [];
  for (const t of tris) {
    for (let e = 0; e < 3; e++) idx.push(li(F[t * 3 + e]));
    for (let e = 0; e < 3; e++) {
      const a = F[t * 3 + e], b = F[t * 3 + (e + 1) % 3];
      const ts = edgeMap.get(ekey(a, b));
      const other = ts.find(o => o !== t && inPatch.has(o));
      if (other === undefined) edges.push(li(a), li(b)); // directed, interior on the left (STL coords, CCW)
    }
  }
  // layer offset of the surface the building stands on (park layers are raised in the print)
  const offs = [];
  let gmin = Infinity, gmax = -Infinity, cx = 0, cy = 0;
  for (let e = 0; e < edges.length; e += 2) {
    const a = verts[edges[e]], b = verts[edges[e + 1]];
    const ax = VX[a] * pxPerMm, ay = VY[a] * pxPerMm, bx = VX[b] * pxPerMm, by = VY[b] * pxPerMm;
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const mx = (ax + bx) / 2 + (dy / L) * 3, my = (ay + by) / 2 - (dx / L) * 3; // 3 m outward (right side)
    const ix = Math.floor(mx), iy = Math.floor(my);
    if (ix >= 0 && iy >= 0 && ix < R && iy < R) {
      const q = LAB[iy * R + ix];
      if (q >= 0) {
        const c = pClass[q];
        if (c === CL.PARK || c === CL.LAWN) offs.push(off[q]);
        else if (c === CL.URBAN) offs.push(0);
      }
    }
  }
  for (const v of verts) {
    const g = groundAt(VX[v] * pxPerMm, VY[v] * pxPerMm);
    if (g < gmin) gmin = g; if (g > gmax) gmax = g;
    cx += VX[v]; cy += VY[v];
  }
  cx /= verts.length; cy /= verts.length;
  offs.sort((a, b) => a - b);
  const layer = offs.length ? offs[(offs.length / 2) | 0] : 0;
  let roof = toM(pZmax[p] - layer);
  if (roof < gmax + 2.5) roof = gmax + 2.5;
  buildings.push({
    roof, base: gmin - 1.0, area: areaM2,
    cx: toGX(cx), cz: toGZ(cy),
    verts: verts.map(v => [toGX(VX[v]), toGZ(VY[v])]),
    tris: idx, edges,
  });
}
log(`${buildings.length} buildings`);
{
  const hs = buildings.map(b => b.roof - (b.base + 1)).sort((a, b) => a - b);
  log(`building height (m) p10 ${hs[(hs.length * 0.1) | 0].toFixed(1)} median ${hs[(hs.length * 0.5) | 0].toFixed(1)} p90 ${hs[(hs.length * 0.9) | 0].toFixed(1)} max ${hs[hs.length - 1].toFixed(1)}`);
}
// binary: [u32 count] then per building: f32 roof, f32 base, u32 nVerts, u32 nIdx, u32 nEdgeIdx, f32 verts[2n], u32 idx[], u32 edges[]
function packBuildings() {
  let size = 4;
  for (const b of buildings) size += 20 + b.verts.length * 8 + b.tris.length * 4 + b.edges.length * 4;
  const ab = new ArrayBuffer(size); const dv = new DataView(ab); let o = 0;
  dv.setUint32(o, buildings.length, true); o += 4;
  for (const b of buildings) {
    dv.setFloat32(o, b.roof, true); o += 4; dv.setFloat32(o, b.base, true); o += 4;
    dv.setUint32(o, b.verts.length, true); o += 4; dv.setUint32(o, b.tris.length, true); o += 4; dv.setUint32(o, b.edges.length, true); o += 4;
    for (const [x, z] of b.verts) { dv.setFloat32(o, x, true); o += 4; dv.setFloat32(o, z, true); o += 4; }
    for (const i of b.tris) { dv.setUint32(o, i, true); o += 4; }
    for (const i of b.edges) { dv.setUint32(o, i, true); o += 4; }
  }
  return Buffer.from(ab);
}

// ---------------------------------------------------------------- water surfaces
function packWater() {
  const out = [];
  for (let p = 0; p < nP; p++) {
    if (pClass[p] !== CL.WATER) continue;
    for (const t of patchTris[p]) {
      for (let e = 0; e < 3; e++) { const v = F[t * 3 + e]; out.push(toGX(VX[v]), pWaterLevel[p], toGZ(VY[v])); }
    }
  }
  return Buffer.from(new Float32Array(out).buffer);
}

// ---------------------------------------------------------------- props
// Deterministic RNG
let seed = 1337;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// distance (m) to buildings / water on the 2 m class grid (chamfer 3-4)
const INF = 1e9;
const dist = new Float32Array(NC * NC).fill(INF);
for (let i = 0; i < NC * NC; i++) if (cls[i] === CL.BUILDING || cls[i] === CL.WATER) dist[i] = 0;
const D1 = G, D2 = G * Math.SQRT2;
for (let k = 0; k < NC; k++) for (let i = 0; i < NC; i++) {
  const j = k * NC + i; let d = dist[j];
  if (i > 0) d = Math.min(d, dist[j - 1] + D1);
  if (k > 0) { d = Math.min(d, dist[j - NC] + D1); if (i > 0) d = Math.min(d, dist[j - NC - 1] + D2); if (i < NC - 1) d = Math.min(d, dist[j - NC + 1] + D2); }
  dist[j] = d;
}
for (let k = NC - 1; k >= 0; k--) for (let i = NC - 1; i >= 0; i--) {
  const j = k * NC + i; let d = dist[j];
  if (i < NC - 1) d = Math.min(d, dist[j + 1] + D1);
  if (k < NC - 1) { d = Math.min(d, dist[j + NC] + D1); if (i < NC - 1) d = Math.min(d, dist[j + NC + 1] + D2); if (i > 0) d = Math.min(d, dist[j + NC - 1] + D2); }
  dist[j] = d;
}
const cellX = i => -HALF + (i + 0.5) * G, cellZ = k => -HALF + (k + 0.5) * G;
const distGrad = (i, k) => {
  const g = (ii, kk) => dist[Math.min(NC - 1, Math.max(0, kk)) * NC + Math.min(NC - 1, Math.max(0, ii))];
  return [g(i + 1, k) - g(i - 1, k), g(i, k + 1) - g(i, k - 1)];
};
const terrH = (X, Z) => {
  const i = Math.round((X + HALF) / G), k = Math.round((Z + HALF) / G);
  return terr[Math.min(NV - 1, Math.max(0, k)) * NV + Math.min(NV - 1, Math.max(0, i))] / 100;
};
const slopeAt = (i, k) => {
  const X = cellX(i), Z = cellZ(k);
  return Math.max(Math.abs(terrH(X + 2, Z) - terrH(X - 2, Z)), Math.abs(terrH(X, Z + 2) - terrH(X, Z - 2))) / 4;
};
// spatial reject grid
function spacer(minDist) {
  const cs = minDist, n = Math.ceil(WORLD_M / cs) + 1; const g = new Map();
  return (X, Z) => {
    const gi = Math.floor((X + HALF) / cs), gk = Math.floor((Z + HALF) / cs);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = g.get((gk + b) * n + gi + a); if (!l) continue;
      for (const [x, z] of l) if ((x - X) ** 2 + (z - Z) ** 2 < minDist * minDist) return false;
    }
    const key = gk * n + gi; if (!g.has(key)) g.set(key, []); g.get(key).push([X, Z]); return true;
  };
}
const props = { cars: [], barricades: [], lamps: [], trees: [], debris: [] };
const carOk = spacer(7), lampOk = spacer(28), barOk = spacer(140), debOk = spacer(18);
const order = Array.from({ length: NC * NC }, (_, i) => i);
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
const edgeMargin = 30;
for (const j of order) {
  const k = (j / NC) | 0, i = j % NC;
  const c = cls[j]; const d = dist[j];
  const X = cellX(i) + (rnd() - 0.5) * G, Z = cellZ(k) + (rnd() - 0.5) * G;
  if (Math.abs(X) > HALF - edgeMargin || Math.abs(Z) > HALF - edgeMargin) continue;
  if (c === CL.URBAN) {
    const [gx, gz] = distGrad(i, k);
    const gl = Math.hypot(gx, gz);
    const along = gl > 0 ? Math.atan2(-gz, gx) + Math.PI / 2 : rnd() * Math.PI; // yaw parallel to the facade
    const sl = slopeAt(i, k);
    if (d >= 3.5 && d <= 6 && sl < 0.18 && rnd() < 0.035 && carOk(X, Z)) {
      const r = rnd();
      const type = r < 0.035 ? 'police' : r < 0.06 ? 'military' : r < 0.075 ? 'ambulance' : r < 0.09 ? 'bus' : 'car';
      props.cars.push([+X.toFixed(1), +Z.toFixed(1), +(along + (rnd() < 0.15 ? (rnd() - 0.5) * 1.2 : 0)).toFixed(2), type, rnd() < 0.18 ? 1 : 0]);
    } else if (d >= 2 && d <= 3.2 && sl < 0.25 && rnd() < 0.3 && lampOk(X, Z)) {
      props.lamps.push([+X.toFixed(1), +Z.toFixed(1), +along.toFixed(2)]);
    } else if (d >= 6 && d <= 14 && gl < 0.6 * G && sl < 0.15 && rnd() < 0.02 && barOk(X, Z)) {
      // ridge of the distance field = street centre -> barricade across the street
      const across = gl > 0 ? Math.atan2(-gz, gx) : 0;
      props.barricades.push([+X.toFixed(1), +Z.toFixed(1), +across.toFixed(2), +(d * 2).toFixed(1), rnd() < 0.35 ? 'military' : rnd() < 0.5 ? 'police' : 'civil']);
    } else if (d >= 2 && d < 5 && rnd() < 0.004 && debOk(X, Z)) {
      props.debris.push([+X.toFixed(1), +Z.toFixed(1), +(rnd() * 6.28).toFixed(2)]);
    } else if (d > 9 && rnd() < 0.012) {
      props.trees.push([+X.toFixed(1), +Z.toFixed(1), +(0.7 + rnd() * 0.6).toFixed(2), 0]);
    }
  } else if (c === CL.PARK) {
    if (rnd() < 0.055) props.trees.push([+X.toFixed(1), +Z.toFixed(1), +(0.6 + rnd() * 0.9).toFixed(2), rnd() < 0.5 ? 1 : 2]);
  } else if (c === CL.LAWN) {
    if (rnd() < 0.012) props.trees.push([+X.toFixed(1), +Z.toFixed(1), +(0.7 + rnd() * 0.6).toFixed(2), 0]);
  }
}
log(`props: ${props.cars.length} vehicles, ${props.barricades.length} barricades, ${props.lamps.length} lamps, ${props.trees.length} trees, ${props.debris.length} debris`);

// ---------------------------------------------------------------- write
const gz = b => zlib.gzipSync(b, { level: 9 });
fs.writeFileSync(path.join(OUT, 'terrain.bin.gz'), gz(Buffer.from(terr.buffer)));
fs.writeFileSync(path.join(OUT, 'classes.bin.gz'), gz(Buffer.from(cls.buffer)));
fs.writeFileSync(path.join(OUT, 'buildings.bin.gz'), gz(packBuildings()));
fs.writeFileSync(path.join(OUT, 'water.bin.gz'), gz(packWater()));
fs.writeFileSync(path.join(OUT, 'props.json.gz'), gz(Buffer.from(JSON.stringify(props))));
const meta = {
  source: path.basename(stlPath), generated: new Date().toISOString(),
  worldSize: WORLD_M, half: HALF, scaleMetersPerMm: S, modelMm: MODEL_MM,
  waterLevelMm: waterZ, gridMeters: G, terrainVerts: NV, classCells: NC,
  buildings: buildings.length, triangles: nTri, patches: nP,
  classes: { 0: 'urban', 1: 'lawn', 2: 'park/forest', 3: 'water', 4: 'building' },
  coordinateSystem: 'X east, Z south, Y up; origin = tile centre; metres',
};
fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(meta, null, 2));
for (const f of fs.readdirSync(OUT)) log(`  data/${f}  ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`);
log('done');

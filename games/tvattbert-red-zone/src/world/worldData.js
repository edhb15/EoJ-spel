// Loads the data produced by tools/build-world.mjs and answers spatial queries
// (ground height, surface class) for every other system.
import { clamp } from '../core/util.js';

export const CLASS = { URBAN: 0, LAWN: 1, PARK: 2, WATER: 3, BUILDING: 4 };

async function fetchBin(url, onProgress, b64 = false) {
  const res = await fetch(b64 ? url + '.b64.txt' : url);
  if (!res.ok) throw new Error(`Kunde inte ladda ${url} (${res.status})`);
  let ab;
  if (b64) { // hosts that only serve text: base64 of the gzip file
    const bin = atob((await res.text()).trim()); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    ab = u.buffer;
  } else ab = await res.arrayBuffer();
  const u8 = new Uint8Array(ab);
  if (u8[0] === 0x1f && u8[1] === 0x8b) { // gzip – decompress in the browser
    const ds = new DecompressionStream('gzip');
    ab = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
  }
  onProgress && onProgress();
  return ab;
}

export class WorldData {
  async load(base = 'data/', onProgress = () => {}) {
    const meta = await (await fetch(base + 'world.json')).json();
    this.meta = meta;
    let done = 0; const total = 5;
    const step = name => () => onProgress(++done / total, name);
    const b64 = meta.packing === 'b64';
    const [terr, cls, bld, water, props] = await Promise.all([
      fetchBin(base + 'terrain.bin.gz', step('terräng'), b64),
      fetchBin(base + 'classes.bin.gz', step('ytor'), b64),
      fetchBin(base + 'buildings.bin.gz', step('byggnader'), b64),
      fetchBin(base + 'water.bin.gz', step('vatten'), b64),
      fetchBin(base + 'props.json.gz', step('föremål'), b64),
    ]);
    this.size = meta.worldSize; this.half = meta.half; this.G = meta.gridMeters;
    this.NV = meta.terrainVerts; this.NC = meta.classCells;
    const t16 = new Int16Array(terr);
    this.height = new Float32Array(t16.length);
    for (let i = 0; i < t16.length; i++) this.height[i] = t16[i] / 100;
    this.cls = new Uint8Array(cls);
    this.water = new Float32Array(water);
    this.props = JSON.parse(new TextDecoder().decode(props));
    this.buildings = parseBuildings(bld);
    this.floorZones = []; // {x0,z0,x1,z1,y} – flat floors that override terrain (hospital, interiors)
    return this;
  }

  // terrain height (bilinear on the 2 m vertex grid)
  terrainHeight(x, z) {
    const fx = clamp((x + this.half) / this.G, 0, this.NV - 1.001);
    const fz = clamp((z + this.half) / this.G, 0, this.NV - 1.001);
    const i = fx | 0, k = fz | 0, tx = fx - i, tz = fz - k;
    const H = this.height, N = this.NV, o = k * N + i;
    // split each quad the same way the render mesh does (diagonal from (i,k+1) to (i+1,k))
    if (tx + tz <= 1) return H[o] + (H[o + 1] - H[o]) * tx + (H[o + N] - H[o]) * tz;
    return H[o + N + 1] + (H[o + N] - H[o + N + 1]) * (1 - tx) + (H[o + 1] - H[o + N + 1]) * (1 - tz);
  }
  // walkable ground height (floor zones win over terrain)
  groundHeight(x, z) {
    for (const f of this.floorZones) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) return f.y;
    return this.terrainHeight(x, z);
  }
  floorZoneAt(x, z) {
    for (const f of this.floorZones) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) return f;
    return null;
  }
  classAt(x, z) {
    const i = Math.floor((x + this.half) / this.G), k = Math.floor((z + this.half) / this.G);
    if (i < 0 || k < 0 || i >= this.NC || k >= this.NC) return CLASS.URBAN;
    return this.cls[k * this.NC + i];
  }
  inBounds(x, z, margin = 0) { return Math.abs(x) < this.half - margin && Math.abs(z) < this.half - margin; }

  // Flatten terrain inside a rectangle (used under the hospital) with a smooth skirt.
  flatten(x0, z0, x1, z1, y, skirt = 12) {
    const N = this.NV, G = this.G;
    const i0 = Math.max(0, Math.floor((x0 - skirt + this.half) / G)), i1 = Math.min(N - 1, Math.ceil((x1 + skirt + this.half) / G));
    const k0 = Math.max(0, Math.floor((z0 - skirt + this.half) / G)), k1 = Math.min(N - 1, Math.ceil((z1 + skirt + this.half) / G));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const x = -this.half + i * G, z = -this.half + k * G;
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
      const d = Math.hypot(dx, dz);
      const t = clamp(d / skirt, 0, 1);
      const s = t * t * (3 - 2 * t);
      const o = k * N + i;
      this.height[o] = y + (this.height[o] - y) * s;
    }
  }
  // Mark cells of a rectangle as a given class (e.g. hospital footprint = building for the minimap).
  paintClass(x0, z0, x1, z1, c) {
    const G = this.G;
    for (let k = Math.floor((z0 + this.half) / G); k <= Math.floor((z1 + this.half) / G); k++)
      for (let i = Math.floor((x0 + this.half) / G); i <= Math.floor((x1 + this.half) / G); i++)
        if (i >= 0 && k >= 0 && i < this.NC && k < this.NC) this.cls[k * this.NC + i] = c;
  }
}

function parseBuildings(ab) {
  const dv = new DataView(ab); let o = 0;
  const n = dv.getUint32(o, true); o += 4;
  const out = [];
  for (let b = 0; b < n; b++) {
    const roof = dv.getFloat32(o, true); o += 4;
    const base = dv.getFloat32(o, true); o += 4;
    const nv = dv.getUint32(o, true); o += 4;
    const ni = dv.getUint32(o, true); o += 4;
    const ne = dv.getUint32(o, true); o += 4;
    const verts = new Float32Array(ab.slice(o, o + nv * 8)); o += nv * 8;
    const tris = new Uint32Array(ab.slice(o, o + ni * 4)); o += ni * 4;
    const edges = new Uint32Array(ab.slice(o, o + ne * 4)); o += ne * 4;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, cx = 0, cz = 0;
    for (let i = 0; i < nv; i++) {
      const x = verts[i * 2], z = verts[i * 2 + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
      cx += x; cz += z;
    }
    let area = 0;
    for (let i = 0; i < ni; i += 3) {
      const a = tris[i] * 2, bb = tris[i + 1] * 2, c = tris[i + 2] * 2;
      area += Math.abs((verts[bb] - verts[a]) * (verts[c + 1] - verts[a + 1]) - (verts[c] - verts[a]) * (verts[bb + 1] - verts[a + 1])) / 2;
    }
    out.push({ id: b, roof, base, verts, tris, edges, x0, z0, x1, z1, cx: cx / nv, cz: cz / nv, area, removed: false });
  }
  return out;
}

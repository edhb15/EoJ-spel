// Chicago Bois – procedural city: blocks, buildings, streets, props, collision and navigation.
'use strict';
(function (CB) {
  const B = BABYLON, C = CB.C, M = CB.M;
  const hex = M.hex;
  const YB = C.CURB;

  const City = CB.City = {
    colliders: [], cgrid: new Map(), CG: 12, stamp: 1,
    blocks: [], storefronts: [], dumpsters: [], props: [], pgrid: new Map(),
    graffiti: [], atms: [], hotdogs: [], breakins: [], speedCams: [], raceStarts: [], ramps: [],
    parking: [], covers: [], lamps: [], chunks: new Map(), chunkMeshes: [], benches: [],
    playerSpawn: { x: 314, z: 34, yaw: -Math.PI / 2 },
  };

  // ------------------------------------------------------------------ palette
  const PAL = {
    asphalt: hex(0x3b3e44), sidewalk: hex(0xb8b4ab), curb: hex(0x9a978f), grass: hex(0x5b9a45), grass2: hex(0x6aab4f),
    lot: hex(0x46494f), plaza: hex(0xcbc3b2), path: hex(0xc9b48f), sand: hex(0xe3cf9a), yellow: hex(0xf2c230),
    white: hex(0xeeeeea), alley: hex(0x55575b), roof: hex(0x77736c), roof2: hex(0x5d5a55), deck: hex(0x8a6a4a),
    lsteel: hex(0x3e5244), dark: hex(0x22252a),
    brick: [0xb5533c, 0x9c4a35, 0xc46a4b, 0x8a5a44, 0xa8806a, 0x6e4b3a, 0xc7a17a, 0x7d3b2f, 0xb07050].map(hex),
    office: [0xd6d2c8, 0xbfc6cc, 0xe0d4bf, 0xa9b4bd, 0xcfc0a8, 0xc8b8a8].map(hex),
    stone: [0xe6dccb, 0xd4c7ae, 0xc9bda6, 0xb8b0a0, 0xddd0b8].map(hex),
    glass: [0x9fc3e0, 0x8fb8b0, 0xb5c8e8, 0xd6c48f, 0x7aa0c8, 0xaab9c9, 0x9bb0c4].map(hex),
    shopWall: [0x2e4a3a, 0x6b2f2f, 0x2f3f6b, 0x4a3b2a, 0x2a2a2a, 0x6b5a2f, 0x3d3d46].map(hex),
    awning: [0xc0392b, 0x27ae60, 0x2980b9, 0x8e44ad, 0xd35400, 0x16a085, 0xf1c40f, 0x1f3a93].map(hex),
    car: [0xc0392b, 0x2c3e50, 0xecf0f1, 0x7f8c8d, 0x16a085, 0x8e44ad, 0xd35400, 0x2980b9, 0x111111, 0x95a5a6, 0x6d4c41, 0x1e8449].map(hex),
  };
  City.PAL = PAL;

  // ------------------------------------------------------------------ block plan
  const SPECIAL = {
    '7,4': 'bean', '7,3': 'fountain', '3,3': 'skydeck',
    '0,6': 'park', '5,0': 'park', '2,7': 'park', '6,6': 'park',
    '1,4': 'parking', '6,1': 'parking', '4,7': 'parking', '3,1': 'parking',
    '0,0': 'industrial', '1,0': 'industrial', '0,1': 'industrial', '1,1': 'industrial',
    '2,1': 'shops', '5,6': 'shops', '6,4': 'shops', '1,6': 'shops', '6,2': 'shops', '3,6': 'shops', '0,3': 'shops', '7,6': 'shops',
  };
  function blockType(bi, bj) {
    const k = bi + ',' + bj;
    if (SPECIAL[k]) return SPECIAL[k];
    if (bi >= 2 && bi <= 5 && bj >= 2 && bj <= 5) return 'downtown';
    return 'apartments';
  }
  City.blockAt = function (x, z) {
    const lx = x + C.HALF, lz = z + C.HALF;
    const bi = Math.floor(lx / C.P), bj = Math.floor(lz / C.P);
    if (bi < 0 || bj < 0 || bi >= C.N || bj >= C.N) return null;
    const ox = lx - bi * C.P, oz = lz - bj * C.P;
    if (ox < C.ROAD / 2 || ox > C.P - C.ROAD / 2 || oz < C.ROAD / 2 || oz > C.P - C.ROAD / 2) return null;
    return City.blocks[bi * C.N + bj];
  };

  // ------------------------------------------------------------------ chunks
  let R; // seeded rng for generation
  function chunkAt(x, z) {
    const cx = M.clamp(Math.floor((x + 350) / 175), 0, 4), cz = M.clamp(Math.floor((z + 350) / 175), 0, 4);
    const key = cx * 10 + cz;
    let ch = City.chunks.get(key);
    if (!ch) {
      ch = { key, cx: -350 + (cx + 0.5) * 175, cz: -350 + (cz + 0.5) * 175,
        office: new CB.Geo(), brick: new CB.Geo(), stone: new CB.Geo(), glass: new CB.Geo(), plain: new CB.Geo() };
      City.chunks.set(key, ch);
    }
    return ch;
  }

  // ------------------------------------------------------------------ colliders
  function addCollider(x0, z0, x1, z1, h, kind) {
    if (x0 > x1) { const t = x0; x0 = x1; x1 = t; }
    if (z0 > z1) { const t = z0; z0 = z1; z1 = t; }
    const c = { x0, z0, x1, z1, h, kind: kind || 'b', s: 0 };
    const id = City.colliders.length;
    City.colliders.push(c);
    const G = City.CG;
    for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++) {
      for (let gz = Math.floor(z0 / G); gz <= Math.floor(z1 / G); gz++) {
        const k = gx * 4096 + gz;
        let a = City.cgrid.get(k);
        if (!a) { a = []; City.cgrid.set(k, a); }
        a.push(id);
      }
    }
    return c;
  }
  City.addCollider = addCollider;

  // Calls fn(collider) once for every collider near the circle.
  City.near = function (x, z, r, fn) {
    const G = City.CG, st = ++City.stamp;
    const gx0 = Math.floor((x - r) / G), gx1 = Math.floor((x + r) / G);
    const gz0 = Math.floor((z - r) / G), gz1 = Math.floor((z + r) / G);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const a = City.cgrid.get(gx * 4096 + gz);
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const c = City.colliders[a[i]];
          if (c.s === st) continue;
          c.s = st;
          if (c.x1 < x - r || c.x0 > x + r || c.z1 < z - r || c.z0 > z + r) continue;
          fn(c);
        }
      }
    }
  };

  // Push a circle (o.x,o.z,radius r) out of every collider taller than footY + step.
  // Returns total push (nx,nz) or null.
  const RES = { x: 0, z: 0, n: 0 };
  City.resolve = function (o, r, footY, step) {
    let px = 0, pz = 0, hit = 0;
    City.near(o.x, o.z, r, (c) => {
      if (c.h <= footY + step) return;
      const cx = M.clamp(o.x, c.x0, c.x1), cz = M.clamp(o.z, c.z0, c.z1);
      let dx = o.x - cx, dz = o.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = r - d;
        dx /= d; dz /= d;
        o.x += dx * push; o.z += dz * push; px += dx * push; pz += dz * push;
      } else {
        // centre inside the box: push out along the shallowest axis
        const l = o.x - c.x0, rr = c.x1 - o.x, b = o.z - c.z0, t = c.z1 - o.z;
        const m = Math.min(l, rr, b, t);
        if (m === l) { o.x = c.x0 - r; px -= l + r; } else if (m === rr) { o.x = c.x1 + r; px += rr + r; } else if (m === b) { o.z = c.z0 - r; pz -= b + r; } else { o.z = c.z1 + r; pz += t + r; }
      }
      hit++;
    });
    if (!hit) return null;
    const l = Math.hypot(px, pz) || 1;
    RES.x = px / l; RES.z = pz / l; RES.n = l;
    return RES;
  };

  // Highest walkable surface under a circle (ground, curb, ramps, low boxes).
  City.supportY = function (x, z, r, footY, step) {
    let y = City.groundY(x, z);
    City.near(x, z, r * 0.7, (c) => {
      if (c.h <= footY + step && c.h > y) {
        if (x > c.x0 - r * 0.5 && x < c.x1 + r * 0.5 && z > c.z0 - r * 0.5 && z < c.z1 + r * 0.5) y = c.h;
      }
    });
    return y;
  };

  // Ground height (roads 0, sidewalks/blocks curb height, ramps).
  City.groundY = function (x, z) {
    let y = 0;
    if (City.blockAt(x, z)) y = YB;
    else if (x >= 303 && x <= C.SHORE && (z < -7 || z > 7) && z > -306 && z < 306) y = YB;
    else if (x <= -303 || z <= -303 || z >= 303) y = YB;
    else if (x > C.SHORE && x <= C.PIER.x1 && ((z >= C.PIER.z0 && z <= C.PIER.z1) || (x >= 392 && x <= 442 && z >= 9 && z <= 28))) y = YB;
    else if (x > C.SHORE) y = -3; // water
    for (let i = 0; i < City.ramps.length; i++) {
      const rp = City.ramps[i];
      const lx = x - rp.sx, lz = z - rp.sz;
      const a = lx * rp.dx + lz * rp.dz;
      if (a < 0 || a > rp.len) continue;
      const b = lx * -rp.dz + lz * rp.dx;
      if (Math.abs(b) > rp.w / 2) continue;
      const ry = rp.y0 + rp.h * (a / rp.len);
      if (ry > y) y = ry;
    }
    return y;
  };
  City.rampAt = function (x, z) {
    for (const rp of City.ramps) {
      const lx = x - rp.sx, lz = z - rp.sz;
      const a = lx * rp.dx + lz * rp.dz;
      if (a < 0 || a > rp.len) continue;
      if (Math.abs(lx * -rp.dz + lz * rp.dx) > rp.w / 2) continue;
      return rp;
    }
    return null;
  };
  City.inWater = (x, z) => City.groundY(x, z) < -1;

  // ------------------------------------------------------------------ nav grid
  const NAV = City.nav = { x0: -312, z0: -312, cs: 2, w: 0, h: 0, walk: null, opaque: null };
  function buildNav() {
    NAV.w = Math.ceil((474 - NAV.x0) / NAV.cs); NAV.h = Math.ceil((312 - NAV.z0) / NAV.cs);
    const n = NAV.w * NAV.h;
    NAV.walk = new Uint8Array(n); NAV.opaque = new Uint8Array(n);
    for (let j = 0; j < NAV.h; j++) {
      for (let i = 0; i < NAV.w; i++) {
        const x = NAV.x0 + (i + 0.5) * NAV.cs, z = NAV.z0 + (j + 0.5) * NAV.cs;
        const inCity = x > C.WORLD.x0 && x < C.WORLD.x1 - 0.8 && z > C.WORLD.z0 && z < C.WORLD.z1;
        const onPier = x >= C.SHORE - 1 && x < C.PIER.x1 - 0.5 && ((z > C.PIER.z0 + 0.5 && z < C.PIER.z1 - 0.5) || (x > 392 && x < 442 && z > 0 && z < 27.5));
        NAV.walk[j * NAV.w + i] = inCity || onPier ? 1 : 0;
      }
    }
    for (const c of City.colliders) {
      const inflate = 0.45;
      const i0 = Math.floor((c.x0 - inflate - NAV.x0) / NAV.cs), i1 = Math.floor((c.x1 + inflate - NAV.x0) / NAV.cs);
      const j0 = Math.floor((c.z0 - inflate - NAV.z0) / NAV.cs), j1 = Math.floor((c.z1 + inflate - NAV.z0) / NAV.cs);
      for (let j = Math.max(0, j0); j <= Math.min(NAV.h - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(NAV.w - 1, i1); i++) {
          const x = NAV.x0 + (i + 0.5) * NAV.cs, z = NAV.z0 + (j + 0.5) * NAV.cs;
          if (c.h > 0.6 && x > c.x0 - inflate && x < c.x1 + inflate && z > c.z0 - inflate && z < c.z1 + inflate) NAV.walk[j * NAV.w + i] = 0;
          if (c.h > 2.5 && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) NAV.opaque[j * NAV.w + i] = 1;
        }
      }
    }
  }
  City.cell = (x, z) => {
    const i = Math.floor((x - NAV.x0) / NAV.cs), j = Math.floor((z - NAV.z0) / NAV.cs);
    if (i < 0 || j < 0 || i >= NAV.w || j >= NAV.h) return -1;
    return j * NAV.w + i;
  };
  City.walkable = (x, z) => { const c = City.cell(x, z); return c >= 0 && NAV.walk[c] === 1; };
  // Line of sight at eye height (buildings block it).
  City.los = function (x1, z1, x2, z2) {
    const d = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.ceil(d / 1.2);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const c = City.cell(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t);
      if (c < 0 || NAV.opaque[c]) return false;
    }
    return true;
  };

  // ------------------------------------------------------------------ props (breakables)
  City.addProp = function (p) {
    City.props.push(p);
    const k = Math.floor(p.x / 12) * 4096 + Math.floor(p.z / 12);
    let a = City.pgrid.get(k);
    if (!a) { a = []; City.pgrid.set(k, a); }
    a.push(p);
    p.cell = a;
  };
  City.nearProps = function (x, z, r, fn) {
    for (let gx = Math.floor((x - r) / 12); gx <= Math.floor((x + r) / 12); gx++) {
      for (let gz = Math.floor((z - r) / 12); gz <= Math.floor((z + r) / 12); gz++) {
        const a = City.pgrid.get(gx * 4096 + gz);
        if (a) for (let i = 0; i < a.length; i++) fn(a[i]);
      }
    }
  };

  // ------------------------------------------------------------------ geometry helpers
  let G; // ground geo
  let P; // pools
  function wallsUV(geo, x0, z0, x1, z1, y0, y1, yb, tint, uo, vo) {
    const T = 24, TH = 28;
    const v0 = vo + (y0 - yb) / TH, v1 = vo + (y1 - yb) / TH;
    const side = (a, b, c, d, n, L, k) => {
      const col = CB.shade(tint, k);
      geo.quad(a, b, c, d, n, col, [uo, v0, uo + L / T, v0, uo + L / T, v1, uo, v1]);
    };
    side([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], x1 - x0, 0.97);
    side([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], z1 - z0, 0.9);
    side([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1], x1 - x0, 0.97);
    side([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], z1 - z0, 0.9);
  }

  // A building block with facade texture. store: array of side names with a storefront.
  function building(x0, z0, x1, z1, h, style, tint, opt) {
    opt = opt || {};
    const ch = chunkAt((x0 + x1) / 2, (z0 + z1) / 2);
    const yb = opt.yb != null ? opt.yb : YB;
    const hasStore = opt.store && opt.store.length;
    const fStart = hasStore ? yb + 4.2 : yb;
    const uo = Math.floor(R() * 8) / 8, vo = Math.floor(R() * 8) / 8;
    if (opt.tiers) {
      // tiers: [{inset, top}] – stacked boxes getting narrower
      let y = fStart;
      for (const t of opt.tiers) {
        const a = x0 + t.inset, b = z0 + t.inset, c = x1 - t.inset, d = z1 - t.inset;
        wallsUV(ch[style], a, b, c, d, y, t.top, yb, tint, uo, vo);
        ch.plain.flat(a, b, c, d, t.top, opt.roof || PAL.roof2);
        y = t.top;
      }
    } else {
      wallsUV(ch[style], x0, z0, x1, z1, fStart, h, yb, tint, uo, vo);
      ch.plain.flat(x0, z0, x1, z1, h, opt.roof || PAL.roof);
      // parapet
      const pc = CB.shade(tint, 0.75), t = 0.35, ph = h + (opt.parapet || 0.8);
      ch.plain.box(x0, h, z0, x1, ph, z0 + t, pc, { bottom: true });
      ch.plain.box(x0, h, z1 - t, x1, ph, z1, pc, { bottom: true });
      ch.plain.box(x0, h, z0 + t, x0 + t, ph, z1 - t, pc, { bottom: true });
      ch.plain.box(x1 - t, h, z0 + t, x1, ph, z1 - t, pc, { bottom: true });
    }
    if (hasStore) {
      const wc = opt.shopWall || R.pick(PAL.shopWall);
      ch.plain.box(x0, yb, z0, x1, fStart, z1, wc, { top: true, bottom: true });
      // trim band between store level and facade
      ch.plain.box(x0 - 0.12, fStart - 0.35, z0 - 0.12, x1 + 0.12, fStart, z1 + 0.12, CB.shade(wc, 0.7), {});
      for (const s of opt.store) storefront(ch, x0, z0, x1, z1, s, yb, opt);
    }
    addCollider(x0, z0, x1, z1, opt.tiers ? opt.tiers[opt.tiers.length - 1].top : h, 'building');
    return { x0, z0, x1, z1, h };
  }

  // Side geometry for one storefront: display glass + door; registers a storefront spot.
  function storefront(ch, x0, z0, x1, z1, side, yb, opt) {
    let ax, az, bx, bz, nx, nz;
    if (side === 's') { ax = x0; az = z0; bx = x1; bz = z0; nx = 0; nz = -1; }
    else if (side === 'n') { ax = x1; az = z1; bx = x0; bz = z1; nx = 0; nz = 1; }
    else if (side === 'e') { ax = x1; az = z0; bx = x1; bz = z1; nx = 1; nz = 0; }
    else { ax = x0; az = z1; bx = x0; bz = z0; nx = -1; nz = 0; }
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 6) return;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    const off = 0.05;
    // shop width: use the middle part of long walls
    const w = Math.min(L - 1, 14), s0 = (L - w) / 2;
    const pt = (s, y, o) => [ax + ux * s + nx * (off + (o || 0)), y, az + uz * s + nz * (off + (o || 0))];
    const glass = [0.13, 0.17, 0.22];
    const g1 = s0 + 0.5, g2 = s0 + w - 2.4, d1 = s0 + w - 2.0, d2 = s0 + w - 0.6;
    ch.plain.quad(pt(g1, yb + 0.6), pt(g2, yb + 0.6), pt(g2, yb + 3.1), pt(g1, yb + 3.1), [nx, 0, nz], glass);
    ch.plain.quad(pt(g1, yb + 0.6), pt(g2, yb + 0.6), pt(g2, yb + 0.75, 0.02), pt(g1, yb + 0.75, 0.02), [nx, 0, nz], [0.5, 0.5, 0.5]);
    ch.plain.quad(pt(d1, yb), pt(d2, yb), pt(d2, yb + 2.5), pt(d1, yb + 2.5), [nx, 0, nz], [0.24, 0.17, 0.12]);
    const mid = s0 + w / 2;
    const door = (d1 + d2) / 2;
    City.storefronts.push({
      x: ax + ux * door + nx * 1.6, z: az + uz * door + nz * 1.6, // spot on sidewalk in front of the door
      cx: ax + ux * mid, cz: az + uz * mid, ux, uz, nx, nz, w, yb,
      sx: ax + ux * mid + nx * 0.12, sz: az + uz * mid + nz * 0.12,
      winX: ax + ux * ((g1 + g2) / 2) + nx * 1.4, winZ: az + uz * ((g1 + g2) / 2) + nz * 1.4,
      downtown: !!opt.downtown, district: opt.district || 'res', used: false,
    });
  }

  // ------------------------------------------------------------------ small props
  function tree(x, z, s) {
    s = s || R.range(0.85, 1.25);
    const g = R.pick([PAL.grass, PAL.grass2, hex(0x4f8a3c), hex(0x76b04e)]);
    P.sCyl.add(x, YB + 1.3 * s, z, 0.32 * s, 2.6 * s, 0.32 * s, hex(0x6b4a2f));
    P.sSph.add(x, YB + 3.4 * s, z, 3.2 * s, 2.8 * s, 3.2 * s, g);
    P.sSph.add(x + 0.5 * s, YB + 4.4 * s, z - 0.3 * s, 2.2 * s, 2.0 * s, 2.2 * s, CB.shade(g, 1.12));
    addCollider(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 4, 'tree');
  }
  function lamp(x, z, nx, nz) {
    const h = 7.2;
    P.sCyl.add(x, YB + h / 2, z, 0.18, h, 0.18, hex(0x2d3436));
    const ax = x + nx * 1.2, az = z + nz * 1.2;
    P.sBox.add(ax, YB + h, az, nx ? 2.4 : 0.14, 0.14, nz ? 2.4 : 0.14, hex(0x2d3436));
    const hx = x + nx * 2.3, hz = z + nz * 2.3;
    P.sBox.add(hx, YB + h - 0.1, hz, 0.7, 0.22, 0.7, hex(0x2d3436));
    P.sLamp.add(hx, YB + h - 0.25, hz, 0.5, 0.08, 0.5);
    P.sLampPool.add(hx, YB + 0.03, hz, 13, 1, 13);
    addCollider(x - 0.15, z - 0.15, x + 0.15, z + 0.15, h, 'pole');
    City.lamps.push({ x: hx, z: hz });
  }
  function bench(x, z, yaw) {
    const c = hex(0x6d4c2f), m = hex(0x2d3436);
    const along = Math.abs(Math.sin(yaw)) > 0.5; // bench length along z when facing x
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    P.sBox.add(x, YB + 0.45, z, along ? 0.5 : 1.8, 0.08, along ? 1.8 : 0.5, c);
    P.sBox.add(x - fx * 0.24, YB + 0.75, z - fz * 0.24, along ? 0.08 : 1.8, 0.45, along ? 1.8 : 0.08, c);
    P.sBox.add(x, YB + 0.22, z, along ? 0.5 : 1.6, 0.44, along ? 1.6 : 0.5, m);
    const hw = along ? 0.3 : 0.95, hd = along ? 0.95 : 0.3;
    addCollider(x - hw, z - hd, x + hw, z + hd, YB + 0.5, 'bench');
    City.benches.push({ x, z, yaw });
  }
  function dumpster(x, z, alongZ) {
    const col = R.pick([hex(0x1e6b3a), hex(0x1f4e79), hex(0x5d6d7e)]);
    const w = alongZ ? 1.6 : 2.2, d = alongZ ? 2.2 : 1.6;
    P.sBox.add(x, YB + 0.7, z, w, 1.3, d, col);
    P.sBox.add(x, YB + 1.42, z, w + 0.1, 0.12, d + 0.1, CB.shade(col, 0.6));
    addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2, YB + 1.45, 'dumpster');
    City.dumpsters.push({ x, z, w, d });
  }
  function hotdogStand(x, z) {
    P.sBox.add(x, YB + 0.6, z, 2.2, 1.0, 1.2, hex(0xf4f1e8));
    P.sBox.add(x, YB + 0.9, z + 0.61, 2.0, 0.4, 0.02, hex(0xc0392b));
    P.sCyl.add(x - 0.9, YB + 0.3, z, 0.5, 0.5, 0.5, hex(0x222222));
    P.sCyl.add(x + 0.9, YB + 0.3, z, 0.5, 0.5, 0.5, hex(0x222222));
    P.sCyl.add(x, YB + 2.0, z, 0.06, 2.0, 0.06, hex(0xaaaaaa));
    P.sCone.add(x, YB + 3.0, z, 2.6, 0.7, 2.6, hex(0xf1c40f));
    addCollider(x - 1.1, z - 0.6, x + 1.1, z + 0.6, YB + 1.1, 'stand');
    City.hotdogs.push({ x, z: z + 1.6 });
  }
  function waterTower(x, z, y) {
    const wood = hex(0x7a5a3a);
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) P.sCyl.add(x + dx, y + 1.5, z + dz, 0.18, 3, 0.18, hex(0x333333));
    P.sCyl.add(x, y + 4.5, z, 3.4, 3.2, 3.4, wood);
    P.sCone.add(x, y + 6.6, z, 3.7, 1.2, 3.7, CB.shade(wood, 0.7));
  }
  function acUnit(x, z, y) {
    P.sBox.add(x, y + 0.6, z, R.range(1.5, 3), 1.2, R.range(1.5, 2.5), hex(0x9aa0a6));
  }

  // Breakable props – built from dynamic pool parts so they can fly when hit.
  function breakable(kind, x, z, yaw) {
    const rig = new CB.Rig();
    rig.x = x; rig.y = YB; rig.z = z; rig.yaw = yaw || 0;
    let r = 0.35, h = 1;
    const box = P.box, cyl = P.cyl;
    if (kind === 'hydrant') {
      rig.add(cyl, { o: [0, 0.38, 0], s: [0.32, 0.76, 0.32], c: hex(0xd62c1a) });
      rig.add(cyl, { o: [0, 0.82, 0], s: [0.24, 0.14, 0.24], c: hex(0xf1c40f) });
      rig.add(cyl, { o: [0, 0.5, 0], s: [0.14, 0.5, 0.14], c: hex(0xd62c1a), roll: Math.PI / 2 });
      r = 0.3; h = 0.9;
    } else if (kind === 'meter') {
      rig.add(cyl, { o: [0, 0.55, 0], s: [0.07, 1.1, 0.07], c: hex(0x555555) });
      rig.add(box, { o: [0, 1.25, 0], s: [0.24, 0.36, 0.18], c: hex(0x7f8c8d) });
      rig.add(box, { o: [0, 1.3, 0.1], s: [0.16, 0.12, 0.02], c: hex(0x222222) });
      r = 0.2; h = 1.4;
    } else if (kind === 'newsbox') {
      const c = R.pick([hex(0x2980b9), hex(0xc0392b), hex(0xf39c12), hex(0x27ae60)]);
      rig.add(box, { o: [0, 0.55, 0], s: [0.5, 1.1, 0.45], c });
      rig.add(box, { o: [0, 0.8, 0.23], s: [0.4, 0.35, 0.02], c: hex(0xdfe6e9) });
      r = 0.35; h = 1.1;
    } else if (kind === 'phone') {
      rig.add(box, { o: [0, 1.15, 0], s: [1.0, 2.3, 1.0], c: hex(0x34495e) });
      rig.add(box, { o: [0, 2.35, 0], s: [1.05, 0.12, 1.05], c: hex(0xc0392b) });
      rig.add(P.shiny, { o: [0, 1.25, 0.505], s: [0.8, 1.7, 0.02], c: hex(0x8fb8d8) });
      r = 0.6; h = 2.4;
    } else if (kind === 'trash') {
      rig.add(cyl, { o: [0, 0.48, 0], s: [0.6, 0.96, 0.6], c: hex(0x2e4053) });
      rig.add(cyl, { o: [0, 0.98, 0], s: [0.66, 0.06, 0.66], c: hex(0x1c2833) });
      r = 0.33; h = 1.0;
    } else if (kind === 'mailbox') {
      rig.add(box, { o: [0, 0.6, 0], s: [0.55, 1.0, 0.5], c: hex(0x1f4e9c) });
      rig.add(cyl, { o: [0, 1.1, 0], s: [0.55, 0.5, 0.5], c: hex(0x1f4e9c), roll: Math.PI / 2, yaw: Math.PI / 2 });
      r = 0.35; h = 1.3;
    }
    rig.update();
    const p = { kind, x, z, y: YB, yaw: yaw || 0, r, h, rig, broken: false, vx: 0, vy: 0, vz: 0, spin: 0, t: 0, x0: x, z0: z };
    City.addProp(p);
    return p;
  }

  // ------------------------------------------------------------------ ground
  function groundBase() {
    // asphalt everywhere (city + beyond)
    G.flat(-520, -520, C.SHORE, 520, 0, PAL.asphalt);
    // outer sidewalks along the city edge
    const o = 303, e = 306, far = 345;
    G.box(-far, 0, -far, -o, YB, far, PAL.sidewalk, { bottom: true });
    G.box(-o, 0, o, o, YB, far, PAL.sidewalk, { bottom: true });
    G.box(-o, 0, -far, o, YB, -o, PAL.sidewalk, { bottom: true });
    // lake-side strip (grass/path/sand), with a gap where the street runs onto the pier
    for (const [z0, z1] of [[-far, -7], [7, far]]) {
      G.box(o, 0, z0, C.SHORE, YB, z1, PAL.grass, { bottom: true });
      G.flat(320, z0, 325, z1, YB + 0.01, PAL.path);
      G.flat(327, z0, C.SHORE, z1, YB + 0.01, PAL.sand);
    }
    // seawall
    G.quad([C.SHORE, -3, -900], [C.SHORE, -3, 900], [C.SHORE, YB, 900], [C.SHORE, YB, -900], [1, 0, 0], hex(0x8d8a82));
    // pier deck
    const PR = C.PIER;
    G.box(PR.x0, -1, PR.z0, PR.x1, YB, PR.z1, PAL.deck, {});
    G.box(392, -1, PR.z1, 442, YB, 28, PAL.deck, {});
    for (let x = PR.x0 + 6; x < PR.x1; x += 12) {
      P.sCyl.add(x, -1.2, PR.z0 + 0.5, 0.6, 2, 0.6, hex(0x4a3a2a));
      P.sCyl.add(x, -1.2, PR.z1 - 0.5, 0.6, 2, 0.6, hex(0x4a3a2a));
    }
    // markings on the pier road
    for (let x = 300; x < PR.x1 - 4; x += 6) G.flat(x, -0.12, x + 3, 0.12, (x < C.SHORE ? 0 : YB) + 0.012, PAL.yellow);
    // railings along the shore + pier (colliders)
    const rail = (x0, z0, x1, z1) => {
      G.box(x0, YB + 0.95, z0, x1, YB + 1.08, z1, hex(0x7f8c8d));
      const len = Math.max(x1 - x0, z1 - z0), n = Math.floor(len / 2.5);
      for (let k = 0; k <= n; k++) {
        const t = k / Math.max(1, n);
        const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
        P.sBox.add(px, YB + 0.5, pz, 0.08, 1.0, 0.08, hex(0x7f8c8d));
      }
      addCollider(x0, z0, x1, z1, YB + 1.1, 'rail');
    };
    rail(C.SHORE - 0.25, -306, C.SHORE - 0.05, -7);
    rail(C.SHORE - 0.25, 7, C.SHORE - 0.05, 306);
    rail(C.SHORE, PR.z0 - 0.1, PR.x1, PR.z0 + 0.1);
    rail(C.SHORE, PR.z1 - 0.1, 392, PR.z1 + 0.1);
    rail(442, PR.z1 - 0.1, PR.x1, PR.z1 + 0.1);
    rail(392 - 0.1, PR.z1, 392 + 0.1, 28);
    rail(442 - 0.1, PR.z1, 442 + 0.1, 28);
    rail(392, 28 - 0.1, 442, 28 + 0.1);
    rail(PR.x1 - 0.1, PR.z0, PR.x1 + 0.1, PR.z1);
    // block the street ends on the lake strip edges (north/south)
    addCollider(303, 306, 345, 310, 20, 'wall');
    addCollider(303, -310, 345, -306, 20, 'wall');
  }

  function roadMarkings() {
    const N = C.N, h = 0.012;
    for (let i = 0; i <= N; i++) {
      const rc = CB.road(i);
      for (let j = 0; j < N; j++) {
        const a = CB.road(j) + 7.5, b = CB.road(j + 1) - 7.5;
        // double yellow centre lines (N-S road at x = rc and E-W road at z = rc)
        G.flat(rc - 0.25, a, rc - 0.1, b, h, PAL.yellow); G.flat(rc + 0.1, a, rc + 0.25, b, h, PAL.yellow);
        G.flat(a, rc - 0.25, b, rc - 0.1, h, PAL.yellow); G.flat(a, rc + 0.1, b, rc + 0.25, h, PAL.yellow);
      }
    }
    // crosswalks + stop lines at every intersection approach
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = CB.road(i), z = CB.road(j);
        for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const ni = i - dx, nj = j - dz; // approach comes from this neighbour
          if (ni < 0 || nj < 0 || ni > N || nj > N) continue;
          // zebra across the approach road
          for (let s = -6.5; s < 6.5; s += 1.1) {
            if (dz) G.flat(x + s, z - dz * 10.3 - 0, x + s + 0.55, z - dz * 7.6, h, PAL.white);
            else G.flat(x - dx * 10.3, z + s, x - dx * 7.6, z + s + 0.55, h, PAL.white);
          }
          // stop line on the right-hand lane (cars travelling along +d)
          const rx = dz, rz = -dx;
          const sx = x - dx * 11, sz = z - dz * 11;
          const p0x = sx + rx * 0.3, p0z = sz + rz * 0.3, p1x = sx + rx * 6.5, p1z = sz + rz * 6.5;
          G.flat(Math.min(p0x, p1x) - (dx ? 0.25 : 0), Math.min(p0z, p1z) - (dz ? 0.25 : 0), Math.max(p0x, p1x) + (dx ? 0.25 : 0), Math.max(p0z, p1z) + (dz ? 0.25 : 0), h, PAL.white);
        }
      }
    }
  }

  // ------------------------------------------------------------------ blocks
  function blockBase(b) {
    // whole block raised to curb height with sidewalk colour, then the inner surface
    G.box(b.x0, 0, b.z0, b.x1, YB, b.z1, PAL.sidewalk, { bottom: true });
    // curb edge darker strip
    const s = C.SIDE;
    const surf = { park: PAL.grass, bean: PAL.plaza, fountain: PAL.grass, parking: PAL.lot, industrial: hex(0x8a8780),
      downtown: hex(0xbcb6aa), skydeck: hex(0xbcb6aa), apartments: hex(0x6a9a4e), shops: PAL.lot }[b.type];
    G.flat(b.ix0, b.iz0, b.ix1, b.iz1, YB + 0.004, surf);
    // sidewalk slab joints
    for (let x = b.x0 + 3; x < b.x1; x += 3) {
      G.flat(x, b.z0 + 0.4, x + 0.06, b.z0 + s, YB + 0.002, PAL.curb);
      G.flat(x, b.z1 - s, x + 0.06, b.z1 - 0.4, YB + 0.002, PAL.curb);
    }
    for (let z = b.z0 + 3; z < b.z1; z += 3) {
      G.flat(b.x0 + 0.4, z, b.x0 + s, z + 0.06, YB + 0.002, PAL.curb);
      G.flat(b.x1 - s, z, b.x1 - 0.4, z + 0.06, YB + 0.002, PAL.curb);
    }
  }

  // Lamps, hydrants etc. along the four sidewalk edges of a block.
  function streetFurniture(b) {
    const ins = 0.7;
    const sides = [
      { ax: b.x0, az: b.z0, bx: b.x1, bz: b.z0, nx: 0, nz: -1 },
      { ax: b.x1, az: b.z0, bx: b.x1, bz: b.z1, nx: 1, nz: 0 },
      { ax: b.x1, az: b.z1, bx: b.x0, bz: b.z1, nx: 0, nz: 1 },
      { ax: b.x0, az: b.z1, bx: b.x0, bz: b.z0, nx: -1, nz: 0 },
    ];
    const alleyX = b.type === 'apartments' ? (b.x0 + b.x1) / 2 : null;
    for (let si = 0; si < 4; si++) {
      const s = sides[si];
      const L = 60, ux = (s.bx - s.ax) / L, uz = (s.bz - s.az) / L;
      const at = (t, inset) => ({ x: s.ax + ux * t - s.nx * inset, z: s.az + uz * t - s.nz * inset });
      const blocked = (t) => alleyX != null && s.nz !== 0 && Math.abs(s.ax + ux * t - alleyX) < 5;
      for (const t of [20, 40]) {
        if (blocked(t)) continue;
        const p = at(t, ins);
        lamp(p.x, p.z, s.nx, s.nz);
      }
      if (b.type === 'apartments' || b.type === 'park' || (b.type === 'shops' && R() < 0.5)) {
        for (let t = 12; t < 52; t += R.range(9, 14)) {
          if (Math.abs(t - 20) < 3 || Math.abs(t - 40) < 3 || blocked(t)) continue;
          const p = at(t, 1.0);
          tree(p.x, p.z, R.range(0.8, 1.1));
        }
      }
      // corner furniture (near the start of each side)
      const c1 = at(8.5, 0.6);
      if (R() < 0.55) breakable('hydrant', c1.x, c1.z, 0);
      const c2 = at(10.5, 0.75);
      if (R() < 0.5) breakable('trash', c2.x, c2.z, 0);
      const c3 = at(52, 0.7);
      if (R() < 0.3) breakable(R() < 0.5 ? 'newsbox' : 'mailbox', c3.x, c3.z, Math.atan2(-s.nx, -s.nz) + Math.PI);
      if (R() < 0.08) { const c4 = at(30, 0.9); breakable('phone', c4.x, c4.z, Math.atan2(s.nx, s.nz)); }
    }
  }

  function genApartments(b) {
    const cx = (b.x0 + b.x1) / 2, ax0 = cx - 3, ax1 = cx + 3;
    G.flat(ax0, b.z0 + 0.3, ax1, b.z1 - 0.3, YB + 0.008, PAL.alley);
    for (const half of ['w', 'e']) {
      const front = half === 'w' ? b.ix0 : b.ix1;
      let z = b.iz0;
      let first = true;
      while (z < b.iz1 - 0.5) {
        let w = R.range(8, 13);
        if (b.iz1 - (z + w) < 7) w = b.iz1 - z;
        const last = z + w >= b.iz1 - 0.01;
        const depth = R.range(12.5, 17);
        const bx0 = half === 'w' ? front : front - depth, bx1 = half === 'w' ? front + depth : front;
        const bz0 = z + (first ? 0 : 0.7), bz1 = z + w - (last ? 0 : 0.7);
        const floors = R.int(2, 5);
        const h = YB + floors * 3.5;
        const store = [];
        if ((first || last) && R() < 0.7) {
          store.push(half === 'w' ? 'w' : 'e');
          store.push(first ? 's' : 'n');
        }
        const style = R() < 0.82 ? 'brick' : 'stone';
        building(bx0, bz0, bx1, bz1, h + (store.length ? 4.2 - 3.5 : 0), style, R.pick(style === 'brick' ? PAL.brick : PAL.stone), { store, district: 'res' });
        const rx = (bx0 + bx1) / 2, rz = (bz0 + bz1) / 2;
        const top = h + (store.length ? 0.7 : 0);
        if (R() < 0.3) waterTower(rx + R.range(-2, 2), rz, top);
        else if (R() < 0.6) acUnit(rx, rz, top);
        // backyard garage on the alley
        const backX = half === 'w' ? bx1 : bx0;
        const alleyEdge = half === 'w' ? ax0 : ax1;
        const gap = Math.abs(alleyEdge - backX);
        if (gap > 8 && R() < 0.55 && w > 6) {
          const gd = 5.5;
          const gx0 = half === 'w' ? alleyEdge - gd : alleyEdge, gx1 = half === 'w' ? alleyEdge : alleyEdge + gd;
          const gz0 = z + 1, gz1 = z + w - 1;
          const gc = R.pick(PAL.brick);
          const ch = chunkAt(gx0, gz0);
          ch.plain.box(gx0, YB, gz0, gx1, YB + 3, gz1, gc, { bottom: true });
          // garage door facing alley
          const dx = half === 'w' ? gx1 + 0.03 : gx0 - 0.03, nrm = half === 'w' ? 1 : -1;
          ch.plain.quad([dx, YB, rz - 1.4], [dx, YB, rz + 1.4], [dx, YB + 2.3, rz + 1.4], [dx, YB + 2.3, rz - 1.4], [nrm, 0, 0], hex(0xd0cbc0));
          addCollider(gx0, gz0, gx1, gz1, YB + 3, 'garage');
          City.graffiti.push({ x: dx + nrm * 1.3, z: gz0 + 1.6, wx: dx + nrm * 0.02, wz: gz0 + 1.6, nx: nrm, nz: 0, y: YB + 1.4 });
        } else if (gap > 4) {
          // back door break-in point
          const dx = half === 'w' ? bx1 + 0.04 : bx0 - 0.04, nrm = half === 'w' ? 1 : -1;
          chunkAt(dx, rz).plain.quad([dx, YB, rz - 0.6], [dx, YB, rz + 0.6], [dx, YB + 2.2, rz + 0.6], [dx, YB + 2.2, rz - 0.6], [nrm, 0, 0], hex(0x5a3d2b));
          City.breakins.push({ x: dx + nrm * 1.2, z: rz, nx: nrm, nz: 0, kind: 'apartment', wx: dx, wz: rz });
        }
        z += w; first = false;
      }
    }
    // alley dumpsters + utility poles
    for (let k = 0; k < 3; k++) {
      const z = b.iz0 + 8 + k * 18 + R.range(-3, 3);
      dumpster(R() < 0.5 ? ax0 + 1.0 : ax1 - 1.0, z, true);
    }
    for (let z = b.iz0 + 4; z < b.iz1; z += 17) {
      P.sCyl.add(ax0 + 0.35, YB + 4.5, z, 0.28, 9, 0.28, hex(0x6b5a45));
      P.sBox.add(ax0 + 0.35, YB + 8.3, z, 1.6, 0.12, 0.12, hex(0x6b5a45));
      addCollider(ax0 + 0.2, z - 0.15, ax0 + 0.5, z + 0.15, 9, 'pole');
    }
    breakable('trash', ax1 - 0.6, b.iz0 + 26, 0);
  }

  function genShops(b) {
    const D = 14;
    const strip = (x0, z0, x1, z1, alongX, face, cornerA, cornerB) => {
      const len = alongX ? x1 - x0 : z1 - z0;
      let t = 0, first = true;
      while (t < len - 0.5) {
        let w = R.range(9, 15);
        if (len - (t + w) < 7) w = len - t;
        const last = t + w >= len - 0.01;
        const a0 = t + (first ? 0 : 0.3), a1 = t + w - (last ? 0 : 0.3);
        const floors = R.int(1, 2);
        const h = YB + 4.2 + floors * 3.5;
        const store = [face];
        if (first && cornerA) store.push(cornerA);
        if (last && cornerB) store.push(cornerB);
        const style = R.pick(['brick', 'brick', 'stone', 'office']);
        const tint = R.pick(style === 'brick' ? PAL.brick : style === 'stone' ? PAL.stone : PAL.office);
        if (alongX) building(x0 + a0, z0, x0 + a1, z1, h, style, tint, { store, district: 'shops' });
        else building(x0, z0 + a0, x1, z0 + a1, h, style, tint, { store, district: 'shops' });
        if (R() < 0.4) acUnit(alongX ? x0 + (a0 + a1) / 2 : (x0 + x1) / 2, alongX ? (z0 + z1) / 2 : z0 + (a0 + a1) / 2, h);
        t += w; first = false;
      }
    };
    strip(b.ix0, b.iz0, b.ix1, b.iz0 + D, true, 's', 'w', 'e');
    strip(b.ix0, b.iz1 - D, b.ix1, b.iz1, true, 'n', 'w', 'e');
    strip(b.ix0, b.iz0 + D, b.ix0 + D, b.iz1 - D, false, 'w');
    const midZ = (b.iz0 + b.iz1) / 2;
    strip(b.ix1 - D, b.iz0 + D, b.ix1, midZ - 3.5, false, 'e');
    strip(b.ix1 - D, midZ + 3.5, b.ix1, b.iz1 - D, false, 'e');
    // driveway through the east strip into the inner lot
    G.flat(b.ix1 - D, midZ - 3.5, b.x1 - 0.2, midZ + 3.5, YB + 0.006, PAL.lot);
    // inner lot with parking rows
    const lx0 = b.ix0 + D + 1, lx1 = b.ix1 - D - 1;
    for (let x = lx0 + 1.3; x < lx1 - 1.3; x += 2.7) {
      for (const [z0, yaw] of [[b.iz0 + D + 0.5, 0], [b.iz1 - D - 5.7, Math.PI]]) {
        G.flat(x - 1.35, z0, x - 1.25, z0 + 5.2, YB + 0.01, PAL.white);
        if (R() < 0.45) City.parking.push({ x, z: z0 + 2.6, yaw });
      }
    }
    dumpster(lx0 + 1.5, midZ, true);
    dumpster(lx1 - 1.5, midZ - 6, true);
  }

  function genDowntown(b) {
    const lots = [];
    const r = R();
    const X0 = b.ix0, X1 = b.ix1, Z0 = b.iz0, Z1 = b.iz1, mx = (X0 + X1) / 2, mz = (Z0 + Z1) / 2;
    if (r < 0.25) lots.push([X0, Z0, X1, Z1]);
    else if (r < 0.55) {
      if (R() < 0.5) { lots.push([X0, Z0, mx - 0.5, Z1], [mx + 0.5, Z0, X1, Z1]); }
      else { lots.push([X0, Z0, X1, mz - 0.5], [X0, mz + 0.5, X1, Z1]); }
    } else lots.push([X0, Z0, mx - 0.5, mz - 0.5], [mx + 0.5, Z0, X1, mz - 0.5], [X0, mz + 0.5, mx - 0.5, Z1], [mx + 0.5, mz + 0.5, X1, Z1]);
    const centre = 1 - Math.min(1, Math.hypot((X0 + X1) / 2, (Z0 + Z1) / 2) / 260);
    let plazaDone = false;
    for (const L of lots) {
      const [x0, z0, x1, z1] = L;
      const sides = [];
      if (Math.abs(x0 - X0) < 0.1) sides.push('w');
      if (Math.abs(x1 - X1) < 0.1) sides.push('e');
      if (Math.abs(z0 - Z0) < 0.1) sides.push('s');
      if (Math.abs(z1 - Z1) < 0.1) sides.push('n');
      if (lots.length > 1 && !plazaDone && R() < 0.3) { plaza(x0, z0, x1, z1); plazaDone = true; continue; }
      const m = R.range(0.5, 2.5);
      const style = R.pick(['glass', 'glass', 'stone', 'office', 'stone']);
      const tint = R.pick(style === 'glass' ? PAL.glass : style === 'stone' ? PAL.stone : PAL.office);
      const floors = Math.round(R.range(10, 22 + 26 * centre) * (lots.length === 4 ? 0.85 : 1));
      const H = YB + 4.2 + floors * 3.5;
      const store = sides.filter(() => R() < 0.75);
      const opt = { store, downtown: true, district: 'downtown' };
      const bx0 = x0 + m, bz0 = z0 + m, bx1 = x1 - m, bz1 = z1 - m;
      if (H > 60 && R() < 0.65) {
        const t1 = YB + 4.2 + Math.round(floors * 0.55) * 3.5, t2 = YB + 4.2 + Math.round(floors * 0.82) * 3.5;
        const w = Math.min(bx1 - bx0, bz1 - bz0);
        opt.tiers = [{ inset: 0, top: t1 }, { inset: w * 0.12, top: t2 }, { inset: w * 0.24, top: H }];
      }
      building(bx0, bz0, bx1, bz1, H, style, tint, opt);
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      if (H > 90) {
        P.sCyl.add(cx, H + 9, cz, 0.4, 18, 0.4, hex(0xbdc3c7));
        P.sBlink.add(cx, H + 18.3, cz, 0.7, 0.7, 0.7);
      } else acUnit(cx, cz, opt.tiers ? H : H);
      if (R() < 0.15) City.breakins.push(Object.assign(backDoor(bx0, bz0, bx1, bz1, sides), { kind: 'penthouse' }));
    }
  }
  function backDoor(x0, z0, x1, z1, streetSides) {
    // pick a side that is not a storefront side if possible
    const all = ['s', 'n', 'e', 'w'];
    const s = all.find((q) => !streetSides.includes(q)) || 's';
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const d = { s: [cx, z0, 0, -1], n: [cx, z1, 0, 1], e: [x1, cz, 1, 0], w: [x0, cz, -1, 0] }[s];
    const ch = chunkAt(d[0], d[1]);
    const ux = d[3] ? 1 : 0, uz = d[2] ? 1 : 0;
    const o = 0.04;
    ch.plain.quad([d[0] - ux * 0.7 + d[2] * o, YB, d[1] - uz * 0.7 + d[3] * o], [d[0] + ux * 0.7 + d[2] * o, YB, d[1] + uz * 0.7 + d[3] * o],
      [d[0] + ux * 0.7 + d[2] * o, YB + 2.4, d[1] + uz * 0.7 + d[3] * o], [d[0] - ux * 0.7 + d[2] * o, YB + 2.4, d[1] - uz * 0.7 + d[3] * o], [d[2], 0, d[3]], hex(0x6c7a89));
    return { x: d[0] + d[2] * 1.3, z: d[1] + d[3] * 1.3, nx: d[2], nz: d[3], wx: d[0], wz: d[1] };
  }

  function plaza(x0, z0, x1, z1) {
    G.flat(x0, z0, x1, z1, YB + 0.006, PAL.plaza);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const tx = cx + dx * (x1 - x0) * 0.3, tz = cz + dz * (z1 - z0) * 0.3;
      P.sBox.add(tx, YB + 0.3, tz, 2.4, 0.6, 2.4, hex(0x9e9a90));
      tree(tx, tz, 0.9);
    }
    bench(cx, cz - 4, 0); bench(cx, cz + 4, Math.PI);
    if (R() < 0.5) {
      // red abstract sculpture
      const red = hex(0xd8341f);
      P.sBox.add(cx - 2.5, YB + 5, cz, 0.7, 10, 0.7, red, 0, 0, 0.35);
      P.sBox.add(cx + 2.5, YB + 5, cz, 0.7, 10, 0.7, red, 0, 0, -0.35);
      P.sBox.add(cx, YB + 9.4, cz, 5, 0.7, 0.7, red);
      addCollider(cx - 4.5, cz - 0.5, cx - 1.5, cz + 0.5, 10, 'art'); addCollider(cx + 1.5, cz - 0.5, cx + 4.5, cz + 0.5, 10, 'art');
    } else hotdogStand(cx + 6, cz);
  }

  function skydeck(b) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    G.flat(b.ix0, b.iz0, b.ix1, b.iz1, YB + 0.006, hex(0x9a958a));
    const h = 21, dark = hex(0x2b2f36);
    building(cx - h, cz - h, cx + h, cz + h, 0, 'glass', dark, {
      store: ['s', 'w'], downtown: true, district: 'downtown', roof: hex(0x222222),
      tiers: [{ inset: 0, top: 95 }, { inset: 7, top: 160 }, { inset: 12, top: 205 }, { inset: 15, top: 232 }],
    });
    for (const dx of [-3.5, 3.5]) {
      P.sCyl.add(cx + dx, 232 + 22, cz, 0.9, 44, 0.9, hex(0xdddddd));
      P.sBlink.add(cx + dx, 276.5, cz, 1.4, 1.4, 1.4);
    }
    City.landmarks = City.landmarks || [];
    City.landmarks.push({ name: 'Skydeck Tower', x: cx, z: cz });
  }

  function genPark(b, kind) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    // cross paths
    G.flat(cx - 2, b.iz0, cx + 2, b.iz1, YB + 0.008, PAL.path);
    G.flat(b.ix0, cz - 2, b.ix1, cz + 2, YB + 0.008, PAL.path);
    if (kind === 'bean' || kind === 'fountain') G.flat(cx - 16, cz - 16, cx + 16, cz + 16, YB + 0.01, PAL.plaza);
    const clear = (x, z) => Math.abs(x - cx) > 3.5 && Math.abs(z - cz) > 3.5 && (kind === 'park' || Math.max(Math.abs(x - cx), Math.abs(z - cz)) > 18);
    let n = 0;
    for (let k = 0; k < 120 && n < 22; k++) {
      const x = R.range(b.ix0 + 2, b.ix1 - 2), z = R.range(b.iz0 + 2, b.iz1 - 2);
      if (!clear(x, z)) continue;
      tree(x, z); n++;
    }
    // bushes = hiding cover
    for (let k = 0; k < 6; k++) {
      const x = R.range(b.ix0 + 3, b.ix1 - 3), z = R.range(b.iz0 + 3, b.iz1 - 3);
      if (!clear(x, z)) continue;
      const s = R.range(2.2, 3.4);
      P.sSph.add(x, YB + 0.7, z, s * 1.4, 1.6, s, hex(0x3f7d34));
      City.covers.push({ x, z, r: s * 0.7 });
    }
    for (const [dx, dz, yaw] of [[3.2, 10, -Math.PI / 2], [-3.2, -10, Math.PI / 2], [10, 3.2, Math.PI], [-10, -3.2, 0]]) bench(cx + dx, cz + dz, yaw);
    for (const [dx, dz] of [[0, 14], [0, -14], [14, 0], [-14, 0]]) {
      P.sCyl.add(cx + dx + 2.6, YB + 2, cz + dz + 2.6, 0.12, 4, 0.12, hex(0x2d3436));
      P.sLamp.add(cx + dx + 2.6, YB + 4.1, cz + dz + 2.6, 0.5, 0.4, 0.5);
      P.sLampPool.add(cx + dx + 2.6, YB + 0.03, cz + dz + 2.6, 9, 1, 9);
    }
    if (kind !== 'bean') hotdogStand(cx + 6, b.iz0 + 2.5);
    if (kind === 'fountain') {
      const stone = hex(0xd9cdb4);
      P.sCyl.add(cx, YB + 0.4, cz, 22, 0.8, 22, stone);
      P.sCyl.add(cx, YB + 1.4, cz, 9, 2.0, 9, stone);
      P.sCyl.add(cx, YB + 3.4, cz, 4.5, 2.0, 4.5, stone);
      P.sCyl.add(cx, YB + 5.0, cz, 1.6, 2.2, 1.6, stone);
      addCollider(cx - 10.5, cz - 10.5, cx + 10.5, cz + 10.5, YB + 0.8, 'fountain');
      addCollider(cx - 4.5, cz - 4.5, cx + 4.5, cz + 4.5, YB + 2.4, 'fountain');
      City.fountain = { x: cx, z: cz };
    }
    if (kind === 'bean') {
      City.bean = { x: cx, z: cz };
      addCollider(cx - 5.5, cz - 3.2, cx + 5.5, cz + 3.2, 6, 'bean');
      // band shell: curvy steel ribbons
      for (let k = 0; k < 6; k++) {
        P.sBox.add(cx - 6 + k * 2.4, YB + 10 + Math.sin(k) * 2, b.iz1 - 6, 1.2, 9, 0.6, hex(0xc8ccd0), 0, 0, (k - 2.5) * 0.12);
      }
      hotdogStand(cx - 14, cz + 18);
    }
  }

  function genParking(b, ramp) {
    for (let row = 0; row < 4; row++) {
      const z0 = b.iz0 + 2 + row * 13.2;
      const yaw = row % 2 ? Math.PI : 0;
      for (let x = b.ix0 + 3; x < b.ix1 - 3; x += 2.8) {
        G.flat(x - 1.4, z0, x - 1.3, z0 + 5.2, YB + 0.01, PAL.white);
        if (R() < 0.42 && !(ramp && row >= 2)) City.parking.push({ x, z: z0 + 2.6, yaw });
      }
    }
    // booth + lamps
    P.sBox.add(b.ix0 + 2, YB + 1.3, b.iz0 + 1.5, 2, 2.6, 2, hex(0xe8e2d0));
    addCollider(b.ix0 + 1, b.iz0 + 0.5, b.ix0 + 3, b.iz0 + 2.5, 2.7, 'booth');
    if (ramp) addRamp((b.x0 + b.x1) / 2 + ramp * 4, b.iz0 + 31, ramp, 0, 12, 5, 2.4);
  }

  function genIndustrial(b) {
    const cols = [0x8e9aa6, 0x6f7f8c, 0xa39171, 0x7d8a6a, 0x9b6b5a].map(hex);
    const twoBuildings = R() < 0.6;
    const yard = twoBuildings ? 0 : 1;
    const parts = twoBuildings ? [[b.ix0, b.iz0, b.ix1, b.iz0 + 22], [b.ix0, b.iz1 - 20, b.ix0 + 30, b.iz1]] : [[b.ix0, b.iz0, b.ix0 + 34, b.iz1 - 4]];
    for (const [x0, z0, x1, z1] of parts) {
      const c = R.pick(cols), h = YB + R.range(8, 12);
      const ch = chunkAt((x0 + x1) / 2, (z0 + z1) / 2);
      ch.plain.box(x0, YB, z0, x1, h, z1, c, { bottom: true });
      // vertical ribs
      for (let x = x0 + 1; x < x1; x += 2) {
        ch.plain.box(x, YB, z0 - 0.08, x + 0.12, h, z0, CB.shade(c, 0.8), { bottom: true, top: true });
        ch.plain.box(x, YB, z1, x + 0.12, h, z1 + 0.08, CB.shade(c, 0.8), { bottom: true, top: true });
      }
      addCollider(x0, z0, x1, z1, h, 'warehouse');
      // loading dock door (break-in)
      const dz = z1 + 0.1, dx = (x0 + x1) / 2;
      ch.plain.quad([dx - 2.5, YB, dz], [dx + 2.5, YB, dz], [dx + 2.5, YB + 4, dz], [dx - 2.5, YB + 4, dz], [0, 0, 1], hex(0xbfa34a));
      for (let y = YB + 0.4; y < YB + 4; y += 0.5) ch.plain.quad([dx - 2.5, y, dz + 0.01], [dx + 2.5, y, dz + 0.01], [dx + 2.5, y + 0.06, dz + 0.01], [dx - 2.5, y + 0.06, dz + 0.01], [0, 0, 1], hex(0x8a7430));
      City.breakins.push({ x: dx, z: dz + 1.4, nx: 0, nz: 1, kind: 'warehouse', wx: dx, wz: dz });
      City.graffiti.push({ x: x0 + 4, z: z0 - 1.3, wx: x0 + 4, wz: z0 - 0.1, nx: 0, nz: -1, y: YB + 2 });
    }
    // container stacks
    const cc = [0xc0392b, 0x2471a3, 0x229954, 0xd68910, 0x7d3c98].map(hex);
    for (let k = 0; k < 5; k++) {
      const x = R.range(b.ix0 + 38, b.ix1 - 4), z = R.range(b.iz0 + 26, b.iz1 - 8);
      if (twoBuildings && x < b.ix0 + 32 && z > b.iz1 - 22) continue;
      const stack = R.int(1, 2);
      for (let s = 0; s < stack; s++) P.sBox.add(x, YB + 1.3 + s * 2.6, z, 2.4, 2.6, 6, R.pick(cc));
      addCollider(x - 1.2, z - 3, x + 1.2, z + 3, YB + stack * 2.6, 'container');
    }
    dumpster(b.ix1 - 3, b.iz0 + 24, false);
    void yard;
  }

  function addRamp(cx, cz, dx, dz, len, w, h) {
    const sx = cx - dx * len / 2, sz = cz - dz * len / 2;
    const rp = { sx, sz, dx, dz, len, w, h, y0: YB, x: cx, z: cz };
    City.ramps.push(rp);
    const ch = chunkAt(cx, cz);
    const rx = -dz, rz = dx;
    const p = (a, b, y) => [sx + dx * a + rx * b, y, sz + dz * a + rz * b];
    const col = hex(0xe67e22), side = hex(0x7f8c8d);
    const hw = w / 2, top = YB + h;
    const nLen = Math.hypot(len, h);
    ch.plain.quad(p(0, -hw, YB), p(0, hw, YB), p(len, hw, top), p(len, -hw, top), [-dx * h / nLen, len / nLen, -dz * h / nLen], col);
    // stripes on the ramp
    for (let a = 1; a < len; a += 2.4) {
      const y0 = YB + h * a / len + 0.02, y1 = YB + h * (a + 0.8) / len + 0.02;
      ch.plain.quad(p(a, -hw, y0), p(a, hw, y0), p(a + 0.8, hw, y1), p(a + 0.8, -hw, y1), [0, 1, 0], hex(0x222222));
    }
    ch.plain.tri(p(0, -hw, YB), p(len, -hw, YB), p(len, -hw, top), [-rx, 0, -rz], side);
    ch.plain.tri(p(0, hw, YB), p(len, hw, YB), p(len, hw, top), [rx, 0, rz], side);
    ch.plain.quad(p(len, -hw, YB), p(len, hw, YB), p(len, hw, top), p(len, -hw, top), [dx, 0, dz], side);
    rp.used = 0;
  }

  // ------------------------------------------------------------------ outer ring + skyline
  function outerRing() {
    const band = (axis, sign) => {
      let t = -330;
      while (t < 330) {
        const w = R.range(14, 30);
        const h = YB + R.range(3, 11) * 3.5;
        const style = R.pick(['brick', 'brick', 'office', 'stone']);
        const tint = R.pick(style === 'brick' ? PAL.brick : style === 'office' ? PAL.office : PAL.stone);
        const d = R.range(18, 30);
        if (axis === 'x') { // west band: x in [-306-d, -306], along z
          building(-306 - d, t, -306, Math.min(t + w, 345), h, style, tint, {});
        } else {
          const z0 = sign > 0 ? 306 : -306 - d, z1 = sign > 0 ? 306 + d : -306;
          const x1 = Math.min(t + w, 303);
          if (x1 - t > 2) building(t, z0, x1, z1, h, style, tint, {});
        }
        t += w;
      }
    };
    band('x', -1); band('z', 1); band('z', -1);
    // distant skyline silhouettes (no collision)
    const far = chunkAt(-340, 0);
    for (let k = 0; k < 40; k++) {
      const a = R.range(Math.PI * 0.55, Math.PI * 1.45);
      const d = R.range(430, 650);
      const x = Math.cos(a) * d, z = Math.sin(a) * d * 1.2;
      const s = R.range(16, 40), h = R.range(20, 110);
      far.office.box(x - s / 2, 0, z - s / 2, x + s / 2, h, z + s / 2, CB.shade(R.pick(PAL.office), 0.7), { bottom: true });
    }
  }

  // ------------------------------------------------------------------ L train
  function elevatedTrack() {
    const lo = CB.road(3), hi = CB.road(5), Y = 7.4;
    const steel = PAL.lsteel;
    const ch = (x, z) => chunkAt(x, z).plain;
    const seg = (x0, z0, x1, z1) => {
      // deck
      const w = 3.2;
      if (x0 === x1) {
        ch(x0, (z0 + z1) / 2).box(x0 - w, Y, Math.min(z0, z1) - w, x0 + w, Y + 0.7, Math.max(z0, z1) + w, steel, {});
      } else {
        ch((x0 + x1) / 2, z0).box(Math.min(x0, x1) - w, Y, z0 - w, Math.max(x0, x1) + w, Y + 0.7, z0 + w, steel, {});
      }
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let t = 9; t < len - 8; t += 14) {
        const f = t / len, px = x0 + (x1 - x0) * f, pz = z0 + (z1 - z0) * f;
        const along = x0 === x1 ? pz : px;
        let near = 99;
        for (let k = 0; k <= C.N; k++) near = Math.min(near, Math.abs(along - CB.road(k)));
        if (near < 9.5) continue;
        P.sBox.add(px, Y / 2, pz, 0.7, Y, 0.7, steel);
        P.sBox.add(px, Y - 0.3, pz, x0 === x1 ? 6.4 : 0.6, 0.6, x0 === x1 ? 0.6 : 6.4, steel);
        addCollider(px - 0.35, pz - 0.35, px + 0.35, pz + 0.35, Y, 'pillar');
      }
      // rails
      for (const o of [-2.1, -0.7, 0.7, 2.1]) {
        if (x0 === x1) ch(x0, z0).box(x0 + o - 0.06, Y + 0.7, Math.min(z0, z1) - 3, x0 + o + 0.06, Y + 0.85, Math.max(z0, z1) + 3, hex(0x888888), { bottom: true });
        else ch(x0, z0).box(Math.min(x0, x1) - 3, Y + 0.7, z0 + o - 0.06, Math.max(x0, x1) + 3, Y + 0.85, z0 + o + 0.06, hex(0x888888), { bottom: true });
      }
    };
    seg(lo, lo, hi, lo); seg(hi, lo, hi, hi); seg(hi, hi, lo, hi); seg(lo, hi, lo, lo);
    City.loop = { lo, hi, y: Y + 0.85 };
  }

  // ------------------------------------------------------------------ traffic lights
  City.signals = [];
  function trafficLights() {
    for (let i = 1; i < C.N; i++) {
      for (let j = 1; j < C.N; j++) {
        const nx = CB.road(i), nz = CB.road(j);
        for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const rx = dz, rz = -dx;
          const px = nx + dx * 7.8 + rx * 7.8, pz = nz + dz * 7.8 + rz * 7.8;
          const pole = hex(0x2d3436);
          P.sCyl.add(px, YB + 3, pz, 0.22, 6, 0.22, pole);
          // mast arm toward the lane
          const ax = nx + dx * 7.8 + rx * 4.9, az = nz + dz * 7.8 + rz * 4.9;
          P.sBox.add(ax, YB + 5.9, az, rx ? 6 : 0.14, 0.14, rz ? 6 : 0.14, pole);
          const hx = nx + dx * 7.8 + rx * C.LANE, hz = nz + dz * 7.8 + rz * C.LANE;
          P.sBox.add(hx, YB + 5.1, hz, 0.45, 1.25, 0.45, hex(0x1e272e));
          P.sBox.add(px + rx * 0.01 - dx * 0.0, YB + 3.4, pz, dx ? 0.05 : 1.2, 0.28, dz ? 0.05 : 1.2, hex(0x1e7d46));
          const yaw = Math.atan2(-dx, -dz);
          const lens = (yy) => ({ x: hx - dx * 0.24, y: YB + 5.1 + yy, z: hz - dz * 0.24 });
          // dim lenses (static)
          for (const [yy, c] of [[0.38, 0x4a1010], [0, 0x4a3a08], [-0.38, 0x0d3a1a]]) {
            const L = lens(yy);
            P.sBox.add(L.x - dx * 0.005, L.y, L.z - dz * 0.005, 0.26, 0.26, 0.26, hex(c));
          }
          const s = { i, j, axis: dz ? 'ns' : 'ew', yaw, R: lens(0.38), Y: lens(0), G: lens(-0.38),
            sr: P.gR.alloc(), sy: P.gY.alloc(), sg: P.gG.alloc(), state: '' };
          City.signals.push(s);
          addCollider(px - 0.15, pz - 0.15, px + 0.15, pz + 0.15, 6, 'pole');
        }
      }
    }
  }
  // Signal state for travel along an axis at intersection (i,j).
  City.signalState = function (i, j, axis, t) {
    if (i <= 0 || j <= 0 || i >= C.N || j >= C.N) return 'g';
    const cyc = 22, off = ((i * 7 + j * 13) % 11) * 2;
    const p = (t + off) % cyc;
    if (axis === 'ns') return p < 8.5 ? 'g' : p < 11 ? 'y' : 'r';
    return p < 11 ? 'r' : p < 19.5 ? 'g' : p < 22 ? 'y' : 'r';
  };
  City.updateSignals = function (t) {
    for (const s of City.signals) {
      const st = City.signalState(s.i, s.j, s.axis, t);
      if (st === s.state) continue;
      s.state = st;
      const show = (pool, slot, L, on) => {
        if (on) CB.placeSlot(pool, slot, L.x, L.y, L.z, 0.3, 0.3, 0.3, s.yaw);
        else pool.hide(slot);
      };
      show(P.gR, s.sr, s.R, st === 'r'); show(P.gY, s.sy, s.Y, st === 'y'); show(P.gG, s.sg, s.G, st === 'g');
    }
  };

  // ------------------------------------------------------------------ curb-side parking
  function curbParking() {
    for (let i = 0; i <= C.N; i++) {
      for (let j = 0; j < C.N; j++) {
        // N-S street at x = road(i), between nodes j and j+1
        const x = CB.road(i), a = CB.road(j) + 14, b = CB.road(j + 1) - 14;
        const bt = blockType(Math.min(i, C.N - 1), j);
        if (bt === 'downtown' || bt === 'skydeck') continue;
        for (const side of [-1, 1]) {
          if ((i === 0 && side < 0) || (i === C.N && side > 0) || R() < 0.45) continue;
          for (let z = a; z < b - 6; z += 6.6) {
            if (R() < 0.35) continue;
            const px = x + side * C.PARK, yaw = side > 0 ? 0 : Math.PI;
            City.parking.push({ x: px, z: z + 3, yaw, curb: true });
            if (R() < 0.5) breakable('meter', x + side * 7.5, z + 3.2, side > 0 ? -Math.PI / 2 : Math.PI / 2);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ lake front
  function lakefront() {
    for (let z = -296; z < 296; z += 14) {
      if (Math.abs(z) < 12) continue;
      if (R() < 0.75) tree(310 + R.range(-4, 6), z + R.range(-3, 3));
      if ((z / 14 | 0) % 2 === 0) {
        P.sCyl.add(318.6, YB + 2, z + 7, 0.12, 4, 0.12, hex(0x2d3436));
        P.sLamp.add(318.6, YB + 4.1, z + 7, 0.5, 0.4, 0.5);
        P.sLampPool.add(319.5, YB + 0.03, z + 7, 9, 1, 9);
        addCollider(318.5, z + 6.9, 318.7, z + 7.1, 4, 'pole');
      }
      if (R() < 0.35) bench(326.5, z + 3, Math.PI / 2);
    }
    hotdogStand(318, -40);
    hotdogStand(318, 120);
    addRamp(323, -150, 0, 1, 12, 4.5, 2.6);
    addRamp(323, 160, 0, -1, 12, 4.5, 2.6);
    // lifeguard-ish stand + bushes for cover
    for (let k = 0; k < 6; k++) {
      const z = R.range(-280, 280);
      if (Math.abs(z) < 20) continue;
      P.sSph.add(306.5, YB + 0.7, z, 3.6, 1.6, 2.6, hex(0x3f7d34));
      City.covers.push({ x: 306.5, z, r: 1.6 });
    }
    // ferris wheel base on the pier platform
    City.ferris = { x: 417, y: 24, z: 18, r: 20 };
    for (const dx of [-6, 6]) {
      P.sBox.add(417 + dx, YB + 12, 14.5, 0.8, 24, 0.8, hex(0xecf0f1), 0, 0, dx > 0 ? 0.24 : -0.24);
      P.sBox.add(417 + dx, YB + 12, 21.5, 0.8, 24, 0.8, hex(0xecf0f1), 0, 0, dx > 0 ? 0.24 : -0.24);
    }
    addCollider(406, 13, 428, 23, 3, 'ferris');
    P.sBox.add(417, YB + 1.5, 18, 22, 3, 10, hex(0x34495e));
  }

  // ------------------------------------------------------------------ build
  City.build = function (scene, pools) {
    P = pools;
    R = CB.rng(1871); // year of the Great Chicago Fire
    G = new CB.Geo();
    // blocks
    for (let bi = 0; bi < C.N; bi++) {
      for (let bj = 0; bj < C.N; bj++) {
        const x0 = CB.road(bi) + C.ROAD / 2, z0 = CB.road(bj) + C.ROAD / 2;
        const b = { bi, bj, x0, z0, x1: x0 + C.BLOCK, z1: z0 + C.BLOCK, type: blockType(bi, bj) };
        b.ix0 = x0 + C.SIDE; b.iz0 = z0 + C.SIDE; b.ix1 = b.x1 - C.SIDE; b.iz1 = b.z1 - C.SIDE;
        b.cx = (x0 + b.x1) / 2; b.cz = (z0 + b.z1) / 2;
        City.blocks.push(b);
      }
    }
    groundBase();
    roadMarkings();
    for (const b of City.blocks) {
      blockBase(b);
      switch (b.type) {
        case 'apartments': genApartments(b); break;
        case 'shops': genShops(b); break;
        case 'downtown': genDowntown(b); break;
        case 'skydeck': skydeck(b); break;
        case 'park': genPark(b, 'park'); break;
        case 'bean': genPark(b, 'bean'); break;
        case 'fountain': genPark(b, 'fountain'); break;
        case 'parking': genParking(b, b.bi === 1 ? 1 : b.bi === 6 ? -1 : 0); break;
        case 'industrial': genIndustrial(b); break;
      }
      streetFurniture(b);
    }
    outerRing();
    lakefront();
    elevatedTrack();
    trafficLights();
    curbParking();
    // speed cameras + race starts
    City.speedCams.push({ x: 303.8, z: -60, roadX: 296 }, { x: -303.8, z: 90, roadX: -296 }, { x: 40, z: -303.8, roadZ: -296 });
    for (const s of City.speedCams) {
      P.sCyl.add(s.x, YB + 2.5, s.z, 0.16, 5, 0.16, hex(0x7f8c8d));
      P.sBox.add(s.x, YB + 5, s.z, 0.7, 0.5, 0.7, hex(0xf1c40f));
      addCollider(s.x - 0.15, s.z - 0.15, s.x + 0.15, s.z + 0.15, 5, 'pole');
    }
    City.raceStarts.push({ x: 298.5, z: -230, node: [8, 1], name: 'Lake Shore Sprint' },
      { x: -293.5, z: 210, node: [0, 7], name: 'West Side Dash' },
      { x: 2.5, z: -290, node: [4, 0], name: 'South Loop Run' });
    for (const s of City.raceStarts) {
      const sx = s.x > 0 ? 304.5 : s.x < -100 ? -304.5 : s.x + 5.5;
      const sz = Math.abs(s.x) > 100 ? s.z : -304.5;
      P.sCyl.add(sx, YB + 2, sz, 0.1, 4, 0.1, hex(0xdddddd));
      for (let k = 0; k < 4; k++) for (let m = 0; m < 2; m++) P.sBox.add(sx + (Math.abs(s.x) > 100 ? 0 : 0.3 + k * 0.3), YB + 3.7 - m * 0.3, sz + (Math.abs(s.x) > 100 ? 0.3 + k * 0.3 : 0), Math.abs(s.x) > 100 ? 0.03 : 0.3, 0.3, Math.abs(s.x) > 100 ? 0.3 : 0.03, (k + m) % 2 ? hex(0x111111) : hex(0xffffff));
    }

    // materials
    const facMat = (kind, seed) => {
      const f = CB.CityTex.facade(scene, kind, seed);
      const m = new B.StandardMaterial('fac_' + kind, scene);
      m.diffuseTexture = f.diff; m.emissiveTexture = f.emis;
      m.emissiveColor = new B.Color3(0, 0, 0);
      m.specularColor = new B.Color3(0.08, 0.08, 0.08);
      if (kind === 'glass') { m.specularColor = new B.Color3(0.6, 0.6, 0.6); m.specularPower = 96; }
      return m;
    };
    City.mats = {
      office: facMat('office', 11), brick: facMat('brick', 22), stone: facMat('stone', 33), glass: facMat('glass', 44),
    };
    const plainMat = new B.StandardMaterial('plain', scene);
    plainMat.specularColor = new B.Color3(0.06, 0.06, 0.06);
    City.mats.plain = plainMat;
    const groundMat = new B.StandardMaterial('ground', scene);
    groundMat.specularColor = new B.Color3(0.1, 0.1, 0.1);
    groundMat.specularPower = 24;
    City.mats.ground = groundMat;

    City.ground = G.build('ground', scene, groundMat);
    City.ground.receiveShadows = true;
    for (const ch of City.chunks.values()) {
      for (const k of ['office', 'brick', 'stone', 'glass', 'plain']) {
        if (!ch[k].count) continue;
        const mesh = ch[k].build('chunk_' + ch.key + '_' + k, scene, City.mats[k]);
        mesh.receiveShadows = true;
        City.chunkMeshes.push({ mesh, x: ch.cx, z: ch.cz, kind: k });
        ch[k] = null;
      }
    }
    buildNav();
  };

  // Called after stores are assigned: signs + awnings for every storefront.
  City.buildSigns = function (scene, labels) {
    const atlas = CB.CityTex.signAtlas(scene, labels);
    const sg = new CB.Geo();
    for (const s of City.storefronts) {
      if (s.label == null) continue;
      const uv = atlas.uvs[s.label];
      const w = Math.min(s.w * 0.75, 7), h = w / 4;
      const rx = -s.nz, rz = s.nx; // viewer's right when facing the wall
      const y0 = s.yb + 3.55, y1 = y0 + h;
      const o = 0.16;
      const L = [s.sx - rx * w / 2 + s.nx * o, s.sz - rz * w / 2 + s.nz * o];
      const Rr = [s.sx + rx * w / 2 + s.nx * o, s.sz + rz * w / 2 + s.nz * o];
      sg.quad([L[0], y0, L[1]], [Rr[0], y0, Rr[1]], [Rr[0], y1, Rr[1]], [L[0], y1, L[1]], [s.nx, 0, s.nz], [1, 1, 1], [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]]);
      // awning
      const aw = R.pick(PAL.awning);
      const ax = s.cx + s.nx * 0.75, az = s.cz + s.nz * 0.75;
      const along = Math.abs(s.ux) > 0.5;
      P.sBox.add(ax, s.yb + 3.2, az, along ? s.w * 0.9 : 1.5, 0.12, along ? 1.5 : s.w * 0.9, aw, 0, along ? s.nz * 0.25 : 0, along ? 0 : -s.nx * 0.25);
    }
    const m = new B.StandardMaterial('signMat', scene);
    m.disableLighting = true;
    m.diffuseColor = new B.Color3(0, 0, 0);
    m.emissiveTexture = atlas.tex;
    m.emissiveColor = new B.Color3(0, 0, 0);
    m.specularColor = new B.Color3(0, 0, 0);
    City.mats.sign = m;
    City.signMesh = sg.build('signs', scene, m);
  };
})(window.CB);

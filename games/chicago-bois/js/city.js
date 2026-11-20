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
    playerSpawn: { x: C.EDGE + 11, z: 34, yaw: -Math.PI / 2 },
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
  // Chicago River: the main branch runs east along block row RIVER_J into the lake,
  // the south branch runs south along block column RIVER_I.
  const RIVER_I = 3, RIVER_J = 10, RW = 13;
  const WATER_Y = -4.2, BED = -5.5;
  const rcx = CB.road(RIVER_I) + C.P / 2, rcz = CB.road(RIVER_J) + C.P / 2;
  City.rivers = [
    { x0: rcx - RW, x1: C.SHORE + 2, z0: rcz - RW, z1: rcz + RW, axis: 'x' },
    { x0: rcx - RW, x1: rcx + RW, z0: -C.EDGE, z1: rcz + RW, axis: 'z' },
  ];
  City.waterY = WATER_Y;
  City.inRiver = function (x, z) {
    for (const r of City.rivers) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r;
    return null;
  };
  // Is this river point covered by a road bridge?
  function bridgeAt(r, x, z) {
    if (r.axis === 'x') { const i = Math.round((x + C.HALF) / C.P); return Math.abs(x - CB.road(i)) < C.ROAD / 2 + 0.6; }
    const j = Math.round((z + C.HALF) / C.P); return Math.abs(z - CB.road(j)) < C.ROAD / 2 + 0.6;
  }
  City.onBridge = (x, z) => { const r = City.inRiver(x, z); return !!r && bridgeAt(r, x, z); };

  // 16 x 16 blocks: bi runs west -> east (bi = 15 is on the lake), bj runs south -> north.
  const SPECIAL = {
    '15,8': 'bean', '15,7': 'fountain', '7,7': 'skydeck', '10,12': 'bigjohn', '13,14': 'ballpark',
    '0,12': 'park', '11,2': 'park', '5,15': 'park', '14,12': 'park', '1,5': 'park', '8,3': 'park', '15,11': 'park', '2,1': 'park', '12,6': 'park',
    '1,8': 'parking', '12,3': 'parking', '8,15': 'parking', '14,5': 'parking', '5,2': 'parking', '13,10': 'parking',
    '0,0': 'industrial', '1,0': 'industrial', '0,1': 'industrial', '1,1': 'industrial', '5,0': 'industrial', '6,0': 'industrial',
    '14,0': 'industrial', '15,0': 'industrial', '15,1': 'industrial', '0,15': 'industrial',
    '4,3': 'shops', '14,9': 'shops', '1,13': 'shops', '12,4': 'shops', '9,15': 'shops', '0,7': 'shops', '12,13': 'shops',
    '7,1': 'shops', '15,4': 'shops', '0,9': 'shops', '13,2': 'shops', '2,3': 'shops', '12,8': 'shops', '7,4': 'shops',
    '4,12': 'shops', '11,14': 'shops', '2,14': 'shops', '13,7': 'shops', '10,2': 'shops', '4,6': 'shops',
  };
  function blockType(bi, bj) {
    if ((bi === RIVER_I && bj <= RIVER_J) || (bj === RIVER_J && bi >= RIVER_I)) return 'river';
    const k = bi + ',' + bj;
    if (SPECIAL[k]) return SPECIAL[k];
    if (bi >= 6 && bi <= 9 && bj >= 6 && bj <= 9) return 'downtown';
    if (bi >= 5 && bi <= 10 && bj >= 5 && bj <= 13) return 'midtown';
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
    const S = 160, O = -(C.OUT + 60);
    const cx = M.clamp(Math.floor((x - O) / S), 0, 9), cz = M.clamp(Math.floor((z - O) / S), 0, 9);
    const key = cx * 10 + cz;
    let ch = City.chunks.get(key);
    if (!ch) {
      ch = { key, cx: O + (cx + 0.5) * S, cz: O + (cz + 0.5) * S,
        office: new CB.Geo(), brick: new CB.Geo(), stone: new CB.Geo(), glass: new CB.Geo(), plain: new CB.Geo({ world: 3 }), interior: new CB.Geo({ world: 2 }) };
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
    const F = C.FERRIS, rv = City.inRiver(x, z);
    if (rv) y = bridgeAt(rv, x, z) ? 0 : -6;
    else if (City.blockAt(x, z)) y = YB;
    else if (x >= C.EDGE && x <= C.SHORE && (z < -7 || z > 7) && z > -C.OUT && z < C.OUT) y = YB;
    else if (x <= -C.EDGE || z <= -C.EDGE || z >= C.EDGE) y = YB;
    else if (x > C.SHORE && x <= C.PIER.x1 && ((z >= C.PIER.z0 && z <= C.PIER.z1) || (x >= F.x0 && x <= F.x1 && z >= F.z0 && z <= F.z1))) y = YB;
    else if (x > C.SHORE) y = -6; // lake
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
  const NAV = City.nav = { x0: -(C.OUT + 6), z0: -(C.OUT + 6), cs: 2, w: 0, h: 0, walk: null, opaque: null };
  function buildNav() {
    NAV.w = Math.ceil((C.PIER.x1 + 4 - NAV.x0) / NAV.cs); NAV.h = Math.ceil((C.OUT + 6 - NAV.z0) / NAV.cs);
    const n = NAV.w * NAV.h;
    NAV.walk = new Uint8Array(n); NAV.opaque = new Uint8Array(n);
    for (let j = 0; j < NAV.h; j++) {
      for (let i = 0; i < NAV.w; i++) {
        const x = NAV.x0 + (i + 0.5) * NAV.cs, z = NAV.z0 + (j + 0.5) * NAV.cs;
        const inCity = x > C.WORLD.x0 && x < C.WORLD.x1 - 0.8 && z > C.WORLD.z0 && z < C.WORLD.z1;
        const F = C.FERRIS;
        const onPier = x >= C.SHORE - 1 && x < C.PIER.x1 - 0.5 && ((z > C.PIER.z0 + 0.5 && z < C.PIER.z1 - 0.5) || (x > F.x0 && x < F.x1 && z > 0 && z < F.z1 - 0.5));
        NAV.walk[j * NAV.w + i] = (inCity || onPier) && City.groundY(x, z) > -1 ? 1 : 0;
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
  // door: { side, a, b, h } – leave an opening from a to b (metres along that side) up to height h.
  function wallsUV(geo, x0, z0, x1, z1, y0, y1, yb, tint, uo, vo, door) {
    const T = 24, TH = 28;
    const v0 = vo + (y0 - yb) / TH, v1 = vo + (y1 - yb) / TH;
    // walls that start at street level get a darker band at the bottom (cheap ambient occlusion)
    const aoH = y0 <= yb + 0.01 && y1 - y0 > 3 ? Math.min(5, (y1 - y0) * 0.5) : 0;
    const vm = vo + (y0 + aoH - yb) / TH;
    const side = (key, a, b, c, d, n, L, k) => {
      const col = CB.shade(tint, k);
      if (door && door.side === key && door.h > 0) {
        const at = (s, y) => [a[0] + (b[0] - a[0]) * s / L, y, a[2] + (b[2] - a[2]) * s / L];
        const vy = (y) => vo + (y - yb) / TH, U = (s) => uo + s / T;
        const piece = (s0, s1, ya, yb2) => { if (s1 - s0 > 0.01 && yb2 - ya > 0.01) geo.quad(at(s0, ya), at(s1, ya), at(s1, yb2), at(s0, yb2), n, col, [U(s0), vy(ya), U(s1), vy(ya), U(s1), vy(yb2), U(s0), vy(yb2)]); };
        piece(0, door.a, y0, y1); piece(door.b, L, y0, y1); piece(door.a, door.b, y0 + door.h, y1);
        return;
      }
      if (!aoH) { geo.quad(a, b, c, d, n, col, [uo, v0, uo + L / T, v0, uo + L / T, v1, uo, v1]); return; }
      const dark = CB.shade(tint, k * 0.62);
      const mid = (p) => [p[0], y0 + aoH, p[2]];
      geo.quad(a, b, mid(c), mid(d), n, null, [uo, v0, uo + L / T, v0, uo + L / T, vm, uo, vm], [dark, dark, col, col]);
      geo.quad(mid(a), mid(b), c, d, n, col, [uo, vm, uo + L / T, vm, uo + L / T, v1, uo, v1]);
    };
    side('s', [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], x1 - x0, 0.97);
    side('e', [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], z1 - z0, 0.9);
    side('n', [x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1], x1 - x0, 0.97);
    side('w', [x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], z1 - z0, 0.9);
  }
  // Plain-coloured walls (no top/bottom) with an optional door opening.
  function sideWalls(geo, x0, z0, x1, z1, y0, y1, col, door) {
    const sides = [
      ['s', [x0, z0], [x1, z0], [0, 0, -1], 0.88], ['e', [x1, z0], [x1, z1], [1, 0, 0], 0.78],
      ['n', [x1, z1], [x0, z1], [0, 0, 1], 0.88], ['w', [x0, z1], [x0, z0], [-1, 0, 0], 0.78],
    ];
    for (const [key, A, Bp, n, k] of sides) {
      const c = CB.shade(col, k), L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
      const at = (s, y) => [A[0] + (Bp[0] - A[0]) * s / L, y, A[1] + (Bp[1] - A[1]) * s / L];
      const piece = (s0, s1, ya, yb2) => { if (s1 - s0 > 0.01 && yb2 - ya > 0.01) geo.quad(at(s0, ya), at(s1, ya), at(s1, yb2), at(s0, yb2), n, c); };
      if (door && door.side === key) { piece(0, door.a, y0, y1); piece(door.b, L, y0, y1); piece(door.a, door.b, y0 + door.h, y1); }
      else piece(0, L, y0, y1);
    }
  }
  // Start corner, direction along the side and outward normal (same convention as storefront()).
  function sideFrame(x0, z0, x1, z1, side) {
    if (side === 's') return { ax: x0, az: z0, ux: 1, uz: 0, nx: 0, nz: -1, L: x1 - x0, depth: z1 - z0 };
    if (side === 'n') return { ax: x1, az: z1, ux: -1, uz: 0, nx: 0, nz: 1, L: x1 - x0, depth: z1 - z0 };
    if (side === 'e') return { ax: x1, az: z0, ux: 0, uz: 1, nx: 1, nz: 0, L: z1 - z0, depth: x1 - x0 };
    return { ax: x0, az: z1, ux: 0, uz: -1, nx: -1, nz: 0, L: z1 - z0, depth: x1 - x0 };
  }
  // Where the shop door sits along a storefront wall of length L (1.6 m wide).
  function storeDoor(L) { const w = Math.min(L - 1, 14), s0 = (L - w) / 2; return [s0 + w - 2.2, s0 + w - 0.6]; }
  function sbox(geo, x0, y0, z0, x1, y1, z1, col) {
    geo.box(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), col, { bottom: true });
  }
  function subtractAll(r, holes) {
    let out = [r];
    for (const h of holes) { const nx = []; for (const q of out) nx.push(...rectMinus(q, h)); out = nx; }
    return out.filter((q) => q.x1 - q.x0 > 0.05 && q.z1 - q.z0 > 0.05);
  }

  // ------------------------------------------------------------------ interiors
  // A walk-in room on the ground floor behind a door in the given side.
  City.rooms = [];
  function planRoom(x0, z0, x1, z1, side, yb, ceil, kind, door) {
    const S = sideFrame(x0, z0, x1, z1, side);
    if (S.L < 7 || S.depth < 6) return null;
    const [d1, d2] = door;
    const W = Math.min(S.L - 0.8, 15);
    let sa = (S.L - W) / 2, sb = sa + W;
    if (d1 < sa + 0.4) { sa = Math.max(0.4, d1 - 0.4); }
    if (d2 > sb - 0.4) { sb = Math.min(S.L - 0.4, d2 + 0.4); }
    const D = Math.min(S.depth - 0.7, 11.5);
    const p = (s, ins) => [S.ax + S.ux * s - S.nx * ins, S.az + S.uz * s - S.nz * ins];
    const q0 = p(sa, 0.3), q1 = p(sb, D), e0 = p(d1, -0.3), e1 = p(d2, 0.45);
    const room = {
      kind, side, S, sa, sb, d1, d2, D, yb, ceil,
      x0: Math.min(q0[0], q1[0]), z0: Math.min(q0[1], q1[1]), x1: Math.max(q0[0], q1[0]), z1: Math.max(q0[1], q1[1]),
      door: { x0: Math.min(e0[0], e1[0]), z0: Math.min(e0[1], e1[1]), x1: Math.max(e0[0], e1[0]), z1: Math.max(e0[1], e1[1]) },
      // local frame: origin at the inside face of the front wall, middle of the room; u along the wall, v inward
      ox: (q0[0] + p(sb, 0.3)[0]) / 2, oz: (q0[1] + p(sb, 0.3)[1]) / 2, ux: S.ux, uz: S.uz, vx: -S.nx, vz: -S.nz,
      W: sb - sa, Dl: D - 0.3, ud: (d1 + d2) / 2 - (sa + sb) / 2,
      doorX: S.ax + S.ux * (d1 + d2) / 2, doorZ: S.az + S.uz * (d1 + d2) / 2,
    };
    room.cx = (room.x0 + room.x1) / 2; room.cz = (room.z0 + room.z1) / 2;
    return room;
  }
  City.roomAt = function (x, z) {
    for (const r of City.rooms) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r;
    return null;
  };
  // local (u, v) -> world (x, z)
  const L2W = (r, u, v) => [r.ox + r.ux * u + r.vx * v, r.oz + r.uz * u + r.vz * v];
  City.roomPoint = L2W;

  const SHOP_WALLS = [0xe9e4d8, 0xdfe8e4, 0xf1e6d0, 0xe2e2ea, 0xf4ede4].map(hex);
  const HOUSE_WALLS = [0xd9c7a7, 0xc7d6c2, 0xe0c8c0, 0xc9cfe0, 0xe8dcc0, 0xb8cfd6].map(hex);
  const FLOORS = { shop: [0xb9b2a6, 0xa9a59c, 0xd2c9b8], house: [0x8a6a4a, 0x9b7653, 0x6f5640] };

  // Walls, floor, ceiling and door jambs of a room (drawn facing inward).
  function roomShell(r) {
    const ch = chunkAt(r.cx, r.cz), g = ch.interior;
    const y0 = r.yb, y1 = r.ceil, dh = 2.55;
    const wall = R.pick(r.kind === 'house' ? HOUSE_WALLS : SHOP_WALLS);
    g.flat(r.x0, r.z0, r.x1, r.z1, y0 + 0.02, R.pick(FLOORS[r.kind === 'house' ? 'house' : 'shop'].map(hex)));
    g.quad([r.x0, y1, r.z0], [r.x1, y1, r.z0], [r.x1, y1, r.z1], [r.x0, y1, r.z1], [0, -1, 0], hex(0xf2efe8));
    // the door wall is the one facing the outside (its inward normal is -S.n)
    const walls = [
      { A: [r.x0, r.z0], B: [r.x1, r.z0], n: [0, 0, 1] }, { A: [r.x0, r.z1], B: [r.x1, r.z1], n: [0, 0, -1] },
      { A: [r.x0, r.z0], B: [r.x0, r.z1], n: [1, 0, 0] }, { A: [r.x1, r.z0], B: [r.x1, r.z1], n: [-1, 0, 0] },
    ];
    for (const w of walls) {
      const L = Math.hypot(w.B[0] - w.A[0], w.B[1] - w.A[1]);
      const at = (t, y) => [w.A[0] + (w.B[0] - w.A[0]) * t / L, y, w.A[1] + (w.B[1] - w.A[1]) * t / L];
      const piece = (t0, t1, ya, yb2, c) => { if (t1 - t0 > 0.01) g.quad(at(t0, ya), at(t1, ya), at(t1, yb2), at(t0, yb2), w.n, c); };
      const isDoor = w.n[0] === -r.S.nx && w.n[2] === -r.S.nz;
      const base = CB.shade(wall, 0.6);
      if (isDoor) {
        // door gap along this wall
        const ta = Math.abs(w.B[0] - w.A[0]) > 0.1 ? Math.min(r.door.x0, r.door.x1) - w.A[0] : Math.min(r.door.z0, r.door.z1) - w.A[1];
        const tb = ta + 1.6;
        piece(0, ta, y0, y1, wall); piece(tb, L, y0, y1, wall); piece(ta, tb, y0 + dh, y1, wall);
        piece(0, ta, y0, y0 + 0.12, base); piece(tb, L, y0, y0 + 0.12, base);
      } else {
        piece(0, L, y0, y1, wall);
        piece(0, L, y0 + 0.01, y0 + 0.12, base);
      }
    }
    // jambs + head of the door opening (between the inner wall and the facade)
    const S = r.S, P1 = (s, ins, y) => [S.ax + S.ux * s - S.nx * ins, y, S.az + S.uz * s - S.nz * ins];
    const jam = hex(0x5a4636);
    g.quad(P1(r.d1, 0, y0), P1(r.d1, 0.3, y0), P1(r.d1, 0.3, y0 + dh), P1(r.d1, 0, y0 + dh), [S.ux, 0, S.uz], jam);
    g.quad(P1(r.d2, 0, y0), P1(r.d2, 0.3, y0), P1(r.d2, 0.3, y0 + dh), P1(r.d2, 0, y0 + dh), [-S.ux, 0, -S.uz], jam);
    g.quad(P1(r.d1, 0, y0 + dh), P1(r.d2, 0, y0 + dh), P1(r.d2, 0.3, y0 + dh), P1(r.d1, 0.3, y0 + dh), [0, -1, 0], jam);
    g.flat(Math.min(P1(r.d1, -0.9, 0)[0], P1(r.d2, 0.3, 0)[0]), Math.min(P1(r.d1, -0.9, 0)[2], P1(r.d2, 0.3, 0)[2]),
      Math.max(P1(r.d1, -0.9, 0)[0], P1(r.d2, 0.3, 0)[0]), Math.max(P1(r.d1, -0.9, 0)[2], P1(r.d2, 0.3, 0)[2]), y0 + 0.03, hex(0x7a2e2e));
    // ceiling light panels
    for (const f of [0.33, 0.7]) {
      const c = L2W(r, 0, r.Dl * f);
      g.box(c[0] - 0.7, y1 - 0.06, c[1] - 0.7, c[0] + 0.7, y1 - 0.01, c[1] + 0.7, hex(0xfffbe8), { top: true });
    }
  }

  // Furniture box in room-local coordinates; solid ones get a collider.
  function fbox(r, u0, v0, u1, v1, ya, yb2, col, solid) {
    const a = L2W(r, u0, v0), b = L2W(r, u1, v1);
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
    chunkAt(r.cx, r.cz).interior.box(x0, r.yb + ya, z0, x1, r.yb + yb2, z1, col, { bottom: true });
    if (solid) addCollider(x0, z0, x1, z1, r.yb + yb2, 'furniture');
    return { x0, z0, x1, z1 };
  }
  function glowBox(r, pool, u, v, sx, sy, sz, y) {
    const c = L2W(r, u, v);
    const alongU = Math.abs(r.ux) > 0.5;
    pool.add(c[0], r.yb + y, c[1], alongU ? sx : sz, sy, alongU ? sz : sx);
  }
  const PRODUCT = [0xe74c3c, 0xf1c40f, 0x3498db, 0x2ecc71, 0xe67e22, 0x9b59b6, 0xecf0f1, 0x1abc9c].map(hex);

  // Fill a room for its use. Sets r.spot (where the player stands to interact) and r.keeper (cashier).
  City.furnish = function (r, type) {
    roomShell(r);
    const W = r.W, D = r.Dl, hw = W / 2;
    const ud = r.ud, clearL = ud - 1.6, clearR = ud + 1.6; // keep a corridor from the door
    const wood = hex(0x6b4a2f), dark = hex(0x2d3436);
    const shelves = (u0, u1, rows) => {
      for (let k = 0; k < rows; k++) {
        const v = 2 + k * 2.4;
        if (v + 0.8 > D - 3.6) break;
        fbox(r, u0, v, u1, v + 0.8, 0, 1.9, hex(0x8d8d8d), true);
        // products as coloured strips on three shelf levels
        for (const y of [0.45, 1.0, 1.55]) {
          let u = u0 + 0.15;
          while (u < u1 - 0.3) { const w = Math.min(u1 - 0.15 - u, R.range(0.9, 1.8)); fbox(r, u, v - 0.06, u + w - 0.08, v + 0.86, y, y + 0.32, R.pick(PRODUCT)); u += w; }
        }
      }
    };
    const counter = (u0, u1, col) => {
      fbox(r, u0, D - 2.4, u1, D - 1.7, 0, 1.0, col || wood, true);
      fbox(r, u0 - 0.05, D - 2.45, u1 + 0.05, D - 1.65, 1.0, 1.08, hex(0xd8d2c4));
      fbox(r, -0.3, D - 2.2, 0.3, D - 1.85, 1.08, 1.4, dark); // cash register
    };
    r.spot = L2W(r, 0, D - 3.1);
    r.keeper = L2W(r, 0, D - 0.9);
    r.keeperYaw = Math.atan2(-r.vx, -r.vz);
    switch (type) {
      case 'house': {
        // living room: sofa, coffee table, TV, rug, bed, kitchenette, dresser
        const L = -hw + 0.3, Rr = hw - 0.3;
        fbox(r, L, 2.0, L + 0.9, 4.6, 0, 0.75, hex(0x34495e), true);
        fbox(r, L, 2.0, L + 0.3, 4.6, 0.75, 1.3, hex(0x2c3e50));
        fbox(r, L + 1.6, 2.6, L + 2.6, 4.0, 0, 0.45, wood, true);
        chunkAt(r.cx, r.cz).interior.flat(...(() => { const a = L2W(r, L + 1.1, 1.8), b = L2W(r, L + 3.6, 4.8); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; })(), r.yb + 0.04, R.pick([0x9b2335, 0x2e6b8f, 0xc9a227].map(hex)));
        if (Rr - (L + 4) > 1) { fbox(r, Rr - 0.5, 2.3, Rr, 4.3, 0, 0.6, dark, true); glowBox(r, P.sCrown, Rr - 0.3, 3.3, 0.06, 0.9, 1.6, 1.2); fbox(r, Rr - 0.35, 2.45, Rr - 0.25, 4.15, 0.6, 1.7, hex(0x111111)); }
        fbox(r, L, D - 2.2, L + 1.6, D, 0, 0.55, hex(0xdcd6c8), true);
        fbox(r, L, D - 2.2, L + 1.6, D - 1.6, 0.55, 0.8, hex(0xf4f4f4));
        fbox(r, Rr - 2.6, D - 0.7, Rr, D, 0, 0.95, hex(0xcfc8ba), true);
        fbox(r, Rr - 0.8, D - 0.8, Rr, D, 0, 1.9, hex(0xeef0f2), true);
        fbox(r, -0.6, D - 0.6, 0.6, D, 0, 1.1, wood, true); // dresser (loot)
        const pc = L2W(r, Rr - 0.5, 1.0);
        P.sCyl.add(pc[0], r.yb + 0.25, pc[1], 0.5, 0.5, 0.5, hex(0xb9772f)); P.sSph.add(pc[0], r.yb + 0.9, pc[1], 0.9, 1.0, 0.9, hex(0x3f8f3a));
        r.spot = L2W(r, 0, D - 1.6);
        r.keeper = null;
        break;
      }
      case 'bank': {
        fbox(r, -hw + 1, D - 2.4, hw - 3, D - 1.7, 0, 1.1, hex(0x7d6a52), true);
        fbox(r, -hw + 1, D - 2.4, hw - 3, D - 2.3, 1.1, 2.2, hex(0xb7d4e8));
        const vc = L2W(r, hw - 1.6, D - 0.05);
        P.sCyl.add(vc[0], r.yb + 1.5, vc[1], 2.6, 0.35, 2.6, hex(0x95a5a6), Math.abs(r.ux) > 0.5 ? 0 : Math.PI / 2, Math.PI / 2, 0);
        P.sCyl.add(vc[0], r.yb + 1.5, vc[1], 0.6, 0.5, 0.6, hex(0x7f8c8d), Math.abs(r.ux) > 0.5 ? 0 : Math.PI / 2, Math.PI / 2, 0);
        for (const u of [-hw + 1.5, hw - 1.5]) { const c = L2W(r, u, 1.3); P.sCyl.add(c[0], r.yb + 1.8, c[1], 0.5, 3.6, 0.5, hex(0xe8e2d0)); }
        r.spot = L2W(r, hw - 1.6, D - 1.6);
        break;
      }
      case 'jewelry':
        counter(-1.5, 1.5);
        for (const u of [-hw + 1.2, hw - 2.4]) for (let v = 2; v < D - 4; v += 2.2) {
          fbox(r, u, v, u + 1.2, v + 0.7, 0, 0.9, hex(0x2c2c34), true);
          fbox(r, u + 0.05, v + 0.05, u + 1.15, v + 0.65, 0.9, 1.2, hex(0xbfe3f2));
          fbox(r, u + 0.3, v + 0.25, u + 0.5, v + 0.45, 0.92, 1.0, hex(0xf5c518));
          fbox(r, u + 0.7, v + 0.25, u + 0.9, v + 0.45, 0.92, 1.0, hex(0xdfe6e9));
        }
        break;
      case 'electronics':
        counter(-2, 2);
        for (let k = 0; k < 3; k++) {
          const u = -hw + 0.3; const v = 2 + k * 2.2;
          if (v > D - 3.5) break;
          fbox(r, u, v, u + 0.5, v + 1.8, 0, 0.8, dark, true);
          glowBox(r, P.sCrown, u + 0.28, v + 0.9, 0.05, 0.9, 1.5, 1.4);
        }
        shelves(clearR + 0.3, hw - 0.4, 2);
        break;
      case 'pizza':
        counter(-2.5, 2.5, hex(0x8e3b2a));
        { const oc = L2W(r, hw - 1.4, D - 0.6); P.sBox.add(oc[0], r.yb + 1.0, oc[1], 2.2, 2.0, 2.2, hex(0x8a3b2b)); P.sCrown2.add(oc[0] - r.vx * 1.11, r.yb + 0.9, oc[1] - r.vz * 1.11, 0.8, 0.5, 0.8); }
        for (let v = 2; v < D - 4; v += 2.4) for (const u of [-hw + 1.5, clearL - 1.2]) {
          if (u < -hw + 1 || u > clearL - 0.6) continue;
          fbox(r, u - 0.6, v, u + 0.6, v + 0.9, 0.72, 0.8, hex(0xd8d2c4), true);
          fbox(r, u - 0.06, v + 0.39, u + 0.06, v + 0.51, 0, 0.72, dark);
        }
        break;
      case 'thrift':
        counter(-1.5, 1.5);
        for (let v = 2; v < D - 4; v += 2) {
          fbox(r, -hw + 0.8, v, clearL - 0.2, v + 0.06, 1.5, 1.56, hex(0xaaaaaa), true);
          for (let u = -hw + 1; u < clearL - 0.3; u += 0.35) fbox(r, u - 0.12, v - 0.25, u + 0.12, v + 0.3, 0.6, 1.45, R.pick(PRODUCT));
        }
        break;
      default: // corner store, pawn shop and every other shop
        counter(-hw + 1, Math.min(hw - 1, 2.5));
        shelves(-hw + 0.6, clearL - 0.2, 3);
        if (clearR + 1.6 < hw - 0.4) shelves(clearR + 0.2, hw - 0.5, 2);
        { const fc = L2W(r, -hw + 0.45, D - 3.2); P.sBox.add(fc[0], r.yb + 1.0, fc[1], Math.abs(r.ux) > 0.5 ? 0.8 : 1.6, 2.0, Math.abs(r.ux) > 0.5 ? 1.6 : 0.8, hex(0xd6eaf8)); }
    }
  };

  // A building block with facade texture. store: array of side names with a storefront.
  function building(x0, z0, x1, z1, h, style, tint, opt) {
    opt = opt || {};
    const ch = chunkAt((x0 + x1) / 2, (z0 + z1) / 2);
    const yb = opt.yb != null ? opt.yb : YB;
    const hasStore = opt.store && opt.store.length;
    const fStart = hasStore ? yb + 4.2 : yb;
    const uo = Math.floor(R() * 8) / 8, vo = Math.floor(R() * 8) / 8;
    // walk-in room behind the shop door (or the front door of a house)
    let room = null, door = null;
    if (opt.room) {
      const side = hasStore ? opt.store[0] : opt.front;
      const F = sideFrame(x0, z0, x1, z1, side);
      const span = hasStore ? storeDoor(F.L) : [F.L / 2 - 0.8, F.L / 2 + 0.8];
      room = planRoom(x0, z0, x1, z1, side, yb, hasStore ? yb + 3.7 : yb + 3.3, hasStore ? 'shop' : 'house', span);
      if (room) {
        door = { side, a: span[0], b: span[1], h: 2.55 };
        City.rooms.push(room);
        opt.roomSide = side;
      }
    }
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
      wallsUV(ch[style], x0, z0, x1, z1, fStart, h, yb, tint, uo, vo, hasStore ? null : door);
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
      sideWalls(ch.plain, x0, z0, x1, z1, yb, fStart, wc, door);
      // trim band between store level and facade
      ch.plain.box(x0 - 0.12, fStart - 0.35, z0 - 0.12, x1 + 0.12, fStart, z1 + 0.12, CB.shade(wc, 0.7), {});
      for (const s of opt.store) storefront(ch, x0, z0, x1, z1, s, yb, opt, room && s === opt.roomSide ? room : null);
    }
    const top = opt.tiers ? opt.tiers[opt.tiers.length - 1].top : h;
    if (room) {
      // solid everywhere except the room and the doorway
      for (const q of subtractAll({ x0, z0, x1, z1 }, [room, room.door])) addCollider(q.x0, q.z0, q.x1, q.z1, top, 'building');
      if (!hasStore) { room.front = opt.front; }
    } else addCollider(x0, z0, x1, z1, top, 'building');
    if (yb <= YB + 0.01) contactShadow(x0, z0, x1, z1, Math.min(3.2, 1.2 + top * 0.03), 0.42);
    return { x0, z0, x1, z1, h: top };
  }

  // Side geometry for one storefront: display glass + door; registers a storefront spot.
  function storefront(ch, x0, z0, x1, z1, side, yb, opt, room) {
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
    const [d1, d2] = storeDoor(L);
    const g1 = s0 + 0.5, g2 = d1 - 0.3;
    ch.plain.quad(pt(g1, yb + 0.6), pt(g2, yb + 0.6), pt(g2, yb + 3.1), pt(g1, yb + 3.1), [nx, 0, nz], glass);
    ch.plain.quad(pt(g1, yb + 0.6), pt(g2, yb + 0.6), pt(g2, yb + 0.75, 0.02), pt(g1, yb + 0.75, 0.02), [nx, 0, nz], [0.5, 0.5, 0.5]);
    if (!room) ch.plain.quad(pt(d1, yb), pt(d2, yb), pt(d2, yb + 2.5), pt(d1, yb + 2.5), [nx, 0, nz], [0.24, 0.17, 0.12]);
    else {
      // open doorway with a frame
      const fr = [0.2, 0.15, 0.1];
      sbox(ch.plain, ax + ux * (d1 - 0.12) + nx * 0.02, yb, az + uz * (d1 - 0.12) + nz * 0.02, ax + ux * d1 + nx * 0.14, yb + 2.65, az + uz * d1 + nz * 0.14, fr);
      sbox(ch.plain, ax + ux * d2 + nx * 0.02, yb, az + uz * d2 + nz * 0.02, ax + ux * (d2 + 0.12) + nx * 0.14, yb + 2.65, az + uz * (d2 + 0.12) + nz * 0.14, fr);
      sbox(ch.plain, ax + ux * (d1 - 0.12) + nx * 0.02, yb + 2.55, az + uz * (d1 - 0.12) + nz * 0.02, ax + ux * (d2 + 0.12) + nx * 0.14, yb + 2.75, az + uz * (d2 + 0.12) + nz * 0.14, fr);
    }
    const mid = s0 + w / 2;
    const door = (d1 + d2) / 2;
    City.storefronts.push({
      x: ax + ux * door + nx * 1.6, z: az + uz * door + nz * 1.6, // spot on sidewalk in front of the door
      cx: ax + ux * mid, cz: az + uz * mid, ux, uz, nx, nz, w, yb,
      sx: ax + ux * mid + nx * 0.12, sz: az + uz * mid + nz * 0.12,
      winX: ax + ux * ((g1 + g2) / 2) + nx * 1.4, winZ: az + uz * ((g1 + g2) / 2) + nz * 1.4,
      downtown: !!opt.downtown, district: opt.district || 'res', used: false, room,
    });
    if (room) room.sf = City.storefronts[City.storefronts.length - 1];
  }

  // ------------------------------------------------------------------ small props
  function tree(x, z, s, kind) {
    s = s || R.range(0.85, 1.25);
    if (kind === 'pine') {
      const g = R.pick([hex(0x2f6b3a), hex(0x3b7a44), hex(0x285c33)]);
      P.sCyl.add(x, YB + 1, z, 0.3 * s, 2, 0.3 * s, hex(0x5b3d26));
      P.sCone.add(x, YB + 3.2 * s, z, 3.4 * s, 3.6 * s, 3.4 * s, g);
      P.sCone.add(x, YB + 5.2 * s, z, 2.5 * s, 3.0 * s, 2.5 * s, CB.shade(g, 1.1));
      P.sCone.add(x, YB + 6.9 * s, z, 1.5 * s, 2.4 * s, 1.5 * s, CB.shade(g, 1.2));
      addCollider(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 4, 'tree');
      return;
    }
    const g = R.pick([PAL.grass, PAL.grass2, hex(0x4f8a3c), hex(0x76b04e)]);
    P.sCyl.add(x, YB + 1.3 * s, z, 0.32 * s, 2.6 * s, 0.32 * s, hex(0x6b4a2f));
    P.sSph.add(x, YB + 3.4 * s, z, 3.2 * s, 2.8 * s, 3.2 * s, g);
    P.sSph.add(x + 0.5 * s, YB + 4.4 * s, z - 0.3 * s, 2.2 * s, 2.0 * s, 2.2 * s, CB.shade(g, 1.12));
    P.sSph.add(x - 0.7 * s, YB + 3.9 * s, z + 0.6 * s, 2.0 * s, 1.7 * s, 2.0 * s, CB.shade(g, 0.9));
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
    P.sLampPool.add(hx, YB + 0.03, hz, 16, 1, 16);
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
  // Rectangle minus rectangle -> up to four rectangles.
  function rectMinus(r, h) {
    if (h.x0 >= r.x1 || h.x1 <= r.x0 || h.z0 >= r.z1 || h.z1 <= r.z0) return [r];
    const out = [];
    if (h.x0 > r.x0) out.push({ x0: r.x0, z0: r.z0, x1: h.x0, z1: r.z1 });
    if (h.x1 < r.x1) out.push({ x0: h.x1, z0: r.z0, x1: r.x1, z1: r.z1 });
    const mx0 = Math.max(r.x0, h.x0), mx1 = Math.min(r.x1, h.x1);
    if (h.z0 > r.z0) out.push({ x0: mx0, z0: r.z0, x1: mx1, z1: h.z0 });
    if (h.z1 < r.z1) out.push({ x0: mx0, z0: h.z1, x1: mx1, z1: r.z1 });
    return out;
  }
  // Parts of a rectangle that are not river.
  function landPieces(r) {
    let out = [{ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }];
    for (const rv of City.rivers) { const nx = []; for (const q of out) nx.push(...rectMinus(q, rv)); out = nx; }
    return out.filter((q) => q.x1 - q.x0 > 0.3 && q.z1 - q.z0 > 0.3);
  }
  City.landPieces = landPieces;

  // Railing with posts + collider (axis-aligned).
  function rail(x0, z0, x1, z1, y) {
    y = y == null ? YB : y;
    const ch = chunkAt((x0 + x1) / 2, (z0 + z1) / 2).plain;
    ch.box(x0, y + 0.95, z0, x1, y + 1.08, z1, hex(0x7f8c8d), {});
    const len = Math.max(x1 - x0, z1 - z0), n = Math.floor(len / 2.5);
    for (let k = 0; k <= n; k++) {
      const t = k / Math.max(1, n);
      P.sBox.add(x0 + (x1 - x0) * t, y + 0.5, z0 + (z1 - z0) * t, 0.08, 1.0, 0.08, hex(0x7f8c8d));
    }
    addCollider(x0, z0, x1, z1, y + 1.1, 'rail');
  }

  function groundBase() {
    // asphalt everywhere except the river channels
    for (const q of landPieces({ x0: -C.OUT - 1600, z0: -C.OUT - 1600, x1: C.SHORE, z1: C.OUT + 1600 })) G.flat(q.x0, q.z0, q.x1, q.z1, 0, PAL.asphalt);
    // outer sidewalks along the city edge (down to the river bed so they also form channel walls)
    const o = C.EDGE, far = C.OUT + 45;
    G.box(-far, BED, -far, -o, YB, far, PAL.sidewalk, { bottom: true });
    G.box(-o, BED, o, o, YB, far, PAL.sidewalk, { bottom: true });
    G.box(-o, BED, -far, o, YB, -o, PAL.sidewalk, { bottom: true });
    // lake-side strip (grass/path/sand), with gaps for the pier street and the river mouth
    const rm = City.rivers[0];
    for (const [z0, z1] of [[-far, -7], [7, rm.z0], [rm.z1, far]]) {
      G.box(o, BED, z0, C.SHORE, YB, z1, PAL.grass, { bottom: true });
      G.flat(o + 17, z0, o + 22, z1, YB + 0.01, PAL.path);
      G.flat(o + 24, z0, C.SHORE, z1, YB + 0.01, PAL.sand);
    }
    // seawall (the lake sits low like the river)
    G.quad([C.SHORE, BED, -1200], [C.SHORE, BED, 1200], [C.SHORE, YB, 1200], [C.SHORE, YB, -1200], [1, 0, 0], hex(0x8d8a82));
    // pier deck
    const PR = C.PIER, F = C.FERRIS;
    G.box(PR.x0, -1, PR.z0, PR.x1, YB, PR.z1, PAL.deck, {});
    G.box(F.x0, -1, PR.z1, F.x1, YB, F.z1, PAL.deck, {});
    for (let x = PR.x0 + 6; x < PR.x1; x += 12) {
      P.sCyl.add(x, (WATER_Y - 1) / 2, PR.z0 + 0.5, 0.6, -WATER_Y, 0.6, hex(0x4a3a2a));
      P.sCyl.add(x, (WATER_Y - 1) / 2, PR.z1 - 0.5, 0.6, -WATER_Y, 0.6, hex(0x4a3a2a));
    }
    // markings on the pier road
    for (let x = C.EDGE - 3; x < PR.x1 - 4; x += 6) G.flat(x, -0.12, x + 3, 0.12, (x < C.SHORE ? 0 : YB) + 0.012, PAL.yellow);
    // railings along the shore, the river mouth and the pier
    rail(C.SHORE - 0.25, -C.OUT, C.SHORE - 0.05, -7);
    rail(C.SHORE - 0.25, 7, C.SHORE - 0.05, rm.z0);
    rail(C.SHORE - 0.25, rm.z1, C.SHORE - 0.05, C.OUT);
    rail(C.EDGE + 0.6, rm.z0 - 0.25, C.SHORE, rm.z0 - 0.05);
    rail(C.EDGE + 0.6, rm.z1 + 0.05, C.SHORE, rm.z1 + 0.25);
    rail(C.SHORE, PR.z0 - 0.1, PR.x1, PR.z0 + 0.1);
    rail(C.SHORE, PR.z1 - 0.1, F.x0, PR.z1 + 0.1);
    rail(F.x1, PR.z1 - 0.1, PR.x1, PR.z1 + 0.1);
    rail(F.x0 - 0.1, PR.z1, F.x0 + 0.1, F.z1);
    rail(F.x1 - 0.1, PR.z1, F.x1 + 0.1, F.z1);
    rail(F.x0, F.z1 - 0.1, F.x1, F.z1 + 0.1);
    rail(PR.x1 - 0.1, PR.z0, PR.x1 + 0.1, PR.z1);
    // block the street ends on the lake strip edges (north/south)
    addCollider(C.EDGE, C.OUT, far, C.OUT + 4, 20, 'wall');
    addCollider(C.EDGE, -C.OUT - 4, far, -C.OUT, 20, 'wall');
  }

  // ------------------------------------------------------------------ river
  // Road bridges over the river (deck, steel side girders, abutments).
  function bridge(axis, c, a0, a1, k) {
    const hw = C.ROAD / 2 + 0.6;
    const steel = k % 2 ? hex(0x8e2b22) : hex(0x2f5d4a);
    const g = chunkAt(axis === 'z' ? c : (a0 + a1) / 2, axis === 'z' ? (a0 + a1) / 2 : c).plain;
    const A0 = a0 - 1, A1 = a1 + 1;
    if (axis === 'z') {
      G.box(c - hw, -1.1, A0, c + hw, 0, A1, PAL.asphalt, {});
      for (const sx of [-1, 1]) {
        const x = c + sx * hw;
        g.box(x - 0.3, 0, A0, x + 0.3, 0.35, A1, steel, {});
        g.box(x - 0.15, 1.25, A0, x + 0.15, 1.45, A1, steel, {});
        for (let z = A0 + 1; z < A1; z += 2.6) P.sBox.add(x, 0.8, z, 0.14, 1.0, 0.14, steel);
        for (let z = A0 + 2; z < A1 - 2; z += 5.2) P.sBox.add(x, 0.75, z + 1.3, 0.12, 1.6, 0.12, steel, 0, 0.9, 0);
        addCollider(x - 0.3, A0, x + 0.3, A1, 1.45, 'rail');
        P.sCyl.add(x, 2.6, A0 + 0.5, 0.2, 5.2, 0.2, steel);
        P.sCyl.add(x, 2.6, A1 - 0.5, 0.2, 5.2, 0.2, steel);
        P.sLamp.add(x, 5.3, A0 + 0.5, 0.45, 0.35, 0.45); P.sLamp.add(x, 5.3, A1 - 0.5, 0.45, 0.35, 0.45);
      }
      g.quad([c - hw, BED, a0], [c + hw, BED, a0], [c + hw, -1.1, a0], [c - hw, -1.1, a0], [0, 0, 1], hex(0x7d7a72));
      g.quad([c - hw, BED, a1], [c + hw, BED, a1], [c + hw, -1.1, a1], [c - hw, -1.1, a1], [0, 0, -1], hex(0x7d7a72));
    } else {
      G.box(A0, -1.1, c - hw, A1, 0, c + hw, PAL.asphalt, {});
      for (const sz of [-1, 1]) {
        const z = c + sz * hw;
        g.box(A0, 0, z - 0.3, A1, 0.35, z + 0.3, steel, {});
        g.box(A0, 1.25, z - 0.15, A1, 1.45, z + 0.15, steel, {});
        for (let x = A0 + 1; x < A1; x += 2.6) P.sBox.add(x, 0.8, z, 0.14, 1.0, 0.14, steel);
        for (let x = A0 + 2; x < A1 - 2; x += 5.2) P.sBox.add(x + 1.3, 0.75, z, 0.12, 1.6, 0.12, steel, 0, 0, 0.9);
        addCollider(A0, z - 0.3, A1, z + 0.3, 1.45, 'rail');
        P.sCyl.add(A0 + 0.5, 2.6, z, 0.2, 5.2, 0.2, steel); P.sCyl.add(A1 - 0.5, 2.6, z, 0.2, 5.2, 0.2, steel);
        P.sLamp.add(A0 + 0.5, 5.3, z, 0.45, 0.35, 0.45); P.sLamp.add(A1 - 0.5, 5.3, z, 0.45, 0.35, 0.45);
      }
      g.quad([a0, BED, c - hw], [a0, BED, c + hw], [a0, -1.1, c + hw], [a0, -1.1, c - hw], [1, 0, 0], hex(0x7d7a72));
      g.quad([a1, BED, c - hw], [a1, BED, c + hw], [a1, -1.1, c + hw], [a1, -1.1, c - hw], [-1, 0, 0], hex(0x7d7a72));
    }
  }
  function riverBridges() {
    let k = 0;
    const r1 = City.rivers[0], r2 = City.rivers[1];
    for (let i = 0; i <= C.N; i++) { const x = CB.road(i); if (x - 7 > r1.x0 && x < r1.x1) bridge('z', x, r1.z0, r1.z1, k++); }
    for (let j = 0; j <= C.N; j++) { const z = CB.road(j); if (z + 7 >= r2.z0 && z - 7 < r1.z0) bridge('x', z, r2.x0, r2.x1, k++); }
    // the river ends at the outer sidewalk in the south: close the channel
    G.quad([r2.x0, BED, r2.z0], [r2.x1, BED, r2.z0], [r2.x1, 0, r2.z0], [r2.x0, 0, r2.z0], [0, 0, 1], hex(0x8d8a82));
  }

  // A block cut by the river: concrete banks with a riverwalk and slim towers.
  function genRiverBlock(b) {
    const near = b.bi >= 5 && b.bi <= 11;
    for (const pc of landPieces(b)) {
      G.box(pc.x0, BED, pc.z0, pc.x1, YB, pc.z1, PAL.sidewalk, { bottom: true });
      // find edges that face the water
      const edges = [
        { n: [0, -1], a: [pc.x0, pc.z0], b: [pc.x1, pc.z0] }, { n: [0, 1], a: [pc.x0, pc.z1], b: [pc.x1, pc.z1] },
        { n: [-1, 0], a: [pc.x0, pc.z0], b: [pc.x0, pc.z1] }, { n: [1, 0], a: [pc.x1, pc.z0], b: [pc.x1, pc.z1] },
      ];
      let main = null;
      for (const e of edges) {
        const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
        const ux = (e.b[0] - e.a[0]) / L, uz = (e.b[1] - e.a[1]) / L;
        // runs of water along this edge
        let s0 = -1;
        const runs = [];
        for (let t = 0; t <= L + 0.01; t += 1) {
          const tt = Math.min(t, L);
          const wet = City.inRiver(e.a[0] + ux * tt + e.n[0] * 1.2, e.a[1] + uz * tt + e.n[1] * 1.2);
          if (wet && s0 < 0) s0 = tt;
          if ((!wet || tt >= L) && s0 >= 0) { runs.push([s0, wet ? tt : tt - 1]); s0 = -1; }
        }
        for (const [t0, t1] of runs) {
          if (t1 - t0 < 2) continue;
          const p = (t, ins) => [e.a[0] + ux * t - e.n[0] * ins, e.a[1] + uz * t - e.n[1] * ins];
          const q0 = p(t0, 0.15), q1 = p(t1, 0.35);
          rail(Math.min(q0[0], q1[0]), Math.min(q0[1], q1[1]), Math.max(q0[0], q1[0]), Math.max(q0[1], q1[1]));
          const w0 = p(t0, 0.5), w1 = p(t1, 4.5);
          G.flat(Math.min(w0[0], w1[0]), Math.min(w0[1], w1[1]), Math.max(w0[0], w1[0]), Math.max(w0[1], w1[1]), YB + 0.008, PAL.path);
          for (let t = t0 + 6; t < t1 - 4; t += 18) { const l = p(t, 4.2); lamp(l[0], l[1], e.n[0], e.n[1]); }
          for (let t = t0 + 12; t < t1 - 4; t += 18) { const l = p(t, 1.4); bench(l[0], l[1], Math.atan2(e.n[0], e.n[1])); }
          if (t1 - t0 > L * 0.8) main = { e, ux, uz, L, p };
        }
      }
      if (!main) {
        for (let k = 0; k < 4; k++) tree(R.range(pc.x0 + 2, pc.x1 - 2), R.range(pc.z0 + 2, pc.z1 - 2));
        continue;
      }
      // building strip between the riverwalk and the street sidewalk
      const depth = Math.abs(main.e.n[0]) ? pc.x1 - pc.x0 : pc.z1 - pc.z0;
      const d0 = 5.5, d1 = depth - C.SIDE;
      if (d1 - d0 < 7) continue;
      if (b.bi === 8 && main.e.n[1] < 0) { corncobs(main, d0, d1); continue; }
      const streetSide = main.e.n[1] > 0 ? 's' : main.e.n[1] < 0 ? 'n' : main.e.n[0] > 0 ? 'w' : 'e';
      let t = 2;
      while (t < main.L - 6) {
        let w = R.range(14, 22);
        if (main.L - 2 - (t + w) < 8) w = main.L - 2 - t;
        const a = main.p(t, d0), c = main.p(t + w, d1);
        const x0 = Math.min(a[0], c[0]), x1 = Math.max(a[0], c[0]), z0 = Math.min(a[1], c[1]), z1 = Math.max(a[1], c[1]);
        const floors = near ? R.int(8, 30) : R.int(3, 9);
        const style = near ? R.pick(['glass', 'glass', 'stone', 'office']) : R.pick(['brick', 'office', 'stone']);
        const tint = R.pick(PAL[style]);
        const H = YB + 4.2 + floors * 3.5;
        building(x0, z0, x1, z1, H, style, tint, { store: [streetSide], district: near ? 'downtown' : 'res', downtown: near, room: R() < 0.5 });
        crown(x0, z0, x1, z1, H, style, tint);
        t += w + 1.5;
      }
    }
  }

  // Twin round "corncob" towers with scalloped balconies.
  function corncobs(main, d0, d1) {
    const r = Math.min(7, (d1 - d0) / 2), mid = (d0 + d1) / 2;
    for (const t of [main.L * 0.32, main.L * 0.68]) {
      const c = main.p(t, mid);
      const H = 96;
      P.sCyl.add(c[0], YB + H / 2, c[1], r * 1.4, H, r * 1.4, hex(0x3a3f47));
      for (let y = YB + 3; y < YB + H; y += 2.9) P.sCyl.add(c[0], y, c[1], r * 2, 0.32, r * 2, y < 22 ? hex(0x9ba3ab) : hex(0xe9e6df));
      P.sCyl.add(c[0], YB + H + 0.6, c[1], r * 2.05, 1.2, r * 2.05, hex(0xe9e6df));
      P.sCrown2.add(c[0], YB + H + 1.4, c[1], r * 1.6, 0.35, r * 1.6);
      addCollider(c[0] - r, c[1] - r, c[0] + r, c[1] + r, YB + H + 1, 'building');
      contactShadow(c[0] - r, c[1] - r, c[0] + r, c[1] + r, 3, 0.4);
    }
  }

  // Roof-top details for tall towers: crown lights, stepped tops, spires.
  function crown(x0, z0, x1, z1, H, style, tint, inset) {
    if (H < 40) { if (R() < 0.5) acUnit((x0 + x1) / 2, (z0 + z1) / 2, H); return; }
    const i = inset || 0, a = x0 + i, b = z0 + i, c = x1 - i, d = z1 - i;
    const cx = (a + c) / 2, cz = (b + d) / 2, w = c - a, dd = d - b;
    const ch = chunkAt(cx, cz).plain;
    if (style === 'stone' && R() < 0.75) {
      // stepped art-deco top + spire
      let y = H, k = 0.82;
      for (let s = 0; s < 3; s++) {
        const hw = w * k / 2, hd = dd * k / 2, h = R.range(3, 6);
        ch.box(cx - hw, y, cz - hd, cx + hw, y + h, cz + hd, CB.shade(tint, 0.92 - s * 0.05), { bottom: true });
        y += h; k *= 0.7;
      }
      P.sCone.add(cx, y + 4, cz, Math.min(w, dd) * 0.3, 8, Math.min(w, dd) * 0.3, CB.shade(tint, 0.8));
      if (R() < 0.6) P.sCrown2.add(cx, H + 0.4, cz, w * 0.84, 0.4, dd * 0.84);
      return;
    }
    // light band around the roof edge
    const pool = R() < 0.6 ? P.sCrown : P.sCrown2;
    if (R() < 0.7) {
      pool.add(cx, H + 0.5, b + 0.1, w, 0.5, 0.25); pool.add(cx, H + 0.5, d - 0.1, w, 0.5, 0.25);
      pool.add(a + 0.1, H + 0.5, cz, 0.25, 0.5, dd); pool.add(c - 0.1, H + 0.5, cz, 0.25, 0.5, dd);
    }
    // mechanical penthouse
    ch.box(cx - w * 0.3, H, cz - dd * 0.3, cx + w * 0.3, H + R.range(3, 6), cz + dd * 0.3, CB.shade(tint, 0.7), { bottom: true });
    if (H > 90 && R() < 0.7) {
      P.sCyl.add(cx, H + 15, cz, 0.45, 26, 0.45, hex(0xbdc3c7));
      P.sBlink.add(cx, H + 28.3, cz, 0.8, 0.8, 0.8);
    }
  }

  // Soft dark strips on the ground around a footprint (contact shadow).
  function contactShadow(x0, z0, x1, z1, w, a) {
    const y = YB + 0.02, D = [0, 0, 0, a], T = [0, 0, 0, 0];
    const A = City.aoGeo;
    A.quad([x0 - w, y, z0 - w], [x1 + w, y, z0 - w], [x1, y, z0], [x0, y, z0], [0, 1, 0], null, null, [T, T, D, D]);
    A.quad([x0, y, z1], [x1, y, z1], [x1 + w, y, z1 + w], [x0 - w, y, z1 + w], [0, 1, 0], null, null, [D, D, T, T]);
    A.quad([x0 - w, y, z0 - w], [x0, y, z0], [x0, y, z1], [x0 - w, y, z1 + w], [0, 1, 0], null, null, [T, D, D, T]);
    A.quad([x1, y, z0], [x1 + w, y, z0 - w], [x1 + w, y, z1 + w], [x1, y, z1], [0, 1, 0], null, null, [D, T, T, D]);
  }

  // Soft dark blob on the ground (oil stains, wear) drawn with the contact-shadow mesh.
  function softRect(x0, z0, x1, z1, w, a, y) {
    const D = [0, 0, 0, a], T = [0, 0, 0, 0], A = City.aoGeo;
    A.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], null, null, [D, D, D, D]);
    A.quad([x0 - w, y, z0 - w], [x1 + w, y, z0 - w], [x1, y, z0], [x0, y, z0], [0, 1, 0], null, null, [T, T, D, D]);
    A.quad([x0, y, z1], [x1, y, z1], [x1 + w, y, z1 + w], [x0 - w, y, z1 + w], [0, 1, 0], null, null, [D, D, T, T]);
    A.quad([x0 - w, y, z0 - w], [x0, y, z0], [x0, y, z1], [x0 - w, y, z1 + w], [0, 1, 0], null, null, [T, D, D, T]);
    A.quad([x1, y, z0], [x1 + w, y, z0 - w], [x1 + w, y, z1 + w], [x1, y, z1], [0, 1, 0], null, null, [D, T, T, D]);
  }

  // Worn streets: manhole covers, asphalt patches, cracks and oil stains in the parking lanes.
  // (Own random stream so the rest of the city layout doesn't change.)
  function roadDetails() {
    const DR = CB.rng(5150), N = C.N;
    const crackCol = CB.shade(PAL.asphalt, 0.62);
    for (let i = 0; i <= N; i++) {
      const rc = CB.road(i);
      for (let j = 0; j < N; j++) {
        const a = CB.road(j) + 8, b = CB.road(j + 1) - 8;
        for (const ax of [0, 1]) {
          // ax 0: N-S road at x = rc; ax 1: E-W road at z = rc. P(u along, v across) -> world
          const W = (u, v) => ax ? [u, rc + v] : [rc + v, u];
          const mid = W((a + b) / 2, 0);
          if (City.inRiver(mid[0], mid[1]) || City.inRiver(...W(a, 0)) || City.inRiver(...W(b, 0))) continue;
          const rect = (u0, v0, u1, v1, y, col) => { const p = W(u0, v0), q = W(u1, v1); G.flat(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1]), y, col); };
          // manholes in the driving lanes
          for (let k = DR.int(0, 2); k > 0; k--) {
            const p = W(DR.range(a + 4, b - 4), DR.pick([-3.2, -1.6, 1.6, 3.2]));
            P.sCyl.add(p[0], 0.012, p[1], 0.95, 0.02, 0.95, hex(0x2a2b2e));
            P.sCyl.add(p[0], 0.02, p[1], 0.72, 0.02, 0.72, hex(0x393a3d));
          }
          // patched asphalt
          for (let k = DR.int(0, 3); k > 0; k--) {
            const u = DR.range(a, b - 6), v = DR.range(-6.2, 4);
            rect(u, v, u + DR.range(1.5, 6), v + DR.range(0.8, 2.6), 0.004, CB.shade(PAL.asphalt, DR.chance(0.6) ? DR.range(0.8, 0.9) : DR.range(1.08, 1.16)));
          }
          // hairline cracks
          for (let k = DR.int(1, 4); k > 0; k--) {
            let u = DR.range(a, b), v = DR.range(-6.3, 6.3);
            for (let n = DR.int(3, 6); n > 0; n--) {
              const u2 = u + DR.range(-1.2, 1.2), v2 = M.clamp(v + DR.range(-0.9, 0.9), -6.6, 6.6);
              const p = W(u, v), q = W(u2, v2), dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1;
              const ox = -dz / l * 0.035, oz = dx / l * 0.035;
              G.quad([p[0] - ox, 0.006, p[1] - oz], [q[0] - ox, 0.006, q[1] - oz], [q[0] + ox, 0.006, q[1] + oz], [p[0] + ox, 0.006, p[1] + oz], [0, 1, 0], crackCol);
              u = u2; v = v2;
            }
          }
          // oil stains where cars park
          for (let k = DR.int(1, 4); k > 0; k--) {
            const u = DR.range(a + 2, b - 2), v = DR.pick([-5.6, 5.6]) + DR.range(-0.4, 0.4);
            const p = W(u, v), r1 = DR.range(0.25, 0.6), r2 = DR.range(0.3, 0.9);
            softRect(p[0] - (ax ? r2 : r1), p[1] - (ax ? r1 : r2), p[0] + (ax ? r2 : r1), p[1] + (ax ? r1 : r2), DR.range(0.3, 0.7), DR.range(0.18, 0.34), 0.008);
          }
        }
      }
    }
  }

  // Steel fire escape on one side of a building: a landing on every floor from y0 up,
  // zig-zag stairs between them and a drop ladder at the bottom.
  let escapes = 0;
  function fireEscape(x0, z0, x1, z1, side, y0, top, DR) {
    const alongX = side === 's' || side === 'n';
    const L = alongX ? x1 - x0 : z1 - z0;
    if (L < 6.5 || top - y0 < 4.5 || escapes >= 420) return;
    escapes++;
    (City.escapes || (City.escapes = [])).push({ x: side === 'e' ? x1 : side === 'w' ? x0 : (x0 + x1) / 2, z: side === 'n' ? z1 : side === 's' ? z0 : (z0 + z1) / 2, side, top });
    const W = Math.min(L - 2.5, 5.2), D = 1.15;
    const nx = side === 'e' ? 1 : side === 'w' ? -1 : 0, nz = side === 'n' ? 1 : side === 's' ? -1 : 0;
    const wx = side === 'e' ? x1 : x0, wz = side === 'n' ? z1 : z0;
    const c = (alongX ? (x0 + x1) / 2 : (z0 + z1) / 2) + DR.range(-1, 1) * Math.max(0, L - W - 2) / 2;
    const col = DR.pick([hex(0x24282b), hex(0x33261f), hex(0x1f2b26)]);
    const box = (u, out, y, su, sy, so, roll) => {
      const px = alongX ? c + u : wx + nx * out, pz = alongX ? wz + nz * out : c + u;
      P.sBox.add(px, y, pz, su, sy, so, col, alongX ? 0 : Math.PI / 2, 0, roll || 0);
    };
    let k = 0;
    for (let y = y0; y < top - 1.2; y += 3.5, k++) {
      box(0, D / 2, y, W, 0.07, D);
      box(0, D - 0.03, y + 1.0, W, 0.05, 0.05);
      box(-W / 2 + 0.03, D / 2, y + 1.0, 0.05, 0.05, D); box(W / 2 - 0.03, D / 2, y + 1.0, 0.05, 0.05, D);
      for (const u of [-W / 2 + 0.03, 0, W / 2 - 0.03]) box(u, D - 0.03, y + 0.5, 0.05, 1.0, 0.05);
      if (y + 3.5 < top - 1.2) {
        const run = W * 0.62, len = Math.hypot(run, 3.5), a = Math.atan2(3.5, run) * (k % 2 ? -1 : 1);
        box(0, D * 0.42, y + 1.75, len, 0.07, 0.6, a);
        box(0, D * 0.75, y + 2.6, len, 0.05, 0.05, a);
      }
    }
    // drop ladder
    const lu = W / 2 - 0.6;
    box(lu - 0.22, D - 0.2, y0 - 1.3, 0.05, 2.6, 0.05); box(lu + 0.22, D - 0.2, y0 - 1.3, 0.05, 2.6, 0.05);
    for (let r = 0.4; r < 2.6; r += 0.55) box(lu, D - 0.2, y0 - r, 0.44, 0.04, 0.04);
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
        // white edge lines between the driving lanes and the parking lanes
        for (const o of [-4.4, 4.3]) { G.flat(rc + o, a, rc + o + 0.1, b, h, PAL.white); G.flat(a, rc + o, b, rc + o + 0.1, h, PAL.white); }
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
      downtown: hex(0xbcb6aa), skydeck: hex(0xbcb6aa), midtown: hex(0xb7b1a5), bigjohn: hex(0xa9a49a), ballpark: hex(0x3f8f3a), apartments: hex(0x6a9a4e), shops: PAL.lot }[b.type];
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
      const wet = (t) => City.inRiver(s.ax + ux * t - s.nx * 1.5, s.az + uz * t - s.nz * 1.5) || City.inRiver(s.ax + ux * t, s.az + uz * t);
      const blocked = (t) => wet(t) || wet(t - 2) || wet(t + 2) || (alleyX != null && s.nz !== 0 && Math.abs(s.ax + ux * t - alleyX) < 5);
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
      if (R() < 0.55 && !blocked(8.5)) breakable('hydrant', c1.x, c1.z, 0);
      const c2 = at(10.5, 0.75);
      if (R() < 0.5 && !blocked(10.5)) breakable('trash', c2.x, c2.z, 0);
      const c3 = at(52, 0.7);
      if (R() < 0.3 && !blocked(52)) breakable(R() < 0.5 ? 'newsbox' : 'mailbox', c3.x, c3.z, Math.atan2(-s.nx, -s.nz) + Math.PI);
      if (R() < 0.08 && !blocked(30)) { const c4 = at(30, 0.9); breakable('phone', c4.x, c4.z, Math.atan2(s.nx, s.nz)); }
    }
  }

  function genApartments(b) {
    const cx = (b.x0 + b.x1) / 2, ax0 = cx - 3, ax1 = cx + 3;
    const FE = CB.rng(b.bi * 131 + b.bj * 7 + 99); // fire escapes (separate stream: layout unchanged)
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
        const enter = (store.length > 0 && R() < 0.6) || (!store.length && R() < 0.3);
        building(bx0, bz0, bx1, bz1, h + (store.length ? 4.2 - 3.5 : 0), style, R.pick(style === 'brick' ? PAL.brick : PAL.stone), { store, district: 'res', room: enter, front: half === 'w' ? 'w' : 'e' });
        const rx = (bx0 + bx1) / 2, rz = (bz0 + bz1) / 2;
        const top = h + (store.length ? 0.7 : 0);
        if (style === 'brick' && floors >= 3) {
          const fy = YB + (store.length ? 7 : 3.5);
          if ((first || last) && FE() < 0.65) fireEscape(bx0, bz0, bx1, bz1, first ? 's' : 'n', fy, top, FE);
          else if (FE() < 0.4) fireEscape(bx0, bz0, bx1, bz1, half === 'w' ? 'e' : 'w', fy, top, FE);
        }
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
      if (z + 17 < b.iz1) for (const dx of [-0.65, 0.65]) P.sBox.add(ax0 + 0.35 + dx, YB + 8.15, z + 8.5, 0.04, 0.04, 17, hex(0x1b1b1b));
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
        const enter = R() < 0.55;
        if (alongX) building(x0 + a0, z0, x0 + a1, z1, h, style, tint, { store, district: 'shops', room: enter });
        else building(x0, z0 + a0, x1, z0 + a1, h, style, tint, { store, district: 'shops', room: enter });
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

  function genDowntown(b, mid) {
    const lots = [];
    const r = R();
    const X0 = b.ix0, X1 = b.ix1, Z0 = b.iz0, Z1 = b.iz1, mx = (X0 + X1) / 2, mz = (Z0 + Z1) / 2;
    if (r < 0.25) lots.push([X0, Z0, X1, Z1]);
    else if (r < 0.55) {
      if (R() < 0.5) { lots.push([X0, Z0, mx - 0.5, Z1], [mx + 0.5, Z0, X1, Z1]); }
      else { lots.push([X0, Z0, X1, mz - 0.5], [X0, mz + 0.5, X1, Z1]); }
    } else lots.push([X0, Z0, mx - 0.5, mz - 0.5], [mx + 0.5, Z0, X1, mz - 0.5], [X0, mz + 0.5, mx - 0.5, Z1], [mx + 0.5, mz + 0.5, X1, Z1]);
    const centre = 1 - Math.min(1, Math.hypot((X0 + X1) / 2, (Z0 + Z1) / 2) / 220);
    let plazaDone = false;
    for (const L of lots) {
      const [x0, z0, x1, z1] = L;
      const sides = [];
      if (Math.abs(x0 - X0) < 0.1) sides.push('w');
      if (Math.abs(x1 - X1) < 0.1) sides.push('e');
      if (Math.abs(z0 - Z0) < 0.1) sides.push('s');
      if (Math.abs(z1 - Z1) < 0.1) sides.push('n');
      if (lots.length > 1 && !plazaDone && R() < (mid ? 0.22 : 0.3)) { plaza(x0, z0, x1, z1); plazaDone = true; continue; }
      const m = R.range(0.5, 2.5);
      const style = mid ? R.pick(['glass', 'stone', 'office', 'office', 'brick']) : R.pick(['glass', 'glass', 'stone', 'office', 'stone']);
      const tint = R.pick(PAL[style]);
      const floors = mid ? R.int(5, 16) : Math.round(R.range(10, 22 + 26 * centre) * (lots.length === 4 ? 0.85 : 1));
      const H = YB + 4.2 + floors * 3.5;
      const store = sides.filter(() => R() < 0.75);
      const opt = { store, downtown: true, district: 'downtown', room: store.length > 0 && R() < 0.6 };
      const bx0 = x0 + m, bz0 = z0 + m, bx1 = x1 - m, bz1 = z1 - m;
      if (H > 60 && R() < 0.65) {
        const t1 = YB + 4.2 + Math.round(floors * 0.55) * 3.5, t2 = YB + 4.2 + Math.round(floors * 0.82) * 3.5;
        const w = Math.min(bx1 - bx0, bz1 - bz0);
        opt.tiers = [{ inset: 0, top: t1 }, { inset: w * 0.12, top: t2 }, { inset: w * 0.24, top: H }];
      }
      building(bx0, bz0, bx1, bz1, H, style, tint, opt);
      crown(bx0, bz0, bx1, bz1, H, style, tint, opt.tiers ? opt.tiers[opt.tiers.length - 1].inset : 0);
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
    P.sCrown2.add(cx, 232.5, cz, 12, 0.5, 12);
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
      tree(x, z, null, R() < 0.3 ? 'pine' : null); n++;
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
    const O = C.OUT, E = C.EDGE;
    const band = (axis, sign) => {
      let t = -O - 24;
      while (t < O + 24) {
        const w = R.range(14, 30);
        const h = YB + R.range(3, 12) * 3.5;
        const style = R.pick(['brick', 'brick', 'office', 'stone']);
        const tint = R.pick(style === 'brick' ? PAL.brick : style === 'office' ? PAL.office : PAL.stone);
        const d = R.range(18, 30);
        if (axis === 'x') { // west band along z
          building(-O - d, t, -O, Math.min(t + w, O + 40), h, style, tint, {});
          if (h > 30) crown(-O - d, t, -O, Math.min(t + w, O + 40), h, style, tint);
        } else {
          const z0 = sign > 0 ? O : -O - d, z1 = sign > 0 ? O + d : -O;
          const x1 = Math.min(t + w, E);
          if (x1 - t > 2) building(t, z0, x1, z1, h, style, tint, {});
        }
        t += w;
      }
    };
    band('x', -1); band('z', 1); band('z', -1);
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
            if (City.inRiver(px, z + 3) || City.inRiver(px, z - 1) || City.inRiver(px, z + 7)) continue;
            City.parking.push({ x: px, z: z + 3, yaw, curb: true });
            if (R() < 0.5) breakable('meter', x + side * 7.5, z + 3.2, side > 0 ? -Math.PI / 2 : Math.PI / 2);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ lake front
  function lakefront() {
    const E = C.EDGE, rm = City.rivers[0];
    const wet = (z) => z > rm.z0 - 3 && z < rm.z1 + 3;
    for (let z = -C.HALF; z < C.HALF; z += 14) {
      if (Math.abs(z) < 12 || wet(z) || wet(z + 7)) continue;
      if (R() < 0.75) tree(E + 7 + R.range(-4, 6), z + R.range(-3, 3), null, R() < 0.25 ? 'pine' : null);
      if ((z / 14 | 0) % 2 === 0) {
        P.sCyl.add(E + 15.6, YB + 2, z + 7, 0.12, 4, 0.12, hex(0x2d3436));
        P.sLamp.add(E + 15.6, YB + 4.1, z + 7, 0.5, 0.4, 0.5);
        P.sLampPool.add(E + 16.5, YB + 0.03, z + 7, 9, 1, 9);
        addCollider(E + 15.5, z + 6.9, E + 15.7, z + 7.1, 4, 'pole');
      }
      if (R() < 0.35) bench(E + 23.5, z + 3, Math.PI / 2);
    }
    hotdogStand(E + 15, -40);
    hotdogStand(E + 15, 120);
    hotdogStand(E + 15, -300);
    addRamp(E + 20, -150, 0, 1, 12, 4.5, 2.6);
    addRamp(E + 20, 140, 0, -1, 12, 4.5, 2.6);
    addRamp(E + 20, -380, 0, 1, 12, 4.5, 2.6);
    // bushes for cover
    for (let k = 0; k < 9; k++) {
      const z = R.range(-C.HALF + 20, C.HALF - 20);
      if (Math.abs(z) < 20 || wet(z)) continue;
      P.sSph.add(E + 3.5, YB + 0.7, z, 3.6, 1.6, 2.6, hex(0x3f7d34));
      City.covers.push({ x: E + 3.5, z, r: 1.6 });
    }
    // ferris wheel base on the pier platform
    const fx = (C.FERRIS.x0 + C.FERRIS.x1) / 2;
    City.ferris = { x: fx, y: 24, z: 18, r: 20 };
    for (const dx of [-6, 6]) {
      P.sBox.add(fx + dx, YB + 12, 14.5, 0.8, 24, 0.8, hex(0xecf0f1), 0, 0, dx > 0 ? 0.24 : -0.24);
      P.sBox.add(fx + dx, YB + 12, 21.5, 0.8, 24, 0.8, hex(0xecf0f1), 0, 0, dx > 0 ? 0.24 : -0.24);
    }
    addCollider(fx - 11, 13, fx + 11, 23, 3, 'ferris');
    P.sBox.add(fx, YB + 1.5, 18, 22, 3, 10, hex(0x34495e));
  }

  // A little brick-and-ivy ballpark: diamond, stands behind home plate, light towers and a scoreboard.
  function genBallpark(b) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, X0 = b.ix0, X1 = b.ix1, Z0 = b.iz0, Z1 = b.iz1;
    const ch = chunkAt(cx, cz).plain;
    for (let x = X0; x < X1 - 0.1; x += 4) G.flat(x, Z0, Math.min(x + 2, X1), Z1, YB + 0.008, hex(0x4a9c44));
    // infield square (dirt) with grass inside, home plate in the south-west corner
    const hx = X0 + 11, hz = Z0 + 11, s = 14;
    G.flat(hx - 1, hz - 1, hx + s + 1, hz + s + 1, YB + 0.012, hex(0xb5835a));
    G.flat(hx + 1.5, hz + 1.5, hx + s - 1.5, hz + s - 1.5, YB + 0.014, hex(0x3f8f3a));
    for (const [bx, bz] of [[hx, hz], [hx + s, hz], [hx + s, hz + s], [hx, hz + s]]) P.sBox.add(bx, YB + 0.06, bz, 0.5, 0.1, 0.5, hex(0xffffff));
    P.sCyl.add(hx + s / 2, YB + 0.12, hz + s / 2, 2.6, 0.25, 2.6, hex(0xb5835a));
    // stepped stands along the south and west edges (blue seats)
    const blue = hex(0x0e3386), conc = hex(0x9e9a90);
    for (let k = 0; k < 6; k++) {
      const top = YB + (k + 1) * 0.9, c = k % 2 ? blue : CB.shade(blue, 1.25);
      ch.box(X0 + k * 1.3, YB, Z0 + k * 1.3, X1 - 8, top, Z0 + (k + 1) * 1.3, c, { bottom: true });
      ch.box(X0 + k * 1.3, YB, Z0 + (k + 1) * 1.3, X0 + (k + 1) * 1.3, top, Z1 - 8, c, { bottom: true });
    }
    ch.box(X0 - 0.3, YB, Z0 - 0.3, X1 - 8, YB + 7, Z0, conc, { bottom: true });
    ch.box(X0 - 0.3, YB, Z0, X0, YB + 7, Z1 - 8, conc, { bottom: true });
    addCollider(X0, Z0, X1 - 8, Z0 + 7.8, YB + 6, 'stands');
    addCollider(X0, Z0, X0 + 7.8, Z1 - 8, YB + 6, 'stands');
    // ivy-covered outfield wall
    ch.box(X0 + 8, YB, Z1 - 0.6, X1, YB + 3.2, Z1, hex(0x2f6b2a), { bottom: true });
    ch.box(X1 - 0.6, YB, Z0 + 8, X1, YB + 3.2, Z1, hex(0x2f6b2a), { bottom: true });
    addCollider(X0 + 8, Z1 - 0.6, X1, Z1, YB + 3.2, 'wall');
    addCollider(X1 - 0.6, Z0 + 8, X1, Z1, YB + 3.2, 'wall');
    // scoreboard + light towers
    ch.box(X1 - 10, YB + 3.2, Z1 - 1.4, X1 - 1, YB + 9, Z1 - 0.6, hex(0x1e5a2d), { bottom: true });
    P.sCrown2.add(X1 - 5.5, YB + 8.4, Z1 - 1.45, 7.5, 0.4, 0.1);
    P.sCrown.add(X1 - 5.5, YB + 6, Z1 - 1.45, 5.5, 1.8, 0.1);
    for (const [lx, lz] of [[X0 + 1, Z1 - 5], [X1 - 5, Z0 + 1], [X1 - 2, Z1 - 14], [X0 + 22, Z0 + 1]]) {
      P.sCyl.add(lx, YB + 9, lz, 0.4, 18, 0.4, hex(0x7f8c8d));
      P.sBox.add(lx, YB + 18.5, lz, 3, 1.6, 0.4, hex(0x555555));
      P.sLamp.add(lx, YB + 18.5, lz, 2.6, 1.2, 0.5);
      addCollider(lx - 0.25, lz - 0.25, lx + 0.25, lz + 0.25, 18, 'pole');
    }
    hotdogStand(X1 - 16, Z0 + 24);
    City.landmarks = City.landmarks || [];
    City.landmarks.push({ name: 'Ballpark', x: cx, z: cz });
  }

  // A tapered black skyscraper with X-bracing (a nod to Chicago's "Big John").
  function bigJohn(b) {
    G.flat(b.ix0, b.iz0, b.ix1, b.iz1, YB + 0.006, hex(0xa9a49a));
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, h = 18, tiers = [];
    const n = 10, top = 205;
    for (let k = 0; k < n; k++) tiers.push({ inset: k * 1.15, top: YB + 4.2 + (k + 1) * (top / n) });
    const dark = hex(0x2a2c31);
    building(cx - h, cz - h, cx + h, cz + h, 0, 'glass', dark, { store: ['s', 'w', 'n', 'e'], downtown: true, district: 'downtown', roof: hex(0x222222), tiers });
    const steel = hex(0x15171a);
    for (let k = 0; k < n; k += 2) {
      const y0 = k === 0 ? YB + 4.2 : tiers[k - 1].top, y1 = tiers[k + 1].top, ins = tiers[k].inset + 0.6;
      const w = 2 * h - 2 * ins, hb = y1 - y0, L = Math.hypot(w, hb), ang = Math.atan2(hb, w), ym = (y0 + y1) / 2;
      for (const sg of [-1, 1]) {
        P.sBox.add(cx, ym, cz - h + ins - 0.2, L, 0.7, 0.3, steel, 0, 0, sg * ang);
        P.sBox.add(cx, ym, cz + h - ins + 0.2, L, 0.7, 0.3, steel, 0, 0, sg * ang);
        P.sBox.add(cx - h + ins - 0.2, ym, cz, 0.3, 0.7, L, steel, 0, sg * ang, 0);
        P.sBox.add(cx + h - ins + 0.2, ym, cz, 0.3, 0.7, L, steel, 0, sg * ang, 0);
      }
    }
    const T = tiers[n - 1].top;
    for (const dx of [-4, 4]) {
      P.sCyl.add(cx + dx, T + 25, cz, 1.0, 50, 1.0, hex(0xeeeeee));
      P.sBlink.add(cx + dx, T + 50.5, cz, 1.4, 1.4, 1.4);
    }
    P.sCrown.add(cx, T + 0.4, cz, 2 * h - 2 * tiers[n - 1].inset, 0.5, 2 * h - 2 * tiers[n - 1].inset);
  }

  // ------------------------------------------------------------------ build
  City.build = function (scene, pools) {
    P = pools;
    R = CB.rng(1871); // year of the Great Chicago Fire
    G = new CB.Geo({ world: 3 });
    City.aoGeo = new CB.Geo();
    // blocks
    for (let bi = 0; bi < C.N; bi++) {
      for (let bj = 0; bj < C.N; bj++) {
        const x0 = CB.road(bi) + C.ROAD / 2, z0 = CB.road(bj) + C.ROAD / 2;
        const b = { bi, bj, x0, z0, x1: x0 + C.BLOCK, z1: z0 + C.BLOCK, type: blockType(bi, bj) };
        b.ix0 = x0 + C.SIDE; b.iz0 = z0 + C.SIDE; b.ix1 = b.x1 - C.SIDE; b.iz1 = b.z1 - C.SIDE;
        b.cx = (x0 + b.x1) / 2; b.cz = (z0 + b.z1) / 2;
        b.noPeds = b.type === 'river';
        City.blocks.push(b);
      }
    }
    groundBase();
    roadMarkings();
    roadDetails();
    riverBridges();
    for (const b of City.blocks) {
      if (b.type !== 'river') blockBase(b);
      switch (b.type) {
        case 'apartments': genApartments(b); break;
        case 'shops': genShops(b); break;
        case 'downtown': genDowntown(b, false); break;
        case 'midtown': genDowntown(b, true); break;
        case 'skydeck': skydeck(b); break;
        case 'bigjohn': bigJohn(b); break;
        case 'river': genRiverBlock(b); break;
        case 'park': genPark(b, 'park'); break;
        case 'bean': genPark(b, 'bean'); break;
        case 'fountain': genPark(b, 'fountain'); break;
        case 'parking': genParking(b, b.bi === 1 ? 1 : b.bi === 14 ? -1 : 0); break;
        case 'ballpark': genBallpark(b); break;
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
    const E = C.EDGE, H = C.HALF;
    City.speedCams.push({ x: E + 0.8, z: -60, roadX: H }, { x: -E - 0.8, z: 90, roadX: -H }, { x: 40, z: -E - 0.8, roadZ: -H },
      { x: -120, z: E + 0.8, roadZ: H }, { x: E + 0.8, z: 320, roadX: H });
    for (const s of City.speedCams) {
      P.sCyl.add(s.x, YB + 2.5, s.z, 0.16, 5, 0.16, hex(0x7f8c8d));
      P.sBox.add(s.x, YB + 5, s.z, 0.7, 0.5, 0.7, hex(0xf1c40f));
      addCollider(s.x - 0.15, s.z - 0.15, s.x + 0.15, s.z + 0.15, 5, 'pole');
    }
    // race starts sit on an outer road next to a grid node; the flag stands on the outer sidewalk
    City.raceStarts.push(
      { x: H + 2.5, z: CB.road(3) - 25, node: [C.N, 3], name: 'Lake Shore Sprint', fx: E + 1.5, fz: CB.road(3) - 25, along: 'z' },
      { x: -H - 2.5, z: CB.road(C.N - 3) + 25, node: [0, C.N - 3], name: 'West Side Dash', fx: -E - 1.5, fz: CB.road(C.N - 3) + 25, along: 'z' },
      { x: CB.road(C.N / 2) + 25, z: -H - 2.5, node: [C.N / 2, 0], name: 'South Loop Run', fx: CB.road(C.N / 2) + 25, fz: -E - 1.5, along: 'x' },
      { x: CB.road(C.N / 2 + 3) - 25, z: H + 2.5, node: [C.N / 2 + 3, C.N], name: 'River North Run', fx: CB.road(C.N / 2 + 3) - 25, fz: E + 1.5, along: 'x' },
      { x: H + 2.5, z: CB.road(C.N - 2) - 25, node: [C.N, C.N - 2], name: 'Gold Coast Gallop', fx: E + 1.5, fz: CB.road(C.N - 2) - 25, along: 'z' });
    for (const s of City.raceStarts) {
      P.sCyl.add(s.fx, YB + 2, s.fz, 0.1, 4, 0.1, hex(0xdddddd));
      const az = s.along === 'z';
      for (let k = 0; k < 4; k++) for (let m = 0; m < 2; m++) {
        P.sBox.add(s.fx + (az ? 0 : 0.3 + k * 0.3), YB + 3.7 - m * 0.3, s.fz + (az ? 0.3 + k * 0.3 : 0), az ? 0.03 : 0.3, 0.3, az ? 0.3 : 0.03, (k + m) % 2 ? hex(0x111111) : hex(0xffffff));
      }
    }

    // materials
    const facMat = (kind, seed) => {
      const f = CB.CityTex.facade(scene, kind, seed);
      const m = new B.StandardMaterial('fac_' + kind, scene);
      m.diffuseTexture = f.diff; m.emissiveTexture = f.emis;
      m.emissiveColor = new B.Color3(0, 0, 0);
      // shiny windows, matte walls; recessed windows via a normal map
      m.specularTexture = f.spec;
      m.specularColor = kind === 'glass' ? new B.Color3(0.75, 0.75, 0.75) : new B.Color3(0.55, 0.55, 0.55);
      m.specularPower = kind === 'glass' ? 96 : 64;
      m.bumpTexture = f.bump; m.bumpTexture.level = 0.9;
      return m;
    };
    City.mats = {
      office: facMat('office', 11), brick: facMat('brick', 22), stone: facMat('stone', 33), glass: facMat('glass', 44),
    };
    const detail = CB.CityTex.detail(scene);
    const plainMat = new B.StandardMaterial('plain', scene);
    plainMat.specularColor = new B.Color3(0.06, 0.06, 0.06);
    plainMat.diffuseTexture = detail;
    City.mats.plain = plainMat;
    const groundMat = new B.StandardMaterial('ground', scene);
    groundMat.specularColor = new B.Color3(0.12, 0.12, 0.12);
    groundMat.specularPower = 24;
    groundMat.diffuseTexture = detail;
    City.mats.ground = groundMat;
    // contact shadows
    const aoMat = new B.StandardMaterial('ao', scene);
    aoMat.disableLighting = true; aoMat.diffuseColor = new B.Color3(0, 0, 0);
    aoMat.disableDepthWrite = true; aoMat.zOffset = -2; aoMat.backFaceCulling = false;
    City.aoMesh = City.aoGeo.build('contactShadows', scene, aoMat);
    City.aoMesh.hasVertexAlpha = true;
    City.aoGeo = null;

    City.ground = G.build('ground', scene, groundMat);
    City.ground.receiveShadows = true;
    for (const ch of City.chunks.values()) {
      for (const k of ['office', 'brick', 'stone', 'glass', 'plain']) {
        if (!ch[k] || !ch[k].count) continue;
        const mesh = ch[k].build('chunk_' + ch.key + '_' + k, scene, City.mats[k]);
        mesh.receiveShadows = true;
        City.chunkMeshes.push({ mesh, x: ch.cx, z: ch.cz, kind: k });
        ch[k] = null;
      }
    }
  };

  // Called after City.furnish(): builds the room meshes and the navigation grid.
  City.finishInteriors = function (scene) {
    const m = new B.StandardMaterial('interior', scene);
    m.specularColor = new B.Color3(0.05, 0.05, 0.05);
    m.emissiveColor = new B.Color3(0.36, 0.35, 0.33); // rooms are lit from inside (clean flat colours, no street grime)
    City.mats.interior = m;
    for (const ch of City.chunks.values()) {
      if (!ch.interior || !ch.interior.count) continue;
      const mesh = ch.interior.build('chunk_' + ch.key + '_interior', scene, m);
      mesh.receiveShadows = true;
      City.chunkMeshes.push({ mesh, x: ch.cx, z: ch.cz, kind: 'interior' });
      ch.interior = null;
    }
    buildNav();
    // make sure every doorway is passable on the coarse navigation grid
    for (const r of City.rooms) {
      const S = r.S, dc = (r.d1 + r.d2) / 2;
      for (let ins = -1.6; ins <= 2.6; ins += 0.5) {
        const x = S.ax + S.ux * dc - S.nx * ins, z = S.az + S.uz * dc - S.nz * ins;
        const c = City.cell(x, z);
        if (c >= 0) { NAV.walk[c] = 1; NAV.opaque[c] = 0; }
      }
    }
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
      // neon light on the sidewalk in front of the sign
      const fg = labels[s.label].fg;
      if (fg && fg[0] === '#') {
        const c = hex(parseInt(fg.slice(1), 16));
        const along = Math.abs(s.ux) > 0.5;
        P.sNeonPool.add(s.sx + s.nx * 2.0, YB + 0.035, s.sz + s.nz * 2.0, along ? w * 1.5 : 5.5, 1, along ? 5.5 : w * 1.5, c);
      }
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

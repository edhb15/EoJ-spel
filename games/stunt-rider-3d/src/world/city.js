// Downtown: street blocks with buildings, a skate plaza, a park, parking lots and a rooftop jump.
import * as THREE from 'three';
import { CITY_X, CITY_Z, CITY_STREET_W, SURF } from './layout.js';
import { smoothstep, lerp } from '../core/math.js';
import { kickerProfile, kickerHeight, rampProfile, tabletopProfile } from './solids.js';
import { FACADE_COUNT } from './textures.js';

const BAY = 14; // facade texture covers 14 m x 14 m

// Four outward-facing wall quads plus a roof. Corners walked counter-clockwise from above.
export function buildingGeometry(x0, z0, x1, z1, y0, y1, uvScale = BAY) {
  const pos = [];
  const uv = [];
  const corners = [
    [x0, z1],
    [x1, z1],
    [x1, z0],
    [x0, z0],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const u1 = len / uvScale;
    const v1 = (y1 - y0) / uvScale;
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
    uv.push(0, 0, u1, 0, u1, v1, 0, 0, u1, v1, 0, v1);
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  walls.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  walls.computeVertexNormals();
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute([x0, y1, z0, x0, y1, z1, x1, y1, z1, x0, y1, z0, x1, y1, z1, x1, y1, z0], 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / 8, z0 / 8, x0 / 8, z1 / 8, x1 / 8, z1 / 8, x0 / 8, z0 / 8, x1 / 8, z1 / 8, x1 / 8, z0 / 8], 2));
  roof.computeVertexNormals();
  return { walls, roof };
}

export function addBuilding(ctx, x0, z0, x1, z1, height, style, y0 = 0, opts = {}) {
  const y1 = y0 + height;
  const g = buildingGeometry(x0, z0, x1, z1, y0, y1);
  ctx.batch.add(opts.wallMat || 'facade' + style, g.walls);
  ctx.batch.add(opts.roofMat || 'roof', g.roof);
  const s = ctx.addSolid(
    { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, h: height, y0, surface: SURF.concrete, kind: 'building', tag: opts.tag },
    { mesh: false },
  );
  ctx.minimap.push({ rect: [x0, z0, x1, z1], color: opts.mapColor || '#23252b' });
  // rooftop clutter
  if (!opts.cleanRoof && height > 14 && x1 - x0 > 14 && z1 - z0 > 14) {
    const n = ctx.rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const w = ctx.rng.float(3, 7);
      const d = ctx.rng.float(3, 7);
      const h = ctx.rng.float(1.5, 4);
      const cx = ctx.rng.float(x0 + w, x1 - w);
      const cz = ctx.rng.float(z0 + d, z1 - d);
      const box = new THREE.BoxGeometry(w, h, d);
      box.translate(cx, y1 + h / 2, cz);
      ctx.batch.add('concreteDark', box);
    }
    // parapet
    const p = 0.6;
    for (const [ax, az, bx, bz] of [
      [x0, z0, x1, z0 + p],
      [x0, z1 - p, x1, z1],
      [x0, z0, x0 + p, z1],
      [x1 - p, z0, x1, z1],
    ]) {
      const box = new THREE.BoxGeometry(bx - ax, 1, bz - az);
      box.translate((ax + bx) / 2, y1 + 0.5, (az + bz) / 2);
      ctx.batch.add('concrete', box);
    }
  }
  return s;
}

function slab(ctx, x0, z0, x1, z1, mat, surface, h = 0.18) {
  return ctx.addSolid({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, h, y0: 0, surface, kind: 'slab' }, { top: mat, side: 'concrete', uv: 6 });
}

export function buildCity(ctx) {
  const rng = ctx.rng;
  const hw = CITY_STREET_W / 2;
  const center = [-740, -180];
  const special = {
    '2,2': 'roofA',
    '3,2': 'roofB',
    '1,4': 'park',
    '2,5': 'plaza',
    '4,3': 'parking',
    '0,6': 'parking',
    '2,3': 'tower',
  };
  for (let i = 0; i < CITY_X.length - 1; i++) {
    for (let j = 0; j < CITY_Z.length - 1; j++) {
      const x0 = CITY_X[i] + hw;
      const x1 = CITY_X[i + 1] - hw;
      const z0 = CITY_Z[j] + hw;
      const z1 = CITY_Z[j + 1] - hw;
      const type = special[i + ',' + j] || 'buildings';
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (type === 'park') {
        slab(ctx, x0, z0, x1, z1, 'grassTop', SURF.grass);
        ctx.minimap.push({ rect: [x0, z0, x1, z1], color: '#3f6b2c' });
        for (let k = 0; k < 26; k++) {
          const tx = rng.float(x0 + 4, x1 - 4);
          const tz = rng.float(z0 + 4, z1 - 4);
          if (Math.hypot(tx - cx, tz - cz) < 16) continue;
          ctx.addTree(tx, tz, rng.chance(0.5) ? 'oak' : 'birch', rng.float(0.8, 1.2), 0.18);
        }
        // fountain
        const f = ctx.addSolid({ cx, cz, hx: 6, hz: 6, h: 0.9, y0: 0.18, surface: SURF.concrete, kind: 'prop' }, { top: 'concrete', side: 'concrete' });
        void f;
        const water = new THREE.CylinderGeometry(5.2, 5.2, 0.1, 24);
        water.translate(cx, 1.05, cz);
        ctx.batch.add('waterProp', water);
        continue;
      }
      if (type === 'plaza') {
        slab(ctx, x0, z0, x1, z1, 'sidewalk', SURF.concrete);
        ctx.minimap.push({ rect: [x0, z0, x1, z1], color: '#6d6a63' });
        buildPlaza(ctx, x0, z0, x1, z1);
        continue;
      }
      if (type === 'parking') {
        slab(ctx, x0, z0, x1, z1, 'parking', SURF.asphalt);
        ctx.minimap.push({ rect: [x0, z0, x1, z1], color: '#4a4b50' });
        for (let r = 0; r < 4; r++) {
          const rz = z0 + 10 + r * 26;
          for (let c = 0; c < 22; c++) {
            if (rng.chance(0.45)) continue;
            const px = x0 + 4 + c * 4.6;
            ctx.addParkedCar(px, rz + (r % 2 ? 3 : -3), r % 2 ? Math.PI : 0, rng.int(0, 9), 0.18);
          }
        }
        continue;
      }
      // sidewalk slab under buildings
      slab(ctx, x0, z0, x1, z1, 'sidewalk', SURF.concrete);
      if (type === 'roofA' || type === 'roofB') {
        buildRooftop(ctx, type, x0, z0, x1, z1);
        continue;
      }
      if (type === 'tower') {
        const tw = 46;
        addBuilding(ctx, cx - tw / 2, cz - tw / 2, cx + tw / 2, cz + tw / 2, 168, 0, 0.18, { cleanRoof: true, mapColor: '#1b1d22' });
        addBuilding(ctx, cx - 16, cz - 16, cx + 16, cz + 16, 22, 0, 168.18, { cleanRoof: true });
        const ant = new THREE.CylinderGeometry(0.6, 1.2, 40, 8);
        ant.translate(cx, 190 + 20, cz);
        ctx.batch.add('steel', ant);
        ctx.addBeacon(cx, 231, cz);
        // lower podium around the tower
        addBuilding(ctx, x0 + 4, z0 + 4, x0 + 26, z1 - 4, 18, 3, 0.18);
        addBuilding(ctx, x1 - 26, z0 + 4, x1 - 4, z1 - 4, 24, 1, 0.18);
        continue;
      }
      // generic buildings
      const d = Math.hypot(cx - center[0], cz - center[1]);
      const hmax = lerp(110, 20, smoothstep(60, 440, d));
      const m = 4;
      const bx0 = x0 + m;
      const bx1 = x1 - m;
      const bz0 = z0 + m;
      const bz1 = z1 - m;
      const cols = rng.int(1, 3);
      const rows = rng.int(1, 3);
      const gap = 4;
      const cw = (bx1 - bx0 - gap * (cols - 1)) / cols;
      const rh = (bz1 - bz0 - gap * (rows - 1)) / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const ax = bx0 + c * (cw + gap) + rng.float(0, 3);
          const az = bz0 + r * (rh + gap) + rng.float(0, 3);
          const ex = bx0 + c * (cw + gap) + cw - rng.float(0, 3);
          const ez = bz0 + r * (rh + gap) + rh - rng.float(0, 3);
          let h = Math.max(10.5, hmax * rng.float(0.4, 1));
          h = Math.round(h / 3.5) * 3.5;
          addBuilding(ctx, ax, az, ex, ez, h, rng.int(0, FACADE_COUNT - 1), 0.18);
          if (h > 40 && rng.chance(0.25)) ctx.addBeacon((ax + ex) / 2, h + 0.5, (az + ez) / 2);
        }
      }
      // sidewalk trees
      if (rng.chance(0.5)) {
        for (let t = x0 + 8; t < x1 - 4; t += 16) {
          ctx.addTree(t, z0 + 2, 'oak', 0.7, 0.18);
          ctx.addTree(t, z1 - 2, 'oak', 0.7, 0.18);
        }
      }
    }
  }
  // street lamps along every street, traffic lights at intersections
  // (kept clear of the rooftop ramp entrance)
  const keepClear = (x, z) => x > -797 && x < -785 && Math.abs(z + 300) < 9;
  for (const x of CITY_X) {
    for (let z = CITY_Z[0] + 20; z < CITY_Z[CITY_Z.length - 1]; z += 40) {
      if (CITY_Z.some((cz) => Math.abs(cz - z) < 12)) continue;
      if (keepClear(x + hw + 1.2, z)) {
        ctx.addLamp(x - hw - 1.2, z, Math.PI / 2);
        continue;
      }
      ctx.addLamp(x - hw - 1.2, z, Math.PI / 2);
      ctx.addLamp(x + hw + 1.2, z, -Math.PI / 2);
    }
  }
  for (const z of CITY_Z) {
    for (let x = CITY_X[0] + 20; x < CITY_X[CITY_X.length - 1]; x += 40) {
      if (CITY_X.some((cx) => Math.abs(cx - x) < 12)) continue;
      ctx.addLamp(x, z - hw - 1.2, 0);
      ctx.addLamp(x, z + hw + 1.2, Math.PI);
    }
  }
  for (const x of CITY_X) {
    for (const z of CITY_Z) {
      ctx.addTrafficLight(x + hw + 1, z + hw + 1, Math.PI);
      ctx.addTrafficLight(x - hw - 1, z - hw - 1, 0);
    }
  }
  // roof billboards
  const ads = [
    ['NITRO FUEL', '#101010', '#ff6a00', 'FEEL THE BURN'],
    ['TURBO COLA', '#b3121b', '#ffffff', 'ICE COLD SPEED'],
    ['EOJ RACING', '#0d1b2a', '#ffcc00', 'TEAM STUNT'],
    ['STUNT RIDER 3D', '#111111', '#ff3b1f', 'RIDE • FLIP • LAND'],
  ];
  const spots = [
    [-449, -300, Math.PI / 2],
    [-449, 60, Math.PI / 2],
    [-1031, -170, -Math.PI / 2],
    [-620, 231, 0],
  ];
  spots.forEach((sp, k) => {
    const ad = ads[k % ads.length];
    ctx.addBanner(sp[0], 8, sp[1], sp[2], 18, 4.5, ad[0], ad[1], ad[2], ad[3], true, true);
  });
}

function buildPlaza(ctx, x0, z0, x1, z1) {
  const y = 0.18;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // concrete banks
  ctx.addSolid({ cx: x0 + 14, cz: cz - 20, yaw: Math.PI / 2, hx: 4, hz: 4, y0: y, profile: rampProfile(8, 1.6), surface: SURF.concrete, kind: 'ramp' }, { top: 'concrete', side: 'concrete' });
  ctx.addSolid({ cx: x1 - 14, cz: cz - 20, yaw: -Math.PI / 2, hx: 4, hz: 4, y0: y, profile: rampProfile(8, 1.6), surface: SURF.concrete, kind: 'ramp' }, { top: 'concrete', side: 'concrete' });
  // funbox (two crossing tabletops)
  const tt = tabletopProfile(1.4, 22, 6, 22);
  const len = tt[tt.length - 1][0];
  ctx.addSolid({ cx, cz: cz + 18, yaw: Math.PI / 2, hx: 4, hz: len / 2, y0: y, profile: tt, surface: SURF.concrete, kind: 'ramp' }, { top: 'concrete', side: 'concrete' });
  ctx.addSolid({ cx, cz: cz + 18, yaw: 0, hx: 4, hz: len / 2, y0: y, profile: tt, surface: SURF.concrete, kind: 'ramp' }, { top: 'concrete', side: 'concrete' });
  // ledges
  for (let k = 0; k < 3; k++) {
    ctx.addSolid({ cx: cx - 24 + k * 24, cz: cz - 40, hx: 6, hz: 0.8, h: 0.4, y0: y, surface: SURF.concrete, kind: 'prop' }, { top: 'concreteDark', side: 'concreteDark' });
  }
  // stair set up to a platform with a kicker drop
  const sx = x1 - 30;
  for (let k = 0; k < 5; k++) {
    ctx.addSolid({ cx: sx + k * 1.6, cz: cz + 34, hx: 0.8, hz: 5, h: 0.4 * (k + 1), y0: y, surface: SURF.concrete, kind: 'prop' }, { top: 'concrete', side: 'concrete' });
  }
  ctx.addSolid({ cx: sx + 8 + 4, cz: cz + 34, hx: 4, hz: 5, h: 2.0, y0: y, surface: SURF.concrete, kind: 'prop' }, { top: 'concrete', side: 'concrete' });
  ctx.addSolid({ cx: sx + 18, cz: cz + 34, yaw: Math.PI / 2, hx: 3, hz: 2, y0: y + 2, profile: kickerProfile(4, 22), surface: SURF.wood, kind: 'kicker' }, { top: 'wood', side: 'woodSide' });
  ctx.stars.push({ x: cx, y: y + 5.5, z: cz + 18 });
}

function buildRooftop(ctx, type, x0, z0, x1, z1) {
  const y = 0.18;
  const cz = -300;
  if (type === 'roofA') {
    // long wooden ramp from street level up to the roof of building A
    const rampLen = 42;
    ctx.addSolid({ cx: x0 + 3 + rampLen / 2, cz, yaw: Math.PI / 2, hx: 5, hz: rampLen / 2, y0: y, profile: rampProfile(rampLen, 9), surface: SURF.wood, kind: 'ramp', tag: 'roofRampUp' }, { top: 'wood', side: 'steelDark', uv: 4 });
    const bx0 = x0 + 3 + rampLen;
    addBuilding(ctx, bx0, cz - 25, x1, cz + 25, 9, 2, y, { cleanRoof: true, tag: 'roofA' });
    // kicker at the roof edge
    const kl = 12;
    const kh = kickerHeight(kl, 17);
    ctx.addSolid({ cx: x1 - kl / 2, cz, yaw: Math.PI / 2, hx: 5, hz: kl / 2, y0: y + 9, profile: kickerProfile(kl, 17), surface: SURF.wood, kind: 'kicker', tag: 'roofKicker' }, { top: 'wood', side: 'woodSide' });
    ctx.stars.push({ x: (bx0 + x1) / 2 - 8, y: y + 10.6, z: cz + 12 });
    ctx.stars.push({ x: x1 + 10, y: y + 9 + kh + 2.6, z: cz });
    ctx.gapZones.push({ name: 'Rooftop Leap', points: 2500, from: ['roofKicker'], to: ['roofB', 'roofRampDown'] });
    // construction site dressing on the remaining lot
    for (let k = 0; k < 6; k++) {
      const bx = x0 + 10 + k * 15;
      ctx.addSolid({ cx: bx, cz: z0 + 8, hx: 1.2, hz: 1.2, h: 1.2, y0: y, surface: SURF.wood, kind: 'prop' }, { top: 'wood', side: 'wood' });
      ctx.addSolid({ cx: bx + 5, cz: z1 - 8, hx: 1.2, hz: 1.2, h: 1.2, y0: y, surface: SURF.wood, kind: 'prop' }, { top: 'wood', side: 'wood' });
    }
    ctx.addBanner(x0 + 24, 6, cz - 6.5, 0, 14, 3.5, 'ROOFTOP LEAP', '#111', '#ff6a00', 'GAP 2500 PTS', false);
  } else {
    const bx0 = x0 + 7;
    const bx1 = bx0 + 50;
    addBuilding(ctx, bx0, cz - 25, bx1, cz + 25, 8, 3, y, { cleanRoof: true, tag: 'roofB' });
    const dl = x1 - bx1 - 2;
    const prof = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      prof.push([dl * t, 8 * (1 - t) + 0.0 * t - (k > 0 && k < 10 ? 0.4 * Math.sin(t * Math.PI) : 0)]);
    }
    ctx.addSolid({ cx: bx1 + dl / 2, cz, yaw: Math.PI / 2, hx: 5, hz: dl / 2, y0: y, profile: prof, surface: SURF.wood, kind: 'ramp', tag: 'roofRampDown' }, { top: 'wood', side: 'steelDark', uv: 4 });
    ctx.stars.push({ x: bx1 - 6, y: y + 9.6, z: cz - 15 });
    for (let k = 0; k < 4; k++) addBuilding(ctx, x0 + 6 + k * 25, z0 + 4, x0 + 26 + k * 25, z0 + 22, 14 + k * 3.5, k % FACADE_COUNT, y);
    for (let k = 0; k < 4; k++) addBuilding(ctx, x0 + 6 + k * 25, z1 - 22, x0 + 26 + k * 25, z1 - 4, 17.5 + k * 3.5, (k + 2) % FACADE_COUNT, y);
  }
}

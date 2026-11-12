// Industrial zone: warehouses, a container yard with a jump line, silos, an open yard and a sand quarry.
import * as THREE from 'three';
import { SURF, QUARRY } from './layout.js';
import { buildingGeometry } from './city.js';
import { kickerProfile, rampProfile, quarterProfile, tabletopProfile, landingProfile } from './solids.js';

const E = Math.PI / 2;

export function warehouse(ctx, cx, cz, w, d, h, color, yaw = 0) {
  // walls from corrugated metal, flat roof, roller doors on the long sides
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  const g = buildingGeometry(x0, z0, x1, z1, 0, h, 8);
  ctx.batch.add('corr_' + color, g.walls);
  ctx.batch.add('roofMetal', g.roof);
  for (let x = x0 + 10; x < x1 - 6; x += 16) {
    for (const z of [z0 - 0.06, z1 + 0.06]) {
      const door = new THREE.BoxGeometry(6, 5, 0.1);
      door.translate(x, 2.5, z);
      ctx.batch.add('door', door);
    }
  }
  ctx.addSolid({ cx, cz, hx: w / 2, hz: d / 2, h, surface: SURF.metal, kind: 'building', yaw }, { mesh: false });
  ctx.minimap.push({ rect: [x0, z0, x1, z1], color: '#2b2d33' });
}

function container(ctx, x, z, level, color, yaw = 0, tag = '') {
  const h = 2.6;
  const s = ctx.addSolid({ cx: x, cz: z, yaw, hx: yaw ? 1.22 : 6.1, hz: yaw ? 6.1 : 1.22, h, y0: level * h, surface: SURF.metal, kind: 'container', tag }, { mesh: false });
  ctx.addContainer(x, level * h, z, yaw, color);
  return s;
}

const CONT_COLORS = ['#c0392b', '#1f6fb2', '#e67e22', '#27ae60', '#7f8c8d', '#8e44ad', '#d4ac0d', '#16a085'];

export function buildIndustrial(ctx) {
  const rng = ctx.rng;
  // warehouses
  warehouse(ctx, 540, 520, 150, 56, 14, '#4a6f8a');
  warehouse(ctx, 560, 640, 190, 40, 10, '#b9b9b1');
  warehouse(ctx, 850, 790, 200, 56, 16, '#8a4a3a');
  warehouse(ctx, 810, 900, 130, 48, 12, '#d0d0c8');
  warehouse(ctx, 1045, 760, 90, 60, 13, '#5d6d5b');
  warehouse(ctx, 1040, 1025, 70, 60, 11, '#4a6f8a');
  // loading docks with small ramps next to the big warehouse
  for (let k = 0; k < 4; k++) {
    const x = 480 + k * 36;
    ctx.addSolid({ cx: x, cz: 552, hx: 8, hz: 2.5, h: 1.2, surface: SURF.concrete, kind: 'prop' }, { top: 'concreteDark', side: 'concreteDark' });
    ctx.addSolid({ cx: x, cz: 558, yaw: Math.PI, hx: 3, hz: 3.5, profile: rampProfile(7, 1.2), surface: SURF.concrete, kind: 'ramp' }, { top: 'concrete', side: 'concrete' });
  }

  // container yard
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 14; c++) {
      if (rng.chance(0.12)) continue;
      const x = 732 + c * 15.5;
      for (const dz of [0, 2.6]) {
        const z = 470 + r * 46 + dz;
        if (r === 2) continue; // the jump line runs here
        const levels = rng.int(1, 3);
        for (let l = 0; l < levels; l++) container(ctx, x, z, l, rng.pick(CONT_COLORS));
      }
    }
  }
  // container jump line (row r=2): ramp up, container run, kicker, gap, second run, ramp down
  const z = 470 + 2 * 46 + 1.3;
  ctx.addSolid({ cx: 724, cz: z, yaw: E, hx: 3, hz: 11, profile: rampProfile(22, 2.6), surface: SURF.wood, kind: 'ramp' }, { top: 'wood', side: 'steelDark' });
  for (let k = 0; k < 5; k++) container(ctx, 735 + 6.1 + k * 12.2, z, 0, CONT_COLORS[k % 8], 0, 'contRow1');
  const row1End = 735 + 5 * 12.2;
  ctx.addSolid({ cx: row1End - 5, cz: z, yaw: E, hx: 1.2, hz: 5, y0: 2.6, profile: kickerProfile(10, 19), surface: SURF.wood, kind: 'kicker', tag: 'contKicker' }, { top: 'wood', side: 'woodSide' });
  const row2Start = row1End + 17;
  for (let k = 0; k < 5; k++) {
    container(ctx, row2Start + 6.1 + k * 12.2, z, 0, CONT_COLORS[(k + 3) % 8], 0, 'contRow2');
    container(ctx, row2Start + 6.1 + k * 12.2, z, 1, CONT_COLORS[(k + 5) % 8], 0, 'contRow2');
  }
  const row2End = row2Start + 5 * 12.2;
  // landing ramp onto the 2-high row is via the kicker arc; ramp down from 5.2 m at the far end
  const dl = 30;
  const prof = [];
  for (let i = 0; i <= 10; i++) prof.push([(dl * i) / 10, 5.2 * (1 - i / 10)]);
  ctx.addSolid({ cx: row2End + dl / 2, cz: z, yaw: E, hx: 2, hz: dl / 2, profile: prof, surface: SURF.wood, kind: 'ramp', tag: 'contDown' }, { top: 'wood', side: 'steelDark' });
  ctx.gapZones.push({ name: 'Container Hop', points: 1800, from: ['contKicker'], to: ['contRow2', 'contDown'] });
  ctx.stars.push({ x: row1End + 8, y: 7.4, z });
  ctx.landmarks.push({ x: 820, z, label: 'CONTAINERS' });
  ctx.addBanner(722, 5.5, z - 4, -E, 9, 2, 'CONTAINER HOP', '#111', '#ff6a00', '', false, true);
  // gantry crane over the yard
  for (const gx of [760, 900]) {
    for (const gz of [452, 690]) {
      ctx.addSolid({ cx: gx, cz: gz, hx: 1, hz: 1, h: 24, surface: SURF.metal, kind: 'prop' }, { top: 'paintYellow', side: 'paintYellow' });
    }
    const beam = new THREE.BoxGeometry(2, 2.5, 240);
    beam.translate(gx, 25, 571);
    ctx.batch.add('paintYellow', beam);
  }
  const bridge = new THREE.BoxGeometry(144, 2, 3);
  bridge.translate(830, 26.5, 600);
  ctx.batch.add('paintYellow', bridge);

  // silos and tanks
  for (let k = 0; k < 4; k++) {
    const x = 1040;
    const zz = 500 + k * 30;
    const g = new THREE.CylinderGeometry(9, 9, 32, 20);
    g.translate(x, 16, zz);
    ctx.batch.add('steel', g);
    const cap = new THREE.ConeGeometry(9.2, 4, 20);
    cap.translate(x, 34, zz);
    ctx.batch.add('steel', cap);
    ctx.addSolid({ cx: x, cz: zz, hx: 8, hz: 8, h: 32, surface: SURF.metal, kind: 'building' }, { mesh: false });
    ctx.minimap.push({ circle: [x, zz, 9], color: '#5b5f66' });
  }
  // chimney
  const ch = new THREE.CylinderGeometry(2.5, 4, 70, 16);
  ch.translate(1060, 35, 880);
  ctx.batch.add('brick', ch);
  ctx.addSolid({ cx: 1060, cz: 880, hx: 3.5, hz: 3.5, h: 70, surface: SURF.concrete, kind: 'building' }, { mesh: false });
  ctx.addSmokeStack(1060, 71, 880);

  // open yard: practice ramps and barriers
  const yx = 560;
  const yz = 830;
  ctx.addSolid({ cx: yx - 60, cz: yz, yaw: E, hx: 6, hz: 4, profile: kickerProfile(8, 30), surface: SURF.metal, kind: 'kicker' }, { top: 'metal', side: 'steelDark' });
  const lp = landingProfile(2.2, 35, 4, 22, 10);
  const ll = lp[lp.length - 1][0];
  ctx.addSolid({ cx: yx - 60 + 4 + 16 + ll / 2, cz: yz, yaw: E, hx: 7, hz: ll / 2, profile: lp, surface: SURF.concrete, kind: 'landing' }, { top: 'concrete', side: 'concrete' });
  const qp = quarterProfile(5, 70, 2);
  const ql = qp[qp.length - 1][0];
  ctx.addSolid({ cx: yx + 100, cz: yz, yaw: E, hx: 10, hz: ql / 2, profile: qp, surface: SURF.concrete, kind: 'quarter', vert: true }, { top: 'concrete', side: 'concreteDark' });
  ctx.addSolid({ cx: yx - 100, cz: yz, yaw: -E, hx: 10, hz: ql / 2, profile: qp, surface: SURF.concrete, kind: 'quarter', vert: true }, { top: 'concrete', side: 'concreteDark' });
  for (let k = 0; k < 10; k++) ctx.addBarrier(yx - 40 + k * 9, yz - 70, 0);
  for (let k = 0; k < 10; k++) ctx.addBarrier(yx - 40 + k * 9, yz + 70, 0);
  ctx.landmarks.push({ x: yx, z: yz, label: 'YARD' });

  // trucks parked by the warehouses
  for (let k = 0; k < 6; k++) ctx.addTruck(996 + k * 9, 935, 0, rng.int(0, 5));
  for (let k = 0; k < 6; k++) ctx.addTruck(740 + k * 8, 1000, Math.PI, k);

  // quarry: sand jumps between dunes
  const [qx0, qz0, qx1, qz1] = QUARRY.rect;
  const qcx = (qx0 + qx1) / 2;
  const qcz = (qz0 + qz1) / 2;
  const tt = tabletopProfile(3, 28, 6, 26);
  const tl = tt[tt.length - 1][0];
  for (let k = 0; k < 3; k++) {
    const x = qx0 + 60 + k * 90;
    ctx.addSolid({ cx: x, cz: qcz, yaw: E, hx: 7, hz: tl / 2, y0: ctx.terrain.height(x, qcz) - 0.3, profile: tt, surface: SURF.sand, kind: 'mx' }, { top: 'sandTop', side: 'sandTop', uv: 6 });
  }
  // conveyor & crusher
  ctx.addSolid({ cx: qx1 - 20, cz: qz1 - 30, hx: 10, hz: 8, h: 12, surface: SURF.metal, kind: 'building' }, { top: 'steelDark', side: 'corr_#8a6a3a' });
  const conv = new THREE.BoxGeometry(2, 1, 70);
  conv.rotateX(-0.22);
  conv.translate(qx1 - 20, 14, qz1 - 70);
  ctx.batch.add('steelDark', conv);
  ctx.landmarks.push({ x: qcx, z: qcz, label: 'QUARRY' });
  ctx.stars.push({ x: qx0 + 150, y: 9, z: qcz });
}

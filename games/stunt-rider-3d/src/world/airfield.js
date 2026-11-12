// Airfield: long runway with the Mega Ramp used by Ramp Jump mode, hangars, tower and a parked plane.
import * as THREE from 'three';
import { SURF } from './layout.js';
import { kickerProfile, kickerHeight } from './solids.js';
import { warehouse } from './industrial.js';

export const RAMP_JUMP = {
  startX: 96,
  z: -700,
  rampStart: 400,
  rampLen: 24,
  lipDeg: 20,
};
RAMP_JUMP.lipX = RAMP_JUMP.rampStart + RAMP_JUMP.rampLen;
RAMP_JUMP.lipH = kickerHeight(RAMP_JUMP.rampLen, RAMP_JUMP.lipDeg);

export function buildAirfield(ctx) {
  const R = RAMP_JUMP;
  ctx.addSolid(
    { cx: R.rampStart + R.rampLen / 2, cz: R.z, yaw: Math.PI / 2, hx: 7, hz: R.rampLen / 2, profile: kickerProfile(R.rampLen, R.lipDeg, 20), surface: SURF.metal, kind: 'kicker', tag: 'megaRamp', name: 'Mega Ramp' },
    { top: 'metal', side: 'paintOrange', uv: 3 },
  );
  // scaffold legs under the lip
  for (const dz of [-6.6, 6.6]) {
    for (let k = 0; k < 3; k++) {
      const x = R.lipX - 2 - k * 5;
      const h = Math.max(0.5, R.lipH - k * 1.6);
      const leg = new THREE.BoxGeometry(0.4, h, 0.4);
      leg.translate(x, h / 2, R.z + dz);
      ctx.batch.add('steelDark', leg);
    }
  }
  ctx.addBanner(R.rampStart - 6, 7, R.z - 10, -Math.PI / 2, 14, 3.2, 'MEGA RAMP', '#111', '#ff6a00', 'HOW FAR CAN YOU FLY?', false, true);
  ctx.landmarks.push({ x: R.lipX, z: R.z, label: 'MEGA RAMP' });
  // distance boards every 25 m, stripes on the runway every 25 m
  for (let d = 25; d <= 450; d += 25) {
    const x = R.lipX + d;
    if (x > 885) break;
    ctx.addMarker(x, R.z - 23.5, d, Math.PI / 2);
    ctx.addMarker(x, R.z + 23.5, d, -Math.PI / 2);
    const stripe = new THREE.PlaneGeometry(0.6, 36);
    stripe.rotateX(-Math.PI / 2);
    stripe.translate(x, 0.075, R.z);
    ctx.batch.add(d % 100 === 0 ? 'paintOrange' : 'paintWhite', stripe);
  }
  // start line
  const start = new THREE.PlaneGeometry(1.2, 36);
  start.rotateX(-Math.PI / 2);
  start.translate(R.startX + 4, 0.075, R.z);
  ctx.batch.add('checker', start);
  // hangars with curved roofs
  for (let k = 0; k < 3; k++) {
    const cx = 180 + k * 75;
    const cz = -790;
    warehouse(ctx, cx, cz, 60, 40, 9, '#9aa3a8');
    const roof = new THREE.CylinderGeometry(20, 20, 60, 20, 1, true, -Math.PI / 2, Math.PI);
    roof.rotateZ(Math.PI / 2);
    roof.scale(1, 0.35, 1);
    roof.translate(cx, 9, cz);
    ctx.batch.add('roofMetal', roof);
  }
  // control tower
  const tx = 560;
  const tz = -620;
  const base = new THREE.CylinderGeometry(3.5, 4.5, 24, 12);
  base.translate(tx, 12, tz);
  ctx.batch.add('concrete', base);
  const cab = new THREE.CylinderGeometry(6, 5, 4, 12);
  cab.translate(tx, 26, tz);
  ctx.batch.add('glass', cab);
  const lid = new THREE.CylinderGeometry(6.6, 6.6, 0.8, 12);
  lid.translate(tx, 28.4, tz);
  ctx.batch.add('paintWhite', lid);
  ctx.addSolid({ cx: tx, cz: tz, hx: 4.5, hz: 4.5, h: 28, surface: SURF.concrete, kind: 'building' }, { mesh: false });
  ctx.addBeacon(tx, 29.5, tz);
  // parked plane next to the runway
  plane(ctx, 700, -640);
  ctx.stars.push({ x: R.lipX + 60, y: R.lipH + 14, z: R.z });
  ctx.stars.push({ x: 700, y: 5.5, z: -640 });
}

function plane(ctx, x, z) {
  const fus = new THREE.CylinderGeometry(1.6, 1.2, 22, 14);
  fus.rotateZ(Math.PI / 2);
  fus.translate(x, 2.6, z);
  ctx.batch.add('paintWhite', fus);
  const nose = new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  nose.rotateZ(-Math.PI / 2);
  nose.translate(x + 11, 2.6, z);
  ctx.batch.add('paintWhite', nose);
  const wing = new THREE.BoxGeometry(4, 0.3, 26);
  wing.translate(x + 1, 2.2, z);
  ctx.batch.add('paintWhite', wing);
  const tail = new THREE.BoxGeometry(3, 4, 0.3);
  tail.translate(x - 10, 4.6, z);
  ctx.batch.add('paintOrange', tail);
  const stab = new THREE.BoxGeometry(2.4, 0.25, 9);
  stab.translate(x - 10, 3, z);
  ctx.batch.add('paintWhite', stab);
  for (const dz of [-3, 3]) {
    const prop = new THREE.CylinderGeometry(1.1, 1.1, 2.5, 10);
    prop.rotateZ(Math.PI / 2);
    prop.translate(x + 2, 1.6, z + dz * 2);
    ctx.batch.add('steelDark', prop);
  }
  ctx.addSolid({ cx: x, cz: z, hx: 11, hz: 1.6, h: 4.2, surface: SURF.metal, kind: 'vehicle' }, { mesh: false });
  ctx.addSolid({ cx: x + 1, cz: z, hx: 2, hz: 13, h: 2.4, y0: 2.0, surface: SURF.metal, kind: 'vehicle' }, { mesh: false });
  ctx.minimap.push({ rect: [x - 11, z - 1.6, x + 11, z + 1.6], color: '#cfd3d6' });
  ctx.minimap.push({ rect: [x - 1, z - 13, x + 3, z + 13], color: '#cfd3d6' });
}

// Stunt Park: kicker alley, bus jump, halfpipe, quarter pipe, loop, MX track, trials and crowds.
import * as THREE from 'three';
import { SURF } from './layout.js';
import { catmullRom } from '../core/math.js';
import { kickerProfile, landingProfile, quarterProfile, halfpipeProfile, tabletopProfile, rollersProfile, rampProfile } from './solids.js';

const E = Math.PI / 2; // facing +x
const W = -Math.PI / 2; // facing -x

export function buildStuntPark(ctx) {
  kickerAlley(ctx);
  lineB(ctx);
  halfpipe(ctx);
  loop(ctx);
  mxTrack(ctx);
  trials(ctx);
  decor(ctx);
}

function wood(ctx, o, extra = {}) {
  return ctx.addSolid({ surface: SURF.wood, kind: 'kicker', ...o }, { top: 'wood', side: 'woodSide', uv: 4, ...extra });
}
function dirt(ctx, o) {
  return ctx.addSolid({ surface: SURF.dirt, kind: 'landing', ...o }, { top: 'dirt', side: 'dirt', uv: 6 });
}

function kickerAlley(ctx) {
  const z = -200;
  const jumps = [
    { L: 6, lip: 32, gap: 12, H: 1.75, deck: 4, down: 22, dl: 10, name: 'Kicker Gap S', pts: 500 },
    { L: 8, lip: 35, gap: 20, H: 2.6, deck: 5, down: 25, dl: 14, name: 'Kicker Gap M', pts: 900 },
    { L: 10, lip: 38, gap: 28, H: 3.5, deck: 6, down: 27, dl: 18, name: 'Kicker Gap L', pts: 1400 },
    { L: 16, lip: 44, gap: 36, H: 6.5, deck: 6, down: 30, dl: 26, name: 'Mega Gap', pts: 2500 },
  ];
  let x = -150;
  jumps.forEach((j, i) => {
    const tagK = 'kick' + i;
    const tagL = 'land' + i;
    wood(ctx, { cx: x + j.L / 2, cz: z, yaw: E, hx: 6, hz: j.L / 2, profile: kickerProfile(j.L, j.lip), tag: tagK, name: j.name });
    const lipX = x + j.L;
    const lp = landingProfile(j.H, 40, j.deck, j.down, j.dl);
    const upLen = j.H / Math.tan((40 * Math.PI) / 180);
    const total = lp[lp.length - 1][0];
    const start = lipX + j.gap - upLen;
    dirt(ctx, { cx: start + total / 2, cz: z, yaw: E, hx: 8, hz: total / 2, profile: lp, tag: tagL });
    ctx.gapZones.push({ name: j.name, points: j.pts, from: [tagK], to: [tagL] });
    // flags on the landing deck
    ctx.addFlag(start + upLen, j.H, z - 8.5, i % 2 ? '#ff6a00' : '#ff2a2a');
    ctx.addFlag(start + upLen, j.H, z + 8.5, i % 2 ? '#ff6a00' : '#ff2a2a');
    if (i === 3) {
      ctx.stars.push({ x: lipX + 21, y: 17.5, z });
      ctx.landmarks.push({ x: lipX, z, label: 'MEGA' });
    }
    x = start + total + 30;
  });
  ctx.addBanner(-160, 7.5, z, W, 14, 3.2, 'KICKER ALLEY', '#111', '#ff6a00', 'S • M • L • MEGA', false, true);
}

function lineB(ctx) {
  const z = -120;
  const x0 = 230;
  const at = (s) => x0 - s;
  // bus jump
  const kl = 8;
  wood(ctx, { cx: at(40 + kl / 2), cz: z, yaw: W, hx: 5, hz: kl / 2, profile: kickerProfile(kl, 32), tag: 'busKicker', name: 'Bus Jump' });
  const lipS = 40 + kl;
  for (let k = 0; k < 5; k++) ctx.addBus(at(lipS + 5 + k * 3.1), z, 0);
  const lp = landingProfile(3.6, 40, 4, 25, 10);
  const upLen = 3.6 / Math.tan((40 * Math.PI) / 180);
  const total = lp[lp.length - 1][0];
  const startS = lipS + 24 - upLen;
  dirt(ctx, { cx: at(startS + total / 2), cz: z, yaw: W, hx: 7, hz: total / 2, profile: lp, tag: 'busLanding' });
  ctx.gapZones.push({ name: 'Bus Jump', points: 1600, from: ['busKicker'], to: ['busLanding'] });
  ctx.stars.push({ x: at(lipS + 11), y: 7.2, z });
  ctx.landmarks.push({ x: at(lipS + 10), z, label: 'BUS' });
  // rollers
  dirt(ctx, { cx: at(130), cz: z, yaw: W, hx: 6, hz: 20, profile: rollersProfile(4, 1.1, 10), tag: 'rollers' });
  // tabletop
  const tt = tabletopProfile(2.4, 24, 9, 22);
  const tl = tt[tt.length - 1][0];
  dirt(ctx, { cx: at(185 + tl / 2), cz: z, yaw: W, hx: 7, hz: tl / 2, profile: tt, tag: 'table' });
  // funbox & spine
  const fb = tabletopProfile(2.2, 26, 8, 26);
  const fl = fb[fb.length - 1][0];
  wood(ctx, { cx: -70, cz: -45, yaw: E, hx: 5, hz: fl / 2, profile: fb, kind: 'ramp' });
  wood(ctx, { cx: -70, cz: -45, yaw: 0, hx: 5, hz: fl / 2, profile: fb, kind: 'ramp' });
  const sp = [];
  const R = 4;
  const th = (55 * Math.PI) / 180;
  const lipU = R * Math.sin(th);
  for (let i = 0; i <= 10; i++) {
    const a = (th * i) / 10;
    sp.push([R * Math.sin(a), R * (1 - Math.cos(a))]);
  }
  for (let i = 10; i >= 0; i--) {
    const a = (th * i) / 10;
    sp.push([2 * lipU + 0.3 - R * Math.sin(a), R * (1 - Math.cos(a))]);
  }
  const len2 = 2 * lipU;
  wood(ctx, { cx: 30, cz: -45, yaw: E, hx: 6, hz: (len2 + 0.3) / 2, profile: sp, kind: 'ramp', tag: 'spine' }, { top: 'metal' });
  ctx.landmarks.push({ x: -70, z: -45, label: 'FUNBOX' });
}

function halfpipe(ctx) {
  const hp = halfpipeProfile(6, 74, 10, 3);
  const cx = 150;
  const cz = 70;
  const hx = 35;
  ctx.addSolid({ cx, cz, yaw: 0, hx, hz: hp.width / 2, profile: hp.pts, surface: SURF.wood, kind: 'halfpipe', vert: true, tag: 'halfpipe' }, { top: 'metal', side: 'steelDark', uv: 3 });
  // coping rails
  const lipZ = [cz - hp.width / 2 + 3, cz + hp.width / 2 - 3];
  for (const lz of lipZ) {
    const g = new THREE.CylinderGeometry(0.12, 0.12, hx * 2, 8);
    g.rotateZ(Math.PI / 2);
    g.translate(cx, hp.lipH + 0.05, lz);
    ctx.batch.add('steel', g);
  }
  ctx.addBanner(cx, hp.lipH + 4.2, cz - hp.width / 2 + 0.6, 0, 16, 3.2, 'HALFPIPE', '#111', '#ff6a00', 'GO VERT', false, true);
  ctx.stars.push({ x: cx + 12, y: hp.lipH + 6.2, z: lipZ[0] + 1.8 });
  ctx.landmarks.push({ x: cx, z: cz, label: 'HALFPIPE' });
  // big quarter pipe at the east end
  const qp = quarterProfile(7, 76, 3);
  const ql = qp[qp.length - 1][0];
  ctx.addSolid({ cx: 240 - ql / 2, cz: -20, yaw: E, hx: 12, hz: ql / 2, profile: qp, surface: SURF.wood, kind: 'quarter', vert: true, tag: 'quarter' }, { top: 'metal', side: 'steelDark', uv: 3 });
  ctx.stars.push({ x: 236, y: 13, z: -20 });
}

function loop(ctx) {
  const def = { x: -110, z: 40, y: 0, yaw: E, R: 8.5, shift: 7, width: 5 };
  ctx.loops.push(def);
  const f = new THREE.Vector3(Math.sin(def.yaw), 0, Math.cos(def.yaw));
  const r = new THREE.Vector3(-Math.cos(def.yaw), 0, Math.sin(def.yaw));
  const up = new THREE.Vector3(0, 1, 0);
  const P = (th) => new THREE.Vector3(def.x, def.y, def.z).addScaledVector(f, def.R * Math.sin(th)).addScaledVector(up, def.R * (1 - Math.cos(th))).addScaledVector(r, (def.shift * th) / (Math.PI * 2));
  const pos = [];
  const uv = [];
  const idx = [];
  const N = 72;
  const T = 0.04; // track thickness offset below the riding surface
  for (let i = 0; i <= N; i++) {
    const th = -0.15 + ((Math.PI * 2 + 0.3) * i) / N;
    const p = P(th);
    // inward normal (toward loop centre)
    const nrm = new THREE.Vector3().addScaledVector(f, -Math.sin(th)).addScaledVector(up, Math.cos(th));
    for (const s of [-1, 1]) {
      const q = p.clone().addScaledVector(r, (s * def.width) / 2).addScaledVector(nrm, -T + 0.02);
      pos.push(q.x, Math.max(q.y, 0.03), q.z);
      uv.push(s < 0 ? 0 : 1, i / 6);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, ctx.mats.loopTrack);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  // side rails and support legs
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const th = (Math.PI * 2 * i) / 48;
      const nrm = new THREE.Vector3().addScaledVector(f, -Math.sin(th)).addScaledVector(up, Math.cos(th));
      pts.push(P(th).addScaledVector(r, (s * (def.width + 0.4)) / 2).addScaledVector(nrm, 0.25));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false);
    ctx.batch.add('paintOrange', new THREE.TubeGeometry(curve, 96, 0.14, 6, false));
  }
  for (const th of [Math.PI * 0.5, Math.PI * 1.5]) {
    const p = P(th);
    for (const s of [-1, 1]) {
      const top = p.clone().addScaledVector(r, s * (def.width / 2 + 0.6));
      const leg = new THREE.CylinderGeometry(0.22, 0.3, top.y, 8);
      leg.translate(top.x, top.y / 2, top.z);
      ctx.batch.add('steel', leg);
    }
  }
  const top = P(Math.PI);
  ctx.stars.push({ x: top.x, y: top.y - 1.2, z: top.z });
  ctx.landmarks.push({ x: def.x, z: def.z, label: 'LOOP' });
  // entry & exit marker plates
  ctx.addBanner(def.x - 6, 4.5, def.z - 4, W, 6, 1.6, 'LOOP', '#111', '#ff6a00', '70+ KM/H', false, true);
}

function ribbonGeo(points, width, y, closed) {
  const pos = [];
  const uv = [];
  const idx = [];
  const n = points.length;
  let dist = 0;
  const count = closed ? n + 1 : n;
  for (let i = 0; i < count; i++) {
    const p = points[i % n];
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    if (i > 0) dist += Math.hypot(p[0] - points[(i - 1) % n][0], p[1] - points[(i - 1) % n][1]);
    pos.push(p[0] + tz * width * 0.5, y, p[1] - tx * width * 0.5, p[0] - tz * width * 0.5, y, p[1] + tx * width * 0.5);
    uv.push(0, dist / (width * 2), 1, dist / (width * 2));
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

function mxTrack(ctx) {
  const ctrl = [[-235, 108], [-40, 104], [45, 125], [65, 185], [25, 245], [-120, 248], [-238, 238], [-252, 172]];
  const pts = catmullRom(ctrl, 3, true);
  ctx.mxTrack = pts;
  const g = ribbonGeo(pts, 10, 0.05, true);
  const mesh = new THREE.Mesh(g, ctx.mats.track);
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  // arc length table
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const at = (d) => {
    let i = 1;
    while (i < s.length - 1 && s[i] < d) i++;
    const t = (d - s[i - 1]) / (s[i] - s[i - 1]);
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
    const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
    const yaw = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { x, z, yaw };
  };
  const place = (d, profile, tag) => {
    const len = profile[profile.length - 1][0];
    const c = at(d + len / 2);
    dirt(ctx, { cx: c.x, cz: c.z, yaw: c.yaw, hx: 5, hz: len / 2, profile, tag, kind: 'mx' });
  };
  place(20, rollersProfile(6, 0.7, 5), 'whoops');
  place(70, tabletopProfile(2.2, 26, 7, 24), 'mxTable');
  // double: two humps
  const hump = tabletopProfile(2.0, 30, 1.2, 30);
  place(118, hump, 'mxDoubleA');
  place(118 + hump[hump.length - 1][0] + 13, hump, 'mxDoubleB');
  ctx.gapZones.push({ name: 'MX Double', points: 700, from: ['mxDoubleA'], to: ['mxDoubleB'] });
  place(330, tabletopProfile(1.6, 22, 3, 22), 'mxBump');
  place(400, rollersProfile(5, 0.9, 6), 'whoops2');
  place(470, [[0, 0], [5, 1.8], [12, 1.8], [12.5, 1.6], [16, 0]], 'stepup');
  // tire walls along the edges
  for (let d = 0; d < s[s.length - 1]; d += 6) {
    const c = at(d);
    const nx = Math.cos(c.yaw);
    const nz = -Math.sin(c.yaw);
    ctx.addTire(c.x + nx * 6.2, c.z + nz * 6.2);
    if (d % 12 === 0) ctx.addTire(c.x - nx * 6.2, c.z - nz * 6.2);
  }
  // start/finish gate
  const sf = at(0);
  ctx.addArch(sf.x, sf.z, sf.yaw, 12, 'START / FINISH');
  ctx.landmarks.push({ x: -100, z: 180, label: 'MX TRACK' });
}

function trials(ctx) {
  const x0 = -252;
  // stairs to a drop
  for (let k = 0; k < 6; k++) {
    ctx.addSolid({ cx: x0 + 1.1 + k * 2.2, cz: -152, hx: 1.1, hz: 3, h: 0.4 * (k + 1), surface: SURF.wood, kind: 'prop' }, { top: 'wood', side: 'woodSide' });
  }
  ctx.addSolid({ cx: x0 + 13.2 + 4, cz: -152, hx: 4, hz: 3, h: 2.4, surface: SURF.wood, kind: 'prop', tag: 'trialsTop' }, { top: 'wood', side: 'woodSide' });
  ctx.stars.push({ x: x0 + 19, y: 3.8, z: -152 });
  // balance beam
  ctx.addSolid({ cx: x0 + 3, cz: -112, yaw: E, hx: 0.75, hz: 3, profile: rampProfile(6, 1.2), surface: SURF.wood, kind: 'ramp' }, { top: 'wood', side: 'woodSide' });
  ctx.addSolid({ cx: x0 + 6 + 13, cz: -112, hx: 13, hz: 0.75, h: 1.2, surface: SURF.wood, kind: 'prop', tag: 'beam' }, { top: 'wood', side: 'woodSide' });
  ctx.addSolid({ cx: x0 + 32 + 3, cz: -112, yaw: W, hx: 0.75, hz: 3, profile: rampProfile(6, 1.2), surface: SURF.wood, kind: 'ramp' }, { top: 'wood', side: 'woodSide' });
  // logs
  ctx.addSolid({ cx: x0 + 14, cz: -132, yaw: E, hx: 2.5, hz: 12, profile: rollersProfile(6, 0.45, 4), surface: SURF.wood, kind: 'prop' }, { top: 'wood', side: 'woodSide' });
  // drop platform
  ctx.addSolid({ cx: x0 + 8, cz: -172, yaw: E, hx: 3, hz: 8, profile: rampProfile(16, 3.2), surface: SURF.wood, kind: 'ramp' }, { top: 'wood', side: 'woodSide' });
  ctx.addSolid({ cx: x0 + 20, cz: -172, hx: 4, hz: 3, h: 3.2, surface: SURF.wood, kind: 'prop' }, { top: 'wood', side: 'woodSide' });
  ctx.addBanner(x0 + 14, 4, -93, 0, 12, 2.6, 'TRIALS', '#111', '#ff6a00', 'BALANCE • STEPS • DROPS', false, true);
  ctx.landmarks.push({ x: -220, z: -135, label: 'TRIALS' });
}

function decor(ctx) {
  const rng = ctx.rng;
  // concrete plaza at the entrance
  ctx.addSolid({ cx: -219, cz: 0, hx: 43, hz: 70, h: 0.06, y0: 0, surface: SURF.concrete, kind: 'slab' }, { top: 'concrete', side: 'concrete', uv: 8 });
  // bleachers along the north edge, with spectators
  const bz0 = -258;
  for (let k = 0; k < 4; k++) {
    const h = 0.9 * (k + 1);
    const z0 = bz0 + (3 - k) * 3.5;
    ctx.addSolid({ cx: 30, cz: z0 + 1.75, hx: 170, hz: 1.75, h, surface: SURF.concrete, kind: 'prop' }, { top: 'concrete', side: 'paintWhite', uv: 3 });
    for (let x = -136; x < 196; x += 1.3) {
      if (rng.chance(0.25)) continue;
      ctx.addPerson(x + rng.float(-0.3, 0.3), h, z0 + 1.6, 0);
    }
  }
  // spectators by the halfpipe and loop
  for (let i = 0; i < 60; i++) ctx.addPerson(rng.float(118, 182), 0, rng.float(88, 94), Math.PI);
  for (let i = 0; i < 30; i++) ctx.addPerson(rng.float(-130, -90), 0, rng.float(58, 64), Math.PI);
  // light towers
  for (const [x, z] of [[-245, -245], [245, -245], [245, 245], [-245, 245], [0, -235], [100, 100]]) {
    ctx.addLightTower(x, z);
  }
  // entrance arch
  ctx.addArch(-258, 0, E, 30, 'STUNT PARK');
  // sponsor banners along kicker alley fence
  const names = [['NITRO FUEL', '#ff6a00'], ['EOJ RACING', '#ffcc00'], ['TURBO COLA', '#ff2a2a'], ['STUNT RIDER 3D', '#ff6a00']];
  for (let i = 0; i < 8; i++) {
    const nm = names[i % names.length];
    ctx.addBanner(-120 + i * 40, 1.2, -228, 0, 10, 1.6, nm[0], '#121212', nm[1], '', false, true);
  }
  // hay bales on MX corners
  for (const [x, z] of [[55, 140], [60, 205], [-245, 200], [-240, 135], [35, 238]]) {
    for (let k = 0; k < 3; k++) ctx.addHay(x + rng.float(-3, 3), z + rng.float(-3, 3), rng.float(0, 3));
  }
  // jersey barriers to separate lanes
  for (let x = -170; x < 220; x += 6) {
    if ((x + 170) % 72 < 12) continue;
    ctx.addBarrier(x, -160, 0);
  }
}

// Countryside: forests, rocks, farms, wind turbines, the lake and distant mountains.
import * as THREE from 'three';
import { fbm, noise2, Rng, smoothstep } from '../core/math.js';
import { ZONES, LAKE, FIELDS, QUARRY, WATER_LEVEL, inRect, SURF } from './layout.js';
import { kickerProfile, landingProfile } from './solids.js';
import { waterNormalTexture } from './textures.js';

export function buildNature(ctx) {
  const rng = new Rng(77);
  const terrain = ctx.terrain;
  const roads = ctx.roads;
  // ---- trees ----
  const step = 12;
  for (let x = -1196; x < 1196; x += step) {
    for (let z = -1196; z < 1196; z += step) {
      const px = x + rng.float(-4.5, 4.5);
      const pz = z + rng.float(-4.5, 4.5);
      let skip = false;
      for (const zn of ZONES) {
        if (inRect(zn.rect, px, pz, zn.id === 'lake' ? -40 : 14)) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      const lx = (px - LAKE.cx) / LAKE.rx;
      const lz = (pz - LAKE.cz) / LAKE.rz;
      if (lx * lx + lz * lz < 1.7) continue;
      if (FIELDS.some((f) => inRect(f.rect, px, pz, 6))) continue;
      if (inRect(QUARRY.rect, px, pz, 10)) continue;
      const edge = Math.max(Math.abs(px), Math.abs(pz));
      const h = terrain.height(px, pz);
      const forest = fbm(px * 0.0032 + 11, pz * 0.0032 - 5, 3);
      let p = forest > 0.06 ? 0.75 : forest > -0.05 ? 0.12 : 0.03;
      if (edge > 1110) p = h < 190 ? 0.55 : 0.05;
      if (!rng.chance(p)) continue;
      if (roads.edgeDist(px, pz, 24) < 5) continue;
      const ne = px > 200 && pz < 330;
      const r = rng.next();
      const kind = ne || edge > 1110 ? (r < 0.8 ? 'pine' : 'birch') : r < 0.5 ? 'oak' : r < 0.72 ? 'birch' : 'pine';
      ctx.addTree(px, pz, kind, rng.float(0.8, 1.45), h, edge < 1150);
    }
  }
  // ---- rocks & bushes ----
  for (let i = 0; i < 520; i++) {
    const x = rng.float(-1150, 1150);
    const z = rng.float(-1150, 1150);
    if (ZONES.some((zn) => inRect(zn.rect, x, z, 8))) continue;
    if (roads.edgeDist(x, z, 24) < 4) continue;
    const lx = (x - LAKE.cx) / LAKE.rx;
    const lz = (z - LAKE.cz) / LAKE.rz;
    if (lx * lx + lz * lz < 1.1) continue;
    const s = rng.float(0.5, 2.6);
    if (i % 2) ctx.addBush(x, z, rng.float(0.7, 1.6));
    else ctx.addRock(x, z, s);
  }
  // ---- farms ----
  for (const f of FIELDS) {
    const [x0, z0, x1, z1] = f.rect;
    for (let x = x0; x <= x1; x += 4) {
      ctx.addPost(x, z0);
      ctx.addPost(x, z1);
    }
    for (let z = z0; z <= z1; z += 4) {
      ctx.addPost(x0, z);
      ctx.addPost(x1, z);
    }
    for (const [ax, az, bx, bz] of [
      [x0, z0, x1, z0],
      [x0, z1, x1, z1],
      [x0, z0, x0, z1],
      [x1, z0, x1, z1],
    ]) {
      const len = Math.hypot(bx - ax, bz - az);
      for (const yy of [0.55, 0.95]) {
        const g = new THREE.BoxGeometry(bx === ax ? 0.08 : len, 0.1, bx === ax ? len : 0.08);
        g.translate((ax + bx) / 2, terrain.height((ax + bx) / 2, (az + bz) / 2) + yy, (az + bz) / 2);
        ctx.batch.add('woodSide', g);
      }
    }
    if (f.kind === 'wheat') {
      for (let k = 0; k < 10; k++) {
        const x = rng.float(x0 + 8, x1 - 8);
        const z = rng.float(z0 + 8, z1 - 8);
        ctx.addHay(x, z, rng.float(0, 3), terrain.height(x, z));
      }
    }
  }
  barn(ctx, -860, 610);
  barn(ctx, -150, 1040);
  // ---- wind turbines on the highest hills in the north-east ----
  const cands = [];
  for (let x = 320; x < 1060; x += 30) {
    for (let z = -520; z < 280; z += 30) {
      if (roads.edgeDist(x, z, 32) < 20) continue;
      cands.push([x, z, terrain.height(x, z)]);
    }
  }
  cands.sort((a, b) => b[2] - a[2]);
  const picked = [];
  for (const c of cands) {
    if (picked.length >= 6) break;
    if (picked.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 160)) continue;
    picked.push(c);
  }
  for (const [x, z, h] of picked) ctx.addTurbine(x, h, z);
  // ---- lake with a jump across it ----
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2).scale(LAKE.rx * 1.03, 1, LAKE.rz * 1.03),
    new THREE.MeshStandardMaterial({ color: '#2a6f8e', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.86, normalMap: waterNormalTexture(), normalScale: new THREE.Vector2(0.35, 0.35) }),
  );
  water.material.normalMap.repeat.set(18, 6);
  water.position.set(LAKE.cx, WATER_LEVEL, LAKE.cz);
  water.receiveShadow = true;
  ctx.scene.add(water);
  ctx.animated.push({
    update(dt, t) {
      water.material.normalMap.offset.set(t * 0.012, t * 0.007);
    },
  });
  const kx = LAKE.cx;
  const kl = 12;
  const kz0 = LAKE.cz - LAKE.rz * 1.06 - kl;
  const ky = terrain.height(kx, kz0);
  ctx.addSolid({ cx: kx, cz: kz0 + kl / 2, yaw: 0, hx: 4, hz: kl / 2, y0: ky, profile: kickerProfile(kl, 31), surface: SURF.wood, kind: 'kicker', tag: 'lakeKicker', name: 'Lake Jump' }, { top: 'wood', side: 'woodSide' });
  const lp = landingProfile(4.4, 38, 6, 17, 18);
  const ll = lp[lp.length - 1][0];
  const lz0 = LAKE.cz + LAKE.rz * 1.02;
  ctx.addSolid({ cx: kx, cz: lz0 + ll / 2, yaw: 0, hx: 8, hz: ll / 2, y0: terrain.height(kx, lz0) - 0.2, profile: lp, surface: SURF.dirt, kind: 'landing', tag: 'lakeLanding' }, { top: 'dirt', side: 'dirt' });
  ctx.gapZones.push({ name: 'Lake Jump', points: 3000, from: ['lakeKicker'], to: ['lakeLanding'], toRect: [kx - 16, lz0, kx + 16, lz0 + 70] });
  ctx.stars.push({ x: kx, y: 15.5, z: LAKE.cz - 4 });
  ctx.landmarks.push({ x: kx, z: LAKE.cz, label: 'LAKE JUMP' });
  ctx.addBanner(kx - 7, ky + 4, kz0 + 2, Math.PI, 9, 2, 'LAKE JUMP', '#111', '#ff6a00', '110 KM/H+', false, true);
  // wooden pier
  ctx.addSolid({ cx: LAKE.cx + 110, cz: LAKE.cz + 30, hx: 1.6, hz: 18, h: 0.4, y0: WATER_LEVEL + 0.5, surface: SURF.wood, kind: 'prop' }, { top: 'wood', side: 'woodSide' });
  // ---- distant mountains ring (visual only) ----
  ctx.scene.add(mountainRing());
  // ---- birds ----
  birds(ctx);
}

function barn(ctx, x, z) {
  const y = ctx.terrain.height(x, z);
  const w = 18;
  const d = 26;
  const h = 8;
  const body = new THREE.BoxGeometry(w, h, d);
  body.translate(x, y + h / 2, z);
  ctx.batch.add('barnRed', body);
  const roof = new THREE.CylinderGeometry(w * 0.62, w * 0.62, d + 1, 3, 1);
  roof.rotateX(Math.PI / 2);
  roof.rotateZ(Math.PI / 2);
  roof.scale(1, 0.55, 1);
  roof.translate(x, y + h + 2.2, z);
  ctx.batch.add('roofDark', roof);
  ctx.addSolid({ cx: x, cz: z, hx: w / 2, hz: d / 2, h: h + 2, y0: y, surface: SURF.wood, kind: 'building' }, { mesh: false });
  ctx.minimap.push({ rect: [x - w / 2, z - d / 2, x + w / 2, z + d / 2], color: '#7a2f25' });
  const silo = new THREE.CylinderGeometry(3, 3, 14, 14);
  silo.translate(x + w / 2 + 5, y + 7, z - 6);
  ctx.batch.add('steel', silo);
  ctx.addSolid({ cx: x + w / 2 + 5, cz: z - 6, hx: 3, hz: 3, h: 14, y0: y, surface: SURF.metal, kind: 'building' }, { mesh: false });
}

function mountainRing() {
  const segs = 160;
  const rings = 7;
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  const haze = new THREE.Color('#c4d3df');
  const rock = new THREE.Color('#6f8191');
  const snow = new THREE.Color('#f1f5f8');
  for (let r = 0; r <= rings; r++) {
    const rad = 1300 + r * 260;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const ridge = 1 - Math.abs(noise2(Math.cos(a) * 3.2 + r * 0.55, Math.sin(a) * 3.2 - r * 0.35));
      let h = (40 + 380 * ridge * ridge + 140 * fbm(x * 0.002, z * 0.002, 3)) * smoothstep(0, 3, r);
      if (r === rings) h *= 0.3;
      pos.push(x, h - 10, z);
      const t = smoothstep(0, 320, h);
      c.copy(haze).lerp(rock, t * (1 - r / (rings + 3)));
      if (h > 330) c.lerp(snow, smoothstep(330, 420, h));
      col.push(c.r, c.g, c.b);
      if (r > 0 && s > 0) {
        const a0 = (r - 1) * (segs + 1) + s - 1;
        const a1 = a0 + 1;
        const b0 = r * (segs + 1) + s - 1;
        const b1 = b0 + 1;
        idx.push(a0, a1, b0, a1, b1, b0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  m.matrixAutoUpdate = false;
  m.frustumCulled = false;
  m.renderOrder = -5;
  return m;
}

function birds(ctx) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, -0.9, 0.15, -0.1, 0, 0, -0.2, 0, 0, 0.3, 0, 0, -0.2, 0.9, 0.15, -0.1], 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: '#1d1f22', side: THREE.DoubleSide });
  const flocks = [
    { cx: 600, cz: -200, r: 140, y: 80, n: 8 },
    { cx: -600, cz: 800, r: 180, y: 60, n: 7 },
    { cx: 0, cz: 0, r: 260, y: 95, n: 9 },
  ];
  const total = flocks.reduce((a, f) => a + f.n, 0);
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  mesh.frustumCulled = false;
  ctx.scene.add(mesh);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  ctx.animated.push({
    update(dt, t) {
      let i = 0;
      for (const f of flocks) {
        for (let k = 0; k < f.n; k++) {
          const a = t * 0.12 + (k / f.n) * 0.6 + f.cx;
          const off = (k % 3) * 3 - 3;
          p.set(f.cx + Math.cos(a) * (f.r + off), f.y + Math.sin(t * 0.7 + k) * 2, f.cz + Math.sin(a) * (f.r + off));
          e.set(0, -a, 0);
          q.setFromEuler(e);
          const flap = 0.4 + 0.6 * Math.abs(Math.sin(t * 9 + k * 1.3));
          s.set(2.2, 2.2 * flap, 2.2);
          m.compose(p, q, s);
          mesh.setMatrixAt(i++, m);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  });
}

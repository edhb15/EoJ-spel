// Hand-placed sites on top of the STL city: the overrun military base in Slottsskogen,
// the research facility at Medicinareberget and the quarantine fence around the red zone.
import * as THREE from 'three';
import { F } from './collision.js';
import { ZONES } from './locations.js';
import { vehicleGeo, part, VEH } from './props.js';
import { merge } from './structure.js';
import { textTexture } from '../render/textures.js';
import { seeded } from '../core/util.js';

export class Sites {
  constructor(game) {
    this.g = game;
    this.metal = []; this.rough = [];
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25, map: game.tex.metal });
    this.matRough = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.militaryBase(ZONES.find(z => z.id === 'militar'));
    this.research(ZONES.find(z => z.id === 'forskning'));
    for (const zn of ZONES.filter(z => z.type === 'safe')) this.camp(zn);
    const add = (geos, mat) => { if (!geos.length) return; const m = new THREE.Mesh(merge(geos), mat); m.castShadow = m.receiveShadow = true; game.scene.add(m); };
    add(this.metal, this.mat); add(this.rough, this.matRough);
    this.fence();
  }
  spot(x, z, r = 12) { const s = this.g.findOpenSpot(x, z, r); return { ...s, y: this.g.world.groundHeight(s.x, s.z) }; }
  sign(text, x, y, z, rotY, w = 4, bg = '#3e4a2e') {
    const tex = textTexture(text, { w: 1024, h: 160, bg, fg: '#fff', font: 'bold 64px sans-serif' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 160 / 1024), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 }));
    m.position.set(x, y, z); m.rotation.y = rotY; this.g.scene.add(m);
    part(this.metal, new THREE.CylinderGeometry(0.06, 0.06, y - 0.2 - (y - 2.5), 6), 0x555555, x, y - 1.2, z, 0, 0, 0, 0);
  }
  tent(x, z, yaw, color = 0x4b5634, w = 6, d = 4) {
    const y = this.g.world.groundHeight(x, z);
    part(this.rough, new THREE.BoxGeometry(w, 1.6, d), color, x, y, z, yaw, 0, 0.8, 0);
    const roof = new THREE.CylinderGeometry(0.01, d * 0.72, w, 4, 1); roof.rotateZ(Math.PI / 2); roof.rotateX(Math.PI / 4); roof.scale(1, 0.55, 1);
    part(this.rough, roof, color, x, y, z, yaw, 0, 2.05, 0);
    this.g.collision.addBox(x, z, yaw, w / 2, d / 2, y - 0.3, y + 2.5, F.ALL, 'tent');
  }
  crate(x, z, id, label, table, fixed) {
    const y = this.g.world.groundHeight(x, z);
    part(this.rough, new THREE.BoxGeometry(1.2, 0.7, 0.8), 0x3e4a2e, x, y, z, 0.3, 0, 0.35, 0);
    this.g.collision.addBox(x, z, 0.3, 0.6, 0.4, y - 0.3, y + 0.7, F.PLAYER | F.ZOMBIE, 'crate');
    this.g.loot.container({ id, x, y: y + 0.8, z, label, table, fixed, r: 2.4, hold: 1.6 });
  }
  militaryBase(zn) {
    const g = this.g, rng = seeded(77);
    // perimeter of sandbag walls with two openings
    for (let a = 0; a < Math.PI * 2; a += 0.11) {
      if (Math.abs(a - 1.2) < 0.25 || Math.abs(a - 4.3) < 0.25) continue;
      const x = zn.x + Math.cos(a) * 34, z = zn.z + Math.sin(a) * 34; const y = g.world.groundHeight(x, z);
      if (!g.isWalkable(x, z, 0.8)) continue;
      const yaw = -a;
      part(this.rough, new THREE.BoxGeometry(0.9, 1.25, 3.9), 0x8a7a56, x, y, z, yaw, 0, 0.62, 0);
      g.collision.addBox(x, z, yaw, 0.45, 1.95, y - 0.3, y + 1.25, F.ALL & ~F.SIGHT, 'sandbags');
    }
    for (let i = 0; i < 5; i++) { const s = this.spot(zn.x + (rng() - 0.5) * 40, zn.z + (rng() - 0.5) * 40); this.tent(s.x, s.z, rng() * 3); }
    const vt = ['military', 'military', 'military', 'ambulance'];
    vt.forEach((type, i) => {
      const s = this.spot(zn.x + (rng() - 0.5) * 50, zn.z + (rng() - 0.5) * 50, 15); const V = VEH[type];
      const v = { x: s.x, z: s.z, y: s.y, yaw: rng() * 6.28, type, burnt: i === 2, color: 0, tilt: 0, open: false };
      vehicleGeo(v, this.metal, this.rough);
      g.collision.addBox(v.x, v.z, v.yaw, V.W / 2, V.L / 2, v.y - 0.5, v.y + V.H, F.ALL, { metal: true });
      if (!v.burnt) g.loot.container({ id: `fixMB_v${i}`, x: v.x, y: v.y + 1, z: v.z, label: V.label, table: V.table, r: 4.5, hold: 1.8 });
      if (v.burnt) g.fx.addEmitter(v.x, v.y + 1, v.z, 'fire', 1.1);
    });
    // watchtower
    const t = this.spot(zn.x + 15, zn.z - 15);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) part(this.rough, new THREE.BoxGeometry(0.2, 5, 0.2), 0x5a4a32, t.x, t.y, t.z, 0, dx * 1.2, 2.5, dz * 1.2);
    part(this.rough, new THREE.BoxGeometry(3, 0.2, 3), 0x5a4a32, t.x, t.y, t.z, 0, 0, 5, 0);
    part(this.rough, new THREE.BoxGeometry(3, 1, 0.1), 0x4b5634, t.x, t.y, t.z, 0, 0, 5.6, 1.5);
    const s0 = this.spot(zn.x, zn.z); this.crate(s0.x + 2, s0.z, 'fixMB_rifle', 'Vapenlåda – Försvarsmakten', 'military', [['w_rifle', 1], ['ammo_556', 30], ['medkit', 1]]);
    for (let i = 0; i < 4; i++) { const s = this.spot(zn.x + (rng() - 0.5) * 44, zn.z + (rng() - 0.5) * 44); this.crate(s.x, s.z, `fixMB_c${i}`, 'Ammunitionslåda', i === 0 ? 'supply' : 'military'); }
    const e = this.spot(zn.x + Math.cos(1.2) * 38, zn.z + Math.sin(1.2) * 38);
    this.sign('FÖRSVARSMAKTEN – MILITÄRT SKYDDSOMRÅDE', e.x, e.y + 2.6, e.z, -1.2 + Math.PI / 2, 5);
  }
  research(zn) {
    const g = this.g, rng = seeded(91);
    for (let i = 0; i < 6; i++) { // mobile lab containers
      const s = this.spot(zn.x + (rng() - 0.5) * 80, zn.z + (rng() - 0.5) * 80, 18); const yaw = rng() * 3;
      part(this.metal, new THREE.BoxGeometry(2.45, 2.6, 6.1), 0xd8d8d0, s.x, s.y, s.z, yaw, 0, 1.3, 0);
      part(this.metal, new THREE.BoxGeometry(2.5, 0.35, 6.15), 0xe0c020, s.x, s.y, s.z, yaw, 0, 2.2, 0);
      g.collision.addBox(s.x, s.z, yaw, 1.23, 3.05, s.y - 0.3, s.y + 2.6, F.ALL, { metal: true });
      g.loot.container({ id: `fixRF_${i}`, x: s.x, y: s.y + 1, z: s.z, label: i % 2 ? 'Mobilt laboratorium' : 'Medicinskt förråd', table: i % 2 ? 'pharmacy' : 'locker', r: 4.2, hold: 1.8 });
    }
    for (let i = 0; i < 3; i++) { const s = this.spot(zn.x + (rng() - 0.5) * 60, zn.z + (rng() - 0.5) * 60); this.tent(s.x, s.z, rng() * 3, 0xe8e8e0, 5, 5); }
    for (let i = 0; i < 16; i++) { // biohazard barrels
      const s = this.spot(zn.x + (rng() - 0.5) * 70, zn.z + (rng() - 0.5) * 70, 8);
      part(this.metal, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), rng() < 0.7 ? 0xd8b420 : 0x2a6a2a, s.x, s.y, s.z, 0, 0, 0.45, 0, rng() < 0.2 ? 1.57 : 0);
    }
    const s = this.spot(zn.x, zn.z);
    this.sign('BIOLOGISKT RISKOMRÅDE – OBEHÖRIGA ÄGA EJ TILLTRÄDE', s.x, s.y + 2.6, s.z, 0.3, 5.5, '#c8a400');
    this.crate(s.x + 2.5, s.z + 1, 'fixRF_crate', 'Forskarnas nödförråd', 'supply');
  }
  camp(zn) {
    const g = this.g, rng = seeded(Math.round(zn.x * 7 + zn.z));
    const colors = [0x3a5a7a, 0x6a4a2a, 0x4b5634, 0x7a2a2a];
    for (let i = 0; i < 3; i++) { const a = rng() * 6.28, r = 8 + rng() * (zn.r * 0.4); const s = this.spot(zn.x + Math.cos(a) * r, zn.z + Math.sin(a) * r, 10); this.tent(s.x, s.z, rng() * 3, colors[i % 4], 3.5, 2.6); }
    const f = this.spot(zn.x - 2, zn.z + 3, 8); // fire barrel – survivors keep warm
    part(this.metal, new THREE.CylinderGeometry(0.32, 0.3, 0.9, 10), 0x5a3a22, f.x, f.y, f.z, 0, 0, 0.45, 0);
    g.collision.addBox(f.x, f.z, 0, 0.32, 0.32, f.y - 0.2, f.y + 0.9, F.PLAYER | F.ZOMBIE, 'barrel');
    g.fx.addEmitter(f.x, f.y + 0.85, f.z, 'fire', 0.35);
    for (let i = 0; i < 4; i++) { const s = this.spot(zn.x + (rng() - 0.5) * 16, zn.z + (rng() - 0.5) * 16, 8); part(this.rough, new THREE.BoxGeometry(0.9, 0.6, 0.7), 0x7a5a36, s.x, s.y, s.z, rng() * 3, 0, 0.3, 0); }
    // a barricade ring of cars and pallets would block the NPCs; a few sandbag walls mark the perimeter instead
    for (let a = 0; a < 6.28; a += 0.9) {
      const x = zn.x + Math.cos(a) * zn.r * 0.95, z = zn.z + Math.sin(a) * zn.r * 0.95;
      if (!g.isWalkable(x, z, 1.2)) continue; const y = g.world.groundHeight(x, z);
      part(this.rough, new THREE.BoxGeometry(0.8, 0.9, 3.2), 0x8a7a56, x, y, z, -a, 0, 0.45, 0);
      g.collision.addBox(x, z, -a, 0.4, 1.6, y - 0.3, y + 0.9, F.PLAYER | F.ZOMBIE | F.BULLET, 'sandbags');
    }
  }
  fence() {
    const g = this.g, W = g.world, H = W.half - 4;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.strokeStyle = 'rgba(170,175,180,0.95)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.stroke();
    x.fillStyle = 'rgba(90,90,90,1)'; x.fillRect(0, 0, 64, 3);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const pos = [], uv = [], idx = [];
    const sides = [[-H, -H, H, -H], [H, -H, H, H], [H, H, -H, H], [-H, H, -H, -H]];
    for (const [x0, z0, x1, z1] of sides) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 8);
      const base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t, gy = Math.max(W.terrainHeight(px, pz), 0.5);
        pos.push(px, gy - 0.3, pz, px, gy + 3.6, pz); uv.push(t * L / 1.2, 0, t * L / 1.2, 3.9 / 1.2);
        if (i < n) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }));
    g.scene.add(m);
    // warning signs along the fence; toward the city centre the famous places lie outside this tile
    for (const [x0, z0, x1, z1] of sides) {
      const L = Math.hypot(x1 - x0, z1 - z0);
      for (let d = 120; d < L; d += 260) {
        const t = d / L, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t; const ix = px - Math.sign(px) * (Math.abs(px) > H - 1 ? 1.5 : 0), iz = pz - Math.sign(pz) * (Math.abs(pz) > H - 1 ? 1.5 : 0);
        const gy = W.terrainHeight(ix, iz);
        const rot = Math.abs(pz) > H - 1 ? (pz < 0 ? 0 : Math.PI) : (px < 0 ? Math.PI / 2 : -Math.PI / 2);
        const ne = (pz < -H + 1 && px > 600) || (px > H - 1 && pz < -600);
        this.sign(ne ? 'AVSPÄRRAT → Nordstan · Brunnsparken · Avenyn · Liseberg · Ullevi' : 'RÖD ZON – MILITÄR AVSPÄRRNING – LIVSFARA', ix, gy + 2.4, iz, rot, ne ? 7 : 5.5, ne ? '#7a1010' : '#a01010');
      }
    }
  }
}

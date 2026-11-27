// Sahlgrenska Universitetssjukhuset – explorable hospital with the antidote laboratory.
import * as THREE from 'three';
import { buildStructure, Furniture } from './structure.js';
import { textTexture } from '../render/textures.js';
import { HOSPITAL } from './locations.js';
import { rand, seeded } from '../core/util.js';

const W = 96, D = 64, H = 3.6;
const ROOMS = [
  { id: 'ward1', name: 'Vårdsal 1', x: 3, z: 0, w: 11, d: 12, kind: 'ward', door: ['x', 7, 12] },
  { id: 'ward2', name: 'Vårdsal 2', x: 14, z: 0, w: 12, d: 12, kind: 'ward', door: ['x', 19, 12] },
  { id: 'ward3', name: 'Vårdsal 3', x: 26, z: 0, w: 12, d: 12, kind: 'ward', door: ['x', 31, 12] },
  { id: 'staff', name: 'Personalrum', x: 3, z: 16, w: 11, d: 13, kind: 'staff', door: ['x', 7, 16] },
  { id: 'office', name: 'Läkarexpedition', x: 14, z: 16, w: 12, d: 13, kind: 'office', door: ['x', 19, 16] },
  { id: 'storage', name: 'Förråd', x: 26, z: 16, w: 12, d: 13, kind: 'storage', door: ['x', 31, 16] },
  { id: 'lobby', name: 'Huvudentré – Reception', x: 38, z: 0, w: 20, d: 29, kind: 'lobby', open: true },
  { id: 'akut', name: 'Akutmottagningen', x: 58, z: 0, w: 20, d: 12, kind: 'akut', door: ['x', 66, 12, 3] },
  { id: 'xray', name: 'Röntgen', x: 78, z: 0, w: 15, d: 12, kind: 'xray', door: ['x', 84, 12] },
  { id: 'isol', name: 'Isoleringsrum', x: 58, z: 16, w: 12, d: 13, kind: 'ward', door: ['x', 63, 16] },
  { id: 'ward4', name: 'Vårdsal 4', x: 70, z: 16, w: 11, d: 13, kind: 'ward', door: ['x', 74, 16] },
  { id: 'ward5', name: 'Vårdsal 5', x: 81, z: 16, w: 12, d: 13, kind: 'ward', door: ['x', 86, 16] },
  { id: 'op1', name: 'Operation 1', x: 3, z: 35, w: 17, d: 13, kind: 'op', door: ['x', 10, 35] },
  { id: 'op2', name: 'Operation 2', x: 20, z: 35, w: 18, d: 13, kind: 'op', door: ['x', 28, 35] },
  { id: 'morgue', name: 'Bårhus', x: 38, z: 39, w: 20, d: 25, kind: 'morgue', door: ['x', 47, 39] },
  { id: 'pharm', name: 'Apotek', x: 58, z: 35, w: 14, d: 13, kind: 'pharm', door: ['x', 63, 35] },
  { id: 'lab', name: 'Laboratoriet – Virologi', x: 72, z: 35, w: 21, d: 13, kind: 'lab', door: ['x', 80, 35] },
  { id: 'steril', name: 'Sterilcentral', x: 3, z: 52, w: 17, d: 12, kind: 'storage', door: ['x', 10, 52] },
  { id: 'iva', name: 'Intensivvård (IVA)', x: 20, z: 52, w: 18, d: 12, kind: 'ward', door: ['x', 28, 52] },
  { id: 'prov', name: 'Provtagning', x: 58, z: 52, w: 14, d: 12, kind: 'office', door: ['x', 63, 52] },
  { id: 'teknik', name: 'Teknikrum', x: 72, z: 52, w: 21, d: 12, kind: 'tech', door: ['x', 80, 52] },
];
export const ANTIDOTE_LOCAL = { x: 91.2, z: 37.2 }; // in the virology lab, NE corner

export class Hospital {
  constructor(game) {
    this.g = game;
    const ox = HOSPITAL.x - W / 2, oz = HOSPITAL.z - D / 2, y = HOSPITAL.floor;
    this.ox = ox; this.oz = oz; this.y = y;
    const doors = ROOMS.filter(r => r.door).map(r => ({ axis: r.door[0], x: r.door[1], z: r.door[2], width: r.door[3] || 2, label: `dörren till ${r.name.toLowerCase()}` }));
    const extDoors = [
      { axis: 'x', x: 46, z: 0, width: 2, glass: true, label: 'entrédörren' }, { axis: 'x', x: 48, z: 0, width: 2, glass: true, label: 'entrédörren' },
      { axis: 'z', x: 0, z: 31, width: 2, label: 'nödutgången' }, { axis: 'z', x: 96, z: 31, width: 2, label: 'nödutgången' },
      { axis: 'x', x: 47, z: 64, width: 2, label: 'ambulansintaget' },
    ];
    this.s = buildStructure(game, { ox, oz, w: W, d: D, y, h: H, outerH: 19, rooms: ROOMS, doors, extDoors, name: HOSPITAL.name });
    this.doors = this.s.doors;
    // entrance doors start open (the hospital was evacuated in a hurry)
    this.doors.filter(d => d.label === 'entrédörren').forEach(d => d.use());
    this.furnish();
    this.signs();
    this.lights();
    this.antidoteStock = 0; this.antidoteDay = 0;
    this.setupAntidote();
    this.visitedLab = false;
  }
  L(x, z) { return [this.ox + x, this.oz + z]; }

  furnish() {
    const g = this.g, f = new Furniture(g), y = this.y, rng = seeded(5);
    const B = (lx, lz, w, h, d, c, o = {}) => { const [x, z] = this.L(lx, lz); f.box(x, y + (o.y || 0), z, w, h, d, c, o); };
    let cid = 0;
    const cont = (lx, lz, label, table, fixed) => { const [x, z] = this.L(lx, lz); g.loot.container({ id: `fixH${cid++}`, x, y: y + 1, z, label, table, fixed, r: 2.2 }); };
    for (const r of ROOMS) {
      const cx = r.x + r.w / 2, cz = r.z + r.d / 2;
      switch (r.kind) {
        case 'ward':
          for (let i = 0; i < Math.floor(r.w / 3.2); i++) {
            const bx = r.x + 1.6 + i * 3.2;
            for (const bz of [r.z + 1.5, r.z + r.d - 1.5]) {
              if (Math.abs(bx - (r.door ? r.door[1] + 1 : -99)) < 1.6 && Math.abs(bz - r.door[2]) < 3) continue;
              B(bx, bz, 1.0, 0.55, 2.0, 0xd8d8d0, { collide: true }); B(bx, bz, 0.95, 0.15, 1.9, rng() < 0.4 ? 0x8a2020 : 0xe8e8f0, { y: 0.55 });
              B(bx + 0.7, bz, 0.05, 1.8, 0.05, 0x999999); // IV stand
            }
          }
          if (rng() < 0.7) cont(cx, cz, 'Medicinvagn', 'pharmacy');
          break;
        case 'staff':
          B(cx, cz, 3, 0.75, 1.2, 0x6b5236, { collide: true }); B(r.x + 1, r.z + 2, 0.6, 0.9, 2.5, 0x8a8a8a, { collide: true });
          B(r.x + r.w - 1.2, r.z + r.d - 1, 2.2, 0.8, 0.9, 0x3a4a5a, { collide: true });
          cont(r.x + 1, r.z + 2, 'Kylskåp – personalrum', 'kitchen'); cont(r.x + r.w - 1.2, r.z + r.d - 1, 'Skåp', 'kitchen');
          break;
        case 'office':
          B(cx - 2, cz, 1.6, 0.75, 0.8, 0x7a6a50, { collide: true }); B(cx + 2, cz, 1.6, 0.75, 0.8, 0x7a6a50, { collide: true });
          B(r.x + r.w - 0.5, cz, 0.6, 1.9, 2.4, 0x5a5e62, { collide: true });
          cont(r.x + r.w - 0.8, cz, 'Plåtskåp', 'locker');
          break;
        case 'storage':
          for (let i = 0; i < 3; i++) B(r.x + 2 + i * 3.5, cz, 0.6, 2.0, r.d - 4, 0x6a6e72, { collide: true });
          cont(r.x + 2, cz, 'Förrådshylla', 'crate'); cont(r.x + 5.5, cz, 'Förrådshylla', 'pharmacy');
          break;
        case 'lobby':
          B(cx, r.z + 10, 8, 1.1, 1.0, 0x8a7a66, { collide: true }); // reception desk
          for (let i = 0; i < 4; i++) B(r.x + 3, r.z + 5 + i * 2.2, 0.5, 0.45, 1.6, 0x2a3a5a, { collide: true }); // chairs
          for (let i = 0; i < 4; i++) B(r.x + r.w - 3, r.z + 5 + i * 2.2, 0.5, 0.45, 1.6, 0x2a3a5a, { collide: true });
          B(cx + 3, r.z + 18, 0.7, 0.9, 1.0, 0x333333, { rotY: 0.6 }); // wheelchair-ish
          B(cx - 4, r.z + 20, 0.8, 0.9, 2.0, 0xc8c8c0, { collide: true, rotY: 0.3 }); // gurney
          cont(cx, r.z + 10.8, 'Receptionsdisk', 'trash');
          break;
        case 'akut':
          for (let i = 0; i < 5; i++) { B(r.x + 2 + i * 3.8, r.z + 3, 0.9, 0.85, 2.0, 0xc8c8c0, { collide: true }); B(r.x + 2 + i * 3.8 + 1.4, r.z + 3, 0.04, 2.2, 2.6, 0x7a9aa0); }
          cont(r.x + r.w - 2, r.z + r.d - 2, 'Akutvagn', 'ambulance');
          break;
        case 'xray': B(cx, cz - 1, 2, 1.0, 3, 0xd0d0d0, { collide: true }); B(cx, cz - 1, 1.2, 0.6, 1.2, 0x9aa0a6, { y: 2.2 }); B(r.x + 1.5, r.z + 2, 2.5, 1.2, 0.8, 0x7a8088, { collide: true }); break;
        case 'op':
          B(cx, cz, 1.0, 0.9, 2.2, 0x5a6a72, { collide: true }); B(cx, cz, 1.6, 0.15, 1.6, 0xe8e8e0, { y: 3.0 }); // table + lamp
          B(cx + 1.6, cz, 0.6, 0.9, 0.8, 0x9aa0a6, { collide: true }); B(r.x + 1, r.z + 2, 0.7, 1.8, 3, 0x8a9096, { collide: true });
          cont(r.x + 1, r.z + 2, 'Instrumentskåp', 'pharmacy');
          break;
        case 'morgue':
          for (let i = 0; i < 6; i++) B(r.x + 0.5, r.z + 2 + i * 2.2, 0.9, 2.4, 2.0, 0x9aa4aa, { collide: true }); // drawers
          for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { B(r.x + 6 + j * 6, r.z + 5 + i * 6, 1.0, 0.9, 2.2, 0x8a9096, { collide: true }); B(r.x + 6 + j * 6, r.z + 5 + i * 6, 0.7, 0.25, 1.8, 0xe0e0e0, { y: 0.9 }); }
          break;
        case 'pharm':
          for (let i = 0; i < 3; i++) B(r.x + 2.5 + i * 4, cz + 1, 0.6, 2.0, 7, 0xd0ccc4, { collide: true });
          B(cx, r.z + 1.5, 6, 1.0, 0.8, 0x8a7a66, { collide: true });
          cont(r.x + 2.5, cz + 1, 'Apotekshylla', 'pharmacy'); cont(r.x + 6.5, cz + 1, 'Apotekshylla', 'pharmacy'); cont(r.x + 10.5, cz + 1, 'Apotekshylla', 'pharmacy');
          break;
        case 'lab':
          for (let i = 0; i < 3; i++) B(r.x + 3 + i * 5.5, cz + 0.5, 4, 0.95, 1.2, 0xe0e0dc, { collide: true });
          for (let i = 0; i < 6; i++) B(r.x + 2 + i * 2.8, cz + 0.5, 0.4, 0.35, 0.4, [0x335577, 0x777777, 0x225522][i % 3], { y: 0.95 });
          B(ANTIDOTE_LOCAL.x, ANTIDOTE_LOCAL.z, 1.2, 2.0, 0.8, 0xeaeaea, { collide: true }); // fridge
          B(ANTIDOTE_LOCAL.x, ANTIDOTE_LOCAL.z + 0.41, 0.9, 1.4, 0.02, 0x88d0ff, { y: 0.4 }); // glass door
          B(r.x + 1.5, r.z + r.d - 1.5, 1.5, 1.8, 0.8, 0x6a6e72, { collide: true });
          cont(r.x + 1.5, r.z + r.d - 1.5, 'Labbskåp', 'pharmacy');
          break;
        case 'tech': for (let i = 0; i < 4; i++) B(r.x + 3 + i * 4.5, cz, 1.2, 2.2, 3, 0x4a5056, { collide: true }); cont(r.x + 3, cz, 'Verktygsskåp', 'crate'); break;
      }
    }
    // corridor debris, overturned gurneys and blood
    // (kept along the walls so the centre lane of every corridor stays passable)
    for (let i = 0; i < 26; i++) {
      const side = rng() < 0.5;
      const lx = 4 + rng() * 88, lz = rng() < 0.6 ? (side ? 29.6 + rng() * 0.6 : 33.8 + rng() * 0.6) : (side ? 12.5 + rng() * 0.4 : 15.1 + rng() * 0.4);
      B(lx, lz, 0.5 + rng() * 0.4, 0.3 + rng() * 0.6, 0.8 + rng() * 0.8, rng() < 0.5 ? 0xc8c8c0 : 0x6a5e52, { collide: rng() < 0.5, rotY: Math.PI / 2 + (rng() - 0.5) * 0.4 });
    }
    f.build(this.s.group);
    // blood decals on the floor
    for (let i = 0; i < 40; i++) { const [x, z] = this.L(rand(2, 94), rand(2, 62)); g.fx.decal(x, y + 0.02, z, 0, 1, 0, rand(0.8, 2.5), true); }
  }

  signs() {
    const g = this.g, y = this.y;
    const sign = (text, lx, lz, rotY, w = 2.4, opts = {}) => {
      const tex = textTexture(text, { w: 512, h: 96, bg: opts.bg || '#ffffff', fg: opts.fg || '#1a3a6a', font: `bold ${opts.size || 44}px sans-serif` });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 96 / 512), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: opts.glow || 0.15 }));
      const [x, z] = this.L(lx, lz); m.position.set(x, y + (opts.h || 2.75), z); m.rotation.y = rotY; this.s.group.add(m);
    };
    for (const r of ROOMS) {
      if (!r.door) continue;
      const [ax, dx, dz] = r.door;
      const corridorSide = dz === r.z ? -0.12 : 0.12; // sign faces the corridor
      sign(r.name.toUpperCase(), dx + (r.door[3] || 2) / 2, dz + corridorSide, corridorSide < 0 ? Math.PI : 0, Math.min(3.2, 1.2 + r.name.length * 0.1));
    }
    sign('SAHLGRENSKA UNIVERSITETSSJUKHUSET', 48, -0.4, Math.PI, 16, { h: 5.2, bg: '#1a3a6a', fg: '#ffffff', size: 40, glow: 0.4 });
    sign('✚ AKUT', 66, -0.4, Math.PI, 4, { h: 4.3, bg: '#c0141c', fg: '#fff', glow: 0.6 });
    sign('LABORATORIET – VIROLOGI →', 70, 29.15, 0, 4.2, { bg: '#f4e400', fg: '#111', h: 2.1 });
    sign('← LABORATORIET', 36, 29.15, 0, 3, { bg: '#f4e400', fg: '#111', h: 2.1 });
    sign('MOTGIFT ZX-7 – KYLSKÅP', 88, 35.15, 0, 3.6, { bg: '#c0141c', fg: '#fff', h: 2.4, glow: 0.5 });
    sign('AMBULANSINTAG', 48, 64.4, 0, 4, { h: 3.0, bg: '#1a3a6a', fg: '#fff' });
  }

  lights() {
    const g = this.g;
    this.lampPos = [];
    const add = (lx, lz, color = 0xdfe8ff, flicker = true) => { const [x, z] = this.L(lx, lz); this.lampPos.push({ x, z, color, flicker, phase: rand(0, 10) }); };
    for (let x = 6; x < 94; x += 11) add(x, 32);
    for (let x = 6; x < 38; x += 10) { add(x, 14.5); add(x, 50); }
    for (let x = 60; x < 94; x += 10) { add(x, 14.5); add(x, 50); }
    add(48, 12, 0xfff2d0, false); add(48, 22, 0xfff2d0);
    for (const r of ROOMS) if (r.kind !== 'lobby') add(r.x + r.w / 2, r.z + r.d / 2, r.kind === 'morgue' ? 0x9ab8ff : r.kind === 'lab' ? 0xff3030 : 0xdfe8ff, r.kind !== 'lab');
    // emissive ceiling panels
    const pm = new THREE.MeshBasicMaterial({ color: 0xdfe8ff });
    const geo = new THREE.BoxGeometry(1.2, 0.05, 0.3);
    this.panels = this.lampPos.map(l => { const m = new THREE.Mesh(geo, pm.clone()); m.material.color.setHex(l.color); m.position.set(l.x, this.y + H - 0.04, l.z); this.s.group.add(m); return m; });
    this.pool = [0, 1, 2, 3, 4].map(() => { const l = new THREE.PointLight(0xdfe8ff, 0, 16, 1.6); g.scene.add(l); return l; });
  }

  setupAntidote() {
    const g = this.g;
    const [x, z] = this.L(ANTIDOTE_LOCAL.x, ANTIDOTE_LOCAL.z + 0.9);
    this.antidotePos = { x, z };
    g.interact.add({ x, y: this.y + 1.2, z, r: 2.2,
      label: () => {
        if (!g.antidoteAvailable()) return 'Kylskåp – Virologi (motgiftet är inte klart)';
        return this.antidoteStock > 0 ? `Ta motgift ZX-7 (${this.antidoteStock} dos${this.antidoteStock > 1 ? 'er' : ''})` : 'Kylskåp – Virologi (tomt)';
      },
      action: () => this.takeAntidote(),
    });
  }
  takeAntidote() {
    const g = this.g;
    if (!g.antidoteAvailable()) {
      const h = Math.max(0, 48 - g.time.daysPassed * 24);
      g.hud.message(`En lapp på kylskåpet: "Motgift ZX-7 – första satsen klar efter dag 2." Ungefär ${Math.ceil(h)} speltimmar kvar.`, 'warn');
      g.audio?.locked(); return;
    }
    if (this.antidoteStock <= 0) { g.hud.message('Kylskåpet är tomt. Forskarnas anteckningar: en ny dos blir klar varje dygn.', 'warn'); return; }
    this.antidoteStock--;
    g.inventory.add('antidote', 1);
    g.audio?.pickup();
    g.hud.message('Du tog en dos Motgift ZX-7! Använd den från inventariet [TAB] eller tryck [H] om du är infekterad.', 'good');
    g.stats.antidotes = (g.stats.antidotes || 0) + 1;
  }
  // called every frame
  update(dt) {
    const g = this.g;
    // antidote production: first dose when 2 game days have passed, then one per game day (max 2 in stock)
    if (g.antidoteAvailable()) {
      const day = Math.floor(g.time.daysPassed);
      if (this.antidoteDay === 0) { this.antidoteStock = Math.max(this.antidoteStock, 1); this.antidoteDay = day; }
      else if (day > this.antidoteDay) { this.antidoteStock = Math.min(2, this.antidoteStock + (day - this.antidoteDay)); this.antidoteDay = day; }
    }
    for (const d of this.doors) d.update(dt);
    // lights: assign pool to the nearest lamps while the player is close
    const p = g.player.pos;
    const near = Math.hypot(p.x - HOSPITAL.x, p.z - HOSPITAL.z) < 90;
    const t = g.t;
    if (near) {
      const sorted = this.lampPos.map((l, i) => [Math.hypot(l.x - p.x, l.z - p.z), l, i]).sort((a, b) => a[0] - b[0]);
      this.pool.forEach((L, i) => {
        const e = sorted[i]; if (!e) { L.intensity = 0; return; }
        const l = e[1];
        let k = 1;
        if (l.flicker) { const s = Math.sin(t * 13 + l.phase) * Math.sin(t * 3.1 + l.phase * 2); k = s > 0.85 ? 0.1 : s < -0.9 ? 0.3 : 1; }
        L.position.set(l.x, this.y + H - 0.4, l.z); L.color.setHex(l.color); L.intensity = 9 * k;
        this.panels[e[2]].material.color.setHex(k < 0.5 ? 0x222222 : l.color);
      });
    } else this.pool.forEach(L => (L.intensity = 0));
    // first visit to the lab
    if (!this.visitedLab) {
      const lx = p.x - this.ox, lz = p.z - this.oz;
      if (lx > 72 && lx < 93 && lz > 35 && lz < 48) { this.visitedLab = true; g.hud.message('Laboratoriet – Virologi. Kylskåpet med Motgift ZX-7 står i hörnet.', 'good'); }
    }
  }
  inside(x, z, m = 0) { return x > this.ox - m && x < this.ox + W + m && z > this.oz - m && z < this.oz + D + m; }
  serialize() { return { stock: this.antidoteStock, day: this.antidoteDay, doors: this.doors.map(d => [d.open, d.broken]) }; }
  restore(o) {
    this.antidoteStock = o.stock || 0; this.antidoteDay = o.day || 0;
    (o.doors || []).forEach(([op, br], i) => { const d = this.doors[i]; if (!d) return; if (br) d.bash(1e6); else if (op !== d.open) d.use(); });
  }
}

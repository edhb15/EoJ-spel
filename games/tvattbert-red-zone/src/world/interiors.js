// Enterable buildings: doors on STL building facades lead into generated interiors
// (apartments, shops, pharmacies, hunting store, police station, offices).
import * as THREE from 'three';
import { buildStructure, Furniture } from './structure.js';
import { textTexture } from '../render/textures.js';
import { pointInBuilding } from './buildings.js';
import { CLASS } from './worldData.js';
import { ZONES } from './locations.js';
import { seeded, rand, chance } from '../core/util.js';

const TYPES = {
  apartment: { label: 'Lägenhetshus', sign: null },
  shop: { label: 'Matbutik', sign: 'LIVS' },
  pharmacy: { label: 'Apotek', sign: 'APOTEK' },
  hunting: { label: 'Jakt & Fiske', sign: 'JAKT & FISKE' },
  police: { label: 'Polisstation', sign: 'POLIS' },
  office: { label: 'Kontor', sign: null },
};

export class Interiors {
  constructor(game) {
    this.g = game; this.list = []; this.current = null; this.built = new Map();
    const W = game.world, rng = seeded(2024);
    const taken = [];
    const cands = W.buildings.filter(b => !b.removed && b.area > 150 && b.area < 5000 && b.roof - b.base > 6);
    cands.sort(() => rng() - 0.5);
    let hasPolice = false, hunting = 0;
    for (const b of cands) {
      if (this.list.length >= 72) break;
      if (taken.some(([x, z]) => Math.hypot(x - b.cx, z - b.cz) < 70)) continue;
      if (ZONES.some(zn => zn.type === 'safe' && Math.hypot(zn.x - b.cx, zn.z - b.cz) < zn.r + 20) || game.isInsideHospital(b.cx, b.cz, 30)) continue;
      // find a facade edge facing open street
      const v = b.verts, e = b.edges;
      let door = null;
      for (let i = 0; i < e.length && !door; i += 2) {
        const ax = v[e[i] * 2], az = v[e[i] * 2 + 1], bx = v[e[i + 1] * 2], bz = v[e[i + 1] * 2 + 1];
        const len = Math.hypot(bx - ax, bz - az); if (len < 5) continue;
        let nx = -(bz - az) / len, nz = (bx - ax) / len;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (pointInBuilding(b, mx + nx * 0.3, mz + nz * 0.3)) { nx = -nx; nz = -nz; }
        const ox = mx + nx * 2.2, oz = mz + nz * 2.2;
        if (W.classAt(ox, oz) !== CLASS.URBAN || !game.isWalkable(ox, oz, 0.8)) continue;
        const gy = W.terrainHeight(mx, mz);
        if (gy < b.base + 0.5) continue;
        door = { x: mx, z: mz, nx, nz, y: gy };
      }
      if (!door) continue;
      let type = rng() < 0.52 ? 'apartment' : rng() < 0.45 ? 'shop' : rng() < 0.4 ? 'pharmacy' : rng() < 0.5 ? 'office' : 'shop';
      if (!hasPolice && this.list.length > 10) { type = 'police'; hasPolice = true; }
      else if (hunting < 2 && this.list.length > 20 && rng() < 0.15) { type = 'hunting'; hunting++; }
      taken.push([b.cx, b.cz]);
      const it = { idx: this.list.length, type, b, door, seed: (rng() * 1e9) | 0, visited: false };
      this.list.push(it);
      this.makeDoor(it);
    }
  }
  makeDoor(it) {
    const g = this.g, d = it.door;
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8 }));
    frame.position.y = 1.3; grp.add(frame);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 0.1), new THREE.MeshStandardMaterial({ map: g.tex.wood, color: it.type === 'police' ? 0x445566 : 0x9a7a5a, roughness: 0.7 }));
    panel.position.set(0, 1.15, 0.04); grp.add(panel);
    const T = TYPES[it.type];
    if (T.sign) {
      const tex = textTexture(T.sign, { w: 512, h: 128, bg: it.type === 'police' ? '#1d4fa0' : it.type === 'pharmacy' ? '#1e7a32' : '#7a1e1e', font: 'bold 72px sans-serif' });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }));
      s.position.set(0, 3.2, 0.1); grp.add(s);
    }
    grp.position.set(d.x + d.nx * 0.05, d.y, d.z + d.nz * 0.05);
    grp.rotation.y = Math.atan2(d.nx, d.nz);
    g.scene.add(grp);
    g.interact.add({ x: d.x + d.nx * 0.8, y: d.y + 1.2, z: d.z + d.nz * 0.8, r: 2.4,
      label: () => `Gå in: ${T.label}${it.visited ? ' (besökt)' : ''}`, action: () => this.enter(it) });
  }

  build(it) {
    const g = this.g, rng = seeded(it.seed);
    const ox = 2200 + (it.idx % 6) * 80, oz = -1900 + Math.floor(it.idx / 6) * 80, y = 0;
    let spec, furn;
    const f = new Furniture(g);
    const conts = [];
    const B = (lx, lz, w, h, d, c, o = {}) => f.box(ox + lx, y + (o.y || 0), oz + lz, w, h, d, c, o);
    const C = (lx, lz, label, table, fixed) => conts.push({ lx, lz, label, table, fixed });
    if (it.type === 'apartment' || it.type === 'office') {
      const rooms = [
        { x: 0, z: 0, w: 6, d: 5, name: 'Kök' }, { x: 0, z: 5, w: 6, d: 5, name: 'Vardagsrum' }, { x: 0, z: 10, w: 6, d: 4, name: 'Sovrum' },
        { x: 10, z: 0, w: 6, d: 5, name: 'Kök' }, { x: 10, z: 5, w: 6, d: 5, name: 'Vardagsrum' }, { x: 10, z: 10, w: 6, d: 4, name: 'Sovrum' },
      ];
      const doors = [{ axis: 'z', x: 6, z: 1, width: 1 }, { axis: 'z', x: 6, z: 6, width: 1 }, { axis: 'z', x: 6, z: 11, width: 1 },
        { axis: 'z', x: 10, z: 1, width: 1 }, { axis: 'z', x: 10, z: 7, width: 1 }, { axis: 'z', x: 10, z: 11, width: 1 }];
      spec = { ox, oz, w: 16, d: 14, y, h: 2.7, rooms, doors, floorTex: g.tex.wood, wallTex: g.tex.concrete, surface: 'tile' };
      for (const sx of [0, 10]) {
        const office = it.type === 'office';
        B(sx + 1, 0.5, 2, 0.9, 0.6, 0x8a8478, { collide: true }); B(sx + 4.5, 0.5, 0.8, 1.8, 0.7, 0xdedede, { collide: true });
        C(sx + 4.5, 1.2, office ? 'Kaffehörna' : 'Kylskåp', 'kitchen'); C(sx + 1, 1.2, office ? 'Skrivbordslåda' : 'Köksskåp', office ? 'locker' : 'kitchen');
        B(sx + 3, 7.5, 2.2, 0.8, 0.9, office ? 0x6a5a4a : 0x4a5a6a, { collide: true }); B(sx + 3, 9.2, 1.2, 0.5, 0.6, 0x6b4a2e, { collide: true });
        B(sx + 3, 12, 1.6, 0.5, 2, office ? 0x555555 : 0x7a6a8a, { collide: true }); B(sx + 5.4, 12, 0.6, 2.0, 1.2, 0x6b5236, { collide: true });
        C(sx + 5.2, 12, office ? 'Arkivskåp' : 'Garderob', office ? 'locker' : 'wardrobe');
      }
      for (let i = 0; i < 5; i++) B(rand(7, 9), rand(1, 13), rand(0.4, 0.9), rand(0.2, 0.6), rand(0.4, 0.9), 0x5a4e42, { rotY: rand(0, 3) });
      it.entry = [8, 12.8]; it.exitDoor = [8, 13.95, 0];
    } else {
      const big = it.type === 'police';
      const rooms = [{ x: 0, z: 8, w: big ? 10 : 18, d: 4, name: 'Lager' }];
      if (big) rooms.push({ x: 10, z: 8, w: 8, d: 4, name: 'Vapenförråd' }, { x: 12, z: 0, w: 6, d: 5, name: 'Kontor' });
      const doors = [{ axis: 'x', x: 3, z: 8, width: 2 }];
      if (big) doors.push({ axis: 'x', x: 13, z: 8, width: 2, locked: false }, { axis: 'z', x: 12, z: 2, width: 1 });
      spec = { ox, oz, w: 18, d: 12, y, h: 3.2, rooms, doors, floorTex: g.tex.tiles, wallTex: g.tex.concrete, surface: 'tile' };
      if (it.type === 'police') {
        B(6, 2, 5, 1.1, 0.8, 0x4a5056, { collide: true }); C(6, 2.6, 'Receptionsdisk', 'police');
        for (let i = 0; i < 4; i++) B(11 + i * 1.6, 11.4, 0.8, 1.9, 0.5, 0x5a6470, { collide: true });
        C(13, 11, 'Vapenskåp', 'locker'); C(16, 11, 'Beslagslåda', 'police');
        B(15, 2, 1.6, 0.75, 0.8, 0x6a5a4a, { collide: true }); C(15, 2.6, 'Skrivbord', 'locker');
      } else {
        const tbl = it.type === 'pharmacy' ? 'pharmacy' : it.type === 'hunting' ? 'hunting' : 'shop';
        for (let i = 0; i < 3; i++) { B(4 + i * 4.5, 4, 0.9, 1.7, 5, 0xc8c0b0, { collide: true }); C(4 + i * 4.5, 4, it.type === 'pharmacy' ? 'Apotekshylla' : it.type === 'hunting' ? 'Vapenställ' : 'Butikshylla', i === 0 ? tbl : (it.type === 'hunting' ? 'wardrobe' : tbl)); }
        B(15.5, 1.3, 3, 1.0, 0.8, 0x7a6a56, { collide: true }); C(15.5, 1.9, 'Kassadisk', 'trash');
        if (it.type === 'hunting') it.fixedLoot = true;
      }
      for (let i = 0; i < 4; i++) B(rand(1, 17), rand(9, 11), rand(0.6, 1.2), rand(0.5, 1.2), rand(0.6, 1.2), 0x7a5a36, { collide: true, rotY: rand(0, 3) });
      C(9, 10, 'Lagerhylla', 'crate');
      it.entry = [9, 0.9]; it.exitDoor = [9, 0.05, Math.PI];
    }
    const s = buildStructure(g, spec);
    f.build(s.group);
    conts.forEach((c, i) => g.loot.container({ id: `fixI${it.idx}_${i}`, x: ox + c.lx, y: y + 1, z: oz + c.lz, label: c.label, table: c.table, r: 2.2 }));
    // exit door (inside)
    const [ex, ez, rot] = it.exitDoor;
    const dm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 0.08), new THREE.MeshStandardMaterial({ map: g.tex.wood, color: 0x9a7a5a }));
    dm.position.set(ox + ex, y + 1.15, oz + ez); dm.rotation.y = rot; s.group.add(dm);
    g.interact.add({ x: ox + ex, y: y + 1.2, z: oz + ez + (rot ? 0.6 : -0.6), r: 2.4, label: 'Gå ut på gatan', action: () => this.exit() });
    const light = new THREE.PointLight(0xffd9a0, 0, 14, 1.8); light.position.set(ox + spec.w / 2, y + spec.h - 0.4, oz + spec.d / 2); g.scene.add(light);
    s.light = light; s.origin = [ox, oz];
    // a few residents still inside…
    const nZ = it.type === 'police' ? 3 : rng() < 0.6 ? 1 + ((rng() * 2) | 0) : 0;
    s.zombieSpawns = [];
    for (let i = 0; i < nZ; i++) s.zombieSpawns.push([ox + 2 + rng() * (spec.w - 4), oz + 2 + rng() * (spec.d - 5), it.type === 'police' ? 'police' : 'civil']);
    return s;
  }

  enter(it) {
    const g = this.g, p = g.player;
    let s = this.built.get(it.idx);
    const fade = document.getElementById('fade'); fade.style.opacity = 1;
    g.audio?.door({ x: it.door.x, y: it.door.y + 1, z: it.door.z }, true);
    const followers = g.zombies.active.filter(z => (z.state === 3 || z.state === 4) && Math.hypot(z.x - it.door.x, z.z - it.door.z) < 14);
    setTimeout(() => {
      if (!s) { s = this.build(it); this.built.set(it.idx, s); }
      const [ox, oz] = s.origin;
      this.current = it; this.returnTo = { x: it.door.x + it.door.nx * 1.4, z: it.door.z + it.door.nz * 1.4, yaw: Math.atan2(-it.door.nx, -it.door.nz) };
      p.spawn(ox + it.entry[0], oz + it.entry[1], it.exitDoor[2] ? Math.PI : 0); // face into the room
      s.light.intensity = 9;
      if (!it.visited) {
        it.visited = true;
        for (const [x, z, outfit] of s.zombieSpawns) { const zb = g.zombies.spawnActive(Math.random() < 0.15 ? 'runner' : 'walker', x, z, outfit); zb.state = 0; zb.stateT = rand(2, 10); }
      }
      g.hud.showLocation(TYPES[it.type].label, 'Inomhus');
      fade.style.opacity = 0;
      // zombies chasing you follow you inside
      setTimeout(() => {
        if (this.current !== it) return;
        followers.forEach(z => { if (z.state !== 7) { z.x = ox + it.entry[0] + rand(-1, 1); z.z = oz + it.entry[1] + (it.exitDoor[2] ? 0.8 : -0.8); z.y = 0; z.state = 3; z.lastSeen = { x: p.pos.x, z: p.pos.z }; z.seenT = 0; } });
        if (followers.length) g.hud.message('De följer efter dig in!', 'warn');
      }, 3000);
    }, 350);
  }
  exit() {
    const g = this.g, it = this.current; if (!it) return;
    const fade = document.getElementById('fade'); fade.style.opacity = 1;
    setTimeout(() => {
      const s = this.built.get(it.idx); if (s) s.light.intensity = 0;
      this.current = null;
      g.player.spawn(this.returnTo.x, this.returnTo.z, this.returnTo.yaw);
      g.terrain.update(g.player.pos.x, g.player.pos.z, 30);
      fade.style.opacity = 0;
    }, 350);
  }
  update() {
    // safety: if the player somehow left the interior volume, return them to the street
    if (this.current) { const p = this.g.player.pos; if (!this.g.world.floorZoneAt(p.x, p.z)) this.exit(); }
  }
  serialize() { return { visited: this.list.filter(i => i.visited).map(i => i.idx), inside: this.current ? this.current.idx : -1 }; }
  restore(o) {
    for (const i of o.visited || []) if (this.list[i]) this.list[i].visited = true;
    if (o.inside >= 0 && this.list[o.inside]) { const it = this.list[o.inside]; it.visited = true; this.enter(it); }
  }
}

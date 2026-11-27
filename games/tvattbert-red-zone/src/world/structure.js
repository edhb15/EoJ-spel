// Grid-based building interiors (used for the hospital and enterable shops/homes):
// rooms on a 1 m grid -> walls (with door gaps), floor, ceiling, exterior shell, doors.
import * as THREE from 'three';
import { F } from './collision.js';
import { rand, seeded } from '../core/util.js';

export class Door {
  constructor(game, { x, z, y, axis, width = 1.2, height = 2.2, locked = false, glass = false, label = 'dörren' }) {
    this.g = game; this.axis = axis; this.width = width; this.height = height; this.y = y;
    this.locked = locked; this.label = label; this.open = false; this.angle = 0; this.target = 0; this.hp = 100; this.broken = false;
    // hinge at (x,z); closed panel extends along +axis
    this.hx = x; this.hz = z;
    this.pivot = new THREE.Group(); this.pivot.position.set(x, y, z);
    const mat = glass ? new THREE.MeshStandardMaterial({ color: 0x8aa0a8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.3 })
      : new THREE.MeshStandardMaterial({ map: game.tex.wood, color: 0xb8b0a0, roughness: 0.7 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width - 0.04, height, 0.05), mat);
    panel.position.set(width / 2, height / 2, 0); panel.castShadow = true;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.1), new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.3 }));
    handle.position.set(width - 0.15, 1.0, 0);
    this.pivot.add(panel, handle);
    this.baseRot = axis === 'x' ? 0 : -Math.PI / 2;
    this.pivot.rotation.y = this.baseRot;
    game.scene.add(this.pivot);
    this.seg = null; this.updateSeg();
    this.inter = game.interact.add({ x: x + (axis === 'x' ? width / 2 : 0), y: y + 1.2, z: z + (axis === 'z' ? width / 2 : 0), r: 2.4,
      label: () => (this.broken ? null : this.locked ? `${this.label} (låst)` : this.open ? `Stäng ${this.label}` : `Öppna ${this.label}`),
      enabled: () => !this.broken, action: () => this.use() });
    this.bangT = 0;
  }
  updateSeg() {
    if (this.seg) this.g.collision.removeSegment(this.seg);
    const a = this.baseRot + this.angle;
    const ex = Math.cos(a) * this.width, ez = -Math.sin(a) * this.width;
    this.seg = this.g.collision.addSegment(this.hx, this.hz, this.hx + ex, this.hz + ez, this.y - 0.2, this.y + this.height, F.ALL, this);
    if (this.g.zombies) this.g.zombies.flow.dirty = true;
  }
  use() {
    if (this.locked) { this.g.audio?.locked(); this.g.hud.message(`${cap(this.label)} är låst.`, 'warn'); return; }
    this.open = !this.open; this.target = this.open ? Math.PI / 2 * 0.95 : 0;
    this.g.audio?.door({ x: this.hx, y: this.y + 1, z: this.hz }, this.open);
    this.g.noise(this.hx, this.hz, 8, 'door');
  }
  bash(dt, z) {
    if (this.open || this.broken) return;
    this.hp -= dt * 9; this.bangT -= dt;
    if (this.bangT <= 0) { this.bangT = 0.9; this.g.audio?.bang({ x: this.hx, y: this.y + 1, z: this.hz }); this.pivot.rotation.z = rand(-0.03, 0.03); }
    if (this.hp <= 0) {
      this.broken = true; this.open = true; this.locked = false; this.target = Math.PI / 2;
      this.pivot.rotation.x = -1.3; this.pivot.position.y = this.y + 0.1;
      this.g.collision.removeSegment(this.seg); this.seg = null; if (this.g.zombies) this.g.zombies.flow.dirty = true;
      this.g.hud.message('Något har slagit sönder en dörr!', 'warn');
    }
  }
  update(dt) {
    if (this.broken) return;
    if (Math.abs(this.angle - this.target) > 0.001) {
      this.angle += Math.sign(this.target - this.angle) * Math.min(Math.abs(this.target - this.angle), dt * 3);
      this.pivot.rotation.y = this.baseRot + this.angle;
      if (Math.abs(this.angle - this.target) < 0.001) this.updateSeg();
    }
  }
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Build a structure. spec: { ox, oz (min corner), w, d (cells, 1 m), y (floor), h (ceiling height),
//   outerH, rooms:[{id,x,z,w,d,name,open?}], doors:[{x,z,axis,width,label,locked}], extDoors:[...], facade?, signs? }
export function buildStructure(game, spec) {
  const { ox, oz, w, d, y, h } = spec;
  const lab = new Int16Array(w * d).fill(0); // 0 = corridor
  spec.rooms.forEach((r, i) => {
    for (let k = r.z; k < r.z + r.d; k++) for (let j = r.x; j < r.x + r.w; j++) if (j >= 0 && k >= 0 && j < w && k < d) lab[k * w + j] = i + 1;
  });
  const openPair = (a, b) => {
    const ra = a ? spec.rooms[a - 1] : null, rb = b ? spec.rooms[b - 1] : null;
    return (ra && ra.open && !b) || (rb && rb.open && !a);
  };
  // door edges: key 'h:x:z' horizontal edge at z between x..x+1, 'v:x:z' vertical edge at x between z..z+1
  const doorEdges = new Set();
  for (const dr of [...spec.doors, ...(spec.extDoors || [])]) {
    for (let t = 0; t < dr.width; t++) doorEdges.add(dr.axis === 'x' ? `h:${dr.x + t}:${dr.z}` : `v:${dr.x}:${dr.z + t}`);
  }
  const walls = []; // [x0,z0,x1,z1, exterior]
  // horizontal edges (constant z), run along x
  for (let k = 0; k <= d; k++) {
    let run = null;
    for (let j = 0; j <= w; j++) {
      let wall = false, ext = false;
      if (j < w) {
        const a = k > 0 ? lab[(k - 1) * w + j] : -1, b = k < d ? lab[k * w + j] : -1;
        ext = a === -1 || b === -1;
        wall = (a !== b && !openPair(a, b)) && !doorEdges.has(`h:${j}:${k}`);
      }
      if (wall && run && run.ext === ext) continue;
      if (run) { walls.push([run.s, k, j, k, run.ext]); run = null; }
      if (wall) run = { s: j, ext };
    }
  }
  for (let j = 0; j <= w; j++) {
    let run = null;
    for (let k = 0; k <= d; k++) {
      let wall = false, ext = false;
      if (k < d) {
        const a = j > 0 ? lab[k * w + j - 1] : -1, b = j < w ? lab[k * w + j] : -1;
        ext = a === -1 || b === -1;
        wall = (a !== b && !openPair(a, b)) && !doorEdges.has(`v:${j}:${k}`);
      }
      if (wall && run && run.ext === ext) continue;
      if (run) { walls.push([j, run.s, j, k, run.ext]); run = null; }
      if (wall) run = { s: k, ext };
    }
  }
  // geometry
  const T = game.tex;
  const group = new THREE.Group(); game.scene.add(group);
  const wallGeo = [], extGeo = [];
  const outerH = spec.outerH || h + 0.4;
  for (const [x0, z0, x1, z1, ext] of walls) {
    const X0 = ox + x0, Z0 = oz + z0, X1 = ox + x1, Z1 = oz + z1;
    const len = Math.hypot(X1 - X0, Z1 - Z0);
    const th = ext ? 0.35 : 0.18;
    const g = new THREE.BoxGeometry(x0 === x1 ? th : len + th, h, z0 === z1 ? th : len + th);
    g.translate((X0 + X1) / 2, y + h / 2, (Z0 + Z1) / 2);
    // world-space UVs for the wall texture (1 tile per 3 m)
    const uv = g.attributes.uv, pos = g.attributes.position, nor = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const u = Math.abs(nor.getX(i)) > 0.5 ? pz : px;
      uv.setXY(i, u / 3, (py - y) / h);
    }
    wallGeo.push(g);
    game.collision.addSegment(X0, Z0, X1, Z1, y - 0.5, ext ? y + outerH : y + h, F.ALL, ext ? 'ext' : 'int');
    if (ext) extGeo.push([X0, Z0, X1, Z1]);
  }
  const wallMesh = new THREE.Mesh(merge(wallGeo), new THREE.MeshStandardMaterial({ map: spec.wallTex || T.hospWall, roughness: 0.9 }));
  wallMesh.castShadow = wallMesh.receiveShadow = true; group.add(wallMesh);
  // floor + ceiling
  const floorTex = (spec.floorTex || T.tiles).clone(); floorTex.repeat.set(w / 2, d / 2); floorTex.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(ox + w / 2, y + 0.01, oz + d / 2); floor.receiveShadow = true; group.add(floor);
  const ceilTex = T.ceiling.clone(); ceilTex.repeat.set(w / 1.2, d / 1.2); ceilTex.needsUpdate = true;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(ox + w / 2, y + h, oz + d / 2); ceil.castShadow = true; group.add(ceil);
  // exterior shell above the ceiling (upper floors) + roof + foundation
  if (spec.outerH) {
    const shell = new THREE.Group();
    const fac = new THREE.MeshStandardMaterial({ map: spec.facadeTex || makeFacadeTex(spec.facadeStyle), roughness: 0.85 });
    const top = y + outerH;
    const box = new THREE.BoxGeometry(w + 0.7, outerH - h, d + 0.7);
    box.translate(ox + w / 2, y + h + (outerH - h) / 2, oz + d / 2);
    const uv = box.attributes.uv, pos = box.attributes.position, nor = box.attributes.normal;
    for (let i = 0; i < uv.count; i++) { const u = Math.abs(nor.getX(i)) > 0.5 ? pos.getZ(i) : pos.getX(i); uv.setXY(i, u / 4, (pos.getY(i) - y) / 3.4); }
    const sm = new THREE.Mesh(box, fac); sm.castShadow = sm.receiveShadow = true; shell.add(sm);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.7, d + 0.7), new THREE.MeshStandardMaterial({ map: T.roof, color: 0x777777, roughness: 0.95 }));
    roof.rotation.x = -Math.PI / 2; roof.position.set(ox + w / 2, top, oz + d / 2); shell.add(roof);
    const found = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 8, d + 1.2), new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.95 }));
    found.position.set(ox + w / 2, y - 4.02, oz + d / 2); found.receiveShadow = true; shell.add(found);
    group.add(shell);
    // outer facing strips of the exterior walls (door gaps preserved) so the ground floor reads as facade outside
    const strips = [];
    for (const [X0, Z0, X1, Z1] of extGeo) {
      const len = Math.hypot(X1 - X0, Z1 - Z0);
      let nx = 0, nz = 0;
      if (Z0 === Z1) nz = Math.abs(Z0 - oz) < 0.01 ? -1 : 1; else nx = Math.abs(X0 - ox) < 0.01 ? -1 : 1;
      const g = new THREE.BoxGeometry(X0 === X1 ? 0.12 : len + 0.6, h, Z0 === Z1 ? 0.12 : len + 0.6);
      g.translate((X0 + X1) / 2 + nx * 0.3, y + h / 2, (Z0 + Z1) / 2 + nz * 0.3);
      const uv2 = g.attributes.uv, p2 = g.attributes.position, n2 = g.attributes.normal;
      for (let i = 0; i < uv2.count; i++) { const u = Math.abs(n2.getX(i)) > 0.5 ? p2.getZ(i) : p2.getX(i); uv2.setXY(i, u / 4, (p2.getY(i) - y) / 3.4); }
      strips.push(g);
    }
    if (strips.length) {
      const sm2 = new THREE.Mesh(merge(strips), fac);
      sm2.castShadow = true; sm2.receiveShadow = true; group.add(sm2);
    }
  }
  // floor zone (overrides terrain, provides ceiling)
  const zone = { x0: ox, z0: oz, x1: ox + w, z1: oz + d, y, ceil: y + h, surface: spec.surface || 'tile', name: spec.name };
  game.world.floorZones.push(zone);
  // doors
  const doors = [];
  for (const dr of [...spec.doors, ...(spec.extDoors || [])]) {
    const X = ox + dr.x, Z = oz + dr.z;
    doors.push(new Door(game, { x: X, z: Z, y, axis: dr.axis, width: dr.width, height: Math.min(2.3, h - 0.2), locked: dr.locked, glass: dr.glass, label: dr.label || 'dörren' }));
  }
  return { group, zone, doors, lab, walls, toWorld: (lx, lz) => [ox + lx, oz + lz] };
}

function makeFacadeTex(style = 'hospital') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = style === 'hospital' ? '#c9c6bc' : '#b49a78'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  x.fillStyle = '#1b2026'; x.fillRect(30, 60, 196, 120);
  x.fillStyle = 'rgba(150,170,190,0.25)'; x.fillRect(30, 60, 98, 120);
  x.fillStyle = '#d8d6cf'; x.fillRect(126, 60, 4, 120);
  x.fillStyle = 'rgba(30,25,20,0.35)'; for (let i = 0; i < 8; i++) x.fillRect(Math.random() * 256, 180, 3 + Math.random() * 8, 76);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// minimal geometry merge (positions, normals, uvs, optional colors)
export function merge(geos) {
  let nv = 0, ni = 0; for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const hasCol = geos.every(g => g.attributes.color); const col = hasCol ? new Float32Array(nv * 3) : null;
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (hasCol) col.set(g.attributes.color.array, vo * 3);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; }
    else for (let i = 0; i < n; i++) idx[io++] = vo + i;
    vo += n; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (hasCol) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere();
  return out;
}

// furniture helper: colored boxes merged into one mesh (+ optional collision boxes)
export class Furniture {
  constructor(game) { this.g = game; this.geos = []; }
  box(x, y, z, w, h, d, color, { collide = false, rotY = 0 } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y + h / 2, z);
    const c = new THREE.Color(color); const n = g.attributes.position.count; const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(g);
    if (collide) this.g.collision.addBox(x, z, rotY, w / 2, d / 2, y - 0.1, y + h, F.PLAYER | F.ZOMBIE | (h > 1.2 ? F.BULLET | F.SIGHT : 0), 'furniture');
  }
  build(parent, material) {
    if (!this.geos.length) return null;
    const m = new THREE.Mesh(merge(this.geos), material || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 }));
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
}

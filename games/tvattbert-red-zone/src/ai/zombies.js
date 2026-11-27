// Zombies: types, city-wide population (virtual + active), AI (sight, hearing, chase,
// search, wander), instanced animated rendering, hit detection, special abilities.
import * as THREE from 'three';
import { clamp, lerp, rand, pick, chance, wrapAngle, seeded } from '../core/util.js';
import { F } from '../world/collision.js';
import { CLASS } from '../world/worldData.js';
import { ZONES } from '../world/locations.js';
import { FlowField } from './nav.js';

export const ZTYPES = {
  walker: { name: 'Vanlig zombie', hp: 100, walk: [0.45, 0.85], run: 1.7, dmg: [7, 12], bite: 0.2, reach: 1.45, sight: 34, hear: 1, scale: [0.95, 1.05], atk: 1.1, lean: 0.25, pitch: 1 },
  runner: { name: 'Snabb zombie', hp: 70, walk: [0.9, 1.3], run: 5.7, dmg: [5, 9], bite: 0.25, reach: 1.35, sight: 42, hear: 1.3, scale: [0.92, 1.0], atk: 0.7, lean: 0.45, pitch: 1.3 },
  brute: { name: 'Tålig zombie', hp: 520, walk: [0.6, 0.8], run: 2.7, dmg: [22, 32], bite: 0.12, reach: 1.85, sight: 30, hear: 0.8, scale: [1.22, 1.3], atk: 1.5, lean: 0.15, armor: 0.5, pitch: 0.6 },
  screamer: { name: 'Skrikare', hp: 85, walk: [0.7, 1.0], run: 3.3, dmg: [4, 7], bite: 0.15, reach: 1.35, sight: 48, hear: 1.6, scale: [0.85, 0.95], atk: 0.9, lean: 0.3, special: 'scream', pitch: 1.6 },
  spitter: { name: 'Spottare', hp: 130, walk: [0.7, 0.95], run: 2.3, dmg: [5, 8], bite: 0.15, reach: 1.35, sight: 44, hear: 1, scale: [0.95, 1.05], atk: 1.0, lean: 0.35, special: 'spit', pitch: 0.9 },
};
const OUTFITS = {
  civil: () => ({ shirt: pick([0x4a5560, 0x6b3a33, 0x3a4a3a, 0x8a7a60, 0x2c2c34, 0x704830, 0x5a5a6a, 0x9a9488]), pants: pick([0x2a3040, 0x3a3a3a, 0x4a4036, 0x22262e, 0x56504a]) }),
  hoodie: () => ({ shirt: pick([0x222222, 0x3a3f4a, 0x7a2020, 0x2e4a2e]), pants: pick([0x22262e, 0x333333]) }),
  police: () => ({ shirt: 0x1c2638, pants: 0x1c2230 }),
  military: () => ({ shirt: 0x4a5236, pants: 0x464c34 }),
  patient: () => ({ shirt: 0x9fb8c8, pants: 0x9fb8c8 }),
  doctor: () => ({ shirt: 0xd8d8d2, pants: 0x50607a }),
  lab: () => ({ shirt: 0xe6e6e0, pants: 0x3a3a40 }),
};
const SKINS = [0x8a9a86, 0x9aa08c, 0x7e8c7a, 0xa0a494, 0x8c8a80, 0x6e7a6a];

const ST = { IDLE: 0, WANDER: 1, INVESTIGATE: 2, CHASE: 3, ATTACK: 4, SEARCH: 5, SCREAM: 6, DEAD: 7 };

// body parts: [name, w, h, d, pivot ('top'|'bottom'|'center'), material]
const PARTS = [
  ['pelvis', 0.34, 0.2, 0.2, 'center', 'pants'], ['torso', 0.4, 0.58, 0.23, 'bottom', 'shirt'], ['head', 0.21, 0.25, 0.23, 'bottom', 'skin'],
  ['uarmL', 0.1, 0.31, 0.1, 'top', 'shirt'], ['uarmR', 0.1, 0.31, 0.1, 'top', 'shirt'], ['larmL', 0.085, 0.32, 0.085, 'top', 'skin'], ['larmR', 0.085, 0.32, 0.085, 'top', 'skin'],
  ['thighL', 0.15, 0.45, 0.15, 'top', 'pants'], ['thighR', 0.15, 0.45, 0.15, 'top', 'pants'], ['shinL', 0.125, 0.47, 0.125, 'top', 'pants'], ['shinR', 0.125, 0.47, 0.125, 'top', 'pants'],
];

export class Zombies {
  constructor(game) {
    this.g = game;
    const q = game.settings.quality;
    this.maxActive = q === 'low' ? 45 : q === 'high' ? 110 : 75;
    this.actRadius = 135; this.deactRadius = 175;
    this.active = []; this.virtual = [];
    this.flow = new FlowField(game);
    this.spits = [];
    this.nextId = 1;
    this.buildRender();
    this.screamCooldown = 0;
    this.thinkIdx = 0;
    this.grid = new Map();
    this.populationTarget = q === 'low' ? 900 : q === 'high' ? 1600 : 1250;
  }

  // ---------------------------------------------------------------- rendering
  buildRender() {
    const tex = this.makeClothTex();
    const mats = {
      skin: new THREE.MeshStandardMaterial({ map: this.makeSkinTex(), roughness: 0.85 }),
      shirt: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
      pants: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    };
    this.meshes = {};
    for (const [name, w, h, d, pivot, mat] of PARTS) {
      const geo = new THREE.BoxGeometry(w, h, d);
      if (pivot === 'top') geo.translate(0, -h / 2, 0); else if (pivot === 'bottom') geo.translate(0, h / 2, 0);
      if (name === 'head') { // face on +Z: use right half of the skin texture for the front face
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + (i >= 16 && i < 20 ? 0.5 : 0));
      } else if (mat === 'skin') { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5); }
      const m = new THREE.InstancedMesh(geo, mats[mat], this.maxActive + 40);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
      this.g.scene.add(m); this.meshes[name] = m;
    }
    this._m = { root: new THREE.Matrix4(), a: new THREE.Matrix4(), b: new THREE.Matrix4(), c: new THREE.Matrix4(), l: new THREE.Matrix4(), e: new THREE.Euler(), s: new THREE.Vector3(), col: new THREE.Color() };
    // spit projectiles
    this.spitMeshes = [];
    const sg = new THREE.SphereGeometry(0.12, 8, 6), sm = new THREE.MeshBasicMaterial({ color: 0x8fdc3a });
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; this.g.scene.add(m); this.spitMeshes.push(m); }
  }
  makeClothTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    for (let i = 0; i < 9; i++) { // blood & dirt
      x.fillStyle = i < 6 ? `rgba(${90 + Math.random() * 50},10,10,${0.5 + Math.random() * 0.4})` : 'rgba(40,30,20,0.5)';
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 14, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(20,10,10,0.6)'; for (let i = 0; i < 6; i++) { x.beginPath(); const a = Math.random() * 128; x.moveTo(a, Math.random() * 128); x.lineTo(a + 10, Math.random() * 128); x.stroke(); } // tears
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  makeSkinTex() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#e0e0e0'; x.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${60 + Math.random() * 60},${20 + Math.random() * 30},20,${Math.random() * 0.25})`; x.fillRect(Math.random() * 128, Math.random() * 64, 3, 3); }
    for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(120,10,10,0.7)'; x.beginPath(); x.arc(Math.random() * 64, Math.random() * 64, 3 + Math.random() * 6, 0, 7); x.fill(); }
    // face (right half): sunken eyes, open mouth
    x.fillStyle = 'rgba(25,15,15,0.95)'; x.beginPath(); x.ellipse(82, 24, 7, 5, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(110, 24, 7, 5, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(230,220,150,0.9)'; x.fillRect(80, 23, 3, 2); x.fillRect(109, 23, 3, 2);
    x.fillStyle = 'rgba(40,5,5,0.95)'; x.beginPath(); x.ellipse(96, 48, 10, 6, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(200,190,160,0.9)'; for (let i = 0; i < 5; i++) x.fillRect(88 + i * 3.5, 43, 2, 3);
    x.fillStyle = 'rgba(110,0,0,0.8)'; x.fillRect(90, 52, 4, 10);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---------------------------------------------------------------- population
  makeZombie(type, x, z, outfit = 'civil') {
    const T = ZTYPES[type];
    const o = (OUTFITS[outfit] || OUTFITS.civil)();
    if (type === 'runner' && outfit === 'civil' && chance(0.5)) Object.assign(o, OUTFITS.hoodie());
    if (type === 'brute' && outfit === 'civil') Object.assign(o, chance(0.5) ? OUTFITS.police() : OUTFITS.military());
    return { id: this.nextId++, type, x, z, outfit, shirt: o.shirt, pants: o.pants, skin: pick(SKINS), scale: rand(...T.scale), dir: rand(0, 6.28), goal: null, t: rand(0, 5) };
  }
  initPopulation() {
    const W = this.g.world, rng = seeded(7);
    this.virtual.length = 0;
    let tries = 0;
    while (this.virtual.length < this.populationTarget && tries++ < this.populationTarget * 30) {
      const x = rng.range(-1950, 1950), z = rng.range(-1950, 1950);
      const c = W.classAt(x, z);
      if (c === CLASS.WATER || c === CLASS.BUILDING) continue;
      const wgt = c === CLASS.URBAN ? 1 : c === CLASS.LAWN ? 0.45 : 0.2;
      if (rng() > wgt) continue;
      if (this.inSafeZone(x, z, 30)) continue;
      this.virtual.push(this.makeZombie(this.rollType(false), x, z));
    }
    // dense danger zones
    for (const zn of ZONES) {
      if (zn.type !== 'danger') continue;
      const n = zn.id === 'sahlgrenska' ? 40 : 30;
      const outfit = zn.id === 'sahlgrenska' ? 'patient' : zn.id === 'militar' ? 'military' : 'lab';
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, 6.28), r = rng.range(10, zn.r);
        const x = zn.x + Math.cos(a) * r, z = zn.z + Math.sin(a) * r;
        if (!this.g.isWalkable(x, z, 0.4)) continue;
        let type = this.rollType(false);
        if (zn.id === 'forskning' && chance(0.35)) type = chance(0.5) ? 'screamer' : 'spitter';
        if (zn.id === 'militar' && chance(0.25)) type = 'brute';
        const zb = this.makeZombie(type, x, z, zn.id === 'sahlgrenska' && chance(0.3) ? 'doctor' : outfit);
        zb.home = zn.id; this.virtual.push(zb);
      }
    }
  }
  rollType(night) {
    const day = this.g.time ? this.g.time.day : 1;
    const r = Math.random();
    const runner = 0.12 + (night ? 0.12 : 0) + Math.min(0.1, (day - 1) * 0.03);
    if (r < runner) return 'runner';
    if (r < runner + 0.065) return 'brute';
    if (r < runner + 0.1) return 'screamer';
    if (r < runner + 0.15) return 'spitter';
    return 'walker';
  }
  inSafeZone(x, z, margin = 0) {
    for (const zn of ZONES) if (zn.type === 'safe' && (zn.x - x) ** 2 + (zn.z - z) ** 2 < (zn.r + margin) ** 2) return zn;
    return null;
  }

  activate(v) {
    const T = ZTYPES[v.type], W = this.g.world;
    const z = Object.assign(v, {
      y: W.groundHeight(v.x, v.z), yaw: v.dir, hp: T.hp, maxHp: T.hp, state: ST.WANDER, vx: 0, vz: 0, speed: 0,
      target: null, lastSeen: null, seenT: 0, stateT: rand(2, 8), attackT: 0, phase: rand(0, 6.28), think: rand(0, 0.2),
      groanT: rand(2, 12), deathT: 0, stagger: 0, leg: 1, walkSpeed: rand(...T.walk), stuckT: 0, lastX: v.x, lastZ: v.z,
      screamed: false, spitCd: rand(2, 4), headTwitch: rand(0, 6), fallDir: 1, alerted: 0,
    });
    if (v.goal) { z.state = ST.INVESTIGATE; z.target = v.goal; }
    this.active.push(z);
    return z;
  }
  spawnActive(type, x, z, outfit) { // debug / events
    const v = this.makeZombie(type, x, z, outfit);
    return this.activate(v);
  }

  updatePopulation(dt) {
    const p = this.g.player.pos;
    this.popT = (this.popT || 0) - dt;
    if (this.popT > 0) return;
    this.popT = 0.5;
    // virtual wandering (cheap)
    const W = this.g.world;
    for (let i = this.virtual.length - 1; i >= 0; i--) {
      const v = this.virtual[i];
      v.t -= 0.5;
      let sp = 0.6;
      if (v.goal) {
        const dx = v.goal.x - v.x, dz = v.goal.z - v.z, d = Math.hypot(dx, dz);
        if (d < 5) v.goal = null; else { v.dir = Math.atan2(dx, dz); sp = 1.1; }
      } else if (v.t <= 0) { v.t = rand(4, 15); v.dir = rand(0, 6.28); }
      const nx = v.x + Math.sin(v.dir) * sp * 0.5, nz = v.z + Math.cos(v.dir) * sp * 0.5;
      const c = W.classAt(nx, nz);
      if (c !== CLASS.BUILDING && c !== CLASS.WATER && W.inBounds(nx, nz, 20) && !this.inSafeZone(nx, nz, 5)) { v.x = nx; v.z = nz; }
      else { v.dir = rand(0, 6.28); if (v.goal && chance(0.3)) v.goal = null; }
      // activation
      const d2 = (v.x - p.x) ** 2 + (v.z - p.z) ** 2;
      if (d2 < this.actRadius ** 2 && this.active.length < this.maxActive) {
        this.virtual.splice(i, 1); this.activate(v);
      }
    }
    // deactivation + corpse cleanup
    for (let i = this.active.length - 1; i >= 0; i--) {
      const z = this.active[i];
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (z.state === ST.DEAD) { if (z.deathT > 45 || d > this.deactRadius) this.active.splice(i, 1); continue; }
      if (d > this.deactRadius && z.state === ST.CHASE && d > this.deactRadius + 60) z.state = ST.WANDER;
      if (d > this.deactRadius && z.state !== ST.CHASE) {
        this.active.splice(i, 1);
        if (!W.inBounds(z.x, z.z, 5)) continue; // interior zombies are not part of the city population
        this.virtual.push({ id: z.id, type: z.type, x: z.x, z: z.z, outfit: z.outfit, shirt: z.shirt, pants: z.pants, skin: z.skin, scale: z.scale, dir: z.yaw, goal: null, t: 3, home: z.home });
      }
    }
    // replenish the city slowly (new infected arrive) – grows with days
    const target = this.populationTarget * (1 + Math.min(0.6, (this.g.time.day - 1) * 0.15));
    if (this.virtual.length + this.active.length < target && chance(0.5)) {
      for (let k = 0; k < 10; k++) {
        const x = rand(-1900, 1900), z = rand(-1900, 1900);
        if (Math.hypot(x - p.x, z - p.z) < 260) continue;
        const c = W.classAt(x, z); if (c === CLASS.WATER || c === CLASS.BUILDING || this.inSafeZone(x, z, 30)) continue;
        this.virtual.push(this.makeZombie(this.rollType(this.g.env.nightAmount > 0.5), x, z)); break;
      }
    }
  }

  // noise: active zombies investigate, distant (virtual) ones drift towards it
  noise(x, z, radius, kind) {
    for (const zb of this.active) {
      if (zb.state === ST.DEAD || zb.state === ST.CHASE || zb.state === ST.ATTACK) continue;
      const d = Math.hypot(zb.x - x, zb.z - z);
      if (d < radius * ZTYPES[zb.type].hear) {
        zb.state = ST.INVESTIGATE; zb.target = { x: x + rand(-4, 4), z: z + rand(-4, 4) }; zb.stateT = 15;
        if (chance(0.3)) zb.groanT = rand(0, 1);
      }
    }
    if (radius > 50) {
      for (const v of this.virtual) if ((v.x - x) ** 2 + (v.z - z) ** 2 < (radius * 1.6) ** 2 && chance(0.7)) v.goal = { x: x + rand(-15, 15), z: z + rand(-15, 15) };
    }
  }
  horde(cx, cz, n, toward) {
    for (let i = 0; i < n; i++) {
      const v = this.makeZombie(chance(0.3) ? 'runner' : chance(0.08) ? 'brute' : 'walker', cx + rand(-12, 12), cz + rand(-12, 12));
      v.goal = { x: toward.x + rand(-10, 10), z: toward.z + rand(-10, 10) };
      this.virtual.push(v);
    }
  }
  alertAround(x, z, radius, tx, tz) {
    for (const zb of this.active) {
      if (zb.state === ST.DEAD) continue;
      if (Math.hypot(zb.x - x, zb.z - z) < radius) { zb.state = ST.CHASE; zb.lastSeen = { x: tx, z: tz }; zb.seenT = 0; zb.alerted = 1; }
    }
    for (const v of this.virtual) if (Math.hypot(v.x - x, v.z - z) < radius * 1.5) v.goal = { x: tx, z: tz };
  }

  // ---------------------------------------------------------------- AI
  update(dt) {
    const g = this.g, p = g.player;
    this.updatePopulation(dt);
    this.flow.update(dt, p.pos.x, p.pos.z);
    this.screamCooldown -= dt;
    // spatial hash for separation
    this.grid.clear();
    for (const z of this.active) {
      if (z.state === ST.DEAD) continue;
      const k = Math.floor(z.x / 2) * 10000 + Math.floor(z.z / 2);
      let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(z);
    }
    const night = g.env.nightAmount;
    const eye = p.eye;
    for (const z of this.active) {
      if (z.state === ST.DEAD) { z.deathT += dt; continue; }
      z.think -= dt;
      if (z.think <= 0) { z.think = 0.2; this.perceive(z, p, eye, night); }
      this.move(z, dt, p);
      // vocal
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = z.state === ST.CHASE ? rand(2, 5) : rand(6, 16);
        const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
        if (d < 60) g.audio?.zombie({ x: z.x, y: z.y + 1.6, z: z.z }, z.state === ST.CHASE && z.type === 'runner' ? 'attack' : 'groan', ZTYPES[z.type].pitch * rand(0.9, 1.1));
      }
    }
    this.updateSpits(dt);
  }

  perceive(z, p, eye, night) {
    const g = this.g, T = ZTYPES[z.type];
    if (!p.alive) { if (z.state === ST.CHASE || z.state === ST.ATTACK) { z.state = ST.WANDER; } return; }
    const dx = p.pos.x - z.x, dz = p.pos.z - z.z, dist = Math.hypot(dx, dz);
    // sight
    let range = T.sight;
    range *= 1 - night * 0.5;
    if (night > 0.3 && g.weapons?.flashlightOn) range *= 1.6;
    if (p.crouch > 0.5) range *= 0.55;
    if (!p.moving) range *= 0.75;
    range *= clamp(1 - (g.env.current.fog - 0.005) * 25, 0.45, 1);
    if (g.isIndoor()) range *= 0.8;
    const safe = this.inSafeZone(p.pos.x, p.pos.z, -5);
    let sees = false;
    if (dist < range && Math.abs(p.pos.y - z.y) < 8) {
      const fwdx = Math.sin(z.yaw), fwdz = Math.cos(z.yaw);
      const cos = (dx * fwdx + dz * fwdz) / (dist || 1);
      if (dist < 3.5 || cos > 0.3 || z.state === ST.CHASE) {
        sees = g.collision.los(z.x, z.y + 1.6 * z.scale, z.z, eye.x, eye.y, eye.z);
      }
    }
    if (sees && !safe) {
      // a screamer always screams the first time it sets eyes on the player
      if (T.special === 'scream' && !z.screamed && this.screamCooldown <= 0 && z.state !== ST.ATTACK && z.state !== ST.SCREAM) {
        z.state = ST.SCREAM; z.stateT = 2.4; z.screamed = true; this.screamCooldown = 25;
        z.lastSeen = { x: p.pos.x, z: p.pos.z }; z.seenT = 0;
        g.audio?.zombie({ x: z.x, y: z.y + 1.6, z: z.z }, 'scream', 1);
        g.hud.message('Ett genomträngande skrik ekar mellan husen…', 'warn');
        return;
      }
      if (z.state !== ST.CHASE && z.state !== ST.ATTACK && z.state !== ST.SCREAM) {
        z.groanT = rand(0, 0.4);
        // nearby zombies notice too
        for (const o of this.active) if (o !== z && o.state < ST.CHASE && Math.hypot(o.x - z.x, o.z - z.z) < 9) { o.state = ST.CHASE; o.lastSeen = { x: p.pos.x, z: p.pos.z }; }
      }
      if (z.state !== ST.ATTACK && z.state !== ST.SCREAM) z.state = ST.CHASE;
      z.lastSeen = { x: p.pos.x, z: p.pos.z }; z.seenT = 0;
    } else if (z.state === ST.CHASE) {
      z.seenT += 0.2;
      // hearing a close player keeps the chase alive
      if (dist < 6 && !safe) { z.lastSeen = { x: p.pos.x, z: p.pos.z }; z.seenT = Math.min(z.seenT, 1); }
      if (z.seenT > (z.alerted ? 12 : 7) || safe) { z.state = ST.SEARCH; z.target = z.lastSeen; z.stateT = 10; z.alerted = 0; }
    }
    // spitter ranged attack
    if (T.special === 'spit' && z.state === ST.CHASE && sees && dist > 4 && dist < 20) {
      z.spitCd -= 0.2;
      if (z.spitCd <= 0) { z.spitCd = rand(3, 5); this.spit(z, eye); }
    }
  }

  move(z, dt, p) {
    const g = this.g, T = ZTYPES[z.type];
    let tx = null, tz = null, speed = z.walkSpeed;
    z.stateT -= dt;
    switch (z.state) {
      case ST.IDLE: speed = 0; if (z.stateT <= 0) { z.state = ST.WANDER; z.stateT = rand(5, 14); z.target = null; } break;
      case ST.WANDER:
        if (!z.target || z.stateT <= 0) {
          z.target = { x: z.x + rand(-15, 15), z: z.z + rand(-15, 15) }; z.stateT = rand(5, 14);
          if (z.home) { const zn = ZONES.find(q => q.id === z.home); if (zn && Math.hypot(z.x - zn.x, z.z - zn.z) > zn.r) z.target = { x: zn.x + rand(-20, 20), z: zn.z + rand(-20, 20) }; }
          if (chance(0.35)) { z.state = ST.IDLE; z.stateT = rand(2, 6); }
        }
        tx = z.target.x; tz = z.target.z; speed *= 0.8; break;
      case ST.INVESTIGATE: case ST.SEARCH:
        if (!z.target) { z.state = ST.WANDER; break; }
        tx = z.target.x; tz = z.target.z; speed = Math.max(z.walkSpeed * 1.25, z.type === 'runner' ? 2.2 : 0);
        if (Math.hypot(tx - z.x, tz - z.z) < 2 || z.stateT <= 0) { z.state = ST.IDLE; z.stateT = rand(3, 6); }
        break;
      case ST.CHASE: {
        const dist = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
        speed = T.run * (z.type === 'walker' ? (0.75 + 0.25 * Math.sin(z.phase * 0.3)) : 1) * z.leg;
        if (z.seenT < 0.5 && dist < T.reach && p.alive && Math.abs(p.pos.y - z.y) < 1.6) { z.state = ST.ATTACK; z.attackT = T.atk; z.hitDone = false; g.audio?.zombie({ x: z.x, y: z.y + 1.6, z: z.z }, 'attack', T.pitch); break; }
        const target = z.seenT < 0.5 ? p.pos : z.lastSeen;
        tx = target.x; tz = target.z;
        // flow field around obstacles when we cannot walk straight
        if (dist > 2.5 && z.seenT < 3) {
          const fd = this.flow.dirAt(z.x, z.z);
          if (fd && !(dist < 14 && z.seenT === 0 && this.clearPath(z, p))) { tx = z.x + fd.x * 3; tz = z.z + fd.z * 3; }
        }
        break;
      }
      case ST.ATTACK: {
        speed = 0;
        z.attackT -= dt;
        const dx = p.pos.x - z.x, dz = p.pos.z - z.z;
        z.yaw = turn(z.yaw, Math.atan2(dx, dz), dt * 6);
        if (!z.hitDone && z.attackT < T.atk * 0.45) {
          z.hitDone = true;
          const d = Math.hypot(dx, dz);
          if (d < T.reach + 0.45 && p.alive && Math.abs(p.pos.y - z.y) < 1.6) g.zombieHit(z, T);
        }
        if (z.attackT <= 0) z.state = ST.CHASE;
        break;
      }
      case ST.SCREAM:
        speed = 0;
        if (z.stateT <= 0) { z.state = ST.CHASE; this.alertAround(z.x, z.z, 120, p.pos.x, p.pos.z); this.horde(z.x + rand(-60, 60), z.z + rand(-60, 60), Math.floor(rand(3, 7)), p.pos); }
        break;
    }
    if (z.stagger > 0) { z.stagger -= dt; speed *= 0.2; }
    // steering
    let dx = 0, dz = 0;
    if (tx !== null && speed > 0) {
      dx = tx - z.x; dz = tz - z.z; const L = Math.hypot(dx, dz);
      if (L > 0.3) { dx /= L; dz /= L; } else { dx = dz = 0; }
    }
    // separation
    let sx = 0, sz = 0;
    const gx = Math.floor(z.x / 2), gz = Math.floor(z.z / 2);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = this.grid.get((gx + a) * 10000 + gz + b); if (!arr) continue;
      for (const o of arr) {
        if (o === z) continue;
        const ex = z.x - o.x, ez = z.z - o.z, d = Math.hypot(ex, ez), min = 0.75 * (z.scale + o.scale) * 0.5 + (z.type === 'brute' || o.type === 'brute' ? 0.2 : 0);
        if (d < min && d > 1e-4) { sx += ex / d * (min - d); sz += ez / d * (min - d); }
      }
    }
    // keep away from the player body
    const pdx = z.x - p.pos.x, pdz = z.z - p.pos.z, pd = Math.hypot(pdx, pdz);
    if (pd < 0.75 && pd > 1e-4 && Math.abs(p.pos.y - z.y) < 1.5) { sx += pdx / pd * (0.75 - pd) * 2; sz += pdz / pd * (0.75 - pd) * 2; }
    const tvx = dx * speed, tvz = dz * speed;
    const acc = z.type === 'runner' ? 12 : 5;
    z.vx += clamp(tvx - z.vx, -acc * dt, acc * dt); z.vz += clamp(tvz - z.vz, -acc * dt, acc * dt);
    if (Math.hypot(z.x - p.pos.x, z.z - p.pos.z) > this.deactRadius + 60 && z.state === ST.CHASE) { z.state = ST.WANDER; z.target = null; }
    const pos = { x: z.x + z.vx * dt + sx * 0.5, z: z.z + z.vz * dt + sz * 0.5 };
    const r = z.type === 'brute' ? 0.45 : 0.32;
    const hit = g.collision.collideCircle(pos, r, z.y, 1.7, F.ZOMBIE, 0.5);
    if (hit && hit.seg && hit.seg.owner && hit.seg.owner.bash && (z.state === ST.CHASE || z.state === ST.SEARCH || z.state === ST.INVESTIGATE)) hit.seg.owner.bash(dt * (z.type === 'brute' ? 3 : 1), z);
    const gy = g.world.groundHeight(pos.x, pos.z);
    if (gy - z.y < 0.7) { z.x = pos.x; z.z = pos.z; z.y = lerp(z.y, gy, clamp(dt * 12, 0, 1)); }
    const moved = Math.hypot(z.vx, z.vz);
    z.speed = moved;
    if (moved > 0.15) z.yaw = turn(z.yaw, Math.atan2(z.vx, z.vz), dt * (z.type === 'runner' ? 8 : 3.5));
    z.phase += dt * (moved * (z.type === 'runner' ? 2.6 : 3.4) + 0.4);
    // stuck detection
    z.stuckT += dt;
    if (z.stuckT > 2) {
      if (Math.hypot(z.x - z.lastX, z.z - z.lastZ) < 0.5 && speed > 0 && z.state !== ST.CHASE) { z.target = null; z.stateT = 0; if (z.state !== ST.WANDER) z.state = ST.WANDER; }
      z.stuckT = 0; z.lastX = z.x; z.lastZ = z.z;
    }
  }
  clearPath(z, p) {
    return !this.g.collision.raycast(z.x, z.y + 0.8, z.z, ...norm3(p.pos.x - z.x, 0, p.pos.z - z.z), Math.hypot(p.pos.x - z.x, p.pos.z - z.z), F.ZOMBIE, true);
  }

  // ---------------------------------------------------------------- spit
  spit(z, eye) {
    const sy = z.y + 1.55 * z.scale;
    const dx = eye.x - z.x, dz = eye.z - z.z, d = Math.hypot(dx, dz);
    const t = d / 14; // flight time
    const vy = (eye.y - 0.3 - sy) / t + 0.5 * 9.8 * t;
    this.spits.push({ x: z.x, y: sy, z: z.z, vx: dx / t, vy, vz: dz / t, life: t + 1 });
    this.g.audio?.spit({ x: z.x, y: sy, z: z.z });
  }
  updateSpits(dt) {
    const g = this.g, p = g.player;
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      s.vy -= 9.8 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.life -= dt;
      g.fx.smoke.spawn({ x: s.x, y: s.y, z: s.z, life: 0.4, size: 0.15, grow: 0.3, r: 0.5, g2: 0.9, b: 0.2, alpha: 0.6, gravity: 0 });
      const pe = p.eye;
      const hitP = Math.hypot(s.x - pe.x, s.z - pe.z) < 0.7 && s.y < pe.y + 0.4 && s.y > p.pos.y;
      const hitG = s.y < g.world.groundHeight(s.x, s.z);
      if (hitP || hitG || s.life <= 0) {
        if (hitP) { g.acidHit(); }
        for (let k = 0; k < 10; k++) g.fx.smoke.spawn({ x: s.x, y: s.y, z: s.z, vx: rand(-1.5, 1.5), vy: rand(0, 2), vz: rand(-1.5, 1.5), life: 0.8, size: 0.3, grow: 0.5, r: 0.45, g2: 0.85, b: 0.15, alpha: 0.7, gravity: 3 });
        this.spits.splice(i, 1);
      }
    }
    this.spitMeshes.forEach((m, i) => { const s = this.spits[i]; m.visible = !!s; if (s) m.position.set(s.x, s.y, s.z); });
  }

  // ---------------------------------------------------------------- combat
  hitboxes(z) {
    const s = z.scale, sy = z.type === 'brute' ? s * 1.06 : s;
    const lean = ZTYPES[z.type].lean * (z.state === ST.CHASE ? 1.3 : 1);
    const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
    const head = { x: z.x + fx * (0.1 + lean * 0.45) * s, y: z.y + 1.72 * sy - lean * 0.12, z: z.z + fz * (0.1 + lean * 0.45) * s, r: 0.15 * s };
    const torsoA = { x: z.x, y: z.y + 1.0 * sy, z: z.z }, torsoB = { x: z.x + fx * lean * 0.35 * s, y: z.y + 1.4 * sy, z: z.z + fz * lean * 0.35 * s };
    const legsA = { x: z.x, y: z.y + 0.08, z: z.z }, legsB = { x: z.x, y: z.y + 0.95 * sy, z: z.z };
    return { head, torso: [torsoA, torsoB, 0.26 * s * (z.type === 'brute' ? 1.2 : 1)], legs: [legsA, legsB, 0.2 * s * (z.type === 'brute' ? 1.2 : 1)] };
  }
  raycast(o, d, maxT) {
    let best = null;
    for (const z of this.active) {
      if (z.state === ST.DEAD) continue;
      const cx = z.x - o.x, cz = z.z - o.z;
      const along = cx * d.x + cz * d.z; if (along < -1 || along > maxT + 1) continue;
      if (Math.abs(cx * d.z - cz * d.x) > 1.5) continue; // quick reject
      const hb = this.hitboxes(z);
      const th = raySphere(o, d, hb.head);
      const tt = rayCapsule(o, d, ...hb.torso);
      const tl = rayCapsule(o, d, ...hb.legs);
      let t = Infinity, part = null;
      if (tt !== null) { t = tt; part = 'torso'; }
      if (tl !== null && tl < t - 0.05) { t = tl; part = 'legs'; }
      if (th !== null && th < t + 0.25) { t = Math.min(t, th); part = 'head'; } // the head wins where it overlaps the shoulders
      if (part && t < maxT && (!best || t < best.t)) best = { t, zombie: z, part, x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
    }
    return best;
  }
  meleeTarget(o, fwd, range) {
    let best = null;
    for (const z of this.active) {
      if (z.state === ST.DEAD) continue;
      const hb = this.hitboxes(z);
      for (const [part, c] of [['head', hb.head], ['torso', { x: (hb.torso[0].x + hb.torso[1].x) / 2, y: (hb.torso[0].y + hb.torso[1].y) / 2, z: (hb.torso[0].z + hb.torso[1].z) / 2 }]]) {
        const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z, d = Math.hypot(dx, dy, dz);
        if (d > range + 0.3) continue;
        const cos = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
        if (cos < 0.65) continue;
        const score = d - (part === 'head' ? 0.15 : 0);
        if (!best || score < best.score) best = { zombie: z, part, x: c.x, y: c.y, z: c.z, score };
      }
    }
    return best;
  }
  damage(z, amount, part, dir, melee = false) {
    if (z.state === ST.DEAD) return false;
    const T = ZTYPES[z.type];
    let mul = part === 'head' ? (T.armor ? 2.2 : 3.5) : part === 'legs' ? 0.7 : 1;
    if (T.armor && part === 'torso') mul *= T.armor;
    z.hp -= amount * mul;
    if (part === 'legs' && chance(0.25)) z.leg = Math.max(0.45, z.leg - 0.25);
    if (amount * mul > 30 || melee) z.stagger = z.type === 'brute' ? 0.1 : melee ? 0.5 : 0.35;
    if (z.state !== ST.CHASE && z.state !== ST.ATTACK) { z.state = ST.CHASE; z.lastSeen = { x: this.g.player.pos.x, z: this.g.player.pos.z }; z.seenT = 0; }
    if (z.hp <= 0) {
      z.state = ST.DEAD; z.deathT = 0; z.fallDir = (dir.x * Math.sin(z.yaw) + dir.z * Math.cos(z.yaw)) > 0 ? -1 : 1;
      this.g.audio?.zombie({ x: z.x, y: z.y + 1.4, z: z.z }, 'death', T.pitch);
      this.g.onZombieKilled(z, part);
      return true;
    }
    return false;
  }
  visibleOnRadar() {
    const p = this.g.player.pos;
    return this.active.filter(z => z.state !== ST.DEAD && (z.state === ST.CHASE || Math.hypot(z.x - p.x, z.z - p.z) < 25));
  }
  get chasing() { return this.active.filter(z => z.state === ST.CHASE || z.state === ST.ATTACK).length; }
  nearestDist(x, z) { let b = Infinity; for (const zb of this.active) if (zb.state !== ST.DEAD) b = Math.min(b, Math.hypot(zb.x - x, zb.z - z)); return b; }

  // ---------------------------------------------------------------- pose + instancing
  render() {
    const M = this._m, cam = this.g.camera.position;
    let n = 0;
    const cnt = this.meshes.pelvis.instanceMatrix.count;
    for (const z of this.active) {
      if (n >= cnt) break;
      if (Math.hypot(z.x - cam.x, z.z - cam.z) > 160) continue;
      this.pose(z, n); n++;
    }
    for (const m of Object.values(this.meshes)) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  pose(z, i) {
    const M = this._m, T = ZTYPES[z.type], e = M.e;
    const s = z.scale, wide = z.type === 'brute' ? 1.18 : 1;
    // root
    let pitch = 0, drop = 0;
    if (z.state === ST.DEAD) {
      const k = clamp(z.deathT / 0.75, 0, 1); pitch = z.fallDir * (Math.PI / 2) * k * k; drop = 0;
    }
    M.root.makeRotationFromEuler(e.set(pitch, z.yaw, 0, 'YXZ'));
    M.root.scale(M.s.set(s * wide, s * (z.type === 'brute' ? 1.06 : 1), s * wide));
    M.root.setPosition(z.x, z.y - drop + (z.state === ST.DEAD ? 0.08 : 0), z.z);
    const dead = z.state === ST.DEAD;
    const ph = z.phase, spd = clamp(z.speed / 2, 0, 1.4);
    const run = z.speed > 2.5;
    const swing = dead ? 0 : Math.sin(ph) * (0.25 + spd * 0.45);
    const lean = dead ? 0 : T.lean * (z.state === ST.CHASE ? 1.3 : 1) + (run ? 0.15 : 0);
    const bob = dead ? 0 : Math.abs(Math.cos(ph)) * 0.04 * spd;
    // pelvis
    this.setPart('pelvis', i, M.root, 0, 0.95 + bob, 0, 0, Math.sin(ph) * 0.08, 0, z.pants);
    // torso
    this.setPart('torso', i, M.root, 0, 1.03 + bob, 0, lean, -Math.sin(ph) * 0.12, Math.sin(ph * 0.5) * 0.05, z.shirt);
    const torsoM = M.c.copy(M.l);
    // head
    z.headTwitch += 0.016;
    const tw = Math.sin(z.headTwitch * 7) * Math.sin(z.headTwitch * 1.3) * 0.25;
    this.setPart('head', i, torsoM, 0, 0.6, 0.02, -lean * 0.6 + (dead ? 0.5 : 0.1), tw, tw * 0.6 + 0.15, z.skin);
    // arms
    let armPitch, armSwing, elbow;
    if (z.state === ST.ATTACK) {
      const k = 1 - z.attackT / T.atk; armPitch = -2.3 + Math.sin(k * Math.PI) * 1.4 + k * 0.4; armSwing = 0; elbow = -0.3;
    } else if (run || z.type === 'runner') { armPitch = -0.4; armSwing = Math.sin(ph) * 0.9 * spd; elbow = -1.2; }
    else if (z.type === 'brute') { armPitch = -0.3; armSwing = Math.sin(ph) * 0.3; elbow = -0.2; }
    else { armPitch = -1.35 + Math.sin(ph * 0.5) * 0.1; armSwing = Math.sin(ph) * 0.15; elbow = -0.25; }
    if (z.state === ST.SCREAM) { armPitch = -0.2; armSwing = 0; elbow = -0.1; }
    if (dead) { armPitch = -2.6; armSwing = 0; elbow = -0.2; }
    for (const side of [-1, 1]) {
      const L = side < 0 ? 'L' : 'R';
      const ap = armPitch + armSwing * side * (z.state === ST.ATTACK ? 0 : 1) * (run || z.type !== 'walker' ? 1 : 0.4);
      this.setPart(`uarm${L}`, i, torsoM, side * 0.25, 0.53, 0, ap, 0, side * -0.12, z.shirt);
      const ua = M.b.copy(M.l);
      this.setPart(`larm${L}`, i, ua, 0, -0.31, 0, elbow, 0, 0, z.skin);
    }
    // legs
    for (const side of [-1, 1]) {
      const L = side < 0 ? 'L' : 'R';
      const legS = dead ? 0.1 * side : swing * side;
      const knee = dead ? 0.2 : Math.max(0, Math.sin(ph + (side < 0 ? 0 : Math.PI) + 1.2)) * (0.3 + spd * 0.7);
      this.setPart(`thigh${L}`, i, M.root, side * 0.1, 0.92 + bob, 0, -legS, 0, side * 0.03, z.pants);
      const th = M.b.copy(M.l);
      this.setPart(`shin${L}`, i, th, 0, -0.45, 0, knee, 0, 0, z.pants);
    }
  }
  // compute parent * T(x,y,z) * R(rx,ry,rz) into this._m.l (world) and write instance
  setPart(name, i, parent, x, y, zz, rx, ry, rz, color) {
    const M = this._m;
    const local = this._loc || (this._loc = new THREE.Matrix4());
    local.makeRotationFromEuler(M.e.set(rx, ry, rz, 'XYZ')); local.setPosition(x, y, zz);
    M.l.multiplyMatrices(parent, local);
    this.write(name, i, M.l, color);
  }
  write(name, i, m, color) {
    const mesh = this.meshes[name]; mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, this._m.col.setHex(color));
  }
  serialize() {
    return { virtual: this.virtual.map(v => [v.type, Math.round(v.x), Math.round(v.z), v.outfit, v.home || '']).concat(
      this.active.filter(z => z.state !== ST.DEAD).map(z => [z.type, Math.round(z.x), Math.round(z.z), z.outfit, z.home || ''])) };
  }
  restore(o) {
    this.active.length = 0; this.virtual.length = 0;
    for (const [type, x, z, outfit, home] of o.virtual || []) { const v = this.makeZombie(type, x, z, outfit); if (home) v.home = home; this.virtual.push(v); }
  }
}
export { ST };

function turn(a, b, k) { return a + clamp(wrapAngle(b - a), -k, k); }
function norm3(x, y, z) { const L = Math.hypot(x, y, z) || 1; return [x / L, y / L, z / L]; }
function raySphere(o, d, s) {
  const ox = o.x - s.x, oy = o.y - s.y, oz = o.z - s.z;
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - s.r * s.r;
  const h = b * b - c; if (h < 0) return null;
  const t = -b - Math.sqrt(h); return t > 0 ? t : null;
}
function rayCapsule(o, d, a, b, r) {
  // closest approach between ray and segment, accept if within r
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
  const A = d.x * d.x + d.y * d.y + d.z * d.z, B = d.x * ux + d.y * uy + d.z * uz, C = ux * ux + uy * uy + uz * uz;
  const D = d.x * wx + d.y * wy + d.z * wz, E = ux * wx + uy * wy + uz * wz;
  const den = A * C - B * B;
  let sc, tc;
  if (den < 1e-8) { sc = 0; tc = E / C; } else { sc = (B * E - C * D) / den; tc = (A * E - B * D) / den; }
  tc = clamp(tc, 0, 1);
  sc = (tc * B - D) / A;
  if (sc < 0) return null;
  const px = o.x + d.x * sc - (a.x + ux * tc), py = o.y + d.y * sc - (a.y + uy * tc), pz = o.z + d.z * sc - (a.z + uz * tc);
  const dist = Math.hypot(px, py, pz);
  if (dist > r) return null;
  return Math.max(0, sc - Math.sqrt(r * r - dist * dist));
}

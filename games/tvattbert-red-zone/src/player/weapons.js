// Weapons: definitions, viewmodels, firing, reloading, melee, flashlight.
import * as THREE from 'three';
import { clamp, lerp, rand } from '../core/util.js';
import { F } from '../world/collision.js';
import { ITEMS } from '../game/items.js';

export const WEAPONS = {
  knife: { name: 'Kniv', slot: 1, melee: true, damage: 45, range: 2.1, rate: 0.55, noise: 2 },
  pistol: { name: 'Glock 17', slot: 2, ammo: 'ammo_9mm', mag: 17, damage: 34, pellets: 1, rate: 0.17, auto: false, spread: 0.02, aimSpread: 0.006, recoil: 0.035, reload: 1.5, reloadEmpty: 1.9, noise: 90, range: 70, sound: 'pistol', fov: 60 },
  shotgun: { name: 'Pumphagelgevär', slot: 3, ammo: 'ammo_12g', mag: 6, damage: 17, pellets: 9, rate: 0.9, auto: false, spread: 0.075, aimSpread: 0.055, recoil: 0.12, reloadShell: 0.55, noise: 125, range: 30, sound: 'shotgun', fov: 62, pump: true },
  rifle: { name: 'Automatkarbin 5', slot: 4, ammo: 'ammo_556', mag: 30, damage: 38, pellets: 1, rate: 0.088, auto: true, spread: 0.022, aimSpread: 0.004, recoil: 0.028, reload: 2.3, reloadEmpty: 2.8, noise: 150, range: 250, sound: 'rifle', fov: 55 },
  hunting: { name: 'Jaktgevär .308', slot: 5, ammo: 'ammo_308', mag: 5, damage: 130, pellets: 1, rate: 1.2, auto: false, spread: 0.03, aimSpread: 0.0006, recoil: 0.13, reload: 2.9, reloadEmpty: 2.9, noise: 160, range: 400, sound: 'hunting', fov: 16, scope: true, bolt: true },
};
const ORDER = ['knife', 'pistol', 'shotgun', 'rifle', 'hunting'];

export class Weapons {
  constructor(game) {
    this.g = game;
    this.owned = { knife: { mag: 0 } };
    this.current = 'knife';
    this.cool = 0; this.reloading = 0; this.reloadTotal = 0; this.shellReload = false;
    this.aiming = false; this.aimT = 0; this.kick = 0; this.bloom = 0; this.swap = 0; this.swingT = 0; this.actionT = 0;
    this.flashlightOn = false; this.battery = 100;
    this.models = {};
    this.buildModels();
    this.flashlight = new THREE.SpotLight(0xfff2d8, 0, 70, 0.5, 0.55, 1.1);
    this.flashlight.castShadow = game.settings.quality === 'high';
    game.camera.add(this.flashlight); game.camera.add(this.flashlight.target);
    this.flashlight.position.set(0.2, -0.15, 0); this.flashlight.target.position.set(0, 0, -10);
    // viewmodel lights
    this.vmHemi = new THREE.HemisphereLight(0xe8e4dc, 0x3a3630, 1); game.vmScene.add(this.vmHemi);
    this.vmDir = new THREE.DirectionalLight(0xffffff, 1); this.vmDir.position.set(1, 2, 1); game.vmScene.add(this.vmDir);
    this.vmFlash = new THREE.PointLight(0xffaa55, 0, 3); this.vmFlash.position.set(0.1, -0.05, -0.8); game.vmScene.add(this.vmFlash);
    this.select('knife', true);
  }

  // ---------------------------------------------------------------- models
  buildModels() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x4a4c50, metalness: 0.3, roughness: 0.5 });
    const poly = new THREE.MeshStandardMaterial({ color: 0x2e2e31, metalness: 0.05, roughness: 0.7 });
    const wood = new THREE.MeshStandardMaterial({ map: this.g.tex.wood, color: 0x8a5a36, roughness: 0.6 });
    const green = new THREE.MeshStandardMaterial({ color: 0x3b4630, roughness: 0.8 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.5, roughness: 0.35 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.95 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.8 });
    const box = (w, h, d, m, x = 0, y = 0, z = 0, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; return o; };
    const cyl = (r, l, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); return o; };
    const arms = (grip, fore) => {
      const g = new THREE.Group();
      const ra = new THREE.Group(); ra.add(box(0.09, 0.09, 0.4, sleeve, 0, 0, 0.2)); ra.add(box(0.08, 0.06, 0.1, glove, 0, 0, -0.02));
      ra.position.set(...grip); ra.rotation.set(0.2, 0.15, 0); g.add(ra);
      if (fore) { const la = new THREE.Group(); la.add(box(0.09, 0.09, 0.45, sleeve, 0, 0, 0.24)); la.add(box(0.08, 0.06, 0.1, glove, 0, 0, 0));
        la.position.set(...fore); la.rotation.set(0.15, -0.5, 0.2); g.add(la); }
      return g;
    };
    const M = {};
    // knife
    { const g = new THREE.Group(); g.add(box(0.012, 0.035, 0.2, steel, 0, 0, -0.12)); g.add(box(0.022, 0.03, 0.11, poly, 0, -0.005, 0.03));
      g.add(arms([0, -0.03, 0.06])); g.userData = { hip: [0.22, -0.2, -0.35], ads: [0.22, -0.2, -0.35], muzzle: [0, 0, -0.2] }; M.knife = g; }
    // pistol
    { const g = new THREE.Group(); g.add(box(0.032, 0.04, 0.19, metal, 0, 0.02, -0.05)); g.add(box(0.03, 0.025, 0.16, poly, 0, -0.008, -0.04));
      const grip = box(0.03, 0.11, 0.045, poly, 0, -0.06, 0.03); grip.rotation.x = -0.25; g.add(grip);
      g.add(box(0.006, 0.01, 0.006, metal, 0, 0.046, -0.13)); g.add(box(0.02, 0.008, 0.006, metal, 0, 0.044, 0.035));
      g.add(arms([0, -0.08, 0.06], [-0.02, -0.08, 0.04]));
      g.userData = { hip: [0.16, -0.16, -0.42], ads: [0, -0.066, -0.34], muzzle: [0, 0.02, -0.15], slide: g.children[0] }; M.pistol = g; }
    // shotgun
    { const g = new THREE.Group(); g.add(box(0.05, 0.07, 0.22, metal, 0, 0, 0)); g.add(cyl(0.012, 0.55, metal, 0, 0.02, -0.38)); g.add(cyl(0.013, 0.42, metal, 0, -0.012, -0.32));
      const pump = box(0.055, 0.045, 0.16, poly, 0, -0.015, -0.3); g.add(pump);
      const st = box(0.045, 0.08, 0.3, wood, 0, -0.04, 0.24); st.rotation.x = 0.15; g.add(st);
      g.add(box(0.006, 0.01, 0.006, steel, 0, 0.035, -0.64));
      g.add(arms([0, -0.07, 0.12], [0, -0.06, -0.3]));
      g.userData = { hip: [0.2, -0.2, -0.45], ads: [0, -0.072, -0.35], muzzle: [0, 0.02, -0.66], pump }; M.shotgun = g; }
    // rifle (Ak 5 style)
    { const g = new THREE.Group(); g.add(box(0.05, 0.07, 0.3, green, 0, 0, 0)); g.add(cyl(0.011, 0.36, metal, 0, 0.01, -0.33)); g.add(box(0.06, 0.06, 0.2, poly, 0, 0.005, -0.22));
      const mag = box(0.03, 0.17, 0.07, metal, 0, -0.1, -0.03); mag.rotation.x = 0.25; g.add(mag);
      g.add(box(0.04, 0.03, 0.12, metal, 0, 0.05, 0.04)); g.add(box(0.012, 0.02, 0.012, metal, 0, 0.052, -0.3));
      const st = box(0.04, 0.07, 0.26, poly, 0, -0.02, 0.27); g.add(st);
      g.add(arms([0, -0.08, 0.1], [0, -0.05, -0.22]));
      g.userData = { hip: [0.2, -0.19, -0.42], ads: [0, -0.068, -0.3], muzzle: [0, 0.01, -0.52], mag }; M.rifle = g; }
    // hunting rifle
    { const g = new THREE.Group(); g.add(box(0.05, 0.06, 0.25, metal, 0, 0, 0)); g.add(cyl(0.01, 0.6, metal, 0, 0.012, -0.42));
      const st = box(0.05, 0.09, 0.75, wood, 0, -0.035, 0.05); g.add(st);
      g.add(cyl(0.022, 0.32, poly, 0, 0.07, -0.03)); g.add(cyl(0.028, 0.05, poly, 0, 0.07, -0.2)); g.add(cyl(0.025, 0.05, poly, 0, 0.07, 0.13));
      const bolt = box(0.012, 0.012, 0.06, steel, 0.04, 0.02, 0.06); g.add(bolt);
      g.add(arms([0, -0.08, 0.15], [0, -0.06, -0.28]));
      g.userData = { hip: [0.2, -0.2, -0.45], ads: [0, -0.07, -0.25], muzzle: [0, 0.012, -0.72], bolt }; M.hunting = g; }
    for (const [k, m] of Object.entries(M)) { m.visible = false; m.traverse(o => { if (o.isMesh) o.frustumCulled = false; }); this.g.vmScene.add(m); }
    this.models = M;
    // muzzle flash sprite
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.tex.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.25); this.flash.visible = false; this.g.vmScene.add(this.flash);
  }

  // ---------------------------------------------------------------- state
  give(id, magRounds = null) {
    const def = WEAPONS[id];
    if (!this.owned[id]) { this.owned[id] = { mag: magRounds ?? Math.floor(def.mag * rand(0.3, 1)) }; return true; }
    return false;
  }
  get def() { return WEAPONS[this.current]; }
  get mag() { return this.owned[this.current]?.mag || 0; }
  reserve(id = this.current) { const d = WEAPONS[id]; return d.ammo ? this.g.inventory.count(d.ammo) : 0; }
  select(id, instant = false) {
    if (!this.owned[id] || (id === this.current && !instant)) return;
    this.current = id; this.reloading = 0; this.shellReload = false; this.swap = instant ? 0 : 0.45; this.aimT = 0;
    for (const [k, m] of Object.entries(this.models)) m.visible = k === id;
    this.g.audio && this.g.audio.click(900, 0.3);
  }
  aimSensMul() { return this.def.scope ? 0.25 : 0.65; }
  cycle(dir) {
    const own = ORDER.filter(k => this.owned[k]);
    const i = own.indexOf(this.current);
    this.select(own[(i + dir + own.length) % own.length]);
  }
  startReload() {
    const d = this.def;
    if (d.melee || this.reloading > 0 || this.mag >= d.mag || this.reserve() <= 0) return;
    if (d.reloadShell) { this.shellReload = true; this.reloading = d.reloadShell; this.reloadTotal = d.reloadShell; this.g.audio?.reloadSound('shell'); return; }
    const t = this.mag === 0 ? d.reloadEmpty : d.reload;
    this.reloading = t; this.reloadTotal = t; this.g.audio?.reloadSound(this.current, t);
  }
  finishReload() {
    const d = this.def, o = this.owned[this.current];
    if (d.reloadShell) {
      if (this.g.inventory.remove(d.ammo, 1)) o.mag++;
      if (o.mag < d.mag && this.reserve() > 0 && this.shellReload) { this.reloading = d.reloadShell; this.reloadTotal = d.reloadShell; this.g.audio?.reloadSound('shell'); }
      else { this.shellReload = false; this.actionT = 0.5; this.g.audio?.pump(); }
      return;
    }
    const need = d.mag - o.mag;
    o.mag += this.g.inventory.remove(d.ammo, need);
  }

  update(dt) {
    const g = this.g, inp = g.input, p = g.player;
    if (!p.alive) return;
    // switching
    for (let i = 0; i < ORDER.length; i++) if (inp.hit(`Digit${i + 1}`)) this.select(ORDER[i]);
    if (inp.mouse.wheel) this.cycle(inp.mouse.wheel > 0 ? 1 : -1);
    if (inp.hit('KeyR')) this.startReload();
    if (inp.hit('KeyF')) this.toggleFlashlight();
    const d = this.def;
    this.cool -= dt; this.swap = Math.max(0, this.swap - dt); this.actionT = Math.max(0, this.actionT - dt);
    this.kick = Math.max(0, this.kick - dt * 6); this.bloom = Math.max(0, this.bloom - dt * 2.5);
    this.swingT = Math.max(0, this.swingT - dt);
    if (this.reloading > 0) { this.reloading -= dt; if (this.reloading <= 0) { this.reloading = 0; this.finishReload(); } }
    this.aiming = inp.mouse.right && !d.melee && !p.sprinting && this.swap === 0 && (this.reloading === 0 || this.shellReload);
    this.aimT = clamp(this.aimT + (this.aiming ? 1 : -1) * dt * (d.scope ? 4 : 7), 0, 1);
    const busy = this.swap > 0 || (this.reloading > 0 && !this.shellReload) || p.sprinting || g.uiOpen;
    const trig = d.auto ? inp.mouse.left : inp.mouse.leftPressed;
    if (trig && !busy && this.cool <= 0 && this.actionT <= 0) {
      if (d.melee) this.melee();
      else if (this.mag > 0) { if (this.shellReload) { this.shellReload = false; this.reloading = 0; } this.fire(); }
      else { this.g.audio?.dryFire(); this.cool = 0.3; if (this.reserve() > 0) this.startReload(); }
    }
    // flashlight battery
    if (this.flashlightOn) {
      this.battery = Math.max(0, this.battery - dt * 0.12);
      if (this.battery <= 0) { this.toggleFlashlight(false); g.hud.message('Ficklampans batterier är slut.', 'warn'); }
      this.flashlight.intensity = (this.battery < 10 ? 500 * (0.6 + 0.4 * Math.random()) : 600);
    }
    // camera FOV
    const targetFov = lerp(72, d.fov || 72, this.aimT);
    if (Math.abs(g.camera.fov - targetFov) > 0.05) { g.camera.fov = lerp(g.camera.fov, targetFov, clamp(dt * 14, 0, 1)); g.camera.updateProjectionMatrix(); }
    g.post.uniforms.uScope.value = d.scope && this.aimT > 0.9 ? 1 : 0;
    this.models[this.current].visible = !(d.scope && this.aimT > 0.9);
    g.hud.crosshair(this.currentSpread() * 600, this.aimT > 0.6 || d.melee && false);
  }
  toggleFlashlight(v) {
    this.flashlightOn = v ?? !this.flashlightOn;
    if (this.flashlightOn && this.battery <= 0) { this.flashlightOn = false; this.g.hud.message('Inga batterier i ficklampan.', 'warn'); }
    this.flashlight.intensity = this.flashlightOn ? 600 : 0;
    this.g.audio?.click(2000, 0.3);
  }
  currentSpread() {
    const d = this.def, p = this.g.player;
    if (d.melee) return 0;
    let s = lerp(d.spread, d.aimSpread, this.aimT);
    const sp = Math.hypot(p.vel.x, p.vel.z);
    s *= 1 + sp * 0.25 + (p.onGround ? 0 : 1.5);
    if (p.crouch > 0.5) s *= 0.75;
    return s + this.bloom * (d.pellets > 1 ? 0 : 0.03);
  }

  fire() {
    const g = this.g, d = this.def, p = g.player, cam = g.camera;
    this.owned[this.current].mag--;
    this.cool = d.rate;
    if (d.bolt) this.actionT = d.rate * 0.9; // bolt cycle happens in cool
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const spread = this.currentSpread();
    let anyHit = false, kill = false;
    for (let i = 0; i < d.pellets; i++) {
      const a = rand(0, Math.PI * 2), r = spread * Math.sqrt(Math.random());
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const res = this.trace(origin, dir, d.range * 2.5, d.damage);
      if (res.hit) anyHit = true; if (res.kill) kill = true;
    }
    if (anyHit) g.hud.hitmarker(kill);
    // feedback
    g.audio?.gunshot(d.sound);
    g.noise(p.pos.x, p.pos.z, d.noise, 'gunshot');
    const recoil = d.recoil * (p.crouch > 0.5 ? 0.7 : 1) * (this.aiming ? 0.75 : 1);
    p.pitch = clamp(p.pitch + recoil * rand(0.7, 1.1), -1.5, 1.5);
    p.yaw += recoil * rand(-0.35, 0.35);
    this.kick = 1; this.bloom = Math.min(1.5, this.bloom + 0.35);
    const mz = this.muzzleWorld();
    g.fx.muzzle(mz.x, mz.y, mz.z, fwd.x, fwd.y, fwd.z);
    this.flash.visible = true; this.flashT = 0.045; this.vmFlash.intensity = 6;
    this.flash.material.rotation = rand(0, 6.28);
    if (d.pump) setTimeout(() => g.audio?.pump(), 300);
    if (d.bolt) setTimeout(() => g.audio?.click(1200, 0.4), 500);
    g.stats.shots++;
  }
  muzzleWorld() {
    const m = this.models[this.current]; const u = m.userData.muzzle;
    const v = new THREE.Vector3(u[0], u[1], u[2]).applyMatrix4(m.matrixWorld); // in camera space
    return v.applyMatrix4(this.g.camera.matrixWorld);
  }
  // hitscan: zombies, NPCs and world
  trace(origin, dir, maxDist, damage) {
    const g = this.g;
    const wh = g.collision.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist, F.BULLET);
    const wt = wh ? wh.t : maxDist;
    const zh = g.zombies ? g.zombies.raycast(origin, dir, wt) : null;
    const nh = g.npcs ? g.npcs.raycast(origin, dir, zh ? zh.t : wt) : null;
    if (nh) { g.npcs.damage(nh.npc, damage, dir); g.fx.bloodHit(nh.x, nh.y, nh.z, dir.x, dir.z); return { hit: true }; }
    if (zh) {
      const falloff = zh.t > this.def.range ? 0.6 : 1;
      const kill = g.zombies.damage(zh.zombie, damage * falloff, zh.part, dir);
      g.fx.bloodHit(zh.x, zh.y, zh.z, dir.x, dir.z, zh.part === 'head' ? 1.6 : 1);
      // blood spray on the wall behind
      if (wh && wh.t - zh.t < 3 && Math.random() < 0.5) g.fx.decal(wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, rand(0.5, 1), true);
      g.audio?.flesh({ x: zh.x, y: zh.y, z: zh.z });
      g.stats.hits++;
      return { hit: true, kill };
    }
    if (wh) {
      g.fx.decal(wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, 0.12);
      const metal = wh.seg && wh.seg.owner && wh.seg.owner.metal;
      g.fx.dust(wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, metal);
      if (Math.random() < 0.4) g.audio?.impact({ x: wh.x, y: wh.y, z: wh.z }, metal);
      if (wh.seg && wh.seg.owner && wh.seg.owner.onShot) wh.seg.owner.onShot(wh);
    }
    return { hit: false };
  }
  melee() {
    const g = this.g, d = this.def, cam = g.camera;
    this.cool = d.rate; this.swingT = 0.35;
    g.audio?.swing();
    setTimeout(() => {
      if (!g.player.alive) return;
      const origin = cam.getWorldPosition(new THREE.Vector3()), fwd = cam.getWorldDirection(new THREE.Vector3());
      const z = g.zombies ? g.zombies.meleeTarget(origin, fwd, d.range) : null;
      if (z) {
        const kill = g.zombies.damage(z.zombie, d.damage * (g.player.stamina > 10 ? 1 : 0.6), z.part, fwd, true);
        g.fx.bloodHit(z.x, z.y, z.z, fwd.x, fwd.z, 1.2); g.audio?.flesh({ x: z.x, y: z.y, z: z.z }, 1);
        g.hud.hitmarker(kill);
      } else {
        const wh = g.collision.raycast(origin.x, origin.y, origin.z, fwd.x, fwd.y, fwd.z, d.range, F.BULLET);
        if (wh) { g.fx.dust(wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, true); g.audio?.impact(wh, true); }
      }
      g.player.stamina = Math.max(0, g.player.stamina - 4);
      g.noise(g.player.pos.x, g.player.pos.z, d.noise, 'melee');
    }, 140);
  }

  // ---------------------------------------------------------------- per-frame viewmodel animation
  animate(dt) {
    const g = this.g, p = g.player, d = this.def, m = this.models[this.current];
    if (!m) return;
    const ud = m.userData;
    const hip = ud.hip, ads = ud.ads;
    const t = this.aimT;
    const pos = new THREE.Vector3(lerp(hip[0], ads[0], t), lerp(hip[1], ads[1], t), lerp(hip[2], ads[2], t));
    const rot = new THREE.Euler(0, 0, 0);
    // bob & sway
    const sp = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 6) * (p.onGround ? 1 : 0);
    const bobK = (1 - t * 0.85);
    pos.x += Math.cos(p.bob) * 0.012 * sp * bobK;
    pos.y += Math.abs(Math.sin(p.bob)) * 0.014 * sp * bobK;
    this.sway = this.sway || { x: 0, y: 0 };
    this.sway.x = lerp(this.sway.x, -g.input.mouse.dx * 0.0006, clamp(dt * 8, 0, 1));
    this.sway.y = lerp(this.sway.y, g.input.mouse.dy * 0.0006, clamp(dt * 8, 0, 1));
    pos.x += this.sway.x * (1 - t * 0.7); pos.y += this.sway.y * (1 - t * 0.7);
    rot.z += this.sway.x * 2;
    // sprint pose
    this.sprintT = lerp(this.sprintT || 0, p.sprinting ? 1 : 0, clamp(dt * 8, 0, 1));
    pos.x += this.sprintT * 0.05; pos.y -= this.sprintT * 0.06; rot.y += this.sprintT * 0.7; rot.x -= this.sprintT * 0.25;
    // recoil
    pos.z += this.kick * (d.pellets > 1 || d.bolt ? 0.09 : 0.045); rot.x += this.kick * (d.pellets > 1 || d.bolt ? 0.18 : 0.08);
    // reload / swap animation
    if (this.reloading > 0 && !this.shellReload) {
      const k = 1 - this.reloading / this.reloadTotal; const s = Math.sin(k * Math.PI);
      pos.y -= s * 0.12; rot.x -= s * 0.5; rot.z += s * 0.4;
      if (ud.mag) ud.mag.position.y = -0.1 - (k > 0.15 && k < 0.6 ? 0.25 : 0);
    } else if (ud.mag) ud.mag.position.y = -0.1;
    if (this.shellReload) { pos.y -= 0.03; rot.z += 0.25; }
    if (this.swap > 0) { pos.y -= this.swap * 0.5; rot.x -= this.swap * 1.2; }
    if (ud.pump) ud.pump.position.z = -0.3 + (this.cool > d.rate * 0.3 && this.cool < d.rate * 0.85 ? 0.08 : 0) + (this.actionT > 0 ? 0.08 : 0);
    if (ud.slide) ud.slide.position.z = -0.05 + this.kick * 0.04 + (this.mag === 0 ? 0.03 : 0);
    if (ud.bolt) ud.bolt.position.z = 0.06 + (this.actionT > 0 ? 0.06 : 0);
    // melee swing
    if (d.melee && this.swingT > 0) {
      const k = 1 - this.swingT / 0.35; const s = Math.sin(k * Math.PI);
      pos.x -= s * 0.25; pos.z -= s * 0.2; rot.y += s * 1.1; rot.x -= s * 0.4;
    }
    m.position.copy(pos); m.rotation.copy(rot);
    m.updateMatrixWorld(true);
    // muzzle flash
    this.flashT = (this.flashT || 0) - dt;
    if (this.flashT <= 0) { this.flash.visible = false; this.vmFlash.intensity = 0; }
    else { const mz = new THREE.Vector3(...ud.muzzle).applyMatrix4(m.matrixWorld); this.flash.position.copy(mz); this.flash.position.z -= 0.05; }
    // lighting of the viewmodel follows the world
    const env = g.env;
    this.vmHemi.intensity = clamp(env.hemi.intensity * 1.1, 0.9, 3.2) + (this.flashlightOn ? 1.5 : 0) + (g.isIndoor() ? 0.8 : 0);
    this.vmDir.intensity = clamp(env.sun.intensity * 0.45, 0.4, 3);
    g.vmScene.environment = g.scene.environment; g.vmScene.environmentIntensity = 0.45;
  }
  serialize() { return { owned: this.owned, current: this.current, battery: this.battery }; }
  restore(o) { this.owned = o.owned || { knife: { mag: 0 } }; this.battery = o.battery ?? 100; this.select(o.current || 'knife', true); }
}
export { ITEMS };

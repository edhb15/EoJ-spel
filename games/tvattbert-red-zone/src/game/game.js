// Game orchestrator: owns all systems and runs the main loop.
import * as THREE from 'three';
import { WorldData, CLASS } from '../world/worldData.js';
import { Collision } from '../world/collision.js';
import { Terrain } from '../world/terrain.js';
import { Buildings, pointInBuilding } from '../world/buildings.js';
import { makeTextures } from '../render/textures.js';
import { Environment } from '../render/environment.js';
import { Post } from '../render/post.js';
import { Input } from '../core/input.js';
import { Player } from '../player/player.js';
import { GameTime } from './time.js';
import { HUD } from '../ui/hud.js';
import { SPAWN, ZONES, HOSPITAL, districtAt, zoneAt } from '../world/locations.js';
import { clamp, lerp } from '../core/util.js';

export class Game {
  constructor(settings) {
    this.settings = settings;
    this.state = 'loading'; // loading | menu | playing | paused | dead
    this.clock = new THREE.Clock();
    this.t = 0;
    this.extraSystems = [];
  }

  async init(onProgress) {
    const q = this.settings.quality;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 1.5 : 1));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = q !== 'low'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.8;
    r.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('game').appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 1400);
    this.scene.add(this.camera);
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
    this.vmScene.add(this.vmCamera);
    this.post = new Post(r, q);
    addEventListener('resize', () => this.resize());

    onProgress(0.05, 'Laddar världsdata från STL…');
    this.world = await new WorldData().load('data/', (f, n) => onProgress(0.05 + f * 0.5, `Laddar ${n}…`));
    onProgress(0.6, 'Genererar texturer…');
    await frame();
    this.tex = makeTextures();
    onProgress(0.7, 'Bygger kollisioner…');
    await frame();
    this.collision = new Collision(this.world);
    this.prepareHospitalSite();
    this.collision.buildStatic();
    onProgress(0.78, 'Bygger Göteborg…');
    await frame();
    this.buildings = new Buildings(this.world, this.scene, this.tex);
    this.terrain = new Terrain(this.world, this.scene, this.tex, q);
    this.env = new Environment(r, this.scene, this.camera, q);
    this.time = new GameTime(this.settings.dayLength);
    this.input = new Input(r.domElement);
    this.input.sensitivity = this.settings.sensitivity;
    this.player = new Player(this.world, this.collision);
    this.hud = new HUD(this.world);
    for (const sys of this.extraSystems) if (sys.init) { onProgress(0.85, sys.loadingText || 'Förbereder…'); await frame(); await sys.init(this); }
    onProgress(0.95, 'Laddar terräng…');
    this.player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw);
    this.terrain.update(this.player.pos.x, this.player.pos.z, 60);
    onProgress(1, 'Klart');
    this.state = 'menu';
    this.renderer.setAnimationLoop(() => this.loop());
  }

  // Remove STL buildings where the explorable hospital stands and flatten its plot.
  prepareHospitalSite() {
    const H = HOSPITAL, m = 6;
    const x0 = H.x - H.w / 2 - m, x1 = H.x + H.w / 2 + m, z0 = H.z - H.d / 2 - m, z1 = H.z + H.d / 2 + m;
    let removed = 0;
    for (const b of this.world.buildings) {
      if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
      b.removed = true; removed++;
    }
    // floor height: median of terrain around the footprint
    const samples = [];
    for (let x = x0; x <= x1; x += 4) for (let z = z0; z <= z1; z += 4) samples.push(this.world.terrainHeight(x, z));
    samples.sort((a, b) => a - b);
    H.floor = samples[(samples.length / 2) | 0] + 0.15;
    this.world.flatten(x0 - 4, z0 - 4, x1 + 4, z1 + 4, H.floor - 0.15, 18);
    this.world.paintClass(H.x - H.w / 2, H.z - H.d / 2, H.x + H.w / 2, H.z + H.d / 2, CLASS.BUILDING);
    this.hospitalRemoved = removed;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = this.vmCamera.aspect = w / h;
    this.camera.updateProjectionMatrix(); this.vmCamera.updateProjectionMatrix();
    this.post.setSize(w, h);
  }

  isIndoor() {
    const fz = this.world.floorZoneAt(this.player.pos.x, this.player.pos.z);
    return !!(fz && fz.ceil);
  }
  antidoteAvailable() { return this.time.daysPassed >= 2; }
  findOpenSpot(x, z, maxR = 60) {
    for (let r = 0; r <= maxR; r += 2) {
      for (let a = 0; a < Math.PI * 2; a += r ? 2 / r : 7) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.isWalkable(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }
  isWalkable(x, z, rad = 0.6) {
    if (!this.world.inBounds(x, z, 10)) return false;
    if (this.world.classAt(x, z) === CLASS.WATER) return false;
    let ok = true;
    this.collision.forNear(x, z, rad + 1, s => {
      if (s.owner && s.owner.verts && pointInBuilding(s.owner, x, z)) { ok = false; return false; }
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / L2, 0, 1);
      if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < rad) { ok = false; return false; }
    });
    return ok;
  }

  start(load) {
    this.state = 'playing';
    this.input.enabled = true;
    this.input.lock();
    for (const sys of this.extraSystems) if (sys.onStart) sys.onStart(load);
    if (!load) {
      const s = this.findOpenSpot(SPAWN.x, SPAWN.z, 40);
      this.player.spawn(s.x, s.z, SPAWN.yaw);
    }
  }

  loop() {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.t += dt;
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'dead') this.updateDead(dt);
    this.renderFrame(dt);
    this.input.endFrame();
  }

  update(dt) {
    const p = this.player;
    this.time.update(dt);
    const aiming = this.weapons ? this.weapons.aiming : false;
    p.weight = this.inventory ? this.inventory.weight() : 0;
    p.update(dt, this.uiOpen ? NULL_INPUT : this.input, { aiming, aimSensMul: this.weapons ? this.weapons.aimSensMul() : 1, maxWeight: this.inventory ? this.inventory.maxWeight : 30 });
    for (const sys of this.extraSystems) if (sys.update) sys.update(dt);
    if (!(this.interiors && this.interiors.current)) this.terrain.update(p.pos.x, p.pos.z, 2);
    // location banner
    if (!(this.interiors && this.interiors.current)) {
      const zn = zoneAt(p.pos.x, p.pos.z);
      if (zn) this.hud.showLocation(zn.name, zn.sub);
      else { const d = districtAt(p.pos.x, p.pos.z); this.hud.showLocation(d.name, ''); }
    }
    this.hud.update(dt, this);
  }
  updateDead(dt) { for (const sys of this.extraSystems) if (sys.updateDead) sys.updateDead(dt); }

  renderFrame(dt) {
    const p = this.player;
    const shake = this.cameraShake || { yaw: 0, pitch: 0, roll: 0 };
    p.applyCamera(this.camera, shake);
    this.env.update(dt, this.time, p.pos, this.isIndoor());
    this.terrain.tick(this.t);
    const ws = this.buildings.wallMat.userData.shader;
    if (ws) { ws.uniforms.uNight.value = this.env.nightAmount; ws.uniforms.uTime.value = this.t; }
    const ts = this.terrain.material.userData.shader;
    if (ts) ts.uniforms.uWet.value = this.env.wetness;
    const u = this.post.uniforms;
    u.uTime.value = this.t; u.uNight.value = this.env.nightAmount;
    u.uHealth.value = p.health / 100;
    for (const sys of this.extraSystems) if (sys.preRender) sys.preRender(dt);
    this.vmCamera.position.set(0, 0, 0); this.vmCamera.quaternion.identity();
    this.post.render(this.scene, this.camera, this.vmScene, this.vmCamera);
  }
}

const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const NULL_INPUT = { mouse: { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 }, sensitivity: 1, down: () => false, hit: () => false };

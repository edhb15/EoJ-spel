// Game: owns the renderer loop and ties world, bike, modes, camera, audio and UI together.
import * as THREE from 'three';
import { Emitter, clamp, formatPoints } from './core/math.js';
import { Bike } from './bike/bike.js';
import { bikeById, PAINTS, SUITS } from './bike/specs.js';
import { STYLE_TRICKS } from './bike/physics.js';
import { TrickSystem } from './stunts/tricks.js';
import { CameraRig, CAM_NAMES } from './camera/camera.js';
import { Particles, Skidmarks } from './fx/particles.js';
import { Stars, Gates } from './world/collectibles.js';
import { HUD } from './ui/hud.js';
import { UI } from './ui/menus.js';
import { Studio } from './ui/studio.js';
import { MODES } from './modes/modes.js';
import { SURFACES } from './world/layout.js';

const STEP = 1 / 120;

export class Game {
  constructor({ renderer, scene, camera, world, profile, audio, input, hudRoot, uiRoot, touchRoot }) {
    Object.assign(this, { renderer, scene, camera, world, profile, audio, input });
    this.state = 'boot';
    this.physicsEvents = new Emitter();
    this.fx = { particles: new Particles(scene), skids: new Skidmarks(scene) };
    this.bike = new Bike(scene, world, this.physicsEvents, this.fx);
    this.tricks = new TrickSystem(this.physicsEvents, world.gapZones);
    this.rig = new CameraRig(camera, world);
    this.stars = new Stars(scene, world.stars);
    this.stars.setCollected(profile.data.stars);
    this.gates = new Gates(scene, world);
    this.hud = new HUD(hudRoot, world, profile);
    this.hudRoot = hudRoot;
    this.touchRoot = touchRoot;
    this.studio = new Studio(world.sky.envMap);
    this.ui = new UI(uiRoot, this);
    this.mode = null;
    this.modeId = null;
    this.frozen = false;
    this.time = 0;
    this.acc = 0;
    this.zone = null;
    this.inp = { throttle: 0, brake: 0, steer: 0, jump: false, boost: false, trick: false, trickEdge: false, hotkey: null, hotkeyEdge: false, hotkeyHeld: null, up: false, down: false, left: false, right: false };
    document.body.classList.toggle('touch', this.isTouch);
    this.setupBike();
    this.wireEvents();
    this.applySettings();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bike.physics.reset(world.spawns.park.x, world.spawns.park.z, world.spawns.park.yaw);
    this.bike.model.root.visible = false;
    // drag-to-rotate in the showroom
    this.studioDrag = 0;
    let down = false;
    let lx = 0;
    addEventListener('pointerdown', (e) => {
      if (this.ui.current !== 'bikes' && this.ui.current !== 'garage') return;
      if (e.target.closest && e.target.closest('.side-col, .scr-head, button')) return;
      down = true;
      lx = e.clientX;
    });
    addEventListener('pointerup', () => (down = false));
    addEventListener('pointermove', (e) => {
      if (down && (this.ui.current === 'bikes' || this.ui.current === 'garage')) {
        this.studioDrag += e.clientX - lx;
        lx = e.clientX;
      }
    });
    this.last = performance.now();
    renderer.setAnimationLoop((t) => this.frame(t));
  }

  setupBike() {
    const d = this.profile.data;
    const spec = bikeById(d.selectedBike);
    this.bike.setup(spec, this.profile.upgrades(spec.id), PAINTS[this.profile.paint(spec.id)], SUITS[d.suit] || SUITS[0]);
    this.bikeKey = spec.id + this.profile.paint(spec.id) + d.suit + JSON.stringify(this.profile.upgrades(spec.id));
    if (this.audio.ready) this.audio.startEngine(spec.sound);
  }

  wireEvents() {
    const ev = this.physicsEvents;
    const P = () => this.bike.physics;
    ev.on('land', (d) => {
      if (d.short) return;
      this.audio.play('land', d.impact);
      this.rig.shake(clamp(d.impact / 22, 0.1, 1));
      const r = P().root;
      const surf = SURFACES[P().surface];
      if (surf.dust || d.impact > 8) this.fx.particles.burst(r.x, r.y, r.z, Math.round(6 + d.impact), surf.dust ? '#b0895e' : '#cfcfcf', 3 + d.impact * 0.2, 1.3, 1.2, { alpha: 0.45 });
      this.profile.data.stats.airTime += d.airTime;
    });
    ev.on('crash', (d) => {
      this.audio.play(d.reason === 'Splash!' ? 'splash' : 'crash');
      this.rig.shake(1);
      const c = P().com;
      this.fx.particles.burst(c.x, c.y - 0.5, c.z, 22, d.reason === 'Splash!' ? '#cfe8f5' : '#a58a68', 5, 1.6, 1.4, { alpha: 0.5, gravity: d.reason === 'Splash!' ? 6 : 0 });
      this.hud.flash('CRASHED!', d.reason, 'bad', 2.4);
      this.profile.data.stats.crashes++;
    });
    ev.on('shift', (d) => this.audio.play('shift', d.up ? 1 : 0));
    ev.on('hop', () => this.audio.play('hop'));
    ev.on('bump', (d) => {
      this.audio.play('bump');
      this.rig.shake(clamp(d.speed / 12, 0.1, 0.5));
    });
    ev.on('crashBounce', (d) => this.audio.play('bounce', d.speed));
    ev.on('whip', () => this.audio.play('whoosh'));
    ev.on('styleStart', () => this.audio.play('whoosh'));
    ev.on('loop', () => this.audio.play('cheer', 1));
    const tr = this.tricks.out;
    tr.on('trick', (e) => {
      this.hud.popup(e.name, e.pts, e.kind === 'gap' ? 'gap' : e.kind === 'air' ? 'air' : '');
      if (e.kind !== 'air') this.audio.play('trick');
    });
    tr.on('combo', (st) => this.hud.setCombo(st));
    tr.on('link', (f) => this.hud.setLink(f));
    tr.on('landing', (d) => {
      this.hud.landing(d.quality);
      if (d.quality === 'perfect' && d.hadTricks) this.audio.play('perfect');
    });
    tr.on('banked', (d) => {
      this.hud.flash('+' + formatPoints(d.total), d.count > 1 ? `${d.count} TRICK COMBO  ×${d.mult}` : 'BANKED', 'bank', 1.8);
      this.audio.play('bank', Math.min(3, d.count));
      const zone = this.zone && this.zone.id;
      if (d.total > 2500 && (zone === 'park' || d.total > 8000)) this.audio.play('cheer', clamp(d.total / 10000, 0.5, 1.4));
      P().boost = Math.min(1, P().boost + d.total / 7000);
    });
    tr.on('lost', (d) => {
      this.hud.popup('COMBO LOST', 0, 'lost');
      this.audio.play('lost');
      void d;
    });
  }

  // ------------------------------------------------------------------ settings
  applySettings() {
    const s = this.profile.settings;
    const r = this.renderer;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pr = s.quality === 'low' ? Math.min(1, dpr) * 0.75 : s.quality === 'medium' ? Math.min(dpr, 1.25) : dpr;
    if (Math.abs(r.getPixelRatio() - pr) > 0.01) {
      r.setPixelRatio(pr);
      this.resize();
    }
    r.shadowMap.enabled = !!s.shadows;
    r.shadowMap.type = s.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.world.sky.setShadowQuality(s.quality, !!s.shadows);
    this.scene.traverse((o) => {
      if (o.material && o.material.needsUpdate !== undefined && this._shadowState !== s.shadows) o.material.needsUpdate = true;
    });
    this._shadowState = s.shadows;
    this.world.sky.setDrawDistance(s.drawDistance);
    this.drawDistance = s.drawDistance;
    this.world.setQuality(s.quality);
    this.rig.baseFov = s.fov;
    this.rig.invertY = s.invertY;
    if (this.state !== 'playing' && this.state !== 'paused') this.rig.setMode(s.camera);
    this.audio.setVolumes(s.master, s.music, s.sfx);
    this.world.traffic.setEnabled(!!s.traffic);
    this.hud.showMinimap = !!s.minimap;
    this.hud.units = s.units;
    if (this.state === 'playing' || this.state === 'paused') this.updateMusic();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.particles.setViewport(h * this.renderer.getPixelRatio());
    this.studio.setViewport(w, h, w > 900 ? 0 : 0);
  }

  // ------------------------------------------------------------------ flow
  // first user gesture: unlock audio, go to the main menu
  start() {
    this.audio.init();
    this.audio.setVolumes(this.profile.settings.master, this.profile.settings.music, this.profile.settings.sfx);
    this.audio.music.play('menu');
    this.state = 'menu';
    this.ui.show('main', null, false);
  }

  onScreen(name) {
    this.screen = name;
    const studio = name === 'bikes' || name === 'garage';
    document.body.classList.toggle('in-studio', studio);
    document.body.classList.toggle('in-menu', !!name && name !== 'pause');
  }

  studioShow(spec, owned) {
    const d = this.profile.data;
    this.studio.show(spec, PAINTS[this.profile.paint(spec.id)], SUITS[d.suit] || SUITS[0], !owned);
  }

  startMode(id, opts = {}) {
    if (this.mode) this.mode.dispose();
    this.audio.init();
    const key = this.profile.data.selectedBike + this.profile.paint(this.profile.data.selectedBike) + this.profile.data.suit + JSON.stringify(this.profile.upgrades(this.profile.data.selectedBike));
    if (key !== this.bikeKey) this.setupBike();
    else if (!this.audio.engine && this.audio.ready) this.audio.startEngine(this.bike.spec.sound);
    this.bike.model.root.visible = true;
    this.modeId = id;
    this.modeOpts = opts;
    this.tricks.reset();
    this.fx.skids.break();
    this.gates.clear();
    this.hud.setDistance(null);
    this.mode = new MODES[id](this, opts);
    this.state = 'playing';
    this.ui.hide();
    this.hudRoot.classList.add('show');
    this.touchRoot.classList.toggle('show', this.isTouch);
    this.stars.setVisible(id === 'free' || id === 'stunt');
    this.rig.setMode(this.profile.settings.camera);
    this.mode.start();
    this.hud.setPanel(this.mode.panel());
    this.updateMusic();
    this.hud.showHint(
      id === 'ramp'
        ? '<b>W</b> full throttle • <b>SHIFT</b> boost • flip with <b>S</b>/<b>W</b> in the air • land straight!'
        : '<b>W</b> gas • <b>S</b> brake • <b>A/D</b> steer • <b>SPACE</b> hop/wheelie • <b>SHIFT</b> boost • <b>E</b> tricks • <b>C</b> camera • <b>R</b> reset • <b>ESC</b> pause',
      9,
    );
  }

  restartMode() {
    this.startMode(this.modeId, this.modeOpts);
  }

  endMode(results) {
    this.state = 'results';
    this.frozen = false;
    this.audio.silenceLoops();
    this.profile.save();
    setTimeout(() => {
      if (this.state !== 'results') return;
      this.touchRoot.classList.remove('show');
      this.ui.show('results', results, false);
    }, 600);
  }

  quitToMenu() {
    if (this.mode) this.mode.dispose();
    this.mode = null;
    this.modeId = null;
    this.state = 'menu';
    this.frozen = false;
    this.gates.clear();
    this.hudRoot.classList.remove('show');
    this.touchRoot.classList.remove('show');
    this.audio.silenceLoops();
    this.audio.music.play('menu');
    this.bike.model.root.visible = false;
    this.profile.save();
    this.ui.stack = [];
    this.ui.show('main', null, false);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.silenceLoops();
    this.ui.show('pause', null, false);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hide();
    this.input.edges.clear();
    this.last = performance.now();
  }

  teleport(key) {
    const sp = this.world.spawns[key];
    this.placeBike(sp.x, sp.z, sp.yaw);
    this.resume();
    this.hud.zoneName(sp.name.toUpperCase());
  }

  placeBike(x, z, yaw) {
    this.bike.physics.reset(x, z, yaw);
    this.bike.physics.boost = 1;
    this.rig.snap = true;
    this.rig.yaw = yaw;
    this.fx.skids.break();
    this.tricks.reset();
  }

  updateMusic() {
    const s = this.profile.settings;
    if (!this.audio.ready) return;
    if (s.gameMusic) this.audio.music.play('game');
    else this.audio.music.stop();
  }

  countdown(cb) {
    this.frozen = true;
    let n = 3;
    const tick = () => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      if (this.state === 'paused') return setTimeout(tick, 200);
      if (n > 0) {
        this.hud.count(String(n));
        this.audio.play('count');
        n--;
        setTimeout(tick, 800);
      } else {
        this.hud.count('GO!');
        this.audio.play('go');
        this.frozen = false;
        if (cb) cb();
      }
    };
    setTimeout(tick, 400);
  }

  // ------------------------------------------------------------------ input
  readInput(first) {
    const I = this.input;
    const inp = this.inp;
    inp.throttle = I.throttle;
    inp.brake = I.brake;
    inp.steer = I.steer;
    inp.jump = I.isDown('jump');
    inp.boost = I.isDown('boost');
    inp.trick = I.isDown('trick');
    inp.trickEdge = first && I.pressed('trick');
    inp.up = I.isDown('throttle');
    inp.down = I.isDown('brake');
    inp.left = I.isDown('left');
    inp.right = I.isDown('right');
    inp.hotkeyEdge = false;
    inp.hotkeyHeld = null;
    for (let i = 0; i < 5; i++) {
      const a = 'trick' + (i + 1);
      if (I.isDown(a)) inp.hotkeyHeld = STYLE_TRICKS[i];
      if (first && I.pressed(a)) {
        inp.hotkey = STYLE_TRICKS[i];
        inp.hotkeyEdge = true;
      }
    }
    return inp;
  }

  // ------------------------------------------------------------------ frame
  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const I = this.input;
    I.pollGamepad();
    if (this.state === 'boot') {
      this.rig.flyover(dt, this.time);
      this.renderWorld(dt);
    } else if (this.state === 'menu' || (this.state === 'results' && this.screen === 'results')) {
      if (this.screen === 'bikes' || this.screen === 'garage') {
        this.studio.update(dt, this.studioDrag);
        this.studioDrag = 0;
        this.studio.render(this.renderer);
      } else {
        if (this.state === 'menu') this.rig.flyover(dt, this.time);
        else this.updatePlaying(dt, true);
        this.renderWorld(dt);
      }
    } else if (this.state === 'playing' || this.state === 'results') {
      this.updatePlaying(dt, this.state === 'results');
      this.renderWorld(dt);
    } else if (this.state === 'paused') {
      if (this.screen === 'bikes' || this.screen === 'garage') this.studio.render(this.renderer);
      else this.renderer.render(this.scene, this.camera);
    }
    I.endFrame();
  }

  updatePlaying(dt, finished) {
    const I = this.input;
    const P = this.bike.physics;
    if (!finished) {
      if (I.pressed('pause')) return this.pause();
      if (I.pressed('map') && this.modeId) {
        this.pause();
        this.ui.show('map');
        return;
      }
      if (I.pressed('camera')) {
        this.rig.setMode(this.rig.mode + 1);
        this.hud.camName(CAM_NAMES[this.rig.mode]);
      }
      if (I.pressed('reset') && !this.frozen) this.mode.manualReset();
    }
    // physics at a fixed step
    if (!this.frozen) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 14) {
        const inp = finished ? this.idleInput() : this.readInput(n === 0);
        P.step(STEP, inp);
        this.tricks.update(STEP, P);
        this.acc -= STEP;
        n++;
      }
      if (n === 14) this.acc = 0;
    } else {
      // revving on the start line
      const inp = this.readInput(true);
      P.updateEngine(dt, inp);
    }
    if (!finished && this.mode) this.mode.update(dt);
    if (P.mode === 'crash' && P.crashT > 2.6 && this.mode && !finished) {
      this.mode.respawn();
      this.rig.snap = true;
    }
    this.bike.update(dt);
    // stars
    const focus = P.mode === 'crash' ? P.cb.pos : P.com;
    const got = this.stars.update(dt, this.time, P.mode === 'crash' ? null : focus);
    for (const id of got) {
      if (!this.profile.data.stars.includes(id)) this.profile.data.stars.push(id);
      this.profile.addPoints(500);
      if (this.mode) this.mode.earned += 500;
      this.audio.play('star');
      this.hud.flash('STAR COLLECTED', `${this.profile.data.stars.length} / ${this.stars.count}   +500`, 'star', 2);
    }
    // zone changes
    const z = this.world.zoneAt(P.root.x, P.root.z);
    if (z !== this.zone) {
      if (this.zone && !finished) this.hud.zoneName(z.name.toUpperCase());
      this.zone = z;
    }
    // camera, audio, hud
    const mouse = I.consumeMouse();
    this.rig.update(dt, this.bike, mouse);
    const target = this.mode && this.mode.target ? this.mode.target() : null;
    this.gates.update(this.time, target && P.mode !== 'crash' ? P.com : null, this.camera);
    if (this.mode) this.hud.setPanel(this.mode.panel());
    this.hud.setPending(this.tricks.pending(P));
    const surf = SURFACES[P.surface];
    if (!finished)
      this.audio.update(dt, {
        rpm: P.rpm,
        idle: P.spec.idle,
        redline: P.spec.redline,
        throttle: this.frozen ? this.inp.throttle : P.throttleIn || 0,
        boosting: P.boosting,
        speed: P.speed,
        inAir: P.mode === 'air',
        grounded: P.mode === 'ground',
        offroad: surf.offroad,
        slip: P.slip,
        running: P.mode !== 'crash',
      });
    this.hud.update(dt, { physics: P, camYaw: this.rig.yaw, stars: this.stars.items.filter(() => this.stars.group.visible), target });
  }

  idleInput() {
    const inp = this.inp;
    inp.throttle = 0;
    inp.brake = 0.4;
    inp.steer = 0;
    inp.jump = inp.boost = inp.trick = inp.trickEdge = inp.hotkeyEdge = false;
    inp.hotkeyHeld = null;
    inp.up = inp.down = inp.left = inp.right = false;
    return inp;
  }

  renderWorld(dt) {
    const P = this.bike.physics;
    const focus = this.state === 'menu' || this.state === 'boot' ? this.camera.position.clone().setY(0) : P.mode === 'crash' ? P.cb.pos : P.com;
    this.world.sky.update(dt, this.camera, focus);
    this.world.update(dt, this.time, this.state === 'playing' ? P.root : null);
    this.world.cull(this.camera.position, this.drawDistance + 150);
    this.fx.particles.update(dt);
    if (this.state === 'menu' || this.state === 'boot') this.stars.update(dt, this.time, null);
    this.renderer.render(this.scene, this.camera);
  }

  get isTouch() {
    return matchMedia('(pointer: coarse)').matches;
  }
}

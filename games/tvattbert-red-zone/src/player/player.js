// First-person player: movement, stamina, health, hunger/thirst, footsteps.
import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';
import { F } from '../world/collision.js';
import { CLASS } from '../world/worldData.js';

export const RADIUS = 0.35;
const STAND_EYE = 1.68, CROUCH_EYE = 1.05, STAND_H = 1.8, CROUCH_H = 1.2;

export class Player {
  constructor(world, collision) {
    this.world = world; this.col = collision;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.reset();
    this.events = []; // {type:'step'|'land'|'noise', ...} consumed by game
  }
  reset() {
    this.health = 100; this.stamina = 100; this.hunger = 100; this.thirst = 100;
    this.bleeding = 0; this.alive = true; this.onGround = true; this.crouch = 0;
    this.sprinting = false; this.moving = false; this.staminaDelay = 0;
    this.bob = 0; this.stepDist = 0; this.landShake = 0; this.weight = 0;
    this.lastDamageTime = -10; this.acidBlur = 0; this.painkiller = 0;
    this.vel.set(0, 0, 0);
  }
  spawn(x, z, yaw = 0) {
    this.pos.set(x, this.world.groundHeight(x, z), z);
    this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0;
  }
  get eyeHeight() { return lerp(STAND_EYE, CROUCH_EYE, this.crouch); }
  get height() { return lerp(STAND_H, CROUCH_H, this.crouch); }
  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }
  surface() {
    const fz = this.world.floorZoneAt(this.pos.x, this.pos.z);
    if (fz) return fz.surface || 'tile';
    const c = this.world.classAt(this.pos.x, this.pos.z);
    return c === CLASS.LAWN ? 'grass' : c === CLASS.PARK ? 'forest' : c === CLASS.WATER ? 'water' : 'asphalt';
  }

  update(dt, input, opts) {
    if (!this.alive) return;
    const sens = 0.0022 * input.sensitivity * (opts.aiming ? opts.aimSensMul : 1);
    this.yaw -= input.mouse.dx * sens;
    this.pitch = clamp(this.pitch - input.mouse.dy * sens, -1.5, 1.5);

    // crouch
    const wantCrouch = input.down('KeyC') || input.down('ControlLeft');
    let canStand = true;
    if (!wantCrouch && this.crouch > 0.1) { // check headroom
      const fz = this.world.floorZoneAt(this.pos.x, this.pos.z);
      if (fz && fz.ceil && this.pos.y + STAND_H > fz.ceil) canStand = false;
    }
    this.crouch = clamp(this.crouch + ((wantCrouch || !canStand) ? 1 : -1) * dt * 6, 0, 1);

    // wish direction
    let fx = 0, fz = 0;
    if (input.down('KeyW')) fz -= 1; if (input.down('KeyS')) fz += 1;
    if (input.down('KeyA')) fx -= 1; if (input.down('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz); if (len > 0) { fx /= len; fz /= len; }
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const wx = fx * c + fz * s, wz = -fx * s + fz * c;
    this.moving = len > 0;
    const wantSprint = input.down('ShiftLeft') && fz < 0 && this.crouch < 0.3 && !opts.aiming;
    if (wantSprint && this.stamina <= 0.5) this.exhausted = true;
    if (this.exhausted && this.stamina > 25) this.exhausted = false;
    this.sprinting = wantSprint && this.moving && !this.exhausted && this.onGround;
    let speed = this.sprinting ? 6.3 : 3.4;
    if (this.crouch > 0.5) speed = 1.7;
    if (opts.aiming) speed = Math.min(speed, 2.2);
    if (this.health < 25) speed *= 0.85;
    const over = Math.max(0, this.weight - opts.maxWeight);
    speed *= clamp(1 - over / 20, 0.45, 1);
    if (this.surface() === 'forest') speed *= 0.92;

    const accel = this.onGround ? 30 : 4;
    const tvx = wx * speed, tvz = wz * speed;
    this.vel.x += clamp(tvx - this.vel.x, -accel * dt, accel * dt);
    this.vel.z += clamp(tvz - this.vel.z, -accel * dt, accel * dt);

    // stamina
    this.staminaDelay -= dt;
    if (this.sprinting) { this.stamina -= 13 * dt; this.staminaDelay = 1.2; }
    else if (this.staminaDelay <= 0) {
      const regen = (this.hunger > 15 && this.thirst > 15 ? 17 : 7) * (this.moving ? 0.7 : 1);
      this.stamina += regen * dt;
    }
    if (this.onGround && input.hit('Space') && this.stamina > 8 && this.crouch < 0.5) {
      this.vel.y = 5.0; this.onGround = false; this.stamina -= 9; this.staminaDelay = 1;
      this.events.push({ type: 'noise', radius: 6 });
    }
    this.stamina = clamp(this.stamina, 0, 100);

    // integrate horizontal and collide
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const p = { x: nx, z: nz };
    // stepping up: allow if ground rise small
    this.col.collideCircle(p, RADIUS, this.pos.y, this.height, F.PLAYER);
    const gNew = this.world.groundHeight(p.x, p.z);
    if (gNew - this.pos.y > 0.6 && this.onGround) { p.x = this.pos.x; p.z = this.pos.z; } // too high step
    const moved = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    // uphill on very steep slopes is slower
    if (this.onGround && moved > 0) {
      const rise = gNew - this.world.groundHeight(this.pos.x, this.pos.z);
      const grade = rise / moved;
      if (grade > 0.9) { p.x = lerp(this.pos.x, p.x, 0.35); p.z = lerp(this.pos.z, p.z, 0.35); }
    }
    this.vel.x = (p.x - this.pos.x) / dt; this.vel.z = (p.z - this.pos.z) / dt;
    this.pos.x = p.x; this.pos.z = p.z;

    // vertical
    const g = this.world.groundHeight(this.pos.x, this.pos.z);
    this.vel.y -= 14 * dt;
    this.pos.y += this.vel.y * dt;
    const fzone = this.world.floorZoneAt(this.pos.x, this.pos.z);
    if (fzone && fzone.ceil && this.pos.y + this.height > fzone.ceil) { this.pos.y = fzone.ceil - this.height; this.vel.y = Math.min(0, this.vel.y); }
    if (this.pos.y <= g || (this.onGround && this.vel.y <= 0 && this.pos.y - g < 0.5)) {
      if (!this.onGround && this.vel.y < -6) {
        this.landShake = clamp(-this.vel.y / 14, 0, 1);
        this.events.push({ type: 'land', strength: -this.vel.y });
        if (this.vel.y < -11.5) this.damage((-this.vel.y - 11.5) * 9, 'fall');
      }
      this.pos.y = g; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > g + 0.05) this.onGround = false;

    // footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      this.bob += hs * dt * 1.9;
      this.stepDist += hs * dt;
      const stride = this.sprinting ? 1.05 : this.crouch > 0.5 ? 0.6 : 0.78;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const radius = this.sprinting ? 20 : this.crouch > 0.5 ? 1.8 : 7;
        this.events.push({ type: 'step', surface: this.surface(), sprint: this.sprinting, crouch: this.crouch > 0.5, radius });
      }
    } else this.bob = lerp(this.bob, Math.round(this.bob / Math.PI) * Math.PI, dt * 4);
    this.landShake = Math.max(0, this.landShake - dt * 2.5);

    this.updateNeeds(dt);
  }

  updateNeeds(dt) {
    this.hunger -= dt * (100 / (55 * 60)) * (this.sprinting ? 1.6 : 1);
    this.thirst -= dt * (100 / (38 * 60)) * (this.sprinting ? 2 : 1);
    this.hunger = clamp(this.hunger, 0, 100); this.thirst = clamp(this.thirst, 0, 100);
    if (this.hunger <= 0) this.damage(0.35 * dt, 'hunger', true);
    if (this.thirst <= 0) this.damage(0.5 * dt, 'thirst', true);
    if (this.bleeding > 0) {
      this.damage(this.bleeding * dt, 'bleed', true);
      this.bleedTimer = (this.bleedTimer || 0) - dt;
      if (this.bleedTimer <= 0) { this.bleeding = Math.max(0, this.bleeding - 0.4); this.bleedTimer = 20; }
    }
    if (this.painkiller > 0) { const h = Math.min(this.painkiller, dt * 1.5); this.painkiller -= h; this.heal(h); }
    // well fed -> slow regeneration up to 70
    if (this.hunger > 60 && this.thirst > 60 && this.bleeding === 0 && this.health < 70 && performance.now() / 1000 - this.lastDamageTime > 10) this.heal(0.12 * dt);
    this.acidBlur = Math.max(0, this.acidBlur - dt * 0.25);
  }

  damage(amount, source = 'hit', silent = false) {
    if (!this.alive) return;
    this.health -= amount;
    if (!silent) this.lastDamageTime = performance.now() / 1000;
    if (this.health <= 0) { this.health = 0; this.alive = false; this.deathCause = source; }
  }
  heal(a) { this.health = clamp(this.health + a, 0, 100); }

  applyCamera(camera, extra) {
    const bobAmt = this.onGround ? Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 6) : 0;
    const by = Math.sin(this.bob * 2) * 0.035 * bobAmt - this.landShake * 0.12;
    const bx = Math.cos(this.bob) * 0.025 * bobAmt;
    camera.position.set(this.pos.x, this.pos.y + this.eyeHeight + by, this.pos.z);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    camera.position.x += bx * c; camera.position.z -= bx * s;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw + (extra.yaw || 0);
    camera.rotation.x = this.pitch + (extra.pitch || 0);
    camera.rotation.z = (extra.roll || 0) + Math.cos(this.bob) * 0.004 * bobAmt;
  }
  serialize() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, health: this.health, stamina: this.stamina,
      hunger: this.hunger, thirst: this.thirst, bleeding: this.bleeding };
  }
  restore(o) {
    this.reset();
    this.pos.set(o.x, o.y, o.z); this.yaw = o.yaw; Object.assign(this, { health: o.health, stamina: o.stamina, hunger: o.hunger, thirst: o.thirst, bleeding: o.bleeding || 0 });
  }
}

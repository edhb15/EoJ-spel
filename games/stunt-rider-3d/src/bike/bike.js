// Bike entity: physics + 3D model + animated rider + effects.
import * as THREE from 'three';
import { BikePhysics } from './physics.js';
import { buildBike } from './bikemodel.js';
import { Rider } from './rider.js';
import { effectiveSpec } from './specs.js';
import { SURFACES } from '../world/layout.js';
import { damp, clamp } from '../core/math.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const DUST_COL = ['#9c9c98', '#9c9c98', '#b0895e', '#8a9a62', '#d8c391', '#a49a88', '#9c9c98', '#9c9c98'];

export class Bike {
  constructor(scene, world, events, fx) {
    this.scene = scene;
    this.world = world;
    this.events = events;
    this.fx = fx;
    this.physics = new BikePhysics(world, events);
    this.weights = { seated: 1 };
    this.t = 0;
    this.dustT = 0;
  }

  setup(spec, upgrades, paint, suit) {
    if (this.model) this.disposeModel();
    this.spec = spec;
    this.physics.setSpec(effectiveSpec(spec, upgrades));
    this.model = buildBike(spec, paint);
    this.rider = new Rider(this.model.anchors, suit, paint);
    this.model.body.add(this.rider.group);
    this.scene.add(this.model.root);
    this.riderDetached = false;
    this.offroadBike = spec.id === 'mx' || spec.id === 'sm';
    this.roadBike = spec.id === 'sport' || spec.id === 'race';
  }

  disposeModel() {
    this.scene.remove(this.model.root);
    if (this.riderDetached) this.scene.remove(this.rider.group);
    this.model.dispose();
    this.rider.dispose();
  }

  setFirstPerson(on) {
    this.rider.setFirstPerson(on);
  }

  update(dt) {
    this.t += dt;
    const P = this.physics;
    const m = this.model;
    if (P.mode === 'crash') {
      if (!this.riderDetached) {
        this.model.body.remove(this.rider.group);
        this.scene.add(this.rider.group);
        this.riderDetached = true;
        this.rider.setFirstPerson(false);
      }
    } else if (this.riderDetached) {
      this.scene.remove(this.rider.group);
      this.model.body.add(this.rider.group);
      this.rider.group.position.set(0, 0, 0);
      this.rider.group.quaternion.identity();
      this.riderDetached = false;
    }
    m.root.position.copy(P.root);
    m.root.quaternion.copy(P.q);
    // suspension
    const drop = (P.suspF + P.suspR) * 0.5;
    m.body.position.y = -drop * 0.85;
    const cosR = -m.axisDown.y;
    m.forkLower.position.copy(m.axisDown).multiplyScalar(-P.suspF / Math.max(0.5, cosR));
    m.swing.rotation.x = P.suspR / Math.max(0.3, m.swingLen);
    m.wheelF.rotation.x = P.wheelAngF;
    m.wheelR.rotation.x = P.wheelAngR;
    // steering and tailwhip around the steering axis
    const up = _v.copy(m.axisDown).negate();
    const spd = P.speed;
    const steerVis = P.mode === 'ground' ? -P.steerIn * clamp(0.5 - spd * 0.02, 0.05, 0.5) : 0;
    this.steerVis = (this.steerVis || 0) + (steerVis - (this.steerVis || 0)) * damp(10, dt);
    m.front.quaternion.setFromAxisAngle(up, this.steerVis);
    m.whip.quaternion.setFromAxisAngle(up, P.whip.angle);
    // lights
    const braking = P.braking;
    m.mats.brake.emissiveIntensity = braking ? 5 : 0.7;
    m.tailGlow.material.opacity = braking ? 0.9 : 0.3;
    m.tailGlow.scale.setScalar(braking ? 0.6 : 0.35);
    m.flame.visible = P.boosting && P.mode !== 'crash';
    if (m.flame.visible) {
      const f = 0.7 + Math.random() * 0.6;
      m.flame.scale.set(f, f, 0.8 + Math.random() * 0.8);
    }
    this.updateRider(dt);
    this.updateEffects(dt);
  }

  updateRider(dt) {
    const P = this.physics;
    const R = this.rider;
    const target = {};
    const add = (k, w) => (target[k] = (target[k] || 0) + w);
    let lean = 0;
    let legOut = 0;
    let crashWave = 0;
    if (P.mode === 'crash') {
      add('crash', 1);
      crashWave = clamp(1.5 - P.crashT * 0.4, 0.2, 1);
    } else if (P.mode === 'air') {
      const st = P.style;
      const b = st ? st.blend : 0;
      add(this.offroadBike ? 'standing' : 'seated', (1 - b) * (this.offroadBike ? 1 : 0.4));
      if (!this.offroadBike) add('standing', (1 - b) * 0.6);
      if (st) add(st.id, b);
    } else if (P.mode === 'loop') {
      add('tuck', 1);
    } else {
      const surf = SURFACES[P.surface];
      const spd = Math.abs(P.s);
      const stand = this.offroadBike && surf.offroad && spd > 9 ? 0.8 : 0;
      const tuck = this.roadBike ? clamp((spd - 25) / 15, 0, 1) : clamp((spd - 35) / 15, 0, 0.6);
      const wh = clamp(P.wheelie * 2.2, 0, 1);
      const so = clamp(-P.wheelie * 3, 0, 1);
      const rest = Math.max(0, 1 - wh - so);
      add('seated', rest * (1 - stand) * (1 - tuck));
      add('standing', rest * stand);
      add('tuck', rest * tuck * (1 - stand));
      add('wheelie', wh);
      add('stoppie', so);
      lean = -P.lean / 0.9;
      if (this.offroadBike && spd < 18 && spd > 3 && Math.abs(P.steerIn) > 0.4 && P.wheelie === 0) legOut = -Math.sign(P.steerIn) * 0.8;
    }
    // smooth weights
    const k = damp(P.mode === 'crash' ? 20 : 12, dt);
    for (const key of Object.keys(this.weights)) if (!(key in target)) target[key] = 0;
    for (const key of Object.keys(target)) {
      const cur = this.weights[key] || 0;
      this.weights[key] = cur + (target[key] - cur) * k;
      if (this.weights[key] < 0.001 && target[key] === 0) delete this.weights[key];
    }
    this.leanS = (this.leanS || 0) + (lean - (this.leanS || 0)) * damp(8, dt);
    this.legS = (this.legS || 0) + (legOut - (this.legS || 0)) * damp(6, dt);
    R.update(this.weights, this.leanS, this.legS, this.t, crashWave);
    if (this.riderDetached) {
      const rb = P.rb;
      const pel = _v2.copy(R.joints.pelvis).applyQuaternion(rb.q);
      R.group.position.copy(rb.pos).sub(pel);
      R.group.quaternion.copy(rb.q);
    }
  }

  updateEffects(dt) {
    const P = this.physics;
    const fx = this.fx;
    if (!fx) return;
    const m = this.model;
    const sp = this.spec;
    if (P.mode === 'ground') {
      const surf = SURFACES[P.surface];
      const spd = Math.abs(P.s);
      // rear contact in world
      const rear = _v.set(0, 0.05, -sp.wheelbase / 2).applyQuaternion(P.q).add(P.root);
      this.dustT -= dt;
      const sliding = P.slip > 2.5 || P.wheelspin > 0.25;
      if (surf.dust && (spd > 5 || P.wheelspin > 0.2) && this.dustT <= 0) {
        this.dustT = 0.035 / Math.min(2, surf.dust);
        const back = _v2.set(Math.sin(P.heading), 0, Math.cos(P.heading)).multiplyScalar(-spd * 0.15);
        fx.particles.spawn(rear.x, rear.y + 0.1, rear.z, back.x + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2 + P.wheelspin * 2, back.z + (Math.random() - 0.5) * 1.5, DUST_COL[P.surface], 0.9 + spd * 0.03, 1.1, { alpha: 0.35 * Math.min(1.2, surf.dust) + P.wheelspin * 0.2, grow: 1.4 });
      } else if (!surf.dust && sliding && spd > 2 && this.dustT <= 0) {
        this.dustT = 0.03;
        fx.particles.spawn(rear.x, rear.y + 0.1, rear.z, (Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2, '#d8d8d8', 1.0, 1.4, { alpha: 0.4, grow: 1.6 });
      }
      if (!surf.offroad && (sliding || (P.braking && P.s > 8 && P.grip < 0.95) || P.wheelie < -0.1)) {
        fx.skids.add(rear.x, rear.y, rear.z, 0.3 + P.slip * 0.05);
      } else fx.skids.break();
    } else fx.skids.break();
    // boost sparks from the exhaust
    if (P.boosting && P.mode !== 'crash' && Math.random() < 0.5) {
      const tip = _v.copy(m.exhaustTip).applyQuaternion(P.q).add(P.root);
      const back = _v2.set(0, 0, -1).applyQuaternion(P.q).multiplyScalar(4);
      fx.particles.spawn(tip.x, tip.y, tip.z, back.x + P.vel.x * 0.8, back.y + P.vel.y * 0.8, back.z + P.vel.z * 0.8, '#ffb347', 0.35, 0.25, { alpha: 0.9, grow: -1 });
    }
  }

  // world position of the rider's eyes (first person camera)
  eyeWorld(out) {
    this.rider.eyeLocal(out);
    out.y -= (this.physics.suspF + this.physics.suspR) * 0.5 * 0.85;
    out.applyQuaternion(this.physics.q).add(this.physics.root);
    return out;
  }
}


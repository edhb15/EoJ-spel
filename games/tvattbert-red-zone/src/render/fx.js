// Particles (blood, dust, sparks, smoke, fire) and decals (bullet holes, blood pools).
import * as THREE from 'three';
import { rand } from '../core/util.js';

class Particles {
  constructor(scene, tex, max, blending = THREE.NormalBlending) {
    this.max = max; this.n = 0;
    this.p = []; for (let i = 0; i < max; i++) this.p.push({ life: 0 });
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: tex }, uScale: { value: 600 } }, transparent: true, depthWrite: false, blending,
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA;
        uniform float uScale; void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D tex; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(tex, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }
  spawn(o) {
    const p = this.p[this.cursor]; this.cursor = (this.cursor + 1) % this.max;
    Object.assign(p, { x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, max: o.life || 1,
      size: o.size || 0.2, grow: o.grow || 0, g: o.gravity ?? 9.8, drag: o.drag ?? 0.5, r: o.r ?? 1, gg: o.g2 ?? 1, b: o.b ?? 1, a: o.alpha ?? 1, ground: o.ground ?? -1e9 });
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (p.life <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      p.life -= dt;
      p.vy -= p.g * dt; const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.ground) { p.y = p.ground; p.vx *= 0.3; p.vz *= 0.3; p.vy = 0; }
      p.size += p.grow * dt;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.gg; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.size; this.alpha[i] = p.a * Math.min(1, p.life / p.max * 2);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, tex, world) {
    this.scene = scene; this.world = world;
    this.blood = new Particles(scene, tex.blood, 500);
    this.smoke = new Particles(scene, tex.smoke, 700);
    this.spark = new Particles(scene, tex.glow, 300, THREE.AdditiveBlending);
    this.fire = new Particles(scene, tex.fire, 400, THREE.AdditiveBlending);
    // decals
    this.decals = []; this.decalIdx = 0;
    const holeMat = new THREE.MeshBasicMaterial({ map: tex.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const bloodMat = new THREE.MeshBasicMaterial({ map: tex.blood, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: 0x991111 });
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(geo, i % 4 === 3 ? bloodMat : holeMat); m.visible = false; scene.add(m); this.decals.push(m);
    }
    this.emitters = []; // continuous fires/smoke {x,y,z,kind,rate,acc}
    this.light = new THREE.PointLight(0xffaa55, 0, 18, 2); scene.add(this.light);
    this.fireLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xff7a30, 0, 25, 2); scene.add(l); return l; });
    this.flashT = 0;
  }
  decal(x, y, z, nx, ny, nz, size, blood = false) {
    // choose a decal of the right type
    let m;
    for (let k = 0; k < this.decals.length; k++) {
      const i = (this.decalIdx + k) % this.decals.length; const isBlood = i % 4 === 3;
      if (isBlood === blood) { m = this.decals[i]; this.decalIdx = i + 1; break; }
    }
    m.visible = true; m.position.set(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02);
    m.lookAt(x + nx, y + ny, z + nz); m.rotateZ(rand(0, 6.28)); m.scale.setScalar(size);
  }
  bloodHit(x, y, z, dx, dz, amount = 1) {
    for (let i = 0; i < 8 * amount; i++) this.blood.spawn({ x, y, z, vx: dx * rand(1, 3) + rand(-1.5, 1.5), vy: rand(0, 2.5), vz: dz * rand(1, 3) + rand(-1.5, 1.5),
      life: rand(0.3, 0.8), size: rand(0.08, 0.22), r: rand(0.4, 0.7), g2: 0.02, b: 0.02, gravity: 9.8, drag: 1, ground: this.world.groundHeight(x, z) + 0.02 });
    for (let i = 0; i < 3; i++) this.smoke.spawn({ x, y, z, vx: rand(-0.3, 0.3), vy: rand(0, 0.3), vz: rand(-0.3, 0.3), life: 0.5, size: 0.35, grow: 0.8, r: 0.35, g2: 0.02, b: 0.02, alpha: 0.6, gravity: 0 });
  }
  dust(x, y, z, nx, ny, nz, metal = false) {
    for (let i = 0; i < 6; i++) this.smoke.spawn({ x, y, z, vx: nx * rand(0.5, 2) + rand(-0.5, 0.5), vy: ny * rand(0.5, 2) + rand(0, 0.6), vz: nz * rand(0.5, 2) + rand(-0.5, 0.5),
      life: rand(0.5, 1.1), size: rand(0.12, 0.3), grow: 0.6, r: 0.55, g2: 0.52, b: 0.48, alpha: 0.5, gravity: 0.5, drag: 2 });
    const n = metal ? 10 : 3;
    for (let i = 0; i < n; i++) this.spark.spawn({ x, y, z, vx: nx * rand(1, 5) + rand(-2, 2), vy: ny * rand(1, 5) + rand(0, 3), vz: nz * rand(1, 5) + rand(-2, 2),
      life: rand(0.08, 0.25), size: 0.05, r: 1, g2: 0.8, b: 0.4, gravity: 9.8, drag: 1 });
  }
  muzzle(x, y, z, dx, dy, dz) {
    this.light.position.set(x + dx * 0.5, y + dy * 0.5, z + dz * 0.5); this.light.intensity = 40; this.flashT = 0.05;
    for (let i = 0; i < 3; i++) this.smoke.spawn({ x: x + dx, y: y + dy, z: z + dz, vx: dx * 1.5 + rand(-0.2, 0.2), vy: 0.3, vz: dz * 1.5 + rand(-0.2, 0.2), life: rand(0.6, 1.2), size: 0.15, grow: 0.6, r: 0.7, g2: 0.7, b: 0.7, alpha: 0.25, gravity: -0.2, drag: 2 });
  }
  addEmitter(x, y, z, kind = 'fire', scale = 1) { const e = { x, y, z, kind, scale, acc: 0 }; this.emitters.push(e); return e; }
  update(dt, camPos) {
    this.flashT -= dt; if (this.flashT <= 0) this.light.intensity = 0;
    // continuous emitters near the camera
    const near = [];
    for (const e of this.emitters) {
      const d = Math.hypot(e.x - camPos.x, e.z - camPos.z);
      if (d > 260) continue;
      if (e.kind === 'fire' && d < 120) near.push([d, e]);
      e.acc += dt * (e.kind === 'plume' ? 6 : 22) * e.scale;
      while (e.acc > 1) {
        e.acc -= 1;
        if (e.kind === 'fire') {
          this.fire.spawn({ x: e.x + rand(-0.6, 0.6) * e.scale, y: e.y + rand(0, 0.3), z: e.z + rand(-0.6, 0.6) * e.scale, vx: rand(-0.2, 0.2), vy: rand(1, 2.2), vz: rand(-0.2, 0.2), life: rand(0.4, 0.9), size: rand(0.6, 1.1) * e.scale, grow: -0.6, gravity: -1, drag: 1 });
          if (Math.random() < 0.3) this.smoke.spawn({ x: e.x, y: e.y + 1.5, z: e.z, vx: rand(-0.3, 0.3) + 0.4, vy: rand(1.5, 2.5), vz: rand(-0.3, 0.3), life: rand(3, 5), size: 1.2 * e.scale, grow: 1.5, r: 0.12, g2: 0.11, b: 0.1, alpha: 0.55, gravity: -0.2, drag: 0.2 });
        } else if (e.kind === 'redsmoke') {
          this.smoke.spawn({ x: e.x + rand(-0.3, 0.3), y: e.y, z: e.z + rand(-0.3, 0.3), vx: rand(-0.3, 0.3) + 0.5, vy: rand(2, 3.5), vz: rand(-0.3, 0.3), life: rand(4, 6), size: 1.5, grow: 2, r: 0.85, g2: 0.12, b: 0.1, alpha: 0.6, gravity: -0.2, drag: 0.3 });
        } else if (e.kind === 'plume') {
          this.smoke.spawn({ x: e.x + rand(-3, 3), y: e.y, z: e.z + rand(-3, 3), vx: rand(0.5, 1.5), vy: rand(3, 5), vz: rand(-0.5, 0.5), life: rand(8, 12), size: 8, grow: 3, r: 0.1, g2: 0.1, b: 0.1, alpha: 0.5, gravity: -0.1, drag: 0.05 });
        }
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    this.fireLights.forEach((l, i) => {
      const e = near[i] && near[i][1];
      if (!e) { l.intensity = 0; return; }
      l.position.set(e.x, e.y + 1.5, e.z); l.intensity = (25 + Math.sin(performance.now() / 60 + i) * 6 + rand(-4, 4)) * e.scale;
    });
    this.blood.update(dt); this.smoke.update(dt); this.spark.update(dt); this.fire.update(dt);
  }
}

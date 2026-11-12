// Lightweight CPU particles (dust, smoke, sparks, splashes) and tyre skid marks.
import * as THREE from 'three';
import { smokeTexture } from '../world/textures.js';

const MAX = 900;

const vert = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
uniform float scale;
void main() {
  vAlpha = alpha;
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
uniform sampler2D map;
varying float vAlpha;
varying vec3 vTint;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vTint, t.a * vAlpha);
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.a0 = new Float32Array(MAX);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: smokeTexture() }, scale: { value: 600 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = g;
    this._c = new THREE.Color();
  }

  setViewport(h) {
    this.mat.uniforms.scale.value = h * 0.9;
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, { grow = 1.5, gravity = 0, alpha = 0.6 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this._c.set(color);
    this.col[i * 3] = this._c.r;
    this.col[i * 3 + 1] = this._c.g;
    this.col[i * 3 + 2] = this._c.b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = grow;
    this.grav[i] = gravity;
    this.a0[i] = alpha;
    this.alpha[i] = alpha;
  }

  burst(x, y, z, n, color, speed = 3, size = 1.2, life = 1.2, opts = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      this.spawn(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.6, Math.cos(a) * r, Math.random() * speed * 0.6 + 0.5, Math.sin(a) * r, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), opts);
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-1.6 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] *= 1 + this.grow[i] * dt;
      this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 8 + 0.2);
    }
    for (const k of ['position', 'tint', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

const SKID = 500;

export class Skidmarks {
  constructor(scene) {
    this.pos = new Float32Array(SKID * 4 * 3);
    this.alpha = new Float32Array(SKID * 4);
    const idx = [];
    for (let i = 0; i < SKID; i++) {
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.05,0.05,0.05, vA); }',
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.next = 0;
    this.last = null;
  }

  // add a mark from the previous point to (x,y,z); call break() when the tyre stops sliding
  add(x, y, z, strength) {
    if (!this.last) {
      this.last = [x, y, z];
      return;
    }
    const [lx, ly, lz] = this.last;
    const dx = x - lx;
    const dz = z - lz;
    const len = Math.hypot(dx, dz);
    if (len < 0.25) return;
    if (len > 3) {
      this.last = [x, y, z];
      return;
    }
    const nx = (-dz / len) * 0.09;
    const nz = (dx / len) * 0.09;
    const i = this.next;
    this.next = (this.next + 1) % SKID;
    const p = this.pos;
    const b = i * 12;
    p.set([lx + nx, ly + 0.03, lz + nz, lx - nx, ly + 0.03, lz - nz, x + nx, y + 0.03, z + nz, x - nx, y + 0.03, z - nz], b);
    const a = Math.min(0.55, strength);
    this.alpha.set([a, a, a, a], i * 4);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.last = [x, y, z];
  }

  break() {
    this.last = null;
  }
}

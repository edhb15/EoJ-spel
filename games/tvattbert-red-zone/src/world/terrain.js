// Streams terrain chunks around the player and renders water surfaces.
import * as THREE from 'three';

const CHUNK_CELLS = 64; // 64 * 2 m = 128 m

export class Terrain {
  constructor(world, scene, tex, quality) {
    this.world = world; this.scene = scene;
    this.chunks = new Map();
    this.viewDist = quality === 'low' ? 380 : quality === 'high' ? 640 : 500;
    this.nChunks = Math.ceil((world.NV - 1) / CHUNK_CELLS);
    this.group = new THREE.Group(); scene.add(this.group);
    // class weights texture: R lawn, G park/forest, B water/shore, A building
    const NC = world.NC; const data = new Uint8Array(NC * NC * 4);
    for (let i = 0; i < NC * NC; i++) {
      const c = world.cls[i];
      data[i * 4] = c === 1 ? 255 : 0; data[i * 4 + 1] = c === 2 ? 255 : 0;
      data[i * 4 + 2] = c === 3 ? 255 : 0; data[i * 4 + 3] = c === 4 ? 255 : 0;
    }
    this.classTex = new THREE.DataTexture(data, NC, NC, THREE.RGBAFormat);
    this.classTex.magFilter = THREE.LinearFilter; this.classTex.minFilter = THREE.LinearFilter;
    this.classTex.needsUpdate = true;
    this.material = makeTerrainMaterial(tex, this.classTex, world);
    this.buildWater(tex);
  }

  buildWater() {
    const w = this.world.water;
    const pos = new Float32Array(w.length);
    for (let i = 0; i < w.length; i += 9) { // flip winding (mirrored coordinate system)
      pos.set(w.subarray(i, i + 3), i); pos.set(w.subarray(i + 6, i + 9), i + 3); pos.set(w.subarray(i + 3, i + 6), i + 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // animated ripple normal map
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), img = x.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let k = 0; k < 40; k++) {
      const fx = (1 + (k % 7)) * 2 * Math.PI / S, fy = (1 + ((k * 3) % 5)) * 2 * Math.PI / S, ph = k * 1.7, a = 1 / (1 + k * 0.15);
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) h[yy * S + xx] += Math.sin(xx * fx * (k % 2 ? 1 : -1) + yy * fy + ph) * a;
    }
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      const dx = h[yy * S + (xx + 1) % S] - h[yy * S + (xx + S - 1) % S];
      const dy = h[((yy + 1) % S) * S + xx] - h[((yy + S - 1) % S) * S + xx];
      const o = (yy * S + xx) * 4;
      img.data[o] = 128 + dx * 20; img.data[o + 1] = 128 + dy * 20; img.data[o + 2] = 255; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const nt = new THREE.CanvasTexture(c); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(1, 1);
    this.waterNormal = nt;
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x0d1c22, roughness: 0.12, metalness: 0.35, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true, opacity: 0.93,
    });
    // world-space UVs for the ripples
    const uv = new Float32Array((pos.length / 3) * 2);
    for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] / 22; uv[i * 2 + 1] = pos[i * 3 + 2] / 22; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.water = new THREE.Mesh(g, this.waterMat);
    this.water.receiveShadow = true;
    this.scene.add(this.water);
  }

  buildChunk(ci, ck) {
    const W = this.world, N = W.NV, G = W.G, H = W.height;
    const i0 = ci * CHUNK_CELLS, k0 = ck * CHUNK_CELLS;
    const i1 = Math.min(N - 1, i0 + CHUNK_CELLS), k1 = Math.min(N - 1, k0 + CHUNK_CELLS);
    const w = i1 - i0 + 1, h = k1 - k0 + 1;
    const pos = new Float32Array(w * h * 3), nor = new Float32Array(w * h * 3);
    const hAt = (i, k) => H[Math.min(N - 1, Math.max(0, k)) * N + Math.min(N - 1, Math.max(0, i))];
    for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) {
      const gi = i0 + i, gk = k0 + k, o = (k * w + i) * 3;
      pos[o] = -W.half + gi * G; pos[o + 1] = hAt(gi, gk); pos[o + 2] = -W.half + gk * G;
      const nx = hAt(gi - 1, gk) - hAt(gi + 1, gk), nz = hAt(gi, gk - 1) - hAt(gi, gk + 1), ny = 2 * G;
      const L = Math.hypot(nx, ny, nz); nor[o] = nx / L; nor[o + 1] = ny / L; nor[o + 2] = nz / L;
    }
    const idx = new Uint32Array((w - 1) * (h - 1) * 6); let n = 0;
    for (let k = 0; k < h - 1; k++) for (let i = 0; i < w - 1; i++) {
      const a = k * w + i, b = a + 1, c = a + w, d = c + 1;
      idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, this.material);
    m.receiveShadow = true; m.castShadow = true;
    return m;
  }

  rebuildArea(x0, z0, x1, z1) { // after terrain edits (hospital plaza)
    for (const [key, m] of this.chunks) {
      const bb = m.geometry.boundingBox;
      if (bb.max.x < x0 || bb.min.x > x1 || bb.max.z < z0 || bb.min.z > z1) continue;
      this.group.remove(m); m.geometry.dispose(); this.chunks.delete(key);
    }
  }

  update(px, pz, maxBuild = 2) {
    const W = this.world, cs = CHUNK_CELLS * W.G;
    const vd = this.viewDist;
    const cands = [];
    for (let ck = 0; ck < this.nChunks; ck++) for (let ci = 0; ci < this.nChunks; ci++) {
      const cx = -W.half + (ci + 0.5) * cs, cz = -W.half + (ck + 0.5) * cs;
      const d = Math.hypot(cx - px, cz - pz);
      const key = ck * 1000 + ci;
      const have = this.chunks.get(key);
      if (d < vd + cs * 0.75) { if (!have) cands.push([d, ci, ck, key]); }
      else if (have && d > vd + cs * 1.5) { this.group.remove(have); have.geometry.dispose(); this.chunks.delete(key); }
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(maxBuild, cands.length); i++) {
      const [, ci, ck, key] = cands[i];
      const m = this.buildChunk(ci, ck); this.group.add(m); this.chunks.set(key, m);
    }
    return cands.length;
  }
  tick(t) { this.waterNormal.offset.set(t * 0.012, t * 0.007); }
}

function makeTerrainMaterial(tex, classTex, world) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      tAsphalt: { value: tex.asphalt }, tGrass: { value: tex.grass }, tForest: { value: tex.forest },
      tRock: { value: tex.rock }, tClass: { value: classTex }, uHalf: { value: world.half }, uSize: { value: world.size },
      uWet: { value: 0 },
    });
    mat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNorm;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz; vWNorm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNorm;
uniform sampler2D tAsphalt, tGrass, tForest, tRock, tClass; uniform float uHalf, uSize, uWet;
float hn(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hn(i),hn(i+vec2(1,0)),f.x), mix(hn(i+vec2(0,1)),hn(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <map_fragment>', `
vec2 cuv = (vWPos.xz + uHalf) / uSize;
vec4 cw = texture2D(tClass, cuv);
vec2 tuv = vWPos.xz * 0.11;
float big = vn(vWPos.xz * 0.02);
vec3 cAsph = mix(texture2D(tAsphalt, tuv).rgb, texture2D(tAsphalt, tuv * 0.31 + 0.37).rgb, 0.45) * (0.85 + 0.3 * big);
vec3 cGrass = mix(texture2D(tGrass, tuv * 0.9).rgb, texture2D(tGrass, tuv * 0.23).rgb, 0.5) * (0.8 + 0.4 * big);
vec3 cForest = mix(texture2D(tForest, tuv * 0.7).rgb, texture2D(tForest, tuv * 0.19).rgb, 0.5);
vec3 cRock = texture2D(tRock, tuv * 0.45).rgb;
float urban = clamp(1.0 - cw.r - cw.g - cw.b, 0.0, 1.0);
vec3 col = cAsph * urban + cGrass * cw.r + cForest * cw.g + cAsph * 0.6 * cw.b;
float slope = 1.0 - clamp(vWNorm.y, 0.0, 1.0);
float rockiness = smoothstep(0.18, 0.42, slope + (vn(vWPos.xz * 0.05) - 0.5) * 0.25 * (cw.g + cw.r));
col = mix(col, cRock, rockiness * (1.0 - urban * 0.6));
// granite outcrops in parks (typical for Göteborg)
col = mix(col, cRock, cw.g * smoothstep(0.62, 0.75, vn(vWPos.xz * 0.035 + 7.0)) * 0.9);
col *= mix(1.0, 0.55, uWet * urban);
diffuseColor.rgb *= col;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.25, uWet * clamp(1.0 - cw.r - cw.g, 0.0, 1.0));`);
  };
  return mat;
}

// Sky dome with sun and clouds, sun/hemisphere lighting, fog and an environment map.
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const frag = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform vec3 sunColor;
uniform float time;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p = p * 2.03 + 7.1; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, groundColor, smoothstep(0.0, -0.2, h));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(sd, 1200.0) * 30.0 + pow(sd, 90.0) * 0.6 + pow(sd, 6.0) * 0.18);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.15) * 1.3 + vec2(time * 0.006, time * 0.002);
    float c = fbm(uv * 1.4);
    c = smoothstep(0.52, 0.86, c) * smoothstep(0.0, 0.22, h);
    float lit = 0.75 + 0.35 * pow(sd, 4.0);
    vec3 cloud = mix(vec3(0.82, 0.85, 0.9), vec3(1.0, 0.97, 0.92), lit - 0.6) * lit;
    col = mix(col, cloud, c * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.sunDir = new THREE.Vector3(0.52, 0.6, 0.6).normalize();
    this.uniforms = {
      sunDir: { value: this.sunDir },
      topColor: { value: new THREE.Color('#3f7fd1') },
      horizonColor: { value: new THREE.Color('#cfe0ee') },
      groundColor: { value: new THREE.Color('#9eb0bf') },
      sunColor: { value: new THREE.Color('#ffe2b0') },
      time: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight('#c3dbff', '#6e5d48', 1.15);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d8', 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.setShadowQuality('medium', true);
    scene.fog = new THREE.Fog('#cad9e6', 180, 900);

    // environment map for reflections on paint and metal
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat.clone());
    envDome.material.uniforms = this.uniforms;
    envScene.add(envDome);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5d6650' }));
    ground.position.y = -2;
    envScene.add(ground);
    this.envMap = pm.fromScene(envScene, 0.02).texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  setShadowQuality(q, enabled) {
    const size = q === 'high' ? 2048 : q === 'medium' ? 1536 : 1024;
    const ext = q === 'high' ? 80 : q === 'medium' ? 65 : 50;
    this.sun.castShadow = enabled;
    if (this.sun.shadow.map && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.shadow.mapSize.set(size, size);
    const cam = this.sun.shadow.camera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 1;
    cam.far = 900;
    cam.updateProjectionMatrix();
    this.shadowExt = ext;
    this.shadowSize = size;
  }

  setDrawDistance(d) {
    this.scene.fog.far = d;
    this.scene.fog.near = Math.min(180, d * 0.2);
  }

  update(dt, camera, focus) {
    this.uniforms.time.value += dt;
    this.dome.position.copy(camera.position);
    // keep the shadow frustum centred on the action, snapped to texels to avoid shimmer
    const texel = (this.shadowExt * 2) / this.shadowSize;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 400, focus.y + this.sunDir.y * 400, fz + this.sunDir.z * 400);
    this.sun.target.updateMatrixWorld();
  }
}

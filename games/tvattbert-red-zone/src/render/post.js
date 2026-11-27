// Off-screen render + full-screen grading pass (vignette, grain, damage, infection effects).
import * as THREE from 'three';

export class Post {
  constructor(renderer, quality) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType, samples: quality === 'low' ? 0 : 4,
    });
    this.uniforms = {
      tScene: { value: this.rt.texture }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(size.x, size.y) },
      uInfect: { value: 0 }, uPulse: { value: 0 }, uDamage: { value: 0 }, uHealth: { value: 1 }, uAcid: { value: 0 },
      uFade: { value: 0 }, uZombie: { value: 0 }, uNight: { value: 0 }, uScope: { value: 0 },
    };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms, depthTest: false, depthWrite: false, toneMapped: true,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG,
    }));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    this.rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.uniforms.uRes.value.set(w * pr, h * pr);
  }
  render(scene, camera, vmScene, vmCamera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.autoClear = true;
    r.render(scene, camera);
    if (vmScene) { r.autoClear = false; r.clearDepth(); r.render(vmScene, vmCamera); r.autoClear = true; }
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}

const FRAG = /* glsl */`
uniform sampler2D tScene; uniform float uTime, uInfect, uPulse, uDamage, uHealth, uAcid, uFade, uZombie, uNight, uScope;
uniform vec2 uRes; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float inf = uInfect;
  // infection: wavy distortion grows over time
  float wob = inf * inf * 0.012 + uZombie * 0.02 + uAcid * 0.01;
  uv += vec2(sin(uv.y * 18.0 + uTime * 2.1), cos(uv.x * 14.0 + uTime * 1.7)) * wob;
  // chromatic aberration
  float ca = (0.0015 + inf * 0.012 + uDamage * 0.006 + uAcid * 0.01 + uZombie * 0.02) * length(c) * 2.0;
  vec3 col;
  col.r = texture2D(tScene, uv + c * ca).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - c * ca).b;
  // acid / infection blur (cheap 4-tap)
  float bl = uAcid * 0.006 + inf * inf * 0.004;
  if (bl > 0.0001) {
    vec3 b = texture2D(tScene, uv + vec2(bl, 0.0)).rgb + texture2D(tScene, uv - vec2(bl, 0.0)).rgb +
             texture2D(tScene, uv + vec2(0.0, bl)).rgb + texture2D(tScene, uv - vec2(0.0, bl)).rgb;
    col = mix(col, b * 0.25, clamp(uAcid + inf * 0.6, 0.0, 0.8));
  }
  #ifdef TONE_MAPPING
  col = toneMapping(col);
  #endif
  // grade: slightly desaturated, cold shadows
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  float desat = 0.18 + (1.0 - uHealth) * 0.5 + inf * 0.5;
  col = mix(col, vec3(l), clamp(desat, 0.0, 0.95));
  col = mix(col * vec3(0.92, 0.97, 1.06), col * vec3(1.05, 1.0, 0.92), smoothstep(0.2, 0.8, l));
  col = (col - 0.5) * 1.06 + 0.5;
  // infection tint: sickly green-yellow, red veins at the edges
  float r = length(c);
  vec3 sick = vec3(0.55, 0.65, 0.25);
  col = mix(col, col * sick * 1.4, inf * 0.55);
  float veins = smoothstep(0.35, 0.75, r) * (0.6 + 0.4 * sin(atan(c.y, c.x) * 13.0 + uTime * 0.5));
  col = mix(col, vec3(0.35, 0.0, 0.0), clamp(veins * inf * (0.5 + 0.5 * uPulse), 0.0, 0.85));
  // heartbeat darkening pulse
  col *= 1.0 - inf * uPulse * 0.35;
  // low health / damage
  float lowH = 1.0 - uHealth;
  col = mix(col, vec3(0.4, 0.0, 0.0), smoothstep(0.3, 0.8, r) * (uDamage * 0.8 + lowH * lowH * 0.6));
  // acid green
  col = mix(col, col * vec3(0.5, 1.0, 0.3), uAcid * 0.6);
  // turned into a zombie
  col = mix(col, vec3(dot(col, vec3(0.6, 0.3, 0.1))) * vec3(1.3, 0.35, 0.25), uZombie);
  // vignette + scope mask
  col *= 1.0 - smoothstep(0.45, 0.95, r) * (0.55 + uNight * 0.2 + inf * 0.3);
  float aspect = uRes.x / uRes.y;
  float sr = length(vec2(c.x * aspect, c.y));
  col *= mix(1.0, 1.0 - smoothstep(0.40, 0.42, sr), uScope);
  // film grain
  col += (hash(uv * uRes + fract(uTime) * 100.0) - 0.5) * (0.03 + uNight * 0.015 + inf * 0.05);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// Sky, sun/moon lighting, fog, dynamic weather (rain, fog, storms with lightning).
import * as THREE from 'three';
import { Sky } from 'three/addons/Sky.js';
import { lerp, clamp, rand, pick } from '../core/util.js';

export const WEATHER = {
  klart: { name: 'Klart', fog: 0.0035, turb: 2, rayleigh: 1.2, rain: 0, dim: 1.0, wind: 0.2, cloud: 0.1 },
  mulet: { name: 'Mulet', fog: 0.0055, turb: 10, rayleigh: 2.5, rain: 0, dim: 0.62, wind: 0.4, cloud: 0.7 },
  dimma: { name: 'Dimma', fog: 0.02, turb: 14, rayleigh: 3, rain: 0, dim: 0.5, wind: 0.1, cloud: 0.9 },
  regn: { name: 'Regn', fog: 0.009, turb: 14, rayleigh: 3, rain: 0.7, dim: 0.42, wind: 0.6, cloud: 1 },
  storm: { name: 'Storm', fog: 0.012, turb: 18, rayleigh: 3.5, rain: 1, dim: 0.3, wind: 1, cloud: 1 },
};
const KEYS = Object.keys(WEATHER);

export class Environment {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.sky = new Sky(); this.sky.scale.setScalar(900); scene.add(this.sky);
    this.sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 500;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd0e0, 0x3a3428, 0.8); scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x404858, 0.15); scene.add(this.ambient);
    scene.fog = new THREE.FogExp2(0x8a9098, 0.005);
    this.current = { ...WEATHER.mulet }; this.target = WEATHER.mulet; this.weatherKey = 'mulet';
    this.nextChange = 60 * 6; // game minutes
    this.lightning = 0; this.indoor = 0;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene(); this.envSky = new Sky(); this.envSky.scale.setScalar(100); this.envScene.add(this.envSky);
    this.envTimer = 0; this.envTarget = null;
    this.onThunder = null;
    // rain
    const N = quality === 'low' ? 2500 : 6000;
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = rand(-30, 30), y = rand(-2, 22), z = rand(-30, 30);
      pos.set([x, y, z, x + 0.02, y - 0.6, z], i * 6);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa8b4c0, transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false; this.rainN = N; scene.add(this.rain);
    this.sunDir = new THREE.Vector3();
    this.nightAmount = 0;
  }

  setWeather(key, instant = false) {
    this.weatherKey = key; this.target = WEATHER[key];
    if (instant) this.current = { ...this.target };
  }

  update(dt, time, playerPos, indoorTarget) {
    // weather transitions on game time
    this.nextChange -= dt * time.rate;
    if (this.nextChange <= 0) {
      const r = Math.random();
      const key = r < 0.22 ? 'klart' : r < 0.55 ? 'mulet' : r < 0.68 ? 'dimma' : r < 0.9 ? 'regn' : 'storm';
      this.setWeather(key);
      this.nextChange = rand(4, 10) * 60;
    }
    const k = clamp(dt * 0.04, 0, 1);
    for (const p of ['fog', 'turb', 'rayleigh', 'rain', 'dim', 'wind', 'cloud']) this.current[p] = lerp(this.current[p], this.target[p], k);
    this.indoor = lerp(this.indoor, indoorTarget ? 1 : 0, clamp(dt * 3, 0, 1));
    const w = this.current;

    // sun path: rises 06:00 in the east, sets 20:00 in the west
    const h = time.hour;
    const dayT = (h - 6) / 14;
    const elev = Math.sin(Math.PI * clamp(dayT, -0.2, 1.2)) * 48; // degrees
    const az = lerp(-90, 90, clamp(dayT, 0, 1)); // -90 east .. 90 west via south
    const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(-az); // east at dawn, south at noon (+Z), west at dusk
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    // Three: x east, z south. Sky "south" = +z
    const night = time.night; this.nightAmount = night;
    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms;
      u.sunPosition.value.copy(this.sunDir);
      u.turbidity.value = w.turb; u.rayleigh.value = w.rayleigh * (1 - night * 0.6);
      u.mieCoefficient.value = 0.005 + w.cloud * 0.02; u.mieDirectionalG.value = 0.8;
    }
    this.sky.position.copy(this.camera.position);
    // lighting
    const sunUp = clamp(elev / 12, 0, 1);
    const flash = this.lightning;
    const dayLight = sunUp * w.dim;
    this.sun.intensity = 7.5 * dayLight * (1 - w.cloud * 0.5) + flash * 8;
    const warm = clamp(1 - elev / 25, 0, 1);
    this.sun.color.setRGB(1, lerp(0.96, 0.7, warm), lerp(0.9, 0.5, warm));
    if (elev < 2) { // moonlight
      this.sun.intensity = 0.8 * (1 - w.cloud * 0.5) + flash * 8;
      this.sun.color.setRGB(0.6, 0.7, 1.0);
      this.sunDir.set(0.3, 0.8, 0.5).normalize();
    }
    const out = 1 - this.indoor * 0.85;
    this.hemi.intensity = (0.5 + 2.6 * dayLight + flash * 4) * out + 0.08;
    this.hemi.color.setRGB(lerp(0.32, 0.75, sunUp), lerp(0.36, 0.8, sunUp), lerp(0.48, 0.86, sunUp));
    this.ambient.intensity = 0.12 + 0.3 * (1 - night);
    this.sun.position.copy(playerPos).addScaledVector(this.sunDir, 200);
    this.sun.target.position.copy(playerPos);
    // fog colour follows the sky near the horizon
    const fc = new THREE.Color().setRGB(lerp(0.035, 0.56, dayLight * 0.9 + 0.1 * sunUp), lerp(0.04, 0.6, dayLight * 0.9 + 0.1 * sunUp), lerp(0.055, 0.64, dayLight * 0.9 + 0.1 * sunUp));
    if (warm > 0.4 && sunUp > 0) fc.lerp(new THREE.Color(0.65, 0.45, 0.35), (warm - 0.4) * 0.5 * sunUp);
    this.scene.fog.color.copy(fc);
    this.scene.fog.density = w.fog * (1 + night * 0.6) * (1 - this.indoor * 0.7);
    this.renderer.toneMappingExposure = lerp(0.55, 0.85, sunUp) + flash * 0.6;
    this.sky.visible = true;
    // sky dims at night (Sky shader is too bright for a dark apocalypse night)
    this.sky.material.uniforms.rayleigh.value *= 1;
    // rain
    const rainVis = w.rain * (1 - this.indoor);
    this.rain.visible = rainVis > 0.02;
    if (this.rain.visible) {
      this.rain.material.opacity = 0.12 + rainVis * 0.35;
      const p = this.rain.geometry.attributes.position.array;
      const fall = (14 + w.wind * 6) * dt, drift = w.wind * 3 * dt;
      const cx = this.camera.position.x, cy = this.camera.position.y, cz = this.camera.position.z;
      for (let i = 0; i < this.rainN; i++) {
        const o = i * 6;
        p[o + 1] -= fall; p[o + 4] -= fall; p[o] += drift; p[o + 3] += drift;
        if (p[o + 1] < cy - 3 || Math.abs(p[o] - cx) > 30 || Math.abs(p[o + 2] - cz) > 30) {
          const x = cx + rand(-30, 30), y = cy + rand(8, 22), z = cz + rand(-30, 30);
          p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = x + 0.02 + w.wind * 0.1; p[o + 4] = y - 0.7; p[o + 5] = z;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    // lightning
    this.lightning = Math.max(0, this.lightning - dt * 4);
    if (this.weatherKey === 'storm' && Math.random() < dt * 0.05) {
      this.lightning = 1;
      const delay = rand(0.5, 4);
      this.onThunder && setTimeout(() => this.onThunder(delay), delay * 1000);
    }
    // environment map refresh
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 8;
      const old = this.envTarget;
      this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
      this.scene.environment = this.envTarget.texture;
      this.scene.environmentIntensity = 0.35 * (0.15 + 0.85 * dayLight) * out;
      if (old) old.dispose();
    }
    return w;
  }
  get wetness() { return clamp(this.current.rain * 1.3, 0, 1); }
}

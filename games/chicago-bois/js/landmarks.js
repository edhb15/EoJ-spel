// Chicago Bois – moving and special landmarks: the elevated "L" train, the pier Ferris wheel,
// the mirror-polished "Jellybean" sculpture, the fountain and Lake Michigan.
'use strict';
(function (CB) {
  const B = BABYLON, M = CB.M, C = CB.C, hex = M.hex;
  const LM = CB.Landmarks = {};

  // ---------------------------------------------------------- water shader
  // Three scrolling scales of a tileable wave normal map, Fresnel reflection of the sky
  // (or of the real skyline from a planar mirror on High), sun / moon glints and foam at the shore.
  B.Effect.ShadersStore.cbWaterVertexShader = `
    precision highp float;
    attribute vec3 position;
    uniform mat4 world, viewProjection;
    varying vec3 vW; varying vec4 vClip;
    void main() { vec4 w = world * vec4(position, 1.0); vW = w.xyz; vClip = viewProjection * w; gl_Position = vClip; }`;
  B.Effect.ShadersStore.cbWaterFragmentShader = `
    precision highp float;
    varying vec3 vW; varying vec4 vClip;
    uniform vec3 camPos, sunDir, sunColor, topColor, horizonColor, deepColor, fogColor;
    uniform vec2 flow, fogInfo;
    uniform float time, night, mirrorK, shoreX, waveK;
    uniform sampler2D normalTex, mirrorTex;
    vec2 nrm(vec2 uv) { return texture2D(normalTex, uv).xy * 2.0 - 1.0; }
    void main() {
      vec2 p = vW.xz;
      float dist = length(camPos - vW);
      vec2 n = nrm(p * 0.031 + flow * time * 0.012 + vec2(time * 0.004, 0.0)) * 0.9
             + nrm(p * 0.083 + vec2(-time * 0.019, time * 0.013) + flow * time * 0.02) * 0.55
             + nrm(p * 0.0083 + vec2(time * 0.003, -time * 0.002)) * 1.0;
      float fade = clamp(dist / 700.0, 0.0, 0.85);
      vec3 N = normalize(vec3(n.x * waveK * (1.0 - fade), 1.0, n.y * waveK * (1.0 - fade)));
      vec3 V = normalize(camPos - vW);
      float ndv = max(dot(N, V), 0.0);
      float fres = 0.025 + 0.975 * pow(1.0 - ndv, 5.0);
      vec3 R = reflect(-V, N);
      R.y = abs(R.y);
      vec3 refl = mix(horizonColor, topColor, pow(R.y, 0.6));
      // the skyline (planar mirror), wobbling with the waves
      vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5 + N.xz * 0.045 * (1.0 - fade);
      vec4 mr = texture2D(mirrorTex, suv);
      refl = mix(refl, mr.rgb, mr.a * mirrorK);
      vec3 sd = normalize(sunDir);
      float s = max(dot(R, sd), 0.0);
      vec3 glint = sunColor * (pow(s, 900.0) * 9.0 + pow(s, 80.0) * 0.35) * (1.0 - night);
      float m = max(dot(R, -sd), 0.0);
      glint += vec3(0.75, 0.82, 1.0) * (pow(m, 600.0) * 2.5 + pow(m, 60.0) * 0.12) * night;
      vec3 body = deepColor * (0.18 + 0.82 * (1.0 - night)) * (0.75 + 0.25 * N.y);
      vec3 col = mix(body, refl, clamp(fres * 1.15, 0.0, 1.0)) + glint;
      // foam along the lake shore
      float sx = vW.x - shoreX;
      if (sx > 0.0 && sx < 8.0) {
        float fn = texture2D(normalTex, p * 0.12 + vec2(time * 0.02, 0.0)).z;
        float fn2 = texture2D(normalTex, p * 0.31 - vec2(0.0, time * 0.03)).z;
        float edge = 1.0 - smoothstep(0.0, 4.5, sx + n.x * 1.2 - 0.8 * sin(time * 0.9 + p.y * 0.15));
        float foam = edge * smoothstep(0.62, 0.86, fn * 0.6 + fn2 * 0.4 + edge * 0.22);
        col = mix(col, vec3(0.9, 0.94, 0.96) * (1.0 - night * 0.75), foam * 0.65);
      }
      float f = clamp((fogInfo.y - dist) / (fogInfo.y - fogInfo.x), 0.0, 1.0);
      gl_FragColor = vec4(mix(fogColor, col, f), 1.0);
    }`;

  LM.init = function (scene) {
    const P = CB.Pools, City = CB.City;

    // ---------------------------------------------------------- reflection probe (sky + nearby city)
    const bean = City.bean;
    const probe = this.probe = new B.ReflectionProbe('probe', 128, scene);
    probe.position = new B.Vector3(bean.x, 4, bean.z);
    probe.refreshRate = B.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this.probeT = 0;

    // ---------------------------------------------------------- the Jellybean
    const jb = B.MeshBuilder.CreateSphere('jellybean', { diameter: 1, segments: 32 }, scene);
    jb.scaling.set(11, 5.2, 6.6);
    jb.position.set(bean.x, C.CURB + 2.35, bean.z);
    const jm = new B.StandardMaterial('beanMat', scene);
    jm.diffuseColor = new B.Color3(0.05, 0.05, 0.06);
    jm.specularColor = new B.Color3(1, 1, 1); jm.specularPower = 256;
    jm.reflectionTexture = probe.cubeTexture;
    jm.roughness = 0;
    jb.material = jm;
    jb.receiveShadows = true;
    this.bean = jb;

    // ---------------------------------------------------------- Lake Michigan
    const water = B.MeshBuilder.CreateGround('lake', { width: 2400, height: 3000, subdivisions: 1 }, scene);
    water.position.set(C.SHORE + 1200, City.waterY, 0);
    const wn = this.waterNormalTex = waterNormals(scene);
    this.blankTex = new B.RawTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, B.Engine.TEXTUREFORMAT_RGBA, scene, false);
    this.waterMats = [];
    const waterMat = (name, deep, flow, shore, waves) => {
      const m = new B.ShaderMaterial(name, scene, 'cbWater', {
        attributes: ['position'],
        uniforms: ['world', 'viewProjection', 'camPos', 'sunDir', 'sunColor', 'topColor', 'horizonColor', 'deepColor', 'fogColor', 'flow', 'fogInfo', 'time', 'night', 'mirrorK', 'shoreX', 'waveK'],
        samplers: ['normalTex', 'mirrorTex'],
      });
      m.setTexture('normalTex', wn); m.setTexture('mirrorTex', this.blankTex);
      m.setColor3('deepColor', new B.Color3(deep[0], deep[1], deep[2]));
      m.setVector2('flow', new B.Vector2(flow[0], flow[1]));
      m.setFloat('shoreX', shore); m.setFloat('mirrorK', 0); m.setFloat('waveK', waves);
      this.waterMats.push(m);
      return m;
    };
    water.material = waterMat('lakeMat', [0.035, 0.16, 0.25], [0, 0], C.SHORE, 0.24);
    water.isPickable = false;
    this.water = water;
    // the Chicago River (the main branch starts east of the south branch so they don't overlap)
    const rivers = City.rivers;
    this.riverMeshes = rivers.map((r, k) => {
      const x0 = k === 0 ? rivers[1].x1 : r.x0, x1 = Math.min(r.x1, C.SHORE + 0.5);
      const m = B.MeshBuilder.CreateGround('river' + k, { width: x1 - x0, height: r.z1 - r.z0 }, scene);
      m.position.set((x0 + x1) / 2, City.waterY + 0.01, (r.z0 + r.z1) / 2);
      const along = (x1 - x0) > (r.z1 - r.z0);
      m.material = waterMat('riverMat' + k, [0.03, 0.11, 0.095], along ? [1, 0] : [0, 1], -1e5, 0.17);
      m.isPickable = false;
      return m;
    });
    // fountain basin keeps a simple shiny material (it isn't at lake level)
    const wm = new B.StandardMaterial('fountainMat', scene);
    wm.diffuseColor = new B.Color3(0.1, 0.32, 0.45);
    wm.specularColor = new B.Color3(0.9, 0.9, 0.9); wm.specularPower = 160;
    wm.bumpTexture = wn; wm.bumpTexture.level = 0.5;
    wm.reflectionTexture = probe.cubeTexture;
    wm.reflectionFresnelParameters = new B.FresnelParameters();
    wm.reflectionFresnelParameters.bias = 0.15; wm.reflectionFresnelParameters.power = 2.5;
    wm.reflectionFresnelParameters.leftColor = new B.Color3(0.9, 0.9, 0.9);
    wm.reflectionFresnelParameters.rightColor = new B.Color3(0.15, 0.15, 0.15);
    this.waterMat = wm;
    // tour boats cruising the main branch
    this.boats = [];
    const r1 = rivers[0], rx0 = rivers[1].x1 + 12, rx1 = C.SHORE + 60;
    const P0 = CB.Pools;
    for (let k = 0; k < 3; k++) {
      const r = new CB.Rig();
      const hull = [hex(0x1f3a5f), hex(0x7a1f1f), hex(0x22543d)][k];
      r.add(P0.shiny, { o: [0, 0.45, 0], s: [4.2, 1.1, 16], c: hex(0xf2f2f0) });
      r.add(P0.box, { o: [0, 0.2, 0], s: [4.25, 0.35, 16.05], c: hull });
      r.add(P0.box, { o: [0, 1.25, 1.5], s: [3.6, 0.5, 9], c: hex(0xdad6cc) });
      r.add(P0.box, { o: [0, 2.35, 1.5], s: [3.9, 0.12, 9.4], c: hull });
      for (const dx of [-1.8, 1.8]) for (const dz of [-2.5, 1.5, 5.5]) r.add(P0.box, { o: [dx, 1.8, dz], s: [0.1, 1.1, 0.1], c: hex(0x333333) });
      r.add(P0.box, { o: [0, 1.6, -6], s: [2.2, 1.6, 2.4], c: hex(0x2c3e50) });
      r.add(P0.gY, { o: [0, 1.3, 1.5], s: [3.5, 0.2, 8.6] });
      r.add(P0.gW, { o: [0, 1.0, 8.05], s: [0.6, 0.3, 0.1] });
      const lane = k % 2 ? 4.5 : -4.5;
      r.yaw = k % 2 ? -Math.PI / 2 : Math.PI / 2;
      this.boats.push({ r, x: rx0 + (rx1 - rx0) * (k / 3), zc: (r1.z0 + r1.z1) / 2, z: (r1.z0 + r1.z1) / 2 + lane, dir: k % 2 ? -1 : 1, x0: rx0, x1: rx1, lane, win: r.parts[r.parts.length - 2] });
    }
    // fountain basin water
    if (City.fountain) {
      const fw = B.MeshBuilder.CreateCylinder('fountainWater', { height: 0.1, diameter: 20.6, tessellation: 40 }, scene);
      fw.position.set(City.fountain.x, C.CURB + 0.72, City.fountain.z);
      fw.material = wm; fw.isPickable = false;
    }

    // glass towers reflect the sky
    const gm = City.mats.glass;
    gm.reflectionTexture = probe.cubeTexture;
    gm.reflectionFresnelParameters = new B.FresnelParameters();
    gm.reflectionFresnelParameters.bias = 0.25; gm.reflectionFresnelParameters.power = 1.5;
    gm.reflectionFresnelParameters.leftColor = new B.Color3(0.7, 0.7, 0.7);
    gm.reflectionFresnelParameters.rightColor = new B.Color3(0.2, 0.2, 0.2);

    // ---------------------------------------------------------- Ferris wheel
    const F = City.ferris;
    const root = this.wheelRoot = new B.TransformNode('wheel', scene);
    root.position.set(F.x, F.y + C.CURB, F.z);
    const parts = [];
    const white = new B.StandardMaterial('wheelMat', scene);
    white.diffuseColor = new B.Color3(0.92, 0.92, 0.95); white.specularColor = new B.Color3(0.3, 0.3, 0.3);
    for (const z of [-1.6, 1.6]) {
      const rim = B.MeshBuilder.CreateTorus('rim', { diameter: F.r * 2, thickness: 0.5, tessellation: 64 }, scene);
      rim.rotation.x = Math.PI / 2; rim.position.z = z; parts.push(rim);
      const rim2 = B.MeshBuilder.CreateTorus('rim2', { diameter: F.r * 1.4, thickness: 0.3, tessellation: 48 }, scene);
      rim2.rotation.x = Math.PI / 2; rim2.position.z = z; parts.push(rim2);
    }
    for (let k = 0; k < 16; k++) {
      const sp = B.MeshBuilder.CreateCylinder('spoke', { height: F.r * 2, diameter: 0.18, tessellation: 6 }, scene);
      sp.rotation.z = k * Math.PI / 16; sp.position.z = k % 2 ? 1.6 : -1.6;
      parts.push(sp);
    }
    const hub = B.MeshBuilder.CreateCylinder('hub', { height: 4, diameter: 2, tessellation: 16 }, scene);
    hub.rotation.x = Math.PI / 2; parts.push(hub);
    const wheel = B.Mesh.MergeMeshes(parts, true, true);
    wheel.material = white; wheel.parent = root; wheel.receiveShadows = true;
    this.wheel = wheel;
    // light bulbs around the rim
    const bulbs = [];
    for (let k = 0; k < 48; k++) {
      const a = k / 48 * Math.PI * 2;
      for (const z of [-1.9, 1.9]) {
        const b = B.MeshBuilder.CreateBox('bulb', { size: 0.35 }, scene);
        b.position.set(Math.cos(a) * F.r, Math.sin(a) * F.r, z);
        bulbs.push(b);
      }
    }
    const bulbMesh = B.Mesh.MergeMeshes(bulbs, true, true);
    const bm = new B.StandardMaterial('bulbMat', scene);
    bm.disableLighting = true; bm.diffuseColor = new B.Color3(0, 0, 0); bm.emissiveColor = new B.Color3(1, 0.4, 0.75);
    bulbMesh.material = bm; bulbMesh.parent = root;
    this.bulbMat = bm; this.bulbs = bulbMesh;
    // gondolas (dynamic pool parts)
    this.gondolas = [];
    const gcols = [0xe74c3c, 0xf39c12, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6, 0x1abc9c, 0xe67e22].map(hex);
    for (let k = 0; k < 16; k++) this.gondolas.push({ a: k / 16 * Math.PI * 2, s: P.box.alloc(gcols[k % gcols.length]), roof: P.box.alloc(hex(0xffffff)) });

    // ---------------------------------------------------------- L train
    const L = City.loop;
    this.loopLen = (L.hi - L.lo) * 4;
    this.trainS = 0;
    this.train = [];
    for (let k = 0; k < 4; k++) {
      const r = new CB.Rig();
      r.add(P.shiny, { o: [0, 1.6, 0], s: [2.9, 2.9, 12], c: hex(0xb8bec4) });
      r.add(P.box, { o: [0, 2.05, 0], s: [2.95, 0.9, 11.2], c: hex(0x24313d) });
      r.add(P.box, { o: [0, 0.75, 0], s: [2.96, 0.35, 12.02], c: hex(0x0057a8) });
      r.add(P.box, { o: [0, 3.1, 0], s: [2.7, 0.15, 11.6], c: hex(0x8a9095) });
      r.add(P.gY, { o: [0, 2.05, 0], s: [2.97, 0.45, 10.6] });
      if (k === 0) {
        r.add(P.gW, { o: [-0.9, 1.0, 6.02], s: [0.4, 0.25, 0.05] });
        r.add(P.gW, { o: [0.9, 1.0, 6.02], s: [0.4, 0.25, 0.05] });
        r.add(P.box, { o: [0, 2.9, 6.01], s: [1.6, 0.35, 0.03], c: hex(0x0057a8) });
      }
      this.train.push(r);
    }
    this.trainWindows = this.train.map((r) => r.parts[4]);
  };

  // Tileable wave normals: a sum of sines with integer frequencies in many directions (no visible grid),
  // plus a foam mask in the blue channel.
  function waterNormals(scene) {
    const S = 256;
    const t = new B.DynamicTexture('waterN', { width: S, height: S }, scene, true);
    const c = t.getContext();
    const img = c.createImageData(S, S);
    const R = CB.rng(4242), waves = [];
    while (waves.length < 30) {
      const fx = R.int(-16, 16), fy = R.int(-16, 16), f = Math.hypot(fx, fy);
      if (f < 2.5 || f > 16.5) continue;
      waves.push({ fx: fx * Math.PI * 2, fy: fy * Math.PI * 2, a: 1 / Math.pow(f, 1.6), ph: R() * Math.PI * 2 });
    }
    const gx = new Float32Array(S * S), gy = new Float32Array(S * S), hh = new Float32Array(S * S);
    let ss = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        let ax = 0, ay = 0, h = 0;
        for (const w of waves) {
          const g = w.fx * u + w.fy * v + w.ph;
          const cs = Math.cos(g) * w.a;
          ax += cs * w.fx; ay += cs * w.fy; h += Math.sin(g) * w.a;
        }
        const i = y * S + x;
        gx[i] = ax; gy[i] = ay; hh[i] = h; ss += ax * ax + ay * ay;
      }
    }
    const k = 0.42 / Math.sqrt(ss / (S * S));
    let hmin = 1e9, hmax = -1e9;
    for (let i = 0; i < S * S; i++) { hmin = Math.min(hmin, hh[i]); hmax = Math.max(hmax, hh[i]); }
    for (let i = 0; i < S * S; i++) {
      let nx = -gx[i] * k, ny = -gy[i] * k, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l;
      img.data[i * 4] = (nx * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i * 4 + 2] = (hh[i] - hmin) / (hmax - hmin) * 255; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    t.update();
    t.wrapU = t.wrapV = B.Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 4;
    return t;
  }

  // Position on the rectangular L loop at distance s.
  function loopPos(s) {
    const L = CB.City.loop, side = L.hi - L.lo, off = 1.4;
    s = ((s % (side * 4)) + side * 4) % (side * 4);
    const e = Math.floor(s / side), t = s - e * side;
    switch (e) {
      case 0: return { x: L.lo + t, z: L.lo - off };
      case 1: return { x: L.hi + off, z: L.lo + t };
      case 2: return { x: L.hi - t, z: L.hi + off };
      default: return { x: L.lo - off, z: L.hi - t };
    }
  }

  LM.update = function (dt, game, focusX, focusZ) {
    const P = CB.Pools, F = CB.City.ferris;
    // Ferris wheel
    this.wheelRoot.rotation.z += dt * 0.06;
    const rot = this.wheelRoot.rotation.z;
    for (const g of this.gondolas) {
      const a = g.a + rot;
      const x = F.x + Math.cos(a) * F.r, y = F.y + C.CURB + Math.sin(a) * F.r - 1.6;
      CB.placeSlot(P.box, g.s, x, y, F.z, 1.6, 1.8, 2.4);
      CB.placeSlot(P.box, g.roof, x, y + 1.0, F.z, 1.9, 0.2, 2.7);
    }
    const n = game.night;
    this.bulbMat.emissiveColor.set(1 * (0.35 + n * 0.65), 0.4 * (0.35 + n * 0.65), 0.75 * (0.35 + n * 0.65));
    // L train
    this.trainS += dt * 15;
    const L = CB.City.loop;
    let nearest = 1e9;
    for (let k = 0; k < this.train.length; k++) {
      const s = this.trainS - k * 12.6;
      const p = loopPos(s), a = loopPos(s + 5), b = loopPos(s - 5);
      const r = this.train[k];
      r.x = p.x; r.z = p.z; r.y = L.y; r.yaw = Math.atan2(a.x - b.x, a.z - b.z);
      this.trainWindows[k].vis = n > 0.25;
      r.update();
      nearest = Math.min(nearest, M.dist(p.x, p.z, focusX, focusZ));
    }
    CB.Audio.loop('train', Math.max(0, 1 - nearest / 90) * 0.35);
    // tour boats: cruise along the river, turn around at the ends
    for (const boat of this.boats) {
      boat.x += boat.dir * dt * 5;
      if (boat.x > boat.x1) boat.dir = -1; else if (boat.x < boat.x0) boat.dir = 1;
      const r = boat.r;
      r.x = boat.x; boat.z = M.damp(boat.z, boat.zc - boat.dir * 4.5, 0.5, dt); r.z = boat.z; r.y = CB.City.waterY + Math.sin(game.time * 1.3 + boat.lane) * 0.05;
      r.yaw = M.turn(r.yaw, boat.dir > 0 ? Math.PI / 2 : -Math.PI / 2, dt * 0.6);
      r.roll = Math.sin(game.time * 0.9 + boat.lane) * 0.02;
      boat.win.vis = n > 0.25;
      if (M.dist2(boat.x, boat.z, focusX, focusZ) < 400 * 400) r.update();
    }
    // water
    this.waterT = (this.waterT || 0) + dt;
    this.updateWater(dt, game);
    // refresh reflections now and then when near
    this.probeT -= dt;
    if (this.probeT <= 0) {
      this.probeT = 2.5;
      this.probe.cubeTexture.resetRefreshCounter();
    }
  };

  // Sky / fog uniforms for the water and the planar mirror (High quality only).
  LM.updateWater = function (dt, game) {
    const sk = game.sky, scene = this.water.getScene(), cam = scene.activeCamera;
    if (!sk || !cam) return;
    const top = new B.Color3(sk.top[0], sk.top[1], sk.top[2]), hor = new B.Color3(sk.hor[0], sk.hor[1], sk.hor[2]);
    const sd = new B.Vector3(sk.sun[0], sk.sun[1], sk.sun[2]), sc = new B.Color3(sk.sunCol[0], sk.sunCol[1], sk.sunCol[2]);
    const fog = new B.Vector2(scene.fogStart, scene.fogEnd);
    // mirror only when water is close enough to matter
    let near = false;
    if (this.mirror) {
      const p = cam.position, City = CB.City;
      const d = waterDist(p.x, p.z);
      // only while some water surface is close and actually inside the view
      if (d < 320 + Math.max(0, p.y) * 3) {
        const planes = B.Frustum.GetPlanes(scene.getTransformMatrix());
        near = this.water.isInFrustum(planes) && d < 900 || this.riverMeshes.some((m) => m.isInFrustum(planes));
      }
      const rts = scene.customRenderTargets, i = rts.indexOf(this.mirror);
      if (near && i < 0) { rts.push(this.mirror); this.mirrorT = 0; } else if (!near && i >= 0) rts.splice(i, 1);
      this.mirrorT -= dt;
      if (near && this.mirrorT <= 0) {
        // buildings close to the water (and tall glass towers further back) can show up in it
        this.mirrorT = 0.5;
        const rl = this.mirror.renderList; rl.length = 0;
        for (const c of City.chunkMeshes) {
          if (c.kind === 'interior' || !c.mesh.isEnabled()) continue;
          if (c.wd == null) c.wd = waterDist(c.x, c.z);
          const dc = M.dist(c.x, c.z, p.x, p.z);
          if (dc < 650 && (c.wd < 190 || (c.kind === 'glass' && dc < 800))) rl.push(c.mesh);
        }
        for (const m of [City.signMesh, this.wheel, this.bulbs, this.bean]) if (m) rl.push(m);
      }
    }
    for (const m of this.waterMats) {
      m.setVector3('camPos', cam.position);
      m.setVector3('sunDir', sd); m.setColor3('sunColor', sc);
      m.setColor3('topColor', top); m.setColor3('horizonColor', hor);
      m.setColor3('fogColor', scene.fogColor); m.setVector2('fogInfo', fog);
      m.setFloat('time', this.waterT); m.setFloat('night', game.night);
      m.setFloat('mirrorK', near ? 0.92 : 0);
    }
  };

  // Distance from (x, z) to the nearest water (lake or river).
  function waterDist(x, z) {
    let d = Math.max(0, C.SHORE - x);
    for (const r of CB.City.rivers) d = Math.min(d, Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)));
    return d;
  }

  // Planar reflections of the skyline in the lake and river (High quality).
  LM.setMirror = function (on) {
    const scene = this.water.getScene();
    if (this.mirror) {
      const i = scene.customRenderTargets.indexOf(this.mirror);
      if (i >= 0) scene.customRenderTargets.splice(i, 1);
      this.mirror.dispose(); this.mirror = null;
      for (const m of this.waterMats) m.setTexture('mirrorTex', this.blankTex);
    }
    if (!on) return;
    const mt = new B.MirrorTexture('waterMirror', { ratio: 0.5 }, scene, false);
    mt.mirrorPlane = B.Plane.FromPositionAndNormal(new B.Vector3(0, CB.City.waterY, 0), new B.Vector3(0, -1, 0));
    mt.clearColor = new B.Color4(0, 0, 0, 0);
    mt.refreshRate = 2; // every other frame: unnoticeable on moving water, half the cost
    this.mirror = mt; this.mirrorT = 0;
    for (const m of this.waterMats) m.setTexture('mirrorTex', mt);
  };

  LM.setProbeList = function (meshes) {
    const rl = this.probe.renderList;
    rl.length = 0;
    for (const m of meshes) rl.push(m);
  };
})(window.CB);

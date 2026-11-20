// Chicago Bois – main game: engine + scene setup, day/night, player, camera, cars, game flow and menus.
// The other systems live in js/ (city, characters, vehicles, police, activities, hud, audio, effects).
'use strict';
(function () {
  const B = BABYLON, M = CB.M, C = CB.C;
  const $ = (id) => document.getElementById(id);
  const canvas = $('renderCanvas');

  const game = CB.game = {
    state: 'loading', time: 0, elapsed: 0, cash: 0, score: 0, crimeT: -99, keys: {},
    camYaw: -Math.PI / 2, camPitch: 0.3, night: 0, dayT: 0.66, menuT: 0,
    obstacles: [], escapes: 0, maxStars: 0, query: null, radioOn: true,
    get wanted() { return CB.Police.wanted; },
  };
  let engine, scene, camera, sun, hemi, shadowGen = null, glow = null, skyMat, skyMesh;
  let pl; // player
  const tmpV = new B.Vector3();

  // =================================================================== boot
  function setLoad(text, f) { $('loadText').textContent = text; $('loadFill').style.width = (f * 100) + '%'; }
  function later(fn) { return new Promise((res) => setTimeout(() => { fn(); res(); }, 16)); }

  async function boot() {
    try {
      engine = new B.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', audioEngine: false }, false);
    } catch (e) { engine = null; }
    if (!engine || !engine._gl) { $('loading').classList.add('hidden'); $('noWebgl').classList.remove('hidden'); return; }
    game.engine = engine;
    scene = game.scene = new B.Scene(engine);
    scene.clearColor = new B.Color4(0.02, 0.03, 0.06, 1);
    scene.skipPointerMovePicking = true;
    scene.constantlyUpdateMeshUnderPointer = false;
    scene.blockMaterialDirtyMechanism = false;
    // wait (briefly) for the sign font so neon signs use it
    try { await Promise.race([document.fonts.load('40px Anton'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* ignore */ }
    setLoad('Pouring concrete…', 0.1);
    await later(() => CB.Pools.init(scene));
    setLoad('Raising skyscrapers…', 0.25);
    await later(() => CB.City.build(scene, CB.Pools));
    setLoad('Opening shops and neon signs…', 0.55);
    await later(() => { CB.Activities.init(scene); CB.Pools.finishStatic(); });
    setLoad('Starting the L train…', 0.7);
    await later(() => { CB.FX.init(scene); CB.Police.init(scene); CB.Landmarks.init(scene); CB.HUD.init(); setupWorld(); });
    setLoad('Hitting the streets…', 0.85);
    await later(() => {
      makePlayer();
      CB.Traffic.init(counts().traffic);
      CB.Peds.init(counts().peds);
      bindUI();
      applySettings();
    });
    setLoad('Ready', 1);
    await later(() => {
      $('loading').classList.add('hidden');
      showScreen('menu');
      game.state = 'menu';
      engine.runRenderLoop(frame);
    });
  }

  function counts() {
    const q = CB.settings.quality;
    return q === 'low' ? { peds: 24, traffic: 16 } : q === 'high' ? { peds: 46, traffic: 30 } : { peds: 36, traffic: 24 };
  }

  // =================================================================== world: sky, lights, camera
  B.Effect.ShadersStore.cbSkyVertexShader = `
    precision highp float;
    attribute vec3 position;
    uniform mat4 worldViewProjection;
    varying vec3 vPos;
    void main() { vPos = position; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
  B.Effect.ShadersStore.cbSkyFragmentShader = `
    precision highp float;
    varying vec3 vPos;
    uniform vec3 topColor, horizonColor, sunDir, sunColor;
    uniform float night, time;
    float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { float v = 0.0, a = 0.52; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
    void main() {
      vec3 d = normalize(vPos);
      float h = d.y;
      vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.5));
      if (h < 0.0) col = horizonColor;
      vec3 sd3 = normalize(sunDir);
      float sd = max(dot(d, sd3), 0.0);
      float day = 1.0 - night;
      col += sunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 10.0) * 0.28) * day;
      // stars and moon (behind the clouds)
      if (night > 0.0 && h > 0.0) {
        vec3 p = floor(d * 280.0);
        float s = hash(p);
        if (s > 0.996) col += vec3(1.0) * night * (s - 0.996) * 220.0 * clamp(h * 4.0, 0.0, 1.0);
        float md = max(dot(d, -sd3), 0.0);
        col += vec3(0.9, 0.92, 1.0) * (pow(md, 2200.0) * 3.0 + pow(md, 40.0) * 0.08) * night;
      }
      // clouds: fbm on a flat layer, self-shadowed toward the sun
      if (h > 0.01) {
        vec2 uv = d.xz / (h + 0.12) * 1.25 + vec2(time * 0.006, time * 0.0025);
        float n = fbm(uv);
        float c = smoothstep(0.5, 0.78, n) * smoothstep(0.01, 0.22, h);
        if (c > 0.001) {
          float n2 = fbm(uv + sd3.xz * 0.22);
          float lit = clamp(0.62 + (n - n2) * 3.2, 0.18, 1.0);
          float dusk = clamp(1.0 - abs(sd3.y - 0.05) / 0.3, 0.0, 1.0);
          vec3 litCol = mix(vec3(1.0, 0.99, 0.97), sunColor * vec3(1.05, 0.8, 0.72), 0.25 + dusk * 0.6);
          vec3 shadeCol = mix(horizonColor, topColor, 0.45) * mix(0.82, 0.6, dusk);
          vec3 cc = mix(shadeCol, litCol, lit) * day + vec3(0.07, 0.08, 0.11) * night * (0.6 + 0.4 * lit);
          cc += sunColor * pow(sd, 6.0) * (1.0 - smoothstep(0.55, 0.95, n)) * 0.55 * day; // silver lining
          col = mix(col, cc, c * 0.9);
        }
      }
      gl_FragColor = vec4(col, 1.0);
    }`;

  function setupWorld() {
    // sky dome
    skyMesh = B.MeshBuilder.CreateSphere('sky', { diameter: 3000, segments: 24, sideOrientation: B.Mesh.BACKSIDE }, scene);
    skyMat = new B.ShaderMaterial('skyMat', scene, 'cbSky', {
      attributes: ['position'], uniforms: ['worldViewProjection', 'topColor', 'horizonColor', 'sunDir', 'sunColor', 'night', 'time'],
    });
    skyMat.backFaceCulling = false;
    skyMesh.material = skyMat;
    skyMesh.infiniteDistance = true;
    skyMesh.isPickable = false;
    skyMesh.applyFog = false;

    hemi = new B.HemisphericLight('hemi', new B.Vector3(0.2, 1, 0.1), scene);
    sun = new B.DirectionalLight('sun', new B.Vector3(-0.5, -1, -0.3), scene);
    sun.position = new B.Vector3(0, 200, 0);
    sun.autoCalcShadowZBounds = false;
    sun.shadowMinZ = 1; sun.shadowMaxZ = 520;
    sun.shadowFrustumSize = 190;

    camera = new B.UniversalCamera('cam', new B.Vector3(400, 60, 0), scene);
    camera.inputs.clear();
    camera.minZ = 0.3; camera.maxZ = 3000; camera.fov = 0.95;
    scene.activeCamera = camera;

    scene.fogMode = B.Scene.FOGMODE_LINEAR;
    scene.fogStart = 140; scene.fogEnd = 650;

    const ip = scene.imageProcessingConfiguration;
    ip.contrast = 1.12; ip.exposure = 1.05;
    ip.vignetteEnabled = true; ip.vignetteWeight = 1.6; ip.vignetteColor = new B.Color4(0, 0, 0, 0);
    ip.colorCurvesEnabled = true;
    ip.colorCurves = new B.ColorCurves();
    ip.colorCurves.globalSaturation = 28;

    // reflection probe content
    // (glass is left out: it samples this probe itself)
    const near = CB.City.chunkMeshes.filter((c) => c.kind !== 'glass' && M.dist(c.x, c.z, CB.City.bean.x, CB.City.bean.z) < 260).map((c) => c.mesh);
    CB.Landmarks.setProbeList([skyMesh, CB.City.ground].concat(near));

    // receivers
    for (const m of CB.Pools.receivers) m.receiveShadows = true;
    for (const c of CB.City.chunkMeshes) c.mesh.receiveShadows = true;
  }

  let pipeline = null;
  function applyQuality() {
    const q = CB.settings.quality;
    engine.setHardwareScalingLevel(q === 'low' ? 1.5 : q === 'high' ? 1 / Math.min(window.devicePixelRatio || 1, 1.5) : 1);
    // shadows: one large map that follows the player (4096 px over 320 m on High, 2048 px over 210 m on Medium).
    // Poisson filtering is used because depth-compare (PCF) maps fail on some drivers.
    if (shadowGen) { shadowGen.dispose(); shadowGen = null; }
    if (q !== 'low') {
      sun.shadowFrustumSize = q === 'high' ? 320 : 210;
      shadowGen = new B.ShadowGenerator(q === 'high' ? 4096 : 2048, sun);
      shadowGen.usePoissonSampling = true;
      shadowGen.bias = 0.0007; shadowGen.normalBias = 0.02;
      shadowGen.setDarkness(0.12);
      casterT = 0;
    }
    // glow
    if (glow) { glow.dispose(); glow = null; }
    if (q !== 'low') {
      glow = new B.GlowLayer('glow', scene, { mainTextureRatio: q === 'high' ? 0.5 : 0.35, blurKernelSize: 28 });
      // Everything is drawn into the glow pass so buildings hide lights behind them,
      // but only the light meshes actually glow (the rest is drawn black).
      const inc = new Set(CB.Pools.glowMeshes.concat([CB.City.signMesh, CB.Landmarks.bulbs], CB.Activities.glowMeshes).filter(Boolean));
      const sign = CB.City.signMesh;
      glow.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
        if (mesh === sign) result.set(0.8, 0.8, 0.8, 1);
        else if (inc.has(mesh) && material.emissiveColor) result.set(material.emissiveColor.r, material.emissiveColor.g, material.emissiveColor.b, 1);
        else result.set(0, 0, 0, 1);
      };
      for (const m of [skyMesh, CB.Landmarks.water, CB.City.aoMesh, CB.City.ground].concat(CB.Landmarks.riverMeshes)) if (m) glow.addExcludedMesh(m);
      for (const p of [CB.Pools.headPool, CB.Pools.sirenPool, CB.Pools.ringRed, CB.Pools.ringGreen, CB.Pools.ringYellow]) glow.addExcludedMesh(p.mesh);
      for (const m of CB.Pools.sLampPool.meshes.concat(CB.Pools.sNeonPool.meshes)) glow.addExcludedMesh(m);
      // small non-glowing props don't need to block glow
      for (const p of [CB.Pools.box, CB.Pools.cyl, CB.Pools.sph]) glow.addExcludedMesh(p.mesh);
      for (const p of [CB.Pools.sCyl, CB.Pools.sSph, CB.Pools.sCone]) for (const m of p.meshes) glow.addExcludedMesh(m);
    }
    // post-processing on High: MSAA, bloom on bright sky / neon, gentle sharpening
    if (pipeline) { pipeline.dispose(); pipeline = null; }
    if (q === 'high') {
      try {
        pipeline = new B.DefaultRenderingPipeline('pipe', true, scene, [camera]);
        pipeline.samples = 4;
        pipeline.fxaaEnabled = false;
        pipeline.bloomEnabled = true;
        pipeline.bloomThreshold = 0.78; pipeline.bloomWeight = 0.32; pipeline.bloomKernel = 64; pipeline.bloomScale = 0.5;
        pipeline.sharpenEnabled = true; pipeline.sharpen.edgeAmount = 0.2;
        pipeline.imageProcessingEnabled = true;
      } catch (e) { pipeline = null; }
    }
    CB.Landmarks.setMirror(q === 'high');
    const far = q === 'low' ? 420 : q === 'high' ? 820 : 600;
    game.fogBase = { start: far * 0.3, end: far * 1.08, view: far + 150 };
    scene.fogEnd = far * 1.08; scene.fogStart = far * 0.3;
    // filmic (ACES) tone mapping on High, where image processing runs as a post-process for everything
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = !!pipeline;
    ip.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.contrast = pipeline ? 1.0 : 1.12;
    game.baseExposure = pipeline ? 1.42 : 1.05;
    game.viewDist = far + 150;
    camera.maxZ = 3000;
  }

  // Keep only nearby building chunks drawn and in the shadow map (the city is big; fog hides the rest).
  let casterT = 0;
  function updateCasters(dt, fx, fz) {
    casterT -= dt;
    if (casterT > 0) return;
    casterT = 0.5;
    const cx = camera.position.x, cz = camera.position.z;
    const vd = game.viewDist || 700;
    // interiors only matter up close (you see them through doors)
    for (const c of CB.City.chunkMeshes) c.mesh.setEnabled(M.dist(c.x, c.z, cx, cz) < (c.kind === 'interior' ? 210 : vd));
    for (const m of CB.Pools.staticMeshes) m.setEnabled(M.dist(m.cellX, m.cellZ, cx, cz) < vd);
    if (!shadowGen) return;
    const rl = shadowGen.getShadowMap().renderList;
    rl.length = 0;
    for (const m of CB.Pools.casters) rl.push(m);
    for (const m of CB.Pools.staticCasters) if (M.dist(m.cellX, m.cellZ, fx, fz) < (CB.settings.quality === 'high' ? 360 : 300)) rl.push(m);
    const reach = CB.settings.quality === 'high' ? 330 : 240;
    for (const c of CB.City.chunkMeshes) if (M.dist(c.x, c.z, fx, fz) < (c.kind === 'interior' ? 140 : reach)) rl.push(c.mesh);
    rl.push(CB.Landmarks.bean, CB.Landmarks.wheel);
  }

  // Drop the graphics quality one step if the frame rate stays low (only if the player never chose it).
  function autoQuality(dt) {
    const S = CB.settings;
    if (!S.autoQuality || S.quality === 'low' || game.state !== 'playing') return;
    game.fpsT = (game.fpsT || 0) + dt;
    if (game.fpsT < 3) return; // let things settle
    game.fpsN = (game.fpsN || 0) + 1; game.fpsSum = (game.fpsSum || 0) + engine.getFps();
    if (game.fpsT < 9) return;
    const avg = game.fpsSum / game.fpsN;
    game.fpsT = 0; game.fpsN = 0; game.fpsSum = 0;
    if (avg >= 32) return;
    S.quality = S.quality === 'high' ? 'medium' : 'low';
    CB.saveSettings();
    applyQuality();
    CB.HUD.notify('⚙ Graphics set to ' + S.quality.toUpperCase(), 'For a smoother frame rate – change it in Settings.', 'yellow');
  }

  // =================================================================== day / night
  const COL = {
    dayTop: [0.25, 0.5, 0.86], dayHor: [0.68, 0.83, 0.96],
    duskTop: [0.2, 0.25, 0.5], duskHor: [1.0, 0.56, 0.32],
    nightTop: [0.015, 0.03, 0.08], nightHor: [0.07, 0.1, 0.18],
  };
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function updateSky(dt, fx, fz) {
    const len = CB.settings.dayLength;
    if (len > 0) game.dayT = (game.dayT + dt / (len * 60)) % 1;
    else game.dayT = 0.02;
    const a = (game.dayT - 0.25) * Math.PI * 2;
    const sx = Math.cos(a), sy = Math.sin(a), sz = 0.35;
    const sl = Math.hypot(sx, sy, sz);
    const sun3 = [sx / sl, sy / sl, sz / sl];
    const day = M.smoothstep(-0.1, 0.35, sy);
    const dusk = Math.max(0, 1 - Math.abs(sy - 0.02) / 0.28);
    const night = 1 - M.smoothstep(-0.16, 0.1, sy);
    game.night = night;
    let top = mix3(COL.nightTop, COL.dayTop, day), hor = mix3(COL.nightHor, COL.dayHor, day);
    top = mix3(top, COL.duskTop, dusk * 0.5); hor = mix3(hor, COL.duskHor, dusk * 0.7);
    skyMat.setColor3('topColor', new B.Color3(top[0], top[1], top[2]));
    skyMat.setColor3('horizonColor', new B.Color3(hor[0], hor[1], hor[2]));
    skyMat.setVector3('sunDir', new B.Vector3(sun3[0], sun3[1], sun3[2]));
    const sc = mix3([1, 0.52, 0.24], [1, 0.95, 0.86], M.smoothstep(0.02, 0.62, sy));
    skyMat.setColor3('sunColor', new B.Color3(sc[0], sc[1], sc[2]));
    skyMat.setFloat('night', night);
    skyMat.setFloat('time', game.time);
    game.sky = { top, hor, sun: sun3, sunCol: sc };
    // less haze (and a longer draw distance) the higher the camera is: street level keeps its
    // atmosphere, the menu fly-over and aerial views see across the city
    if (game.fogBase && camera) {
      const k = 1 + M.clamp((camera.position.y - 14) / 90, 0, 1.6);
      scene.fogStart = game.fogBase.start * k; scene.fogEnd = game.fogBase.end * k;
      game.viewDist = game.fogBase.view * k;
    }
    scene.fogColor = new B.Color3(hor[0], hor[1], hor[2]);
    scene.clearColor.set(hor[0], hor[1], hor[2], 1);
    // sun or moon light
    if (sy > -0.06) {
      sun.direction.set(-sun3[0], -Math.max(0.12, sun3[1]), -sun3[2]);
      sun.intensity = 1.45 * M.smoothstep(-0.07, 0.16, sy);
      sun.diffuse.set(sc[0], sc[1] * 0.97, sc[2] * 0.92);
    } else {
      sun.direction.set(sun3[0], -Math.max(0.3, -sun3[1]), sun3[2]);
      sun.intensity = 0.32 * M.smoothstep(-0.06, -0.3, sy);
      sun.diffuse.set(0.55, 0.65, 1);
    }
    sun.specular.copyFrom(sun.diffuse);
    // sky light: blue-grey moonlit city at night (with warm street-light bounce from below), warm at dusk
    hemi.intensity = 0.34 + 0.42 * day;
    hemi.diffuse.set(M.lerp(0.42, 1, day) + dusk * 0.12, M.lerp(0.48, 0.98, day) - dusk * 0.04, M.lerp(0.78, 0.95, day) - dusk * 0.14);
    hemi.groundColor.set(M.lerp(0.26, 0.38, day), M.lerp(0.19, 0.36, day), M.lerp(0.16, 0.34, day));
    // shadow follows the focus point
    sun.position.set(fx - sun.direction.x * 220, -sun.direction.y * 220, fz - sun.direction.z * 220);
    if (shadowGen) shadowGen.setDarkness(M.lerp(0.12, 0.6, night));
    // emissive stuff
    const City = CB.City, P = CB.Pools;
    const wn = night * 0.95;
    // (emissive textures are added on top of the emissive colour, so their level is the dimmer)
    for (const k of ['office', 'brick', 'stone', 'glass']) City.mats[k].emissiveTexture.level = wn;
    City.mats.sign.emissiveTexture.level = 0.75 + 0.45 * night;
    City.mats.sign.emissiveColor.set(0, 0, 0);
    P.matLamp.emissiveColor.set(M.lerp(0.35, 1, night), M.lerp(0.34, 0.88, night), M.lerp(0.32, 0.62, night));
    const cn = 0.25 + 0.4 * night;
    P.matCrown.emissiveColor.set(0.55 * cn, 0.8 * cn, 1 * cn);
    P.matCrown2.emissiveColor.set(1 * cn, 0.72 * cn, 0.35 * cn);
    P.matLampPool.emissiveColor.set(0.95 * night * 0.6, 0.75 * night * 0.6, 0.45 * night * 0.6);
    const nk = 0.08 + night * 0.42;
    P.matNeonPool.emissiveColor.set(nk, nk, nk);
    P.matHeadPool.emissiveColor.set(0.9 * night * 0.5, 0.85 * night * 0.5, 0.7 * night * 0.5);
    P.matSirenPool.alpha = 0.99;
    if (glow) glow.intensity = 0.55 + night * 0.55;
    // colour grade: warm highlights at golden hour, cool shadows at night
    const ipc = scene.imageProcessingConfiguration, cc = ipc.colorCurves;
    ipc.exposure = (game.baseExposure || 1.05) * (1 + night * 0.22);
    if (cc) {
      cc.highlightsHue = 38; cc.highlightsDensity = Math.round(dusk * 45 + day * 6);
      cc.shadowsHue = 225; cc.shadowsDensity = Math.round(night * 40 + 8);
      cc.globalSaturation = Math.round(26 + dusk * 14 - night * 8);
    }
  }

  // =================================================================== player
  function makePlayer() {
    const h = new CB.Human(CB.playerLook(0));
    h.onStep = (run) => { if (!pl.inCar) CB.Audio.play('step', run ? 0.9 : 0.55); };
    h.addWeapons();
    pl = game.player = {
      human: h, x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, health: 100,
      inCar: false, car: null, hidden: false, hideIt: null, hideSpot: null, pose: null, poseT: 0,
      stunT: 0, downT: 0, disguiseT: 0, look: 0, lastHurt: -99, grounded: true, dead: false, inCover: false, sprinting: false, viewYaw: 0,
    };
    resetPlayer();
  }
  function resetPlayer() {
    const s = CB.City.playerSpawn;
    Object.assign(pl, { x: s.x, z: s.z, y: C.CURB, vx: 0, vz: 0, vy: 0, yaw: s.yaw, health: 100, inCar: false, car: null, hidden: false, hideIt: null, hideSpot: null,
      pose: null, poseT: 0, stunT: 0, downT: 0, disguiseT: 0, look: 0, dead: false, lastHurt: -99, swingT: 0,
      ammo: GUN.mag, fireT: 0, reloadT: 0, aiming: false });
    setWeapon('bat', true);
    pl.human.recolor(CB.playerLook(0));
    pl.human.setVisible(true);
    game.camYaw = s.yaw; game.camPitch = 0.28;
  }

  function updatePlayerFoot(dt) {
    const k = game.keys;
    const City = CB.City;
    pl.stunT = Math.max(0, pl.stunT - dt);
    pl.poseT = Math.max(0, pl.poseT - dt);
    if (pl.hidden) { pl.human.setVisible(false); pl.human.rig.update(); return; }
    let ix = 0, iz = 0;
    const busy = CB.Activities.hold || CB.Activities.pick || pl.dead;
    if (!busy && pl.downT <= 0) {
      if (k.KeyW || k.ArrowUp) iz += 1;
      if (k.KeyS || k.ArrowDown) iz -= 1;
      if (k.KeyA || k.ArrowLeft) ix -= 1;
      if (k.KeyD || k.ArrowRight) ix += 1;
    }
    if (CB.Activities.pick && (ix || iz)) CB.Activities.cancelPick();
    const il = Math.hypot(ix, iz);
    const cy = Math.cos(game.camYaw), sy = Math.sin(game.camYaw);
    let wx = 0, wz = 0;
    if (il > 0) { ix /= il; iz /= il; wx = sy * iz + cy * ix; wz = cy * iz - sy * ix; }
    pl.sprinting = !!(k.ShiftLeft || k.ShiftRight) && il > 0;
    pl.aiming = !!game.aimHeld && pl.weapon === 'pistol' && !busy && pl.downT <= 0;
    if (pl.aiming) pl.sprinting = false;
    let speed = pl.aiming ? 2.6 : pl.sprinting ? 7.3 : 3.4;
    if (pl.stunT > 0) speed = 1.3;
    if (pl.downT > 0) { pl.downT -= dt; speed = 0; }
    const tvx = wx * speed, tvz = wz * speed;
    const acc = pl.grounded ? 16 : 3;
    pl.vx = M.damp(pl.vx, tvx, acc, dt); pl.vz = M.damp(pl.vz, tvz, acc, dt);
    if (pl.knockV) { pl.vx += pl.knockV.x; pl.vz += pl.knockV.z; pl.knockV = null; }
    const ox = pl.x, oz = pl.z;
    pl.x += pl.vx * dt; pl.z += pl.vz * dt;
    // collisions: buildings, props, cars
    City.resolve(pl, 0.38, pl.y, 0.45);
    CB.Activities.pushOutOfProps(pl, 0.38);
    pushOutOfCars(pl, 0.4);
    // bump through pedestrians (they get nudged aside)
    for (const p of CB.Peds.list) {
      if (p.mode === 'knock' || p.mode === 'fallen') continue;
      const dx = p.x - pl.x, dz = p.z - pl.z, d2 = dx * dx + dz * dz;
      if (d2 > 0.56 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (0.75 - d) * 0.5;
      p.x += dx / d * push; p.z += dz / d * push; pl.x -= dx / d * push; pl.z -= dz / d * push;
    }
    pl.x = M.clamp(pl.x, C.WORLD.x0 + 0.5, C.PIER.x1 - 0.5);
    pl.z = M.clamp(pl.z, C.WORLD.z0 + 0.5, C.WORLD.z1 - 0.5);
    if (City.groundY(pl.x, pl.z) < -1) { pl.x = ox; pl.z = oz; pl.vx = pl.vz = 0; }
    // vertical
    const support = City.supportY(pl.x, pl.z, 0.38, pl.y, 0.45);
    if (pl.grounded && (k.Space) && !busy && pl.downT <= 0 && pl.stunT <= 0) { pl.vy = 6.4; pl.grounded = false; CB.Audio.play('whoosh', 0.3); }
    if (!pl.grounded || pl.y > support + 0.02) {
      pl.vy -= 19 * dt;
      pl.y += pl.vy * dt;
      if (pl.y <= support) { pl.y = support; pl.vy = 0; if (!pl.grounded) CB.Audio.play('step', 0.8); pl.grounded = true; }
      else pl.grounded = false;
    } else { pl.y = M.damp(pl.y, support, 25, dt); pl.vy = 0; pl.grounded = true; }
    // facing
    const hs = Math.hypot(pl.vx, pl.vz);
    if (pl.aiming) { pl.yaw = M.turn(pl.yaw, game.camYaw, dt * 20); pl.pose = 'aim'; pl.poseT = Math.max(pl.poseT, 0.15); }
    else if (hs > 0.3 && pl.poseT <= 0) pl.yaw = M.turn(pl.yaw, Math.atan2(pl.vx, pl.vz), dt * 12);
    // gun timers
    pl.fireT = Math.max(0, pl.fireT - dt);
    if (pl.reloadT > 0) { pl.reloadT -= dt; if (pl.reloadT <= 0) pl.ammo = GUN.mag; }
    if (pl.aiming) { game.aimScareT = (game.aimScareT || 0) - dt; if (game.aimScareT <= 0) { game.aimScareT = 1.5; threaten(true); } }
    // cover (bushes)
    pl.inCover = false;
    for (const cv of City.covers) if (M.dist(cv.x, cv.z, pl.x, pl.z) < cv.r + 0.6) { pl.inCover = true; break; }
    // animation
    // melee swing: the hit lands part-way through the animation
    if (pl.swingT > 0) {
      pl.swingT -= dt;
      pl.human.swingP = 1 - pl.swingT / SWING;
      if (!pl.swingHit && pl.human.swingP > 0.5) { pl.swingHit = true; meleeHit(); }
    }
    let pose = 'walk';
    if (pl.downT > 0) pose = 'fallen';
    else if (pl.poseT > 0 && pl.pose) pose = pl.pose;
    else if (!pl.grounded) pose = 'air';
    const lean = pl.human.animate(dt, hs, pose);
    pl.human.setVisible(true);
    pl.human.place(pl.x, pl.y + (pose === 'fallen' ? 0.18 : 0), pl.z, pl.yaw, pose === 'fallen' ? -Math.PI / 2 : 0, pose === 'fallen' ? 0 : lean);
  }

  function pushOutOfCars(o, r) {
    const lists = [CB.Traffic.cars, CB.Traffic.parked, CB.Police.cars];
    for (const list of lists) for (const c of list) {
      if (Math.abs(c.x - o.x) > 6 || Math.abs(c.z - o.z) > 6) continue;
      if (o.y > c.y + (c.T.van ? 2.2 : 1.4)) continue;
      const d = c.distTo(o.x, o.z);
      if (d >= r) continue;
      // push away from car centre line
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      const dx = o.x - c.x, dz = o.z - c.z;
      const a = M.clamp(dx * fx + dz * fz, -c.L / 2, c.L / 2);
      const px = c.x + fx * a, pz = c.z + fz * a;
      let nx = o.x - px, nz = o.z - pz;
      const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const want = c.W / 2 + r + 0.02;
      const lat = Math.abs(dx * fz - dz * fx);
      if (Math.abs(dx * fx + dz * fz) < c.L / 2) { o.x = px + nx * want; o.z = pz + nz * want; void lat; }
      else { o.x += nx * (r - d); o.z += nz * (r - d); }
    }
  }

  // =================================================================== driving
  function updatePlayerCar(dt) {
    const car = pl.car, k = game.keys;
    let thr = 0, steer = 0;
    if (!pl.dead) {
      if (k.KeyW || k.ArrowUp) thr += 1;
      if (k.KeyS || k.ArrowDown) thr -= 1;
      if (k.KeyA || k.ArrowLeft) steer -= 1;
      if (k.KeyD || k.ArrowRight) steer += 1;
    }
    const hand = !!k.Space;
    car.drive(dt, car.dead ? 0 : thr, steer, hand);
    car.brakeLight = thr < 0 && car.vf > 0.5 || hand;
    pl.x = car.x; pl.z = car.z; pl.y = car.y; pl.yaw = car.h;
    pl.vx = car.vx; pl.vz = car.vz;
    // engine sound: fake gearbox
    const v = Math.abs(car.vf), gearTop = [0, 9, 17, 26, 35, 60];
    let g = 1; while (g < 5 && v > gearTop[g]) g++;
    const lo = gearTop[g - 1], hi = gearTop[g];
    const rpm = 0.15 + 0.85 * M.clamp((v - lo) / (hi - lo), 0, 1);
    CB.Audio.engine(!car.dead, rpm, Math.abs(thr));
    CB.Audio.loop('skid', (car.skid || 0) * 0.12 * (car.y < 0.3 ? 1 : 0));
    CB.FX.setSmoke(car, car.health < 35 ? (car.dead ? 10 : 4) : 0);
    CB.Activities.carVsProps(car, game, true);
  }

  function setupCarCallbacks(car) {
    car.onLand = (airT) => CB.Activities.onLand(car, airT, game);
    car.onCrash = (imp, dmg) => {
      CB.Audio.play('crash', Math.min(1, imp / 18));
      CB.FX.shake(Math.min(0.8, imp / 25));
      CB.FX.burst('sparks', car.x + Math.sin(car.h) * car.L / 2, car.y + 0.6, car.z + Math.cos(car.h) * car.L / 2, 20);
      if (imp > 15) playerHit((imp - 15) * 1.1, 'crash');
      if (car.health <= 0 && !car.dead) wreckCar(car);
    };
  }

  function wreckCar(car) {
    car.dead = true;
    CB.FX.burst('fire', car.x, car.y + 1, car.z, 90);
    CB.FX.burst('smoke', car.x, car.y + 1.5, car.z, 30);
    CB.Audio.play('explode', 1, car.x, car.z, 120);
    CB.FX.shake(0.9);
    for (const p of car.rig.parts) if (p.pool === CB.Pools.shiny) car.rig.color(p, [0.12, 0.11, 0.1]);
    if (pl.car === car) {
      CB.HUD.notify('🔥 Your ride is wrecked!', 'Find another one – fast.', 'red');
      exitCar(true);
      pl.downT = 1.2; playerHit(15, 'explosion');
    }
    CB.FX.setSmoke(car, 6);
  }

  function enterCar(car) {
    if (pl.hidden) return;
    CB.Activities.cancelHold(); CB.Activities.cancelPick();
    if (car.spot) { car.spot.car = null; car.spot = null; }
    const pi = CB.Traffic.parked.indexOf(car);
    if (pi >= 0) { CB.Traffic.parked.splice(pi, 1); CB.Traffic.cars.push(car); }
    pl.inCar = true; pl.car = car;
    car.mode = 'player'; car.setDriver(true); car.stolenByPlayer = true; car.siren = false;
    car.vf = car.vx * Math.sin(car.h) + car.vz * Math.cos(car.h);
    pl.human.setVisible(false); pl.human.rig.update();
    setupCarCallbacks(car);
    CB.Audio.play('door', 0.9);
    if (game.radioOn) { CB.Audio.music(true); CB.Audio.radio(true); }
    if (!game.radioHint) { game.radioHint = true; CB.HUD.notify('📻 CHI-HOUSE 107.5 FM', 'Press R to switch the radio off.', 'silent'); }
  }

  function exitCar(force) {
    const car = pl.car;
    if (!car) return;
    if (!force && car.speed > 7) { CB.HUD.notify('🛑 Slow down first!', '', 'yellow'); return; }
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    const spots = [[-fz, fx], [fz, -fx], [-fx * 1.3, -fz * 1.3], [fx * 1.3, fz * 1.3]];
    let ex = car.x, ez = car.z;
    for (const [sx, sz] of spots) {
      const off = (Math.abs(sx * fz - sz * fx) > 0.5 ? car.W / 2 + 0.9 : car.L / 2 + 0.9);
      const x = car.x + sx * off, z = car.z + sz * off;
      if (CB.City.walkable(x, z)) { ex = x; ez = z; break; }
    }
    pl.x = ex; pl.z = ez; pl.y = CB.City.groundY(ex, ez); pl.vx = pl.vz = 0; pl.vy = 0;
    pl.yaw = car.h;
    car.mode = 'abandoned'; car.setDriver(false); car.onLand = null; car.onCrash = null; car.brakeLight = false; car.steer = 0;
    pl.inCar = false; pl.car = null;
    pl.human.setVisible(true);
    CB.Audio.engine(false); CB.Audio.loop('skid', 0);
    CB.Audio.music(false); CB.Audio.radio(false);
    CB.Audio.play('door', 0.9);
    if (!car.dead) CB.FX.setSmoke(car, 0);
  }

  // Which car can the player use right now?
  function carQuery() {
    let best = null, bd = 3.0;
    const check = (c) => {
      if (c.dead || c === pl.car) return;
      if (Math.abs(c.x - pl.x) > 6 || Math.abs(c.z - pl.z) > 6) return;
      const d = c.distTo(pl.x, pl.z);
      if (d < bd) { bd = d; best = c; }
    };
    CB.Traffic.cars.forEach(check); CB.Traffic.parked.forEach(check); CB.Police.cars.forEach(check);
    if (!best) return null;
    const c = best, T = c.T;
    const q = { car: c, d: bd + 0.3, ok: true };
    if (c.mode === 'abandoned' && c.stolenByPlayer) { q.text = `Get in the ${T.label}`; q.action = 'enter'; return q; }
    if (c.occupied) {
      if (c.isPolice) { q.ok = false; q.text = 'There are cops inside that cruiser!'; return q; }
      if (c.speed > 4) return null;
      const heat = c.special === 'armored' ? 60 : 25;
      q.text = `Carjack the ${T.label} <span class="heat">+${heat}% heat</span>`; q.action = 'jack'; q.heat = heat;
      return q;
    }
    const heat = c.isPolice ? 40 : c.type === 'sports' ? 25 : 10;
    q.text = `Steal the ${T.label} <span class="heat">+${heat}% heat</span>`; q.action = 'steal'; q.heat = heat;
    return q;
  }

  function carAction(q) {
    const c = q.car;
    if (!q.ok) { CB.Audio.play('fail', 0.6); return; }
    if (q.action === 'enter') { enterCar(c); return; }
    if (q.action === 'jack') {
      // pull the driver out: a nearby pedestrian body is reused for the fleeing driver
      const d = c.doorPos();
      const ped = CB.Peds.list.reduce((a, b) => (M.dist2(b.x, b.z, pl.x, pl.z) > M.dist2(a.x, a.z, pl.x, pl.z) ? b : a), CB.Peds.list[0]);
      if (ped) { ped.x = d.x; ped.z = d.z; ped.y = CB.City.groundY(d.x, d.z); ped.mode = 'walk'; ped.knock(-Math.cos(c.h) * 3, Math.sin(c.h) * 3, 3); }
      c.vx = c.vz = 0; c.v = 0;
      CB.Audio.play('punch', 1);
      enterCar(c);
      raiseAlarm(c.x, c.z, c.special === 'armored', 'carjacking');
      if (c.special === 'armored') {
        c.stolen = true; game.armoredT = game.time + 240;
        CB.FX.burst('money', c.x, 2, c.z, 80); CB.Audio.play('cash', 1);
        reward(60, 3000, 'Hijacked the ARMORED TRUCK!', '🚚');
      } else reward(q.heat, 0, `Carjacked a ${c.T.label}`, '🚗');
      return;
    }
    // steal: hotwire it
    const fake = { x: c.x, z: c.z };
    pl.yaw = Math.atan2(c.x - pl.x, c.z - pl.z);
    CB.Activities.startHold(fake, c.isPolice ? 1.0 : 1.5, `Hotwiring the ${c.T.label}…`, 'work', game, {
      start: () => {
        CB.Audio.play('spark', 0.8);
        if (Math.random() < 0.35 && !c.isPolice) {
          CB.Audio.play('alarmCar', 0.9, c.x, c.z, 80);
          raiseAlarm(c.x, c.z, true, 'car alarm');
          CB.HUD.notify('🚨 Car alarm!', 'Someone will call the cops.', 'yellow');
        } else raiseAlarm(c.x, c.z, false, 'car theft');
      },
      tick: (t, dt) => { if (Math.random() < dt * 8) CB.FX.burst('sparks', c.x, 1, c.z, 4); },
      done: () => {
        enterCar(c);
        reward(q.heat, 0, c.isPolice ? 'Stole a POLICE CRUISER!' : `Stole a ${c.T.label}`, '🚗', c.isPolice || c.type === 'sports' ? null : 'steal');
      },
    });
  }

  // =================================================================== car-vs-car / car-vs-people
  function collideCars(a, b) {
    if (Math.abs(a.x - b.x) > 7.5 || Math.abs(a.z - b.z) > 7.5) return 0;
    if (Math.abs(a.y - b.y) > 1.6) return 0;
    const ca = a.circles(), cb = b.circles();
    const ra = ca[3], rb = cb[3];
    let nx = 0, nz = 0, pen = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const dx = ca[i][0] - cb[j][0], dz = ca[i][1] - cb[j][1], d = Math.hypot(dx, dz);
      const p = ra + rb - d;
      if (p > pen && d > 1e-4) { pen = p; nx = dx / d; nz = dz / d; }
    }
    if (pen <= 0) return 0;
    const vrel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
    const imp = Math.max(0, -vrel);
    // kinematic traffic only gets knocked loose by a real hit
    if (b.mode === 'traffic' && imp > 6) { b.mode = 'wreck'; b.vf = b.v; b.fleeT = imp > 9 ? 1.2 : 0; }
    if (b.mode === 'parked' && imp > 1.5) { b.mode = 'wreck'; if (Math.random() < 0.5) CB.Audio.play('alarmCar', 0.7, b.x, b.z, 70); }
    const bKin = b.mode === 'traffic' || b.mode === 'parked';
    const am = a.T.mass, bm = b.T.mass;
    const wa = bKin ? 1 : bm / (am + bm), wb = bKin ? 0 : am / (am + bm);
    a.x += nx * pen * wa; a.z += nz * pen * wa;
    b.x -= nx * pen * wb; b.z -= nz * pen * wb;
    if (vrel < 0) {
      const j = imp * 1.25;
      a.vx += nx * j * wa; a.vz += nz * j * wa;
      b.vx -= nx * j * wb; b.vz -= nz * j * wb;
      if (imp > 5) { a.crash(imp); b.crash(imp); }
    }
    return imp;
  }

  function carVsPeople(car, isPlayer) {
    const sp = car.speed;
    const c = car.circles(), r = c[3] + 0.35;
    const hitList = (list, isCop) => {
      for (const p of list) {
        if (p.mode === 'knock' || Math.abs(p.x - car.x) > 6 || Math.abs(p.z - car.z) > 6) continue;
        for (let k = 0; k < 3; k++) {
          const dx = p.x - c[k][0], dz = p.z - c[k][1], d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (sp > 4.5) {
            p.knock(car.vx * 0.7 + dx / d * 3, car.vz * 0.7 + dz / d * 3, 4 + sp * 0.15);
            car.vx *= 0.96; car.vz *= 0.96;
            if (isPlayer) {
              CB.FX.shake(0.15);
              raiseAlarm(p.x, p.z, false, 'hit and run');
              reward(10, 0, isCop ? 'Bowled over a cop!' : 'Sent a pedestrian flying', '💥', isCop ? 'assault' : 'reckless');
              if (isCop && !CB.Police.hasActive()) CB.Police.startChase(pl, game);
            }
          } else if (d > 1e-3) { p.x = c[k][0] + dx / d * r; p.z = c[k][1] + dz / d * r; }
          break;
        }
      }
    };
    hitList(CB.Peds.list, false);
    hitList(CB.Police.foot, true);
    // the player on foot
    if (!pl.inCar && !pl.hidden && !isPlayer) {
      for (let k = 0; k < 3; k++) {
        const dx = pl.x - c[k][0], dz = pl.z - c[k][1], d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (sp > 5 && pl.downT <= 0) {
          pl.knockV = { x: car.vx * 0.5 + dx / d * 2, z: car.vz * 0.5 + dz / d * 2 };
          pl.vy = 4; pl.grounded = false; pl.downT = 1.3;
          playerHit(M.clamp(sp * 1.8, 6, 35), 'car');
          CB.Audio.play('punch', 1);
        }
        break;
      }
    }
  }

  // =================================================================== game API used by other systems
  function addWanted(h) {
    const P = CB.Police;
    const before = P.wanted, lvlBefore = P.level;
    P.wanted = Math.min(500, P.wanted + h);
    const sb = Math.floor(before / 100), sa = Math.floor(P.wanted / 100);
    if (sa > sb && sa > 0) {
      const stars = '✶'.repeat(sa);
      CB.HUD.banner(stars, sa >= 5 ? 'MAXIMUM HEAT!' : `WANTED LEVEL ${sa}`, 2.4, 'stars');
      CB.Audio.play('star', 1);
      CB.FX.flash('#e4002b', 0.35);
      game.maxStars = Math.max(game.maxStars, sa);
    }
    const la = P.level;
    if (la > lvlBefore) {
      const msg = ['', 'Police are suspicious and will investigate.', 'Police will now chase you on sight.', 'Multiple units are hunting you.',
        'Cops are aggressive – tasers out, cruisers ram!', 'MAXIMUM RESPONSE – the police chopper is coming!'][la];
      CB.HUD.notify(`🚓 Police response ${la}/5`, msg, la >= 4 ? 'red' : 'yellow');
    }
    if (P.wanted >= 500 && game.state === 'playing') win();
  }
  game.addWanted = addWanted;

  function reward(heat, cash, label, icon, kind) {
    if (game.state !== 'playing') return;
    let h = CB.Activities.diminish(kind, heat, game.time);
    let bonus = '';
    if (CB.Police.mode === 'chase') { h *= 1.25; bonus = ' (chase bonus ×1.25)'; }
    game.cash += cash;
    game.score += Math.round(h * 25 + cash * 0.25);
    CB.Activities.stats.crimes++;
    CB.HUD.notify(`${icon || '💥'} ${label}`, `+${Math.round(h)}% heat${cash ? ' · +' + CB.fmtMoney(cash) : ''}${bonus}`, 'green');
    game.crimeT = game.time;
    addWanted(h);
  }
  game.reward = reward;

  function raiseAlarm(x, z, alarm, what) {
    if (game.state !== 'playing') return;
    game.crimeT = game.time;
    CB.Police.crime(x, z, { alarm, cower: true }, game);
    void what;
  }
  game.raiseAlarm = raiseAlarm;

  game.heal = function (n, msg) {
    pl.health = Math.min(100, pl.health + n);
    CB.HUD.notify('❤ ' + msg, '', 'green');
  };

  function playerHit(dmg, kind, sx, sz) {
    if (pl.dead || game.state !== 'playing') return;
    pl.health = Math.max(0, pl.health - dmg);
    pl.lastHurt = game.time;
    CB.FX.flash('#ff0000', Math.min(0.5, 0.15 + dmg / 60));
    if (kind === 'taser') {
      pl.stunT = 0.9; CB.FX.flash('#5aa9ff', 0.4);
      if (pl.hidden) toggleHide(pl.hideIt);
    }
    if (pl.health <= 0) busted('knockout');
    void sx; void sz;
  }
  game.playerHit = playerHit;

  game.disguise = function () {
    pl.look = (pl.look % 4) + 1;
    pl.human.recolor(CB.playerLook(pl.look));
    pl.disguiseT = 150;
    CB.Audio.play('whoosh', 0.8);
    CB.FX.burst('paper', pl.x, 1.2, pl.z, 25);
    const P = CB.Police;
    if (P.mode === 'search' || (P.mode === 'chase' && !P.anySees)) {
      P.mode = 'calm'; P.recog = 0;
      game.onEscape('New outfit – the cops lost your description!');
    } else CB.HUD.notify('👕 New look!', 'Cops will have a harder time recognising you.', 'green');
  };

  function toggleHide(it) {
    if (!it) return;
    if (pl.hidden) {
      const d = it.d;
      const opts = [[d.x + d.w / 2 + 1.0, d.z], [d.x - d.w / 2 - 1.0, d.z], [d.x, d.z + d.d / 2 + 1.0], [d.x, d.z - d.d / 2 - 1.0]];
      const o = opts.find((p) => CB.City.walkable(p[0], p[1])) || opts[0];
      pl.x = o[0]; pl.z = o[1]; pl.y = CB.City.groundY(o[0], o[1]);
      pl.hidden = false; pl.hideIt = null; pl.hideSpot = null;
      pl.human.setVisible(true);
      CB.Audio.play('door', 0.8);
      return;
    }
    const P = CB.Police;
    pl.hidden = true; pl.hideIt = it; pl.hideSpot = it.d;
    pl.vx = pl.vz = 0;
    CB.Audio.play('door', 0.8);
    CB.FX.burst('trash', it.x, 1.6, it.z, 12);
    if (P.anySees) {
      CB.HUD.notify('👀 They saw you climb in!', 'They will check this dumpster…', 'red');
      // the officers will definitely look here
      for (const c of P.foot) c.checked = null;
      game.hideSeen = true;
    } else { game.hideSeen = false; CB.HUD.notify('🙈 Hiding in a dumpster', 'Gross… but nobody can see you.', 'green'); }
  }
  game.toggleHide = toggleHide;

  game.foundHiding = function (cop) {
    if (!pl.hidden) return;
    toggleHide(pl.hideIt);
    CB.HUD.notify('🚨 FOUND YOU!', 'A cop flipped the lid open!', 'red');
    CB.Police.startChase(pl, game);
    pl.yaw = Math.atan2(pl.x - cop.x, pl.z - cop.z);
  };

  game.onEscape = function (msg) {
    game.escapes++;
    game.score += 1000;
    game.cash += 250;
    CB.Audio.play('escape', 1);
    CB.HUD.banner('ESCAPED!', msg || 'You lost the cops  ·  +$250', 2.2, 'cool');
    CB.HUD.notify('😎 You got away!', '+1000 score · +$250', 'green');
  };

  // =================================================================== game flow
  function finalScore(won) {
    return Math.round(game.score + game.cash * 0.2 + (won ? 5000 + Math.max(0, 3000 - game.elapsed * 2) : 0));
  }
  function statsHtml(won) {
    const fs = finalScore(won);
    return `<div class="wide">FINAL SCORE<b>${fs.toLocaleString('en-US')}</b></div>
      <div>TIME SURVIVED<b>${CB.fmtTime(game.elapsed)}</b></div>
      <div>ACTIVITIES COMPLETED<b>${CB.Activities.stats.crimes}</b></div>
      <div>CASH<b>${CB.fmtMoney(game.cash)}</b></div>
      <div>WANTED<b>${Math.floor(CB.Police.wanted)}% · ${'✶'.repeat(Math.floor(CB.Police.wanted / 100)) || '–'}</b></div>
      <div>ESCAPES<b>${game.escapes}</b></div>
      <div>RESULT<b>${won ? 'LEGEND' : 'BUSTED'}</b></div>`;
  }
  function resultPanel(container, before, won) {
    const old = container.querySelector('.eoj-panel'); if (old) old.remove();
    if (!window.EOJ) return;
    const fs = finalScore(won);
    before.before(EOJ.resultPanel({
      game: 'Chicago Bois', board: 'chicago-bois:score', score: fs,
      format: (n) => Math.round(n).toLocaleString('en-US'),
      shareText: won ? `⭐⭐⭐⭐⭐ I hit five wanted stars in Chicago Bois in ${CB.fmtTime(game.elapsed)} with ${fs} points! Can you beat it?`
        : `🚔 I got BUSTED in Chicago Bois with ${Math.floor(CB.Police.wanted)}% heat and ${fs} points. Think you can do better?`,
    }));
  }

  function startGame() {
    CB.Audio.init();
    CB.Audio.music(false); CB.Audio.radio(false);
    if (pl.car) { pl.car.onLand = null; pl.car.onCrash = null; }
    CB.Police.reset(); CB.Activities.reset(); CB.FX.clear();
    resetPlayer();
    const n = counts();
    CB.Traffic.init(n.traffic);
    CB.Peds.init(n.peds);
    Object.assign(game, { time: game.time, elapsed: 0, cash: 50, score: 0, crimeT: -99, escapes: 0, maxStars: 0, dayT: 0.64, armoredT: 0, hideSeen: false });
    game.state = 'playing';
    showScreen(null);
    CB.HUD.show(true);
    CB.HUD.notify('🌆 Welcome to Chicago', 'Rob, race and wreck your way to five stars. Press M for the map.', 'green');
    CB.HUD.banner('CHICAGO BOIS', 'FIVE STARS OR BUST', 2.6);
    lockPointer();
  }

  function busted(reason) {
    if (game.state !== 'playing') return;
    game.state = 'over';
    pl.dead = true;
    CB.Activities.cancelHold(); CB.Activities.cancelPick();
    CB.Audio.engine(false); CB.Audio.loop('siren', 0); CB.Audio.loop('alarm', 0); CB.Audio.loop('spray', 0); CB.Audio.loop('heli', 0); CB.Audio.loop('skid', 0);
    CB.Audio.music(false);
    CB.Audio.play('busted', 1);
    CB.HUD.banner('BUSTED!', '', 1.8, '');
    $('overReason').textContent = reason === 'knockout' ? 'You were knocked out cold and woke up in a cell.' : 'The cops slapped the cuffs on you.';
    $('overStats').innerHTML = statsHtml(false);
    game.overT = game.time;
    setTimeout(() => {
      if (game.state !== 'over') return;
      unlockPointer();
      CB.HUD.show(false);
      showScreen('gameover');
      resultPanel($('gameover'), $('gameover').querySelector('.end-buttons'), false);
    }, 1800);
  }
  game.busted = busted;

  function win() {
    game.state = 'won';
    CB.Activities.cancelHold(); CB.Activities.cancelPick();
    CB.Audio.engine(false); CB.Audio.loop('siren', 0); CB.Audio.loop('alarm', 0); CB.Audio.loop('heli', 0); CB.Audio.loop('skid', 0);
    CB.Audio.play('victory', 1);
    CB.FX.confetti(pl.x, pl.z, 8);
    CB.HUD.banner('✶✶✶✶✶', 'CHICAGO BOIS: YOU MADE IT!', 3, 'stars');
    $('winStats').innerHTML = statsHtml(true);
    setTimeout(() => {
      if (game.state !== 'won') return;
      unlockPointer();
      CB.HUD.show(false);
      showScreen('victory');
      CB.Audio.music(true); CB.Audio.radio(false);
      resultPanel($('victory'), $('victory').querySelector('.end-buttons'), true);
    }, 2600);
  }

  function pause() {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    CB.Audio.engine(false); CB.Audio.loop('siren', 0); CB.Audio.loop('heli', 0); CB.Audio.loop('skid', 0); CB.Audio.loop('spray', 0); CB.Audio.loop('alarm', 0);
    CB.Audio.music(false);
    CB.Activities.cancelHold();
    game.keys = {}; game.aimHeld = false;
    showScreen('pause');
  }
  function resume() {
    if (game.state !== 'paused') return;
    game.state = 'playing';
    showScreen(null);
    if (pl.inCar && game.radioOn) { CB.Audio.music(true); CB.Audio.radio(true); }
    lockPointer();
  }
  function toMenu() {
    game.state = 'menu';
    CB.HUD.show(false);
    CB.HUD.toggleBigMap(false);
    if (pl.inCar) exitCar(true);
    CB.Police.reset(); CB.Activities.reset();
    pl.human.setVisible(false); pl.human.rig.update();
    CB.Audio.engine(false); CB.Audio.loop('siren', 0); CB.Audio.loop('heli', 0);
    CB.Audio.music(true); CB.Audio.radio(false);
    unlockPointer();
    showScreen('menu');
  }

  // =================================================================== screens / UI
  const SCREENS = ['menu', 'controls', 'settings', 'pause', 'gameover', 'victory', 'clickResume'];
  let panelReturn = 'menu';
  function showScreen(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  }
  function lockPointer() {
    try {
      const p = canvas.requestPointerLock && canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { if (game.state === 'playing') showScreen('clickResume'); });
    } catch (e) { /* ignore */ }
    canvas.focus();
  }
  function unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }

  function bindUI() {
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); CB.Audio.init(); CB.Audio.play('blip', 0.5); fn(); });
    click('btnPlay', startGame);
    click('btnControls', () => { panelReturn = 'menu'; showScreen('controls'); });
    click('btnSettings', () => { panelReturn = 'menu'; openSettings(); });
    click('btnResume', resume);
    click('btnPauseControls', () => { panelReturn = 'pause'; showScreen('controls'); });
    click('btnPauseSettings', () => { panelReturn = 'pause'; openSettings(); });
    click('btnRestart', () => { game.state = 'menu'; startGame(); });
    click('btnQuit', toMenu);
    click('btnRetry', startGame);
    click('btnAgain', startGame);
    click('btnOverMenu', toMenu);
    click('btnWinMenu', toMenu);
    for (const b of document.querySelectorAll('.panel .close')) b.addEventListener('click', () => { CB.Audio.play('blip', 0.5); showScreen(panelReturn); });
    $('clickResume').addEventListener('click', () => { showScreen(null); lockPointer(); });

    const S = CB.settings;
    const onSet = (id, key, conv, after) => $(id).addEventListener('input', (e) => {
      const el = e.target;
      S[key] = conv(el.type === 'checkbox' ? el.checked : el.value);
      CB.saveSettings();
      if (after) after();
    });
    onSet('setQuality', 'quality', String, () => { CB.settings.autoQuality = false; CB.saveSettings(); applyQuality(); });
    onSet('setMaster', 'master', Number, () => CB.Audio.applyVolumes());
    onSet('setMusic', 'music', Number, () => CB.Audio.applyVolumes());
    onSet('setSens', 'sens', Number);
    onSet('setInvert', 'invertY', Boolean);
    onSet('setDay', 'dayLength', Number);
    onSet('setFps', 'showFps', Boolean);

    // input
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', (e) => { game.keys[e.code] = false; });
    window.addEventListener('blur', () => { game.keys = {}; game.aimHeld = false; });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || game.state !== 'playing') return;
      const s = 0.0022 * CB.settings.sens;
      game.camYaw += e.movementX * s;
      game.camPitch = M.clamp(game.camPitch + e.movementY * s * (CB.settings.invertY ? -1 : 1), -0.45, 1.15);
      game.mouseIdle = 0;
    });
    canvas.addEventListener('mousedown', (e) => {
      CB.Audio.init();
      if (game.state !== 'playing') return;
      if (document.pointerLockElement !== canvas) { lockPointer(); return; }
      if (e.button === 0) attack();
      if (e.button === 2) game.aimHeld = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) game.aimHeld = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && game.wasLocked && game.state === 'playing') pause();
      game.wasLocked = locked;
    });
    canvas.addEventListener('wheel', (e) => {
      if (game.state !== 'playing' || document.pointerLockElement !== canvas) return;
      e.preventDefault();
      const now = performance.now();
      if (now - (game.wheelT || 0) < 120) return;
      game.wheelT = now;
      cycleWeapon(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    window.addEventListener('resize', () => { engine.resize(); if (CB.HUD.bigOpen) CB.HUD.toggleBigMap(true); });
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
      $('menu').querySelector('.menu-foot').insertAdjacentHTML('afterbegin', '<b style="color:#ffd32a">⚠ This game needs a keyboard and mouse – play it on a computer.</b><br>');
    }
    // start menu music on the first gesture
    const first = () => { CB.Audio.init(); if (game.state === 'menu') CB.Audio.music(true); window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); };
    window.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);
  }

  function openSettings() {
    const S = CB.settings;
    $('setQuality').value = S.quality; $('setMaster').value = S.master; $('setMusic').value = S.music;
    $('setSens').value = S.sens; $('setInvert').checked = S.invertY; $('setDay').value = String(S.dayLength); $('setFps').checked = S.showFps;
    showScreen('settings');
  }
  function applySettings() { applyQuality(); CB.Audio.applyVolumes(); }

  function onKey(e) {
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape') {
      if (game.state === 'playing') { if (CB.HUD.bigOpen) CB.HUD.toggleBigMap(false); else pause(); }
      else if (game.state === 'paused') resume();
      else if (!$('controls').classList.contains('hidden') || !$('settings').classList.contains('hidden')) showScreen(panelReturn);
      return;
    }
    if (game.state !== 'playing') { if (e.code === 'Enter' && game.state === 'menu') startGame(); return; }
    const first = !game.keys[e.code];
    game.keys[e.code] = true;
    if (!first) return;
    switch (e.code) {
      case 'KeyE': interact(); break;
      case 'KeyF': attack(); break;
      case 'KeyQ': cycleWeapon(1); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': if (!pl.inCar) setWeapon(WEAPONS[+e.code.slice(5) - 1]); break;
      case 'KeyM': CB.HUD.toggleBigMap(); break;
      case 'KeyH': if (pl.inCar) { CB.Audio.play('honk', 1); CB.Peds.scare(pl.x, pl.z, 12, 'flee'); } break;
      case 'KeyR':
        if (!pl.inCar && pl.weapon === 'pistol') { reload(); break; }
        if (pl.inCar) {
          game.radioOn = !game.radioOn;
          CB.Audio.music(game.radioOn); CB.Audio.radio(game.radioOn);
          CB.HUD.notify(game.radioOn ? '📻 Radio on' : '📻 Radio off', '', 'silent');
        }
        break;
    }
  }

  function interact() {
    if (pl.dead) return;
    const A = CB.Activities;
    if (A.pick) { A.pickPress(game); return; }
    if (A.hold) return;
    if (pl.hidden) { toggleHide(pl.hideIt); return; }
    const q = game.query;
    if (pl.inCar) {
      if (q && q.it && q.it.kind === 'race') { A.interact(q, game); return; }
      exitCar(false);
      return;
    }
    if (!q) return;
    if (q.ped) { if (q.ok) mug(q); return; }
    if (q.car) carAction(q); else if (q.it || q.prop) A.interact(q, game);
  }

  // =================================================================== weapons
  const WEAPONS = ['fists', 'bat', 'crowbar', 'pistol'];
  const GUN = { mag: 12, rate: 0.24, reload: 1.3 };
  const WEAPON_INFO = {
    fists: { icon: '👊', name: 'Fists' }, bat: { icon: '🏏', name: 'Baseball bat' },
    crowbar: { icon: '🔧', name: 'Crowbar' }, pistol: { icon: '🔫', name: 'Pistol' },
  };
  CB.WEAPON_INFO = WEAPON_INFO;
  const SWING = 0.45;
  function setWeapon(w, quiet) {
    if (pl.weapon === w && !quiet) return;
    pl.weapon = w;
    pl.human.setWeapon(w);
    if (!quiet) CB.Audio.play('click', 0.7);
  }
  function cycleWeapon(dir) {
    if (pl.inCar || pl.dead) return;
    const i = WEAPONS.indexOf(pl.weapon);
    setWeapon(WEAPONS[(i + dir + WEAPONS.length) % WEAPONS.length]);
  }
  game.setWeapon = setWeapon;

  // Left click / F: shove, swing or point the gun.
  function attack() {
    if (pl.inCar || pl.hidden || pl.dead || pl.downT > 0 || CB.Activities.hold) return;
    const w = pl.weapon;
    if (w === 'fists') { shove(); return; }
    if (w === 'pistol') { shoot(); return; }
    if (pl.swingT > 0) return;
    pl.swingT = SWING; pl.swingHit = false; pl.human.swingP = 0;
    pl.pose = 'swing'; pl.poseT = SWING;
    CB.Audio.play('whoosh', 0.7);
  }

  // Everything in front of the player within reach of the swing.
  function meleeHit() {
    const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
    const reach = pl.weapon === 'bat' ? 2.5 : 2.2, power = pl.weapon === 'bat' ? 7 : 5;
    const inFront = (x, z, r) => { const dx = x - pl.x, dz = z - pl.z, d = Math.hypot(dx, dz); return d < reach + (r || 0) && (dx * fx + dz * fz) > -0.2 * d; };
    let hit = false;
    for (const c of CB.Police.foot) {
      if (c.mode === 'knock' || c.mode === 'fallen' || !inFront(c.x, c.z)) continue;
      c.knock(fx * power, fz * power, 4); hit = true;
      CB.Police.bust = Math.max(0, CB.Police.bust - 0.5);
      reward(10, 0, 'Clobbered a police officer', '🏏', 'assault');
      CB.Police.startChase(pl, game);
    }
    for (const p of CB.Peds.list) {
      if (p.mode === 'knock' || p.mode === 'fallen' || !inFront(p.x, p.z)) continue;
      p.knock(fx * power, fz * power, 4); hit = true;
      reward(10, 0, 'Bonked a pedestrian', '🏏', 'assault');
      raiseAlarm(pl.x, pl.z, false, 'assault');
    }
    CB.City.nearProps(pl.x, pl.z, reach + 1, (p) => {
      if (p.broken || !inFront(p.x, p.z, p.r)) return;
      CB.Activities.breakProp(p, fx * 4, fz * 4, game, true); hit = true;
    });
    // dent cars (and set off their alarms)
    for (const list of [CB.Traffic.parked, CB.Traffic.cars]) for (const c of list) {
      if (c === pl.car || c.dead || Math.abs(c.x - pl.x) > 6 || Math.abs(c.z - pl.z) > 6) continue;
      const tx = pl.x + fx * 1.2, tz = pl.z + fz * 1.2;
      if (c.distTo(tx, tz) > 0.9) continue;
      c.health = Math.max(5, c.health - 12); hit = true;
      CB.FX.burst('glass', tx, 1.1, tz, 25); CB.Audio.play('glass', 0.8, tx, tz, 50);
      if (c.mode === 'parked' && Math.random() < 0.5) { CB.Audio.play('alarmCar', 0.8, c.x, c.z, 70); raiseAlarm(c.x, c.z, true, 'car alarm'); }
      else raiseAlarm(c.x, c.z, false, 'vandalism');
      if (c.occupied && c.mode === 'traffic') { c.mode = 'wreck'; c.fleeT = 0.6; c.vf = 0; c.vx = c.vz = 0; }
      reward(10, 0, 'Smashed a car window', '💥', 'damage');
      break;
    }
    if (hit) { CB.Audio.play('punch', 1); CB.FX.shake(0.12); }
  }

  // Pistol: point it – people nearby freeze or panic.
  function threaten(fromAim) {
    if (!fromAim) {
      if (pl.poseT > 0 && pl.pose === 'aim') return;
      pl.pose = 'aim'; pl.poseT = 0.9;
      pl.yaw = game.camYaw;
    }
    const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
    let scared = 0;
    for (const p of CB.Peds.list) {
      const dx = p.x - pl.x, dz = p.z - pl.z, d = Math.hypot(dx, dz);
      if (d > 14 || p.mode === 'knock' || p.mode === 'fallen' || p.mode === 'held') continue;
      if (dx * fx + dz * fz > d * 0.5) { p.cower(M.rand(2, 3.5)); scared++; } else if (d < 8) { p.flee(pl.x, pl.z); scared++; }
    }
    if (scared && !fromAim) {
      CB.Audio.play('hey', 0.8);
      raiseAlarm(pl.x, pl.z, false, 'brandishing a weapon');
      reward(5, 0, 'Waved a gun around', '🔫', 'brandish');
    } else if (scared) raiseAlarm(pl.x, pl.z, false, 'brandishing a weapon');
  }

  // =================================================================== the pistol
  // 12-round magazine, automatic reload. Shots knock people over (slapstick – they get back up),
  // break props, damage cars and bring the police.
  function shoot() {
    if (pl.reloadT > 0 || pl.fireT > 0) return;
    if (pl.ammo <= 0) { reload(); return; }
    pl.ammo--; pl.fireT = GUN.rate;
    pl.yaw = game.camYaw; pl.pose = 'aim'; pl.poseT = Math.max(pl.poseT, 0.55);
    // aim along the camera's line of sight (stored by updateCamera, so it's always current)
    const o = camera.position.clone(), d = (game.camAim || camera.getTarget()).subtract(o).normalize();
    const hit = traceShot(o, d);
    // muzzle: in front of the player's right hand
    const sy = Math.sin(pl.yaw), cy = Math.cos(pl.yaw);
    const mx = pl.x + sy * 0.78 + cy * 0.22, my = pl.y + 1.42, mz = pl.z + cy * 0.78 - sy * 0.22;
    tracer(mx, my, mz, hit.x, hit.y, hit.z);
    CB.Audio.play('gun', 1);
    CB.FX.burst('sparks', mx, my, mz, 6);
    CB.FX.shake(0.06);
    applyHit(hit, d);
    // the first shot in a while is a crime in itself and sends everyone running
    CB.Peds.scare(pl.x, pl.z, 40, 'flee');
    if (game.time - (game.lastShotT || -99) > 4) {
      raiseAlarm(pl.x, pl.z, true, 'gunfire');
      reward(5, 0, 'Shots fired!', '🔫', 'gunfire');
    }
    game.lastShotT = game.time;
    if (pl.ammo === 0) reload();
  }
  function reload() {
    if (pl.reloadT > 0 || pl.ammo === GUN.mag) return;
    pl.reloadT = GUN.reload;
    pl.pose = 'work'; pl.poseT = 0.5;
    CB.Audio.play('reload', 0.9);
  }
  game.shoot = shoot;

  // Ray from the camera through the crosshair. Returns the closest thing hit.
  // People get a little aim assist (a cone that widens with distance).
  const MAXR = 110;
  function traceShot(o, d) {
    const minT = Math.max(0, (pl.x - o.x) * d.x + (pl.y + 1.4 - o.y) * d.y + (pl.z - o.z) * d.z) - 0.2;
    let best = { t: MAXR, kind: 'none' };
    const dh = Math.hypot(d.x, d.z) || 1e-6;
    // people (cylinder r 0.45, 1.9 tall) with aim assist
    const people = (list, kind) => {
      for (const p of list) {
        if (p.mode === 'knock' || p.mode === 'fallen') continue;
        const vx = p.x - o.x, vy = p.y + 1.1 - o.y, vz = p.z - o.z;
        const t = vx * d.x + vy * d.y + vz * d.z;
        if (t < minT || t > best.t) continue;
        const px = vx - d.x * t, py = vy - d.y * t, pz = vz - d.z * t;
        const lateral = Math.hypot(px, pz), vert = Math.abs(py);
        const assist = 0.45 + t * 0.022;
        if (lateral > assist || vert > 1.0 + t * 0.015) continue;
        if (!CB.City.los(pl.x, pl.z, p.x, p.z)) continue;
        best = { t, kind, obj: p, x: p.x, y: p.y + 1.1 + (o.y + d.y * t - (p.y + 1.1)) * 0.5, z: p.z };
      }
    };
    people(CB.Peds.list, 'ped');
    people(CB.Police.foot, 'cop');
    // 2D ray vs circle helper (returns entry t along the 3D ray or -1)
    const circleT = (cx, cz, r) => {
      const fx = o.x - cx, fz = o.z - cz;
      const a = d.x * d.x + d.z * d.z, b = 2 * (fx * d.x + fz * d.z), c = fx * fx + fz * fz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0 || a < 1e-9) return -1;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      return t;
    };
    // cars
    for (const list of [CB.Traffic.cars, CB.Traffic.parked, CB.Police.cars]) for (const c of list) {
      if (c === pl.car || Math.abs(c.x - o.x) > MAXR || Math.abs(c.z - o.z) > MAXR) continue;
      const cs = c.circles();
      for (let k = 0; k < 3; k++) {
        const t = circleT(cs[k][0], cs[k][1], cs[3]);
        if (t < minT || t > best.t) continue;
        const y = o.y + d.y * t, top = c.y + (c.T.van ? 2.2 : 1.6);
        if (y < c.y || y > top) continue;
        best = { t, kind: 'car', obj: c, x: o.x + d.x * t, y, z: o.z + d.z * t };
      }
    }
    // breakable props
    CB.City.nearProps(pl.x, pl.z, 60, (p) => {
      if (p.broken) return;
      const t = circleT(p.x, p.z, p.r + 0.1);
      if (t < minT || t > best.t) return;
      const y = o.y + d.y * t;
      if (y < p.y || y > p.y + p.h + 0.2) return;
      best = { t, kind: 'prop', obj: p, x: o.x + d.x * t, y, z: o.z + d.z * t };
    });
    // walls and ground: march along the ray
    for (let t = Math.max(minT, 0.5); t < best.t; t += 0.4) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y <= CB.City.groundY(x, z)) { best = { t, kind: 'ground', x, y: CB.City.groundY(x, z) + 0.05, z }; break; }
      let wall = false;
      CB.City.near(x, z, 0.05, (c) => { if (!wall && c.h > y && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) wall = true; });
      if (wall) { best = { t, kind: 'wall', x, y, z }; break; }
    }
    if (best.kind === 'none') { const t = best.t; best.x = o.x + d.x * t; best.y = o.y + d.y * t; best.z = o.z + d.z * t; }
    return best;
  }

  // Short-lived bright streak from the gun to the hit point + a muzzle flash.
  const tracers = [];
  function tracer(x0, y0, z0, x1, y1, z1) {
    const P = CB.Pools;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
    const s = P.gY.alloc(), f = P.gW.alloc();
    if (s >= 0) CB.placeSlot(P.gY, s, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0.035, 0.035, L, Math.atan2(dx, dz), Math.atan2(-dy, Math.hypot(dx, dz)));
    if (f >= 0) CB.placeSlot(P.gW, f, x0, y0, z0, 0.22, 0.22, 0.22, Math.random() * 6, Math.random() * 6, 0);
    tracers.push({ s, f, t: 0.06 });
  }
  function updateTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i]; tr.t -= dt;
      if (tr.t <= 0) { CB.Pools.gY.release(tr.s); CB.Pools.gW.release(tr.f); tracers.splice(i, 1); }
    }
  }

  function applyHit(hit, d) {
    const kx = d.x / (Math.hypot(d.x, d.z) || 1), kz = d.z / (Math.hypot(d.x, d.z) || 1);
    switch (hit.kind) {
      case 'ped': {
        const p = hit.obj;
        p.knock(kx * 6, kz * 6, 3.5);
        CB.FX.burst('dust', hit.x, hit.y, hit.z, 8);
        CB.Peds.scare(p.x, p.z, 30, 'flee');
        reward(10, 0, 'Pedestrian knocked flat', '🔫', 'shooting');
        raiseAlarm(p.x, p.z, true, 'shooting');
        break;
      }
      case 'cop': {
        const c = hit.obj;
        c.knock(kx * 6, kz * 6, 3.5);
        CB.FX.burst('dust', hit.x, hit.y, hit.z, 8);
        CB.Police.bust = Math.max(0, CB.Police.bust - 0.5);
        reward(20, 0, 'Shot down a police officer – they\'ll be back up!', '🚨', 'copshot');
        CB.Police.startChase(pl, game);
        break;
      }
      case 'car': {
        const c = hit.obj;
        CB.FX.burst('sparks', hit.x, hit.y, hit.z, 14);
        CB.Audio.play('ricochet', 0.8, hit.x, hit.z, 60);
        if (c.dead) break;
        c.health -= 14;
        if (c.mode === 'traffic') { c.mode = 'wreck'; c.vf = c.v || 0; c.fleeT = 0.5; }
        if (c.mode === 'parked' && Math.random() < 0.6) CB.Audio.play('alarmCar', 0.8, c.x, c.z, 70);
        if (c.isPolice) { reward(10, 0, 'Shot up a police cruiser!', '🚓', 'copshot'); CB.Police.startChase(pl, game); }
        else reward(10, 0, 'Shot up a car', '💥', 'damage');
        if (c.health <= 0) wreckCar(c);
        else if (c.health < 35) CB.FX.setSmoke(c, 4);
        break;
      }
      case 'prop':
        CB.Activities.breakProp(hit.obj, kx * 6, kz * 6, game, true);
        break;
      case 'wall':
        CB.FX.burst('sparks', hit.x, hit.y, hit.z, 10);
        CB.FX.burst('dust', hit.x, hit.y, hit.z, 4);
        CB.Audio.play('ricochet', 0.5, hit.x, hit.z, 50);
        break;
      case 'ground':
        CB.FX.burst('dust', hit.x, hit.y, hit.z, 8);
        break;
    }
  }

  // Who can the player rob right now? (needs a weapon out)
  function pedQuery() {
    if (pl.inCar || pl.hidden || pl.dead) return null;
    const armed = pl.weapon !== 'fists';
    const range = pl.weapon === 'pistol' ? 7 : 2.8;
    const fx = Math.sin(game.camYaw), fz = Math.cos(game.camYaw);
    let best = null, bd = 1e9;
    const consider = (p, isCop) => {
      if (p.mode === 'knock' || p.mode === 'fallen' || p.mode === 'held' || (p.robbedUntil || 0) > game.time) return;
      const dx = p.x - pl.x, dz = p.z - pl.z, d = Math.hypot(dx, dz);
      if (d > (armed ? range : 2.2) || d >= bd) return;
      if (d > 1.6 && dx * fx + dz * fz < d * 0.55) return; // must be roughly where you're looking
      if (d > 3 && !CB.City.los(pl.x, pl.z, p.x, p.z)) return;
      best = { p, isCop, d }; bd = d;
    };
    for (const p of CB.Peds.list) consider(p, false);
    if (!CB.Police.hasActive()) for (const c of CB.Police.foot) consider(c, true);
    if (!best) return null;
    if (!armed) return best.d < 2 ? { d: best.d + 0.8, ok: false, text: 'Take out a weapon (Q) to rob people' } : null;
    const who = best.isCop ? 'police officer' : 'pedestrian', heat = best.isCop ? 25 : 10;
    return { ped: best.p, isCop: best.isCop, d: best.d + 0.6, ok: true, text: `Rob the ${who} <span class="heat">+${heat}% heat</span>` };
  }

  // Hold-up: the victim freezes with hands up, you hold E, they hand over their cash.
  function mug(q) {
    const p = q.ped, isCop = q.isCop;
    const face = () => {
      pl.yaw = Math.atan2(p.x - pl.x, p.z - pl.z);
      p.yaw = Math.atan2(pl.x - p.x, pl.z - p.z);
    };
    face();
    p.mode = 'held'; p.t = 1;
    const pose = pl.weapon === 'pistol' ? 'aim' : 'raise';
    CB.Audio.play('hey', 0.9, p.x, p.z, 30);
    CB.Activities.startHold({ x: pl.x, z: pl.z }, isCop ? 2.2 : 1.6, isCop ? 'Robbing a police officer…' : 'Robbing the pedestrian…', pose, game, {
      start: () => { if (!isCop) raiseAlarm(p.x, p.z, false, 'mugging'); },
      tick: (t, dt) => {
        if (p.mode === 'knock' || p.mode === 'fallen') { CB.Activities.cancelHold('They got away'); return; }
        p.mode = 'held'; p.t = 0.6; face();
        if (Math.random() < dt * 4) CB.FX.burst('money', p.x, 1.2, p.z, 2);
      },
      done: () => {
        const cash = isCop ? M.randInt(150, 320) : Math.random() < 0.12 ? M.randInt(250, 600) : M.randInt(20, 140);
        CB.FX.burst('money', p.x, 1.3, p.z, 35);
        CB.Audio.play('cash', 0.9);
        p.robbedUntil = game.time + 180;
        if (isCop) {
          p.mode = 'walk'; p.reroute();
          reward(25, cash, 'Robbed a police officer!', '💰');
          raiseAlarm(p.x, p.z, true, 'robbing an officer');
          CB.Police.startChase(pl, game);
        } else {
          p.flee(pl.x, pl.z, M.rand(5, 8));
          reward(10, cash, cash >= 250 ? 'Mugged a big shot – fat wallet!' : 'Mugged a pedestrian', '💰', 'mugging');
        }
      },
      cancel: () => {
        if (p.mode !== 'held') return;
        if (isCop) { p.mode = 'walk'; p.reroute(); CB.Police.startChase(pl, game); }
        else p.flee(pl.x, pl.z);
      },
    });
  }

  function shove() {
    if (pl.inCar || pl.hidden || pl.dead || pl.downT > 0 || CB.Activities.hold) return;
    if (pl.poseT > 0 && pl.pose === 'shove') return;
    pl.pose = 'shove'; pl.poseT = 0.35;
    CB.Audio.play('whoosh', 0.5);
    let hit = CB.Police.shove(pl, game);
    if (hit) { CB.Audio.play('punch', 1); reward(10, 0, 'Shoved a police officer', '👊', 'assault'); raiseAlarm(pl.x, pl.z, false, 'assault'); }
    const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
    for (const p of CB.Peds.list) {
      const dx = p.x - pl.x, dz = p.z - pl.z, d = Math.hypot(dx, dz);
      if (d > 1.9 || dx * fx + dz * fz < 0 || p.mode === 'knock') continue;
      p.knock(fx * 4, fz * 4, 3);
      CB.Audio.play('punch', 0.8);
      if (!hit) { reward(5, 0, 'Shoved a pedestrian', '👊', 'scuffle'); raiseAlarm(pl.x, pl.z, false, 'scuffle'); }
      hit = true;
      break;
    }
  }

  // =================================================================== camera
  const camPos = new B.Vector3(0, 10, 0);
  function updateCamera(dt) {
    const car = pl.inCar ? pl.car : null;
    game.mouseIdle = (game.mouseIdle || 0) + dt;
    if (car) {
      // swing behind the car when the mouse is idle
      if (game.mouseIdle > 1.2 && car.speed > 3) {
        const behind = car.vf < -1 ? car.h + Math.PI : car.h;
        game.camYaw = M.turn(game.camYaw, behind, dt * 2.2 * Math.min(1, car.speed / 10));
        game.camPitch = M.damp(game.camPitch, 0.22, 2, dt);
      }
    }
    game.aimK = M.damp(game.aimK || 0, pl.aiming && !car ? 1 : 0, 10, dt);
    const ak = game.aimK;
    // indoors: closer camera that stays under the ceiling and inside the room
    const room = car ? null : CB.City.roomAt(pl.x, pl.z);
    game.indoorK = M.damp(game.indoorK || 0, room ? 1 : 0, 6, dt);
    const ik = game.indoorK;
    // over the right shoulder while aiming (and indoors, so the player doesn't fill the view)
    const sk = Math.max(ak, 0.7 * ik);
    const sx = Math.cos(game.camYaw) * 0.85 * sk, sz = -Math.sin(game.camYaw) * 0.85 * sk;
    let tx = pl.x + sx, ty = pl.y + (car ? 1.6 : 1.55 + 0.15 * ak + 0.2 * ik * (1 - ak)), tz = pl.z + sz;
    if (room) { tx = M.clamp(tx, room.x0 + 0.3, room.x1 - 0.3); tz = M.clamp(tz, room.z0 + 0.3, room.z1 - 0.3); }
    let dist = car ? 8.5 + Math.min(4, car.speed * 0.08) + (car.T.van ? 1.5 : 0) : 5.2 - 2.4 * ak;
    if (pl.hidden) dist = 6.5;
    if (room) dist = Math.min(dist, 3.3);
    const cp = Math.cos(game.camPitch), spch = Math.sin(game.camPitch);
    const dx = -Math.sin(game.camYaw) * cp, dy = spch, dz = -Math.cos(game.camYaw) * cp;
    // pull in when a building is in the way
    let d = dist;
    for (let t = 0.6; t < dist; t += 0.35) {
      const x = tx + dx * t, y = ty + dy * t, z = tz + dz * t;
      let blocked = false;
      CB.City.near(x, z, 0.25, (c) => { if (!blocked && c.h > y && c.kind !== 'tree' && c.kind !== 'pole' && c.kind !== 'furniture' && x > c.x0 - 0.25 && x < c.x1 + 0.25 && z > c.z0 - 0.25 && z < c.z1 + 0.25) blocked = true; });
      if (blocked || y < CB.City.groundY(x, z) + 0.3) { d = Math.max(0.8, t - 0.3); break; }
    }
    let lift = 0;
    if (room) {
      // where does the view ray leave the room? Through the doorway the camera may stay
      // outside (kept under the lintel); anywhere else it stops in front of the wall.
      let tb = d;
      if (dx > 1e-4) tb = Math.min(tb, (room.x1 - tx) / dx); else if (dx < -1e-4) tb = Math.min(tb, (room.x0 - tx) / dx);
      if (dz > 1e-4) tb = Math.min(tb, (room.z1 - tz) / dz); else if (dz < -1e-4) tb = Math.min(tb, (room.z0 - tz) / dz);
      if (tb < d) {
        const bx = tx + dx * tb, bz = tz + dz * tb, S = room.S;
        const u = S.ux * (bx - S.ax) + S.uz * (bz - S.az);
        const dr = room.door;
        const viaDoor = u > room.d1 + 0.3 && u < room.d2 - 0.3 && bx > dr.x0 - 0.05 && bx < dr.x1 + 0.05 && bz > dr.z0 - 0.05 && bz < dr.z1 + 0.05;
        if (!viaDoor) d = Math.max(0.5, tb - 0.4);
      }
      lift = Math.max(0, 1.7 - d) * 0.6;   // too close: look over the head instead
    }
    const want = new B.Vector3(tx + dx * d, ty + dy * d + lift, tz + dz * d);
    if (room) {
      const inside = want.x > room.x0 && want.x < room.x1 && want.z > room.z0 && want.z < room.z1;
      want.y = Math.min(want.y, inside ? room.ceil - 0.3 : room.yb + 2.3);
    }
    if (d < (game.lastCamD || dist) - 0.05) camPos.copyFrom(want);
    else B.Vector3.LerpToRef(camPos, want, Math.min(1, dt * 12), camPos);
    game.lastCamD = d;
    const sh = CB.FX.shakeAmt;
    camera.position.set(camPos.x + (Math.random() - 0.5) * sh * 0.5, camPos.y + (Math.random() - 0.5) * sh * 0.5, camPos.z + (Math.random() - 0.5) * sh * 0.5);
    tmpV.set(tx, ty + 0.2, tz);
    camera.setTarget(tmpV);
    game.camAim = tmpV.clone();
    const fov = car ? 0.95 + Math.min(0.25, car.speed * 0.006) : 0.95 - 0.2 * ak;
    camera.fov = M.damp(camera.fov, fov, 3, dt);
    pl.viewYaw = game.camYaw;
    CB.Audio.lx = camera.position.x; CB.Audio.lz = camera.position.z; CB.Audio.lyaw = game.camYaw;
  }

  function menuCamera(dt) {
    game.menuT += dt;
    const t = game.menuT;
    const a = Math.sin(t * 0.04) * 0.95;
    const R = 380;
    camera.position.set(Math.cos(a) * R + 60, 72 + Math.sin(t * 0.11) * 16, Math.sin(a) * R);
    tmpV.set(-30, 62 + Math.sin(t * 0.07) * 10, Math.sin(a) * 60);
    camera.setTarget(tmpV);
    camera.fov = 0.9;
    CB.Audio.lx = camera.position.x; CB.Audio.lz = camera.position.z;
    CB.Audio.lyaw = Math.atan2(tmpV.x - camera.position.x, tmpV.z - camera.position.z);
  }

  // =================================================================== traffic & world simulation
  function updateTraffic(dt, fx, fz, viewYaw) {
    const T = CB.Traffic, night = game.night;
    const obs = game.obstacles;
    obs.length = 0;
    for (const c of T.cars) obs.push(c);
    for (const c of CB.Police.cars) obs.push(c);
    for (const p of CB.Peds.list) if (!CB.City.blockAt(p.x, p.z)) obs.push(p);
    for (const p of CB.Police.foot) if (!CB.City.blockAt(p.x, p.z)) obs.push(p);
    if (game.state === 'playing' && !pl.inCar && !pl.hidden) obs.push(pl);
    for (const c of T.cars) {
      if (c === pl.car) { c.update(dt, night, game.time); continue; }
      const d2 = M.dist2(c.x, c.z, fx, fz);
      if (c.mode === 'traffic') {
        if (d2 > 250 * 250) { T.placeTraffic(c, fx, fz, 100, 220, viewYaw); continue; }
        CB.trafficStep(c, dt, game.time, obs, false);
      } else if (c.mode === 'wreck' || c.mode === 'abandoned') {
        if (c.speed > 0.05 || c.y > CB.City.groundY(c.x, c.z) + 0.05) c.drive(dt, 0, 0, true);
        else { c.vx = c.vz = 0; c.brakeLight = false; }
        if (c.fleeT > 0) {
          c.fleeT -= dt;
          if (c.fleeT <= 0 && c.occupied) {
            c.setDriver(false);
            const ped = CB.Peds.list[Math.floor(Math.random() * CB.Peds.list.length)];
            const dp = c.doorPos();
            if (ped && M.dist2(ped.x, ped.z, fx, fz) > 60 * 60) { ped.x = dp.x; ped.z = dp.z; ped.mode = 'walk'; ped.flee(c.x, c.z, 6); }
          }
        }
        const respawnOK = c.special !== 'armored' || game.time > (game.armoredT || 0);
        if (d2 > 230 * 230 && respawnOK) {
          c.setDriver(true); c.health = 100; c.dead = false; c.stolenByPlayer = false; c.stolen = false;
          for (const p of c.rig.parts) if (p.pool === CB.Pools.shiny) c.rig.color(p, c.color);
          CB.FX.setSmoke(c, 0);
          T.placeTraffic(c, fx, fz, 100, 220, viewYaw);
          continue;
        }
      }
      if (d2 < 320 * 320) c.update(dt, night, game.time);
    }
    // parked cars that were bumped
    for (let i = T.parked.length - 1; i >= 0; i--) {
      const c = T.parked[i];
      if (c.mode === 'wreck') {
        if (c.speed > 0.05) { c.drive(dt, 0, 0, true); c.update(dt, night, game.time); }
        else { c.vx = c.vz = 0; }
      }
    }
    // occasionally refill empty parking spots far from the player
    game.parkT = (game.parkT || 0) - dt;
    if (game.parkT <= 0) {
      game.parkT = 3;
      if (T.parked.length < 60) {
        const s = M.pick(CB.City.parking);
        if (s && !s.car && M.dist(s.x, s.z, fx, fz) > 120) T.addParked(s);
      }
      for (let i = T.parked.length - 1; i >= 0; i--) {
        const c = T.parked[i];
        if (c.mode !== 'parked' && c !== pl.car && M.dist(c.x, c.z, fx, fz) > 220) { if (c.spot) c.spot.car = null; c.dispose(); T.parked.splice(i, 1); CB.FX.setSmoke(c, 0); }
      }
    }
    // physics cars bump into each other
    const phys = [];
    if (pl.car) phys.push(pl.car);
    for (const c of CB.Police.cars) if (c.mode === 'ai' && c !== pl.car) phys.push(c);
    for (const a of phys) {
      for (const b of T.cars) if (b !== a) collideImpact(a, b);
      for (const b of T.parked) if (b !== a) collideImpact(a, b);
      for (const b of CB.Police.cars) if (b !== a && (phys.indexOf(b) < 0 || phys.indexOf(b) > phys.indexOf(a))) collideImpact(a, b);
      carVsPeople(a, a === pl.car);
    }
    for (const c of T.cars) if (c.mode === 'wreck' && c.speed > 3) carVsPeople(c, false);
  }
  function collideImpact(a, b) {
    const imp = collideCars(a, b);
    if (imp > 0 && a === pl.car) {
      if (imp > 9 && !(b.isPolice)) reward(10, 0, 'Reckless driving', '💥', 'reckless');
      if (imp > 9) raiseAlarm(b.x, b.z, false, 'crash');
      if (b.isPolice && imp > 5) {
        reward(10, 0, 'Rammed a police cruiser!', '🚓', 'assault');
        CB.Police.startChase(pl, game);
      }
    }
  }

  // =================================================================== hints / objective
  function updateHint(dt) {
    game.hintT = (game.hintT || 0) - dt;
    if (game.hintT > 0) return;
    game.hintT = 0.5;
    const P = CB.Police;
    let h;
    if (pl.hidden) h = game.hideSeen ? 'They saw you hide here! Climb out (<b>E</b>) and run if they get close.' : 'Hiding… wait for the search to end. Press <b>E</b> to climb out.';
    else if (P.mode === 'chase') h = pl.inCar ? 'Lose the cops! Break line of sight – side streets, alleys, sharp turns.' : 'Run! Break line of sight, then hide in a <b>dumpster</b> or <b>bushes</b>.';
    else if (P.mode === 'search') h = `They lost you – stay out of sight for <b>${Math.ceil(P.searchT)}s</b>.`;
    else if (P.mode === 'alert') h = 'Cops are checking out a reported crime. Lay low or leave the area.';
    else {
      // suggest the juiciest nearby target
      let best = null, bs = -1e9;
      for (const it of CB.Activities.list) {
        if (it.used || it.cool > game.time || !(it.kind === 'store' || it.kind === 'breakin' || it.kind === 'race' || it.kind === 'atm')) continue;
        const d = M.dist(it.x, it.z, pl.x, pl.z);
        const heat = it.T ? it.T.heat : it.heat || 25;
        const s = heat * 3 - d * 0.35;
        if (s > bs) { bs = s; best = it; }
      }
      if (best) {
        const d = M.dist(best.x, best.z, pl.x, pl.z);
        const ang = Math.atan2(best.x - pl.x, best.z - pl.z);
        const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
        const verb = best.kind === 'race' ? 'Win the street race' : best.kind === 'breakin' ? 'Break into a ' + best.name : best.kind === 'atm' ? 'Hack an ATM' : 'Rob ' + best.name;
        h = `${verb} – <b>${Math.round(d)} m ${dir}</b>${pl.inCar ? '' : ' · grab a car with <b>E</b>'}`;
      } else h = 'Cause some chaos – smash hydrants, tag walls, steal cars!';
      if (P.level >= 5) h = '<b>Final star!</b> ' + h;
    }
    $('hint').innerHTML = h;
    $('objective').innerHTML = `Reach ✶✶✶✶✶ without getting busted <b style="color:#ffd32a">(${Math.floor(P.wanted / 100)}/5)</b>`;
  }

  // =================================================================== frame
  let lastFocus = { x: 150, z: 0 };
  function frame() { step(Math.min(0.05, engine.getDeltaTime() / 1000), true); }
  // One simulation step (exposed for automated tests: CB.game.step(dt, render)).
  function step(dt, render) {
    if (game.state === 'loading') { if (render) scene.render(); return; }
    const playing = game.state === 'playing';
    const live = playing || game.state === 'over' || game.state === 'won';
    const simDt = game.state === 'paused' ? 0 : dt;
    if (simDt > 0) {
      game.time += simDt;
      if (playing) game.elapsed += simDt;
      let fx, fz, view;
      if (live) { fx = pl.x; fz = pl.z; view = game.camYaw; }
      else { fx = 150; fz = 0; view = Math.atan2(camera.getTarget().x - camera.position.x, camera.getTarget().z - camera.position.z); }
      lastFocus = { x: fx, z: fz };
      updateSky(simDt, fx, fz);
      if (live) {
        if (pl.inCar) updatePlayerCar(simDt); else updatePlayerFoot(simDt);
        if (playing) {
          pl.disguiseT = Math.max(0, pl.disguiseT - simDt);
          if (game.time - pl.lastHurt > 8 && CB.Police.mode !== 'chase') pl.health = Math.min(100, pl.health + simDt * 1.5);
        }
      }
      updateTraffic(simDt, fx, fz, view);
      CB.Peds.update(simDt, fx, fz, view);
      if (playing) {
        CB.Police.update(simDt, game);
        CB.Activities.update(simDt, game);
        // interaction prompt
        let q = null;
        if (!CB.Activities.hold && !CB.Activities.pick && !pl.dead) {
          const a = CB.Activities.query(game);
          const v = pl.inCar || pl.hidden ? null : carQuery();
          const pq = pedQuery();
          q = a && (!v || a.d <= v.d) ? a : v;
          if (pq && (!q || pq.d < q.d) && (pq.ok || !q)) q = pq;
          if (!q && pl.inCar && pl.car.speed < 3) q = { text: 'Get out of the car', ok: true, exit: true };
        }
        game.query = q && !q.exit ? q : null;
        CB.HUD.prompt(q ? q.text : null, q ? q.ok : true);
        updateHint(simDt);
        CB.Audio.ambient(simDt, game.night, Math.min(1, CB.Traffic.cars.filter((c) => M.dist2(c.x, c.z, pl.x, pl.z) < 3600).length / 5));
      } else if (live) {
        CB.Police.update(simDt * 0.3, game);
      }
      CB.FX.update(simDt, fx, fz);
      updateTracers(simDt);
      CB.Landmarks.update(simDt, game, fx, fz);
      CB.City.updateSignals(game.time);
      updateCasters(simDt, fx, fz);
      autoQuality(simDt);
      if (live) updateCamera(simDt); else menuCamera(simDt);
      if (playing || live) CB.HUD.update(game, simDt);
    }
    CB.Pools.flush();
    if (render) scene.render();
  }
  game.step = step;

  window.addEventListener('DOMContentLoaded', boot);
})();

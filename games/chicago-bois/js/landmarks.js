// Chicago Bois – moving and special landmarks: the elevated "L" train, the pier Ferris wheel,
// the mirror-polished "Jellybean" sculpture, the fountain and Lake Michigan.
'use strict';
(function (CB) {
  const B = BABYLON, M = CB.M, C = CB.C, hex = M.hex;
  const LM = CB.Landmarks = {};

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
    const wm = new B.StandardMaterial('lakeMat', scene);
    wm.diffuseColor = new B.Color3(0.08, 0.3, 0.48);
    wm.specularColor = new B.Color3(0.9, 0.9, 0.9); wm.specularPower = 160;
    wm.bumpTexture = waterNormals(scene);
    wm.bumpTexture.uScale = 140; wm.bumpTexture.vScale = 175;
    wm.bumpTexture.level = 0.6;
    wm.reflectionTexture = probe.cubeTexture;
    wm.reflectionFresnelParameters = new B.FresnelParameters();
    wm.reflectionFresnelParameters.bias = 0.15;
    wm.reflectionFresnelParameters.power = 2.5;
    wm.reflectionFresnelParameters.leftColor = new B.Color3(0.9, 0.9, 0.9);
    wm.reflectionFresnelParameters.rightColor = new B.Color3(0.15, 0.15, 0.15);
    water.material = wm;
    water.isPickable = false;
    water.receiveShadows = true;
    this.water = water; this.waterMat = wm;
    // the Chicago River (same water material; the main branch starts east of the south branch so they don't overlap)
    const rivers = City.rivers;
    this.riverMeshes = rivers.map((r, k) => {
      const x0 = k === 0 ? rivers[1].x1 : r.x0, x1 = Math.min(r.x1, C.SHORE + 0.5);
      const m = B.MeshBuilder.CreateGround('river' + k, { width: x1 - x0, height: r.z1 - r.z0 }, scene);
      m.position.set((x0 + x1) / 2, City.waterY + 0.01, (r.z0 + r.z1) / 2);
      const rm = wm.clone('riverMat' + k);
      rm.diffuseColor = new B.Color3(0.1, 0.3, 0.27);
      rm.reflectionFresnelParameters = new B.FresnelParameters();
      rm.reflectionFresnelParameters.bias = 0.05; rm.reflectionFresnelParameters.power = 3;
      rm.reflectionFresnelParameters.leftColor = new B.Color3(0.3, 0.3, 0.3);
      rm.reflectionFresnelParameters.rightColor = new B.Color3(0.04, 0.04, 0.04);
      rm.bumpTexture = wm.bumpTexture.clone();
      rm.bumpTexture.uScale = (x1 - x0) / 17; rm.bumpTexture.vScale = (r.z1 - r.z0) / 17;
      m.material = rm; m.isPickable = false; m.receiveShadows = true;
      return m;
    });
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

  function waterNormals(scene) {
    const S = 256;
    const t = new B.DynamicTexture('waterN', { width: S, height: S }, scene, true);
    const c = t.getContext();
    const img = c.createImageData(S, S);
    const h = (x, y) => {
      const u = x / S * Math.PI * 2, v = y / S * Math.PI * 2;
      return Math.sin(u * 3 + Math.sin(v * 2) * 0.8) * 0.5 + Math.sin(v * 5 + u * 2) * 0.3 + Math.sin((u + v) * 7) * 0.15 + Math.sin(u * 11 - v * 4) * 0.08;
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
        let nx = -dx * 3, ny = -dy * 3, nz = 1;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const i = (y * S + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    t.update();
    t.wrapU = t.wrapV = B.Texture.WRAP_ADDRESSMODE;
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
    // water ripples
    const bt = this.waterMat.bumpTexture;
    bt.uOffset += dt * 0.004; bt.vOffset += dt * 0.0025;
    for (const rm of this.riverMeshes) { rm.material.bumpTexture.uOffset += dt * 0.02; }
    // refresh reflections now and then when near
    this.probeT -= dt;
    if (this.probeT <= 0) {
      this.probeT = 2.5;
      this.probe.cubeTexture.resetRefreshCounter();
    }
  };

  LM.setProbeList = function (meshes) {
    const rl = this.probe.renderList;
    rl.length = 0;
    for (const m of meshes) rl.push(m);
  };
})(window.CB);

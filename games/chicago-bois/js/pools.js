// Chicago Bois – rendering helpers.
//  * DynPool: one master mesh drawn many times with thin instances (characters, cars, props).
//  * StaticPool: same idea for things that never move (trees, lamps, poles).
//  * Rig: a set of pool parts that move together (a person, a car).
//  * Geo: merges lots of boxes/quads into one mesh with vertex colours (buildings, roads).
'use strict';
(function (CB) {
  const B = BABYLON;

  // ---------------------------------------------------------------- rotation
  // 3x3 rotation rows for v' = v * R where R = Rz(roll) * Rx(pitch) * Ry(yaw)
  // (same convention as Babylon: forward (0,0,1) -> (sin yaw, 0, cos yaw)).
  function rot(out, yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cx = Math.cos(pitch), sx = Math.sin(pitch);
    const cz = Math.cos(roll), sz = Math.sin(roll);
    out[0] = cz * cy + sz * sx * sy; out[1] = sz * cx; out[2] = -cz * sy + sz * sx * cy;
    out[3] = -sz * cy + cz * sx * sy; out[4] = cz * cx; out[5] = sz * sy + cz * sx * cy;
    out[6] = cx * sy; out[7] = -sx; out[8] = cx * cy;
    return out;
  }
  CB.rot = rot;

  const HIDE_Y = -900;
  function bigBounds(mesh) {
    mesh.setBoundingInfo(new B.BoundingInfo(new B.Vector3(-1200, -50, -1200), new B.Vector3(1200, 400, 1200)));
    mesh.doNotSyncBoundingInfo = true;
  }
  CB.bigBounds = bigBounds;

  // ---------------------------------------------------------------- DynPool
  class DynPool {
    constructor(mesh, cap, withColor) {
      this.mesh = mesh;
      this.cap = cap;
      this.m = new Float32Array(cap * 16);
      this.lo = 0; this.hi = cap - 1;
      this.withColor = withColor;
      this.c = withColor ? new Float32Array(cap * 4).fill(1) : null;
      this.free = [];
      for (let i = cap - 1; i >= 0; i--) { this.free.push(i); this._hide(i); }
      this.hw = 0; this.hwDirty = true; // high-water mark: only draw slots that were ever used
      mesh.thinInstanceSetBuffer('matrix', this.m, 16, false);
      if (withColor) mesh.thinInstanceSetBuffer('color', this.c, 4, false);
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isPickable = false;
      bigBounds(mesh);
      this.dm = true; this.dc = true;
    }
    touch(i) { if (i < this.lo) this.lo = i; if (i > this.hi) this.hi = i; this.dm = true; }
    _hide(i) {
      this.touch(i);
      const o = i * 16, m = this.m;
      for (let k = 0; k < 16; k++) m[o + k] = 0;
      m[o + 13] = HIDE_Y; m[o + 15] = 1;
    }
    alloc(col) {
      const i = this.free.pop();
      if (i === undefined) { console.warn('pool full', this.mesh.name); return -1; }
      if (i >= this.hw) { this.hw = i + 1; this.hwDirty = true; }
      if (col && this.c) this.setColor(i, col);
      return i;
    }
    release(i) {
      if (i < 0) return;
      this._hide(i); this.free.push(i); this.dm = true;
    }
    hide(i) { if (i >= 0) { this._hide(i); this.dm = true; } }
    setColor(i, col) {
      if (i < 0 || !this.c) return;
      const o = i * 4;
      this.c[o] = col[0]; this.c[o + 1] = col[1]; this.c[o + 2] = col[2]; this.c[o + 3] = 1;
      this.dc = true;
    }
    flush() {
      if (this.hwDirty) { this.mesh.thinInstanceCount = Math.max(1, this.hw); this.hwDirty = false; }
      if (this.dm && this.hi >= this.lo) {
        // upload only the range of slots that changed this frame
        if (this.hi - this.lo > this.cap * 0.7 || !this.mesh.thinInstancePartialBufferUpdate) this.mesh.thinInstanceBufferUpdated('matrix');
        else this.mesh.thinInstancePartialBufferUpdate('matrix', this.m.subarray(this.lo * 16, (this.hi + 1) * 16), this.lo * 16);
      }
      this.dm = false; this.lo = this.cap; this.hi = -1;
      if (this.dc && this.c) { this.mesh.thinInstanceBufferUpdated('color'); this.dc = false; }
    }
  }
  CB.DynPool = DynPool;

  // ---------------------------------------------------------------- StaticPool
  // Instances are grouped into square cells; each cell becomes its own mesh (sharing the
  // geometry and material) so the camera, shadow and glow passes can skip far-away cells.
  const CELL = 250;
  class StaticPool {
    constructor(mesh, withColor) {
      this.mesh = mesh; this.withColor = withColor;
      this.cells = new Map(); this.meshes = [];
    }
    // Adds one transformed copy: centre (x,y,z), size (sx,sy,sz), rotation yaw/pitch/roll.
    add(x, y, z, sx, sy, sz, col, yaw, pitch, roll) {
      const R = rot(TMP9, yaw || 0, pitch || 0, roll || 0);
      const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), key = ci * 1000 + cj;
      let c = this.cells.get(key);
      if (!c) { c = { m: [], c: [], cx: (ci + 0.5) * CELL, cz: (cj + 0.5) * CELL }; this.cells.set(key, c); }
      c.m.push(
        R[0] * sx, R[1] * sx, R[2] * sx, 0,
        R[3] * sy, R[4] * sy, R[5] * sy, 0,
        R[6] * sz, R[7] * sz, R[8] * sz, 0,
        x, y, z, 1);
      if (this.withColor) c.c.push(col[0], col[1], col[2], 1);
    }
    finish() {
      for (const [key, c] of this.cells) {
        const m = this.mesh.clone(this.mesh.name + '_' + key);
        // clones share geometry, and thin-instance buffers live on the geometry: give each cell its own
        m.makeGeometryUnique();
        m.thinInstanceSetBuffer('matrix', new Float32Array(c.m), 16, true);
        if (this.withColor) m.thinInstanceSetBuffer('color', new Float32Array(c.c), 4, true);
        m.thinInstanceRefreshBoundingInfo(false);
        m.isPickable = false;
        m.freezeWorldMatrix();
        m.doNotSyncBoundingInfo = true;
        m.cellX = c.cx; m.cellZ = c.cz;
        this.meshes.push(m);
      }
      this.mesh.setEnabled(false);
      this.cells = null;
    }
  }
  CB.StaticPool = StaticPool;
  const TMP9 = new Float32Array(9);

  // ---------------------------------------------------------------- Rig
  // A part hangs from a joint (jx,jy,jz) in the rig's local space, is rotated
  // about that joint (yaw/pitch/roll) and offset (ox,oy,oz) from it, then scaled.
  class Rig {
    constructor() {
      this.parts = [];
      this.x = 0; this.y = 0; this.z = 0;
      this.yaw = 0; this.pitch = 0; this.roll = 0;
      this.visible = true;
      this.R = new Float32Array(9);
      this.L = new Float32Array(9);
    }
    add(pool, o) {
      const p = {
        pool, slot: pool.alloc(o.c),
        jx: o.j ? o.j[0] : 0, jy: o.j ? o.j[1] : 0, jz: o.j ? o.j[2] : 0,
        ox: o.o ? o.o[0] : 0, oy: o.o ? o.o[1] : 0, oz: o.o ? o.o[2] : 0,
        sx: o.s ? o.s[0] : 1, sy: o.s ? o.s[1] : 1, sz: o.s ? o.s[2] : 1,
        yaw: o.yaw || 0, pitch: o.pitch || 0, roll: o.roll || 0,
        vis: o.vis !== false,
      };
      this.parts.push(p);
      return p;
    }
    color(p, col) { p.pool.setColor(p.slot, col); }
    update() {
      const R = rot(this.R, this.yaw, this.pitch, this.roll), L = this.L;
      const X = this.x, Y = this.y, Z = this.z;
      for (let k = 0; k < this.parts.length; k++) {
        const p = this.parts[k];
        if (p.slot < 0) continue;
        const pool = p.pool;
        if (!this.visible || !p.vis) { pool._hide(p.slot); continue; }
        rot(L, p.yaw, p.pitch, p.roll);
        // local translation: o * L + j
        const tx = p.ox * L[0] + p.oy * L[3] + p.oz * L[6] + p.jx;
        const ty = p.ox * L[1] + p.oy * L[4] + p.oz * L[7] + p.jy;
        const tz = p.ox * L[2] + p.oy * L[5] + p.oz * L[8] + p.jz;
        const m = pool.m, o = p.slot * 16;
        pool.touch(p.slot);
        // rows: s_i * L_row_i * R
        for (let r = 0; r < 3; r++) {
          const s = r === 0 ? p.sx : r === 1 ? p.sy : p.sz;
          const a = L[r * 3] * s, b = L[r * 3 + 1] * s, c = L[r * 3 + 2] * s;
          m[o + r * 4] = a * R[0] + b * R[3] + c * R[6];
          m[o + r * 4 + 1] = a * R[1] + b * R[4] + c * R[7];
          m[o + r * 4 + 2] = a * R[2] + b * R[5] + c * R[8];
          m[o + r * 4 + 3] = 0;
        }
        m[o + 12] = tx * R[0] + ty * R[3] + tz * R[6] + X;
        m[o + 13] = tx * R[1] + ty * R[4] + tz * R[7] + Y;
        m[o + 14] = tx * R[2] + ty * R[5] + tz * R[8] + Z;
        m[o + 15] = 1;
        pool.dm = true;
      }
    }
    // Transform a local point to world (for effects, door positions...).
    toWorld(lx, ly, lz) {
      const R = rot(this.R, this.yaw, this.pitch, this.roll);
      return {
        x: lx * R[0] + ly * R[3] + lz * R[6] + this.x,
        y: lx * R[1] + ly * R[4] + lz * R[7] + this.y,
        z: lx * R[2] + ly * R[5] + lz * R[8] + this.z,
      };
    }
    dispose() {
      for (const p of this.parts) p.pool.release(p.slot);
      this.parts.length = 0;
    }
  }
  CB.Rig = Rig;

  // ---------------------------------------------------------------- Geo
  // Collects quads with colours/uvs, then builds one Mesh.
  let FLIP = false; // flip winding if faces render inside-out
  class Geo {
    // opts.world: size in metres of one texture repeat -> UVs are made from world positions
    constructor(opts) { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.world = opts && opts.world; }
    get count() { return this.p.length / 3; }
    _wuv(v, nrm) {
      const s = 1 / this.world;
      if (Math.abs(nrm[1]) > 0.5) this.u.push(v[0] * s, v[2] * s);
      else if (Math.abs(nrm[0]) > 0.5) this.u.push(v[2] * s, v[1] * s);
      else this.u.push(v[0] * s, v[1] * s);
    }
    // a,b,c,d: [x,y,z] corners in order around the quad; nrm: [x,y,z]
    // col: one colour, or cols: an array of four per-corner colours (rgb or rgba)
    quad(a, b, c, d, nrm, col, uv, cols) {
      const base = this.p.length / 3;
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      for (let k = 0; k < 4; k++) this.n.push(nrm[0], nrm[1], nrm[2]);
      for (let k = 0; k < 4; k++) {
        const cc = cols ? cols[k] : (col || [1, 1, 1]);
        this.c.push(cc[0], cc[1], cc[2], cc.length > 3 ? cc[3] : 1);
      }
      if (uv) this.u.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[6], uv[7]);
      else if (this.world) { this._wuv(a, nrm); this._wuv(b, nrm); this._wuv(c, nrm); this._wuv(d, nrm); }
      else this.u.push(0, 0, 1, 0, 1, 1, 0, 1);
      // orient triangles so geometric normal matches nrm
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
      let same = gx * nrm[0] + gy * nrm[1] + gz * nrm[2] > 0;
      if (FLIP) same = !same;
      if (same) this.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    tri(a, b, c, nrm, col) {
      const base = this.p.length / 3;
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      for (let k = 0; k < 3; k++) this.n.push(nrm[0], nrm[1], nrm[2]);
      const cc = col || [1, 1, 1];
      for (let k = 0; k < 3; k++) this.c.push(cc[0], cc[1], cc[2], 1);
      if (this.world) { this._wuv(a, nrm); this._wuv(b, nrm); this._wuv(c, nrm); } else this.u.push(0, 0, 1, 0, 1, 1);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
      let same = gx * nrm[0] + gy * nrm[1] + gz * nrm[2] > 0;
      if (FLIP) same = !same;
      if (same) this.i.push(base, base + 2, base + 1);
      else this.i.push(base, base + 1, base + 2);
    }
    // Horizontal rectangle (top facing up) at height y.
    flat(x0, z0, x1, z1, y, col) {
      this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], col);
    }
    // Axis-aligned box. skip: {bottom:true, top:true}
    box(x0, y0, z0, x1, y1, z1, col, skip) {
      skip = skip || {};
      if (!skip.top) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], col);
      if (!skip.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col);
      const sc = skip.shade === false ? col : shade(col, 0.88);
      const sc2 = skip.shade === false ? col : shade(col, 0.78);
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], sc);
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sc);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sc2);
      this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], sc2);
    }
    build(name, scene, mat) {
      const mesh = new B.Mesh(name, scene);
      if (!this.p.length) { mesh.setEnabled(false); return mesh; }
      const vd = new B.VertexData();
      vd.positions = this.p; vd.normals = this.n; vd.uvs = this.u; vd.colors = this.c; vd.indices = this.i;
      vd.applyToMesh(mesh, false);
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      mesh.doNotSyncBoundingInfo = true;
      return mesh;
    }
  }
  function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  CB.shade = shade;
  CB.Geo = Geo;
  CB.setFlip = (v) => { FLIP = v; };

  // ---------------------------------------------------------------- pools
  // Creates all shared master meshes + pools. Called once by the game.
  CB.Pools = {
    init(scene) {
      const std = (name, opts) => {
        const m = new B.StandardMaterial(name, scene);
        m.diffuseColor = new B.Color3(1, 1, 1);
        m.specularColor = new B.Color3(0.12, 0.12, 0.12);
        m.specularPower = 32;
        Object.assign(m, opts || {});
        return m;
      };
      const glow = (name, c) => {
        const m = new B.StandardMaterial(name, scene);
        m.disableLighting = true;
        m.diffuseColor = new B.Color3(0, 0, 0);
        m.emissiveColor = new B.Color3(c[0], c[1], c[2]);
        return m;
      };
      this.matDyn = std('matDyn');
      this.matShiny = std('matShiny', { specularColor: new B.Color3(0.55, 0.55, 0.55), specularPower: 64 });
      this.matStatic = std('matStatic');

      const box = () => B.MeshBuilder.CreateBox('box', { size: 1 }, scene);
      const cyl = (t) => B.MeshBuilder.CreateCylinder('cyl', { height: 1, diameter: 1, tessellation: t || 10 }, scene);
      const sph = () => B.MeshBuilder.CreateSphere('sph', { diameter: 1, segments: 5 }, scene);
      const cone = () => B.MeshBuilder.CreateCylinder('cone', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 8 }, scene);

      const mk = (fn, mat, name) => { const m = fn(); m.name = name; m.material = mat; return m; };

      // Dynamic (updated every frame)
      this.box = new DynPool(mk(box, this.matDyn, 'dBox'), 12000, true);
      this.shiny = new DynPool(mk(box, this.matShiny, 'dShiny'), 1600, true);
      this.cyl = new DynPool(mk(() => cyl(8), this.matDyn, 'dCyl'), 7600, true);
      this.sph = new DynPool(mk(sph, this.matDyn, 'dSph'), 300, true);
      this.matGlowW = glow('gW', [1, 0.97, 0.85]);
      this.matGlowR = glow('gR', [1, 0.08, 0.05]);
      this.matGlowB = glow('gB', [0.1, 0.35, 1]);
      this.matGlowY = glow('gY', [1, 0.7, 0.1]);
      this.matGlowG = glow('gG', [0.15, 1, 0.35]);
      this.gW = new DynPool(mk(box, this.matGlowW, 'dGW'), 900, false);
      this.gR = new DynPool(mk(box, this.matGlowR, 'dGR'), 2300, false);
      this.gB = new DynPool(mk(box, this.matGlowB, 'dGB'), 260, false);
      this.gY = new DynPool(mk(box, this.matGlowY, 'dGY'), 1700, false);
      this.gG = new DynPool(mk(box, this.matGlowG, 'dGG'), 1500, false);
      this.dyn = [this.box, this.shiny, this.cyl, this.sph, this.gW, this.gR, this.gB, this.gY, this.gG];

      // Static
      this.sBox = new StaticPool(mk(box, this.matStatic, 'sBox'), true);
      this.sCyl = new StaticPool(mk(() => cyl(8), this.matStatic, 'sCyl'), true);
      // low-poly foliage: faceted spheres suit the blocky style and keep the triangle count down
      this.sSph = new StaticPool(mk(() => B.MeshBuilder.CreateIcoSphere('ico', { radius: 0.5, subdivisions: 1, flat: true }, scene), this.matStatic, 'sSph'), true);
      this.sCone = new StaticPool(mk(cone, this.matStatic, 'sCone'), true);
      this.matLamp = glow('lamp', [1, 0.9, 0.65]);
      this.sLamp = new StaticPool(mk(box, this.matLamp, 'sLamp'), false);
      this.matBlink = glow('blink', [1, 0.05, 0.05]);
      this.sBlink = new StaticPool(mk(sph, this.matBlink, 'sBlink'), false);
      // tower crown lights (cool white and warm gold), dimmed by day
      this.matCrown = glow('crown', [0.55, 0.8, 1]);
      this.sCrown = new StaticPool(mk(box, this.matCrown, 'sCrown'), false);
      this.matCrown2 = glow('crown2', [1, 0.72, 0.35]);
      this.sCrown2 = new StaticPool(mk(box, this.matCrown2, 'sCrown2'), false);
      this.statics = [this.sBox, this.sCyl, this.sSph, this.sCone, this.sLamp, this.sBlink, this.sCrown, this.sCrown2];

      // Additive ground light pools (street lamps / headlights at night)
      const tex = new B.DynamicTexture('poolTex', { width: 128, height: 128 }, scene, true);
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      tex.update();
      this.radialTex = tex;
      const addMat = (name, c) => {
        const m = new B.StandardMaterial(name, scene);
        m.disableLighting = true;
        // with lighting disabled the result is (diffuse + emissive colour) * diffuse texture
        m.diffuseColor = new B.Color3(0, 0, 0);
        m.diffuseTexture = tex;
        m.emissiveColor = new B.Color3(c[0], c[1], c[2]);
        m.alphaMode = B.Constants.ALPHA_ADD;
        m.alpha = 0.99;
        m.disableDepthWrite = true;
        m.backFaceCulling = false;
        m.zOffset = -2;
        return m;
      };
      const plane = (name, mat) => {
        const p = B.MeshBuilder.CreateGround(name, { width: 1, height: 1 }, scene);
        p.material = mat; return p;
      };
      this.matLampPool = addMat('lampPool', [0.95, 0.75, 0.45]);
      this.sLampPool = new StaticPool(plane('sLampPool', this.matLampPool), false);
      this.statics.push(this.sLampPool);
      // coloured neon light spilling onto the sidewalk under shop signs (colour per instance)
      this.matNeonPool = addMat('neonPool', [0, 0, 0]);
      this.sNeonPool = new StaticPool(plane('sNeonPool', this.matNeonPool), true);
      this.statics.push(this.sNeonPool);
      this.matHeadPool = addMat('headPool', [0.9, 0.85, 0.7]);
      this.headPool = new DynPool(plane('dHeadPool', this.matHeadPool), 420, false);
      this.matSirenPool = addMat('sirenPool', [1, 1, 1]);
      this.sirenPool = new DynPool(plane('dSirenPool', this.matSirenPool), 40, false);
      this.dyn.push(this.headPool, this.sirenPool);

      // Marker rings on the ground (interaction spots)
      const rt = new B.DynamicTexture('ringTex', { width: 128, height: 128 }, scene, true);
      const rc = rt.getContext();
      rc.fillStyle = '#000'; rc.fillRect(0, 0, 128, 128);
      rc.strokeStyle = '#fff'; rc.lineWidth = 9;
      rc.beginPath(); rc.arc(64, 64, 54, 0, Math.PI * 2); rc.stroke();
      rc.lineWidth = 3; rc.globalAlpha = 0.5;
      rc.beginPath(); rc.arc(64, 64, 40, 0, Math.PI * 2); rc.stroke();
      rt.update();
      const ringMat = (name, c) => {
        const m = addMat(name, c); m.diffuseTexture = rt; return m;
      };
      this.ringRed = new DynPool(plane('ringR', ringMat('ringR', [1, 0.2, 0.15])), 1000, false);
      this.ringGreen = new DynPool(plane('ringG', ringMat('ringG', [0.2, 1, 0.4])), 40, false);
      this.ringYellow = new DynPool(plane('ringY', ringMat('ringY', [1, 0.8, 0.1])), 40, false);
      this.dyn.push(this.ringRed, this.ringGreen, this.ringYellow);

      this.glowMeshes = [this.gW, this.gR, this.gB, this.gY, this.gG].map(p => p.mesh);
      this.casters = [this.box.mesh, this.shiny.mesh, this.cyl.mesh, this.sph.mesh];
      this.receivers = this.casters.slice();
    },
    flush() { for (const p of this.dyn) p.flush(); },
    // Builds the per-cell meshes. staticCasters: cells that may cast shadows (picked by distance each frame).
    finishStatic() {
      for (const p of this.statics) p.finish();
      this.staticMeshes = [];
      this.staticCasters = [];
      for (const p of this.statics) for (const m of p.meshes) this.staticMeshes.push(m);
      for (const p of [this.sBox, this.sCyl, this.sSph, this.sCone]) for (const m of p.meshes) { this.staticCasters.push(m); this.receivers.push(m); }
      for (const p of [this.sLamp, this.sBlink, this.sCrown, this.sCrown2]) for (const m of p.meshes) this.glowMeshes.push(m);
    },
  };

  // Write a single free-standing transform into a dyn pool slot.
  CB.placeSlot = function (pool, slot, x, y, z, sx, sy, sz, yaw, pitch, roll) {
    if (slot < 0) return;
    const R = rot(TMP9, yaw || 0, pitch || 0, roll || 0);
    const m = pool.m, o = slot * 16;
    m[o] = R[0] * sx; m[o + 1] = R[1] * sx; m[o + 2] = R[2] * sx; m[o + 3] = 0;
    m[o + 4] = R[3] * sy; m[o + 5] = R[4] * sy; m[o + 6] = R[5] * sy; m[o + 7] = 0;
    m[o + 8] = R[6] * sz; m[o + 9] = R[7] * sz; m[o + 10] = R[8] * sz; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    pool.touch(slot);
  };
})(window.CB);

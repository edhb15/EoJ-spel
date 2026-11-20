// Chicago Bois – blocky people (player, pedestrians, police) and pedestrian AI.
'use strict';
(function (CB) {
  const M = CB.M, C = CB.C, hex = M.hex;

  const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x5c3a21, 0xd9a066].map(hex);
  const SHIRTS = [0x0e3386, 0xcc3433, 0xce1141, 0x0b162a, 0xc83803, 0x27251f, 0x41b6e6, 0xffffff, 0x2ecc71,
    0xf1c40f, 0x8e44ad, 0x7f8c8d, 0xe67e22, 0x16a085, 0xd35400, 0xecf0f1].map(hex);
  const PANTS = [0x2c3e50, 0x1b2631, 0x34495e, 0x5d6d7e, 0x6e2c00, 0x212f3d, 0x4a6fa5, 0x7b7d7d].map(hex);
  const HAIRS = [0x111111, 0x3b2314, 0x6a4e2a, 0xb08d57, 0x222222, 0x8b2e16, 0xaaaaaa].map(hex);
  const SHOES = [0x111111, 0xffffff, 0x5d4037, 0x2c3e50, 0xc0392b].map(hex);

  CB.randomLook = function () {
    return {
      skin: M.pick(SKINS), shirt: M.pick(SHIRTS), pants: M.pick(PANTS), hair: M.pick(HAIRS), shoes: M.pick(SHOES),
      hat: Math.random() < 0.25 ? M.pick(SHIRTS) : null,
    };
  };
  CB.playerLook = function (variant) {
    const looks = [
      { skin: hex(0xe0ac69), shirt: hex(0xc8102e), pants: hex(0x1b2631), hair: hex(0x111111), shoes: hex(0xffffff), hat: hex(0x0e3386), chain: true },
      { skin: hex(0xe0ac69), shirt: hex(0x2ecc71), pants: hex(0x5d6d7e), hair: hex(0x111111), shoes: hex(0x111111), hat: hex(0xf1c40f), chain: true },
      { skin: hex(0xe0ac69), shirt: hex(0x6c3483), pants: hex(0x212f3d), hair: hex(0x111111), shoes: hex(0xe67e22), hat: hex(0xecf0f1), chain: true },
      { skin: hex(0xe0ac69), shirt: hex(0x41b6e6), pants: hex(0x7b7d7d), hair: hex(0x111111), shoes: hex(0xc0392b), hat: hex(0x111111), chain: true },
      { skin: hex(0xe0ac69), shirt: hex(0xf39c12), pants: hex(0x34495e), hair: hex(0x111111), shoes: hex(0xffffff), hat: hex(0x27ae60), chain: true },
    ];
    return looks[variant % looks.length];
  };
  CB.copLook = function () {
    return { skin: M.pick(SKINS), shirt: hex(0x1f2f5c), pants: hex(0x141c33), hair: hex(0x111111), shoes: hex(0x111111), cop: true };
  };

  // ------------------------------------------------------------------ Human
  class Human {
    constructor(look) {
      const P = CB.Pools;
      const r = this.rig = new CB.Rig();
      this.look = look;
      const L = look;
      this.legL = r.add(P.box, { j: [-0.13, 0.92, 0], o: [0, -0.43, 0], s: [0.21, 0.86, 0.24], c: L.pants });
      this.legR = r.add(P.box, { j: [0.13, 0.92, 0], o: [0, -0.43, 0], s: [0.21, 0.86, 0.24], c: L.pants });
      this.shoeL = r.add(P.box, { j: [-0.13, 0.92, 0], o: [0, -0.86, 0.06], s: [0.23, 0.13, 0.36], c: L.shoes });
      this.shoeR = r.add(P.box, { j: [0.13, 0.92, 0], o: [0, -0.86, 0.06], s: [0.23, 0.13, 0.36], c: L.shoes });
      this.torso = r.add(P.box, { j: [0, 0.9, 0], o: [0, 0.31, 0], s: [0.54, 0.66, 0.3], c: L.shirt });
      this.armL = r.add(P.box, { j: [-0.355, 1.47, 0], o: [0, -0.28, 0], s: [0.16, 0.6, 0.18], c: L.shirt });
      this.armR = r.add(P.box, { j: [0.355, 1.47, 0], o: [0, -0.28, 0], s: [0.16, 0.6, 0.18], c: L.shirt });
      this.handL = r.add(P.box, { j: [-0.355, 1.47, 0], o: [0, -0.63, 0], s: [0.13, 0.13, 0.14], c: L.skin });
      this.handR = r.add(P.box, { j: [0.355, 1.47, 0], o: [0, -0.63, 0], s: [0.13, 0.13, 0.14], c: L.skin });
      const neck = [0, 1.55, 0];
      this.head = r.add(P.box, { j: neck, o: [0, 0.19, 0], s: [0.33, 0.35, 0.32], c: L.skin });
      this.eyeL = r.add(P.box, { j: neck, o: [-0.075, 0.22, 0.163], s: [0.06, 0.06, 0.01], c: [0.05, 0.05, 0.05] });
      this.eyeR = r.add(P.box, { j: neck, o: [0.075, 0.22, 0.163], s: [0.06, 0.06, 0.01], c: [0.05, 0.05, 0.05] });
      this.headParts = [this.head, this.eyeL, this.eyeR];
      if (L.cop) {
        this.headParts.push(r.add(P.box, { j: neck, o: [0, 0.4, 0], s: [0.37, 0.13, 0.37], c: hex(0x1f2f5c) }));
        this.headParts.push(r.add(P.box, { j: neck, o: [0, 0.35, 0], s: [0.38, 0.06, 0.38], c: hex(0xeeeeee) }));
        this.headParts.push(r.add(P.box, { j: neck, o: [0, 0.34, 0.22], s: [0.32, 0.04, 0.14], c: hex(0x111111) }));
        r.add(P.box, { j: [0, 0.9, 0], o: [-0.13, 0.48, 0.155], s: [0.09, 0.1, 0.02], c: hex(0xf1c40f) });
        r.add(P.box, { j: [0, 0.9, 0], o: [0, 0.02, 0], s: [0.56, 0.08, 0.32], c: hex(0x111111) });
      } else if (L.hat) {
        this.headParts.push(r.add(P.box, { j: neck, o: [0, 0.39, 0], s: [0.35, 0.11, 0.35], c: L.hat }));
        this.headParts.push(r.add(P.box, { j: neck, o: [0, 0.35, 0.22], s: [0.31, 0.04, 0.17], c: L.hat }));
      } else {
        this.headParts.push(r.add(P.box, { j: neck, o: [0, 0.38, -0.02], s: [0.35, 0.08, 0.36], c: L.hair }));
      }
      if (L.chain) this.chain = r.add(P.box, { j: [0, 0.9, 0], o: [0, 0.5, 0.16], s: [0.3, 0.05, 0.02], c: hex(0xf5c518) });
      this.phase = Math.random() * 6;
      this.a = { lL: 0, lR: 0, aL: 0, aR: 0, rL: -0.08, rR: 0.08, lean: 0 };
      this.bob = 0; this.t = Math.random() * 10;
      this.onStep = null;
    }
    // Weapon models in the right hand (they follow the arm). Only the player gets these.
    addWeapons() {
      const P = CB.Pools, r = this.rig, J = [0.355, 1.47, 0];
      const W = this.weapons = {
        bat: [r.add(P.box, { j: J, o: [0, -0.72, 0], s: [0.065, 0.2, 0.065], c: hex(0x1d1d1d) }),
          r.add(P.box, { j: J, o: [0, -1.1, 0], s: [0.09, 0.62, 0.09], c: hex(0xc9a063) }),
          r.add(P.box, { j: J, o: [0, -1.42, 0], s: [0.1, 0.05, 0.1], c: hex(0xb8894f) })],
        crowbar: [r.add(P.box, { j: J, o: [0, -1.0, 0], s: [0.045, 0.78, 0.045], c: hex(0x9e1c1c) }),
          r.add(P.box, { j: J, o: [0, -1.38, 0.07], s: [0.045, 0.05, 0.16], c: hex(0x9e1c1c) })],
        pistol: [r.add(P.box, { j: J, o: [0, -0.8, 0.02], s: [0.055, 0.25, 0.075], c: hex(0x26282c) }),
          r.add(P.box, { j: J, o: [0, -0.68, -0.07], s: [0.05, 0.07, 0.12], c: hex(0x15161a) })],
      };
      this.weaponParts = [].concat(W.bat, W.crowbar, W.pistol);
      this.setWeapon('fists');
    }
    setWeapon(w) {
      this.weapon = w;
      if (!this.weapons) return;
      for (const k in this.weapons) for (const p of this.weapons[k]) p.vis = k === w;
    }
    recolor(look) {
      this.look = look;
      const r = this.rig;
      r.color(this.legL, look.pants); r.color(this.legR, look.pants);
      r.color(this.shoeL, look.shoes); r.color(this.shoeR, look.shoes);
      r.color(this.torso, look.shirt); r.color(this.armL, look.shirt); r.color(this.armR, look.shirt);
      r.color(this.handL, look.skin); r.color(this.handR, look.skin); r.color(this.head, look.skin);
      if (look.hat && this.headParts[3]) { r.color(this.headParts[3], look.hat); if (this.headParts[4]) r.color(this.headParts[4], look.hat); }
    }
    // Animate limbs. speed in m/s, pose name.
    animate(dt, speed, pose) {
      const a = this.a;
      this.t += dt;
      let lL = 0, lR = 0, aL = 0, aR = 0, rL = -0.08, rR = 0.08, lean = 0, bob = 0, snap = false;
      const w = this.weapon;
      switch (pose) {
        case 'aim': // pistol pointed straight ahead, two hands
          aR = -1.57; rR = -0.05; aL = -1.35; rL = 0.42; lean = -0.03; break;
        case 'raise': // melee weapon raised in a threatening way
          aR = -2.5 + Math.sin(this.t * 9) * 0.15; rR = 0.25; aL = -0.5; break;
        case 'swing': { // fast overhead swing driven by swingP (0..1)
          const p = this.swingP || 0, f = M.clamp((p - 0.3) / 0.45, 0, 1);
          aR = p < 0.3 ? -2.9 : M.lerp(-2.9, -0.45, 1 - (1 - f) * (1 - f)); rR = 0.15;
          aL = -0.6; lean = p < 0.3 ? -0.1 : 0.25; lL = -0.4; lR = 0.3; snap = true; break;
        }
        case 'air':
          lL = -0.8; lR = 0.35; aL = -2.5; aR = -2.3; rL = -0.35; rR = 0.35; break;
        case 'handsup':
          aL = aR = -3.0; rL = -0.18; rR = 0.18; bob = Math.sin(this.t * 14) * 0.01; break;
        case 'grab':
          aL = -1.35 + Math.sin(this.t * 13) * 0.35; aR = -1.35 - Math.sin(this.t * 13) * 0.35; lean = 0.15; break;
        case 'spray':
          aR = -1.65 + Math.sin(this.t * 9) * 0.15; aL = 0.1; rR = 0.1 + Math.sin(this.t * 5) * 0.25; break;
        case 'kick':
          lR = -1.35; aL = -0.6; aR = 0.5; lean = -0.15; break;
        case 'shove':
          aL = aR = -1.6; lean = 0.2; lL = -0.4; lR = 0.3; break;
        case 'taser':
          aR = -1.55; aL = -0.3; break;
        case 'phone':
          aR = -2.55; rR = -0.55; aL = -0.2; break;
        case 'cower':
          aL = aR = -2.75; rL = 0.5; rR = -0.5; lean = 0.45; bob = -0.12; lL = -0.6; lR = -0.6; break;
        case 'fallen':
          aL = -2.8; aR = -2.4; rL = -0.6; rR = 0.6; lL = -0.25; lR = 0.25; break;
        case 'work':
          aL = -1.15 + Math.sin(this.t * 10) * 0.12; aR = -1.2 - Math.sin(this.t * 10) * 0.12; lean = 0.18; break;
        case 'eat':
          aR = -2.3 + Math.sin(this.t * 8) * 0.2; rR = -0.4; break;
        case 'cheer':
          aL = -3.0 + Math.sin(this.t * 10) * 0.3; aR = -3.0 - Math.sin(this.t * 10) * 0.3; bob = Math.abs(Math.sin(this.t * 8)) * 0.15; break;
        default: {
          const walk = Math.min(1, speed / 3.2), run = M.clamp((speed - 3.2) / 4, 0, 1);
          const amp = walk * 0.5 + run * 0.55;
          const prev = Math.sin(this.phase);
          this.phase += dt * speed * (3.3 - run * 0.9);
          const s = Math.sin(this.phase);
          if (this.onStep && speed > 0.5 && ((prev < 0) !== (s < 0))) this.onStep(run);
          lL = s * amp; lR = -s * amp;
          aL = -s * amp * 0.85; aR = s * amp * 0.85;
          lean = run * 0.18 + walk * 0.03;
          bob = Math.abs(Math.cos(this.phase)) * 0.06 * amp;
          if (speed < 0.2) { aL = Math.sin(this.t * 1.7) * 0.04; aR = -aL; }
          // carry the weapon: the right arm swings less and holds it a little forward
          if (w === 'bat' || w === 'crowbar') { aR = -0.3 + aR * 0.35; rR = 0.12; }
          else if (w === 'pistol') { aR = -0.2 + aR * 0.4; rR = 0.1; }
        }
      }
      const k = snap ? Math.min(1, dt * 40) : Math.min(1, dt * 14);
      a.lL += (lL - a.lL) * k; a.lR += (lR - a.lR) * k; a.aL += (aL - a.aL) * k; a.aR += (aR - a.aR) * k;
      a.rL += (rL - a.rL) * k; a.rR += (rR - a.rR) * k; a.lean += (lean - a.lean) * k;
      this.bob += (bob - this.bob) * k;
      this.legL.pitch = this.shoeL.pitch = a.lL; this.legR.pitch = this.shoeR.pitch = a.lR;
      this.armL.pitch = this.handL.pitch = a.aL; this.armR.pitch = this.handR.pitch = a.aR;
      this.armL.roll = this.handL.roll = a.rL; this.armR.roll = this.handR.roll = a.rR;
      if (this.weaponParts) for (const p of this.weaponParts) { p.pitch = a.aR; p.roll = a.rR; }
      return a.lean;
    }
    place(x, y, z, yaw, pitch, lean) {
      const r = this.rig;
      r.x = x; r.y = y + this.bob; r.z = z; r.yaw = yaw;
      r.pitch = (pitch || 0) + (lean || 0);
      r.update();
    }
    setVisible(v) { this.rig.visible = v; }
    dispose() { this.rig.dispose(); }
  }
  CB.Human = Human;

  // ------------------------------------------------------------------ pedestrians
  const INSET = 2.1;
  function corner(b, k) {
    switch (k & 3) {
      case 0: return { x: b.x0 + INSET, z: b.z0 + INSET };
      case 1: return { x: b.x1 - INSET, z: b.z0 + INSET };
      case 2: return { x: b.x1 - INSET, z: b.z1 - INSET };
      default: return { x: b.x0 + INSET, z: b.z1 - INSET };
    }
  }
  // Street crossings from each corner: [dbi, dbj, newCorner]
  const CROSS = {
    0: [[-1, 0, 1], [0, -1, 3]],
    1: [[1, 0, 0], [0, -1, 2]],
    2: [[1, 0, 3], [0, 1, 1]],
    3: [[-1, 0, 2], [0, 1, 0]],
  };

  class Ped {
    constructor(look) {
      this.h = new Human(look || CB.randomLook());
      this.x = 0; this.z = 0; this.y = C.CURB; this.yaw = 0;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.mode = 'walk'; this.t = 0;
      this.speed = M.rand(1.2, 1.7);
      this.b = null; this.k = 0; this.dir = 1; this.tx = 0; this.tz = 0;
      this.spin = 0; this.pitch = 0;
      this.alive = true;
      this.reported = false;
    }
    setRoute(b, k, dir) {
      this.b = b; this.k = k; this.dir = dir;
      const c = corner(b, k); this.tx = c.x; this.tz = c.z;
    }
    nextTarget() {
      if (!this.b) { this.reroute(); return; }
      const b = this.b;
      if (Math.random() < 0.28) {
        const opts = CROSS[this.k & 3];
        const o = opts[Math.random() < 0.5 ? 0 : 1];
        const nb = CB.City.blocks[(b.bi + o[0]) * C.N + (b.bj + o[1])];
        if (b.bi + o[0] >= 0 && b.bi + o[0] < C.N && b.bj + o[1] >= 0 && b.bj + o[1] < C.N && nb && !nb.noPeds) {
          this.setRoute(nb, o[2], Math.random() < 0.5 ? 1 : -1);
          return;
        }
      }
      this.k = (this.k + this.dir + 4) & 3;
      const c = corner(b, this.k); this.tx = c.x; this.tz = c.z;
    }
    // Rejoin the sidewalk loop of the closest block.
    reroute() {
      let best = null, bd = 1e9;
      for (const b of CB.City.blocks) {
        if (b.noPeds) continue;
        const d = M.dist2(this.x, this.z, b.cx, b.cz);
        if (d < bd) { bd = d; best = b; }
      }
      let bk = 0, kd = 1e9;
      for (let k = 0; k < 4; k++) { const c = corner(best, k); const d = M.dist2(this.x, this.z, c.x, c.z); if (d < kd) { kd = d; bk = k; } }
      this.setRoute(best, bk, Math.random() < 0.5 ? 1 : -1);
    }
    flee(fx, fz, time) {
      if (this.mode === 'knock' || this.mode === 'fallen') return;
      if (this.mode !== 'flee' && Math.random() < 0.5) CB.Audio.play('hey', 0.6, this.x, this.z, 40);
      this.mode = 'flee'; this.fx = fx; this.fz = fz; this.t = time || M.rand(4, 7);
    }
    cower(time) {
      if (this.mode === 'knock' || this.mode === 'fallen') return;
      this.mode = 'cower'; this.t = time || 3;
    }
    knock(vx, vz, up) {
      if (this.mode === 'knock') return;
      this.mode = 'knock';
      this.vx = vx; this.vz = vz; this.vy = up || 5;
      this.spin = M.rand(4, 9) * (Math.random() < 0.5 ? -1 : 1);
      this.t = 0;
      CB.Audio.play('oof', 0.9, this.x, this.z, 50);
    }
    update(dt) {
      const City = CB.City;
      let speed = 0, pose = 'walk';
      switch (this.mode) {
        case 'walk': {
          const dx = this.tx - this.x, dz = this.tz - this.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.5) this.nextTarget();
          else {
            speed = this.speed;
            // wait at the kerb if a car is coming (very rough)
            this.x += dx / d * speed * dt; this.z += dz / d * speed * dt;
            this.yaw = M.turn(this.yaw, Math.atan2(dx, dz), dt * 6);
          }
          break;
        }
        case 'flee': {
          this.t -= dt;
          let dx = this.x - this.fx, dz = this.z - this.fz;
          const d = Math.hypot(dx, dz) || 1;
          dx /= d; dz /= d;
          speed = 4.6;
          this.x += dx * speed * dt; this.z += dz * speed * dt;
          this.yaw = M.turn(this.yaw, Math.atan2(dx, dz), dt * 8);
          const hit = City.resolve(this, 0.35, this.y, 0.3);
          if (hit) { this.fx = this.x - hit.z * 3 - dx; this.fz = this.z + hit.x * 3 - dz; }
          if (this.t <= 0) { this.mode = 'walk'; this.reroute(); }
          break;
        }
        case 'cower':
          this.t -= dt; pose = 'cower';
          if (this.t <= 0) { this.mode = 'walk'; this.reroute(); }
          break;
        case 'phone':
          this.t -= dt; pose = 'phone';
          if (this.t <= 0) { this.mode = 'flee'; this.t = 4; }
          break;
        case 'knock': {
          this.t += dt;
          this.vy -= 22 * dt;
          this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
          this.vx *= 1 - dt * 0.6; this.vz *= 1 - dt * 0.6;
          this.pitch += this.spin * dt;
          City.resolve(this, 0.35, this.y, 0.3);
          const gy = City.groundY(this.x, this.z);
          pose = 'air';
          if (this.y <= gy && this.t > 0.1) {
            this.y = gy; this.mode = 'fallen'; this.t = M.rand(2, 3.5); this.pitch = -Math.PI / 2;
          }
          break;
        }
        case 'fallen':
          this.t -= dt; pose = 'fallen';
          if (this.t <= 0) { this.pitch = 0; this.y = CB.City.groundY(this.x, this.z); this.mode = 'flee'; this.fx = this.x - Math.sin(this.yaw); this.fz = this.z - Math.cos(this.yaw); this.t = 4; }
          break;
        case 'idle':
          pose = this.pose || 'walk';
          break;
        case 'held': // being robbed: frozen with hands up until the robber stops
          this.t -= dt; pose = 'handsup';
          if (this.t <= 0) { this.mode = 'flee'; this.fx = this.x + Math.sin(this.yaw); this.fz = this.z + Math.cos(this.yaw); this.t = 5; }
          break;
      }
      if (this.mode === 'walk' || this.mode === 'flee') {
        const gy = City.groundY(this.x, this.z);
        this.y += (gy - this.y) * Math.min(1, dt * 15);
      }
      const lean = this.h.animate(dt, speed, pose);
      const pitch = this.mode === 'fallen' ? -Math.PI / 2 : this.mode === 'knock' ? this.pitch : 0;
      const yOff = this.mode === 'fallen' ? 0.18 : 0;
      this.h.place(this.x, this.y + yOff, this.z, this.yaw, pitch, this.mode === 'fallen' || this.mode === 'knock' ? 0 : lean);
    }
  }
  CB.Ped = Ped;

  CB.Peds = {
    list: [],
    target: 40,
    init(n) {
      this.target = n;
      for (const p of this.list) p.h.dispose();
      this.list = [];
      const sp = CB.City.playerSpawn;
      for (let i = 0; i < n; i++) {
        const p = new Ped();
        this.place(p, sp.x, sp.z, 0, 170, null);
        this.list.push(p);
      }
    },
    // Put ped somewhere on a sidewalk loop between minD and maxD from (x,z).
    place(p, x, z, minD, maxD, view) {
      // candidate blocks: walkable blocks roughly within range
      const all = CB.City.blocks;
      const blocks = all.filter((b) => !b.noPeds && Math.abs(b.cx - x) < maxD + 40 && Math.abs(b.cz - z) < maxD + 40);
      if (!blocks.length) blocks.push(...all.filter((b) => !b.noPeds));
      for (let tries = 0; tries < 40; tries++) {
        const b = blocks[Math.floor(Math.random() * blocks.length)];
        const k = Math.floor(Math.random() * 4);
        const c0 = corner(b, k), c1 = corner(b, k + 1);
        const t = Math.random();
        const px = c0.x + (c1.x - c0.x) * t, pz = c0.z + (c1.z - c0.z) * t;
        const d = M.dist(px, pz, x, z);
        if (d < minD || d > maxD) continue;
        if (view && tries < 30) {
          const ang = Math.atan2(px - x, pz - z);
          if (Math.abs(M.wrap(ang - view)) < 0.9) continue;
        }
        p.x = px; p.z = pz; p.y = CB.C.CURB;
        p.mode = 'walk'; p.pitch = 0; p.reported = false;
        const dir = Math.random() < 0.5 ? 1 : -1;
        p.setRoute(b, dir > 0 ? (k + 1) & 3 : k, dir);
        return true;
      }
      // could not satisfy the distance limits: settle for any sidewalk spot
      if (!p.b) {
        const b = blocks[Math.floor(Math.random() * blocks.length)];
        const c = corner(b, 0);
        p.x = c.x; p.z = c.z; p.y = CB.C.CURB; p.mode = 'walk';
        p.setRoute(b, 1, 1);
      }
      return false;
    },
    update(dt, px, pz, viewYaw) {
      for (const p of this.list) {
        const d2 = M.dist2(p.x, p.z, px, pz);
        if (d2 > 200 * 200 && p.mode !== 'knock') { this.place(p, px, pz, 90, 180, viewYaw); continue; }
        if (d2 > 140 * 140 && Math.random() < 0.5) continue; // far away: update half as often
        p.update(d2 > 140 * 140 ? dt * 2 : dt);
      }
    },
    // Make everyone near (x,z) react to something scary.
    scare(x, z, r, kind) {
      let caller = null;
      for (const p of this.list) {
        const d = M.dist(p.x, p.z, x, z);
        if (d > r) continue;
        if (kind === 'cower' && d < r * 0.5) p.cower(M.rand(2, 4));
        else p.flee(x, z);
        if (!caller && d > 6 && d < r && p.mode === 'flee' && CB.City.los(p.x, p.z, x, z)) caller = p;
      }
      if (caller) { caller.mode = 'phone'; caller.t = 2.5; }
      return caller;
    },
  };
})(window.CB);

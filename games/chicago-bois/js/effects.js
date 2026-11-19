// Chicago Bois – particles, screen flashes and camera shake.
'use strict';
(function (CB) {
  const B = BABYLON, M = CB.M;

  const FX = CB.FX = { shakeAmt: 0, systems: {}, geysers: [], smokes: [] };

  function tex(scene, name, draw) {
    const t = new B.DynamicTexture(name, { width: 64, height: 64 }, scene, false);
    t.hasAlpha = true;
    const c = t.getContext();
    c.clearRect(0, 0, 64, 64);
    draw(c);
    t.update();
    return t;
  }

  const KINDS = {
    glass: { tex: 'sq', n: 60, c1: [0.75, 0.9, 1, 1], c2: [0.95, 0.98, 1, 1], size: [0.05, 0.16], life: [0.6, 1.3], pow: [2.5, 7], g: -16, dir: 'sphere', add: false },
    sparks: { tex: 'dot', n: 40, c1: [1, 0.85, 0.3, 1], c2: [1, 0.45, 0.1, 1], size: [0.05, 0.12], life: [0.25, 0.6], pow: [3, 8], g: -10, dir: 'sphere', add: true },
    coins: { tex: 'sq', n: 30, c1: [1, 0.85, 0.2, 1], c2: [0.95, 0.7, 0.1, 1], size: [0.08, 0.14], life: [0.7, 1.2], pow: [3, 6], g: -16, dir: 'up', add: false },
    money: { tex: 'bill', n: 45, c1: [0.4, 0.85, 0.4, 1], c2: [0.25, 0.7, 0.3, 1], size: [0.18, 0.3], life: [1.5, 2.8], pow: [2, 5], g: -2.5, dir: 'up', add: false },
    paper: { tex: 'sq', n: 40, c1: [0.95, 0.95, 0.92, 1], c2: [0.85, 0.85, 0.8, 1], size: [0.12, 0.25], life: [1.5, 2.5], pow: [2, 5], g: -3, dir: 'up', add: false },
    trash: { tex: 'sq', n: 35, c1: [0.5, 0.45, 0.35, 1], c2: [0.85, 0.85, 0.8, 1], size: [0.08, 0.2], life: [1, 1.8], pow: [2, 5], g: -10, dir: 'up', add: false },
    dust: { tex: 'soft', n: 25, c1: [0.75, 0.7, 0.6, 0.6], c2: [0.6, 0.58, 0.55, 0.4], size: [0.6, 1.4], life: [0.8, 1.5], pow: [0.5, 2], g: 0.5, dir: 'flat', add: false },
    smoke: { tex: 'soft', n: 30, c1: [0.35, 0.35, 0.35, 0.7], c2: [0.15, 0.15, 0.15, 0.5], size: [1, 2.2], life: [1.5, 2.8], pow: [1, 2.5], g: 1.5, dir: 'up', add: false },
    fire: { tex: 'dot', n: 80, c1: [1, 0.6, 0.15, 1], c2: [1, 0.25, 0.05, 1], size: [0.6, 1.6], life: [0.4, 0.9], pow: [3, 9], g: 2, dir: 'sphere', add: true },
    spray: { tex: 'soft', n: 8, c1: [1, 0.2, 0.6, 0.7], c2: [0.2, 0.8, 1, 0.6], size: [0.2, 0.4], life: [0.3, 0.6], pow: [2, 4], g: 0, dir: 'fwd', add: false },
  };

  FX.init = function (scene) {
    this.scene = scene;
    this.tex = {
      sq: tex(scene, 'pSq', (c) => { c.fillStyle = '#fff'; c.fillRect(8, 8, 48, 48); }),
      bill: tex(scene, 'pBill', (c) => { c.fillStyle = '#e8ffe8'; c.fillRect(2, 16, 60, 32); c.fillStyle = '#2e7d32'; c.fillRect(6, 20, 52, 24); c.fillStyle = '#c8e6c9'; c.font = 'bold 22px sans-serif'; c.fillText('$', 24, 40); }),
      dot: tex(scene, 'pDot', (c) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }),
      soft: tex(scene, 'pSoft', (c) => { const g = c.createRadialGradient(32, 32, 4, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.6, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }),
    };
    for (const k in KINDS) this.systems[k] = [this.make(k), this.make(k)];
    this.rr = {};
    // hydrant geyser systems (max 3 at a time)
    this.geyserPool = [0, 1, 2].map(() => {
      const ps = new B.ParticleSystem('geyser', 600, scene);
      ps.particleTexture = this.tex.soft;
      ps.emitter = new B.Vector3(0, -100, 0);
      ps.minEmitBox = new B.Vector3(-0.1, 0, -0.1); ps.maxEmitBox = new B.Vector3(0.1, 0, 0.1);
      ps.color1 = new B.Color4(0.8, 0.9, 1, 0.8); ps.color2 = new B.Color4(0.6, 0.8, 1, 0.6); ps.colorDead = new B.Color4(0.8, 0.9, 1, 0);
      ps.minSize = 0.2; ps.maxSize = 0.55; ps.minLifeTime = 0.9; ps.maxLifeTime = 1.4;
      ps.emitRate = 350; ps.gravity = new B.Vector3(0, -16, 0);
      ps.direction1 = new B.Vector3(-0.15, 1, -0.15); ps.direction2 = new B.Vector3(0.15, 1, 0.15);
      ps.minEmitPower = 9; ps.maxEmitPower = 13; ps.blendMode = B.ParticleSystem.BLENDMODE_STANDARD;
      return { ps, t: 0, x: 0, z: 0 };
    });
    // confetti in red, sky blue and white
    this.confettiPS = [[1, 0.1, 0.2], [0.25, 0.71, 0.9], [1, 1, 1]].map((col) => {
      const cf = new B.ParticleSystem('confetti', 600, scene);
      cf.particleTexture = this.tex.sq;
      cf.emitter = new B.Vector3(0, 0, 0);
      cf.minEmitBox = new B.Vector3(-12, 0, -12); cf.maxEmitBox = new B.Vector3(12, 0, 12);
      cf.color1 = new B.Color4(col[0], col[1], col[2], 1); cf.color2 = new B.Color4(col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 1);
      cf.colorDead = new B.Color4(col[0], col[1], col[2], 0.6);
      cf.minSize = 0.15; cf.maxSize = 0.3; cf.minLifeTime = 3; cf.maxLifeTime = 5;
      cf.emitRate = 0; cf.gravity = new B.Vector3(0, -3, 0);
      cf.direction1 = new B.Vector3(-1, -0.2, -1); cf.direction2 = new B.Vector3(1, 0.5, 1);
      cf.minAngularSpeed = -6; cf.maxAngularSpeed = 6;
      cf.minEmitPower = 1; cf.maxEmitPower = 3;
      cf.start();
      return cf;
    });
    this.flashEl = document.getElementById('flash');
  };

  FX.make = function (k) {
    const d = KINDS[k];
    const ps = new B.ParticleSystem('fx_' + k, d.n * 3, this.scene);
    ps.particleTexture = this.tex[d.tex];
    ps.emitter = new B.Vector3(0, -100, 0);
    ps.color1 = new B.Color4(...d.c1); ps.color2 = new B.Color4(...d.c2);
    ps.colorDead = new B.Color4(d.c2[0], d.c2[1], d.c2[2], 0);
    ps.minSize = d.size[0]; ps.maxSize = d.size[1];
    ps.minLifeTime = d.life[0]; ps.maxLifeTime = d.life[1];
    ps.minEmitPower = d.pow[0]; ps.maxEmitPower = d.pow[1];
    ps.gravity = new B.Vector3(0, d.g, 0);
    ps.minAngularSpeed = -5; ps.maxAngularSpeed = 5;
    ps.emitRate = 0; ps.manualEmitCount = 0;
    ps.updateSpeed = 0.016;
    ps.minEmitBox = new B.Vector3(-0.2, 0, -0.2); ps.maxEmitBox = new B.Vector3(0.2, 0.3, 0.2);
    if (d.dir === 'sphere') { ps.direction1 = new B.Vector3(-1, 0.2, -1); ps.direction2 = new B.Vector3(1, 1.2, 1); }
    else if (d.dir === 'up') { ps.direction1 = new B.Vector3(-0.6, 1, -0.6); ps.direction2 = new B.Vector3(0.6, 1.6, 0.6); }
    else if (d.dir === 'flat') { ps.direction1 = new B.Vector3(-1, 0.1, -1); ps.direction2 = new B.Vector3(1, 0.4, 1); }
    else { ps.direction1 = new B.Vector3(-0.2, -0.1, 0.8); ps.direction2 = new B.Vector3(0.2, 0.2, 1); }
    ps.blendMode = d.add ? B.ParticleSystem.BLENDMODE_ADD : B.ParticleSystem.BLENDMODE_STANDARD;
    ps.start();
    return ps;
  };

  // One-shot burst of particles at a point.
  FX.burst = function (kind, x, y, z, count, dirx, dirz) {
    const arr = this.systems[kind];
    if (!arr) return;
    this.rr[kind] = ((this.rr[kind] || 0) + 1) % arr.length;
    const ps = arr[this.rr[kind]];
    ps.emitter.set(x, y, z);
    if (dirx != null && KINDS[kind].dir === 'fwd') {
      ps.direction1.set(dirx * 0.9 - dirz * 0.2, -0.1, dirz * 0.9 + dirx * 0.2);
      ps.direction2.set(dirx * 0.9 + dirz * 0.2, 0.2, dirz * 0.9 - dirx * 0.2);
    }
    ps.manualEmitCount = Math.round(count || KINDS[kind].n);
  };

  FX.geyser = function (x, z, dur) {
    let g = this.geyserPool.find((q) => q.t <= 0) || this.geyserPool.reduce((a, b) => (a.t < b.t ? a : b));
    g.t = dur || 20; g.x = x; g.z = z;
    g.ps.emitter.set(x, CB.C.CURB + 0.6, z);
    g.ps.start();
  };

  FX.confetti = function (x, z, dur) {
    for (const cf of this.confettiPS) { cf.emitter.set(x, 18, z); cf.emitRate = 140; }
    this.confettiT = dur || 6;
  };

  FX.flash = function (color, strength) {
    const el = this.flashEl;
    if (!el) return;
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = strength == null ? 0.6 : strength;
    void el.offsetWidth;
    el.style.transition = 'opacity 0.6s ease-out';
    el.style.opacity = 0;
  };

  FX.shake = function (a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); };

  FX.update = function (dt, lx, lz) {
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    let water = 0;
    for (const g of this.geyserPool) {
      if (g.t > 0) {
        g.t -= dt;
        g.ps.emitRate = g.t < 3 ? 350 * g.t / 3 : 350;
        const d = M.dist(g.x, g.z, lx, lz);
        water = Math.max(water, Math.max(0, 1 - d / 50) * Math.min(1, g.t / 3));
        if (g.t <= 0) g.ps.stop();
      }
    }
    CB.Audio.loop('water', water * 0.25);
    if (this.confettiT > 0) { this.confettiT -= dt; if (this.confettiT <= 0) for (const cf of this.confettiPS) cf.emitRate = 0; }
    // continuous smoke from badly damaged cars
    for (const s of this.smokes) {
      s.acc += dt * s.rate;
      while (s.acc > 1) { s.acc -= 1; this.burst('smoke', s.car.x, s.car.y + 1.2, s.car.z, 1); }
    }
  };
  FX.setSmoke = function (car, rate) {
    let s = this.smokes.find((q) => q.car === car);
    if (!rate) { if (s) this.smokes.splice(this.smokes.indexOf(s), 1); return; }
    if (!s) { s = { car, acc: 0, rate }; this.smokes.push(s); }
    s.rate = rate;
  };
  FX.clear = function () {
    for (const g of this.geyserPool) { g.t = 0; g.ps.stop(); }
    this.smokes = [];
    this.confettiT = 0; for (const cf of this.confettiPS) cf.emitRate = 0;
  };
})(window.CB);

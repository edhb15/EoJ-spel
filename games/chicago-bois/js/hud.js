// Chicago Bois – heads-up display: wanted stars, stats, minimap, big map, notifications, prompts.
'use strict';
(function (CB) {
  const M = CB.M, C = CB.C;
  const $ = (id) => document.getElementById(id);

  // Six-pointed star like the ones on the Chicago flag.
  function starPath() {
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 6, r = i % 2 ? 0.46 : 1;
      pts.push((50 + Math.cos(a) * 48 * r).toFixed(1) + ',' + (50 + Math.sin(a) * 48 * r).toFixed(1));
    }
    return pts.join(' ');
  }

  const HUD = CB.HUD = { notes: [], lastStars: -1 };

  HUD.init = function () {
    const stars = $('stars');
    const poly = starPath();
    stars.innerHTML = '';
    this.starEls = [];
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      s.innerHTML = `<svg viewBox="0 0 100 100" class="bg"><polygon points="${poly}"/></svg><svg viewBox="0 0 100 100" class="fg"><polygon points="${poly}"/></svg>`;
      stars.appendChild(s);
      this.starEls.push(s);
    }
    this.mm = $('minimap'); this.mmc = this.mm.getContext('2d');
    this.big = $('bigmap'); this.bigc = this.big.getContext('2d');
    this.el = {
      wantedPct: $('wantedPct'), status: $('policeStatus'), cash: $('cash'), timer: $('timer'), score: $('score'),
      health: $('healthFill'), healthTxt: $('healthTxt'), objective: $('objective'), hint: $('hint'), prompt: $('prompt'),
      progress: $('progress'), progressFill: $('progressFill'), progressLabel: $('progressLabel'),
      lock: $('lockpick'), lockZone: $('lockZone'), lockNeedle: $('lockNeedle'), lockPips: $('lockPips'),
      bust: $('bust'), bustFill: $('bustFill'), eye: $('eye'), eyeFill: $('eyeFill'),
      speedo: $('speedo'), speed: $('speedVal'), carHp: $('carHpFill'), carName: $('carName'),
      notes: $('notes'), banner: $('banner'), bannerBig: $('bannerBig'), bannerSmall: $('bannerSmall'),
      race: $('raceHud'), raceTime: $('raceTime'), raceCp: $('raceCp'), hide: $('hideTag'), fps: $('fps'), wantedBar: $('wantedBarFill'),
    };
    this.renderMap();
  };

  // ------------------------------------------------------------------ map image
  const MX0 = -(C.OUT + 50), MZ1 = C.OUT + 50, MW = Math.ceil(C.PIER.x1 + 30 - MX0), MH = 2 * MZ1, K = 1; // 1 px per metre
  HUD.renderMap = function () {
    const cv = document.createElement('canvas');
    cv.width = MW * K; cv.height = MH * K;
    const c = cv.getContext('2d');
    const X = (x) => (x - MX0) * K, Y = (z) => (MZ1 - z) * K;
    const rect = (x0, z0, x1, z1) => c.fillRect(X(x0), Y(z1), (x1 - x0) * K, (z1 - z0) * K);
    const E = C.EDGE, O = C.OUT, F = C.FERRIS;
    c.fillStyle = '#1d6fa5'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#2b2e35'; rect(MX0, -MZ1, C.SHORE, MZ1);
    // beach strip
    c.fillStyle = '#4c8a3c'; rect(E, -O, C.SHORE, O);
    c.fillStyle = '#d8c48f'; rect(E + 24, -O, C.SHORE, O);
    c.fillStyle = '#2b2e35'; rect(E, -7, C.SHORE, 7);
    // pier
    c.fillStyle = '#8a6a4a'; rect(C.SHORE, C.PIER.z0, C.PIER.x1, C.PIER.z1); rect(F.x0, F.z0, F.x1, F.z1);
    const typeCol = { park: '#3e7d32', bean: '#8c9a7a', fountain: '#3e7d32', parking: '#3c3f46', industrial: '#6b6457', downtown: '#5b5f68', skydeck: '#5b5f68',
      midtown: '#585c64', bigjohn: '#5b5f68', ballpark: '#3f8f3a', apartments: '#4d5148', shops: '#565159', river: '#8f8b84' };
    for (const b of CB.City.blocks) {
      c.fillStyle = '#8f8b84'; rect(b.x0, b.z0, b.x1, b.z1);
      if (b.type !== 'river') { c.fillStyle = typeCol[b.type] || '#555'; rect(b.ix0, b.iz0, b.ix1, b.iz1); }
    }
    c.fillStyle = '#8f8b84';
    rect(MX0, -MZ1, -E, MZ1); rect(-E, E, E, MZ1); rect(-E, -MZ1, E, -E);
    // river + bridges
    c.fillStyle = '#2a7fbf';
    for (const r of CB.City.rivers) rect(r.x0, r.z0, r.x1, r.z1);
    c.fillStyle = '#2b2e35';
    const r1 = CB.City.rivers[0], r2 = CB.City.rivers[1];
    for (let i = 0; i <= C.N; i++) { const x = CB.road(i); if (x - 7 > r1.x0) rect(x - 7, r1.z0, x + 7, r1.z1); }
    for (let j = 0; j <= C.N; j++) { const z = CB.road(j); if (z - 7 < r1.z0) rect(r2.x0, z - 7, r2.x1, z + 7); }
    // buildings
    for (const col of CB.City.colliders) {
      if (col.kind !== 'building' && col.kind !== 'warehouse' && col.kind !== 'garage') continue;
      const h = col.h;
      c.fillStyle = h > 80 ? '#a7adb8' : h > 30 ? '#8d929c' : '#757980';
      c.fillRect(X(col.x0), Y(col.z1), (col.x1 - col.x0) * K, (col.z1 - col.z0) * K);
    }
    // L loop
    const L = CB.City.loop;
    c.strokeStyle = '#41b6e6'; c.lineWidth = 2.5 * K; c.setLineDash([6, 3]);
    c.strokeRect(X(L.lo), Y(L.hi), (L.hi - L.lo) * K, (L.hi - L.lo) * K);
    c.setLineDash([]);
    // road centre lines
    c.strokeStyle = 'rgba(242,194,48,0.35)'; c.lineWidth = 1;
    for (let i = 0; i <= C.N; i++) {
      const r = CB.road(i);
      c.beginPath(); c.moveTo(X(r), Y(C.HALF)); c.lineTo(X(r), Y(-C.HALF)); c.stroke();
      c.beginPath(); c.moveTo(X(-C.HALF), Y(r)); c.lineTo(X(C.HALF), Y(r)); c.stroke();
    }
    this.mapImg = cv;
    this.X = X; this.Y = Y;
  };

  // ------------------------------------------------------------------ helpers
  HUD.show = function (on) { $('hud').classList.toggle('hidden', !on); };
  HUD.notify = function (title, sub, color) {
    const d = document.createElement('div');
    d.className = 'note ' + (color || '');
    d.innerHTML = `<b>${title}</b>${sub ? '<span>' + sub + '</span>' : ''}`;
    this.el.notes.prepend(d);
    requestAnimationFrame(() => d.classList.add('in'));
    setTimeout(() => { d.classList.remove('in'); d.classList.add('out'); }, 4200);
    setTimeout(() => d.remove(), 4800);
    while (this.el.notes.children.length > 5) this.el.notes.lastChild.remove();
    if (color !== 'silent') CB.Audio.play('blip', 0.5);
  };
  HUD.banner = function (big, small, dur, cls) {
    const e = this.el;
    e.bannerBig.textContent = big; e.bannerSmall.textContent = small || '';
    e.banner.className = 'show ' + (cls || '');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => { e.banner.className = ''; }, (dur || 2.2) * 1000);
  };
  HUD.progress = function (label, f) {
    const e = this.el;
    if (label == null) { e.progress.classList.add('hidden'); return; }
    e.progress.classList.remove('hidden');
    e.progressLabel.textContent = label;
    e.progressFill.style.width = (M.clamp(f, 0, 1) * 100).toFixed(1) + '%';
  };
  HUD.lockpick = function (p) {
    const e = this.el;
    if (!p) { e.lock.classList.add('hidden'); return; }
    e.lock.classList.remove('hidden');
    e.lockZone.style.left = (p.zone[0] * 100) + '%';
    e.lockZone.style.width = ((p.zone[1] - p.zone[0]) * 100) + '%';
    e.lockNeedle.style.left = (p.needle * 100) + '%';
    e.lockPips.textContent = '●'.repeat(p.hits) + '○'.repeat(p.need - p.hits) + (p.misses ? '   ✖'.repeat(p.misses) : '');
  };
  HUD.race = function (r) {
    const e = this.el;
    if (!r) { e.race.classList.add('hidden'); return; }
    e.race.classList.remove('hidden');
    e.raceTime.textContent = Math.max(0, r.left).toFixed(1);
    e.raceTime.classList.toggle('low', r.left < 10);
    e.raceCp.textContent = `Checkpoint ${Math.min(r.k + 1, r.n)}/${r.n}`;
  };
  HUD.prompt = function (text, ok) {
    const e = this.el;
    if (!text) { if (this._pt !== null) { e.prompt.classList.add('hidden'); this._pt = null; } return; }
    if (this._pt === text) return;
    this._pt = text;
    e.prompt.classList.remove('hidden');
    e.prompt.classList.toggle('no', !ok);
    e.prompt.innerHTML = (ok ? '<kbd>E</kbd> ' : '') + text;
  };

  // ------------------------------------------------------------------ per-frame update
  HUD.update = function (game, dt) {
    const e = this.el, P = CB.Police, pl = game.player;
    const w = P.wanted;
    // stars
    for (let i = 0; i < 5; i++) {
      const f = M.clamp((w - i * 100) / 100, 0, 1);
      const s = this.starEls[i];
      s.lastChild.style.clipPath = `inset(${(1 - f) * 100}% 0 0 0)`;
      s.classList.toggle('full', f >= 1);
      s.classList.toggle('flash', P.mode === 'search' && f > 0);
      s.classList.toggle('chase', P.mode === 'chase' && f > 0);
    }
    e.wantedPct.textContent = Math.floor(w) + '%';
    e.wantedBar.style.width = (w / 5) + '%';
    const st = { calm: ['CALM', 'calm'], alert: ['COPS RESPONDING', 'alert'], chase: ['IN PURSUIT', 'chase'], search: ['SEARCHING ' + Math.ceil(P.searchT) + 's', 'search'] }[P.mode];
    if (e.status.textContent !== st[0]) { e.status.textContent = st[0]; e.status.className = 'chip ' + st[1]; }
    e.cash.textContent = CB.fmtMoney(game.cash);
    e.timer.textContent = CB.fmtTime(game.elapsed);
    e.score.textContent = Math.floor(game.score).toLocaleString('en-US');
    e.health.style.width = pl.health + '%';
    e.health.className = pl.health < 30 ? 'low' : '';
    e.healthTxt.textContent = Math.ceil(pl.health);
    // bust / recognition meters
    e.bust.classList.toggle('hidden', P.bust <= 0.01);
    e.bustFill.style.width = (P.bust * 100) + '%';
    e.eye.classList.toggle('hidden', !(P.recog > 0.02 && P.mode !== 'chase'));
    e.eyeFill.style.width = (P.recog * 100) + '%';
    e.hide.classList.toggle('hidden', !pl.hidden && !pl.inCover);
    e.hide.textContent = pl.hidden ? '🙈 HIDING' : '🌿 IN COVER';
    // weapon in hand
    if (this._weapon !== pl.weapon && CB.WEAPON_INFO) {
      this._weapon = pl.weapon;
      const wi = CB.WEAPON_INFO[pl.weapon];
      document.getElementById('weaponIcon').textContent = wi.icon;
      document.getElementById('weaponName').textContent = wi.name;
      document.getElementById('weaponHelp').innerHTML = pl.weapon === 'pistol' ? '<kbd>Click</kbd> shoot · <kbd>RMB</kbd> aim · <kbd>R</kbd> reload'
        : pl.weapon === 'fists' ? '<kbd>Q</kbd> switch · <kbd>Click</kbd> shove' : '<kbd>Q</kbd> switch · <kbd>Click</kbd> swing · <kbd>E</kbd> rob';
    }
    document.getElementById('weaponBox').classList.toggle('in-car', !!pl.inCar);
    const ammo = pl.weapon === 'pistol' ? (pl.reloadT > 0 ? 'RELOADING…' : pl.ammo + ' / ∞') : '';
    if (this._ammo !== ammo) { this._ammo = ammo; document.getElementById('weaponAmmo').textContent = ammo; }
    const ch = document.getElementById('crosshair');
    ch.classList.toggle('gun', pl.weapon === 'pistol' && !pl.inCar);
    ch.classList.toggle('aim', !!pl.aiming);
    // speedometer
    if (pl.inCar) {
      e.speedo.classList.remove('hidden');
      e.speed.textContent = Math.round(pl.car.speed * 3.6);
      e.carHp.style.width = pl.car.health + '%';
      e.carName.textContent = pl.car.T.label.toUpperCase();
    } else e.speedo.classList.add('hidden');
    if (CB.settings.showFps) { e.fps.classList.remove('hidden'); e.fps.textContent = game.engine.getFps().toFixed(0) + ' FPS'; }
    else e.fps.classList.add('hidden');
    this.drawMinimap(game);
    if (this.bigOpen) this.drawBigMap(game);
  };

  // World position → minimap screen position.
  function project(x, z, px, pz, yaw, s, cx, cy) {
    const ix = (x - px), iy = -(z - pz);
    const c = Math.cos(-yaw), sn = Math.sin(-yaw);
    return { x: cx + (ix * c - iy * sn) * s, y: cy + (ix * sn + iy * c) * s };
  }

  HUD.icons = function (game) {
    const out = [];
    for (const it of CB.Activities.list) {
      if (!it.icon || it.used || it.cool > game.time) continue;
      out.push({ x: it.x, z: it.z, icon: it.icon, color: it.color, always: it.mapAlways, near: it.near || 130, minor: it.minor });
    }
    const a = CB.Traffic.armored;
    if (a && !a.stolen) out.push({ x: a.x, z: a.z, icon: '🚚', color: '#f1c40f', always: true });
    for (const r of CB.City.ramps) if (!(r.cool > game.time)) out.push({ x: r.x, z: r.z, icon: '⤴', color: '#e67e22', near: 150 });
    return out;
  };

  HUD.drawMinimap = function (game) {
    const c = this.mmc, cv = this.mm, W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
    const pl = game.player, yaw = game.camYaw;
    const range = pl.inCar ? M.clamp(110 + pl.car.speed * 3, 110, 200) : 100;
    this._range = M.lerp(this._range || range, range, 0.05);
    const s = (W / 2) / this._range;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#1d6fa5'; c.fillRect(0, 0, W, H);
    c.translate(cx, cy); c.rotate(-yaw); c.scale(s, s);
    c.drawImage(this.mapImg, -(pl.x - MX0) * K / K, -(MZ1 - pl.z) * K / K, MW, MH);
    c.restore();
    c.save();
    c.beginPath(); c.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); c.clip();
    const P = CB.Police;
    // search / alert circles
    if (P.mode === 'search' || P.mode === 'alert') {
      const q = project(P.mode === 'search' ? P.lastX : P.alertX, P.mode === 'search' ? P.lastZ : P.alertZ, pl.x, pl.z, yaw, s, cx, cy);
      c.fillStyle = P.mode === 'search' ? 'rgba(255,60,60,0.22)' : 'rgba(255,200,40,0.2)';
      c.strokeStyle = P.mode === 'search' ? 'rgba(255,80,80,0.8)' : 'rgba(255,210,60,0.8)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(q.x, q.y, (40 + Math.sin(game.time * 4) * 3) * s, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // activity icons
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '15px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    const R2 = W / 2 - 12;
    for (const ic of this.icons(game)) {
      const d = M.dist(ic.x, ic.z, pl.x, pl.z);
      if (d > (ic.near || 130) && !ic.always) continue;
      let q = project(ic.x, ic.z, pl.x, pl.z, yaw, s, cx, cy);
      const dx = q.x - cx, dy = q.y - cy, dd = Math.hypot(dx, dy);
      if (dd > R2) { if (!ic.always) continue; q = { x: cx + dx / dd * R2, y: cy + dy / dd * R2 }; }
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.arc(q.x, q.y, 10, 0, Math.PI * 2); c.fill();
      c.strokeStyle = ic.color; c.lineWidth = 2; c.stroke();
      c.fillStyle = ic.color;
      c.fillText(ic.icon, q.x, q.y + 1);
    }
    // race checkpoint
    const race = CB.Activities.race;
    if (race) {
      const p = race.pts[race.k];
      let q = project(p.x, p.z, pl.x, pl.z, yaw, s, cx, cy);
      const dx = q.x - cx, dy = q.y - cy, dd = Math.hypot(dx, dy);
      if (dd > R2) q = { x: cx + dx / dd * R2, y: cy + dy / dd * R2 };
      c.fillStyle = '#ffd32a'; c.beginPath(); c.arc(q.x, q.y, 7, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke();
    }
    // police
    const flash = Math.floor(game.time * 5) % 2;
    const active = P.mode === 'chase' || P.mode === 'search';
    for (const u of P.foot) {
      const q = project(u.x, u.z, pl.x, pl.z, yaw, s, cx, cy);
      if (Math.hypot(q.x - cx, q.y - cy) > W / 2) continue;
      c.fillStyle = active ? (flash ? '#ff3b3b' : '#3b7bff') : '#7fa7ff';
      c.beginPath(); c.arc(q.x, q.y, 3.5, 0, Math.PI * 2); c.fill();
      if (u.sees) { c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke(); }
    }
    for (const u of P.cars) {
      if (u === pl.car) continue;
      const q = project(u.x, u.z, pl.x, pl.z, yaw, s, cx, cy);
      if (Math.hypot(q.x - cx, q.y - cy) > W / 2) continue;
      c.save(); c.translate(q.x, q.y); c.rotate(u.h - yaw);
      c.fillStyle = u.siren ? (flash ? '#3b7bff' : '#ff3b3b') : '#7fa7ff';
      c.fillRect(-3.5, -6, 7, 12);
      c.restore();
    }
    if (P.heli) {
      const q = project(P.heli.x, P.heli.z, pl.x, pl.z, yaw, s, cx, cy);
      c.font = '16px sans-serif'; c.fillText('🚁', M.clamp(q.x, 12, W - 12), M.clamp(q.y, 12, H - 12));
    }
    c.restore();
    // player arrow
    c.save(); c.translate(cx, cy); c.rotate((pl.inCar ? pl.car.h : pl.yaw) - yaw);
    c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6.5, 7); c.lineTo(0, 3.5); c.lineTo(-6.5, 7); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // north marker
    const n = project(pl.x, pl.z + 1000, pl.x, pl.z, yaw, 1, cx, cy);
    const nd = Math.hypot(n.x - cx, n.y - cy);
    const nx = cx + (n.x - cx) / nd * (W / 2 - 10), ny = cy + (n.y - cy) / nd * (W / 2 - 10);
    c.fillStyle = '#c8102e'; c.beginPath(); c.arc(nx, ny, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.fillText('N', nx, ny + 1);
  };

  HUD.toggleBigMap = function (on) {
    this.bigOpen = on == null ? !this.bigOpen : on;
    $('bigmapWrap').classList.toggle('hidden', !this.bigOpen);
    if (this.bigOpen) {
      this.big.width = Math.min(window.innerWidth - 40, 1100);
      this.big.height = Math.min(window.innerHeight - 120, this.big.width * MH / MW);
    }
  };
  HUD.drawBigMap = function (game) {
    const c = this.bigc, W = this.big.width, H = this.big.height;
    const s = Math.min(W / MW, H / MH);
    const ox = (W - MW * s) / 2, oy = (H - MH * s) / 2;
    c.fillStyle = '#123'; c.fillRect(0, 0, W, H);
    c.drawImage(this.mapImg, ox, oy, MW * s, MH * s);
    const X = (x) => ox + (x - MX0) * s, Y = (z) => oy + (MZ1 - z) * s;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '14px "Segoe UI Emoji", sans-serif';
    for (const ic of this.icons(game)) {
      if (ic.minor) continue;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.arc(X(ic.x), Y(ic.z), 9, 0, Math.PI * 2); c.fill();
      c.strokeStyle = ic.color; c.lineWidth = 2; c.stroke();
      c.fillStyle = ic.color; c.fillText(ic.icon, X(ic.x), Y(ic.z) + 1);
    }
    const P = CB.Police;
    for (const u of P.cars) { c.fillStyle = u.siren ? '#ff3b3b' : '#7fa7ff'; c.fillRect(X(u.x) - 3, Y(u.z) - 3, 6, 6); }
    for (const u of P.foot) { c.fillStyle = '#7fa7ff'; c.beginPath(); c.arc(X(u.x), Y(u.z), 2.5, 0, Math.PI * 2); c.fill(); }
    const pl = game.player;
    c.save(); c.translate(X(pl.x), Y(pl.z)); c.rotate(pl.inCar ? pl.car.h : pl.yaw);
    c.fillStyle = '#fff'; c.strokeStyle = '#c8102e'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.stroke(); c.fill();
    c.restore();
    c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.textAlign = 'left';
    c.fillText('LAKE MICHIGAN', X(C.SHORE + 20), Y(C.HALF * 0.8));
    c.fillText('THE LOOP', X(-40), Y(84));
    c.fillText('CHICAGO RIVER', X(40), Y(CB.City.rivers[0].z1 + 14));
  };
})(window.CB);

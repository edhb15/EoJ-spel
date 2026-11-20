// Chicago Bois – everything the player can do in the city: robberies, break-ins, vandalism,
// graffiti, street races, stunt jumps, speed cameras, hiding, food and disguises.
'use strict';
(function (CB) {
  const B = BABYLON, M = CB.M, C = CB.C;

  const STORE_TYPES = {
    corner: { dur: 3, heat: 25, cash: [250, 450], icon: '$', color: '#ff5252', names: ["LOU'S CORNER MART", 'QUIK-STOP MART', 'WINDY MART', "ROSIE'S MARKET", 'SOUTHSIDE GROCERY', '24/7 FOOD MART', 'BIG SHOULDERS MART', 'BRIDGEPORT MARKET', 'NORTH SIDE MART', "TONY'S FOOD & LIQ", 'LAKEVIEW MINI MART', 'PILSEN GROCERY'], label: 'corner store' },
    pizza: { dur: 3, heat: 25, cash: [180, 320], icon: '$', color: '#ff5252', names: ["DEEP DISH DAN'S", 'PIZZA PALACE', 'TAVERN THIN CRUST'], label: 'pizzeria', heal: 20 },
    pawn: { dur: 3.5, heat: 25, cash: [500, 800], icon: '$', color: '#ff5252', names: ['MAXWELL ST PAWN', 'RIVER PAWN & GOLD'], label: 'pawn shop' },
    electronics: { dur: 4.5, heat: 40, cash: [1200, 1800], icon: '📺', color: '#ff9f43', names: ['LAKESHORE ELECTRONICS', 'LOOP TECH', 'MAG MILE GADGETS'], label: 'electronics store', alarm: true },
    jewelry: { dur: 5, heat: 40, cash: [2000, 3000], icon: '💎', color: '#ff9f43', names: ['WINDY CITY JEWELS', 'GOLD COAST DIAMONDS', 'RIVERFRONT JEWELERS'], label: 'jewelry store', alarm: true },
    bank: { dur: 8, heat: 60, cash: [4500, 6000], icon: '🏦', color: '#ff3838', names: ['SECOND CITY SAVINGS', 'LAKESIDE TRUST BANK'], label: 'bank vault', alarm: true, big: true },
    thrift: { service: true, icon: '👕', color: '#3ddc84', names: ['MAXWELL ST THRIFT', 'WICKER PARK VINTAGE', 'LOGAN SQ SECONDHAND'] },
  };
  const DECOR = ['CAFE', 'BARBER', 'LAUNDROMAT', 'DELI', 'BOOKS', 'TACOS', 'DINER', 'HOUSE RECORDS', 'GYM', 'PHARMACY', 'HARDWARE',
    'ITALIAN BEEF', 'BLUES CLUB', 'JAZZ LOUNGE', 'BAKERY', 'DONUTS', 'FLOWERS', 'SHOES', 'TAILOR', 'POPCORN', 'PIEROGI', 'DIM SUM',
    'HOTEL', 'TATTOO', 'NAILS', 'COMICS', 'TAQUERIA', 'BAGELS', 'ARCADE', 'BIKES', 'OPTICIAN', 'SUSHI'];
  const NEON = [['#1b1035', '#ff3fa4'], ['#0b2433', '#3fe6ff'], ['#2b1405', '#ffb43f'], ['#0f2a12', '#7dff6b'], ['#2a0a0a', '#ff4b3f'], ['#16162e', '#c9a3ff'], ['#f4efe2', '#b3241b'], ['#0d1b3d', '#ffffff']];

  const A = CB.Activities = {
    list: [], hold: null, pick: null, race: null, recent: {}, stats: { crimes: 0 }, keepers: [],
  };

  // ------------------------------------------------------------------ setup
  A.init = function (scene) {
    const City = CB.City, P = CB.Pools;
    const R = CB.rng(606);
    const labels = [];
    const addLabel = (text) => { const nc = NEON[labels.length % NEON.length]; labels.push({ text, bg: nc[0], fg: nc[1] }); return labels.length - 1; };
    // ----- assign storefronts
    const fronts = City.storefronts.slice();
    for (let i = fronts.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = fronts[i]; fronts[i] = fronts[j]; fronts[j] = t; }
    const chosen = [];
    const take = (type, n, filter) => {
      const T = STORE_TYPES[type];
      let k = 0;
      for (const f of fronts) {
        if (k >= n) break;
        if (f.used || !f.room || (filter && !filter(f))) continue;
        if (chosen.some((c) => M.dist(c.x, c.z, f.x, f.z) < 45)) continue;
        f.used = true; f.type = type; f.name = T.names[k % T.names.length];
        f.label = addLabel(f.name);
        chosen.push(f); k++;
      }
    };
    take('bank', 2, (f) => f.downtown);
    take('jewelry', 3, (f) => f.downtown || f.district === 'shops');
    take('electronics', 3);
    take('corner', 12, (f) => !f.downtown);
    take('pizza', 3);
    take('pawn', 2);
    take('thrift', 3, (f) => !f.downtown);
    const decorIdx = DECOR.map((d) => addLabel(d));
    const decorFronts = [];
    for (const f of fronts) if (!f.used) { f.label = decorIdx[Math.floor(R() * decorIdx.length)]; decorFronts.push(f); }
    // furnish every walk-in room, then build the interior meshes + navigation grid
    for (const r of City.rooms) City.furnish(r, r.sf && r.sf.type ? r.sf.type : r.kind === 'house' ? 'house' : 'shop');
    City.finishInteriors(scene);
    City.buildSigns(scene, labels);

    // ----- interactables
    this.list = [];
    for (const f of chosen) {
      const T = STORE_TYPES[f.type];
      // the interaction spot is inside, in front of the counter (the bank: at the vault)
      const rm = f.room;
      const it = this.add({
        kind: f.type === 'thrift' ? 'thrift' : 'store', store: f, T, x: rm.spot[0], z: rm.spot[1], r: 2.0,
        name: f.name, icon: T.icon, color: T.color, ring: T.service ? 'green' : 'red', mapAlways: !!T.big || f.type === 'jewelry' || f.type === 'electronics',
      });
      // cashier behind the counter
      const keeper = new CB.Ped(CB.randomLook());
      const kp = rm.keeper || City.roomPoint(rm, 0, rm.Dl - 0.9);
      keeper.x = kp[0]; keeper.z = kp[1]; keeper.y = f.yb;
      keeper.yaw = rm.keeperYaw; keeper.mode = 'idle'; keeper.pose = 'walk';
      it.keeper = keeper;
      this.keepers.push(keeper);
    }
    // walk-in apartments: search them for valuables
    for (const r of City.rooms) {
      if (r.kind !== 'house') continue;
      this.add({ kind: 'loot', room: r, x: r.spot[0], z: r.spot[1], r: 1.7, name: 'apartment', icon: '🏠', color: '#ff9f43', ring: 'red', ringSize: 1.8, near: 50, minor: true });
    }
    // ATMs on some decor storefront walls
    let atms = 0;
    for (const f of decorFronts) {
      if (atms >= 11 || chosen.some((c) => M.dist(c.x, c.z, f.x, f.z) < 30)) continue;
      if (R() > 0.25) continue;
      const ax = f.cx + f.ux * (f.w / 2 + 0.3) + f.nx * 0.2, az = f.cz + f.uz * (f.w / 2 + 0.3) + f.nz * 0.2;
      P.sBox.add(ax, f.yb + 1.2, az, Math.abs(f.ux) > 0.5 ? 0.8 : 0.4, 1.6, Math.abs(f.ux) > 0.5 ? 0.4 : 0.8, [0.2, 0.35, 0.6]);
      P.sLamp.add(ax + f.nx * 0.21, f.yb + 1.55, az + f.nz * 0.21, Math.abs(f.ux) > 0.5 ? 0.5 : 0.02, 0.3, Math.abs(f.ux) > 0.5 ? 0.02 : 0.5);
      this.add({ kind: 'atm', x: ax + f.nx * 1.2, z: az + f.nz * 1.2, r: 1.8, name: 'ATM', icon: '$', color: '#ff7675', ring: 'red' });
      atms++;
    }
    // break-ins: a selection of back doors, all warehouses, penthouses
    // spread apartment break-ins out (at most one per ~90 m)
    const apt = [];
    for (const b of City.breakins.filter((q) => q.kind === 'apartment')) if (!apt.some((a) => M.dist(a.x, a.z, b.x, b.z) < 90)) apt.push(b);
    for (let i = 0; i < apt.length; i++) this.add({ kind: 'breakin', b: apt[i], x: apt[i].x, z: apt[i].z, r: 1.8, name: 'apartment back door', icon: '🔓', color: '#ff7675', ring: 'red', heat: 25, cash: [300, 900] });
    for (const b of City.breakins.filter((q) => q.kind === 'warehouse')) this.add({ kind: 'breakin', b, x: b.x, z: b.z, r: 2.2, name: 'warehouse loading dock', icon: '🔓', color: '#ff9f43', ring: 'red', heat: 40, cash: [1000, 1600], hard: true });
    for (const b of City.breakins.filter((q) => q.kind === 'penthouse')) this.add({ kind: 'breakin', b, x: b.x, z: b.z, r: 1.8, name: 'penthouse service door', icon: '🔓', color: '#ff9f43', ring: 'red', heat: 40, cash: [2000, 3000], hard: true });
    // graffiti spots
    const tagSpots = [];
    for (const g of City.graffiti) if (!tagSpots.some((t) => M.dist(t.x, t.z, g.x, g.z) < 70)) tagSpots.push(g);
    for (const g of tagSpots) this.add({ kind: 'graffiti', g, x: g.x, z: g.z, r: 1.8, name: 'wall', icon: '🎨', color: '#a29bfe', ring: 'red', near: 60, minor: true });
    // hot dog stands
    for (const h of City.hotdogs) this.add({ kind: 'hotdog', x: h.x, z: h.z, r: 2.0, name: 'Chi-Dogs stand', icon: '🌭', color: '#3ddc84', ring: 'green' });
    // races
    for (const r of City.raceStarts) this.add({ kind: 'race', rs: r, x: r.x, z: r.z, r: 6, name: r.name, icon: '🏁', color: '#ffd32a', ring: 'yellow', ringSize: 9, mapAlways: true });
    // dumpsters (no rings; prompt only)
    for (const d of City.dumpsters) this.add({ kind: 'dumpster', d, x: d.x, z: d.z, r: Math.max(d.w, d.d) / 2 + 1.2, name: 'dumpster', noRing: true });
    for (const r of City.ramps) r.icon = true;

    // rings
    for (const it of this.list) this.placeRing(it, true);

    // race checkpoint beam
    const beamMat = new B.StandardMaterial('beam', scene);
    beamMat.disableLighting = true; beamMat.emissiveColor = new B.Color3(1, 0.85, 0.2); beamMat.alpha = 0.35; beamMat.backFaceCulling = false;
    this.beam = B.MeshBuilder.CreateCylinder('beam', { height: 60, diameter: 9, tessellation: 24, cap: B.Mesh.NO_CAP }, scene);
    this.beam.material = beamMat; this.beam.isPickable = false; this.beam.setEnabled(false);
    this.beamRing = B.MeshBuilder.CreateTorus('beamRing', { diameter: 10, thickness: 0.5, tessellation: 32 }, scene);
    const rm = new B.StandardMaterial('beamRingMat', scene); rm.disableLighting = true; rm.emissiveColor = new B.Color3(1, 0.9, 0.3);
    this.beamRing.material = rm; this.beamRing.isPickable = false; this.beamRing.setEnabled(false);
    this.glowMeshes = [this.beamRing];
    this.graffitiTex = CB.CityTex.graffiti(scene);
    this.graffitiMat = new B.StandardMaterial('graffitiMat', scene);
    this.graffitiMat.diffuseTexture = this.graffitiTex; this.graffitiMat.useAlphaFromDiffuseTexture = true;
    this.graffitiMat.diffuseTexture.hasAlpha = true; this.graffitiMat.specularColor = new B.Color3(0, 0, 0);
    this.graffitiMat.emissiveColor = new B.Color3(0.25, 0.25, 0.25);
    this.tags = [];
  };

  A.add = function (o) {
    o.id = this.list.length; o.cool = 0; o.used = false; o.ringSlot = -1;
    this.list.push(o);
    return o;
  };
  A.placeRing = function (it, show) {
    if (it.noRing) return;
    const P = CB.Pools;
    const pool = it.ring === 'green' ? P.ringGreen : it.ring === 'yellow' ? P.ringYellow : P.ringRed;
    if (it.ringSlot < 0) it.ringSlot = pool.alloc();
    it.ringPool = pool;
    const s = it.ringSize || 2.6;
    if (show) CB.placeSlot(pool, it.ringSlot, it.x, CB.City.groundY(it.x, it.z) + 0.04, it.z, s, 1, s);
    else pool.hide(it.ringSlot);
  };

  A.reset = function () {
    this.hold = null; this.pick = null; this.endRace(false, true);
    this.recent = {}; this.stats = { crimes: 0 };
    for (const it of this.list) { it.cool = 0; it.used = false; this.placeRing(it, true); if (it.keeper) it.keeper.pose = 'walk'; }
    for (const t of this.tags) t.dispose();
    this.tags = [];
    for (const p of CB.City.props) restoreProp(p);
    CB.Audio.loop('alarm', 0); CB.Audio.loop('spray', 0);
  };

  // Is this interactable usable right now? returns true or a reason string.
  function available(it, game) {
    const pl = game.player;
    if (it.used) return 'Already done';
    if (it.cool > game.time) return 'Come back in ' + Math.ceil(it.cool - game.time) + 's';
    if (it.kind === 'race') return pl.inCar ? true : 'Get a car to start the race';
    if (pl.inCar) return false;
    return true;
  }

  function promptFor(it, game) {
    switch (it.kind) {
      case 'store': return `Rob ${it.name} <span class="heat">+${it.T.heat}% heat</span>`;
      case 'thrift': return `Buy a disguise at ${it.name} <span class="cost">$100</span>`;
      case 'atm': return 'Hack the ATM <span class="heat">+25% heat</span>';
      case 'breakin': return `${game.player.weapon === 'crowbar' ? 'Pry open' : 'Break into'} the ${it.name} <span class="heat">+${it.heat}% heat</span>`;
      case 'graffiti': return 'Spray a tag <span class="heat">+10% heat</span>';
      case 'hotdog': return 'Buy a Chicago-style hot dog <span class="cost">$15</span>';
      case 'loot': return 'Search the apartment for valuables <span class="heat">+10% heat</span>';
      case 'race': return `Start street race: ${it.name} <span class="heat">+40% heat</span>`;
      case 'dumpster': return game.player.hidden ? 'Climb out of the dumpster' : 'Hide in the dumpster';
      default: return it.name;
    }
  }

  // Finds the best interaction target near the player (activities, props, cars).
  A.query = function (game) {
    const pl = game.player;
    if (pl.hidden) return pl.hideIt ? { it: pl.hideIt, text: promptFor(pl.hideIt, game), ok: true } : null;
    let best = null, bd = 1e9;
    for (const it of this.list) {
      const d = M.dist(it.x, it.z, pl.x, pl.z);
      if (d > it.r || d >= bd) continue;
      const av = available(it, game);
      if (av === false) continue;
      best = { it, ok: av === true, text: av === true ? promptFor(it, game) : av, d };
      bd = d;
    }
    if (!pl.inCar) {
      // breakable street props
      const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
      CB.City.nearProps(pl.x, pl.z, 2, (p) => {
        if (p.broken) return;
        const d = M.dist(p.x, p.z, pl.x, pl.z) - p.r;
        if (d > 1.3 || d + 0.5 >= bd) return;
        if ((p.x - pl.x) * fx + (p.z - pl.z) * fz < -0.3) return;
        const name = { hydrant: 'fire hydrant', meter: 'parking meter', newsbox: 'newspaper box', phone: 'phone booth', trash: 'trash can', mailbox: 'mailbox' }[p.kind];
        best = { prop: p, ok: true, text: `Smash the ${name} <span class="heat">+${p.kind === 'trash' ? 5 : 10}% heat</span>`, d: d + 0.5 };
        bd = d + 0.5;
      });
    }
    return best;
  };

  // ------------------------------------------------------------------ E pressed
  A.interact = function (q, game) {
    const pl = game.player;
    if (q.prop) { kickProp(q.prop, game); return; }
    const it = q.it;
    if (!q.ok) { CB.Audio.play('fail', 0.5); return; }
    const face = () => { pl.yaw = Math.atan2(it.x - pl.x, it.z - pl.z); };
    switch (it.kind) {
      case 'store': {
        const f = it.store;
        pl.yaw = Math.atan2(-f.nx, -f.nz);
        const T = it.T;
        const kx = it.keeper ? it.keeper.x : f.x, kz = it.keeper ? it.keeper.z : f.z;
        this.startHold(it, T.dur, `Robbing ${it.name}…`, 'grab', game, {
          tick: (t, dt) => {
            if (it.keeper) it.keeper.pose = 'handsup';
            if (Math.random() < dt * 6) CB.FX.burst('money', kx, f.yb + 1.3, kz, 3);
          },
          start: () => {
            game.raiseAlarm(f.x, f.z, !!T.alarm, `${it.name} is being robbed`);
            if (T.alarm) CB.Audio.loop('alarm', 0.09);
          },
          done: () => {
            const cash = M.randInt(T.cash[0], T.cash[1]);
            CB.FX.burst('money', kx, f.yb + 1.4, kz, 60);
            CB.Audio.play('cash', 1);
            game.reward(T.heat, cash, `Robbed ${it.name}`, it.icon);
            if (T.heal) game.heal(T.heal, 'Grabbed a free deep dish slice too 🍕');
            it.cool = game.time + (T.big ? 300 : 210);
            this.placeRing(it, false);
            setTimeout(() => CB.Audio.loop('alarm', 0), T.alarm ? 6000 : 0);
          },
          cancel: () => { CB.Audio.loop('alarm', 0); if (it.keeper) it.keeper.pose = 'walk'; },
        });
        break;
      }
      case 'atm':
        face();
        this.startHold(it, 3.2, 'Hacking the ATM…', 'work', game, {
          tick: (t, dt) => { if (Math.random() < dt * 3) CB.Audio.play('beep', 0.4); },
          start: () => game.raiseAlarm(it.x, it.z, false, 'ATM tampering'),
          done: () => {
            const cash = M.randInt(300, 700);
            CB.FX.burst('money', it.x, 1.4, it.z, 40);
            CB.Audio.play('cash', 0.9);
            game.reward(25, cash, 'Hacked an ATM', '$');
            it.cool = game.time + 240; this.placeRing(it, false);
          },
        });
        break;
      case 'graffiti':
        pl.yaw = Math.atan2(-it.g.nx, -it.g.nz);
        this.startHold(it, 2.6, 'Spraying a tag…', 'spray', game, {
          tick: (t, dt) => {
            CB.Audio.loop('spray', 0.12);
            if (Math.random() < dt * 20) CB.FX.burst('spray', pl.x + Math.sin(pl.yaw) * 0.5, 1.5, pl.z + Math.cos(pl.yaw) * 0.5, 2, Math.sin(pl.yaw), Math.cos(pl.yaw));
          },
          start: () => game.raiseAlarm(it.x, it.z, false, 'vandalism'),
          done: () => {
            CB.Audio.loop('spray', 0);
            this.makeTag(it.g);
            game.reward(10, 0, 'Tagged a wall', '🎨', 'graffiti');
            it.used = true; this.placeRing(it, false);
          },
          cancel: () => CB.Audio.loop('spray', 0),
        });
        break;
      case 'breakin':
        face();
        if (pl.weapon === 'crowbar') {
          // the crowbar skips the lock-picking: just pry the door open
          this.startHold(it, it.hard ? 3.2 : 2.4, 'Prying the door open…', 'work', game, {
            start: () => { CB.Audio.play('click', 0.8); game.raiseAlarm(it.x, it.z, false, 'break-in'); },
            tick: (t, dt) => { if (Math.random() < dt * 3) CB.Audio.play('click', 0.6); },
            done: () => {
              CB.Audio.play('door', 1, it.x, it.z, 20);
              const cash = M.randInt(it.cash[0], it.cash[1]);
              CB.FX.burst('money', it.b.wx, 1.3, it.b.wz, 40);
              game.reward(it.heat, cash, `Pried open a ${it.name}`, '🔧');
              it.cool = game.time + 300; this.placeRing(it, false);
            },
          });
        } else this.startLockpick(it, game);
        break;
      case 'loot': {
        face();
        this.startHold(it, 2.6, 'Searching the drawers…', 'grab', game, {
          start: () => { CB.Audio.play('door', 0.6); game.raiseAlarm(it.x, it.z, false, 'burglary'); },
          tick: (t, dt) => { if (Math.random() < dt * 3) CB.Audio.play('thud', 0.25); if (Math.random() < dt * 4) CB.FX.burst('paper', it.x, 1.0, it.z, 2); },
          done: () => {
            const cash = Math.random() < 0.15 ? M.randInt(300, 700) : M.randInt(40, 260);
            CB.FX.burst('money', it.x, 1.2, it.z, 30);
            CB.Audio.play('cash', 0.8);
            game.reward(10, cash, cash >= 300 ? 'Found a stash under the mattress!' : 'Burgled an apartment', '🏠', 'burglary');
            it.cool = game.time + 600; this.placeRing(it, false);
          },
        });
        break;
      }
      case 'hotdog':
        if (pl.health >= 100) { CB.HUD.notify('🌭 Not hungry', 'Come back when you\'re hurt.', 'yellow'); return; }
        if (game.cash < 15) { CB.HUD.notify('💸 Not enough cash', 'A Chicago dog costs $15.', 'yellow'); return; }
        game.cash -= 15;
        CB.Audio.play('munch', 1);
        pl.poseT = 1.2; pl.pose = 'eat';
        game.heal(40, 'Chicago-style hot dog: no ketchup! +40 health');
        break;
      case 'thrift': {
        if (CB.Police.mode === 'chase' && CB.Police.anySees) { CB.HUD.notify('👀 They can see you!', 'Lose the cops before changing clothes.', 'red'); CB.Audio.play('fail', 0.6); return; }
        if (game.cash < 100) { CB.HUD.notify('💸 Not enough cash', 'A disguise costs $100.', 'yellow'); return; }
        game.cash -= 100;
        game.disguise();
        it.cool = game.time + 45;
        break;
      }
      case 'race':
        this.startRace(it, game);
        break;
      case 'dumpster':
        game.toggleHide(it);
        break;
    }
  };

  // ------------------------------------------------------------------ hold-E actions
  A.startHold = function (it, dur, label, pose, game, cb) {
    this.hold = { it, dur, t: 0, label, pose, cb, x: game.player.x, z: game.player.z };
    if (cb.start) cb.start();
    CB.HUD.progress(label, 0);
  };
  A.cancelHold = function (why) {
    const h = this.hold;
    if (!h) return;
    if (h.cb.cancel) h.cb.cancel();
    this.hold = null;
    CB.HUD.progress(null);
    if (why) CB.HUD.notify('✋ ' + why, '', 'yellow');
  };

  // ------------------------------------------------------------------ lockpicking
  A.startLockpick = function (it, game) {
    this.pick = { it, needle: 0, dir: 1, speed: it.hard ? 1.5 : 1.15, hits: 0, misses: 0, need: 3, zone: newZone(it.hard ? 0.13 : 0.18) };
    CB.HUD.lockpick(this.pick);
    game.raiseAlarm(it.x, it.z, false, 'break-in', true);
    CB.Audio.play('click', 0.6);
  };
  function newZone(w) { const a = M.rand(0.1, 0.9 - w); return [a, a + w]; }
  A.pickPress = function (game) {
    const p = this.pick;
    if (!p) return false;
    if (p.needle >= p.zone[0] && p.needle <= p.zone[1]) {
      p.hits++;
      CB.Audio.play('unlock', 0.7);
      if (p.hits >= p.need) {
        const it = p.it;
        this.pick = null; CB.HUD.lockpick(null);
        CB.Audio.play('door', 1, it.x, it.z, 20);
        const cash = M.randInt(it.cash[0], it.cash[1]);
        CB.FX.burst('money', it.b.wx, 1.3, it.b.wz, 40);
        game.reward(it.heat, cash, `Broke into a ${it.name}`, '🔓');
        it.cool = game.time + 300; this.placeRing(it, false);
        return true;
      }
      p.zone = newZone(it_w(p)); p.speed *= 1.25;
    } else {
      p.misses++;
      CB.Audio.play('fail', 0.6);
      CB.FX.shake(0.15);
      if (p.misses >= 2) {
        const it = p.it;
        this.pick = null; CB.HUD.lockpick(null);
        CB.HUD.notify('🚨 Alarm tripped!', 'The lock jammed – the cops are on their way.', 'red');
        CB.Audio.play('alarmCar', 0.8, it.x, it.z, 60);
        game.raiseAlarm(it.x, it.z, true, 'break-in alarm');
        it.cool = game.time + 40;
        return true;
      }
    }
    CB.HUD.lockpick(p);
    return true;
  };
  function it_w(p) { return p.it.hard ? 0.11 : 0.15; }
  A.cancelPick = function () { if (this.pick) { this.pick = null; CB.HUD.lockpick(null); } };

  // ------------------------------------------------------------------ props
  function kickProp(p, game) {
    const pl = game.player;
    pl.yaw = Math.atan2(p.x - pl.x, p.z - pl.z);
    pl.pose = 'kick'; pl.poseT = 0.35;
    setTimeout(() => {
      if (p.broken) return;
      breakProp(p, Math.sin(pl.yaw) * 3, Math.cos(pl.yaw) * 3, game, true);
    }, 160);
  }
  function breakProp(p, vx, vz, game, byPlayer) {
    if (p.broken) return;
    p.broken = true; p.t = 0; p.respawn = game.time + 100;
    p.vx = vx; p.vz = vz; p.vy = 3 + Math.hypot(vx, vz) * 0.3; p.spin = M.rand(4, 10);
    const y = p.y + 0.6;
    const heat = p.kind === 'trash' ? 5 : 10;
    switch (p.kind) {
      case 'hydrant': CB.FX.geyser(p.x, p.z, 22); CB.Audio.play('splash', 1, p.x, p.z, 60); CB.Audio.play('thud', 0.8, p.x, p.z, 40); break;
      case 'phone': CB.FX.burst('glass', p.x, 1.4, p.z, 70); CB.Audio.play('glass', 1, p.x, p.z, 60); break;
      case 'meter': CB.FX.burst('coins', p.x, y + 0.6, p.z, 30); CB.Audio.play('coin', 1, p.x, p.z, 30); game.cash += M.randInt(10, 40); break;
      case 'newsbox': case 'mailbox': CB.FX.burst('paper', p.x, y, p.z, 40); CB.Audio.play('thud', 0.8, p.x, p.z, 40); break;
      default: CB.FX.burst('trash', p.x, y, p.z, 35); CB.Audio.play('thud', 0.7, p.x, p.z, 40);
    }
    if (byPlayer) {
      const names = { hydrant: 'Busted a fire hydrant', phone: 'Smashed a phone booth', meter: 'Wrecked a parking meter', newsbox: 'Trashed a newspaper box', mailbox: 'Knocked over a mailbox', trash: 'Kicked over a trash can' };
      game.raiseAlarm(p.x, p.z, false, 'property damage');
      game.reward(heat, 0, names[p.kind], '💥', 'damage');
    }
  }
  A.breakProp = breakProp;
  function restoreProp(p) {
    p.broken = false; p.x = p.x0; p.z = p.z0; p.y = C.CURB;
    const r = p.rig; r.x = p.x; r.y = p.y; r.z = p.z; r.pitch = 0; r.roll = 0; r.yaw = p.yaw; r.update();
  }
  function updateProps(dt, game) {
    for (const p of CB.City.props) {
      if (!p.broken) continue;
      p.t += dt;
      if (p.t < 4) {
        p.vy -= 20 * dt;
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        const gy = CB.City.groundY(p.x, p.z);
        if (p.y < gy) { p.y = gy; p.vy = Math.abs(p.vy) > 2 ? -p.vy * 0.3 : 0; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; }
        const r = p.rig;
        r.x = p.x; r.y = p.y; r.z = p.z;
        r.pitch = M.lerp(r.pitch, Math.PI / 2, Math.min(1, dt * p.spin * 0.6));
        r.yaw += p.spin * dt * 0.3;
        r.update();
      }
      if (game.time > p.respawn && M.dist(p.x0, p.z0, game.player.x, game.player.z) > 70) restoreProp(p);
    }
  }

  // Cars smashing props.
  A.carVsProps = function (car, game, byPlayer) {
    const sp = car.speed;
    if (sp < 3) return;
    const c = car.circles();
    CB.City.nearProps(car.x, car.z, car.L, (p) => {
      if (p.broken) return;
      for (let k = 0; k < 3; k++) {
        if (M.dist(c[k][0], c[k][1], p.x, p.z) < c[3] + p.r) {
          breakProp(p, car.vx * 0.8 + M.rand(-2, 2), car.vz * 0.8 + M.rand(-2, 2), game, byPlayer);
          car.vx *= 0.93; car.vz *= 0.93;
          if (byPlayer) CB.FX.shake(0.1);
          return;
        }
      }
    });
  };
  // Keep walkers out of unbroken props.
  A.pushOutOfProps = function (o, r) {
    CB.City.nearProps(o.x, o.z, 1.5, (p) => {
      if (p.broken) return;
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz), m = r + p.r;
      if (d < m && d > 0.001) { o.x = p.x + dx / d * m; o.z = p.z + dz / d * m; }
    });
  };

  // ------------------------------------------------------------------ graffiti tags
  A.makeTag = function (g) {
    const v = Math.floor(Math.random() * 4);
    const u0 = (v % 2) * 0.5, u1 = u0 + 0.5, v1 = 1 - Math.floor(v / 2) * 0.5, v0 = v1 - 0.5;
    const geo = new CB.Geo();
    const rx = -g.nz, rz = g.nx, w = 2.6, h = 1.3;
    const o = 0.06;
    const bx = g.wx + g.nx * o, bz = g.wz + g.nz * o;
    geo.quad([bx - rx * w / 2, g.y - h / 2, bz - rz * w / 2], [bx + rx * w / 2, g.y - h / 2, bz + rz * w / 2],
      [bx + rx * w / 2, g.y + h / 2, bz + rz * w / 2], [bx - rx * w / 2, g.y + h / 2, bz - rz * w / 2], [g.nx, 0, g.nz], [1, 1, 1], [u0, v0, u1, v0, u1, v1, u0, v1]);
    const m = geo.build('tag', CB.game.scene, this.graffitiMat);
    m.receiveShadows = true;
    this.tags.push(m);
  };

  // ------------------------------------------------------------------ street races
  A.startRace = function (it, game) {
    const rs = it.rs;
    let i = rs.node[0], j = rs.node[1], d = -1;
    const pts = [];
    for (let k = 0; k < 9; k++) {
      const opts = [];
      for (let nd = 0; nd < 4; nd++) {
        if (!CB.validDir(i, j, nd) || (d >= 0 && nd === ((d + 2) & 3))) continue;
        const ni = i + CB.DIRS[nd][0], nj = j + CB.DIRS[nd][1];
        if (pts.some((p) => p.i === ni && p.j === nj)) continue;
        opts.push(nd);
      }
      if (!opts.length) break;
      // prefer straights so races feel fast
      d = opts.includes(d) && Math.random() < 0.55 ? d : M.pick(opts);
      i += CB.DIRS[d][0]; j += CB.DIRS[d][1];
      const n = CB.nodePos(i, j);
      pts.push({ i, j, x: n.x, z: n.z });
    }
    let dist = M.dist(game.player.x, game.player.z, pts[0].x, pts[0].z);
    for (let k = 1; k < pts.length; k++) dist += M.dist(pts[k - 1].x, pts[k - 1].z, pts[k].x, pts[k].z);
    this.race = { it, pts, k: 0, t: -3, limit: dist / 21 + 9, beep: 3 };
    it.cool = game.time + 120;
    this.placeRing(it, false);
    CB.HUD.notify('🏁 ' + it.name, `Hit ${pts.length} checkpoints before the clock runs out!`, 'yellow');
    this.beam.setEnabled(true); this.beamRing.setEnabled(true);
    this.moveBeam();
    game.raiseAlarm(it.x, it.z, false, 'street racing');
  };
  A.moveBeam = function () {
    const r = this.race;
    const p = r.pts[r.k];
    this.beam.position.set(p.x, 30, p.z);
    this.beamRing.position.set(p.x, 2.5, p.z);
  };
  A.endRace = function (won, silent) {
    const r = this.race;
    this.race = null;
    if (this.beam) { this.beam.setEnabled(false); this.beamRing.setEnabled(false); }
    CB.HUD.race(null);
    if (!r || silent) return;
    if (r.it) this.placeRing(r.it, true);
  };
  function updateRace(dt, game) {
    const r = A.race;
    if (!r) return;
    const pl = game.player;
    r.t += dt;
    if (r.t < 0) {
      const b = Math.ceil(-r.t);
      if (b < r.beep) { r.beep = b; CB.Audio.play('countdown', 1); CB.HUD.banner(String(b), '', 0.8); }
      CB.HUD.race({ left: r.limit, k: 0, n: r.pts.length });
      return;
    }
    if (r.beep > 0) { r.beep = 0; CB.Audio.play('go', 1); CB.HUD.banner('GO!', '', 0.8); }
    const left = r.limit - r.t;
    CB.HUD.race({ left, k: r.k, n: r.pts.length });
    A.beamRing.rotation.y += dt;
    A.beamRing.position.y = 2.5 + Math.sin(game.time * 3) * 0.4;
    if (!pl.inCar) { A.endRace(false); CB.HUD.notify('🏁 Race abandoned', 'You left your car.', 'yellow'); return; }
    if (left <= 0) { A.endRace(false); CB.HUD.notify('⏱️ Out of time!', 'Race failed – try again later.', 'yellow'); CB.Audio.play('fail', 1); return; }
    const p = r.pts[r.k];
    if (M.dist(pl.x, pl.z, p.x, p.z) < 10) {
      r.k++;
      CB.Audio.play('ding', 1);
      if (r.k >= r.pts.length) {
        const it = r.it;
        A.endRace(true);
        CB.FX.confetti(pl.x, pl.z, 2.5);
        game.raiseAlarm(pl.x, pl.z, false, 'street racing');
        game.reward(40, 1500, `Won the ${it.name} with ${left.toFixed(1)}s to spare`, '🏁');
        return;
      }
      A.moveBeam();
    }
  }

  // ------------------------------------------------------------------ passive triggers
  function updatePassive(dt, game) {
    const pl = game.player;
    if (!pl.inCar) return;
    const car = pl.car;
    const v = car.speed;
    for (const s of CB.City.speedCams) {
      if (s.cool > game.time) continue;
      const d = s.roadX != null ? Math.abs(pl.x - s.roadX) < 9 && Math.abs(pl.z - s.z) < 6 : Math.abs(pl.z - s.roadZ) < 9 && Math.abs(pl.x - s.x) < 6;
      if (d && v > 25) {
        s.cool = game.time + 30;
        CB.FX.flash('#ffffff', 0.85);
        CB.Audio.play('flash', 1);
        game.raiseAlarm(pl.x, pl.z, true, 'speeding');
        game.reward(10, 0, `Speed camera: ${Math.round(v * 3.6)} km/h!`, '📸', 'speed');
      }
    }
  }
  A.onLand = function (car, airT, game) {
    const rp = car.lastRamp;
    car.lastRamp = null;
    if (!rp || airT < 0.6) return;
    if (rp.cool > game.time) { CB.HUD.notify(`🛞 Nice jump! ${airT.toFixed(1)}s`, 'Stunt bonus recharges soon.', 'yellow'); return; }
    rp.cool = game.time + 90;
    CB.FX.burst('dust', car.x, car.y + 0.3, car.z, 30);
    game.raiseAlarm(car.x, car.z, false, 'reckless stunt');
    game.reward(25, 250, `STUNT JUMP! ${airT.toFixed(1)}s of airtime`, '🛞');
  };

  // ------------------------------------------------------------------ per frame
  A.update = function (dt, game) {
    const pl = game.player;
    // hold action
    const h = this.hold;
    if (h) {
      const moved = M.dist(pl.x, pl.z, h.x, h.z) > 1.2;
      if (!game.keys.KeyE || moved || pl.inCar || pl.dead) this.cancelHold(moved ? 'Interrupted' : 'Cancelled');
      else {
        h.t += dt;
        pl.pose = h.pose; pl.poseT = 0.1;
        if (h.cb.tick) h.cb.tick(h.t, dt);
        CB.HUD.progress(h.label, h.t / h.dur);
        if (h.t >= h.dur) { this.hold = null; CB.HUD.progress(null); h.cb.done(); }
      }
    }
    // lockpick needle
    const p = this.pick;
    if (p) {
      p.needle += p.dir * p.speed * dt;
      if (p.needle > 1) { p.needle = 1; p.dir = -1; }
      if (p.needle < 0) { p.needle = 0; p.dir = 1; }
      pl.pose = 'work'; pl.poseT = 0.1;
      if (M.dist(pl.x, pl.z, p.it.x, p.it.z) > p.it.r + 1) this.cancelPick();
      else CB.HUD.lockpick(p);
    }
    updateProps(dt, game);
    updateRace(dt, game);
    updatePassive(dt, game);
    // shopkeepers (only animate nearby ones)
    for (const k of this.keepers) {
      if (M.dist2(k.x, k.z, pl.x, pl.z) > 90 * 90) { if (k.h.rig.visible) { k.h.setVisible(false); k.h.rig.update(); } continue; }
      if (!k.h.rig.visible) k.h.setVisible(true);
      k.update(dt);
    }
    if (!this.hold) for (const it of this.list) if (it.keeper && it.keeper.pose === 'handsup' && M.dist(pl.x, pl.z, it.x, it.z) > 8) it.keeper.pose = 'walk';
  };

  // Diminishing returns for repeated small crimes of the same kind within a minute.
  A.diminish = function (kind, heat, time) {
    if (!kind) return heat;
    const arr = (this.recent[kind] = (this.recent[kind] || []).filter((t) => time - t < 60));
    arr.push(time);
    return Math.max(2, heat * Math.pow(0.6, arr.length - 1));
  };
  A.STORE_TYPES = STORE_TYPES;
})(window.CB);

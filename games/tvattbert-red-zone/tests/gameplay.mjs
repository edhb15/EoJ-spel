// Automated gameplay test: drives the real game in headless Chromium and asserts that the
// core mechanics work. Usage: node tests/gameplay.mjs [outdir]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const out = process.argv[2] || 'tests/out/gp';
fs.mkdirSync(out, { recursive: true });
const port = 8300 + Math.floor(Math.random() * 500);
const server = spawn('node', ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('console', m => { const t = m.text(); if ((m.type() === 'error') && !t.includes('GPU stall')) errors.push(t); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
// wait until the game simulation has advanced by `sec` seconds (headless software rendering is slow)
const waitGame = async sec => { const t0 = await ev(() => window.__game.t); await page.waitForFunction(t => window.__game.t >= t, t0 + sec, { timeout: 240000, polling: 50 }); };
const shot = name => page.screenshot({ path: `${out}/${name}.png` });

await page.goto(`http://localhost:${port}/?quality=low`);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 });
check('Game loads to menu without errors', errors.length === 0, errors.join(' | '));
await page.click('#btn-new');
await wait(800);
check('New game starts', await ev(() => window.__game.state === 'playing'));

// --- world from STL
const w = await ev(() => { const g = window.__game; return { b: g.world.buildings.length, src: g.world.meta.source, water: g.world.water.length / 9, size: g.world.size }; });
check('World built from STL', w.b > 3000 && w.src.includes('gothenburg'), JSON.stringify(w));

// --- movement + collision
const m = await ev(async () => {
  const g = window.__game, p = g.player; const s = g.findOpenSpot(700, -1250); p.spawn(s.x, s.z, 0);
  return { x: p.pos.x, z: p.pos.z };
});
await page.keyboard.down('KeyW'); await waitGame(1.5); await page.keyboard.up('KeyW');
const m2 = await ev(() => { const p = window.__game.player; return { x: p.pos.x, z: p.pos.z, onGround: p.onGround }; });
const moved = Math.hypot(m2.x - m.x, m2.z - m.z);
check('Player walks forward (W)', moved > 2 && moved < 8 && m2.onGround, `moved ${moved.toFixed(2)} m`);
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await waitGame(1.5); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
const m3 = await ev(() => { const p = window.__game.player; return { x: p.pos.x, z: p.pos.z, st: p.stamina }; });
const sprint = Math.hypot(m3.x - m2.x, m3.z - m2.z);
check('Sprint is faster and costs stamina', sprint > moved * 1.3 && m3.st < 100, `sprint ${sprint.toFixed(2)} m, stamina ${m3.st.toFixed(0)}`);
const col = await ev(async () => {
  const g = window.__game, p = g.player;
  // find nearest building wall and walk into it
  let best = null;
  g.collision.forNear(p.pos.x, p.pos.z, 60, s => { if (s.owner && s.owner.verts && s.len > 6) { const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2; const d = Math.hypot(mx - p.pos.x, mz - p.pos.z); if (!best || d < best.d) best = { s, d, mx, mz }; } });
  const s = best.s; let nx = -(s.bz - s.az) / s.len, nz = (s.bx - s.ax) / s.len;
  // stand 4 m outside the wall facing it
  let sx = best.mx + nx * 4, sz = best.mz + nz * 4;
  if (!g.isWalkable(sx, sz)) { nx = -nx; nz = -nz; sx = best.mx + nx * 4; sz = best.mz + nz * 4; }
  p.spawn(sx, sz, Math.atan2(nx, nz));
  return { mx: best.mx, mz: best.mz, nx, nz };
});
await page.keyboard.down('KeyW'); await waitGame(2.5); await page.keyboard.up('KeyW');
const col2 = await ev(c => { const p = window.__game.player.pos; return (p.x - c.mx) * c.nx + (p.z - c.mz) * c.nz; }, col);
check('Building walls block the player', col2 > 0.2 && col2 < 1.5, `distance to wall ${col2.toFixed(2)} m`);
await page.keyboard.down('KeyC'); await waitGame(0.5);
const cr = await ev(() => window.__game.player.crouch);
await page.keyboard.up('KeyC');
check('Crouch works', cr > 0.9);
const jy0 = await ev(() => window.__game.player.pos.y);
await page.keyboard.down('Space'); await waitGame(0.12); await page.keyboard.up('Space');
const jy1 = await ev(() => window.__game.player.pos.y);
check('Jump works', jy1 - jy0 > 0.2, `+${(jy1 - jy0).toFixed(2)} m`);
await wait(800);

// --- shooting a zombie in the head
const tgt = await ev(() => {
  const g = window.__game, p = g.player; const s = g.findOpenSpot(-200, -1300); p.spawn(s.x, s.z, 0);
  for (const z of g.zombies.active) z.hp = -1, z.state = 7;
  const z = g.zombies.spawnActive('walker', p.pos.x, p.pos.z - 7, 'civil'); z.walkSpeed = 0; z.state = 0; z.stateT = 999;
  window.__tz = z; return { id: z.id };
});
await wait(300);
await ev(() => { const g = window.__game, p = g.player, z = window.__tz; const hb = g.zombies.hitboxes(z).head; const e = p.eye; p.yaw = Math.atan2(-(hb.x - e.x), -(hb.z - e.z)); p.pitch = Math.atan2(hb.y - e.y, Math.hypot(hb.x - e.x, hb.z - e.z)); g.weapons.select('pistol'); g.weapons.swap = 0; });
await wait(300);
await ev(() => { const g = window.__game, p = g.player, z = window.__tz; const hb = g.zombies.hitboxes(z).head; const e = p.eye; p.yaw = Math.atan2(-(hb.x - e.x), -(hb.z - e.z)); p.pitch = Math.atan2(hb.y - e.y, Math.hypot(hb.x - e.x, hb.z - e.z)); });
const mag0 = await ev(() => window.__game.weapons.mag);
await page.mouse.move(400, 225); await page.mouse.down({ button: 'right' }); await waitGame(0.4);
await ev(() => { const g = window.__game, p = g.player, z = window.__tz; const hb = g.zombies.hitboxes(z).head; const e = p.eye; p.yaw = Math.atan2(-(hb.x - e.x), -(hb.z - e.z)); p.pitch = Math.atan2(hb.y - e.y, Math.hypot(hb.x - e.x, hb.z - e.z)); });
await page.mouse.down(); await waitGame(0.05); await page.mouse.up(); await waitGame(0.2); await page.mouse.up({ button: 'right' });
const sh = await ev(() => ({ mag: window.__game.weapons.mag, hp: window.__tz.hp, state: window.__tz.state, kills: window.__game.stats.kills }));
check('Firing uses ammo', sh.mag === mag0 - 1, `mag ${mag0} -> ${sh.mag}`);
check('Headshot kills a walker', sh.state === 7 && sh.kills >= 1, JSON.stringify(sh));
await shot('01-headshot');
// --- reload
await ev(() => { window.__game.weapons.owned.pistol.mag = 3; window.__game.inventory.add('ammo_9mm', 20); });
const r0 = await ev(() => window.__game.weapons.reserve());
await page.keyboard.press('KeyR'); await waitGame(2.3);
const r1 = await ev(() => ({ mag: window.__game.weapons.mag, res: window.__game.weapons.reserve() }));
check('Reload fills magazine from reserve', r1.mag === 17 && r1.res === r0 - 14, JSON.stringify({ r0, ...r1 }));
// --- weapon pickup & switch
await ev(() => { const g = window.__game; g.loot.give([['w_shotgun', 1], ['ammo_12g', 8]], 'Test'); });
await page.keyboard.press('Digit3'); await waitGame(0.6);
check('Shotgun picked up and selected', await ev(() => window.__game.weapons.current === 'shotgun'));

// --- zombie AI: sees and chases
const ai = await ev(() => {
  const g = window.__game, p = g.player, e = p.eye;
  // pick a direction with a clear line of sight 16 m away
  let best = null;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    const x = p.pos.x + Math.sin(a) * 16, z = p.pos.z + Math.cos(a) * 16;
    if (!g.isWalkable(x, z)) continue;
    const y = g.world.groundHeight(x, z) + 1.6;
    if (g.collision.los(x, y, z, e.x, e.y, e.z)) { best = { x, z }; break; }
  }
  const z = g.zombies.spawnActive('walker', best.x, best.z, 'civil');
  z.yaw = Math.atan2(p.pos.x - z.x, p.pos.z - z.z); z.state = 0; z.stateT = 99; // idle, facing the player
  window.__cz = z; return Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
});
await waitGame(3.5);
const ai2 = await ev(() => { const g = window.__game, p = g.player, z = window.__cz; return { st: z.state, d: Math.hypot(z.x - p.pos.x, z.z - p.pos.z) }; });
check('Zombie spots and chases the player', (ai2.st === 3 || ai2.st === 4) && ai2.d < ai, `state ${ai2.st}, dist ${ai.toFixed(1)} -> ${ai2.d.toFixed(1)}`);
await shot('02-chase');
// --- hearing: gunshot noise draws a distant zombie
const hear = await ev(() => { const g = window.__game, p = g.player; const z = g.zombies.spawnActive('walker', p.pos.x + 40, p.pos.z + 30, 'civil'); z.yaw = Math.PI; z.state = 0; z.stateT = 99; g.noise(p.pos.x, p.pos.z, 90, 'gunshot'); return z.state; });
check('Gunshot noise makes zombies investigate', hear === 2);

// --- bite -> infection (real time)
await ev(() => { const g = window.__game; g.player.health = 100; for (const z of g.zombies.active) { z.state = 7; z.hp = -1; } window.__T = { ...window.__zt }; });
const bite = await ev(() => { const g = window.__game, Z = g.zombies; const T = { ...Object.values(Z.constructor ? {} : {})[0] }; const zt = { dmg: [5, 5], bite: 1 }; const z = Z.spawnActive('runner', g.player.pos.x, g.player.pos.z - 1, 'civil'); g.zombieHit(z, zt); return { active: g.infection.active, rem: g.infection.remainingMs(), hp: g.player.health }; });
check('Zombie bite infects the player immediately', bite.active && bite.rem > 299000, JSON.stringify(bite));
await wait(400);
const infVisible = await ev(() => !document.getElementById('infection').classList.contains('hidden') && document.getElementById('inf-timer').textContent);
check('Infection warning + 05:00 timer shown', !!infVisible && /^0[45]:\d\d$/.test(infVisible), `timer ${infVisible}`);
await shot('03-infected');
const t0 = await ev(() => window.__game.infection.remainingMs());
const wallA = Date.now(); await wait(3000); const wallB = Date.now();
const t1 = await ev(() => window.__game.infection.remainingMs());
check('Countdown follows real time (wall clock)', Math.abs((t0 - t1) - (wallB - wallA)) < 400, `timer -${t0 - t1} ms over ${wallB - wallA} ms`);
await ev(() => { const g = window.__game; g.time.advanceHours(10); });
const t2 = await ev(() => window.__game.infection.remainingMs());
check('Countdown ignores game-time jumps', Math.abs(t1 - t2) < 1500);
await ev(() => { const g = window.__game; g.time.elapsed = 300; g.time.elapsed = 300; });
const noCure = await ev(() => window.__game.antidoteAvailable());
check('No antidote during first two game days', noCure === false);
// pausing does not stop it
await page.keyboard.press('Escape'); await wait(1200);
const paused = await ev(() => ({ s: window.__game.state, rem: window.__game.infection.remainingMs() }));
await page.click('#btn-resume'); await wait(300);
check('Countdown keeps running while paused', paused.s === 'paused' && paused.rem < t2 - 900, JSON.stringify(paused));

// --- hospital antidote after day 2
const hosp = await ev(async () => {
  const g = window.__game; g.time.elapsed = 2 * 1440 + 5;
  g.hospital.update(0.016);
  const a = g.hospital.antidotePos; g.player.spawn(a.x, a.z + 1.2, 0); g.player.pitch = -0.2;
  return { avail: g.antidoteAvailable(), stock: g.hospital.antidoteStock, inside: !!g.world.floorZoneAt(a.x, a.z), y: g.player.pos.y, floor: g.hospital.y };
});
check('Antidote available in the hospital lab after 2 game days', hosp.avail && hosp.stock === 1 && hosp.inside, JSON.stringify(hosp));
await wait(500);
await shot('04-lab');
const prompt = await ev(() => document.getElementById('prompt').textContent);
await page.keyboard.press('KeyE'); await wait(300);
const got = await ev(() => window.__game.inventory.count('antidote'));
check('Player picks up the antidote (E)', got === 1, `prompt "${prompt}"`);
await page.keyboard.press('KeyH'); await wait(300);
const cured = await ev(() => ({ active: window.__game.infection.active, inv: window.__game.inventory.count('antidote'), hidden: document.getElementById('infection').classList.contains('hidden') }));
check('Taking the antidote stops the infection and hides the timer', !cured.active && cured.inv === 0 && cured.hidden, JSON.stringify(cured));
await wait(800); await shot('05-cured');

// --- hospital is explorable: walk the corridor
const hc = await ev(() => { const g = window.__game, h = g.hospital; g.player.spawn(h.ox + 47, h.oz + 32, Math.PI / 2); g.player.pitch = 0; return g.isIndoor(); });
await page.keyboard.down('KeyW'); await waitGame(1.5); await page.keyboard.up('KeyW');
const hc2 = await ev(() => { const g = window.__game, h = g.hospital; return { lx: g.player.pos.x - h.ox, lz: g.player.pos.z - h.oz, indoor: g.isIndoor() }; });
check('Hospital corridors are walkable indoors', hc && hc2.indoor && hc2.lx < 46, JSON.stringify(hc2));
await shot('06-hospital-corridor');

// --- loot container (hold E)
const lc = await ev(() => {
  const g = window.__game; let c = null;
  for (const k of g.loot.containers.values()) if (k.label === 'Polisbil' && !g.loot.searched.has(k.id)) { c = k; break; }
  if (!c) return null;
  let s = null;
  for (let r = 1.8; r < 3.4 && !s; r += 0.3) for (let a = 0; a < 6.28 && !s; a += 0.4) { const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; if (g.isWalkable(x, z, 0.36)) s = { x, z }; }
  g.player.spawn(s.x, s.z, Math.atan2(-(c.x - s.x), -(c.z - s.z))); g.player.pitch = -0.3;
  window.__lc = c; return { id: c.id, before: JSON.stringify(g.inventory.items) };
});
await wait(300);
await page.keyboard.down('KeyE'); await waitGame(2.2); await page.keyboard.up('KeyE');
const lc2 = await ev(() => ({ searched: window.__game.loot.searched.has(window.__lc.id), after: JSON.stringify(window.__game.inventory.items) }));
check('Searching a police car (hold E) gives loot', lc && lc2.searched, `${lc && lc.before} -> ${lc2.after}`);
await shot('07-police-car');

// --- inventory UI + eating/drinking
await ev(() => { const g = window.__game; g.player.thirst = 30; g.inventory.add('water', 1); });
await page.keyboard.press('Tab'); await wait(300);
const invOpen = await ev(() => !document.getElementById('inventory').classList.contains('hidden'));
await ev(() => window.__game.useItem('water'));
const th = await ev(() => window.__game.player.thirst);
await shot('08-inventory');
await page.keyboard.press('Tab'); await wait(200);
check('Inventory opens (Tab) and drinking restores thirst', invOpen && th > 70, `thirst ${th.toFixed(0)}`);

// --- enterable building
const ent = await ev(() => { const g = window.__game, it = g.interiors.list[0]; g.interiors.enter(it); return it.type; });
await wait(1200);
const ent2 = await ev(() => ({ inside: !!window.__game.interiors.current, indoor: window.__game.isIndoor() }));
await shot('09-interior');
await ev(() => window.__game.interiors.exit()); await wait(900);
const ent3 = await ev(() => !window.__game.interiors.current && window.__game.world.inBounds(window.__game.player.pos.x, window.__game.player.pos.z));
check('Enter and leave a building interior', ent2.inside && ent2.indoor && ent3, `type ${ent}`);

// --- NPC dialogue + trade
const npc = await ev(() => { const g = window.__game; const n = g.npcs.list.find(q => q.role === 'trader'); g.npcs.talk(n); return n.name; });
await wait(200);
const dlg = await ev(() => !document.getElementById('dialog').classList.contains('hidden') && document.getElementById('dlg-options').children.length);
await shot('10-dialog');
await ev(() => window.__game.closeUI());
check('Survivor NPC dialogue with trade options', dlg >= 2, `${npc}, ${dlg} options`);

// --- day/night + weather + sleeping
await ev(() => { const g = window.__game; g.time.elapsed = 2 * 1440 + 15 * 60; const s = g.findOpenSpot(600, -1300); g.player.spawn(s.x, s.z, 0.8); g.weapons.toggleFlashlight(true); });
await wait(1500); await shot('11-night-flashlight');
const night = await ev(() => window.__game.env.nightAmount);
check('Night falls (day/night cycle)', night > 0.9, `night ${night}`);
await ev(() => { const g = window.__game; g.time.elapsed = 2 * 1440 + 5 * 60; g.env.setWeather('storm', true); g.weapons.toggleFlashlight(false); });
await wait(1500); await shot('12-storm');
check('Weather can change (storm/rain)', await ev(() => window.__game.env.rain.visible));
const sl = await ev(() => { const g = window.__game; for (const z of g.zombies.active) z.state = 7; g.infection.active = false; g.player.health = 100; const zn = { name: 'Test', x: 0, z: 0 }; const h0 = g.time.elapsed; g.sleep(zn); return h0; });
await wait(1700);
const sl2 = await ev(() => window.__game.time.elapsed);
check('Resting in a safe zone passes time and saves', sl2 > sl + 60 && await ev(() => window.__game.saves.has()));

// --- special zombies, guards and random events
const zt = await ev(() => { const g = window.__game; return ['walker', 'runner', 'brute', 'screamer', 'spitter'].map(t => { const z = g.zombies.spawnActive(t, g.player.pos.x + 50, g.player.pos.z + 50, 'civil'); const ok = z.hp > 0; z.state = 7; return ok && z.type === t; }).every(Boolean); });
check('Five zombie types (vanlig, snabb, tålig, skrikare, spottare)', zt);
await ev(() => { const g = window.__game; g.time.elapsed = 2 * 1440 + 4 * 60; g.env.setWeather('klart', true); const s = g.findOpenSpot(600, -1250); g.player.spawn(s.x, s.z, 0); g.zombies.screamCooldown = 0;
  const e = g.player.eye; let best = null;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) { const x = g.player.pos.x + Math.sin(a) * 12, z = g.player.pos.z + Math.cos(a) * 12; if (!g.isWalkable(x, z)) continue; if (g.collision.los(x, g.world.groundHeight(x, z) + 1.6, z, e.x, e.y, e.z)) { best = { x, z }; break; } }
  const sc = g.zombies.spawnActive('screamer', best.x, best.z, 'civil'); sc.yaw = Math.atan2(g.player.pos.x - sc.x, g.player.pos.z - sc.z); sc.state = 0; sc.stateT = 99; window.__sc = sc;
  const sp = g.zombies.spawnActive('spitter', best.x + 1, best.z, 'civil'); sp.yaw = sc.yaw; sp.state = 0; sp.stateT = 99; sp.spitCd = 0; window.__sp = sp; });
await waitGame(1.2);
const spec = await ev(() => ({ screamed: window.__sc.screamed, spits: window.__game.zombies.spits.length, spState: window.__sp.state, spitCd: window.__sp.spitCd }));
check('Screamer screams when it sees the player', spec.screamed, JSON.stringify(spec));
check('Spitter uses its ranged acid attack', spec.spits > 0 || spec.spitCd > 1, JSON.stringify(spec));
await ev(() => { for (const z of window.__game.zombies.active) { z.state = 7; } });
const guard = await ev(() => {
  const g = window.__game; const gd = g.npcs.list.find(n => n.role === 'guard' && n.alive);
  const ps = g.findOpenSpot(gd.x - 4, gd.z, 10); g.player.spawn(ps.x, ps.z, 0);
  let best = null;
  for (let a = 0; a < Math.PI * 2 && !best; a += Math.PI / 12) { const x = gd.x + Math.sin(a) * 15, z = gd.z + Math.cos(a) * 15; if (g.isWalkable(x, z) && g.collision.los(gd.x, gd.y + 1.5, gd.z, x, g.world.groundHeight(x, z) + 1.4, z)) best = { x, z }; }
  const z = g.zombies.spawnActive('walker', best.x, best.z, 'civil'); z.state = 0; z.stateT = 99; z.walkSpeed = 0; window.__gz = z; gd.shootCd = 0; return { gx: gd.x, hp: z.hp };
});
await waitGame(3);
const guard2 = await ev(() => ({ hp: window.__gz.hp, state: window.__gz.state }));
check('Guards defend the safe zone (shoot approaching zombies)', guard2.hp < guard.hp || guard2.state === 7, JSON.stringify(guard2));
const drop0 = await ev(() => { const g = window.__game; g.events.supplyDrop(); return [...g.loot.containers.values()].filter(c => c.label === 'Försörjningslåda').length; });
await wait(6800);
const drop1 = await ev(() => [...window.__game.loot.containers.values()].filter(c => c.label === 'Försörjningslåda').length);
check('Random event: helicopter supply drop', drop1 === drop0 + 1, `${drop0} -> ${drop1}`);
const hz0 = await ev(() => window.__game.zombies.virtual.length);
await ev(() => window.__game.events.horde());
const hz1 = await ev(() => window.__game.zombies.virtual.length);
check('Random event: zombie horde', hz1 > hz0 + 8, `${hz0} -> ${hz1}`);

// --- save / load keeps the infection clock
await ev(() => { const g = window.__game; g.infection.infect(); g.infection.startedAt = Date.now() - 60000; g.saves.save(); g.infection.active = false; g.saves.load(); });
const sv = await ev(() => window.__game.infection.remainingMs());
check('Save/load keeps the real-time infection timer', sv > 235000 && sv < 241000, `${sv} ms left`);

// --- turning into a zombie when time runs out
await ev(() => { const g = window.__game; g.infection.startedAt = Date.now() - 299500; });
await wait(2500);
const turned = await ev(() => ({ state: window.__game.state, turned: window.__game.turned }));
await wait(3000);
const go = await ev(() => !document.getElementById('gameover').classList.contains('hidden') && document.getElementById('go-title').textContent);
await shot('13-turned');
check('Player turns into a zombie at 00:00 and the game ends', turned.state === 'dead' && turned.turned && go === 'DU HAR FÖRVANDLATS', JSON.stringify({ ...turned, go }));

check('No runtime errors', errors.length === 0, errors.slice(0, 5).join(' | '));
const fails = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
await browser.close(); server.kill();
process.exit(fails ? 1 : 0);

// Wires all gameplay systems into the Game and implements cross-system rules
// (bites & infection, death, sleeping, item use, noise, audio environment).
import { Audio } from '../audio/audio.js';
import { Inventory, ITEMS } from './items.js';
import { Interact } from './interact.js';
import { Loot } from './loot.js';
import { FX } from '../render/fx.js';
import { Infection } from './infection.js';
import { Weapons, WEAPONS } from '../player/weapons.js';
import { Zombies, ST } from '../ai/zombies.js';
import { Hospital } from '../world/hospital.js';
import { Props } from '../world/props.js';
import { NPCs } from '../ai/npcs.js';
import { Events } from './events.js';
import { Saves } from './save.js';
import { Panels } from '../ui/panels.js';
import { Interiors } from '../world/interiors.js';
import { Sites } from '../world/sites.js';
import { HOSPITAL, ZONES } from '../world/locations.js';
import { rand, chance, clamp, lerp, fmtTime } from '../core/util.js';
import { F } from '../world/collision.js';

const $ = id => document.getElementById(id);

export function registerSystems(game) {
  const S = {
    loadingText: 'Befolkar Göteborg…',
    async init(g) {
      g.stats = { kills: 0, shots: 0, hits: 0, headshots: 0, helped: 0 };
      g.audio = new Audio(g.settings.volume);
      g.inventory = new Inventory();
      g.interact = new Interact(g);
      g.loot = new Loot(g);
      g.fx = new FX(g.scene, g.tex, g.world);
      g.infection = new Infection();
      g.weapons = new Weapons(g);
      g.zombies = new Zombies(g);
      g.hospital = new Hospital(g);
      g.props = new Props(g);
      g.sites = new Sites(g);
      g.interiors = new Interiors(g);
      g.npcs = new NPCs(g);
      g.events = new Events(g);
      g.saves = new Saves(g);
      g.panels = new Panels(g);
      g.env.onThunder = d => g.audio.thunder(d);
      g.hud.setMarkers([
        { x: HOSPITAL.x, z: HOSPITAL.z, icon: '✚', color: '#ff4040', label: 'Sahlgrenska', showDist: true },
        ...ZONES.filter(z => z.type === 'safe').map(z => ({ x: z.x, z: z.z, icon: '⌂', color: '#6ad06a', label: z.name })),
      ]);
      g.cameraShake = { yaw: 0, pitch: 0, roll: 0 };
      g.damageFlash = 0; g.pulse = 0; g.beatT = 0; g.envT = 0;
    },
    onStart(load) {
      const g = game;
      if (load && g.saves.load()) {
        g.zombies.active.length = 0;
        if (g.zombies.virtual.length < 100) g.zombies.initPopulation();
        g.hud.message('Sparat spel laddat.', 'good');
        if (g.infection.active) g.hud.message(`Du är fortfarande infekterad – ${fmtTime(g.infection.remainingMs())} kvar i verklig tid!`, 'warn');
        if (g.infection.check()) g.turn();
        return;
      }
      // new game
      g.saves.clear();
      g.player.reset();
      g.inventory.items = {};
      g.inventory.add('ammo_9mm', 7); g.inventory.add('water', 1); g.inventory.add('crispbread', 1); g.inventory.add('bandage', 1);
      g.weapons.owned = { knife: { mag: 0 } }; g.weapons.give('pistol', 10); g.weapons.select('pistol', true); g.weapons.battery = 80;
      g.zombies.initPopulation();
      g.hud.message('Du vaknar i Masthuggskyrkan. Göteborg är en röd zon. Hitta mat, vatten och vapen – och undvik att bli biten.', 'good');
      g.hud.message('Tips: [E] interagera · [TAB] inventarie · [M] karta · [F] ficklampa · [H] förband/motgift', '');
    },
    update(dt) {
      const g = game, p = g.player;
      g.weapons.update(dt);
      g.interact.update(dt);
      if (g.input.hit('KeyH')) g.quickHeal();
      g.zombies.update(dt);
      g.npcs.update(dt);
      g.hospital.update(dt);
      g.interiors.update(dt);
      g.events.update(dt);
      if (!g.interiors.current) g.props.update(p.pos.x, p.pos.z);
      g.fx.update(dt, g.camera.position);
      g.panels.update();
      // player events -> audio + noise
      for (const e of p.events) {
        if (e.type === 'step') { g.audio.footstep(e.surface, e.sprint, e.crouch); g.noise(p.pos.x, p.pos.z, e.radius * (g.env.current.rain > 0.3 ? 0.7 : 1), 'step'); }
        else if (e.type === 'land') { g.audio.footstep(p.surface(), true, false); g.noise(p.pos.x, p.pos.z, 10, 'land'); }
        else if (e.type === 'noise') g.noise(p.pos.x, p.pos.z, e.radius, 'player');
      }
      p.events.length = 0;
      // infection
      if (g.infection.check()) { g.turn(); return; }
      if (!p.alive) { g.die(); return; }
      g.hud.infection(g.infection, g);
      g.saves.update(dt);
      // audio environment (reverb/echo by surroundings)
      g.envT -= dt;
      if (g.envT <= 0) {
        g.envT = 0.5;
        const e = g.camera.position; let hits = 0, sum = 0;
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2; const h = g.collision.raycast(e.x, e.y, e.z, Math.cos(a), 0, Math.sin(a), 30, F.SIGHT, true);
          if (h) { hits++; sum += h.t; }
        }
        g.audio.setEnvironment(hits / 8, g.isIndoor(), hits ? (sum / hits) * 2 / 343 : 0.4);
      }
      g.audio.updateAmbience(dt, { wind: g.env.current.wind, rain: g.env.current.rain, indoor: g.isIndoor(), infect: g.infection.active ? g.infection.progress() : 0, night: g.env.nightAmount, health: p.health / 100 });
    },
    preRender(dt) {
      const g = game, u = g.post.uniforms, p = g.player;
      g.weapons.animate(dt);
      g.zombies.render();
      g.audio.setListener(g.camera);
      // infection visuals: gradually worse, heartbeat accelerates
      const inf = g.infection.active ? g.infection.progress() : 0;
      u.uInfect.value = lerp(u.uInfect.value, g.infection.active ? 0.18 + 0.82 * inf : 0, clamp(dt * 2, 0, 1));
      g.beatT -= dt;
      if ((g.infection.active || p.health < 30) && g.state === 'playing') {
        if (g.beatT <= 0) { g.beatT = g.infection.active ? lerp(1.0, 0.38, inf) : 0.9; g.pulse = 1; g.audio.heartbeat(g.infection.active ? inf : 0.3); }
      }
      g.pulse = Math.max(0, g.pulse - dt * 3); u.uPulse.value = g.pulse;
      g.damageFlash = Math.max(0, g.damageFlash - dt * 2.2); u.uDamage.value = g.damageFlash;
      u.uAcid.value = p.acidBlur;
      // blackouts near the end
      let fade = g.fadeOverride || 0;
      if (inf > 0.82) fade = Math.max(fade, Math.max(0, Math.sin(g.t * 0.9) - 0.85) * 4 * (inf - 0.8) * 3);
      u.uFade.value = Math.min(1, fade);
      // camera sway
      const sh = g.cameraShake;
      sh.roll = Math.sin(g.t * 0.7) * 0.035 * inf + (g.shakeT > 0 ? rand(-0.02, 0.02) : 0);
      sh.yaw = Math.sin(g.t * 0.43) * 0.02 * inf; sh.pitch = Math.sin(g.t * 0.61) * 0.015 * inf;
      g.shakeT = (g.shakeT || 0) - dt;
      // turned sequence
      if (g.state === 'dead' && g.turned) { u.uZombie.value = Math.min(1, u.uZombie.value + dt * 0.5); }
    },
    updateDead(dt) {
      const g = game;
      if (g.turned) { g.player.pitch = lerp(g.player.pitch, -0.6, dt); g.cameraShake.roll = Math.sin(g.t * 2) * 0.1; }
      g.fx.update(dt, g.camera.position);
      g.zombies.render();
    },
  };
  game.extraSystems.push(S);

  // ---------------------------------------------------------------- game-level helpers
  game.noise = (x, z, radius, kind) => game.zombies && game.zombies.noise(x, z, radius, kind);
  game.weaponsSlot = id => WEAPONS[id].slot;
  game.weaponsDef = id => WEAPONS[id];
  game.isInsideHospital = (x, z, m = 0) => Math.abs(x - HOSPITAL.x) < HOSPITAL.w / 2 + m && Math.abs(z - HOSPITAL.z) < HOSPITAL.d / 2 + m;

  game.zombieHit = (z, T) => {
    const g = game, p = g.player;
    const dmg = rand(T.dmg[0], T.dmg[1]);
    p.damage(dmg, 'zombie');
    g.damageFlash = Math.min(1, g.damageFlash + 0.6); g.shakeT = 0.25;
    const ang = Math.atan2(z.x - p.pos.x, -(z.z - p.pos.z)) + p.yaw; // relative to view
    g.hud.damageFrom(ang);
    if (T === g.zombies && false) return;
    if (z.type === 'brute') { const k = 4; p.vel.x += (p.pos.x - z.x) * k; p.vel.z += (p.pos.z - z.z) * k; }
    if (chance(T.bite)) {
      g.audio.bite();
      const first = g.infection.infect();
      if (first) {
        g.hud.message('DU HAR BLIVIT BITEN! Viruset sprider sig – 05:00 kvar. Hitta motgiftet på Sahlgrenska!', 'warn');
        if (!g.antidoteAvailable()) g.hud.message('Inget botemedel finns ännu… det väntas bli klart efter dag 2.', 'warn');
        g.stats.bitten = (g.stats.bitten || 0) + 1;
      }
    } else {
      g.audio.hurt();
      if (chance(0.3)) { p.bleeding = Math.max(p.bleeding, 0.8); g.hud.message('Klösskada – du blöder! Använd bandage [H].', 'warn'); }
    }
  };
  game.acidHit = () => {
    const p = game.player;
    p.damage(9, 'acid'); p.acidBlur = 1; game.damageFlash = 0.6; game.audio.hurt();
    game.hud.message('Frätande spott i ansiktet!', 'warn');
  };
  game.onZombieKilled = (z, part) => {
    const g = game;
    g.stats.kills++; if (part === 'head') g.stats.headshots++;
    if (chance(0.12)) {
      const id = `zd${z.id}_${Date.now()}`, until = g.t + 60;
      g.loot.container({ id, x: z.x, y: z.y + 0.4, z: z.z, label: 'Den dödes fickor', table: 'zombie', r: 2, hold: 1.0 });
      const c = g.loot.containers.get(id); c.inter.enabled = () => g.t < until;
    }
  };

  game.useItem = id => {
    const g = game, p = g.player, def = ITEMS[id];
    if (!def || !def.use || g.inventory.count(id) < 1) return false;
    const u = def.use;
    if (u.cure) {
      if (!g.infection.active) { g.hud.message('Du är inte infekterad. Spara motgiftet till när du blir biten.', 'warn'); return false; }
      g.inventory.remove(id, 1); g.infection.cure();
      g.hud.message('Du injicerar Motgift ZX-7… Feberdimman lättar. INFEKTIONEN ÄR STOPPAD.', 'good');
      g.audio.pickup(); g.pulse = 0;
      return true;
    }
    if (u.battery && g.weapons.battery > 98) { g.hud.message('Ficklampan är redan fulladdad.'); return false; }
    g.inventory.remove(id, 1);
    if (u.hunger) p.hunger = clamp(p.hunger + u.hunger, 0, 100);
    if (u.thirst) p.thirst = clamp(p.thirst + u.thirst, 0, 100);
    if (u.stamina) p.stamina = clamp(p.stamina + u.stamina, 0, 100);
    if (u.heal) p.heal(u.heal);
    if (u.healOverTime) p.painkiller += u.healOverTime;
    if (u.stopBleed) p.bleeding = 0;
    if (u.battery) g.weapons.battery = 100;
    if (def.sound === 'eat') g.audio.eat(); else if (def.sound === 'drink') g.audio.drink(); else g.audio.pickup();
    g.hud.message(def.msg || `Använde: ${def.name}`, 'good');
    return true;
  };
  game.quickHeal = () => {
    const g = game, inv = g.inventory, p = g.player;
    if (g.infection.active && inv.count('antidote')) return g.useItem('antidote');
    if (p.bleeding && inv.count('bandage')) return g.useItem('bandage');
    if (p.health < 60 && inv.count('medkit')) return g.useItem('medkit');
    if (p.health < 100 && inv.count('bandage')) return g.useItem('bandage');
    if (p.bleeding && inv.count('medkit')) return g.useItem('medkit');
    g.hud.message('Inget lämpligt förband att använda.');
  };

  game.sleep = zone => {
    const g = game, p = g.player;
    if (g.infection.active) { g.hud.message('Du kan inte sova med viruset i kroppen. Hitta motgiftet!', 'warn'); return; }
    if (g.zombies.nearestDist(p.pos.x, p.pos.z) < 30 || g.zombies.chasing > 0) { g.hud.message('Det är inte säkert att vila – zombier är nära.', 'warn'); return; }
    const h = g.time.hour;
    const hours = h >= 19 || h < 7 ? ((7 - h + 24) % 24 || 8) : 4;
    $('fade').style.opacity = 1;
    setTimeout(() => {
      g.time.advanceHours(hours);
      p.stamina = 100; p.heal(hours * 4); p.hunger = clamp(p.hunger - hours * 2.2, 0, 100); p.thirst = clamp(p.thirst - hours * 3, 0, 100);
      g.saves.save();
      g.hud.message(`Du vilade i ${Math.round(hours)} timmar. Spelet sparades. (${g.time.clock}, dag ${g.time.day})`, 'good');
      $('fade').style.opacity = 0;
    }, 1200);
  };

  game.die = () => {
    const g = game;
    g.state = 'dead'; g.input.enabled = false; g.input.unlock(); g.turned = false;
    const cause = { zombie: 'Zombierna slet dig i stycken.', bleed: 'Du förblödde.', hunger: 'Du svalt ihjäl.', thirst: 'Du dog av uttorkning.', fall: 'Fallet blev ditt sista.', acid: 'Den frätande spottan tog dig.' }[g.player.deathCause] || 'Du dog.';
    setTimeout(() => showGameOver('DU DOG', `${cause}\n\n${statsText(g)}`), 1500);
  };
  game.turn = () => {
    const g = game;
    g.state = 'dead'; g.turned = true; g.input.enabled = false; g.input.unlock(); g.player.alive = false;
    g.audio.zombie({ x: g.camera.position.x, y: g.camera.position.y, z: g.camera.position.z + 0.5 }, 'scream', 0.7);
    g.hud.message('Fem minuter har gått… Viruset tar över.', 'warn');
    g.saves.clear();
    setTimeout(() => showGameOver('DU HAR FÖRVANDLATS', `Infektionen tog över efter exakt fem minuter.\nDu är nu en av dem som vandrar på Göteborgs gator.\n\n${statsText(g)}`), 4000);
  };
  function statsText(g) {
    const d = g.time.daysPassed;
    return `Överlevde: ${Math.floor(d)} dygn och ${Math.floor((d % 1) * 24)} timmar · Zombier dödade: ${g.stats.kills} (${g.stats.headshots} huvudskott) · Träffprocent: ${g.stats.shots ? Math.round(100 * g.stats.hits / g.stats.shots) : 0} %`;
  }
  function showGameOver(title, text) {
    $('go-title').textContent = title; $('go-text').textContent = text;
    $('gameover').classList.remove('hidden'); game.hud.show(false);
    $('btn-load').classList.toggle('hidden', !game.saves.has());
  }
}
export { ST };

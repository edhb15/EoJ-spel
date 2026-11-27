// Survivor NPCs: guards defend safe zones, traders barter, civilians give hints,
// wanderers appear in random encounters and can be lost to the dead.
import * as THREE from 'three';
import { ZONES, HOSPITAL } from '../world/locations.js';
import { rand, pick, chance, clamp, wrapAngle } from '../core/util.js';
import { ITEMS } from '../game/items.js';
import { ST } from './zombies.js';

const CAST = {
  masthugg: [
    { name: 'Kyrkvaktmästare Lennart', role: 'trader', shirt: 0x3a3a46, trades: [[{ canned: 2 }, { ammo_9mm: 15 }], [{ battery: 1 }, { water: 1 }], [{ soda: 2 }, { bandage: 1 }], [{ crispbread: 2 }, { ammo_12g: 4 }]],
      lines: ['Kyrkan står kvar, och så länge den gör det har du en fristad här.', 'Vi byter, vi delar. Men gratis är ingenting längre.'] },
    { name: 'Sjuksköterska Amira', role: 'medic', shirt: 0xb8c8d8, trades: [[{ canned: 1, water: 1, crispbread: 1 }, { medkit: 1 }], [{ crispbread: 1 }, { bandage: 2 }], [{ soda: 1 }, { painkillers: 1 }]],
      lines: ['Jag jobbade på Sahlgrenska när det började. Ett bett – och fem minuter senare var de borta.', 'Forskarna i virologlabbet arbetade dag och natt på ett motgift. ZX-7 kallade de det.'] },
    { name: 'Vakt Johan', role: 'guard', shirt: 0x2e3a2a, lines: ['Jag håller dem borta från grindarna. Gå inte ut i mörkret utan ficklampa.'] },
    { name: 'Vakt Sara', role: 'guard', shirt: 0x2a2a30, lines: ['Ljud drar till sig dem. Varje skott hörs över hela Masthugget.'] },
  ],
  hamn: [
    { name: 'Hamnarbetare Mikael', role: 'trader', shirt: 0xd86a10, trades: [[{ battery: 3 }, { ammo_12g: 8 }], [{ canned: 2 }, { ammo_9mm: 12 }], [{ herring: 1 }, { ammo_12g: 4 }], [{ water: 2 }, { ammo_556: 15 }]],
      lines: ['Containrarna vid kajen är fulla av saker – och fulla av dem.', 'Färjorna går inte längre. Älven är vår mur.'] },
    { name: 'Vakt Ali', role: 'guard', shirt: 0x223344, lines: ['Militären hade en bas i Slottsskogen. Den föll första natten. Där finns vapen, om du vågar.'] },
  ],
  kolonin: [
    { name: 'Odlaren Ingrid', role: 'trader', shirt: 0x556b2f, trades: [[{ ammo_9mm: 10 }, { canned: 2, water: 1 }], [{ battery: 2 }, { water: 3 }], [{ bandage: 1 }, { crispbread: 2 }]],
      lines: ['Här i kolonin odlar vi det vi kan. Zombierna bryr sig inte om potatis.'] },
    { name: 'Jägaren Bosse', role: 'trader', shirt: 0x6b4a2a, trades: [[{ canned: 3, water: 2 }, { w_hunting: 1 }], [{ ammo_9mm: 10 }, { ammo_308: 5 }], [{ ammo_12g: 6 }, { ammo_308: 4 }]],
      lines: ['Uppe i Änggårdsbergen ser man hela stan brinna.', 'De tåliga – de i kravallutrustning – sikta på huvudet.'] },
    { name: 'Vakt Elin', role: 'guard', shirt: 0x3a3a3a, lines: ['Skrikarna är värst. Hör du ett skrik – spring.'] },
  ],
};

export class NPCs {
  constructor(game) {
    this.g = game; this.list = [];
    this.mats = {
      skin: new THREE.MeshStandardMaterial({ color: 0xd8b8a0, roughness: 0.8 }),
      pants: new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.9 }),
      gun: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.4 }),
    };
    for (const zn of ZONES) {
      const cast = CAST[zn.id]; if (!cast) continue;
      cast.forEach((c, i) => {
        const a = (i / cast.length) * Math.PI * 2 + 0.4;
        const r = c.role === 'guard' ? zn.r * 0.7 : 6 + i * 2;
        const spot = game.findOpenSpot(zn.x + Math.cos(a) * r, zn.z + Math.sin(a) * r, 25);
        this.add({ ...c, zone: zn, x: spot.x, z: spot.z, yaw: c.role === 'guard' ? Math.atan2(Math.cos(a), Math.sin(a)) : rand(0, 6.28) });
      });
      // a bed to rest in each safe zone
      const bed = game.findOpenSpot(zn.x + 3, zn.z - 4, 20);
      this.addBed(zn, bed.x, bed.z);
    }
  }
  makeBody(shirt, armed) {
    const g = new THREE.Group();
    const B = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    const sm = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
    B(0.15, 0.9, 0.16, this.mats.pants, -0.1, 0.45, 0); B(0.15, 0.9, 0.16, this.mats.pants, 0.1, 0.45, 0);
    B(0.42, 0.6, 0.24, sm, 0, 1.2, 0);
    const head = B(0.22, 0.26, 0.24, this.mats.skin, 0, 1.65, 0);
    const la = B(0.1, 0.6, 0.1, sm, -0.27, 1.2, 0), ra = B(0.1, 0.6, 0.1, sm, 0.27, 1.2, 0);
    if (armed) { ra.rotation.x = -1.2; ra.position.set(0.22, 1.32, 0.2); la.rotation.x = -1.1; la.rotation.z = 0.5; la.position.set(-0.1, 1.3, 0.25); B(0.06, 0.08, 0.8, this.mats.gun, 0.05, 1.38, 0.45); }
    g.userData = { head, la, ra };
    this.g.scene.add(g);
    return g;
  }
  add(o) {
    const g = this.g;
    const n = Object.assign({ hp: 100, alive: true, shootCd: rand(0, 1), talkIdx: 0, deadT: 0 }, o);
    n.y = g.world.groundHeight(n.x, n.z);
    n.mesh = this.makeBody(n.shirt || 0x444444, n.role === 'guard');
    n.mesh.position.set(n.x, n.y, n.z); n.mesh.rotation.y = n.yaw;
    n.inter = g.interact.add({ x: n.x, y: n.y + 1.5, z: n.z, r: 2.6, label: () => `Prata med ${n.name}`, enabled: () => n.alive, action: () => this.talk(n) });
    this.list.push(n);
    return n;
  }
  addBed(zone, x, z) {
    const g = this.g, y = g.world.groundHeight(x, z);
    const bed = new THREE.Group();
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 2), new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.9 }));
    m1.position.y = 0.15; bed.add(m1);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0xc8c0b0 })); m2.position.set(0, 0.36, -0.75); bed.add(m2);
    bed.position.set(x, y, z); g.scene.add(bed);
    g.interact.add({ x, y: y + 0.5, z, r: 2.4, label: `Vila i ${zone.name} (sov till morgonen + spara)`, action: () => g.sleep(zone) });
  }
  raycast(o, d, maxT) {
    let best = null;
    for (const n of this.list) {
      if (!n.alive) continue;
      const cx = n.x - o.x, cz = n.z - o.z, along = cx * d.x + cz * d.z; if (along < 0 || along > maxT) continue;
      const px = o.x + d.x * along, py = o.y + d.y * along, pz = o.z + d.z * along;
      if (Math.hypot(px - n.x, pz - n.z) < 0.3 && py > n.y && py < n.y + 1.8) if (!best || along < best.t) best = { t: along, npc: n, x: px, y: py, z: pz };
    }
    return best;
  }
  damage(n, amount) {
    n.hp -= amount; this.g.audio?.hurt();
    if (n.role !== 'guard') this.g.hud.message(`${n.name}: "Aj! Vad håller du på med?!"`, 'warn');
    if (n.hp <= 0) this.kill(n);
  }
  kill(n) {
    if (!n.alive) return;
    n.alive = false; n.mesh.rotation.x = -Math.PI / 2; n.mesh.position.y = n.y + 0.15; n.deadT = 0;
    this.g.hud.message(`${n.name} har dött.`, 'warn');
  }
  talk(n) {
    const g = this.g;
    const opts = [];
    const line = n.lines[n.talkIdx++ % n.lines.length];
    if (n.trades) n.trades.forEach(([give, get]) => {
      const can = Object.entries(give).every(([id, c]) => g.inventory.count(id) >= c);
      const fmt = o => Object.entries(o).map(([id, c]) => `${c}× ${ITEMS[id].name}`).join(' + ');
      opts.push({ text: `Byt: ${fmt(give)} → ${fmt(get)}`, disabled: !can, action: () => {
        for (const [id, c] of Object.entries(give)) g.inventory.remove(id, c);
        g.loot.give(Object.entries(get), n.name); this.talk(n);
      } });
    });
    if (n.role === 'medic' || n.role === 'trader') opts.push({ text: 'Fråga om motgiftet', action: () => g.dialog(n.name, this.antidoteInfo(), [{ text: 'Tillbaka', action: () => this.talk(n) }]) });
    if (n.role === 'wanderer') return this.wandererTalk(n);
    opts.push({ text: 'Hejdå', action: () => g.closeUI() });
    g.dialog(n.name, `"${line}"`, opts);
  }
  antidoteInfo() {
    const g = this.g;
    const d = Math.round(Math.hypot(HOSPITAL.x - g.player.pos.x, HOSPITAL.z - g.player.pos.z));
    if (g.antidoteAvailable()) return `"Radion sa att motgiftet ZX-7 är klart! Det finns i kylskåpet i Laboratoriet – Virologi på ${HOSPITAL.name}, ungefär ${d} meter härifrån. Gå in genom huvudentrén, följ den gula skylten längs huvudkorridoren österut."`;
    const h = Math.ceil(Math.max(0, 48 - g.time.daysPassed * 24));
    return `"De första två dygnen finns inget botemedel. Forskarna på ${HOSPITAL.name} säger att motgiftet blir klart efter dag två – om ungefär ${h} timmar. Blir du biten innan dess… då finns inget att göra."`;
  }
  wandererTalk(n) {
    const g = this.g;
    if (n.rewarded) return g.dialog(n.name, '"Tack igen. Jag tar mig till lägret nu."', [{ text: 'Hejdå', action: () => g.closeUI() }]);
    const want = n.want;
    g.dialog(n.name, `"${n.plea}"`, [
      { text: `Ge 1× ${ITEMS[want].name}`, disabled: g.inventory.count(want) < 1, action: () => {
        g.inventory.remove(want, 1); n.rewarded = true; g.loot.give(n.reward, n.name);
        g.dialog(n.name, '"Tack… tack! Ta det här, jag behöver det inte."', [{ text: 'Lycka till', action: () => g.closeUI() }]);
        g.stats.helped = (g.stats.helped || 0) + 1;
      } },
      { text: 'Jag har inget att ge.', action: () => g.closeUI() },
    ]);
  }
  spawnWanderer(x, z) {
    const want = pick(['water', 'bandage', 'canned', 'crispbread']);
    const n = this.add({ name: pick(['Överlevaren Kim', 'Studenten Linnea', 'Taxichauffören Reza', 'Pensionären Göran', 'Brevbäraren Anna']), role: 'wanderer', shirt: pick([0x6a2a2a, 0x2a4a6a, 0x5a5a2a]),
      x, z, yaw: rand(0, 6.28), lines: [''], want, plea: pick(['Snälla, hjälp mig… jag har inte ätit på flera dagar.', 'Är du… levande? Har du något du kan avvara?', 'Min vän blev biten. Jag har sprungit hela natten.']),
      reward: [[pick(['ammo_9mm', 'ammo_12g']), 8], [pick(['battery', 'bar', 'painkillers']), 1]] });
    n.target = ZONES.filter(q => q.type === 'safe').sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    return n;
  }
  update(dt) {
    const g = this.g, Z = g.zombies;
    for (const n of this.list) {
      if (!n.alive) {
        n.deadT += dt;
        if (n.deadT > 10 && !n.risen && n.role === 'wanderer') { n.risen = true; n.mesh.visible = false; Z.spawnActive('walker', n.x, n.z, 'civil'); g.hud.message('Den döde reser sig igen…', 'warn'); }
        continue;
      }
      // idle look-around / face the player when near
      const dp = Math.hypot(g.player.pos.x - n.x, g.player.pos.z - n.z);
      if (n.role !== 'guard' && dp < 5) n.mesh.rotation.y += wrapAngle(Math.atan2(g.player.pos.x - n.x, g.player.pos.z - n.z) - n.mesh.rotation.y) * Math.min(1, dt * 4);
      n.mesh.userData.head.rotation.y = Math.sin(g.t * 0.5 + n.x) * 0.4;
      // wanderer walks toward the nearest camp
      if (n.role === 'wanderer' && n.target && dp > 3) {
        const dx = n.target.x - n.x, dz = n.target.z - n.z, d = Math.hypot(dx, dz);
        if (d > n.target.r * 0.5) {
          const pos = { x: n.x + dx / d * 1.3 * dt, z: n.z + dz / d * 1.3 * dt };
          g.collision.collideCircle(pos, 0.3, n.y, 1.7, 2);
          n.x = pos.x; n.z = pos.z; n.y = g.world.groundHeight(n.x, n.z);
          n.mesh.position.set(n.x, n.y, n.z); n.mesh.rotation.y = Math.atan2(dx, dz);
          g.interact.move(n.inter, n.x, n.z); n.inter.y = n.y + 1.5;
        }
      }
      // zombies hurt NPCs they touch
      for (const z of Z.active) {
        if (z.state === ST.DEAD) continue;
        const d = Math.hypot(z.x - n.x, z.z - n.z);
        if (d < 1.4 && n.role !== 'guard') { n.hp -= dt * 12; if (chance(dt)) g.audio?.hurt(); if (n.hp <= 0) this.kill(n); }
        if (d < 1.2 && n.role === 'guard') n.hp -= dt * 4;
      }
      // guards shoot zombies approaching the camp
      if (n.role === 'guard') {
        n.shootCd -= dt;
        if (n.shootCd <= 0) {
          n.shootCd = rand(0.9, 1.6);
          let tgt = null, td = 38;
          for (const z of Z.active) {
            if (z.state === ST.DEAD) continue;
            const d = Math.hypot(z.x - n.x, z.z - n.z);
            if (d < td && g.collision.los(n.x, n.y + 1.5, n.z, z.x, z.y + 1.4, z.z)) { td = d; tgt = z; }
          }
          if (tgt) {
            n.mesh.rotation.y = Math.atan2(tgt.x - n.x, tgt.z - n.z);
            g.audio?.gunshot('npc', { x: n.x, y: n.y + 1.5, z: n.z });
            g.fx.muzzle(n.x, n.y + 1.4, n.z, Math.sin(n.mesh.rotation.y), 0, Math.cos(n.mesh.rotation.y));
            if (chance(0.6)) { const head = chance(0.35); Z.damage(tgt, head ? 40 : 45, head ? 'head' : 'torso', { x: tgt.x - n.x, z: tgt.z - n.z }); g.fx.bloodHit(tgt.x, tgt.y + 1.4, tgt.z, 0, 0); }
            g.noise(n.x, n.z, 45, 'gunshot');
          }
        }
        if (n.hp < 100) n.hp = Math.min(100, n.hp + dt * 2);
      }
    }
  }
  serialize() { return this.list.filter(n => n.role !== 'wanderer').map(n => n.alive); }
  restore(a) { (a || []).forEach((alive, i) => { const n = this.list.filter(q => q.role !== 'wanderer')[i]; if (n && !alive) this.kill(n); }); }
}

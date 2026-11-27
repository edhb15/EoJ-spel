// Random events and radio broadcasts that make every session different.
import * as THREE from 'three';
import { rand, pick, chance } from '../core/util.js';
import { HOSPITAL } from '../world/locations.js';
import { CLASS } from '../world/worldData.js';

const RADIO = [
  { at: 0.02, text: 'RADIO (Krisberedskap): "Göteborgs centrum är avspärrat – RÖD ZON. Ett okänt virus sprids genom bett. Undvik all kontakt med smittade."' },
  { at: 0.25, text: 'RADIO: "Smittade reagerar på ljud. Skjut bara när du måste. Säkra platser: Masthuggskyrkan, Stigbergskajen och koloniområdet."' },
  { at: 0.6, text: 'RADIO: "Den som blir biten förvandlas på cirka fem minuter. Det finns i dag inget godkänt botemedel."' },
  { at: 1.05, text: 'RADIO (Sahlgrenska): "Forskare i virologlaboratoriet rapporterar framsteg på ett motgift, ZX-7. Första satsen väntas efter dag två."' },
  { at: 1.6, text: 'RADIO: "Militären har övergett basen i Slottsskogen. Natten är farligast – snabba smittade jagar i mörkret."' },
];

export class Events {
  constructor(game) {
    this.g = game; this.timer = rand(70, 120); this.radioDone = new Set(); this.lastDay = 1; this.announced = false;
    this.crates = []; this.alarms = [];
  }
  update(dt) {
    const g = this.g, t = g.time;
    let latest = null;
    for (const r of RADIO) if (t.daysPassed >= r.at && !this.radioDone.has(r.at)) { this.radioDone.add(r.at); latest = r; }
    if (latest) { g.audio?.radio(); g.hud.message(latest.text, 'radio'); } // only the newest broadcast after a time skip
    if (!this.announced && g.antidoteAvailable()) {
      this.announced = true; g.audio?.radio();
      g.hud.message(`RADIO (Sahlgrenska): "Motgift ZX-7 är klart! Doser finns i kylskåpet i Laboratoriet – Virologi, ${HOSPITAL.name}. Det är det enda som stoppar infektionen."`, 'radio');
      g.hud.markers.push({ x: HOSPITAL.x, z: HOSPITAL.z, color: '#ff3030', label: 'Motgift' });
    }
    if (t.day !== this.lastDay) { this.lastDay = t.day; g.hud.message(`— DAG ${t.day} — Staden förändras. Fler smittade strömmar in i röda zonen.`, 'warn'); g.loot.newDay(); }
    // alarms
    for (let i = this.alarms.length - 1; i >= 0; i--) {
      const a = this.alarms[i]; a.t -= dt; a.beep -= dt;
      if (a.beep <= 0) { a.beep = 0.6; g.audio?.click(1600, 0.9); g.noise(a.x, a.z, 70, 'alarm'); }
      if (a.t <= 0) this.alarms.splice(i, 1);
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = rand(80, 160) * (g.env.nightAmount > 0.5 ? 0.7 : 1);
    if (g.isIndoor() && chance(0.5)) return;
    const r = Math.random();
    if (r < 0.22) this.supplyDrop();
    else if (r < 0.45) this.horde();
    else if (r < 0.62) this.carAlarm();
    else if (r < 0.8) this.survivor();
    else this.gunfight();
  }
  spotAround(min, max) {
    const p = this.g.player.pos;
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2), d = rand(min, max);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (this.g.world.inBounds(x, z, 40) && this.g.world.classAt(x, z) !== CLASS.WATER && this.g.isWalkable(x, z, 1.5)) return { x, z };
    }
    return null;
  }
  supplyDrop() {
    const g = this.g, s = this.spotAround(70, 180); if (!s) return;
    g.audio?.helicopter({ x: s.x, y: 120, z: s.z });
    g.hud.message('Ett helikopterljud närmar sig… En försörjningslåda släpps med röd rök!', 'good');
    setTimeout(() => {
      const y = g.world.groundHeight(s.x, s.z);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: 0x3e4a2e, roughness: 0.8 }));
      crate.position.set(s.x, y + 0.5, s.z); crate.castShadow = true; g.scene.add(crate);
      const smoke = g.fx.addEmitter(s.x, y + 1, s.z, 'fire', 0.4); smoke.kind = 'redsmoke';
      const id = `drop${Date.now()}`;
      g.loot.container({ id, x: s.x, y: y + 1, z: s.z, label: 'Försörjningslåda', table: 'supply', r: 2.5, hold: 2.2 });
      const mk = { x: s.x, z: s.z, color: '#ff5050', label: 'Låda' }; g.hud.markers.push(mk);
      g.noise(s.x, s.z, 120, 'drop');
      setTimeout(() => { const i = g.hud.markers.indexOf(mk); if (i >= 0) g.hud.markers.splice(i, 1); g.fx.emitters.splice(g.fx.emitters.indexOf(smoke), 1); }, 240000);
    }, 6000);
  }
  horde() {
    const g = this.g, s = this.spotAround(140, 200); if (!s) return;
    const n = Math.floor(rand(10, 18) + g.time.day * 2);
    g.zombies.horde(s.x, s.z, n, g.player.pos);
    for (let i = 0; i < 3; i++) setTimeout(() => g.audio?.zombie({ x: s.x, y: g.player.pos.y + 2, z: s.z }, 'groan', 0.8), i * 400);
    g.hud.message('Du hör hundratals stönanden på avstånd… en hord är på väg hit.', 'warn');
  }
  carAlarm() {
    const g = this.g, s = this.spotAround(40, 110); if (!s) return;
    this.alarms.push({ x: s.x, z: s.z, t: 20, beep: 0 });
    g.hud.message('Ett billarm börjar tjuta i närheten – det lockar till sig smittade.', 'warn');
  }
  survivor() {
    const g = this.g, s = this.spotAround(35, 80); if (!s) return;
    g.npcs.spawnWanderer(s.x, s.z);
    g.audio?.hurt(0.4);
    g.hud.message('Någon ropar på hjälp i närheten!', 'warn');
    g.zombies.horde(s.x + rand(-40, 40), s.z + rand(-40, 40), 4, s);
  }
  gunfight() {
    const g = this.g, s = this.spotAround(150, 260); if (!s) return;
    for (let i = 0; i < 8; i++) setTimeout(() => g.audio?.gunshot(pick(['rifle', 'pistol', 'shotgun']), { x: s.x, y: 2, z: s.z }), i * rand(120, 600));
    g.noise(s.x, s.z, 140, 'gunshot');
    g.hud.message('Skottlossning hörs på avstånd. Andra överlevande?');
  }
  serialize() { return { radio: [...this.radioDone], announced: this.announced, lastDay: this.lastDay }; }
  restore(o) { this.radioDone = new Set(o.radio || []); this.announced = !!o.announced; this.lastDay = o.lastDay || 1; }
}

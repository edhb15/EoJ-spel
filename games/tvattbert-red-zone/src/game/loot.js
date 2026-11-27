// Loot tables and searchable containers.
import { rand, randInt, chance, pick } from '../core/util.js';
import { ITEMS } from './items.js';

// [itemId, probability, min, max]
export const TABLES = {
  car: [['water', 0.25, 1, 1], ['soda', 0.3, 1, 2], ['crispbread', 0.25, 1, 1], ['bar', 0.25, 1, 2], ['battery', 0.15, 1, 1], ['bandage', 0.15, 1, 1], ['ammo_9mm', 0.06, 3, 8], ['canned', 0.1, 1, 1], ['ammo_12g', 0.04, 2, 4]],
  police: [['ammo_9mm', 0.85, 6, 17], ['w_pistol', 0.25, 1, 1], ['bandage', 0.35, 1, 2], ['battery', 0.35, 1, 1], ['ammo_12g', 0.2, 3, 6], ['w_shotgun', 0.06, 1, 1], ['bar', 0.3, 1, 1]],
  military: [['ammo_556', 0.85, 10, 30], ['w_rifle', 0.22, 1, 1], ['medkit', 0.3, 1, 1], ['bar', 0.5, 1, 3], ['water', 0.5, 1, 2], ['battery', 0.3, 1, 2], ['ammo_9mm', 0.3, 5, 12]],
  ambulance: [['bandage', 0.9, 1, 3], ['medkit', 0.4, 1, 1], ['painkillers', 0.6, 1, 2], ['water', 0.3, 1, 1]],
  bus: [['soda', 0.4, 1, 2], ['crispbread', 0.3, 1, 2], ['water', 0.3, 1, 1], ['battery', 0.2, 1, 1], ['bandage', 0.15, 1, 1]],
  trash: [['crispbread', 0.25, 1, 1], ['soda', 0.25, 1, 1], ['battery', 0.12, 1, 1], ['bandage', 0.1, 1, 1], ['herring', 0.05, 1, 1], ['canned', 0.12, 1, 1]],
  crate: [['canned', 0.4, 1, 2], ['water', 0.45, 1, 2], ['ammo_9mm', 0.25, 5, 12], ['ammo_12g', 0.15, 3, 6], ['bandage', 0.3, 1, 2], ['battery', 0.25, 1, 1], ['medkit', 0.1, 1, 1]],
  supply: [['canned', 0.9, 2, 3], ['water', 0.9, 2, 3], ['medkit', 0.6, 1, 1], ['ammo_556', 0.6, 20, 40], ['ammo_9mm', 0.6, 10, 20], ['ammo_12g', 0.4, 5, 10], ['battery', 0.6, 1, 2], ['bandage', 0.8, 2, 3]],
  pharmacy: [['medkit', 0.6, 1, 1], ['bandage', 0.9, 1, 3], ['painkillers', 0.8, 1, 2]],
  kitchen: [['canned', 0.5, 1, 2], ['crispbread', 0.5, 1, 2], ['water', 0.45, 1, 2], ['soda', 0.4, 1, 2], ['herring', 0.1, 1, 1], ['bar', 0.2, 1, 1]],
  shop: [['canned', 0.55, 1, 3], ['water', 0.5, 1, 3], ['soda', 0.5, 1, 3], ['crispbread', 0.5, 1, 2], ['bar', 0.4, 1, 3], ['battery', 0.3, 1, 2]],
  wardrobe: [['bandage', 0.3, 1, 2], ['battery', 0.3, 1, 1], ['painkillers', 0.25, 1, 1], ['ammo_12g', 0.12, 2, 5], ['w_shotgun', 0.05, 1, 1], ['ammo_308', 0.06, 3, 6]],
  hunting: [['w_hunting', 0.9, 1, 1], ['ammo_308', 1, 5, 12], ['ammo_12g', 0.6, 4, 8], ['w_shotgun', 0.4, 1, 1]],
  zombie: [['ammo_9mm', 0.06, 2, 6], ['bandage', 0.05, 1, 1], ['bar', 0.05, 1, 1], ['battery', 0.04, 1, 1], ['soda', 0.05, 1, 1]],
  locker: [['ammo_9mm', 0.6, 6, 15], ['ammo_556', 0.3, 10, 25], ['medkit', 0.25, 1, 1], ['battery', 0.4, 1, 2], ['w_pistol', 0.15, 1, 1]],
};

export function roll(table) {
  const out = [];
  for (const [id, p, a, b] of TABLES[table] || []) if (chance(p)) out.push([id, randInt(a, b)]);
  return out;
}

export class Loot {
  constructor(game) { this.g = game; this.containers = new Map(); this.searched = new Set(); }
  // register a searchable container with a stable id
  container({ id, x, y, z, label, table, hold = 1.6, r = 2.4, fixed = null }) {
    const g = this.g;
    const c = { id, x, y, z, label, table, fixed };
    c.inter = g.interact.add({
      x, y, z, r, hold, holdLabel: `Söker – ${label.toLowerCase()}`,
      label: () => (this.searched.has(id) ? `${label} (genomsökt)` : `Sök: ${label} (håll)`),
      enabled: () => true,
      onHoldStart: () => g.noise(x, z, 5, 'search'),
      action: () => this.search(c),
    });
    this.containers.set(id, c);
    return c;
  }
  search(c) {
    const g = this.g;
    if (this.searched.has(c.id)) { g.hud.message(`${c.label}: redan genomsökt.`); return; }
    this.searched.add(c.id);
    const items = c.fixed ? c.fixed.slice() : roll(c.table);
    this.give(items, c.label);
  }
  give(items, from) {
    const g = this.g;
    if (!items.length) { g.hud.message(`${from}: ingenting användbart.`); return; }
    const names = [];
    for (const [id, n] of items) {
      const def = ITEMS[id];
      if (def.weapon) {
        if (g.weapons.give(def.weapon)) { names.push(def.name); g.hud.message(`Nytt vapen: ${def.name}! Tryck ${g.weaponsSlot(def.weapon)} för att välja.`, 'good'); }
        else { const w = g.weaponsDef(def.weapon); g.inventory.add(w.ammo, randInt(3, Math.ceil(w.mag / 2))); names.push(`${ITEMS[w.ammo].name} (från ${def.name})`); }
        continue;
      }
      g.inventory.add(id, n);
      names.push(n > 1 ? `${n}× ${def.name}` : def.name);
    }
    g.audio?.pickup();
    g.hud.message(`${from}: ${names.join(', ')}`, 'good');
  }
  // respawn some loot each new game day (the world changes)
  newDay() {
    const ids = [...this.searched];
    for (const id of ids) if (chance(0.25) && !String(id).startsWith('fix')) this.searched.delete(id);
  }
  serialize() { return [...this.searched]; }
  restore(a) { this.searched = new Set(a || []); }
}

// Item definitions and the player inventory.
export const ITEMS = {
  ammo_9mm: { name: '9mm-patroner', cat: 'Ammunition', w: 0.012, icon: '▮', desc: 'Pistolammunition 9×19 mm. Passar Glock 17.' },
  ammo_12g: { name: 'Hagelpatroner 12/70', cat: 'Ammunition', w: 0.04, icon: '▮', desc: 'Hagelpatroner för pumphagelgeväret. Förödande på nära håll.' },
  ammo_556: { name: '5,56 mm-patroner', cat: 'Ammunition', w: 0.012, icon: '▮', desc: 'Militär ammunition för Automatkarbin 5.' },
  ammo_308: { name: '.308 Win-patroner', cat: 'Ammunition', w: 0.025, icon: '▮', desc: 'Kraftig jaktammunition för jaktgeväret.' },
  canned: { name: 'Konserverad ärtsoppa', cat: 'Mat', w: 0.45, icon: '🥫', use: { hunger: 38, thirst: -3 }, sound: 'eat', desc: 'Kall ärtsoppa direkt ur burken. Mättar ordentligt.' },
  crispbread: { name: 'Knäckebröd', cat: 'Mat', w: 0.2, icon: '🍞', use: { hunger: 18, thirst: -6 }, sound: 'eat', desc: 'Torrt men håller i evigheter.' },
  bar: { name: 'Energibar', cat: 'Mat', w: 0.06, icon: '🍫', use: { hunger: 14, stamina: 35 }, sound: 'eat', desc: 'Snabb energi – återställer stamina.' },
  herring: { name: 'Surströmming', cat: 'Mat', w: 0.5, icon: '🐟', use: { hunger: 48, thirst: -14 }, sound: 'eat', msg: 'Det luktar fruktansvärt… men det mättar.', desc: 'Jäst strömming. Gör dig törstig.' },
  water: { name: 'Vattenflaska', cat: 'Dryck', w: 0.5, icon: '💧', use: { thirst: 45 }, sound: 'drink', desc: 'Rent vatten. Ovärderligt.' },
  soda: { name: 'Läsk', cat: 'Dryck', w: 0.35, icon: '🥤', use: { thirst: 26, hunger: 4, stamina: 10 }, sound: 'drink', desc: 'Varm och avslagen, men blöt.' },
  bandage: { name: 'Bandage', cat: 'Medicin', w: 0.05, icon: '🩹', use: { heal: 12, stopBleed: true }, desc: 'Stoppar blödning och läker lite.' },
  medkit: { name: 'Första hjälpen-kit', cat: 'Medicin', w: 0.6, icon: '✚', use: { heal: 55, stopBleed: true }, desc: 'Komplett förbandslåda. Återställer mycket hälsa.' },
  painkillers: { name: 'Värktabletter', cat: 'Medicin', w: 0.05, icon: '💊', use: { healOverTime: 30 }, desc: 'Läker långsamt under en minut.' },
  antidote: { name: 'Motgift ZX-7', cat: 'Medicin', w: 0.1, icon: '💉', use: { cure: true }, desc: 'Experimentellt antiviralt motgift framtaget på Sahlgrenska. Stoppar zombieinfektionen omedelbart. Det enda kända botemedlet.' },
  battery: { name: 'Batterier', cat: 'Övrigt', w: 0.05, icon: '🔋', use: { battery: true }, desc: 'Laddar ficklampan till 100 %.' },
  w_pistol: { name: 'Glock 17', cat: 'Vapen', w: 0.9, weapon: 'pistol', desc: 'Polisens tjänstepistol, 9 mm, 17 skott.' },
  w_shotgun: { name: 'Pumphagelgevär', cat: 'Vapen', w: 3.4, weapon: 'shotgun', desc: 'Pumprepeterande hagelgevär, 6 patroner.' },
  w_rifle: { name: 'Automatkarbin 5', cat: 'Vapen', w: 3.9, weapon: 'rifle', desc: 'Försvarsmaktens automatkarbin, 5,56 mm, 30 skott.' },
  w_hunting: { name: 'Jaktgevär .308', cat: 'Vapen', w: 4.2, weapon: 'hunting', desc: 'Repetergevär med kikarsikte, 5 skott.' },
};

export class Inventory {
  constructor() { this.items = {}; this.maxWeight = 30; this.onChange = null; }
  count(id) { return this.items[id] || 0; }
  add(id, n = 1) {
    if (!ITEMS[id] || n <= 0) return 0;
    this.items[id] = (this.items[id] || 0) + n;
    this.onChange && this.onChange();
    return n;
  }
  remove(id, n = 1) {
    const have = this.items[id] || 0; const take = Math.min(have, n);
    if (take <= 0) return 0;
    this.items[id] = have - take; if (this.items[id] <= 0) delete this.items[id];
    this.onChange && this.onChange();
    return take;
  }
  weight() { let w = 0; for (const [id, n] of Object.entries(this.items)) w += (ITEMS[id]?.w || 0) * n; return w; }
  list() { return Object.entries(this.items).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, def: ITEMS[id] })); }
  serialize() { return { ...this.items }; }
  restore(o) { this.items = { ...o }; }
}

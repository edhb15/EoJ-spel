// Inventory, map and dialogue panels.
import { ITEMS } from '../game/items.js';
import { WEAPONS } from '../player/weapons.js';

const $ = id => document.getElementById(id);
const CATS = ['Medicin', 'Mat', 'Dryck', 'Ammunition', 'Övrigt', 'Vapen'];

export class Panels {
  constructor(game) {
    this.g = game; this.open = null; this.sel = null;
    game.closeUI = () => this.close();
    game.dialog = (name, text, opts) => this.dialog(name, text, opts);
    addEventListener('keydown', e => {
      if (game.state !== 'playing') return;
      if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); this.toggle('inventory'); }
      else if (e.code === 'KeyM') this.toggle('mapview');
    });
    game.inventory.onChange = () => { if (this.open === 'inventory') this.renderInventory(); };
  }
  toggle(id) { if (this.open === id) this.close(); else { this.close(true); this.show(id); } }
  show(id) {
    const g = this.g;
    this.open = id; g.uiOpen = true;
    $(id).classList.remove('hidden');
    g.input.unlock();
    if (id === 'inventory') this.renderInventory();
    if (id === 'mapview') g.hud.drawBigMap(g);
  }
  close(silent) {
    const g = this.g;
    for (const id of ['inventory', 'mapview', 'dialog']) $(id).classList.add('hidden');
    const was = this.open; this.open = null; g.uiOpen = false;
    if (was && !silent && g.state === 'playing') g.input.lock();
  }
  update() { if (this.open === 'mapview' && this.g.hud.frame % 10 === 0) this.g.hud.drawBigMap(this.g); }

  renderInventory() {
    const g = this.g, inv = g.inventory;
    $('inv-weight').textContent = `${inv.weight().toFixed(1)} / ${inv.maxWeight} kg`;
    const list = $('inv-list'); list.innerHTML = '';
    const items = inv.list();
    // weapons owned
    const wdiv = document.createElement('div'); wdiv.className = 'inv-cat'; wdiv.textContent = 'VAPEN'; list.appendChild(wdiv);
    for (const [id, o] of Object.entries(g.weapons.owned)) {
      const d = WEAPONS[id];
      const el = document.createElement('div'); el.className = 'inv-item';
      el.innerHTML = `<span>[${d.slot}] ${d.name}</span><span class="q">${d.melee ? '' : `${o.mag}/${d.mag} + ${g.weapons.reserve(id)}`}</span>`;
      el.onclick = () => { g.weapons.select(id); this.renderInventory(); };
      list.appendChild(el);
    }
    for (const cat of CATS) {
      const its = items.filter(i => i.def.cat === cat && !i.def.weapon);
      if (!its.length) continue;
      const c = document.createElement('div'); c.className = 'inv-cat'; c.textContent = cat.toUpperCase(); list.appendChild(c);
      for (const it of its) {
        const el = document.createElement('div'); el.className = 'inv-item' + (this.sel === it.id ? ' sel' : '');
        el.innerHTML = `<span>${it.def.icon || ''} ${it.def.name}</span><span class="q">×${it.n}</span>`;
        el.onclick = () => { this.sel = it.id; this.renderInventory(); };
        list.appendChild(el);
      }
    }
    const det = $('inv-detail'); det.innerHTML = '';
    const p = g.player;
    const status = `<p>Hälsa ${Math.round(p.health)} · Hunger ${Math.round(p.hunger)} · Törst ${Math.round(p.thirst)} · Ficklampa ${Math.round(g.weapons.battery)} %${p.bleeding ? ' · <b style="color:#ff6b5b">BLÖDER</b>' : ''}${g.infection.active ? ' · <b style="color:#ff3b30">INFEKTERAD</b>' : ''}</p>`;
    if (!this.sel || !inv.count(this.sel)) { det.innerHTML = `<h3>Status</h3>${status}<p>Välj ett föremål för att använda eller slänga det. Ammunition används automatiskt när du laddar om.</p>`; return; }
    const def = ITEMS[this.sel];
    det.innerHTML = `<h3>${def.icon || ''} ${def.name}</h3><p>${def.desc || ''}</p><p>Vikt: ${def.w} kg/st · Antal: ${inv.count(this.sel)}</p>${status}`;
    if (def.use) { const b = document.createElement('button'); b.textContent = 'ANVÄND'; b.onclick = () => { g.useItem(this.sel); this.renderInventory(); }; det.appendChild(b); }
    const d = document.createElement('button'); d.textContent = 'SLÄNG 1'; d.onclick = () => { inv.remove(this.sel, 1); this.renderInventory(); }; det.appendChild(d);
  }

  dialog(name, text, opts = []) {
    const g = this.g;
    if (this.open !== 'dialog') { this.close(true); this.open = 'dialog'; g.uiOpen = true; g.input.unlock(); }
    $('dialog').classList.remove('hidden');
    $('dlg-name').textContent = name.toUpperCase();
    $('dlg-text').textContent = text;
    const box = $('dlg-options'); box.innerHTML = '';
    opts.forEach((o, i) => {
      const b = document.createElement('button'); b.textContent = `${i + 1}. ${o.text}`; b.disabled = !!o.disabled;
      b.onclick = () => o.action(); box.appendChild(b);
    });
  }
}

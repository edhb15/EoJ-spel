// Save / load to localStorage. The infection start time is stored as a wall-clock timestamp,
// so the 5-minute real-time countdown continues even across page reloads.
const KEY = 'tvattbert.save.v1';

export class Saves {
  constructor(game) { this.g = game; this.timer = 90; }
  has() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
  save() {
    const g = this.g;
    if (!g.player.alive) return false;
    const data = {
      v: 1, savedAt: Date.now(),
      player: g.player.serialize(), inventory: g.inventory.serialize(), weapons: g.weapons.serialize(),
      time: g.time.serialize(), weather: g.env.weatherKey, infection: g.infection.serialize(),
      loot: g.loot.serialize(), hospital: g.hospital.serialize(), zombies: g.zombies.serialize(),
      npcs: g.npcs.serialize(), events: g.events.serialize(), stats: g.stats, interiors: g.interiors ? g.interiors.serialize() : null,
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { console.warn('save failed', e); return false; }
  }
  load() {
    let data; try { data = JSON.parse(localStorage.getItem(KEY)); } catch { return false; }
    if (!data) return false;
    const g = this.g;
    g.player.restore(data.player); g.inventory.restore(data.inventory); g.weapons.restore(data.weapons);
    g.time.restore(data.time); g.env.setWeather(data.weather || 'mulet', true); g.infection.restore(data.infection);
    g.loot.restore(data.loot); g.hospital.restore(data.hospital); g.zombies.restore(data.zombies);
    g.npcs.restore(data.npcs); g.events.restore(data.events); Object.assign(g.stats, data.stats || {});
    if (g.interiors && data.interiors) g.interiors.restore(data.interiors);
    return true;
  }
  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 90; if (this.g.player.alive) this.save(); }
  }
}

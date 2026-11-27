// Interaction system: finds the interactable the player looks at, shows a prompt and
// handles instant (press E) or timed (hold E) actions.
export class Interact {
  constructor(game) {
    this.g = game; this.cs = 8; this.grid = new Map(); this.current = null; this.holdT = 0;
  }
  key(x, z) { return Math.floor(x / this.cs) * 100000 + Math.floor(z / this.cs); }
  add(it) {
    // it: {x,y,z, r?, label: fn|string, action: fn, hold?: seconds, enabled?: fn, holdLabel?}
    it.r = it.r || 2.2;
    const k = this.key(it.x, it.z);
    let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(it); it._k = k;
    return it;
  }
  remove(it) { const a = this.grid.get(it._k); if (a) { const i = a.indexOf(it); if (i >= 0) a.splice(i, 1); } }
  move(it, x, z) { this.remove(it); it.x = x; it.z = z; this.add(it); }
  find() {
    const g = this.g, cam = g.camera; const p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = cam.position.clone()));
    let best = null, bs = Infinity;
    const gx = Math.floor(p.x / this.cs), gz = Math.floor(p.z / this.cs);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = this.grid.get((gx + a) * 100000 + gz + b); if (!arr) continue;
      for (const it of arr) {
        if (it.enabled && !it.enabled()) continue;
        const dx = it.x - p.x, dy = (it.y ?? p.y) - p.y, dz = it.z - p.z;
        const d = Math.hypot(dx, dy, dz); if (d > it.r) continue;
        const cos = (dx * f.x + dy * f.y + dz * f.z) / (d || 1);
        if (cos < 0.55 && d > 0.9) continue;
        const score = d * (1.6 - cos);
        if (score < bs) { bs = score; best = it; }
      }
    }
    return best;
  }
  update(dt) {
    const g = this.g;
    if (g.uiOpen || !g.player.alive) { g.hud.prompt(null); g.hud.progress(null); this.holdT = 0; return; }
    const it = this.find();
    if (it !== this.current) { this.holdT = 0; g.hud.progress(null); }
    this.current = it;
    if (!it) { g.hud.prompt(null); return; }
    const label = typeof it.label === 'function' ? it.label() : it.label;
    g.hud.prompt(`<b>[E]</b> ${label}`);
    if (it.hold) {
      if (g.input.down('KeyE')) {
        if (this.holdT === 0 && it.onHoldStart) it.onHoldStart();
        this.holdT += dt;
        g.hud.progress(Math.min(1, this.holdT / it.hold), it.holdLabel || 'Söker…');
        if (this.holdT >= it.hold) { this.holdT = 0; g.hud.progress(null); it.action(g); }
      } else if (this.holdT > 0) { this.holdT = 0; g.hud.progress(null); }
    } else if (g.input.hit('KeyE')) it.action(g);
  }
}

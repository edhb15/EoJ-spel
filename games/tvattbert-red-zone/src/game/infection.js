// Zombie virus infection. A bite starts an exact 5-minute countdown measured in REAL time
// (wall clock, Date.now()) – independent of the game clock, pausing, frame rate or sleeping.
// Only the antidote (Motgift ZX-7) stops it. When it reaches zero the player turns.
export const INFECTION_MS = 5 * 60 * 1000;

export class Infection {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.active = false; this.startedAt = 0; this.turned = false; this.cures = 0; this.bites = 0;
  }
  infect() {
    this.bites++;
    if (this.active || this.turned) return false; // already infected: the clock keeps running
    this.active = true; this.startedAt = this.now();
    return true;
  }
  remainingMs() { return this.active ? Math.max(0, INFECTION_MS - (this.now() - this.startedAt)) : INFECTION_MS; }
  progress() { return this.active ? 1 - this.remainingMs() / INFECTION_MS : 0; } // 0..1
  // returns true exactly once when the timer runs out
  check() {
    if (this.active && this.remainingMs() <= 0) { this.active = false; this.turned = true; return true; }
    return false;
  }
  cure() {
    if (!this.active) return false;
    this.active = false; this.startedAt = 0; this.cures++;
    return true;
  }
  serialize() { return { active: this.active, startedAt: this.startedAt, turned: this.turned, cures: this.cures, bites: this.bites }; }
  restore(o) { Object.assign(this, { active: !!o.active, startedAt: o.startedAt || 0, turned: !!o.turned, cures: o.cures || 0, bites: o.bites || 0 }); }
}

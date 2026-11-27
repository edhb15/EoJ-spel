// Game clock. The day/night cycle runs on game time; the infection timer does NOT use this.
export class GameTime {
  constructor(dayLengthMinutes = 24) {
    this.setDayLength(dayLengthMinutes);
    this.startMinute = 8 * 60; // outbreak day 1, 08:00
    this.elapsed = 0;          // game minutes since start
  }
  setDayLength(min) { this.dayLength = min; this.rate = 1440 / (min * 60); } // game minutes per real second
  update(dt) { this.elapsed += dt * this.rate; }
  advanceHours(h) { this.elapsed += h * 60; }
  get absolute() { return this.startMinute + this.elapsed; }
  get day() { return Math.floor(this.absolute / 1440) + 1; }
  get hour() { return (this.absolute % 1440) / 60; }
  get daysPassed() { return this.elapsed / 1440; } // full game days since the outbreak started
  get clock() {
    const m = Math.floor(this.absolute % 1440);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  // 0 = full day, 1 = full night
  get night() {
    const h = this.hour;
    if (h >= 7 && h <= 19.5) return 0;
    if (h > 19.5 && h < 21.5) return (h - 19.5) / 2;
    if (h > 5 && h < 7) return 1 - (h - 5) / 2;
    return 1;
  }
  // real seconds until a given number of game days have passed since start
  realSecondsUntilDays(days) { return Math.max(0, (days * 1440 - this.elapsed) / this.rate); }
  serialize() { return { elapsed: this.elapsed }; }
  restore(o) { this.elapsed = o.elapsed || 0; }
}

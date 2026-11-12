// Procedural driving rock/electro music with a look-ahead scheduler.

const A4 = 440;
const note = (n) => A4 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

// Chord progressions (MIDI roots) and chord tones (intervals)
const SECTIONS = [
  { roots: [57, 53, 48, 55], quality: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]] }, // Am F C G
  { roots: [53, 55, 57, 57], quality: [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 3, 10]] }, // F G Am Am7
];

export class Music {
  constructor(ctx, out, noise) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
    // echo for the lead
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.36;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.delay.connect(lp).connect(fb).connect(this.delay);
    this.delay.connect(this.gain);
    this.track = null;
    this.timer = null;
  }

  play(track) {
    if (this.track === track) return;
    this.track = track;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(track === 'menu' ? 0.9 : 0.5, t, 0.4);
    this.bpm = track === 'menu' ? 124 : 132;
    this.step = 0;
    this.bar = 0;
    this.nextTime = t + 0.08;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    this.track = null;
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(0, t, 0.3);
    clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    if (!this.track) return;
    const spb = 60 / this.bpm / 4; // 16th note
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step++;
      if (this.step === 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  playStep(st, t, spb) {
    const menu = this.track === 'menu';
    const sec = SECTIONS[Math.floor(this.bar / 4) % 2];
    const ci = this.bar % 4;
    const root = sec.roots[ci];
    const chord = sec.quality[ci];
    const phrase = this.bar % 16;
    const breakdown = phrase >= 12 && phrase < 14;
    // drums
    if (st % 4 === 0 && !breakdown) this.kick(t);
    if (st === 4 || st === 12) this.snare(t, breakdown ? 0.5 : 1);
    if (!breakdown) this.hat(t, st % 4 === 2 ? 0.09 : 0.035, st % 4 === 2 ? 0.12 : 0.04);
    if (st === 15 && this.bar % 4 === 3) this.snare(t, 0.6);
    // bass: driving 8ths with octave jumps
    if (st % 2 === 0) {
      const oct = st % 8 === 6 ? 12 : 0;
      this.bass(t, note(root - 24 + oct), spb * 1.8);
    }
    // pad on each bar
    if (st === 0) this.pad(t, root, chord, spb * 16);
    // lead arpeggio (menu track, and later bars of the game track)
    if ((menu || this.bar % 8 >= 4) && !breakdown) {
      const pattern = [0, 1, 2, 1, 2, 3, 2, 1];
      const k = pattern[st % 8];
      const tones = [...chord, 12];
      const n = root + 12 + tones[k % tones.length] + (st >= 8 && this.bar % 2 ? 12 : 0);
      this.lead(t, note(n), spb * 0.9, menu ? 0.07 : 0.045);
    }
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.gain);
    o.start(t);
    o.stop(t + 0.32);
  }

  snare(t, v) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    s.connect(f).connect(g).connect(this.gain);
    s.start(t, Math.random());
    s.stop(t + 0.2);
    const o = this.ctx.createOscillator();
    o.frequency.value = 185;
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.2 * v, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og).connect(this.gain);
    o.start(t);
    o.stop(t + 0.1);
  }

  hat(t, v, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.gain);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  bass(t, f, dur) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp).connect(g).connect(this.gain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  pad(t, root, chord, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    lp.connect(g).connect(this.gain);
    for (const iv of chord) {
      for (const det of [-7, 7]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = note(root + iv);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  lead(t, f, dur, v) {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp).connect(g);
    g.connect(this.gain);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

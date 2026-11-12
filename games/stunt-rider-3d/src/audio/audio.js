// Web Audio: synthesized engine, tyres, wind, impacts, UI sounds and music buses.
import { clamp } from '../core/math.js';
import { Music } from './music.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.vol = { master: 0.8, music: 0.55, sfx: 0.85 };
  }

  // Must be called from a user gesture.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    // shared white noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.music = new Music(ctx, this.musicBus, buf);
    this.buildLoops();
    this.applyVolumes();
    this.ready = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  setVolumes(master, music, sfx) {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  buildLoops() {
    const ctx = this.ctx;
    const mk = (type, freq, q) => {
      const src = this.noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfx);
      src.start();
      return { src, f, g };
    };
    this.wind = mk('bandpass', 650, 0.6);
    this.screech = mk('bandpass', 2300, 5);
    this.gravel = mk('lowpass', 420, 0.7);
  }

  // ---------- engine ----------
  startEngine(type) {
    if (!this.ctx) return;
    this.stopEngine();
    const ctx = this.ctx;
    const e = { type };
    e.out = ctx.createGain();
    e.out.gain.value = 0;
    e.out.connect(this.sfx);
    e.am = ctx.createGain();
    e.am.gain.value = 1;
    e.filter = ctx.createBiquadFilter();
    e.filter.type = 'lowpass';
    e.filter.Q.value = 2.5;
    e.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    const k = type === 'four' ? 6 : 12;
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    e.shaper.curve = curve;
    e.mix = ctx.createGain();
    e.mix.gain.value = 0.5;
    e.mix.connect(e.shaper).connect(e.filter).connect(e.am).connect(e.out);
    const osc = (wave, gain) => {
      const o = ctx.createOscillator();
      o.type = wave;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(e.mix);
      o.start();
      return o;
    };
    if (type === 'single') {
      e.o1 = osc('sawtooth', 0.6);
      e.o2 = osc('square', 0.5);
      e.o3 = osc('triangle', 0.3);
    } else if (type === 'twin') {
      e.o1 = osc('sawtooth', 0.55);
      e.o2 = osc('square', 0.35);
      e.o3 = osc('sawtooth', 0.25);
    } else {
      e.o1 = osc('sawtooth', 0.45);
      e.o2 = osc('sawtooth', 0.3);
      e.o3 = osc('square', 0.22);
    }
    // firing-pulse tremolo for singles and twins
    e.lfo = ctx.createOscillator();
    e.lfo.type = 'square';
    e.lfoGain = ctx.createGain();
    e.lfoGain.gain.value = type === 'single' ? 0.45 : type === 'twin' ? 0.25 : 0.05;
    e.lfo.connect(e.lfoGain).connect(e.am.gain);
    e.lfo.start();
    // intake / exhaust rasp
    const ns = this.noiseSrc();
    e.nf = ctx.createBiquadFilter();
    e.nf.type = 'bandpass';
    e.nf.Q.value = 1.5;
    e.ng = ctx.createGain();
    e.ng.gain.value = 0;
    ns.connect(e.nf).connect(e.ng).connect(e.out);
    ns.start();
    e.ns = ns;
    e.popT = 0;
    e.lastThrottle = 0;
    this.engine = e;
  }

  stopEngine() {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    e.out.gain.setTargetAtTime(0, t, 0.05);
    for (const o of [e.o1, e.o2, e.o3, e.lfo, e.ns]) o.stop(t + 0.3);
    this.engine = null;
  }

  // per-frame update with bike state
  update(dt, s) {
    if (!this.ctx || !this.ready) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    if (e) {
      const rn = clamp((s.rpm - s.idle) / (s.redline - s.idle), 0, 1.05);
      const mul = e.type === 'four' ? 2 : e.type === 'twin' ? 1.1 : 1;
      const f = (s.rpm / 60) * mul;
      const base = e.type === 'single' ? 18 : 22;
      e.o1.frequency.setTargetAtTime(base + f, t, 0.02);
      e.o2.frequency.setTargetAtTime((base + f) * 0.5, t, 0.02);
      e.o3.frequency.setTargetAtTime((base + f) * (e.type === 'four' ? 2.01 : 1.5), t, 0.02);
      e.lfo.frequency.setTargetAtTime(Math.max(8, f * (e.type === 'single' ? 1 : 0.5)), t, 0.02);
      const thr = s.throttle;
      const cutoff = 260 + rn * 1900 + thr * 1400 + (e.type === 'four' ? 900 : 0);
      e.filter.frequency.setTargetAtTime(cutoff, t, 0.03);
      const vol = s.running ? 0.16 + thr * 0.16 + rn * 0.12 + (s.boosting ? 0.06 : 0) : 0;
      e.out.gain.setTargetAtTime(vol, t, 0.05);
      e.nf.frequency.setTargetAtTime(400 + f * 3, t, 0.03);
      e.ng.gain.setTargetAtTime(s.running ? 0.04 + thr * 0.09 + (s.boosting ? 0.1 : 0) : 0, t, 0.05);
      // backfire crackle when lifting off at high revs
      if (e.lastThrottle > 0.5 && thr < 0.1 && rn > 0.5) e.popT = 0.7;
      e.lastThrottle = thr;
      if (e.popT > 0) {
        e.popT -= dt;
        if (Math.random() < dt * 14) this.pop();
      }
    }
    // continuous noises
    const sp = s.speed;
    const wind = clamp((sp / 55) ** 2 * 0.35 + (s.inAir ? 0.06 + sp * 0.002 : 0), 0, 0.45);
    this.wind.g.gain.setTargetAtTime(s.running ? wind : 0, t, 0.1);
    this.wind.f.frequency.setTargetAtTime(400 + sp * 12, t, 0.1);
    const scr = s.grounded && !s.offroad ? clamp((s.slip - 2.2) / 6, 0, 1) * 0.22 : 0;
    this.screech.g.gain.setTargetAtTime(scr, t, 0.04);
    const grav = s.grounded && s.offroad ? clamp(sp / 25, 0, 1) * 0.16 + clamp(s.slip / 8, 0, 0.1) : 0;
    this.gravel.g.gain.setTargetAtTime(grav, t, 0.06);
  }

  silenceLoops() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const l of [this.wind, this.screech, this.gravel]) l.g.gain.setTargetAtTime(0, t, 0.05);
    if (this.engine) this.engine.out.gain.setTargetAtTime(0, t, 0.05);
  }

  // ---------- one shots ----------
  env(node, t, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, vol, type = 'lowpass', freq = 1000, q = 0.7, when = 0, sweepTo = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const s = this.noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, 0.004, vol, dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  pop() {
    this.noiseBurst(0.06, 0.25, 'bandpass', 600 + Math.random() * 900, 2);
    this.tone(90 + Math.random() * 40, 0.05, 'square', 0.08);
  }

  play(name, v = 1) {
    if (!this.ctx) return;
    switch (name) {
      case 'land': {
        const k = clamp(v / 14, 0.15, 1.2);
        this.tone(130, 0.22, 'sine', 0.35 * k, 0, 45);
        this.noiseBurst(0.18, 0.25 * k, 'lowpass', 900);
        if (v > 9) this.tone(220, 0.08, 'square', 0.05 * k, 0.02);
        break;
      }
      case 'crash':
        this.noiseBurst(0.7, 0.5, 'lowpass', 3000, 0.8, 0, 250);
        for (const f of [310, 467, 593, 811]) this.tone(f, 0.35, 'square', 0.035, Math.random() * 0.06);
        this.tone(80, 0.35, 'sine', 0.4, 0, 35);
        break;
      case 'bounce':
        this.tone(100, 0.15, 'sine', 0.15 * clamp(v / 6, 0.2, 1), 0, 40);
        this.noiseBurst(0.12, 0.1, 'lowpass', 700);
        break;
      case 'bump':
        this.tone(160, 0.1, 'triangle', 0.12);
        this.noiseBurst(0.1, 0.12, 'lowpass', 1200);
        break;
      case 'trick':
        this.tone(1046, 0.18, 'sine', 0.12);
        this.tone(1568, 0.25, 'sine', 0.08, 0.06);
        break;
      case 'bank': {
        const notes = [523, 659, 784, 1046, 1318];
        const n = clamp(Math.round(2 + v), 3, 5);
        for (let i = 0; i < n; i++) this.tone(notes[i], 0.22, 'triangle', 0.13, i * 0.07);
        break;
      }
      case 'perfect':
        this.tone(2093, 0.3, 'sine', 0.07);
        this.tone(2637, 0.35, 'sine', 0.06, 0.05);
        this.tone(3136, 0.4, 'sine', 0.05, 0.1);
        break;
      case 'lost':
        this.tone(330, 0.3, 'sawtooth', 0.07, 0, 160);
        break;
      case 'cheer': {
        const t = this.ctx.currentTime;
        const s = this.noiseSrc();
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1100;
        f.Q.value = 0.7;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        const trem = this.ctx.createOscillator();
        trem.frequency.value = 7;
        const tg = this.ctx.createGain();
        tg.gain.value = 0.05 * v;
        trem.connect(tg).connect(g.gain);
        s.connect(f).connect(g).connect(this.sfx);
        s.start(t);
        trem.start(t);
        s.stop(t + 2.3);
        trem.stop(t + 2.3);
        break;
      }
      case 'shift':
        this.noiseBurst(0.04, 0.06, 'highpass', 2500);
        this.tone(v ? 240 : 180, 0.05, 'square', 0.04);
        break;
      case 'hop':
        this.tone(110, 0.12, 'sine', 0.18, 0, 70);
        break;
      case 'whoosh':
        this.noiseBurst(0.35, 0.14, 'bandpass', 500, 1.2, 0, 2200);
        break;
      case 'checkpoint':
        this.tone(880, 0.12, 'square', 0.07);
        this.tone(1320, 0.2, 'square', 0.07, 0.1);
        break;
      case 'count':
        this.tone(440, 0.18, 'sine', 0.22);
        break;
      case 'go':
        this.tone(880, 0.5, 'sine', 0.25);
        this.tone(1320, 0.5, 'sine', 0.12);
        break;
      case 'finish':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, 'square', 0.07, i * 0.1));
        break;
      case 'star':
        [1318, 1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.1, i * 0.05));
        break;
      case 'unlock':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, i * 0.08));
        break;
      case 'click':
        this.tone(1500, 0.03, 'triangle', 0.08);
        break;
      case 'back':
        this.tone(900, 0.04, 'triangle', 0.07);
        break;
      case 'error':
        this.tone(200, 0.15, 'square', 0.06);
        break;
      case 'splash':
        this.noiseBurst(0.9, 0.4, 'lowpass', 1600, 0.5, 0, 300);
        break;
      case 'boost':
        this.noiseBurst(0.5, 0.18, 'bandpass', 300, 1, 0, 1800);
        break;
      default:
        break;
    }
  }
}

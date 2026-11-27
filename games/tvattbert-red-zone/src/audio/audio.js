// Procedural WebAudio engine – every sound is synthesised, no audio files.
import { rand, clamp, pick } from '../core/util.js';

export class Audio {
  constructor(volume = 0.8) {
    this.ok = false; this.volume = volume; this.voices = 0;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = volume;
    this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 20000; this.filter.Q.value = 0.5;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6;
    this.sfx = c.createGain();
    this.sfx.connect(this.filter); this.filter.connect(this.master); this.master.connect(this.comp); this.comp.connect(c.destination);
    // reverb
    this.reverb = c.createConvolver(); this.reverb.buffer = this.impulse(2.6, 2.2);
    this.revSend = c.createGain(); this.revSend.gain.value = 0.25;
    this.revSend.connect(this.reverb); this.reverb.connect(this.filter);
    // street echo (slap-back)
    this.echo = c.createDelay(1); this.echo.delayTime.value = 0.18;
    this.echoFb = c.createGain(); this.echoFb.gain.value = 0.25;
    this.echoLp = c.createBiquadFilter(); this.echoLp.type = 'lowpass'; this.echoLp.frequency.value = 2500;
    this.echoSend = c.createGain(); this.echoSend.gain.value = 0.35;
    this.echoSend.connect(this.echo); this.echo.connect(this.echoLp); this.echoLp.connect(this.echoFb); this.echoFb.connect(this.echo); this.echoLp.connect(this.filter);
    this.noiseBuf = this.makeNoise(3);
    this.brownBuf = this.makeNoise(4, true);
    this.loops = {};
    this.ok = true;
    this.duckGain = 1;
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.ok) this.master.gain.value = v * this.duckGain; }
  duck(on) { this.duckGain = on ? 0.25 : 1; this.setVolume(this.volume); }
  get now() { return this.ctx.currentTime; }

  makeNoise(sec, brown = false) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  impulse(sec, decay) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1);
    }
    return b;
  }

  // ---- routing helpers
  out(pos, { reverb = 0.3, echo = 0, gain = 1 } = {}) {
    const c = this.ctx, g = c.createGain(); g.gain.value = gain;
    let head = g;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 3; p.rolloffFactor = 1.3; p.maxDistance = 400;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      g.connect(p); head = p;
      // distant sounds lose highs
      if (this.listener) {
        const d = Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(18000 - d * 90, 900, 18000);
        p.connect(lp); head = lp;
      }
    }
    head.connect(this.sfx);
    if (reverb > 0) { const r = c.createGain(); r.gain.value = reverb; head.connect(r); r.connect(this.revSend); }
    if (echo > 0) { const e = c.createGain(); e.gain.value = echo; head.connect(e); e.connect(this.echoSend); }
    return g;
  }
  noise(dest, t, dur, { type = 'bandpass', f = 1000, q = 1, gain = 1, attack = 0.002, f2 = null, buf = null } = {}) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = buf || this.noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
    return g;
  }
  tone(dest, t, dur, { type = 'sine', f = 100, f2 = null, gain = 1, attack = 0.005 } = {}) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  setListener(cam) {
    if (!this.ok) return;
    const l = this.ctx.listener, p = cam.position;
    this.listener = { x: p.x, y: p.y, z: p.z };
    const f = cam.getWorldDirection(this._v || (this._v = cam.position.clone()));
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }
  // environment: enclosure 0 (open) .. 1 (indoors / narrow street)
  setEnvironment(enclosure, indoor, echoDelay) {
    if (!this.ok) return;
    const t = this.now;
    this.revSend.gain.setTargetAtTime(0.12 + enclosure * 0.45 + (indoor ? 0.35 : 0), t, 0.3);
    this.echoSend.gain.setTargetAtTime(indoor ? 0.05 : 0.15 + enclosure * 0.45, t, 0.3);
    this.echo.delayTime.setTargetAtTime(clamp(echoDelay, 0.05, 0.6), t, 0.3);
  }
  setMuffle(freq) { if (this.ok) this.filter.frequency.setTargetAtTime(freq, this.now, 0.2); }

  // ---- sounds
  gunshot(kind, pos = null) {
    if (!this.ok) return;
    const t = this.now;
    const P = { pistol: [1, 0.12, 95, 0.25], shotgun: [1.3, 0.3, 70, 0.5], rifle: [1.15, 0.14, 85, 0.32], hunting: [1.4, 0.2, 60, 0.6], npc: [0.9, 0.14, 85, 0.3] }[kind] || [1, 0.12, 90, 0.3];
    const o = this.out(pos, { reverb: 0.55, echo: 0.9, gain: P[0] });
    this.noise(o, t, P[1], { type: 'highpass', f: 900, gain: 1.4 });
    this.noise(o, t, P[3], { type: 'lowpass', f: 2400, f2: 300, gain: 1.1 });
    this.tone(o, t, P[3] * 0.8, { f: P[2], f2: 32, gain: 1.2 });
    this.noise(o, t + 0.003, 0.03, { type: 'bandpass', f: 5000, q: 0.7, gain: 0.8 });
  }
  dryFire() { if (!this.ok) return; const o = this.out(null, { reverb: 0.05 }); this.noise(o, this.now, 0.03, { f: 3500, q: 4, gain: 0.5 }); }
  click(freq = 2500, gain = 0.4, delay = 0) { if (!this.ok) return; const o = this.out(null, { reverb: 0.05 }); this.noise(o, this.now + delay, 0.04, { f: freq, q: 5, gain }); }
  reloadSound(kind, dur) {
    if (!this.ok) return;
    if (kind === 'shell') { this.click(1800, 0.5); this.click(900, 0.3, 0.08); return; }
    this.click(1500, 0.45, 0.1); // mag out
    this.click(2200, 0.5, dur * 0.6); this.click(1200, 0.4, dur * 0.65); // mag in
    if (kind !== 'pistol') { const o = this.out(null, { reverb: 0.05 }); this.noise(o, this.now + dur * 0.85, 0.12, { f: 3000, f2: 1200, q: 2, gain: 0.4 }); }
    else this.click(3000, 0.5, dur * 0.9);
  }
  pump() { if (!this.ok) return; const o = this.out(null, { reverb: 0.05 }); this.noise(o, this.now, 0.1, { f: 1400, f2: 900, q: 2, gain: 0.5 }); this.noise(o, this.now + 0.18, 0.1, { f: 1000, f2: 1600, q: 2, gain: 0.5 }); }
  swing() { if (!this.ok) return; const o = this.out(null, { reverb: 0.05 }); this.noise(o, this.now, 0.18, { f: 600, f2: 2500, q: 1.5, gain: 0.35, attack: 0.06 }); }
  flesh(pos, gain = 0.7) {
    if (!this.ok) return; const o = this.out(pos, { reverb: 0.1, gain });
    this.noise(o, this.now, 0.12, { type: 'lowpass', f: 900, f2: 200, gain: 1 }); this.tone(o, this.now, 0.08, { f: 140, f2: 60, gain: 0.5 });
  }
  impact(pos, metal = false) {
    if (!this.ok) return; const o = this.out(pos, { reverb: 0.1, gain: 0.5 });
    this.noise(o, this.now, metal ? 0.18 : 0.05, { f: metal ? 3200 : 1800, q: metal ? 8 : 1, gain: 0.8 });
  }
  footstep(surface, sprint, crouch) {
    if (!this.ok) return;
    const t = this.now, gain = (sprint ? 0.55 : crouch ? 0.12 : 0.3) * rand(0.8, 1.1);
    const o = this.out(null, { reverb: surface === 'tile' ? 0.5 : 0.08, gain });
    switch (surface) {
      case 'grass': this.noise(o, t, 0.09, { f: 2600, q: 0.6, gain: 0.5, attack: 0.015 }); break;
      case 'forest': for (let i = 0; i < 4; i++) this.noise(o, t + i * 0.018 + rand(0, 0.01), 0.03, { f: rand(2500, 4500), q: 2, gain: 0.6 }); break;
      case 'tile': this.noise(o, t, 0.04, { f: 3000, q: 1.5, gain: 0.9 }); this.tone(o, t, 0.05, { f: 120, f2: 70, gain: 0.4 }); break;
      case 'water': this.noise(o, t, 0.2, { type: 'lowpass', f: 3000, f2: 500, gain: 0.8, attack: 0.02 }); break;
      case 'metal': this.noise(o, t, 0.12, { f: 2200, q: 6, gain: 0.7 }); break;
      default: this.noise(o, t, 0.045, { f: 1500, q: 0.9, gain: 0.8 }); this.tone(o, t, 0.06, { f: 90, f2: 50, gain: 0.5 });
    }
  }
  // formant-synthesised zombie voice
  zombie(pos, kind = 'groan', pitch = 1) {
    if (!this.ok || this.voices > 10) return;
    const c = this.ctx, t = this.now;
    const dur = kind === 'scream' ? 2.4 : kind === 'attack' ? 0.5 : kind === 'death' ? 0.9 : rand(0.8, 1.8);
    const f0 = (kind === 'scream' ? rand(380, 520) : kind === 'attack' ? rand(110, 160) : rand(65, 110)) * pitch;
    const o = this.out(pos, { reverb: 0.35, echo: kind === 'scream' ? 0.6 : 0.1, gain: kind === 'scream' ? 2.2 : 1.1 });
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f0 * rand(0.7, 1.25), t + dur);
    const lfo = c.createOscillator(); lfo.frequency.value = rand(4, 9); const lg = c.createGain(); lg.gain.value = f0 * 0.06;
    lfo.connect(lg); lg.connect(osc.frequency);
    const mix = c.createGain(); mix.gain.value = 1;
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = kind === 'scream' ? 1400 : rand(450, 750); f1.Q.value = 4;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = kind === 'scream' ? 2600 : rand(950, 1300); f2.Q.value = 5;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.7, t + 0.12);
    env.gain.setValueAtTime(0.7, t + dur * 0.7); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f1); osc.connect(f2); f1.connect(mix); f2.connect(mix); mix.connect(env); env.connect(o);
    this.noise(o, t, dur, { f: kind === 'scream' ? 3000 : 1200, q: 0.8, gain: kind === 'scream' ? 0.5 : 0.25, attack: 0.1 });
    osc.start(t); lfo.start(t); osc.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    this.voices++; setTimeout(() => this.voices--, dur * 1000 + 100);
  }
  bite() {
    if (!this.ok) return; const o = this.out(null, { reverb: 0.1, gain: 1.2 }), t = this.now;
    this.noise(o, t, 0.25, { type: 'lowpass', f: 1800, f2: 250, gain: 1 });
    for (let i = 0; i < 3; i++) this.noise(o, t + 0.05 + i * 0.06, 0.05, { f: rand(1500, 3000), q: 3, gain: 0.8 });
    this.hurt(1.2);
  }
  hurt(gain = 0.8) {
    if (!this.ok) return; const o = this.out(null, { reverb: 0.05, gain }), t = this.now;
    const f = rand(130, 170);
    this.tone(o, t, 0.25, { type: 'sawtooth', f, f2: f * 0.7, gain: 0.25, attack: 0.02 });
    this.noise(o, t, 0.2, { f: 800, q: 2, gain: 0.3 });
  }
  heartbeat(intensity) {
    if (!this.ok) return; const o = this.out(null, { reverb: 0, gain: 0.5 + intensity * 0.7 }), t = this.now;
    this.tone(o, t, 0.14, { f: 58, f2: 40, gain: 1, attack: 0.01 }); this.tone(o, t + 0.22, 0.12, { f: 50, f2: 36, gain: 0.7, attack: 0.01 });
  }
  pickup() { if (!this.ok) return; const o = this.out(null, { reverb: 0 }); this.tone(o, this.now, 0.08, { type: 'triangle', f: 880, gain: 0.15 }); this.tone(o, this.now + 0.06, 0.1, { type: 'triangle', f: 1320, gain: 0.12 }); }
  eat() { if (!this.ok) return; const o = this.out(null, { reverb: 0 }); for (let i = 0; i < 4; i++) this.noise(o, this.now + i * 0.18, 0.08, { f: 2500, q: 1, gain: 0.4 }); }
  drink() { if (!this.ok) return; const o = this.out(null, { reverb: 0 }); for (let i = 0; i < 4; i++) this.noise(o, this.now + i * 0.3, 0.15, { type: 'lowpass', f: 500, f2: 250, gain: 0.6, attack: 0.03 }); }
  door(pos, open = true) {
    if (!this.ok) return; const o = this.out(pos, { reverb: 0.4, gain: 0.7 }), t = this.now;
    this.tone(o, t, 0.6, { type: 'sawtooth', f: open ? 220 : 160, f2: open ? 140 : 110, gain: 0.05, attack: 0.1 });
    this.noise(o, t, 0.5, { f: 900, f2: 600, q: 6, gain: 0.25, attack: 0.08 });
    if (!open) this.noise(o, t + 0.45, 0.12, { type: 'lowpass', f: 400, gain: 0.9 });
  }
  locked() { if (!this.ok) return; const o = this.out(null); for (let i = 0; i < 3; i++) this.noise(o, this.now + i * 0.07, 0.05, { f: 1800, q: 6, gain: 0.4 }); }
  bang(pos) { if (!this.ok) return; const o = this.out(pos, { reverb: 0.5, gain: 1 }); this.noise(o, this.now, 0.3, { type: 'lowpass', f: 500, f2: 120, gain: 1 }); this.tone(o, this.now, 0.25, { f: 70, f2: 40, gain: 0.8 }); }
  thunder(dist) {
    if (!this.ok) return; const o = this.out(null, { reverb: 0.8, gain: clamp(1.6 - dist * 0.3, 0.4, 1.6) }), t = this.now;
    this.noise(o, t, 3.5, { type: 'lowpass', f: 400, f2: 60, gain: 1, attack: 0.05, buf: this.brownBuf });
    this.noise(o, t + 0.1, 1.2, { type: 'lowpass', f: 900, f2: 100, gain: 0.6, attack: 0.02 });
  }
  radio() { if (!this.ok) return; const o = this.out(null, { reverb: 0 }); this.noise(o, this.now, 0.5, { f: 2500, q: 0.5, gain: 0.25, attack: 0.02 }); this.tone(o, this.now + 0.5, 0.15, { type: 'square', f: 1000, gain: 0.05 }); }
  siren(pos) {
    if (!this.ok) return; const c = this.ctx, t = this.now, o = this.out(pos, { reverb: 0.7, echo: 0.5, gain: 0.6 });
    const osc = c.createOscillator(); osc.type = 'triangle';
    const lfo = c.createOscillator(); lfo.frequency.value = 0.35; const lg = c.createGain(); lg.gain.value = 180;
    osc.frequency.value = 720; lfo.connect(lg); lg.connect(osc.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 2); g.gain.exponentialRampToValueAtTime(0.0001, t + 9);
    osc.connect(g); g.connect(o); osc.start(t); lfo.start(t); osc.stop(t + 9.2); lfo.stop(t + 9.2);
  }
  crow(pos) { if (!this.ok) return; const o = this.out(pos, { reverb: 0.4, gain: 0.5 }); for (let i = 0; i < 3; i++) { const t = this.now + i * 0.35; this.tone(o, t, 0.18, { type: 'sawtooth', f: 700, f2: 450, gain: 0.08 }); this.noise(o, t, 0.18, { f: 1500, q: 3, gain: 0.15 }); } }
  dog(pos) { if (!this.ok) return; const o = this.out(pos, { reverb: 0.5, echo: 0.4, gain: 0.6 }); for (let i = 0; i < 2; i++) { const t = this.now + i * 0.4; this.tone(o, t, 0.15, { type: 'sawtooth', f: 320, f2: 220, gain: 0.15 }); this.noise(o, t, 0.12, { f: 900, q: 2, gain: 0.3 }); } }
  helicopter(pos, dur = 14) {
    if (!this.ok) return; const c = this.ctx, t = this.now, o = this.out(pos, { reverb: 0.5, echo: 0.5, gain: 1.2 });
    const s = c.createBufferSource(); s.buffer = this.brownBuf; s.loop = true;
    const am = c.createGain(); const lfo = c.createOscillator(); lfo.frequency.value = 11; const lg = c.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.5;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(am); am.connect(g); g.connect(o); s.start(t); lfo.start(t); s.stop(t + dur); lfo.stop(t + dur);
  }
  spit(pos) { if (!this.ok) return; const o = this.out(pos, { reverb: 0.2, gain: 0.8 }); this.noise(o, this.now, 0.25, { f: 1200, f2: 400, q: 1, gain: 0.8 }); }
  glass(pos) { if (!this.ok) return; const o = this.out(pos, { reverb: 0.4, gain: 0.8 }); for (let i = 0; i < 6; i++) this.tone(o, this.now + i * 0.03, 0.2, { type: 'sine', f: rand(2500, 6000), gain: 0.08 }); this.noise(o, this.now, 0.3, { type: 'highpass', f: 3000, gain: 0.5 }); }

  // ---- loops
  loop(name, build) {
    if (!this.ok) return null;
    if (this.loops[name]) return this.loops[name];
    const l = build(); this.loops[name] = l; return l;
  }
  noiseLoop(name, { type = 'lowpass', f = 600, q = 0.7, brown = false } = {}) {
    return this.loop(name, () => {
      const c = this.ctx, s = c.createBufferSource(); s.buffer = brown ? this.brownBuf : this.noiseBuf; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(this.master); s.start();
      return { gain: g, filter: fl };
    });
  }
  updateAmbience(dt, { wind, rain, indoor, infect, night, health }) {
    if (!this.ok) return;
    const t = this.now;
    const w = this.noiseLoop('wind', { f: 500, brown: true });
    const gust = 0.5 + 0.5 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1);
    w.gain.gain.setTargetAtTime((0.05 + wind * 0.25 * gust) * (indoor ? 0.25 : 1), t, 0.5);
    w.filter.frequency.setTargetAtTime(300 + gust * 700 * (0.5 + wind), t, 0.5);
    const r = this.noiseLoop('rain', { type: 'highpass', f: 1200, q: 0.3 });
    r.gain.gain.setTargetAtTime(rain * (indoor ? 0.04 : 0.16), t, 0.8);
    const drone = this.noiseLoop('drone', { f: 120, brown: true, q: 1.5 });
    drone.gain.gain.setTargetAtTime(0.06 + night * 0.06, t, 1);
    // infection: tinnitus + muffling
    const tin = this.loop('tinnitus', () => {
      const c = this.ctx, o = c.createOscillator(); o.frequency.value = 7400; const g = c.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.master); o.start(); return { gain: g };
    });
    tin.gain.gain.setTargetAtTime(infect > 0 ? 0.004 + infect * 0.02 : (health < 0.25 ? 0.006 : 0), t, 0.5);
    const muffle = Math.min(indoor ? 9000 : 20000, infect > 0 ? 16000 - infect * 13500 : 20000, health < 0.2 ? 3000 : 20000);
    this.setMuffle(muffle);
    // random ambient events
    this.ambT = (this.ambT || 5) - dt;
    if (this.ambT <= 0 && this.listener) {
      this.ambT = rand(8, 22);
      const L = this.listener, a = rand(0, Math.PI * 2), d = rand(120, 300);
      const pos = { x: L.x + Math.cos(a) * d, y: L.y + 10, z: L.z + Math.sin(a) * d };
      const r2 = Math.random();
      if (r2 < 0.25 && !night) this.crow({ x: L.x + Math.cos(a) * 30, y: L.y + 15, z: L.z + Math.sin(a) * 30 });
      else if (r2 < 0.4) this.dog(pos);
      else if (r2 < 0.55) this.siren(pos);
      else if (r2 < 0.75) { for (let i = 0; i < 3; i++) setTimeout(() => this.gunshot(pick(['rifle', 'pistol', 'npc']), pos), i * rand(150, 500)); }
      else this.zombie(pos, Math.random() < 0.15 ? 'scream' : 'groan', 0.9);
    }
  }
}

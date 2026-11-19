// Chicago Bois – all sound is synthesised with the Web Audio API (no audio files).
'use strict';
(function (CB) {
  const A = CB.Audio = {
    ctx: null, ready: false,
    lx: 0, lz: 0, lyaw: 0,
    loops: {},
  };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = A.ctx = new AC();
    A.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    A.master.connect(comp); comp.connect(ctx.destination);
    A.sfx = ctx.createGain(); A.sfx.connect(A.master);
    A.amb = ctx.createGain(); A.amb.connect(A.master);
    A.mus = ctx.createGain(); A.mus.connect(A.master);
    A.musFilter = ctx.createBiquadFilter(); A.musFilter.type = 'lowpass'; A.musFilter.frequency.value = 20000;
    A.musFilter.connect(A.mus);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    A.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // brown-ish noise for rumbles
    A.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = A.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    A.applyVolumes();
    A.buildLoops();
    A.ready = true;
    if (A._wantMusic) A.music(true);
  };

  A.applyVolumes = function () {
    if (!A.ctx) return;
    const s = CB.settings;
    A.master.gain.value = s.master;
    A.mus.gain.value = s.music * 0.55;
  };

  // ---------------------------------------------------------------- primitives
  function now() { return A.ctx.currentTime; }
  function noiseSrc(brown) {
    const s = A.ctx.createBufferSource();
    s.buffer = brown ? A.brownBuf : A.noiseBuf; s.loop = true;
    s.loopStart = Math.random(); s.loopEnd = 1.9;
    return s;
  }
  function out(vol, pan, dest) {
    const g = A.ctx.createGain(); g.gain.value = vol;
    if (pan && A.ctx.createStereoPanner) {
      const p = A.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest || A.sfx);
    } else g.connect(dest || A.sfx);
    return g;
  }
  // Oscillator note with attack/decay envelope.
  function tone(type, f, t0, dur, vol, o) {
    o = o || {};
    const ctx = A.ctx;
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + (o.slide || dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.a || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; f2.Q.value = o.q || 1; osc.connect(f2); node = f2; }
    node.connect(g); g.connect(o.dest || out(1, o.pan));
    osc.start(t0); osc.stop(t0 + dur + 0.05);
    return osc;
  }
  function burst(t0, dur, vol, ftype, freq, o) {
    o = o || {};
    const ctx = A.ctx;
    const s = noiseSrc(o.brown);
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(freq, t0); f.Q.value = o.q || 0.8;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.a || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(o.dest || out(1, o.pan));
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  // Distance attenuation + stereo pan relative to the listener.
  A.spatial = function (x, z, maxD) {
    const dx = x - A.lx, dz = z - A.lz;
    const d = Math.hypot(dx, dz);
    if (d > maxD) return null;
    const v = Math.pow(1 - d / maxD, 2);
    const right = dx * Math.cos(A.lyaw) - dz * Math.sin(A.lyaw);
    const pan = d > 0.5 ? Math.max(-1, Math.min(1, right / d)) * 0.8 : 0;
    return { v, pan };
  };

  // ---------------------------------------------------------------- one-shots
  const SFX = {
    step(t, v, p) { burst(t, 0.07, 0.12 * v, 'bandpass', 900 + Math.random() * 500, { pan: p, q: 1.2 }); },
    cash(t, v) {
      burst(t, 0.06, 0.25 * v, 'highpass', 3000);
      tone('triangle', 2637, t + 0.03, 0.35, 0.22 * v);
      tone('triangle', 3520, t + 0.11, 0.6, 0.2 * v);
    },
    coin(t, v) { tone('square', 1318, t, 0.08, 0.08 * v); tone('square', 1760, t + 0.07, 0.18, 0.08 * v); },
    glass(t, v, p) {
      burst(t, 0.45, 0.5 * v, 'highpass', 2500, { pan: p });
      for (let i = 0; i < 7; i++) tone('sine', 2500 + Math.random() * 4000, t + 0.02 + Math.random() * 0.35, 0.15, 0.07 * v, { pan: p });
    },
    thud(t, v, p) { tone('sine', 140, t, 0.25, 0.5 * v, { to: 40, pan: p }); burst(t, 0.12, 0.25 * v, 'lowpass', 900, { pan: p }); },
    punch(t, v, p) { tone('sine', 180, t, 0.18, 0.45 * v, { to: 55, pan: p }); burst(t, 0.08, 0.3 * v, 'bandpass', 1500, { pan: p }); },
    crash(t, v, p) {
      burst(t, 0.6, 0.7 * v, 'lowpass', 1800, { pan: p, to: 300 });
      burst(t, 0.3, 0.3 * v, 'bandpass', 3500, { pan: p });
      tone('square', 220, t, 0.25, 0.08 * v, { to: 90, pan: p, lp: 1200 });
      tone('triangle', 1250, t + 0.02, 0.5, 0.06 * v, { pan: p });
    },
    click(t, v) { burst(t, 0.025, 0.3 * v, 'highpass', 4000); },
    gun(t, v, p) {
      // sharp crack + low thump + a short city echo
      burst(t, 0.09, 0.9 * v, 'highpass', 1200, { pan: p, a: 0.001 });
      burst(t, 0.22, 0.75 * v, 'lowpass', 2600, { pan: p, a: 0.001, to: 500 });
      tone('sine', 140, t, 0.2, 0.7 * v, { to: 38, pan: p, a: 0.001 });
      burst(t + 0.13, 0.35, 0.18 * v, 'lowpass', 900, { pan: -p * 0.5 });
    },
    reload(t, v) { burst(t, 0.03, 0.35 * v, 'bandpass', 2500, { q: 3 }); burst(t + 0.5, 0.04, 0.4 * v, 'bandpass', 1800, { q: 3 }); burst(t + 0.62, 0.03, 0.35 * v, 'highpass', 3500); },
    ricochet(t, v, p) { tone('sine', 3200, t, 0.18, 0.08 * v, { to: 1800, pan: p }); burst(t, 0.05, 0.2 * v, 'highpass', 4000, { pan: p }); },
    unlock(t, v) { tone('square', 660, t, 0.08, 0.1 * v, { lp: 3000 }); tone('square', 990, t + 0.08, 0.15, 0.1 * v, { lp: 3000 }); },
    fail(t, v) { tone('sawtooth', 160, t, 0.35, 0.18 * v, { lp: 900 }); tone('sawtooth', 120, t + 0.12, 0.4, 0.18 * v, { lp: 900 }); },
    blip(t, v) { tone('sine', 880, t, 0.09, 0.12 * v); tone('sine', 1320, t + 0.06, 0.12, 0.1 * v); },
    beep(t, v) { tone('square', 880, t, 0.16, 0.12 * v, { lp: 2500 }); },
    beepHi(t, v) { tone('square', 1760, t, 0.4, 0.14 * v, { lp: 3500 }); },
    ding(t, v) { tone('sine', 1568, t, 0.5, 0.2 * v); tone('sine', 2093, t + 0.05, 0.6, 0.12 * v); },
    zap(t, v, p) {
      for (let i = 0; i < 6; i++) tone('sawtooth', 300 + Math.random() * 900, t + i * 0.035, 0.05, 0.12 * v, { pan: p });
      burst(t, 0.25, 0.25 * v, 'highpass', 5000, { pan: p });
    },
    honk(t, v, p) {
      tone('square', 349, t, 0.35, 0.09 * v, { lp: 1600, pan: p });
      tone('square', 440, t, 0.35, 0.09 * v, { lp: 1600, pan: p });
    },
    door(t, v, p) { burst(t, 0.1, 0.3 * v, 'lowpass', 600, { pan: p }); tone('sine', 90, t, 0.15, 0.3 * v, { pan: p }); },
    spark(t, v, p) { for (let i = 0; i < 4; i++) burst(t + i * 0.07, 0.04, 0.25 * v, 'highpass', 6000, { pan: p }); },
    flash(t, v) { burst(t, 0.05, 0.4 * v, 'highpass', 3000); tone('sine', 3000, t + 0.03, 0.4, 0.06 * v, { to: 6000 }); },
    munch(t, v) { for (let i = 0; i < 3; i++) burst(t + i * 0.16, 0.09, 0.3 * v, 'bandpass', 700 + i * 150, { q: 2 }); },
    whoosh(t, v) { burst(t, 0.5, 0.25 * v, 'bandpass', 400, { to: 2400, q: 1.5 }); },
    hey(t, v, p) { tone('sawtooth', 300, t, 0.22, 0.12 * v, { to: 420, lp: 1400, pan: p, slide: 0.12 }); },
    oof(t, v, p) { tone('sawtooth', 260, t, 0.25, 0.14 * v, { to: 140, lp: 1100, pan: p }); },
    splash(t, v, p) { burst(t, 0.8, 0.5 * v, 'lowpass', 2200, { pan: p, to: 400 }); },
    star(t, v) {
      // dramatic "wanted level up" stinger
      [233, 277, 349].forEach((f, i) => tone('sawtooth', f, t, 0.9, 0.09 * v, { lp: 1800, detune: i * 6 }));
      tone('sine', 110, t, 0.5, 0.5 * v, { to: 40 });
      burst(t, 0.3, 0.3 * v, 'highpass', 5000);
      tone('square', 932, t + 0.12, 0.25, 0.06 * v, { lp: 3000 });
      tone('square', 1244, t + 0.24, 0.45, 0.06 * v, { lp: 3000 });
    },
    escape(t, v) { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, t + i * 0.09, 0.4, 0.15 * v)); },
    busted(t, v) {
      [392, 370, 349].forEach((f, i) => tone('sawtooth', f, t + i * 0.45, 0.42, 0.14 * v, { lp: 1200 }));
      const o = tone('sawtooth', 330, t + 1.35, 1.6, 0.16 * v, { lp: 1000, to: 300, slide: 1.4 });
      const lfo = A.ctx.createOscillator(); lfo.frequency.value = 6;
      const lg = A.ctx.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t + 1.35); lfo.stop(t + 3);
    },
    victory(t, v) {
      const notes = [523, 659, 784, 1047, 784, 1047, 1319];
      notes.forEach((f, i) => tone('square', f, t + i * 0.11, 0.3, 0.07 * v, { lp: 4000 }));
      [523, 659, 784, 1047].forEach((f) => tone('sawtooth', f, t + 0.8, 1.8, 0.06 * v, { lp: 3000 }));
      tone('sine', 65, t + 0.8, 1.2, 0.4 * v, { to: 40 });
    },
    countdown(t, v) { tone('square', 660, t, 0.25, 0.12 * v, { lp: 3000 }); },
    go(t, v) { tone('square', 1320, t, 0.6, 0.14 * v, { lp: 4000 }); },
    alarmCar(t, v, p) { for (let i = 0; i < 12; i++) tone('square', i % 2 ? 1050 : 750, t + i * 0.22, 0.2, 0.08 * v, { lp: 2500, pan: p }); },
    pop(t, v, p) { burst(t, 0.2, 0.6 * v, 'lowpass', 2500, { pan: p }); tone('sine', 120, t, 0.3, 0.5 * v, { to: 35, pan: p }); },
    explode(t, v, p) {
      burst(t, 1.4, 0.9 * v, 'lowpass', 1200, { pan: p, to: 120, brown: false });
      tone('sine', 90, t, 1.0, 0.8 * v, { to: 25, pan: p });
    },
  };

  // Play a one-shot. If x/z given, it is positional.
  A.play = function (name, vol, x, z, maxD) {
    if (!A.ready || !SFX[name]) return;
    let v = vol == null ? 1 : vol, pan = 0;
    if (x != null) {
      const s = A.spatial(x, z, maxD || 60);
      if (!s) return;
      v *= s.v; pan = s.pan;
      if (v < 0.01) return;
    }
    try { SFX[name](now() + 0.01, v, pan); } catch (e) { /* ignore audio glitches */ }
  };

  // ---------------------------------------------------------------- loops
  function loopNode(build) {
    const g = A.ctx.createGain(); g.gain.value = 0;
    let p = null;
    if (A.ctx.createStereoPanner) { p = A.ctx.createStereoPanner(); g.connect(p); p.connect(A.sfx); } else g.connect(A.sfx);
    build(g);
    return { g, p, set(vol, pan) {
      g.gain.setTargetAtTime(Math.max(0, vol), now(), 0.08);
      if (p && pan != null) p.pan.setTargetAtTime(pan, now(), 0.1);
    } };
  }
  function filtered(src, type, f, q) {
    const fl = A.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
    src.connect(fl); return fl;
  }

  A.buildLoops = function () {
    const ctx = A.ctx, L = A.loops;
    // City ambience (on ambience bus)
    {
      const s = noiseSrc(true); const f = filtered(s, 'lowpass', 380);
      const g = ctx.createGain(); g.gain.value = 0.22; f.connect(g); g.connect(A.amb); s.start();
      L.city = { g };
    }
    L.traffic = loopNode((g) => { const s = noiseSrc(true); filtered(s, 'bandpass', 160, 0.6).connect(g); s.start(); });
    // Player engine: two detuned oscillators through a lowpass
    L.engine = loopNode((g) => {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.detune.value = -1200;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3;
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
      o1.start(); o2.start();
      L._eng = { o1, o2, lp };
    });
    // Siren (nearest active police unit)
    L.siren = loopNode((g) => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 700;
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 700;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const mix = ctx.createGain(); mix.gain.value = 0.35;
      o.connect(mix); o2.connect(lp); mix.connect(lp); lp.connect(g);
      o.start(); o2.start();
      L._sir = { o, o2 };
    });
    // Helicopter rotor
    L.heli = loopNode((g) => {
      const s = noiseSrc(true); const f = filtered(s, 'lowpass', 500);
      const am = ctx.createGain(); am.gain.value = 0.5; f.connect(am); am.connect(g);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 13; const lg = ctx.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(am.gain); lfo.start(); s.start();
    });
    L.train = loopNode((g) => { const s = noiseSrc(true); filtered(s, 'lowpass', 220).connect(g); s.start(); });
    L.water = loopNode((g) => { const s = noiseSrc(); filtered(s, 'bandpass', 1300, 0.5).connect(g); s.start(); });
    L.spray = loopNode((g) => { const s = noiseSrc(); filtered(s, 'highpass', 5000).connect(g); s.start(); });
    L.alarm = loopNode((g) => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 980;
      const am = ctx.createGain(); am.gain.value = 0.5; const lp = filtered(o, 'lowpass', 3000); lp.connect(am); am.connect(g);
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 16; const lg = ctx.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(am.gain); lfo.start(); o.start();
    });
    L.skid = loopNode((g) => { const s = noiseSrc(); filtered(s, 'bandpass', 2400, 3).connect(g); s.start(); });
  };

  A.loop = function (name, vol, pan) {
    if (!A.ready) return;
    const l = A.loops[name];
    if (l && l.set) l.set(vol, pan);
  };
  A.engine = function (on, rpm, load) {
    if (!A.ready) return;
    const e = A.loops._eng;
    A.loop('engine', on ? 0.07 + load * 0.06 : 0);
    if (!on) return;
    const f = 38 + rpm * 120;
    e.o1.frequency.setTargetAtTime(f, now(), 0.05);
    e.o2.frequency.setTargetAtTime(f, now(), 0.05);
    e.lp.frequency.setTargetAtTime(400 + rpm * 1400 + load * 900, now(), 0.05);
  };
  A.sirenTone = function (t, mode) {
    if (!A.ready) return;
    const s = A.loops._sir;
    let f;
    if (mode === 'yelp') f = 750 + 650 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 3.2));
    else f = 650 + 650 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 3.6));
    s.o.frequency.setTargetAtTime(f, now(), 0.02);
    s.o2.frequency.setTargetAtTime(f, now(), 0.02);
  };

  // Ambient extras: birds by day, crickets at night, distant horns.
  let ambT = 2;
  A.ambient = function (dt, night, trafficLevel) {
    if (!A.ready) return;
    A.loop('traffic', 0.05 + trafficLevel * 0.2);
    ambT -= dt;
    if (ambT > 0) return;
    ambT = 1.5 + Math.random() * 4;
    const t = now();
    const r = Math.random();
    if (r < 0.3) {
      // distant horn
      const p = Math.random() * 1.6 - 0.8;
      tone('square', 330 + Math.random() * 120, t, 0.25 + Math.random() * 0.3, 0.025, { lp: 1200, pan: p });
    } else if (night < 0.5) {
      for (let i = 0; i < 3; i++) tone('sine', 2600 + Math.random() * 1500, t + i * 0.12, 0.09, 0.025, { to: 3800, pan: Math.random() - 0.5 });
    } else {
      for (let i = 0; i < 6; i++) tone('sine', 4400, t + i * 0.06, 0.04, 0.015, { pan: Math.random() - 0.5 });
    }
  };

  // ---------------------------------------------------------------- music
  // A tiny Chicago house groove (122 BPM, F minor) for the menu and the car radio.
  const BPM = 122, STEP = 60 / BPM / 4;
  const BASS = [41, 0, 0, 41, 0, 0, 44, 0, 0, 41, 0, 0, 48, 0, 46, 0];
  const CHORDS = [[53, 56, 60, 63], [53, 56, 60, 63], [49, 53, 56, 60], [51, 55, 58, 62]];
  const STABS = [2, 6, 10, 11];
  const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
  let seqT = 0, step = 0, seqTimer = null;
  A.music = function (on) {
    A._wantMusic = on;
    if (!A.ready) return;
    if (on && !seqTimer) {
      seqT = now() + 0.1; step = 0;
      seqTimer = setInterval(schedule, 25);
    } else if (!on && seqTimer) {
      clearInterval(seqTimer); seqTimer = null;
    }
  };
  A.radio = function (on) {
    if (!A.ready) return;
    A.musFilter.frequency.setTargetAtTime(on ? 3200 : 20000, now(), 0.1);
  };
  function schedule() {
    while (seqT < now() + 0.12) {
      const s = step % 16, bar = Math.floor(step / 16) % 4;
      const d = A.musFilter, t = seqT;
      if (s % 4 === 0) tone('sine', 150, t, 0.28, 0.9, { to: 45, slide: 0.12, dest: d });
      if (s % 4 === 2) burst(t, 0.12, 0.18, 'highpass', 7000, { dest: d });
      else burst(t, 0.03, 0.06, 'highpass', 9000, { dest: d });
      if (s === 4 || s === 12) { burst(t, 0.18, 0.3, 'bandpass', 1300, { dest: d, q: 1.5 }); burst(t + 0.012, 0.15, 0.2, 'bandpass', 1100, { dest: d }); }
      if (BASS[s]) tone('sawtooth', mf(BASS[s] - 12 + (bar === 2 ? -4 : bar === 3 ? -2 : 0)), t, STEP * 2.2, 0.32, { lp: 520, q: 6, dest: d });
      if (STABS.includes(s)) CHORDS[bar].forEach((n) => tone('square', mf(n), t, 0.2, 0.035, { lp: 2400, dest: d }));
      seqT += STEP; step++;
    }
  }
})(window.CB);

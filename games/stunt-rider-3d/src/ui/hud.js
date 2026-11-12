// In-game HUD: mode panel, points, combo, trick popups, messages, speedometer, minimap and meters.
import { clamp, formatPoints } from '../core/math.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

export class HUD {
  constructor(root, world, profile) {
    this.world = world;
    this.profile = profile;
    this.root = root;
    root.innerHTML = '';
    this.panel = el('div', 'hud-panel', root);
    this.pTitle = el('div', 'hp-title', this.panel);
    this.pTimer = el('div', 'hp-timer', this.panel);
    this.pLines = el('div', 'hp-lines', this.panel);
    this.points = el('div', 'hud-points', root);
    this.ptsVal = el('div', 'pts-val', this.points, '0');
    el('div', 'pts-label', this.points, 'CAREER POINTS');
    this.combo = el('div', 'hud-combo', root);
    this.comboList = el('div', 'combo-list', this.combo);
    this.comboTotal = el('div', 'combo-total', this.combo);
    this.comboLink = el('div', 'combo-link', this.combo);
    this.comboLinkBar = el('div', 'combo-link-bar', this.comboLink);
    this.pending = el('div', 'hud-pending', root);
    this.popups = el('div', 'hud-popups', root);
    this.flashEl = el('div', 'hud-flash', root);
    this.flashMain = el('div', 'flash-main', this.flashEl);
    this.flashSub = el('div', 'flash-sub', this.flashEl);
    this.quality = el('div', 'hud-quality', root);
    this.zone = el('div', 'hud-zone', root);
    this.cam = el('div', 'hud-cam', root);
    this.distance = el('div', 'hud-distance', root);
    this.countEl = el('div', 'hud-count', root);
    this.meter = el('div', 'hud-meter', root);
    this.meterSweet = el('div', 'meter-sweet', this.meter);
    this.meterNeedle = el('div', 'meter-needle', this.meter);
    this.meterLabel = el('div', 'meter-label', this.meter, 'BALANCE');
    this.hint = el('div', 'hud-hint', root);
    this.speedo = el('canvas', 'hud-speedo', root);
    this.speedo.width = this.speedo.height = 440;
    this.mini = el('canvas', 'hud-minimap', root);
    this.mini.width = this.mini.height = 380;
    this.sctx = this.speedo.getContext('2d');
    this.mctx = this.mini.getContext('2d');
    this.shownPoints = profile.data.points;
    this.flashT = 0;
    this.qualityT = 0;
    this.zoneT = 0;
    this.camT = 0;
    this.cache = {};
    this.units = 'kmh';
    this.showMinimap = true;
  }

  set(key, elx, html) {
    if (this.cache[key] !== html) {
      this.cache[key] = html;
      elx.innerHTML = html;
    }
  }

  setPanel(p) {
    this.set('title', this.pTitle, p.title || '');
    this.set('timer', this.pTimer, p.timer || '');
    this.pTimer.classList.toggle('urgent', !!p.urgent);
    this.set('lines', this.pLines, (p.lines || []).map((l) => `<div>${l}</div>`).join(''));
  }

  popup(text, pts, cls = '') {
    const p = el('div', 'popup ' + cls, this.popups, `<span class="pp-name">${text}</span>${pts ? `<span class="pp-pts">+${formatPoints(pts)}</span>` : ''}`);
    setTimeout(() => p.remove(), 1900);
    while (this.popups.children.length > 5) this.popups.firstChild.remove();
  }

  flash(main, sub = '', cls = '', dur = 2.2) {
    this.flashMain.textContent = main;
    this.flashSub.textContent = sub;
    this.flashEl.className = 'hud-flash show ' + cls;
    this.flashT = dur;
  }

  landing(q) {
    const txt = { perfect: 'PERFECT LANDING', good: 'GOOD LANDING', sketchy: 'SKETCHY LANDING' }[q];
    if (!txt) return;
    this.quality.textContent = txt + (q === 'perfect' ? '  x1.5' : q === 'good' ? '  x1.15' : '  x0.7');
    this.quality.className = 'hud-quality show q-' + q;
    this.qualityT = 1.6;
  }

  zoneName(name) {
    this.zone.textContent = name;
    this.zone.className = 'hud-zone show';
    this.zoneT = 2.5;
  }

  camName(name) {
    this.cam.textContent = '🎥 ' + name;
    this.cam.className = 'hud-cam show';
    this.camT = 1.4;
  }

  setDistance(t) {
    if (t === null) this.distance.classList.remove('show');
    else {
      this.distance.classList.add('show');
      this.set('dist', this.distance, t);
    }
  }

  count(text) {
    this.countEl.textContent = text;
    this.countEl.className = 'hud-count';
    void this.countEl.offsetWidth;
    this.countEl.className = 'hud-count show' + (text === 'GO!' ? ' go' : '');
  }

  showHint(html, t = 9) {
    this.hint.innerHTML = html;
    this.hint.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hint.classList.remove('show'), t * 1000);
  }

  setCombo(st) {
    if (!st.entries.length) {
      this.combo.classList.remove('show');
      return;
    }
    this.combo.classList.add('show');
    const names = st.entries.slice(-5).map((e) => e.name + (e.repeat ? '<i>×' + Math.pow(0.7, e.repeat).toFixed(2) + '</i>' : ''));
    const more = st.entries.length > 5 ? `<span class="more">+${st.entries.length - 5} more</span> ` : '';
    this.set('combo', this.comboList, more + names.join(' <b>+</b> '));
    const streak = st.streak > 0 ? ` <span class="streak">STREAK x${st.streakMult.toFixed(1)}</span>` : '';
    this.set('ctot', this.comboTotal, `${formatPoints(st.sum)} <span class="mult">× ${st.mult}</span>${streak}`);
  }

  setLink(f) {
    this.comboLinkBar.style.transform = `scaleX(${clamp(f, 0, 1)})`;
  }

  setPending(names) {
    const html = names.length ? names.map((n) => `<span>${n}</span>`).join('') : '';
    this.set('pending', this.pending, html);
    this.pending.classList.toggle('show', !!html);
  }

  update(dt, s) {
    // points counter rolls up
    const target = this.profile.data.points;
    if (this.shownPoints !== target) {
      const diff = target - this.shownPoints;
      this.shownPoints += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 6)));
      if (Math.abs(target - this.shownPoints) < 2) this.shownPoints = target;
      this.ptsVal.textContent = formatPoints(this.shownPoints);
    } else if (this.cache.pts !== target) {
      this.cache.pts = target;
      this.ptsVal.textContent = formatPoints(target);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashEl.classList.remove('show');
    }
    if (this.qualityT > 0) {
      this.qualityT -= dt;
      if (this.qualityT <= 0) this.quality.classList.remove('show');
    }
    if (this.zoneT > 0) {
      this.zoneT -= dt;
      if (this.zoneT <= 0) this.zone.classList.remove('show');
    }
    if (this.camT > 0) {
      this.camT -= dt;
      if (this.camT <= 0) this.cam.classList.remove('show');
    }
    // wheelie / stoppie balance meter
    const P = s.physics;
    const wh = P.mode === 'ground' ? P.wheelie : 0;
    if (Math.abs(wh) > 0.12) {
      this.meter.classList.add('show');
      const stoppie = wh < 0;
      const v = stoppie ? -wh / 0.85 : wh / 1.25;
      this.meterNeedle.style.bottom = `${clamp(v, 0, 1) * 100}%`;
      this.meterSweet.style.bottom = stoppie ? '30%' : `${(0.55 / 1.25) * 100}%`;
      this.meterSweet.style.height = stoppie ? '40%' : `${(0.4 / 1.25) * 100}%`;
      this.meterLabel.textContent = stoppie ? 'STOPPIE' : 'WHEELIE';
      this.meter.classList.toggle('danger', v > 0.85);
    } else this.meter.classList.remove('show');
    this.drawSpeedo(s);
    this.mini.style.display = this.showMinimap ? '' : 'none';
    if (this.showMinimap) this.drawMinimap(s);
  }

  drawSpeedo(s) {
    const c = this.sctx;
    const P = s.physics;
    const spec = P.spec;
    const W = 440;
    c.clearRect(0, 0, W, W);
    const cx = W / 2;
    const cy = W / 2 + 10;
    const R = 175;
    const kmh = P.speed * 3.6;
    const mph = this.units === 'mph';
    const shown = mph ? kmh * 0.621 : kmh;
    const maxV = Math.ceil(((spec.topSpeed * 3.6 * 1.25) * (mph ? 0.621 : 1)) / 20) * 20;
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    // backdrop
    c.beginPath();
    c.arc(cx, cy, R + 22, 0, Math.PI * 2);
    c.fillStyle = 'rgba(10,11,14,0.72)';
    c.fill();
    // track
    c.lineWidth = 16;
    c.lineCap = 'butt';
    c.beginPath();
    c.arc(cx, cy, R, a0, a1);
    c.strokeStyle = 'rgba(255,255,255,0.1)';
    c.stroke();
    const f = clamp(shown / maxV, 0, 1);
    const grad = c.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0, '#ffb000');
    grad.addColorStop(0.6, '#ff6a00');
    grad.addColorStop(1, '#ff2a2a');
    c.beginPath();
    c.arc(cx, cy, R, a0, a0 + (a1 - a0) * f);
    c.strokeStyle = grad;
    c.stroke();
    // ticks
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.font = 'bold 20px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const step = maxV > 260 ? 40 : 20;
    for (let v = 0; v <= maxV; v += step) {
      const a = a0 + (a1 - a0) * (v / maxV);
      c.save();
      c.translate(cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26));
      c.fillText(String(v), 0, 0);
      c.restore();
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R + 9), cy + Math.sin(a) * (R + 9));
      c.lineTo(cx + Math.cos(a) * (R - 9), cy + Math.sin(a) * (R - 9));
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.stroke();
    }
    // rpm ring
    const rf = clamp((P.rpm - spec.idle * 0.5) / (spec.redline - spec.idle * 0.5), 0, 1.05);
    c.lineWidth = 8;
    c.beginPath();
    c.arc(cx, cy, R - 52, a0, a0 + (a1 - a0) * Math.min(1, rf));
    c.strokeStyle = rf > 0.9 ? '#ff2a2a' : 'rgba(255,255,255,0.55)';
    c.stroke();
    // digital speed
    c.fillStyle = '#ffffff';
    c.font = 'italic 900 92px Impact, "Arial Black", sans-serif';
    c.fillText(String(Math.round(shown)), cx, cy - 8);
    c.font = 'bold 22px Arial';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText(mph ? 'MPH' : 'KM/H', cx, cy + 46);
    // gear
    c.font = 'italic 900 44px Impact, "Arial Black", sans-serif';
    c.fillStyle = '#ff6a00';
    const gear = P.mode === 'ground' && P.s < -0.3 ? 'R' : P.speed < 0.5 && P.throttleIn === 0 ? 'N' : String(P.gear + 1);
    c.fillText(gear, cx, cy + 92);
    c.font = 'bold 14px Arial';
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillText('GEAR', cx, cy + 122);
    // boost bar
    const bw = 200;
    const bx = cx - bw / 2;
    const by = cy + 146;
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(bx, by, bw, 16);
    const bg = c.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, '#00c6ff');
    bg.addColorStop(1, '#7a5cff');
    c.fillStyle = bg;
    c.fillRect(bx, by, bw * clamp(P.boost, 0, 1), 16);
    c.font = 'bold 12px Arial';
    c.fillStyle = P.boosting ? '#ffffff' : 'rgba(255,255,255,0.85)';
    c.fillText('BOOST', cx, by + 8.5);
  }

  drawMinimap(s) {
    const c = this.mctx;
    const S = 380;
    const map = this.world.minimapCanvas;
    if (!map) return;
    const P = s.physics;
    const pos = P.mode === 'crash' ? P.cb.pos : P.root;
    const heading = s.camYaw;
    const scale = this.world.minimapScale; // map px per metre
    const viewR = 150 + Math.min(P.speed * 2.5, 150); // metres shown to the edge
    const k = S / 2 / viewR; // screen px per metre
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#20262b';
    c.fillRect(0, 0, S, S);
    c.translate(S / 2, S / 2);
    c.rotate(Math.PI + heading);
    const half = map.width / 2;
    const mx = (pos.x * scale + half);
    const mz = (pos.z * scale + half);
    c.scale(k / scale, k / scale);
    c.drawImage(map, -mx, -mz);
    c.setTransform(1, 0, 0, 1, 0, 0);
    // markers in world coordinates -> screen
    const toScreen = (x, z) => {
      const dx = (x - pos.x) * k;
      const dz = (z - pos.z) * k;
      const a = Math.PI + heading;
      return [S / 2 + dx * Math.cos(a) - dz * Math.sin(a), S / 2 + dx * Math.sin(a) + dz * Math.cos(a)];
    };
    if (s.stars) {
      c.fillStyle = '#ffd34d';
      for (const st of s.stars) {
        if (st.taken) continue;
        const [x, y] = toScreen(st.p.x, st.p.z);
        if (x < -10 || y < -10 || x > S + 10 || y > S + 10) continue;
        star(c, x, y, 8);
      }
    }
    if (s.target) {
      const [x, y] = toScreen(s.target.x, s.target.z);
      const dx = x - S / 2;
      const dy = y - S / 2;
      const d = Math.hypot(dx, dy);
      const r = Math.min(d, S / 2 - 18);
      const tx = S / 2 + (dx / (d || 1)) * r;
      const ty = S / 2 + (dy / (d || 1)) * r;
      c.strokeStyle = 'rgba(255,106,0,0.7)';
      c.lineWidth = 4;
      c.setLineDash([10, 8]);
      c.beginPath();
      c.moveTo(S / 2, S / 2);
      c.lineTo(tx, ty);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#ff6a00';
      c.beginPath();
      c.arc(tx, ty, 11, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // player arrow (always up)
    c.save();
    c.translate(S / 2, S / 2);
    const rel = (P.mode === 'ground' ? P.heading : heading) - heading;
    c.rotate(-rel);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#ff6a00';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(0, -18);
    c.lineTo(12, 14);
    c.lineTo(0, 7);
    c.lineTo(-12, 14);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    // north marker
    const na = Math.PI + heading;
    const nx = S / 2 + Math.sin(-na) * 0 + (S / 2 - 22) * Math.sin(na);
    const ny = S / 2 - (S / 2 - 22) * Math.cos(na);
    c.fillStyle = '#ff6a00';
    c.font = 'bold 24px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', nx, ny);
    // ring
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.stroke();

  }
}

function star(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

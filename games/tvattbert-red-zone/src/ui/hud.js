// HTML overlay HUD: bars, compass, clock, messages, prompts, minimap and the big map.
import { CLASS } from '../world/worldData.js';
import { ZONES, DISTRICTS, HOSPITAL } from '../world/locations.js';
import { wrapAngle, fmtTime, clamp } from '../core/util.js';
import { ITEMS } from '../game/items.js';
import { WEAPONS } from '../player/weapons.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor(world) {
    this.world = world;
    this.el = $('hud');
    this.msgs = $('messages');
    this.mini = $('minimap').getContext('2d');
    this.big = $('bigmap');
    this.mapCanvas = this.renderMap();
    this.markers = []; // extra compass/map markers {x,z,label,color,icon}
    this.locTimer = 0; this.lastLoc = '';
    this.buildCompass();
    this.frame = 0;
    this.hitTimer = 0;
    this.dmgEls = [];
  }
  show(v) { this.el.classList.toggle('hidden', !v); }

  renderMap() {
    const W = this.world, N = W.NC;
    const c = document.createElement('canvas'); c.width = N; c.height = N;
    const x = c.getContext('2d'); const img = x.createImageData(N, N);
    const col = { [CLASS.URBAN]: [58, 58, 56], [CLASS.LAWN]: [74, 82, 48], [CLASS.PARK]: [44, 62, 36], [CLASS.WATER]: [24, 40, 56], [CLASS.BUILDING]: [150, 146, 136] };
    const H = W.height, NV = W.NV;
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
      const cl = W.cls[k * N + i]; const cc = col[cl] || col[0];
      const dh = (H[k * NV + i + 1] - H[k * NV + i]) - (H[(k + 1) * NV + i] - H[k * NV + i]);
      const sh = cl === CLASS.WATER ? 1 : clamp(1 + dh * 0.25, 0.7, 1.3);
      const o = (k * N + i) * 4;
      img.data[o] = cc[0] * sh; img.data[o + 1] = cc[1] * sh; img.data[o + 2] = cc[2] * sh; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  buildCompass() {
    const strip = $('compass-strip'); strip.innerHTML = '';
    this.compassItems = [];
    const cards = [['N', 0], ['NO', 45], ['O', 90], ['SO', 135], ['S', 180], ['SV', 225], ['V', 270], ['NV', 315]];
    for (const [t, a] of cards) {
      const s = document.createElement('span'); s.textContent = t; s.className = t.length === 1 ? 'card' : '';
      strip.appendChild(s); this.compassItems.push({ el: s, bearing: a * Math.PI / 180 });
    }
    for (let a = 15; a < 360; a += 15) {
      if (a % 45 === 0) continue;
      const s = document.createElement('span'); s.textContent = '·'; strip.appendChild(s);
      this.compassItems.push({ el: s, bearing: a * Math.PI / 180 });
    }
    this.markerEls = [];
  }
  setMarkers(list) {
    for (const m of this.markerEls) m.el.remove();
    this.markerEls = list.map(m => {
      const s = document.createElement('span'); s.className = 'mk'; s.textContent = m.icon; s.style.color = m.color;
      s.title = m.label; $('compass-strip').appendChild(s); return { ...m, el: s };
    });
  }
  updateCompass(px, pz, yaw) {
    const heading = -yaw;
    const place = (el, bearing, extra = '') => {
      const rel = wrapAngle(bearing - heading);
      if (Math.abs(rel) > 1.1) { el.style.display = 'none'; return; }
      el.style.display = ''; el.style.left = `${210 + rel / 1.1 * 210}px`;
      if (extra) el.dataset.d = extra;
    };
    for (const it of this.compassItems) place(it.el, it.bearing);
    for (const m of this.markerEls) {
      const b = Math.atan2(m.x - px, -(m.z - pz));
      place(m.el, b);
      const d = Math.hypot(m.x - px, m.z - pz);
      m.el.textContent = `${m.icon}${m.showDist ? ' ' + Math.round(d) + 'm' : ''}`;
    }
  }

  message(text, cls = '') {
    const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls;
    this.msgs.appendChild(d);
    while (this.msgs.children.length > 5) this.msgs.firstChild.remove();
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 1000); }, cls === 'radio' ? 12000 : 6500);
  }
  showLocation(name, sub = '') {
    if (name === this.lastLoc) return;
    this.lastLoc = name;
    const el = $('location'); el.innerHTML = `${name}${sub ? `<small>${sub}</small>` : ''}`;
    el.classList.add('show'); clearTimeout(this.locT);
    this.locT = setTimeout(() => el.classList.remove('show'), 3500);
  }
  prompt(text) {
    const p = $('prompt');
    if (!text) { p.style.display = 'none'; return; }
    p.style.display = 'block'; p.innerHTML = text;
  }
  progress(frac, label) {
    const p = $('progress');
    if (frac === null) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden'); $('progress-bar').style.width = `${frac * 100}%`; $('progress-label').textContent = label;
  }
  hitmarker(kill) {
    const h = $('hitmarker'); h.classList.toggle('kill', !!kill); h.style.opacity = 1; this.hitTimer = 0.15;
  }
  damageFrom(angle) {
    const d = document.createElement('div');
    d.style.transform = `rotate(${angle}rad)`; $('damage-dir').appendChild(d);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 800); }, 300);
  }
  crosshair(spread, hide) {
    const ch = $('crosshair'); ch.classList.toggle('hide', !!hide);
    const s = 6 + spread;
    const [a, b, c, d] = ch.children;
    a.style.top = `${-s - 8}px`; b.style.top = `${s}px`; c.style.left = `${-s - 8}px`; d.style.left = `${s}px`;
  }

  update(dt, g) {
    const p = g.player;
    $('bar-health').style.width = `${p.health}%`;
    $('bar-stamina').style.width = `${p.stamina}%`;
    $('bar-hunger').style.width = `${p.hunger}%`;
    $('bar-thirst').style.width = `${p.thirst}%`;
    const icons = [];
    if (p.bleeding > 0) icons.push('🩸 Blöder');
    if (p.hunger < 20) icons.push('Hungrig');
    if (p.thirst < 20) icons.push('Törstig');
    if (p.weight > g.inventory?.maxWeight) icons.push('Överlastad');
    if (g.infection?.active) icons.push('☣ Infekterad');
    const iconHtml = icons.map(i => `<span>${i}</span>`).join('');
    if (iconHtml !== this._icons) { $('status-icons').innerHTML = iconHtml; this._icons = iconHtml; }
    $('clock').textContent = `DAG ${g.time.day} · ${g.time.clock} · ${g.env.target.name}`;
    const w = g.weapons;
    if (w) {
      const d = w.def;
      const key = `${w.current}|${w.mag}|${w.reserve()}|${w.reloading > 0}|${Object.keys(w.owned).join()}|${w.flashlightOn}|${Math.round(w.battery)}`;
      if (key !== this._wkey) {
        this._wkey = key;
        $('weapon-name').textContent = d.name + (w.reloading > 0 ? ' · LADDAR OM…' : '');
        $('ammo-mag').textContent = d.melee ? '—' : w.mag;
        $('ammo-res').textContent = d.melee ? '' : `/ ${w.reserve()}`;
        $('ammo-type').textContent = (d.melee ? 'Närstrid – tyst' : ITEMS[d.ammo].name) + ` · Ficklampa ${w.flashlightOn ? 'PÅ' : 'av'} ${Math.round(w.battery)} %`;
        $('slots').innerHTML = Object.entries(WEAPONS).filter(([k]) => w.owned[k]).map(([k, v]) => `<span class="${k === w.current ? 'on' : ''}">${v.slot} ${v.name.split(' ')[0]}</span>`).join('');
      }
    }
    this.updateCompass(p.pos.x, p.pos.z, p.yaw);
    this.hitTimer -= dt; if (this.hitTimer <= 0) $('hitmarker').style.opacity = 0;
    if (++this.frame % 3 === 0) this.drawMinimap(g);
  }

  drawMinimap(g) {
    const ctx = this.mini, p = g.player, W = this.world;
    const S = 200, scale = 1.2; // px per metre
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(p.yaw); // map rotates so that view direction is up
    const mpx = (p.pos.x + W.half) / W.G, mpz = (p.pos.z + W.half) / W.G;
    const k = scale * W.G;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapCanvas, mpx - S / k, mpz - S / k, (2 * S) / k, (2 * S) / k, -S, -S, 2 * S, 2 * S);
    // markers
    const dot = (x, z, color, r = 4) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc((x - p.pos.x) * scale, (z - p.pos.z) * scale, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const zn of ZONES) {
      if (zn.type === 'landmark') continue;
      ctx.strokeStyle = zn.type === 'safe' ? 'rgba(90,200,90,.8)' : 'rgba(220,40,40,.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc((zn.x - p.pos.x) * scale, (zn.z - p.pos.z) * scale, zn.r * scale, 0, Math.PI * 2); ctx.stroke();
    }
    if (g.zombies) for (const z of g.zombies.visibleOnRadar()) dot(z.x, z.z, 'rgba(230,40,30,.9)', 2.5);
    if (g.npcs) for (const n of g.npcs.list) if (n.alive) dot(n.x, n.z, '#5ad15a', 3);
    for (const m of this.markers) dot(m.x, m.z, m.color, 4);
    ctx.restore();
    // player arrow
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(S / 2, S / 2 - 8); ctx.lineTo(S / 2 - 5, S / 2 + 6); ctx.lineTo(S / 2 + 5, S / 2 + 6); ctx.fill();
    ctx.fillStyle = '#ddd'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    // north indicator
    ctx.fillText('N', S / 2 + Math.sin(p.yaw) * 86, S / 2 - Math.cos(p.yaw) * 86 + 4);
  }

  drawBigMap(g) {
    const c = this.big, ctx = c.getContext('2d'), W = this.world, p = g.player;
    const S = c.width, k = S / W.size;
    ctx.drawImage(this.mapCanvas, 0, 0, S, S);
    const toPx = (x, z) => [(x + W.half) * k, (z + W.half) * k];
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      const [x, y] = toPx(d.x, d.z);
      ctx.fillStyle = d.water ? 'rgba(120,170,220,.8)' : 'rgba(235,230,220,.75)';
      ctx.fillText(d.name.toUpperCase(), x, y);
    }
    for (const zn of ZONES) {
      if (zn.type === 'landmark') continue;
      const [x, y] = toPx(zn.x, zn.z);
      ctx.strokeStyle = zn.type === 'safe' ? '#5c5' : '#e33'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, Math.max(6, zn.r * k), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = zn.type === 'safe' ? '#8f8' : '#f77'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText(zn.name, x, y - zn.r * k - 6);
    }
    const [hx, hy] = toPx(HOSPITAL.x, HOSPITAL.z);
    ctx.fillStyle = '#e22'; ctx.fillRect(hx - 2, hy - 7, 4, 14); ctx.fillRect(hx - 7, hy - 2, 14, 4);
    for (const m of this.markers) { const [x, y] = toPx(m.x, m.z); ctx.fillStyle = m.color; ctx.fillRect(x - 3, y - 3, 6, 6); }
    // player
    const [px, py] = toPx(p.pos.x, p.pos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-p.yaw);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-6, 7); ctx.lineTo(6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    $('map-legend').textContent = 'Grön ring = säker zon · Röd ring = farligt område · Rött kors = Sahlgrenska (motgift) · Ljusgrå = byggnader från STL-modellen';
  }

  infection(inf, g) {
    const box = $('infection');
    if (!inf.active) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const ms = inf.remainingMs();
    const t = $('inf-timer'); t.textContent = fmtTime(ms); t.classList.toggle('critical', ms < 60000);
    const d = Math.round(Math.hypot(HOSPITAL.x - g.player.pos.x, HOSPITAL.z - g.player.pos.z));
    const avail = g.antidoteAvailable();
    const has = g.inventory && g.inventory.count('antidote') > 0;
    $('inf-hint').innerHTML = has
      ? 'Du har motgift i inventariet – använd det NU! [TAB]'
      : avail
        ? `Motgiftet finns på <b>${HOSPITAL.name}</b> (laboratoriet) – ${d} m bort. Följ ✚ på kompassen.`
        : `Inget känt botemedel ännu. Forskare på ${HOSPITAL.name} arbetar på ett motgift (${d} m bort) – väntas klart efter dag 2.`;
  }
}

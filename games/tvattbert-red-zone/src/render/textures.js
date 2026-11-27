// Procedurally generated textures (no external image assets).
import * as THREE from 'three';
import { seeded } from '../core/util.js';

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// tileable value noise, returns Float32Array in [0,1]
function tileNoise(size, cells, octaves, rng) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const lat = new Float32Array(n * n).map(() => rng());
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = lat[(y0 % n) * n + (x0 % n)], b = lat[(y0 % n) * n + ((x0 + 1) % n)];
        const c = lat[((y0 + 1) % n) * n + (x0 % n)], d = lat[((y0 + 1) % n) * n + ((x0 + 1) % n)];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function paintNoise(ctx, size, stops, cells, oct, rng, contrast = 1) {
  const n = tileNoise(size, cells, oct, rng);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < n.length; i++) {
    let v = (n[i] - 0.5) * contrast + 0.5; v = v < 0 ? 0 : v > 1 ? 1 : v;
    // piecewise gradient
    let k = 0; while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [p0, c0] = stops[k], [p1, c1] = stops[k + 1];
    const t = Math.min(1, Math.max(0, (v - p0) / (p1 - p0 || 1)));
    img.data[i * 4] = c0[0] + (c1[0] - c0[0]) * t;
    img.data[i * 4 + 1] = c0[1] + (c1[1] - c0[1]) * t;
    img.data[i * 4 + 2] = c0[2] + (c1[2] - c0[2]) * t;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
function toTex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(ctx, size, n, colors, rmin, rmax, rng, alpha = 1) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.3 + rng() * 0.7);
    ctx.fillStyle = colors[(rng() * colors.length) | 0];
    const x = rng() * size, y = rng() * size, r = rmin + rng() * (rmax - rmin);
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function cracks(ctx, size, n, color, width, rng) {
  ctx.strokeStyle = color; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = rng() * size, y = rng() * size, a = rng() * Math.PI * 2;
    ctx.lineWidth = width * (0.5 + rng());
    ctx.beginPath(); ctx.moveTo(x, y);
    const segs = 4 + (rng() * 10) | 0;
    for (let s = 0; s < segs; s++) {
      a += (rng() - 0.5) * 1.4; const l = 6 + rng() * 18;
      x += Math.cos(a) * l; y += Math.sin(a) * l; ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export function makeTextures() {
  const rng = seeded(4242);
  const T = {};
  // ---- asphalt
  {
    const c = canvas(512), x = c.getContext('2d');
    paintNoise(x, 512, [[0, [62, 62, 64]], [0.5, [92, 90, 88]], [1, [124, 120, 114]]], 8, 5, rng, 1.6);
    speckle(x, 512, 2500, ['#222', '#777', '#555'], 0.4, 1.3, rng, 0.6);
    x.globalAlpha = 0.25; speckle(x, 512, 30, ['#2a2a2a', '#4a4844'], 10, 40, rng, 0.35);
    cracks(x, 512, 26, 'rgba(15,15,15,0.8)', 1.2, rng);
    speckle(x, 512, 60, ['#4b3a22', '#3a3a1e', '#5a4528'], 2, 5, rng, 0.5); // leaves / dirt
    T.asphalt = toTex(c);
  }
  // ---- grass
  {
    const c = canvas(512), x = c.getContext('2d');
    paintNoise(x, 512, [[0, [44, 58, 26]], [0.5, [74, 88, 40]], [0.8, [98, 98, 52]], [1, [110, 96, 60]]], 6, 5, rng, 1.5);
    x.lineWidth = 1;
    for (let i = 0; i < 9000; i++) {
      const px = rng() * 512, py = rng() * 512, l = 2 + rng() * 5;
      x.strokeStyle = rng() < 0.5 ? 'rgba(30,48,18,0.5)' : 'rgba(120,130,70,0.35)';
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rng() - 0.5) * 2, py - l); x.stroke();
    }
    T.grass = toTex(c);
  }
  // ---- forest floor (moss, needles, leaves)
  {
    const c = canvas(512), x = c.getContext('2d');
    paintNoise(x, 512, [[0, [28, 34, 18]], [0.45, [48, 56, 28]], [0.7, [70, 60, 36]], [1, [86, 74, 50]]], 7, 5, rng, 1.6);
    speckle(x, 512, 1600, ['#6b4f2a', '#3d2f1a', '#7c6a3a', '#2c3a1a'], 0.8, 2.6, rng, 0.7);
    speckle(x, 512, 40, ['#6e6a66', '#5a5652', '#807a72'], 6, 18, rng, 0.8);
    T.forest = toTex(c);
  }
  // ---- granite (Göteborgs berghällar)
  {
    const c = canvas(512), x = c.getContext('2d');
    paintNoise(x, 512, [[0, [92, 84, 82]], [0.5, [128, 118, 114]], [1, [160, 150, 144]]], 5, 6, rng, 1.4);
    speckle(x, 512, 5000, ['#3a3432', '#d8ccc4', '#a78e86', '#5a4e4a'], 0.4, 1.4, rng, 0.7);
    cracks(x, 512, 18, 'rgba(40,34,32,0.7)', 1.5, rng);
    speckle(x, 512, 30, ['#3c4a2a', '#56602e'], 4, 14, rng, 0.5); // lichen
    T.rock = toTex(c);
  }
  // ---- roof
  {
    const c = canvas(256), x = c.getContext('2d');
    paintNoise(x, 256, [[0, [40, 40, 42]], [1, [80, 78, 76]]], 8, 4, rng, 1.4);
    x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
    for (let i = 0; i < 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); }
    speckle(x, 256, 40, ['#2b3a22', '#555'], 2, 8, rng, 0.4);
    T.roof = toTex(c);
  }
  // ---- facade atlas: 4 styles (columns) x [upper floor (top), ground floor (bottom)]
  {
    const S = 256, c = canvas(S * 4, S * 2), x = c.getContext('2d');
    const e = canvas(S * 4, S * 2), ex = e.getContext('2d');
    ex.fillStyle = '#000'; ex.fillRect(0, 0, S * 4, S * 2);
    const styles = [
      { wall: [[0, [196, 170, 120]], [1, [226, 204, 160]]], frame: '#e8e2d4', glass: '#20262a', win: [0.28, 0.2, 0.44, 0.58] }, // ochre plaster
      { wall: [[0, [120, 58, 44]], [1, [160, 82, 62]]], frame: '#d9d2c4', glass: '#1c2226', win: [0.3, 0.22, 0.4, 0.55], brick: true }, // red brick
      { wall: [[0, [150, 150, 148]], [1, [186, 184, 180]]], frame: '#3a3c3e', glass: '#283038', win: [0.12, 0.25, 0.76, 0.5] }, // concrete modern
      { wall: [[0, [170, 176, 150]], [1, [204, 208, 184]]], frame: '#f0ece0', glass: '#1e2428', win: [0.3, 0.22, 0.4, 0.5], planks: true }, // landshövdingehus wood
    ];
    styles.forEach((st, i) => {
      const ox = i * S;
      // upper floor
      const tile = canvas(S), tx = tile.getContext('2d');
      paintNoise(tx, S, st.wall, 4, 4, rng, 1.2);
      if (st.brick) {
        tx.strokeStyle = 'rgba(70,40,30,0.55)'; tx.lineWidth = 2;
        for (let y = 0; y < S; y += 12) {
          tx.beginPath(); tx.moveTo(0, y); tx.lineTo(S, y); tx.stroke();
          for (let bx = ((y / 12) % 2) * 14; bx < S; bx += 28) { tx.beginPath(); tx.moveTo(bx, y); tx.lineTo(bx, y + 12); tx.stroke(); }
        }
      }
      if (st.planks) {
        tx.strokeStyle = 'rgba(80,80,60,0.45)'; tx.lineWidth = 2;
        for (let px = 0; px < S; px += 14) { tx.beginPath(); tx.moveTo(px, 0); tx.lineTo(px, S); tx.stroke(); }
      }
      // grime streaks
      for (let k = 0; k < 14; k++) {
        const gx = rng() * S; const g = tx.createLinearGradient(0, 0, 0, S);
        g.addColorStop(0, 'rgba(20,20,15,0)'); g.addColorStop(1, 'rgba(20,20,15,0.25)');
        tx.fillStyle = g; tx.fillRect(gx, rng() * S * 0.5, 2 + rng() * 6, S);
      }
      x.drawImage(tile, ox, 0);
      const [wx, wy, ww, wh] = st.win.map(v => v * S);
      x.fillStyle = st.frame; x.fillRect(ox + wx - 5, wy - 5, ww + 10, wh + 10);
      x.fillStyle = st.glass; x.fillRect(ox + wx, wy, ww, wh);
      // reflections + cross bars
      const g = x.createLinearGradient(ox + wx, wy, ox + wx + ww, wy + wh);
      g.addColorStop(0, 'rgba(160,180,200,0.25)'); g.addColorStop(0.5, 'rgba(255,255,255,0.02)'); g.addColorStop(1, 'rgba(120,140,160,0.15)');
      x.fillStyle = g; x.fillRect(ox + wx, wy, ww, wh);
      x.fillStyle = st.frame; x.fillRect(ox + wx + ww / 2 - 2, wy, 4, wh); x.fillRect(ox + wx, wy + wh * 0.35, ww, 3);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(ox + wx - 6, wy + wh + 5, ww + 12, 6); // sill shadow
      ex.fillStyle = '#fff'; ex.fillRect(ox + wx, wy, ww, wh);
      // ground floor: shop window / door, boarded, graffiti
      const gy = S;
      paintNoise(tile.getContext('2d'), S, [[0, [70, 66, 62]], [1, [120, 114, 106]]], 4, 4, rng, 1.2);
      x.drawImage(tile, ox, gy);
      x.fillStyle = '#15191b'; x.fillRect(ox + 18, gy + 40, S - 36, S - 70);
      x.fillStyle = 'rgba(200,210,220,0.12)'; x.fillRect(ox + 18, gy + 40, (S - 36) / 2, S - 70);
      // boards
      x.fillStyle = '#6b5236';
      for (let b = 0; b < 4; b++) {
        x.save(); x.translate(ox + S / 2, gy + 70 + b * 40); x.rotate((rng() - 0.5) * 0.25);
        x.fillRect(-S / 2 + 10, -9, S - 20, 18); x.restore();
      }
      x.fillStyle = 'rgba(0,0,0,0.4)'; for (let b = 0; b < 30; b++) x.fillRect(ox + 20 + rng() * (S - 40), gy + 50 + rng() * 150, 2, 2);
      // graffiti
      x.font = `bold ${30 + rng() * 14}px sans-serif`;
      x.fillStyle = ['rgba(200,20,30,0.85)', 'rgba(30,30,30,0.8)', 'rgba(230,230,230,0.7)', 'rgba(40,160,60,0.7)'][i];
      x.save(); x.translate(ox + 30, gy + 150); x.rotate(-0.1);
      x.fillText(['RED ZONE', 'SPRING', 'HJÄLP!', 'ZOMBIES'][i], 0, 0); x.restore();
    });
    T.facade = toTex(c, false);
    T.facadeEmissive = toTex(e, false);
  }
  // ---- concrete
  {
    const c = canvas(256), x = c.getContext('2d');
    paintNoise(x, 256, [[0, [110, 108, 104]], [1, [170, 166, 158]]], 6, 5, rng, 1.3);
    speckle(x, 256, 400, ['#555', '#888'], 0.5, 1.5, rng, 0.5);
    cracks(x, 256, 6, 'rgba(40,40,40,0.6)', 1, rng);
    T.concrete = toTex(c);
  }
  // ---- wood planks
  {
    const c = canvas(256), x = c.getContext('2d');
    paintNoise(x, 256, [[0, [80, 56, 34]], [1, [130, 96, 62]]], 3, 4, rng, 1.2);
    x.strokeStyle = 'rgba(30,20,10,0.6)'; x.lineWidth = 2;
    for (let y = 0; y < 256; y += 32) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); }
    T.wood = toTex(c);
  }
  // ---- painted metal (vehicles), neutral so it can be tinted
  {
    const c = canvas(128), x = c.getContext('2d');
    paintNoise(x, 128, [[0, [190, 190, 190]], [1, [235, 235, 235]]], 4, 3, rng, 0.8);
    speckle(x, 128, 60, ['#5a3a20', '#3a2a1a', '#777'], 0.5, 2.5, rng, 0.6); // rust / dirt
    T.metal = toTex(c);
  }
  // ---- hospital: floor tiles, walls, ceiling
  {
    const c = canvas(256), x = c.getContext('2d');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = 190 + ((i + j) % 2) * 22 + rng() * 10;
      x.fillStyle = `rgb(${v},${v + 2},${v - 4})`; x.fillRect(i * 64, j * 64, 64, 64);
    }
    x.strokeStyle = 'rgba(80,80,80,0.5)'; x.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
    speckle(x, 256, 80, ['rgba(70,60,40,0.6)', 'rgba(40,40,40,0.5)'], 1, 6, rng, 0.5);
    T.tiles = toTex(c);
    const w = canvas(256), wx2 = w.getContext('2d');
    paintNoise(wx2, 256, [[0, [170, 186, 172]], [1, [206, 216, 204]]], 4, 4, rng, 0.9);
    wx2.fillStyle = 'rgba(60,90,80,0.9)'; wx2.fillRect(0, 196, 256, 6); // stripe
    wx2.fillStyle = 'rgba(40,40,35,0.25)'; wx2.fillRect(0, 220, 256, 36);
    for (let k = 0; k < 10; k++) { wx2.fillStyle = `rgba(30,25,20,${0.08 + rng() * 0.12})`; wx2.fillRect(rng() * 256, rng() * 120, 3 + rng() * 10, 60 + rng() * 140); }
    T.hospWall = toTex(w);
    const ce = canvas(128), cx2 = ce.getContext('2d');
    cx2.fillStyle = '#c8c8c0'; cx2.fillRect(0, 0, 128, 128);
    cx2.strokeStyle = '#8a8a84'; cx2.lineWidth = 2; cx2.strokeRect(1, 1, 126, 126);
    speckle(cx2, 128, 200, ['#aaa', '#999'], 0.5, 1, rng, 0.6);
    T.ceiling = toTex(ce);
  }
  // ---- sprites
  T.blood = spriteTex(64, (x, s) => {
    for (let i = 0; i < 14; i++) {
      x.fillStyle = `rgba(${90 + rng() * 60},0,0,${0.5 + rng() * 0.5})`;
      x.beginPath(); x.arc(s / 2 + (rng() - 0.5) * s * 0.6, s / 2 + (rng() - 0.5) * s * 0.6, 3 + rng() * 10, 0, 7); x.fill();
    }
  });
  T.flash = spriteTex(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,200,80,0.9)'); g.addColorStop(1, 'rgba(255,120,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(255,220,140,0.9)'; x.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + rng(); x.beginPath(); x.moveTo(s / 2, s / 2); x.lineTo(s / 2 + Math.cos(a) * s / 2, s / 2 + Math.sin(a) * s / 2); x.stroke(); }
  });
  T.smoke = spriteTex(64, (x, s) => {
    for (let i = 0; i < 10; i++) {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 12 + rng() * 14);
      g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.save(); x.translate(s / 2 + (rng() - 0.5) * 24, s / 2 + (rng() - 0.5) * 24); x.fillStyle = g; x.fillRect(-32, -32, 64, 64); x.restore();
    }
  });
  T.hole = spriteTex(32, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.3, 'rgba(20,20,20,0.9)'); g.addColorStop(0.6, 'rgba(60,60,60,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  T.fire = spriteTex(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s * 0.65, 0, s / 2, s * 0.6, s / 2);
    g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(0.3, 'rgba(255,150,40,0.85)'); g.addColorStop(0.7, 'rgba(200,40,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  T.glow = spriteTex(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  return T;
}

function spriteTex(s, draw) {
  const c = canvas(s), x = c.getContext('2d');
  draw(x, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Text label texture (signs)
export function textTexture(text, { w = 512, h = 128, bg = '#1b3a6b', fg = '#fff', font = 'bold 64px sans-serif' } = {}) {
  const c = canvas(w, h), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Procedural canvas textures (no external image files needed).
import * as THREE from 'three';
import { Rng } from '../core/math.js';

let ANISO = 4;
export function setAnisotropy(n) {
  ANISO = n;
}

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTex(c, { repeat = true, color = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function memo(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

function speckle(ctx, w, h, n, colors, rng, sizeMin = 1, sizeMax = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rng.next() * colors.length)];
    const s = sizeMin + rng.next() * (sizeMax - sizeMin);
    ctx.fillRect(rng.next() * w, rng.next() * h, s, s);
  }
}

// Soft detail texture multiplied with terrain vertex colours.
export function terrainDetail() {
  return memo('terrainDetail', () => {
    const S = 256;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const rng = new Rng(11);
    // tileable value noise from a small random grid
    const G = 16;
    const grid = [];
    for (let i = 0; i < G * G; i++) grid.push(rng.next());
    const at = (x, y) => grid[((y + G) % G) * G + ((x + G) % G)];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const fx = (x / S) * G;
        const fy = (y / S) * G;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx;
        const b = at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx;
        const n = a * (1 - sy) + b * sy;
        const v = 214 + n * 26 + (rng.next() - 0.5) * 22;
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v));
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTex(c);
  });
}

function asphaltBase(ctx, w, h, seed, base = '#3a3b3e') {
  const rng = new Rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, w * h * 0.06, ['#2e2f31', '#46474a', '#505154', '#333436', '#3f4043'], rng, 1, 2.2);
  // patches & cracks
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rng.chance(0.5) ? '#2a2b2d' : '#4a4b4e';
    ctx.beginPath();
    ctx.ellipse(rng.next() * w, rng.next() * h, 10 + rng.next() * 30, 8 + rng.next() * 40, rng.next() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Road ribbon textures. u runs across the road, v along it.
export function roadTexture(type) {
  return memo('road_' + type, () => {
    const W = 256;
    const H = 512;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    if (type === 'dirt') {
      const rng = new Rng(5);
      ctx.fillStyle = '#8a6a48';
      ctx.fillRect(0, 0, W, H);
      speckle(ctx, W, H, 9000, ['#7a5c3d', '#977552', '#6f5236', '#a3825d', '#836343'], rng, 1, 3);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#5e452d';
      for (const x of [0.3, 0.7]) ctx.fillRect(W * x - 10, 0, 20, H);
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(90,110,60,0.55)');
      g.addColorStop(0.12, 'rgba(90,110,60,0)');
      g.addColorStop(0.88, 'rgba(90,110,60,0)');
      g.addColorStop(1, 'rgba(90,110,60,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      return toTex(c);
    }
    if (type === 'runway') {
      const rng = new Rng(8);
      ctx.fillStyle = '#6d6e6c';
      ctx.fillRect(0, 0, W, H);
      speckle(ctx, W, H, 12000, ['#636462', '#777876', '#5d5e5c', '#7d7e7b'], rng, 1, 2);
      ctx.strokeStyle = 'rgba(40,40,40,0.35)';
      ctx.lineWidth = 2;
      for (let y = 0; y <= H; y += 128) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#f2f2ee';
      ctx.fillRect(W / 2 - 4, 40, 8, 180);
      ctx.fillRect(W / 2 - 4, 296, 8, 180);
      ctx.fillRect(8, 0, 5, H);
      ctx.fillRect(W - 13, 0, 5, H);
      return toTex(c);
    }
    asphaltBase(ctx, W, H, type === 'highway' ? 3 : type === 'city' ? 4 : 6);
    const line = (x, y0, y1, w, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(x - w / 2, y0, w, y1 - y0);
    };
    const white = '#e9e9e2';
    const yellow = '#f0c419';
    if (type === 'highway') {
      line(10, 0, H, 5, white);
      line(W - 10, 0, H, 5, white);
      line(W / 2 - 4, 0, H, 3, yellow);
      line(W / 2 + 4, 0, H, 3, yellow);
      for (const x of [W * 0.27, W * 0.73]) for (let y = 0; y < H; y += 128) line(x, y, y + 60, 4, white);
    } else if (type === 'city') {
      line(14, 0, H, 3, '#bdbdb5');
      line(W - 14, 0, H, 3, '#bdbdb5');
      for (let y = 0; y < H; y += 128) line(W / 2, y + 20, y + 84, 4, white);
    } else {
      line(9, 0, H, 4, white);
      line(W - 9, 0, H, 4, white);
      for (let y = 0; y < H; y += 128) line(W / 2, y, y + 70, 4, yellow);
    }
    // tire wear darker strips
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#1d1d1f';
    for (const x of [0.2, 0.36, 0.64, 0.8]) ctx.fillRect(W * x - 8, 0, 16, H);
    ctx.globalAlpha = 1;
    return toTex(c);
  });
}

export function intersectionTexture() {
  return memo('intersection', () => {
    const S = 256;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    asphaltBase(ctx, S, S, 21);
    ctx.fillStyle = '#e4e4dc';
    // zebra crossings on all four sides
    const band = 26;
    for (let i = 0; i < 9; i++) {
      const p = 22 + i * 24;
      ctx.fillRect(p, 2, 12, band);
      ctx.fillRect(p, S - band - 2, 12, band);
      ctx.fillRect(2, p, band, 12);
      ctx.fillRect(S - band - 2, p, band, 12);
    }
    return toTex(c, { repeat: false });
  });
}

export function concreteTexture(tone = 0) {
  return memo('concrete' + tone, () => {
    const S = 256;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const rng = new Rng(31 + tone);
    const bases = ['#a9a8a2', '#8f8f8b', '#b8b2a6'];
    ctx.fillStyle = bases[tone % bases.length];
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, 9000, ['#9d9c96', '#b3b2ac', '#a2a19b', '#8e8d88'], rng, 1, 2);
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = rng.chance(0.5) ? '#6d6c68' : '#c9c8c2';
      ctx.beginPath();
      ctx.arc(rng.next() * S, rng.next() * S, 6 + rng.next() * 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(60,60,58,0.45)';
    ctx.lineWidth = 2;
    for (let p = 0; p <= S; p += 128) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, S);
      ctx.moveTo(0, p);
      ctx.lineTo(S, p);
      ctx.stroke();
    }
    return toTex(c);
  });
}

export function sidewalkTexture() {
  return memo('sidewalk', () => {
    const S = 256;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const rng = new Rng(41);
    ctx.fillStyle = '#b5b1a8';
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, 6000, ['#a8a49b', '#c0bcb3', '#9f9b93'], rng);
    ctx.strokeStyle = 'rgba(80,78,72,0.5)';
    ctx.lineWidth = 2;
    for (let p = 0; p <= S; p += 64) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, S);
      ctx.moveTo(0, p);
      ctx.lineTo(S, p);
      ctx.stroke();
    }
    return toTex(c);
  });
}

export function parkingTexture() {
  return memo('parking', () => {
    const W = 256;
    const H = 256;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    asphaltBase(ctx, W, H, 51, '#404145');
    ctx.fillStyle = '#e8e8e0';
    for (let x = 0; x < W; x += 32) {
      ctx.fillRect(x, 0, 3, 96);
      ctx.fillRect(x, H - 96, 3, 96);
    }
    ctx.fillRect(0, 96, W, 3);
    ctx.fillRect(0, H - 99, W, 3);
    return toTex(c);
  });
}

export function dirtTexture() {
  return memo('dirt', () => {
    const S = 256;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const rng = new Rng(61);
    ctx.fillStyle = '#9a7650';
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, 12000, ['#8a6744', '#a8845d', '#7c5c3c', '#b38f66', '#916e49'], rng, 1, 3);
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = rng.chance(0.5) ? '#5f452c' : '#c09b70';
      ctx.beginPath();
      ctx.ellipse(rng.next() * S, rng.next() * S, 4 + rng.next() * 16, 2 + rng.next() * 6, rng.next() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return toTex(c);
  });
}

export function woodTexture() {
  return memo('wood', () => {
    const W = 256;
    const H = 256;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const rng = new Rng(71);
    const plank = 32;
    for (let y = 0; y < H; y += plank) {
      const tone = 120 + rng.next() * 40;
      ctx.fillStyle = `rgb(${tone + 40},${tone + 5},${tone - 40})`;
      ctx.fillRect(0, y, W, plank);
      ctx.strokeStyle = 'rgba(60,35,15,0.25)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const yy = y + 3 + rng.next() * (plank - 6);
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(W * 0.3, yy + rng.next() * 4 - 2, W * 0.6, yy + rng.next() * 4 - 2, W, yy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,22,8,0.7)';
      ctx.fillRect(0, y, W, 2);
      ctx.fillStyle = '#333';
      for (const x of [16, W - 16]) {
        ctx.fillRect(x, y + 8, 3, 3);
        ctx.fillRect(x, y + plank - 11, 3, 3);
      }
    }
    return toTex(c);
  });
}

export function metalRampTexture() {
  return memo('metalRamp', () => {
    const S = 128;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#7d8288';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#9aa0a6';
    for (let y = 0; y < S; y += 16) {
      for (let x = (y / 16) % 2 ? 8 : 0; x < S; x += 16) {
        ctx.save();
        ctx.translate(x + 8, y + 8);
        ctx.rotate(0.7);
        ctx.fillRect(-6, -1.5, 12, 3);
        ctx.restore();
      }
    }
    return toTex(c);
  });
}

const FACADES = [
  { wall: '#5f7891', glass: ['#9fc4e0', '#7aa6c9', '#b8d6ea', '#6d97bb'], frame: '#38485a', cols: 4, rows: 4, gw: 0.86, gh: 0.8 },
  { wall: '#b9b4aa', glass: ['#3d4b5a', '#4f6273', '#34404d', '#5c7084'], frame: '#9a958c', cols: 4, rows: 4, gw: 0.55, gh: 0.55 },
  { wall: '#8b4a36', glass: ['#2f3a45', '#45525e', '#d9c9a3', '#3a4651'], frame: '#e4ddd0', cols: 4, rows: 4, gw: 0.45, gh: 0.6 },
  { wall: '#e6e3dc', glass: ['#28323c', '#33414f', '#22303d', '#3e5163'], frame: '#c7c3ba', cols: 4, rows: 4, gw: 0.7, gh: 0.42 },
  { wall: '#c9a66b', glass: ['#30373e', '#3f4952', '#d6c39a', '#2a3138'], frame: '#a8884f', cols: 4, rows: 4, gw: 0.5, gh: 0.58 },
];
export const FACADE_COUNT = FACADES.length;

// Facade covers 4 x 4 window bays: each bay is 3.5 m wide and 3.5 m high.
export function facadeTexture(style) {
  return memo('facade' + style, () => {
    const S = 256;
    const f = FACADES[style];
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const rng = new Rng(100 + style);
    ctx.fillStyle = f.wall;
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, 3000, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'], rng, 1, 2);
    const bw = S / f.cols;
    const bh = S / f.rows;
    for (let r = 0; r < f.rows; r++) {
      for (let k = 0; k < f.cols; k++) {
        const x = k * bw + (bw * (1 - f.gw)) / 2;
        const y = r * bh + (bh * (1 - f.gh)) / 2;
        const w = bw * f.gw;
        const h = bh * f.gh;
        ctx.fillStyle = f.frame;
        ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        const col = f.glass[Math.floor(rng.next() * f.glass.length)];
        g.addColorStop(0, col);
        g.addColorStop(1, shade(col, -0.25));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 2, y + 2, w * 0.35, h - 4);
      }
      if (style === 1 || style === 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, r * bh + bh - 4, S, 4);
      }
    }
    return toTex(c);
  });
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  r = f(r);
  g = f(g);
  b = f(b);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

export function roofTexture() {
  return memo('roof', () => {
    const S = 128;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const rng = new Rng(201);
    ctx.fillStyle = '#5b5c5e';
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, 3000, ['#525355', '#646567', '#4b4c4e'], rng);
    return toTex(c);
  });
}

export function corrugatedTexture(color) {
  return memo('corr' + color, () => {
    const W = 128;
    const H = 128;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    for (let x = 0; x < W; x += 8) {
      const g = ctx.createLinearGradient(x, 0, x + 8, 0);
      g.addColorStop(0, shade(color, -0.2));
      g.addColorStop(0.5, shade(color, 0.15));
      g.addColorStop(1, shade(color, -0.2));
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 8, H);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, H - 3, W, 3);
    return toTex(c);
  });
}

export function containerTexture(color) {
  return memo('cont' + color, () => {
    const W = 256;
    const H = 64;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 6) {
      ctx.fillStyle = x % 12 ? shade(color, -0.18) : shade(color, 0.1);
      ctx.fillRect(x, 3, 3, H - 6);
    }
    ctx.fillStyle = shade(color, -0.4);
    ctx.fillRect(0, 0, W, 3);
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillRect(0, 0, 3, H);
    ctx.fillRect(W - 3, 0, 3, H);
    return toTex(c, { repeat: false });
  });
}

export function bannerTexture(text, bg = '#111', fg = '#ff6a00', sub = '') {
  return memo('banner' + text + bg + fg + sub, () => {
    const W = 512;
    const H = 128;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, 8);
    ctx.fillRect(0, H - 8, W, 8);
    ctx.font = `italic 900 ${sub ? 58 : 70}px Impact, "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    ctx.fillText(text, W / 2, sub ? H / 2 - 12 : H / 2 + 2, W - 30);
    if (sub) {
      ctx.font = 'bold 26px Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(sub, W / 2, H / 2 + 34, W - 30);
    }
    return toTex(c, { repeat: false });
  });
}

export function markerTexture(n) {
  return memo('marker' + n, () => {
    const W = 128;
    const H = 64;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff3b1f';
    ctx.fillRect(0, 0, W, 10);
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111';
    ctx.fillText(n + 'm', W / 2, H / 2 + 5);
    return toTex(c, { repeat: false });
  });
}

export function checkerTexture() {
  return memo('checker', () => {
    const S = 64;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
    const t = toTex(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  });
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return memo('glow' + inner + outer, () => {
    const S = 128;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return toTex(c, { repeat: false });
  });
}

export function smokeTexture() {
  return memo('smoke', () => {
    const S = 64;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return toTex(c, { repeat: false });
  });
}

export function waterNormalTexture() {
  return memo('waterN', () => {
    const S = 128;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const a = (x / S) * Math.PI * 2;
        const b = (y / S) * Math.PI * 2;
        const dx = Math.cos(a * 3 + b * 2) * 0.5 + Math.cos(a * 7 - b * 5) * 0.25;
        const dy = Math.cos(b * 4 - a) * 0.5 + Math.sin(b * 6 + a * 3) * 0.25;
        const i = (y * S + x) * 4;
        img.data[i] = 128 + dx * 60;
        img.data[i + 1] = 128 + dy * 60;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTex(c, { color: false });
  });
}

export function fieldTexture(kind) {
  return memo('field' + kind, () => {
    const S = 128;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const cols = {
      wheat: ['#d8b85a', '#c9a84c', '#e2c46c'],
      green: ['#6f9a3d', '#62893a', '#7aa748'],
      plowed: ['#7a5a3a', '#6a4c30', '#86664a'],
    }[kind];
    for (let x = 0; x < S; x += 8) {
      ctx.fillStyle = cols[(x / 8) % 3];
      ctx.fillRect(x, 0, 8, S);
    }
    const rng = new Rng(300);
    speckle(ctx, S, S, 1500, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.1)'], rng);
    return toTex(c);
  });
}

export function numberPlateTexture(num, color) {
  return memo('num' + num + color, () => {
    const S = 128;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 900 84px Impact, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), S / 2, S / 2 + 4);
    return toTex(c, { repeat: false });
  });
}

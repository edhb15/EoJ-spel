// Chicago Bois – procedural textures (building facades, neon sign atlas, graffiti).
'use strict';
(function (CB) {
  const B = BABYLON;
  const SIGN_FONT = '"Anton", Impact, "Arial Narrow", sans-serif';

  function dt(scene, name, w, h, mips) {
    const t = new B.DynamicTexture(name, { width: w, height: h }, scene, mips !== false, B.Texture.TRILINEAR_SAMPLINGMODE);
    t.wrapU = B.Texture.WRAP_ADDRESSMODE; t.wrapV = B.Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 8;
    return t;
  }

  // Height map (grey image data) -> tangent-space normal map texture.
  function normalMap(scene, name, img, S, strength) {
    const t = new B.DynamicTexture(name, { width: S, height: S }, scene, true);
    t.wrapU = t.wrapV = B.Texture.WRAP_ADDRESSMODE;
    const c = t.getContext(), out = c.createImageData(S, S), d = img.data;
    const H = (x, y) => d[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
        const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
        out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
        out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
      }
    }
    c.putImageData(out, 0, 0);
    t.update();
    return t;
  }
  CB.normalMap = normalMap;

  // Facade tile = 8 bays x 8 floors, each cell 128 px (= 3 m x 3.5 m).
  CB.CityTex = {
    facade(scene, kind, seed) {
      const R = CB.rng(seed);
      const S = 128, N = 8;
      const diff = dt(scene, 'fac_' + kind, S * N, S * N);
      const emis = dt(scene, 'facE_' + kind, S * N, S * N);
      const c = diff.getContext(), e = emis.getContext();
      e.fillStyle = '#000'; e.fillRect(0, 0, S * N, S * N);
      const wins = []; // window rectangles, used for the gloss + normal maps
      for (let fy = 0; fy < N; fy++) {
        for (let fx = 0; fx < N; fx++) {
          const x = fx * S, y = fy * S;
          const lit = R() < (kind === 'glass' ? 0.34 : 0.42);
          const warm = R() < 0.7, tv = !warm && R() < 0.35;
          const br = 0.75 + R() * 0.25;
          const rgb = warm ? [255, 200 + R() * 40, 110 + R() * 60] : tv ? [120, 160, 255] : [190 + R() * 40, 215 + R() * 30, 255];
          const room = (ex, ey, w, h) => {
            const col = (k) => `rgb(${rgb[0] * k * br | 0},${rgb[1] * k * br | 0},${rgb[2] * k * br | 0})`;
            const g = e.createLinearGradient(0, ey, 0, ey + h);
            g.addColorStop(0, col(1)); g.addColorStop(0.55, col(0.82)); g.addColorStop(1, col(0.45));
            return g;
          };
          const lc = { fill: room, rgb };
          const blind = R() < 0.3 ? R() * 0.5 : 0;
          if (kind === 'office') {
            c.fillStyle = '#dcdcdc'; c.fillRect(x, y, S, S);
            c.fillStyle = '#bdbdbd'; c.fillRect(x, y + S - 14, S, 14);
            win(c, x + 12, y + 18, S - 24, S - 40, R, blind, wins);
            if (lit) litWin(e, lc, x + 14, y + 20 + (S - 44) * blind, S - 28, (S - 44) * (1 - blind), R);
          } else if (kind === 'brick') {
            c.fillStyle = '#cfcfcf'; c.fillRect(x, y, S, S);
            c.fillStyle = '#b8b8b8';
            for (let r = 0; r < 16; r++) {
              c.fillRect(x, y + r * 8, S, 1);
              for (let k = 0; k < 6; k++) c.fillRect(x + ((k * 24 + (r % 2) * 12) % S), y + r * 8, 1, 8);
            }
            c.fillStyle = '#eeeeee'; c.fillRect(x + 30, y + 20, 68, 6); c.fillRect(x + 28, y + 104, 72, 7);
            win(c, x + 34, y + 26, 60, 78, R, blind, wins);
            c.fillStyle = '#e6e6e6'; c.fillRect(x + 63, y + 26, 2, 78); c.fillRect(x + 34, y + 62, 60, 2);
            if (lit) litWin(e, lc, x + 36, y + 28 + 74 * blind, 56, 74 * (1 - blind), R);
          } else if (kind === 'stone') {
            c.fillStyle = '#e8e2d6'; c.fillRect(x, y, S, S);
            c.fillStyle = '#d4cbbb'; c.fillRect(x, y + S - 10, S, 10); c.fillRect(x, y + 4, S, 3);
            for (const wx of [18, 70]) {
              win(c, x + wx, y + 22, 40, 86, R, blind, wins);
              if (lit) litWin(e, lc, x + wx + 2, y + 24 + 82 * blind, 36, 82 * (1 - blind), R);
            }
          } else { // glass curtain wall
            const g = c.createLinearGradient(x, y, x + S, y + S);
            g.addColorStop(0, '#9fb9cf'); g.addColorStop(0.5, '#5f7e9b'); g.addColorStop(1, '#86a6c2');
            c.fillStyle = g; c.fillRect(x, y, S, S);
            c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + 8, y + 8, 30, S - 30);
            wins.push([x + 4, y + 5, S - 6, S - 28]);
            c.fillStyle = '#2e3842'; c.fillRect(x, y, S, 5); c.fillRect(x, y, 4, S); c.fillRect(x + 62, y, 2, S);
            c.fillStyle = '#3e4b57'; c.fillRect(x, y + S - 22, S, 22);
            if (lit) { e.globalAlpha = 0.8; litWin(e, lc, x + 4, y + 5, S - 6, S - 28, R); e.globalAlpha = 1; }
          }
        }
      }
      diff.update(); emis.update();
      // gloss map (windows shiny, walls matte) and normal map (windows set back into the wall)
      const M2 = 512, k = M2 / (S * N);
      const spec = dt(scene, 'facS_' + kind, M2, M2);
      const sc = spec.getContext();
      sc.fillStyle = kind === 'glass' ? '#333' : '#0c0c0c'; sc.fillRect(0, 0, M2, M2);
      sc.fillStyle = '#e0e0e0';
      for (const w of wins) sc.fillRect(w[0] * k, w[1] * k, w[2] * k, w[3] * k);
      spec.update();
      const hc = document.createElement('canvas'); hc.width = hc.height = M2;
      const hx = hc.getContext('2d');
      hx.fillStyle = '#fff'; hx.fillRect(0, 0, M2, M2);
      for (const w of wins) {
        hx.fillStyle = '#9a9a9a'; hx.fillRect(w[0] * k - 1, w[1] * k - 1, w[2] * k + 2, w[3] * k + 2);
        hx.fillStyle = '#404040'; hx.fillRect(w[0] * k + 1, w[1] * k + 1, w[2] * k - 2, w[3] * k - 2);
      }
      const bump = normalMap(scene, 'facN_' + kind, hx.getImageData(0, 0, M2, M2), M2, kind === 'glass' ? 1.5 : 3);
      return { diff, emis, spec, bump };
    },

    // Neon sign atlas: 4 columns x 16 rows of 256x64 labels.
    signAtlas(scene, labels) {
      const W = 1024, H = 1024, CW = 256, CH = 64;
      const tex = dt(scene, 'signs', W, H);
      tex.wrapU = tex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
      const c = tex.getContext();
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const uvs = [];
      labels.forEach((L, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        const x = col * CW, y = row * CH;
        c.fillStyle = L.bg; c.fillRect(x + 2, y + 2, CW - 4, CH - 4);
        c.strokeStyle = L.fg; c.lineWidth = 3; c.strokeRect(x + 6, y + 6, CW - 12, CH - 12);
        let size = 40;
        c.font = `${size}px ${SIGN_FONT}`;
        while (c.measureText(L.text).width > CW - 26 && size > 14) { size -= 2; c.font = `${size}px ${SIGN_FONT}`; }
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = L.fg; c.shadowBlur = 10;
        c.fillStyle = L.fg; c.fillText(L.text, x + CW / 2, y + CH / 2 + 2);
        c.shadowBlur = 0;
        c.fillStyle = '#fff'; c.globalAlpha = 0.55; c.fillText(L.text, x + CW / 2, y + CH / 2 + 2); c.globalAlpha = 1;
        const u0 = (x + 3) / W, u1 = (x + CW - 3) / W;
        const v1 = 1 - (y + 3) / H, v0 = 1 - (y + CH - 3) / H;
        uvs.push([u0, v0, u1, v1]);
      });
      tex.update();
      return { tex, uvs };
    },

    // Tileable grey grain for asphalt, concrete and roofs (multiplied with vertex colours).
    detail(scene) {
      const S = 256, R = CB.rng(77);
      const t = new B.DynamicTexture('detail', { width: S, height: S }, scene, true, B.Texture.TRILINEAR_SAMPLINGMODE);
      t.wrapU = t.wrapV = B.Texture.WRAP_ADDRESSMODE;
      t.anisotropicFilteringLevel = 8;
      const c = t.getContext(), img = c.createImageData(S, S);
      // periodic value noise (several octaves) so the tile repeats seamlessly
      const oct = [[4, 0.35], [8, 0.25], [16, 0.2], [64, 0.2]].map(([n, a]) => {
        const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = R();
        return { n, a, g };
      });
      const sm = (v) => v * v * (3 - 2 * v);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          let v = 0;
          for (const o of oct) {
            const fx = x / S * o.n, fy = y / S * o.n, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
            const G = (a, b) => o.g[((b % o.n) * o.n) + (a % o.n)];
            v += o.a * ((G(ix, iy) * (1 - tx) + G(ix + 1, iy) * tx) * (1 - ty) + (G(ix, iy + 1) * (1 - tx) + G(ix + 1, iy + 1) * tx) * ty);
          }
          v = 0.9 + (v - 0.5) * 0.28 + (R() - 0.5) * 0.08;
          const i = (y * S + x) * 4, g = Math.max(0, Math.min(255, v * 255));
          img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
      // a few hairline cracks and stains
      c.strokeStyle = 'rgba(40,40,40,0.12)'; c.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        let x = R() * S, y = R() * S;
        c.beginPath(); c.moveTo(x, y);
        for (let j = 0; j < 6; j++) { x += (R() - 0.5) * 30; y += (R() - 0.5) * 30; c.lineTo(x, y); }
        c.stroke();
      }
      for (let k = 0; k < 6; k++) {
        const g = c.createRadialGradient(0, 0, 1, 0, 0, 20); const x = R() * S, y = R() * S;
        g.addColorStop(0, 'rgba(30,30,30,0.18)'); g.addColorStop(1, 'rgba(30,30,30,0)');
        c.save(); c.translate(x, y); c.fillStyle = g; c.fillRect(-20, -20, 40, 40); c.restore();
      }
      t.update();
      return t;
    },

    graffiti(scene) {
      const W = 1024, H = 512;
      const tex = new B.DynamicTexture('graffiti', { width: W, height: H }, scene, true);
      tex.hasAlpha = true;
      const c = tex.getContext();
      c.clearRect(0, 0, W, H);
      const tags = ['CHI BOIS', 'BOIS 4 LIFE', 'WINDY!', 'CHI-TOWN'];
      const cols = [['#ff2d95', '#ffe600'], ['#00e5ff', '#ff3b30'], ['#7cff00', '#8a2be2'], ['#ff8c00', '#00bfff']];
      tags.forEach((t, i) => {
        const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
        c.save();
        c.translate(x + 256, y + 128); c.rotate(-0.08 + i * 0.05);
        c.font = `bold 86px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineJoin = 'round';
        c.lineWidth = 22; c.strokeStyle = '#111'; c.strokeText(t, 0, 0);
        c.lineWidth = 10; c.strokeStyle = cols[i][1]; c.strokeText(t, 0, 0);
        c.fillStyle = cols[i][0]; c.fillText(t, 0, 0);
        c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(-180, -28, 40, 6);
        for (let k = 0; k < 6; k++) { c.fillStyle = cols[i][0]; c.fillRect(-160 + k * 60, 30, 5, 30 + Math.random() * 40); }
        c.restore();
      });
      tex.update();
      return tex;
    },
  };

  // A lit window seen from outside: the room's light (bright near the ceiling), sometimes a
  // curtain on one side or a lamp-lit silhouette of furniture.
  function litWin(e, lc, x, y, w, h, R) {
    if (h < 3) return;
    e.fillStyle = lc.fill(x, y, w, h); e.fillRect(x, y, w, h);
    const [r, g, b] = lc.rgb;
    if (R() < 0.35) { // curtain
      const cw = w * (0.18 + R() * 0.2), left = R() < 0.5;
      e.fillStyle = `rgba(${r * 0.55 | 0},${g * 0.45 | 0},${b * 0.35 | 0},0.85)`;
      e.fillRect(left ? x : x + w - cw, y, cw, h);
    }
    if (R() < 0.3) { // furniture / person silhouette at the bottom
      e.fillStyle = 'rgba(0,0,0,0.55)';
      const sx = x + w * (0.15 + R() * 0.5), sw = w * (0.15 + R() * 0.25), sh = h * (0.15 + R() * 0.25);
      e.fillRect(sx, y + h - sh, sw, sh);
    }
    // ceiling light hot spot
    const hg = e.createRadialGradient(x + w / 2, y, 1, x + w / 2, y, w * 0.7);
    hg.addColorStop(0, 'rgba(255,250,235,0.45)'); hg.addColorStop(1, 'rgba(255,250,235,0)');
    e.fillStyle = hg; e.fillRect(x, y, w, h * 0.6);
  }

  function win(c, x, y, w, h, R, blind, rec) {
    if (rec) rec.push([x, y, w, h]);
    const g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#5e7894'); g.addColorStop(1, '#1d2836');
    c.fillStyle = '#2b2b2b'; c.fillRect(x - 2, y - 2, w + 4, h + 4);
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(255,255,255,0.13)';
    c.beginPath(); c.moveTo(x, y + h * 0.7); c.lineTo(x + w * 0.5, y); c.lineTo(x + w * 0.75, y); c.lineTo(x, y + h); c.fill();
    if (blind) { c.fillStyle = '#d9cfb8'; c.fillRect(x, y, w, h * blind); }
  }
})(window.CB);

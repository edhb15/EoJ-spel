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

  // Facade tile = 8 bays x 8 floors, each cell 128 px (= 3 m x 3.5 m).
  CB.CityTex = {
    facade(scene, kind, seed) {
      const R = CB.rng(seed);
      const S = 128, N = 8;
      const diff = dt(scene, 'fac_' + kind, S * N, S * N);
      const emis = dt(scene, 'facE_' + kind, S * N, S * N);
      const c = diff.getContext(), e = emis.getContext();
      e.fillStyle = '#000'; e.fillRect(0, 0, S * N, S * N);
      for (let fy = 0; fy < N; fy++) {
        for (let fx = 0; fx < N; fx++) {
          const x = fx * S, y = fy * S;
          const lit = R() < (kind === 'glass' ? 0.32 : 0.4);
          const warm = R() < 0.7;
          const lc = warm ? `rgb(255,${200 + R() * 40 | 0},${110 + R() * 60 | 0})` : `rgb(${190 + R() * 40 | 0},${215 + R() * 30 | 0},255)`;
          const blind = R() < 0.3 ? R() * 0.5 : 0;
          if (kind === 'office') {
            c.fillStyle = '#dcdcdc'; c.fillRect(x, y, S, S);
            c.fillStyle = '#bdbdbd'; c.fillRect(x, y + S - 14, S, 14);
            win(c, x + 12, y + 18, S - 24, S - 40, R, blind);
            if (lit) { e.fillStyle = lc; e.fillRect(x + 14, y + 20 + (S - 44) * blind, S - 28, (S - 44) * (1 - blind)); }
          } else if (kind === 'brick') {
            c.fillStyle = '#cfcfcf'; c.fillRect(x, y, S, S);
            c.fillStyle = '#b8b8b8';
            for (let r = 0; r < 16; r++) {
              c.fillRect(x, y + r * 8, S, 1);
              for (let k = 0; k < 6; k++) c.fillRect(x + ((k * 24 + (r % 2) * 12) % S), y + r * 8, 1, 8);
            }
            c.fillStyle = '#eeeeee'; c.fillRect(x + 30, y + 20, 68, 6); c.fillRect(x + 28, y + 104, 72, 7);
            win(c, x + 34, y + 26, 60, 78, R, blind);
            c.fillStyle = '#e6e6e6'; c.fillRect(x + 63, y + 26, 2, 78); c.fillRect(x + 34, y + 62, 60, 2);
            if (lit) { e.fillStyle = lc; e.fillRect(x + 36, y + 28 + 74 * blind, 56, 74 * (1 - blind)); }
          } else if (kind === 'stone') {
            c.fillStyle = '#e8e2d6'; c.fillRect(x, y, S, S);
            c.fillStyle = '#d4cbbb'; c.fillRect(x, y + S - 10, S, 10); c.fillRect(x, y + 4, S, 3);
            for (const wx of [18, 70]) {
              win(c, x + wx, y + 22, 40, 86, R, blind);
              if (lit) { e.fillStyle = lc; e.fillRect(x + wx + 2, y + 24 + 82 * blind, 36, 82 * (1 - blind)); }
            }
          } else { // glass curtain wall
            const g = c.createLinearGradient(x, y, x + S, y + S);
            g.addColorStop(0, '#9fb9cf'); g.addColorStop(0.5, '#5f7e9b'); g.addColorStop(1, '#86a6c2');
            c.fillStyle = g; c.fillRect(x, y, S, S);
            c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + 8, y + 8, 30, S - 30);
            c.fillStyle = '#2e3842'; c.fillRect(x, y, S, 5); c.fillRect(x, y, 4, S); c.fillRect(x + 62, y, 2, S);
            c.fillStyle = '#3e4b57'; c.fillRect(x, y + S - 22, S, 22);
            if (lit) { e.fillStyle = lc; e.globalAlpha = 0.75; e.fillRect(x + 4, y + 5, S - 6, S - 28); e.globalAlpha = 1; }
          }
        }
      }
      diff.update(); emis.update();
      return { diff, emis };
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

  function win(c, x, y, w, h, R, blind) {
    const g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#5e7894'); g.addColorStop(1, '#1d2836');
    c.fillStyle = '#2b2b2b'; c.fillRect(x - 2, y - 2, w + 4, h + 4);
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(255,255,255,0.13)';
    c.beginPath(); c.moveTo(x, y + h * 0.7); c.lineTo(x + w * 0.5, y); c.lineTo(x + w * 0.75, y); c.lineTo(x, y + h); c.fill();
    if (blind) { c.fillStyle = '#d9cfb8'; c.fillRect(x, y, w, h * blind); }
  }
})(window.CB);

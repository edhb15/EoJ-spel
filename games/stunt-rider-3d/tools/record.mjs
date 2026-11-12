// Renders a deterministic gameplay clip frame by frame: node tools/record.mjs <framesDir> [W] [H]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const [out = 'frames', W = '960', H = '540'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:${server.address().port}/index.html`);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 300000 });
await page.mouse.click(10, 10);
await page.waitForTimeout(500);
await page.evaluate(() => {
  const g = window.__game;
  g.renderer.setAnimationLoop(null);
  // virtual clock for timers and CSS animations
  const timers = [];
  window.__vt = 0;
  window.setTimeout = (fn, ms = 0) => { timers.push({ t: window.__vt + ms, fn }); return timers.length; };
  window.__tick = (ms) => {
    window.__vt += ms;
    for (const t of timers.slice()) if (t.t <= window.__vt) { timers.splice(timers.indexOf(t), 1); t.fn(); }
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = Math.min((a.currentTime || 0) + ms, 1e7); }
  };
  g.startMode('free', { spawn: 'kickers' });
  g.hud.hint.classList.remove('show');
  g.profile.settings.quality = 'high';
  g.applySettings();
  window.__keys = (list) => { const v = g.input.virtual; for (const k of ['throttle', 'brake', 'left', 'right', 'jump', 'boost', 'trick']) { if (list.includes(k) && !v.has(k)) g.input.virtualEdges.add(k); } v.clear(); for (const k of list) v.add(k); };
  window.__shot = (name, x, z, yaw, speed, cam) => { g.placeBike(x, z, yaw); g.bike.physics.s = speed; g.rig.setMode(cam); g.hud.hint.classList.remove('show'); };
  window.__frame = () => { g.frame(g.last + 1000 / 30); window.__tick(1000 / 30); };
});
const plan = [
  // [frames, setup?, inputs(frame, physics) ]
  { n: 150, setup: ['kickers', 48, -200, Math.PI / 2, 22, 0], keys: (f, P) => (P.mode === 'air' ? (P.airTime > 0.2 && P.rot.pitch < 5.0 ? ['brake'] : []).concat(P.airTime > 0.9 && P.airTime < 1.8 ? ['trick'] : []) : ['throttle']) },
  { n: 120, setup: ['hp', 150, 66, 0, 17.5, 3], keys: (f, P) => (P.mode === 'ground' ? ['throttle'] : []) },
  { n: 110, setup: ['loop', -175, 40, Math.PI / 2, 24, 0], keys: () => ['throttle'] },
];
let idx = 0;
for (const sh of plan) {
  await page.evaluate((s) => window.__shot(s[0], s[1], s[2], s[3], s[4], s[5]), sh.setup);
  for (let f = 0; f < sh.n; f++) {
    const P = await page.evaluate(() => { const P = window.__game.bike.physics; return { mode: P.mode, airTime: P.airTime, rot: P.rot }; });
    const keys = sh.keys(f, P);
    await page.evaluate((k) => { window.__keys(k); window.__frame(); }, keys);
    await page.screenshot({ path: path.join(out, `f${String(idx++).padStart(4, '0')}.png`) });
  }
}
console.log('frames', idx);
await browser.close();
server.close();

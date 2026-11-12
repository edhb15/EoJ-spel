// Scripted playthrough: node tools/play.mjs <outdir> [scenario]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const [out = '.', scenario = 'basic', W = '1280', H = '720'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(scenario === 'mobile' ? { viewport: { width: +W, height: +H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: +W, height: +H } });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('goatcounter') && !m.text().includes('ERR_NAME')) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 300000 });
let n = 0;
const shot = async (name) => { await page.screenshot({ path: path.join(out, `${String(++n).padStart(2, '0')}-${name}.png`) }); };
const click = async (text) => { await page.locator('button', { hasText: text }).first().click(); await page.waitForTimeout(300); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); };
const state = () => ev(() => { const g = window.__game; const P = g.bike.physics; return { state: g.state, screen: g.ui.current, mode: P.mode, x: +P.root.x.toFixed(1), y: +P.root.y.toFixed(2), z: +P.root.z.toFixed(1), kmh: Math.round(P.speed * 3.6), fps: g.renderer.info.render.frame }; });
const scenarios = {
  async basic() {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(800);
    await shot('main');
    await click('PLAY');
    await shot('modes');
    await click('FREE RIDE');
    await page.waitForTimeout(1500);
    await shot('bikes');
    await click('RIDE');
    await page.waitForTimeout(2500);
    await shot('ride-start');
    logs.push('state ' + JSON.stringify(await state()));
    await hold(['KeyW'], 4000);
    logs.push('after W ' + JSON.stringify(await state()));
    await shot('riding');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await shot('pause');
    await click('MAP');
    await page.waitForTimeout(500);
    await shot('map');
  },
  async flows() {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(500);
    // stunt mode
    await click('PLAY'); await page.waitForTimeout(1500);
    await click('STUNT MODE'); await page.waitForTimeout(1500);
    await click('RIDE'); await page.waitForTimeout(3500);
    await shot('stunt-countdown');
    await ev(() => { const g = window.__game; g.mode.onBanked({ total: 12345, count: 3, mult: 3, entries: [] }); g.mode.time = 179.9; });
    await page.waitForTimeout(3500);
    logs.push('after stunt: ' + JSON.stringify(await state()));
    await shot('stunt-results');
    await click('MAIN MENU'); await page.waitForTimeout(1500);
    // time trial
    await click('PLAY'); await page.waitForTimeout(1500);
    await click('TIME TRIAL'); await page.waitForTimeout(1500);
    await click('DOWNTOWN DASH'); await page.waitForTimeout(1500);
    await click('RIDE'); await page.waitForTimeout(4000);
    await shot('trial-start');
    await ev(() => { const m = window.__game.mode; m.running = true; m.time = 70; for (let i = 0; i < 20 && !m.finished; i++) m.passCheckpoint(); });
    await page.waitForTimeout(3000);
    await shot('trial-results');
    logs.push('profile ' + JSON.stringify(await ev(() => ({ pts: window.__game.profile.data.points, medals: window.__game.profile.data.best.medals }))));
    await click('MAIN MENU'); await page.waitForTimeout(1500);
    // challenge
    await click('PLAY'); await page.waitForTimeout(1500);
    await click('CHALLENGES'); await page.waitForTimeout(1500);
    await click('WHEELIE KING'); await page.waitForTimeout(1500);
    await click('RIDE'); await page.waitForTimeout(4000);
    await shot('challenge-start');
    await ev(() => window.__game.mode.complete());
    await page.waitForTimeout(4500);
    await shot('challenge-results');
    await click('MAIN MENU'); await page.waitForTimeout(1500);
    // ramp jump
    await click('PLAY'); await page.waitForTimeout(1500);
    await click('RAMP JUMP'); await page.waitForTimeout(1500);
    await click('RIDE'); await page.waitForTimeout(4000);
    await shot('ramp-start');
    for (let i = 0; i < 3; i++) {
      await ev((i) => { const m = window.__game.mode; m.state = 'flying'; m.result(100 + i * 25.5, i === 1 ? 'perfect' : 'good', 3); m.waitT = 0.05; }, i);
      await page.waitForTimeout(2500);
    }
    await page.waitForTimeout(2000);
    await shot('ramp-results');
    logs.push('final ' + JSON.stringify(await ev(() => ({ pts: window.__game.profile.data.points, best: window.__game.profile.data.best }))));
  },
  async cams() {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(500);
    await click('PLAY'); await page.waitForTimeout(1500);
    await click('FREE RIDE'); await page.waitForTimeout(1500);
    await click('RIDE'); await page.waitForTimeout(2500);
    await ev(() => { const g = window.__game; g.teleport('kickers'); g.bike.physics.s = 22; });
    await hold(['KeyW'], 2500);
    await shot('cam-chase');
    for (const name of ['first', 'cine', 'side']) {
      await page.keyboard.press('KeyC');
      await page.waitForTimeout(1500);
      await shot('cam-' + name);
    }
    logs.push('st ' + JSON.stringify(await state()));
  },
  async crash() {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(500);
    await click('PLAY'); await page.waitForTimeout(1500);
    await click('FREE RIDE'); await page.waitForTimeout(1500);
    await click('RIDE'); await page.waitForTimeout(2500);
    logs.push('audio ' + JSON.stringify(await ev(() => ({ ready: window.__game.audio.ready, engine: !!window.__game.audio.engine, ctx: window.__game.audio.ctx && window.__game.audio.ctx.state }))));
    await ev(() => { const g = window.__game; g.teleport('kickers'); const P = g.bike.physics; P.s = 20; P.vel.set(20, 0, 0); P.crash('Test crash'); });
    await page.waitForTimeout(1200);
    await shot('crash');
    logs.push('during ' + JSON.stringify(await state()) + ' detached=' + (await ev(() => window.__game.bike.riderDetached)));
    for (let i = 0; i < 30; i++) { const st = await state(); if (st.mode !== 'crash') break; await page.waitForTimeout(500); }
    logs.push('after ' + JSON.stringify(await state()) + ' detached=' + (await ev(() => window.__game.bike.riderDetached)));
    await shot('respawned');
    await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
    logs.push('paused ' + JSON.stringify(await state()));
    await page.keyboard.press('Escape'); await page.waitForTimeout(1500);
    logs.push('resumed ' + JSON.stringify(await state()));
    await page.keyboard.press('KeyM'); await page.waitForTimeout(1500);
    logs.push('map ' + JSON.stringify(await state()));
    await page.keyboard.press('Escape'); await page.waitForTimeout(1000);
    logs.push('map-esc ' + JSON.stringify(await state()));
    await page.keyboard.press('Escape'); await page.waitForTimeout(1500);
    logs.push('resumed2 ' + JSON.stringify(await state()));
  },
  async mobile() {
    await page.touchscreen.tap(400, 200);
    await page.waitForTimeout(1500);
    await shot('m-main');
    await page.locator('button', { hasText: 'PLAY' }).first().tap(); await page.waitForTimeout(1500);
    await shot('m-modes');
    await page.locator('button', { hasText: 'FREE RIDE' }).first().tap(); await page.waitForTimeout(2000);
    await shot('m-bikes');
    await page.locator('button', { hasText: 'RIDE' }).first().tap(); await page.waitForTimeout(3000);
    await shot('m-ride');
    logs.push('touch shown ' + await ev(() => document.getElementById('touch').classList.contains('show')));
  },
  async menus() {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(500);
    await click('GARAGE');
    await page.waitForTimeout(800);
    await shot('garage');
    await click('UPGRADES');
    await shot('garage-upg');
    await page.keyboard.press('Escape');
    await click('SETTINGS');
    await shot('settings');
    await page.keyboard.press('Escape');
    await click('CONTROLS');
    await shot('controls');
    await page.keyboard.press('Escape');
    await click('PLAY');
    await click('TIME TRIAL');
    await shot('courses');
    await page.keyboard.press('Escape');
    await click('CHALLENGES');
    await shot('challenges');
  },
};
try { await scenarios[scenario](); } catch (e) { logs.push('SCRIPT ERROR ' + e.message); await shot('error'); }
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
server.close();

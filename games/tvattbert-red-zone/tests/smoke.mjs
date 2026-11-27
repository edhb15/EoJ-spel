// Headless smoke test: loads the game, starts it, walks around and takes screenshots.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = pw;
import { spawn } from 'node:child_process';
const port = 8181;
const server = spawn('node', ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));
const out = process.argv[2] || 'tests/out';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(`http://localhost:${port}/?quality=low`);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
await page.screenshot({ path: `${out}-menu.png` });
await page.click('#btn-new');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}-start.png` });
const info = await page.evaluate(() => { const g = window.__game; return { pos: g.player.pos.toArray(), state: g.state, removed: g.hospitalRemoved, segs: g.collision.segCount, chunks: g.terrain.chunks.size, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }; });
console.log(JSON.stringify(info));
console.log(errors.slice(0, 20).join('\n'));
await browser.close(); server.kill();

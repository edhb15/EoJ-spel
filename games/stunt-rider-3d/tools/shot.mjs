// Usage: node tools/shot.mjs <page.html?query> out.png [w] [h]   (EVAL env: JS to run before the screenshot)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const [pageq = 'index.html', out = 'shot.png', W = '1280', H = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + '\n' + e.stack));
const t0 = Date.now();
await page.goto(`http://localhost:${port}/${pageq}`);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 300000 }).catch((e) => logs.push('wait timeout ' + e.message));
if (process.env.EVAL) { try { const r = await page.evaluate(process.env.EVAL); logs.push('eval: ' + JSON.stringify(r)); } catch (e) { logs.push('eval error ' + e.message); } }
if (process.env.WAIT) await page.waitForTimeout(+process.env.WAIT);
await page.screenshot({ path: out });
console.log('ms', Date.now() - t0);
console.log(logs.slice(0, 80).join('\n'));
await browser.close();
server.close();

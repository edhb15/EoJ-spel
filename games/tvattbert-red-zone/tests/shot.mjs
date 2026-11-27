// Usage: node tests/shot.mjs out.png "<js to eval after start>" [waitMs]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [out, code = '', wait = '1500', quality = 'low'] = process.argv.slice(2);
const port = 8100 + Math.floor(Math.random() * 800);
const server = spawn('node', ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !t.includes('GPU stall')) errors.push(`${m.type()}: ${t}`); if (m.type() === 'log') console.log('[page]', t); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + e.stack));
try {
  await page.goto(`http://localhost:${port}/?quality=${quality}`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForTimeout(500);
  if (code) { const r = await page.evaluate(code); if (r !== undefined) console.log('result:', JSON.stringify(r)); }
  await page.waitForTimeout(Number(wait));
  await page.screenshot({ path: out });
} catch (e) { console.log('ERR', e.message); }
if (errors.length) console.log(errors.slice(0, 15).join('\n'));
await browser.close(); server.kill();

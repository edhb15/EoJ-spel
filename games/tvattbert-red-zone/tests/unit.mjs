// Pure logic unit tests (no browser): infection timer, inventory, game clock, loot tables.
import assert from 'node:assert/strict';
import { Infection, INFECTION_MS } from '../src/game/infection.js';
import { GameTime } from '../src/game/time.js';
import { TABLES } from '../src/game/loot.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('PASS ', name); };

t('infection lasts exactly 5 real minutes', () => {
  let now = 1_000_000; const inf = new Infection(() => now);
  assert.equal(INFECTION_MS, 300000);
  assert.equal(inf.infect(), true);
  assert.equal(inf.remainingMs(), 300000);
  now += 299_999; assert.equal(inf.check(), false); assert.equal(inf.remainingMs(), 1);
  now += 1; assert.equal(inf.check(), true); assert.equal(inf.turned, true);
  assert.equal(inf.check(), false, 'turning fires only once');
});
t('second bite does not reset the timer', () => {
  let now = 0; const inf = new Infection(() => now);
  inf.infect(); now += 120000; assert.equal(inf.infect(), false); assert.equal(inf.remainingMs(), 180000);
});
t('antidote cures and removes the countdown', () => {
  let now = 0; const inf = new Infection(() => now);
  assert.equal(inf.cure(), false, 'nothing to cure');
  inf.infect(); now += 200000; assert.equal(inf.cure(), true);
  assert.equal(inf.active, false); now += 1e6; assert.equal(inf.check(), false);
});
t('infection state survives serialisation (wall-clock based)', () => {
  let now = 5000; const a = new Infection(() => now); a.infect(); now += 60000;
  const b = new Infection(() => now); b.restore(JSON.parse(JSON.stringify(a.serialize())));
  assert.equal(b.remainingMs(), 240000);
});
t('game clock: day counter and antidote threshold (2 full game days)', () => {
  const g = new GameTime(24); // 24 real minutes per game day
  assert.equal(g.day, 1); assert.equal(g.clock, '08:00');
  g.update(24 * 60); assert.equal(g.day, 2); // one real "day length"
  assert.ok(g.daysPassed >= 1 && g.daysPassed < 2);
  g.update(24 * 60); assert.ok(g.daysPassed >= 2);
  assert.equal(Math.round(new GameTime(24).realSecondsUntilDays(2)), 48 * 60);
});
t('loot tables reference real items', async () => {
  const { ITEMS } = await import('../src/game/items.js');
  for (const [name, rows] of Object.entries(TABLES)) for (const [id] of rows) assert.ok(ITEMS[id], `${name}: ${id}`);
});
console.log(`\n${pass} unit tests passed`);

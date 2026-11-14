// Menu screens built with plain DOM.
import { BIKES, bikeById, PAINTS, PAINT_NAMES, SUITS, SUIT_NAMES, UPGRADES, statBars, effectiveSpec } from '../bike/specs.js';
import { COURSES, CHALLENGES, MODE_INFO } from '../modes/data.js';
import { medalTimes, dailySpot } from '../modes/modes.js';
import { formatPoints, formatTime } from '../core/math.js';
import { STYLE } from '../stunts/tricks.js';
import { CAM_NAMES } from '../camera/camera.js';

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};

const MEDAL_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉' };

export class UI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.current = null;
    this.stack = [];
    this.pending = null;
    this.selBike = game.profile.data.selectedBike;
    this.garageTab = 'paint';
    addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.current) return;
      if (['boot', 'main', 'results'].includes(this.current)) return;
      if (this.current === 'pause') return this.game.resume();
      e.preventDefault();
      this.back();
    });
  }

  get profile() {
    return this.game.profile;
  }

  click() {
    this.game.audio.play('click');
  }

  btn(label, fn, cls = '') {
    return h('button', { class: 'btn ' + cls, onclick: (e) => (this.click(), fn(e)) }, label);
  }

  show(name, opts, push = true) {
    if (push && this.current && this.current !== name && !['boot', 'results'].includes(this.current)) this.stack.push(this.current);
    this.current = name;
    this.opts = opts;
    this.root.innerHTML = '';
    if (!name) {
      this.root.className = '';
      this.game.onScreen(null);
      return;
    }
    const scr = h('div', { class: 'screen screen-' + name });
    this.root.append(scr);
    this.root.className = 'active';
    this[name](scr, opts);
    this.game.onScreen(name);
    const first = scr.querySelector('.btn.primary, .btn');
    if (first && !('ontouchstart' in window)) first.focus({ preventScroll: true });
  }

  back() {
    this.game.audio.play('back');
    const prev = this.stack.pop() || 'main';
    if (this.game.state === 'paused' && prev === 'pause') return this.show('pause', null, false);
    this.show(prev, null, false);
  }

  hide() {
    this.stack = [];
    this.show(null);
  }

  header(scr, title, sub) {
    scr.append(
      h(
        'div',
        { class: 'scr-head' },
        this.btn('‹ BACK', () => this.back(), 'ghost back'),
        h('div', { class: 'scr-title' }, h('h2', {}, title), sub ? h('p', {}, sub) : null),
        h('div', { class: 'pts-chip' }, h('span', {}, 'POINTS'), h('b', {}, formatPoints(this.profile.data.points))),
      ),
    );
  }

  // ---------------------------------------------------------------- boot
  boot(scr) {
    scr.append(
      h('div', { class: 'logo big' }, h('span', { class: 'l1' }, 'STUNT'), h('span', { class: 'l2' }, 'RIDER'), h('span', { class: 'l3' }, '3D')),
      h('p', { class: 'tagline' }, 'OPEN WORLD MOTORCYCLE STUNTS'),
      h('div', { class: 'press' }, 'CLICK OR PRESS ANY KEY'),
    );
  }

  // ---------------------------------------------------------------- main
  main(scr) {
    const d = this.profile.data;
    const bike = bikeById(d.selectedBike);
    scr.append(
      h(
        'div',
        { class: 'main-left' },
        h('div', { class: 'logo' }, h('span', { class: 'l1' }, 'STUNT'), h('span', { class: 'l2' }, 'RIDER'), h('span', { class: 'l3' }, '3D')),
        h(
          'nav',
          { class: 'main-nav' },
          this.btn('PLAY', () => this.show('modes'), 'primary xl'),
          this.btn('📅 DAILY CHALLENGE', () => this.startDaily()),
          this.btn('GARAGE', () => this.show('garage')),
          this.btn('SETTINGS', () => this.show('settings')),
          this.btn('CONTROLS', () => this.show('controls')),
        ),
        h(
          'div',
          { class: 'main-stats' },
          h('div', {}, h('b', {}, formatPoints(d.points)), h('span', {}, 'POINTS')),
          h('div', {}, h('b', {}, `${Object.keys(d.unlocked).length}/${BIKES.length}`), h('span', {}, 'BIKES')),
          h('div', {}, h('b', {}, `${d.stars.length}/${this.game.stars.count}`), h('span', {}, 'STARS')),
          h('div', {}, h('b', {}, `${Object.keys(d.challenges).length}/${CHALLENGES.length}`), h('span', {}, 'CHALLENGES')),
        ),
        h('div', { class: 'main-bike' }, 'Riding: ', h('b', {}, bike.name), ' • ', bike.type),
      ),
    );
  }

  // ---------------------------------------------------------------- modes
  modes(scr) {
    this.header(scr, 'SELECT MODE', 'Pick how you want to ride');
    const best = this.profile.data.best;
    const stat = {
      free: `${this.profile.data.stars.length}/${this.game.stars.count} stars found`,
      daily: `Today: ${this.game.world.spawns[dailySpot()].name}`,
      stunt: `High score ${formatPoints(best.stunt)}`,
      trial: `${Object.keys(best.medals).length}/${COURSES.length} medals`,
      challenge: `${Object.keys(this.profile.data.challenges).length}/${CHALLENGES.length} completed`,
      ramp: `Record ${best.rampJump.toFixed(1)} m`,
    };
    const grid = h('div', { class: 'mode-grid' });
    for (const m of MODE_INFO) {
      grid.append(
        h(
          'button',
          {
            class: 'card mode-card',
            onclick: () => {
              this.click();
              if (m.id === 'trial') this.show('courses');
              else if (m.id === 'challenge') this.show('challenges');
              else {
                this.pending = { mode: m.id, opts: {} };
                this.show('bikes');
              }
            },
          },
          h('div', { class: 'mc-icon' }, m.icon),
          h('h3', {}, m.name.toUpperCase()),
          h('p', {}, m.desc),
          h('div', { class: 'mc-stat' }, stat[m.id]),
        ),
      );
    }
    scr.append(grid);
  }

  courses(scr) {
    this.header(scr, 'TIME TRIAL', 'Choose a course - beat the gold time for the biggest reward');
    const list = h('div', { class: 'list' });
    for (const c of COURSES) {
      const m = medalTimes(this.game.world, c);
      const best = this.profile.data.best.timeTrial[c.id];
      const medal = this.profile.data.best.medals[c.id];
      list.append(
        h(
          'button',
          {
            class: 'card row-card',
            onclick: () => {
              this.click();
              this.pending = { mode: 'trial', opts: { course: c.id } };
              this.show('bikes');
            },
          },
          h('div', { class: 'rc-medal' }, medal ? MEDAL_ICON[medal] : '🏁'),
          h('div', { class: 'rc-main' }, h('h3', {}, c.name.toUpperCase()), h('p', {}, c.desc), h('small', {}, c.zone)),
          h('div', { class: 'rc-side' }, h('div', {}, 'BEST ', h('b', {}, best ? formatTime(best) : '--')), h('div', { class: 'medal-times' }, `🥇 ${formatTime(m.gold)}  🥈 ${formatTime(m.silver)}  🥉 ${formatTime(m.bronze)}`)),
        ),
      );
    }
    scr.append(list);
  }

  challenges(scr) {
    const done = this.profile.data.challenges;
    this.header(scr, 'CHALLENGES', `${Object.keys(done).length} of ${CHALLENGES.length} completed`);
    const grid = h('div', { class: 'chal-grid' });
    for (const c of CHALLENGES) {
      grid.append(
        h(
          'button',
          {
            class: 'card chal-card' + (done[c.id] ? ' done' : ''),
            onclick: () => {
              this.click();
              this.pending = { mode: 'challenge', opts: { challenge: c.id } };
              this.show('bikes');
            },
          },
          h('div', { class: 'cc-top' }, h('h3', {}, c.name.toUpperCase()), h('span', { class: 'cc-check' }, done[c.id] ? '✔' : '')),
          h('p', {}, c.desc),
          h('div', { class: 'cc-foot' }, h('span', {}, `⏱ ${c.time}s`), h('b', {}, done[c.id] ? 'Done' : '+' + formatPoints(c.reward))),
        ),
      );
    }
    scr.append(grid);
  }

  // ---------------------------------------------------------------- bikes
  bikeList(onPick) {
    const d = this.profile.data;
    const list = h('div', { class: 'bike-list' });
    for (const b of BIKES) {
      const owned = !!d.unlocked[b.id];
      list.append(
        h(
          'button',
          { class: 'card bike-item' + (b.id === this.selBike ? ' sel' : '') + (owned ? '' : ' locked'), onclick: () => (this.click(), onPick(b)) },
          h('div', { class: 'bi-name' }, b.name),
          h('div', { class: 'bi-type' }, b.type.toUpperCase()),
          h('div', { class: 'bi-price' }, owned ? (d.selectedBike === b.id ? 'SELECTED' : 'OWNED') : '🔒 ' + formatPoints(b.price)),
        ),
      );
    }
    return list;
  }

  statBlock(spec, up) {
    const eff = effectiveSpec(spec, up);
    const base = statBars(spec);
    const bars = statBars(eff);
    const box = h('div', { class: 'stats' });
    for (const k of Object.keys(bars)) {
      box.append(h('div', { class: 'stat' }, h('span', {}, k.toUpperCase()), h('div', { class: 'bar' }, h('i', { style: `width:${base[k] * 10}%` }), h('em', { style: `width:${Math.max(0, bars[k] - base[k]) * 10}%;left:${base[k] * 10}%` }))));
    }
    box.append(h('div', { class: 'stat-num' }, `Top speed ${Math.round(eff.topSpeed * 3.6)} km/h  •  ${spec.gears}-speed`));
    return box;
  }

  unlockButton(b, after) {
    const d = this.profile.data;
    const can = d.points >= b.price;
    return h(
      'button',
      {
        class: 'btn primary' + (can ? '' : ' disabled'),
        onclick: () => {
          if (!can) return this.game.audio.play('error');
          this.profile.spend(b.price);
          d.unlocked[b.id] = true;
          d.selectedBike = b.id;
          this.profile.save();
          this.game.audio.play('unlock');
          after();
        },
      },
      can ? `UNLOCK ${formatPoints(b.price)}` : `NEED ${formatPoints(b.price - d.points)} MORE`,
    );
  }

  bikes(scr) {
    const d = this.profile.data;
    const pend = this.pending || { mode: 'free', opts: {} };
    const mi = MODE_INFO.find((m) => m.id === pend.mode);
    this.header(scr, 'CHOOSE YOUR BIKE', mi ? mi.name : '');
    const b = bikeById(this.selBike);
    const owned = !!d.unlocked[b.id];
    const up = this.profile.upgrades(b.id);
    const left = h('div', { class: 'side-col' }, this.bikeList((nb) => ((this.selBike = nb.id), this.show('bikes', null, false))));
    const right = h(
      'div',
      { class: 'side-col right' },
      h('div', { class: 'bike-title' }, h('h2', {}, b.name), h('span', {}, b.type.toUpperCase())),
      h('p', { class: 'bike-desc' }, b.desc),
      this.statBlock(b, up),
      owned
        ? h('div', { class: 'swatches' }, ...PAINTS.map((c, i) => h('button', { class: 'sw' + (this.profile.paint(b.id) === i ? ' sel' : ''), style: `background:${c}`, title: PAINT_NAMES[i], onclick: () => ((d.paint[b.id] = i), this.profile.save(), this.click(), this.show('bikes', null, false)) })))
        : null,
      h(
        'div',
        { class: 'actions' },
        owned
          ? this.btn('RIDE ›', () => {
              d.selectedBike = b.id;
              this.profile.save();
              this.game.startMode(pend.mode, pend.opts);
            }, 'primary xl')
          : this.unlockButton(b, () => this.show('bikes', null, false)),
        owned ? this.btn('GARAGE', () => this.show('garage')) : null,
      ),
    );
    scr.append(h('div', { class: 'split' }, left, h('div', { class: 'stage-hint' }, 'Drag to rotate'), right));
    this.game.studioShow(b, owned);
  }

  garage(scr) {
    const d = this.profile.data;
    this.header(scr, 'GARAGE', 'Unlock bikes, paint them and buy upgrades');
    const b = bikeById(this.selBike);
    const owned = !!d.unlocked[b.id];
    const up = this.profile.upgrades(b.id);
    const left = h('div', { class: 'side-col' }, this.bikeList((nb) => ((this.selBike = nb.id), this.show('garage', null, false))));
    const tabs = h('div', { class: 'tabs' });
    for (const [id, label] of [
      ['paint', 'PAINT'],
      ['rider', 'RIDER'],
      ['upgrades', 'UPGRADES'],
    ]) {
      tabs.append(h('button', { class: 'tab' + (this.garageTab === id ? ' sel' : ''), onclick: () => ((this.garageTab = id), this.click(), this.show('garage', null, false)) }, label));
    }
    let body;
    if (!owned) {
      body = h('div', { class: 'locked-box' }, h('p', {}, 'This bike is locked. Earn points by landing tricks, completing challenges and winning medals.'), this.unlockButton(b, () => this.show('garage', null, false)));
    } else if (this.garageTab === 'paint') {
      body = h('div', { class: 'swatch-grid' }, ...PAINTS.map((c, i) => h('button', { class: 'sw-big' + (this.profile.paint(b.id) === i ? ' sel' : ''), onclick: () => ((d.paint[b.id] = i), this.profile.save(), this.click(), this.show('garage', null, false)) }, h('i', { style: `background:${c}` }), PAINT_NAMES[i])));
    } else if (this.garageTab === 'rider') {
      body = h('div', { class: 'swatch-grid' }, ...SUITS.map((c, i) => h('button', { class: 'sw-big' + (d.suit === i ? ' sel' : ''), onclick: () => ((d.suit = i), this.profile.save(), this.click(), this.show('garage', null, false)) }, h('i', { style: `background:${c}` }), SUIT_NAMES[i] + ' suit')));
    } else {
      body = h('div', { class: 'upgrades' });
      for (const u of UPGRADES) {
        const lvl = up[u.id];
        const cost = u.costs[lvl];
        const can = cost !== undefined && d.points >= cost;
        body.append(
          h(
            'div',
            { class: 'upg' },
            h('div', { class: 'upg-info' }, h('h4', {}, u.name.toUpperCase()), h('p', {}, u.desc), h('div', { class: 'pips' }, ...[0, 1, 2].map((k) => h('i', { class: k < lvl ? 'on' : '' })))),
            cost === undefined
              ? h('span', { class: 'maxed' }, 'MAX')
              : h(
                  'button',
                  {
                    class: 'btn small' + (can ? ' primary' : ' disabled'),
                    onclick: () => {
                      if (!can) return this.game.audio.play('error');
                      this.profile.spend(cost);
                      up[u.id]++;
                      this.profile.save();
                      this.game.audio.play('unlock');
                      this.show('garage', null, false);
                    },
                  },
                  formatPoints(cost),
                ),
          ),
        );
      }
    }
    const right = h(
      'div',
      { class: 'side-col right' },
      h('div', { class: 'bike-title' }, h('h2', {}, b.name), h('span', {}, b.type.toUpperCase())),
      this.statBlock(b, up),
      tabs,
      body,
      owned && d.selectedBike !== b.id ? h('div', { class: 'actions' }, this.btn('SELECT THIS BIKE', () => ((d.selectedBike = b.id), this.profile.save(), this.show('garage', null, false)), 'primary')) : null,
    );
    scr.append(h('div', { class: 'split' }, left, h('div', { class: 'stage-hint' }, 'Drag to rotate'), right));
    this.game.studioShow(b, owned);
  }

  // ---------------------------------------------------------------- settings
  settings(scr) {
    const s = this.profile.settings;
    this.header(scr, 'SETTINGS');
    const apply = () => {
      this.profile.save();
      this.game.applySettings();
    };
    const seg = (key, options) =>
      h(
        'div',
        { class: 'seg' },
        ...options.map(([v, label]) => h('button', { class: s[key] === v ? 'sel' : '', onclick: () => ((s[key] = v), apply(), this.click(), this.show('settings', null, false)) }, label)),
      );
    const slider = (key, min, max, step, fmt) => {
      const val = h('output', {}, fmt(s[key]));
      const inp = h('input', { type: 'range', min, max, step, value: s[key] });
      inp.addEventListener('input', () => {
        s[key] = +inp.value;
        val.textContent = fmt(s[key]);
        apply();
      });
      return h('div', { class: 'slider' }, inp, val);
    };
    const pct = (v) => Math.round(v * 100) + '%';
    const row = (label, ctrl) => h('div', { class: 'set-row' }, h('label', {}, label), ctrl);
    scr.append(
      h(
        'div',
        { class: 'settings' },
        h(
          'div',
          { class: 'set-col' },
          h('h4', {}, 'GRAPHICS'),
          row('Quality', seg('quality', [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']])),
          row('Shadows', seg('shadows', [[true, 'ON'], [false, 'OFF']])),
          row('View distance', slider('drawDistance', 400, 1500, 50, (v) => v + ' m')),
          row('Field of view', slider('fov', 55, 95, 1, (v) => v + '°')),
          row('Default camera', seg('camera', CAM_NAMES.map((n, i) => [i, n.replace(' Cam', '').toUpperCase()]))),
          row('Minimap', seg('minimap', [[true, 'ON'], [false, 'OFF']])),
        ),
        h(
          'div',
          { class: 'set-col' },
          h('h4', {}, 'AUDIO'),
          row('Master volume', slider('master', 0, 1, 0.05, pct)),
          row('Music volume', slider('music', 0, 1, 0.05, pct)),
          row('Effects volume', slider('sfx', 0, 1, 0.05, pct)),
          row('Music while riding', seg('gameMusic', [[true, 'ON'], [false, 'OFF']])),
          h('h4', {}, 'GAMEPLAY'),
          row('Speed units', seg('units', [['kmh', 'KM/H'], ['mph', 'MPH']])),
          row('Traffic', seg('traffic', [[true, 'ON'], [false, 'OFF']])),
          row('Invert mouse Y', seg('invertY', [[false, 'OFF'], [true, 'ON']])),
          row(
            'Progress',
            this.btn('RESET PROGRESS', (e) => {
              const b = e.currentTarget;
              if (b.dataset.armed) {
                this.profile.reset();
                this.selBike = 'mx';
                this.game.stars.setCollected([]);
                this.game.applySettings();
                this.show('settings', null, false);
              } else {
                b.dataset.armed = '1';
                b.textContent = 'CLICK AGAIN TO CONFIRM';
                b.classList.add('danger');
              }
            }, 'small'),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- controls
  controls(scr) {
    this.header(scr, 'CONTROLS & TRICKS');
    const keys = [
      ['W / ↑', 'Accelerate', 'In the air: lean forward (frontflip). Release and press again after take-off.'],
      ['S / ↓', 'Brake / reverse', 'In the air: lean back (backflip)'],
      ['A D / ← →', 'Steer', 'In the air: spin left / right (360s)'],
      ['SPACE', 'Tap: bunny hop', 'Hold: wheelie  •  Hold + S at speed: stoppie'],
      ['SHIFT', 'Boost', 'Refills when you bank tricks'],
      ['E', 'Trick (hold in the air)', 'Release before you land!'],
      ['R', 'Reset motorcycle', ''],
      ['C', 'Change camera', 'Chase • First person • Cinematic • Side'],
      ['MOUSE', 'Drag: look around', 'Wheel: zoom'],
      ['ESC / P', 'Pause', 'M: map & teleport in Free Ride'],
    ];
    const tbl = h('div', { class: 'keys' }, ...keys.map(([k, a, b]) => h('div', { class: 'key-row' }, h('kbd', {}, k), h('div', {}, h('b', {}, a), b ? h('small', {}, b) : null))));
    const tricks = h(
      'div',
      { class: 'trick-list' },
      h('h4', {}, 'STYLE TRICKS (IN THE AIR)'),
      ...Object.entries(STYLE).map(([id, t], i) => h('div', { class: 'trick-row' }, h('kbd', {}, t.key), h('span', {}, t.name), h('small', {}, `or key ${i + 1}  •  ${t.base}+ pts`))),
      h('h4', {}, 'SCORING'),
      h(
        'ul',
        {},
        h('li', {}, 'Flips, spins and style tricks in one jump combine: Superman Backflip!'),
        h('li', {}, 'Every trick adds to the combo multiplier. Land the next jump within 1.7 s, or hold a wheelie, to keep the combo alive.'),
        h('li', {}, 'Landing quality: PERFECT ×1.5, GOOD ×1.15, SKETCHY ×0.7. Crashing loses the whole combo.'),
        h('li', {}, 'Clean landings in a row build a STREAK bonus of up to ×2.'),
        h('li', {}, 'Named gaps (Bus Jump, Rooftop Leap, Lake Jump...) give big bonuses.'),
        h('li', {}, 'Repeating the same trick in one combo is worth less - mix it up!'),
      ),
    );
    scr.append(h('div', { class: 'controls' }, tbl, tricks));
  }

  // ---------------------------------------------------------------- pause
  pause(scr) {
    const g = this.game;
    const free = g.modeId === 'free';
    scr.append(
      h(
        'div',
        { class: 'pause-box' },
        h('h2', {}, 'PAUSED'),
        h('p', { class: 'pause-mode' }, g.mode ? g.mode.panel().title : ''),
        this.btn('RESUME', () => g.resume(), 'primary'),
        this.btn('RESTART', () => g.restartMode()),
        free ? this.btn('MAP & TELEPORT', () => this.show('map')) : this.btn('MAP', () => this.show('map')),
        this.btn('SETTINGS', () => this.show('settings')),
        this.btn('CONTROLS', () => this.show('controls')),
        this.btn('QUIT TO MENU', () => g.quitToMenu(), 'ghost'),
      ),
    );
  }

  // ---------------------------------------------------------------- map
  map(scr) {
    const g = this.game;
    const free = g.modeId === 'free';
    this.header(scr, 'MAP', free ? 'Click a location to teleport there' : 'Overview');
    const W = 640;
    const cv = h('canvas', { width: W, height: W, class: 'big-map' });
    const c = cv.getContext('2d');
    const world = g.world;
    c.drawImage(world.minimapCanvas, 0, 0, W, W);
    const s = W / 2400;
    const X = (x) => (x + 1200) * s;
    c.font = 'bold 13px Arial';
    c.textAlign = 'center';
    for (const l of world.landmarks) {
      if (!l.label) continue;
      c.fillStyle = 'rgba(0,0,0,0.6)';
      const tw = c.measureText(l.label).width + 8;
      c.fillRect(X(l.x) - tw / 2, X(l.z) - 9, tw, 16);
      c.fillStyle = '#ffb066';
      c.fillText(l.label, X(l.x), X(l.z) + 4);
    }
    c.fillStyle = '#ffd34d';
    for (const st of g.stars.items) if (!st.taken) c.fillRect(X(st.p.x) - 3, X(st.p.z) - 3, 6, 6);
    const P = g.bike.physics;
    const pos = P.mode === 'crash' ? P.cb.pos : P.root;
    c.save();
    c.translate(X(pos.x), X(pos.z));
    c.rotate(Math.PI - P.heading);
    c.fillStyle = '#fff';
    c.strokeStyle = '#ff2a2a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(7, 7);
    c.lineTo(-7, 7);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    const side = h('div', { class: 'tp-list' });
    if (free) {
      for (const [k, sp] of Object.entries(world.spawns)) side.append(this.btn(sp.name.toUpperCase(), () => g.teleport(k), 'small'));
    } else side.append(h('p', {}, 'Teleporting is available in Free Ride.'));
    scr.append(h('div', { class: 'map-wrap' }, cv, side));
  }

  startDaily() {
    this.pending = { mode: 'daily', opts: {} };
    this.stack = ['main', 'modes'];
    this.show('bikes', null, false);
  }

  // ---------------------------------------------------------------- results
  results(scr, r) {
    const g = this.game;
    scr.append(
      h(
        'div',
        { class: 'results' + (r.medal ? ' medal-' + r.medal : '') },
        h('h2', {}, r.title),
        r.medal ? h('div', { class: 'medal-big' }, MEDAL_ICON[r.medal]) : null,
        h('div', { class: 'res-big' }, r.big),
        h('div', { class: 'res-label' }, r.bigLabel || ''),
        h('div', { class: 'res-rows' }, ...(r.rows || []).map(([a, b]) => h('div', { class: 'res-row' }, h('span', {}, a), h('b', {}, String(b))))),
        h('div', { class: 'res-earned' }, 'POINTS EARNED ', h('b', {}, '+' + formatPoints(r.earned || 0))),
        r.share && globalThis.EOJ ? globalThis.EOJ.resultPanel(r.share) : null,
        h(
          'div',
          { class: 'actions' },
          this.btn('RETRY', () => g.restartMode(), 'primary'),
          g.modeId === 'challenge' ? this.btn('CHALLENGES', () => ((this.stack = ['main', 'modes']), this.show('challenges', null, false))) : null,
          g.modeId === 'trial' ? this.btn('COURSES', () => ((this.stack = ['main', 'modes']), this.show('courses', null, false))) : null,
          this.btn('MAIN MENU', () => g.quitToMenu(), 'ghost'),
        ),
      ),
    );
  }
}

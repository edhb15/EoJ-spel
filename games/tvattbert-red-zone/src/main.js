// Bootstrap: settings, menus and the Game instance.
import { Game } from './game/game.js';
import { registerSystems } from './game/systems.js';

const $ = id => document.getElementById(id);
const SETTINGS_KEY = 'tvattbert.settings';
const settings = Object.assign({ dayLength: 24, sensitivity: 1, quality: 'medium', volume: 0.8 },
  safeJSON(() => localStorage.getItem(SETTINGS_KEY)));
const params = new URLSearchParams(location.search);
if (params.get('quality')) settings.quality = params.get('quality');

function safeJSON(fn) { try { return JSON.parse(fn()) || {}; } catch { return {}; } }
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } }

$('set-daylen').value = String(settings.dayLength);
$('set-sens').value = settings.sensitivity;
$('set-quality').value = settings.quality;
$('set-vol').value = settings.volume;

const game = new Game(settings);
window.__game = game;
registerSystems(game);

const show = (id, v) => $(id).classList.toggle('hidden', !v);
function menuView(view) {
  show('menu-buttons', view === 'main'); show('settings', view === 'settings'); show('controls', view === 'controls');
}

game.init((f, text) => {
  $('load-bar').firstElementChild.style.width = `${Math.round(f * 100)}%`;
  $('load-text').textContent = text;
}).then(() => {
  show('loading', false); menuView('main');
  game.input.onUnlock = () => { if (game.state === 'playing' && !game.uiOpen && !game.input.dragLook) pause(); };
  document.addEventListener('pointerlockerror', () => {
    if (game.state === 'playing' && !game._lockHint) { game._lockHint = true; game.hud.message('Muslåset är inte tillgängligt här – håll in en musknapp och dra för att titta runt.', 'warn'); }
  });
  show('btn-continue', game.saves && game.saves.has());
}).catch(err => {
  console.error(err);
  $('load-text').textContent = `Fel vid laddning: ${err.message}`;
});

function startGame(load) {
  show('menu', false); show('gameover', false); show('pause', false);
  game.hud.show(true);
  if (game.audio) game.audio.resume();
  game.start(load);
}
$('btn-new').onclick = () => startGame(false);
$('btn-continue').onclick = () => startGame(true);
$('btn-settings').onclick = () => menuView('settings');
$('btn-controls').onclick = () => menuView('controls');
$('btn-settings-back').onclick = () => {
  settings.dayLength = Number($('set-daylen').value);
  settings.sensitivity = Number($('set-sens').value);
  settings.volume = Number($('set-vol').value);
  const q = $('set-quality').value; const reload = q !== settings.quality; settings.quality = q;
  saveSettings();
  if (game.time) game.time.setDayLength(settings.dayLength);
  if (game.input) game.input.sensitivity = settings.sensitivity;
  if (game.audio) game.audio.setVolume(settings.volume);
  if (reload) location.reload(); else menuView('main');
};
$('btn-controls-back').onclick = () => menuView('main');

function pause() {
  if (game.state !== 'playing') return;
  game.state = 'paused'; game.input.enabled = false; game.input.unlock();
  show('pause', true);
  const inf = game.infection && game.infection.active;
  show('pause-inf', inf);
  if (inf) $('pause-inf').textContent = 'Du är infekterad – nedräkningen fortsätter i verklig tid!';
  if (game.audio) game.audio.duck(true);
}
function resume() {
  show('pause', false); game.state = 'playing'; game.input.enabled = true; game.input.lock();
  if (game.audio) game.audio.duck(false);
}
game.pause = pause;
addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    if (game.uiOpen) { game.closeUI && game.closeUI(); return; }
    if (game.state === 'playing') pause(); else if (game.state === 'paused') resume();
  }
});
$('btn-resume').onclick = resume;
$('btn-save').onclick = () => { if (game.saves) { game.saves.save(); $('btn-save').textContent = 'SPARAT ✓'; setTimeout(() => ($('btn-save').textContent = 'SPARA'), 1500); } };
$('btn-quit').onclick = () => { if (game.saves) game.saves.save(); location.reload(); };
$('btn-restart').onclick = () => { if (game.saves) game.saves.clear(); location.reload(); };
$('btn-load').onclick = () => { // continue from the last save without reloading the page
  game.turned = false; game.post.uniforms.uZombie.value = 0; game.post.uniforms.uFade.value = 0; game.fadeOverride = 0;
  startGame(true);
};
if (params.get('continue')) {
  const wait = setInterval(() => { if (game.state === 'menu') { clearInterval(wait); startGame(true); } }, 200);
}

// Entry point: build the world, then hand over to the game.
import * as THREE from 'three';
import { World } from './world/world.js';
import { Game } from './game.js';
import { Profile } from './core/save.js';
import { Input } from './core/input.js';
import { AudioEngine } from './audio/audio.js';

const loading = document.getElementById('loading');
const bar = document.getElementById('ld-fill');
const label = document.getElementById('ld-text');

async function main() {
  if (!window.WebGL2RenderingContext) {
    label.textContent = 'Your browser does not support WebGL 2, which this game needs.';
    return;
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.setSize(innerWidth, innerHeight);
  document.getElementById('app').prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 5000);
  const profile = new Profile();
  // phones and tablets start on lighter graphics settings
  if (profile.firstRun && matchMedia('(pointer: coarse)').matches) {
    profile.settings.quality = 'low';
    profile.settings.drawDistance = 650;
  }
  const world = new World(renderer, scene);
  await world.build((f, text) => {
    bar.style.width = Math.round(f * 100) + '%';
    if (text) label.textContent = text + '…';
  });
  const input = new Input(renderer.domElement);
  input.bindTouch(document.getElementById('touch'));
  const audio = new AudioEngine();
  const game = new Game({
    renderer,
    scene,
    camera,
    world,
    profile,
    audio,
    input,
    hudRoot: document.getElementById('hud'),
    uiRoot: document.getElementById('ui'),
    touchRoot: document.getElementById('touch'),
  });
  window.__game = game;
  game.rig.flyover(0, 0);
  renderer.compile(scene, camera);
  loading.classList.add('hidden');
  game.ui.show('boot', null, false);
  const start = (e) => {
    if (game.state !== 'boot') return;
    if (e && e.type === 'keydown' && (e.ctrlKey || e.metaKey)) return;
    game.start();
  };
  addEventListener('keydown', start);
  addEventListener('pointerdown', start);
  window.__shotReady = true;
}

main().catch((e) => {
  console.error(e);
  label.textContent = 'Something went wrong: ' + e.message;
});

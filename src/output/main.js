// /output: the fullscreen render. Nothing but the picture is ever drawn here;
// all status goes to /control over the bus.

import { createBus } from '../shared/bus.js';
import { enableOffline } from '../shared/offline.js';
import { installKeys } from '../shared/keys.js';
import { Store } from '../shared/store.js';
import { readJSON } from '../shared/util.js';
import { Engine } from '../engine/engine.js';

const canvas = document.getElementById('stage');
const hint = document.getElementById('hint');

const bus = createBus();
const store = new Store(bus);
const engine = new Engine(canvas, store, bus);
engine.start();

// Debug / test handle.
window.thirdEye = { engine, store, bus };

async function targetScreen() {
  // With Window Management permission the fullscreen request can name the
  // display chosen in /control, wherever this window currently sits.
  try {
    if (!('getScreenDetails' in window)) return null;
    const perm = await navigator.permissions.query({ name: 'window-management' });
    if (perm.state !== 'granted') return null;
    const want = readJSON('thirdeye.screen', null);
    if (!want) return null;
    const details = await window.getScreenDetails();
    return (
      details.screens.find((s) => s.label === want.label && s.left === want.left && s.top === want.top) ??
      details.screens.find((s) => s.label === want.label) ??
      null
    );
  } catch {
    return null;
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    const screen = await targetScreen();
    await document.documentElement.requestFullscreen(screen ? { screen, navigationUI: 'hide' } : { navigationUI: 'hide' });
  } catch (err) {
    console.warn('[output] fullscreen failed', err);
  }
}

installKeys(store, { f: toggleFullscreen });
canvas.addEventListener('dblclick', toggleFullscreen);
canvas.addEventListener('click', () => {
  if (!document.fullscreenElement) toggleFullscreen();
});
bus.on('output', (m) => {
  if (m.cmd === 'reload') location.reload();
  if (m.cmd === 'close') {
    // Let go of the room code at once, then go away. A window the user
    // opened by hand cannot close itself, so it is blanked instead.
    engine.link.shutdown();
    window.close();
    setTimeout(() => location.replace('about:blank'), 150);
  }
});

// The hint is the only UI: it fades by itself and never shows in fullscreen.
let hintTimer = 0;
function showHint() {
  clearTimeout(hintTimer);
  if (document.fullscreenElement) {
    hint.classList.add('hidden');
    return;
  }
  hint.classList.remove('hidden');
  hintTimer = setTimeout(() => hint.classList.add('hidden'), 4000);
}
document.addEventListener('fullscreenchange', showHint);
showHint();

let idleTimer = 0;
window.addEventListener('mousemove', () => {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 1500);
});

enableOffline();

// /output: the fullscreen render, for a projector or second screen. While it
// is open it hosts the engine. Nothing but the picture is ever drawn here;
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

// One engine runs per browser, and an output window is where it belongs
// while one is open (see src/control/host.js). Starting up, this window asks:
//  - another output window is already running: it answers output-pong and
//    this one stands by instead (two would fight over the room code and the
//    phone would end up talking to the wrong one);
//  - /control hosts the engine: it stops its own, which frees the room code,
//    and answers engine-released;
//  - nobody answers: start.
const id = Math.random().toString(36).slice(2, 10);
const alreadyRunning = await new Promise((resolve) => {
  bus.on('output-pong', () => resolve(true));
  bus.on('engine-released', () => resolve(false));
  bus.send('output-ping');
  setTimeout(() => resolve(false), 400);
});
if (alreadyRunning) {
  document.getElementById('standby').hidden = false;
  hint.hidden = true;
  bus.on('output', (m) => {
    if (m.cmd !== 'close') return;
    window.close();
    setTimeout(() => location.replace('about:blank'), 150);
  });
  window.thirdEye = { standby: true };
  await new Promise(() => {}); // nothing below runs in a standby window
}
bus.on('output-ping', () => bus.send('output-pong'));
bus.on('engine-who', () => bus.send('engine-here', { host: { role: 'output', id } }));

const store = new Store(bus);
const engine = new Engine(canvas, store, bus, { role: 'output', id });
engine.start();

// Going away (closed, reloaded, navigated): let go of the room code at once
// and say so, so /control takes the picture back without waiting to notice.
let gone = false;
function leave(reload = false) {
  if (gone) return;
  gone = true;
  engine.stop();
  bus.send('engine-gone', { host: { role: 'output', id }, reload });
}
window.addEventListener('pagehide', () => leave());
// A page brought back from the back/forward cache has a stopped engine.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

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
  if (m.cmd === 'reload') {
    // Tells /control this window is coming straight back, so it waits
    // rather than starting its own engine in between.
    leave(true);
    location.reload();
  }
  if (m.cmd === 'close') {
    // Let go of the room code at once, then go away. A window the user
    // opened by hand cannot close itself, so it is blanked instead.
    leave();
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

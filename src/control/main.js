// /control: the operator's page. It edits the shared state and shows what
// /output reports back; it never touches video itself, so reloading it
// mid-show is harmless.
//
// Three screens: Perform (the show), Edit (one preset), Setup (everything
// you do once before the show).

import { PALETTES, applyDim, applyPalette, currentDim, restorePalette } from '../shared/palette.js';
import { DIM_MIN } from '../shared/look.js';
import './control.css';
import { createBus } from '../shared/bus.js';
import { installKeys } from '../shared/keys.js';
import { enableOffline } from '../shared/offline.js';
import { applyPreset } from '../shared/presets.js';
import { Store } from '../shared/store.js';
import { el, readJSON, writeJSON } from '../shared/util.js';
import { mountChain } from './chain.js';
import { mountEdit } from './edit.js';
import { mountInputPanel } from './input-panel.js';
import { mountIoPanel } from './io-panel.js';
import { mountLibraryPanel } from './library-panel.js';
import { installMidiMap } from './midi-map.js';
import { mountModPanel } from './mod-panel.js';
import { mountOutputPanel } from './output-panel.js';
import { mountPerform } from './perform.js';
import { mountPhonePanel } from './phone-panel.js';
import { createPresetModel } from './preset-model.js';
import { mountRecordPanel } from './record-panel.js';
import { mountShortcuts } from './shortcuts.js';
import { mountStatus } from './status.js';
import { mountVisionPanel } from './vision-panel.js';

restorePalette();

const bus = createBus();
const store = new Store(bus);
const views = {
  perform: document.getElementById('view-perform'),
  edit: document.getElementById('view-edit'),
  setup: document.getElementById('view-setup'),
};

// Shared context handed to every panel.
const ui = {
  bus,
  store,
  view: 'perform',
  status: null,
  statusAt: -Infinity,
  statusListeners: new Set(),
  viewListeners: new Set(),
  paletteListeners: new Set(),
  onStatus(fn) {
    this.statusListeners.add(fn);
  },
  onView(fn) {
    this.viewListeners.add(fn);
  },
  onPalette(fn) {
    this.paletteListeners.add(fn);
  },
  get outputAlive() {
    return performance.now() - this.statusAt < 1500;
  },
  setView(name) {
    if (!views[name]) return;
    this.view = name;
    for (const [key, node] of Object.entries(views)) node.hidden = key !== name;
    for (const b of document.querySelectorAll('#views button')) b.setAttribute('aria-pressed', String(b.dataset.view === name));
    for (const fn of this.viewListeners) fn(name);
    this.midiMap?.refresh();
  },
  // Opens the edit screen on a preset, loading it first if it is not live.
  editPreset(index) {
    if (this.presets.list[index] && this.presets.current !== index) applyPreset(store, index, 0);
    this.setView('edit');
  },
};
ui.presets = createPresetModel(ui);

bus.on('status', (m) => {
  ui.status = m.status;
  ui.statusAt = performance.now();
  for (const fn of ui.statusListeners) fn(ui.status);
});
// Tell /output someone is watching, so it sends the monitor and the meters.
bus.send('control-alive');
bus.on('hello', () => bus.send('control-alive'));
// Keep panels ticking so they notice when /output goes away.
setInterval(() => {
  bus.send('control-alive');
  if (!ui.outputAlive) for (const fn of ui.statusListeners) fn(null);
}, 1000);

installMidiMap(ui);

// Setup: three columns of panels.
const column = () => views.setup.appendChild(el('div', { class: 'col' }));
const [setupA, setupB, setupC] = [column(), column(), column()];
mountOutputPanel(setupA, ui);
mountInputPanel(setupA, ui);
mountStatus(setupA, ui);
mountPhonePanel(setupB, ui);
mountIoPanel(setupB, ui);
mountVisionPanel(setupB, ui);

mountEdit(views.edit, ui);
mountChain(ui.editCols.chain, ui);
mountModPanel({ edit: ui.editCols.side, setup: setupC }, ui);
mountLibraryPanel(setupC, ui);
mountRecordPanel(setupC, ui);
mountShortcuts(setupC, ui);
ui.refreshSlots();

mountPerform(views.perform, ui);

// Screen switching.
for (const b of document.querySelectorAll('#views button')) b.addEventListener('click', () => ui.setView(b.dataset.view));
ui.setView('perform');

// Palette: one dot in the top bar; clicking it opens the choices.
const paletteHost = document.getElementById('palette');
const paletteDot = el('button', { title: 'Colour palette', 'aria-label': 'Colour palette', 'aria-haspopup': 'menu' });
const paletteMenu = el('div', { id: 'palette-menu', role: 'menu', hidden: true });
paletteHost.append(paletteDot);
document.body.append(paletteMenu);
// Dimmer: a strip under the palettes that works as a sideways fader. Left
// end is 25 % of the light, right end full. Double-click for full.
const dimFill = el('div', { class: 'fill' });
const dimText = () => [el('span', { text: 'Dim' }), el('span', { class: 'value' })];
const dimBack = el('div', { class: 'label' }, dimText());
const dimFront = el('div', { class: 'label on' }, dimText());
const dimmer = el('div', {
  id: 'dimmer',
  role: 'slider',
  tabindex: '0',
  'aria-label': 'Dim the control page and the phone',
  'aria-valuemin': String(DIM_MIN),
  'aria-valuemax': '100',
  title: 'Drag to dim this page and the phone. Double-click for full brightness.',
}, [dimFill, dimBack, dimFront]);
function drawDim(dim) {
  const frac = `${((dim - DIM_MIN) / (100 - DIM_MIN)) * 100}%`;
  dimFill.style.width = frac;
  dimFront.style.clipPath = `inset(0 calc(100% - ${frac}) 0 0)`;
  for (const v of dimmer.querySelectorAll('.value')) v.textContent = `${dim}%`;
  dimmer.setAttribute('aria-valuenow', String(dim));
}
function setDim(value, done = false) {
  drawDim(applyDim(value));
  if (done) for (const fn of ui.paletteListeners) fn();
}
const dimAt = (e) => {
  const r = dimmer.getBoundingClientRect();
  return DIM_MIN + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (100 - DIM_MIN);
};
dimmer.addEventListener('pointerdown', (e) => {
  dimmer.setPointerCapture(e.pointerId);
  setDim(dimAt(e));
});
dimmer.addEventListener('pointermove', (e) => {
  if (dimmer.hasPointerCapture(e.pointerId)) setDim(dimAt(e));
});
dimmer.addEventListener('pointerup', (e) => setDim(dimAt(e), true));
dimmer.addEventListener('dblclick', () => setDim(100, true));
dimmer.addEventListener('keydown', (e) => {
  const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
  if (step) {
    e.preventDefault();
    setDim(currentDim() + step, true);
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    setDim(e.key === 'Home' ? DIM_MIN : 100, true);
  }
});
function drawPalette(active) {
  paletteMenu.replaceChildren(
    ...Object.entries(PALETTES).map(([key, p]) =>
      el('button', {
        role: 'menuitemradio',
        'aria-checked': String(key === active),
        'aria-label': `Palette: ${p.label}`,
        onclick: () => {
          drawPalette(applyPalette(key));
          paletteMenu.hidden = true;
          for (const fn of ui.paletteListeners) fn(key);
        },
      }, [el('i', { style: `background:${p.ink}` }), p.label]),
    ),
    dimmer,
  );
}
paletteDot.addEventListener('click', () => {
  const r = paletteDot.getBoundingClientRect();
  paletteMenu.style.top = `${r.bottom + 10}px`;
  paletteMenu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  paletteMenu.hidden = !paletteMenu.hidden;
});
document.addEventListener('pointerdown', (e) => {
  if (!paletteMenu.hidden && !paletteMenu.contains(e.target) && e.target !== paletteDot) paletteMenu.hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') paletteMenu.hidden = true;
});
drawPalette(restorePalette());
drawDim(currentDim());

installKeys(store, {
  e: () => ui.setView(ui.view === 'edit' ? 'perform' : 'edit'),
  m: () => ui.midiMap.toggle(),
});

// A focused button would swallow Space (freeze); drop focus after clicks.
document.addEventListener('click', (e) => {
  const button = e.target.closest?.('button');
  if (button) button.blur();
});

// Click a panel title to fold it; the choice is remembered.
const FOLD_KEY = 'thirdeye.folded';
const folded = new Set(readJSON(FOLD_KEY, ['lfo-panel', 'shortcuts', 'sources-panel']));
for (const id of folded) document.getElementById(id)?.classList.add('collapsed');
document.addEventListener('click', (e) => {
  const title = e.target.closest?.('.panel > h2');
  if (!title || e.target.closest('button')) return;
  const panel = title.parentElement;
  panel.classList.toggle('collapsed');
  if (!panel.id) return;
  if (panel.classList.contains('collapsed')) folded.add(panel.id);
  else folded.delete(panel.id);
  writeJSON(FOLD_KEY, [...folded]);
});

// Offline reload: say on the setup screen whether it is in place.
enableOffline(() => ui.setAlert?.('update', 'A newer version of the app has been downloaded. Reload this page, then use Restart output (Setup → Output).')).then((state) => {
  ui.offline = state;
  if (ui.statusRows?.offline) ui.statusRows.offline.textContent = state === 'ready' ? 'ready: pages reload without internet' : state;
});

window.thirdEye = { store, bus, ui };

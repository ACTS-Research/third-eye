// /control: the operator's page. It edits the shared state and shows what
// /output reports back; it never touches video itself, so reloading it
// mid-show is harmless.
//
// Three screens: Perform (the show), Edit (one preset), Setup (everything
// you do once before the show).

import { PALETTES, applyPalette, restorePalette } from '../shared/palette.js';
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

// Palette swatches.
const swatches = document.getElementById('palette');
function drawSwatches(active) {
  swatches.replaceChildren(
    ...Object.entries(PALETTES).map(([key, p]) =>
      el('button', {
        title: p.label,
        'aria-label': `Palette: ${p.label}`,
        'aria-pressed': String(key === active),
        style: `background:${p.ink}`,
        onclick: () => {
          drawSwatches(applyPalette(key));
          for (const fn of ui.paletteListeners) fn(key);
        },
      }),
    ),
  );
}
drawSwatches(restorePalette());

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
enableOffline().then((state) => {
  ui.offline = state;
  if (ui.statusRows?.offline) ui.statusRows.offline.textContent = state === 'ready' ? 'ready: pages reload without internet' : state;
});

window.thirdEye = { store, bus, ui };

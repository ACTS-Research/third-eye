// /control: the operator's page. It edits the shared state and shows what
// /output reports back; it never touches video itself, so reloading it
// mid-show is harmless.

import './control.css';
import { createBus } from '../shared/bus.js';
import { installKeys } from '../shared/keys.js';
import { Store } from '../shared/store.js';
import { readJSON, writeJSON } from '../shared/util.js';
import { mountChain } from './chain.js';
import { mountInputPanel } from './input-panel.js';
import { mountIoPanel } from './io-panel.js';
import { mountModPanel } from './mod-panel.js';
import { mountOutputPanel } from './output-panel.js';
import { mountPhonePanel } from './phone-panel.js';
import { mountPresetsPanel } from './presets-panel.js';
import { mountPreview } from './preview.js';
import { mountShortcuts } from './shortcuts.js';
import { mountStatus } from './status.js';

const bus = createBus();
const store = new Store(bus);

// Shared context handed to every panel.
const ui = {
  bus,
  store,
  status: null,
  statusAt: 0,
  statusListeners: new Set(),
  onStatus(fn) {
    this.statusListeners.add(fn);
  },
  get outputAlive() {
    return performance.now() - this.statusAt < 1500;
  },
};

bus.on('status', (m) => {
  ui.status = m.status;
  ui.statusAt = performance.now();
  for (const fn of ui.statusListeners) fn(ui.status);
});
// Keep panels ticking so they notice when /output goes away.
setInterval(() => {
  if (!ui.outputAlive) for (const fn of ui.statusListeners) fn(null);
}, 1000);

const left = document.getElementById('col-left');
const middle = document.getElementById('col-chain');
const right = document.getElementById('col-right');

mountPreview(left, ui);
mountOutputPanel(left, ui);
mountInputPanel(left, ui);
mountStatus(left, ui);
mountChain(middle, ui);
mountPhonePanel(right, ui);
mountPresetsPanel(right, ui);
mountModPanel(right, ui);
mountIoPanel(right, ui);
mountShortcuts(right, ui);

installKeys(store);

// A focused button would swallow Space (freeze); drop focus after clicks.
document.addEventListener('click', (e) => {
  const button = e.target.closest?.('button');
  if (button) button.blur();
});

// Click a panel title to fold it; the choice is remembered.
const FOLD_KEY = 'thirdeye.folded';
const folded = new Set(readJSON(FOLD_KEY, ['lfo-panel', 'shortcuts']));
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

window.thirdEye = { store, bus, ui };

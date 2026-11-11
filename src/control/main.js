// /control: the operator's page. It edits the shared state and shows what
// /output reports back; it never touches video itself, so reloading it
// mid-show is harmless.

import './control.css';
import { createBus } from '../shared/bus.js';
import { installKeys } from '../shared/keys.js';
import { Store } from '../shared/store.js';
import { mountChain } from './chain.js';
import { mountInputPanel } from './input-panel.js';
import { mountOutputPanel } from './output-panel.js';
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
mountShortcuts(right, ui);

installKeys(store);

// A focused button would swallow Space (freeze); drop focus after clicks.
document.addEventListener('click', (e) => {
  const button = e.target.closest?.('button');
  if (button) button.blur();
});

window.thirdEye = { store, bus, ui };

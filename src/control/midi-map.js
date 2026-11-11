// MIDI map mode. Switch it on and every mappable control is outlined; click
// one, then move a knob or press a pad. Works for the panic buttons, inputs,
// preset tiles, prev / next, the perform faders, and any effect parameter
// (touch its slider on the edit screen).

import { describeAction } from '../shared/actions.js';
import { describeSource } from '../shared/sources.js';
import { makeActionBinding } from '../shared/state.js';

const isMidi = (source) => source.startsWith('midi.');
const short = (source) => describeSource(source).label;

export function installMidiMap(ui) {
  const { store, bus } = ui;
  const toggle = document.getElementById('midi-map-toggle');
  const hint = document.getElementById('map-hint');
  let active = false;
  let armed = null; // an action string, or 'param'
  let armedEl = null;

  const say = (text) => {
    hint.textContent = text;
  };
  const idle = 'MIDI map: click an outlined control, then move a knob or press a pad. Delete clears a control. Esc to finish.';

  function refresh() {
    const actions = store.state.actions;
    for (const node of document.querySelectorAll('[data-midi]')) {
      const bound = actions.filter((b) => b.action === node.dataset.midi && isMidi(b.source)).map((b) => short(b.source));
      if (bound.length) node.dataset.midiLabel = bound.join(', ');
      else delete node.dataset.midiLabel;
    }
  }

  function disarm() {
    armedEl?.classList.remove('armed');
    armed = null;
    armedEl = null;
    bus.send('midi', { cmd: 'learn', on: false });
  }

  function arm(target, node, label) {
    disarm();
    armed = target;
    armedEl = node;
    node?.classList.add('armed');
    bus.send('midi', { cmd: 'learn', on: true });
    say(`${label}: now move a knob or press a pad. Delete clears it.`);
  }

  function setActive(on) {
    active = on;
    document.body.classList.toggle('midi-map', on);
    toggle.setAttribute('aria-pressed', String(on));
    hint.hidden = !on;
    if (on) {
      say(idle);
      refresh();
      // Switch MIDI on if it is not already; the mode itself never waits.
      if (!store.state.midi.enabled) {
        Promise.resolve(ui.enableMidi?.()).then((ok) => {
          if (ok === false && active) say('MIDI is not available in this browser, or access was denied. Use Chrome and allow MIDI for this site.');
        });
      }
    } else {
      disarm();
    }
  }

  toggle.addEventListener('click', () => setActive(!active));

  // In map mode a click on a mappable control selects it instead of using it.
  for (const type of ['click', 'pointerdown', 'dblclick']) {
    document.addEventListener(
      type,
      (e) => {
        if (!active) return;
        const node = e.target.closest?.('[data-midi]');
        if (!node) return;
        e.preventDefault();
        e.stopPropagation();
        if (type === 'click') arm(node.dataset.midi, node, describeAction(node.dataset.midi));
      },
      true,
    );
  }

  // Effect parameters: touching one on the edit screen arms it.
  ui.onParamTouched = (label) => {
    if (active) arm('param', null, label);
  };

  bus.on('midi-learned', (m) => {
    if (!active || !armed) return;
    if (armed === 'param') {
      const mapping = ui.addMapping?.(m.source, { mode: 'set', amount: 1, smooth: 0.03 });
      say(mapping ? `${short(m.source)} now controls that parameter. Pick another control, or Esc to finish.` : 'Add an effect first.');
    } else {
      // One MIDI control per target; mapping again replaces it.
      const rest = store.state.actions.filter((b) => !(b.action === armed && isMidi(b.source)));
      store.dispatch({ op: 'set', key: 'actions', value: [...rest, makeActionBinding(m.source, armed)] });
      say(`${short(m.source)} → ${describeAction(armed)}. Pick another control, or Esc to finish.`);
    }
    armedEl?.classList.remove('armed');
    armed = null;
    armedEl = null;
    refresh();
  });

  window.addEventListener(
    'keydown',
    (e) => {
      if (!active) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setActive(false);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && armed && armed !== 'param') {
        e.preventDefault();
        e.stopPropagation();
        const target = armed;
        store.dispatch({ op: 'set', key: 'actions', value: store.state.actions.filter((b) => !(b.action === target && isMidi(b.source))) });
        say(`${describeAction(target)}: MIDI cleared. ${idle}`);
        disarm();
        refresh();
      }
    },
    true,
  );

  store.subscribe((op) => {
    if (op.op === 'replace' || (op.op === 'set' && op.key === 'actions')) refresh();
  });

  ui.midiMap = {
    refresh,
    toggle: () => setActive(!active),
    get active() {
      return active;
    },
  };
}

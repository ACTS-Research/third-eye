// MIDI map mode. Switch it on and every mappable control is outlined; click
// one, then move a knob or press a pad. Works for the panic buttons, inputs,
// preset tiles, prev / next, the perform faders, and any effect parameter
// (touch its slider on the edit screen).
//
// The pads and knobs mapped here (to anything but an effect parameter) are
// the live show's own (preset-model.js keeps them with the show). The strip
// across the top says which show that is, and its Set up menu fills the
// show's MIDI in one go: the standard layout, a copy of another show's, or
// nothing at all (mock-up M3, design/midi-per-show/).

import { describeAction } from '../shared/actions.js';
import { describeSource } from '../shared/sources.js';
import { makeActionBinding } from '../shared/state.js';
import { el } from '../shared/util.js';
import { menu } from './controls.js';

const isMidi = (source) => source.startsWith('midi.');
const short = (source) => describeSource(source).label;
const controls = (n) => (n === 1 ? '1 control' : `${n} controls`);
// A control on the screen that is two things: a pad put on it does the one,
// a knob put on it the other. (The Blackout tile: the cut, and the fade.)
const KNOB_OF = { blackout: 'fade' };

// The standard layout, as the owner chose it for an eight-pad, eight-knob
// controller (an AKAI LPD8; 28 November 2026): the eight pads, counted up
// from the first, load steps 1 to 8 of the live show (presets 1 to 8 while
// the show has no steps: `applyScene`), and the first four knobs or faders
// are perform faders 1 to 4. The other knobs are left free, to be mapped by
// hand. Blink, Freeze, Blackout and the rest are not in it: they have keys,
// and any of them can be put on a pad by hand.
export const STANDARD_FADERS = 4;
export const STANDARD_PADS = Array.from({ length: 8 }, (_, i) => `step:${i}`);
// "midi.cc.1.21" → { kind: 'cc', channel: 1, number: 21 }
const parse = (source) => {
  const [, kind, channel, number] = source.split('.');
  return { kind, channel: Number(channel), number: Number(number) };
};
// The bindings of the standard layout, counted up from the first knob and
// the first pad (either may be missing: a controller with no knobs, or none
// of the other).
export function standardLayout(knob, pad) {
  const out = [];
  if (knob) {
    const { channel, number } = parse(knob);
    for (let i = 0; i < STANDARD_FADERS && number + i <= 127; i++) out.push(makeActionBinding(`midi.cc.${channel}.${number + i}`, `macro:${i}`));
  }
  if (pad) {
    const { channel, number } = parse(pad);
    STANDARD_PADS.forEach((action, i) => {
      if (number + i <= 127) out.push(makeActionBinding(`midi.note.${channel}.${number + i}`, action));
    });
  }
  return out;
}

export function installMidiMap(ui) {
  const { store, bus, presets } = ui;
  const toggle = document.getElementById('midi-map-toggle');
  const hint = document.getElementById('map-hint');
  let active = false;
  let armed = null; // an action string, or 'param'
  let armedEl = null;
  // The standard layout being set: { step: 'knob' | 'pad', knob, pad }.
  let flow = null;

  const idle = 'Click an outlined control, then move a knob or press a pad. Delete clears a control. Esc to finish.';
  const tag = el('span', { class: 'map-show' });
  const text = el('span', { class: 'map-text', role: 'status' });
  const say = (line) => {
    text.textContent = line;
    text.title = line;
  };
  const learn = (on) => bus.send('midi', { cmd: 'learn', on });
  const setActions = (list) => store.dispatch({ op: 'set', key: 'actions', value: list });

  function refresh() {
    const actions = store.state.actions;
    // While the live show has no steps a "step" pad loads the preset in that
    // place, so its label goes on that preset's tile.
    const noSteps = !presets.order.steps.length;
    for (const node of document.querySelectorAll('[data-midi]')) {
      const also = noSteps && node.dataset.midi.startsWith('preset:') ? node.dataset.midi.replace('preset:', 'step:') : '';
      const knob = KNOB_OF[node.dataset.midi];
      const bound = actions.filter((b) => (b.action === node.dataset.midi || b.action === also || (knob && b.action === knob)) && isMidi(b.source)).map((b) => short(b.source));
      if (bound.length) node.dataset.midiLabel = bound.join(', ');
      else delete node.dataset.midiLabel;
    }
    tag.textContent = `MIDI map · ${presets.live.name}`;
  }

  function disarm() {
    armedEl?.classList.remove('armed');
    armed = null;
    armedEl = null;
    learn(false);
  }

  function arm(target, node, label) {
    disarm();
    armed = target;
    armedEl = node;
    node?.classList.add('armed');
    learn(true);
    say(KNOB_OF[target] ? `${label}: now press a pad (for ${label}) or turn a knob (for ${describeAction(KNOB_OF[target])}). Delete clears it.` : `${label}: now move a knob or press a pad. Delete clears it.`);
  }

  // ------------------------------------------------- the standard layout ---
  // Two gestures fit it to any controller: its first knob (or fader), then
  // its first pad. The rest are counted up from those.
  const skip = el('button', { class: 'map-skip', hidden: true, onclick: () => step(null) });
  const cancel = el('button', { class: 'map-cancel', text: 'Cancel', hidden: true, onclick: () => endFlow('Standard layout cancelled: nothing was changed.') });

  function ask(prefix = '') {
    const knob = flow.step === 'knob';
    say(`${prefix}Standard layout, ${knob ? '1' : '2'} of 2: ${knob ? 'move your first knob or fader, the one for Fader 1.' : 'press your first pad, the one for step 1.'}`);
    skip.textContent = knob ? 'No knobs: skip' : 'No pads: skip';
    learn(true);
  }

  function startFlow() {
    disarm();
    flow = { step: 'knob', knob: null, pad: null };
    skip.hidden = cancel.hidden = false;
    setup.node.hidden = true;
    ask();
  }

  function endFlow(line) {
    flow = null;
    skip.hidden = cancel.hidden = true;
    setup.node.hidden = false;
    learn(false);
    say(`${line} ${idle}`);
  }

  // One gesture answered (`source`), or skipped (null).
  function step(source) {
    if (!flow) return;
    if (flow.step === 'knob') {
      flow.knob = source;
      flow.step = 'pad';
      ask();
      return;
    }
    flow.pad = source;
    const layout = standardLayout(flow.knob, flow.pad);
    if (!layout.length) return endFlow('Standard layout: nothing was set.');
    // What the layout sets replaces what was on those knobs and pads, and
    // what else fired those actions; every other control stays.
    const sources = new Set(layout.map((b) => b.source));
    const targets = new Set(layout.map((b) => b.action));
    setActions([...store.state.actions.filter((b) => !sources.has(b.source) && !(isMidi(b.source) && targets.has(b.action))), ...layout]);
    const faders = layout.filter((b) => b.action.startsWith('macro:')).length;
    const pads = layout.length - faders;
    // Where the faders and the buttons are, each now showing its control.
    ui.setView('perform');
    endFlow(`Standard layout set: ${[faders && `${faders} faders`, pads && `${pads} pads`].filter(Boolean).join(', ')}.`);
    refresh();
  }

  function learnedInFlow(source) {
    const knob = source.startsWith('midi.cc.');
    if (flow.step === 'knob') {
      if (knob) step(source);
      else ask('That was a pad. ');
    } else if (!knob) step(source);
    // (The first knob, still turning, is not a mistake.)
    // (A pad set to send control changes looks like a knob from here.)
    else ask(source === flow.knob ? '' : 'That was a knob, or a pad not sending notes (on an LPD8: press PAD). ');
  }

  // ------------------------------------------------------ the Set up menu ---
  const setup = menu({
    action: true,
    id: 'map-setup',
    label: "This show's MIDI controls",
    text: 'Set up',
    options: () => [
      { value: 'standard', label: 'Standard layout…', group: 'Start from' },
      ...presets.shows
        .filter((x) => x !== presets.live)
        .map((x) => ({ value: `copy:${x.id}`, label: `${x.name} · ${presets.midiCount(x) ? controls(presets.midiCount(x)) : 'nothing mapped'}`, group: 'Copy from another show', disabled: !presets.midiCount(x) })),
      { value: 'clear', label: 'Clear all…', group: `${presets.live.name} has ${controls(presets.midiCount(presets.live))}`, disabled: !presets.midiCount(presets.live) },
    ],
    onChange: (v) => {
      const show = presets.live;
      const mine = presets.midiCount(show);
      if (v === 'standard') startFlow();
      else if (v === 'clear') {
        if (!confirm(`Clear the ${controls(mine)} of ${show.name}? Phone triggers, and knobs set on effect sliders, are not touched.`)) return;
        disarm();
        setActions(store.state.actions.filter((b) => !isMidi(b.source)));
        say(`${show.name} has no MIDI controls now. ${idle}`);
        refresh();
      } else if (v.startsWith('copy:')) {
        const from = presets.shows.find((x) => x.id === v.slice(5));
        if (!from) return;
        if (mine && !confirm(`Replace the ${controls(mine)} of ${show.name} with the ${controls(presets.midiCount(from))} of ${from.name}? Phone triggers are not touched.`)) return;
        disarm();
        const count = presets.importMidi(from.id);
        if (count < 0) return;
        say(`${controls(count)} copied from ${from.name}. Click an outlined control to change one. Esc to finish.`);
        refresh();
      }
    },
  });
  hint.replaceChildren(tag, text, skip, cancel, setup.node);

  function setActive(on) {
    active = on;
    document.body.classList.toggle('midi-map', on);
    toggle.setAttribute('aria-pressed', String(on));
    hint.hidden = !on;
    if (on) {
      say(idle);
      refresh();
      ui.setAlert?.('midi-empty', null);
      // Switch MIDI on if it is not already; the mode itself never waits.
      if (!store.state.midi.enabled) {
        Promise.resolve(ui.enableMidi?.()).then((ok) => {
          if (ok === false && active) say('MIDI is not available in this browser, or access was denied. Use Chrome and allow MIDI for this site.');
        });
      }
    } else {
      if (flow) endFlow('');
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
        if (type === 'click' && !flow) arm(node.dataset.midi, node, describeAction(node.dataset.midi));
      },
      true,
    );
  }

  // Effect parameters: touching one on the edit screen arms it.
  ui.onParamTouched = (label) => {
    if (active && !flow) arm('param', null, label);
  };

  bus.on('midi-learned', (m) => {
    if (!active) return;
    if (flow) return learnedInFlow(m.source);
    if (!armed) return;
    if (armed === 'param') {
      const mapping = ui.addMapping?.(m.source, { mode: 'set', amount: 1, smooth: 0.03 });
      say(mapping ? `${short(m.source)} now controls that parameter. Pick another control, or Esc to finish.` : 'Add an effect first.');
    } else {
      // One MIDI control per target; mapping again replaces it. (On a tile
      // that is two things, a knob is for its second.)
      const target = KNOB_OF[armed] && m.source.startsWith('midi.cc.') ? KNOB_OF[armed] : armed;
      const rest = store.state.actions.filter((b) => !(b.action === target && isMidi(b.source)));
      setActions([...rest, makeActionBinding(m.source, target)]);
      say(`${short(m.source)} → ${describeAction(target)}. Pick another control, or Esc to finish.`);
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
      // (An open menu takes its own keys: Esc there closes the menu.)
      if (e.target.closest?.('.menu-list')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (flow) endFlow('Standard layout cancelled: nothing was changed.');
        else setActive(false);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && armed && armed !== 'param') {
        e.preventDefault();
        e.stopPropagation();
        const target = armed;
        setActions(store.state.actions.filter((b) => !((b.action === target || b.action === KNOB_OF[target]) && isMidi(b.source))));
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
  // Another show going live brings its own controls and its own name.
  presets.onChange(refresh);

  // A controller is plugged in and this show has nothing on it: say so once,
  // with the way in. (Not while the map is open: that is the way in.)
  ui.onStatus((status) => {
    if (active) return;
    const midi = status?.midi;
    const idleDevice = store.state.midi.enabled && midi?.state === 'ready' && midi.inputs.length > 0 && !store.state.actions.some((b) => isMidi(b.source));
    ui.setAlert?.('midi-empty', idleDevice ? `${midi.inputs[0]} is connected, and nothing in ${presets.live.name} is mapped to it` : null, 'warn', { label: 'Open MIDI map', run: () => setActive(true) });
  });

  ui.midiMap = {
    refresh,
    toggle: () => setActive(!active),
    open: () => setActive(true),
    get active() {
      return active;
    },
  };
  refresh();
}

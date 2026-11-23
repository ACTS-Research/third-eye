// The Glitch tab of the edit screen, and capturing a glitch.
//
// Glitch in a preset is a jump: chosen sliders are thrown to a landing place
// and come back (state.glitch; the engine's side is engine/glitch.js). You
// choose them by capture: press Capture, move any sliders in any effect
// until the picture is the glitch, press Keep. Every slider that differs
// from where it was becomes a jump, and all of them go back.

import { EFFECT_BY_ID, paramUnit } from '../effects/index.js';
import { runAction } from '../shared/actions.js';
import { el } from '../shared/util.js';
import { bar, digitsFor, toggle } from './controls.js';

// Glitch fires as a button goes down and is told when it comes up, so a
// glitch set to hold lasts as long as the press. (A press from the keyboard
// is a click with no pointer: down and up at once.)
export function pressGlitch(store, button) {
  let down = false;
  button.addEventListener('pointerdown', (e) => {
    if (e.button || document.body.classList.contains('midi-map')) return;
    down = true;
    runAction(store, 'glitch');
  });
  const up = () => {
    if (!down) return;
    down = false;
    runAction(store, 'glitchEnd');
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  button.addEventListener('click', (e) => {
    if (e.detail !== 0 || document.body.classList.contains('midi-map')) return;
    runAction(store, 'glitch');
    runAction(store, 'glitchEnd');
  });
}

const valueOf = (item, key) => (key === 'mix' ? item.mix : item.params[key]);

// A slider nudged by less than this share of its bar's travel is not a
// jump: a brush of the hand while capturing should not be kept.
const TINY = 0.01;
function reallyMoved(item, key, before, now) {
  if (before === now) return false;
  const spec = key === 'mix' ? { min: 0, max: 1 } : EFFECT_BY_ID[item.type]?.params[key];
  if (!spec || spec.options || spec.type === 'bool') return true;
  return Math.abs(paramUnit(spec, now) - paramUnit(spec, before)) >= TINY;
}

// How a jump reads in the list: the effect and slider, and from → to.
function describe(chain, jump) {
  const index = chain.findIndex((it) => it.uid === jump.fx);
  const item = chain[index];
  const def = item && EFFECT_BY_ID[item.type];
  if (!def) return null;
  const spec = jump.key === 'mix' ? { step: 0.01 } : def.params[jump.key];
  const label = jump.key === 'mix' ? (def.mixLabel ?? 'wet / dry') : (spec.label ?? jump.key);
  const show = (v) => {
    if (spec.options) return Object.entries(spec.options).find(([, value]) => value === v)?.[0] ?? String(v);
    if (spec.type === 'bool') return v > 0.5 ? 'On' : 'Off';
    return Number(v).toFixed(digitsFor(spec.step ?? 0.01));
  };
  return { name: `${index + 1} ${def.name} · ${label}`, change: `${show(valueOf(item, jump.key))} → ${show(jump.to)}` };
}

// `pane`: the tab's pane. `band`: where the capture band goes (above every
// tab's pane, so it is in view whichever tab is open).
export function mountGlitch(pane, band, ui) {
  const { store } = ui;
  const glitch = () => store.state.glitch;
  const set = (patch) => store.merge('glitch', patch);

  // ------------------------------------------------------------ capture ---
  // While it runs, ui.glitchCapture holds the chain as it was. The edit
  // screen does not save into the preset meanwhile, and marks sliders
  // against that chain instead of the one it opened with.
  ui.glitchCapture = null;
  const moved = () => {
    const out = [];
    for (const before of ui.glitchCapture?.chain ?? []) {
      const now = store.findEffect(before.uid);
      if (!now) continue;
      if (reallyMoved(now, 'mix', before.mix, now.mix)) out.push({ fx: now.uid, key: 'mix', to: now.mix });
      for (const key of Object.keys(now.params)) if (before.params[key] !== undefined && reallyMoved(now, key, before.params[key], now.params[key])) out.push({ fx: now.uid, key, to: now.params[key] });
    }
    return out;
  };
  // Every slider back where it was before the capture.
  function restore(chain) {
    for (const before of chain) {
      if (store.findEffect(before.uid)) store.patchItem('chain', before.uid, { mix: before.mix, params: structuredClone(before.params) });
    }
  }
  function finish(keep) {
    const capture = ui.glitchCapture;
    if (!capture) return;
    const jumps = keep ? moved() : null;
    ui.glitchCapture = null;
    restore(capture.chain);
    if (jumps) set({ jumps });
    showBand();
    build();
    ui.markChanges?.();
    ui.markJumps?.();
    if (keep) ui.setEditTab('glitch');
  }
  function start() {
    if (ui.glitchCapture) return;
    ui.glitchCapture = { chain: structuredClone(store.state.chain) };
    // Start from the glitch as it stands, so it can be adjusted.
    for (const j of glitch().jumps) {
      if (j.key === 'mix') store.patchItem('chain', j.fx, { mix: j.to });
      else store.setParam(j.fx, j.key, j.to);
    }
    showBand();
    build();
    ui.markChanges?.();
    ui.markJumps?.();
    ui.setEditTab('params');
  }

  const keep = el('button', { class: 'primary', id: 'glitch-keep', text: 'Save glitch', onclick: () => finish(true) });
  const cancel = el('button', { text: 'Cancel', id: 'glitch-cancel', onclick: () => finish(false) });
  band.className = 'capture-band';
  band.append(
    el('b', { text: 'Glitch settings' }),
    el('div', { class: 'small', text: 'Move the sliders to create the glitch effect.' }),
    el('div', { class: 'row' }, [keep, cancel]),
  );
  function showBand() {
    band.hidden = !ui.glitchCapture;
    // (How many sliders it would keep, for whoever asks: the tests do.)
    keep.dataset.jumps = ui.glitchCapture ? String(moved().length) : '';
  }

  // -------------------------------------------------------------- the tab ---
  const capture = el('button', { class: 'primary', id: 'glitch-capture', onclick: start });
  const tryIt = el('button', { id: 'glitch-try', text: 'Try it · G', title: 'Fires Glitch, as the G key and the Glitch button do' });
  pressGlitch(store, tryIt);
  const row = (key, label, field, tip) => el('div', { class: 'param', 'data-key': key, title: tip }, [el('label', { text: label }), field]);
  const attack = bar({ label: 'Attack', min: 0, max: 5, step: 0.01, value: 0, reset: 0, unit: ' s', scale: { toUnit: (v) => Math.sqrt(v / 5), fromUnit: (u) => u * u * 5 }, onInput: (v) => set({ attack: v }) });
  const release = bar({ label: 'Release', min: 0, max: 10, step: 0.01, value: 0.33, reset: 0.33, unit: ' s', scale: { toUnit: (v) => Math.sqrt(v / 10), fromUnit: (u) => u * u * 10 }, onInput: (v) => set({ release: v }) });
  const scatter = bar({ label: 'Scatter', min: 0, max: 1, step: 0.01, value: 0, reset: 0, onInput: (v) => set({ scatter: v }) });
  const hold = toggle({ text: 'Off', onText: 'On', label: 'Hold', onChange: (on) => set({ hold: on }) });
  const list = el('div', { class: 'glitch-jumps' });
  const note = el('div', { class: 'dim small' });
  pane.append(
    el('div', { class: 'row' }, [capture, tryIt]),
    row('attack', 'attack', attack.node, 'How long the sliders take to get there. 0 is at once.'),
    row('release', 'release', release.node, 'How long the sliders take to come back.'),
    row('scatter', 'scatter', scatter.node, 'How differently each press lands. 0 is the same every time.'),
    row('hold', 'hold', hold.node, 'On: the glitch lasts for as long as the key or button is down.'),
    list,
    note,
  );

  function build() {
    const g = glitch();
    attack.set(g.attack);
    release.set(g.release);
    scatter.set(g.scatter);
    hold.set(g.hold);
    capture.textContent = g.jumps.length ? 'Recapture' : 'Capture a glitch';
    capture.disabled = !!ui.glitchCapture || !store.state.chain.length;
    const chain = ui.glitchCapture?.chain ?? store.state.chain;
    list.replaceChildren(
      ...g.jumps.map((jump) => {
        const d = describe(chain, jump);
        if (!d) return null;
        return el('div', { class: 'glitch-jump' }, [
          // (The figures are on the slider itself; here they are the tooltip.)
          el('button', { class: 'pin-name what', text: d.name, title: `${d.change}. Click to show this slider.`, onclick: () => ui.showParam?.(jump.fx, jump.key) }),
          el('button', { class: 'icon', text: '✕', 'aria-label': `Remove the jump of ${d.name}`, disabled: !!ui.glitchCapture, onclick: () => set({ jumps: glitch().jumps.filter((j) => !(j.fx === jump.fx && j.key === jump.key)) }) }),
        ]);
      }).filter(Boolean),
    );
    list.hidden = !g.jumps.length;
    note.textContent = g.jumps.length
      ? 'Glitch throws these sliders to where they land, and they come back. Scatter lets each press land a little differently.'
      : 'No jumps yet: Glitch tears the picture, as it always has. Capture a glitch to have it throw sliders of this preset instead.';
  }

  // One jump moved or removed from its slider's bar (the pointer on the bar).
  ui.setJump = (fx, key, to) => {
    const rest = glitch().jumps.filter((j) => !(j.fx === fx && j.key === key));
    set({ jumps: to === null ? rest : glitch().jumps.map((j) => (j.fx === fx && j.key === key ? { ...j, to } : j)) });
  };

  store.subscribe((op) => {
    // Another preset, or the whole state replaced: the capture is void.
    if (ui.glitchCapture && (op.op === 'replace' || (op.op === 'scene' && Number.isInteger(op.presetIndex)))) {
      ui.glitchCapture = null;
      showBand();
    }
    if (op.op === 'scene' || op.op === 'replace' || (op.op === 'merge' && op.key === 'glitch')) build();
    else if (op.op === 'param' || (op.op === 'item' && op.list === 'chain')) {
      if (ui.glitchCapture) showBand();
      else if (glitch().jumps.length) build();
    }
  });
  // Leaving the edit screen ends a capture without keeping it.
  ui.onView((view) => {
    if (view !== 'edit') finish(false);
  });
  showBand();
  build();
}

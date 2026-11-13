// The perform screen: panic controls, the monitor, eight faders for the
// current preset, and the strip of presets and the running order (strip.js).
// Everything here is MIDI-mappable.

import { runAction } from '../shared/actions.js';
import { macroUnit, macroValue, resolveMacros } from '../shared/macros.js';
import { describeSource } from '../shared/sources.js';
import { INPUT_KINDS, INPUT_LABELS } from '../shared/state.js';
import { el } from '../shared/util.js';
import { attachPreview } from './preview.js';
import { mountStrip } from './strip.js';

function format(value, step) {
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return Number(value).toFixed(digits);
}

export function mountPerform(root, ui) {
  const { store, bus, presets } = ui;

  // ------------------------------------------------------- panic stack ---
  const big = (cls, action, key, label) =>
    el('button', { class: `big ${cls}`, 'data-midi': action, onclick: () => runAction(store, action) }, [el('span', { text: key }), el('b', { text: label })]);
  const blackout = big('blackout', 'blackout', 'B', 'Blackout');
  const freeze = big('', 'freeze', 'Space', 'Freeze');
  const bypass = big('', 'bypassAll', 'X', 'Bypass');
  const glitch = big('', 'glitch', 'G', 'Glitch');
  const inputButtons = {};
  const inputs = el('div', { class: 'inputs' });
  INPUT_KINDS.forEach((kind, i) => {
    inputButtons[kind] = el('button', {
      text: String(i + 1),
      title: INPUT_LABELS[kind],
      'aria-label': `Input ${i + 1}, ${INPUT_LABELS[kind]}`,
      'data-midi': `input:${kind}`,
      onclick: () => runAction(store, 'input', kind),
    });
    inputs.append(inputButtons[kind]);
  });
  const inputName = el('span');

  // Tap tempo: the button blinks on the beat; the field takes a typed BPM.
  const bpm = el('input', {
    type: 'number',
    min: '30',
    max: '300',
    step: '0.1',
    id: 'bpm',
    'aria-label': 'Tempo in beats per minute',
    onchange: () => {
      const v = Number(bpm.value);
      if (Number.isFinite(v)) store.merge('tempo', { bpm: Math.min(300, Math.max(30, v)) });
    },
  });
  const tap = el('button', { class: 'tap', 'data-midi': 'tap', title: 'Tap in time, at least twice. One tap alone moves the downbeat.', onclick: () => runAction(store, 'tap') }, [el('span', { text: 'T' }), el('b', { text: 'Tap' })]);
  const tempo = el('div', { class: 'tempo' }, [tap, bpm, el('label', { for: 'bpm', text: 'BPM' })]);
  bus.on('sources', (m) => tap.classList.toggle('beat', (m.values['tempo.beat'] ?? 0) > 0.4));

  const panic = el('aside', { class: 'panic', 'aria-label': 'Panic controls and inputs' }, [blackout, freeze, bypass, glitch, tempo, inputs, inputName]);

  // ----------------------------------------------------------- monitor ---
  // With an output window open this canvas shows the small picture it sends
  // back. With none, host.js puts the engine's own canvas here instead.
  const canvas = el('canvas', { id: 'preview', class: 'readback', width: 480, height: 270 });
  attachPreview(ui, canvas);
  const noteTitle = el('b');
  const noteText = el('span', { class: 'dim' });
  const note = el('div', { class: 'monitor-note' }, [noteTitle, noteText]);
  const monitor = el('div', { class: 'monitor' }, [canvas, note]);
  ui.monitors.perform = monitor;

  // The only thing that ever covers the monitor is the operator's own choice
  // to switch off the readback from an output window.
  function syncMonitor() {
    const off = ui.host?.state === 'remote' && ui.engineAlive && !store.state.globals.preview;
    note.hidden = !off;
    noteTitle.textContent = off ? 'Monitor is off' : '';
    noteText.textContent = off ? 'The output is running. Turn the monitor back on under Setup → Output.' : '';
  }

  // ------------------------------------------------------------ faders ---
  const faderGrid = el('div', { class: 'faders' });
  const faderNote = el('div', { class: 'dim small keep-2' });
  const presetName = el('span');
  let faders = [];

  function setMacro(macro, unit) {
    const value = macroValue(macro, unit);
    ui.lastTouched = { uid: macro.fx, key: macro.key };
    if (macro.key === 'mix') store.patchItem('chain', macro.fx, { mix: value });
    else store.setParam(macro.fx, macro.key, value);
  }

  function buildFaders() {
    faderGrid.replaceChildren();
    faders = [];
    const macros = resolveMacros(store.state);
    macros.forEach((macro, i) => {
      if (!macro) return;
      const fill = el('div', { class: 'fill' });
      const live = el('div', { class: 'live', hidden: true });
      const track = el('div', { class: 'track' }, [fill, live]);
      const val = el('span', { class: 'val' });
      const node = el('div', { class: 'fader', 'data-midi': `macro:${i}`, title: `${macro.effect} · ${macro.label} — drag, or double-click to reset` }, [
        track,
        val,
        el('span', { class: 'name', text: macro.label }),
      ]);
      const drag = (e) => {
        const r = track.getBoundingClientRect();
        setMacro(resolveMacros(store.state)[i], 1 - (e.clientY - r.top) / r.height);
      };
      node.addEventListener('pointerdown', (e) => {
        if (document.body.classList.contains('midi-map')) return;
        node.setPointerCapture(e.pointerId);
        drag(e);
        e.preventDefault();
      });
      node.addEventListener('pointermove', (e) => {
        if (node.hasPointerCapture(e.pointerId)) drag(e);
      });
      node.addEventListener('dblclick', () => {
        const m = resolveMacros(store.state)[i];
        setMacro(m, macroUnit(m, m.fallback));
      });
      faders.push({ i, fill, live, val });
      faderGrid.append(node);
    });
    const any = macros.some(Boolean);
    const auto = macros.find(Boolean)?.auto;
    faderNote.textContent = !any ? 'No effects in this preset, so there is nothing to put on the faders.' : auto ? 'Showing the first parameters of the chain. Pin your own under Edit.' : '';
    syncFaders();
    ui.midiMap?.refresh();
  }

  function syncFaders() {
    const macros = resolveMacros(store.state);
    for (const f of faders) {
      const macro = macros[f.i];
      if (!macro) continue;
      f.fill.style.height = `${Math.min(1, Math.max(0, macroUnit(macro, macro.value))) * 100}%`;
      f.val.textContent = format(macro.value, macro.step);
    }
  }

  // -------------------------------------------------------- mini meters ---
  const mini = el('div', { class: 'mini' });
  let miniBars = new Map();

  function buildMini() {
    mini.replaceChildren();
    miniBars = new Map();
    const used = [...new Set(store.state.mappings.filter((m) => m.enabled).map((m) => m.source))].slice(0, 6);
    for (const id of used) {
      const s = describeSource(id);
      const fill = el('i');
      mini.append(el('div', { class: 'meter', title: id }, [el('span', { text: s.label.startsWith(s.group) ? s.label : `${s.group} ${s.label}` }), el('div', { class: `bar${s.bipolar ? ' bipolar' : ''}` }, [fill])]));
      miniBars.set(id, { fill, bipolar: s.bipolar });
    }
    if (!used.length) mini.append(el('div', { class: 'dim small', text: 'No modulation in this preset.' }));
  }

  bus.on('sources', (m) => {
    for (const [id, meter] of miniBars) {
      const value = m.values[id] ?? 0;
      if (meter.bipolar) {
        const v = Math.max(-1, Math.min(1, value));
        meter.fill.style.left = `${v < 0 ? 50 + v * 50 : 50}%`;
        meter.fill.style.width = `${Math.abs(v) * 50}%`;
      } else {
        meter.fill.style.left = '0';
        meter.fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
      }
    }
    // Hatched band from the fader's setting to where modulation has the
    // parameter right now: ink stripes above the fill, dark ones cut into it.
    const macros = resolveMacros(store.state);
    for (const f of faders) {
      const level = m.macros?.[f.i];
      const macro = macros[f.i];
      const set = macro ? Math.min(1, Math.max(0, macroUnit(macro, macro.value))) : 0;
      const live = Math.min(1, Math.max(0, level ?? 0));
      const moved = level !== null && level !== undefined && macro && Math.abs(live - set) > 0.01;
      f.live.hidden = !moved;
      if (moved) {
        f.live.classList.toggle('up', live > set);
        f.live.classList.toggle('down', live < set);
        f.live.style.bottom = `${Math.min(set, live) * 100}%`;
        f.live.style.height = `${Math.abs(live - set) * 100}%`;
      }
    }
  });

  const side = el('aside', { class: 'side', 'aria-label': 'Faders' }, [el('div', { class: 'side-head' }, [el('span', { text: 'Faders' }), presetName]), faderGrid, faderNote, mini]);

  // ------------------------------------------------------ preset strip ---
  const { root: strip, build: buildTiles } = mountStrip(ui, () => {
    presetName.textContent = presets.list[presets.current]?.name ?? 'Unsaved';
  });

  // --------------------------------------------------------------- sync ---
  function syncState() {
    const { globals, input } = store.state;
    blackout.classList.toggle('on', globals.blackout);
    freeze.classList.toggle('on', globals.freeze);
    bypass.classList.toggle('on', globals.bypassAll);
    for (const kind of INPUT_KINDS) inputButtons[kind].setAttribute('aria-pressed', String(input.kind === kind));
    inputName.textContent = `Input: ${INPUT_LABELS[input.kind]}`;
    if (document.activeElement !== bpm) bpm.value = String(store.state.tempo.bpm);
    syncMonitor();
  }

  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace') {
      buildFaders();
      buildMini();
    } else if (op.op === 'param' || (op.op === 'item' && op.list === 'chain')) {
      syncFaders();
    } else if (op.op === 'item' && op.list === 'mappings') {
      buildMini();
    }
    if (op.op === 'merge' || op.op === 'replace') syncState();
  });
  store.onEvent((name) => {
    if (name !== 'glitch') return;
    glitch.classList.add('on');
    setTimeout(() => glitch.classList.remove('on'), 300);
  });
  ui.onStatus(syncMonitor);
  ui.onHost(syncMonitor);

  root.append(panic, monitor, side, strip);
  buildFaders();
  buildMini();
  buildTiles();
  syncState();
}

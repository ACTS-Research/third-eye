// The perform screen: panic controls, the monitor, eight faders for the
// current preset, and the strip of presets and the running order (strip.js).
// Everything here is MIDI-mappable.

import { EFFECT_BY_ID } from '../effects/index.js';
import { THUMB_H, THUMB_W } from '../engine/pipeline.js';
import { runAction } from '../shared/actions.js';
import { macroUnit, macroValue, resolveMacros } from '../shared/macros.js';
import { describeSource } from '../shared/sources.js';
import { INPUT_KINDS, INPUT_LABELS } from '../shared/state.js';
import { el } from '../shared/util.js';
import { menu } from './controls.js';
import { attachPreview } from './preview.js';
import { mountStrip } from './strip.js';

// What an input is doing, short enough for the line under its small view.
const INPUT_STATE_TEXT = { live: 'live', stalled: 'stalled', 'no-signal': 'no signal', paused: 'camera off' };

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

  const panic = el('aside', { class: 'panic', 'aria-label': 'Panic controls' }, [blackout, freeze, bypass, glitch, tempo]);

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

  // ------------------------------------------------- inputs and the mix ---
  // Under the picture: a small live view of input A and one of input B, each
  // over the list that chooses its source, and between them the bar that
  // mixes B in. The bar belongs to the preset's Mix B effect (its mix); a
  // preset without one shows A alone, and the bar keeps its place, dimmed.
  const stateOf = (slot) => {
    const kind = slot === 'a' ? store.state.input.kind : store.state.input.kindB;
    const seen = slot === 'a' ? ui.status?.input : ui.status?.inputB;
    return seen?.kind === kind ? seen.state : '';
  };
  const needsFile = (slot) => (slot === 'a' ? store.state.input.kind : store.state.input.kindB) === 'file' && stateOf(slot) === 'no-signal';
  function caption(slot, kind) {
    const name = slot.toUpperCase();
    if (!kind) return `${name} · off`;
    const state = stateOf(slot);
    return `${name} · ${INPUT_LABELS[kind]} · ${needsFile(slot) ? 'choose…' : INPUT_STATE_TEXT[state] ?? (state || '—')}`;
  }

  function inputView(slot) {
    const isA = slot === 'a';
    const view = el('canvas', { class: 'inview-pic', width: THUMB_W, height: THUMB_H, 'aria-hidden': 'true' });
    const pick = menu({
      id: `input-${slot}`,
      cls: 'inview-menu',
      // Downward, over the preset strip: never over the picture.
      down: true,
      listCls: 'compact',
      label: `Input ${slot.toUpperCase()}`,
      value: isA ? store.state.input.kind : store.state.input.kindB,
      options: () => {
        const { kind, kindB } = store.state.input;
        const mine = isA ? kind : kindB;
        const other = isA ? kindB : kind;
        const list = INPUT_KINDS.map((k, i) => {
          let note = '';
          if (k === other) note = isA || mine ? ` · trades places with ${isA ? 'B' : 'A'}` : ' · in use by A';
          return { value: k, label: caption(slot, k), item: `${i + 1} ${INPUT_LABELS[k]}${note}`, midi: `${isA ? 'input' : 'inputB'}:${k}` };
        });
        if (!isA) list.push({ value: '', label: caption('b', ''), item: 'B off', midi: 'inputB:off' });
        list.push({ value: '$setup', label: '', item: 'Input settings…' });
        return list;
      },
      onOpen: () => ui.midiMap?.refresh(),
      onChange: (v) => {
        if (v === '$setup') ui.goToPanel('input-panel');
        else {
          runAction(store, isA ? 'input' : 'inputB', v || 'off');
          // Nothing to play yet: ask for the file here and now.
          if (v === 'file' && (!ui.hasVideoFile?.() || needsFile(slot))) ui.pickVideoFile?.();
        }
        syncInputs();
      },
    });
    view.addEventListener('click', () => pick.node.click());
    return { view, pick, node: el('div', { class: 'inview', id: `inview-${slot}` }, [view, pick.node]) };
  }
  const viewA = inputView('a');
  const viewB = inputView('b');

  let thumbs = null;
  bus.on('thumbs', (m) => {
    if (mixRow.offsetParent === null) return;
    const { width, height, pixels } = m;
    if (!thumbs || thumbs.width !== width || thumbs.height !== height) thumbs = new ImageData(width, height);
    // GL rows arrive bottom-up. A is the left half of the strip, B the right.
    const stride = width * 4;
    for (let y = 0; y < height; y++) thumbs.data.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
    viewA.view.getContext('2d').putImageData(thumbs, 0, 0, 0, 0, THUMB_W, THUMB_H);
    viewB.view.getContext('2d').putImageData(thumbs, -THUMB_W, 0, THUMB_W, 0, THUMB_W, THUMB_H);
  });

  const mixItem = () => store.state.chain.find((it) => it.type === 'mixb' && !it.bypass) ?? store.state.chain.find((it) => it.type === 'mixb') ?? null;
  const mixFill = el('div', { class: 'fill' });
  const mixText = el('span', { class: 'mixbar-text' });
  const mixBar = el('div', { class: 'mixbar', id: 'mixbar', role: 'slider', tabindex: '0', 'aria-label': 'Mix of input B', 'aria-valuemin': '0', 'aria-valuemax': '1' }, [mixFill, mixText]);
  const setMix = (value) => {
    const item = mixItem();
    if (!item) return;
    ui.lastTouched = { uid: item.uid, key: 'mix' };
    store.patchItem('chain', item.uid, { mix: Math.round(Math.min(1, Math.max(0, value)) * 100) / 100 });
  };
  const dragMix = (e) => {
    const r = mixBar.getBoundingClientRect();
    setMix((e.clientX - r.left) / r.width);
  };
  mixBar.addEventListener('pointerdown', (e) => {
    if (!mixItem()) return;
    mixBar.setPointerCapture(e.pointerId);
    dragMix(e);
    e.preventDefault();
  });
  mixBar.addEventListener('pointermove', (e) => {
    if (mixBar.hasPointerCapture(e.pointerId)) dragMix(e);
  });
  // The arrows step presets everywhere else on the page: here they move the bar.
  mixBar.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[e.key];
    const item = mixItem();
    if (!step || !item) return;
    e.preventDefault();
    e.stopPropagation();
    setMix(item.mix + step);
  });
  const mixRow = el('div', { class: 'mixrow', 'aria-label': 'Inputs and mix' }, [viewA.node, mixBar, viewB.node]);
  const center = el('div', { class: 'center' }, [monitor, mixRow]);

  function syncMix() {
    const item = mixItem();
    const { kindB } = store.state.input;
    mixBar.classList.toggle('none', !item);
    mixBar.setAttribute('aria-disabled', String(!item));
    mixFill.style.width = `${item ? item.mix * 100 : 0}%`;
    mixBar.setAttribute('aria-valuenow', String(item ? item.mix : 0));
    const mode = item ? Object.entries(EFFECT_BY_ID.mixb.params.mode.options).find(([, v]) => v === item.params.mode)?.[0] ?? '' : '';
    mixText.textContent = !item ? 'No Mix B in this preset: A alone' : item.bypass ? `${mode} · bypassed` : !kindB ? `${mode} · B is off` : mode;
    mixBar.title = item ? 'Drag to mix input B in. The mode and the rest are under Edit, in Mix B.' : 'Add the Mix B effect to this preset (Edit) to mix input B in.';
  }

  function syncInputs() {
    const { kind, kindB } = store.state.input;
    viewA.pick.set(kind);
    viewB.pick.set(kindB);
    for (const [slot, v] of [['a', viewA], ['b', viewB]]) {
      const state = stateOf(slot);
      v.pick.node.classList.toggle('warn', !!state && state !== 'live' && state !== 'stalled');
      v.pick.node.classList.toggle('bad', state === 'stalled');
    }
    viewB.node.classList.toggle('off', !kindB);
    syncMix();
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
    faderNote.textContent = !any ? 'No effects in this preset, so there is nothing to put on the faders.' : auto ? 'Showing the first sliders of each effect. Choose your own with Fader, under Edit.' : '';
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
    const live = store.state.mappings.filter((m) => m.enabled);
    const used = [...new Set(live.map((m) => m.source))].slice(0, 6);
    // What a mapping drives, as "2 Trails · persistence".
    const target = (m) => {
      const i = store.state.chain.findIndex((it) => it.uid === m.fx);
      if (i < 0) return '';
      const def = EFFECT_BY_ID[store.state.chain[i].type];
      return `${i + 1} ${def.name} · ${m.key === 'mix' ? def.mixLabel ?? 'wet / dry' : def.params[m.key]?.label ?? m.key}`;
    };
    for (const id of used) {
      const s = describeSource(id);
      const fill = el('i');
      // Under each source, everything it is moving in this preset.
      const targets = live.filter((m) => m.source === id).map(target).filter(Boolean);
      const to = targets.length ? `→ ${targets.join(', ')}` : '→ an effect that is no longer in the chain';
      mini.append(
        el('div', { class: 'meter', title: id }, [
          el('span', { text: s.label.startsWith(s.group) ? s.label : `${s.group} ${s.label}` }),
          el('div', { class: `bar${s.bipolar ? ' bipolar' : ''}` }, [fill]),
          el('div', { class: 'to', text: to, title: to }),
        ]),
      );
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
    const { globals } = store.state;
    blackout.classList.toggle('on', globals.blackout);
    freeze.classList.toggle('on', globals.freeze);
    bypass.classList.toggle('on', globals.bypassAll);
    syncInputs();
    if (document.activeElement !== bpm) bpm.value = String(store.state.tempo.bpm);
    syncMonitor();
  }

  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace') {
      buildFaders();
      buildMini();
      syncMix();
    } else if (op.op === 'param' || (op.op === 'item' && op.list === 'chain')) {
      syncFaders();
      syncMix();
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
  ui.onStatus(syncInputs);
  ui.onHost(syncMonitor);

  root.append(panic, center, side, strip);
  buildFaders();
  buildMini();
  buildTiles();
  syncState();
}

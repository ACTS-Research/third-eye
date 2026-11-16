// The perform screen: panic controls, the monitor, eight faders for the
// current preset, and the strip of presets and the running order (strip.js).
// Everything here is MIDI-mappable.

import { EFFECT_BY_ID } from '../effects/index.js';
import { THUMB_H, THUMB_W } from '../engine/pipeline.js';
import { MIX_MODES, mixItem, runAction } from '../shared/actions.js';
import { macroUnit, macroValue, resolveMacros } from '../shared/macros.js';
import { describeSource } from '../shared/sources.js';
import { INPUT_KINDS, INPUT_LABELS, makeEffect, sceneOf } from '../shared/state.js';
import { el } from '../shared/util.js';
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
  // Under the picture: a small live view of input A, the bar that mixes B
  // in, a small live view of input B, and the mode of the mix. Pointing at a
  // view slides its four source icons out over the end of the bar; pointing
  // at an icon shows that source in the view without choosing it. The bar
  // and the mode belong to the preset's Mix B effect; in a preset without
  // one the first drag of the bar adds it. Everything that pops up from
  // this strip opens upward (the owner's choice: over the picture, for that
  // moment only).
  const ICONS = {
    phone: '<rect x="5" y="2" width="6" height="12" rx="1.5"/>',
    camera: '<rect x="2" y="5" width="9" height="7"/><path d="M11 8l3-2v5l-3-2z"/>',
    pattern: '<rect x="2" y="3" width="12" height="10"/><path d="M6 3v10M10 3v10"/>',
    file: '<rect x="2" y="3" width="12" height="10"/><path d="M7 6l3 2-3 2z"/>',
  };
  const kindOf = (slot) => (slot === 'a' ? store.state.input.kind : store.state.input.kindB);
  const stateOf = (slot) => {
    const kind = kindOf(slot);
    const seen = slot === 'a' ? ui.status?.input : ui.status?.inputB;
    return seen?.kind === kind ? seen.state : '';
  };
  const needsFile = (slot) => kindOf(slot) === 'file' && stateOf(slot) === 'no-signal';
  function caption(slot) {
    const name = slot.toUpperCase();
    const kind = kindOf(slot);
    if (!kind) return `${name} · off`;
    const state = stateOf(slot);
    return `${name} · ${INPUT_LABELS[kind]} · ${needsFile(slot) ? 'choose…' : INPUT_STATE_TEXT[state] ?? (state || '—')}`;
  }
  // Why a source that is not showing has no picture to preview.
  const NOT_READY = { phone: 'not paired, or its camera is off', camera: 'starts when chosen', file: 'no file loaded' };

  const tip = el('div', { class: 'strip-tip', role: 'status', hidden: true });
  // `say` is a function so the words follow what happens while the pointer
  // rests there (a camera starting, a phone pairing).
  let tipSay = null;
  function showTip(say, slot) {
    tipSay = say || null;
    if (slot) tip.classList.toggle('right', slot === 'b');
    refreshTip();
  }
  function refreshTip() {
    const text = tipSay?.() ?? '';
    tip.textContent = text;
    tip.hidden = !text;
  }
  const peeking = { a: '', b: '' };
  function peek(slot, kind) {
    if (peeking[slot] === kind) return;
    peeking[slot] = kind;
    bus.send('peek', { ...peeking });
    syncInputs();
  }

  function inputView(slot) {
    const isA = slot === 'a';
    const other = isA ? 'b' : 'a';
    const pic = el('canvas', { class: 'inview-pic', width: THUMB_W, height: THUMB_H, 'aria-hidden': 'true' });
    const tag = el('span', { class: 'inview-tag' });
    const note = el('span', { class: 'inview-note' });
    const view = el('button', { class: 'inview-view', id: `input-${slot}`, 'aria-haspopup': 'true', 'aria-expanded': 'false' }, [pic, tag, note]);
    const buttons = {};
    const icons = el('div', { class: 'inview-icons', role: 'group', 'aria-label': `Source for input ${slot.toUpperCase()}` });
    // What clicking an icon would do, said before it is done.
    const describe = (kind, i) => {
      const mine = kindOf(slot);
      const ready = ui.status?.sources?.[kind];
      const head = `${i + 1} · ${INPUT_LABELS[kind]}`;
      if (kind === mine) return isA ? `${head} · A is showing this` : `${head} · B is showing this. Click to turn B off`;
      if (kind === kindOf(other)) return !isA && !mine ? `${head} · in use by A` : `${head} · click to trade places with ${other.toUpperCase()}`;
      return `${head} · ${ready ? 'ready' : NOT_READY[kind]}. Click to make it ${slot.toUpperCase()}`;
    };
    INPUT_KINDS.forEach((kind, i) => {
      const button = el('button', { class: 'inview-icon', 'data-kind': kind, 'data-midi': `${isA ? 'input' : 'inputB'}:${kind}`, 'aria-label': `Input ${slot.toUpperCase()}: ${INPUT_LABELS[kind]}` });
      button.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4">${ICONS[kind]}</svg>`;
      const enter = () => {
        showTip(() => describe(kind, i), slot);
        peek(slot, kind === kindOf(slot) ? '' : kind);
      };
      const leave = () => {
        showTip(null);
        peek(slot, '');
      };
      button.addEventListener('pointerenter', enter);
      button.addEventListener('focus', enter);
      button.addEventListener('pointerleave', leave);
      button.addEventListener('blur', leave);
      button.addEventListener('click', () => {
        const mine = kindOf(slot);
        if (!isA && kind === mine) runAction(store, 'inputB', 'off');
        else runAction(store, isA ? 'input' : 'inputB', kind);
        // Nothing to play yet: ask for the file here and now.
        if (kind === 'file' && kindOf(slot) === 'file' && (!ui.hasVideoFile?.() || needsFile(slot))) ui.pickVideoFile?.();
        peek(slot, '');
        showTip(() => describe(kind, i), slot);
      });
      buttons[kind] = button;
      icons.append(button);
    });
    const node = el('div', { class: `inview ${slot}`, id: `inview-${slot}` }, isA ? [view, icons] : [icons, view]);
    // The icons are out while the pointer or the keyboard is on the view or
    // on them, and a click on the view holds them out (for a touch screen).
    view.addEventListener('click', () => node.classList.toggle('open'));
    view.addEventListener('pointerenter', () => showTip(() => caption(slot), slot));
    view.addEventListener('pointerleave', () => showTip(null));
    node.addEventListener('pointerleave', () => node.classList.remove('open'));
    return { node, view, pic, tag, note, buttons };
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
    viewA.pic.getContext('2d').putImageData(thumbs, 0, 0, 0, 0, THUMB_W, THUMB_H);
    viewB.pic.getContext('2d').putImageData(thumbs, -THUMB_W, 0, THUMB_W, 0, THUMB_W, THUMB_H);
  });

  // ---- the bar
  const mixFill = el('div', { class: 'fill' });
  const mixText = el('span', { class: 'mixbar-text' });
  const mixBar = el('div', { class: 'mixbar', id: 'mixbar', role: 'slider', tabindex: '0', 'aria-label': 'Mix of input B', 'aria-valuemin': '0', 'aria-valuemax': '1' }, [mixFill, mixText]);
  const setMix = (value) => {
    const mix = Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
    const item = mixItem(store.state);
    if (item) {
      ui.lastTouched = { uid: item.uid, key: 'mix' };
      store.patchItem('chain', item.uid, { mix });
      return;
    }
    // No Mix B in this preset: the bar adds one, a plain fade in front of
    // every other effect, so the chain treats the mixed picture.
    const scene = sceneOf(store.state);
    scene.chain.unshift(makeEffect('mixb', { mix }));
    store.setScene(scene);
  };
  const dragMix = (e) => {
    const r = mixBar.getBoundingClientRect();
    setMix((e.clientX - r.left) / r.width);
  };
  mixBar.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('midi-map')) return;
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
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    setMix((mixItem(store.state)?.mix ?? 0) + step);
  });

  // ---- the mode
  const modeText = el('span', { class: 'mixmode-text' });
  const modeButton = el('button', { class: 'mixmode', id: 'mix-mode', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, [modeText, el('span', { 'aria-hidden': 'true', text: '▴' })]);
  const modeButtons = MIX_MODES.map(([name, value]) => {
    const b = el('button', { text: name, 'data-value': String(value), 'data-midi': `mixMode:${value}`, onclick: () => runAction(store, 'mixMode', value) });
    return [value, b];
  });
  const modeGrid = el('div', { class: 'mixmode-grid', id: 'mix-modes', role: 'group', 'aria-label': 'Mode of the mix', hidden: true }, modeButtons.map(([, b]) => b));
  const openModes = (on) => {
    modeGrid.hidden = !on;
    modeButton.setAttribute('aria-expanded', String(on));
    if (on) ui.midiMap?.refresh();
  };
  modeButton.addEventListener('click', () => openModes(modeGrid.hidden));
  // It stays open while modes are tried; a click anywhere else, or Esc,
  // closes it.
  document.addEventListener('pointerdown', (e) => {
    if (!modeGrid.hidden && !modeGrid.contains(e.target) && !modeButton.contains(e.target)) openModes(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modeGrid.hidden) openModes(false);
  });

  const mixRow = el('div', { class: 'mixrow', 'aria-label': 'Inputs and mix' }, [viewA.node, mixBar, viewB.node, modeButton, modeGrid, tip]);
  const center = el('div', { class: 'center' }, [monitor, mixRow]);

  function syncMix() {
    const item = mixItem(store.state);
    const { kindB } = store.state.input;
    mixBar.classList.toggle('none', !item);
    mixFill.style.width = `${item ? item.mix * 100 : 0}%`;
    mixBar.setAttribute('aria-valuenow', String(item ? item.mix : 0));
    mixText.textContent = !item ? 'Drag to mix B in' : item.bypass ? 'Mix B is bypassed' : !kindB ? 'B is off' : '';
    mixBar.title = item ? 'Drag to mix input B in.' : 'Drag to mix input B in. This adds the Mix B effect to the preset.';
    const mode = item ? MIX_MODES.find(([, v]) => v === item.params.mode)?.[0] ?? '' : '';
    modeText.textContent = mode || 'Mode';
    modeButton.disabled = !item;
    modeButton.title = item ? 'How B is mixed in' : 'Drag the bar first: there is no Mix B in this preset yet.';
    if (!item) openModes(false);
    for (const [value, b] of modeButtons) b.setAttribute('aria-pressed', String(!!item && item.params.mode === value));
  }

  function syncInputs() {
    for (const [slot, v] of [['a', viewA], ['b', viewB]]) {
      const kind = kindOf(slot);
      const state = stateOf(slot);
      const looking = peeking[slot];
      v.view.dataset.caption = caption(slot);
      v.view.setAttribute('aria-label', `Input ${caption(slot)}. Its sources are beside it.`);
      v.view.classList.toggle('warn', !!state && state !== 'live' && state !== 'stalled');
      v.view.classList.toggle('bad', state === 'stalled');
      v.node.classList.toggle('off', !kind && !looking);
      v.node.classList.toggle('peek', !!looking);
      // A source with nothing to show: its name alone, not the last picture.
      v.node.classList.toggle('blank', !!looking && !ui.status?.sources?.[looking]);
      v.tag.textContent = looking ? `${slot.toUpperCase()}?` : slot.toUpperCase();
      // Words where there is no picture: B off, or a source that cannot be
      // previewed yet.
      v.note.textContent = looking ? (ui.status?.sources?.[looking] ? '' : INPUT_LABELS[looking]) : !kind ? 'off' : needsFile(slot) ? 'choose…' : '';
      for (const k of INPUT_KINDS) v.buttons[k].setAttribute('aria-pressed', String(k === kind));
    }
    refreshTip();
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

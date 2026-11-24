// The edit screen for one preset. At the left the picture, with the chain as
// a row of buttons under it and the faders as the perform screen will show
// them; at the right four tabs: the open effect's parameters (chain.js),
// the chosen faders (here), modulation and the LFOs (mod-panel.js). Changes are saved
// into the preset as you make them; Revert goes back to how it was when the
// screen was opened.

import { MACRO_COUNT, macroUnit, resolveMacros } from '../shared/macros.js';
import { MAX_FADE } from '../shared/presets.js';
import { sceneOf } from '../shared/state.js';
import { debounce, el } from '../shared/util.js';
import { digitsFor } from './controls.js';
import { mountBlink } from './blink-panel.js';
import { attachPreview } from './preview.js';

export function mountEdit(root, ui) {
  const { store, presets } = ui;
  let opened = null; // { index, preset } as it was when editing began

  const num = el('span', { class: 'num' });
  const name = el('input', {
    type: 'text',
    maxLength: 60,
    'aria-label': 'Preset name',
    placeholder: 'Preset name',
    oninput: () => presets.update(presets.current, { name: name.value.trim() || 'Untitled' }),
  });
  const fade = el('input', {
    type: 'number',
    min: '0',
    max: String(MAX_FADE),
    step: '0.1',
    id: 'preset-fade',
    oninput: () => {
      const v = Number(fade.value);
      if (Number.isFinite(v)) presets.update(presets.current, { fade: Math.min(MAX_FADE, Math.max(0, v)) });
    },
  });
  const saved = el('span', { class: 'dim small saved' });
  const saveNew = el('button', { class: 'primary', text: 'Save as new preset', onclick: () => ui.editPreset(presets.addFromLive()) });
  const duplicate = el('button', { text: 'Duplicate', title: 'A copy of this preset, placed after it', onclick: () => {
    const i = presets.current;
    const index = presets.addFromLive(`${presets.list[i].name} copy`, i);
    presets.update(index, { fade: presets.list[i].fade });
    ui.editPreset(index);
  } });
  const revert = el('button', { class: 'revert', text: 'Revert', title: 'Back to how this preset was when you opened it', onclick: () => {
    if (!opened || opened.index !== presets.current || ui.blinkCapture) return;
    presets.update(opened.index, structuredClone(opened.preset));
    store.dispatch({ op: 'scene', scene: opened.preset.scene, fade: 0, presetIndex: opened.index });
    saved.textContent = 'Reverted.';
    ui.markChanges?.();
  } });
  // What Revert would go back to, for the marks on the Parameters tab.
  // (While a blink is being captured, the marks are against the chain as
  // it was when the capture began.)
  ui.openedScene = () => (ui.blinkCapture ? { chain: ui.blinkCapture.chain } : opened && opened.index === presets.current ? opened.preset.scene : null);
  // Revert says how many sliders it would put back, and is dim with nothing to undo.
  let changeCount = 0;
  function labelRevert() {
    const p = presets.list[presets.current];
    const dirty = !!opened && opened.index === presets.current && !!p && (changeCount > 0 || JSON.stringify(sceneOf(store.state)) !== JSON.stringify(opened.preset.scene) || p.name !== opened.preset.name);
    revert.textContent = changeCount ? `Revert ${changeCount}` : 'Revert';
    revert.title = changeCount ? `Puts ${changeCount} slider${changeCount === 1 ? '' : 's'} back to how this preset was when you opened it` : 'Back to how this preset was when you opened it';
    revert.classList.toggle('idle', !dirty);
  }
  ui.onChangeCount = (n) => {
    // (Not the capture's count: those sliders are on their way back.)
    if (ui.blinkCapture) return;
    changeCount = n;
    labelRevert();
  };
  const remove = el('button', { text: 'Delete preset', title: 'Deletes this whole preset. To take one effect out, use ✕ on the Parameters tab.', onclick: () => {
    const p = presets.list[presets.current];
    if (!p || !confirm(`Delete the whole preset "${p.name}"?\n\nThis removes the preset, not one effect, and cannot be undone.`)) return;
    presets.remove(presets.current);
    ui.setView('perform');
  } });
  const fadeFields = el('div', { class: 'row grow' }, [el('label', { for: 'preset-fade', text: 'Fade in' }), fade, el('span', { text: 's' })]);
  const presetActions = el('div', { class: 'row' }, [duplicate, revert, remove]);

  const head = el('div', { class: 'edit-head' }, [
    num,
    name,
    // The preset's own buttons sit by its name, away from the effect's
    // controls on the right (a preset was deleted for an effect once).
    presetActions,
    fadeFields,
    saveNew,
    saved,
  ]);

  // Left: the picture, the chain as a row under it, and the faders as the
  // perform screen will show them. Right: three tabs.
  const pictureCol = el('div', { class: 'col', id: 'col-chain' });
  const sideCol = el('div', { class: 'col', id: 'col-edit-side' });
  const canvas = el('canvas', { class: 'readback', width: 480, height: 270 });
  attachPreview(ui, canvas);
  ui.monitors.edit = el('div', { class: 'edit-monitor' }, [canvas]);
  const chainRow = el('nav', { class: 'chain-row', 'aria-label': 'Effects chain' });

  // ------------------------------------------- faders, as on perform ---
  const previewSlots = el('div', { class: 'fader-preview' });
  const previewNote = el('span', { class: 'dim small' });
  function buildPreview() {
    const macros = resolveMacros(store.state);
    previewSlots.replaceChildren(
      ...macros.map((m) => {
        if (!m) return el('div', { class: 'mini-fader unused' }, [el('div', { class: 'box' })]);
        const unit = Math.min(1, Math.max(0, macroUnit(m, m.value)));
        return el('div', { class: `mini-fader${m.auto ? ' auto' : ''}`, title: `${m.effectIndex + 1} ${m.effect} · ${m.label}` }, [
          el('div', { class: 'box' }, [el('i', { style: `height:${unit * 100}%` })]),
          el('b', { text: Number(m.value).toFixed(digitsFor(m.step)) }),
          el('span', { text: m.label }),
        ]);
      }),
    );
    const chosen = pins().length;
    previewNote.textContent = chosen ? `${chosen} of ${MACRO_COUNT} chosen` : store.state.chain.length ? 'None chosen: the first sliders of each effect' : '';
  }
  pictureCol.append(
    ui.monitors.edit,
    chainRow,
    el('div', { class: 'preview-wrap' }, [el('div', { class: 'preview-head' }, [el('span', { class: 'caps', text: 'As on the perform screen' }), previewNote]), previewSlots]),
  );

  // ------------------------------------------------------ pinned faders ---
  // Kept in the scene as up to eight slots. Here they are a plain ordered
  // list: pressing Fader on a slider adds it to the end.
  const pins = () => (store.state.macros ?? []).filter(Boolean);
  function setPins(list) {
    const scene = sceneOf(store.state);
    scene.macros = Array.from({ length: MACRO_COUNT }, (_, k) => list[k] ?? null);
    store.setScene(scene);
  }
  ui.pinIndex = (fx, key) => pins().findIndex((s) => s.fx === fx && s.key === key);
  ui.togglePin = (fx, key) => {
    const list = pins();
    const at = list.findIndex((s) => s.fx === fx && s.key === key);
    if (at >= 0) list.splice(at, 1);
    else if (list.length < MACRO_COUNT) list.push({ fx, key });
    else return false;
    setPins(list);
    return true;
  };

  const pinList = el('div', { class: 'pin-list' });
  const pinNote = el('div', { class: 'dim small' });
  function buildPins() {
    const list = pins();
    const labels = Object.fromEntries(Object.entries(ui.targetOptions?.() ?? {}).map(([label, value]) => [value, label]));
    const move = (i, j) => {
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      setPins(list);
    };
    pinList.replaceChildren(
      ...list.map((slot, i) => {
        const name = labels[`${slot.fx}:${slot.key}`] ?? 'an effect that is no longer in the chain';
        return el('div', { class: 'pin' }, [
          el('span', { class: 'num', text: String(i + 1) }),
          el('button', { class: 'pin-name', text: name, title: 'Show this slider', onclick: () => ui.showParam?.(slot.fx, slot.key) }),
          el('button', { class: 'icon', text: '↑', 'aria-label': `Move fader ${i + 1} up`, disabled: i === 0, onclick: () => move(i, i - 1) }),
          el('button', { class: 'icon', text: '↓', 'aria-label': `Move fader ${i + 1} down`, disabled: i === list.length - 1, onclick: () => move(i, i + 1) }),
          el('button', { class: 'icon', text: '✕', 'aria-label': `Take fader ${i + 1} off the perform screen`, onclick: () => setPins(list.filter((_, k) => k !== i)) }),
        ]);
      }),
    );
    pinNote.textContent = list.length
      ? 'The faders on the perform screen, in this order.'
      : 'Nothing chosen: the perform screen shows the first sliders of each effect. Press Fader on a slider to choose your own.';
  }

  // ---------------------------------------------------------------- tabs ---
  const panes = {
    params: el('div', { class: 'tab-pane', id: 'tab-params' }),
    faders: el('div', { class: 'tab-pane', id: 'faders-panel' }, [pinList, pinNote]),
    mods: el('div', { class: 'tab-pane', id: 'tab-mods' }),
    lfos: el('div', { class: 'tab-pane', id: 'lfo-panel' }),
    blink: el('div', { class: 'tab-pane', id: 'blink-panel' }),
  };
  const captureBand = el('div', { id: 'blink-band', hidden: true });
  const tabButtons = {};
  const tabBar = el('div', { class: 'tabs', role: 'group', 'aria-label': 'What to edit' });
  for (const [id, text] of [['params', 'Parameters'], ['faders', 'Faders'], ['mods', 'Modulation'], ['lfos', 'LFOs'], ['blink', 'Blink']]) {
    tabButtons[id] = el('button', { 'data-tab': id, text, onclick: () => ui.setEditTab(id) });
    tabBar.append(tabButtons[id]);
  }
  ui.editTab = 'params';
  ui.setEditTab = (id) => {
    ui.editTab = panes[id] ? id : 'params';
    for (const [key, pane] of Object.entries(panes)) {
      pane.hidden = key !== ui.editTab;
      tabButtons[key].setAttribute('aria-pressed', String(key === ui.editTab));
    }
  };
  function labelTabs() {
    tabButtons.faders.textContent = `Faders · ${pins().length}`;
    tabButtons.mods.textContent = `Modulation · ${store.state.mappings.length}`;
  }
  sideCol.append(tabBar, captureBand, panes.params, panes.faders, panes.mods, panes.lfos, panes.blink);
  ui.setEditTab('params');
  ui.blinkRoots = { pane: panes.blink, band: captureBand };

  function buildSlots() {
    buildPins();
    buildPreview();
    labelTabs();
  }

  // --------------------------------------------------------------- sync ---
  function sync() {
    const i = presets.current;
    const p = presets.list[i];
    num.textContent = p ? String(i + 1) : '';
    name.hidden = !p;
    fadeFields.hidden = !p;
    presetActions.hidden = !p;
    saveNew.hidden = !!p;
    if (p) {
      if (document.activeElement !== name) name.value = p.name;
      if (document.activeElement !== fade) fade.value = String(p.fade ?? store.state.globals.fadeTime);
      if (!opened || opened.index !== i) {
        opened = { index: i, preset: structuredClone(p) };
        ui.markChanges?.();
      }
    } else {
      opened = null;
      saved.textContent = 'This look is not saved as a preset yet.';
    }
  }

  // Edits made on this screen go straight into the preset.
  const autosave = debounce(() => {
    if (ui.view !== 'edit' || !presets.list[presets.current] || ui.blinkCapture) return;
    presets.saveLiveInto(presets.current);
    saved.textContent = 'Saved.';
  }, 300);

  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace') buildSlots();
    else if (op.op === 'param' || (op.op === 'item' && op.list === 'chain')) buildPreview();
    else if (op.op === 'item' && op.list === 'mappings') labelTabs();
    const edit = op.op === 'param' || op.op === 'item' || (op.op === 'scene' && !Number.isInteger(op.presetIndex)) || (op.op === 'merge' && op.key === 'blink');
    // (Not while a blink is being captured: the sliders are only visiting.)
    if (edit && ui.view === 'edit' && presets.list[presets.current] && !ui.blinkCapture) {
      saved.textContent = 'Saving…';
      autosave();
    }
  });
  presets.onChange(sync);
  ui.onView((view) => {
    if (view !== 'edit') return;
    // Start a fresh "revert" point each time the screen is opened.
    opened = null;
    saved.textContent = '';
    sync();
    buildSlots();
  });

  root.append(head, el('div', { class: 'edit-body' }, [pictureCol, sideCol]));
  ui.editCols = { chain: chainRow, params: panes.params, mods: panes.mods, lfos: panes.lfos };
  ui.refreshSlots = buildSlots;
  sync();
}

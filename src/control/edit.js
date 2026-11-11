// The edit screen for one preset: its name, fade-in time, effects chain,
// pinned faders and modulation. Changes are saved into the preset as you make
// them; Revert goes back to how it was when the screen was opened.

import { MACRO_COUNT } from '../shared/macros.js';
import { MAX_FADE } from '../shared/presets.js';
import { sceneOf } from '../shared/state.js';
import { debounce, el } from '../shared/util.js';
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
  const saved = el('span', { class: 'dim small' });
  const saveNew = el('button', { class: 'primary', text: 'Save as new preset', onclick: () => ui.editPreset(presets.addFromLive()) });
  const duplicate = el('button', { text: 'Duplicate', onclick: () => {
    const i = presets.current;
    const index = presets.addFromLive(`${presets.list[i].name} copy`, i);
    presets.update(index, { fade: presets.list[i].fade });
    ui.editPreset(index);
  } });
  const revert = el('button', { text: 'Revert', title: 'Back to how this preset was when you opened it', onclick: () => {
    if (!opened || opened.index !== presets.current) return;
    presets.update(opened.index, structuredClone(opened.preset));
    store.dispatch({ op: 'scene', scene: opened.preset.scene, fade: 0, presetIndex: opened.index });
    saved.textContent = 'Reverted.';
  } });
  const remove = el('button', { text: 'Delete', onclick: () => {
    const p = presets.list[presets.current];
    if (!p || !confirm(`Delete preset "${p.name}"?`)) return;
    presets.remove(presets.current);
    ui.setView('perform');
  } });
  const presetFields = el('div', { class: 'row grow' }, [name, el('label', { for: 'preset-fade', text: 'Fade in' }), fade, el('span', { text: 's' })]);
  const presetActions = el('div', { class: 'row' }, [duplicate, revert, remove]);

  const head = el('div', { class: 'edit-head' }, [
    el('button', { text: '← Perform', onclick: () => ui.setView('perform') }),
    num,
    presetFields,
    saveNew,
    saved,
    presetActions,
  ]);

  const chainCol = el('div', { class: 'col', id: 'col-chain' });
  const sideCol = el('div', { class: 'col', id: 'col-edit-side' });
  const canvas = el('canvas', { width: 480, height: 270 });
  attachPreview(ui, canvas);
  sideCol.append(el('div', { class: 'edit-monitor' }, [canvas]));

  // ------------------------------------------------------ pinned faders ---
  const slots = el('div');
  const slotNote = el('div', { class: 'dim small' });

  function setSlot(i, value) {
    const scene = sceneOf(store.state);
    const macros = Array.from({ length: MACRO_COUNT }, (_, k) => scene.macros[k] ?? null);
    if (value) {
      const [fx, key] = value.split(':');
      macros[i] = { fx, key };
    } else {
      macros[i] = null;
    }
    scene.macros = macros;
    store.setScene(scene);
  }

  function buildSlots() {
    slots.replaceChildren();
    const targets = ui.targetOptions?.() ?? {};
    const pinned = store.state.macros ?? [];
    for (let i = 0; i < MACRO_COUNT; i++) {
      const select = el('select', { 'aria-label': `Fader ${i + 1}`, onchange: () => setSlot(i, select.value) }, [
        el('option', { value: '', text: '—' }),
        ...Object.entries(targets).map(([label, value]) => el('option', { value, text: label })),
      ]);
      select.value = pinned[i] ? `${pinned[i].fx}:${pinned[i].key}` : '';
      slots.append(el('div', { class: 'slot' }, [el('span', { text: String(i + 1) }), select]));
    }
    slotNote.textContent = pinned.some(Boolean)
      ? 'These parameters appear as the faders on the perform screen, in this order.'
      : 'Nothing pinned: the perform screen shows the first parameters of the chain. Choose any here to take over.';
  }

  sideCol.append(el('div', { class: 'panel', id: 'faders-panel' }, [el('h2', { text: 'Perform faders' }), slots, slotNote]));

  // --------------------------------------------------------------- sync ---
  function sync() {
    const i = presets.current;
    const p = presets.list[i];
    num.textContent = p ? String(i + 1) : '';
    presetFields.hidden = !p;
    presetActions.hidden = !p;
    saveNew.hidden = !!p;
    if (p) {
      if (document.activeElement !== name) name.value = p.name;
      if (document.activeElement !== fade) fade.value = String(p.fade ?? store.state.globals.fadeTime);
      if (!opened || opened.index !== i) opened = { index: i, preset: structuredClone(p) };
    } else {
      opened = null;
      saved.textContent = 'This look is not saved as a preset yet.';
    }
  }

  // Edits made on this screen go straight into the preset.
  const autosave = debounce(() => {
    if (ui.view !== 'edit' || !presets.list[presets.current]) return;
    presets.saveLiveInto(presets.current);
    saved.textContent = 'Saved.';
  }, 300);

  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace') buildSlots();
    const edit = op.op === 'param' || op.op === 'item' || (op.op === 'scene' && !Number.isInteger(op.presetIndex));
    if (edit && ui.view === 'edit' && presets.list[presets.current]) {
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

  root.append(head, el('div', { class: 'edit-body' }, [chainCol, sideCol]));
  ui.editCols = { chain: chainCol, side: sideCol };
  ui.refreshSlots = buildSlots;
  sync();
}

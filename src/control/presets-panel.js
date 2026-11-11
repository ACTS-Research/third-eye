// Presets: list, save / update / delete, crossfade time, JSON export / import.

import { runAction } from '../shared/actions.js';
import { applyPreset, exportPresets, loadPresets, parsePresetFile, resetPresets, savePresets, snapshotPreset } from '../shared/presets.js';
import { sceneOf } from '../shared/state.js';
import { el } from '../shared/util.js';

export function mountPresetsPanel(root, ui) {
  const { store } = ui;
  let presets = loadPresets();

  const list = el('div', { class: 'preset-list' });
  const name = el('input', { type: 'text', class: 'grow', placeholder: 'Preset name', maxLength: 60 });
  const note = el('div', { class: 'dim small' });
  const fade = el('input', {
    type: 'range',
    min: '0',
    max: '10',
    step: '0.1',
    class: 'grow',
    oninput: () => store.merge('globals', { fadeTime: Number(fade.value) }),
  });
  const fadeLabel = el('span', { class: 'dim', style: 'width:44px;text-align:right' });

  const current = () => store.state.presetIndex;
  const persist = () => {
    savePresets(presets);
    render();
  };

  function render() {
    list.replaceChildren();
    presets.forEach((p, i) => {
      list.append(
        el('button', { class: i === current() ? 'on' : '', title: 'Load with crossfade', onclick: () => applyPreset(store, i) }, [
          el('span', { class: 'num', text: String(i + 1) }),
          p.name,
        ]),
      );
    });
    if (!presets.length) list.append(el('div', { class: 'dim small', text: 'No presets yet. Save the current chain as one.' }));
    const g = store.state.globals;
    fade.value = String(g.fadeTime);
    fadeLabel.textContent = `${g.fadeTime.toFixed(1)} s`;
    if (document.activeElement !== name) name.value = presets[current()]?.name ?? '';
  }

  function saveNew() {
    const label = name.value.trim() || `Preset ${presets.length + 1}`;
    presets.push(snapshotPreset(store, label));
    savePresets(presets);
    // Mark it current without re-triggering a crossfade.
    store.dispatch({ op: 'scene', scene: presets.at(-1).scene, fade: 0, presetIndex: presets.length - 1 });
    note.textContent = `Saved "${label}".`;
  }

  function update() {
    const i = current();
    if (!presets[i]) return saveNew();
    presets[i] = snapshotPreset(store, name.value.trim() || presets[i].name);
    persist();
    note.textContent = `Updated "${presets[i].name}".`;
  }

  function remove() {
    const i = current();
    if (!presets[i]) return;
    const [gone] = presets.splice(i, 1);
    savePresets(presets);
    store.dispatch({ op: 'scene', scene: sceneOf(store.state), fade: 0, presetIndex: -1 });
    note.textContent = `Deleted "${gone.name}".`;
  }

  function download() {
    const blob = new Blob([exportPresets(presets)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'third-eye-presets.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const picker = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    style: 'display:none',
    onchange: async () => {
      const file = picker.files[0];
      picker.value = '';
      if (!file) return;
      try {
        const incoming = parsePresetFile(await file.text());
        presets.push(...incoming);
        persist();
        note.textContent = `Imported ${incoming.length} preset${incoming.length === 1 ? '' : 's'}.`;
      } catch (err) {
        note.textContent = `Import failed: ${err.message}`;
      }
    },
  });

  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace' || (op.op === 'merge' && op.key === 'globals')) render();
  });
  // Another control window may have edited the list.
  window.addEventListener('storage', () => {
    presets = loadPresets();
    render();
  });

  root.append(
    el('div', { class: 'panel', id: 'presets-panel' }, [
      el('h2', { text: 'Presets' }),
      list,
      el('div', { class: 'row' }, [
        el('button', { onclick: () => runAction(store, 'presetPrev') }, ['◀ ', el('kbd', { text: '[' })]),
        el('button', { onclick: () => runAction(store, 'presetNext') }, [el('kbd', { text: ']' }), ' ▶']),
        el('span', { class: 'dim small', text: 'Crossfade' }),
        fade,
        fadeLabel,
      ]),
      el('div', { class: 'row' }, [name, el('button', { text: 'Save new', onclick: saveNew }), el('button', { text: 'Update', onclick: update })]),
      el('div', { class: 'row' }, [
        el('button', { text: 'Delete', onclick: remove }),
        el('button', { text: 'Export', onclick: download }),
        el('button', { text: 'Import', onclick: () => picker.click() }),
        el('button', {
          text: 'Factory',
          title: 'Replace all presets with the factory set',
          onclick: () => {
            if (!confirm('Replace all presets with the factory set?')) return;
            resetPresets();
            presets = loadPresets();
            render();
          },
        }),
        picker,
      ]),
      note,
    ]),
  );
  render();
  ui.presets = { get list() { return presets; }, reload() { presets = loadPresets(); render(); } };
}

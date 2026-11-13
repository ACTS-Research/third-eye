// Preset file handling and the default fade, on the setup screen.

import { exportPresets, parsePresetFile, resetPresets } from '../shared/presets.js';
import { el } from '../shared/util.js';

export function mountLibraryPanel(root, ui) {
  const { store, presets } = ui;
  const note = el('div', { class: 'dim small keep-1', id: 'library-note' });
  const fade = el('input', {
    type: 'range',
    min: '0',
    max: '10',
    step: '0.1',
    class: 'grow',
    'aria-label': 'Default fade',
    oninput: () => store.merge('globals', { fadeTime: Number(fade.value) }),
  });
  const fadeLabel = el('span', { style: 'width:48px;text-align:right' });

  const picker = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    style: 'display:none',
    onchange: async () => {
      const file = picker.files[0];
      picker.value = '';
      if (!file) return;
      try {
        const { presets: incoming, order } = parsePresetFile(await file.text());
        presets.append(incoming);
        let text = `Imported ${incoming.length} preset${incoming.length === 1 ? '' : 's'}. They are at the end of the strip.`;
        // The file's running order comes too, but never over one you have
        // without asking.
        if (order.length) {
          if (!presets.steps.length || confirm(`This file has a running order of ${order.length} steps. Replace yours with it?`)) {
            presets.setSteps(order);
            text += ` Its running order (${order.length} steps) is now yours.`;
          } else {
            text += ' Your running order was kept.';
          }
        }
        note.textContent = text;
      } catch (err) {
        note.textContent = `Could not import: ${err.message}`;
      }
    },
  });

  function download() {
    const blob = new Blob([exportPresets(presets.list, presets.steps)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'third-eye-presets.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const sync = () => {
    const t = store.state.globals.fadeTime;
    fade.value = String(t);
    fadeLabel.textContent = `${t.toFixed(1)} s`;
  };
  store.subscribe((op) => {
    if (op.op === 'replace' || (op.op === 'merge' && op.key === 'globals')) sync();
  });

  root.append(
    el('div', { class: 'panel', id: 'library-panel' }, [
      el('h2', { text: 'Preset library' }),
      el('div', { class: 'row wrap' }, [
        el('button', { text: 'Export presets', onclick: download }),
        el('button', { text: 'Import presets', onclick: () => picker.click() }),
        el('button', {
          text: 'Restore factory set',
          onclick: () => {
            if (!confirm('Replace every preset with the factory set? The running order is cleared too.')) return;
            resetPresets();
            presets.reload();
            store.dispatch({ op: 'presetIndex', index: -1 });
            store.merge('order', { cue: -1, off: false });
            note.textContent = 'Factory presets restored.';
          },
        }),
        picker,
      ]),
      el('div', { class: 'row' }, [el('span', { class: 'caps', text: 'Default fade' }), fade, fadeLabel]),
      el('div', { class: 'dim small', text: 'Used by presets that have no fade time of their own. Name, fade and order are set per preset: use Edit on a preset, and drag tiles on the perform screen.' }),
      note,
    ]),
  );
  sync();
}

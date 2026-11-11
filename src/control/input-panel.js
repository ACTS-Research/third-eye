import { runAction } from '../shared/actions.js';
import { INPUT_KINDS, INPUT_LABELS } from '../shared/state.js';
import { el } from '../shared/util.js';

export function mountInputPanel(root, ui) {
  const { store, bus } = ui;
  let file = null;

  const kindButtons = {};
  const seg = el('div', { class: 'seg' });
  INPUT_KINDS.forEach((kind, i) => {
    const b = el('button', { onclick: () => runAction(store, 'input', kind) }, [
      el('span', { text: INPUT_LABELS[kind] }),
      el('kbd', { text: String(i + 1) }),
    ]);
    kindButtons[kind] = b;
    seg.append(b);
  });

  const fit = el('select', {
    class: 'grow',
    onchange: () => store.merge('input', { fit: fit.value }),
  }, [
    el('option', { value: 'cover', text: 'Fill (crop)' }),
    el('option', { value: 'contain', text: 'Fit (letterbox)' }),
    el('option', { value: 'stretch', text: 'Stretch' }),
  ]);
  const mirror = el('button', { text: 'Mirror', onclick: () => store.merge('input', { mirror: !store.state.input.mirror }) });

  const fileName = el('span', { class: 'dim grow', text: 'No video file loaded' });
  const picker = el('input', {
    type: 'file',
    accept: 'video/*',
    style: 'display:none',
    onchange: () => {
      file = picker.files[0] ?? null;
      if (!file) return;
      fileName.textContent = file.name;
      bus.send('file', { file });
      runAction(store, 'input', 'file');
    },
  });
  const fileRow = el('div', { class: 'row' }, [
    el('button', { text: 'Load video file…', onclick: () => picker.click() }),
    fileName,
    picker,
  ]);

  // The file lives in memory only: hand it over again if /output reloads.
  bus.on('hello', () => {
    if (file) bus.send('file', { file });
  });

  const sync = () => {
    const input = store.state.input;
    for (const kind of INPUT_KINDS) kindButtons[kind].classList.toggle('on', input.kind === kind);
    fit.value = input.fit;
    mirror.classList.toggle('on', input.mirror);
  };
  store.subscribe(sync);

  const panel = el('div', { class: 'panel', id: 'input-panel' }, [
    el('h2', { text: 'Input' }),
    seg,
    el('div', { class: 'row' }, [fit, mirror]),
    fileRow,
  ]);
  root.append(panel);
  sync();
  return panel;
}

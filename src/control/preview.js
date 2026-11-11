import { runAction } from '../shared/actions.js';
import { el } from '../shared/util.js';

export function mountPreview(root, ui) {
  const { store, bus } = ui;
  const canvas = el('canvas', { id: 'preview', width: 256, height: 144 });
  const note = el('div', { id: 'preview-note', text: 'Output window is not open' });
  const ctx = canvas.getContext('2d');
  let image = null;

  bus.on('preview', (m) => {
    const { width, height, pixels } = m;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      image = null;
    }
    image ??= ctx.createImageData(width, height);
    // GL rows arrive bottom-up.
    const stride = width * 4;
    for (let y = 0; y < height; y++) {
      image.data.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
    }
    ctx.putImageData(image, 0, 0);
  });

  const buttons = {};
  const transport = el('div', { class: 'transport' });
  const add = (key, label, kbd, action, cls = '') => {
    const b = el('button', { class: cls, onclick: () => runAction(store, action) }, [label, el('kbd', { text: kbd })]);
    buttons[key] = b;
    transport.append(b);
  };
  add('blackout', 'BLACKOUT', 'B', 'blackout', 'danger');
  add('freeze', 'FREEZE', 'Space', 'freeze');
  add('bypassAll', 'BYPASS FX', 'X', 'bypassAll');
  add('glitch', 'GLITCH', 'G', 'glitch');

  const sync = () => {
    const g = store.state.globals;
    buttons.blackout.classList.toggle('on', g.blackout);
    buttons.freeze.classList.toggle('on', g.freeze);
    buttons.bypassAll.classList.toggle('on', g.bypassAll);
    updateNote();
  };

  function updateNote() {
    let text = '';
    if (!ui.outputAlive) text = 'Output window is not open';
    else if (!store.state.globals.preview) text = 'Preview is off';
    note.textContent = text;
    note.classList.toggle('hidden', !text);
  }

  store.subscribe(sync);
  ui.onStatus(updateNote);
  store.onEvent((name) => {
    if (name !== 'glitch') return;
    buttons.glitch.classList.add('on');
    setTimeout(() => buttons.glitch.classList.remove('on'), 300);
  });

  root.append(
    el('div', { class: 'panel' }, [
      el('div', { id: 'preview-wrap' }, [canvas, note]),
      transport,
    ]),
  );
  sync();
}

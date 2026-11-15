import { runAction } from '../shared/actions.js';
import { INPUT_KINDS, INPUT_LABELS } from '../shared/state.js';
import { el } from '../shared/util.js';
import { menu } from './controls.js';

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

  const fit = menu({
    label: 'How the input fits the picture',
    cls: 'grow',
    options: [
      { value: 'cover', label: 'Fill (crop)' },
      { value: 'contain', label: 'Fit (letterbox)' },
      { value: 'stretch', label: 'Stretch' },
    ],
    value: store.state.input.fit,
    onChange: (v) => store.merge('input', { fit: v }),
  });
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
  // The perform screen opens this picker directly (the input buttons and
  // the line under them), so a file can be chosen without coming here.
  ui.pickVideoFile = () => picker.click();
  ui.hasVideoFile = () => !!file;
  const fileRow = el('div', { class: 'row' }, [
    el('button', { text: 'Load video file…', onclick: () => picker.click() }),
    fileName,
    picker,
  ]);

  // Local cameras. Permission is asked here, on the operator's screen, so
  // the engine can open the chosen device without ever showing a prompt.
  let cameras = [];
  const camera = menu({
    label: 'Local camera',
    id: 'camera-menu',
    cls: 'grow',
    options: () => [{ value: '', label: 'Default camera' }, ...cameras.map((d) => ({ value: d.deviceId, label: d.label }))],
    value: '',
    onChange: (v) => store.merge('input', { cameraId: v }),
  });
  const findCameras = el('button', { text: 'Find cameras', onclick: () => listCameras(true) });
  const cameraNote = el('div', { class: 'dim small keep-2' });

  async function listCameras(prompt) {
    if (!navigator.mediaDevices?.enumerateDevices) {
      cameraNote.textContent = 'Cameras need HTTPS or localhost.';
      return;
    }
    try {
      if (prompt) {
        const probe = await navigator.mediaDevices.getUserMedia({ video: true });
        for (const track of probe.getTracks()) track.stop();
      }
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const named = devices.filter((d) => d.label);
      cameras = named;
      const wanted = store.state.input.cameraId;
      camera.set(named.some((d) => d.deviceId === wanted) ? wanted : '');
      cameraNote.textContent = named.length
        ? ''
        : 'Click "Find cameras" to list them (Continuity Camera shows up as the iPhone\'s name).';
    } catch (err) {
      cameraNote.textContent = err.name === 'NotAllowedError' ? 'Camera access was denied in the browser.' : `Camera error: ${err.message}`;
    }
  }
  navigator.mediaDevices?.addEventListener?.('devicechange', () => listCameras(false));

  // The file lives in memory only: hand it over again when an output window
  // (re)loads, and when this page starts hosting the engine.
  bus.on('hello', () => {
    if (file) bus.send('file', { file });
  });
  let hosting = false;
  ui.onHost((host) => {
    const now = host.state === 'local';
    if (now && !hosting && file) bus.send('file', { file });
    hosting = now;
  });

  const sync = () => {
    const input = store.state.input;
    for (const kind of INPUT_KINDS) kindButtons[kind].classList.toggle('on', input.kind === kind);
    fit.set(input.fit);
    mirror.classList.toggle('on', input.mirror);
    if (cameras.some((d) => d.deviceId === input.cameraId)) camera.set(input.cameraId);
  };
  store.subscribe(sync);

  const panel = el('div', { class: 'panel', id: 'input-panel' }, [
    el('h2', { text: 'Input' }),
    seg,
    el('div', { class: 'row' }, [fit.node, mirror]),
    el('div', { class: 'row' }, [camera.node, findCameras]),
    cameraNote,
    fileRow,
  ]);
  root.append(panel);
  listCameras(false);
  sync();
  return panel;
}

// Recording: the REC button in the top bar, and the list of finished
// recordings on the setup screen. The engine writes the files into the browser's
// private storage; from here they are saved to disk or deleted.

import { runAction } from '../shared/actions.js';
import { el } from '../shared/util.js';
import { menu, toggle } from './controls.js';

const size = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`);
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function folder() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('recordings', { create: true });
}

export function mountRecordPanel(root, ui) {
  const { store } = ui;
  const button = document.getElementById('rec');
  button.addEventListener('click', () => runAction(store, 'record'));

  const list = el('div', { id: 'recordings' });
  const note = el('div', { class: 'dim small keep-2' });
  const format = menu({
    id: 'rec-format',
    cls: 'grow',
    label: 'Recording format',
    options: [
      { value: 'webm', label: 'WebM (written every second: safest)' },
      { value: 'mp4', label: 'MP4 (opens anywhere, written in large pieces)' },
    ],
    value: store.state.globals.recFormat,
    onChange: (v) => store.merge('globals', { recFormat: v }),
  });

  const saveFile = (file, name) => {
    const a = el('a', { href: URL.createObjectURL(file), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };
  // Each recording goes to the Downloads folder as it stops (a web page
  // cannot choose another folder without being asked each time). The copy
  // in the browser stays until it is deleted here, in case the download
  // was blocked or lost.
  const autoSave = toggle({
    on: store.state.globals.recAutoSave,
    text: 'Off',
    onText: 'On',
    label: 'Save each recording to Downloads when it stops',
    onChange: (on) => store.merge('globals', { recAutoSave: on }),
  });
  autoSave.node.id = 'rec-autosave';
  // The recording to save once the list has it.
  let saveWhenListed = '';

  async function refresh() {
    list.replaceChildren();
    let dir;
    try {
      dir = await folder();
    } catch {
      note.textContent = 'This browser has no private storage for recordings.';
      return;
    }
    const files = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind !== 'file') continue;
      // The file being written is locked; it shows up when recording stops.
      const file = await handle.getFile().catch(() => null);
      if (file) files.push({ name, handle, file });
    }
    files.sort((a, b) => b.name.localeCompare(a.name));
    const fresh = files.find((f) => f.name === saveWhenListed);
    if (fresh) {
      saveWhenListed = '';
      saveFile(fresh.file, fresh.name);
    }
    for (const { name, file } of files) {
      list.append(
        el('div', { class: 'recording' }, [
          el('span', { class: 'grow', text: name }),
          el('span', { text: size(file.size) }),
          el('button', { text: 'Save to disk', onclick: () => saveFile(file, name) }),
          el('button', {
            text: 'Delete',
            onclick: async () => {
              if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
              await dir.removeEntry(name);
              refresh();
            },
          }),
        ]),
      );
    }
    const usage = await navigator.storage.estimate?.().catch(() => null);
    const free = usage ? ` About ${size(Math.max(0, usage.quota - usage.usage))} of space left.` : '';
    note.textContent = files.length
      ? `A copy of each recording stays in the browser until you delete it here.${free}`
      : `Nothing recorded yet. Press REC or R.${free}`;
  }

  let finished = -1;
  ui.onStatus((status) => {
    const rec = status?.recording;
    button.disabled = !status;
    button.classList.toggle('on', !!rec?.active);
    button.textContent = rec?.active ? `REC ${clock(rec.seconds)}` : 'REC';
    button.title = rec?.active ? `Recording ${rec.name}, ${size(rec.bytes)} so far. Click or press R to stop.` : 'Record the output (R)';
    ui.setAlert?.('rec', rec?.error || null, 'bad', ui.alertTo?.panel('record-panel', 'Go to Recording'));
    if (rec && rec.finished !== finished) {
      // A recording has just stopped (not: this page has just opened).
      if (finished !== -1 && rec.finished > finished && store.state.globals.recAutoSave && rec.name) saveWhenListed = rec.name;
      finished = rec.finished;
      refresh();
    }
  });
  store.subscribe((op) => {
    if (op.op === 'replace' || (op.op === 'merge' && op.key === 'globals')) {
      format.set(store.state.globals.recFormat);
      autoSave.set(store.state.globals.recAutoSave);
    }
  });

  root.append(
    el('div', { class: 'panel', id: 'record-panel' }, [
      el('h2', { text: 'Recordings' }),
      el('div', { class: 'row' }, [el('span', { class: 'caps', text: 'Format' }), format.node, el('button', { text: 'Refresh', onclick: refresh })]),
      el('div', { class: 'row' }, [el('span', { class: 'caps grow', text: 'Save to Downloads when a recording stops' }), autoSave.node]),
      el('div', { class: 'dim small', text: 'Named ThirdEyeCam_ with the date and time, for example ThirdEyeCam_2026-11-17_14-55-45.mp4. They go to the folder Chrome downloads to (Chrome → Settings → Downloads sets which). Keep this page open while recording: it is the one that saves the file.' }),
      list,
      note,
      el('div', { class: 'dim small', text: 'Records exactly what the output shows, at the output size (1280×720 while no output window is open), with the audio input if it is on. Opening or closing the output window stops a recording. Recording uses extra GPU and CPU: check that Output still reads 60 fps.' }),
    ]),
  );
  refresh();
}

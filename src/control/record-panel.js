// Recording: the REC button in the top bar, and the list of finished
// recordings on the setup screen. /output writes the files into the browser's
// private storage; from here they are saved to disk or deleted.

import { runAction } from '../shared/actions.js';
import { el } from '../shared/util.js';

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
  const note = el('div', { class: 'dim small' });
  const format = el('select', {
    'aria-label': 'Recording format',
    onchange: () => store.merge('globals', { recFormat: format.value }),
  }, [el('option', { value: 'webm', text: 'WebM (written every second: safest)' }), el('option', { value: 'mp4', text: 'MP4 (opens anywhere, written in large pieces)' })]);

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
    for (const { name, file } of files) {
      list.append(
        el('div', { class: 'recording' }, [
          el('span', { class: 'grow', text: name }),
          el('span', { text: size(file.size) }),
          el('button', {
            text: 'Save to disk',
            onclick: () => {
              const a = el('a', { href: URL.createObjectURL(file), download: name });
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 60000);
            },
          }),
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
      ? `Recordings stay in the browser until you save or delete them.${free}`
      : `Nothing recorded yet. Press REC or R; recordings are kept in the browser until you save them.${free}`;
  }

  let finished = -1;
  ui.onStatus((status) => {
    const rec = status?.recording;
    button.disabled = !status;
    button.classList.toggle('on', !!rec?.active);
    button.textContent = rec?.active ? `REC ${clock(rec.seconds)} · ${size(rec.bytes)}` : 'REC';
    ui.setAlert?.('rec', rec?.error || null, 'bad');
    if (rec && rec.finished !== finished) {
      finished = rec.finished;
      refresh();
    }
  });
  store.subscribe((op) => {
    if (op.op === 'replace' || (op.op === 'merge' && op.key === 'globals')) format.value = store.state.globals.recFormat;
  });
  format.value = store.state.globals.recFormat;

  root.append(
    el('div', { class: 'panel', id: 'record-panel' }, [
      el('h2', { text: 'Recordings' }),
      el('div', { class: 'row' }, [el('span', { class: 'caps', text: 'Format' }), format, el('button', { text: 'Refresh', onclick: refresh })]),
      list,
      note,
      el('div', { class: 'dim small', text: 'Records exactly what the output shows, at the output size, with the audio input if it is on. Recording uses extra GPU and CPU: check that Output still reads 60 fps.' }),
    ]),
  );
  refresh();
}

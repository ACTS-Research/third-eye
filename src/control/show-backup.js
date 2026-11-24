// A copy of the live show, kept in a folder the operator chooses once
// (Chrome's File System Access). Each show is one file there, named after
// it, rewritten when the show changes: its steps, its tempo, or any preset
// it uses. It waits until nothing has changed for a while (`quietMs`), so a
// session of edits writes once.
//
// The folder is remembered in IndexedDB. Chrome may ask again, in a new
// session, before the page may write there; that needs a click (`allow()`),
// and until then changes wait. Nothing here runs in the output window.

import { exportShow, showFileName } from '../shared/presets.js';

const DB = 'thirdeye';
const STORE = 'handles';
const KEY = 'show-backup';
const QUIET_MS = 30000;

function idb(mode, run) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      // (Something that cannot be stored throws here, outside the promise:
      // it must still settle it, or whoever waits on it waits for ever.)
      try {
        const tx = open.result.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.oncomplete = () => {
          open.result.close();
          resolve(req?.result);
        };
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        open.result.close();
        reject(err);
      }
    };
  });
}

export function createShowBackup(presets) {
  const listeners = new Set();
  const backup = {
    // 'unsupported' | 'none' (no folder yet) | 'ask' (Chrome wants a click)
    // | 'on' | 'error'
    state: 'showDirectoryPicker' in window ? 'none' : 'unsupported',
    folder: '',
    savedAt: 0,
    savedName: '',
    error: '',
    pending: false,
    quietMs: QUIET_MS,
    handle: null,
    onChange(fn) {
      listeners.add(fn);
    },
  };
  const tell = () => {
    for (const fn of listeners) fn(backup);
  };
  // What was last written, per show id, so an unchanged show is not written.
  const written = new Map();
  let timer = 0;

  const textOf = () => {
    const show = presets.live;
    return { show, text: exportShow(show, presets.list) };
  };

  async function write() {
    timer = 0;
    if (backup.state !== 'on' || !backup.handle) return;
    const { show, text } = textOf();
    if (written.get(show.id) === text) {
      backup.pending = false;
      tell();
      return;
    }
    try {
      const name = showFileName(show.name);
      const file = await backup.handle.getFileHandle(name, { create: true });
      const out = await file.createWritable();
      await out.write(text);
      await out.close();
      written.set(show.id, text);
      backup.savedAt = Date.now();
      backup.savedName = name;
      backup.pending = false;
      backup.error = '';
    } catch (err) {
      // Permission taken back, or the folder moved or deleted.
      backup.error = err?.message || String(err);
      backup.state = err?.name === 'NotAllowedError' ? 'ask' : 'error';
    }
    tell();
  }

  // Called whenever presets or shows change: writes after a quiet spell.
  function changed() {
    if (backup.state === 'unsupported' || backup.state === 'none') return;
    const { show, text } = textOf();
    if (written.get(show.id) === text) return;
    backup.pending = true;
    clearTimeout(timer);
    if (backup.state === 'on') timer = setTimeout(write, backup.quietMs);
    tell();
  }

  async function use(handle, fresh) {
    backup.handle = handle;
    backup.folder = handle.name;
    let permission = 'granted';
    try {
      permission = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    } catch {
      permission = 'prompt';
    }
    backup.state = permission === 'granted' ? 'on' : 'ask';
    backup.error = '';
    tell();
    // A folder just chosen gets the live show at once.
    if (fresh && backup.state === 'on') await write();
    else changed();
  }

  backup.choose = async () => {
    try {
      const handle = await window.showDirectoryPicker({ id: 'third-eye-shows', mode: 'readwrite' });
      await idb('readwrite', (s) => s.put(handle, KEY)).catch(() => {});
      written.clear();
      await use(handle, true);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        backup.error = err?.message || String(err);
        tell();
      }
    }
  };
  backup.allow = async () => {
    if (!backup.handle) return;
    try {
      const permission = await backup.handle.requestPermission({ mode: 'readwrite' });
      backup.state = permission === 'granted' ? 'on' : 'ask';
    } catch (err) {
      backup.error = err?.message || String(err);
    }
    tell();
    if (backup.state === 'on') await write();
  };
  backup.forget = async () => {
    clearTimeout(timer);
    await idb('readwrite', (s) => s.delete(KEY)).catch(() => {});
    Object.assign(backup, { handle: null, folder: '', state: 'none', pending: false, error: '', savedAt: 0 });
    written.clear();
    tell();
  };
  // Writes now, whatever the quiet spell (for the tests, and "Save now").
  backup.flush = () => {
    clearTimeout(timer);
    return write();
  };

  presets.onChange(changed);
  if (backup.state !== 'unsupported') {
    idb('readonly', (s) => s.get(KEY))
      .then((handle) => handle && use(handle, false))
      .catch(() => {});
  }
  return backup;
}

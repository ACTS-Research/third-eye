// Writes recording chunks to the browser's private file system as they
// arrive, flushing each one: if the browser dies mid-show, everything up to
// the last second is already on disk.

let handle = null;
let offset = 0;
let queue = Promise.resolve();

async function run(msg) {
  if (msg.t === 'open') {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('recordings', { create: true });
    const file = await dir.getFileHandle(msg.name, { create: true });
    handle = await file.createSyncAccessHandle();
    handle.truncate(0);
    offset = 0;
    postMessage({ t: 'opened' });
  } else if (msg.t === 'chunk' && handle) {
    offset += handle.write(new Uint8Array(msg.data), { at: offset });
    handle.flush();
    postMessage({ t: 'progress', bytes: offset });
  } else if (msg.t === 'close') {
    handle?.flush();
    handle?.close();
    handle = null;
    postMessage({ t: 'closed', bytes: offset });
  }
}

self.onmessage = (e) => {
  queue = queue.then(() => run(e.data)).catch((err) => postMessage({ t: 'error', message: String(err?.message ?? err) }));
};

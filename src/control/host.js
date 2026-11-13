// Who hosts the engine. One engine runs per browser. This page hosts it
// whenever no output window does; an output window that opens claims it, and
// this page takes it back when that window goes.
//
//   waiting  nobody is known to host; this page starts its engine at `startAt`
//   local    this page hosts: the monitor is the engine's own canvas
//   remote   another window hosts (an output window, or another control tab)
//
// Messages, all on the bus:
//   engine-who       "is anyone hosting?"; a host answers engine-here. Asked
//                    on load, and when a host's status goes quiet: a window
//                    Chrome has stopped drawing (minimised, covered) sends no
//                    status but still answers, so it is not mistaken for gone.
//   output-ping      an output window is starting and claims the engine. A
//                    hosting control page stops its engine and answers
//                    engine-released; a running output answers output-pong
//                    and the new window stands by.
//   engine-hold      instead of engine-released, when this page reaches the
//   engine-take      phone on a link made without the pairing server: the
//                    output gets itself introduced to the phone first (see
//                    "introductions" in src/engine/remote.js), then says
//                    engine-take, and only then does this page let go.
//   engine-gone      a host says goodbye as its page closes or reloads.
//   status           every host's status carries `host: { role, id }`; two
//                    hosts at once settle it by that (the output wins, then
//                    the lower id).

import { Engine } from '../engine/engine.js';
import { el } from '../shared/util.js';

// With no output window the picture is rendered at a fixed size, whatever
// the size of the monitor on the page, so recordings come out the same.
const LOCAL_SIZE = { width: 1280, height: 720 };
// Longer than the gap between two status messages, so a running host is
// heard even if it does not answer engine-who.
const START_WAIT_MS = 700;
const SILENT_MS = 2000;
const PROBE_MS = 700;
// After a host goes, wait this long before starting here: an output window
// that is only reloading comes back and claims the engine first.
const GRACE_MS = 1500;
const RELOAD_GRACE_MS = 6000;
// An output that claimed the engine gets this long to send its first status.
const CLAIM_MS = 5000;

export function installHost(ui) {
  const { bus, store } = ui;
  const id = Math.random().toString(36).slice(2, 10);
  const stage = el('canvas', { id: 'stage', width: LOCAL_SIZE.width, height: LOCAL_SIZE.height });
  let engine = null;
  let startAt = performance.now() + START_WAIT_MS;
  let lastHeardAt = -Infinity;
  let quietUntil = 0;
  let probeAt = 0;

  const host = {
    id,
    state: 'waiting',
    role: null, // of whoever hosts: 'control' or 'output'
    hostId: '',
    stalled: false, // the host answers but is not drawing
    dropped: false, // an output window went without saying goodbye
    error: '',
    get engine() {
      return engine;
    },
  };
  ui.host = host;

  function changed() {
    const local = host.state === 'local';
    document.body.classList.toggle('host-local', local);
    if (local) {
      // One canvas: it sits in the monitor of whichever screen is showing.
      const slot = ui.monitors?.[ui.view] ?? stage.parentElement ?? ui.monitors?.perform;
      if (slot && stage.parentElement !== slot) slot.prepend(stage);
    } else {
      stage.remove();
    }
    ui.setAlert?.(
      'output',
      host.dropped ? 'The output window stopped without warning. The picture now runs on this page and the phone reconnects by itself.' : null,
      'bad',
      { label: 'Open output window', run: () => ui.openOutput?.() },
    );
    ui.setAlert?.('output-stalled', host.stalled ? 'The output window is open but not drawing. Chrome pauses a window that is minimised or fully covered: bring it back into view.' : null, 'bad');
    ui.setAlert?.('engine', host.error || null, 'bad');
    for (const fn of ui.hostListeners) fn(host);
  }

  function clearStatus() {
    ui.status = null;
    ui.statusAt = -Infinity;
    for (const fn of ui.statusListeners) fn(null);
  }

  function startLocal() {
    try {
      engine ??= new Engine(stage, store, bus, { role: 'control', id, size: LOCAL_SIZE });
      engine.start();
    } catch (err) {
      console.error('[host] could not start the engine', err);
      host.state = 'failed';
      host.error = `This page cannot draw the picture: ${err.message ?? err}`;
      changed();
      return;
    }
    host.state = 'local';
    host.role = 'control';
    host.hostId = id;
    host.stalled = false;
    host.error = '';
    changed();
  }

  function stopLocal() {
    engine?.stop();
    clearStatus();
  }

  function waitThenStart(grace) {
    host.state = 'waiting';
    host.role = null;
    host.hostId = '';
    host.stalled = false;
    startAt = performance.now() + grace;
    clearStatus();
    changed();
  }

  // Another window is hosting. Returns false if this page hosts too and the
  // other one is the one that must give way.
  function heard(other, drawing) {
    const role = other?.role ?? 'output';
    const otherId = other?.id ?? '';
    if (host.state === 'local') {
      if (role !== 'output' && otherId > id) return false;
      stopLocal();
    }
    lastHeardAt = performance.now();
    probeAt = 0;
    const stalled = !drawing;
    const dropped = role === 'output' ? false : host.dropped;
    if (host.state === 'remote' && host.role === role && host.hostId === otherId && host.stalled === stalled && host.dropped === dropped) return true;
    host.state = 'remote';
    host.role = role;
    host.hostId = otherId;
    host.stalled = stalled;
    host.dropped = dropped;
    changed();
    return true;
  }

  bus.on('status', (m, local) => {
    if (local ? host.state !== 'local' : !heard(m.status.host, true)) return;
    ui.status = m.status;
    ui.statusAt = performance.now();
    for (const fn of ui.statusListeners) fn(ui.status);
  });
  bus.on('engine-here', (m, local) => {
    // An answer to a probe, with no status since: alive but not drawing.
    if (!local) heard(m.host, !probeAt && !host.stalled);
  });
  bus.on('engine-who', (_m, local) => {
    if (!local && host.state === 'local') bus.send('engine-here', { host: { role: 'control', id } });
  });
  // An output window is taking over. If this page can reach the phone on a
  // link made without the pairing server, the output is first told to wait
  // (engine-hold) and get introduced to the phone through this page; it
  // says engine-take when it is ready.
  let holding = false;
  bus.on('output-ping', () => {
    holding = !!engine?.link.canIntroduce;
    if (holding) bus.send('engine-hold');
    else yieldToOutput(false);
  });
  bus.on('engine-take', () => {
    yieldToOutput(holding);
    holding = false;
  });
  // `answer`: the output is waiting to hear engine-released from this page
  // even if it was not the one hosting.
  function yieldToOutput(answer) {
    const wasLocal = host.state === 'local';
    if (wasLocal) stopLocal();
    if (wasLocal || answer) bus.send('engine-released');
    lastHeardAt = performance.now();
    quietUntil = lastHeardAt + CLAIM_MS;
    probeAt = 0;
    host.state = 'remote';
    host.role = 'output';
    host.hostId = '';
    host.stalled = false;
    host.dropped = false;
    changed();
  }
  bus.on('engine-gone', (m, local) => {
    if (local || host.state !== 'remote') return;
    if (host.hostId && m.host?.id && m.host.id !== host.hostId) return;
    host.dropped = false;
    waitThenStart(m.reload ? RELOAD_GRACE_MS : GRACE_MS);
  });

  // While an output window has the phone on such a link, this page keeps a
  // link of its own in reserve, so the picture can come back here (when the
  // output closes, or crashes) without a new code being scanned.
  let spareAskedAt = -Infinity;
  function keepSpare(now) {
    const p = ui.status?.phone;
    if (host.state !== 'remote' || host.role !== 'output' || !p?.direct || p.phone !== 'connected') return;
    if (engine?.link.spareReady || now - spareAskedAt < 4000) return;
    spareAskedAt = now;
    try {
      engine ??= new Engine(stage, store, bus, { role: 'control', id, size: LOCAL_SIZE });
    } catch {
      return;
    }
    engine.prepareSpare();
  }

  setInterval(() => {
    const now = performance.now();
    keepSpare(now);
    if (host.state === 'waiting') {
      if (now >= startAt) startLocal();
    } else if (host.state === 'remote' && now >= quietUntil && now - lastHeardAt > SILENT_MS) {
      if (!probeAt) {
        probeAt = now;
        bus.send('engine-who');
      } else if (now - probeAt > PROBE_MS) {
        // No answer at all: the window is gone and never said so.
        probeAt = 0;
        host.dropped = host.role === 'output';
        waitThenStart(GRACE_MS);
      }
    }
  }, 250);

  ui.onView(() => {
    if (host.state === 'local') changed();
  });
  // No storage event reaches the page that changed the palette or dimmer.
  ui.onPalette(() => engine?.sendLook());
  ui.lookChanged = () => engine?.sendLook();

  window.addEventListener('pagehide', () => {
    if (host.state !== 'local') return;
    engine.stop();
    bus.send('engine-gone', { host: { role: 'control', id } });
  });
  // A page brought back from the back/forward cache has a stopped engine.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });

  bus.send('engine-who');
  changed();
  return host;
}

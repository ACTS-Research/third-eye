// Thin wrapper around BroadcastChannel shared by /control and /output.
// Messages are { t: type, ...payload }. A window never receives its own posts.
//
// /control can host the engine itself, and then the engine and the page's UI
// talk on the same bus in one window. `loopback: true` makes that work: a
// post is also handed to this window's own handlers. Handlers get `local` as
// their second argument, true for a post from this window. The store's own
// traffic is never looped back: the engine and the UI share one Store there,
// and an op delivered again would apply twice.

const CHANNEL = 'third-eye-cam';
const NEVER_LOCAL = new Set(['op', 'event', 'hello']);

export function createBus({ loopback = false } = {}) {
  const bc = new BroadcastChannel(CHANNEL);
  const handlers = new Map();

  const deliver = (msg, local) => {
    if (!msg || typeof msg.t !== 'string') return;
    const list = handlers.get(msg.t);
    if (!list) return;
    for (const fn of [...list]) {
      try {
        fn(msg, local);
      } catch (err) {
        console.error(`[bus] handler for "${msg.t}" failed`, err);
      }
    }
  };
  bc.onmessage = (e) => deliver(e.data, false);

  return {
    send(t, payload) {
      const msg = { t, ...payload };
      try {
        bc.postMessage(msg);
      } catch (err) {
        console.error(`[bus] could not post "${t}"`, err);
      }
      if (loopback && !NEVER_LOCAL.has(t)) deliver(msg, true);
    },
    on(t, fn) {
      if (!handlers.has(t)) handlers.set(t, []);
      handlers.get(t).push(fn);
      return () => {
        const list = handlers.get(t);
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
  };
}

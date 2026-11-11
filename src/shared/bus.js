// Thin wrapper around BroadcastChannel shared by /control and /output.
// Messages are { t: type, ...payload }. A window never receives its own posts.

const CHANNEL = 'third-eye-cam';

export function createBus() {
  const bc = new BroadcastChannel(CHANNEL);
  const handlers = new Map();

  bc.onmessage = (e) => {
    const msg = e.data;
    if (!msg || typeof msg.t !== 'string') return;
    const list = handlers.get(msg.t);
    if (!list) return;
    for (const fn of list) {
      try {
        fn(msg);
      } catch (err) {
        console.error(`[bus] handler for "${msg.t}" failed`, err);
      }
    }
  };

  return {
    send(t, payload) {
      try {
        bc.postMessage({ t, ...payload });
      } catch (err) {
        console.error(`[bus] could not post "${t}"`, err);
      }
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

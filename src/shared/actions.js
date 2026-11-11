// Things a key, a button or (from Phase 3) a trigger can fire. They run in
// whichever window initiated them and reach the other one through the store.

import { INPUT_KINDS } from './state.js';

export const ACTIONS = {
  blackout: 'Blackout',
  freeze: 'Freeze frame',
  bypassAll: 'Bypass all effects',
  inputNext: 'Next input',
  glitch: 'Glitch burst',
};

export function runAction(store, name, arg) {
  const g = store.state.globals;
  switch (name) {
    case 'blackout':
      store.merge('globals', { blackout: !g.blackout });
      break;
    case 'freeze':
      store.merge('globals', { freeze: !g.freeze });
      break;
    case 'bypassAll':
      store.merge('globals', { bypassAll: !g.bypassAll });
      break;
    case 'input':
      if (INPUT_KINDS.includes(arg)) store.merge('input', { kind: arg });
      break;
    case 'inputNext': {
      const i = INPUT_KINDS.indexOf(store.state.input.kind);
      store.merge('input', { kind: INPUT_KINDS[(i + 1) % INPUT_KINDS.length] });
      break;
    }
    case 'glitch':
      store.emit('glitch');
      break;
    default:
      console.warn('[actions] unknown action', name);
  }
}

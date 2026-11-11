// Things a key, a button or (from Phase 3) a trigger can fire. They run in
// whichever window initiated them and reach the other one through the store.

import { stepPreset } from './presets.js';
import { INPUT_KINDS } from './state.js';

export const ACTIONS = {
  blackout: 'Blackout',
  freeze: 'Freeze frame',
  bypassAll: 'Bypass all effects',
  inputNext: 'Next input',
  glitch: 'Glitch burst',
  presetNext: 'Next preset',
  presetPrev: 'Previous preset',
};

// Actions that flip a switch: a momentary trigger turns them on while held.
export const TOGGLE_ACTIONS = { blackout: 'blackout', freeze: 'freeze', bypassAll: 'bypassAll' };

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
    case 'presetNext':
      stepPreset(store, 1);
      break;
    case 'presetPrev':
      stepPreset(store, -1);
      break;
    default:
      console.warn('[actions] unknown action', name);
  }
}

// Things a key, a button or (from Phase 3) a trigger can fire. They run in
// whichever window initiated them and reach the other one through the store.

import { applyPreset, applyStep, stepShow } from './presets.js';
import { INPUT_KINDS, INPUT_LABELS } from './state.js';

export const ACTIONS = {
  blackout: 'Blackout',
  freeze: 'Freeze frame',
  bypassAll: 'Bypass all effects',
  inputNext: 'Next input',
  glitch: 'Glitch burst',
  tap: 'Tap tempo',
  record: 'Record on / off',
  // With a running order these walk its steps; without one, the presets.
  presetNext: 'Next preset',
  presetPrev: 'Previous preset',
};

// Actions that flip a switch: a trigger set to hold turns them on while held.
export const TOGGLE_ACTIONS = { blackout: 'blackout', freeze: 'freeze', bypassAll: 'bypassAll' };

// Actions can carry an argument after a colon: "preset:3" loads the fourth
// preset, "step:0" the first step of the running order, "input:camera" selects an input, "macro:2" (handled by the engine,
// continuously) drives the third perform fader.
export function describeAction(action) {
  if (ACTIONS[action]) return ACTIONS[action];
  const [kind, arg] = String(action).split(':');
  if (kind === 'preset') return `Preset ${Number(arg) + 1}`;
  if (kind === 'step') return `Step ${Number(arg) + 1}`;
  if (kind === 'input') return `Input: ${INPUT_LABELS[arg] ?? arg}`;
  if (kind === 'macro') return `Fader ${Number(arg) + 1}`;
  if (kind === 'param') return 'Parameter';
  return action;
}

export function runAction(store, name, arg) {
  if (typeof name === 'string' && name.includes(':')) [name, arg] = name.split(':');
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
    case 'record':
      store.emit('record');
      break;
    case 'tap':
      store.emit('tap', { at: Date.now() });
      break;
    case 'preset':
      applyPreset(store, Number(arg) || 0);
      break;
    case 'step':
      applyStep(store, Number(arg) || 0);
      break;
    case 'macro':
      break; // continuous; the engine applies it every frame
    case 'presetNext':
      stepShow(store, 1);
      break;
    case 'presetPrev':
      stepShow(store, -1);
      break;
    default:
      console.warn('[actions] unknown action', name);
  }
}

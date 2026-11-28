// Things a key, a button or (from Phase 3) a trigger can fire. They run in
// whichever window initiated them and reach the other one through the store.

import { applyPreset, applyStep, stepShow } from './presets.js';
import { EFFECT_BY_ID } from '../effects/index.js';
import { INPUT_KINDS, INPUT_LABELS } from './state.js';

// The modes of the Mix B effect, as [name, value] pairs in their order.
export const MIX_MODES = Object.entries(EFFECT_BY_ID.mixb.params.mode.options);
// The Mix B effect the perform screen's bar and mode buttons work on: the
// first in the chain that is not bypassed, else the first.
export const mixItem = (state) => state.chain.find((it) => it.type === 'mixb' && !it.bypass) ?? state.chain.find((it) => it.type === 'mixb') ?? null;

export const ACTIONS = {
  blackout: 'Blackout',
  freeze: 'Freeze frame',
  bypassAll: 'Bypass all effects',
  inputNext: 'Next input',
  blink: 'Blink',
  tap: 'Tap tempo',
  // While the MIDI clock is being sent (Setup → MIDI and audio).
  clockRun: 'Clock start / stop',
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
  if (kind === 'inputB') return arg === 'off' ? 'Input B off' : `Input B: ${INPUT_LABELS[arg] ?? arg}`;
  if (kind === 'mixMode') return `Mix mode: ${MIX_MODES.find(([, v]) => v === Number(arg))?.[0] ?? arg}`;
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
    // A and B never show the same source: asking one for the other's makes
    // them change places.
    case 'input': {
      const { kind, kindB } = store.state.input;
      if (INPUT_KINDS.includes(arg)) store.merge('input', arg === kindB ? { kind: arg, kindB: kind } : { kind: arg });
      break;
    }
    case 'inputB': {
      const { kind, kindB } = store.state.input;
      if (arg === 'off') store.merge('input', { kindB: '' });
      else if (!INPUT_KINDS.includes(arg)) break;
      else if (arg !== kind) store.merge('input', { kindB: arg });
      // B was off: A keeps its source, there is nothing to trade.
      else if (kindB) store.merge('input', { kind: kindB, kindB: arg });
      break;
    }
    case 'mixMode': {
      const item = mixItem(store.state);
      if (item && MIX_MODES.some(([, v]) => v === Number(arg))) store.setParam(item.uid, 'mode', Number(arg));
      break;
    }
    case 'inputNext': {
      const { kind, kindB } = store.state.input;
      const i = INPUT_KINDS.indexOf(kind);
      const next = INPUT_KINDS[(i + 1) % INPUT_KINDS.length];
      store.merge('input', next === kindB ? { kind: next, kindB: kind } : { kind: next });
      break;
    }
    case 'blink':
      store.emit('blink');
      break;
    // The button, key or pad that fired Blink has come up: a blink set to
    // hold lets go. (Not an action anyone binds: whatever sends 'blink'
    // sends this after it.)
    case 'blinkEnd':
      store.emit('blink-end');
      break;
    case 'record':
      store.emit('record');
      break;
    case 'tap':
      store.emit('tap', { at: Date.now() });
      break;
    case 'clockRun':
      store.emit('clock-run');
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

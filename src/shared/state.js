// The show state: one plain JSON document shared by /control and /output.
// "Scene" is the part a preset stores (the effects chain and, from Phase 3,
// its modulation); everything else is session-level.

import { EFFECT_BY_ID, defaultParams, paramRange } from '../effects/index.js';
import { normalizeRoom, randomRoom } from './net.js';
import { clamp, uid } from './util.js';

export const INPUT_KINDS = ['phone', 'camera', 'pattern', 'file'];
export const INPUT_LABELS = { phone: 'iPhone', camera: 'Local camera', pattern: 'Test pattern', file: 'Video file' };
export const FX_TARGETS = ['all', 'person', 'background'];

export function makeEffect(type, overrides = {}) {
  const def = EFFECT_BY_ID[type];
  if (!def) throw new Error(`Unknown effect "${type}"`);
  const { params, ...rest } = overrides;
  return {
    uid: uid(),
    type,
    bypass: false,
    mix: 1,
    target: 'all',
    ...rest,
    params: { ...defaultParams(def), ...params },
  };
}

export function defaultScene() {
  return {
    chain: [makeEffect('feedback'), makeEffect('rgbshift')],
  };
}

export function defaultState() {
  return {
    v: 1,
    input: { kind: 'pattern', cameraId: '', fit: 'cover', mirror: false },
    net: { room: randomRoom(), signal: '' },
    globals: {
      blackout: false,
      freeze: false,
      bypassAll: false,
      renderScale: 1,
      fadeTime: 2,
      preview: true,
    },
    presetIndex: -1,
    ...defaultScene(),
  };
}

function sanitizeEffect(item) {
  const def = item && EFFECT_BY_ID[item.type];
  if (!def) return null;
  const params = defaultParams(def);
  for (const [key, spec] of Object.entries(def.params)) {
    const v = Number(item.params?.[key]);
    if (!Number.isFinite(v)) continue;
    const { min, max } = paramRange(spec);
    params[key] = clamp(v, min, max);
  }
  const mix = Number(item.mix);
  return {
    uid: typeof item.uid === 'string' && item.uid ? item.uid : uid(),
    type: item.type,
    bypass: !!item.bypass,
    mix: Number.isFinite(mix) ? clamp(mix, 0, 1) : 1,
    target: FX_TARGETS.includes(item.target) ? item.target : 'all',
    params,
  };
}

// Accepts anything (old saves, imported JSON) and returns a valid scene.
export function sanitizeScene(scene) {
  const chain = [];
  const seen = new Set();
  for (const raw of Array.isArray(scene?.chain) ? scene.chain : []) {
    const item = sanitizeEffect(raw);
    if (!item) continue;
    if (seen.has(item.uid)) item.uid = uid();
    seen.add(item.uid);
    chain.push(item);
  }
  return { chain };
}

export function sceneOf(state) {
  return structuredClone({ chain: state.chain });
}

export function sanitizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const state = {
    ...base,
    input: { ...base.input, ...pick(raw.input, base.input) },
    net: { ...base.net, ...pick(raw.net, base.net) },
    globals: { ...base.globals, ...pick(raw.globals, base.globals) },
    presetIndex: Number.isInteger(raw.presetIndex) ? raw.presetIndex : -1,
    ...(Array.isArray(raw.chain) ? sanitizeScene(raw) : defaultScene()),
  };
  if (!INPUT_KINDS.includes(state.input.kind)) state.input.kind = 'pattern';
  state.net.room = normalizeRoom(state.net.room);
  if (state.net.room.length < 4) state.net.room = base.net.room;
  return state;
}

// Keeps only keys the defaults know about, with matching primitive types.
function pick(src, shape) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const key of Object.keys(shape)) {
    if (typeof src[key] === typeof shape[key]) out[key] = src[key];
  }
  return out;
}

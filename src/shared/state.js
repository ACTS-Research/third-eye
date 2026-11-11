// The show state: one plain JSON document shared by /control and /output.
// "Scene" is the part a preset stores (the effects chain and, from Phase 3,
// its modulation); everything else is session-level.

import { EFFECT_BY_ID, defaultParams, paramRange } from '../effects/index.js';
import { normalizeRoom, randomRoom } from './net.js';
import { LFO_COUNT, LFO_SHAPES } from './sources.js';
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

// Maps a modulation source onto one effect parameter (key 'mix' = wet/dry).
export function makeMapping(source, fx, key, overrides = {}) {
  return {
    id: uid(),
    source,
    fx,
    key,
    amount: 0.5,
    offset: 0,
    smooth: 0.08,
    invert: false,
    mode: 'add', // 'add' offsets the dialled-in value, 'set' replaces it
    enabled: true,
    ...overrides,
  };
}

export function defaultLfos() {
  const rates = [0.1, 0.25, 0.5, 1];
  return Array.from({ length: LFO_COUNT }, (_, i) => ({ id: `lfo.${i + 1}`, shape: 'sine', rate: rates[i] ?? 1 }));
}

// Fires an action when a source rises through 0.5.
export function makeActionBinding(source, action, momentary = false) {
  return { id: uid(), source, action, momentary };
}

export function defaultActions() {
  return [
    makeActionBinding('trig.1', 'glitch'),
    makeActionBinding('trig.2', 'freeze', true),
    makeActionBinding('trig.3', 'presetPrev'),
    makeActionBinding('trig.4', 'presetNext'),
  ];
}

export function defaultScene() {
  return {
    chain: [makeEffect('feedback'), makeEffect('rgbshift')],
    mappings: [],
    lfos: defaultLfos(),
    // Parameters pinned to the perform screen's faders: [{ fx, key } | null].
    macros: [],
  };
}

export function defaultState() {
  return {
    v: 1,
    input: { kind: 'pattern', cameraId: '', fit: 'cover', mirror: false },
    net: { room: randomRoom(), signal: '' },
    midi: { enabled: false },
    audio: { enabled: false, deviceId: '', gain: 1, sensitivity: 1.6 },
    // MediaPipe features, all off by default: each costs GPU and CPU time.
    vision: { face: false, hands: false, gesture: false, pose: false, segment: false, delegate: 'GPU' },
    globals: {
      blackout: false,
      freeze: false,
      bypassAll: false,
      renderScale: 1,
      fadeTime: 2,
      preview: true,
    },
    presetIndex: -1,
    actions: defaultActions(),
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

  const mappings = [];
  const ids = new Set();
  for (const raw of Array.isArray(scene?.mappings) ? scene.mappings : []) {
    if (!raw || typeof raw.source !== 'string' || !raw.source) continue;
    const target = chain.find((it) => it.uid === raw.fx);
    if (!target) continue;
    if (raw.key !== 'mix' && !(raw.key in EFFECT_BY_ID[target.type].params)) continue;
    const m = makeMapping(raw.source, raw.fx, raw.key, {
      amount: num(raw.amount, 0.5, -1, 1),
      offset: num(raw.offset, 0, -1, 1),
      smooth: num(raw.smooth, 0.08, 0, 5),
      invert: !!raw.invert,
      mode: raw.mode === 'set' ? 'set' : 'add',
      enabled: raw.enabled !== false,
    });
    if (typeof raw.id === 'string' && raw.id && !ids.has(raw.id)) m.id = raw.id;
    ids.add(m.id);
    mappings.push(m);
  }

  const shapes = Object.values(LFO_SHAPES);
  const lfos = defaultLfos();
  (Array.isArray(scene?.lfos) ? scene.lfos : []).slice(0, LFO_COUNT).forEach((raw, i) => {
    if (shapes.includes(raw?.shape)) lfos[i].shape = raw.shape;
    lfos[i].rate = num(raw?.rate, lfos[i].rate, 0.01, 20);
  });

  // Pinned macros: keep slot positions, drop ones whose target is gone.
  const macros = (Array.isArray(scene?.macros) ? scene.macros : []).slice(0, 8).map((slot) => {
    const target = slot && chain.find((it) => it.uid === slot.fx);
    if (!target) return null;
    if (slot.key !== 'mix' && !(slot.key in EFFECT_BY_ID[target.type].params)) return null;
    return { fx: slot.fx, key: slot.key };
  });
  while (macros.length && !macros.at(-1)) macros.pop();

  return { chain, mappings, lfos, macros };
}

function num(value, fallback, min, max) {
  const v = Number(value);
  return Number.isFinite(v) ? clamp(v, min, max) : fallback;
}

export function sceneOf(state) {
  return structuredClone({ chain: state.chain, mappings: state.mappings, lfos: state.lfos, macros: state.macros ?? [] });
}

export function sanitizeActions(list, fallback) {
  if (!Array.isArray(list)) return fallback;
  return list
    .filter((b) => b && typeof b.source === 'string' && typeof b.action === 'string')
    .map((b) => ({ id: typeof b.id === 'string' && b.id ? b.id : uid(), source: b.source, action: b.action, momentary: !!b.momentary }));
}

export function sanitizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const state = {
    ...base,
    input: { ...base.input, ...pick(raw.input, base.input) },
    net: { ...base.net, ...pick(raw.net, base.net) },
    midi: { ...base.midi, ...pick(raw.midi, base.midi) },
    audio: { ...base.audio, ...pick(raw.audio, base.audio) },
    vision: { ...base.vision, ...pick(raw.vision, base.vision) },
    globals: { ...base.globals, ...pick(raw.globals, base.globals) },
    presetIndex: Number.isInteger(raw.presetIndex) ? raw.presetIndex : -1,
    actions: sanitizeActions(raw.actions, base.actions),
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

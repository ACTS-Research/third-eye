// Effect registry. To add an effect: create a file exporting
// { id, name, params, frag, uses? } and list it here. The control UI and the
// uniforms are generated from `params`; see common.glsl.js for the built-ins.

import feedback from './feedback.js';
import kaleido from './kaleido.js';
import rgbshift from './rgbshift.js';

export const EFFECTS = [feedback, kaleido, rgbshift];

export const EFFECT_BY_ID = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));

export function paramRange(spec) {
  if (spec.options) {
    const values = Object.values(spec.options);
    return { min: Math.min(...values), max: Math.max(...values) };
  }
  if (spec.type === 'bool') return { min: 0, max: 1 };
  return { min: spec.min, max: spec.max };
}

export function defaultParams(def) {
  const out = {};
  for (const [key, spec] of Object.entries(def.params)) out[key] = spec.default;
  return out;
}

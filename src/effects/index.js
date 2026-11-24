// Effect registry. To add an effect: create a file exporting
// { id, name, params, frag, uses? } and list it here. The control UI and the
// uniforms are generated from `params`; see common.glsl.js for the built-ins.

import delay from './delay.js';
import displace from './displace.js';
import edges from './edges.js';
import feedback from './feedback.js';
import kaleido from './kaleido.js';
import mixb from './mixb.js';
import orient from './orient.js';
import posterize from './posterize.js';
import rgbshift from './rgbshift.js';
import thermal from './thermal.js';
import tone from './tone.js';
import trails from './trails.js';
import blur from './blur.js';
import noise from './noise.js';
import motion from './motion.js';
import gravity from './gravity.js';
import scan from './scan.js';

export const EFFECTS = [feedback, trails, delay, scan, kaleido, orient, displace, rgbshift, edges, posterize, thermal, tone, blur, noise, motion, gravity, mixb];

export const EFFECT_BY_ID = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));

export function paramRange(spec) {
  if (spec.options) {
    const values = Object.values(spec.options);
    return { min: Math.min(...values), max: Math.max(...values) };
  }
  if (spec.type === 'bool') return { min: 0, max: 1 };
  return { min: spec.min, max: spec.max };
}

// A slider can be curved, so that its whole travel is useful: fine near the
// value where nothing much happens, extreme at the ends.
//   curve: n               value = min + position^n × range
//   curve: n, from: 'max'  the fine end is at the top (a decay close to 1)
//   curve: n, center: c    both ways from c, which sits mid-slider
// Stored values, typed values and shaders stay in the parameter's own units;
// only positions (a bar, a fader, a knob, a modulation's amount) are curved.
export function paramValue(spec, unit) {
  const { min, max } = paramRange(spec);
  const u = Math.min(1, Math.max(0, unit));
  const n = spec.curve;
  if (!n) return min + u * (max - min);
  // The ends are exactly the ends, whatever the arithmetic below would give.
  if (u === 0) return min;
  if (u === 1) return max;
  if (spec.center !== undefined) {
    const d = u * 2 - 1;
    return d >= 0 ? spec.center + d ** n * (max - spec.center) : spec.center - (-d) ** n * (spec.center - min);
  }
  if (spec.from === 'max') return max - (1 - u) ** n * (max - min);
  return min + u ** n * (max - min);
}

export function paramUnit(spec, value) {
  const { min, max } = paramRange(spec);
  if (!(max > min)) return 0;
  const v = Math.min(max, Math.max(min, value));
  const n = spec.curve;
  if (!n) return (v - min) / (max - min);
  if (spec.center !== undefined) {
    const c = spec.center;
    return v >= c ? 0.5 + 0.5 * ((v - c) / (max - c)) ** (1 / n) : 0.5 - 0.5 * ((c - v) / (c - min)) ** (1 / n);
  }
  if (spec.from === 'max') return 1 - ((max - v) / (max - min)) ** (1 / n);
  return ((v - min) / (max - min)) ** (1 / n);
}

export function defaultParams(def) {
  const out = {};
  for (const [key, spec] of Object.entries(def.params)) out[key] = spec.default;
  return out;
}

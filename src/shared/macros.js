// Macros: up to eight parameters of the current scene surfaced as big faders
// on the perform screen. A preset can pin its own; otherwise the first few
// parameters of the chain are used so the faders are never empty.

import { EFFECT_BY_ID, paramRange } from '../effects/index.js';

export const MACRO_COUNT = 8;

function describe(state, slot, auto) {
  const index = state.chain.findIndex((it) => it.uid === slot.fx);
  if (index < 0) return null;
  const item = state.chain[index];
  const def = EFFECT_BY_ID[item.type];
  const isMix = slot.key === 'mix';
  const spec = isMix ? { min: 0, max: 1, step: 0.01, default: 1 } : def.params[slot.key];
  if (!spec) return null;
  const { min, max } = isMix ? spec : paramRange(spec);
  return {
    fx: item.uid,
    key: slot.key,
    label: isMix ? 'wet / dry' : spec.label ?? slot.key,
    effect: def.name,
    effectIndex: index,
    min,
    max,
    step: spec.options || spec.type === 'bool' ? 1 : spec.step ?? (max - min) / 100,
    fallback: spec.default,
    value: isMix ? item.mix : item.params[slot.key],
    auto,
  };
}

// Returns an array of MACRO_COUNT entries; empty slots are null.
export function resolveMacros(state) {
  const pinned = (state.macros ?? []).some(Boolean);
  const out = new Array(MACRO_COUNT).fill(null);
  if (pinned) {
    state.macros.slice(0, MACRO_COUNT).forEach((slot, i) => {
      if (slot) out[i] = describe(state, slot, false);
    });
    return out;
  }
  // Automatic: share the slots between the effects, continuous sliders only.
  const chain = state.chain;
  if (!chain.length) return out;
  const perEffect = Math.max(1, Math.ceil(MACRO_COUNT / chain.length));
  let n = 0;
  for (const item of chain) {
    const params = EFFECT_BY_ID[item.type].params;
    let taken = 0;
    for (const [key, spec] of Object.entries(params)) {
      if (spec.options || spec.type === 'bool') continue;
      if (taken >= perEffect || n >= MACRO_COUNT) break;
      out[n++] = describe(state, { fx: item.uid, key }, true);
      taken++;
    }
  }
  return out;
}

// Snaps a 0..1 position to a legal value of the macro's parameter.
export function macroValue(macro, unit) {
  const raw = macro.min + Math.min(1, Math.max(0, unit)) * (macro.max - macro.min);
  const stepped = Math.round((raw - macro.min) / macro.step) * macro.step + macro.min;
  return Math.min(macro.max, Math.max(macro.min, Number(stepped.toFixed(6))));
}

export function macroUnit(macro, value) {
  return macro.max > macro.min ? (value - macro.min) / (macro.max - macro.min) : 0;
}

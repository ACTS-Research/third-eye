// The modulation matrix. Sources are plain numbers updated by whoever owns
// them (phone sensors, LFOs, later MIDI / audio / vision). Each frame the
// mappings in the scene turn those numbers into parameter offsets.

import { TOGGLE_ACTIONS, runAction } from '../shared/actions.js';
import { paramRange } from '../effects/index.js';
import { SOURCES, describeSource } from '../shared/sources.js';
import { clamp } from '../shared/util.js';

const MIX_RANGE = { min: 0, max: 1 };

function lfoValue(shape, phase, state) {
  switch (shape) {
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5);
    case 'saw':
      return phase * 2 - 1;
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'random':
      return state.hold;
    case 'drift': {
      // Smoothstep between two random values per cycle.
      const t = phase * phase * (3 - 2 * phase);
      return state.from + (state.hold - state.from) * t;
    }
    default:
      return Math.sin(phase * Math.PI * 2);
  }
}

export class Modulation {
  constructor(store) {
    this.store = store;
    this.values = new Map(SOURCES.map((s) => [s.id, 0]));
    this.bipolar = new Map(SOURCES.map((s) => [s.id, s.bipolar]));
    this.smoothed = new Map(); // mapping id -> shaped, smoothed source value
    this.byEffect = new Map(); // effect uid -> mappings targeting it
    this.dirty = true;
    this.lfoState = [];
    this.gates = new Map(); // action binding id -> was above threshold

    store.subscribe((op) => {
      if (op.op === 'scene' || op.op === 'replace' || (op.op === 'item' && op.list === 'mappings')) this.dirty = true;
    });

    this.resolve = (item, inst) => this.resolveInto(item, inst);
  }

  set(id, value) {
    if (!this.values.has(id)) this.bipolar.set(id, describeSource(id).bipolar);
    this.values.set(id, value);
  }

  get(id) {
    return this.values.get(id) ?? 0;
  }

  rebuild() {
    this.byEffect.clear();
    const live = new Set();
    for (const m of this.store.state.mappings) {
      live.add(m.id);
      if (!m.enabled) continue;
      if (!this.byEffect.has(m.fx)) this.byEffect.set(m.fx, []);
      this.byEffect.get(m.fx).push(m);
    }
    for (const id of this.smoothed.keys()) if (!live.has(id)) this.smoothed.delete(id);
    this.dirty = false;
  }

  frame(dt) {
    const state = this.store.state;
    if (this.dirty) this.rebuild();

    // LFOs
    state.lfos.forEach((lfo, i) => {
      const st = (this.lfoState[i] ??= { phase: 0, hold: Math.random() * 2 - 1, from: 0 });
      st.phase += dt * lfo.rate;
      if (st.phase >= 1) {
        st.phase %= 1;
        st.from = st.hold;
        st.hold = Math.random() * 2 - 1;
      }
      this.values.set(lfo.id, lfoValue(lfo.shape, st.phase, st));
    });

    // Shape and smooth every mapping once; resolveInto() just reads the result.
    for (const m of state.mappings) {
      if (!m.enabled) continue;
      let v = this.values.get(m.source) ?? 0;
      if (m.invert) v = this.bipolar.get(m.source) ? -v : 1 - v;
      v += m.offset;
      const prev = this.smoothed.get(m.id);
      if (prev === undefined || m.smooth <= 0) this.smoothed.set(m.id, v);
      else this.smoothed.set(m.id, prev + (v - prev) * (1 - Math.exp(-dt / m.smooth)));
    }

    // Triggers: a source rising through 0.5 fires its action.
    for (const b of state.actions) {
      const on = (this.values.get(b.source) ?? 0) > 0.5;
      const was = this.gates.get(b.id);
      this.gates.set(b.id, on);
      if (was === undefined || on === was) continue;
      const toggleKey = TOGGLE_ACTIONS[b.action];
      if (b.momentary && toggleKey) {
        // Held: on while pressed, off on release.
        if (state.globals[toggleKey] !== on) runAction(this.store, b.action);
      } else if (on) {
        runAction(this.store, b.action);
      }
    }
  }

  // Fills inst.values with base value + modulation for every parameter.
  resolveInto(item, inst) {
    const v = inst.values;
    const params = item.params;
    const specs = inst.def.params;
    for (const key in specs) v[key] = params[key];
    v.mix = item.mix;

    const list = this.byEffect.get(item.uid);
    if (!list) return;
    for (const m of list) {
      const spec = m.key === 'mix' ? MIX_RANGE : specs[m.key];
      if (!spec) continue;
      const { min, max } = m.key === 'mix' ? MIX_RANGE : paramRange(spec);
      const range = max - min;
      const s = this.smoothed.get(m.id) ?? 0;
      if (m.mode === 'set') {
        const unit = clamp(this.bipolar.get(m.source) ? s * 0.5 + 0.5 : s, 0, 1);
        v[m.key] = m.amount >= 0 ? min + unit * m.amount * range : max + unit * m.amount * range;
      } else {
        v[m.key] += s * m.amount * range;
      }
      v[m.key] = clamp(v[m.key], min, max);
    }
  }

  snapshot() {
    const out = {};
    for (const [id, value] of this.values) out[id] = Math.round(value * 1000) / 1000;
    return out;
  }
}


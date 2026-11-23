// Glitch as a jump: the sliders a preset has chosen (state.glitch.jumps) are
// thrown to their landing places and come back. One envelope for all of
// them: up over `attack` seconds, held while the button is down when `hold`
// is on, back over `release`. A preset with no jumps keeps the old tearing
// of the picture (engine.js decides that from what trigger() returns).

import { paramUnit, paramValue } from '../effects/index.js';

const MIX = { min: 0, max: 1 };

export class GlitchJump {
  constructor() {
    this.level = 0; // 0 = the sliders are their own, 1 = fully thrown
    this.phase = 'idle';
    this.held = false;
    this.offsets = new Map(); // "fx:key" → this press's scatter, in bar travel
    this.byFx = null;
  }

  // A press. False when this preset has no jumps to make.
  trigger(glitch) {
    if (!glitch?.jumps?.length) return false;
    this.phase = 'attack';
    this.held = !!glitch.hold;
    this.offsets.clear();
    if (glitch.scatter > 0) for (const j of glitch.jumps) this.offsets.set(`${j.fx}:${j.key}`, (Math.random() * 2 - 1) * glitch.scatter);
    return true;
  }

  // The button came up.
  release() {
    this.held = false;
  }

  frame(dt, glitch) {
    if (this.phase === 'idle') return;
    if (this.phase === 'attack') {
      this.level = glitch.attack > 0 ? Math.min(1, this.level + dt / glitch.attack) : 1;
      if (this.level >= 1) this.phase = 'top';
    } else if (this.phase === 'top') {
      if (!this.held) this.phase = 'release';
    } else {
      this.level = glitch.release > 0 ? Math.max(0, this.level - dt / glitch.release) : 0;
      if (this.level <= 0) this.phase = 'idle';
    }
    this.byFx = null;
    if (this.level > 0) {
      this.byFx = new Map();
      for (const j of glitch.jumps) {
        if (!this.byFx.has(j.fx)) this.byFx.set(j.fx, []);
        this.byFx.get(j.fx).push(j);
      }
    }
  }

  // After modulation has filled inst.values: move the chosen ones toward
  // where they land. A slider travels along its bar, as a hand would move
  // it; a menu or a switch simply is the other choice for the duration.
  apply(item, inst) {
    const list = this.byFx?.get(item.uid);
    if (!list) return;
    const v = inst.values;
    for (const j of list) {
      const spec = j.key === 'mix' ? MIX : inst.def.params[j.key];
      if (!spec) continue;
      if (spec.options || spec.type === 'bool') {
        v[j.key] = j.to;
        continue;
      }
      const from = paramUnit(spec, v[j.key]);
      const to = Math.min(1, Math.max(0, paramUnit(spec, j.to) + (this.offsets.get(`${j.fx}:${j.key}`) ?? 0)));
      v[j.key] = paramValue(spec, from + (to - from) * this.level);
    }
  }
}

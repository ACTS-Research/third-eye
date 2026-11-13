// The preset list as /control sees it: load, save, reorder, and keep the
// "current preset" index in the shared state pointing at the right one.
// The running order (steps that point at presets) is kept here too, with
// "which step it is at" looked after the same way.

import { ORDER_KEY, PRESETS_KEY, loadOrder, loadPresets, orderView, saveOrder, savePresets, snapshotPreset } from '../shared/presets.js';
import { sceneOf } from '../shared/state.js';

export function createPresetModel(ui) {
  const { store } = ui;
  let list = loadPresets();
  let steps = loadOrder(list);
  const listeners = new Set();
  const changed = () => {
    for (const fn of listeners) fn();
  };
  const commit = () => {
    savePresets(list);
    changed();
  };
  const setCurrent = (index) => store.dispatch({ op: 'presetIndex', index });
  // Saves the steps and moves "where the order is at" in one go.
  const commitSteps = (cue, off) => {
    saveOrder(steps);
    const now = store.state.order;
    if (cue !== undefined && (cue !== now.cue || off !== now.off)) store.merge('order', { cue, off });
    else changed();
  };

  // Another control window may have edited the list.
  window.addEventListener('storage', (e) => {
    if (e.key && e.key !== PRESETS_KEY && e.key !== ORDER_KEY) return;
    list = loadPresets();
    steps = loadOrder(list);
    changed();
  });
  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace' || op.op === 'presetIndex' || (op.op === 'merge' && op.key === 'order')) changed();
  });

  return {
    get list() {
      return list;
    },
    get current() {
      return store.state.presetIndex;
    },
    onChange(fn) {
      listeners.add(fn);
    },
    reload() {
      list = loadPresets();
      steps = loadOrder(list);
      changed();
    },
    // Saves the live scene as a new preset and makes it current.
    addFromLive(name, after = list.length - 1) {
      const preset = snapshotPreset(store, name ?? `Preset ${list.length + 1}`);
      list.splice(after + 1, 0, preset);
      savePresets(list);
      setCurrent(after + 1);
      return after + 1;
    },
    update(index, patch) {
      if (!list[index]) return;
      list[index] = { ...list[index], ...patch };
      commit();
    },
    saveLiveInto(index) {
      this.update(index, { scene: sceneOf(store.state) });
    },
    remove(index) {
      if (!list[index]) return;
      const { id } = list[index];
      list.splice(index, 1);
      savePresets(list);
      // Its steps go with it; the order stays on the step it was at.
      if (steps.some((s) => s.preset === id)) {
        const { cue, off } = store.state.order;
        const before = steps.slice(0, Math.max(0, cue)).filter((s) => s.preset === id).length;
        const gone = steps[cue]?.preset === id;
        steps = steps.filter((s) => s.preset !== id);
        saveOrder(steps);
        if (cue >= 0) store.merge('order', { cue: Math.min(cue - before, steps.length - 1), off: (off || gone) && steps.length > 0 });
      }
      const cur = store.state.presetIndex;
      setCurrent(cur === index ? -1 : cur > index ? cur - 1 : cur);
    },
    move(from, to) {
      if (from === to || !list[from]) return;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      savePresets(list);
      // The current preset keeps its identity, not its slot.
      const cur = store.state.presetIndex;
      let next = cur;
      if (cur === from) next = to;
      else if (from < cur && to >= cur) next = cur - 1;
      else if (from > cur && to <= cur) next = cur + 1;
      if (next !== cur) setCurrent(next);
      else changed();
    },
    append(presets) {
      list.push(...presets);
      commit();
    },

    // ----------------------------------------------------- running order ---
    get steps() {
      return steps;
    },
    // The steps with their presets, the live one and the one Next loads.
    get order() {
      return orderView(store.state, list);
    },
    addStep(presetIndex) {
      if (!list[presetIndex]) return;
      steps.push({ preset: list[presetIndex].id, note: '', fade: null });
      commitSteps();
    },
    updateStep(index, patch) {
      if (!steps[index]) return;
      steps[index] = { ...steps[index], ...patch };
      commitSteps();
    },
    removeStep(index) {
      if (!steps[index]) return;
      steps.splice(index, 1);
      const { cue, off } = store.state.order;
      // Removing the step that is live leaves the picture alone: the order
      // waits on the step that took its place.
      if (cue === index) commitSteps(Math.min(cue, steps.length - 1), steps.length > 0);
      else commitSteps(cue > index ? cue - 1 : cue, off);
    },
    moveStep(from, to) {
      if (from === to || !steps[from] || !steps[to]) return;
      const [item] = steps.splice(from, 1);
      steps.splice(to, 0, item);
      const { cue, off } = store.state.order;
      let next = cue;
      if (cue === from) next = to;
      else if (from < cue && to >= cue) next = cue - 1;
      else if (from > cue && to <= cue) next = cue + 1;
      commitSteps(next, off);
    },
    setSteps(next) {
      steps = next.filter((s) => list.some((p) => p.id === s.preset));
      commitSteps(-1, false);
    },
  };
}
